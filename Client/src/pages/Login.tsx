import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { register, resendVerification } from '../api/auth'
import { useAuth } from '../auth/AuthProvider'

type Tab = 'login' | 'register'

export default function Login() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [tab, setTab] = useState<Tab>('login')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [loading, setLoading] = useState(false)

  // Tracks the "email not verified" login failure so we can offer a resend.
  const [unverified, setUnverified] = useState(false)
  const [resending, setResending] = useState(false)

  // Login fields
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  // Register fields
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [regEmail, setRegEmail] = useState('')
  const [regPassword, setRegPassword] = useState('')
  const [regPasswordConfirm, setRegPasswordConfirm] = useState('')

  const switchTab = (t: Tab) => {
    setTab(t)
    setError('')
    setInfo('')
    setUnverified(false)
  }

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setInfo('')
    setUnverified(false)
    setLoading(true)
    try {
      await login(email, password)
      // Auth state is now derived from the AuthProvider, not localStorage.
      navigate('/')
    } catch (err: unknown) {
      const data = (
        err as { response?: { data?: { error?: string; code?: string } } }
      )?.response?.data
      if (data?.code === 'email_unverified') {
        setUnverified(true)
      }
      setError(data?.error ?? 'Authentication failed')
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    setError('')
    setInfo('')
    setResending(true)
    try {
      const res = await resendVerification(email)
      setUnverified(false)
      setInfo(res.message)
    } catch {
      setError('Could not resend the verification email. Please try again.')
    } finally {
      setResending(false)
    }
  }

  const handleRegister = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setInfo('')
    if (regPassword !== regPasswordConfirm) {
      setError('Passwords do not match.')
      return
    }
    setLoading(true)
    try {
      await register({
        first_name: firstName,
        last_name: lastName,
        email: regEmail,
        password: regPassword,
      })
      setTab('login')
      setEmail(regEmail)
      setInfo('Check your email to verify your account.')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      setError(msg ?? 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="authwrap">
      <div className="authcard">
        <Link to="/home" className="authback">← Back to home</Link>
        <div className="brand">
          <span className="mark">⬡</span>
          <span className="word">
            Rig<span className="cy">Ledger</span>
          </span>
        </div>

        <section className="panel">
          <h1>{tab === 'login' ? 'Sign in' : 'Create account'}</h1>
          <div className="sub">
            {tab === 'login'
              ? 'Welcome back. Enter your details to access your fleet.'
              : 'Set up your account to start tracking your fleet.'}
          </div>

          <div className="authtabs">
            <button
              type="button"
              className={tab === 'login' ? 'on' : ''}
              onClick={() => switchTab('login')}
            >
              Sign in
            </button>
            <button
              type="button"
              className={tab === 'register' ? 'on' : ''}
              onClick={() => switchTab('register')}
            >
              Create account
            </button>
          </div>

          {error && <div className="err">{error}</div>}
          {info && <div className="ok">{info}</div>}

          {tab === 'login' ? (
            <form onSubmit={handleLogin}>
              <div className="field">
                <label>Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="operator@fleet.sys"
                  required
                />
              </div>

              <div className="field">
                <label>Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </div>

              {unverified && (
                <button
                  type="button"
                  className="btn ghost"
                  onClick={handleResend}
                  disabled={resending}
                >
                  {resending ? 'Sending...' : 'Resend Verification Email'}
                </button>
              )}

              <button className="btn primary" type="submit" disabled={loading}>
                {loading ? 'Signing In...' : 'Sign In'}
              </button>

              <div className="foot">
                <Link to="/forgot-password">Forgot password?</Link>
              </div>
            </form>
          ) : (
            <form onSubmit={handleRegister}>
              <div className="two">
                <div className="field">
                  <label>First Name</label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={e => setFirstName(e.target.value)}
                    placeholder="John"
                    required
                  />
                </div>
                <div className="field">
                  <label>Last Name</label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={e => setLastName(e.target.value)}
                    placeholder="Doe"
                    required
                  />
                </div>
              </div>

              <div className="field">
                <label>Email</label>
                <input
                  type="email"
                  value={regEmail}
                  onChange={e => setRegEmail(e.target.value)}
                  placeholder="operator@fleet.sys"
                  required
                />
              </div>

              <div className="field">
                <label>Password</label>
                <input
                  type="password"
                  value={regPassword}
                  onChange={e => setRegPassword(e.target.value)}
                  placeholder="••••••••"
                  minLength={12}
                  required
                />
              </div>

              <div className="field">
                <label>Confirm Password</label>
                <input
                  type="password"
                  value={regPasswordConfirm}
                  onChange={e => setRegPasswordConfirm(e.target.value)}
                  placeholder="••••••••"
                  minLength={12}
                  required
                />
              </div>

              <button className="btn primary" type="submit" disabled={loading}>
                {loading ? 'Creating Account...' : 'Create Account'}
              </button>

              <div className="foot">Password must be at least 12 characters.</div>
            </form>
          )}
        </section>
      </div>
    </div>
  )
}
