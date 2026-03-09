import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { login, register } from '../api/auth'
import { useTheme } from '../hooks/useTheme'

type Tab = 'login' | 'register'

export default function Login() {
  const navigate = useNavigate()
  const { theme, toggle } = useTheme()
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
      localStorage.setItem('logged_in', 'true')
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
          title="Back to home"
        >
          ⬡ HOME
        </button>
        <button
          className="btn-ghost btn-sm nav-theme-toggle"
          onClick={toggle}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? '☀' : '☾'}
        </button>
      </div>
      <div className="login-card">
        <div className="login-bracket-tl" />
        <div className="login-bracket-br" />

        <div className="login-header">
          <div className="login-logo-mark">⬡</div>
          <h1 className="login-logo-title">RIG LEDGER</h1>
          <p className="login-logo-sub">COMMAND SYSTEM v1.0</p>
        </div>

        <div className="login-tabs">
          <button
            className={`login-tab ${tab === 'login' ? 'active' : ''}`}
            onClick={() => switchTab('login')}
          >
            SIGN IN
          </button>
          <button
            className={`login-tab ${tab === 'register' ? 'active' : ''}`}
            onClick={() => switchTab('register')}
          >
            REGISTER
          </button>
        </div>

        {tab === 'login' ? (
          <form onSubmit={handleLogin} className="login-form">
            <div className="field-group">
              <label className="field-label">OPERATOR ID (EMAIL)</label>
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
              <label className="field-label">ACCESS KEY</label>
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
              {loading ? 'AUTHENTICATING...' : 'INITIALIZE SESSION'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleRegister} className="login-form">
            <div className="login-field-row">
              <div className="field-group">
                <label className="field-label">FIRST NAME</label>
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
                <label className="field-label">LAST NAME</label>
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
              <label className="field-label">OPERATOR ID (EMAIL)</label>
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
              <label className="field-label">ACCESS KEY (MIN 6 CHARS)</label>
              <input
                className="field-input"
                type="password"
                value={regPassword}
                onChange={e => setRegPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>

            {error && <div className="login-error">{error}</div>}

            <button className="btn-primary login-submit" type="submit" disabled={loading}>
              {loading ? 'REGISTERING...' : 'CREATE OPERATOR PROFILE'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
