import axios from 'axios'

const client = axios.create({
  withCredentials: true,
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
        refreshPromise = axios.post('/api/v1/auth/refresh', null, {
          withCredentials: true,
        }).then(() => {})
      }

      await refreshPromise
      refreshPromise = null
      return client(original)
    } catch {
      refreshPromise = null
      return Promise.reject(error)
    }
  }
)

export default client
