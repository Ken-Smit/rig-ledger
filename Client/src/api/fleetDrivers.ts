import client from './client'
import type { FleetDriver } from '../types/load'

// getFleetDrivers populates the assign-driver dropdown on the Loads page.
// Owner-tier endpoint; the server filters on fleet_id from the JWT and
// role=driver, so the response only includes drivers in the caller's fleet.
export const getFleetDrivers = async (): Promise<FleetDriver[]> => {
  const res = await client.get('/api/v1/fleet/drivers')
  return res.data ?? []
}
