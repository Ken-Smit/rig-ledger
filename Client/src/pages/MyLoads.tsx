import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { getMyLoads, transitionLoad } from '../api/loads'
import { getTrucks } from '../api/trucks'
import type { DriverLoad } from '../types/load'
import {
  LOAD_STATUS_COMPLETE,
  LOAD_STATUS_IN_PROGRESS,
  LOAD_STATUS_PENDING,
} from '../types/load'
import type { Truck } from '../types/truck'
import Navbar from '../components/Navbar'
import LoadCard from '../components/LoadCard'
import { useAuth } from '../auth/AuthProvider'

// browserTz returns the IANA timezone the user is currently in. Sent on the
// /loads/mine query so the server buckets "today" in the local clock, not UTC.
function browserTz(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

// MyLoads is the driver-facing page. Sectioned by status so the driver's eye
// lands first on the load currently in progress, then today's queue, then
// upcoming, then recently completed.
export default function MyLoads() {
  const navigate = useNavigate()
  const { logout, user } = useAuth()

  const [loads, setLoads] = useState<DriverLoad[]>([])
  const [trucks, setTrucks] = useState<Truck[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [transitioningId, setTransitioningId] = useState<string | null>(null)

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const fetchLoads = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [ls, ts] = await Promise.all([
        getMyLoads({ tz: browserTz() }),
        getTrucks(),
      ])
      setLoads(ls)
      setTrucks(ts)
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 401) navigate('/login')
      else setError('Failed to load your work')
    } finally {
      setLoading(false)
    }
  }, [navigate])

  useEffect(() => {
    void fetchLoads()
  }, [fetchLoads])

  const truckLabelFor = useCallback(
    (truckId: string | undefined) => {
      if (!truckId) return undefined
      const t = trucks.find((t) => t._id === truckId)
      return t ? (t.unit_number ?? `UNIT-${t._id.slice(-4).toUpperCase()}`) : undefined
    },
    [trucks],
  )

  // handleTransition runs a one-tap state-machine advance with a confirm
  // dialog (forgives accidental taps with gloves on at a fuel pump). On 409
  // (server rejected the transition because the load moved out from under
  // the local view), refetch so the card reflects truth.
  const handleTransition = async (
    load: DriverLoad,
    next: 'in_progress' | 'complete',
  ) => {
    const verb = next === 'in_progress' ? 'Start this load now?' : 'Mark this load complete?'
    if (!confirm(verb)) return
    setTransitioningId(load._id)
    try {
      const updated = (await transitionLoad(load._id, next)) as DriverLoad
      setLoads((prev) => prev.map((l) => (l._id === load._id ? updated : l)))
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 409) {
        setError('This load was changed elsewhere. Refreshing.')
        void fetchLoads()
      } else {
        setError('Could not update the load. Try again.')
      }
    } finally {
      setTransitioningId(null)
    }
  }

  // Bucket the loads into the four display sections.
  const sections = useMemo(() => {
    const inProgress: DriverLoad[] = []
    const todayPending: DriverLoad[] = []
    const upcomingPending: DriverLoad[] = []
    const completed: DriverLoad[] = []

    const now = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000)

    const completeCutoff = new Date()
    completeCutoff.setDate(completeCutoff.getDate() - 7)

    for (const l of loads) {
      if (l.status === LOAD_STATUS_IN_PROGRESS) {
        inProgress.push(l)
      } else if (l.status === LOAD_STATUS_PENDING) {
        const pickup = new Date(l.scheduled_pickup_at)
        if (pickup < endOfToday) {
          todayPending.push(l)
        } else {
          upcomingPending.push(l)
        }
      } else if (l.status === LOAD_STATUS_COMPLETE) {
        const stamp = l.completed_at ? new Date(l.completed_at) : null
        if (stamp && stamp >= completeCutoff) {
          completed.push(l)
        }
      }
    }

    todayPending.sort(
      (a, b) =>
        new Date(a.scheduled_pickup_at).getTime() -
        new Date(b.scheduled_pickup_at).getTime(),
    )
    upcomingPending.sort(
      (a, b) =>
        new Date(a.scheduled_pickup_at).getTime() -
        new Date(b.scheduled_pickup_at).getTime(),
    )
    completed.sort((a, b) => {
      const ta = a.completed_at ? new Date(a.completed_at).getTime() : 0
      const tb = b.completed_at ? new Date(b.completed_at).getTime() : 0
      return tb - ta
    })

    return { inProgress, todayPending, upcomingPending, completed }
  }, [loads])

  const renderActions = (l: DriverLoad) => {
    const busy = transitioningId === l._id
    if (l.status === LOAD_STATUS_PENDING) {
      return (
        <button
          className="btn-primary btn-sm"
          disabled={busy}
          onClick={() => handleTransition(l, 'in_progress')}
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
          onClick={() => handleTransition(l, 'complete')}
        >
          {busy ? 'Saving...' : 'Mark Complete'}
        </button>
      )
    }
    return null
  }

  const greeting = user ? `Welcome, ${user.first_name}` : 'Welcome'
  const todayDisplay = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  const renderSection = (title: string, list: DriverLoad[], emptyHint: string) => (
    <div style={{ marginBottom: 28 }}>
      <h3 className="section-title" style={{ fontSize: 14, marginBottom: 8 }}>
        {title}{' '}
        <span className="text-dim" style={{ fontSize: 12 }}>
          ({list.length})
        </span>
      </h3>
      {list.length === 0 ? (
        <p className="text-dim" style={{ fontSize: 12 }}>
          {emptyHint}
        </p>
      ) : (
        <div className="truck-grid">
          {list.map((l) => (
            <LoadCard
              key={l._id}
              load={l}
              truckLabel={truckLabelFor(l.truck_id)}
              actions={renderActions(l)}
            />
          ))}
        </div>
      )}
    </div>
  )

  return (
    <div className="dashboard-page">
      <Navbar onLogout={handleLogout} />

      <main className="dashboard-main">
        <div className="fleet-header">
          <div>
            <h2 className="section-title">My Loads</h2>
            <p className="section-sub">
              {todayDisplay} — {greeting}
            </p>
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
            {renderSection(
              'In Progress',
              sections.inProgress,
              'Nothing in progress right now.',
            )}
            {renderSection(
              'Today',
              sections.todayPending,
              'No pickups scheduled for today.',
            )}
            {renderSection(
              'Upcoming',
              sections.upcomingPending,
              'No upcoming work.',
            )}
            {renderSection(
              'Completed (last 7 days)',
              sections.completed,
              'No recently completed loads.',
            )}
          </>
        )}
      </main>
    </div>
  )
}
