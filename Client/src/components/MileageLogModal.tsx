import { useState } from 'react'
import { upsertMileageLog } from '../api/mileage'
import type { MileageLog } from '../types/mileage'

interface Props {
  truckId: string
  truckLabel: string
  isOpen: boolean
  onClose: () => void
  onSaved: (log: MileageLog) => void
}

// todayLocal returns YYYY-MM-DD anchored to the user's local timezone, not
// UTC. Truckers logging at 11pm Pacific would otherwise see "tomorrow" as
// the default — a confusing data-quality bug.
function todayLocal(): string {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export const MileageLogModal = ({
  truckId,
  truckLabel,
  isOpen,
  onClose,
  onSaved,
}: Props) => {
  const [date, setDate] = useState<string>(todayLocal())
  const [startMileage, setStartMileage] = useState<string>('')
  const [endMileage, setEndMileage] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    const startTrim = startMileage.trim()
    const endTrim = endMileage.trim()

    if (startTrim === '' && endTrim === '') {
      setError('Enter a start or end mileage to log.')
      return
    }

    const startNum = startTrim === '' ? undefined : Number(startTrim)
    const endNum = endTrim === '' ? undefined : Number(endTrim)

    if (startNum !== undefined && Number.isNaN(startNum)) {
      setError('Start mileage must be a number.')
      return
    }
    if (endNum !== undefined && Number.isNaN(endNum)) {
      setError('End mileage must be a number.')
      return
    }
    if (
      startNum !== undefined &&
      endNum !== undefined &&
      endNum < startNum
    ) {
      setError('End mileage cannot be less than start mileage.')
      return
    }

    setSaving(true)
    try {
      const log = await upsertMileageLog({
        truck_id: truckId,
        date,
        ...(startNum !== undefined && { start_mileage: startNum }),
        ...(endNum !== undefined && { end_mileage: endNum }),
      })
      onSaved(log)
      onClose()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })
        ?.response?.data?.error
      setError(msg ?? 'Failed to save mileage log.')
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <div className="modal-bracket-tl" />
        <div className="modal-bracket-br" />

        <div className="modal-header">
          <span className="modal-title">Log Mileage — {truckLabel}</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <form className="modal-form" onSubmit={handleSubmit}>
          <div className="field-group">
            <label className="field-label">Date</label>
            <input
              className="field-input"
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              required
            />
          </div>

          <div className="modal-row">
            <div className="field-group">
              <label className="field-label">Start of Day Mileage</label>
              <input
                className="field-input"
                type="number"
                value={startMileage}
                onChange={e => setStartMileage(e.target.value)}
                min={0}
                step="1"
                placeholder="0"
              />
            </div>
            <div className="field-group">
              <label className="field-label">End of Day Mileage</label>
              <input
                className="field-input"
                type="number"
                value={endMileage}
                onChange={e => setEndMileage(e.target.value)}
                min={0}
                step="1"
                placeholder="0"
              />
            </div>
          </div>

          {error && <div className="login-error">{error}</div>}

          <div className="modal-actions">
            <button
              type="button"
              className="btn-ghost"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save Log'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
