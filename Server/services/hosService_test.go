package services

import (
	"testing"
	"time"

	"github.com/Ken-Smit/RigLedgerServer/models"
)

// fixed reference instant — the service never calls time.Now, so every case
// pins `now` here for determinism.
var now = time.Date(2026, 6, 24, 12, 0, 0, 0, time.UTC)

// log is a terse constructor for a duty-status change at an offset before `now`.
func logAt(status models.DutyStatus, ago time.Duration) models.DutyStatusLog {
	return models.DutyStatusLog{Status: status, ChangedAt: now.Add(-ago)}
}

func TestComputeHOS(t *testing.T) {
	tests := []struct {
		name       string
		events     []models.DutyStatusLog
		wantDrive  int
		wantWindow int
		wantBreak  int
		wantCycle  int
		wantCan    bool
		wantViols  []string
	}{
		{
			// No events at all: full clocks, ready to drive.
			name:       "no events full clocks",
			events:     nil,
			wantDrive:  11 * 60,
			wantWindow: 14 * 60,
			wantBreak:  8 * 60,
			wantCycle:  70 * 60,
			wantCan:    true,
		},
		{
			// 10h off ending now -> reset, then status just flipped to driving.
			// driveReset = now (end of the 10h off run). Nothing driven yet.
			name: "fresh driver after 10h off",
			events: []models.DutyStatusLog{
				logAt(models.DutyOff, 10*time.Hour),
				logAt(models.DutyDriving, 0),
			},
			wantDrive:  11 * 60,
			wantWindow: 14 * 60,
			wantBreak:  8 * 60,
			wantCycle:  70 * 60,
			wantCan:    true,
		},
		{
			// 10h off, then drove 4h. driveReset is the end of the off run (4h ago).
			// drive used 4h -> 7h left. window elapsed 4h -> 10h left. break: 4h
			// driving since the off run -> 4h left.
			name: "mid-shift driving reduces clocks",
			events: []models.DutyStatusLog{
				logAt(models.DutyOff, 14*time.Hour),
				logAt(models.DutyDriving, 4*time.Hour),
			},
			wantDrive:  7 * 60,
			wantWindow: 10 * 60,
			wantBreak:  4 * 60,
			wantCycle:  70*60 - 4*60,
			wantCan:    true,
		},
		{
			// Drove 8h straight after a 10h reset with no 30-min break.
			// break clock exhausted (8h - 8h = 0) -> violation + cannot drive.
			// drive: 11-8=3h left, window: 14-8=6h left.
			name: "30-min break required after 8h driving",
			events: []models.DutyStatusLog{
				logAt(models.DutyOff, 18*time.Hour),
				logAt(models.DutyDriving, 8*time.Hour),
			},
			wantDrive:  3 * 60,
			wantWindow: 6 * 60,
			wantBreak:  0,
			wantCycle:  70*60 - 8*60,
			wantCan:    false,
			wantViols:  []string{violBreak},
		},
		{
			// Drove the full 11h after a reset -> driving limit hit. Also blows the
			// break clock (8h+ driving with no break). window: 14-11=3h left.
			name: "11h driving limit violation",
			events: []models.DutyStatusLog{
				logAt(models.DutyOff, 21*time.Hour),
				logAt(models.DutyDriving, 11*time.Hour),
			},
			wantDrive:  0,
			wantWindow: 3 * 60,
			wantBreak:  0,
			wantCycle:  70*60 - 11*60,
			wantCan:    false,
			wantViols:  []string{violDrive, violBreak},
		},
		{
			// A 34h restart wipes the cycle. Before it the driver had logged 40h of
			// driving (would otherwise eat the cycle), then took 34h off, then is
			// freshly driving. Cycle should be full (70h) again; drive/window/break
			// measured from the 34h reset's end.
			name: "34h restart resets cycle",
			events: []models.DutyStatusLog{
				// long driving stretch well before the restart
				logAt(models.DutyDriving, 80*time.Hour),
				logAt(models.DutyOff, 40*time.Hour), // 34h+ off: 40h ago -> 6h ago = 34h
				logAt(models.DutyDriving, 6*time.Hour),
			},
			// After the restart end (6h ago) the driver drove 6h. The cycle is
			// reset to the restart point, so only that post-restart 6h of driving
			// counts: 70h - 6h = 64h left. The 40h of pre-restart driving is wiped.
			wantDrive:  5 * 60,
			wantWindow: 8 * 60,
			wantBreak:  2 * 60,
			wantCycle:  64 * 60,
			wantCan:    true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := ComputeHOS(tt.events, now)

			if got.Clocks.DriveRemainingMin != tt.wantDrive {
				t.Errorf("drive_remaining_min = %d, want %d", got.Clocks.DriveRemainingMin, tt.wantDrive)
			}
			if got.Clocks.WindowRemainingMin != tt.wantWindow {
				t.Errorf("window_remaining_min = %d, want %d", got.Clocks.WindowRemainingMin, tt.wantWindow)
			}
			if got.Clocks.BreakRemainingMin != tt.wantBreak {
				t.Errorf("break_remaining_min = %d, want %d", got.Clocks.BreakRemainingMin, tt.wantBreak)
			}
			if got.Clocks.CycleRemainingMin != tt.wantCycle {
				t.Errorf("cycle_remaining_min = %d, want %d", got.Clocks.CycleRemainingMin, tt.wantCycle)
			}
			if got.CanDrive != tt.wantCan {
				t.Errorf("can_drive = %v, want %v", got.CanDrive, tt.wantCan)
			}
			if !sameViolations(got.Violations, tt.wantViols) {
				t.Errorf("violations = %v, want %v", got.Violations, tt.wantViols)
			}
			if got.Disclaimer != HOSDisclaimer {
				t.Errorf("disclaimer not set")
			}
		})
	}
}

// sameViolations compares two violation slices as sets (order-independent),
// treating nil and empty as equal.
func sameViolations(got, want []string) bool {
	if len(got) != len(want) {
		return false
	}
	seen := map[string]int{}
	for _, v := range got {
		seen[v]++
	}
	for _, v := range want {
		if seen[v] == 0 {
			return false
		}
		seen[v]--
	}
	return true
}
