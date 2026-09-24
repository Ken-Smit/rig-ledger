import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getHosLogs, getHosStatus, recordDutyStatus } from '../api/hos'
import {
  DUTY_STATUSES,
  DUTY_STATUS_LABEL,
  formatMinutes,
} from '../types/hos'
import type { DutyStatus, DutyStatusLog, HosStatus } from '../types/hos'
import { AppShell } from '../components/AppShell'

// Static legal fallback shown until the server's disclaimer arrives (and if it
// is ever blank). Rig Ledger is NOT a certified ELD — surfacing this is a
// liability requirement, not a nicety.
const STATIC_DISCLAIMER =
  'Not a certified ELD — for planning and personal records only.'

// Number of recent duty-status changes to show in the log list.
const RECENT_LOG_LIMIT = 15

// Below this many minutes a clock is "low" and rendered with the danger color
// so a driver sees at a glance they are about to run out of a budget.
const LOW_CLOCK_THRESHOLD_MIN = 30

// clockClass picks the value color for a clock card: danger when at/near zero,
// positive when there is comfortable headroom, neutral (accent) in between.
function clockClass(min: number): string {
  if (min <= LOW_CLOCK_THRESHOLD_MIN) return 'v neg'
  return 'v pos'
}

// Hours is the FMCSA Hours of Service screen, available to BOTH owners and
// drivers. Drivers log duty-status changes and read their compliance clocks;
// this is the primary phone-first surface in the app, so it stays lean.
export default function Hours() {
  const navigate = useNavigate()
  const [status, setStatus] = useState<HosStatus | null>(null)
  const [logs, setLogs] = useState<DutyStatusLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  // Tracks which status button is mid-request so we can disable the row and
  // avoid a double-submit on a flaky mobile connection.
  const [saving, setSaving] = useState(false)

  // load fetches the status + recent logs in parallel. Reused after every
  // duty-status change so the clocks and log list stay coherent.
  const load = useCallback(async () => {
    try {
      const [s, l] = await Promise.all([getHosStatus(), getHosLogs()])
      setStatus(s)
      setLogs(l)
      setError('')
    } catch (err: unknown) {
      const code = (err as { response?: { status?: number } })?.response?.status
      if (code === 401) navigate('/login')
      else setError('Failed to load Hours of Service data')
    } finally {
      setLoading(false)
    }
  }, [navigate])

  useEffect(() => {
    void load()
  }, [load])

  // handleSwitch records a new duty status then refetches. We refetch rather
  // than optimistically patch because the server recomputes every clock and
  // any violations off the new status — a local guess could show a driver an
  // unsafe "can drive" state.
  const handleSwitch = async (next: DutyStatus) => {
    if (saving || status?.current_status === next) return
    setSaving(true)
    try {
      await recordDutyStatus({ status: next })
      await load()
    } catch (err: unknown) {
      const code = (err as { response?: { status?: number } })?.response?.status
      if (code === 401) navigate('/login')
      else setError('Could not record the status change. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const disclaimer = status?.disclaimer?.trim() || STATIC_DISCLAIMER
  const current = status?.current_status ?? ''
  const recent = logs.slice(0, RECENT_LOG_LIMIT)

  return (
    <AppShell>
      <main>
        <div className="pagehead">
          <div>
            <div className="kicker">Compliance</div>
            <h1>Hours of Service</h1>
            <div className="sub">
              Log your duty status and track your driving clocks.
            </div>
          </div>
        </div>

        <div className="hos-disclaimer" role="note">
          {disclaimer}
        </div>

        {error && <div className="alert-error">{error}</div>}

        {loading ? (
          <div className="loading-state">
            <div className="loading-spinner" />
            <p>Loading...</p>
          </div>
        ) : (
          <>
            <section className="panel">
              <h2>
                Current Status
                <span className="note">
                  {current ? DUTY_STATUS_LABEL[current] : 'Not logged'}
                </span>
              </h2>
              <div className="hos-switch">
                {DUTY_STATUSES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={`hos-status-btn${current === s ? ' on' : ''}`}
                    disabled={saving || current === s}
                    onClick={() => handleSwitch(s)}
                  >
                    {DUTY_STATUS_LABEL[s]}
                  </button>
                ))}
              </div>
            </section>

            <div className="kpis exp-kpis">
              <div className="kpi">
                <div className="k">Drive</div>
                <div className={clockClass(status?.clocks.drive_remaining_min ?? 0)}>
                  {formatMinutes(status?.clocks.drive_remaining_min ?? 0)}
                </div>
                <div className="d">of 11h limit</div>
              </div>
              <div className="kpi">
                <div className="k">Window</div>
                <div className={clockClass(status?.clocks.window_remaining_min ?? 0)}>
                  {formatMinutes(status?.clocks.window_remaining_min ?? 0)}
                </div>
                <div className="d">of 14h limit</div>
              </div>
              <div className="kpi">
                <div className="k">Break</div>
                <div className={clockClass(status?.clocks.break_remaining_min ?? 0)}>
                  {formatMinutes(status?.clocks.break_remaining_min ?? 0)}
                </div>
                <div className="d">until 8h break</div>
              </div>
              <div className="kpi">
                <div className="k">Cycle</div>
                <div className={clockClass(status?.clocks.cycle_remaining_min ?? 0)}>
                  {formatMinutes(status?.clocks.cycle_remaining_min ?? 0)}
                </div>
                <div className="d">of 70h limit</div>
              </div>
            </div>

            <div className="hos-candrive">
              <span className="k">Can Drive</span>
              <span className={`chip ${status?.can_drive ? 'ok' : 'bad'}`}>
                {status?.can_drive ? 'Yes' : 'No'}
              </span>
            </div>

            {status && status.violations.length > 0 && (
              <div className="alert-error" role="alert">
                {status.violations.map((v, i) => (
                  <div key={i}>{v}</div>
                ))}
              </div>
            )}

            <section className="panel">
              <h2>Recent Activity</h2>
              {recent.length === 0 ? (
                <p className="text-dim">No duty status logged yet.</p>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Status</th>
                      <th>Location / Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent.map((log) => (
                      <tr key={log._id}>
                        <td className="num">
                          {new Date(log.changed_at).toLocaleString()}
                        </td>
                        <td className="tk">{DUTY_STATUS_LABEL[log.status]}</td>
                        <td className="vd">
                          {[log.location, log.note].filter(Boolean).join(' — ') || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </>
        )}
      </main>
    </AppShell>
  )
}
