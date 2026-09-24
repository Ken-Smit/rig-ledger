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
  // Plain-English reason a line is unpriced or incomplete. Present for Oregon
  // (no IFTA fuel tax), for an unpublished quarter, and for the KY/VA surcharge
  // Rig Ledger does not calculate.
  rate_note?: string
  // True when this row is a jurisdiction's separate surcharge line. Surcharge
  // is charged on taxable gallons with no credit for fuel bought there.
  surcharge?: boolean
}

export interface IftaReturn {
  year: number
  quarter: number
  total_miles: number
  total_gallons: number
  fleet_mpg: number
  net_tax: number
  lines: IftaReturnLine[]
  // False when no rate table is loaded for the requested quarter — the return
  // is unpriced and must not be filed.
  rates_published: boolean
  rates_source?: string
}

// US IFTA member jurisdictions supported by the backend rate table.
export const IFTA_JURISDICTIONS = [
  'AL', 'AR', 'AZ', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'IA',
  'ID', 'IL', 'IN', 'KS', 'KY', 'LA', 'MA', 'MD', 'ME', 'MI',
  'MN', 'MO', 'MS', 'MT', 'NC', 'ND', 'NE', 'NH', 'NJ', 'NM',
  'NV', 'NY', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN',
  'TX', 'UT', 'VA', 'VT', 'WA', 'WI', 'WV', 'WY',
] as const
