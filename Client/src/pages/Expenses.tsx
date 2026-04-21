import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { getTrucks } from '../api/trucks'
import { getExpenses, createExpense, deleteExpense } from '../api/expenses'
import { logout } from '../api/auth'
import type { Truck } from '../types/truck'
import type { Expense, ExpenseFormData } from '../types/expense'
import Navbar from '../components/Navbar'
import AddExpenseModal from '../components/AddExpenseModal'
import ExpenseChart from '../components/ExpenseChart'

type Period = 'day' | 'week' | 'month' | 'all'

const TYPE_LABEL: Record<string, string> = {
  fuel:        'FUEL',
  maintenance: 'MAINTENANCE',
  income:      'INCOME',
}

const TYPE_CLASS: Record<string, string> = {
  fuel:        'exp-type-fuel',
  maintenance: 'exp-type-maintenance',
  income:      'exp-type-income',
}

// Parse YYYY-MM-DD as local date to avoid UTC offset issues
function parseLocal(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function isInPeriod(dateStr: string, period: Period): boolean {
  if (period === 'all') return true
  const date = parseLocal(dateStr)
  const now = new Date()
  if (period === 'day') {
    // Rolling last 7 days, inclusive of today
    const start = new Date(now); start.setDate(now.getDate() - 6); start.setHours(0, 0, 0, 0)
    const end   = new Date(now); end.setHours(23, 59, 59, 999)
    return date >= start && date <= end
  }
  if (period === 'week') {
    const dow = now.getDay() === 0 ? 6 : now.getDay() - 1 // Mon = 0
    const mon = new Date(now); mon.setDate(now.getDate() - dow); mon.setHours(0, 0, 0, 0)
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6); sun.setHours(23, 59, 59, 999)
    return date >= mon && date <= sun
  }
  if (period === 'month') {
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()
  }
  return true
}

function periodLabel(period: Period): string {
  const now = new Date()
  if (period === 'day') {
    const start = new Date(now); start.setDate(now.getDate() - 6)
    const fmtShort = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    return `${fmtShort(start)} – ${fmtShort(now)}, ${now.getFullYear()}`
  }
  if (period === 'week') {
    const dow = now.getDay() === 0 ? 6 : now.getDay() - 1
    const mon = new Date(now); mon.setDate(now.getDate() - dow)
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
    const fmtShort = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    return `${fmtShort(mon)} – ${fmtShort(sun)}, ${now.getFullYear()}`
  }
  if (period === 'month') {
    return now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  }
  return 'ALL TIME'
}

function fmt(d: string) {
  return parseLocal(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function money(n: number) {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function Expenses() {
  const navigate = useNavigate()
  const [trucks, setTrucks]           = useState<Truck[]>([])
  const [expenses, setExpenses]       = useState<Expense[]>([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState('')
  const [showAdd, setShowAdd]         = useState(false)
  const [filterTruck, setFilterTruck] = useState('all')
  const [period, setPeriod]           = useState<Period>('month')

  const handleLogout = async () => { await logout(); localStorage.removeItem('logged_in'); navigate('/login') }

  useEffect(() => {
    if (!localStorage.getItem('logged_in')) { navigate('/login'); return }
    Promise.all([getTrucks(), getExpenses()])
      .then(([t, e]) => { setTrucks(t); setExpenses(e) })
      .catch((err: unknown) => {
        const status = (err as { response?: { status?: number } })?.response?.status
        if (status === 401) { localStorage.removeItem('logged_in'); navigate('/login') }
        else setError('FAILED TO LOAD DATA')
      })
      .finally(() => setLoading(false))
  }, [navigate])

  const handleAdd = async (data: ExpenseFormData) => {
    const exp = await createExpense(data)
    setExpenses(prev => [exp, ...prev])
  }

  const handleDelete = async (id: string) => {
    if (!confirm('REMOVE THIS ENTRY?')) return
    try {
      await deleteExpense(id)
      setExpenses(prev => prev.filter(e => e._id !== id))
    } catch {
      setError('FAILED TO REMOVE ENTRY')
    }
  }

  const truckLabel = (id: string) => {
    const t = trucks.find(t => t._id === id)
    if (!t) return id
    return t.unit_number ?? `UNIT-${t._id.slice(-4).toUpperCase()}`
  }

  // Apply both truck filter and period filter
  const filtered = useMemo(() =>
    expenses.filter(e =>
      (filterTruck === 'all' || e.truck_id === filterTruck) &&
      isInPeriod(e.date, period)
    ),
    [expenses, filterTruck, period]
  )

  const totals = useMemo(() => ({
    fuel:        filtered.filter(e => e.type === 'fuel').reduce((s, e) => s + e.amount, 0),
    maintenance: filtered.filter(e => e.type === 'maintenance').reduce((s, e) => s + e.amount, 0),
    income:      filtered.filter(e => e.type === 'income').reduce((s, e) => s + e.amount, 0),
  }), [filtered])

  const net = totals.income - totals.fuel - totals.maintenance

  return (
    <>
      <div className="dashboard-page">
        <Navbar onLogout={handleLogout} />

        <main className="dashboard-main">
          {/* Header */}
          <div className="fleet-header">
            <div>
              <h2 className="section-title">P&amp;L</h2>
              <p className="section-sub">{periodLabel(period)}</p>
            </div>
            <button className="btn-primary" onClick={() => setShowAdd(true)} disabled={trucks.length === 0}>
              + ADD ENTRY
            </button>
          </div>

          {error && <div className="alert-error">{error}</div>}

          {/* Chart with period tabs */}
          <ExpenseChart expenses={filtered} period={period} onPeriodChange={setPeriod} />

          {/* Consolidated P&L card */}
          <div className="exp-summary">
            <div className="pl-card">
              <div className="pl-net-label">NET</div>
              <div className={`pl-net-value ${net >= 0 ? 'text-cyan' : 'text-red'}`}>
                {money(net)}
              </div>

              <div className="pl-divider" />

              <div className="pl-breakdown">
                <div className="pl-row">
                  <span className="pl-row-label text-cyan">
                    <span className="pl-row-icon">▲</span>
                    LOAD INCOME
                  </span>
                  <span className="pl-row-value text-cyan">{money(totals.income)}</span>
                </div>
                <div className="pl-row">
                  <span className="pl-row-label text-red">
                    <span className="pl-row-icon">▼</span>
                    FUEL COSTS
                  </span>
                  <span className="pl-row-value text-red">{money(totals.fuel)}</span>
                </div>
                <div className="pl-row">
                  <span className="pl-row-label text-red">
                    <span className="pl-row-icon">▼</span>
                    MAINTENANCE
                  </span>
                  <span className="pl-row-value text-red">{money(totals.maintenance)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Truck filter */}
          {trucks.length > 0 && (
            <div className="exp-filter">
              <span className="exp-filter-label">FILTER BY UNIT</span>
              <select
                className="field-input field-select exp-filter-select"
                value={filterTruck}
                onChange={e => setFilterTruck(e.target.value)}
              >
                <option value="all">ALL UNITS</option>
                {trucks.map(t => (
                  <option key={t._id} value={t._id}>
                    {t.unit_number ?? `UNIT-${t._id.slice(-4).toUpperCase()}`} — {t.year} {t.make} {t.model}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Entries table */}
          {loading ? (
            <div className="loading-state">
              <div className="loading-spinner" />
              <p>LOADING RECORDS...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">⬡</div>
              <p>NO ENTRIES</p>
              <p className="text-dim">No records for this period</p>
            </div>
          ) : (
            <div className="exp-table">
              <div className="exp-table-head">
                <span>DATE</span>
                <span>UNIT</span>
                <span>TYPE</span>
                <span>DESCRIPTION</span>
                <span className="exp-col-right">AMOUNT</span>
                <span />
              </div>
              {filtered.map(exp => (
                <div key={exp._id} className="exp-table-row">
                  <span className="exp-date">{fmt(exp.date)}</span>
                  <span className="exp-unit">{truckLabel(exp.truck_id)}</span>
                  <span>
                    <span className={`exp-type-badge ${TYPE_CLASS[exp.type]}`}>
                      {TYPE_LABEL[exp.type]}
                    </span>
                  </span>
                  <span className="exp-desc">{exp.description ?? '—'}</span>
                  <span className={`exp-amount exp-col-right ${exp.type === 'income' ? 'text-green' : 'text-amber'}`}>
                    {exp.type === 'income' ? '+' : '-'}{money(exp.amount)}
                  </span>
                  <span>
                    <button className="btn-danger btn-sm" onClick={() => handleDelete(exp._id)}>✕</button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>

      {showAdd && trucks.length > 0 && (
        <AddExpenseModal
          trucks={trucks}
          onSave={handleAdd}
          onClose={() => setShowAdd(false)}
        />
      )}
    </>
  )
}
