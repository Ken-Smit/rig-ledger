import client from './client'
import { buildQuery } from '../utils/query'
import type {
  DutyStatusLog,
  HosStatus,
  RecordDutyStatusData,
} from '../types/hos'

// ListHosLogsFilters mirrors the optional query params on GET /hos/logs.
// All optional. `from` / `to` are RFC3339 timestamps against changed_at.
export interface ListHosLogsFilters {
  from?: string
  to?: string
  page?: number
  page_size?: number
}

export const getHosStatus = async (): Promise<HosStatus> => {
  const res = await client.get('/api/v1/hos/status')
  return res.data
}

export const getHosLogs = async (
  filters: ListHosLogsFilters = {},
): Promise<DutyStatusLog[]> => {
  const res = await client.get(`/api/v1/hos/logs${buildQuery(filters)}`)
  return res.data ?? []
}

export const recordDutyStatus = async (
  data: RecordDutyStatusData,
): Promise<DutyStatusLog> => {
  const res = await client.post('/api/v1/hos/logs', data)
  return res.data
}
