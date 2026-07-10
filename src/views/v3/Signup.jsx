// Signup — self-service account creation for brand-new students (2026-07-10).
// Basic details OR Google. On success the student is signed in and dropped
// straight into the buy-lessons wizard (their first-lesson booking journey).
// ?package=<id> from the pricing page carries through to the wizard.

import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { FONT, G } from '../../design/v3/tokens.js'
import { useV3Theme } from '../../design/v3/ThemeProvider.jsx'
import { Btn, Glass, Skyline } from '../../design/v3/primitives.jsx'
import { fetchWithTimeout } from '../../practice/lib/practice-cache'
import { useI18n } from '../../i18n'

const GOOGLE_CLIENT_ID = '960729188616-r2ql4rjid9aibbo1psi678gonf8lp04o.apps.googleusercontent.com'

const SIGNUP_COPY = {
  en: {
    title: 'Create your account',
    sub: 'Sign up, pick a lesson package, and book your first 1:1 lesson with your teacher.',
    name: 'Full name', email: 'Email address', password: 'Password (min. 8 characters)', phone: 'Phone (optional)',
    submit: 'Create account →', busy: 'Creating your account…', or: 'OR',
    haveAccount: 'Already have an account?', signIn: 'Sign in',
    googleNoCred: 'Google did not return a credential',
    googleStaff: 'That Google account is registered as staff — use Sign in instead.',
    googleFail: 'Google signup failed',
  },
  pl: {
    title: 'Załóż konto',
    sub: 'Zarejestruj się, wybierz pakiet lekcji i zarezerwuj pierwszą lekcję 1:1 ze swoim lektorem.',
    name: 'Imię i nazwisko', email: 'Adres e-mail', password: 'Hasło (min. 8 znaków)', phone: 'Telefon (opcjonalnie)',
    submit: 'Załóż konto →', busy: 'Tworzymy Twoje konto…', or: 'LUB',
    haveAccount: 'Masz już konto?', signIn: 'Zaloguj się',
    googleNoCred: 'Google nie zwróciło poświadczenia',
    googleStaff: 'To konto Google jest kontem zespołu — użyj logowania.',
    googleFail: 'Rejestracja przez Google nie powiodła się',
  },
}

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
  } catch {}
}

export default function Signup() {
  const { T, mode, isMobile } = useV3Theme()
  const { lang, setLang } = useI18n()
  const C = SIGNUP_COPY[lang === 'pl' ? 'pl' : 'en']
  const isDay = mode === 'day'
  const location = useLocation()
  const pkg = new URLSearchParams(location.search).get('package') || ''

  const [form, setForm] = useState({ name: '', email: '', password: '', phone: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const googleBtnRef = useRef(null)
  const [googleReady, setGoogleReady] = useState(false)

  // already signed in → straight to the panel
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem('em-student-session')
      const s = raw && JSON.parse(raw)
      if (s?.slug) window.location.replace(`/app/${s.slug}/dashboard`)
    } catch {}
  }, [])

  const destination = (slug) => `/app/${slug}/buy${pkg ? `?package=${encodeURIComponent(pkg)}` : ''}`

  async function submit(e) {
    e.preventDefault()
    setBusy(true); setErr('')
    try {
      const r = await callConvex('action', 'studentAuth:studentSignupAction', {
        name: form.name, email: form.email, password: form.password,
        phone: form.phone || undefined,
      })
      if (!r?.success) { setErr(r?.error || 'Signup failed'); setBusy(false); return }
      persistSession(r.student, r.sessionToken)
      window.location.href = destination(r.student.slug)
    } catch (e2) {
      setErr(String(e2.message || e2)); setBusy(false)
    }
  }

  async function handleGoogleCredential(response) {
    setErr(''); setBusy(true)
    try {
      const idToken = response?.credential
      if (!idToken) { setErr(C.googleNoCred); setBusy(false); return }
      const result = await callConvex('action', 'googleAuth:googleSignIn', { idToken })
      if (result?.success && result.kind !== 'student') {
        setErr(C.googleStaff); setBusy(false); return
      }
      if (!result?.success) {
        setErr(result?.error || C.googleFail); setBusy(false); return
      }
      persistSession(result.student, result.sessionToken)
      window.location.href = destination(result.student.slug)
    } catch (e2) {
      setErr(String(e2.message || e2)); setBusy(false)
    }
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
  }, [googleReady, isDay, lang])

  const input = {
    padding: '12px 14px', borderRadius: 12, background: T.surfaceLo,
    border: `1px solid ${T.border}`, color: T.text, fontSize: 15, outline: 'none', width: '100%',
  }

  return (
    <div style={{ minHeight: '100vh', background: T.pageBg, display: 'flex',
      flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: isMobile ? '32px 18px' : '48px 32px', fontFamily: FONT.body }}>
      <Link to="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 26 }}>
        <Skyline size={30}/>
        <span style={{ fontFamily: FONT.display, fontWeight: 700, fontSize: 20, color: T.text }}>
          English <span style={{ background: G.brand, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Metro</span>.
        </span>
      </Link>

      <Glass padding={30} style={{ width: '100%', maxWidth: 440, position: 'relative' }}>
        <div style={{ position: 'absolute', top: 18, right: 18, display: 'inline-flex',
          borderRadius: 999, overflow: 'hidden', border: `1px solid ${T.border}` }}>
          {['pl', 'en'].map(l => (
            <button key={l} type="button" onClick={() => setLang(l)}
              style={{ padding: '6px 11px', fontSize: 11, fontWeight: 800, letterSpacing: '0.06em',
                border: 'none', cursor: 'pointer',
                background: lang === l ? G.brand : 'transparent',
                color: lang === l ? '#fff' : T.textDim }}>{l.toUpperCase()}</button>
          ))}
        </div>
        <h1 style={{ fontFamily: FONT.display, fontWeight: 600, fontSize: 28,
          letterSpacing: '-0.02em', margin: 0, color: T.text }}>
          {C.title}
        </h1>
        <p style={{ marginTop: 8, fontSize: 14, color: T.textDim, lineHeight: 1.55 }}>
          {C.sub}
        </p>

        <form onSubmit={submit} style={{ marginTop: 18, display: 'grid', gap: 12 }}>
          <input style={input} placeholder={C.name} value={form.name} autoComplete="name"
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          <input style={input} type="email" placeholder={C.email} value={form.email} autoComplete="email"
            onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
          <input style={input} type="password" placeholder={C.password} value={form.password}
            autoComplete="new-password" onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
          <input style={input} type="tel" placeholder={C.phone} value={form.phone} autoComplete="tel"
            onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
          {err && <p style={{ margin: 0, fontSize: 13, color: T.rose }}>{err}</p>}
          <Btn variant="primary" size="lg" type="submit"
            disabled={busy || !form.name.trim() || !form.email.trim() || form.password.length < 8}>
            {busy ? C.busy : C.submit}
          </Btn>
        </form>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '16px 0' }}>
          <span style={{ flex: 1, height: 1, background: T.border }}/>
          <span style={{ fontSize: 11, color: T.textDim, letterSpacing: '0.14em' }}>{C.or}</span>
          <span style={{ flex: 1, height: 1, background: T.border }}/>
        </div>
        <div ref={googleBtnRef} style={{ display: 'flex', justifyContent: 'center', minHeight: 44 }}/>

        <p style={{ marginTop: 18, fontSize: 13, color: T.textDim, textAlign: 'center' }}>
          {C.haveAccount}{' '}
          <Link to="/login" style={{ color: T.brandInk || T.brand, fontWeight: 700 }}>{C.signIn}</Link>
        </p>
      </Glass>
    </div>
  )
}
