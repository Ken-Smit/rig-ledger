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
    <div className="authwrap">
      <div className="authcard">
        <div className="brand">
          <span className="mark">⬡</span>
          <span className="word">
            Rig<span className="cy">Ledger</span>
          </span>
        </div>

        <section className="panel">
          <h1>Reset Password</h1>
          <div className="sub">
            {submitted
              ? 'Check your inbox for the next step.'
              : 'Enter the email on your account and we will send a reset link.'}
          </div>

          {submitted ? (
            <>
              <div className="ok">{message}</div>
              <div className="foot">
                <Link to="/login">Back to sign in</Link>
              </div>
            </>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="field">
                <label>Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="operator@fleet.sys"
                  required
                />
              </div>

              {error && <div className="err">{error}</div>}

              <button className="btn primary" type="submit" disabled={loading}>
                {loading ? 'Sending...' : 'Send Reset Link'}
              </button>

              <div className="foot">
                <Link to="/login">Back to sign in</Link>
              </div>
            </form>
          )}
        </section>
      </div>
    </div>
  )
}
