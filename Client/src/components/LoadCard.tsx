import type { ReactNode } from 'react'
import type { DriverLoad, Load, Stop } from '../types/load'

interface Props {
  load: Load | DriverLoad
  driverLabel?: string
  truckLabel?: string
  actions?: ReactNode
}

// firstOf finds the earliest stop matching the given kind. Stops are ordered
// by sequence on the server, so [0] for pickup and findLast for dropoff is
// reliable. Defensive fallbacks keep the card rendering even on partial data.
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

// addressLine collapses the structured stop fields into a single line for
// display in the card header.
function addressLine(s: Stop | undefined): string {
  if (!s) return '—'
  const parts = [s.address, s.city, s.state, s.zip].filter(Boolean)
  return parts.join(', ')
}

function statusClassName(status: Load['status']): string {
  if (status === 'in_progress') return 'status-warning'
  if (status === 'complete') return 'status-good'
  return 'status-unknown'
}

function statusLabel(status: Load['status']): string {
  if (status === 'in_progress') return 'In Progress'
  if (status === 'complete') return 'Complete'
  return 'Pending'
}

// mapsHrefFor builds an Apple/Google maps deep link the driver can tap with
// gloves on at a fuel pump. A user-agent sniff would be brittle; both URLs
// resolve in the system maps app on iOS and to Google Maps on Android.
function mapsHrefFor(s: Stop): string {
  const q = [s.address, s.city, s.state, s.zip].filter(Boolean).join(', ')
  return `https://maps.apple.com/?q=${encodeURIComponent(q)}`
}

export default function LoadCard({ load, driverLabel, truckLabel, actions }: Props) {
  const pickup = firstOf(load.stops, 'pickup')
  const dropoff = lastOf(load.stops, 'dropoff')
  const stopCount = load.stops.length
  const extraStops = stopCount > 2 ? stopCount - 2 : 0

  return (
    <div className="truck-card">
      <div className="truck-card-header">
        <div>
          <div className="truck-card-unit">
            {load.reference_number ? load.reference_number : `LOAD-${load._id.slice(-4).toUpperCase()}`}
          </div>
          <div className={`truck-card-status ${statusClassName(load.status)}`}>
            {statusLabel(load.status)}
          </div>
        </div>
        <div className="text-dim" style={{ fontSize: 12, textAlign: 'right' }}>
          {fmtDateTime(load.scheduled_pickup_at)}
        </div>
      </div>

      <div className="truck-card-body" style={{ display: 'grid', gap: 8 }}>
        <div>
          <div className="text-dim" style={{ fontSize: 11 }}>Pickup</div>
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
            <div style={{ fontSize: 12 }}>
              <a href={`tel:${pickup.contact_phone}`}>{pickup.contact_phone}</a>
            </div>
          )}
        </div>

        <div>
          <div className="text-dim" style={{ fontSize: 11 }}>Dropoff</div>
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
            <div style={{ fontSize: 12 }}>
              <a href={`tel:${dropoff.contact_phone}`}>{dropoff.contact_phone}</a>
            </div>
          )}
        </div>

        {extraStops > 0 && (
          <div className="text-dim" style={{ fontSize: 12 }}>
            + {extraStops} additional stop{extraStops !== 1 ? 's' : ''}
          </div>
        )}

        {(driverLabel || truckLabel) && (
          <div
            className="text-dim"
            style={{ fontSize: 12, display: 'flex', gap: 12, flexWrap: 'wrap' }}
          >
            {driverLabel && <span>Driver: {driverLabel}</span>}
            {truckLabel && <span>Truck: {truckLabel}</span>}
          </div>
        )}

        {load.notes && (
          <div className="text-dim" style={{ fontSize: 12, fontStyle: 'italic' }}>
            {load.notes}
          </div>
        )}
      </div>

      {actions && (
        <div
          className="truck-card-actions"
          style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}
        >
          {actions}
        </div>
      )}
    </div>
  )
}
