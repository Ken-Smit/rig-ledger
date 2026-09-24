import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { listInvites, createInvite, deleteInvite } from '../api/invites'
import type { Invite, InviteCreateResponse } from '../types/invite'
import { AppShell } from '../components/AppShell'

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
    <AppShell>
      <main>
        <div className="pagehead">
          <div>
            <div className="kicker">Drivers</div>
            <h1>Invites</h1>
            <div className="sub">
              Send drivers a one-time link to join your fleet.
            </div>
          </div>
        </div>

        {error && <div className="alert-error">{error}</div>}

        <section className="panel">
          <h2>Create Invite</h2>
          <form onSubmit={handleCreate}>
            <div className="field">
              <label htmlFor="invite-email">Driver Email (Optional)</label>
              <input
                id="invite-email"
                type="email"
                value={emailInput}
                onChange={e => setEmailInput(e.target.value)}
                placeholder="driver@example.com"
              />
              <small className="field-hint">
                If provided, only this email can consume the invite.
              </small>
            </div>

            <div className="actions" style={{ display: 'flex' }}>
              <button type="submit" className="btn" disabled={creating}>
                {creating ? 'Creating...' : 'Create Invite'}
              </button>
            </div>
          </form>

          {fresh && (
            <div className="alert-error" style={{ marginTop: 16 }}>
              <strong>Save this link now — it won't be shown again.</strong>
              <div className="field" style={{ marginTop: 12 }}>
                <div className="ctrl">
                  <code
                    style={{
                      flex: 1,
                      minWidth: 0,
                      padding: '11px 8px',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 13,
                      wordBreak: 'break-all',
                    }}
                  >
                    {shareUrl(fresh.token)}
                  </code>
                </div>
              </div>
              <div
                className="actions"
                style={{ display: 'flex', gap: 10, marginTop: 12 }}
              >
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => {
                    setFresh(null)
                    setCopyMsg('')
                  }}
                >
                  Dismiss
                </button>
                <button type="button" className="btn" onClick={handleCopy}>
                  Copy Link
                </button>
              </div>
              {copyMsg && (
                <p className="sub" style={{ marginTop: 8 }}>
                  {copyMsg}
                </p>
              )}
            </div>
          )}
        </section>

        <section className="panel">
          <h2>
            All Invites
            <span className="note num">
              {invites.length} invite{invites.length !== 1 ? 's' : ''}
            </span>
          </h2>

          {loading ? (
            <div className="loading-state">
              <div className="loading-spinner" />
              <p>Loading...</p>
            </div>
          ) : invites.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">⬡</div>
              <p>No invites yet</p>
              <p className="text-dim">
                Create your first invite to give a driver a one-time join link
              </p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Created</th>
                  <th>Expires</th>
                  <th className="r">Status</th>
                  <th className="r">Actions</th>
                </tr>
              </thead>
              <tbody>
                {invites.map(inv => {
                  const status = statusOf(inv)
                  return (
                    <tr key={inv._id}>
                      <td>{inv.email ?? 'No email'}</td>
                      <td className="num">{fmtDateTime(inv.created_at)}</td>
                      <td className="num">{fmtDateTime(inv.expires_at)}</td>
                      <td className="r">
                        <span
                          className={status === 'Consumed' ? 'chip ok' : 'chip warn'}
                        >
                          {status}
                        </span>
                      </td>
                      <td className="r">
                        <button
                          className="btn-danger btn-sm"
                          onClick={() => handleDelete(inv._id)}
                        >
                          Revoke
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </section>
      </main>
    </AppShell>
  )
}
