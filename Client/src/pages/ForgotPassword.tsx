import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { forgotPassword } from '../api/auth'

// ForgotPassword collects an email and requests a reset link. The server always
// responds generically, so the UI shows the same confirmation whether or not
// the email is registered — no account-enumeration signal leaks to the user.
export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await forgotPassword(email)
      setMessage(res.message)
      setSubmitted(true)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })
        ?.response?.data?.error
      setError(msg ?? 'Something went wrong. Please try again.')
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
          <p className="login-logo-sub">Reset Password</p>
        </div>

        {submitted ? (
          <>
            <p style={{ textAlign: 'center' }}>{message}</p>
            <Link to="/login" className="btn-primary login-submit">
              Back to Sign In
            </Link>
          </>
        ) : (
          <form onSubmit={handleSubmit} className="login-form">
            <div className="field-group">
              <label className="field-label">Email</label>
              <input
                className="field-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="operator@fleet.sys"
                required
              />
              <small className="field-hint">
                Enter the email on your account and we'll send a reset link.
              </small>
            </div>

            {error && <div className="login-error">{error}</div>}

            <button
              className="btn-primary login-submit"
              type="submit"
              disabled={loading}
            >
              {loading ? 'Sending...' : 'Send Reset Link'}
            </button>

            <Link to="/login" className="btn-ghost login-submit">
              Back to Sign In
            </Link>
          </form>
        )}
      </div>
    </div>
  )
}
