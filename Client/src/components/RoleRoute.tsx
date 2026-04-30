import { Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../auth/AuthProvider'
import type { Role } from '../types/user'

interface Props {
  role: Role | Role[]
  children: ReactNode
}

// RoleRoute is a UI-side gate. The server is the security boundary (403s
// are returned for unauthorized endpoints regardless), but rendering an
// owner-only page to a driver would surface a wall of 403s with no useful
// recovery path — the redirect provides a kinder UX.
export const RoleRoute = ({ role, children }: Props) => {
  const { status, user } = useAuth()

  if (status === 'loading') {
    return (
      <div className="loading-state">
        <div className="loading-spinner" />
      </div>
    )
  }

  if (status === 'anon' || !user) {
    return <Navigate to="/home" replace />
  }

  const allowed = Array.isArray(role) ? role : [role]
  if (!allowed.includes(user.role)) {
    // Land back on root; the App-level dispatcher will pick the right
    // dashboard for the user's actual role.
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}
