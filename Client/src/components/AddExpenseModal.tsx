import { useState } from 'react'
import type { Truck } from '../types/truck'
import type { ExpenseFormData, ExpenseType } from '../types/expense'

interface Props {
  trucks: Truck[]
  onSave: (data: ExpenseFormData) => Promise<void>
  onClose: () => void
}

const TYPE_LABELS: Record<ExpenseType, string> = {
  fuel:        'FUEL COST',
  maintenance: 'MAINTENANCE COST',
  income:      'LOAD INCOME',
}

export default function AddExpenseModal({ trucks, onSave, onClose }: Props) {
  const [form, setForm] = useState({
    truck_id:    trucks[0]?._id ?? '',
    type:        'fuel' as ExpenseType,
    amount:      '',
    date:        new Date().toISOString().slice(0, 10),
    description: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(prev => ({ ...prev, [field]: e.target.value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      await onSave({
        truck_id:    form.truck_id,
        type:        form.type,
        amount:      Number(form.amount),
        date:        form.date,
        ...(form.description && { description: form.description }),
      })
      onClose()
    } catch {
      setError('FAILED TO SAVE ENTRY')
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <div className="modal-bracket-tl" />
        <div className="modal-bracket-br" />

        <div className="modal-header">
          <span className="modal-title">ADD ENTRY</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <form className="modal-form" onSubmit={handleSubmit}>
          <div className="field-group">
            <label className="field-label">UNIT</label>
            <select className="field-input field-select" value={form.truck_id} onChange={set('truck_id')} required>
              {trucks.map(t => (
                <option key={t._id} value={t._id}>
                  {t.unit_number ?? `UNIT-${t._id.slice(-4).toUpperCase()}`} — {t.year} {t.make} {t.model}
                </option>
              ))}
            </select>
          </div>

          <div className="modal-row">
            <div className="field-group">
              <label className="field-label">TYPE</label>
              <select className="field-input field-select" value={form.type} onChange={set('type')} required>
                {(Object.keys(TYPE_LABELS) as ExpenseType[]).map(t => (
                  <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                ))}
              </select>
            </div>
            <div className="field-group">
              <label className="field-label">DATE</label>
              <input className="field-input" type="date" value={form.date} onChange={set('date')} required />
            </div>
          </div>

          <div className="field-group">
            <label className="field-label">AMOUNT ($)</label>
            <input
              className="field-input"
              type="number"
              value={form.amount}
              onChange={set('amount')}
              required
              min={0}
              step="0.01"
              placeholder="0.00"
            />
          </div>

          <div className="field-group">
            <label className="field-label">DESCRIPTION</label>
            <input className="field-input" type="text" value={form.description} onChange={set('description')} placeholder="optional" />
          </div>

          {error && <div className="login-error">{error}</div>}

          <div className="modal-actions">
            <button type="button" className="btn-ghost" onClick={onClose} disabled={saving}>CANCEL</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'SAVING...' : 'ADD ENTRY'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
