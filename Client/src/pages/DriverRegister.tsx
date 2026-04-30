import { useState, useEffect, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { lookupInvite } from '../api/invites'
import type { InviteLookup } from '../types/invite'
import { useAuth } from '../auth/AuthProvider'
import { useTheme } from '../hooks/useTheme'

type LookupState =
  | { kind: 'loading' }
  | { kind: 'ok'; data: InviteLookup }
  | { kind: 'invalid' }

export default function DriverRegister() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const { theme, toggle } = useTheme()
  const { loginAsDriver } = useAuth()

  const [lookup, setLookup] = useState<LookupState>({ kind: 'loading' })
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  useEffect(() => {
    if (!token) {
      setLookup({ kind: 'invalid' })
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const data = await lookupInvite(token)
        if (cancelled) return
        setLookup({ kind: 'ok', data })
        if (data.email) setEmail(data.email)
      } catch {
        if (cancelled) return
        setLookup({ kind: 'invalid' })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [token])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!token) return
    setError('')
    setSubmitting(true)
    try {
      await loginAsDriver({
        token,
        first_name: firstName,
        last_name: lastName,
        email,
        password,
      })
      navigate('/')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })
        ?.response?.data?.error
      setError(msg ?? 'Could not create your account. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="login-page">
      <div
        style={{
          position: 'absolute',
          top: '1.5rem',
          right: '1.5rem',
          display: 'flex',
          gap: '0.5rem',
        }}
      >
        <button
          className="btn-ghost btn-sm"
          onClick={() => navigate('/home')}
          title="Back to Home"
        >
          ⬡ Home
        </button>
        <button
          className="btn-ghost btn-sm nav-theme-toggle"
          onClick={toggle}
          title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        >
          {theme === 'dark' ? '☀' : '☾'}
        </button>
      </div>

      <div className="login-card">
        <div className="login-bracket-tl" />
        <div className="login-bracket-br" />

        <div className="login-header">
          <div className="login-logo-mark">⬡</div>
          <h1 className="login-logo-title">Rig Ledger</h1>
          <p className="login-logo-sub">Driver onboarding</p>
        </div>

        {lookup.kind === 'loading' && (
          <div className="loading-state">
            <div className="loading-spinner" />
            <p>Verifying your invite...</p>
          </div>
        )}

        {lookup.kind === 'invalid' && (
          <>
            <div className="login-error">
              This invite is invalid or has expired.
            </div>
            <div className="modal-actions" style={{ marginTop: 16 }}>
              <button
                type="button"
                className="btn-primary"
                onClick={() => navigate('/home')}
              >
                Back to Home
              </button>
            </div>
          </>
        )}

        {lookup.kind === 'ok' && (
          <>
            <p
              className="section-sub"
              style={{ textAlign: 'center', marginBottom: 16 }}
            >
              You've been invited to join {lookup.data.fleet_name}.
            </p>

            <form onSubmit={handleSubmit} className="login-form">
              <div className="login-field-row">
                <div className="field-group">
                  <label className="field-label">First Name</label>
                  <input
                    className="field-input"
                    type="text"
                    value={firstName}
                    onChange={e => setFirstName(e.target.value)}
                    required
                  />
                </div>
                <div className="field-group">
                  <label className="field-label">Last Name</label>
                  <input
                    className="field-input"
                    type="text"
                    value={lastName}
                    onChange={e => setLastName(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="field-group">
                <label className="field-label">Email</label>
                <input
                  className="field-input"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  // If the owner pre-bound the invite to an email, the
                  // server will reject mismatches. Keeping the field
                  // editable preserves UX for invites issued without an
                  // email constraint.
                />
              </div>

              <div className="field-group">
                <label className="field-label">Password</label>
                <input
                  className="field-input"
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  minLength={12}
                  required
                />
                <small className="field-hint">
                  Must be at least 12 characters.
                </small>
              </div>

              {error && <div className="login-error">{error}</div>}

              <button
                className="btn-primary login-submit"
                type="submit"
                disabled={submitting}
              >
                {submitting ? 'Creating Account...' : 'Create Account'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
