import { useState } from 'react'
import type { TruckFormData } from '../types/truck'

interface Props {
  onSave: (data: TruckFormData) => Promise<void>
  onClose: () => void
}

export default function AddTruckModal({ onSave, onClose }: Props) {
  const [form, setForm] = useState({
    year: '',
    make: '',
    model: '',
    vin: '',
    unit_number: '',
    annual_inspection_date: '',
    brake_inspection_date: '',
    last_oil_change_date: '',
    last_oil_change_mileage: '',
    oil_change_interval: '',
    last_tire_rotation_date: '',
    coolant_flush_date: '',
    transmission_service_date: '',
    tire_size: '',
    tire_brand: '',
    tire_model: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(prev => ({ ...prev, [field]: e.target.value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const payload: TruckFormData = {
        year: Number(form.year),
        make: form.make,
        model: form.model,
        ...(form.vin && { vin: form.vin }),
        ...(form.unit_number && { unit_number: form.unit_number }),
        ...(form.annual_inspection_date && { annual_inspection_date: form.annual_inspection_date }),
        ...(form.brake_inspection_date && { brake_inspection_date: form.brake_inspection_date }),
        ...(form.last_oil_change_date && { last_oil_change_date: form.last_oil_change_date }),
        ...(form.last_oil_change_mileage && { last_oil_change_mileage: Number(form.last_oil_change_mileage) }),
        ...(form.oil_change_interval && { oil_change_interval: Number(form.oil_change_interval) }),
        ...(form.last_tire_rotation_date && { last_tire_rotation_date: form.last_tire_rotation_date }),
        ...(form.coolant_flush_date && { coolant_flush_date: form.coolant_flush_date }),
        ...(form.transmission_service_date && { transmission_service_date: form.transmission_service_date }),
        ...(form.tire_size && { tire_size: form.tire_size }),
        ...(form.tire_brand && { tire_brand: form.tire_brand }),
        ...(form.tire_model && { tire_model: form.tire_model }),
      }
      await onSave(payload)
      onClose()
    } catch {
      setError('FAILED TO CREATE UNIT')
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <div className="modal-bracket-tl" />
        <div className="modal-bracket-br" />

        <div className="modal-header">
          <span className="modal-title">ADD UNIT</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <form className="modal-form" onSubmit={handleSubmit}>
          <div className="modal-section-label">IDENTITY</div>
          <div className="modal-row">
            <div className="field-group">
              <label className="field-label">YEAR *</label>
              <input className="field-input" type="number" value={form.year} onChange={set('year')} required min={1900} max={2100} placeholder="2024" />
            </div>
            <div className="field-group">
              <label className="field-label">UNIT #</label>
              <input className="field-input" type="text" value={form.unit_number} onChange={set('unit_number')} placeholder="optional" />
            </div>
          </div>
          <div className="modal-row">
            <div className="field-group">
              <label className="field-label">MAKE *</label>
              <input className="field-input" type="text" value={form.make} onChange={set('make')} required placeholder="Freightliner" />
            </div>
            <div className="field-group">
              <label className="field-label">MODEL *</label>
              <input className="field-input" type="text" value={form.model} onChange={set('model')} required placeholder="Cascadia" />
            </div>
          </div>
          <div className="field-group">
            <label className="field-label">VIN</label>
            <input className="field-input" type="text" value={form.vin} onChange={set('vin')} placeholder="optional" />
          </div>

          <div className="modal-section-label" style={{ marginTop: 16 }}>MAINTENANCE</div>
          <div className="modal-row">
            <div className="field-group">
              <label className="field-label">ANNUAL INSPECTION</label>
              <input className="field-input" type="date" value={form.annual_inspection_date} onChange={set('annual_inspection_date')} />
            </div>
            <div className="field-group">
              <label className="field-label">BRAKE INSPECTION</label>
              <input className="field-input" type="date" value={form.brake_inspection_date} onChange={set('brake_inspection_date')} />
            </div>
          </div>
          <div className="modal-row">
            <div className="field-group">
              <label className="field-label">OIL CHANGE DATE</label>
              <input className="field-input" type="date" value={form.last_oil_change_date} onChange={set('last_oil_change_date')} />
            </div>
            <div className="field-group">
              <label className="field-label">OIL CHANGE MILEAGE</label>
              <input className="field-input" type="number" value={form.last_oil_change_mileage} onChange={set('last_oil_change_mileage')} placeholder="optional" min={0} />
            </div>
          </div>
          <div className="modal-row">
            <div className="field-group">
              <label className="field-label">OIL CHANGE INTERVAL (MI)</label>
              <input className="field-input" type="number" value={form.oil_change_interval} onChange={set('oil_change_interval')} placeholder="optional" min={0} />
            </div>
            <div className="field-group">
              <label className="field-label">TIRE ROTATION</label>
              <input className="field-input" type="date" value={form.last_tire_rotation_date} onChange={set('last_tire_rotation_date')} />
            </div>
          </div>
          <div className="modal-row">
            <div className="field-group">
              <label className="field-label">COOLANT FLUSH</label>
              <input className="field-input" type="date" value={form.coolant_flush_date} onChange={set('coolant_flush_date')} />
            </div>
            <div className="field-group">
              <label className="field-label">TRANSMISSION SERVICE</label>
              <input className="field-input" type="date" value={form.transmission_service_date} onChange={set('transmission_service_date')} />
            </div>
          </div>
          <div className="modal-section-label" style={{ marginTop: 16 }}>TIRES</div>
          <div className="modal-row">
            <div className="field-group">
              <label className="field-label">TIRE BRAND</label>
              <input className="field-input" type="text" value={form.tire_brand} onChange={set('tire_brand')} placeholder="optional" />
            </div>
            <div className="field-group">
              <label className="field-label">TIRE MODEL</label>
              <input className="field-input" type="text" value={form.tire_model} onChange={set('tire_model')} placeholder="optional" />
            </div>
          </div>
          <div className="field-group">
            <label className="field-label">TIRE SIZE</label>
            <input className="field-input" type="text" value={form.tire_size} onChange={set('tire_size')} placeholder="optional" />
          </div>

          {error && <div className="login-error">{error}</div>}

          <div className="modal-actions">
            <button type="button" className="btn-ghost" onClick={onClose} disabled={saving}>CANCEL</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'DEPLOYING...' : 'DEPLOY UNIT'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
