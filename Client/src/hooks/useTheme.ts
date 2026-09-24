import { useState, useEffect } from 'react'

type Theme = 'dark' | 'light'

export function useTheme() {
  // Default to dark: the "Agentic Navy" look is the brand identity. Light is
  // opt-in via the toggle and persisted thereafter.
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem('ff-theme') as Theme) || 'dark'
  )

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('ff-theme', theme)
  }, [theme])

  const toggle = () => setTheme(t => (t === 'dark' ? 'light' : 'dark'))

  return { theme, toggle }
}
