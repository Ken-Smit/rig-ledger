import { useNavigate } from 'react-router-dom'
import { useTheme } from '../hooks/useTheme'
import { useAuth } from '../auth/AuthProvider'

const features = [
  {
    icon: '⬡',
    title: 'Fleet Registry',
    desc: 'Track every unit in your fleet — year, make, model, VIN, tire positions, and maintenance schedules all in one place.',
  },
  {
    icon: '◈',
    title: 'Expense Analytics',
    desc: 'Monitor fuel costs, maintenance spend, and load income with interactive charts and real-time summary cards.',
  },
  {
    icon: '◇',
    title: 'Maintenance Alerts',
    desc: 'Never miss a service interval. Get automatic warnings for oil changes, brake inspections, and annual inspections.',
  },
  {
    icon: '⬢',
    title: 'Per-Unit Breakdown',
    desc: 'Drill into individual trucks to see detailed maintenance history, tire data, and cost breakdowns.',
  },
]

export default function Home() {
  const navigate = useNavigate()
  const { theme, toggle } = useTheme()
  const { status } = useAuth()
  const loggedIn = status === 'authed'

  return (
    <div className="home-page">
      {/* Nav */}
      <nav className="home-nav">
        <div className="nav-logo">
          <span className="nav-logo-mark">⬡</span>
          <span className="nav-logo-text">Rig<span className="cyan">Ledger</span></span>
        </div>
        <div className="home-nav-right">
          <button
            className="btn-ghost btn-sm nav-theme-toggle"
            onClick={toggle}
            title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {theme === 'dark' ? '☀' : '☾'}
          </button>
          {loggedIn ? (
            <button className="btn-primary" onClick={() => navigate('/')}>
              Open Dashboard
            </button>
          ) : (
            <>
              <button className="btn-ghost" onClick={() => navigate('/login')}>
                Sign In
              </button>
              <button className="btn-primary" onClick={() => navigate('/login')}>
                Get Started
              </button>
            </>
          )}
        </div>
      </nav>

      {/* Hero */}
      <section className="home-hero">
        <div className="home-hero-content">
          <p className="home-hero-tag">Fleet Management v1.0</p>
          <h1 className="home-hero-title">
            Command Your<br />
            <span className="text-cyan">Entire Fleet</span>
          </h1>
          <p className="home-hero-sub">
            Track expenses, monitor maintenance schedules, and analyze fleet
            performance — all from a single command center.
          </p>
          <div className="home-hero-actions">
            <button className="btn-primary home-hero-cta" onClick={() => navigate('/login')}>
              {loggedIn ? 'Open Dashboard' : 'Get Started'}
            </button>
            <a href="#features" className="btn-ghost home-hero-cta">
              View Features
            </a>
          </div>
        </div>

        <div className="home-hero-visual">
          <div className="home-preview-frame">
            <div className="home-preview-bar">
              <span className="home-preview-dot" />
              <span className="home-preview-dot" />
              <span className="home-preview-dot" />
              <span className="home-preview-title">Expense & Income Overview</span>
            </div>
            <img
              src="/dashboard-preview.jpg"
              alt="RigLedger expense analytics dashboard showing charting and expense tracking"
              className="home-preview-img"
            />
          </div>
        </div>
      </section>

      {/* Stats bar */}
      <section className="home-stats-bar">
        <div className="home-stat">
          <span className="home-stat-value">24/7</span>
          <span className="home-stat-label">Monitoring</span>
        </div>
        <div className="home-stat-divider" />
        <div className="home-stat">
          <span className="home-stat-value">100%</span>
          <span className="home-stat-label">Uptime</span>
        </div>
        <div className="home-stat-divider" />
        <div className="home-stat">
          <span className="home-stat-value">∞</span>
          <span className="home-stat-label">Units</span>
        </div>
        <div className="home-stat-divider" />
        <div className="home-stat">
          <span className="home-stat-value">Free</span>
          <span className="home-stat-label">To Start</span>
        </div>
      </section>

      {/* Features */}
      <section className="home-features" id="features">
        <h2 className="home-section-title">System Capabilities</h2>
        <p className="home-section-sub">Everything you need to manage your fleet operations</p>
        <div className="home-features-grid">
          {features.map(f => (
            <div key={f.title} className="home-feature-card">
              <div className="home-feature-icon">{f.icon}</div>
              <h3 className="home-feature-title">{f.title}</h3>
              <p className="home-feature-desc">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="home-cta-section">
        <div className="home-cta-card">
          <div className="home-bracket-tl" />
          <div className="home-bracket-br" />
          <h2 className="home-cta-title">Ready to Take Command?</h2>
          <p className="home-cta-sub">
            Create your free account and start managing your fleet in minutes.
          </p>
          <button className="btn-primary home-hero-cta" onClick={() => navigate('/login')}>
            {loggedIn ? 'Open Dashboard' : 'Get Started'}
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="home-footer">
        <span className="nav-logo-mark" style={{ fontSize: 16 }}>⬡</span>
        <span className="home-footer-text">Rig Ledger</span>
      </footer>
    </div>
  )
}
