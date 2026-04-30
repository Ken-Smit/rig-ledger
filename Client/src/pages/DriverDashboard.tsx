import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { getTrucks } from '../api/trucks'
import { getMileageLogs } from '../api/mileage'
import type { Truck } from '../types/truck'
import type { MileageLog } from '../types/mileage'
import Navbar from '../components/Navbar'
import { MileageLogModal } from '../components/MileageLogModal'
import { useAuth } from '../auth/AuthProvider'

// todayLocal mirrors the modal's helper so the "Today's Logs" stat counts
// against the user's local date, not UTC.
function todayLocal(): string {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function parseLocal(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function fmt(d: string) {
  return parseLocal(d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

function unitLabelFor(t: Truck): string {
  return t.unit_number ?? `UNIT-${t._id.slice(-4).toUpperCase()}`
}

// driverTail trims a driver_id ObjectID hex down to the last 6 chars so the
// activity panel has a stable, readable identifier without an extra
// per-driver lookup roundtrip.
function driverTail(id: string): string {
  return id.slice(-6).toUpperCase()
}

export default function DriverDashboard() {
  const navigate = useNavigate()
  const { logout, user } = useAuth()
  const [trucks, setTrucks] = useState<Truck[]>([])
  const [logs, setLogs] = useState<MileageLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modalTruck, setModalTruck] = useState<Truck | null>(null)

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  // loadAll fetches trucks first, then mileage logs per truck. Drivers see
  // every truck in their fleet, so this is fleet-wide by virtue of the
  // server-side fleet filter on /trucks.
  const loadAll = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const t = await getTrucks()
      setTrucks(t)
      // Per-truck fan-out is acceptable for the 1–50 truck target. If
      // fleets ever grow beyond that, replace with a fleet-scoped logs
      // endpoint.
      const lists = await Promise.all(t.map(tr => getMileageLogs(tr._id)))
      setLogs(lists.flat())
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response
        ?.status
      if (status === 401) setError('Session expired — please log in again.')
      else setError('Failed to load fleet data.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  // After a save, splice the new log into local state and replace any prior
  // log on the same (truck_id, date) key — the server upserts, so the
  // client must too.
  const handleSaved = useCallback((saved: MileageLog) => {
    setLogs(prev => {
      const without = prev.filter(
        l => !(l.truck_id === saved.truck_id && l.date === saved.date),
      )
      return [saved, ...without]
    })
  }, [])

  const today = todayLocal()
  const todaysLogCount = useMemo(
    () => logs.filter(l => l.date === today).length,
    [logs, today],
  )

  // Recent activity = last 7 days, newest first.
  const recent = useMemo(() => {
    const cutoff = new Date()
    cutoff.setHours(0, 0, 0, 0)
    cutoff.setDate(cutoff.getDate() - 6)
    return [...logs]
      .filter(l => parseLocal(l.date) >= cutoff)
      .sort((a, b) => b.date.localeCompare(a.date))
  }, [logs])

  const truckLabel = useCallback(
    (id: string) => {
      const t = trucks.find(t => t._id === id)
      return t ? unitLabelFor(t) : id
    },
    [trucks],
  )

  // lastLoggedFor returns the latest log per truck so the truck row can
  // surface "last logged on …" without a second query.
  const lastLoggedFor = useCallback(
    (truckId: string): MileageLog | undefined => {
      return logs
        .filter(l => l.truck_id === truckId)
        .sort((a, b) => b.date.localeCompare(a.date))[0]
    },
    [logs],
  )

  const greeting = user ? `Welcome, ${user.first_name}` : 'Welcome'
  const todayDisplay = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })

  return (
    <>
      <div className="dashboard-page">
        <Navbar onLogout={handleLogout} />

        <main className="dashboard-main">
          <div className="fleet-header">
            <div>
              <h2 className="section-title">Driver Dashboard</h2>
              <p className="section-sub">{todayDisplay} — {greeting}</p>
            </div>
          </div>

          {error && <div className="alert-error">{error}</div>}

          {loading ? (
            <div className="loading-state">
              <div className="loading-spinner" />
              <p>Loading...</p>
            </div>
          ) : (
            <>
              <div className="stats-row db-stats-row">
                <div className="stat-card">
                  <div className="stat-label">Total Fleet</div>
                  <div className="stat-value">
                    {String(trucks.length).padStart(2, '0')}
                  </div>
                  <div className="stat-sub">Registered Units</div>
                </div>

                <div className="stat-card">
                  <div className="stat-label">Today's Logs</div>
                  <div className="stat-value text-cyan">
                    {String(todaysLogCount).padStart(2, '0')}
                  </div>
                  <div className="stat-sub">Mileage Entries Today</div>
                </div>
              </div>

              <div className="db-columns">
                <div className="db-panel">
                  <div className="db-panel-title">Units</div>
                  {trucks.length === 0 ? (
                    <p
                      className="text-dim"
                      style={{ padding: '16px 0', fontSize: 12 }}
                    >
                      No units registered.
                    </p>
                  ) : (
                    <div className="db-activity">
                      {trucks.map(t => {
                        const last = lastLoggedFor(t._id)
                        return (
                          <div key={t._id} className="db-activity-row">
                            <span className="db-act-unit">
                              {unitLabelFor(t)}
                            </span>
                            <span className="db-act-date text-dim">
                              {last ? `Last logged ${fmt(last.date)}` : 'No logs yet'}
                            </span>
                            <span style={{ marginLeft: 'auto' }}>
                              <button
                                className="btn-primary btn-sm"
                                onClick={() => setModalTruck(t)}
                              >
                                Log Mileage
                              </button>
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                <div className="db-panel">
                  <div className="db-panel-title">
                    Recent Activity <span className="text-dim">— Last 7 Days</span>
                  </div>
                  {recent.length === 0 ? (
                    <p
                      className="text-dim"
                      style={{ padding: '16px 0', fontSize: 12 }}
                    >
                      No mileage logs in the last seven days.
                    </p>
                  ) : (
                    <div className="db-activity">
                      {recent.map(l => (
                        <div key={l._id} className="db-activity-row">
                          <span className="db-act-date">{fmt(l.date)}</span>
                          <span className="db-act-unit">
                            {truckLabel(l.truck_id)}
                          </span>
                          <span className="text-dim">
                            Driver {driverTail(l.driver_id)}
                          </span>
                          <span className="db-act-amount text-cyan">
                            {l.start_mileage != null
                              ? `${l.start_mileage.toLocaleString()}`
                              : '—'}
                            {' → '}
                            {l.end_mileage != null
                              ? `${l.end_mileage.toLocaleString()}`
                              : '—'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </main>
      </div>

      {modalTruck && (
        <MileageLogModal
          truckId={modalTruck._id}
          truckLabel={unitLabelFor(modalTruck)}
          isOpen={true}
          onClose={() => setModalTruck(null)}
          onSaved={handleSaved}
        />
      )}
    </>
  )
}
