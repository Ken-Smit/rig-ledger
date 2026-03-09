import { useMemo } from 'react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'
import type { Expense } from '../types/expense'

interface Props {
  expenses: Expense[]
}

function fmtAxisDate(dateStr: string): string {
  const [, m, d] = dateStr.split('-')
  return `${m}/${d}`
}

function fmtMoney(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

interface ChartPoint {
  date: string
  expenses: number
  income: number
}

const CustomTooltip = ({ active, payload, label }: {
  active?: boolean
  payload?: { name: string; value: number; color: string }[]
  label?: string
}) => {
  if (!active || !payload?.length) return null
  return (
    <div className="chart-tooltip">
      <p className="chart-tooltip-label">{label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name.toUpperCase()}: {fmtMoney(p.value)}
        </p>
      ))}
    </div>
  )
}

export default function ExpenseChart({ expenses }: Props) {
  const data = useMemo((): ChartPoint[] => {
    const map = new Map<string, ChartPoint>()

    for (const e of expenses) {
      if (!map.has(e.date)) {
        map.set(e.date, { date: fmtAxisDate(e.date), expenses: 0, income: 0 })
      }
      const pt = map.get(e.date)!
      if (e.type === 'income') {
        pt.income += e.amount
      } else {
        pt.expenses += e.amount
      }
    }

    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, pt]) => pt)
  }, [expenses])

  if (data.length === 0) return null

  return (
    <div className="exp-chart-wrap">
      <div className="exp-chart-title">EXPENSE &amp; INCOME OVERVIEW</div>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data} margin={{ top: 8, right: 24, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,229,255,0.08)" />
          <XAxis
            dataKey="date"
            tick={{ fill: '#7a9fb5', fontSize: 11, fontFamily: 'var(--font-display)' }}
            axisLine={{ stroke: 'rgba(0,229,255,0.15)' }}
            tickLine={false}
          />
          <YAxis
            tickFormatter={v => `$${v}`}
            tick={{ fill: '#7a9fb5', fontSize: 11, fontFamily: 'var(--font-display)' }}
            axisLine={false}
            tickLine={false}
            width={64}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{ fontSize: 11, fontFamily: 'var(--font-display)', letterSpacing: '0.1em', paddingTop: 8 }}
            formatter={v => v.toUpperCase()}
          />
          <Line
            type="monotone"
            dataKey="expenses"
            stroke="#f59e0b"
            strokeWidth={2}
            dot={{ r: 3, fill: '#f59e0b', strokeWidth: 0 }}
            activeDot={{ r: 5 }}
          />
          <Line
            type="monotone"
            dataKey="income"
            stroke="#00e5ff"
            strokeWidth={2}
            dot={{ r: 3, fill: '#00e5ff', strokeWidth: 0 }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
