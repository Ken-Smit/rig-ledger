import { useState, useMemo, useCallback, useEffect } from 'react'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
  ReferenceDot,
  Tooltip,
  type TooltipContentProps,
} from 'recharts'
import type { Expense } from '../types/expense'

type Period = 'day' | 'week' | 'month' | 'all'

interface Props {
  expenses: Expense[]
  period: Period
  onPeriodChange: (p: Period) => void
}

interface ChartPoint {
  date: string
  rawDate: string
  expenses: number
  income: number
  net: number
}

type ActiveLine = 'net' | 'income' | 'expenses'

const LINE_CONFIG: Record<ActiveLine, { label: string; varName: string }> = {
  net:      { label: 'Net',      varName: '--cyan' },
  income:   { label: 'Income',   varName: '--cyan' },
  expenses: { label: 'Expenses', varName: '--red'  },
}

// Read a CSS variable from :root so colors match the current theme
function useThemeColor(varName: string): string {
  const [color, setColor] = useState(() => getCssVar(varName))
  useEffect(() => {
    setColor(getCssVar(varName))
    // Re-read when the theme attribute on <html> changes
    const observer = new MutationObserver(() => setColor(getCssVar(varName)))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [varName])
  return color
}

function getCssVar(name: string): string {
  if (typeof window === 'undefined') return ''
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

const PERIODS: { key: Period; label: string }[] = [
  { key: 'day',   label: 'Daily'    },
  { key: 'week',  label: 'Week'     },
  { key: 'month', label: 'Month'    },
  { key: 'all',   label: 'All Time' },
]

function fmtMoney(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtCompactMoney(n: number): string {
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`
  if (abs >= 1_000)     return `${sign}$${(abs / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}k`
  return `${sign}$${Math.round(abs)}`
}

function fmtDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function fmtAxisDate(dateStr: string): string {
  const [, m, d] = dateStr.split('-')
  return `${m}/${d}`
}

function DetailTooltip({ active, payload }: Partial<TooltipContentProps<number, string>>) {
  if (!active || !payload || !payload.length) return null
  const pt = payload[0].payload as ChartPoint
  return (
    <div className="rh-tooltip">
      <div className="rh-tooltip-date">{fmtDate(pt.rawDate)}</div>
      <div className="rh-tooltip-row">
        <span className="rh-tooltip-label text-cyan">Income</span>
        <span className="rh-tooltip-value text-cyan">{fmtMoney(pt.income)}</span>
      </div>
      <div className="rh-tooltip-row">
        <span className="rh-tooltip-label text-red">Expenses</span>
        <span className="rh-tooltip-value text-red">{fmtMoney(pt.expenses)}</span>
      </div>
      <div className="rh-tooltip-row">
        <span className="rh-tooltip-label">Net</span>
        <span className={`rh-tooltip-value ${pt.net >= 0 ? 'text-cyan' : 'text-red'}`}>
          {fmtMoney(pt.net)}
        </span>
      </div>
    </div>
  )
}

export default function ExpenseChart({ expenses, period, onPeriodChange }: Props) {
  const [activeLine, setActiveLine] = useState<ActiveLine>('net')
  const [hoverPoint, setHoverPoint] = useState<ChartPoint | null>(null)

  const data = useMemo((): ChartPoint[] => {
    const map = new Map<string, ChartPoint>()

    for (const e of expenses) {
      if (!map.has(e.date)) {
        map.set(e.date, { date: fmtAxisDate(e.date), rawDate: e.date, expenses: 0, income: 0, net: 0 })
      }
      const pt = map.get(e.date)!
      if (e.type === 'income') {
        pt.income += e.amount
      } else {
        pt.expenses += e.amount
      }
    }

    // For DAILY view, fill in missing days with zero values for continuous progression
    if (period === 'day') {
      const now = new Date()
      const days: ChartPoint[] = []
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now)
        d.setDate(now.getDate() - i)
        const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        const existing = map.get(iso)
        if (existing) {
          existing.net = existing.income - existing.expenses
          days.push(existing)
        } else {
          days.push({ date: fmtAxisDate(iso), rawDate: iso, expenses: 0, income: 0, net: 0 })
        }
      }
      return days
    }

    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, pt]) => {
        pt.net = pt.income - pt.expenses
        return pt
      })
  }, [expenses, period])

  const summary = useMemo(() => {
    const source = hoverPoint
      ? hoverPoint
      : data.reduce((acc, pt) => ({
          ...acc,
          income: acc.income + pt.income,
          expenses: acc.expenses + pt.expenses,
          net: acc.net + pt.net,
        }), { date: '', rawDate: '', income: 0, expenses: 0, net: 0 })

    return {
      value: source[activeLine],
      date: hoverPoint ? fmtDate(hoverPoint.rawDate) : 'Total',
    }
  }, [data, hoverPoint, activeLine])

  const cyanColor = useThemeColor('--cyan')
  const redColor  = useThemeColor('--red')
  const dimColor  = useThemeColor('--text-dim')

  const { varName, label } = LINE_CONFIG[activeLine]
  const baseColor = varName === '--red' ? redColor : cyanColor
  const displayColor = activeLine === 'net' && summary.value < 0 ? redColor : baseColor

  // min / max / avg for the active series — drives avg reference line and min/max markers
  const stats = useMemo(() => {
    if (data.length === 0) return null
    let minPt = data[0]
    let maxPt = data[0]
    let sum = 0
    for (const pt of data) {
      const v = pt[activeLine]
      if (v < minPt[activeLine]) minPt = pt
      if (v > maxPt[activeLine]) maxPt = pt
      sum += v
    }
    return { min: minPt, max: maxPt, avg: sum / data.length }
  }, [data, activeLine])

  // Ghost series = the two inactive ones. NET ghost uses a neutral dim color so it
  // never visually collides with the active cyan income/net area.
  const ghostColor = (key: ActiveLine): string => {
    if (key === 'income')   return cyanColor
    if (key === 'expenses') return redColor
    return dimColor
  }
  const ghostKeys = (Object.keys(LINE_CONFIG) as ActiveLine[]).filter(k => k !== activeLine)

  const handleMouseMove = useCallback((state: { activeIndex?: number | string | null }) => {
    const raw = state?.activeIndex
    const idx = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : -1
    if (Number.isFinite(idx) && idx >= 0 && idx < data.length) {
      setHoverPoint(data[idx])
    }
  }, [data])

  const handleMouseLeave = useCallback(() => setHoverPoint(null), [])

  // Clear hover state when data changes (e.g., period change)
  useEffect(() => setHoverPoint(null), [period, activeLine])

  const periodTabs = (
    <div className="rh-period-tabs">
      {PERIODS.map(p => (
        <button
          key={p.key}
          className={`rh-period-tab${period === p.key ? ' rh-period-tab-active' : ''}`}
          onClick={() => onPeriodChange(p.key)}
        >
          {p.label}
        </button>
      ))}
    </div>
  )

  return (
    <div className="exp-chart-wrap rh-chart">
      <div className={`rh-chart-header${hoverPoint ? '' : ' rh-chart-header-idle'}`}>
        <div className="rh-chart-metric">{label}</div>
        <div className="rh-chart-value" style={{ color: displayColor }}>
          {fmtMoney(summary.value)}
        </div>
        <div className="rh-chart-date">{summary.date}</div>
      </div>

      <div className="rh-chart-tabs">
        {(Object.keys(LINE_CONFIG) as ActiveLine[]).map(key => {
          const tabColor = LINE_CONFIG[key].varName === '--red' ? redColor : cyanColor
          return (
            <button
              key={key}
              className={`rh-chart-tab${activeLine === key ? ' rh-chart-tab-active' : ''}`}
              style={activeLine === key ? { color: tabColor, borderColor: tabColor } : undefined}
              onClick={() => setActiveLine(key)}
            >
              {LINE_CONFIG[key].label}
            </button>
          )
        })}
      </div>

      <div
        className="rh-chart-area"
        style={{ ['--glow-color' as string]: displayColor } as React.CSSProperties}
        onTouchEnd={handleMouseLeave}
        onTouchCancel={handleMouseLeave}
      >
        {data.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={data}
              margin={{ top: 8, right: 12, left: 8, bottom: 0 }}
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
            >
              <defs>
                <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor={displayColor} stopOpacity={0.42} />
                  <stop offset="45%"  stopColor={displayColor} stopOpacity={0.18} />
                  <stop offset="100%" stopColor={displayColor} stopOpacity={0}    />
                </linearGradient>
              </defs>
              <CartesianGrid
                stroke="var(--border)"
                strokeDasharray="2 6"
                strokeOpacity={0.5}
                horizontal={true}
                vertical={false}
              />
              <XAxis
                dataKey="date"
                tick={{ fill: 'var(--text-dim)', fontSize: 10, fontFamily: 'var(--font-mono)' }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
                minTickGap={40}
              />
              <YAxis
                width={52}
                tick={{ fill: 'var(--text-dim)', fontSize: 10, fontFamily: 'var(--font-mono)' }}
                tickFormatter={(v: number) => fmtCompactMoney(v)}
                axisLine={false}
                tickLine={false}
                domain={['auto', 'auto']}
              />

              {/* Ghost lines: the two non-active series, faint, for context */}
              {ghostKeys.map(key => (
                <Line
                  key={key}
                  type="monotone"
                  dataKey={key}
                  stroke={ghostColor(key)}
                  strokeOpacity={0.35}
                  strokeWidth={1}
                  strokeDasharray="3 4"
                  dot={false}
                  activeDot={false}
                  isAnimationActive={false}
                />
              ))}

              {activeLine === 'net' && (
                <ReferenceLine
                  y={0}
                  stroke="var(--text-dim)"
                  strokeDasharray="4 4"
                  strokeOpacity={0.6}
                />
              )}

              {/* Average reference line for the active series */}
              {stats && (
                <ReferenceLine
                  y={stats.avg}
                  stroke={displayColor}
                  strokeDasharray="2 6"
                  strokeOpacity={0.55}
                  label={hoverPoint ? {
                    value: `Avg ${fmtCompactMoney(stats.avg)}`,
                    position: 'insideTopLeft',
                    fill: displayColor,
                    fontSize: 10,
                    fontFamily: 'var(--font-mono)',
                    fillOpacity: 0.85,
                  } : undefined}
                />
              )}

              <Tooltip
                content={<DetailTooltip />}
                cursor={{ stroke: displayColor, strokeWidth: 1, strokeDasharray: '4 4' }}
                wrapperStyle={{ outline: 'none' }}
                offset={12}
              />
              <Area
                className="rh-chart-line"
                type="monotone"
                dataKey={activeLine}
                stroke={displayColor}
                strokeWidth={2}
                fill="url(#chartGradient)"
                dot={false}
                activeDot={{ r: 5, fill: displayColor, stroke: 'var(--bg)', strokeWidth: 2, className: 'rh-chart-dot' }}
              />

              {/* Peak & trough markers for the active series (skip min when equal to max) */}
              {stats && (
                <ReferenceDot
                  x={stats.max.date}
                  y={stats.max[activeLine]}
                  r={4}
                  fill={displayColor}
                  stroke="var(--bg)"
                  strokeWidth={2}
                  ifOverflow="visible"
                  label={hoverPoint ? {
                    value: `Max ${fmtCompactMoney(stats.max[activeLine])}`,
                    position: 'top',
                    fill: displayColor,
                    fontSize: 10,
                    fontFamily: 'var(--font-mono)',
                  } : undefined}
                />
              )}
              {stats && stats.min !== stats.max && (
                <ReferenceDot
                  x={stats.min.date}
                  y={stats.min[activeLine]}
                  r={4}
                  fill="var(--bg)"
                  stroke={displayColor}
                  strokeWidth={2}
                  ifOverflow="visible"
                  label={hoverPoint ? {
                    value: `Min ${fmtCompactMoney(stats.min[activeLine])}`,
                    position: 'bottom',
                    fill: 'var(--text-dim)',
                    fontSize: 10,
                    fontFamily: 'var(--font-mono)',
                  } : undefined}
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="rh-empty-scope" role="img" aria-label="No Data — Awaiting Signal">
            <svg className="rh-empty-svg" viewBox="0 0 400 240" preserveAspectRatio="none" aria-hidden="true">
              <defs>
                <pattern id="rh-empty-grid" width="20" height="20" patternUnits="userSpaceOnUse">
                  <path d="M 20 0 L 0 0 0 20" fill="none" stroke="currentColor" strokeOpacity="0.22" strokeWidth="0.5" />
                </pattern>
              </defs>
              <rect width="400" height="240" fill="url(#rh-empty-grid)" />
              <line
                x1="0" x2="400" y1="120" y2="120"
                stroke="currentColor"
                strokeOpacity="0.45"
                strokeDasharray="4 6"
                strokeWidth="1"
                className="rh-empty-baseline"
              />
            </svg>
            <div className="rh-empty-scan" aria-hidden="true" />
            <div className="rh-empty-blip" aria-hidden="true" />
            <div className="rh-empty-label">Awaiting Signal</div>
          </div>
        )}
      </div>

      {periodTabs}
    </div>
  )
}
