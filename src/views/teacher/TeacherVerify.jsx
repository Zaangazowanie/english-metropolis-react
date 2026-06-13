// TeacherVerify — consumes the magic-link token from the URL.
//
// Lands here from a link like /teacher/verify?token=…. We exchange the token
// for a session via teacherAuth:verifyMagicToken; on success we store
// { user, sessionToken } under 'em-teacher-session' and send the teacher into
// the portal. On failure we show a dead-end message with a route back to a
// fresh sign-in.

import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { mutateTeacherConvex } from '../../contexts/TeacherAuthContext.jsx'

const TEACHER_SESSION_KEY = 'em-teacher-session'

export default function TeacherVerify() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''
  const [status, setStatus] = useState('verifying') // 'verifying' | 'error'

  // Tokens are single-use; React 18 StrictMode mounts effects twice in dev,
  // which would burn the token on the first run and fail the second. Guard so
  // we only attempt the exchange once.
  const attempted = useRef(false)

  useEffect(() => {
    if (attempted.current) return
    attempted.current = true

    if (!token) {
      setStatus('error')
      return
    }

    let cancelled = false
    mutateTeacherConvex('teacherAuth:verifyMagicToken', { token })
      .then((result) => {
        if (cancelled) return
        if (result?.ok && result.sessionToken) {
          window.sessionStorage.setItem(
            TEACHER_SESSION_KEY,
            JSON.stringify({ user: result.user, sessionToken: result.sessionToken }),
          )
          // Full reload so TeacherAuthProvider picks up the stored session.
          window.location.replace('/teacher')
        } else {
          setStatus('error')
        }
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })

    return () => { cancelled = true }
    // Run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-xl items-center justify-center">
        <section className="glass-panel relative w-full overflow-hidden rounded-[2rem] border border-white/50 px-6 py-10 sm:px-10 sm:py-12 text-center editorial-shadow">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              background: `
                radial-gradient(ellipse 50% 70% at 95% 0%, rgba(14,165,233,0.10), transparent 60%),
                radial-gradient(ellipse 40% 50% at 5% 100%, rgba(37,99,235,0.07), transparent 55%)`,
            }}
          />

          <div className="relative">
            {status === 'verifying' ? (
              <>
                <span className="material-symbols-outlined animate-spin text-5xl text-sky-600">progress_activity</span>
                <h1 className="mt-4 font-headline text-3xl text-slate-900">Signing you in…</h1>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  Hold on a moment while we verify your link.
                </p>
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-5xl text-rose-400">link_off</span>
                <h1 className="mt-4 font-headline text-3xl text-slate-900">This link is invalid or has expired</h1>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  Sign-in links work once and only for 20 minutes. Request a fresh one to continue.
                </p>
                <button
                  type="button"
                  onClick={() => navigate('/teacher/login')}
                  className="mt-6 inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-sky-600 to-blue-700 px-6 py-3 text-sm font-semibold text-white shadow-[0_16px_35px_-18px_rgba(2,132,199,0.9)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_20px_40px_-18px_rgba(2,132,199,1)] cursor-pointer"
                >
                  <span className="material-symbols-outlined text-lg">login</span>
                  Back to sign-in
                </button>
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
