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
    <div className="login-page">
      <div className="login-card">
        <div className="login-bracket-tl" />
        <div className="login-bracket-br" />

        <div className="login-header">
          <div className="login-logo-mark">⬡</div>
          <h1 className="login-logo-title">Rig Ledger</h1>
          <p className="login-logo-sub">Set New Password</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="field-group">
            <label className="field-label">New Password</label>
            <input
              className="field-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              minLength={12}
              required
            />
            <small className="field-hint">Must be at least 12 characters.</small>
          </div>

          <div className="field-group">
            <label className="field-label">Confirm Password</label>
            <input
              className="field-input"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="••••••••"
              minLength={12}
              required
            />
          </div>

          {error && <div className="login-error">{error}</div>}

          <button
            className="btn-primary login-submit"
            type="submit"
            disabled={loading}
          >
            {loading ? 'Resetting...' : 'Reset Password'}
          </button>

          <Link to="/login" className="btn-ghost login-submit">
            Back to Sign In
          </Link>
        </form>
      </div>
    </div>
  )
}
