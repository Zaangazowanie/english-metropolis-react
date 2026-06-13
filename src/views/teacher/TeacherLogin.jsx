// TeacherLogin — passwordless magic-link sign-in for teachers.
//
// One email field. Submitting POSTs to /api/teacher/request-link, which always
// answers { ok: true } (it never reveals whether the address is registered).
// We therefore show the same calm confirmation no matter what, so the form
// can't be used to probe who has an account.

import { useState } from 'react'

export default function TeacherLogin() {
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    if (submitting) return
    setSubmitting(true)
    setError('')

    try {
      await fetch('/api/teacher/request-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })
      // Deliberately ignore the response body — the endpoint always returns
      // { ok: true } and we never disclose whether the email is registered.
      setSent(true)
    } catch {
      // Only surface a problem if the request never reached the server at all.
      setError('We could not reach the server. Please check your connection and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-xl items-center justify-center">
        <section className="glass-panel relative w-full overflow-hidden rounded-[2rem] border border-white/50 px-6 py-8 sm:px-10 sm:py-10 editorial-shadow">
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
            <div className="flex items-center gap-2">
              <span className="em-brand-skyline" aria-hidden="true" />
              <p className="font-label text-xs font-bold uppercase tracking-[0.28em] text-sky-600">English Metropolis</p>
            </div>
            <h1 className="mt-3 font-headline text-4xl text-slate-900 sm:text-5xl leading-[1.05]">
              Teacher <span className="italic text-sky-600">sign-in</span>
            </h1>
            <p className="mt-4 max-w-md text-[15px] leading-relaxed text-slate-600">
              Enter your email and we'll send you a one-tap sign-in link. No password to remember.
            </p>

            {sent ? (
              <div className="mt-8 flex items-start gap-3 rounded-[1.5rem] border border-emerald-200 bg-emerald-50/80 px-5 py-5">
                <span className="material-symbols-outlined text-emerald-600 text-2xl shrink-0">mark_email_read</span>
                <div>
                  <p className="font-headline text-lg text-emerald-900">Check your inbox</p>
                  <p className="mt-1 text-sm leading-relaxed text-emerald-800">
                    If that email is registered, a sign-in link is on its way. The link works for 20 minutes.
                  </p>
                  <button
                    type="button"
                    onClick={() => { setSent(false); setError('') }}
                    className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-white/80 px-4 py-2 text-xs font-label font-bold uppercase tracking-[0.16em] text-emerald-700 transition hover:bg-emerald-50 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-base">refresh</span>
                    Use a different email
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="mt-8 space-y-5">
                <label className="block">
                  <span className="font-label text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Email address</span>
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                    autoComplete="email"
                    autoFocus
                    className="mt-2 w-full rounded-[1.25rem] border border-slate-200/70 bg-white/90 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                    placeholder="you@school.com"
                  />
                </label>

                {error ? (
                  <div className="rounded-[1.25rem] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {error}
                  </div>
                ) : null}

                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-sky-600 to-blue-700 px-5 py-3.5 text-sm font-semibold text-white shadow-[0_16px_35px_-18px_rgba(2,132,199,0.9)] transition-all duration-300 enabled:hover:-translate-y-0.5 enabled:hover:shadow-[0_20px_40px_-18px_rgba(2,132,199,1)] enabled:cursor-pointer disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-lg">{submitting ? 'progress_activity' : 'mail'}</span>
                  {submitting ? 'Sending…' : 'Send me a sign-in link'}
                </button>
              </form>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
