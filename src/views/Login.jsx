import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../i18n'
import LanguageSwitcher from '../components/LanguageSwitcher.jsx'
import { useAdminAuth } from '../contexts/AdminAuthContext.jsx'
import { useStudentAuth } from '../contexts/StudentAuthContext.jsx'
import { Skyline } from '../design/v3/primitives.jsx'
import './login-v2.css'

/**
 * English Metropolis login — light split-screen (2026-07-23 refresh):
 * form on the left, photography panel on the right, day-first design system,
 * Plus Jakarta Sans. Auth logic and i18n keys unchanged from v1.
 */
export default function Login() {
  const { t, lang } = useI18n()
  const { adminLogin } = useAdminAuth()
  const { studentLogin } = useStudentAuth()
  const [role, setRole] = useState('student') // 'student' | 'school'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [authError, setAuthError] = useState(null)
  // Easter-egg variant — Mike 2026-05-04: ~1 in 7 page-loads the mascot
  // peeks over the photo panel. Pure-random per page-load, no stickiness.
  const [showChubby] = useState(() => Math.random() < (1 / 7))
  const isPl = lang === 'pl'

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
    <div className="eml-root">
      <div className="eml-form-side">
        <div className="eml-top">
          <Link to="/" className="eml-brand" aria-label="English Metro home">
            <Skyline size={28}/>
            <span>English <span className="eml-brand-metro">Metro</span><span className="eml-brand-dot">.</span></span>
          </Link>
          <LanguageSwitcher />
        </div>

        <div className="eml-body">
          <p className="eml-kicker">{t('login.kicker')}</p>
          <h1 className="eml-title">{isPl ? 'Witaj z powrotem.' : 'Welcome back.'}</h1>
          <p className="eml-slogan">{t('login.slogan')}</p>

          <form onSubmit={handleSubmit}>
            <div className="eml-tabs" role="tablist" aria-label={t('login.cardLabel.student')}>
              <button
                type="button" role="tab"
                aria-selected={role === 'student'}
                className={`eml-tab ${role === 'student' ? 'is-active' : ''}`}
                onClick={() => setRole('student')}
              >{t('login.tab.student')}</button>
              <button
                type="button" role="tab"
                aria-selected={role === 'school'}
                className={`eml-tab ${role === 'school' ? 'is-active' : ''}`}
                onClick={() => setRole('school')}
              >{t('login.tab.admin')}</button>
            </div>

            <label className="eml-field">
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
            <label className="eml-field">
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

            {authError && <div className="eml-error" role="alert">{authError}</div>}

            <button type="submit" className="eml-submit" disabled={loading}>
              {loading ? t('login.button.loading') : (role === 'student' ? t('login.button.student') : t('login.button.admin'))}
              <span className="eml-arrow" aria-hidden>→</span>
            </button>

            <div className="eml-meta">
              <a href="mailto:hello@englishmetro.com">{t('login.meta.needAccess')}</a>
              <span>·</span>
              <Link to="/privacy">{t('login.meta.privacy')}</Link>
              <span>·</span>
              <Link to="/terms">{t('login.meta.terms')}</Link>
            </div>
          </form>

          <p className="eml-signup-hint">
            {isPl ? 'Nie masz jeszcze konta?' : 'New to EnglishMetro?'}{' '}
            <Link to="/signup">{isPl ? 'Załóż je za darmo' : 'Create a free account'}</Link>
          </p>
        </div>

        <div className="eml-foot">
          <p>{t('login.footer', { year: new Date().getFullYear() })}</p>
        </div>
      </div>

      <aside className="eml-photo" aria-hidden>
        <img className="eml-photo-img" src="/home/photo-login.webp" alt="" loading="eager"/>
        <div className="eml-photo-chips">
          <span className="eml-photo-chip">
            <span className="material-symbols-outlined">videocam</span>
            {isPl ? 'Lekcje 1:1 na żywo · 60 min' : 'Live 1:1 lessons · 60 min'}
          </span>
          <span className="eml-photo-chip">
            <span className="material-symbols-outlined">style</span>
            {isPl ? 'Słówka stają się fiszkami' : 'Your words become flashcards'}
          </span>
          <span className="eml-photo-chip">
            <span className="material-symbols-outlined">public</span>
            {isPl ? 'Miasto 3D między lekcjami' : 'A 3D city between lessons'}
          </span>
        </div>
        <div className="eml-photo-quote">
          <strong>{isPl ? 'Twoja trasa do płynnego angielskiego zaczyna się tutaj.' : 'Your route to fluent English starts here.'}</strong>
          <span>englishmetro.com</span>
        </div>
        {showChubby && <img className="eml-chubby" src="/em-chubby-bajla.png" alt=""/>}
      </aside>
    </div>
  )
}
