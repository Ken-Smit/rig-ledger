import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import client, { onAuthFailure } from '../api/client'
import {
  login as loginRequest,
  logout as logoutRequest,
  registerDriver as registerDriverRequest,
  type RegisterDriverPayload,
} from '../api/auth'
import {
  ROLE_DRIVER,
  ROLE_OWNER,
  type AuthStatus,
  type AuthUser,
} from '../types/user'

interface AuthContextValue {
  status: AuthStatus
  user: AuthUser | null
  login: (email: string, password: string) => Promise<void>
  loginAsDriver: (payload: RegisterDriverPayload) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

interface AuthProviderProps {
  children: ReactNode
}

// fetchProfile pulls the projected user record from the server. Returns null
// on 401 OR on a malformed payload (unknown role). The role allowlist is a
// defense-in-depth check: a typo or future-role server response should
// degrade to anon rather than crash a route component reading user.role.
async function fetchProfile(): Promise<AuthUser | null> {
  try {
    const res = await client.get<AuthUser>('/api/v1/user/profile')
    const data = res.data
    if (data.role !== ROLE_OWNER && data.role !== ROLE_DRIVER) {
      return null
    }
    return data
  } catch {
    return null
  }
}

// tryRefresh attempts a silent token refresh using the httpOnly refresh
// cookie. Returns true if the server set fresh cookies, false otherwise.
async function tryRefresh(): Promise<boolean> {
  try {
    await client.post('/api/v1/auth/refresh', {})
    return true
  } catch {
    return false
  }
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [user, setUser] = useState<AuthUser | null>(null)
  // StrictMode runs effects twice in development. The ref guards against a
  // double-probe that would briefly flicker the UI.
  const bootedRef = useRef(false)

  const applyAuthed = useCallback((u: AuthUser) => {
    setUser(u)
    setStatus('authed')
  }, [])

  const applyAnon = useCallback(() => {
    setUser(null)
    setStatus('anon')
  }, [])

  // Boot probe: if a refresh cookie exists, this restores the session
  // without a redirect. If not, we land on 'anon' and PrivateRoute kicks
  // the user to /home or /login.
  useEffect(() => {
    if (bootedRef.current) return
    bootedRef.current = true

    void (async () => {
      // Mobile webviews occasionally drop the access cookie on cold launch,
      // so always attempt a refresh first — it's idempotent and sets a
      // fresh access cookie if the refresh token is still valid.
      await tryRefresh()
      const profile = await fetchProfile()
      // No cancelled-guard here: bootedRef already guarantees this runs once,
      // and under StrictMode's dev remount the first effect's cleanup would
      // otherwise cancel the ONLY boot (the remount is blocked by bootedRef),
      // stranding the FSM in 'loading'. The provider is mounted at the app
      // root for the app's lifetime, so a late setState is safe.
      if (profile) applyAuthed(profile)
      else applyAnon()
    })()
  }, [applyAuthed, applyAnon])

  // Mid-session: a hard refresh failure from the axios interceptor should
  // immediately flip us to 'anon' so PrivateRoute redirects.
  useEffect(() => {
    return onAuthFailure(() => applyAnon())
  }, [applyAnon])

  const login = useCallback(
    async (email: string, password: string) => {
      await loginRequest(email, password)
      const profile = await fetchProfile()
      if (profile) applyAuthed(profile)
      else applyAnon()
    },
    [applyAuthed, applyAnon],
  )

  // loginAsDriver mirrors login but uses the invite-consumption endpoint.
  // The server returns logged_in: true with the same httpOnly cookie set,
  // so the post-call profile fetch + applyAuthed path is identical.
  const loginAsDriver = useCallback(
    async (payload: RegisterDriverPayload) => {
      await registerDriverRequest(payload)
      const profile = await fetchProfile()
      if (profile) applyAuthed(profile)
      else applyAnon()
    },
    [applyAuthed, applyAnon],
  )

  const logout = useCallback(async () => {
    await logoutRequest()
    applyAnon()
  }, [applyAnon])

  const value: AuthContextValue = {
    status,
    user,
    login,
    loginAsDriver,
    logout,
  }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    // Throwing here is intentional: a missing provider is a wiring bug, not
    // a runtime condition. Surfacing it loudly is preferable to silently
    // returning a stub that pretends the user is anonymous.
    throw new Error('useAuth must be used within <AuthProvider>')
  }
  return ctx
}
