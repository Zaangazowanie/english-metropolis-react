import { detectInitial } from '../../i18n'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Skyline } from '../../design/v3/primitives.jsx'
import { cart, formatPLN } from './cart-store.js'
import { fetchWithTimeout } from '../../practice/lib/practice-cache'
import './checkout.css'

// The two questions asked once the money has cleared, so the teacher does not
// start the first lesson from nothing. Deliberately not a gate: the student has
// already paid and must always be able to walk on to their account.
const DURATIONS = [
  ['none',  'I am starting from scratch',        'Zaczynam od zera'],
  ['lt1',   'Less than a year',                  'Krócej niż rok'],
  ['1-2',   '1 to 2 years',                      'Od roku do 2 lat'],
  ['3-5',   '3 to 5 years',                      'Od 3 do 5 lat'],
  ['5plus', 'More than 5 years',                 'Ponad 5 lat'],
  ['rusty', 'I studied years ago and I am starting again', 'Uczyłem/am się dawno temu i zaczynam od nowa'],
]
// The three formats sold on the pricing page, each with the one line a student
// needs to tell them apart. Radio cards, not a dropdown: an explanation the
// student cannot see until after choosing is not an explanation.
const TYPES = [
  ['one-to-one',
   'One-to-one', 'Lekcje indywidualne',
   'General English built around you: your goals, your pace, your interests.',
   'Ogólny angielski dopasowany do Ciebie: Twoje cele, tempo i zainteresowania.'],
  ['specialist',
   'Specialist', 'Lekcje specjalistyczne',
   'Aimed at one outcome: an exam, a job interview, relocation, or business English.',
   'Nastawione na konkretny cel: egzamin, rozmowa o pracę, przeprowadzka lub angielski biznesowy.'],
  ['group',
   'Group', 'Lekcje grupowe',
   'A small group of up to 4 students at a similar level, twice a week, at a lower price.',
   'Mała grupa do 4 osób na podobnym poziomie, dwa razy w tygodniu, w niższej cenie.'],
]
const LEVELS = [
  ['A1', 'A1 · Beginner',           'A1 · Początkujący'],
  ['A2', 'A2 · Elementary',         'A2 · Podstawowy'],
  ['B1', 'B1 · Intermediate',       'B1 · Średnio zaawansowany'],
  ['B2', 'B2 · Upper-Intermediate', 'B2 · Wyżej średnio zaawansowany'],
  ['C1', 'C1 · Advanced',           'C1 · Zaawansowany'],
  ['C2', 'C2 · Proficiency',        'C2 · Biegły'],
  ['unknown', 'I am not sure',      'Nie wiem'],
]

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


function IntakeSection({ session }) {
  const [lang] = useState(() => detectInitial())
  const isPl = lang === 'pl'
  const t = (en, pl) => (isPl ? pl : en)
  const label = (row) => (isPl ? row[2] : row[1])

  const [known, setKnown] = useState(null)   // null until we know whether it was already answered
  const [duration, setDuration] = useState('')
  const [level, setLevel] = useState('')
  const [type, setType] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [err, setErr] = useState('')

  // Asked once. A student who paid for a second package should not be
  // re-interviewed, so the form is skipped when an answer already exists.
  useEffect(() => {
    if (!session?.sessionToken) return
    let cancelled = false
    fetchWithTimeout('/api/query', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: 'students:myIntake', args: { sessionToken: session.sessionToken } }),
    })
      .then(r => r.json())
      .then(p => { if (!cancelled) setKnown(p?.status === 'success' ? !!p.value?.submitted : true) })
      .catch(() => { if (!cancelled) setKnown(true) })
    return () => { cancelled = true }
  }, [session?.sessionToken])

  async function submit(event) {
    event.preventDefault()
    if (busy) return
    setErr('')
    if (!duration || !level || !type) {
      return setErr(t('Please answer all three questions.', 'Odpowiedz na wszystkie trzy pytania.'))
    }
    setBusy(true)
    try {
      const response = await fetchWithTimeout('/api/mutation', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: 'students:submitIntake',
          args: {
            sessionToken: session.sessionToken,
            studyDuration: duration,
            selfLevel: level,
            lessonType: type,
          },
        }),
      })
      const payload = await response.json()
      if (payload?.status !== 'success' || !payload.value?.ok) throw new Error('failed')
      setDone(true)
    } catch {
      setErr(t('That did not save. You can add it later in your account.',
               'Nie udało się zapisać. Możesz uzupełnić to później na swoim koncie.'))
    } finally { setBusy(false) }
  }

  if (known !== false && !done) return null

  if (done) {
    return (
      <div className="co-intake co-intake-done" role="status">
        <span className="material-symbols-outlined" aria-hidden>task_alt</span>
        <p>{t('Thank you. Your teacher will see this before your first lesson.',
              'Dziękujemy. Twój lektor zobaczy te informacje przed pierwszą lekcją.')}</p>
      </div>
    )
  }

  return (
    <form className="co-intake" onSubmit={submit}>
      <h2>{t('Three quick questions', 'Trzy krótkie pytania')}</h2>
      <p className="co-intake-lede">
        {t('So your teacher can prepare the right first lesson for you.',
           'Dzięki nim lektor przygotuje dla Ciebie właściwą pierwszą lekcję.')}
      </p>

      <label className="co-field">
        <span>{t('How long have you been learning English?', 'Jak długo uczysz się angielskiego?')}</span>
        <select value={duration} onChange={(e) => setDuration(e.target.value)}>
          <option value="" disabled>{t('Choose…', 'Wybierz…')}</option>
          {DURATIONS.map(row => <option key={row[0]} value={row[0]}>{label(row)}</option>)}
        </select>
      </label>

      <label className="co-field">
        <span>{t('What is your level?', 'Jaki masz poziom?')}</span>
        <select value={level} onChange={(e) => setLevel(e.target.value)}>
          <option value="" disabled>{t('Choose…', 'Wybierz…')}</option>
          {LEVELS.map(row => <option key={row[0]} value={row[0]}>{label(row)}</option>)}
        </select>
      </label>

      {level === 'unknown' && (
        <p className="co-intake-reassure">
          {t(
            'That is completely fine, and it is the most common answer. Your teacher will assess your level during the first lesson. There is nothing to prepare and nothing to worry about.',
            'To zupełnie normalne i najczęstsza odpowiedź. Lektor oceni Twój poziom podczas pierwszej lekcji. Nie musisz się do niczego przygotowywać ani niczym martwić.',
          )}
        </p>
      )}

      <div className="co-field">
        <span>{t('Which kind of lessons do you want?', 'Jakich lekcji szukasz?')}</span>
        <div className="co-choices">
          {TYPES.map(row => (
            <label key={row[0]} className="co-choice" data-selected={type === row[0]}>
              <input type="radio" name="co-lesson-type" checked={type === row[0]}
                onChange={() => setType(row[0])} />
              <span className="co-choice-body">
                <strong>{isPl ? row[2] : row[1]}</strong>
                <small className="co-choice-what">{isPl ? row[4] : row[3]}</small>
              </span>
              <span className="co-choice-mark" aria-hidden />
            </label>
          ))}
        </div>
      </div>

      {err && <p className="co-error" role="alert">{err}</p>}

      <button className="co-submit co-intake-submit" type="submit" disabled={busy}>
        {busy ? t('Saving…', 'Zapisujemy…') : t('Save', 'Zapisz')}
      </button>
    </form>
  )
}

export default function PaymentReturn() {
  // Same language rule as the rest of the public surface (Polish unless the
  // visitor is outside Poland or has chosen otherwise); the intake form below
  // already followed it, the status copy did not.
  const [lang] = useState(() => detectInitial())
  const isPl = lang === 'pl'
  const t = (en, pl) => (isPl ? pl : en)
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
        <Link to="/" className="lp-brand" aria-label="English Metro home">
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
            <h1>{t('We could not identify this payment.', 'Nie udało się zidentyfikować tej płatności.')}</h1>
            <p>{t('Sign in to your English Metro account or return to checkout.', 'Zaloguj się na swoje konto English Metro albo wróć do zamówienia.')}</p>
            <div className="co-success-actions">
              <Link
                className="lp-button lp-button-primary"
                to={`/login?next=${encodeURIComponent(`/payment/return${window.location.search}`)}`}
              >{t('Sign in', 'Zaloguj się')}</Link>
              <Link className="lp-button lp-button-ghost" to="/checkout">{t('Return to checkout', 'Wróć do zamówienia')}</Link>
            </div>
          </>
        ) : paid ? (
          <>
            <h1>{t('Payment confirmed. Your lessons are ready.', 'Płatność potwierdzona. Twoje lekcje są gotowe.')}</h1>
            <p className="co-success-ref">{t('Order reference', 'Numer zamówienia')}: <strong>{payment.checkoutRef}</strong>{amount ? ` · ${amount}` : ''}</p>
            <p>{t('Przelewy24 verified the payment and the lesson package has been added to your account.', 'Przelewy24 potwierdziło płatność, a pakiet lekcji został dodany do Twojego konta.')}</p>
            <IntakeSection session={session} />
            <div className="co-success-actions">
              {session.slug && <a className="lp-button lp-button-primary" href={`/app/${session.slug}/dashboard`}>{t('Go to your account', 'Przejdź do konta')}</a>}
              <Link className="lp-button lp-button-ghost" to="/lessons">{t('Back to lessons', 'Wróć do lekcji')}</Link>
            </div>
          </>
        ) : failed ? (
          <>
            <h1>{t('The secure payment could not be started.', 'Nie udało się rozpocząć bezpiecznej płatności.')}</h1>
            <p>{t('No lessons were allocated and no payment was confirmed. You can safely try again.', 'Nie przydzielono żadnych lekcji i nie potwierdzono żadnej płatności. Możesz bezpiecznie spróbować ponownie.')}</p>
            <div className="co-success-actions">
              <Link className="lp-button lp-button-primary" to="/checkout">{t('Try payment again', 'Spróbuj zapłacić ponownie')}</Link>
            </div>
          </>
        ) : stillWaiting ? (
          <>
            <h1>{t('Your payment is still being confirmed.', 'Twoja płatność jest jeszcze potwierdzana.')}</h1>
            <p>
              {t(
                'Przelewy24 has not reported a final status yet, which is normal for a bank transfer. You do not need to pay again or keep this page open. As soon as the payment is verified the lessons are added to your account and we email you the confirmation.',
                'Przelewy24 nie przekazało jeszcze ostatecznego statusu, co przy przelewie bankowym jest normalne. Nie musisz płacić ponownie ani trzymać tej strony otwartej. Gdy tylko płatność zostanie zweryfikowana, lekcje trafią na Twoje konto, a potwierdzenie wyślemy e-mailem.',
              )}
            </p>
            <div className="co-success-actions">
              {session.slug && <a className="lp-button lp-button-primary" href={`/app/${session.slug}/dashboard`}>{t('Go to your account', 'Przejdź do konta')}</a>}
              <Link className="lp-button lp-button-ghost" to="/lessons">{t('Back to lessons', 'Wróć do lekcji')}</Link>
            </div>
          </>
        ) : (
          <>
            <h1>{t('We are confirming your payment…', 'Potwierdzamy Twoją płatność…')}</h1>
            <p>{amount ? `${amount} · ` : ''}{t('Keep this page open for a moment. Przelewy24 confirmation can arrive asynchronously.', 'Zostaw tę stronę otwartą na chwilę. Potwierdzenie z Przelewy24 może dotrzeć z opóźnieniem.')}</p>
            {error && <p className="co-error">{error}</p>}
            <ul className="co-status-list">
              <li data-state="ok"><span className="material-symbols-outlined" aria-hidden>check_circle</span>{t('Returned securely from Przelewy24', 'Bezpieczny powrót z Przelewy24')}</li>
              <li data-state="wait"><span className="material-symbols-outlined" aria-hidden>schedule</span>{t('Waiting for verified transaction status', 'Czekamy na zweryfikowany status transakcji')}</li>
              <li data-state="next"><span className="material-symbols-outlined" aria-hidden>school</span>{t('Lessons are allocated only after verification', 'Lekcje przydzielamy dopiero po weryfikacji')}</li>
            </ul>
          </>
        )}
      </section>
    </main>
  )
}
