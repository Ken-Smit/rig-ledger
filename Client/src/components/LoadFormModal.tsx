import { useState } from 'react'
import type { FleetDriver, Load, LoadCreateData, LoadUpdateData, Stop } from '../types/load'
import { LOAD_STATUS_PENDING, STOP_KIND_DROPOFF, STOP_KIND_PICKUP } from '../types/load'
import type { Truck } from '../types/truck'
import StopFieldGroup from './StopFieldGroup'

interface Props {
  initial?: Load | null
  drivers: FleetDriver[]
  trucks: Truck[]
  onCreate?: (data: LoadCreateData) => Promise<void>
  onUpdate?: (id: string, data: LoadUpdateData) => Promise<void>
  onClose: () => void
}

// emptyStop returns a fresh stop with the requested kind. scheduled_at left
// blank so the user is forced to pick a time — defaulting to "now" silently
// is worse than a visibly empty field.
function emptyStop(kind: Stop['kind'], sequence: number): Stop {
  return {
    kind,
    sequence,
    address: '',
    scheduled_at: '',
  }
}

function unitLabelFor(t: Truck): string {
  return t.unit_number ?? `UNIT-${t._id.slice(-4).toUpperCase()}`
}

function dollarsToCents(d: string): number | undefined {
  if (d === '') return undefined
  const n = Number(d)
  if (Number.isNaN(n) || n < 0) return undefined
  return Math.round(n * 100)
}

function centsToDollars(c: number | undefined): string {
  if (c === undefined || c === null) return ''
  return (c / 100).toFixed(2)
}

// LoadFormModal handles both Create and Edit. Mode is selected by the presence
// of `initial`. The Edit path sends a partial-update DTO; the Create path
// sends the full create DTO. Sharing the form keeps the multi-stop editor
// logic in one place.
export default function LoadFormModal({
  initial,
  drivers,
  trucks,
  onCreate,
  onUpdate,
  onClose,
}: Props) {
  const isEdit = !!initial
  const editLockedDriver =
    isEdit && initial!.status !== LOAD_STATUS_PENDING

  const [driverID, setDriverID] = useState(initial?.driver_id ?? '')
  const [truckID, setTruckID] = useState(initial?.truck_id ?? '')
  const [referenceNumber, setReferenceNumber] = useState(initial?.reference_number ?? '')
  const [stops, setStops] = useState<Stop[]>(
    initial?.stops ?? [emptyStop(STOP_KIND_PICKUP, 0), emptyStop(STOP_KIND_DROPOFF, 1)],
  )
  const [rateDollars, setRateDollars] = useState(centsToDollars(initial?.rate_cents))
  const [distance, setDistance] = useState(
    initial?.distance_miles !== undefined ? String(initial.distance_miles) : '',
  )
  const [notes, setNotes] = useState(initial?.notes ?? '')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const setStopAt = (i: number, s: Stop) => {
    setStops((prev) => prev.map((x, idx) => (idx === i ? s : x)))
  }

  const removeStopAt = (i: number) => {
    setStops((prev) => prev.filter((_, idx) => idx !== i).map((s, idx) => ({ ...s, sequence: idx })))
  }

  const moveStop = (i: number, delta: -1 | 1) => {
    setStops((prev) => {
      const next = [...prev]
      const j = i + delta
      if (j < 0 || j >= next.length) return prev
      ;[next[i], next[j]] = [next[j], next[i]]
      return next.map((s, idx) => ({ ...s, sequence: idx }))
    })
  }

  const addStop = (kind: Stop['kind']) => {
    setStops((prev) => [...prev, emptyStop(kind, prev.length)])
  }

  const validate = (): string | null => {
    if (!driverID) return 'Pick a driver'
    if (stops.length < 2) return 'Add at least one pickup and one dropoff'
    if (stops[0].kind !== STOP_KIND_PICKUP) return 'First stop must be a pickup'
    let hasPickup = false
    let hasDropoff = false
    for (const s of stops) {
      if (!s.address.trim()) return 'Every stop needs an address'
      if (!s.scheduled_at) return 'Every stop needs a scheduled time'
      if (s.kind === STOP_KIND_PICKUP) hasPickup = true
      if (s.kind === STOP_KIND_DROPOFF) hasDropoff = true
    }
    if (!hasPickup || !hasDropoff) return 'At least one pickup and one dropoff are required'
    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const v = validate()
    if (v) {
      setError(v)
      return
    }
    setSaving(true)
    setError('')

    const sequencedStops = stops.map((s, idx) => ({ ...s, sequence: idx }))
    const rate = dollarsToCents(rateDollars)
    const dist = distance === '' ? undefined : Number(distance)

    try {
      if (isEdit && onUpdate) {
        const payload: LoadUpdateData = {
          ...(editLockedDriver ? {} : { driver_id: driverID }),
          truck_id: truckID,
          reference_number: referenceNumber,
          stops: sequencedStops,
          rate_cents: rate,
          distance_miles: Number.isNaN(dist) ? undefined : dist,
          notes,
        }
        await onUpdate(initial!._id, payload)
      } else if (onCreate) {
        const payload: LoadCreateData = {
          driver_id: driverID,
          ...(truckID && { truck_id: truckID }),
          ...(referenceNumber && { reference_number: referenceNumber }),
          stops: sequencedStops,
          ...(rate !== undefined && { rate_cents: rate }),
          ...(dist !== undefined && !Number.isNaN(dist) && { distance_miles: dist }),
          ...(notes && { notes }),
        }
        await onCreate(payload)
      }
      onClose()
    } catch (err: unknown) {
      const apiMsg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      setError(apiMsg ?? (isEdit ? 'Failed to update load' : 'Failed to create load'))
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 720 }}
      >
        <div className="modal-bracket-tl" />
        <div className="modal-bracket-br" />

        <div className="modal-header">
          <span className="modal-title">{isEdit ? 'Edit Load' : 'New Load'}</span>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <form className="modal-form" onSubmit={handleSubmit}>
          <div className="modal-section-label">Assignment</div>
          <div className="modal-row">
            <div className="field-group">
              <label className="field-label">Driver *</label>
              {editLockedDriver ? (
                <input
                  className="field-input"
                  value={drivers.find((d) => d.user_id === driverID)
                    ? `${drivers.find((d) => d.user_id === driverID)!.first_name} ${drivers.find((d) => d.user_id === driverID)!.last_name}`
                    : driverID}
                  readOnly
                />
              ) : (
                <select
                  className="field-select"
                  value={driverID}
                  onChange={(e) => setDriverID(e.target.value)}
                  required
                >
                  <option value="">Select a driver...</option>
                  {drivers.map((d) => (
                    <option key={d.user_id} value={d.user_id}>
                      {d.first_name} {d.last_name}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div className="field-group">
              <label className="field-label">Truck (optional)</label>
              <select
                className="field-select"
                value={truckID}
                onChange={(e) => setTruckID(e.target.value)}
              >
                <option value="">Driver picks</option>
                {trucks.map((t) => (
                  <option key={t._id} value={t._id}>
                    {unitLabelFor(t)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {editLockedDriver && (
            <p className="text-dim" style={{ fontSize: 12, marginTop: -4, marginBottom: 8 }}>
              Driver cannot be reassigned once a load is in progress or complete.
            </p>
          )}

          <div className="modal-row">
            <div className="field-group">
              <label className="field-label">Reference / BOL</label>
              <input
                className="field-input"
                type="text"
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
                maxLength={50}
                placeholder="optional"
              />
            </div>
          </div>

          <div className="modal-section-label" style={{ marginTop: 16 }}>
            Stops
          </div>
          {stops.map((s, i) => (
            <StopFieldGroup
              key={i}
              stop={s}
              index={i}
              total={stops.length}
              onChange={(next) => setStopAt(i, next)}
              onRemove={() => removeStopAt(i)}
              onMoveUp={() => moveStop(i, -1)}
              onMoveDown={() => moveStop(i, 1)}
            />
          ))}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <button
              type="button"
              className="btn-ghost btn-sm"
              onClick={() => addStop(STOP_KIND_PICKUP)}
            >
              + Pickup
            </button>
            <button
              type="button"
              className="btn-ghost btn-sm"
              onClick={() => addStop(STOP_KIND_DROPOFF)}
            >
              + Dropoff
            </button>
          </div>

          <div className="modal-section-label">Details</div>
          <div className="modal-row">
            <div className="field-group">
              <label className="field-label">Rate (USD)</label>
              <input
                className="field-input"
                type="number"
                step="0.01"
                min={0}
                value={rateDollars}
                onChange={(e) => setRateDollars(e.target.value)}
                placeholder="optional"
              />
            </div>
            <div className="field-group">
              <label className="field-label">Distance (mi)</label>
              <input
                className="field-input"
                type="number"
                min={0}
                value={distance}
                onChange={(e) => setDistance(e.target.value)}
                placeholder="optional"
              />
            </div>
          </div>
          <div className="field-group">
            <label className="field-label">Notes</label>
            <input
              className="field-input"
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={2000}
              placeholder="optional"
            />
          </div>

          {error && <div className="alert-error">{error}</div>}

          <div className="modal-actions">
            <button
              type="button"
              className="btn-ghost"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Load'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
