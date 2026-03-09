import client from './client'

export const login = async (email: string, password: string): Promise<{ logged_in: boolean }> => {
  const res = await client.post('/api/v1/auth/login', { email, password })
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
}
