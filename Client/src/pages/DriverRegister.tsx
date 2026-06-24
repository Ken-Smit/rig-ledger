import { useState, useEffect, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { lookupInvite } from '../api/invites'
import type { InviteLookup } from '../types/invite'
import { useAuth } from '../auth/AuthProvider'

type LookupState =
  | { kind: 'loading' }
  | { kind: 'ok'; data: InviteLookup }
  | { kind: 'invalid' }

export default function DriverRegister() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const { loginAsDriver } = useAuth()

  const [lookup, setLookup] = useState<LookupState>({ kind: 'loading' })
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')

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
    if (password !== passwordConfirm) {
      setError('Passwords do not match.')
      return
    }
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
    <div className="authwrap">
      <div className="authcard">
        <div className="brand">
          <span className="mark">⬡</span>
          <span className="word">
            Rig<span className="cy">Ledger</span>
          </span>
        </div>

        <section className="panel">
          {lookup.kind === 'loading' && (
            <>
              <h1>Verifying Invite</h1>
              <div className="sub">Checking your invite link, one moment.</div>
            </>
          )}

          {lookup.kind === 'invalid' && (
            <>
              <h1>Invite Not Valid</h1>
              <div className="sub">
                This invite is invalid or has expired.
              </div>
              <button
                type="button"
                className="btn primary"
                onClick={() => navigate('/home')}
              >
                Back to Home
              </button>
            </>
          )}

          {lookup.kind === 'ok' && (
            <>
              <h1>Join {lookup.data.fleet_name}</h1>
              <div className="sub">
                You've been invited to join the team. Create your account to
                get started.
              </div>

              {error && <div className="err">{error}</div>}

              <form onSubmit={handleSubmit}>
                <div className="two">
                  <div className="field">
                    <label>First Name</label>
                    <input
                      type="text"
                      value={firstName}
                      onChange={e => setFirstName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="field">
                    <label>Last Name</label>
                    <input
                      type="text"
                      value={lastName}
                      onChange={e => setLastName(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="field">
                  <label>Email</label>
                  <input
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

                <div className="field">
                  <label>Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    minLength={12}
                    required
                  />
                </div>

                <div className="field">
                  <label>Confirm Password</label>
                  <input
                    type="password"
                    value={passwordConfirm}
                    onChange={e => setPasswordConfirm(e.target.value)}
                    minLength={12}
                    required
                  />
                </div>

                <button
                  className="btn primary"
                  type="submit"
                  disabled={submitting}
                >
                  {submitting ? 'Creating Account...' : 'Create Account'}
                </button>
              </form>

              <div className="foot">Must be at least 12 characters.</div>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
