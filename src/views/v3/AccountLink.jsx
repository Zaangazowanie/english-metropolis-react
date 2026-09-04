// Landing pages for the two links we e-mail students (2026-08-10):
//   /verify?token=…  confirm an e-mail address
//   /reset           ask for a reset link, and /reset?token=… set the new password
//
// One component because the three states share a card, a colour scheme and a
// set of outcomes; splitting them would mean three copies of the same shell.
import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { FONT, G } from '../../design/v3/tokens.js'
import { useV3Theme } from '../../design/v3/ThemeProvider.jsx'
import { Btn, Field, Glass, Skyline } from '../../design/v3/primitives.jsx'
import { useI18n } from '../../i18n'
import { fetchWithTimeout } from '../../practice/lib/practice-cache'
import '../login-v2.css'

async function callConvex(kind, path, args) {
  const response = await fetchWithTimeout(`/api/${kind}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, args }),
  })
  const payload = await response.json()
  if (payload?.status !== 'success') throw new Error(payload?.errorMessage || `${path} failed`)
  return payload.value
}

function Shell({ children }) {
  const { T, mode, isMobile } = useV3Theme()
  const isDay = mode === 'day'
  return (
    <div style={{ position: 'relative', minHeight: '100vh', background: T.bg1, color: T.text,
      fontFamily: FONT.body, display: 'grid', placeItems: 'center',
      padding: isMobile ? '72px 20px 40px' : '80px 24px' }}>
      <div style={{ width: '100%', maxWidth: 460 }}>
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20,
          textDecoration: 'none', color: T.text, justifyContent: 'center' }}>
          <Skyline size={28}/>
          <div style={{ fontFamily: FONT.display, fontWeight: 800, fontSize: 20, letterSpacing: '-0.02em' }}>
            English <span style={{ background: G.brand, WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Metro</span>
            <span style={{ color: T.ember }}>.</span>
          </div>
        </Link>
        <Glass padding={32} style={{ minWidth: 0,
          background: isDay
            ? 'linear-gradient(180deg, rgba(255,255,255,0.88) 0%, rgba(255,250,244,0.82) 100%)'
            : 'linear-gradient(180deg, rgba(30,20,60,0.55) 0%, rgba(15,10,35,0.55) 100%)',
          border: isDay ? '1px solid rgba(162,28,175,0.18)' : '1px solid rgba(255,255,255,0.14)',
          boxShadow: isDay
            ? '0 30px 80px -20px rgba(130,60,180,0.22), 0 10px 30px -10px rgba(0,0,0,0.08)'
            : '0 30px 80px -20px rgba(0,0,0,0.6), 0 0 60px -20px rgba(217,70,239,0.25)' }}>
          {children}
        </Glass>
      </div>
    </div>
  )
}

function Label({ children }) {
  const { T } = useV3Theme()
  return (
    <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase',
      color: T.textDim, marginBottom: 14 }}>{children}</div>
  )
}

function Heading({ children }) {
  const { T } = useV3Theme()
  return (
    <h1 style={{ fontFamily: FONT.display, fontWeight: 800, fontSize: 24, lineHeight: 1.2,
      letterSpacing: '-0.02em', margin: '0 0 10px', color: T.text }}>{children}</h1>
  )
}

function Body({ children }) {
  const { T } = useV3Theme()
  return <p style={{ margin: '0 0 18px', fontSize: 14, lineHeight: 1.6, color: T.textDim }}>{children}</p>
}

function Notice({ tone = 'error', children }) {
  const { T, mode } = useV3Theme()
  const isDay = mode === 'day'
  const good = tone === 'ok'
  return (
    <div role="alert" style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 10, fontSize: 13,
      lineHeight: 1.5,
      background: good ? (isDay ? 'rgba(5,150,105,0.10)' : 'rgba(52,211,153,0.12)')
                       : (isDay ? 'rgba(220,38,38,0.08)' : 'rgba(251,113,133,0.12)'),
      border: good ? (isDay ? '1px solid rgba(5,150,105,0.28)' : '1px solid rgba(52,211,153,0.32)')
                   : (isDay ? '1px solid rgba(220,38,38,0.25)' : '1px solid rgba(251,113,133,0.35)'),
      color: good ? (isDay ? '#047857' : '#6ee7b7') : T.rose }}>{children}</div>
  )
}

function BackToSignIn() {
  const { T } = useV3Theme()
  const { t } = useI18n()
  return (
    <div style={{ marginTop: 18, textAlign: 'center' }}>
      <Link to="/login" style={{ fontSize: 13, color: T.brandInk || T.brand, fontWeight: 700,
        textDecoration: 'none' }}>{t('account.backToSignIn')}</Link>
    </div>
  )
}

// ── /verify?token=… ─────────────────────────────────────────────────────────
export function VerifyEmail() {
  const { t } = useI18n()
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const [state, setState] = useState(token ? 'working' : 'invalid')

  useEffect(() => {
    if (!token) return
    let cancelled = false
    callConvex('mutation', 'studentAuth:verifyEmailToken', { token })
      .then((r) => { if (!cancelled) setState(r?.ok ? 'ok' : (r?.reason === 'expired' ? 'expired' : 'invalid')) })
      .catch(() => { if (!cancelled) setState('error') })
    return () => { cancelled = true }
  }, [token])

  return (
    <Shell>
      <Label>{t('account.label.email')}</Label>
      {state === 'working' && (<><Heading>{t('account.verify.working')}</Heading><Body>{t('account.verify.workingBody')}</Body></>)}
      {state === 'ok' && (
        <>
          <Heading>{t('account.verify.ok')}</Heading>
          <Body>{t('account.verify.okBody')}</Body>
          <Btn variant="primary" size="lg" full trailingIcon="arrow_forward" onClick={() => { window.location.href = '/login' }}>
            {t('account.verify.cta')}
          </Btn>
        </>
      )}
      {(state === 'expired' || state === 'invalid' || state === 'error') && (
        <>
          <Heading>{t('account.verify.bad')}</Heading>
          <Body>{state === 'expired' ? t('account.verify.expiredBody') : t('account.verify.invalidBody')}</Body>
          <BackToSignIn/>
        </>
      )}
    </Shell>
  )
}

// ── /reset and /reset?token=… ───────────────────────────────────────────────
export function ResetPassword() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const token = params.get('token') || ''

  // Request half
  const [email, setEmail] = useState('')
  const [requested, setRequested] = useState(false)
  // Set-new-password half
  const [checking, setChecking] = useState(!!token)
  const [tokenOk, setTokenOk] = useState(false)
  const [maskedEmail, setMaskedEmail] = useState('')
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [showPw, setShowPw] = useState(false)

  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  // Tell a dead link apart from a live one before asking anyone to type a new
  // password twice only to be told at the end that the link had expired.
  useEffect(() => {
    if (!token) return
    let cancelled = false
    callConvex('mutation', 'studentAuth:checkResetToken', { token })
      .then((r) => { if (!cancelled) { setTokenOk(!!r?.ok); setMaskedEmail(r?.maskedEmail || ''); setChecking(false) } })
      .catch(() => { if (!cancelled) { setTokenOk(false); setChecking(false) } })
    return () => { cancelled = true }
  }, [token])

  async function submitRequest(event) {
    event.preventDefault()
    if (busy) return
    setErr('')
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setErr(t('account.reset.badEmail'))
    setBusy(true)
    try {
      // Deliberately ignores the response: the endpoint answers the same way
      // whether or not an account exists, and so must this page.
      await fetchWithTimeout('/api/student/reset-request', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      })
    } catch { /* shown as sent regardless — see above */ }
    setBusy(false)
    setRequested(true)
  }

  async function submitNewPassword(event) {
    event.preventDefault()
    if (busy) return
    setErr('')
    if (pw.length < 8) return setErr(t('account.reset.tooShort'))
    if (pw !== pw2) return setErr(t('account.reset.mismatch'))
    setBusy(true)
    try {
      const result = await callConvex('action', 'studentAuth:resetPasswordWithToken', { token, newPassword: pw })
      if (!result?.success) { setBusy(false); return setErr(result?.error || t('account.reset.failed')) }
      // The reset returns a live session, so land them signed in rather than
      // asking for the password they set four seconds ago.
      try {
        window.localStorage.setItem('em-student-session',
          JSON.stringify({ ...result.student, sessionToken: result.sessionToken }))
      } catch { /* they can still sign in manually */ }
      navigate(`/app/${result.student.slug}`, { replace: true })
    } catch (ex) {
      setBusy(false)
      setErr(ex.message || t('account.reset.failed'))
    }
  }

  if (!token) {
    return (
      <Shell>
        <Label>{t('account.label.password')}</Label>
        {requested ? (
          <>
            <Heading>{t('account.reset.sentTitle')}</Heading>
            <Body>{t('account.reset.sentBody')}</Body>
            <Notice tone="ok">{t('account.reset.sentNote')}</Notice>
            <BackToSignIn/>
          </>
        ) : (
          <>
            <Heading>{t('account.reset.title')}</Heading>
            <Body>{t('account.reset.body')}</Body>
            <form onSubmit={submitRequest}>
              {err && <Notice>{err}</Notice>}
              <Field label={t('login.field.email.student')} value={email} onChange={setEmail}
                icon="mail" autoComplete="email" required/>
              <Btn variant="primary" size="lg" full type="submit" trailingIcon="arrow_forward"
                disabled={busy} onClick={submitRequest}>
                {busy ? t('account.reset.sending') : t('account.reset.cta')}
              </Btn>
            </form>
            <BackToSignIn/>
          </>
        )}
      </Shell>
    )
  }

  return (
    <Shell>
      <Label>{t('account.label.password')}</Label>
      {checking && <><Heading>{t('account.reset.checking')}</Heading><Body>{t('account.verify.workingBody')}</Body></>}
      {!checking && !tokenOk && (
        <>
          <Heading>{t('account.reset.deadTitle')}</Heading>
          <Body>{t('account.reset.deadBody')}</Body>
          <Btn variant="primary" size="lg" full trailingIcon="arrow_forward" onClick={() => navigate('/reset', { replace: true })}>
            {t('account.reset.cta')}
          </Btn>
          <BackToSignIn/>
        </>
      )}
      {!checking && tokenOk && (
        <>
          <Heading>{t('account.reset.newTitle')}</Heading>
          <Body>{maskedEmail ? t('account.reset.newBodyFor', { email: maskedEmail }) : t('account.reset.newBody')}</Body>
          <form onSubmit={submitNewPassword}>
            {err && <Notice>{err}</Notice>}
            <Field label={t('account.reset.newLabel')} type={showPw ? 'text' : 'password'}
              value={pw} onChange={setPw} icon="lock" autoComplete="new-password" required/>
            <Field label={t('account.reset.repeatLabel')} type={showPw ? 'text' : 'password'}
              value={pw2} onChange={setPw2} icon="lock" autoComplete="new-password" required/>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 16px',
              fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={showPw} onChange={(e) => setShowPw(e.target.checked)}/>
              {t('account.reset.showPassword')}
            </label>
            <Btn variant="primary" size="lg" full type="submit" trailingIcon="arrow_forward"
              disabled={busy} onClick={submitNewPassword}>
              {busy ? t('account.reset.saving') : t('account.reset.save')}
            </Btn>
          </form>
        </>
      )}
    </Shell>
  )
}


