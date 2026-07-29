import { useState } from 'react'
import { Link } from 'react-router-dom'
import { FOUNDATION, FOUNDATION_FOOTER_PL, FOUNDATION_FOOTER_EN, BINDING_NOTE_EN } from './foundation-legal-content.js'
import './foundation-legal.css'

const LANG_KEY = 'em.legal.lang'

// Shared shell for the approved Twój StartUp legal documents. Always lands on
// Polish (the binding version); the toggle switches to a courtesy English
// translation carrying BINDING_NOTE_EN. The choice is stored under its own
// key so it never flips the app-wide language preference.
export default function FoundationLegalPage({ titlePl, titleEn, docId, bodyHtml, bodyHtmlEn }) {
  const [lang, setLang] = useState(() => {
    try {
      const v = window.localStorage.getItem(LANG_KEY)
      return v === 'en' ? 'en' : 'pl'
    } catch {
      return 'pl'
    }
  })
  const isPl = lang === 'pl'

  function chooseLang(next) {
    setLang(next)
    try { window.localStorage.setItem(LANG_KEY, next) } catch { /* in-memory only */ }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 legal-page fl-page">
      <div className="mb-6 flex items-center justify-between gap-3 flex-wrap">
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-sky-700 hover:text-sky-900">
          <span className="material-symbols-outlined text-base">arrow_back</span>
          {isPl ? 'Wróć do aplikacji' : 'Back to the app'}
        </Link>
        <div className="flex items-center gap-4">
          <nav className="fl-siblings" aria-label="Legal documents">
            <Link to="/terms">{isPl ? 'Regulamin' : 'Terms'}</Link>
            <Link to="/privacy">{isPl ? 'Prywatność' : 'Privacy'}</Link>
            <Link to="/cookies">Cookies</Link>
            <Link className="fl-withdraw-link" to="/withdraw">{isPl ? 'Odstąp online' : 'Withdraw online'}</Link>
          </nav>
          <div className="fl-lang" role="group" aria-label="Language">
            <button type="button" data-active={isPl} onClick={() => chooseLang('pl')}>PL</button>
            <button type="button" data-active={!isPl} onClick={() => chooseLang('en')}>EN</button>
          </div>
        </div>
      </div>

      <h1 className="font-headline text-3xl sm:text-4xl text-slate-900">{isPl ? titlePl : titleEn}</h1>
      <p className="mt-2 text-sm text-slate-500">
        {docId} · {isPl ? 'Obowiązuje od' : 'Effective from'}: {isPl ? FOUNDATION.effectiveDate : '23 July 2026'}
      </p>

      {!isPl && (
        <div className="fl-en-notice" role="note">
          <p><strong>Courtesy translation.</strong> {BINDING_NOTE_EN} {' '}
          Questions? Write to <a href={`mailto:${FOUNDATION.email}`}>{FOUNDATION.email}</a>.</p>
        </div>
      )}

      <article
        key={lang}
        className="fl-doc"
        lang={isPl ? 'pl' : 'en'}
        dangerouslySetInnerHTML={{ __html: isPl ? bodyHtml : (bodyHtmlEn || bodyHtml) }}
      />

      <footer className="fl-foot">
        <p>{isPl ? FOUNDATION_FOOTER_PL : FOUNDATION_FOOTER_EN}</p>
        <Link className="fl-withdraw-cta" to="/withdraw">
          {isPl ? 'Odstąp od umowy tutaj' : 'Withdraw from a contract here'}
        </Link>
      </footer>
    </div>
  )
}
