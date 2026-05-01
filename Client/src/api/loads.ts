import client from './client'
import type {
  DriverLoad,
  Load,
  LoadCreateData,
  LoadStatus,
  LoadUpdateData,
} from '../types/load'

// ListLoadsFilters mirrors the owner-tier query params on GET /loads.
// All optional. `from` / `to` are RFC3339 timestamps against created_at.
export interface ListLoadsFilters {
  status?: LoadStatus
  driver_id?: string
  from?: string
  to?: string
  page?: number
  page_size?: number
}

const buildQuery = (params: object): string => {
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== null && v !== '',
  )
  if (entries.length === 0) return ''
  const search = new URLSearchParams()
  for (const [k, v] of entries) {
    search.set(k, String(v))
  }
  return `?${search.toString()}`
}

export const getLoads = async (filters: ListLoadsFilters = {}): Promise<Load[]> => {
  const res = await client.get(`/api/v1/loads${buildQuery(filters)}`)
  return res.data ?? []
}

export const getLoad = async (id: string): Promise<Load> => {
  const res = await client.get(`/api/v1/loads/${id}`)
  return res.data
}

export const createLoad = async (data: LoadCreateData): Promise<Load> => {
  const res = await client.post('/api/v1/loads', data)
  return res.data
}

export const updateLoad = async (id: string, data: LoadUpdateData): Promise<void> => {
  await client.put(`/api/v1/loads/${id}`, data)
}

export const deleteLoad = async (id: string): Promise<void> => {
  await client.delete(`/api/v1/loads/${id}`)
}

// MyLoadsFilters covers the driver-tier `?date=&tz=` window. The browser-local
// timezone is supplied so the server can bucket the local day correctly even
// near midnight.
export interface MyLoadsFilters {
  date?: string
  tz?: string
}

export const getMyLoads = async (filters: MyLoadsFilters = {}): Promise<DriverLoad[]> => {
  const res = await client.get(`/api/v1/loads/mine${buildQuery(filters)}`)
  return res.data ?? []
}

export const getMyLoad = async (id: string): Promise<DriverLoad> => {
  const res = await client.get(`/api/v1/loads/mine/${id}`)
  return res.data
}

// transitionLoad is the only client path that moves a load forward through the
// state machine. Server enforces the legal transitions; a 409 here means a
// stale local view (the optimistic UI must refetch).
export const transitionLoad = async (
  id: string,
  status: 'in_progress' | 'complete',
): Promise<DriverLoad | Load> => {
  const res = await client.post(`/api/v1/loads/${id}/transition`, { status })
  return res.data
}
