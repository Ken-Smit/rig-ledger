import client from './client'
import type { Expense, ExpenseFormData } from '../types/expense'

export const getExpenses = async (): Promise<Expense[]> => {
  const res = await client.get('/api/v1/expenses')
  return res.data ?? []
}

export const createExpense = async (data: ExpenseFormData): Promise<Expense> => {
  const res = await client.post('/api/v1/expenses', data)
  return res.data
}

export const deleteExpense = async (id: string): Promise<void> => {
  await client.delete(`/api/v1/expenses/${id}`)
}
