import { useState, useMemo } from 'react'
import type { Truck } from '../types/truck'
import type { Expense, ExpenseFormData } from '../types/expense'
import { isIncome, labelForType, chipForType } from '../types/expense'
import AddExpenseModal from './AddExpenseModal'
import ExpenseChart from './ExpenseChart'

type Period = 'day' | 'week' | 'month' | 'all'

const PERIODS: { key: Period; label: string }[] = [
  { key: 'day',   label: 'Daily'    },
  { key: 'week',  label: 'Week'     },
  { key: 'month', label: 'Month'    },
  { key: 'all',   label: 'All Time' },
]

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
  return 'All Time'
}

function fmt(d: string) {
  return parseLocal(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function money(n: number) {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// Real per-truck profit/loss row, computed from the filtered expense set.
interface TruckPnl {
  id: string
  label: string
  detail: string
  income: number
  costs: number
  net: number
}

interface Props {
  trucks: Truck[]
  expenses: Expense[]
  loading: boolean
  error: string
  onAdd: (data: ExpenseFormData) => Promise<void>
  onDelete: (id: string) => void | Promise<void>
}

// Presentational Profit & Loss view. Owns only UI state (modal open, filters,
// period); all data and persistence come from the parent via props so the same
// markup backs both the authenticated /expenses screen (API-backed) and the
// public /demo screen (in-memory). Render inside any shell — it emits <main>.
export default function ExpensesView({ trucks, expenses, loading, error, onAdd, onDelete }: Props) {
  const [showAdd, setShowAdd]         = useState(false)
  const [filterTruck, setFilterTruck] = useState('all')
  const [period, setPeriod]           = useState<Period>('month')
  const [actionError, setActionError] = useState('')

  const handleDelete = async (id: string) => {
    if (!confirm('Remove this entry?')) return
    try {
      await onDelete(id)
    } catch {
      setActionError('Failed to remove entry')
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

  // Income is the single 'income' bucket; every other category is a cost.
  const income = useMemo(() => filtered.filter(e => isIncome(e.type)).reduce((s, e) => s + e.amount, 0), [filtered])
  const costs  = useMemo(() => filtered.filter(e => !isIncome(e.type)).reduce((s, e) => s + e.amount, 0), [filtered])
  const net = income - costs

  // Cost total per category, largest first — drives the dynamic breakdown.
  const byCategory = useMemo(() => {
    const map = new Map<string, number>()
    for (const e of filtered) {
      if (isIncome(e.type)) continue
      map.set(e.type, (map.get(e.type) ?? 0) + e.amount)
    }
    return Array.from(map.entries())
      .map(([type, amount]) => ({ type, amount }))
      .sort((a, b) => b.amount - a.amount)
  }, [filtered])

  // Per-truck P&L, derived entirely from the filtered (real) expense rows.
  const perTruck = useMemo<TruckPnl[]>(() => {
    const map = new Map<string, TruckPnl>()
    for (const e of filtered) {
      let row = map.get(e.truck_id)
      if (!row) {
        const t = trucks.find(t => t._id === e.truck_id)
        const label = t?.unit_number ?? `UNIT-${e.truck_id.slice(-4).toUpperCase()}`
        const detail = t ? `${t.year} ${t.make} ${t.model}`.trim() : 'Unknown unit'
        row = { id: e.truck_id, label, detail, income: 0, costs: 0, net: 0 }
        map.set(e.truck_id, row)
      }
      if (isIncome(e.type)) row.income += e.amount
      else row.costs += e.amount
    }
    return Array.from(map.values())
      .map(r => ({ ...r, net: r.income - r.costs }))
      .sort((a, b) => b.net - a.net)
  }, [filtered, trucks])

  const handleAdd = async (data: ExpenseFormData) => {
    await onAdd(data)
  }

  return (
    <main>
      <div className="pagehead">
        <div>
          <div className="kicker">Earnings</div>
          <h1>Profit &amp; Loss</h1>
          <div className="sub">Income net of every logged cost — the number that decides if the truck rolls.</div>
        </div>
        <div className="headside">
          <span className="scope">{periodLabel(period)}</span>
          <div className="tabs">
            {PERIODS.map(p => (
              <button
                key={p.key}
                type="button"
                className={period === p.key ? 'on' : ''}
                onClick={() => setPeriod(p.key)}
              >
                {p.label}
              </button>
            ))}
          </div>
          <button className="addbtn" type="button" onClick={() => setShowAdd(true)} disabled={trucks.length === 0}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M12 5v14M5 12h14" /></svg>Add expense
          </button>
        </div>
      </div>

      {(error || actionError) && <div className="alert-error">{error || actionError}</div>}

      <div className="kpis">
        <div className="kpi hero-k">
          <div className="k">Net</div>
          <div className="v num" style={{ color: net >= 0 ? 'var(--pos)' : 'var(--neg)' }}>{money(net)}</div>
          <div className={`d num ${net >= 0 ? 'up' : 'down'}`}>{net >= 0 ? 'Profit' : 'Loss'} this period</div>
        </div>
        <div className="kpi">
          <div className="k">Income</div>
          <div className="v num" style={{ color: 'var(--pos)' }}>{money(income)}</div>
          <div className="d num up">Money in</div>
        </div>
        <div className="kpi">
          <div className="k">Costs</div>
          <div className="v num" style={{ color: 'var(--neg)' }}>{money(costs)}</div>
          <div className="d num down">Money out</div>
        </div>
        <div className="kpi">
          <div className="k">Entries</div>
          <div className="v num">{filtered.length}</div>
          <div className="d num" style={{ color: 'var(--muted)' }}>{byCategory.length} categor{byCategory.length === 1 ? 'y' : 'ies'}</div>
        </div>
      </div>

      <section className="panel">
        <h2>Cash flow <span className="amt num">{money(net)}</span></h2>
        <ExpenseChart expenses={filtered} period={period} onPeriodChange={setPeriod} />
      </section>

      <div className="grid2" style={{ gridTemplateColumns: '1.5fr 1fr' }}>
        <section className="panel">
          <h2>Per-truck profitability</h2>
          {perTruck.length === 0 ? (
            <p className="sub" style={{ margin: 0 }}>No activity for this period.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Unit</th>
                  <th className="r">Income</th>
                  <th className="r">Costs</th>
                  <th className="r">Net</th>
                </tr>
              </thead>
              <tbody>
                {perTruck.map(t => (
                  <tr key={t.id}>
                    <td className="tk">{t.label}<small>{t.detail}</small></td>
                    <td className="r num">{money(t.income)}</td>
                    <td className="r num">{money(t.costs)}</td>
                    <td className={`r num ${t.net >= 0 ? 'up' : 'down'}`}>{money(t.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="panel">
          <h2>Breakdown <span className="amt num">{money(income + costs)}</span></h2>
          <table>
            <tbody>
              <tr>
                <td className="tk">Income</td>
                <td className="r num up">{money(income)}</td>
              </tr>
              {byCategory.map(c => (
                <tr key={c.type}>
                  <td className="tk">{labelForType(c.type)}</td>
                  <td className="r num down">{money(c.amount)}</td>
                </tr>
              ))}
              {byCategory.length === 0 && (
                <tr>
                  <td className="tk">Costs</td>
                  <td className="r num down">{money(0)}</td>
                </tr>
              )}
              <tr>
                <td className="tk">Net</td>
                <td className={`r num ${net >= 0 ? 'up' : 'down'}`}>{money(net)}</td>
              </tr>
            </tbody>
          </table>
        </section>
      </div>

      <section className="panel">
        <h2>
          Entries
          {trucks.length > 0 && (
            <span className="field" style={{ margin: 0, textTransform: 'none', letterSpacing: 0 }}>
              <label htmlFor="exp-filter" style={{ display: 'none' }}>Filter by unit</label>
              <select
                id="exp-filter"
                value={filterTruck}
                onChange={e => setFilterTruck(e.target.value)}
              >
                <option value="all">All units</option>
                {trucks.map(t => (
                  <option key={t._id} value={t._id}>
                    {t.unit_number ?? `UNIT-${t._id.slice(-4).toUpperCase()}`} — {t.year} {t.make} {t.model}
                  </option>
                ))}
              </select>
            </span>
          )}
        </h2>

        {loading ? (
          <div className="loading-state">
            <div className="loading-spinner" />
            <p>Loading...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">⬡</div>
            <p>No entries</p>
            <p className="text-dim">No records for this period</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Unit</th>
                <th>Type</th>
                <th>Description</th>
                <th className="r">Amount</th>
                <th className="r" />
              </tr>
            </thead>
            <tbody>
              {filtered.map(exp => (
                <tr key={exp._id}>
                  <td className="num">{fmt(exp.date)}</td>
                  <td className="tk">{truckLabel(exp.truck_id)}</td>
                  <td><span className={`chip ${chipForType(exp.type)}`}>{labelForType(exp.type)}</span></td>
                  <td>{exp.description ?? '—'}</td>
                  <td className={`r num ${isIncome(exp.type) ? 'up' : 'down'}`}>
                    {isIncome(exp.type) ? '+' : '-'}{money(exp.amount)}
                  </td>
                  <td className="r">
                    <button
                      className="btn ghost"
                      style={{ width: 'auto', margin: 0, padding: '6px 10px', fontSize: 12.5, color: 'var(--neg)' }}
                      onClick={() => handleDelete(exp._id)}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {showAdd && trucks.length > 0 && (
        <AddExpenseModal
          trucks={trucks}
          onSave={handleAdd}
          onClose={() => setShowAdd(false)}
        />
      )}
    </main>
  )
}
