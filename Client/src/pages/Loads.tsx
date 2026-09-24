import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { createLoad, deleteLoad, getLoads, updateLoad } from '../api/loads'
import { getFleetDrivers } from '../api/fleetDrivers'
import { getTrucks } from '../api/trucks'
import type {
  FleetDriver,
  Load,
  LoadCreateData,
  LoadStatus,
  LoadUpdateData,
  Stop,
} from '../types/load'
import type { Truck } from '../types/truck'
import { AppShell } from '../components/AppShell'
import LoadFormModal from '../components/LoadFormModal'
import { useAuth } from '../auth/AuthProvider'

const STATUS_FILTERS: { value: '' | LoadStatus; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'complete', label: 'Complete' },
]

// Visual status vocabulary: pending is in-flight work (warn), in_progress is
// active/good (ok), complete is settled/neutral (plain chip).
const STATUS_CHIP: Record<LoadStatus, string> = {
  pending: 'chip warn',
  in_progress: 'chip ok',
  complete: 'chip',
}

const STATUS_LABEL: Record<LoadStatus, string> = {
  pending: 'Pending',
  in_progress: 'In Progress',
  complete: 'Complete',
}

const usd = (cents: number | undefined): string =>
  cents == null ? '—' : '$' + Math.round(cents / 100).toLocaleString()

const miles = (m: number | undefined): string =>
  m == null ? '—' : m.toLocaleString() + ' mi'

// laneFor renders a stop list as a "first → last" lane summary, falling back to
// the reference number when no stops are present.
const laneFor = (stops: Stop[]): { lane: string; sub: string } => {
  if (stops.length === 0) return { lane: 'No stops', sub: '' }
  const ordered = [...stops].sort((a, b) => a.sequence - b.sequence)
  const fmt = (s: Stop): string => {
    if (s.city && s.state) return `${s.city}, ${s.state}`
    if (s.city) return s.city
    return s.address || s.state || '—'
  }
  const first = ordered[0]
  const last = ordered[ordered.length - 1]
  const lane = ordered.length === 1 ? fmt(first) : `${fmt(first)} → ${fmt(last)}`
  const sub = `${ordered.length} stop${ordered.length !== 1 ? 's' : ''}`
  return { lane, sub }
}

// Loads is the owner-facing page: list + filter + CRUD. Drivers are routed to
// MyLoads instead via App.tsx role gating.
export default function Loads() {
  const navigate = useNavigate()
  const { user } = useAuth()

  const [loads, setLoads] = useState<Load[]>([])
  const [drivers, setDrivers] = useState<FleetDriver[]>([])
  const [trucks, setTrucks] = useState<Truck[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [statusFilter, setStatusFilter] = useState<'' | LoadStatus>('')
  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState<Load | null>(null)

  // loadAll fetches loads + drivers + trucks in parallel. Drivers and trucks
  // populate the assign-driver / truck dropdowns inside the modal.
  const loadAll = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [ls, ds, ts] = await Promise.all([
        getLoads(statusFilter ? { status: statusFilter } : {}),
        getFleetDrivers(),
        getTrucks(),
      ])
      setLoads(ls)
      setDrivers(ds)
      setTrucks(ts)
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 401) navigate('/login')
      else setError('Failed to load this page')
    } finally {
      setLoading(false)
    }
  }, [statusFilter, navigate])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  const driverLabelFor = useCallback(
    (driverId: string) => {
      if (driverId === '') return 'Unassigned'
      if (user && driverId === user.user_id) {
        return `${user.first_name} ${user.last_name} (You)`
      }
      const d = drivers.find((d) => d.user_id === driverId)
      if (d) return `${d.first_name} ${d.last_name}`
      return driverId.slice(-6).toUpperCase()
    },
    [drivers, user],
  )

  const truckLabelFor = useCallback(
    (truckId: string | undefined) => {
      if (!truckId) return undefined
      const t = trucks.find((t) => t._id === truckId)
      return t ? (t.unit_number ?? `UNIT-${t._id.slice(-4).toUpperCase()}`) : undefined
    },
    [trucks],
  )

  const handleCreate = async (data: LoadCreateData) => {
    const created = await createLoad(data)
    setLoads((prev) => [created, ...prev])
  }

  const handleUpdate = async (id: string, data: LoadUpdateData) => {
    await updateLoad(id, data)
    // Refetch the affected load via listing — keeps state coherent without
    // duplicating the driver/truck label resolution.
    void loadAll()
  }

  const handleDelete = async (load: Load) => {
    if (!confirm(`Delete this load? This cannot be undone.`)) return
    try {
      await deleteLoad(load._id)
      setLoads((prev) => prev.filter((l) => l._id !== load._id))
    } catch {
      setError('Failed to delete load')
    }
  }

  // Group loads by scheduled pickup date for an at-a-glance owner view.
  const grouped = useMemo(() => {
    const map = new Map<string, Load[]>()
    for (const l of loads) {
      const d = new Date(l.scheduled_pickup_at)
      const key = d.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
      const list = map.get(key) ?? []
      list.push(l)
      map.set(key, list)
    }
    return Array.from(map.entries())
  }, [loads])

  return (
    <AppShell>
      <main>
        <div className="pagehead">
          <div>
            <div className="kicker">Dispatch</div>
            <h1>Loads</h1>
            <div className="sub">
              {loads.length} load{loads.length !== 1 ? 's' : ''} — assign, leave open, or self-run.
            </div>
          </div>
          <button className="addbtn" onClick={() => setShowAdd(true)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M12 5v14M5 12h14" />
            </svg>
            New load
          </button>
        </div>

        <div className="tabs" style={{ marginBottom: 18 }}>
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              className={statusFilter === f.value ? 'on' : ''}
              onClick={() => setStatusFilter(f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>

        {error && <div className="alert-error">{error}</div>}

        {loading ? (
          <div className="loading-state">
            <div className="loading-spinner" />
            <p>Loading...</p>
          </div>
        ) : loads.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">⬡</div>
            <p>No loads yet</p>
            <p className="text-dim">
              Create your first load — assign a driver, leave it unassigned, or drive it yourself
            </p>
          </div>
        ) : (
          grouped.map(([dateLabel, list]) => (
            <section className="panel" key={dateLabel}>
              <h2>
                {dateLabel}
                <span className="note num">
                  {list.length} load{list.length !== 1 ? 's' : ''}
                </span>
              </h2>
              <table>
                <thead>
                  <tr>
                    <th>Lane</th>
                    <th>Reference</th>
                    <th>Driver</th>
                    <th>Truck</th>
                    <th className="r">Miles</th>
                    <th className="r">Rate</th>
                    <th className="r">Status</th>
                    <th className="r">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((l) => {
                    const { lane, sub } = laneFor(l.stops)
                    const truckLabel = truckLabelFor(l.truck_id)
                    return (
                      <tr key={l._id}>
                        <td className="lane">
                          {lane}
                          {sub && <small>{sub}</small>}
                        </td>
                        <td className="num">{l.reference_number || '—'}</td>
                        <td className="tk">{driverLabelFor(l.driver_id)}</td>
                        <td className="num">{truckLabel ?? '—'}</td>
                        <td className="r num">{miles(l.distance_miles)}</td>
                        <td className="r num">{usd(l.rate_cents)}</td>
                        <td className="r">
                          <span className={STATUS_CHIP[l.status]}>
                            {STATUS_LABEL[l.status]}
                          </span>
                        </td>
                        <td className="r">
                          <button
                            className="btn-ghost btn-sm"
                            onClick={() => setEditing(l)}
                          >
                            Edit
                          </button>
                          <button
                            className="btn-danger btn-sm"
                            onClick={() => handleDelete(l)}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </section>
          ))
        )}
      </main>

      {showAdd && (
        <LoadFormModal
          drivers={drivers}
          trucks={trucks}
          onCreate={handleCreate}
          onClose={() => setShowAdd(false)}
        />
      )}

      {editing && (
        <LoadFormModal
          initial={editing}
          drivers={drivers}
          trucks={trucks}
          onUpdate={handleUpdate}
          onClose={() => setEditing(null)}
        />
      )}
    </AppShell>
  )
}
