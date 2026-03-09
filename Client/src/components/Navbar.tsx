import { NavLink } from 'react-router-dom'
import { useTheme } from '../hooks/useTheme'

interface Props {
  onLogout: () => void
}

const TABS = [
  { to: '/',         label: 'DASHBOARD' },
  { to: '/fleet',    label: 'FLEET'     },
  { to: '/expenses', label: 'EXPENSES'  },
]

export default function Navbar({ onLogout }: Props) {
  const { theme, toggle } = useTheme()

  return (
    <nav className="navbar">
      <div className="nav-logo">
        <span className="nav-logo-mark">⬡</span>
        <span className="nav-logo-text">
          RIG<span className="cyan">LEDGER</span>
        </span>
      </div>

      <div className="nav-center">
        <span className="nav-status-dot" />
        <span className="text-dim">SYSTEM ONLINE</span>
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
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? '☀' : '☾'}
        </button>
        <button className="btn-ghost btn-sm" onClick={onLogout}>
          ⏻ LOGOUT
        </button>
      </div>
    </nav>
  )
}
