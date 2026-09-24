import { useState } from 'react'
import type { Truck } from '../types/truck'
import { unitLabel } from '../types/truck'
import type { ExpenseFormData } from '../types/expense'
import { INCOME_TYPE, FUEL_TYPE, EXPENSE_PRESETS, INCOME_PRESETS, slugifyCategory, validateFuelEntry } from '../types/expense'
import type { FuelEntry } from '../types/expense'
import { IFTA_JURISDICTIONS } from '../types/ifta'

type Direction = 'expense' | 'income'

// Optional seed values, e.g. from a scanned receipt. Every field is editable
// after prefill — the user confirms before saving.
export interface EntryPrefill {
  direction?: Direction
  category?: string
  amount?: string
  date?: string
  description?: string
  gallons?: string
  jurisdiction?: string
}

// Re-exported for callers that only import from this module.
export type { FuelEntry }

interface Props {
  trucks: Truck[]
  onSave: (data: ExpenseFormData) => Promise<void>
  onClose: () => void
  initial?: EntryPrefill
  // Supplied by callers that can file an IFTA fuel purchase. Its presence is
  // what surfaces the Gallons / State fields on a fuel entry — a caller without
  // it never shows inputs whose values would be silently dropped. Runs after
  // onSave resolves; the caller owns its own failure handling, because by then
  // the expense is already saved.
  onFuel?: (entry: FuelEntry) => Promise<void>
}

export default function AddExpenseModal({ trucks, onSave, onClose, initial, onFuel }: Props) {
  const [direction, setDirection] = useState<Direction>(initial?.direction ?? 'expense')
  const [category, setCategory] = useState(initial?.category ?? '')
  // One truck: nothing to choose, so seed it and render it as static text.
  // Several: seed empty and make the driver pick — defaulting to trucks[0]
  // silently filed entries against whichever unit happened to sort first.
  const soleTruck = trucks.length === 1 ? trucks[0] : null
  const [form, setForm] = useState({
    truck_id:    soleTruck?._id ?? '',
    amount:      initial?.amount ?? '',
    date:        initial?.date || new Date().toISOString().slice(0, 10),
    description: initial?.description ?? '',
  })
  const [gallons, setGallons]           = useState(initial?.gallons ?? '')
  const [jurisdiction, setJurisdiction] = useState(initial?.jurisdiction ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(prev => ({ ...prev, [field]: e.target.value }))

  const isIncome = direction === 'income'
  const presets = isIncome ? INCOME_PRESETS : EXPENSE_PRESETS
  // Fuel is the only category that carries gallons onto the IFTA return, and
  // only when the caller can actually file them.
  const isFuel = !isIncome && !!onFuel && slugifyCategory(category) === FUEL_TYPE

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const amount = Number(form.amount)
    if (!(amount > 0)) { setError('Enter an amount greater than zero'); return }
    if (!isIncome && !category.trim()) { setError('Pick or type a category'); return }

    // Income collapses to the single 'income' bucket; any typed source becomes
    // the description. Expenses store the category as a slug.
    const type = isIncome ? INCOME_TYPE : (slugifyCategory(category) || 'other')
    const description = form.description.trim() || (isIncome ? category.trim() : '')

    // Gallons are optional — a fuel entry without them is just an expense.
    // See validateFuelEntry for the rule; it is pure so it can be tested.
    let fuel: FuelEntry | undefined
    if (isFuel) {
      const result = validateFuelEntry(gallons, jurisdiction)
      if (result?.error) { setError(result.error); return }
      fuel = result?.entry
    }

    setSaving(true)
    setError('')
    try {
      await onSave({
        truck_id: form.truck_id,
        type,
        amount,
        date: form.date,
        ...(description && { description }),
      })
      if (fuel && onFuel) await onFuel(fuel)
      onClose()
    } catch {
      setError('Failed to save entry')
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <div className="modal-bracket-tl" />
        <div className="modal-bracket-br" />

        <div className="modal-header">
          <span className="modal-title">Add Entry</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <form className="modal-form" onSubmit={handleSubmit}>
          <div className="field-group">
            <label className="field-label">Entry Type</label>
            <div className="authtabs" role="group" aria-label="Entry type">
              <button type="button" className={direction === 'expense' ? 'on' : ''} onClick={() => { setDirection('expense'); setCategory('') }}>Expense</button>
              <button type="button" className={direction === 'income' ? 'on' : ''} onClick={() => { setDirection('income'); setCategory('') }}>Income</button>
            </div>
          </div>

          <div className="field-group">
            <label className="field-label">Unit</label>
            {soleTruck ? (
              <div className="field-static">
                {unitLabel(soleTruck)} — {soleTruck.year} {soleTruck.make} {soleTruck.model}
              </div>
            ) : (
              <select className="field-input field-select" value={form.truck_id} onChange={set('truck_id')} required>
                <option value="" disabled>Select a unit</option>
                {trucks.map(t => (
                  <option key={t._id} value={t._id}>
                    {unitLabel(t)} — {t.year} {t.make} {t.model}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="modal-row">
            <div className="field-group">
              <label className="field-label">{isIncome ? 'Source' : 'Category'}</label>
              <input
                className="field-input"
                list="entry-category-list"
                value={category}
                onChange={e => setCategory(e.target.value)}
                placeholder={isIncome ? 'Load income' : 'e.g. Fuel, Tolls, Insurance'}
                required={!isIncome}
              />
              <datalist id="entry-category-list">
                {presets.map(p => <option key={p} value={p} />)}
              </datalist>
            </div>
            <div className="field-group">
              <label className="field-label">Date</label>
              <input className="field-input" type="date" value={form.date} onChange={set('date')} required />
            </div>
          </div>

          <div className="field-group">
            <label className="field-label">Amount ($)</label>
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

          {isFuel && (
            <div className="modal-row">
              <div className="field-group">
                <label className="field-label">Gallons</label>
                <input
                  className="field-input"
                  type="number"
                  value={gallons}
                  onChange={e => setGallons(e.target.value)}
                  min={0}
                  step="0.001"
                  placeholder="optional"
                />
              </div>
              <div className="field-group">
                <label className="field-label">State Fueled</label>
                <select
                  className="field-input field-select"
                  value={jurisdiction}
                  onChange={e => setJurisdiction(e.target.value)}
                >
                  <option value="">Select a state</option>
                  {IFTA_JURISDICTIONS.map(j => <option key={j} value={j}>{j}</option>)}
                </select>
              </div>
            </div>
          )}

          <div className="field-group">
            <label className="field-label">Note</label>
            <input className="field-input" type="text" value={form.description} onChange={set('description')} placeholder="optional" />
          </div>

          {error && <div className="login-error">{error}</div>}

          <div className="modal-actions">
            <button type="button" className="btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Saving...' : 'Add Entry'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
