import { createContext, useContext, useEffect, useState } from 'react'
import { TOKENS } from './tokens'

const ThemeContext = createContext({
  mode: 'dark',
  T: TOKENS.dark,
  setMode: () => {},
  motion: true,
})

export function ThemeProvider({ children }) {
  const [mode, setModeRaw] = useState(() => {
    if (typeof window === 'undefined') return 'dark'
    return localStorage.getItem('em.mode') || 'dark'
  })
  const [motion] = useState(() => {
    if (typeof window === 'undefined') return true
    return !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  })

  const setMode = (m) => {
    setModeRaw(m)
    try { localStorage.setItem('em.mode', m) } catch {}
  }

  useEffect(() => {
    document.documentElement.dataset.theme = mode
    document.documentElement.style.colorScheme = mode === 'dark' ? 'dark' : 'light'
  }, [mode])

  const T = TOKENS[mode]
  return (
    <ThemeContext.Provider value={{ mode, T, setMode, motion }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
