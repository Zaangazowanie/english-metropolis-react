import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react'
import en from './en.json'
import pl from './pl.json'

const DICTS = { en, pl }
const SUPPORTED = ['en', 'pl']
// v2 (2026-07-10): the old key was auto-written with the browser-detected
// language on first visit, so nearly every returning visitor had 'en' pinned.
// Versioning the key re-defaults EVERYONE to Polish once; choices made from
// now on persist as before.
const STORAGE_KEY = 'em.lang.v2'
// Separate axis from `lang`: when lang='en', the student can additionally
// toggle between FULL B2-quality English (the original lessonSummary,
// ruleExplanation, etc.) and SIMPLE A2-friendly English (lessonSummaryENSimple,
// ruleExplanationENSimple — same payloads we already generate for bilingual
// content). Default = 'simple' for A1/A2/B1 students (auto-set in App.jsx
// when student profile loads); the user can flip it anytime via the
// "Simple English" pill in the chrome.
const ENGLISH_LEVELS = ['full', 'simple']
const ENGLISH_LEVEL_KEY = 'em.englishLevel'

// Exported because Checkout and PaymentReturn resolve their own language from
// storage instead of the provider, and once a guessed language stopped being
// written to storage those two would have shown Polish to a visitor the rest
// of the site had already switched to English. One resolver, one answer.
export function detectInitial() {
  // Polish is the default (Mike 2026-07-10) because our market is Poland, and a
  // saved preference always wins; the EN/PL toggle in every header flips it.
  //
  // From 2026-08-10 a visitor whose IP Cloudflare places OUTSIDE Poland starts
  // on English instead (Mike). Deliberately NOT the browser language: that was
  // the v1 bug this key was versioned to undo, because a Pole with an English
  // phone was pinned to English forever. Country is a better proxy for "is this
  // person in our Polish-speaking market" and it is never persisted, so it
  // cannot pin anyone: the moment they touch the toggle, their choice is what
  // sticks.
  if (typeof window === 'undefined') return 'pl'
  const stored = window.localStorage.getItem(STORAGE_KEY)
  if (stored && SUPPORTED.includes(stored)) return stored
  // Must be exactly two capitals, and not one of Cloudflare's non-answers:
  // XX is "unknown or anonymised" and T1 is Tor. Those are not places, they
  // are the absence of one, and not knowing where somebody is resolves to
  // Polish. The un-substituted placeholder and an empty header fail the same
  // test, so every failure mode lands on our home market.
  const country = window.__EM_GEO_COUNTRY
  const known = typeof country === 'string' && /^[A-Z]{2}$/.test(country) &&
    country !== 'XX' && country !== 'T1'
  if (known && country !== 'PL') return 'en'
  return 'pl'
}
function detectInitialEnglishLevel() {
  if (typeof window === 'undefined') return 'full'
  const stored = window.localStorage.getItem(ENGLISH_LEVEL_KEY)
  if (stored && ENGLISH_LEVELS.includes(stored)) return stored
  return 'full'
}

const I18nContext = createContext(null)

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(() => detectInitial())
  const [englishLevel, setEnglishLevelState] = useState(() => detectInitialEnglishLevel())

  // Mirror onto <html lang> on every change, but do NOT write storage here.
  // This effect used to persist on mount too, which quietly re-created the
  // exact v1 bug described at the top of this file: whatever we guessed for a
  // first-time visitor became a saved preference they never made, pinning them
  // to it for good. Only an actual choice is written now, in setLang below, so
  // a guess stays a guess and is re-evaluated on the next visit.
  useEffect(() => {
    if (typeof window === 'undefined') return
    document.documentElement.setAttribute('lang', lang)
  }, [lang])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(ENGLISH_LEVEL_KEY, englishLevel)
    document.documentElement.setAttribute('data-english-level', englishLevel)
  }, [englishLevel])

  // The one place a language becomes a saved preference, because this is the
  // one place the user actually picks it.
  const setLang = useCallback((next) => {
    if (!SUPPORTED.includes(next)) return
    setLangState(next)
    try { window.localStorage.setItem(STORAGE_KEY, next) } catch { /* private mode */ }
  }, [])
  const setEnglishLevel = useCallback((next) => {
    if (ENGLISH_LEVELS.includes(next)) setEnglishLevelState(next)
  }, [])

  const t = useCallback((key, vars) => {
    const dict = DICTS[lang] || DICTS.en
    let s = dict[key] ?? DICTS.en[key] ?? key
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v))
      }
    }
    return s
  }, [lang])

  // Helper: pick the right field from a bilingual payload based on
  // (lang, englishLevel). Order:
  //   lang=pl  → <key>PL || <key>
  //   lang=en, englishLevel=simple → <key>ENSimple || <key>
  //   lang=en, englishLevel=full   → <key>
  // Used by KnowledgeBase / Practice / Dashboard to swap deep vs simple
  // English without conditionals at every call site.
  const pickBilingual = useCallback((entry, baseKey, fallback = '') => {
    if (!entry) return fallback
    const plKey = `${baseKey}PL`
    const simpleKey = `${baseKey}ENSimple`
    if (lang === 'pl' && entry[plKey]) return entry[plKey]
    if (lang === 'en' && englishLevel === 'simple' && entry[simpleKey]) return entry[simpleKey]
    return entry[baseKey] ?? fallback
  }, [lang, englishLevel])

  const value = useMemo(() => ({
    lang, setLang, supported: SUPPORTED,
    englishLevel, setEnglishLevel, englishLevels: ENGLISH_LEVELS,
    t, pickBilingual,
  }), [lang, setLang, englishLevel, setEnglishLevel, t, pickBilingual])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>')
  return ctx
}

export function useT() {
  return useI18n().t
}
