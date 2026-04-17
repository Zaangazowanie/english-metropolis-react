import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAdminAuth } from '../../contexts/AdminAuthContext.jsx'
import { useI18n } from '../../i18n'

export default function Login() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const location = useLocation()
  const { adminLogin, isAdminAuthenticated } = useAdminAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (isAdminAuthenticated) {
      navigate('/admin', { replace: true })
    }
  }, [isAdminAuthenticated, navigate])

  async function handleSubmit(event) {
    event.preventDefault()
    setSubmitting(true)
    setError('')

    try {
      const result = await adminLogin(email.trim(), password)

      if (!result?.success) {
        setError(result?.error || t('adminLogin.invalid'))
        return
      }

      const destination = location.state?.from || '/admin'
      navigate(destination, { replace: true })
    } catch {
      setError(t('adminLogin.unreachable'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl items-center justify-center">
        <section className="glass-panel grid w-full max-w-4xl overflow-hidden rounded-[2rem] border border-white/50 editorial-shadow lg:grid-cols-[1.05fr,0.95fr]">
          <div className="relative overflow-hidden px-6 py-8 sm:px-8 sm:py-10">
            <div aria-hidden="true" className="glass-accent-orb orb-section-blue"></div>
            <div className="flex items-center gap-2">
              <span className="em-brand-skyline" aria-hidden="true" />
              <p className="font-label text-xs font-bold uppercase tracking-[0.2em] text-sky-700">EnglishMetro<span className="text-fuchsia-500">.com</span></p>
            </div>
            <h1 className="mt-3 font-headline text-4xl text-slate-900 sm:text-5xl">{t('adminLogin.title')}</h1>
            <p className="mt-4 max-w-md text-sm leading-7 text-slate-600">
              {t('adminLogin.intro')}
            </p>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              <div className="liquid-glass-card rounded-[1.25rem] border border-white/60 px-4 py-4">
                <p className="font-label text-xs font-bold uppercase tracking-[0.2em] text-slate-500">{t('adminLogin.card.school')}</p>
                <p className="mt-2 text-sm font-semibold text-slate-900">Conversa</p>
              </div>
              <div className="liquid-glass-card rounded-[1.25rem] border border-white/60 px-4 py-4">
                <p className="font-label text-xs font-bold uppercase tracking-[0.2em] text-slate-500">{t('adminLogin.card.scope')}</p>
                <p className="mt-2 text-sm font-semibold text-slate-900">{t('adminLogin.card.scopeValue')}</p>
              </div>
              <div className="liquid-glass-card rounded-[1.25rem] border border-white/60 px-4 py-4">
                <p className="font-label text-xs font-bold uppercase tracking-[0.2em] text-slate-500">{t('adminLogin.card.access')}</p>
                <p className="mt-2 text-sm font-semibold text-slate-900">{t('adminLogin.card.accessValue')}</p>
              </div>
            </div>
          </div>

          <div className="border-t border-white/60 bg-white/45 px-6 py-8 backdrop-blur-xl sm:px-8 sm:py-10 lg:border-t-0 lg:border-l">
            <form onSubmit={handleSubmit} className="liquid-glass-card rounded-[1.75rem] border border-white/60 px-5 py-5 sm:px-6 sm:py-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-label text-xs font-bold uppercase tracking-[0.24em] text-slate-500">{t('adminLogin.form.kicker')}</p>
                  <h2 className="mt-2 font-headline text-3xl text-slate-900">{t('adminLogin.form.signIn')}</h2>
                </div>
                <span className="material-symbols-outlined rounded-full border border-slate-200/70 bg-white p-3 text-slate-500">shield_lock</span>
              </div>

              <div className="mt-6 space-y-4">
                <label className="block">
                  <span className="font-label text-xs font-bold uppercase tracking-[0.2em] text-slate-500">{t('login.field.email.admin')}</span>
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                    autoComplete="email"
                    className="mt-2 w-full rounded-[1.25rem] border border-slate-200/70 bg-white/90 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                    placeholder="admin@conversa.school"
                  />
                </label>

                <label className="block">
                  <span className="font-label text-xs font-bold uppercase tracking-[0.2em] text-slate-500">{t('login.field.password')}</span>
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                    autoComplete="current-password"
                    className="mt-2 w-full rounded-[1.25rem] border border-slate-200/70 bg-white/90 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                    placeholder={t('adminLogin.form.passwordPlaceholder')}
                  />
                </label>
              </div>

              {error ? (
                <div className="mt-4 rounded-[1.25rem] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={submitting}
                className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-4 py-3 font-label text-xs font-bold uppercase tracking-[0.2em] text-sky-700 transition hover:border-sky-300 hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="material-symbols-outlined text-base">{submitting ? 'progress_activity' : 'login'}</span>
                {submitting ? t('adminLogin.form.signingIn') : t('adminLogin.form.enter')}
              </button>
            </form>
          </div>
        </section>
      </div>
    </div>
  )
}
