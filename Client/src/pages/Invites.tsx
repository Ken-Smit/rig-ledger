import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { listInvites, createInvite, deleteInvite } from '../api/invites'
import type { Invite, InviteCreateResponse } from '../types/invite'
import Navbar from '../components/Navbar'
import { useAuth } from '../auth/AuthProvider'

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function statusOf(inv: Invite): 'Consumed' | 'Pending' {
  return inv.consumed_at ? 'Consumed' : 'Pending'
}

export default function Invites() {
  const navigate = useNavigate()
  const { logout } = useAuth()

  const [invites, setInvites] = useState<Invite[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [emailInput, setEmailInput] = useState('')
  const [creating, setCreating] = useState(false)

  // Holding the freshly minted invite separately keeps the one-time token
  // visible until the owner explicitly dismisses it. It is never refetched.
  const [fresh, setFresh] = useState<InviteCreateResponse | null>(null)
  const [copyMsg, setCopyMsg] = useState('')

  const fetchInvites = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await listInvites()
      setInvites(data)
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response
        ?.status
      if (status === 401) navigate('/login')
      else setError('Failed to load invites.')
    } finally {
      setLoading(false)
    }
  }, [navigate])

  useEffect(() => {
    void fetchInvites()
  }, [fetchInvites])

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const shareUrl = (token: string): string =>
    `${window.location.origin}/register/driver/${token}`

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreating(true)
    setError('')
    setCopyMsg('')
    try {
      const trimmed = emailInput.trim()
      const created = await createInvite(trimmed === '' ? undefined : trimmed)
      setFresh(created)
      setEmailInput('')
      await fetchInvites()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })
        ?.response?.data?.error
      setError(msg ?? 'Failed to create invite.')
    } finally {
      setCreating(false)
    }
  }

  const handleCopy = async () => {
    if (!fresh) return
    try {
      await navigator.clipboard.writeText(shareUrl(fresh.token))
      setCopyMsg('Link copied to clipboard.')
    } catch {
      setCopyMsg('Copy failed — select and copy the link manually.')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Revoke this invite?')) return
    try {
      await deleteInvite(id)
      setInvites(prev => prev.filter(i => i._id !== id))
    } catch {
      setError('Failed to revoke invite.')
    }
  }

  return (
    <div className="dashboard-page">
      <Navbar onLogout={handleLogout} />

      <main className="dashboard-main">
        <div className="fleet-header">
          <div>
            <h2 className="section-title">Team Invites</h2>
            <p className="section-sub">
              Send drivers a one-time link to join your fleet.
            </p>
          </div>
        </div>

        {error && <div className="alert-error">{error}</div>}

        <div className="db-panel">
          <div className="db-panel-title">Create Invite</div>
          <form
            className="modal-form"
            onSubmit={handleCreate}
            style={{ paddingTop: 8 }}
          >
            <div className="field-group">
              <label className="field-label">Driver Email (Optional)</label>
              <input
                className="field-input"
                type="email"
                value={emailInput}
                onChange={e => setEmailInput(e.target.value)}
                placeholder="driver@example.com"
              />
              <small className="field-hint">
                If provided, only this email can consume the invite.
              </small>
            </div>

            <div className="modal-actions">
              <button
                type="submit"
                className="btn-primary"
                disabled={creating}
              >
                {creating ? 'Creating...' : 'Create Invite'}
              </button>
            </div>
          </form>

          {fresh && (
            <div className="alert-error" style={{ marginTop: 16 }}>
              <strong>Save this link now — it won't be shown again.</strong>
              <div style={{ marginTop: 8, wordBreak: 'break-all' }}>
                {shareUrl(fresh.token)}
              </div>
              <div className="modal-actions" style={{ marginTop: 12 }}>
                <button
                  type="button"
                  className="btn-ghost btn-sm"
                  onClick={() => {
                    setFresh(null)
                    setCopyMsg('')
                  }}
                >
                  Dismiss
                </button>
                <button
                  type="button"
                  className="btn-primary btn-sm"
                  onClick={handleCopy}
                >
                  Copy Link
                </button>
              </div>
              {copyMsg && (
                <p className="text-dim" style={{ marginTop: 8 }}>
                  {copyMsg}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="db-panel">
          <div className="db-panel-title">All Invites</div>

          {loading ? (
            <div className="loading-state">
              <div className="loading-spinner" />
              <p>Loading...</p>
            </div>
          ) : invites.length === 0 ? (
            <p className="text-dim" style={{ padding: '16px 0', fontSize: 12 }}>
              No invites yet.
            </p>
          ) : (
            <table className="db-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Expires</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {invites.map(inv => (
                  <tr key={inv._id}>
                    <td>{inv.email ?? 'No email'}</td>
                    <td>{fmtDateTime(inv.expires_at)}</td>
                    <td
                      className={
                        statusOf(inv) === 'Consumed' ? 'text-green' : 'text-amber'
                      }
                    >
                      {statusOf(inv)}
                    </td>
                    <td className="db-col-right">
                      <button
                        className="btn-danger btn-sm"
                        onClick={() => handleDelete(inv._id)}
                      >
                        ✕ Revoke
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </div>
  )
}
