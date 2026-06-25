import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import type { ReactNode } from 'react'
import Home from './pages/Home'
import { useAuth } from './auth/AuthProvider'
import { RoleRoute } from './components/RoleRoute'
import { ROLE_DRIVER } from './types/user'

// Route-level pages are code-split so the initial bundle only ships what the
// landing experience needs. Home stays eager — it is the first paint target
// and lazy-loading it would add a network roundtrip before any pixels render.
const Login = lazy(() => import('./pages/Login'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const DriverDashboard = lazy(() => import('./pages/DriverDashboard'))
const Fleet = lazy(() => import('./pages/Fleet'))
const Expenses = lazy(() => import('./pages/Expenses'))
const TruckDetail = lazy(() => import('./pages/TruckDetail'))
const Invites = lazy(() => import('./pages/Invites'))
const DriverRegister = lazy(() => import('./pages/DriverRegister'))
const Loads = lazy(() => import('./pages/Loads'))
const MyLoads = lazy(() => import('./pages/MyLoads'))
const Receipts = lazy(() => import('./pages/Receipts'))
const Demo = lazy(() => import('./pages/Demo'))
const Billing = lazy(() => import('./pages/Billing'))
const Ifta = lazy(() => import('./pages/Ifta'))
const Hours = lazy(() => import('./pages/Hours'))
const VerifyEmail = lazy(() => import('./pages/VerifyEmail'))
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'))
const ResetPassword = lazy(() => import('./pages/ResetPassword'))
const Terms = lazy(() => import('./pages/Terms'))
const Privacy = lazy(() => import('./pages/Privacy'))

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

// RoleDispatch picks the right "/" landing page per role. Drivers must
// never see the financial dashboard, owners want the full P&L picture.
// Wrapped in PrivateRoute by the caller, so user is guaranteed non-null
// here at runtime — the defensive fallback to Dashboard exists only to
// satisfy the compiler.
function RoleDispatch() {
  const { user } = useAuth()
  if (user?.role === ROLE_DRIVER) return <DriverDashboard />
  return <Dashboard />
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/home" element={<Home />} />
          <Route path="/demo" element={<Demo />} />
          <Route path="/login" element={<Login />} />
          <Route
            path="/register/driver/:token"
            element={<DriverRegister />}
          />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route
            path="/"
            element={
              <PrivateRoute>
                <RoleDispatch />
              </PrivateRoute>
            }
          />
          <Route
            path="/fleet"
            element={
              <PrivateRoute>
                <Fleet />
              </PrivateRoute>
            }
          />
          <Route
            path="/expenses"
            element={
              <PrivateRoute>
                <RoleRoute role="owner">
                  <Expenses />
                </RoleRoute>
              </PrivateRoute>
            }
          />
          <Route
            path="/trucks/:id"
            element={
              <PrivateRoute>
                <TruckDetail />
              </PrivateRoute>
            }
          />
          <Route
            path="/receipts"
            element={
              <PrivateRoute>
                <Receipts />
              </PrivateRoute>
            }
          />
          <Route
            path="/ifta"
            element={
              <PrivateRoute>
                <Ifta />
              </PrivateRoute>
            }
          />
          <Route
            path="/hours"
            element={
              <PrivateRoute>
                <Hours />
              </PrivateRoute>
            }
          />
          <Route
            path="/billing"
            element={
              <PrivateRoute>
                <RoleRoute role="owner">
                  <Billing />
                </RoleRoute>
              </PrivateRoute>
            }
          />
          <Route
            path="/invites"
            element={
              <PrivateRoute>
                <RoleRoute role="owner">
                  <Invites />
                </RoleRoute>
              </PrivateRoute>
            }
          />
          <Route
            path="/loads"
            element={
              <PrivateRoute>
                <RoleRoute role="owner">
                  <Loads />
                </RoleRoute>
              </PrivateRoute>
            }
          />
          <Route
            path="/my-loads"
            element={
              <PrivateRoute>
                <RoleRoute role="driver">
                  <MyLoads />
                </RoleRoute>
              </PrivateRoute>
            }
          />
          <Route path="*" element={<Navigate to="/home" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
