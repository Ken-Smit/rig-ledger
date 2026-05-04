import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getTrucks } from '../api/trucks'
import { getMileageLogs } from '../api/mileage'
import type { Truck } from '../types/truck'
import type { MileageLog } from '../types/mileage'
import Navbar from '../components/Navbar'
import { MileageLogModal } from '../components/MileageLogModal'
import { useAuth } from '../auth/AuthProvider'
import { ROLE_DRIVER } from '../types/user'

// currentMileageFor returns the most recent odometer reading from the latest
// mileage log for the truck. Server returns logs sorted by date desc, so
// logs[0] is newest. Prefer end_mileage (final reading of that day's run);
// fall back to start_mileage if a same-day shift hasn't been closed out.
function currentMileageFor(logs: MileageLog[]): number | null {
  if (logs.length === 0) return null
  const latest = logs[0]
  if (latest.end_mileage != null) return latest.end_mileage
  if (latest.start_mileage != null) return latest.start_mileage
  return null
}

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
  const [currentMileage, setCurrentMileage] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [mileageOpen, setMileageOpen] = useState(false)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    Promise.all([getTrucks(), getMileageLogs(id).catch(() => [] as MileageLog[])])
      .then(([trucks, logs]) => {
        if (cancelled) return
        const found = trucks.find(t => t._id === id)
        if (!found) setError('Unit Not Found')
        else {
          setTruck(found)
          setCurrentMileage(currentMileageFor(logs))
        }
      })
      .catch(() => {
        if (!cancelled) setError('Failed to Load Unit Data')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
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
            <div style={{ maxWidth: 560, margin: '0 auto', width: '100%' }}>
              <div className="td-back" onClick={() => navigate(-1)} style={{ cursor: 'pointer' }}>← Back to Fleet</div>

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

              <div className="td-section" style={{ gap: 4, padding: 16 }}>
                <div className="td-section-title">Odometer</div>
                <Row label="Current Mileage" value={currentMileage != null ? `${currentMileage.toLocaleString()} mi` : null} />

                <div className="td-section-title" style={{ marginTop: 6 }}>Inspections</div>
                <Row label="Annual Inspection" value={fmt(truck.annual_inspection_date)} />
                <Row label="Brake Inspection"  value={fmt(truck.brake_inspection_date)} />

                <div className="td-section-title" style={{ marginTop: 6 }}>Oil Service</div>
                <Row label="Last Oil Change"    value={fmt(truck.last_oil_change_date)} />
                <Row label="Oil Change Mileage" value={truck.last_oil_change_mileage != null ? `${truck.last_oil_change_mileage.toLocaleString()} mi` : null} />
                <Row label="Change Interval"    value={truck.oil_change_interval != null ? `${truck.oil_change_interval.toLocaleString()} mi` : null} />

                <div className="td-section-title" style={{ marginTop: 6 }}>Fluids</div>
                <Row label="Coolant Flush"        value={fmt(truck.coolant_flush_date)} />
                <Row label="Transmission Service" value={fmt(truck.transmission_service_date)} />

                <div className="td-section-title" style={{ marginTop: 6 }}>Tires</div>
                <Row label="Tire Size"       value={truck.tire_size} />
                <Row label="Tire Brand"      value={truck.tire_brand} />
                <Row label="Tire Model"      value={truck.tire_model} />
                <Row label="Number of Tires" value={truck.number_of_tires} />
                <Row label="Last Rotation"   value={fmt(truck.last_tire_rotation_date)} />

                {truck.tire_positions && truck.tire_positions.length > 0 && (
                  <>
                    <div className="td-section-title" style={{ marginTop: 6 }}>Tire Positions</div>
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
                  </>
                )}
              </div>
            </div>
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
