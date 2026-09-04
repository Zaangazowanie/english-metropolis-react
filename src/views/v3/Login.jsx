import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAdminAuth } from '../../contexts/AdminAuthContext.jsx'
import { useStudentAuth } from '../../contexts/StudentAuthContext.jsx'
import { useOrgTheme } from '../../contexts/OrgThemeContext.jsx'
import { FONT, G, EASE } from '../../design/v3/tokens.js'
import { useV3Theme } from '../../design/v3/ThemeProvider.jsx'
import { Btn, Field, Glass, Skyline } from '../../design/v3/primitives.jsx'
import { useI18n } from '../../i18n'
import { fetchWithTimeout } from '../../practice/lib/practice-cache'
import '../login-v2.css'

// Google OAuth client ID — same client as Mission Control. Authorized JS
// origins (englishmetro.com, staging.englishmetro.com) must be added in
// Google Cloud Console for the GIS button to render without an error.
const GOOGLE_CLIENT_ID = '960729188616-r2ql4rjid9aibbo1psi678gonf8lp04o.apps.googleusercontent.com'

// Calls a Convex action via the same /api/action nginx proxy used by
// /api/mutation and /api/query. Mirrors mutateConvex / queryAdminConvex.
async function callConvexAction(path, args) {
  // 30s AbortController-backed timeout — see practice-cache.ts.
  const response = await fetchWithTimeout('/api/action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, args }),
  })
  if (!response.ok) {
    throw new Error(`${path} failed with ${response.status}`)
  }
  const payload = await response.json()
  if (payload?.status !== 'success') {
    throw new Error(`${path} returned ${payload?.status || 'unknown'}: ${payload?.errorMessage || ''}`)
  }
  return payload.value
}

function SkylineHero({ isDay }) {
  return (
    <svg viewBox="0 0 1600 400" preserveAspectRatio="xMidYMax slice" aria-hidden
      style={{ position: 'absolute', bottom: 0, left: 0, right: 0, width: '100%', height: '55%',
        opacity: isDay ? 0.32 : 0.42, pointerEvents: 'none' }}>
      <defs>
        <linearGradient id="v3skyfade" x1="0" y1="0" x2="0" y2="1">
          {isDay ? (
            <>
              <stop offset="0%" stopColor="#C7B4E8" stopOpacity="0"/>
              <stop offset="50%" stopColor="#A889D4" stopOpacity="0.55"/>
              <stop offset="100%" stopColor="#7E5BBE" stopOpacity="1"/>
            </>
          ) : (
            <>
              <stop offset="0%" stopColor="#0A0618" stopOpacity="0"/>
              <stop offset="50%" stopColor="#12082A" stopOpacity="0.5"/>
              <stop offset="100%" stopColor="#1A0B3A" stopOpacity="1"/>
            </>
          )}
        </linearGradient>
      </defs>
      <g fill="url(#v3skyfade)">
        {[
          [0,280,80],[90,220,70],[170,260,60],[240,180,90],[340,240,65],
          [415,140,100],[525,200,75],[610,260,55],[675,120,85],[770,220,70],
          [850,260,60],[920,150,95],[1025,210,70],[1105,250,58],[1173,160,80],
          [1263,220,72],[1345,260,62],[1417,180,88],[1515,240,68],[1593,270,55],
        ].map(([x, y, h], i) => (
          <rect key={i} x={x} y={y} width={h * 0.75} height={400 - y} rx="1"/>
        ))}
      </g>
      <g fill={isDay ? '#FDEBA3' : '#FBCFE8'} opacity={isDay ? 0.5 : 0.35}>
        {Array.from({ length: 60 }).map((_, i) => (
          <rect key={i} x={80 + (i * 27) % 1440} y={180 + (i * 17) % 200} width="2" height="3"/>
        ))}
      </g>
    </svg>
  )
}

export default function LoginV3() {
  const { T, mode, isMobile } = useV3Theme()
  const { t } = useI18n()
  const isDay = mode === 'day'
  const { adminLogin } = useAdminAuth()
  const { studentLogin, isStudentAuthenticated, resolvedSlug } = useStudentAuth()
  // School-subdomain branding (e.g. conversa.englishmetro.com): swap the EM
  // hero for the school's logo over an ink-navy scene and tint the brand
  // gradient. Auth flows are identical — same backend, same credentials.
  const { theme: orgBrand } = useOrgTheme()
  const branded = !!orgBrand?.logoUrl
  const brandG = branded
    ? 'linear-gradient(135deg, #1863DC 0%, #3b5fe0 55%, #6b00b8 140%)'
    : null
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)
  const googleBtnRef = useRef(null)
  const [googleReady, setGoogleReady] = useState(false)

  // ?next=/checkout — checkout sends returning customers here and needs them
  // back with the cart intact. Same-origin paths only.
  const nextPath = (() => {
    try {
      const raw = new URLSearchParams(window.location.search).get('next') || ''
      return raw.startsWith('/') && !raw.startsWith('//') ? raw : ''
    } catch { return '' }
  })()
  const studentDestination = (slug) => nextPath || `/app/${slug}/dashboard`

  // PWA-launched-from-home-screen flow: when iOS opens the standalone shortcut
  // it lands on /login (manifest start_url). If the user already has a saved
  // session in localStorage[em-student-session] we redirect straight into
  // their dashboard instead of forcing them to re-enter credentials. Without
  // this hook the home-screen shortcut would always show the login form.
  useEffect(() => {
    if (isStudentAuthenticated && resolvedSlug) {
      window.location.replace(studentDestination(resolvedSlug))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStudentAuthenticated, resolvedSlug])

  // ── Google Sign-In handler ────────────────────────────────
  // Receives the GIS credential response, exchanges the ID token for a
  // session via the googleAuth:googleSignIn Convex action, then routes
  // the user to the right place based on `kind`. The existing
  // email+password flow is left untouched — this is purely additive.
  async function handleGoogleCredential(response) {
    setErr('')
    setLoading(true)
    try {
      // GIS returns the JWT in `credential`, NOT `idToken`.
      const idToken = response?.credential
      if (!idToken) {
        setErr(t('login.error.googleNoCred'))
        setLoading(false)
        return
      }
      const result = await callConvexAction('googleAuth:googleSignIn', { idToken })
      // A brand-new Google identity: verified address, but no account yet and
      // no date of birth (Google never sends one) and/or no first AND last
      // name. /signup owns that follow-up step, so hand it the already-verified
      // token and what Google did know; it opens the step without a second popup.
      if (result?.needsDateOfBirth || result?.needsName) {
        try {
          window.sessionStorage.setItem('em-google-pending', JSON.stringify({
            idToken,
            needsDateOfBirth: !!result.needsDateOfBirth,
            needsName: !!result.needsName,
            suggestedFirstName: result.suggestedFirstName || '',
            suggestedLastName: result.suggestedLastName || '',
          }))
        } catch { /* storage blocked: /signup falls back to its own Google button */ }
        window.location.href = `/signup${nextPath ? `?next=${encodeURIComponent(nextPath)}` : ''}`
        return
      }
      if (!result?.success) {
        setErr(result?.error || t('login.error.googleFailed'))
        setLoading(false)
        return
      }
      if (result.kind === 'student') {
        // Persist the same session shape that studentLogin sets so the
        // student-auth context picks it up across reloads. The shape mirrors
        // studentAuth:studentLogin → result.student exactly.
        try {
          window.localStorage.setItem(
            'em-student-session',
            JSON.stringify({ ...result.student, sessionToken: result.sessionToken }),
          )
        } catch {}
        window.location.href = studentDestination(result.student?.slug)
        return
      }
      if (result.kind === 'superadmin') {
        // Phase A1: if the backend issued a session token (a matching users
        // row exists), persist the admin session blob so the admin context
        // and token auto-injection pick it up. Shape mirrors admin:login.
        if (result.sessionToken) {
          try {
            window.sessionStorage.setItem(
              'em-admin-session',
              JSON.stringify({
                user: { email: result.email, role: 'super_admin' },
                sessionToken: result.sessionToken,
              }),
            )
          } catch {}
        }
        window.location.href = '/admin/superadmin'
        return
      }
      if (result.kind === 'conversa_admin') {
        if (result.sessionToken) {
          try {
            window.sessionStorage.setItem(
              'em-admin-session',
              JSON.stringify({
                user: { email: result.email, role: 'admin' },
                sessionToken: result.sessionToken,
              }),
            )
          } catch {}
        }
        window.location.href = '/admin'
        return
      }
      setErr(t('login.error.unrecognized'))
      setLoading(false)
    } catch (ex) {
      setErr(ex.message || t('login.error.googleFailed'))
      setLoading(false)
    }
  }

  // ── Initialise Google Identity Services (one-time per page load) ─
  useEffect(() => {
    if (typeof window === 'undefined') return
    let cancelled = false
    function tryInit() {
      if (cancelled) return
      if (!window.google?.accounts?.id) {
        // GIS script is `async defer`; poll until it's parsed. ~5s max.
        return setTimeout(tryInit, 100)
      }
      try {
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: handleGoogleCredential,
          ux_mode: 'popup',
          auto_select: false,
        })
        setGoogleReady(true)
      } catch (e) {
        // Wrong origin / mis-configured client ID — surface but don't block
        // the password form.
        console.warn('[Google Sign-In init failed]', e)
      }
    }
    tryInit()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Render the Google button into its DOM slot whenever the slot mounts.
  useEffect(() => {
    if (!googleReady || !googleBtnRef.current) return
    if (typeof window === 'undefined' || !window.google?.accounts?.id) return
    // Clear any previous render so re-mounts don't stack buttons.
    googleBtnRef.current.innerHTML = ''
    // GIS width is a fixed px value — size it to the card so it doesn't overflow
    // narrow phones (the card interior is well under the old hard-coded 360px).
    const slotW = googleBtnRef.current.parentElement?.offsetWidth || 360
    const gWidth = Math.max(220, Math.min(400, Math.round(slotW)))
    try {
      window.google.accounts.id.renderButton(googleBtnRef.current, {
        type: 'standard',
        theme: isDay ? 'outline' : 'filled_black',
        size: 'large',
        text: 'continue_with',
        shape: 'pill',
        logo_alignment: 'left',
        width: gWidth,
      })
    } catch (e) {
      console.warn('[Google Sign-In render failed]', e)
    }
  }, [googleReady, isDay])

  // Universal sign-in (Mike, 2026-06-12): ONE form for every kind of account.
  // Try the player/student session first (the overwhelmingly common case),
  // then fall back to the staff login. The two backends have disjoint email
  // sets, so first-success routing is unambiguous. No role is ever shown or
  // asked for on this page.
  async function submit(e) {
    e && e.preventDefault()
    setErr('')
    if (!email || !pw) { setErr(t('login.error.bothFields')); return }
    setLoading(true)
    try {
      const student = await studentLogin(email.trim(), pw)
      if (student?.success) {
        window.location.href = studentDestination(student.student?.slug)
        return
      }
      const admin = await adminLogin(email.trim(), pw)
      if (admin?.success) {
        window.location.href = admin.user?.role === 'super_admin' ? '/admin/superadmin' : '/admin'
        return
      }
      setErr(student?.error || admin?.error || t('login.error.invalid'))
      setLoading(false)
    } catch (ex) {
      setErr(ex.message || t('login.error.failed'))
      setLoading(false)
    }
  }

  return (
    <div style={{ position: 'relative', minHeight: '100vh', overflow: 'hidden',
      background: branded ? '#081226' : (isDay ? '#FBF7F2' : '#050309'),
      color: T.text, fontFamily: FONT.body }}>
      <div aria-hidden style={{ position: 'absolute', inset: 0,
        background: branded
          ? `radial-gradient(ellipse 140% 80% at 50% 122%, rgba(24,99,220,0.34), transparent 62%),
             radial-gradient(ellipse 80% 60% at 86% 10%, rgba(107,0,184,0.20), transparent 60%),
             radial-gradient(ellipse 60% 45% at 8% 26%, rgba(63,131,248,0.12), transparent 58%),
             linear-gradient(180deg, #060d1d 0%, #0b2147 52%, #0d2d62 100%)`
          : isDay
          ? `radial-gradient(ellipse 140% 80% at 50% 120%, rgba(217,70,239,0.08), transparent 60%),
             radial-gradient(ellipse 80% 60% at 85% 15%, rgba(139,92,246,0.08), transparent 60%),
             radial-gradient(ellipse 70% 50% at 15% 30%, rgba(99,102,241,0.06), transparent 60%),
             linear-gradient(180deg, #FDFCFF 0%, #F9F6FE 45%, #F3EEFB 100%)`
          : `radial-gradient(ellipse 140% 80% at 50% 120%, rgba(139,92,246,0.28), transparent 60%),
             radial-gradient(ellipse 80% 60% at 80% 20%, rgba(217,70,239,0.18), transparent 60%),
             linear-gradient(180deg, #030208 0%, #0A0618 45%, #120929 100%)` }}/>
      {!branded && <SkylineHero isDay={isDay}/>}

      <div style={{ position: 'relative', zIndex: 2, minHeight: '100vh',
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : '1fr 460px',
        alignItems: 'center',
        padding: isMobile ? '80px 24px 40px' : '80px 80px',
        gap: isMobile ? 40 : 80, maxWidth: 1840, margin: '0 auto' }}>

        {/* minWidth:0 — without it the grid track defaults to min-width:auto and
            expands to fit the widest content (slogan / hero), overflowing mobile. */}
        <div style={{ minWidth: 0 }}>
          {branded ? (
            <div className="ca-login-hero">
              <div style={{ fontFamily: FONT.body, fontSize: 13, fontWeight: 700,
                letterSpacing: '0.14em', textTransform: 'uppercase', color: '#8db4f7',
                marginBottom: 30, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#8db4f7',
                  boxShadow: '0 0 10px #8db4f7' }}/>
                Portal Szkoły
              </div>
              <img src={orgBrand.logoUrl} alt={orgBrand.orgDisplayName || 'Conversa'}
                style={{ width: isMobile ? '88%' : 'min(560px, 92%)', height: 'auto',
                  filter: 'brightness(0) invert(1)', display: 'block' }}/>
              <p style={{ marginTop: 34, fontSize: isMobile ? 15 : 17,
                color: 'rgba(214,228,252,0.85)', lineHeight: 1.55, maxWidth: 520, fontStyle: 'italic' }}>
                Postępy uczniów, kalendarz i rozliczenia — w jednym miejscu.
              </p>
            </div>
          ) : (
          <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
            <Skyline size={30}/>
            <div style={{ fontFamily: FONT.display, fontWeight: 800, fontSize: 21, letterSpacing: '-0.02em' }}>
              English <span style={{ background: G.brand, WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Metro</span>
              <span style={{ color: T.ember }}>.</span>
            </div>
          </div>
          <h1 style={{ fontFamily: FONT.display, fontWeight: 800,
            fontSize: isMobile ? 'clamp(30px, 9vw, 42px)' : 'clamp(34px, 3.2vw, 46px)',
            lineHeight: 1.05, letterSpacing: '-0.03em', margin: '0 0 12px', color: T.text }}>
            {t('login.kicker')}
          </h1>
          <p style={{ margin: '0 0 26px', fontSize: isMobile ? 14.5 : 16,
            color: T.textDim, lineHeight: 1.6, maxWidth: 480 }}>
            {t('login.slogan')}
          </p>
          {!isMobile && (
            <div className="emlv3-photo">
              <img className="eml-photo-img" src="/home/photo-login.webp" alt="" loading="eager"/>
              <div className="eml-photo-chips">
                <span className="eml-photo-chip">
                  <span className="material-symbols-outlined">videocam</span>
                  Lekcje 1:1 na żywo · 60 min
                </span>
                <span className="eml-photo-chip">
                  <span className="material-symbols-outlined">style</span>
                  Słówka stają się fiszkami
                </span>
              </div>
              <div className="eml-photo-quote">
                <strong>Twoja trasa do płynnego angielskiego zaczyna się tutaj.</strong>
                <span>englishmetro.com</span>
              </div>
            </div>
          )}
          </>
          )}
        </div>

        <Glass padding={32} className={branded ? 'ca-login-card' : undefined} style={{ maxWidth: 460, minWidth: 0,
          background: branded
            ? (isDay
              ? 'linear-gradient(180deg, rgba(255,255,255,0.94) 0%, rgba(244,248,255,0.90) 100%)'
              : 'linear-gradient(180deg, rgba(13,33,71,0.72) 0%, rgba(8,18,38,0.72) 100%)')
            : isDay
            ? 'linear-gradient(180deg, rgba(255,255,255,0.88) 0%, rgba(255,250,244,0.82) 100%)'
            : 'linear-gradient(180deg, rgba(30,20,60,0.55) 0%, rgba(15,10,35,0.55) 100%)',
          border: branded
            ? (isDay ? '1px solid rgba(24,99,220,0.22)' : '1px solid rgba(141,180,247,0.22)')
            : isDay ? '1px solid rgba(162,28,175,0.18)' : '1px solid rgba(255,255,255,0.14)',
          boxShadow: branded
            ? '0 30px 80px -20px rgba(3,10,26,0.6), 0 0 70px -24px rgba(24,99,220,0.45)'
            : isDay
            ? '0 30px 80px -20px rgba(130,60,180,0.22), 0 10px 30px -10px rgba(0,0,0,0.08), 0 0 60px -20px rgba(217,70,239,0.15)'
            : '0 30px 80px -20px rgba(0,0,0,0.6), 0 0 60px -20px rgba(217,70,239,0.25)' }}>

          {/* Universal sign-in: the Student vs School/Admin tabs are gone
              (Mike, 2026-06-12). One form, role auto-detected on submit. */}
          <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.14em',
            textTransform: 'uppercase', color: T.textDim, marginBottom: 18 }}>
            {t('login.cardLabel.student')}
          </div>

          <form onSubmit={submit} autoComplete="on">
            <Field
              label={t('login.field.email.student')}
              value={email} onChange={setEmail}
              icon="mail" autoComplete="username" required
            />
            <Field
              label={t('login.field.password')} type={showPw ? 'text' : 'password'}
              value={pw} onChange={setPw}
              icon="lock" autoComplete="current-password" required
              trailing={
                <button type="button" onClick={() => setShowPw(!showPw)}
                  aria-label={showPw ? t('login.password.hide') : t('login.password.show')}
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer',
                    padding: '0 14px', color: T.textDim }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                    {showPw ? 'visibility_off' : 'visibility'}
                  </span>
                </button>
              }
            />
            {err && (
              <div style={{ marginBottom: 14, padding: '10px 14px',
                background: isDay ? 'rgba(220,38,38,0.08)' : 'rgba(251,113,133,0.12)',
                border: isDay ? '1px solid rgba(220,38,38,0.25)' : '1px solid rgba(251,113,133,0.35)',
                borderRadius: 10, color: T.rose, fontSize: 13 }}>{err}</div>
            )}
            <Btn variant="primary" size="lg" full type="submit" trailingIcon="arrow_forward"
              disabled={loading} onClick={submit}
              style={branded ? { background: brandG, boxShadow: '0 8px 24px -10px rgba(24,99,220,0.55)' } : undefined}>
              {loading ? t('login.button.entering') : t('login.button.student')}
            </Btn>
          </form>

          <div style={{ marginTop: 12, textAlign: 'right' }}>
            <Link to="/reset" style={{ fontSize: 13, color: T.textDim, textDecoration: 'none' }}>
              {t('login.meta.forgot')}
            </Link>
          </div>

          {/* ── Google Sign-In ────────────────────────────────
              Additive auth. Available on both Student and School/Admin tabs —
              the action looks up the verified email in the students table,
              the SUPERADMIN_EMAILS allowlist, and the CONVERSA_ADMIN_EMAILS
              allowlist, then routes accordingly. Falls back gracefully if
              GIS hasn't loaded (e.g. ad-blocker). */}
          <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1, height: 1,
              background: isDay ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.10)' }}/>
            <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.14em',
              textTransform: 'uppercase', color: T.textMute }}>{t('login.divider.or')}</div>
            <div style={{ flex: 1, height: 1,
              background: isDay ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.10)' }}/>
          </div>
          <div style={{ marginTop: 14, display: 'flex', justifyContent: 'center' }}>
            <div ref={googleBtnRef} aria-label={t('login.google.aria')}/>
          </div>
          {!googleReady && (
            <div style={{ marginTop: 10, textAlign: 'center', fontSize: 13,
              color: T.textMute, letterSpacing: '0.05em' }}>
              {t('login.google.loading')}
            </div>
          )}

          <div style={{ marginTop: 18, display: 'flex', justifyContent: 'space-between',
            alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <Link to="/signup"
              style={{ fontSize: 13, color: T.brandInk || T.brand, fontWeight: 700, letterSpacing: '0.08em',
                textDecoration: 'none' }}>{t('login.meta.needAccess')}</Link>
            <div style={{ display: 'flex', gap: 14, fontSize: 13 }}>
              <Link to="/privacy" style={{ color: T.textDim, textDecoration: 'none' }}>{t('login.meta.privacy')}</Link>
              <span style={{ color: T.textMute }}>·</span>
              <Link to="/terms" style={{ color: T.textDim, textDecoration: 'none' }}>{t('login.meta.terms')}</Link>
            </div>
          </div>
        </Glass>
      </div>

      <div style={{ position: 'absolute', bottom: 20, left: 0, right: 0, textAlign: 'center',
        fontSize: 13, letterSpacing: '0.14em', textTransform: 'uppercase',
        color: T.textMute, fontFamily: FONT.body, zIndex: 2 }}>
        {t('login.footer', { year: new Date().getFullYear() })}
      </div>
    </div>
  )
}
