import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { FOUNDATION, FOUNDATION_FOOTER_PL, FOUNDATION_FOOTER_EN, BINDING_NOTE_EN } from './foundation-legal-content.js'
import { prepareLegalDoc, wrapTables } from './legal-toc.js'
import './foundation-legal.css'

const LANG_KEY = 'em.legal.lang'

// Shared shell for the approved Twój StartUp legal documents. Always lands on
// Polish (the binding version); the toggle switches to a courtesy English
// translation carrying BINDING_NOTE_EN. The choice is stored under its own
// key so it never flips the app-wide language preference. The same bodies are
// baked into the static /terms/ /privacy/ /cookies/ pages by
// scripts/build-legal-static.mjs, which is what a direct URL hit serves.
export default function FoundationLegalPage({
  titlePl, titleEn, docId, bodyHtml, bodyHtmlEn,
  effectivePl = FOUNDATION.effectiveDate, effectiveEn = FOUNDATION.effectiveDateEn,
}) {
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

  const doc = useMemo(() => {
    const src = isPl ? bodyHtml : (bodyHtmlEn || bodyHtml)
    return prepareLegalDoc(wrapTables(src), isPl ? '' : '-en')
  }, [bodyHtml, bodyHtmlEn, isPl])

  // Scroll reveal + TOC scroll-spy, the same behaviour as /legal/legal.js on
  // the static pages. html[data-reveal] gates the CSS so nothing hides when
  // this effect has not run (SSR, no JS).
  const [activeId, setActiveId] = useState(null)
  useEffect(() => {
    const html = document.documentElement
    html.setAttribute('data-reveal', '')
    const blocks = Array.from(document.querySelectorAll('.fl-doc .fl-sec, .fl-doc > section, .fl-en-notice'))
    const heads = doc.toc.map((t) => document.getElementById(t.id)).filter(Boolean)
    if (!('IntersectionObserver' in window)) {
      blocks.forEach((b) => b.classList.add('is-in'))
      return () => html.removeAttribute('data-reveal')
    }
    const reveal = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('is-in'); reveal.unobserve(e.target) } })
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 })
    blocks.forEach((b) => {
      if (b.getBoundingClientRect().top < window.innerHeight * 0.92) b.classList.add('is-in')
      else reveal.observe(b)
    })
    const spy = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) setActiveId(e.target.id) })
    }, { rootMargin: '-15% 0px -70% 0px' })
    heads.forEach((h) => spy.observe(h))
    setActiveId(doc.toc[0]?.id ?? null)
    return () => { reveal.disconnect(); spy.disconnect(); html.removeAttribute('data-reveal') }
  }, [doc])

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 legal-page fl-page">
      <div className="mb-6 flex items-center justify-between gap-3 flex-wrap">
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-sky-700 hover:text-sky-900">
          <span className="material-symbols-outlined text-base">arrow_back</span>
          {isPl ? 'Wróć do aplikacji' : 'Back to the app'}
        </Link>
        <div className="flex items-center gap-4 flex-wrap">
          <nav className="fl-siblings" aria-label="Legal documents">
            <Link to="/terms">{isPl ? 'Regulamin' : 'Terms'}</Link>
            <Link to="/privacy">{isPl ? 'Prywatność' : 'Privacy'}</Link>
            <Link to="/cookies">Cookies</Link>
            <Link to="/lesson-analysis">{isPl ? 'Analiza lekcji' : 'Lesson analysis'}</Link>
            <Link className="fl-withdraw-link" to="/withdraw">{isPl ? 'Odstąp online' : 'Withdraw online'}</Link>
          </nav>
          <div className="fl-lang" role="group" aria-label="Language">
            <button type="button" data-active={isPl} aria-pressed={isPl} onClick={() => chooseLang('pl')}>PL</button>
            <button type="button" data-active={!isPl} aria-pressed={!isPl} onClick={() => chooseLang('en')}>EN</button>
          </div>
        </div>
      </div>

      <h1 className="font-headline text-3xl sm:text-4xl text-slate-900">{isPl ? titlePl : titleEn}</h1>
      <p className="mt-2 text-sm text-slate-500">
        {docId} · {isPl ? 'Obowiązuje od' : 'Effective from'}: {isPl ? effectivePl : effectiveEn}
      </p>

      <div className="fl-layout">
        {doc.toc.length > 1 && (
          <nav className="fl-toc" aria-label={isPl ? 'Spis treści' : 'Contents'}>
            <div className="fl-toc-label">{isPl ? 'Na tej stronie' : 'On this page'}</div>
            <ol>
              {doc.toc.map((t) => (
                <li key={t.id}>
                  <a href={`#${t.id}`} className={t.id === activeId ? 'active' : undefined}>{t.title}</a>
                </li>
              ))}
            </ol>
          </nav>
        )}
        <div className="fl-main">
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
            dangerouslySetInnerHTML={{ __html: doc.html }}
          />

          <footer className="fl-foot">
            <p>{isPl ? FOUNDATION_FOOTER_PL : FOUNDATION_FOOTER_EN}</p>
            <p>
              {isPl ? 'Kontakt' : 'Contact'}: <a href="mailto:support@englishmetro.com">support@englishmetro.com</a>
              {' · '}<a href="tel:+48662563507">+48 662 563 507</a>
              {' · '}<a href="/kontakt/">{isPl ? 'Kontakt i dane firmy' : 'Contact and company details'}</a>
              {' · '}<a href="/faq/">{isPl ? 'Najczęstsze pytania' : 'FAQ'}</a>
            </p>
            <Link className="fl-withdraw-cta" to="/withdraw">
              {isPl ? 'Odstąp od umowy tutaj' : 'Withdraw from a contract here'}
            </Link>
          </footer>
        </div>
      </div>
    </div>
  )
}
