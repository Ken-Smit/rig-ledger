// An expense entry's `type` is a free-form category slug. The single value
// 'income' marks money coming in; every other slug is treated as a cost. This
// lets owner-operators log any category they like (fuel, tolls, insurance,
// a one-off repair…) while the P&L math only needs to know income vs cost.
export type ExpenseType = string

export const INCOME_TYPE = 'income'

// Common presets surfaced in the Add Entry datalist. Not an allowlist — users
// may type any category; these are just quick picks.
export const EXPENSE_PRESETS = [
  'Fuel', 'Maintenance', 'Repairs', 'Tires', 'Insurance', 'Truck payment',
  'Tolls', 'Permits', 'Parking', 'Meals', 'Lodging', 'Other',
] as const

export const INCOME_PRESETS = [
  'Load income', 'Detention', 'Fuel surcharge', 'Lumper reimbursement', 'Other',
] as const

export interface Expense {
  _id: string
  user_id?: string
  truck_id: string
  type: ExpenseType
  amount: number
  date: string
  description?: string
}

export type ExpenseFormData = Omit<Expense, '_id' | 'user_id'>

export function isIncome(type: string): boolean {
  return type === INCOME_TYPE
}

// Normalize a free-text category into a stable storage slug. Mirrors the
// server-side normalization (lowercase, underscores, bounded length).
export function slugifyCategory(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').slice(0, 40)
}

// Human label for any stored slug — 'truck_payment' → 'Truck Payment'.
export function labelForType(type: string): string {
  if (!type) return 'Other'
  if (type === INCOME_TYPE) return 'Income'
  return type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

// Chip status class (defined in index.css): income reads positive, costs warn.
export function chipForType(type: string): string {
  return type === INCOME_TYPE ? 'ok' : 'warn'
}
