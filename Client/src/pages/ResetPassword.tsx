import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { resetPassword } from '../api/auth'

// ResetPassword consumes the token from the emailed reset link and sets a new
// password. The min-12 policy and confirm-match check mirror the register form.
// Public route — the reset token is the only credential.
export default function ResetPassword() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')

    if (!token) {
      setError('This reset link is invalid or has expired.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    try {
      await resetPassword(token, password)
      // Sessions are invalidated server-side; send the user to sign in fresh.
      navigate('/login')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })
        ?.response?.data?.error
      setError(msg ?? 'This reset link is invalid or has expired.')
    } finally {
      setLoading(false)
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
          <h1>Set New Password</h1>
          <div className="sub">
            Choose a new password to finish resetting your account.
          </div>

          <form onSubmit={handleSubmit}>
            <div className="field">
              <label>New Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                minLength={12}
                required
              />
            </div>

            <div className="field">
              <label>Confirm Password</label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••"
                minLength={12}
                required
              />
            </div>

            {error && <div className="err">{error}</div>}

            <button className="btn primary" type="submit" disabled={loading}>
              {loading ? 'Resetting...' : 'Reset Password'}
            </button>

            <div className="foot">
              Password must be at least 12 characters.
            </div>
            <div className="foot">
              <Link to="/login">Back to sign in</Link>
            </div>
          </form>
        </section>
      </div>
    </div>
  )
}
