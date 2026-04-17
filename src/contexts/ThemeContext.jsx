import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react'

const STORAGE_KEY = 'em.theme'
const FONT_KEY = 'em.fontSize'
const MOTION_KEY = 'em.motion'
const DYSLEXIC_KEY = 'em.dyslexicFont'
const THEMES = ['light', 'dark', 'system']
const FONT_SIZES = ['small', 'regular', 'large']
const MOTIONS = ['full', 'reduced', 'none']

const ThemeContext = createContext(null)

function readStored(key, fallback, allowed) {
  if (typeof window === 'undefined') return fallback
  const v = window.localStorage.getItem(key)
  return (v && allowed.includes(v)) ? v : fallback
}

function resolveTheme(pref) {
  if (pref === 'system') {
    if (typeof window === 'undefined') return 'light'
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return pref
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => readStored(STORAGE_KEY, 'system', THEMES))
  const [fontSize, setFontSizeState] = useState(() => readStored(FONT_KEY, 'regular', FONT_SIZES))
  const [motion, setMotionState] = useState(() => readStored(MOTION_KEY, 'full', MOTIONS))
  const [dyslexicFont, setDyslexicFontState] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem(DYSLEXIC_KEY) === '1'
  })

  // Apply to <html>
  useEffect(() => {
    if (typeof window === 'undefined') return
    const root = document.documentElement
    const resolved = resolveTheme(theme)
    root.classList.toggle('dark', resolved === 'dark')
    root.classList.toggle('light', resolved !== 'dark')
    root.setAttribute('data-theme', resolved)
    window.localStorage.setItem(STORAGE_KEY, theme)
  }, [theme])

  useEffect(() => {
    if (typeof window === 'undefined') return
    document.documentElement.setAttribute('data-font-size', fontSize)
    window.localStorage.setItem(FONT_KEY, fontSize)
  }, [fontSize])

  useEffect(() => {
    if (typeof window === 'undefined') return
    document.documentElement.setAttribute('data-motion', motion)
    window.localStorage.setItem(MOTION_KEY, motion)
  }, [motion])

  useEffect(() => {
    if (typeof window === 'undefined') return
    document.documentElement.classList.toggle('em-dyslexic', dyslexicFont)
    window.localStorage.setItem(DYSLEXIC_KEY, dyslexicFont ? '1' : '0')
  }, [dyslexicFont])

  // Re-apply if system preference flips while on 'system'
  useEffect(() => {
    if (typeof window === 'undefined' || theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      document.documentElement.classList.toggle('dark', mq.matches)
      document.documentElement.classList.toggle('light', !mq.matches)
      document.documentElement.setAttribute('data-theme', mq.matches ? 'dark' : 'light')
    }
    mq.addEventListener?.('change', onChange)
    return () => mq.removeEventListener?.('change', onChange)
  }, [theme])

  const setTheme = useCallback((v) => { if (THEMES.includes(v)) setThemeState(v) }, [])
  const setFontSize = useCallback((v) => { if (FONT_SIZES.includes(v)) setFontSizeState(v) }, [])
  const setMotion = useCallback((v) => { if (MOTIONS.includes(v)) setMotionState(v) }, [])
  const setDyslexicFont = useCallback((v) => setDyslexicFontState(Boolean(v)), [])

  const value = useMemo(() => ({
    theme, setTheme,
    resolvedTheme: resolveTheme(theme),
    fontSize, setFontSize,
    motion, setMotion,
    dyslexicFont, setDyslexicFont,
    themes: THEMES, fontSizes: FONT_SIZES, motions: MOTIONS,
  }), [theme, fontSize, motion, dyslexicFont])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>')
  return ctx
}
