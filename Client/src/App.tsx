import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import Home from './pages/Home'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import TruckDetail from './pages/TruckDetail'
import Fleet from './pages/Fleet'
import Expenses from './pages/Expenses'
import { useAuth } from './auth/AuthProvider'

// PrivateRoute consumes the AuthProvider's state machine. The 'loading'
// branch is critical: redirecting while the boot probe is still in flight
// would punt every authenticated user back to /home on a hard refresh.
function PrivateRoute({ children }: { children: ReactNode }) {
  const { status } = useAuth()

  if (status === 'loading') {
    return (
      <div className="loading-state">
        <div className="loading-spinner" />
      </div>
    )
  }

  if (status === 'anon') {
    return <Navigate to="/home" replace />
  }

  return <>{children}</>
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/home" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
        <Route path="/fleet" element={<PrivateRoute><Fleet /></PrivateRoute>} />
        <Route path="/expenses" element={<PrivateRoute><Expenses /></PrivateRoute>} />
        <Route path="/trucks/:id" element={<PrivateRoute><TruckDetail /></PrivateRoute>} />
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
