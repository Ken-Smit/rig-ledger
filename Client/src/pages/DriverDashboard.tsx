import { useState, useEffect, useMemo, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { getTrucks } from '../api/trucks'
import { getMileageLogs } from '../api/mileage'
import { getMyLoads, transitionLoad } from '../api/loads'
import type { Truck } from '../types/truck'
import type { MileageLog } from '../types/mileage'
import type { DriverLoad } from '../types/load'
import { LOAD_STATUS_IN_PROGRESS, LOAD_STATUS_PENDING } from '../types/load'
import { AppShell } from '../components/AppShell'
import LoadCard from '../components/LoadCard'
import { MileageLogModal } from '../components/MileageLogModal'
import { useAuth } from '../auth/AuthProvider'

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

function browserTz(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

export default function DriverDashboard() {
  const { user } = useAuth()
  const [trucks, setTrucks] = useState<Truck[]>([])
  const [logs, setLogs] = useState<MileageLog[]>([])
  const [todaysLoads, setTodaysLoads] = useState<DriverLoad[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modalTruck, setModalTruck] = useState<Truck | null>(null)
  const [transitioningId, setTransitioningId] = useState<string | null>(null)

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
      // Today's loads is its own panel — driver lands here and sees what
      // work is on for the day before scrolling to the mileage tools.
      const myLoads = await getMyLoads({ tz: browserTz() })
      setTodaysLoads(myLoads)
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

  // handleLoadTransition advances the state machine on a single load and
  // reconciles the local view with the server's authoritative response.
  const handleLoadTransition = useCallback(
    async (load: DriverLoad, next: 'in_progress' | 'complete') => {
      const verb = next === 'in_progress' ? 'Start this load now?' : 'Mark this load complete?'
      if (!confirm(verb)) return
      setTransitioningId(load._id)
      try {
        const updated = (await transitionLoad(load._id, next)) as DriverLoad
        setTodaysLoads(prev => prev.map(l => (l._id === load._id ? updated : l)))
      } catch (err: unknown) {
        const status = (err as { response?: { status?: number } })?.response?.status
        if (status === 409) {
          setError('That load was changed elsewhere. Refreshing.')
          void loadAll()
        } else {
          setError('Could not update the load. Try again.')
        }
      } finally {
        setTransitioningId(null)
      }
    },
    [loadAll],
  )

  const todaysActiveLoads = useMemo(() => {
    const now = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000)
    return todaysLoads
      .filter(l => {
        if (l.status === LOAD_STATUS_IN_PROGRESS) return true
        if (l.status === LOAD_STATUS_PENDING) {
          const pickup = new Date(l.scheduled_pickup_at)
          return pickup < endOfToday
        }
        return false
      })
      .sort((a, b) => {
        if (a.status === LOAD_STATUS_IN_PROGRESS && b.status !== LOAD_STATUS_IN_PROGRESS) return -1
        if (b.status === LOAD_STATUS_IN_PROGRESS && a.status !== LOAD_STATUS_IN_PROGRESS) return 1
        return new Date(a.scheduled_pickup_at).getTime() - new Date(b.scheduled_pickup_at).getTime()
      })
  }, [todaysLoads])

  const renderLoadActions = (l: DriverLoad) => {
    const busy = transitioningId === l._id
    if (l.status === LOAD_STATUS_PENDING) {
      return (
        <button
          className="btn-primary btn-sm"
          disabled={busy}
          onClick={() => handleLoadTransition(l, 'in_progress')}
        >
          {busy ? 'Starting...' : 'Start Pickup'}
        </button>
      )
    }
    if (l.status === LOAD_STATUS_IN_PROGRESS) {
      return (
        <button
          className="btn-primary btn-sm"
          disabled={busy}
          onClick={() => handleLoadTransition(l, 'complete')}
        >
          {busy ? 'Saving...' : 'Mark Complete'}
        </button>
      )
    }
    return null
  }

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

  // Recent activity = last 7 days of THIS driver's own mileage logs, newest
  // first. Co-driver entries belong on the owner dashboard, not here.
  const recent = useMemo(() => {
    const cutoff = new Date()
    cutoff.setHours(0, 0, 0, 0)
    cutoff.setDate(cutoff.getDate() - 6)
    const myID = user?.user_id
    return [...logs]
      .filter(l => l.driver_id === myID && parseLocal(l.date) >= cutoff)
      .sort((a, b) => b.date.localeCompare(a.date))
  }, [logs, user])

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

  // todaysTruck summarizes which rig the driver is in today. Picks the truck
  // on the first sorted load (in-progress wins, then earliest pickup). When
  // multiple loads use distinct trucks, append "+N" so the driver sees there
  // is a swap coming.
  const todaysTruck = useMemo(() => {
    const withTrucks = todaysActiveLoads.filter(l => l.truck_id)
    if (withTrucks.length === 0) return null
    const primary = withTrucks[0].truck_id as string
    const distinct = new Set(withTrucks.map(l => l.truck_id as string))
    return {
      label: truckLabel(primary),
      extra: distinct.size > 1 ? distinct.size - 1 : 0,
    }
  }, [todaysActiveLoads, truckLabel])

  // mostRecentLog is this driver's newest mileage entry — surfaced in the
  // "your truck" band so the latest reading is the first thing they see.
  const mostRecentLog = useMemo(() => recent[0], [recent])

  // bandUnit names the rig for the band: today's assigned truck wins,
  // otherwise fall back to the truck on the latest mileage log.
  const bandUnit = useMemo(() => {
    if (todaysTruck) return todaysTruck.label
    if (mostRecentLog) return truckLabel(mostRecentLog.truck_id)
    return null
  }, [todaysTruck, mostRecentLog, truckLabel])

  const greeting = user ? `Welcome, ${user.first_name}` : 'Welcome'
  const todayDisplay = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })

  return (
    <AppShell>
      <main>
        <div className="pagehead">
          <div>
            <div className="kicker">Driver</div>
            <h1>Today on the road</h1>
            <div className="sub">{todayDisplay} — {greeting}</div>
          </div>
          <div className="headside">
            <span className="scope">{todayDisplay}</span>
            <Link to="/my-loads" className="btn-ghost btn-sm">View All Loads</Link>
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
            <div className="mystrip">
              <span className="tag">
                Your truck · {bandUnit ?? 'Unassigned'}
              </span>
              <div className="m">
                <div className="k">Today's truck</div>
                <div className="v">{todaysTruck ? todaysTruck.label : '—'}</div>
              </div>
              <div className="m">
                <div className="k">Today's loads</div>
                <div className="v">{String(todaysActiveLoads.length).padStart(2, '0')}</div>
              </div>
              <div className="m">
                <div className="k">Last logged</div>
                <div className="v">{mostRecentLog ? fmt(mostRecentLog.date) : '—'}</div>
              </div>
              <div className="m">
                <div className="k">Latest odometer</div>
                <div className="v">
                  {mostRecentLog?.end_mileage != null
                    ? mostRecentLog.end_mileage.toLocaleString()
                    : '—'}
                </div>
              </div>
            </div>

            <div className="kpis">
              <div className="kpi hero-k">
                <div className="k">Today's loads</div>
                <div className="v num">{String(todaysActiveLoads.length).padStart(2, '0')}</div>
                <div className="d num">Scheduled or in progress</div>
              </div>
              <div className="kpi">
                <div className="k">Units in fleet</div>
                <div className="v num">{trucks.length}</div>
                <div className="d num" style={{ color: 'var(--muted)' }}>On record</div>
              </div>
              <div className="kpi">
                <div className="k">Logs this week</div>
                <div className="v num">{recent.length}</div>
                <div className="d num" style={{ color: 'var(--muted)' }}>Last 7 days</div>
              </div>
              <div className="kpi">
                <div className="k">Today's truck</div>
                <div className="v num">{todaysTruck ? todaysTruck.label : '—'}</div>
                <div className="d num" style={{ color: 'var(--muted)' }}>
                  {todaysTruck
                    ? todaysTruck.extra > 0
                      ? `+${todaysTruck.extra} other unit${todaysTruck.extra > 1 ? 's' : ''} today`
                      : 'Assigned for today'
                    : 'No truck assigned'}
                </div>
              </div>
            </div>

            <section className="panel">
              <h2>
                Today's Work
                <span className="note">{todaysActiveLoads.length} active</span>
              </h2>
              {todaysActiveLoads.length === 0 ? (
                <p className="text-dim" style={{ fontSize: 13 }}>
                  No loads scheduled for today.
                </p>
              ) : (
                <div className="truck-grid">
                  {todaysActiveLoads.map(l => (
                    <LoadCard
                      key={l._id}
                      load={l}
                      truckLabel={truckLabel(l.truck_id ?? '')}
                      actions={renderLoadActions(l)}
                    />
                  ))}
                </div>
              )}
            </section>

            <div className="grid2">
              <section className="panel">
                <h2>Units</h2>
                {trucks.length === 0 ? (
                  <p className="text-dim" style={{ fontSize: 13 }}>
                    No units registered.
                  </p>
                ) : (
                  trucks.map(t => {
                    const last = lastLoggedFor(t._id)
                    return (
                      <div className="svc" key={t._id}>
                        <div className="row1">
                          <div className="nm">
                            {unitLabelFor(t)}
                            <small>
                              {last ? `Last logged ${fmt(last.date)}` : 'No logs yet'}
                            </small>
                          </div>
                          <button
                            className="btn-primary btn-sm"
                            onClick={() => setModalTruck(t)}
                          >
                            Log Mileage
                          </button>
                        </div>
                      </div>
                    )
                  })
                )}
              </section>

              <section className="panel">
                <h2>
                  Recent Activity
                  <span className="note">Last 7 days</span>
                </h2>
                {recent.length === 0 ? (
                  <p className="text-dim" style={{ fontSize: 13 }}>
                    No mileage logs in the last seven days.
                  </p>
                ) : (
                  recent.map(l => (
                    <div className="maint-row" key={l._id}>
                      <span className="dot ok" />
                      <span className="lbl">
                        {fmt(l.date)} · {truckLabel(l.truck_id)}
                      </span>
                      <span className="mi">
                        {l.start_mileage != null
                          ? l.start_mileage.toLocaleString()
                          : '—'}
                        {' → '}
                        {l.end_mileage != null
                          ? l.end_mileage.toLocaleString()
                          : '—'}
                      </span>
                    </div>
                  ))
                )}
              </section>
            </div>
          </>
        )}
      </main>

      {modalTruck && (
        <MileageLogModal
          truckId={modalTruck._id}
          truckLabel={unitLabelFor(modalTruck)}
          isOpen={true}
          onClose={() => setModalTruck(null)}
          onSaved={handleSaved}
        />
      )}
    </AppShell>
  )
}
