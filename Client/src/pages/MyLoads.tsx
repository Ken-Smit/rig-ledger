import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { getMyLoads, transitionLoad } from '../api/loads'
import { getTrucks } from '../api/trucks'
import type { DriverLoad, Stop } from '../types/load'
import {
  LOAD_STATUS_COMPLETE,
  LOAD_STATUS_IN_PROGRESS,
  LOAD_STATUS_PENDING,
} from '../types/load'
import type { Truck } from '../types/truck'
import { AppShell } from '../components/AppShell'
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

// firstOf / lastOf locate the earliest pickup and final dropoff. Stops arrive
// ordered by sequence from the server, so a forward find and a reverse scan are
// reliable. Defensive fallbacks keep cards rendering on partial data.
function firstOf(stops: Stop[], kind: Stop['kind']): Stop | undefined {
  return stops.find((s) => s.kind === kind)
}

function lastOf(stops: Stop[], kind: Stop['kind']): Stop | undefined {
  for (let i = stops.length - 1; i >= 0; i--) {
    if (stops[i].kind === kind) return stops[i]
  }
  return undefined
}

function fmtDateTime(iso: string): string {
  if (!iso) return ''
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

// addressLine collapses the structured stop fields into a single display line.
function addressLine(s: Stop | undefined): string {
  if (!s) return '—'
  return [s.address, s.city, s.state, s.zip].filter(Boolean).join(', ')
}

// mapsHrefFor builds a maps deep link the driver can tap with gloves on at a
// fuel pump. Both Apple and Google resolve the apple.com/?q form to the system
// maps app on iOS and to Google Maps on Android — no brittle UA sniff needed.
function mapsHrefFor(s: Stop): string {
  const q = [s.address, s.city, s.state, s.zip].filter(Boolean).join(', ')
  return `https://maps.apple.com/?q=${encodeURIComponent(q)}`
}

// chipFor maps the load status onto the Open Design chip vocabulary. Driver
// view only ever sees these three states.
function chipFor(status: DriverLoad['status']): { cls: 'ok' | 'warn' | 'bad'; label: string } {
  if (status === LOAD_STATUS_IN_PROGRESS) return { cls: 'warn', label: 'In Progress' }
  if (status === LOAD_STATUS_COMPLETE) return { cls: 'ok', label: 'Complete' }
  return { cls: 'bad', label: 'Pending' }
}

// MyLoads is the driver-facing page. Sectioned by status so the driver's eye
// lands first on the load currently in progress, then today's queue, then
// upcoming, then recently completed. Financials are intentionally absent —
// DriverLoad carries no rate_cents.
export default function MyLoads() {
  const navigate = useNavigate()
  const { user } = useAuth()

  const [loads, setLoads] = useState<DriverLoad[]>([])
  const [trucks, setTrucks] = useState<Truck[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [transitioningId, setTransitioningId] = useState<string | null>(null)

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

  // renderActions advances the one-tap state machine. Pending → Start,
  // in-progress → Complete, complete → nothing.
  const renderActions = (l: DriverLoad) => {
    const busy = transitioningId === l._id
    if (l.status === LOAD_STATUS_PENDING) {
      return (
        <button
          className="btn primary"
          style={{ width: 'auto', margin: 0, padding: '10px 16px', fontSize: 13.5 }}
          disabled={busy}
          onClick={() => handleTransition(l, 'in_progress')}
        >
          {busy ? 'Starting...' : 'Start'}
        </button>
      )
    }
    if (l.status === LOAD_STATUS_IN_PROGRESS) {
      return (
        <button
          className="btn primary"
          style={{ width: 'auto', margin: 0, padding: '10px 16px', fontSize: 13.5 }}
          disabled={busy}
          onClick={() => handleTransition(l, 'complete')}
        >
          {busy ? 'Saving...' : 'Complete'}
        </button>
      )
    }
    return null
  }

  // renderCard draws a single load in the Open Design .truck card idiom.
  const renderCard = (l: DriverLoad) => {
    const pickup = firstOf(l.stops, 'pickup')
    const dropoff = lastOf(l.stops, 'dropoff')
    const extraStops = l.stops.length > 2 ? l.stops.length - 2 : 0
    const truckLabel = truckLabelFor(l.truck_id)
    const chip = chipFor(l.status)
    const actions = renderActions(l)

    return (
      <div className="truck" key={l._id}>
        <div className="top">
          <div className="unit">
            {l.reference_number ? l.reference_number : `LOAD-${l._id.slice(-4).toUpperCase()}`}
            <small>{fmtDateTime(l.scheduled_pickup_at)}</small>
          </div>
          <span className={`chip ${chip.cls}`}>{chip.label}</span>
        </div>

        <div style={{ display: 'grid', gap: 14 }}>
          <div>
            <div className="kicker" style={{ marginBottom: 4 }}>Pickup</div>
            {pickup ? (
              <a
                href={mapsHrefFor(pickup)}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'inherit', textDecoration: 'underline' }}
              >
                {addressLine(pickup)}
              </a>
            ) : (
              <span className="text-dim">—</span>
            )}
            {pickup?.contact_phone && (
              <div style={{ fontSize: 12.5, marginTop: 2 }}>
                <a href={`tel:${pickup.contact_phone}`}>{pickup.contact_phone}</a>
              </div>
            )}
          </div>

          <div>
            <div className="kicker" style={{ marginBottom: 4 }}>Dropoff</div>
            {dropoff ? (
              <a
                href={mapsHrefFor(dropoff)}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'inherit', textDecoration: 'underline' }}
              >
                {addressLine(dropoff)}
              </a>
            ) : (
              <span className="text-dim">—</span>
            )}
            {dropoff?.contact_phone && (
              <div style={{ fontSize: 12.5, marginTop: 2 }}>
                <a href={`tel:${dropoff.contact_phone}`}>{dropoff.contact_phone}</a>
              </div>
            )}
          </div>

          {extraStops > 0 && (
            <div className="text-dim" style={{ fontSize: 12.5 }}>
              + {extraStops} additional stop{extraStops !== 1 ? 's' : ''}
            </div>
          )}

          {truckLabel && (
            <div className="text-dim" style={{ fontSize: 12.5 }}>
              Truck: {truckLabel}
            </div>
          )}

          {l.notes && (
            <div className="text-dim" style={{ fontSize: 12.5, fontStyle: 'italic' }}>
              {l.notes}
            </div>
          )}
        </div>

        {actions && (
          <div className="foot">
            {actions}
          </div>
        )}
      </div>
    )
  }

  const renderSection = (title: string, list: DriverLoad[], emptyHint: string) => (
    <section style={{ marginBottom: 28 }}>
      <div className="kicker">
        {title} ({list.length})
      </div>
      {list.length === 0 ? (
        <p className="text-dim" style={{ fontSize: 13 }}>
          {emptyHint}
        </p>
      ) : (
        <div className="roster">{list.map(renderCard)}</div>
      )}
    </section>
  )

  const greeting = user ? `Welcome, ${user.first_name}` : 'Welcome'
  const todayDisplay = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  return (
    <AppShell>
      <main>
        <div className="pagehead">
          <div>
            <div className="kicker">My Loads</div>
            <h1>{greeting}</h1>
            <div className="sub">{todayDisplay} — your work for today and what's coming up.</div>
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
    </AppShell>
  )
}
