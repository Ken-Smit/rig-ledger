import { useState, type CSSProperties } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useTheme } from '../hooks/useTheme'
import DashboardView from '../components/DashboardView'
import ExpensesView from '../components/ExpensesView'
import type { Truck } from '../types/truck'
import type { Expense, ExpenseFormData } from '../types/expense'

// Public, no-signup demo. Everything is in-memory: adds and removals update
// React state only, nothing touches the backend, and a refresh restores the
// seed. Reuses DashboardView + ExpensesView so the demo can never drift from
// the real screens.

// Dates are generated relative to today so the default month views always have
// data and the dashboard's overdue-service alerts always fire.
function isoDaysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

const DEMO_TRUCKS: Truck[] = [
  {
    _id: 'demo-101', user_id: 'demo', year: 2021, make: 'Freightliner', model: 'Cascadia', unit_number: 'UNIT-101',
    annual_inspection_date: isoDaysAgo(400), // overdue (365-day interval)
  },
  {
    _id: 'demo-204', user_id: 'demo', year: 2019, make: 'Peterbilt', model: '579', unit_number: 'UNIT-204',
    last_oil_change_date: isoDaysAgo(130), // overdue (90-day interval)
  },
]

function seedExpenses(): Expense[] {
  const rows: Omit<Expense, '_id'>[] = [
    { truck_id: 'demo-101', type: 'income',      amount: 4200,   date: isoDaysAgo(2),  description: 'Dry van — Dallas to Memphis' },
    { truck_id: 'demo-101', type: 'fuel',        amount: 612.40, date: isoDaysAgo(2),  description: 'Pilot — Amarillo, TX' },
    { truck_id: 'demo-101', type: 'tolls',       amount: 48.25,  date: isoDaysAgo(3),  description: 'I-30 toll' },
    { truck_id: 'demo-204', type: 'income',      amount: 3850,   date: isoDaysAgo(5),  description: 'Reefer — Tucson to Denver' },
    { truck_id: 'demo-204', type: 'fuel',        amount: 498.10, date: isoDaysAgo(5),  description: "Love's — Tucumcari, NM" },
    { truck_id: 'demo-204', type: 'maintenance', amount: 1240,   date: isoDaysAgo(7),  description: 'TA — DPF service' },
    { truck_id: 'demo-101', type: 'income',      amount: 5100,   date: isoDaysAgo(9),  description: 'Flatbed — Houston to Atlanta' },
    { truck_id: 'demo-101', type: 'fuel',        amount: 575.00, date: isoDaysAgo(10), description: 'Fuel — Shreveport, LA' },
    { truck_id: 'demo-204', type: 'insurance',   amount: 890,    date: isoDaysAgo(12), description: 'Monthly premium' },
    { truck_id: 'demo-204', type: 'tires',       amount: 1680,   date: isoDaysAgo(14), description: '2× steer tires' },
    { truck_id: 'demo-101', type: 'income',      amount: 3600,   date: isoDaysAgo(18), description: 'Dry van — Memphis to Chicago' },
    { truck_id: 'demo-101', type: 'parking',     amount: 22.00,  date: isoDaysAgo(20), description: 'Overnight parking' },
  ]
  return rows.map((r, i) => ({ _id: `demo-exp-${i}`, ...r }))
}

type DemoTab = 'dashboard' | 'pnl'

const styles: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg-2)', fontFamily: 'var(--font-body)' },
  bar: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
    padding: '12px 24px', borderBottom: '1px solid var(--border)', background: 'var(--bg-2)',
    position: 'sticky', top: 0, zIndex: 40,
  },
  note: { fontSize: 13, color: 'var(--muted)' },
  actions: { display: 'flex', alignItems: 'center', gap: 10 },
  linkBtn: { background: 'none', border: '1px solid var(--border)', borderRadius: 9, color: 'var(--fg)', font: '600 13px var(--font-body)', padding: '8px 13px', cursor: 'pointer', textDecoration: 'none' },
  ctaBtn: { background: 'var(--accent)', border: 0, borderRadius: 9, color: 'var(--accent-on)', font: '600 13px var(--font-body)', padding: '8px 15px', cursor: 'pointer' },
  shell: { width: '100%', maxWidth: 1280, margin: '0 auto', padding: '24px' },
  tabrow: { display: 'flex', gap: 8, marginBottom: 4 },
}

export default function Demo() {
  const navigate = useNavigate()
  const { theme, toggle } = useTheme()
  const [tab, setTab] = useState<DemoTab>('dashboard')
  const [expenses, setExpenses] = useState<Expense[]>(seedExpenses)

  const handleAdd = async (data: ExpenseFormData) => {
    setExpenses(prev => [{ _id: crypto.randomUUID(), ...data }, ...prev])
  }

  const handleDelete = (id: string) => {
    setExpenses(prev => prev.filter(e => e._id !== id))
  }

  return (
    <div style={styles.page}>
      <header style={styles.bar}>
        <Link to="/home" className="brand" style={{ padding: 0, textDecoration: 'none' }}>
          <span className="mark">⬡</span>
          <span className="word">Rig<span className="cy">Ledger</span></span>
        </Link>
        <span style={styles.note}>Demo — changes aren’t saved. Sign up to keep your fleet.</span>
        <div style={styles.actions}>
          <button
            style={styles.linkBtn}
            onClick={toggle}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? '☀' : '☾'}
          </button>
          <Link to="/home" style={styles.linkBtn}>Exit demo</Link>
          <button style={styles.ctaBtn} onClick={() => navigate('/login')}>Sign Up Free</button>
        </div>
      </header>

      <div style={styles.shell}>
        <div className="tabs" style={styles.tabrow}>
          <button type="button" className={tab === 'dashboard' ? 'on' : ''} onClick={() => setTab('dashboard')}>Dashboard</button>
          <button type="button" className={tab === 'pnl' ? 'on' : ''} onClick={() => setTab('pnl')}>Profit &amp; Loss</button>
        </div>

        {tab === 'dashboard' ? (
          <DashboardView trucks={DEMO_TRUCKS} expenses={expenses} loading={false} error="" />
        ) : (
          <ExpensesView
            trucks={DEMO_TRUCKS}
            expenses={expenses}
            loading={false}
            error=""
            onAdd={handleAdd}
            onDelete={handleDelete}
          />
        )}
      </div>
    </div>
  )
}
