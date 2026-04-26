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
import { login as loginRequest, logout as logoutRequest } from '../api/auth'
import type { AuthStatus, AuthUser } from '../types/user'

interface AuthContextValue {
  status: AuthStatus
  user: AuthUser | null
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

interface AuthProviderProps {
  children: ReactNode
}

// fetchProfile pulls the projected user record from the server. Returns null
// on 401 so the caller can transition to 'anon' without throwing.
async function fetchProfile(): Promise<AuthUser | null> {
  try {
    const res = await client.get<AuthUser>('/api/v1/user/profile')
    return res.data
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

    let cancelled = false
    void (async () => {
      // Mobile webviews occasionally drop the access cookie on cold launch,
      // so always attempt a refresh first — it's idempotent and sets a
      // fresh access cookie if the refresh token is still valid.
      await tryRefresh()
      const profile = await fetchProfile()
      if (cancelled) return
      if (profile) applyAuthed(profile)
      else applyAnon()
    })()

    return () => {
      cancelled = true
    }
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

  const logout = useCallback(async () => {
    await logoutRequest()
    applyAnon()
  }, [applyAnon])

  const value: AuthContextValue = { status, user, login, logout }
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
