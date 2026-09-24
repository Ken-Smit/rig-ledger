// Package services holds the pure business-logic layer. ComputeHOS lives here
// (not in a controller) because the FMCSA hours-of-service math is the most
// correctness-critical code in the app and must be unit-testable in isolation,
// with no database, no clock, and no Gin context.
package services

import (
	"sort"
	"time"

	"github.com/Ken-Smit/RigLedgerServer/models"
)

// FMCSA property-carrying CMV limits (49 CFR §395.3 / §395.5), 70-hour/8-day
// cycle. Named so the engine carries zero magic numbers.
//
//   - driveLimit:  max driving time after a qualifying reset.
//   - windowLimit: max elapsed on-duty window after a qualifying reset.
//   - breakAfter:  driving allowed before a 30-minute break is required.
//   - cycleLimit:  max on-duty time across the rolling cycle.
//   - resetOff:    consecutive off/sleeper that resets drive + window clocks.
//   - restart:     consecutive off/sleeper that restarts the cycle clock.
//   - breakLen:    qualifying break length (any non-driving status).
//   - cycleDays:   rolling cycle window length.
const (
	driveLimit  = 11 * time.Hour
	windowLimit = 14 * time.Hour
	breakAfter  = 8 * time.Hour
	cycleLimit  = 70 * time.Hour
	resetOff    = 10 * time.Hour
	restart     = 34 * time.Hour
	breakLen    = 30 * time.Minute
	cycleDays   = 8 * 24 * time.Hour
)

// FutureSkew is the tolerance for a ChangedAt that slightly leads `now` (clock
// drift between a driver's phone and the server). The controller rejects logs
// beyond this; the engine additionally clips any interval edge past `now`, so a
// stray future event can never inflate a clock.
const FutureSkew = 2 * time.Minute

// HOSDisclaimer is the mandatory legal notice. A manual web app is NOT a
// certified ELD under the FMCSA mandate (49 CFR §395.8); the value is fixed and
// surfaced on every status response so a driver is never misled into treating
// these clocks as mandate-compliant.
const HOSDisclaimer = "Not a certified ELD. For planning and personal records only — drivers under the ELD mandate must use a registered device."

// Violation messages — sentence case, plain English so a non-technical operator
// can act on them directly, per the "client-facing errors must be readable"
// guideline.
const (
	violDrive  = "11-hour driving limit reached — 10 consecutive hours off duty required."
	violWindow = "14-hour on-duty window elapsed."
	violBreak  = "30-minute break required before further driving."
	violCycle  = "70-hour/8-day cycle limit reached."
)

// Clocks are the four FMCSA limiters, in whole minutes remaining (clamped >= 0).
type Clocks struct {
	DriveRemainingMin  int `json:"drive_remaining_min"`
	WindowRemainingMin int `json:"window_remaining_min"`
	BreakRemainingMin  int `json:"break_remaining_min"`
	CycleRemainingMin  int `json:"cycle_remaining_min"`
}

// HOSStatus is the computed compliance snapshot returned to the client.
type HOSStatus struct {
	CurrentStatus models.DutyStatus `json:"current_status"`
	StatusSince   time.Time         `json:"status_since"`
	Clocks        Clocks            `json:"clocks"`
	CanDrive      bool              `json:"can_drive"`
	Violations    []string          `json:"violations"`
	Disclaimer    string            `json:"disclaimer"`
}

// interval is a [Start, End) span during which Status held.
type interval struct {
	Start  time.Time
	End    time.Time
	Status models.DutyStatus
}

// ComputeHOS reconstructs duty intervals from a driver's logs and computes the
// four FMCSA clocks, can-drive flag, and any violations as of `now`.
//
// Pure: it never reads the clock (now is injected) nor touches the database, so
// it is fully table-testable. Events may arrive in any order; they are sorted
// ascending and any portion lying after `now` is clipped so a future-dated log
// cannot inflate a clock.
//
// SIMPLIFICATIONS (see ponytail TODOs below): 70/8 cycle only, no split-sleeper
// berth pairing, no 16-hour short-haul exception, no adverse-driving extension,
// no personal-conveyance / yard-move sub-statuses.
func ComputeHOS(events []models.DutyStatusLog, now time.Time) HOSStatus {
	status := HOSStatus{
		Violations: []string{},
		Disclaimer: HOSDisclaimer,
	}

	// Sort a copy ascending so we never mutate the caller's slice.
	sorted := make([]models.DutyStatusLog, len(events))
	copy(sorted, events)
	sort.SliceStable(sorted, func(i, j int) bool {
		return sorted[i].ChangedAt.Before(sorted[j].ChangedAt)
	})

	// Drop events that begin after `now` outright — they describe the future and
	// have no bearing on elapsed compliance.
	trimmed := sorted[:0]
	for _, e := range sorted {
		if e.ChangedAt.After(now) {
			continue
		}
		trimmed = append(trimmed, e)
	}
	sorted = trimmed

	if len(sorted) == 0 {
		// No events: full clocks, can drive, empty status. A brand-new driver with
		// no history is treated as fully rested rather than blocked.
		status.Clocks = Clocks{
			DriveRemainingMin:  minutes(driveLimit),
			WindowRemainingMin: minutes(windowLimit),
			BreakRemainingMin:  minutes(breakAfter),
			CycleRemainingMin:  minutes(cycleLimit),
		}
		status.CanDrive = true
		return status
	}

	// Build intervals: interval i = [event[i].ChangedAt, event[i+1].ChangedAt or now).
	// The final interval is still ongoing, so its End is `now`.
	intervals := make([]interval, 0, len(sorted))
	for i := range sorted {
		start := sorted[i].ChangedAt
		end := now
		if i+1 < len(sorted) {
			end = sorted[i+1].ChangedAt
		}
		if end.After(now) {
			end = now // clip any overlap past now
		}
		if !end.After(start) {
			continue // zero / negative width after clipping
		}
		intervals = append(intervals, interval{Start: start, End: end, Status: sorted[i].Status})
	}

	earliest := sorted[0].ChangedAt

	// driveReset: end of the most recent merged off/sleeper run >= 10h. If none,
	// the earliest event (no qualifying rest yet → measure from the start).
	driveReset := earliest
	if end, ok := lastMergedRunEnd(intervals, offSleeper, resetOff); ok {
		driveReset = end
	}

	drivingSinceReset := sumStatusAfter(intervals, driving, driveReset)
	driveRemaining := driveLimit - drivingSinceReset
	windowRemaining := windowLimit - now.Sub(driveReset)

	// breakReset: end of the most recent merged NON-driving run >= 30m.
	breakReset := earliest
	if end, ok := lastMergedRunEnd(intervals, nonDriving, breakLen); ok {
		breakReset = end
	}
	drivingSinceBreak := sumStatusAfter(intervals, driving, breakReset)
	breakRemaining := breakAfter - drivingSinceBreak

	// cycleStart: later of (now - 8 days) and the end of the most recent 34h+
	// off/sleeper restart. A 34h restart wipes the cycle clean.
	cycleStart := now.Add(-cycleDays)
	if end, ok := lastMergedRunEnd(intervals, offSleeper, restart); ok && end.After(cycleStart) {
		cycleStart = end
	}
	onDutySinceCycle := sumStatusAfter(intervals, driving, cycleStart) +
		sumStatusAfter(intervals, onDuty, cycleStart)
	cycleRemaining := cycleLimit - onDutySinceCycle

	status.Clocks = Clocks{
		DriveRemainingMin:  minutes(driveRemaining),
		WindowRemainingMin: minutes(windowRemaining),
		BreakRemainingMin:  minutes(breakRemaining),
		CycleRemainingMin:  minutes(cycleRemaining),
	}

	// Current status = the last (most recent) event.
	last := sorted[len(sorted)-1]
	status.CurrentStatus = last.Status
	status.StatusSince = last.ChangedAt

	// Violations: one clear sentence per exhausted clock.
	if status.Clocks.DriveRemainingMin == 0 {
		status.Violations = append(status.Violations, violDrive)
	}
	if status.Clocks.WindowRemainingMin == 0 {
		status.Violations = append(status.Violations, violWindow)
	}
	if status.Clocks.BreakRemainingMin == 0 {
		status.Violations = append(status.Violations, violBreak)
	}
	if status.Clocks.CycleRemainingMin == 0 {
		status.Violations = append(status.Violations, violCycle)
	}

	// can_drive: every clock must have time left. Current status need not be
	// driving — a rested driver currently off-duty can still legally start.
	status.CanDrive = status.Clocks.DriveRemainingMin > 0 &&
		status.Clocks.WindowRemainingMin > 0 &&
		status.Clocks.BreakRemainingMin > 0 &&
		status.Clocks.CycleRemainingMin > 0

	return status
}

// statusSet is a predicate over a duty status. Using a func instead of a slice
// keeps the merged-run helpers allocation-free in the hot path.
type statusSet func(models.DutyStatus) bool

func offSleeper(s models.DutyStatus) bool {
	return s == models.DutyOff || s == models.DutySleeper
}

// nonDriving is any qualifying-break status: off, sleeper, OR on-duty. Per
// §395.3(a)(3)(ii) the 30-minute break may be satisfied by any non-driving time.
func nonDriving(s models.DutyStatus) bool {
	return s != models.DutyDriving
}

func driving(s models.DutyStatus) bool { return s == models.DutyDriving }
func onDuty(s models.DutyStatus) bool  { return s == models.DutyOnDuty }

// lastMergedRunEnd finds the most recent run of adjacent intervals whose status
// satisfies `in`, with a combined span >= minDur, and returns that run's END
// time. Adjacent here means consecutive in the time-ordered interval slice —
// a gap of a different status breaks the run. Reports ok=false if no qualifying
// run exists.
//
// "Most recent" wins: we scan all runs and keep the latest-ending one that
// clears minDur. A run still ongoing at `now` ends at `now` because that is the
// End of its final interval.
func lastMergedRunEnd(intervals []interval, in statusSet, minDur time.Duration) (time.Time, bool) {
	var (
		bestEnd time.Time
		found   bool
		i       int
	)
	for i < len(intervals) {
		if !in(intervals[i].Status) {
			i++
			continue
		}
		// Merge the maximal adjacent run [runStart, runEnd).
		runStart := intervals[i].Start
		runEnd := intervals[i].End
		j := i + 1
		for j < len(intervals) && in(intervals[j].Status) {
			runEnd = intervals[j].End
			j++
		}
		if runEnd.Sub(runStart) >= minDur {
			// Later run replaces an earlier one (scan is left-to-right, so this is
			// always >= bestEnd, but compare defensively).
			if !found || runEnd.After(bestEnd) {
				bestEnd = runEnd
				found = true
			}
		}
		i = j
	}
	return bestEnd, found
}

// sumStatusAfter sums the duration of every interval matching `in`, counting
// only the portion of each interval at or after `cutoff`.
func sumStatusAfter(intervals []interval, in statusSet, cutoff time.Time) time.Duration {
	var total time.Duration
	for _, iv := range intervals {
		if !in(iv.Status) {
			continue
		}
		start := iv.Start
		if start.Before(cutoff) {
			start = cutoff
		}
		if iv.End.After(start) {
			total += iv.End.Sub(start)
		}
	}
	return total
}

// minutes converts a duration to whole minutes, clamped at zero so a blown
// clock reports 0 (never negative). Rounding down is intentional — we never
// report more headroom than the driver actually has.
func minutes(d time.Duration) int {
	if d <= 0 {
		return 0
	}
	return int(d / time.Minute)
}

// ponytail: deliberate FMCSA omissions for the v1 manual planner. Tracked here
// so they surface in /ponytail-debt and are not mistaken for bugs:
//   - no split-sleeper-berth pairing (7/3 or 8/2 berth splits)
//   - no 16-hour short-haul exception (§395.1(o))
//   - no adverse-driving-conditions 2-hour extension (§395.1(b))
//   - 70-hour/8-day cycle only — no 60-hour/7-day toggle
//   - no personal-conveyance or yard-move sub-statuses
