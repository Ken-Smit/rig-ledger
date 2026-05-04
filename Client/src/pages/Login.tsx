import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { register } from '../api/auth'
import { useAuth } from '../auth/AuthProvider'
import { useTheme } from '../hooks/useTheme'

type Tab = 'login' | 'register'

export default function Login() {
  const navigate = useNavigate()
  const { theme, toggle } = useTheme()
  const { login } = useAuth()
  const [tab, setTab] = useState<Tab>('login')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

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
  }

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
      // Auth state is now derived from the AuthProvider, not localStorage.
      navigate('/')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      setError(msg ?? 'Authentication failed')
    } finally {
      setLoading(false)
    }
  }

  const handleRegister = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
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
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      setError(msg ?? 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div style={{ position: 'absolute', top: '1.5rem', right: '1.5rem', display: 'flex', gap: '0.5rem' }}>
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
          <p className="login-logo-sub">Fleet Management v1.0</p>
        </div>

        <div className="login-tabs">
          <button
            className={`login-tab ${tab === 'login' ? 'active' : ''}`}
            onClick={() => switchTab('login')}
          >
            Sign In
          </button>
          <button
            className={`login-tab ${tab === 'register' ? 'active' : ''}`}
            onClick={() => switchTab('register')}
          >
            Register
          </button>
        </div>

        {tab === 'login' ? (
          <form onSubmit={handleLogin} className="login-form">
            <div className="field-group">
              <label className="field-label">Email</label>
              <input
                className="field-input"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="operator@fleet.sys"
                required
              />
            </div>

            <div className="field-group">
              <label className="field-label">Password</label>
              <input
                className="field-input"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>

            {error && <div className="login-error">{error}</div>}

            <button className="btn-primary login-submit" type="submit" disabled={loading}>
              {loading ? 'Signing In...' : 'Sign In'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleRegister} className="login-form">
            <div className="login-field-row">
              <div className="field-group">
                <label className="field-label">First Name</label>
                <input
                  className="field-input"
                  type="text"
                  value={firstName}
                  onChange={e => setFirstName(e.target.value)}
                  placeholder="John"
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
                  placeholder="Doe"
                  required
                />
              </div>
            </div>

            <div className="field-group">
              <label className="field-label">Email</label>
              <input
                className="field-input"
                type="email"
                value={regEmail}
                onChange={e => setRegEmail(e.target.value)}
                placeholder="operator@fleet.sys"
                required
              />
            </div>

            <div className="field-group">
              <label className="field-label">Password</label>
              <input
                className="field-input"
                type="password"
                value={regPassword}
                onChange={e => setRegPassword(e.target.value)}
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
                value={regPasswordConfirm}
                onChange={e => setRegPasswordConfirm(e.target.value)}
                placeholder="••••••••"
                minLength={12}
                required
              />
            </div>

            {error && <div className="login-error">{error}</div>}

            <button className="btn-primary login-submit" type="submit" disabled={loading}>
              {loading ? 'Creating Account...' : 'Create Account'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
