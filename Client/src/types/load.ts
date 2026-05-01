// LoadStatus mirrors the Go LoadStatus* constants. Closed set; anything else
// is a malformed server response.
export type LoadStatus = 'pending' | 'in_progress' | 'complete'

export const LOAD_STATUS_PENDING: LoadStatus = 'pending'
export const LOAD_STATUS_IN_PROGRESS: LoadStatus = 'in_progress'
export const LOAD_STATUS_COMPLETE: LoadStatus = 'complete'

export type StopKind = 'pickup' | 'dropoff'

export const STOP_KIND_PICKUP: StopKind = 'pickup'
export const STOP_KIND_DROPOFF: StopKind = 'dropoff'

// Stop mirrors models.Stop. scheduled_at is an ISO-8601 UTC string on the wire;
// the UI converts to a local datetime-local input as needed.
export interface Stop {
  kind: StopKind
  sequence: number
  address: string
  city?: string
  state?: string
  zip?: string
  contact_name?: string
  contact_phone?: string
  scheduled_at: string
  notes?: string
}

// Load is the owner-facing shape (mirrors models.Load JSON tags). DriverLoad
// strips rate_cents and created_by — driver-tier handlers return that shape.
export interface Load {
  _id: string
  fleet_id: string
  driver_id: string
  truck_id?: string
  created_by: string
  reference_number?: string
  stops: Stop[]
  scheduled_pickup_at: string
  status: LoadStatus
  started_at?: string
  completed_at?: string
  rate_cents?: number
  distance_miles?: number
  notes?: string
  created_at: string
  updated_at: string
}

export interface DriverLoad {
  _id: string
  fleet_id: string
  driver_id: string
  truck_id?: string
  reference_number?: string
  stops: Stop[]
  scheduled_pickup_at: string
  status: LoadStatus
  started_at?: string
  completed_at?: string
  distance_miles?: number
  notes?: string
  created_at: string
  updated_at: string
}

// LoadCreateData is what the owner UI POSTs to /loads. Keeps the shape narrow
// so adding fields requires a deliberate type-level change at the call site.
export interface LoadCreateData {
  driver_id: string
  truck_id?: string
  reference_number?: string
  stops: Stop[]
  rate_cents?: number
  distance_miles?: number
  notes?: string
}

// LoadUpdateData is the partial-update DTO. Every field optional so the caller
// only sends what changed; the server's pointer-typed DTO honors that.
export interface LoadUpdateData {
  driver_id?: string
  truck_id?: string
  reference_number?: string
  stops?: Stop[]
  rate_cents?: number
  distance_miles?: number
  notes?: string
}

// FleetDriver populates the assign-driver dropdown.
export interface FleetDriver {
  user_id: string
  first_name: string
  last_name: string
}
