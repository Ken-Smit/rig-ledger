import client from './client'
import type { Truck, TruckFormData } from '../types/truck'

export const getTrucks = async (): Promise<Truck[]> => {
  const res = await client.get('/api/v1/trucks')
  return res.data ?? []
}

export const createTruck = async (truck: TruckFormData): Promise<Truck> => {
  const res = await client.post('/api/v1/trucks', truck)
  return res.data
}

export const updateTruck = async (id: string, truck: Partial<TruckFormData>): Promise<void> => {
  await client.put(`/api/v1/trucks/${id}`, truck)
}

export const deleteTruck = async (id: string): Promise<void> => {
  await client.delete(`/api/v1/trucks/${id}`)
}
