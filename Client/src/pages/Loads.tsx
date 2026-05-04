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
} from '../types/load'
import type { Truck } from '../types/truck'
import Navbar from '../components/Navbar'
import LoadCard from '../components/LoadCard'
import LoadFormModal from '../components/LoadFormModal'
import { useAuth } from '../auth/AuthProvider'

const STATUS_FILTERS: { value: '' | LoadStatus; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'complete', label: 'Complete' },
]

// Loads is the owner-facing page: list + filter + CRUD. Drivers are routed to
// MyLoads instead via App.tsx role gating.
export default function Loads() {
  const navigate = useNavigate()
  const { logout, user } = useAuth()

  const [loads, setLoads] = useState<Load[]>([])
  const [drivers, setDrivers] = useState<FleetDriver[]>([])
  const [trucks, setTrucks] = useState<Truck[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [statusFilter, setStatusFilter] = useState<'' | LoadStatus>('')
  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState<Load | null>(null)

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

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
    <>
      <div className="dashboard-page">
        <Navbar onLogout={handleLogout} />

        <main className="dashboard-main">
          <div className="fleet-header">
            <div>
              <h2 className="section-title">Loads</h2>
              <p className="section-sub">
                {loads.length} load{loads.length !== 1 ? 's' : ''}
              </p>
            </div>
            <button
              className="btn-primary"
              onClick={() => setShowAdd(true)}
            >
              + New Load
            </button>
          </div>

          <div
            className="modal-row"
            style={{ marginBottom: 16, maxWidth: 480 }}
          >
            <div className="field-group" style={{ flex: 1 }}>
              <label className="field-label">Status</label>
              <select
                className="field-select"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as '' | LoadStatus)}
              >
                {STATUS_FILTERS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
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
              <div key={dateLabel} style={{ marginBottom: 24 }}>
                <h3 className="section-title" style={{ fontSize: 14, marginBottom: 8 }}>
                  {dateLabel}
                </h3>
                <div className="truck-grid">
                  {list.map((l) => (
                    <LoadCard
                      key={l._id}
                      load={l}
                      driverLabel={driverLabelFor(l.driver_id)}
                      truckLabel={truckLabelFor(l.truck_id)}
                      actions={
                        <>
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
                        </>
                      }
                    />
                  ))}
                </div>
              </div>
            ))
          )}
        </main>
      </div>

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
    </>
  )
}
