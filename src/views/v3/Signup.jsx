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

const GOOGLE_CLIENT_ID = '960729188616-r2ql4rjid9aibbo1psi678gonf8lp04o.apps.googleusercontent.com'

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
      const r = await callConvex('mutation', 'studentAuth:studentSignup', {
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
      if (!idToken) { setErr('Google did not return a credential'); setBusy(false); return }
      const result = await callConvex('action', 'googleAuth:googleSignIn', { idToken })
      if (!result?.success || result.kind !== 'student') {
        setErr(result?.error || 'Google signup failed'); setBusy(false); return
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
        text: 'signup_with', shape: 'pill', logo_alignment: 'left', locale: 'en',
        width: Math.max(220, Math.min(400, Math.round(slotW))),
      })
    } catch (e) { console.warn('[Google signup render failed]', e) }
  }, [googleReady, isDay])

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

      <Glass padding={30} style={{ width: '100%', maxWidth: 440 }}>
        <h1 style={{ fontFamily: FONT.display, fontWeight: 600, fontSize: 28,
          letterSpacing: '-0.02em', margin: 0, color: T.text }}>
          Create your account
        </h1>
        <p style={{ marginTop: 8, fontSize: 14, color: T.textDim, lineHeight: 1.55 }}>
          Sign up, pick a lesson package, and book your first 1:1 lesson with your teacher.
        </p>

        <form onSubmit={submit} style={{ marginTop: 18, display: 'grid', gap: 12 }}>
          <input style={input} placeholder="Full name" value={form.name} autoComplete="name"
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          <input style={input} type="email" placeholder="Email address" value={form.email} autoComplete="email"
            onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
          <input style={input} type="password" placeholder="Password (min. 8 characters)" value={form.password}
            autoComplete="new-password" onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
          <input style={input} type="tel" placeholder="Phone (optional)" value={form.phone} autoComplete="tel"
            onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
          {err && <p style={{ margin: 0, fontSize: 13, color: T.rose }}>{err}</p>}
          <Btn variant="primary" size="lg" type="submit"
            disabled={busy || !form.name.trim() || !form.email.trim() || form.password.length < 8}>
            {busy ? 'Creating your account…' : 'Create account →'}
          </Btn>
        </form>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '16px 0' }}>
          <span style={{ flex: 1, height: 1, background: T.border }}/>
          <span style={{ fontSize: 11, color: T.textDim, letterSpacing: '0.14em' }}>OR</span>
          <span style={{ flex: 1, height: 1, background: T.border }}/>
        </div>
        <div ref={googleBtnRef} style={{ display: 'flex', justifyContent: 'center', minHeight: 44 }}/>

        <p style={{ marginTop: 18, fontSize: 13, color: T.textDim, textAlign: 'center' }}>
          Already have an account?{' '}
          <Link to="/login" style={{ color: T.brandInk || T.brand, fontWeight: 700 }}>Sign in</Link>
        </p>
      </Glass>
    </div>
  )
}
