export interface IftaMiles {
  _id: string
  truck_id: string
  date: string
  jurisdiction: string
  miles: number
}

export interface IftaFuel {
  _id: string
  truck_id: string
  date: string
  jurisdiction: string
  gallons: number
  amount?: number
}

export interface IftaMilesInput {
  truck_id: string
  date: string
  jurisdiction: string
  miles: number
}

export interface IftaFuelInput {
  truck_id: string
  date: string
  jurisdiction: string
  gallons: number
  amount: number
}

export interface IftaReturnLine {
  jurisdiction: string
  miles: number
  purchased_gallons: number
  taxable_gallons: number
  tax_rate: number
  tax_owed: number
  tax_paid: number
  net: number
  rated: boolean
}

export interface IftaReturn {
  year: number
  quarter: number
  total_miles: number
  total_gallons: number
  fleet_mpg: number
  net_tax: number
  lines: IftaReturnLine[]
}

// US IFTA member jurisdictions supported by the backend rate table.
export const IFTA_JURISDICTIONS = [
  'AL', 'AR', 'AZ', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'IA',
  'ID', 'IL', 'IN', 'KS', 'KY', 'LA', 'MA', 'MD', 'ME', 'MI',
  'MN', 'MO', 'MS', 'MT', 'NC', 'ND', 'NE', 'NH', 'NJ', 'NM',
  'NV', 'NY', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN',
  'TX', 'UT', 'VA', 'VT', 'WA', 'WI', 'WV', 'WY',
] as const
