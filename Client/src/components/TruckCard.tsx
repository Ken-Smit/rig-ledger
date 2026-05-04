import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Truck } from '../types/truck'

type Status = 'good' | 'warning' | 'critical' | 'unknown'

function getStatus(truck: Truck): Status {
  const dates = [
    truck.annual_inspection_date,
    truck.last_oil_change_date,
    truck.brake_inspection_date,
  ].filter(Boolean) as string[]

  if (dates.length === 0) return 'unknown'

  const maxAgeDays = Math.max(
    ...dates.map(d => (Date.now() - new Date(d).getTime()) / 86_400_000)
  )

  if (maxAgeDays > 365) return 'critical'
  if (maxAgeDays > 270) return 'warning'
  return 'good'
}

function fmt(d?: string) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

interface Props {
  truck: Truck
  // Per-action callbacks compose the default action row. Each button only
  // renders when its handler is provided, so the same component serves
  // owners (edit + remove + optional log mileage), drivers (log mileage
  // only), and any future role mix without prop juggling.
  onEdit?: () => void
  onDelete?: () => void
  onLogMileage?: () => void
  // Escape hatch: if a caller needs a totally custom action row, pass
  // `actions` and it replaces the composed default.
  actions?: ReactNode
}

export default function TruckCard({ truck, onEdit, onDelete, onLogMileage, actions }: Props) {
  const navigate = useNavigate()
  const status = getStatus(truck)
  const unitLabel = truck.unit_number ?? `UNIT-${truck._id.slice(-4).toUpperCase()}`

  // In-place SPA nav. Avoids re-mounting AuthProvider in a new tab, which
  // would re-run the boot probe (refresh + profile) and stall on cross-origin
  // cookies in dev. Live auth state carries over, so the detail page renders
  // immediately.
  const openDetail = () => navigate(`/trucks/${truck._id}`)

  const defaultActions = (
    <>
      {onLogMileage && (
        <button className="btn-primary btn-sm" onClick={onLogMileage}>Log Mileage</button>
      )}
      {onEdit && (
        <button className="btn-ghost btn-sm" onClick={onEdit}>✎ Edit</button>
      )}
      {onDelete && (
        <button className="btn-danger btn-sm" onClick={onDelete}>✕ Remove</button>
      )}
    </>
  )

  return (
    <div className={`truck-card status-${status}`} onClick={openDetail} style={{ cursor: 'pointer' }}>
      <div className="tc-bracket-tl" />
      <div className="tc-bracket-br" />

      <div className="tc-header">
        <span className="tc-unit">{unitLabel}</span>
        <span className={`tc-status-dot dot-${status}`} title={status.toUpperCase()} />
      </div>

      <div className="tc-identity">
        <span className="tc-year">{truck.year}</span>
        <span className="tc-make-model">{truck.make} {truck.model}</span>
      </div>

      {truck.vin && <div className="tc-vin">VIN: {truck.vin}</div>}

      <div className="tc-divider" />

      <div className="tc-data">
        <div className="tc-row">
          <span className="tc-key">Annual Insp.</span>
          <span className="tc-val">{fmt(truck.annual_inspection_date)}</span>
        </div>
        <div className="tc-row">
          <span className="tc-key">Oil Change</span>
          <span className="tc-val">{fmt(truck.last_oil_change_date)}</span>
        </div>
        <div className="tc-row">
          <span className="tc-key">Brake Insp.</span>
          <span className="tc-val">{fmt(truck.brake_inspection_date)}</span>
        </div>
        {truck.last_oil_change_mileage != null && (
          <div className="tc-row">
            <span className="tc-key">Last Oil Mi</span>
            <span className="tc-val">{truck.last_oil_change_mileage.toLocaleString()} mi</span>
          </div>
        )}
        {truck.last_tire_rotation_date && (
          <div className="tc-row">
            <span className="tc-key">Tire Rotation</span>
            <span className="tc-val">{fmt(truck.last_tire_rotation_date)}</span>
          </div>
        )}
      </div>

      <div className="tc-actions" onClick={e => e.stopPropagation()}>
        {actions ?? defaultActions}
      </div>
    </div>
  )
}
