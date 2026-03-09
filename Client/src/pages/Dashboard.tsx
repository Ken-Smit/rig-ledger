import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { getTrucks } from '../api/trucks'
import { getExpenses } from '../api/expenses'
import { logout } from '../api/auth'
import type { Truck } from '../types/truck'
import type { Expense } from '../types/expense'
import Navbar from '../components/Navbar'

// ── Maintenance rules ──────────────────────────────────────────────────────
interface MaintenanceRule {
  field: keyof Truck
  label: string
  intervalDays: number
}

const MAINTENANCE_RULES: MaintenanceRule[] = [
  { field: 'annual_inspection_date',    label: 'Annual Inspection',      intervalDays: 365 },
  { field: 'brake_inspection_date',     label: 'Brake Inspection',       intervalDays: 365 },
  { field: 'last_oil_change_date',      label: 'Oil Change',             intervalDays: 90  },
  { field: 'coolant_flush_date',        label: 'Coolant Flush',          intervalDays: 730 },
  { field: 'transmission_service_date', label: 'Transmission Service',   intervalDays: 365 },
  { field: 'last_tire_rotation_date',   label: 'Tire Rotation',          intervalDays: 180 },
]

interface ServiceAlert {
  label: string
  daysOverdue: number
  dueDate: string
}

interface TruckAlert {
  truck: Truck
  unitLabel: string
  services: ServiceAlert[]
}

function daysSince(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return Math.floor((Date.now() - date.getTime()) / 86_400_000)
}

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  date.setDate(date.getDate() + days)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function parseLocal(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function isThisMonth(dateStr: string): boolean {
  const now = new Date()
  const d = parseLocal(dateStr)
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
}

function money(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmt(d: string) {
  return parseLocal(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

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

export default function Dashboard() {
  const navigate = useNavigate()
  const [trucks, setTrucks]         = useState<Truck[]>([])
  const [expenses, setExpenses]     = useState<Expense[]>([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState('')
  const [alertsOpen, setAlertsOpen] = useState(true)

  const handleLogout = async () => { await logout(); localStorage.removeItem('logged_in'); navigate('/login') }

  useEffect(() => {
    if (!localStorage.getItem('logged_in')) { navigate('/login'); return }
    Promise.all([getTrucks(), getExpenses()])
      .then(([t, e]) => { setTrucks(t); setExpenses(e) })
      .catch((err: unknown) => {
        const status = (err as { response?: { status?: number } })?.response?.status
        if (status === 401) { setError('SESSION EXPIRED – PLEASE LOG IN AGAIN') }
        else setError('FAILED TO LOAD DATA')
      })
      .finally(() => setLoading(false))
  }, [navigate])

  // Monthly expense slice
  const monthly = useMemo(() => expenses.filter(e => isThisMonth(e.date)), [expenses])

  const monthlyIncome   = monthly.filter(e => e.type === 'income').reduce((s, e) => s + e.amount, 0)
  const monthlyExpenses = monthly.filter(e => e.type !== 'income').reduce((s, e) => s + e.amount, 0)
  const monthlyNet      = monthlyIncome - monthlyExpenses

  // Compute per-truck maintenance alerts
  const truckAlerts = useMemo((): TruckAlert[] =>
    trucks.flatMap(t => {
      const services: ServiceAlert[] = []
      for (const rule of MAINTENANCE_RULES) {
        const val = t[rule.field]
        if (typeof val !== 'string') continue
        const days = daysSince(val)
        if (days > rule.intervalDays) {
          services.push({
            label:      rule.label,
            daysOverdue: days - rule.intervalDays,
            dueDate:    addDays(val, rule.intervalDays),
          })
        }
      }
      if (services.length === 0) return []
      const unitLabel = t.unit_number ?? `UNIT-${t._id.slice(-4).toUpperCase()}`
      return [{ truck: t, unitLabel, services }]
    }),
    [trucks]
  )

  // Per-truck breakdown (this month)
  const truckBreakdown = useMemo(() => trucks.map(t => {
    const rows   = monthly.filter(e => e.truck_id === t._id)
    const income = rows.filter(e => e.type === 'income').reduce((s, e) => s + e.amount, 0)
    const fuel   = rows.filter(e => e.type === 'fuel').reduce((s, e) => s + e.amount, 0)
    const maint  = rows.filter(e => e.type === 'maintenance').reduce((s, e) => s + e.amount, 0)
    const net    = income - fuel - maint
    const label  = t.unit_number ?? `UNIT-${t._id.slice(-4).toUpperCase()}`
    return { id: t._id, label, income, fuel, maint, net }
  }), [trucks, monthly])

  // Recent activity — last 8 entries sorted newest first
  const recent = useMemo(() =>
    [...expenses]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 8),
    [expenses]
  )

  const truckLabel = (id: string) => {
    const t = trucks.find(t => t._id === id)
    if (!t) return id
    return t.unit_number ?? `UNIT-${t._id.slice(-4).toUpperCase()}`
  }

  const now = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  return (
    <div className="dashboard-page">
      <Navbar onLogout={handleLogout} />

      <main className="dashboard-main">
        {/* Header */}
        <div className="fleet-header">
          <div>
            <h2 className="section-title">DASHBOARD</h2>
            <p className="section-sub">{now} — fleet overview</p>
          </div>
        </div>

        {error && <div className="alert-error">{error}</div>}

        {loading ? (
          <div className="loading-state">
            <div className="loading-spinner" />
            <p>LOADING DASHBOARD...</p>
          </div>
        ) : (
          <>
            {/* Stats row */}
            <div className="stats-row db-stats-row">
              <div className="stat-card">
                <div className="stat-label">TOTAL FLEET</div>
                <div className="stat-value">{String(trucks.length).padStart(2, '0')}</div>
                <div className="stat-sub">REGISTERED UNITS</div>
              </div>

              <div
                className={`stat-card stat-card-clickable ${truckAlerts.length > 0 ? 'stat-card-warn' : ''}`}
                onClick={() => truckAlerts.length > 0 && setAlertsOpen(o => !o)}
                title={truckAlerts.length > 0 ? (alertsOpen ? 'Hide alerts' : 'Show alerts') : undefined}
              >
                <div className="stat-label">ATTENTION NEEDED</div>
                <div className={`stat-value ${truckAlerts.length > 0 ? 'text-amber' : 'text-green'}`}>
                  {String(truckAlerts.length).padStart(2, '0')}
                </div>
                <div className="stat-sub">
                  {truckAlerts.length > 0
                    ? `${truckAlerts.length} UNIT${truckAlerts.length > 1 ? 'S' : ''} REQUIRE SERVICE`
                    : 'ALL UNITS UP TO DATE'}
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-label">MONTHLY INCOME</div>
                <div className="stat-value text-green">{money(monthlyIncome)}</div>
                <div className="stat-sub">LOAD REVENUE THIS MONTH</div>
              </div>

              <div className="stat-card">
                <div className="stat-label">MONTHLY NET</div>
                <div className={`stat-value ${monthlyNet >= 0 ? 'text-green' : 'text-red'}`}>
                  {money(monthlyNet)}
                </div>
                <div className="stat-sub">INCOME MINUS EXPENSES</div>
              </div>
            </div>

            {/* Maintenance alerts panel */}
            {truckAlerts.length > 0 && alertsOpen && (
              <div className="db-alerts-panel">
                <div className="db-alerts-header">
                  <span className="db-alerts-title">⚠ SERVICE ALERTS</span>
                  <button className="btn-ghost btn-sm" onClick={() => setAlertsOpen(false)}>✕</button>
                </div>
                <div className="db-alerts-list">
                  {truckAlerts.map(ta => (
                    <div key={ta.truck._id} className="db-alert-row">
                      <div className="db-alert-unit">{ta.unitLabel}</div>
                      <div className="db-alert-services">
                        {ta.services.map(s => (
                          <div key={s.label} className="db-alert-service">
                            <span className="db-alert-service-name">{s.label}</span>
                            <span className="db-alert-overdue text-amber">
                              {s.daysOverdue}d overdue
                            </span>
                            <span className="db-alert-due text-dim">
                              was due {s.dueDate}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Two-column layout: per-truck table + recent activity */}
            <div className="db-columns">

              {/* Per-truck breakdown */}
              <div className="db-panel">
                <div className="db-panel-title">PER-UNIT BREAKDOWN <span className="text-dim">— THIS MONTH</span></div>
                {truckBreakdown.length === 0 ? (
                  <p className="text-dim" style={{ padding: '16px 0', fontSize: 12 }}>No units registered.</p>
                ) : (
                  <table className="db-table">
                    <thead>
                      <tr>
                        <th>UNIT</th>
                        <th className="db-col-right">FUEL</th>
                        <th className="db-col-right">MAINT.</th>
                        <th className="db-col-right">INCOME</th>
                        <th className="db-col-right">NET</th>
                      </tr>
                    </thead>
                    <tbody>
                      {truckBreakdown.map(row => (
                        <tr key={row.id}>
                          <td className="db-unit-label">{row.label}</td>
                          <td className="db-col-right text-amber">{money(row.fuel)}</td>
                          <td className="db-col-right text-amber">{money(row.maint)}</td>
                          <td className="db-col-right text-green">{money(row.income)}</td>
                          <td className={`db-col-right ${row.net >= 0 ? 'text-green' : 'text-red'}`}>
                            {money(row.net)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Recent activity */}
              <div className="db-panel">
                <div className="db-panel-title">RECENT ACTIVITY</div>
                {recent.length === 0 ? (
                  <p className="text-dim" style={{ padding: '16px 0', fontSize: 12 }}>No entries yet.</p>
                ) : (
                  <div className="db-activity">
                    {recent.map(e => (
                      <div key={e._id} className="db-activity-row">
                        <span className="db-act-date">{fmt(e.date)}</span>
                        <span className="db-act-unit">{truckLabel(e.truck_id)}</span>
                        <span className={`exp-type-badge ${TYPE_CLASS[e.type]}`}>
                          {TYPE_LABEL[e.type]}
                        </span>
                        <span className={`db-act-amount ${e.type === 'income' ? 'text-green' : 'text-amber'}`}>
                          {e.type === 'income' ? '+' : '-'}{money(e.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>
          </>
        )}
      </main>
    </div>
  )
}
