import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../i18n'

/**
 * EU GDPR + Polish UŚŚU (Ustawa o świadczeniu usług drogą elektroniczną) cookie
 * consent banner. Stores a versioned consent record in localStorage so we can
 * invalidate old consents if our policy changes.
 *
 * Categories:
 *   - necessary      : always on (session, CSRF, auth) — can't be refused
 *   - functional     : voice preference, theme, flashcard state
 *   - analytics      : opt-in only
 *   - marketing      : opt-in only (not currently used, reserved)
 *
 * The student/admin is given three choices: Accept all, Reject all (only
 * necessary), or Customise.
 */

const CONSENT_STORAGE_KEY = 'em_consent_v1'
const CONSENT_VERSION = 1

export function getConsent() {
  try {
    const raw = localStorage.getItem(CONSENT_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed?.version !== CONSENT_VERSION) return null
    return parsed
  } catch {
    return null
  }
}

export function setConsent(record) {
  try {
    localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify({
      version: CONSENT_VERSION,
      decidedAt: new Date().toISOString(),
      ...record,
    }))
    window.dispatchEvent(new CustomEvent('em-consent-changed', { detail: record }))
  } catch {}
}

export function hasConsented(category) {
  const c = getConsent()
  if (!c) return false
  if (category === 'necessary') return true
  return !!c[category]
}

export default function ConsentBanner() {
  const { t } = useI18n()
  const [state, setState] = useState({ loaded: false, visible: false, expanded: false })
  const [prefs, setPrefs] = useState({ necessary: true, functional: true, analytics: false, marketing: false })

  useEffect(() => {
    const c = getConsent()
    if (c) {
      setState({ loaded: true, visible: false, expanded: false })
      setPrefs({ necessary: true, functional: !!c.functional, analytics: !!c.analytics, marketing: !!c.marketing })
    } else {
      setState({ loaded: true, visible: true, expanded: false })
    }
    // Expose a global to re-open the banner from footer link
    window.__EM_OPEN_CONSENT = () => setState(s => ({ ...s, visible: true, expanded: true }))
    return () => { delete window.__EM_OPEN_CONSENT }
  }, [])

  if (!state.loaded || !state.visible) return null

  function acceptAll() {
    setConsent({ necessary: true, functional: true, analytics: true, marketing: true })
    setState({ loaded: true, visible: false, expanded: false })
  }

  function rejectAll() {
    setConsent({ necessary: true, functional: false, analytics: false, marketing: false })
    setState({ loaded: true, visible: false, expanded: false })
  }

  function save() {
    setConsent({ ...prefs, necessary: true })
    setState({ loaded: true, visible: false, expanded: false })
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[10000] p-3 sm:p-5 pointer-events-none">
      <div className="max-w-5xl mx-auto rounded-[1.5rem] border-2 border-slate-900/10 bg-white/98 backdrop-blur-xl shadow-[0_-10px_40px_rgba(15,23,42,0.15)] p-5 sm:p-6 pointer-events-auto consent-banner-enter">
        <div className="flex items-start gap-3 sm:gap-4">
          <div className="shrink-0 flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-[0.85rem] bg-gradient-to-br from-violet-500 to-fuchsia-600 shadow-md">
            <span className="material-symbols-outlined text-white text-xl sm:text-2xl">cookie</span>
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-headline text-base sm:text-lg text-slate-900 leading-tight">
              {t('consent.title')}
            </h2>
            <p className="mt-1.5 text-[12px] sm:text-sm text-slate-600 leading-relaxed">
              {t('consent.blurb')} <Link to="/privacy" className="text-violet-700 font-semibold underline">{t('consent.privacyLink')}</Link> · <Link to="/cookies" className="text-violet-700 font-semibold underline">{t('consent.cookieLink')}</Link>
            </p>

            {state.expanded && (
              <div className="mt-4 space-y-2">
                {[
                  { key: 'necessary', label: t('consent.cat.necessary.label'), desc: t('consent.cat.necessary.desc'), disabled: true },
                  { key: 'functional', label: t('consent.cat.functional.label'), desc: t('consent.cat.functional.desc') },
                  { key: 'analytics',  label: t('consent.cat.analytics.label'),  desc: t('consent.cat.analytics.desc') },
                  { key: 'marketing',  label: t('consent.cat.marketing.label'),  desc: t('consent.cat.marketing.desc') },
                ].map(cat => (
                  <label
                    key={cat.key}
                    className={`flex items-start gap-3 rounded-[1rem] border border-slate-200 bg-slate-50/40 px-3 py-2.5 ${cat.disabled ? 'opacity-80' : 'cursor-pointer hover:border-violet-300'}`}
                  >
                    <input
                      type="checkbox"
                      checked={prefs[cat.key]}
                      disabled={cat.disabled}
                      onChange={e => setPrefs(p => ({ ...p, [cat.key]: e.target.checked }))}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-violet-600"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] font-bold text-slate-800">{cat.label}</p>
                      <p className="text-[11px] text-slate-500 leading-relaxed">{cat.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            )}

            <div className="mt-4 flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={acceptAll}
                className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700 px-4 py-2 text-[11px] font-label font-bold uppercase tracking-[0.14em] text-white transition cursor-pointer shadow-md"
              >
                <span className="material-symbols-outlined text-[14px]">check_circle</span>
                {t('consent.btn.acceptAll')}
              </button>
              <button
                type="button"
                onClick={rejectAll}
                className="inline-flex items-center gap-1 rounded-full bg-white border-2 border-slate-200 hover:border-slate-400 px-4 py-2 text-[11px] font-label font-bold uppercase tracking-[0.14em] text-slate-700 hover:text-slate-900 transition cursor-pointer"
              >
                {t('consent.btn.rejectAll')}
              </button>
              {state.expanded ? (
                <button
                  type="button"
                  onClick={save}
                  className="inline-flex items-center gap-1 rounded-full bg-slate-900 hover:bg-slate-800 px-4 py-2 text-[11px] font-label font-bold uppercase tracking-[0.14em] text-white transition cursor-pointer"
                >
                  {t('consent.btn.save')}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setState(s => ({ ...s, expanded: true }))}
                  className="inline-flex items-center gap-1 rounded-full bg-white border border-slate-200 hover:border-violet-400 px-4 py-2 text-[11px] font-label font-bold uppercase tracking-[0.14em] text-slate-600 hover:text-violet-700 transition cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[14px]">tune</span>
                  {t('consent.btn.customise')}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
