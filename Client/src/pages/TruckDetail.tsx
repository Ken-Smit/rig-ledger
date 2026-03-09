import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getTrucks } from '../api/trucks'
import { logout } from '../api/auth'
import type { Truck } from '../types/truck'
import Navbar from '../components/Navbar'

function fmt(d?: string) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function Row({ label, value }: { label: string; value?: string | number | null }) {
  const display = value != null && value !== '' ? String(value) : '—'
  return (
    <div className="td-row">
      <span className="td-key">{label}</span>
      <span className={`td-val${display === '—' ? ' td-val-empty' : ''}`}>{display}</span>
    </div>
  )
}

export default function TruckDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [truck, setTruck] = useState<Truck | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!localStorage.getItem('logged_in')) { navigate('/login'); return }

    getTrucks().then(trucks => {
      const found = trucks.find(t => t._id === id)
      if (!found) setError('UNIT NOT FOUND')
      else setTruck(found)
    }).catch(() => {
      setError('FAILED TO LOAD UNIT DATA')
    }).finally(() => setLoading(false))
  }, [id, navigate])

  const handleLogout = async () => {
    await logout()
    localStorage.removeItem('logged_in')
    navigate('/login')
  }

  const unitLabel = truck
    ? (truck.unit_number ?? `UNIT-${truck._id.slice(-4).toUpperCase()}`)
    : '—'

  return (
    <div className="dashboard-page">
      <Navbar onLogout={handleLogout} />

      <main className="dashboard-main">
        {loading ? (
          <div className="loading-state">
            <div className="loading-spinner" />
            <p>LOADING UNIT DATA...</p>
          </div>
        ) : error ? (
          <div className="alert-error">{error}</div>
        ) : truck ? (
          <>
            <div className="td-back" onClick={() => window.close()}>← CLOSE TAB</div>

            <div className="td-header">
              <div>
                <div className="td-unit">{unitLabel}</div>
                <div className="td-identity">{truck.year} {truck.make} {truck.model}</div>
                {truck.vin && <div className="td-vin">VIN: {truck.vin}</div>}
              </div>
            </div>

            <div className="td-grid">
              <div className="td-section">
                <div className="td-section-title">INSPECTIONS</div>
                <Row label="ANNUAL INSPECTION" value={fmt(truck.annual_inspection_date)} />
                <Row label="BRAKE INSPECTION"  value={fmt(truck.brake_inspection_date)} />
              </div>

              <div className="td-section">
                <div className="td-section-title">OIL SERVICE</div>
                <Row label="LAST OIL CHANGE"    value={fmt(truck.last_oil_change_date)} />
                <Row label="OIL CHANGE MILEAGE" value={truck.last_oil_change_mileage != null ? `${truck.last_oil_change_mileage.toLocaleString()} mi` : null} />
                <Row label="CHANGE INTERVAL"    value={truck.oil_change_interval != null ? `${truck.oil_change_interval.toLocaleString()} mi` : null} />
              </div>

              <div className="td-section">
                <div className="td-section-title">FLUIDS</div>
                <Row label="COOLANT FLUSH"        value={fmt(truck.coolant_flush_date)} />
                <Row label="TRANSMISSION SERVICE" value={fmt(truck.transmission_service_date)} />
              </div>

              <div className="td-section">
                <div className="td-section-title">TIRES</div>
                <Row label="TIRE SIZE"       value={truck.tire_size} />
                <Row label="TIRE BRAND"      value={truck.tire_brand} />
                <Row label="TIRE MODEL"      value={truck.tire_model} />
                <Row label="NUMBER OF TIRES" value={truck.number_of_tires} />
                <Row label="LAST ROTATION"   value={fmt(truck.last_tire_rotation_date)} />
              </div>

              {truck.tire_positions && truck.tire_positions.length > 0 && (
                <div className="td-section td-section-full">
                  <div className="td-section-title">TIRE POSITIONS</div>
                  <div className="td-tire-grid">
                    {truck.tire_positions.map((tp, i) => (
                      <div key={i} className="td-tire-card">
                        <div className="td-tire-pos">{tp.position}</div>
                        <Row label="TREAD DEPTH" value={`${tp.tread_depth}/32"`} />
                        {tp.brand && <Row label="BRAND" value={tp.brand} />}
                        {tp.model && <Row label="MODEL" value={tp.model} />}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        ) : null}
      </main>
    </div>
  )
}
