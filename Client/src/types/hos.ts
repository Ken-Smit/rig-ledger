// DutyStatus mirrors the Go DutyStatus* constants. Closed set; anything else
// is a malformed server response and must be treated as unknown.
export type DutyStatus = 'off' | 'sleeper' | 'driving' | 'onduty'

// String constants are exported so call sites read as `status === DUTY_DRIVING`
// rather than sprinkling raw string literals across the codebase. The compiler
// still narrows because the constants are typed by inference.
export const DUTY_OFF: DutyStatus = 'off'
export const DUTY_SLEEPER: DutyStatus = 'sleeper'
export const DUTY_DRIVING: DutyStatus = 'driving'
export const DUTY_ONDUTY: DutyStatus = 'onduty'

// Ordered list for rendering the four quick-switch buttons, left to right.
export const DUTY_STATUSES: DutyStatus[] = [
  DUTY_OFF,
  DUTY_SLEEPER,
  DUTY_DRIVING,
  DUTY_ONDUTY,
]

// Human labels for each duty status. FMCSA-standard wording so drivers
// recognize it from their paper logs / certified ELDs.
export const DUTY_STATUS_LABEL: Record<DutyStatus, string> = {
  off: 'Off Duty',
  sleeper: 'Sleeper Berth',
  driving: 'Driving',
  onduty: 'On Duty',
}

// DutyStatusLog mirrors models.DutyStatusLog JSON tags. Optional ownership
// fields (fleet_id/driver_id/truck_id) are server-populated and may be omitted
// from a projected response.
export interface DutyStatusLog {
  _id: string
  fleet_id?: string
  driver_id?: string
  truck_id?: string
  status: DutyStatus
  changed_at: string
  location?: string
  note?: string
  created_at?: string
}

// HosClocks holds the four FMCSA compliance countdowns, each in whole minutes
// remaining. Server computes these; the UI only formats and colors them.
export interface HosClocks {
  drive_remaining_min: number
  window_remaining_min: number
  break_remaining_min: number
  cycle_remaining_min: number
}

// HosStatus is the GET /hos/status payload: the driver's current duty state
// plus the computed clocks, drive eligibility, any violations, and the legal
// disclaimer string the server requires us to surface.
export interface HosStatus {
  current_status: DutyStatus | ''
  status_since: string
  clocks: HosClocks
  can_drive: boolean
  violations: string[]
  disclaimer: string
}

// RecordDutyStatusData is what the UI POSTs to /hos/logs. Kept narrow so
// adding a field requires a deliberate type-level change at the call site.
export interface RecordDutyStatusData {
  status: DutyStatus
  truck_id?: string
  location?: string
  note?: string
}

// formatMinutes renders a non-negative minute count as "Hh Mm" (e.g. 665 →
// "11h 5m"). Negative or non-finite inputs clamp to "0h 0m" so a malformed
// server clock can never render "NaNh" to a driver checking compliance.
export function formatMinutes(min: number): string {
  if (!Number.isFinite(min) || min <= 0) return '0h 0m'
  const total = Math.floor(min)
  const h = Math.floor(total / 60)
  const m = total % 60
  return `${h}h ${m}m`
}
