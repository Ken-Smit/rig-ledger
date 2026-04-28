import { NavLink } from 'react-router-dom'
import { useTheme } from '../hooks/useTheme'

interface Props {
  onLogout: () => void
}

const TABS = [
  { to: '/',         label: 'Dashboard' },
  { to: '/fleet',    label: 'Fleet'     },
  { to: '/expenses', label: 'P&L'       },
]

export default function Navbar({ onLogout }: Props) {
  const { theme, toggle } = useTheme()

  return (
    <nav className="navbar">
      <div className="nav-logo">
        <span className="nav-logo-mark">⬡</span>
        <span className="nav-logo-text">
          Rig<span className="cyan">Ledger</span>
        </span>
      </div>

      <div className="nav-center">
        <span className="nav-status-dot" />
        <span className="text-dim">System Online</span>
      </div>

      <div className="nav-right">
        <div className="nav-tabs">
          {TABS.map(tab => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.to === '/'}
              className={({ isActive }) => `nav-tab${isActive ? ' nav-tab-active' : ''}`}
            >
              {tab.label}
            </NavLink>
          ))}
        </div>
        <button
          className="btn-ghost btn-sm nav-theme-toggle"
          onClick={toggle}
          title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        >
          {theme === 'dark' ? '☀' : '☾'}
        </button>
        <button className="btn-ghost btn-sm" onClick={onLogout}>
          ⏻ <span className="nav-logout-label">Logout</span>
        </button>
      </div>
    </nav>
  )
}
