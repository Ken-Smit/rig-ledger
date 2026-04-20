import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || ''

const client = axios.create({
  baseURL: API_URL,
  withCredentials: true,
})

// Attach access token from localStorage to every request
client.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

let refreshPromise: Promise<void> | null = null

client.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config
    if (error.response?.status !== 401 || original._retry) {
      return Promise.reject(error)
    }

    original._retry = true

    try {
      if (!refreshPromise) {
        const refreshToken = localStorage.getItem('refresh_token')
        refreshPromise = axios
          .post(
            `${API_URL}/api/v1/auth/refresh`,
            { refresh_token: refreshToken },
            { withCredentials: true }
          )
          .then((res) => {
            const { access_token, refresh_token } = res.data
            if (access_token) localStorage.setItem('access_token', access_token)
            if (refresh_token) localStorage.setItem('refresh_token', refresh_token)
          })
      }

      await refreshPromise
      refreshPromise = null

      // Update the retried request with the new token
      const newToken = localStorage.getItem('access_token')
      if (newToken) {
        original.headers.Authorization = `Bearer ${newToken}`
      }

      return client(original)
    } catch {
      refreshPromise = null
      localStorage.removeItem('access_token')
      localStorage.removeItem('refresh_token')
      localStorage.removeItem('logged_in')
      return Promise.reject(error)
    }
  }
)

export default client
