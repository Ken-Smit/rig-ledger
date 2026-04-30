import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getTrucks } from '../api/trucks'
import type { Truck } from '../types/truck'
import Navbar from '../components/Navbar'
import { MileageLogModal } from '../components/MileageLogModal'
import { useAuth } from '../auth/AuthProvider'
import { ROLE_DRIVER } from '../types/user'

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
  const { logout, user } = useAuth()
  const isDriver = user?.role === ROLE_DRIVER
  const [truck, setTruck] = useState<Truck | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [mileageOpen, setMileageOpen] = useState(false)

  useEffect(() => {
    getTrucks().then(trucks => {
      const found = trucks.find(t => t._id === id)
      if (!found) setError('Unit Not Found')
      else setTruck(found)
    }).catch(() => {
      setError('Failed to Load Unit Data')
    }).finally(() => setLoading(false))
  }, [id])

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const unitLabel = truck
    ? (truck.unit_number ?? `UNIT-${truck._id.slice(-4).toUpperCase()}`)
    : '—'

  return (
    <>
      <div className="dashboard-page">
        <Navbar onLogout={handleLogout} />

        <main className="dashboard-main">
          {loading ? (
            <div className="loading-state">
              <div className="loading-spinner" />
              <p>Loading...</p>
            </div>
          ) : error ? (
            <div className="alert-error">{error}</div>
          ) : truck ? (
            <>
              <div className="td-back" onClick={() => window.close()}>← Close Tab</div>

              <div className="td-header">
                <div>
                  <div className="td-unit">{unitLabel}</div>
                  <div className="td-identity">{truck.year} {truck.make} {truck.model}</div>
                  {truck.vin && <div className="td-vin">VIN: {truck.vin}</div>}
                </div>
                {isDriver && (
                  <button
                    className="btn-primary"
                    onClick={() => setMileageOpen(true)}
                  >
                    Log Mileage
                  </button>
                )}
              </div>

              <div className="td-grid">
                <div className="td-section">
                  <div className="td-section-title">Inspections</div>
                  <Row label="Annual Inspection" value={fmt(truck.annual_inspection_date)} />
                  <Row label="Brake Inspection"  value={fmt(truck.brake_inspection_date)} />
                </div>

                <div className="td-section">
                  <div className="td-section-title">Oil Service</div>
                  <Row label="Last Oil Change"    value={fmt(truck.last_oil_change_date)} />
                  <Row label="Oil Change Mileage" value={truck.last_oil_change_mileage != null ? `${truck.last_oil_change_mileage.toLocaleString()} mi` : null} />
                  <Row label="Change Interval"    value={truck.oil_change_interval != null ? `${truck.oil_change_interval.toLocaleString()} mi` : null} />
                </div>

                <div className="td-section">
                  <div className="td-section-title">Fluids</div>
                  <Row label="Coolant Flush"        value={fmt(truck.coolant_flush_date)} />
                  <Row label="Transmission Service" value={fmt(truck.transmission_service_date)} />
                </div>

                <div className="td-section">
                  <div className="td-section-title">Tires</div>
                  <Row label="Tire Size"       value={truck.tire_size} />
                  <Row label="Tire Brand"      value={truck.tire_brand} />
                  <Row label="Tire Model"      value={truck.tire_model} />
                  <Row label="Number of Tires" value={truck.number_of_tires} />
                  <Row label="Last Rotation"   value={fmt(truck.last_tire_rotation_date)} />
                </div>

                {truck.tire_positions && truck.tire_positions.length > 0 && (
                  <div className="td-section td-section-full">
                    <div className="td-section-title">Tire Positions</div>
                    <div className="td-tire-grid">
                      {truck.tire_positions.map((tp, i) => (
                        <div key={i} className="td-tire-card">
                          <div className="td-tire-pos">{tp.position}</div>
                          <Row label="Tread Depth" value={`${tp.tread_depth}/32"`} />
                          {tp.brand && <Row label="Brand" value={tp.brand} />}
                          {tp.model && <Row label="Model" value={tp.model} />}
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

      {truck && mileageOpen && (
        <MileageLogModal
          truckId={truck._id}
          truckLabel={unitLabel}
          isOpen={true}
          onClose={() => setMileageOpen(false)}
          onSaved={() => setMileageOpen(false)}
        />
      )}
    </>
  )
}
