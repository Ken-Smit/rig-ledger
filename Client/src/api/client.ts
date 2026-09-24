import axios, { AxiosError, type AxiosRequestConfig } from 'axios'

const API_URL: string = import.meta.env.VITE_API_URL || ''

// withCredentials is mandatory: it tells the browser to send the httpOnly
// access_token / refresh_token cookies on every request (including the
// preflight that follows for CORS). The server CORS config already sets
// AllowCredentials: true to accept this.
const client = axios.create({
  baseURL: API_URL,
  withCredentials: true,
})

// Subscribers (e.g. AuthProvider) are notified when a refresh fails terminally
// so they can transition to the anonymous state without polling localStorage.
type AuthFailureListener = () => void
const authFailureListeners = new Set<AuthFailureListener>()

export const onAuthFailure = (listener: AuthFailureListener): (() => void) => {
  authFailureListeners.add(listener)
  return () => authFailureListeners.delete(listener)
}

const notifyAuthFailure = (): void => {
  authFailureListeners.forEach((fn) => {
    try {
      fn()
    } catch {
      // Listeners must not throw — swallow to keep the chain alive.
    }
  })
}

// AxiosRequestConfig with our private retry flag. Avoids `any` while letting
// us mark a request that has already been retried.
type RetryableConfig = AxiosRequestConfig & { _retry?: boolean }

// Single in-flight refresh shared across concurrent 401s. Mobile network
// flaps can cause many parallel requests to fail at once; we must call the
// refresh endpoint exactly once per cluster, otherwise the rotated refresh
// token gets revoked-on-first-use and every retry fails.
let refreshPromise: Promise<void> | null = null

const performRefresh = async (): Promise<void> => {
  // No body — the refresh token rides on the httpOnly cookie. The server
  // sets new cookies in the response; we ignore the body entirely.
  await axios.post(
    `${API_URL}/api/v1/auth/refresh`,
    {},
    { withCredentials: true },
  )
}

const isAuthEndpoint = (url: string | undefined): boolean => {
  if (!url) return false
  return (
    url.includes('/api/v1/auth/login') ||
    url.includes('/api/v1/auth/register') ||
    url.includes('/api/v1/auth/refresh')
  )
}

client.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as RetryableConfig | undefined

    // 402 = the fleet has no active subscription (RequireEntitled) or has hit
    // its plan's truck band. Both are resolved on the billing page, so steer
    // the user there instead of letting the calling component render a broken
    // state. The billing endpoints themselves are never gated, so this cannot
    // loop. We still reject so the caller can stop its own loading state.
    if (error.response?.status === 402) {
      if (window.location.pathname !== '/billing') {
        window.location.href = '/billing'
      }
      return Promise.reject(error)
    }

    // Only attempt refresh on a real 401 from a non-auth endpoint that we
    // have not already retried. Login / refresh failures must surface to
    // the caller so the UI can show "invalid credentials" etc.
    if (
      !original ||
      error.response?.status !== 401 ||
      original._retry ||
      isAuthEndpoint(original.url)
    ) {
      return Promise.reject(error)
    }

    original._retry = true

    try {
      if (!refreshPromise) {
        refreshPromise = performRefresh().finally(() => {
          refreshPromise = null
        })
      }
      await refreshPromise
      // Retry the original request. Cookies were rotated by the server,
      // so the next call carries the fresh access_token automatically.
      return client(original)
    } catch (refreshErr) {
      notifyAuthFailure()
      // Don't hard-redirect to /login from a PUBLIC path. notifyAuthFailure()
      // already flips AuthProvider to 'anon', and React Router then routes the
      // root '/' to '/home' via PrivateRoute. Forcing /login here (the old
      // behavior) hijacked a fresh visitor landing on rig-ledger.com/ — the
      // boot profile probe 401s, and they'd be bounced to login instead of the
      // marketing home. The hard redirect is only for a session that dies on a
      // genuinely private page.
      const PUBLIC_PATHS = ['/', '/home', '/demo', '/login']
      if (!PUBLIC_PATHS.includes(window.location.pathname)) {
        window.location.href = '/login'
      }
      return Promise.reject(refreshErr)
    }
  },
)

export default client
