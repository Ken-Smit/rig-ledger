import client from './client'

interface LoginResponse {
  logged_in: boolean
  access_token: string
  refresh_token: string
}

export const login = async (email: string, password: string): Promise<LoginResponse> => {
  const res = await client.post('/api/v1/auth/login', { email, password })
  const { access_token, refresh_token } = res.data
  if (access_token) localStorage.setItem('access_token', access_token)
  if (refresh_token) localStorage.setItem('refresh_token', refresh_token)
  return res.data
}

export const register = async (data: {
  first_name: string
  last_name: string
  email: string
  password: string
}): Promise<{ message: string }> => {
  const res = await client.post('/api/v1/auth/register', data)
  return res.data
}

export const logout = async (): Promise<void> => {
  await client.post('/api/v1/auth/logout')
  localStorage.removeItem('access_token')
  localStorage.removeItem('refresh_token')
}
