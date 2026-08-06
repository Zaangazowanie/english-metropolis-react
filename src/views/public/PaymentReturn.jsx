import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Skyline } from '../../design/v3/primitives.jsx'
import { cart, formatPLN } from './cart-store.js'
import { fetchWithTimeout } from '../../practice/lib/practice-cache'
import './checkout.css'

function readSession() {
  try {
    const value = JSON.parse(window.localStorage.getItem('em-student-session') || 'null')
    return value?.sessionToken ? value : null
  } catch {
    return null
  }
}

async function readPaymentStatus(sessionToken, sessionId) {
  const response = await fetchWithTimeout('/api/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      path: 'p24:getStatus',
      args: { sessionToken, sessionId },
    }),
  })
  const payload = await response.json()
  if (payload?.status !== 'success') throw new Error(payload?.errorMessage || 'Could not read payment status')
  return payload.value
}

export default function PaymentReturn() {
  const session = useMemo(() => readSession(), [])
  const sessionId = useMemo(() => new URLSearchParams(window.location.search).get('sessionId') || '', [])
  const [payment, setPayment] = useState(null)
  const [error, setError] = useState('')
  const [stillWaiting, setStillWaiting] = useState(false)

  useEffect(() => {
    if (!session?.sessionToken || !sessionId) return undefined
    let cancelled = false
    let timer
    let attempts = 0
    // A bank transfer can confirm minutes after the customer is sent back here, so
    // polling backs off and runs for about five minutes rather than one.
    const DEADLINE_MS = 5 * 60 * 1000
    const startedAt = Date.now()
    async function poll() {
      attempts += 1
      try {
        const next = await readPaymentStatus(session.sessionToken, sessionId)
        if (cancelled) return
        setPayment(next)
        setError('')
        if (next.status === 'paid') {
          cart.clear()
          return
        }
        if (next.status === 'registration_failed') return
      } catch (ex) {
        if (!cancelled) setError(ex.message || 'Could not confirm payment')
      }
      if (cancelled) return
      if (Date.now() - startedAt > DEADLINE_MS) {
        setStillWaiting(true)
        return
      }
      timer = window.setTimeout(poll, attempts < 10 ? 2000 : 10000)
    }
    poll()
    return () => {
      cancelled = true
      if (timer) window.clearTimeout(timer)
    }
  }, [session, sessionId])

  const paid = payment?.status === 'paid'
  const failed = payment?.status === 'registration_failed'
  const amount = payment ? formatPLN(payment.amount / 100) : ''

  return (
    <main className="lp-page co-page">
      <header className="lp-nav">
        <Link to="/" className="lp-brand" aria-label="EnglishMetro home">
          <Skyline size={30} />
          <span>English<span>Metro</span>.</span>
        </Link>
      </header>

      <section className="co-shell co-success co-payment-return" aria-live="polite">
        <div className="co-success-mark" data-state={paid ? 'paid' : failed ? 'failed' : 'waiting'} aria-hidden>
          <span className="material-symbols-outlined">
            {paid ? 'check' : failed ? 'error' : 'progress_activity'}
          </span>
        </div>

        {!session || !sessionId ? (
          <>
            <h1>We could not identify this payment.</h1>
            <p>Sign in to your EnglishMetro account or return to checkout.</p>
            <div className="co-success-actions">
              <Link
                className="lp-button lp-button-primary"
                to={`/login?next=${encodeURIComponent(`/payment/return${window.location.search}`)}`}
              >Sign in</Link>
              <Link className="lp-button lp-button-ghost" to="/checkout">Return to checkout</Link>
            </div>
          </>
        ) : paid ? (
          <>
            <h1>Payment confirmed. Your lessons are ready.</h1>
            <p className="co-success-ref">Order reference: <strong>{payment.checkoutRef}</strong>{amount ? ` · ${amount}` : ''}</p>
            <p>Przelewy24 verified the payment and the lesson package has been added to your account.</p>
            <div className="co-success-actions">
              {session.slug && <a className="lp-button lp-button-primary" href={`/app/${session.slug}/dashboard`}>Go to your account</a>}
              <Link className="lp-button lp-button-ghost" to="/lessons">Back to lessons</Link>
            </div>
          </>
        ) : failed ? (
          <>
            <h1>The secure payment could not be started.</h1>
            <p>No lessons were allocated and no payment was confirmed. You can safely try again.</p>
            <div className="co-success-actions">
              <Link className="lp-button lp-button-primary" to="/checkout">Try payment again</Link>
            </div>
          </>
        ) : stillWaiting ? (
          <>
            <h1>Your payment is still being confirmed.</h1>
            <p>
              Przelewy24 has not reported a final status yet, which is normal for a bank transfer.
              You do not need to pay again or keep this page open. As soon as the payment is
              verified the lessons are added to your account and we email you the confirmation.
            </p>
            <div className="co-success-actions">
              {session.slug && <a className="lp-button lp-button-primary" href={`/app/${session.slug}/dashboard`}>Go to your account</a>}
              <Link className="lp-button lp-button-ghost" to="/lessons">Back to lessons</Link>
            </div>
          </>
        ) : (
          <>
            <h1>We are confirming your payment…</h1>
            <p>{amount ? `${amount} · ` : ''}Keep this page open for a moment. Przelewy24 confirmation can arrive asynchronously.</p>
            {error && <p className="co-error">{error}</p>}
            <ul className="co-status-list">
              <li data-state="ok"><span className="material-symbols-outlined" aria-hidden>check_circle</span>Returned securely from Przelewy24</li>
              <li data-state="wait"><span className="material-symbols-outlined" aria-hidden>schedule</span>Waiting for verified transaction status</li>
              <li data-state="next"><span className="material-symbols-outlined" aria-hidden>school</span>Lessons are allocated only after verification</li>
            </ul>
          </>
        )}
      </section>
    </main>
  )
}
