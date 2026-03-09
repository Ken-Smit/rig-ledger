export type ExpenseType = 'fuel' | 'maintenance' | 'income'

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
