import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { getTheme } from './tokens.js'

const V3ThemeCtx = createContext(null)

export function V3ThemeProvider({ children, defaultMode = 'night' }) {
  const [mode, setMode] = useState(() => {
    if (typeof window === 'undefined') return defaultMode
    return window.localStorage.getItem('em.v3.mode') || defaultMode
  })
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia('(max-width: 720px)').matches
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem('em.v3.mode', mode)
    // Mirror the mode onto <html> so global CSS rules (e.g. autofill
    // text colour overrides that need the day/night palette but can't
    // read inline React styles) can target it via [data-v3-mode="…"].
    document.documentElement.setAttribute('data-v3-mode', mode)
  }, [mode])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(max-width: 720px)')
    const handler = (e) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const value = useMemo(() => ({
    mode,
    setMode,
    isMobile,
    T: getTheme(mode),
  }), [mode, isMobile])

  return <V3ThemeCtx.Provider value={value}>{children}</V3ThemeCtx.Provider>
}

export function useV3Theme() {
  const ctx = useContext(V3ThemeCtx)
  if (!ctx) throw new Error('useV3Theme must be used within V3ThemeProvider')
  return ctx
}
