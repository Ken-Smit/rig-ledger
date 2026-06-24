import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getTrucks } from '../api/trucks'
import { getExpenses, createExpense, deleteExpense } from '../api/expenses'
import type { Truck } from '../types/truck'
import type { Expense, ExpenseFormData } from '../types/expense'
import { AppShell } from '../components/AppShell'
import ExpensesView from '../components/ExpensesView'

// Authenticated Profit & Loss screen: loads the fleet's real data and persists
// every change through the API. All presentation lives in ExpensesView, which
// the public /demo screen reuses with in-memory data.
export default function Expenses() {
  const navigate = useNavigate()
  const [trucks, setTrucks]     = useState<Truck[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')

  useEffect(() => {
    Promise.all([getTrucks(), getExpenses()])
      .then(([t, e]) => { setTrucks(t); setExpenses(e) })
      .catch((err: unknown) => {
        const status = (err as { response?: { status?: number } })?.response?.status
        if (status === 401) { navigate('/login') }
        else setError('Failed to load data')
      })
      .finally(() => setLoading(false))
  }, [navigate])

  const handleAdd = async (data: ExpenseFormData) => {
    const exp = await createExpense(data)
    setExpenses(prev => [exp, ...prev])
  }

  const handleDelete = async (id: string) => {
    await deleteExpense(id)
    setExpenses(prev => prev.filter(e => e._id !== id))
  }

  return (
    <AppShell>
      <ExpensesView
        trucks={trucks}
        expenses={expenses}
        loading={loading}
        error={error}
        onAdd={handleAdd}
        onDelete={handleDelete}
      />
    </AppShell>
  )
}
