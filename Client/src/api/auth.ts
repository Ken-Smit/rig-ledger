import client from './client'

// Login / refresh no longer return tokens in the JSON body.
// Tokens are delivered via httpOnly Set-Cookie headers and are
// unreachable to JavaScript. The body only confirms the session state.
export interface LoginResponse {
  logged_in: boolean
}

export interface RegisterPayload {
  first_name: string
  last_name: string
  email: string
  password: string
}

export interface RegisterResponse {
  message: string
}

// RegisterDriverPayload is the shape POSTed to /auth/register-driver. The
// `token` is the raw invite token (not its hash) — the server hashes and
// matches it against the invite collection.
export interface RegisterDriverPayload {
  token: string
  first_name: string
  last_name: string
  email: string
  password: string
}

export const login = async (
  email: string,
  password: string,
): Promise<LoginResponse> => {
  const res = await client.post<LoginResponse>('/api/v1/auth/login', {
    email,
    password,
  })
  return res.data
}

export const register = async (
  data: RegisterPayload,
): Promise<RegisterResponse> => {
  const res = await client.post<RegisterResponse>('/api/v1/auth/register', data)
  return res.data
}

// registerDriver consumes a one-time invite token, creates the driver user,
// and returns logged_in: true with fresh httpOnly auth cookies set. The
// caller should follow up with a profile fetch to populate AuthProvider.
export const registerDriver = async (
  data: RegisterDriverPayload,
): Promise<LoginResponse> => {
  const res = await client.post<LoginResponse>(
    '/api/v1/auth/register-driver',
    data,
  )
  return res.data
}

// Logout relies on the server clearing both auth cookies. There is nothing
// for the client to clean up — no token is held in JS memory or storage.
export const logout = async (): Promise<void> => {
  try {
    await client.post('/api/v1/auth/logout')
  } catch {
    // Even if the server is unreachable, we treat the local session as ended.
    // The cookies will be invalidated server-side on next refresh attempt.
  }
}
