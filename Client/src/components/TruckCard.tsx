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
  onEdit: () => void
  onDelete: () => void
}

export default function TruckCard({ truck, onEdit, onDelete }: Props) {
  const status = getStatus(truck)
  const unitLabel = truck.unit_number ?? `UNIT-${truck._id.slice(-4).toUpperCase()}`

  const openDetail = () => window.open(`/trucks/${truck._id}`, '_blank')

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
          <span className="tc-key">ANNUAL INSP</span>
          <span className="tc-val">{fmt(truck.annual_inspection_date)}</span>
        </div>
        <div className="tc-row">
          <span className="tc-key">OIL CHANGE</span>
          <span className="tc-val">{fmt(truck.last_oil_change_date)}</span>
        </div>
        <div className="tc-row">
          <span className="tc-key">BRAKE INSP</span>
          <span className="tc-val">{fmt(truck.brake_inspection_date)}</span>
        </div>
        {truck.last_oil_change_mileage != null && (
          <div className="tc-row">
            <span className="tc-key">LAST OIL MI</span>
            <span className="tc-val">{truck.last_oil_change_mileage.toLocaleString()} mi</span>
          </div>
        )}
        {truck.last_tire_rotation_date && (
          <div className="tc-row">
            <span className="tc-key">TIRE ROTATE</span>
            <span className="tc-val">{fmt(truck.last_tire_rotation_date)}</span>
          </div>
        )}
      </div>

      <div className="tc-actions" onClick={e => e.stopPropagation()}>
        <button className="btn-ghost btn-sm" onClick={onEdit}>✎ EDIT</button>
        <button className="btn-danger btn-sm" onClick={onDelete}>✕ REMOVE</button>
      </div>
    </div>
  )
}
