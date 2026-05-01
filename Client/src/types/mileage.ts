// MileageLog mirrors the server's projected mileage_logs document. The
// upsert key is (fleet_id, truck_id, date) — the same date can never have
// two logs for the same truck within a fleet.
export interface MileageLog {
  _id: string
  fleet_id: string
  truck_id: string
  driver_id: string
  date: string
  start_mileage?: number
  end_mileage?: number
  created_at: string
  updated_at: string
}

// MileageLogUpsertPayload is the request body for POST /api/v1/mileage-logs.
// At least one of start_mileage / end_mileage must be provided; when both
// are present the server enforces end >= start.
export interface MileageLogUpsertPayload {
  truck_id: string
  date: string
  start_mileage?: number
  end_mileage?: number
}
