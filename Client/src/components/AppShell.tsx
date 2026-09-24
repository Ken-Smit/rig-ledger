import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { useTheme } from '../hooks/useTheme'
import { ROLE_OWNER } from '../types/user'

// Inline icon helper — mirrors the Open Design prototype's stroke-icon set so
// the sidebar reads identically to the mockup.
const I = (d: string) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} dangerouslySetInnerHTML={{ __html: d }} />
)

type NavItem = { to: string; label: string; icon: ReactNode; owner?: boolean; driver?: boolean }

// Nav set maps the prototype's sections onto rigledger's real routes. Items
// flagged owner/driver are gated below by the authenticated role — the server
// enforces the same gates, this just hides links the user can't use.
const NAV: NavItem[] = [
  { to: '/', label: 'Profit & Loss', icon: I('<path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 5-7"/>') },
  { to: '/fleet', label: 'Fleet', icon: I('<path d="M3 13h11V6H3zM14 9h4l3 3v4h-7z"/><circle cx="7" cy="18" r="1.6"/><circle cx="17.5" cy="18" r="1.6"/>') },
  { to: '/expenses', label: 'Expenses', icon: I('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18"/>'), owner: true },
  { to: '/loads', label: 'Loads', icon: I('<path d="M3 12h6l2-4 3 8 2-4h5"/>'), owner: true },
  { to: '/my-loads', label: 'My Loads', icon: I('<path d="M3 12h6l2-4 3 8 2-4h5"/>'), driver: true },
  { to: '/receipts', label: 'Receipts', icon: I('<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>') },
  { to: '/ifta', label: 'IFTA', icon: I('<path d="M4 4h16v16H4z"/><path d="M4 9h16M9 9v11"/>') },
  { to: '/hours', label: 'Hours of Service', icon: I('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>') },
  { to: '/invites', label: 'Invites', icon: I('<path d="M4 4h16v16H4z"/><path d="m4 7 8 6 8-6"/>'), owner: true },
  { to: '/billing', label: 'Billing', icon: I('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18"/>'), owner: true },
]

function initials(first?: string, last?: string): string {
  return `${(first ?? '').charAt(0)}${(last ?? '').charAt(0)}`.toUpperCase() || '··'
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth()
  const { theme, toggle } = useTheme()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  const themeLabel = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'

  const isOwner = user?.role === ROLE_OWNER
  // The prototype's data-role drives .owner-only / .op-only visibility. Owners
  // see fleet-wide copy; drivers (operator view) see single-truck copy.
  const role = isOwner ? 'owner' : 'operator'

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const visible = NAV.filter(n => {
    if (n.owner) return isOwner
    if (n.driver) return !isOwner
    return true
  })

  const name = user ? `${user.first_name} ${user.last_name}`.trim() : ''

  return (
    <div className="app" data-role={role} data-nav={open ? 'open' : 'closed'}>
      <header className="mtop">
        <button className="burger" type="button" aria-label="Open menu" aria-expanded={open} onClick={() => setOpen(v => !v)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M4 7h16M4 12h16M4 17h16" /></svg>
        </button>
        <span className="mbrand"><span className="mk">⬡</span>Rig<span className="cy">Ledger</span></span>
        <button className="theme-toggle" type="button" onClick={toggle} aria-label={themeLabel} title={themeLabel}>
          {theme === 'dark' ? '☀' : '☾'}
        </button>
      </header>

      <div className="scrim" onClick={() => setOpen(false)} />

      <aside>
        <div className="brand"><span className="mark">⬡</span><span className="word">Rig<span className="cy">Ledger</span></span></div>
        <nav className="side">
          {visible.map(n => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'} onClick={() => setOpen(false)} className={({ isActive }) => (isActive ? 'active' : undefined)}>
              {n.icon}{n.label}
            </NavLink>
          ))}
        </nav>
        <div className="side-foot">
          <div className="who">
            <span className="av">{initials(user?.first_name, user?.last_name)}</span>
            <div>
              <b>{name || 'Account'}</b><br />
              <span className="owner-only">Fleet owner</span>
              <span className="op-only">Owner-operator</span>
            </div>
          </div>
          <button type="button" className="logout" onClick={toggle} aria-label={themeLabel}>
            {theme === 'dark' ? '☀ Light Mode' : '☾ Dark Mode'}
          </button>
          <button type="button" className="logout" onClick={handleLogout}>Sign out</button>
        </div>
      </aside>

      {children}
    </div>
  )
}
