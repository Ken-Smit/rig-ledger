import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getTrucks } from '../api/trucks'
import { getMileageLogs } from '../api/mileage'
import type { Truck } from '../types/truck'
import type { MileageLog } from '../types/mileage'
import { AppShell } from '../components/AppShell'
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

type SvcStatus = 'ok' | 'soon' | 'over'
type TireStatus = 'ok' | 'soon' | 'low'

// tireStatus maps real tread depth (32nds of an inch) onto the three-state
// track palette. 4/32 is the federal minimum for steer tires, so anything at
// or below that is "low"; 6/32 and under is wearing into replacement territory.
function tireStatus(tread: number): TireStatus {
  if (tread <= 4) return 'low'
  if (tread <= 6) return 'soon'
  return 'ok'
}

// A maintenance line built only from real truck fields. `pct`/`status` are set
// only when we have enough real data (oil change has mileage + interval) to draw
// an honest progress bar — otherwise we show the service date alone, no fake bar.
type SvcRow = {
  label: string
  interval?: string
  due: string
  status: SvcStatus
  pct?: number
}

export default function TruckDetail() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
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

  const unitLabel = truck
    ? (truck.unit_number ?? `UNIT-${truck._id.slice(-4).toUpperCase()}`)
    : '—'

  // Build the maintenance list from real fields. The oil-change row is the only
  // one with honest mileage math — last_oil_change_mileage + interval against the
  // current odometer — so it's the only row that gets a computed progress bar.
  // Every other service shows its real on-record date and no fabricated bar.
  const services: SvcRow[] = truck
    ? (() => {
        const rows: SvcRow[] = []

        const oilMileage = truck.last_oil_change_mileage
        const interval = truck.oil_change_interval
        if (oilMileage != null && interval != null && interval > 0 && currentMileage != null) {
          const used = currentMileage - oilMileage
          const left = interval - used
          const pct = Math.max(0, Math.min(100, (used / interval) * 100))
          const status: SvcStatus = left < 0 ? 'over' : left < 3000 ? 'soon' : 'ok'
          rows.push({
            label: 'Oil change',
            interval: `every ${interval.toLocaleString()} mi`,
            due: left < 0
              ? `${Math.abs(left).toLocaleString()} mi over`
              : `${left.toLocaleString()} mi left`,
            status,
            pct,
          })
        } else {
          rows.push({ label: 'Oil change', interval: 'last service', due: fmt(truck.last_oil_change_date), status: 'ok' })
        }

        rows.push({ label: 'Annual inspection', interval: 'last service', due: fmt(truck.annual_inspection_date), status: 'ok' })
        rows.push({ label: 'Brake inspection', interval: 'last service', due: fmt(truck.brake_inspection_date), status: 'ok' })
        rows.push({ label: 'Tire rotation', interval: 'last service', due: fmt(truck.last_tire_rotation_date), status: 'ok' })
        rows.push({ label: 'Coolant flush', interval: 'last service', due: fmt(truck.coolant_flush_date), status: 'ok' })
        rows.push({ label: 'Transmission service', interval: 'last service', due: fmt(truck.transmission_service_date), status: 'ok' })

        return rows
      })()
    : []

  return (
    <AppShell>
      <main>
        {loading ? (
          <div className="loading-state">
            <div className="loading-spinner" />
            <p>Loading...</p>
          </div>
        ) : error ? (
          <div className="alert-error">{error}</div>
        ) : truck ? (
          <>
            <div className="crumb"><Link to="/fleet">← Fleet</Link></div>

            <div className="truckhead">
              <div>
                <h1>{unitLabel}</h1>
                <div className="meta">
                  {truck.year} {truck.make} {truck.model}
                  {truck.vin ? ` · VIN ${truck.vin}` : ''}
                </div>
              </div>
              {isDriver && (
                <button className="btn-primary" onClick={() => setMileageOpen(true)}>
                  Log Mileage
                </button>
              )}
            </div>

            <div className="kpis">
              <div className="kpi">
                <div className="k">Year</div>
                <div className="v num">{truck.year || '—'}</div>
              </div>
              <div className="kpi">
                <div className="k">Odometer</div>
                <div className="v num">{currentMileage != null ? currentMileage.toLocaleString() : '—'}</div>
              </div>
              <div className="kpi">
                <div className="k">Oil change mileage</div>
                <div className="v num">{truck.last_oil_change_mileage != null ? truck.last_oil_change_mileage.toLocaleString() : '—'}</div>
              </div>
              <div className="kpi">
                <div className="k">Tires</div>
                <div className="v num">{truck.number_of_tires != null ? truck.number_of_tires : '—'}</div>
              </div>
            </div>

            <div className="grid">
              <section className="panel">
                <h2>Maintenance <span className="note">from your service records</span></h2>
                {services.map(s => (
                  <div className="svc" key={s.label}>
                    <div className="row1">
                      <span className="nm">{s.label}{s.interval && <small>{s.interval}</small>}</span>
                      <span className={`due ${s.status}`}>{s.due}</span>
                    </div>
                    {s.pct != null && (
                      <div className="track"><i className={s.status} style={{ width: `${s.pct.toFixed(0)}%` }} /></div>
                    )}
                  </div>
                ))}
              </section>

              <section className="panel">
                <h2>
                  Tires <span className="note">tread depth · 32nds</span>
                </h2>
                {truck.tire_positions && truck.tire_positions.length > 0 ? (
                  <div className="tirewrap">
                    {truck.tire_positions.map((tp, i) => {
                      const st = tireStatus(tp.tread_depth)
                      return (
                        <div className="tire" key={`${tp.position}-${i}`}>
                          <span className="pos">{tp.position}</span>
                          <span className={`tr ${st}`}>{tp.tread_depth}/32</span>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="muted">No tire positions recorded for this unit.</p>
                )}
              </section>
            </div>

            <section className="panel">
              <h2>Tire details</h2>
              <table>
                <thead>
                  <tr>
                    <th>Field</th>
                    <th className="r">Value</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td className="vd">Tire size</td><td className="r num">{truck.tire_size || '—'}</td></tr>
                  <tr><td className="vd">Tire brand</td><td className="r num">{truck.tire_brand || '—'}</td></tr>
                  <tr><td className="vd">Tire model</td><td className="r num">{truck.tire_model || '—'}</td></tr>
                  <tr><td className="vd">Number of tires</td><td className="r num">{truck.number_of_tires != null ? truck.number_of_tires : '—'}</td></tr>
                  <tr><td className="vd">Last rotation</td><td className="r num">{fmt(truck.last_tire_rotation_date)}</td></tr>
                </tbody>
              </table>
            </section>
          </>
        ) : null}
      </main>

      {truck && mileageOpen && (
        <MileageLogModal
          truckId={truck._id}
          truckLabel={unitLabel}
          isOpen={true}
          onClose={() => setMileageOpen(false)}
          onSaved={() => setMileageOpen(false)}
        />
      )}
    </AppShell>
  )
}
