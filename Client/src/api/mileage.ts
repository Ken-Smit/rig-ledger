import client from './client'
import type { MileageLog, MileageLogUpsertPayload } from '../types/mileage'

// getMileageLogs fetches the first page of mileage logs for a single truck.
// Recent-activity views are short by definition, so this lean wrapper is
// the right tool. A separate paginated wrapper can be added if a future
// screen needs deep history.
export const getMileageLogs = async (truckId: string): Promise<MileageLog[]> => {
  const res = await client.get<MileageLog[] | null>('/api/v1/mileage-logs', {
    params: { truck_id: truckId },
  })
  return res.data ?? []
}

// upsertMileageLog inserts or updates a (fleet_id, truck_id, date) row.
// The returned document is the canonical post-write state and should be
// merged into any local list.
export const upsertMileageLog = async (
  payload: MileageLogUpsertPayload,
): Promise<MileageLog> => {
  const res = await client.post<MileageLog>('/api/v1/mileage-logs', payload)
  return res.data
}
