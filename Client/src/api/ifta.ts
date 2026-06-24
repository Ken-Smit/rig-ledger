import client from './client'
import type { IftaMiles, IftaFuel, IftaMilesInput, IftaFuelInput, IftaReturn } from '../types/ifta'

const BASE = '/api/v1/ifta'

export const getIftaMiles = (year: number, quarter: number): Promise<IftaMiles[]> =>
  client.get<IftaMiles[]>(`${BASE}/miles`, { params: { year, quarter } }).then(r => r.data)

export const createIftaMiles = (data: IftaMilesInput): Promise<IftaMiles> =>
  client.post<IftaMiles>(`${BASE}/miles`, data).then(r => r.data)

export const deleteIftaMiles = (id: string): Promise<void> =>
  client.delete(`${BASE}/miles/${id}`).then(() => undefined)

export const getIftaFuel = (year: number, quarter: number): Promise<IftaFuel[]> =>
  client.get<IftaFuel[]>(`${BASE}/fuel`, { params: { year, quarter } }).then(r => r.data)

export const createIftaFuel = (data: IftaFuelInput): Promise<IftaFuel> =>
  client.post<IftaFuel>(`${BASE}/fuel`, data).then(r => r.data)

export const deleteIftaFuel = (id: string): Promise<void> =>
  client.delete(`${BASE}/fuel/${id}`).then(() => undefined)

export const getIftaReturn = (year: number, quarter: number): Promise<IftaReturn> =>
  client.get<IftaReturn>(`${BASE}/return`, { params: { year, quarter } }).then(r => r.data)
