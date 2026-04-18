import { useState } from 'react'
import { useTheme } from '../../design-system/ThemeContext'
import { FONTS, EASE } from '../../design-system/tokens'
import { Eyebrow, Btn, Skyline, Wordmark, Field } from '../../design-system/primitives'
import { useAdminAuth } from '../../contexts/AdminAuthContext.jsx'
import { useStudentAuth } from '../../contexts/StudentAuthContext.jsx'

export default function Login() {
  const { T } = useTheme()
  const { adminLogin } = useAdminAuth()
  const { studentLogin } = useStudentAuth()
  const [phase, setPhase] = useState('cover') // cover | form
  const [role, setRole] = useState('student') // 'student' | 'school'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [authError, setAuthError] = useState(null)

  const cover = phase === 'cover'
  const now = new Date()
  const clockStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  const vol = 'No. CXIV'

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setAuthError(null)

    if (role === 'school') {
      try {
        const result = await adminLogin(email.trim(), password)
        if (!result?.success) {
          setAuthError(result?.error || 'Invalid credentials')
          setLoading(false); return
        }
        const target = result.user?.role === 'super_admin' ? '/admin/superadmin' : '/admin'
        window.location.href = target
      } catch (err) {
        setAuthError(err.message || 'Login failed')
        setLoading(false)
      }
      return
    }

    try {
      const result = await studentLogin(email.trim(), password)
      if (!result?.success) {
        setAuthError(result?.error || 'Invalid credentials')
        setLoading(false); return
      }
      const slug = result.student?.slug
      window.location.href = `/app/${slug}/dashboard`
    } catch (err) {
      setAuthError(err.message || 'Login failed')
      setLoading(false)
    }
  }

  return (
    <div style={{
      position: 'relative', minHeight: '100vh', overflow: 'hidden',
      background: T.bg, color: T.text,
    }}>
      {/* Skyline backdrop */}
      <div style={{
        position: 'absolute', inset: 0,
        opacity: cover ? 0.55 : 0.15,
        transition: `opacity 720ms ${EASE.editorial}`,
      }}>
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '38%' }}>
          <Skyline color={T.brand} opacity={0.45}/>
        </div>
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 60, height: '28%' }}>
          <Skyline color={T.accent} opacity={0.20}/>
        </div>
      </div>

      {/* COVER */}
      <div style={{
        position: 'absolute', inset: 0,
        opacity: cover ? 1 : 0, pointerEvents: cover ? 'auto' : 'none',
        transition: `opacity 600ms ${EASE.editorial}`,
      }}>
        <div style={{
          padding: '48px 64px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <Wordmark size={20}/>
          <div style={{
            fontFamily: FONTS.mono, fontSize: 11, color: T.textMute,
          }}>Warszawa · {clockStr} · {vol}</div>
        </div>
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          textAlign: 'center', padding: '8vh 32px 0',
        }}>
          <Eyebrow color={T.brand}>The English Quarterly · Spring MMXXVI</Eyebrow>
          <h1 style={{
            fontFamily: FONTS.serif, fontStyle: 'italic', fontWeight: 300,
            fontSize: 'clamp(64px, 11vw, 168px)', lineHeight: 0.9,
            letterSpacing: -4, margin: '24px 0 32px', color: T.text, maxWidth: 1100,
          }}>
            English, taught<br/>
            <span style={{ color: T.brand }}>like literature</span>.
          </h1>
          <div style={{
            maxWidth: 580, fontFamily: FONTS.body, fontSize: 17,
            lineHeight: 1.6, color: T.textSoft, marginBottom: 48,
          }}>
            One tutor. One CELTA·DELTA assessor. One fourteen-week arc from B2 to
            C1, scored against the Common European Framework after every lesson,
            and archived as a personal corpus you actually return to.
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            <Btn kind="primary" size="lg" onClick={() => setPhase('form')}>
              Enter the foyer
            </Btn>
            <Btn kind="ghost" size="lg"
              onClick={() => window.open('mailto:hello@englishmetro.com', '_self')}>
              A tour of the building
            </Btn>
          </div>
          <div style={{
            marginTop: 96, display: 'flex', gap: 56, flexWrap: 'wrap',
            justifyContent: 'center',
            fontFamily: FONTS.label, fontSize: 10, letterSpacing: '0.24em',
            textTransform: 'uppercase', color: T.textMute,
          }}>
            <span>· Fourteenth issue</span>
            <span>· A private corpus</span>
            <span>· Five CEFR axes scored live</span>
          </div>
        </div>
      </div>

      {/* FORM */}
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        opacity: cover ? 0 : 1, pointerEvents: cover ? 'none' : 'auto',
        transition: `opacity 720ms ${EASE.editorial} 200ms`,
      }}>
        <form onSubmit={handleSubmit}
          style={{
            width: 460, padding: '56px 48px',
            background: T.panel, border: `1px solid ${T.rule}`,
            transform: cover ? 'translateY(20px)' : 'translateY(0)',
            transition: `transform 720ms ${EASE.editorial} 200ms`,
          }}>
          <Wordmark size={16}/>
          <div style={{ marginTop: 36 }}>
            <Eyebrow color={T.brand}>Members entrance</Eyebrow>
            <h2 style={{
              fontFamily: FONTS.serif, fontStyle: 'italic', fontWeight: 300,
              fontSize: 42, lineHeight: 1, letterSpacing: -1,
              margin: '12px 0 28px', color: T.text,
            }}>Welcome back.</h2>
          </div>

          {/* Role tabs */}
          <div style={{
            display: 'flex', gap: 8, marginBottom: 24,
            padding: 4, background: T.bg, border: `1px solid ${T.ruleSoft}`,
          }}>
            {[['student', 'Student'], ['school', 'School / Admin']].map(([k, l]) => (
              <button key={k} type="button" onClick={() => setRole(k)}
                style={{
                  flex: 1, padding: '10px',
                  background: role === k ? T.brand : 'transparent',
                  color: role === k ? T.bg : T.text,
                  border: 'none',
                  fontFamily: FONTS.label, fontSize: 10, fontWeight: 700,
                  letterSpacing: '0.22em', textTransform: 'uppercase',
                  cursor: 'pointer', transition: `background 180ms ${EASE.springFast}`,
                }}>{l}</button>
            ))}
          </div>

          <Field label="Email" value={email} onChange={setEmail}
            type="text" autoComplete="username"
            placeholder="szymon.conversa@englishmetro.com"/>
          <Field label="Passphrase" value={password} onChange={setPassword}
            type="password" autoComplete="current-password"/>

          {authError && (
            <div style={{
              padding: '12px 0', marginTop: -4, marginBottom: 16,
              fontFamily: FONTS.body, fontStyle: 'italic', fontSize: 14,
              color: T.accent, borderBottom: `1px solid ${T.accent}40`,
            }}>{authError}</div>
          )}

          <div style={{
            marginTop: 28, display: 'flex', justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <button type="button" onClick={() => setPhase('cover')}
              style={{
                background: 'none', border: 'none', color: T.textMute,
                fontFamily: FONTS.label, fontSize: 10, letterSpacing: '0.18em',
                textTransform: 'uppercase', cursor: 'pointer',
              }}>← Back to cover</button>
            <Btn kind="primary" type="submit" disabled={loading}>
              {loading ? 'Opening the doors…' : 'Sign in'}
            </Btn>
          </div>

          <div style={{
            marginTop: 44, paddingTop: 24, borderTop: `1px solid ${T.ruleSoft}`,
            fontFamily: FONTS.body, fontStyle: 'italic', fontSize: 13,
            color: T.textMute, textAlign: 'center',
          }}>
            &ldquo;The level of attention here is what one would hope for from a
            private archive.&rdquo;&nbsp;— a corporate learner, Asseco
          </div>
        </form>
      </div>
    </div>
  )
}
