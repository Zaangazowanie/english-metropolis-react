// Bajla connect popup — shown after login so every user type (student / teacher
// / admin) can start chatting with the Bajla WhatsApp assistant.
//
// Behaviour (decided with Mike 2026-06-06):
//  - Shows on every fresh login session, but ONLY until the user has a WhatsApp
//    number saved on their profile. Once a number is saved we never nag again.
//  - The WhatsApp CTAs are gated: if the user has no number on file yet, the
//    first tap opens an inline "enter your number" step. We save that number to
//    their profile (bajla:setMyPhone) and THEN hand them to WhatsApp with a
//    preloaded message — Bajla can only reply once they message her first
//    (Meta 24h window), so the deep link greets her for them.
//
// Mounted once at the router root (next to ConsentBanner) so it reaches all
// portals from a single place.

import { useEffect, useMemo, useState } from 'react'
import { useEmailVerified } from '../hooks/useEmailVerified'
import { useLocation } from 'react-router-dom'
import { useI18n } from '../i18n'
import { useStudentAuth, getStudentSessionToken } from '../contexts/StudentAuthContext.jsx'
import { useTeacherAuth, getTeacherSessionToken } from '../contexts/TeacherAuthContext.jsx'
import { useAdminAuth, getAdminSessionToken } from '../contexts/AdminAuthContext.jsx'

const BAJLA_NUMBER = '48787126561'           // Bajla's official WhatsApp line
// Once per ACCOUNT, forever (Mike 2026-07-10: re-showing every session was
// irritating). Keyed by the signed-in identity so each account still gets
// its one introduction.
const seenKey = (accountKey) => `em.bajla.popupSeen.v2.${accountKey || 'anon'}`

// Bilingual copy lives here (single-use, not worth threading through i18n JSON).
const COPY = {
  pl: {
    brand: 'EnglishMetro',
    greeting: 'Cześć! Jestem Bajla 👋',
    tagline: 'Twoja pomocna kumpela od angielskiego.',
    intro: 'Napisz do mnie na WhatsAppie, jeśli chcesz zarezerwować lekcję, przełożyć zajęcia albo sprawdzić swoje postępy.',
    cards: {
      book: { title: 'Zarezerwuj lekcję', sub: 'Wybierz dogodny termin.' },
      cancel: { title: 'Odwołaj lub przełóż', sub: 'Zmień plany bez stresu.' },
      progress: { title: 'Sprawdź postępy', sub: 'Zobacz, jak idzie Ci nauka.' },
    },
    mainCta: 'Porozmawiaj z Bajlą na WhatsAppie',
    setupTitle: 'Zanim naprawdę Ci pomogę:',
    setupPhone: 'Zapisz swój numer WhatsApp w profilu — po nim Cię rozpoznam.',
    setupPhoneDone: 'Numer WhatsApp zapisany — rozpoznam Cię.',
    setupLessons: 'Wykup pakiet lekcji, żebym miała co rezerwować.',
    setupLessonsDone: 'Masz lekcje na koncie — mogę rezerwować.',
    setupBuy: 'Kup lekcje →',
    setupChat: 'Napisz do mnie na WhatsAppie — odpowiadam od razu.',
    footer: 'Bezpiecznie. Prywatnie. Wygodnie.',
    closeAria: 'Zamknij',
    lockedTitle: 'Zarezerwuj lekcje, a mnie włączysz',
    lockedBody: 'Działam razem z analizą lekcji AI. Wybierz pakiet i zostaw zaznaczoną analizę (+20 zł za lekcję) — od razu przy zakupie włączam się na stałe.',
    lockedCta: 'Zarezerwuj lekcje i włącz Bajlę →',
    lockedNote: 'Analiza będzie już zaznaczona w koszyku. Możesz ją odznaczyć, ale wtedy nie będę dostępna.',
    consentTitle: 'Jesteś ze mną od początku — zapraszam',
    consentBody: 'Uczysz się z nami, zanim wprowadziliśmy opłatę, więc masz mnie za darmo. Zanim zaczniemy: będę przetwarzać Twój numer telefonu i treść naszych rozmów, żeby Ci pomagać.',
    consentCta: 'Zgadzam się — porozmawiajmy',
    consentBusy: 'Włączam…',
    consentError: 'Nie udało się włączyć. Spróbuj ponownie.',
    consentNote: 'Zgodę możesz wycofać w każdej chwili.',
    consentLink: 'Jak przetwarzamy te dane',
    phoneTitle: 'Najpierw podaj swój numer WhatsApp',
    phoneIntro: 'Zapiszemy go w Twoim profilu, żeby Bajla Cię rozpoznała na WhatsAppie.',
    phonePlaceholder: '+48 600 000 000',
    phoneSave: 'Zapisz i przejdź do WhatsAppa',
    phoneSaving: 'Zapisywanie…',
    phoneError: 'Podaj poprawny numer (min. 9 cyfr).',
    openWhatsApp: 'Otwórz WhatsApp',
    openHint: 'Jeśli WhatsApp nie otworzył się sam, kliknij powyżej.',
    back: '← Wróć',
  },
  en: {
    brand: 'EnglishMetro',
    greeting: "Hi there! I'm Bajla 👋",
    tagline: 'Your learning buddy.',
    intro: 'Message me on WhatsApp to book lessons, cancel or reschedule, and check your progress.',
    cards: {
      book: { title: 'Book lessons', sub: 'Choose a time that works for you.' },
      cancel: { title: 'Cancel or reschedule', sub: 'Change your plans anytime.' },
      progress: { title: 'Check your progress', sub: 'See how your learning is going.' },
    },
    mainCta: 'Chat with Bajla on WhatsApp',
    setupTitle: 'Before I can really help you:',
    setupPhone: 'Save your WhatsApp number to your profile — it is how I recognise you.',
    setupPhoneDone: 'WhatsApp number saved — I will recognise you.',
    setupLessons: 'Buy a lesson package so I have lessons to book for you.',
    setupLessonsDone: 'You have lessons on your account — I can book them.',
    setupBuy: 'Buy lessons →',
    setupChat: 'Message me on WhatsApp — I reply right away.',
    footer: 'Safe. Secure. Private.',
    closeAria: 'Close',
    lockedTitle: 'Book lessons and you switch me on',
    lockedBody: 'I come with the AI lesson analysis. Pick a package and leave the analysis ticked (+20 PLN per lesson) — buying it switches me on for good.',
    lockedCta: 'Book lessons and switch me on →',
    lockedNote: "The analysis will already be ticked in your cart. You can untick it, but then I won't be available.",
    consentTitle: "You've been with us from the start — come in",
    consentBody: 'You were learning with us before this became a paid extra, so you have me for free. One thing first: I process your phone number and what you say to me in order to help.',
    consentCta: "I agree — let's talk",
    consentBusy: 'Switching on…',
    consentError: 'That did not switch on. Please try again.',
    consentNote: 'You can withdraw this at any time.',
    consentLink: 'How we handle this data',
    phoneTitle: 'First, add your WhatsApp number',
    phoneIntro: "We'll save it to your profile so Bajla recognises you on WhatsApp.",
    phonePlaceholder: '+48 600 000 000',
    phoneSave: 'Save & continue to WhatsApp',
    phoneSaving: 'Saving…',
    phoneError: 'Please enter a valid number (at least 9 digits).',
    openWhatsApp: 'Open WhatsApp',
    openHint: "If WhatsApp didn't open on its own, tap above.",
    back: '← Back',
  },
}

// Preloaded WhatsApp messages per intent. Every message greets Bajla first so
// she replies (and the main CTA asks for next week's schedule, per Mike).
const MESSAGES = {
  pl: {
    main: 'Cześć Bajla! 👋 Pokaż mi mój plan lekcji na przyszły tydzień.',
    book: 'Cześć Bajla! Chcę zarezerwować lekcję.',
    cancel: 'Cześć Bajla! Chcę odwołać lub przełożyć lekcję.',
    progress: 'Cześć Bajla! Chcę sprawdzić moje postępy.',
  },
  en: {
    main: 'Hi Bajla! 👋 Show me my lesson schedule for next week.',
    book: 'Hi Bajla! I would like to book a lesson.',
    cancel: 'Hi Bajla! I would like to cancel or reschedule a lesson.',
    progress: 'Hi Bajla! I would like to check my progress.',
  },
}

function waLink(message) {
  return `https://wa.me/${BAJLA_NUMBER}?text=${encodeURIComponent(message)}`
}

async function callConvex(kind, path, args) {
  const res = await fetch(`/api/${kind}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, args }),
  })
  if (!res.ok) throw new Error(`${path} ${res.status}`)
  const payload = await res.json()
  if (payload?.status !== 'success') throw new Error(payload?.errorMessage || path)
  return payload.value
}

export default function BajlaConnectModal() {
  const { lang } = useI18n()
  const location = useLocation()
  const { isStudentAuthenticated, studentUser } = useStudentAuth()
  const { isTeacherAuthenticated } = useTeacherAuth()
  const { isAdminAuthenticated, adminUser } = useAdminAuth()

  // Which user is in front of us, and the session token to act on their behalf.
  const sessionToken = useMemo(() => {
    if (isStudentAuthenticated) return getStudentSessionToken()
    if (isTeacherAuthenticated) return getTeacherSessionToken()
    if (isAdminAuthenticated) return getAdminSessionToken()
    return null
  }, [isStudentAuthenticated, isTeacherAuthenticated, isAdminAuthenticated])

  const { verified, bajlaAllowed, bajlaReason, refresh } = useEmailVerified()
  const [open, setOpen] = useState(false)
  const [hasPhone, setHasPhone] = useState(null)   // null = unknown, then bool
  const [step, setStep] = useState('intro')        // 'intro' | 'phone' | 'ready'
  const [pendingIntent, setPendingIntent] = useState('main')
  const [phone, setPhone] = useState('+48 ')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [readyLink, setReadyLink] = useState('')
  const [remaining, setRemaining] = useState(null)   // student lesson allocation (null = unknown)
  const [consenting, setConsenting] = useState(false)
  const [consentError, setConsentError] = useState('')

  const C = COPY[lang === 'pl' ? 'pl' : 'en']
  const M = MESSAGES[lang === 'pl' ? 'pl' : 'en']
  const accountKey = studentUser?._id || adminUser?._id || (isTeacherAuthenticated ? 'teacher' : null)
  // Bajla is part of the paid AI service (Mike, 2026-08-10): the pitch is still
  // shown to every confirmed student — that is the point of the popup — but she
  // only switches on once the AI add-on has been paid for, which is also what
  // captures the consent to process what they say to her. One purchase covers it
  // for good; it is not re-charged per conversation.
  //
  // Students enrolled before the rule keep her free, so there are two closed
  // states, not one: buy the add-on, or simply agree. `=== false` (not falsy)
  // in both, so the still-loading null never flashes a gate at someone who has
  // her. The reason comes from the server; the client must not guess which.
  const closed = isStudentAuthenticated && bajlaAllowed === false
  const needsConsent = closed && bajlaReason === 'needs_consent'
  const needsPurchase = closed && !needsConsent

  async function grantConsent() {
    setConsenting(true); setConsentError('')
    try {
      const result = await callConvex('mutation', 'students:grantBajlaConsent', { sessionToken })
      if (!result?.ok) throw new Error(result?.reason || 'refused')
      await refresh()
    } catch {
      setConsentError(C.consentError)
    } finally {
      setConsenting(false)
    }
  }
  // /admin is a work tool, not a marketing surface. The popup mounts as
  // aria-modal="true" and its scrim swallows pointer events, so auto-opening it
  // over the console both blocks the first click and tells a screen reader the
  // console behind it is inert. Suppressed wholesale on /admin.
  // /checkout for the same reason and one worse: a returning student who has
  // not dismissed it lands on the payment form behind a full-screen scrim whose
  // checklist tells them to "buy a lesson package" — which is the page they are
  // already on. Nothing may cover the form between the cart and Przelewy24.
  const hideForRoute = /^\/(login|logout|admin|checkout)/i.test(location.pathname)
  // EM-branded popup must not auto-open on a school-branded subdomain
  // (e.g. conversa.englishmetro.com) — it would stomp the school's branding.
  // The minimized launcher stays available; only the auto-show is suppressed.
  const onSchoolSubdomain = typeof document !== 'undefined' && document.documentElement.classList.contains('org-sub')

  // Look up whether the user already has a number on file. We only ever auto-show
  // when they don't — and never twice in one session.
  //
  // Nothing is shown to a student who has not confirmed their e-mail (Mike,
  // 2026-08-10): this popup asks them to save a phone number and buy a package,
  // and neither should be asked of an account we cannot yet reach by mail.
  // `verified` starts null (unknown) so the popup never flashes before the
  // answer arrives.
  useEffect(() => {
    if (!sessionToken || hideForRoute || onSchoolSubdomain) return
    if (verified !== true) return
    let cancelled = false
    callConvex('query', 'bajla:getMyPhone', { sessionToken })
      .then((v) => {
        if (cancelled) return
        const phoneOnFile = Boolean(v?.phone)
        setHasPhone(phoneOnFile)
        let seen = false
        try { seen = localStorage.getItem(seenKey(accountKey)) === '1' } catch { /* ignore */ }
        if (!seen) setOpen(true)
      })
      .catch(() => { if (!cancelled) setHasPhone(false) })
    return () => { cancelled = true }
  }, [sessionToken, hideForRoute, verified])

  // Students: how many lessons they have left, for the setup checklist.
  useEffect(() => {
    if (!open || !studentUser?._id) return
    let cancelled = false
    callConvex('query', 'orders:getStudentAllocation', { studentId: studentUser._id })
      .then((a) => { if (!cancelled) setRemaining(a?.remaining ?? null) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [open, studentUser?._id])

  function dismiss() {
    setOpen(false)
    try { localStorage.setItem(seenKey(accountKey), '1') } catch { /* ignore */ }
  }

  // A CTA was tapped. With a number on file we go straight to WhatsApp (direct
  // user gesture → no popup-blocker issue). Without one, collect it first.
  function onAction(intent) {
    setPendingIntent(intent)
    if (hasPhone) {
      window.open(waLink(M[intent]), '_blank', 'noopener')
      dismiss()
    } else {
      setError('')
      setStep('phone')
    }
  }

  async function savePhoneAndContinue(e) {
    e.preventDefault()
    const digits = phone.replace(/\D/g, '')
    if (digits.length < 9) { setError(C.phoneError); return }
    setSaving(true)
    setError('')
    try {
      await callConvex('mutation', 'bajla:setMyPhone', { sessionToken, phone })
      setHasPhone(true)
      const link = waLink(M[pendingIntent])
      setReadyLink(link)
      setStep('ready')
      // Best-effort auto-open; the visible button is the reliable fallback.
      window.open(link, '_blank', 'noopener')
    } catch {
      setError(C.phoneError)
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  const name = studentUser?.name || adminUser?.name || ''
  const greeting = name ? C.greeting.replace('!', `, ${name.split(' ')[0]}!`) : C.greeting

  return (
    <div className="bjp-overlay" role="dialog" aria-modal="true" aria-label={C.brand}>
      <style>{BJP_CSS}</style>
      <div className="bjp-card">
        <button className="bjp-close" onClick={dismiss} aria-label={C.closeAria}>×</button>
        <div className="bjp-brand">{C.brand}<span>.com</span></div>

        <div className="bjp-grid">
          <div className="bjp-copy">
            {step === 'intro' && (
              <>
                <h2 className="bjp-h2">{greeting}</h2>
                <h3 className="bjp-h3">{C.tagline}</h3>
                <p className="bjp-intro">{C.intro}</p>
                {/* The checklist is for a student who already has Bajla. While
                    she is closed the panel below is the whole message, and a
                    second "Buy lessons →" link beside it just competes with the
                    one CTA Mike asked for. */}
                {isStudentAuthenticated && !closed && (
                  <div className="bjp-setup">
                    <div className="bjp-setup-title">{C.setupTitle}</div>
                    <div className={`bjp-step ${hasPhone ? 'done' : ''}`}>
                      <span className="bjp-step-mark">{hasPhone ? '✓' : '1'}</span>
                      {hasPhone ? C.setupPhoneDone : C.setupPhone}
                    </div>
                    <div className={`bjp-step ${remaining > 0 ? 'done' : ''}`}>
                      <span className="bjp-step-mark">{remaining > 0 ? '✓' : '2'}</span>
                      <span>
                        {remaining > 0 ? C.setupLessonsDone : C.setupLessons}
                        {!(remaining > 0) && studentUser?.slug && (
                          <a className="bjp-step-link" href={`/app/${studentUser.slug}/buy`} onClick={dismiss}> {C.setupBuy}</a>
                        )}
                      </span>
                    </div>
                    <div className="bjp-step">
                      <span className="bjp-step-mark">3</span>
                      {C.setupChat}
                    </div>
                  </div>
                )}
                {needsPurchase ? (
                  <div className="bjp-locked">
                    <div className="bjp-locked-title">{C.lockedTitle}</div>
                    <p className="bjp-locked-body">{C.lockedBody}</p>
                    {studentUser?.slug && (
                      /* ?addon=1 rides through the buy wizard to /checkout, where
                         it starts the AI add-on ticked — this CTA is what says so. */
                      <a className="bjp-wa-btn bjp-locked-cta" href={`/app/${studentUser.slug}/buy?addon=1`} onClick={dismiss}>
                        <span className="bjp-wa-ico">📅</span> {C.lockedCta}
                      </a>
                    )}
                    <p className="bjp-footer">{C.lockedNote}</p>
                  </div>
                ) : needsConsent ? (
                  <div className="bjp-locked">
                    <div className="bjp-locked-title">{C.consentTitle}</div>
                    <p className="bjp-locked-body">{C.consentBody}</p>
                    <button className="bjp-wa-btn" type="button" onClick={grantConsent} disabled={consenting}>
                      <span className="bjp-wa-ico">💬</span> {consenting ? C.consentBusy : C.consentCta}
                    </button>
                    {consentError && <p className="bjp-error" style={{ marginTop: 12 }}>{consentError}</p>}
                    <p className="bjp-footer">
                      {C.consentNote}{' '}
                      <a href="/lesson-analysis" target="_blank" rel="noopener noreferrer"
                        style={{ color: '#cdb4ff' }}>{C.consentLink}</a>
                    </p>
                  </div>
                ) : (
                <>
                <div className="bjp-cards">
                  <button className="bjp-action" onClick={() => onAction('book')}>
                    <span className="bjp-ico">📅</span>
                    <strong>{C.cards.book.title}</strong>
                    <span className="bjp-sub">{C.cards.book.sub}</span>
                  </button>
                  <button className="bjp-action" onClick={() => onAction('cancel')}>
                    <span className="bjp-ico">🔁</span>
                    <strong>{C.cards.cancel.title}</strong>
                    <span className="bjp-sub">{C.cards.cancel.sub}</span>
                  </button>
                  <button className="bjp-action" onClick={() => onAction('progress')}>
                    <span className="bjp-ico">📈</span>
                    <strong>{C.cards.progress.title}</strong>
                    <span className="bjp-sub">{C.cards.progress.sub}</span>
                  </button>
                </div>
                <button className="bjp-wa-btn" onClick={() => onAction('main')}>
                  <span className="bjp-wa-ico">💬</span> {C.mainCta}
                </button>
                <p className="bjp-footer">{C.footer}</p>
                </>
                )}
              </>
            )}

            {step === 'phone' && (
              <form onSubmit={savePhoneAndContinue}>
                <h2 className="bjp-h2 bjp-h2-sm">{C.phoneTitle}</h2>
                <p className="bjp-intro">{C.phoneIntro}</p>
                <input
                  className="bjp-input"
                  type="tel"
                  inputMode="tel"
                  autoFocus
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder={C.phonePlaceholder}
                  aria-label={C.phoneTitle}
                />
                {error && <p className="bjp-error">{error}</p>}
                <button className="bjp-wa-btn" type="submit" disabled={saving}>
                  <span className="bjp-wa-ico">💬</span> {saving ? C.phoneSaving : C.phoneSave}
                </button>
                <button className="bjp-back" type="button" onClick={() => setStep('intro')}>{C.back}</button>
              </form>
            )}

            {step === 'ready' && (
              <>
                <h2 className="bjp-h2 bjp-h2-sm">{C.greeting}</h2>
                <p className="bjp-intro">{C.openHint}</p>
                <a className="bjp-wa-btn" href={readyLink} target="_blank" rel="noopener noreferrer" onClick={dismiss}>
                  <span className="bjp-wa-ico">💬</span> {C.openWhatsApp}
                </a>
                <p className="bjp-footer">{C.footer}</p>
              </>
            )}
          </div>

          <img className="bjp-mascot" src="/brand/em-bajla-icon.webp" alt="Bajla" />
        </div>
      </div>
    </div>
  )
}

const BJP_CSS = `
.bjp-overlay{position:fixed;inset:0;z-index:99990;display:flex;align-items:center;justify-content:center;
  padding:20px;background:rgba(8,4,20,.72);backdrop-filter:blur(6px);animation:bjpfade .25s ease}
@keyframes bjpfade{from{opacity:0}to{opacity:1}}
.bjp-card{position:relative;width:100%;max-width:880px;max-height:92vh;overflow:auto;padding:40px 44px;
  border-radius:32px;color:#fff;font-family:Inter,system-ui,sans-serif;
  background:radial-gradient(120% 120% at 85% 10%,#4a1d8f 0%,#2a0f56 45%,#140826 100%);
  border:1px solid rgba(200,120,255,.4);box-shadow:0 0 60px rgba(150,70,255,.35)}
.bjp-close{position:absolute;top:18px;right:20px;width:42px;height:42px;border-radius:50%;
  border:1px solid rgba(255,255,255,.22);background:rgba(255,255,255,.06);color:#fff;font-size:24px;
  line-height:1;cursor:pointer;transition:.2s}
.bjp-close:hover{background:rgba(255,255,255,.14)}
.bjp-brand{font-weight:800;font-size:22px;letter-spacing:-.01em;margin-bottom:26px}
.bjp-brand span{color:#cdb4ff;font-weight:700}
.bjp-grid{display:grid;grid-template-columns:1fr 240px;gap:28px;align-items:center}
.bjp-h2{font-size:clamp(34px,5vw,56px);line-height:.98;margin:0 0 8px;font-weight:800}
.bjp-h2-sm{font-size:clamp(26px,4vw,38px)}
.bjp-h3{font-size:20px;color:#d98cff;margin:0 0 18px;font-weight:600}
.bjp-intro{color:#ded7ef;font-size:16px;line-height:1.5;margin:0 0 22px;max-width:460px}
.bjp-setup{margin:0 0 20px;padding:14px 16px;border-radius:16px;background:rgba(255,255,255,.05);
  border:1px solid rgba(255,255,255,.12)}
.bjp-setup-title{font-weight:800;font-size:14px;letter-spacing:.02em;margin-bottom:10px;color:#e9ddff}
.bjp-step{display:flex;gap:10px;align-items:flex-start;font-size:13.5px;color:#ded7ef;line-height:1.45;
  margin-bottom:8px}
.bjp-step:last-child{margin-bottom:0}
.bjp-step.done{color:#b7f2cd}
.bjp-step-mark{flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;
  border-radius:50%;font-size:11px;font-weight:800;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.2)}
.bjp-step.done .bjp-step-mark{background:rgba(37,211,102,.3);border-color:rgba(37,211,102,.6)}
.bjp-step-link{color:#7CF2A6;font-weight:700;text-decoration:none}
.bjp-locked{border:1px solid rgba(217,70,239,.30);border-radius:16px;padding:16px 18px;
  background:linear-gradient(180deg,rgba(217,70,239,.10),rgba(139,92,246,.06));margin-bottom:18px}
.bjp-locked-title{font-weight:800;font-size:15px;margin-bottom:6px;color:#f3e8ff}
.bjp-locked-body{font-size:13.5px;line-height:1.6;color:#e9ddff;margin:0 0 14px}
.bjp-locked-cta{background:linear-gradient(135deg,#8B5CF6,#D946EF)!important}
.bjp-cards{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:22px}
.bjp-action{display:flex;flex-direction:column;gap:6px;text-align:left;padding:16px;border-radius:18px;
  background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);color:#fff;cursor:pointer;transition:.18s}
.bjp-action:hover{transform:translateY(-3px);background:rgba(255,255,255,.12)}
.bjp-ico{font-size:22px}
.bjp-action strong{font-size:15px;font-weight:700}
.bjp-sub{font-size:12.5px;color:#c7bfd8;line-height:1.35}
.bjp-wa-btn{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;padding:17px 24px;
  border:none;border-radius:18px;font-weight:800;font-size:18px;color:#fff;cursor:pointer;text-decoration:none;
  background:linear-gradient(135deg,#25D366,#13a84e);box-shadow:0 0 26px rgba(37,211,102,.45);transition:.18s}
.bjp-wa-btn:hover{filter:brightness(1.07);transform:translateY(-2px)}
.bjp-wa-btn:disabled{opacity:.6;cursor:default;transform:none}
.bjp-wa-ico{font-size:20px}
.bjp-footer{margin:16px 0 0;font-size:13px;color:#b9aed4;text-align:center}
.bjp-input{width:100%;padding:15px 18px;border-radius:14px;border:1px solid rgba(255,255,255,.25);
  background:rgba(255,255,255,.08);color:#fff;font-size:18px;margin:6px 0 14px;outline:none}
.bjp-input:focus{border-color:#cc4dff;box-shadow:0 0 0 3px rgba(204,77,255,.25)}
.bjp-input::placeholder{color:#a99fc4}
.bjp-error{color:#ff9db0;font-size:14px;margin:0 0 12px}
.bjp-back{display:block;width:100%;margin-top:12px;background:none;border:none;color:#cdb4ff;font-size:14px;cursor:pointer}
.bjp-mascot{width:100%;max-width:240px;border-radius:26px;display:block;
  filter:drop-shadow(0 0 26px rgba(190,100,255,.55))}
@media (max-width:760px){
  .bjp-card{padding:28px 22px}
  .bjp-grid{grid-template-columns:1fr}
  .bjp-mascot{max-width:170px;margin:0 auto;order:-1}
  .bjp-cards{grid-template-columns:1fr}
}
`
