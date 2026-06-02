import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../i18n'
import LanguageSwitcher from '../components/LanguageSwitcher.jsx'
import { useAdminAuth } from '../contexts/AdminAuthContext.jsx'
import { useStudentAuth } from '../contexts/StudentAuthContext.jsx'

/**
 * English Metropolis login landing — big-city skyline video background,
 * shimmering EnglishMetro.com wordmark, neon CTA. Built for the fresh
 * englishmetro.com deployment. Animation is pure CSS — no external libs.
 */
export default function Login() {
  const { t } = useI18n()
  const { adminLogin } = useAdminAuth()
  const { studentLogin } = useStudentAuth()
  const [role, setRole] = useState('student') // 'student' | 'school'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [authError, setAuthError] = useState(null)
  // Easter-egg landing variant — Mike 2026-05-04: ~1 in 7 page-loads,
  // the hero swaps the abstract skyline silhouette for the Chubby Bajla
  // mascot leaning on the wordmark. Pure-random per page-load means each
  // refresh re-rolls (no localStorage stickiness — that's the surprise).
  const [showChubby] = useState(() => Math.random() < (1 / 7))

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setAuthError(null)

    if (role === 'school') {
      // Real Convex-backed login for admins / superadmins.
      try {
        const result = await adminLogin(email.trim(), password)
        if (!result?.success) {
          setAuthError(result?.error || 'Invalid credentials')
          setLoading(false)
          return
        }
        const target = result.user?.role === 'super_admin'
          ? '/admin/superadmin'
          : '/admin'
        window.location.href = target
      } catch (err) {
        setAuthError(err.message || 'Login failed')
        setLoading(false)
      }
      return
    }

    // Real student auth via PBKDF2 password verification
    try {
      const result = await studentLogin(email.trim(), password)
      if (!result?.success) {
        setAuthError(result?.error || 'Invalid credentials')
        setLoading(false)
        return
      }
      const slug = result.student?.slug
      window.location.href = `/app/${slug}/dashboard`
    } catch (err) {
      setAuthError(err.message || 'Login failed')
      setLoading(false)
    }
  }

  return (
    <div className="em-login-root">
      <video
        className="em-login-video"
        autoPlay muted loop playsInline preload="auto"
        poster="/favicon.svg"
      >
        <source src="/em-bg-h264.mp4" type="video/mp4" />
        <source src="/em-bg.mp4" type="video/mp4; codecs=hvc1" />
      </video>
      <div className="em-login-veil" />
      <div className="em-login-grid-overlay" />

      <div className="em-login-topbar">
        <LanguageSwitcher />
      </div>

      <main className="em-login-content">
        <div className="em-login-brand">
          <p className="em-login-kicker">{t('login.kicker')}</p>
          <div className={`em-login-lockup ${showChubby ? 'em-login-lockup--chubby' : ''}`}>
            {showChubby
              ? <img src="/em-chubby-bajla.png" alt="" className="em-login-chubby" />
              : <div className="em-login-skyline" role="img" aria-label="" />}
            <h1 className="em-login-wordmark">
              <span className="em-login-word">English</span>
              <span className="em-login-word em-login-word-metro">Metro</span>
              <span className="em-login-dot">.</span>
              <span className="em-login-word em-login-word-com">com</span>
            </h1>
          </div>
          <p className="em-login-slogan">{t('login.slogan')}</p>
        </div>

        <form onSubmit={handleSubmit} className="em-login-card">
          <div className="em-login-tabs" role="tablist" aria-label={t('login.cardLabel.student')}>
            <button
              type="button" role="tab"
              aria-selected={role === 'student'}
              className={`em-login-tab ${role === 'student' ? 'is-active' : ''}`}
              onClick={() => setRole('student')}
            >{t('login.tab.student')}</button>
            <button
              type="button" role="tab"
              aria-selected={role === 'school'}
              className={`em-login-tab ${role === 'school' ? 'is-active' : ''}`}
              onClick={() => setRole('school')}
            >{t('login.tab.admin')}</button>
          </div>
          <p className="em-login-card-label">
            {role === 'student' ? t('login.cardLabel.student') : t('login.cardLabel.admin')}
          </p>
          <label className="em-login-field">
            <span>{role === 'student' ? t('login.field.email.student') : t('login.field.email.admin')}</span>
            <input
              type="text"
              autoComplete="username"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder={role === 'student' ? t('login.placeholder.email.student') : t('login.placeholder.email.admin')}
              required
            />
          </label>
          <label className="em-login-field">
            <span>{t('login.field.password')}</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder={t('login.placeholder.password')}
              required
            />
          </label>
          {authError && (
            <div
              style={{
                marginBottom: 10,
                padding: '8px 12px',
                borderRadius: 10,
                background: 'rgba(248, 113, 113, 0.12)',
                border: '1px solid rgba(248, 113, 113, 0.32)',
                color: '#fecaca',
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              {authError}
            </div>
          )}
          <button type="submit" className="em-login-button" disabled={loading}>
            <span className="em-login-button-text">
              {loading ? t('login.button.loading') : (role === 'student' ? t('login.button.student') : t('login.button.admin'))}
            </span>
            <span className="em-login-button-arrow">→</span>
          </button>
          <div className="em-login-meta">
            <a href="mailto:hello@englishmetro.com">{t('login.meta.needAccess')}</a>
            <span>·</span>
            <Link to="/privacy">{t('login.meta.privacy')}</Link>
            <span>·</span>
            <Link to="/terms">{t('login.meta.terms')}</Link>
          </div>
        </form>
      </main>

      <footer className="em-login-footer">
        <p>{t('login.footer', { year: new Date().getFullYear() })}</p>
      </footer>
    </div>
  )
}
