import { useState, useEffect } from 'react'
import { getTrucks } from '../api/trucks'
import { getExpenses } from '../api/expenses'
import type { Truck } from '../types/truck'
import type { Expense } from '../types/expense'
import { AppShell } from '../components/AppShell'
import DashboardView from '../components/DashboardView'

// Authenticated fleet dashboard: loads the fleet's real data and renders it via
// DashboardView, the same presentational component the public /demo screen
// reuses with in-memory data.
export default function Dashboard() {
  const [trucks, setTrucks]     = useState<Truck[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')

  useEffect(() => {
    Promise.all([getTrucks(), getExpenses()])
      .then(([t, e]) => { setTrucks(t); setExpenses(e) })
      .catch((err: unknown) => {
        const status = (err as { response?: { status?: number } })?.response?.status
        if (status === 401) { setError('Session expired — please log in again.') }
        else setError('Failed to load data.')
      })
      .finally(() => setLoading(false))
  }, [])

  return (
    <AppShell>
      <DashboardView trucks={trucks} expenses={expenses} loading={loading} error={error} />
    </AppShell>
  )
}
