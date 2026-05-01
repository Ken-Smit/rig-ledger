import type { Stop, StopKind } from '../types/load'
import { STOP_KIND_DROPOFF, STOP_KIND_PICKUP } from '../types/load'
import { isoToLocalInput, localInputToIso } from '../utils/datetime'

interface Props {
  stop: Stop
  index: number
  total: number
  onChange: (stop: Stop) => void
  onRemove?: () => void
  onMoveUp?: () => void
  onMoveDown?: () => void
}

// StopFieldGroup is a single row in the multi-stop editor. Reused by both
// AddLoadModal and EditLoadModal so adding a field here only happens once.
export default function StopFieldGroup({
  stop,
  index,
  total,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: Props) {
  const set = <K extends keyof Stop>(field: K, value: Stop[K]) =>
    onChange({ ...stop, [field]: value })

  return (
    <div
      className="modal-section"
      style={{
        border: '1px solid var(--border)',
        borderRadius: 6,
        padding: 12,
        marginBottom: 12,
      }}
    >
      <div
        className="modal-row"
        style={{ alignItems: 'center', marginBottom: 8 }}
      >
        <div className="field-group" style={{ flex: 1 }}>
          <label className="field-label">Stop {index + 1} Type</label>
          <select
            className="field-select"
            value={stop.kind}
            onChange={(e) => set('kind', e.target.value as StopKind)}
          >
            <option value={STOP_KIND_PICKUP}>Pickup</option>
            <option value={STOP_KIND_DROPOFF}>Dropoff</option>
          </select>
        </div>
        <div style={{ display: 'flex', gap: 4, marginLeft: 8 }}>
          {onMoveUp && index > 0 && (
            <button
              type="button"
              className="btn-ghost btn-sm"
              onClick={onMoveUp}
              title="Move up"
            >
              ↑
            </button>
          )}
          {onMoveDown && index < total - 1 && (
            <button
              type="button"
              className="btn-ghost btn-sm"
              onClick={onMoveDown}
              title="Move down"
            >
              ↓
            </button>
          )}
          {onRemove && total > 2 && (
            <button
              type="button"
              className="btn-ghost btn-sm"
              onClick={onRemove}
              title="Remove stop"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      <div className="field-group">
        <label className="field-label">Address *</label>
        <input
          className="field-input"
          type="text"
          value={stop.address}
          onChange={(e) => set('address', e.target.value)}
          required
          placeholder="123 Main St"
        />
      </div>

      <div className="modal-row">
        <div className="field-group" style={{ flex: 2 }}>
          <label className="field-label">City</label>
          <input
            className="field-input"
            type="text"
            value={stop.city ?? ''}
            onChange={(e) => set('city', e.target.value)}
          />
        </div>
        <div className="field-group" style={{ flex: 1 }}>
          <label className="field-label">State</label>
          <input
            className="field-input"
            type="text"
            value={stop.state ?? ''}
            onChange={(e) => set('state', e.target.value.toUpperCase())}
            maxLength={2}
            placeholder="TX"
          />
        </div>
        <div className="field-group" style={{ flex: 1 }}>
          <label className="field-label">Zip</label>
          <input
            className="field-input"
            type="text"
            value={stop.zip ?? ''}
            onChange={(e) => set('zip', e.target.value)}
            maxLength={10}
          />
        </div>
      </div>

      <div className="field-group">
        <label className="field-label">Scheduled Time *</label>
        <input
          className="field-input"
          type="datetime-local"
          value={isoToLocalInput(stop.scheduled_at)}
          onChange={(e) => set('scheduled_at', localInputToIso(e.target.value))}
          required
        />
      </div>

      <div className="modal-row">
        <div className="field-group">
          <label className="field-label">Contact Name</label>
          <input
            className="field-input"
            type="text"
            value={stop.contact_name ?? ''}
            onChange={(e) => set('contact_name', e.target.value)}
          />
        </div>
        <div className="field-group">
          <label className="field-label">Contact Phone</label>
          <input
            className="field-input"
            type="tel"
            value={stop.contact_phone ?? ''}
            onChange={(e) => set('contact_phone', e.target.value)}
          />
        </div>
      </div>

      <div className="field-group">
        <label className="field-label">Stop Notes</label>
        <input
          className="field-input"
          type="text"
          value={stop.notes ?? ''}
          onChange={(e) => set('notes', e.target.value)}
          placeholder="Dock 4, ring bell, etc."
        />
      </div>
    </div>
  )
}
