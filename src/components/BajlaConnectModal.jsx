import { useRef } from 'react'
import { usePresence, useDismiss } from '../design/v3/motion/index.js'
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
    setupTitle: 'Połączmy Cię z Bajlą:',
    setupPhone: 'Zapisz swój numer WhatsApp w profilu. Po nim Cię rozpoznam.',
    setupPhoneDone: 'Numer WhatsApp zapisany. Rozpoznam Cię.',
    setupLessons: 'Wykup pakiet lekcji, żebym miała co rezerwować.',
    setupLessonsDone: 'Masz lekcje na koncie. Mogę rezerwować.',
    setupBuy: 'Kup lekcje →',
    setupChat: 'Napisz do mnie na WhatsAppie. Odpowiadam od razu.',
    footer: 'Bezpiecznie. Prywatnie. Wygodnie.',
    closeAria: 'Zamknij',
    lockedTitle: 'Zarezerwuj lekcje, a mnie włączysz',
    lockedBody: 'Działam razem z analizą lekcji AI. Wybierz pakiet i zostaw zaznaczoną analizę (+20 zł za lekcję). Przy zakupie włączam się od razu i na stałe.',
    lockedCta: 'Zarezerwuj lekcje i włącz Bajlę →',
    lockedNote: 'Analiza będzie już zaznaczona w koszyku. Możesz ją odznaczyć, ale wtedy nie będę dostępna.',
    consentTitle: 'Jesteś ze mną od początku, zapraszam',
    consentBody: 'Uczysz się z nami, zanim wprowadziliśmy opłatę, więc masz mnie za darmo. Zanim zaczniemy: będę przetwarzać Twój numer telefonu i treść naszych rozmów, żeby Ci pomagać.',
    consentCta: 'Zgadzam się, porozmawiajmy',
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
    setupTitle: 'Let’s get you connected:',
    setupPhone: 'Save your WhatsApp number to your profile. It is how I recognise you.',
    setupPhoneDone: 'WhatsApp number saved. I will recognise you.',
    setupLessons: 'Buy a lesson package so I have lessons to book for you.',
    setupLessonsDone: 'You have lessons on your account. I can book them.',
    setupBuy: 'Buy lessons →',
    setupChat: 'Message me on WhatsApp. I reply right away.',
    footer: 'Safe. Secure. Private.',
    closeAria: 'Close',
    lockedTitle: 'Book lessons and you switch me on',
    lockedBody: 'I come with the AI lesson analysis. Pick a package and leave the analysis ticked (+20 PLN per lesson). Buying it switches me on for good.',
    lockedCta: 'Book lessons and switch me on →',
    lockedNote: "The analysis will already be ticked in your cart. You can untick it, but then I won't be available.",
    consentTitle: "You've been with us from the start, come in",
    consentBody: 'You were learning with us before this became a paid extra, so you have me for free. One thing first: I process your phone number and what you say to me in order to help.',
    consentCta: "I agree, let's talk",
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
    connect: 'Cześć Bajla! Mój numer WhatsApp jest już zapisany na koncie. Sprawdźmy połączenie.',
    book: 'Cześć Bajla! Chcę zarezerwować lekcję.',
    cancel: 'Cześć Bajla! Chcę odwołać lub przełożyć lekcję.',
    progress: 'Cześć Bajla! Chcę sprawdzić moje postępy.',
  },
  en: {
    main: 'Hi Bajla! 👋 Show me my lesson schedule for next week.',
    connect: 'Hi Bajla! I have saved my WhatsApp number in my account. Let’s check the connection.',
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
  const connectRequested = new URLSearchParams(location.search).get('bajla') === 'connect'
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
  // The introduction belongs to a student who has signed up and is inside
  // their own app (Mike, 2026-09-11). It used to auto-open for any signed-in
  // account on any page, including the marketing homepage, so a visitor who
  // had just signed in met it before seeing anything else. Teachers and admins
  // never get the auto-show; the ?bajla=connect link still works anywhere.
  const inStudentApp = isStudentAuthenticated && /^\/app\//i.test(location.pathname)
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
        if (connectRequested) {
          setStep('phone')
          setPendingIntent('connect')
          setError('')
          if (v?.phone) setPhone(v.phone)
          setOpen(true)
        } else if (!seen && inStudentApp) setOpen(true)
      })
      .catch(() => { if (!cancelled) setHasPhone(false) })
    return () => { cancelled = true }
  }, [sessionToken, hideForRoute, verified, connectRequested, inStudentApp])

  // Students: how many lessons they have left, for the setup checklist.
  useEffect(() => {
    if (!open || !studentUser?._id) return
    let cancelled = false
    callConvex('query', 'orders:getStudentAllocation', { sessionToken, studentId: studentUser._id })
      .then((a) => { if (!cancelled) setRemaining(a?.remaining ?? null) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [open, studentUser?._id, sessionToken])

  function dismiss() {
    setOpen(false)
    try { localStorage.setItem(seenKey(accountKey), '1') } catch { /* ignore */ }
  }

  // While open, mark <body> so the floating Bajla launcher (a separate script
  // at a higher z-index) steps aside instead of sitting clickable on the scrim.
  useEffect(() => {
    if (!open) return
    document.body.classList.add('em-bjp-open')
    return () => document.body.classList.remove('em-bjp-open')
  }, [open])

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

  const motion = usePresence(open)
  const panelRef = useRef(null)
  useDismiss(dismiss, panelRef, open)
  if (!motion.mounted) return null

  const name = studentUser?.name || adminUser?.name || ''
  const greeting = name ? C.greeting.replace('!', `, ${name.split(' ')[0]}!`) : C.greeting

  return (
    <div className="bjp-overlay em-motion-overlay" data-motion-state={motion.phase} inert={motion.inert} role="dialog" aria-modal="true" aria-label={C.brand} onClick={(e) => { if (e.target === e.currentTarget) dismiss() }}>
      <style>{BJP_CSS}</style>
      <div ref={panelRef} tabIndex={-1} className={`bjp-card t-modal ${motion.className}`}>
        <button className="bjp-close" onClick={dismiss} aria-label={C.closeAria}>×</button>

        {step === 'intro' && (
          <>
            <header className="bjp-head">
              <img className="bjp-mascot" src="/brand/em-bajla-icon.webp" alt="" />
              <div>
                <h2 className="bjp-h2">{greeting}</h2>
                <p className="bjp-tag">{C.tagline}</p>
              </div>
            </header>
            <p className="bjp-intro">{C.intro}</p>

            {isStudentAuthenticated && !closed && (
              <ol className="bjp-setup" aria-label={C.setupTitle}>
                <li className={hasPhone ? 'done' : ''}>
                  <span className="bjp-mark">{hasPhone ? '✓' : '1'}</span>
                  {hasPhone ? C.setupPhoneDone : C.setupPhone}
                </li>
                <li className={remaining > 0 ? 'done' : ''}>
                  <span className="bjp-mark">{remaining > 0 ? '✓' : '2'}</span>
                  <span>
                    {remaining > 0 ? C.setupLessonsDone : C.setupLessons}
                    {!(remaining > 0) && studentUser?.slug && (
                      <a className="bjp-link" href={`/app/${studentUser.slug}/buy`} onClick={dismiss}> {C.setupBuy}</a>
                    )}
                  </span>
                </li>
                <li><span className="bjp-mark">3</span>{C.setupChat}</li>
              </ol>
            )}

            {needsPurchase ? (
              <div className="bjp-locked">
                <div className="bjp-locked-title">{C.lockedTitle}</div>
                <p className="bjp-locked-body">{C.lockedBody}</p>
                {studentUser?.slug && (
                  /* ?addon=1 rides through the buy wizard to /checkout, where
                     it starts the AI add-on ticked — this CTA is what says so. */
                  <a className="bjp-cta bjp-cta-violet" href={`/app/${studentUser.slug}/buy?addon=1`} onClick={dismiss}>{C.lockedCta}</a>
                )}
                <p className="bjp-note">{C.lockedNote}</p>
              </div>
            ) : needsConsent ? (
              <div className="bjp-locked">
                <div className="bjp-locked-title">{C.consentTitle}</div>
                <p className="bjp-locked-body">{C.consentBody}</p>
                <button className="bjp-cta" type="button" onClick={grantConsent} disabled={consenting}>
                  {consenting ? C.consentBusy : C.consentCta}
                </button>
                {consentError && <p className="bjp-error">{consentError}</p>}
                <p className="bjp-note">
                  {C.consentNote}{' '}
                  <a className="bjp-link" href="/lesson-analysis" target="_blank" rel="noopener noreferrer">{C.consentLink}</a>
                </p>
              </div>
            ) : (
              <>
                <div className="bjp-actions">
                  {[['book', '📅'], ['cancel', '🔁'], ['progress', '📈']].map(([intent, ico]) => (
                    <button key={intent} className="bjp-action" onClick={() => onAction(intent)}>
                      <span className="bjp-ico" aria-hidden="true">{ico}</span>
                      <span className="bjp-action-text">
                        <strong>{C.cards[intent].title}</strong>
                        <span className="bjp-sub">{C.cards[intent].sub}</span>
                      </span>
                      <span className="bjp-chev" aria-hidden="true">›</span>
                    </button>
                  ))}
                </div>
                <button className="bjp-cta" onClick={() => onAction('main')}>
                  <WaGlyph /> {C.mainCta}
                </button>
                <p className="bjp-note">{C.footer}</p>
              </>
            )}
          </>
        )}

        {step === 'phone' && (
          <form className="em-page-enter" onSubmit={savePhoneAndContinue}>
            <header className="bjp-head">
              <img className="bjp-mascot" src="/brand/em-bajla-icon.webp" alt="" />
              <div>
                <h2 className="bjp-h2">{C.phoneTitle}</h2>
                <p className="bjp-tag">{C.phoneIntro}</p>
              </div>
            </header>
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
            <button className="bjp-cta" type="submit" disabled={saving}>
              <WaGlyph /> {saving ? C.phoneSaving : C.phoneSave}
            </button>
            <button className="bjp-back" type="button" onClick={() => setStep('intro')}>{C.back}</button>
          </form>
        )}

        {step === 'ready' && (
          <>
            <header className="bjp-head">
              <img className="bjp-mascot" src="/brand/em-bajla-icon.webp" alt="" />
              <div>
                <h2 className="bjp-h2">{C.greeting}</h2>
                <p className="bjp-tag">{C.openHint}</p>
              </div>
            </header>
            <a className="bjp-cta" href={readyLink} target="_blank" rel="noopener noreferrer" onClick={dismiss}>
              <WaGlyph /> {C.openWhatsApp}
            </a>
            <p className="bjp-note">{C.footer}</p>
          </>
        )}
      </div>
    </div>
  )
}

// WhatsApp mark as a vector, so the CTA does not depend on the platform's
// emoji set (the old 💬 rendered as four different glyphs across devices).
function WaGlyph() {
  return (
    <svg className="bjp-wa" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5.1-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.3.1-.2 0-.3 0-.5l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.8 12 12 0 0 0 4.6 4c1.7.7 2.3.8 3.1.7a2.7 2.7 0 0 0 1.8-1.3c.2-.6.2-1.1.2-1.2l-.5-.3Z"/>
    </svg>
  )
}

// Compact, square-cornered card (Mike, 2026-09-11: the previous one was too
// round and too big). One column, mascot in the header, actions as rows.
const BJP_CSS = `
.bjp-overlay{position:fixed;inset:0;z-index:99990;display:flex;align-items:center;justify-content:center;
  padding:16px;background:rgba(10,6,24,.6);backdrop-filter:blur(4px)}
@keyframes bjpfade{from{opacity:0}to{opacity:1}}
@keyframes bjpcard{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.bjp-card{position:relative;width:100%;max-width:440px;max-height:92vh;overflow:auto;padding:22px 22px 18px;
  border-radius:12px;color:#f4f0ff;font-family:'Sora','Plus Jakarta Sans',Inter,system-ui,sans-serif;
  background:#1a1030;border:1px solid rgba(190,150,255,.28);
  box-shadow:0 24px 60px rgba(0,0,0,.45),0 0 0 1px rgba(0,0,0,.3)}
.bjp-card *{box-sizing:border-box}
@media (prefers-reduced-motion:reduce){.bjp-overlay,.bjp-card{animation:none}.bjp-action,.bjp-cta,.bjp-close{transition:none}}
.bjp-close{position:absolute;top:10px;right:10px;width:30px;height:30px;border-radius:8px;border:0;
  background:transparent;color:#b9aed4;font-size:22px;line-height:1;cursor:pointer;transition:background .15s,color .15s}
.bjp-close:hover{background:rgba(255,255,255,.08);color:#fff}
.bjp-head{display:flex;gap:12px;align-items:center;margin:0 28px 12px 0}
.bjp-mascot{flex:0 0 auto;width:52px;height:52px;border-radius:10px;object-fit:cover;
  box-shadow:0 0 0 1px rgba(190,150,255,.35)}
.bjp-h2{font-size:18px;line-height:1.2;margin:0 0 3px;font-weight:700;letter-spacing:-.01em}
.bjp-tag{font-size:13px;color:#c9a8ff;margin:0;line-height:1.35}
.bjp-intro{color:#cfc6e6;font-size:13.5px;line-height:1.5;margin:0 0 14px}
.bjp-setup{list-style:none;margin:0 0 14px;padding:10px 12px;border-radius:8px;background:rgba(255,255,255,.04);
  border:1px solid rgba(255,255,255,.08);display:grid;gap:7px}
.bjp-setup li{display:flex;gap:9px;align-items:flex-start;font-size:13px;color:#d6cdea;line-height:1.4}
.bjp-setup li.done{color:#9fe7b8}
.bjp-mark{flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;
  border-radius:5px;font-size:11px;font-weight:700;background:rgba(255,255,255,.1);margin-top:1px}
.bjp-setup li.done .bjp-mark{background:rgba(37,211,102,.25);color:#7CF2A6}
.bjp-link{color:#7CF2A6;font-weight:600;text-decoration:none}
.bjp-link:hover{text-decoration:underline}
.bjp-actions{display:grid;gap:6px;margin-bottom:12px}
.bjp-action{display:flex;align-items:center;gap:11px;width:100%;text-align:left;padding:9px 10px;border-radius:8px;
  background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.09);color:#fff;cursor:pointer;
  transition:background .15s,border-color .15s,transform .15s cubic-bezier(.16,1,.3,1)}
.bjp-action:hover{background:rgba(255,255,255,.08);border-color:rgba(190,150,255,.4)}
.bjp-action:active{transform:scale(.99)}
.bjp-ico{font-size:17px;width:22px;text-align:center;flex:0 0 auto}
.bjp-action-text{display:flex;flex-direction:column;gap:1px;min-width:0;flex:1}
.bjp-action strong{font-size:13.5px;font-weight:600}
.bjp-sub{font-size:12px;color:#b9aed4;line-height:1.3}
.bjp-chev{color:#8f80b3;font-size:18px;line-height:1;flex:0 0 auto}
.bjp-locked{border:1px solid rgba(217,70,239,.28);border-radius:8px;padding:12px 13px;
  background:rgba(217,70,239,.07);margin-bottom:8px}
.bjp-locked-title{font-weight:700;font-size:14px;margin-bottom:4px}
.bjp-locked-body{font-size:13px;line-height:1.5;color:#d6cdea;margin:0 0 10px}
.bjp-cta{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:11px 16px;
  border:none;border-radius:8px;font-weight:700;font-size:14px;color:#0b1f13;cursor:pointer;text-decoration:none;
  background:#25D366;transition:filter .15s,transform .15s cubic-bezier(.16,1,.3,1)}
.bjp-cta:hover{filter:brightness(1.06)}
.bjp-cta:active{transform:scale(.99)}
.bjp-cta:disabled{opacity:.6;cursor:default;transform:none}
.bjp-cta-violet{background:#8B5CF6;color:#fff}
.bjp-wa{flex:0 0 auto}
.bjp-note{margin:10px 0 0;font-size:11.5px;color:#9d92bd;text-align:center;line-height:1.4}
.bjp-error{margin:0 0 8px;font-size:12.5px;color:#ff9db0}
.bjp-input{width:100%;padding:10px 12px;border-radius:8px;border:1px solid rgba(255,255,255,.18);
  background:rgba(255,255,255,.05);color:#fff;font-size:15px;margin:4px 0 10px;outline:none;font-family:inherit}
.bjp-input:focus{border-color:#a78bfa;box-shadow:0 0 0 3px rgba(167,139,250,.25)}
.bjp-input::placeholder{color:#8f80b3}
.bjp-back{margin-top:8px;background:none;border:0;color:#b9aed4;font-size:13px;cursor:pointer;padding:6px 0;font-family:inherit}
.bjp-back:hover{color:#fff}
@media (max-width:480px){.bjp-overlay{align-items:flex-end;padding:0}
  .bjp-card{max-width:none;border-radius:12px 12px 0 0;max-height:88vh}}
`
