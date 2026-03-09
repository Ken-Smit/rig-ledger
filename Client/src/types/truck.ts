export interface TirePosition {
  position: string
  tread_depth: number
  brand?: string
  model?: string
}

export interface Truck {
  _id: string
  user_id: string
  year: number
  make: string
  model: string
  vin?: string
  unit_number?: string
  annual_inspection_date?: string
  brake_inspection_date?: string
  last_oil_change_mileage?: number
  last_oil_change_date?: string
  oil_change_interval?: number
  coolant_flush_date?: string
  transmission_service_date?: string
  tire_size?: string
  number_of_tires?: number
  tire_brand?: string
  tire_model?: string
  last_tire_rotation_date?: string
  tire_positions?: TirePosition[]
}

export type TruckFormData = Omit<Truck, '_id' | 'user_id'>
