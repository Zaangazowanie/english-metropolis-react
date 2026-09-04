// Signup: self-service account creation for brand-new students (2026-07-10).
// Basic details OR Google. On success the student is signed in and dropped
// straight into the buy-lessons wizard (their first-lesson booking journey).
// ?package=<id> from the pricing page carries through to the wizard.
//
// 2026-09-03: first name AND last name are compulsory on every path (Mike),
// after a Google signup put a student on the roster as just "Szymon". The form
// asks for the two separately and submits them joined; the server refuses a
// one-word name regardless (enrolmentRules:signupNameProblem).

import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { EASE, FONT, G } from '../../design/v3/tokens.js'
import { useV3Theme } from '../../design/v3/ThemeProvider.jsx'
import { Btn, Glass, Skyline } from '../../design/v3/primitives.jsx'
import { fetchWithTimeout } from '../../practice/lib/practice-cache'
import { useI18n } from '../../i18n'
import { joinName, nameFieldOk } from '../../lib/signup-name.js'

const GOOGLE_CLIENT_ID = '960729188616-r2ql4rjid9aibbo1psi678gonf8lp04o.apps.googleusercontent.com'

// /login parks a brand-new Google identity here and sends the visitor over, so
// the follow-up step below can open straight away without a second Google popup.
export const GOOGLE_PENDING_KEY = 'em-google-pending'

const SIGNUP_COPY = {
  en: {
    title: 'Create your account',
    sub: 'Sign up, pick a lesson package, and book your first 1:1 lesson with your teacher.',
    first: 'First name', last: 'Last name',
    email: 'Email address', password: 'Password', passwordHint: 'Min. 8 characters', phone: 'Phone (optional)',
    submit: 'Create account', busy: 'Creating your account…', or: 'OR',
    haveAccount: 'Already have an account?', signIn: 'Sign in',
    googleNoCred: 'Google did not return a credential',
    googleStaff: 'That Google account is registered as staff. Use Sign in instead.',
    googleFail: 'Google signup failed',
    dob: 'Date of birth',
    dobWhy: 'Accounts are for adults only. Learning with us under 18 is welcome: a parent or guardian holds the account and books the lessons.',
    stepTitle: 'One more thing',
    stepSubDob: 'Google does not tell us your date of birth, so we need it here before we can create your account.',
    stepSubName: 'Google did not give us your full name. Please enter your first name and last name before we create your account.',
    stepSubBoth: 'Google does not tell us your date of birth or your full name, so we need them here before we can create your account.',
    stepSubmit: 'Finish creating my account',
    DOB_REQUIRED: 'Please enter your date of birth.',
    DOB_INVALID: 'Please enter a valid date of birth.',
    DOB_UNDERAGE: 'You must be 18 or over to create an account. A parent or guardian can create one and buy lessons for you.',
    NAME_REQUIRED: 'Please enter your first name and last name.',
    NAME_INCOMPLETE: 'Please enter both your first name and your last name, letters only, at least 2 each.',
  },
  pl: {
    title: 'Załóż konto',
    sub: 'Zarejestruj się, wybierz pakiet lekcji i zarezerwuj pierwszą lekcję 1:1 ze swoim lektorem.',
    first: 'Imię', last: 'Nazwisko',
    email: 'Adres e-mail', password: 'Hasło', passwordHint: 'Min. 8 znaków', phone: 'Telefon (opcjonalnie)',
    submit: 'Załóż konto', busy: 'Tworzymy Twoje konto…', or: 'LUB',
    haveAccount: 'Masz już konto?', signIn: 'Zaloguj się',
    googleNoCred: 'Google nie zwróciło poświadczenia',
    googleStaff: 'To konto Google jest kontem zespołu. Użyj logowania.',
    googleFail: 'Rejestracja przez Google nie powiodła się',
    dob: 'Data urodzenia',
    dobWhy: 'Konto może założyć wyłącznie osoba pełnoletnia. Osoby poniżej 18 lat są u nas mile widziane: konto zakłada i lekcje rezerwuje rodzic lub opiekun.',
    stepTitle: 'Jeszcze jedno',
    stepSubDob: 'Google nie przekazuje nam daty urodzenia, więc potrzebujemy jej tutaj, zanim utworzymy konto.',
    stepSubName: 'Google nie przekazało nam pełnego imienia i nazwiska. Podaj imię i nazwisko, zanim utworzymy konto.',
    stepSubBoth: 'Google nie przekazuje nam daty urodzenia ani pełnego imienia i nazwiska, więc potrzebujemy ich tutaj, zanim utworzymy konto.',
    stepSubmit: 'Dokończ zakładanie konta',
    DOB_REQUIRED: 'Podaj datę urodzenia.',
    DOB_INVALID: 'Podaj poprawną datę urodzenia.',
    DOB_UNDERAGE: 'Konto może założyć wyłącznie osoba, która ukończyła 18 lat. Rodzic lub opiekun może założyć konto i kupić dla Ciebie lekcje.',
    NAME_REQUIRED: 'Podaj imię i nazwisko.',
    NAME_INCOMPLETE: 'Podaj zarówno imię, jak i nazwisko, same litery, co najmniej 2 w każdym.',
  },
}

// Motion lives in a stylesheet so one media query can switch all of it off.
// Inline `animation` would need a matchMedia hook per element instead.
const MOTION_CSS = `
@keyframes emSignupRise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
@keyframes emSignupErrIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
.em-signup-card { animation: emSignupRise 560ms ${EASE.editorial} both; }
.em-signup-step { animation: emSignupRise 420ms ${EASE.editorial} both; }
.em-signup-err { animation: emSignupErrIn 260ms ${EASE.gentle} both; }
.em-signup-input::placeholder { color: inherit; opacity: 0.45; }
@media (prefers-reduced-motion: reduce) {
  .em-signup-card, .em-signup-step, .em-signup-err { animation: none; }
  .em-signup-field, .em-signup-field * { transition: none !important; }
}
`

async function callConvex(kind, path, args) {
  const response = await fetchWithTimeout(`/api/${kind}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, args }),
  })
  const payload = await response.json()
  if (payload?.status !== 'success') throw new Error(payload?.errorMessage || `${path} failed`)
  return payload.value
}

function persistSession(student, sessionToken) {
  try {
    window.localStorage.setItem('em-student-session', JSON.stringify({ ...student, sessionToken }))
  } catch { /* private mode: the redirect still carries the session in memory */ }
}

// Same pill input as design/v3/primitives Field (the one /login uses), with a
// visible 13px label: the site's type floor, and a placeholder is not a label.
function SField({ label, hint, value, onChange, type = 'text', autoComplete, required, max, invalid, placeholder, inputMode }) {
  const { T } = useV3Theme()
  const [focus, setFocus] = useState(false)
  const ring = invalid ? 'rgba(225,29,72,0.55)' : 'rgba(217,70,239,0.5)'
  return (
    <label className="em-signup-field" style={{ display: 'block', minWidth: 0 }}>
      <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8,
        fontSize: 13, fontWeight: 700, letterSpacing: '0.04em', color: T.textDim, marginBottom: 7 }}>
        <span>{label}{required ? ' *' : ''}</span>
        {hint && <span style={{ fontWeight: 500, letterSpacing: 0 }}>{hint}</span>}
      </span>
      <span style={{ display: 'flex', alignItems: 'center',
        background: T.surface,
        border: `1px solid ${focus ? ring : (invalid ? 'rgba(225,29,72,0.35)' : T.border)}`,
        borderRadius: 999, padding: '2px 4px 2px 18px',
        boxShadow: focus ? `0 0 0 3px ${invalid ? 'rgba(225,29,72,0.14)' : 'rgba(217,70,239,0.15)'}` : 'none',
        transition: `border-color 200ms ${EASE.springFast}, box-shadow 200ms ${EASE.springFast}` }}>
        <input className="em-signup-input" type={type} value={value} max={max} placeholder={placeholder}
          autoComplete={autoComplete} required={required} inputMode={inputMode}
          aria-invalid={invalid || undefined}
          onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
          onChange={e => onChange(e.target.value)}
          // 16px, not smaller: iOS Safari zooms the page on focus under 16px.
          style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none',
            padding: '12px 14px 12px 0', fontSize: 16, fontFamily: FONT.body, color: T.text, width: '100%',
            colorScheme: 'inherit' }}/>
      </span>
    </label>
  )
}

export default function Signup() {
  const { T, mode, isMobile } = useV3Theme()
  const { lang, setLang } = useI18n()
  const C = SIGNUP_COPY[lang === 'pl' ? 'pl' : 'en']
  const isDay = mode === 'day'
  const location = useLocation()
  const pkg = new URLSearchParams(location.search).get('package') || ''
  // ?next=/play/ : the World beta sends visitors here and wants them back.
  // Same-origin paths only, matching the sanitising in v3/Login.jsx.
  const nextPath = (() => {
    try {
      const raw = new URLSearchParams(location.search).get('next') || ''
      return raw.startsWith('/') && !raw.startsWith('//') ? raw : ''
    } catch { return '' }
  })()

  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', password: '', phone: '', dateOfBirth: '' })
  const [touched, setTouched] = useState({})
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const googleBtnRef = useRef(null)
  const [googleReady, setGoogleReady] = useState(false)
  // Google verifies the address but never the birthdate, and its `name` can be
  // a single word. When it hands us a brand-new identity we park the (already
  // verified) ID token here and ask for whatever is missing before the account
  // is created; see googleAuth:googleSignIn.
  const [pendingGoogle, setPendingGoogle] = useState(null) // { idToken, needsName, needsDateOfBirth }
  const [googleForm, setGoogleForm] = useState({ firstName: '', lastName: '', dateOfBirth: '' })

  // An 18th birthday today is the youngest acceptable date, so the picker
  // cannot offer a younger one. Calendar arithmetic, not 18×365.25 days, or the
  // boundary drifts by a day across leap years and turns away someone who is
  // exactly 18. The server checks regardless; this just saves a round trip.
  const maxDob = (() => {
    const d = new Date()
    d.setFullYear(d.getFullYear() - 18)
    return d.toISOString().slice(0, 10)
  })()
  // Localise the server's refusal where we recognise it, rather than printing
  // an English sentence onto a Polish page.
  const serverMessage = (r) => (r?.code && C[r.code]) || r?.error || ''

  // already signed in: straight to the panel
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem('em-student-session')
      const s = raw && JSON.parse(raw)
      if (s?.slug) window.location.replace(nextPath || `/app/${s.slug}/dashboard`)
    } catch { /* unreadable storage: show the form */ }
  }, [nextPath])

  // Arrived from /login with a brand-new Google identity: open the follow-up
  // step directly. One-shot; the token is consumed from storage on read.
  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(GOOGLE_PENDING_KEY)
      if (!raw) return
      window.sessionStorage.removeItem(GOOGLE_PENDING_KEY)
      const p = JSON.parse(raw)
      if (!p?.idToken) return
      openGoogleStep(p.idToken, p)
    } catch { /* nothing parked: plain signup */ }
  }, [])

  const destination = (slug) => nextPath || `/app/${slug}/buy${pkg ? `?package=${encodeURIComponent(pkg)}` : ''}`

  const firstOk = nameFieldOk(form.firstName)
  const lastOk = nameFieldOk(form.lastName)
  const canSubmit = !busy && firstOk && lastOk && !!form.email.trim() && form.password.length >= 8 && !!form.dateOfBirth
  const set = (k) => (v) => setForm(f => ({ ...f, [k]: v }))
  const touch = (k) => () => setTouched(t => ({ ...t, [k]: true }))

  async function submit(e) {
    e.preventDefault()
    if (!canSubmit) return
    setBusy(true); setErr('')
    try {
      const r = await callConvex('action', 'studentAuth:studentSignupAction', {
        name: joinName(form.firstName, form.lastName), email: form.email, password: form.password,
        phone: form.phone || undefined, dateOfBirth: form.dateOfBirth,
      })
      if (!r?.success) { setErr(serverMessage(r) || 'Signup failed'); setBusy(false); return }
      persistSession(r.student, r.sessionToken)
      window.location.href = destination(r.student.slug)
    } catch (e2) {
      setErr(String(e2.message || e2)); setBusy(false)
    }
  }

  function openGoogleStep(idToken, result) {
    setPendingGoogle({
      idToken,
      needsName: !!result.needsName,
      needsDateOfBirth: !!result.needsDateOfBirth,
    })
    setGoogleForm(g => ({
      firstName: g.firstName || result.suggestedFirstName || '',
      lastName: g.lastName || result.suggestedLastName || '',
      dateOfBirth: g.dateOfBirth,
    }))
  }

  // `extra` is empty on the first call and carries the follow-up fields on the
  // retry. Existing students never need it: they match a student row long
  // before the signup branch is reached.
  async function submitGoogle(idToken, extra = {}) {
    setErr(''); setBusy(true)
    try {
      const args = { idToken }
      if (extra.dateOfBirth) args.dateOfBirth = extra.dateOfBirth
      if (extra.firstName !== undefined) args.firstName = extra.firstName.trim()
      if (extra.lastName !== undefined) args.lastName = extra.lastName.trim()
      const result = await callConvex('action', 'googleAuth:googleSignIn', args)
      if (result?.needsDateOfBirth || result?.needsName) {
        openGoogleStep(idToken, result)
        if (result.code) setErr(serverMessage(result))
        setBusy(false)
        return
      }
      if (result?.success && result.kind !== 'student') {
        setErr(C.googleStaff); setBusy(false); return
      }
      if (!result?.success) {
        setErr(serverMessage(result) || C.googleFail); setBusy(false); return
      }
      persistSession(result.student, result.sessionToken)
      window.location.href = destination(result.student.slug)
    } catch (e2) {
      setErr(String(e2.message || e2)); setBusy(false)
    }
  }

  async function handleGoogleCredential(response) {
    const idToken = response?.credential
    if (!idToken) { setErr(C.googleNoCred); return }
    await submitGoogle(idToken)
  }

  useEffect(() => {
    let cancelled = false
    function tryInit() {
      if (cancelled) return
      if (!window.google?.accounts?.id) return setTimeout(tryInit, 100)
      try {
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID, callback: handleGoogleCredential,
          ux_mode: 'popup', auto_select: false,
        })
        setGoogleReady(true)
      } catch (e) { console.warn('[Google signup init failed]', e) }
    }
    tryInit()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!googleReady || !googleBtnRef.current || !window.google?.accounts?.id) return
    googleBtnRef.current.innerHTML = ''
    const slotW = googleBtnRef.current.parentElement?.offsetWidth || 360
    try {
      window.google.accounts.id.renderButton(googleBtnRef.current, {
        type: 'standard', theme: isDay ? 'outline' : 'filled_black', size: 'large',
        text: 'signup_with', shape: 'pill', logo_alignment: 'left', locale: lang === 'pl' ? 'pl' : 'en',
        width: Math.max(220, Math.min(400, Math.round(slotW))),
      })
    } catch (e) { console.warn('[Google signup render failed]', e) }
  }, [googleReady, isDay, lang, pendingGoogle])

  // Follow-up step state
  const gFirstOk = nameFieldOk(googleForm.firstName)
  const gLastOk = nameFieldOk(googleForm.lastName)
  const googleStepReady = !!pendingGoogle && !busy &&
    (!pendingGoogle.needsName || (gFirstOk && gLastOk)) &&
    (!pendingGoogle.needsDateOfBirth || !!googleForm.dateOfBirth)
  const stepSub = pendingGoogle?.needsName && pendingGoogle?.needsDateOfBirth ? C.stepSubBoth
    : pendingGoogle?.needsName ? C.stepSubName : C.stepSubDob

  const errBox = err && (
    <div key={err} className="em-signup-err" role="alert" style={{ padding: '10px 14px',
      background: isDay ? 'rgba(220,38,38,0.08)' : 'rgba(251,113,133,0.12)',
      border: isDay ? '1px solid rgba(220,38,38,0.25)' : '1px solid rgba(251,113,133,0.35)',
      borderRadius: 12, color: T.rose, fontSize: 13, lineHeight: 1.5 }}>{err}</div>
  )
  const nameRow = { display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }

  return (
    <div style={{ position: 'relative', minHeight: '100vh', overflow: 'hidden',
      background: isDay ? '#FBF7F2' : '#050309', color: T.text, fontFamily: FONT.body }}>
      <style>{MOTION_CSS}</style>
      <div aria-hidden style={{ position: 'absolute', inset: 0,
        background: isDay
          ? `radial-gradient(ellipse 140% 80% at 50% 120%, rgba(217,70,239,0.08), transparent 60%),
             radial-gradient(ellipse 80% 60% at 85% 15%, rgba(139,92,246,0.08), transparent 60%),
             radial-gradient(ellipse 70% 50% at 15% 30%, rgba(99,102,241,0.06), transparent 60%),
             linear-gradient(180deg, #FDFCFF 0%, #F9F6FE 45%, #F3EEFB 100%)`
          : `radial-gradient(ellipse 140% 80% at 50% 120%, rgba(139,92,246,0.28), transparent 60%),
             radial-gradient(ellipse 80% 60% at 80% 20%, rgba(217,70,239,0.18), transparent 60%),
             linear-gradient(180deg, #030208 0%, #0A0618 45%, #120929 100%)` }}/>

      <div style={{ position: 'relative', zIndex: 2, minHeight: '100vh', display: 'flex',
        flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: isMobile ? '40px 18px' : '56px 32px' }}>
        <Link to="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 22 }}>
          <Skyline size={30}/>
          <span style={{ fontFamily: FONT.display, fontWeight: 800, fontSize: 21, letterSpacing: '-0.02em', color: T.text }}>
            English <span style={{ background: G.brand, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Metro</span>
            <span style={{ color: T.ember }}>.</span>
          </span>
        </Link>

        <Glass padding={isMobile ? 24 : 32} className="em-signup-card" style={{ width: '100%', maxWidth: 460, minWidth: 0, position: 'relative',
          background: isDay
            ? 'linear-gradient(180deg, rgba(255,255,255,0.88) 0%, rgba(255,250,244,0.82) 100%)'
            : 'linear-gradient(180deg, rgba(30,20,60,0.55) 0%, rgba(15,10,35,0.55) 100%)',
          border: isDay ? '1px solid rgba(162,28,175,0.18)' : '1px solid rgba(255,255,255,0.14)',
          boxShadow: isDay
            ? '0 30px 80px -20px rgba(130,60,180,0.22), 0 10px 30px -10px rgba(0,0,0,0.08), 0 0 60px -20px rgba(217,70,239,0.15)'
            : '0 30px 80px -20px rgba(0,0,0,0.6), 0 0 60px -20px rgba(217,70,239,0.25)' }}>
          <div style={{ position: 'absolute', top: 18, right: 18, display: 'inline-flex',
            borderRadius: 999, overflow: 'hidden', border: `1px solid ${T.border}` }}>
            {['pl', 'en'].map(l => (
              <button key={l} type="button" onClick={() => setLang(l)} aria-pressed={lang === l}
                style={{ padding: '6px 11px', fontSize: 13, fontWeight: 800, letterSpacing: '0.06em',
                  border: 'none', cursor: 'pointer', fontFamily: FONT.body,
                  background: lang === l ? G.brand : 'transparent',
                  color: lang === l ? '#fff' : T.textDim,
                  transition: `background 200ms ${EASE.springFast}, color 200ms ${EASE.springFast}` }}>{l.toUpperCase()}</button>
            ))}
          </div>
          <h1 style={{ fontFamily: FONT.display, fontWeight: 800, fontSize: isMobile ? 26 : 30,
            lineHeight: 1.1, letterSpacing: '-0.03em', margin: '0 84px 0 0', color: T.text }}>
            {C.title}
          </h1>
          <p style={{ margin: '10px 0 0', fontSize: 14, color: T.textDim, lineHeight: 1.55 }}>
            {C.sub}
          </p>

          {pendingGoogle ? (
            /* Google verified them, but we still lack a date of birth and/or a
               first and last name. Nothing is created until this step is answered. */
            <form key="google-step" className="em-signup-step"
              onSubmit={(e) => { e.preventDefault(); if (googleStepReady) submitGoogle(pendingGoogle.idToken, googleForm) }}
              style={{ marginTop: 22, display: 'grid', gap: 14 }}>
              <h2 style={{ fontFamily: FONT.display, fontWeight: 700, fontSize: 20, margin: 0, color: T.text }}>
                {C.stepTitle}
              </h2>
              <p style={{ margin: 0, fontSize: 13.5, color: T.textDim, lineHeight: 1.55 }}>{stepSub}</p>
              {pendingGoogle.needsName && (
                <div style={nameRow}>
                  <SField label={C.first} value={googleForm.firstName} required autoComplete="given-name"
                    invalid={touched.gFirst && !gFirstOk}
                    onChange={(v) => { setGoogleForm(g => ({ ...g, firstName: v })); setTouched(t => ({ ...t, gFirst: true })) }} />
                  <SField label={C.last} value={googleForm.lastName} required autoComplete="family-name"
                    invalid={touched.gLast && !gLastOk}
                    onChange={(v) => { setGoogleForm(g => ({ ...g, lastName: v })); setTouched(t => ({ ...t, gLast: true })) }} />
                </div>
              )}
              {pendingGoogle.needsDateOfBirth && (
                <>
                  <SField label={C.dob} type="date" max={maxDob} value={googleForm.dateOfBirth} required autoComplete="bday"
                    onChange={(v) => setGoogleForm(g => ({ ...g, dateOfBirth: v }))} />
                  <p style={{ margin: 0, fontSize: 13, color: T.textDim, lineHeight: 1.5 }}>{C.dobWhy}</p>
                </>
              )}
              {errBox}
              <Btn variant="primary" size="lg" full type="submit" trailingIcon="arrow_forward" disabled={!googleStepReady}>
                {busy ? C.busy : C.stepSubmit}
              </Btn>
            </form>
          ) : (
          <>
          <form onSubmit={submit} autoComplete="on" style={{ marginTop: 22, display: 'grid', gap: 14 }}>
            <div style={nameRow}>
              <SField label={C.first} value={form.firstName} required autoComplete="given-name"
                invalid={touched.firstName && !firstOk}
                onChange={(v) => { set('firstName')(v); touch('firstName')() }} />
              <SField label={C.last} value={form.lastName} required autoComplete="family-name"
                invalid={touched.lastName && !lastOk}
                onChange={(v) => { set('lastName')(v); touch('lastName')() }} />
            </div>
            <SField label={C.email} type="email" value={form.email} required autoComplete="email" inputMode="email"
              onChange={set('email')} />
            <SField label={C.password} hint={C.passwordHint} type="password" value={form.password} required
              autoComplete="new-password" onChange={set('password')} />
            <SField label={C.dob} type="date" max={maxDob} value={form.dateOfBirth} required autoComplete="bday"
              onChange={set('dateOfBirth')} />
            <p style={{ margin: '-4px 0 0', fontSize: 13, color: T.textDim, lineHeight: 1.5 }}>{C.dobWhy}</p>
            <SField label={C.phone} type="tel" value={form.phone} autoComplete="tel" inputMode="tel"
              onChange={set('phone')} />
            {errBox}
            <Btn variant="primary" size="lg" full type="submit" trailingIcon="arrow_forward" disabled={!canSubmit}>
              {busy ? C.busy : C.submit}
            </Btn>
          </form>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '18px 0 14px' }}>
            <span style={{ flex: 1, height: 1, background: isDay ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.10)' }}/>
            <span style={{ fontSize: 13, fontWeight: 700, color: T.textDim, letterSpacing: '0.14em' }}>{C.or}</span>
            <span style={{ flex: 1, height: 1, background: isDay ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.10)' }}/>
          </div>
          <div ref={googleBtnRef} style={{ display: 'flex', justifyContent: 'center', minHeight: 44 }}/>
          </>
          )}

          <p style={{ margin: '18px 0 0', fontSize: 13, color: T.textDim, textAlign: 'center' }}>
            {C.haveAccount}{' '}
            <Link to="/login" style={{ color: T.brandInk || T.brand, fontWeight: 700 }}>{C.signIn}</Link>
          </p>
        </Glass>
      </div>
    </div>
  )
}
