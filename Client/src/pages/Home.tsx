import type { CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTheme } from '../hooks/useTheme'
import { useAuth } from '../auth/AuthProvider'
import { PLAN_TIERS } from '../types/billing'

interface Feature {
  kicker: string
  title: string
  desc: string
}

const features: Feature[] = [
  {
    kicker: 'Registry',
    title: 'Fleet Registry',
    desc: 'Track every unit in your fleet — year, make, model, VIN, tire positions, and maintenance schedules all in one place.',
  },
  {
    kicker: 'Analytics',
    title: 'Expense Analytics',
    desc: 'Monitor fuel costs, maintenance spend, and load income with interactive charts and real-time summary cards.',
  },
  {
    kicker: 'Alerts',
    title: 'Maintenance Alerts',
    desc: 'Never miss a service interval. Get automatic warnings for oil changes, brake inspections, and annual inspections.',
  },
  {
    kicker: 'Per Unit',
    title: 'Per-Unit Breakdown',
    desc: 'Drill into individual trucks to see detailed maintenance history, tire data, and cost breakdowns.',
  },
]

// Layout-only styles. Visual language (color, type, radius) comes from the
// shared "Agentic Navy" tokens + classes in index.css; this file only
// positions a public marketing page that has no AppShell to inherit from.
const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: 'var(--bg)',
    color: 'var(--fg-2)',
    fontFamily: 'var(--font-body)',
    display: 'flex',
    flexDirection: 'column',
  },
  topbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 24px',
    borderBottom: '1px solid var(--border)',
    position: 'sticky',
    top: 0,
    zIndex: 40,
    background: 'var(--bg-2)',
  },
  topActions: { display: 'flex', alignItems: 'center', gap: 10 },
  linkBtn: {
    background: 'none',
    border: '1px solid var(--border)',
    borderRadius: 9,
    color: 'var(--fg)',
    font: '600 13px var(--font-body)',
    padding: '9px 14px',
    cursor: 'pointer',
  },
  ctaBtn: {
    background: 'var(--accent)',
    border: 0,
    borderRadius: 9,
    color: 'var(--accent-on)',
    font: '600 13px var(--font-body)',
    padding: '9px 16px',
    cursor: 'pointer',
  },
  main: { flex: 1, width: '100%', maxWidth: 1080, margin: '0 auto', padding: '56px 24px 72px' },
  hero: { maxWidth: 660, marginBottom: 40 },
  heroTitle: { fontSize: 44, lineHeight: 1.08, letterSpacing: '-0.03em', color: 'var(--fg)', marginBottom: 16 },
  heroSub: { fontSize: 16.5, lineHeight: 1.6, color: 'var(--muted)', marginBottom: 26 },
  heroActions: { display: 'flex', flexWrap: 'wrap', gap: 12 },
  heroBtn: { width: 'auto', margin: 0, padding: '13px 26px', textDecoration: 'none' },
  strip: { marginBottom: 40 },
  features: { marginBottom: 40 },
  sectionKicker: { marginBottom: 9 },
  sectionTitle: { fontSize: 26, letterSpacing: '-0.025em', color: 'var(--fg)', marginBottom: 22 },
  card: { marginBottom: 0 },
  cardTitle: { fontSize: 16, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--fg)', margin: '4px 0 8px' },
  cardDesc: { fontSize: 14, lineHeight: 1.6, color: 'var(--muted)' },
  cta: { textAlign: 'center', marginBottom: 0 },
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 12,
    padding: '22px 24px',
    borderTop: '1px solid var(--border)',
  },
  footerText: { fontSize: 13, color: 'var(--muted)' },
}

export default function Home() {
  const navigate = useNavigate()
  const { theme, toggle } = useTheme()
  const { status } = useAuth()
  const loggedIn = status === 'authed'
  const primaryLabel = loggedIn ? 'Open Dashboard' : 'Get Started'

  const Brand = (
    <div className="brand" style={{ padding: 0 }}>
      <span className="mark">⬡</span>
      <span className="word">
        Rig<span className="cy">Ledger</span>
      </span>
    </div>
  )

  return (
    <div style={styles.page}>
      {/* Top bar */}
      <header style={styles.topbar}>
        {Brand}
        <div style={styles.topActions}>
          <button
            style={styles.linkBtn}
            onClick={toggle}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? '☀' : '☾'}
          </button>
          <a href="#pricing" style={styles.linkBtn}>Pricing</a>
          {loggedIn ? (
            <button style={styles.ctaBtn} onClick={() => navigate('/')}>
              Open Dashboard
            </button>
          ) : (
            <>
              <button style={styles.linkBtn} onClick={() => navigate('/login')}>
                Sign In
              </button>
              <button style={styles.ctaBtn} onClick={() => navigate('/login')}>
                Get Started
              </button>
            </>
          )}
        </div>
      </header>

      <main style={styles.main}>
        {/* Hero */}
        <section style={styles.hero}>
          <p className="kicker">Fleet Management</p>
          <h1 style={styles.heroTitle}>Command your entire fleet</h1>
          <p style={styles.heroSub}>
            Track expenses, monitor maintenance schedules, and analyze fleet
            performance — all from a single command center.
          </p>
          <div style={styles.heroActions}>
            <button
              className="btn primary"
              style={styles.heroBtn}
              onClick={() => navigate('/login')}
            >
              {primaryLabel}
            </button>
            <button
              className="btn ghost"
              style={styles.heroBtn}
              onClick={() => navigate('/demo')}
            >
              Try the Demo
            </button>
            <a href="#features" className="btn ghost" style={styles.heroBtn}>
              View Features
            </a>
          </div>
        </section>

        {/* Stats */}
        <section className="strip" style={styles.strip}>
          <div className="c">
            <div className="k">Monitoring</div>
            <div className="v">24/7</div>
          </div>
          <div className="c">
            <div className="k">Uptime</div>
            <div className="v">100%</div>
          </div>
          <div className="c">
            <div className="k">Units</div>
            <div className="v">∞</div>
          </div>
        </section>

        {/* Features */}
        <section id="features" style={styles.features}>
          <p className="kicker" style={styles.sectionKicker}>System Capabilities</p>
          <h2 style={styles.sectionTitle}>Everything you need to manage your fleet</h2>
          <div className="home-grid">
            {features.map(f => (
              <section key={f.title} className="panel" style={styles.card}>
                <p className="kicker">{f.kicker}</p>
                <h3 style={styles.cardTitle}>{f.title}</h3>
                <p style={styles.cardDesc}>{f.desc}</p>
              </section>
            ))}
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" style={styles.features}>
          <p className="kicker" style={styles.sectionKicker}>Pricing</p>
          <h2 style={styles.sectionTitle}>Simple plans that scale with your fleet</h2>
          <div className="home-grid">
            {PLAN_TIERS.map(p => (
              <section key={p.key} className="panel" style={styles.card}>
                <p className="kicker">{p.trucks}</p>
                <h3 style={styles.cardTitle}>{p.label}</h3>
                <div className="num" style={{ fontSize: 26, fontWeight: 700, color: 'var(--fg)', margin: '2px 0 6px' }}>
                  {p.price}<span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 400 }}> /mo</span>
                </div>
                <p style={{ ...styles.cardDesc, minHeight: 40 }}>{p.blurb}</p>
                <button
                  className="btn primary"
                  style={{ width: '100%', margin: '10px 0 0' }}
                  onClick={() => navigate('/login')}
                >
                  {loggedIn ? 'Choose Plan' : 'Start Free Trial'}
                </button>
              </section>
            ))}
          </div>
          <p style={{ ...styles.cardDesc, marginTop: 16, textAlign: 'center' }}>
            Every plan starts with a 7-day free trial — no charge today, cancel anytime. AI receipt scanning included on every plan.
          </p>
        </section>

        {/* CTA */}
        <section className="panel" style={styles.cta}>
          <p className="kicker">Get Started</p>
          <h2 style={styles.sectionTitle}>Ready to take command?</h2>
          <p style={styles.cardDesc}>
            Create your free account and start managing your fleet in minutes.
          </p>
          <div style={{ ...styles.heroActions, justifyContent: 'center', marginTop: 20 }}>
            <button
              className="btn primary"
              style={styles.heroBtn}
              onClick={() => navigate('/login')}
            >
              {primaryLabel}
            </button>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer style={styles.footer}>
        {Brand}
        <span style={styles.footerText}>Built for owner-operators and small fleets.</span>
      </footer>
    </div>
  )
}
