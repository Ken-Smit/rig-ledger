import { useState, useMemo } from 'react'
import { Bar, BarChart, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { Truck } from '../types/truck'
import type { Expense } from '../types/expense'
import { isIncome, labelForType, chipForType } from '../types/expense'

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

// Cost-breakdown bar colors (Open Design navy palette), cycled by category.
const COST_PALETTE = ['#fb7185', '#fbbf24', '#5b9bf5', '#a78bfa', '#34d399', '#f59e0b', '#8a9bb5']
// Net chart colors — cockpit green/red by sign.
const NET_POS = '#00ff88'
const NET_NEG = '#ff5b77'
const CHART_TOOLTIP = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 0, fontFamily: 'var(--font-mono)', fontSize: 12 }

interface Props {
  trucks: Truck[]
  expenses: Expense[]
  loading: boolean
  error: string
}

// Presentational fleet dashboard. Owns only UI state (alerts dismissed, chart
// view); all data comes from the parent via props so the same markup backs both
// the authenticated "/" screen (API-backed) and the public /demo screen
// (in-memory). Render inside any shell — it emits <main>.
export default function DashboardView({ trucks, expenses, loading, error }: Props) {
  const [alertsOpen, setAlertsOpen] = useState(true)
  const [netView, setNetView] = useState<'table' | 'bar' | 'pie'>('table')

  // Monthly expense slice
  const monthly = useMemo(() => expenses.filter(e => isThisMonth(e.date)), [expenses])

  const monthlyIncome   = useMemo(() => monthly.filter(e => isIncome(e.type)).reduce((s, e) => s + e.amount, 0), [monthly])
  const monthlyExpenses = useMemo(() => monthly.filter(e => !isIncome(e.type)).reduce((s, e) => s + e.amount, 0), [monthly])
  const monthlyNet      = monthlyIncome - monthlyExpenses

  // Cost-breakdown rows — one per non-income category, largest first.
  const costRows = useMemo(() => {
    const map = new Map<string, number>()
    for (const e of monthly) {
      if (isIncome(e.type)) continue
      map.set(e.type, (map.get(e.type) ?? 0) + e.amount)
    }
    return Array.from(map.entries())
      .map(([type, value]) => ({ name: labelForType(type), value }))
      .filter(r => r.value > 0)
      .sort((a, b) => b.value - a.value)
  }, [monthly])

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
    const income = rows.filter(e => isIncome(e.type)).reduce((s, e) => s + e.amount, 0)
    const costs  = rows.filter(e => !isIncome(e.type)).reduce((s, e) => s + e.amount, 0)
    const net    = income - costs
    const label  = t.unit_number ?? `UNIT-${t._id.slice(-4).toUpperCase()}`
    return { id: t._id, label, income, costs, net }
  }), [trucks, monthly])

  // Net charts: per-unit + whole-fleet bar; per-unit pie (abs size, signed color).
  const netBarData = useMemo(
    () => [...truckBreakdown.map(t => ({ name: t.label, net: t.net })), { name: 'Fleet', net: monthlyNet }],
    [truckBreakdown, monthlyNet],
  )
  // Pie = whole-fleet totals only (no per-truck): Income (green) vs Costs (red).
  const fleetPieData = useMemo(
    () => [
      { name: 'Income', value: monthlyIncome, color: NET_POS },
      { name: 'Costs', value: monthlyExpenses, color: NET_NEG },
    ].filter(d => d.value > 0),
    [monthlyIncome, monthlyExpenses],
  )

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
    <main>
      <div className="pagehead">
        <div>
          <div className="kicker">Earnings</div>
          <h1>Dashboard</h1>
          <div className="sub">{now} — fleet overview at a glance.</div>
        </div>
      </div>

      {error && (
        <div className="alert">
          <span className="dot due" />
          <div className="body"><div className="t">Something went wrong</div><div className="m">{error}</div></div>
        </div>
      )}

      {loading ? (
        <div className="loading-state">
          <div className="loading-spinner" />
          <p>Loading…</p>
        </div>
      ) : (
        <>
          {/* KPI grid — only values we actually compute from real data */}
          <div className="kpis">
            <div className="kpi hero-k">
              <div className="k">Monthly net</div>
              <div className="v num" style={{ color: monthlyNet >= 0 ? 'var(--pos)' : 'var(--neg)' }}>{money(monthlyNet)}</div>
              <div className={`d num ${monthlyNet >= 0 ? 'up' : 'down'}`}>
                {monthlyNet >= 0 ? 'Profitable this month' : 'Operating at a loss'}
              </div>
            </div>

            <div className="kpi">
              <div className="k">Monthly income</div>
              <div className="v num" style={{ color: 'var(--pos)' }}>{money(monthlyIncome)}</div>
              <div className="d num up">Money in</div>
            </div>

            <div className="kpi">
              <div className="k">Monthly expenses</div>
              <div className="v num" style={{ color: 'var(--neg)' }}>{money(monthlyExpenses)}</div>
              <div className="d num down">Money out</div>
            </div>

            <div className="kpi">
              <div className="k">Total fleet</div>
              <div className="v num">{String(trucks.length).padStart(2, '0')}</div>
              <div className={`d num ${truckAlerts.length > 0 ? 'down' : 'up'}`}>
                {truckAlerts.length > 0
                  ? `${truckAlerts.length} unit${truckAlerts.length > 1 ? 's' : ''} need service`
                  : 'All units up to date'}
              </div>
            </div>
          </div>

          {/* Maintenance alerts panel */}
          {truckAlerts.length > 0 && alertsOpen && (
            <section className="panel">
              <h2>
                Service Alerts
                <button
                  className="btn-ghost btn-sm"
                  style={{ marginLeft: 'auto' }}
                  onClick={() => setAlertsOpen(false)}
                >
                  Dismiss
                </button>
              </h2>
              {truckAlerts.flatMap(ta =>
                ta.services.map(s => (
                  <div className="alert" key={`${ta.truck._id}-${s.label}`}>
                    <span className="dot due" />
                    <div className="body">
                      <div className="t">{s.label} — {ta.unitLabel}</div>
                      <div className="m">Was due {s.dueDate}</div>
                    </div>
                    <span className="miles">{s.daysOverdue}d overdue</span>
                  </div>
                ))
              )}
            </section>
          )}

          {/* Cost breakdown + per-unit table */}
          <div className="grid2">
            <section className="panel">
              <h2>Where the money goes <span className="amt num">{money(monthlyExpenses)}</span></h2>
              {costRows.length === 0 ? (
                <p style={{ color: 'var(--muted)', padding: '16px 0', fontSize: 12 }}>
                  No expenses recorded this month.
                </p>
              ) : (
                <div className="cost-rows">
                  {costRows.map((r, i) => {
                    const max = Math.max(...costRows.map(c => c.value)) || 1
                    return (
                      <div className="cost-row" key={r.name}>
                        <span className="cost-name">{r.name}</span>
                        <span className="cost-bar">
                          <i style={{ width: `${(r.value / max) * 100}%`, background: COST_PALETTE[i % COST_PALETTE.length] }} />
                        </span>
                        <span className="cost-amt">{money(r.value)}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </section>

            <section className="panel">
              <h2>
                Per-Unit Breakdown
                <span className="tabs">
                  <button type="button" className={netView === 'table' ? 'on' : ''} onClick={() => setNetView('table')}>Table</button>
                  <button type="button" className={netView === 'bar' ? 'on' : ''} onClick={() => setNetView('bar')}>Bar</button>
                  <button type="button" className={netView === 'pie' ? 'on' : ''} onClick={() => setNetView('pie')}>Pie</button>
                </span>
              </h2>
              {truckBreakdown.length === 0 ? (
                <p style={{ color: 'var(--muted)', padding: '16px 0', fontSize: 12 }}>No units registered.</p>
              ) : netView === 'table' ? (
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
                    {truckBreakdown.map(row => (
                      <tr key={row.id}>
                        <td className="tk">{row.label}</td>
                        <td className="r num">{money(row.income)}</td>
                        <td className="r num">{money(row.costs)}</td>
                        <td className={`r num ${row.net >= 0 ? 'up' : 'down'}`}>{money(row.net)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : netView === 'bar' ? (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={netBarData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: 'var(--muted)', fontSize: 11 }} />
                    <YAxis tickLine={false} axisLine={false} tick={{ fill: 'var(--muted)', fontSize: 11 }} tickFormatter={(v) => `$${(Number(v) / 1000).toFixed(0)}k`} />
                    <Tooltip cursor={{ fill: 'rgba(0,229,255,.06)' }} formatter={(v) => money(Number(v))} contentStyle={CHART_TOOLTIP} labelStyle={{ color: 'var(--fg-2)' }} />
                    <Bar dataKey="net">
                      {netBarData.map((d, i) => <Cell key={i} fill={d.net >= 0 ? NET_POS : NET_NEG} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : fleetPieData.length === 0 ? (
                <p style={{ color: 'var(--muted)', padding: '16px 0', fontSize: 12 }}>No income or costs to chart.</p>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie
                        data={fleetPieData} dataKey="value" nameKey="name" cx="50%" cy="45%" innerRadius={52} outerRadius={84} paddingAngle={2}
                        labelLine={{ stroke: 'var(--border)' }}
                        label={(p: { x?: number; y?: number; cx?: number; value?: number; payload?: { color?: string } }) => (
                          <text x={p.x} y={p.y} fill={p.payload?.color ?? 'var(--fg)'} fontFamily="var(--font-mono)" fontSize="12" fontWeight="700"
                            textAnchor={(p.x ?? 0) >= (p.cx ?? 0) ? 'start' : 'end'} dominantBaseline="central">
                            {money(p.value ?? 0)}
                          </text>
                        )}
                      >
                        {fleetPieData.map((d, i) => <Cell key={i} fill={d.color} stroke="var(--surface)" strokeWidth={2} />)}
                      </Pie>
                      <Tooltip formatter={(v) => money(Number(v))} contentStyle={CHART_TOOLTIP} labelStyle={{ color: 'var(--fg-2)' }} />
                      <Legend verticalAlign="bottom" height={24} formatter={(v) => <span style={{ color: 'var(--muted)', fontSize: 11 }}>{v}</span>} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="sub" style={{ textAlign: 'center', marginTop: 4 }}>
                    Fleet net <span style={{ color: monthlyNet >= 0 ? 'var(--pos)' : 'var(--neg)' }}>{money(monthlyNet)}</span>
                  </div>
                </>
              )}
            </section>
          </div>

          {/* Recent activity */}
          <section className="panel">
            <h2>Recent Activity</h2>
            {recent.length === 0 ? (
              <p style={{ color: 'var(--muted)', padding: '16px 0', fontSize: 12 }}>No entries yet.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Unit</th>
                    <th>Type</th>
                    <th className="r">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map(e => (
                    <tr key={e._id}>
                      <td className="tk">{fmt(e.date)}</td>
                      <td>{truckLabel(e.truck_id)}</td>
                      <td>
                        <span className={`chip ${chipForType(e.type)}`}>
                          {labelForType(e.type)}
                        </span>
                      </td>
                      <td className={`r num ${isIncome(e.type) ? 'up' : 'down'}`}>
                        {isIncome(e.type) ? '+' : '-'}{money(e.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </main>
  )
}
