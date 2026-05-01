import { NavLink } from 'react-router-dom'
import { useTheme } from '../hooks/useTheme'
import { useAuth } from '../auth/AuthProvider'
import { ROLE_DRIVER, type Role } from '../types/user'

interface Props {
  onLogout: () => void
}

interface Tab {
  to: string
  label: string
}

const OWNER_TABS: Tab[] = [
  { to: '/',         label: 'Dashboard' },
  { to: '/fleet',    label: 'Fleet'     },
  { to: '/loads',    label: 'Loads'     },
  { to: '/expenses', label: 'P&L'       },
  { to: '/invites',  label: 'Team'      },
]

const DRIVER_TABS: Tab[] = [
  { to: '/',         label: 'Dashboard' },
  { to: '/my-loads', label: 'My Loads'  },
  { to: '/fleet',    label: 'Fleet'     },
]

const tabsForRole = (role: Role | undefined): Tab[] =>
  role === ROLE_DRIVER ? DRIVER_TABS : OWNER_TABS

export default function Navbar({ onLogout }: Props) {
  const { theme, toggle } = useTheme()
  const { user } = useAuth()
  const tabs = tabsForRole(user?.role)

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
          {tabs.map(tab => (
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
