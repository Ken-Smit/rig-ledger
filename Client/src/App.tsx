import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import type { ReactNode } from 'react'
import Home from './pages/Home'
import { useAuth } from './auth/AuthProvider'

// Route-level pages are code-split so the initial bundle only ships what the
// landing experience needs. Home stays eager — it is the first paint target
// and lazy-loading it would add a network roundtrip before any pixels render.
const Login = lazy(() => import('./pages/Login'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Fleet = lazy(() => import('./pages/Fleet'))
const Expenses = lazy(() => import('./pages/Expenses'))
const TruckDetail = lazy(() => import('./pages/TruckDetail'))

// Reuses the same spinner markup PrivateRoute uses for its auth-boot branch,
// so users see a consistent loading state whether the wait is for AuthProvider
// or for a route chunk to download.
function RouteFallback() {
  return (
    <div className="loading-state">
      <div className="loading-spinner" />
    </div>
  )
}

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
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/home" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
          <Route path="/fleet" element={<PrivateRoute><Fleet /></PrivateRoute>} />
          <Route path="/expenses" element={<PrivateRoute><Expenses /></PrivateRoute>} />
          <Route path="/trucks/:id" element={<PrivateRoute><TruckDetail /></PrivateRoute>} />
          <Route path="*" element={<Navigate to="/home" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
