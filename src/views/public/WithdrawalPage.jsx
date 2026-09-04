import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { FOUNDATION, FOUNDATION_FOOTER_PL } from '../legal/foundation-legal-content.js'
import { fetchWithTimeout } from '../../practice/lib/practice-cache'
import './withdrawal.css'

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

function warsawDate(value) {
  return new Intl.DateTimeFormat('pl-PL', {
    dateStyle: 'long',
    timeStyle: 'long',
    timeZone: 'Europe/Warsaw',
  }).format(new Date(value))
}

export default function WithdrawalPage() {
  const [lang, setLang] = useState('pl')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [orderRef, setOrderRef] = useState('')
  const [scope, setScope] = useState('whole')
  const [details, setDetails] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [website, setWebsite] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [receipt, setReceipt] = useState(null)

  const isPl = lang === 'pl'
  const t = (pl, en) => (isPl ? pl : en)
  const valid = useMemo(() => (
    fullName.trim().length >= 2
    && EMAIL_RE.test(email.trim())
    && orderRef.trim().length >= 2
    && (scope === 'whole' || details.trim().length >= 2)
    && confirmed
  ), [confirmed, details, email, fullName, orderRef, scope])

  async function submit(event) {
    event.preventDefault()
    if (!valid || busy) return
    setBusy(true)
    setError('')
    try {
      const response = await fetchWithTimeout('/api/withdrawal-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: fullName.trim(),
          email: email.trim(),
          orderRef: orderRef.trim(),
          scope,
          details: details.trim(),
          lang,
          website,
        }),
      }, 20000)
      const payload = await response.json().catch(() => ({}))
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || t(
          'Nie udało się wysłać oświadczenia. Spróbuj ponownie lub napisz do nas e-mail.',
          'We could not submit your statement. Try again or contact us by email.',
        ))
      }
      setReceipt(payload)
    } catch (ex) {
      setError(ex.message || t('Nie udało się wysłać formularza.', 'The form could not be submitted.'))
    } finally {
      setBusy(false)
    }
  }

  if (receipt) {
    return (
      <main className="wd-page">
        <section className="wd-card wd-success" aria-live="polite">
          <div className="wd-success-icon" aria-hidden>✓</div>
          <p className="wd-eyebrow">{t('Oświadczenie przyjęte', 'Statement received')}</p>
          <h1>{t('Potwierdzamy otrzymanie odstąpienia.', 'We confirm receipt of your withdrawal.')}</h1>
          <p>{t(
            `Potwierdzenie zawierające treść oświadczenia oraz datę i godzinę wysłaliśmy na ${email.trim()}.`,
            `We sent confirmation containing the statement and its submission date and time to ${email.trim()}.`,
          )}</p>
          <dl className="wd-receipt">
            <div><dt>{t('Numer potwierdzenia', 'Receipt reference')}</dt><dd>{receipt.receiptRef}</dd></div>
            <div><dt>{t('Data i godzina', 'Date and time')}</dt><dd>{warsawDate(receipt.submittedAt)}</dd></div>
            <div><dt>{t('Umowa / zamówienie', 'Contract / order')}</dt><dd>{orderRef}</dd></div>
          </dl>
          <p className="wd-note">{t(
            'Zachowaj wiadomość e-mail i numer potwierdzenia. Otrzymanie oświadczenia nie przesądza o ustawowych skutkach odstąpienia, które zależą od rodzaju i etapu realizacji umowy.',
            'Keep the email and receipt reference. Acknowledgement does not predetermine the statutory effect of withdrawal, which depends on the contract type and performance stage.',
          )}</p>
          <div className="wd-actions">
            <Link className="wd-button" to="/">{t('Wróć do English Metro', 'Return to English Metro')}</Link>
            <Link className="wd-link" to="/terms">{t('Przeczytaj Regulamin', 'Read the Terms')}</Link>
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="wd-page">
      <header className="wd-topbar">
        <Link to="/" className="wd-wordmark">English <em>Metro.</em></Link>
        <div className="wd-lang" role="group" aria-label="Language">
          <button type="button" data-active={isPl} onClick={() => setLang('pl')}>PL</button>
          <button type="button" data-active={!isPl} onClick={() => setLang('en')}>EN</button>
        </div>
      </header>

      <section className="wd-intro">
        <p className="wd-eyebrow">{t('Prawo konsumenta', 'Consumer right')}</p>
        <h1>{t('Odstąp od umowy online', 'Withdraw from a contract online')}</h1>
        <p>{t(
          'Za pomocą tego formularza możesz przesłać jednoznaczne oświadczenie o odstąpieniu od umowy zawartej przez englishmetro.com. Po wysłaniu natychmiast otrzymasz potwierdzenie na trwałym nośniku, czyli e-mailem.',
          'Use this form to submit an unequivocal statement withdrawing from a contract concluded through englishmetro.com. After submission, you will immediately receive durable-medium confirmation by email.',
        )}</p>
      </section>

      <form className="wd-card wd-form" onSubmit={submit} noValidate>
        <div className="wd-grid">
          <label>
            <span>{t('Imię i nazwisko', 'Full name')}</span>
            <input autoComplete="name" value={fullName} onChange={e => setFullName(e.target.value)} maxLength={120} required />
          </label>
          <label>
            <span>{t('Adres e-mail do potwierdzenia', 'Email for confirmation')}</span>
            <input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} maxLength={160} required />
          </label>
        </div>

        <label>
          <span>{t('Numer zamówienia lub inne dane identyfikujące umowę', 'Order number or other contract identifier')}</span>
          <input value={orderRef} onChange={e => setOrderRef(e.target.value)} maxLength={120} placeholder="np. EM-20260729-ABCD" required />
          <small>{t('Numer znajdziesz w wiadomości z potwierdzeniem zamówienia.', 'You can find this in your order-confirmation email.')}</small>
        </label>

        <fieldset>
          <legend>{t('Zakres odstąpienia', 'Withdrawal scope')}</legend>
          <label className="wd-choice">
            <input type="radio" name="scope" value="whole" checked={scope === 'whole'} onChange={() => setScope('whole')} />
            <span>{t('Odstępuję od całej umowy', 'I withdraw from the entire contract')}</span>
          </label>
          <label className="wd-choice">
            <input type="radio" name="scope" value="selected" checked={scope === 'selected'} onChange={() => setScope('selected')} />
            <span>{t('Odstępuję od wybranych usług lub produktów', 'I withdraw from selected services or products')}</span>
          </label>
        </fieldset>

        <label>
          <span>{scope === 'selected'
            ? t('Wskaż usługi lub produkty objęte odstąpieniem', 'Identify the services or products covered')
            : t('Dodatkowe informacje (opcjonalnie)', 'Additional information (optional)')}</span>
          <textarea value={details} onChange={e => setDetails(e.target.value)} maxLength={1000} rows={4} required={scope === 'selected'} />
        </label>

        <label className="wd-choice wd-confirm">
          <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />
          <span>{t(
            'Potwierdzam, że składam jednoznaczne oświadczenie o odstąpieniu od wskazanej wyżej umowy.',
            'I confirm that I am submitting an unequivocal statement withdrawing from the contract identified above.',
          )}</span>
        </label>

        <label className="wd-honeypot" aria-hidden>
          Website
          <input tabIndex="-1" autoComplete="off" value={website} onChange={e => setWebsite(e.target.value)} />
        </label>

        {error && <p className="wd-error" role="alert">{error}</p>}

        <button className="wd-submit" type="submit" disabled={!valid || busy}>
          {busy
            ? t('Wysyłanie…', 'Submitting…')
            : t('Potwierdź odstąpienie od umowy', 'Confirm withdrawal')}
        </button>

        <p className="wd-privacy">{t(
          'Dane z formularza przetwarzamy wyłącznie w celu obsługi oświadczenia i obowiązków prawnych.',
          'We process form data solely to handle the statement and meet legal obligations.',
        )} <Link to="/privacy">{t('Polityka prywatności', 'Privacy Policy')}</Link>.</p>
      </form>

      <aside className="wd-alternative">
        <h2>{t('Inne sposoby złożenia oświadczenia', 'Other ways to submit')}</h2>
        <p>{t(
          'Nadal możesz odstąpić od umowy jednoznacznym oświadczeniem wysłanym e-mailem lub pocztą. Formularz online jest dodatkową, prostszą drogą.',
          'You may still withdraw by sending an unequivocal statement by email or post. This online form is an additional, simpler route.',
        )}</p>
        <a href={`mailto:${FOUNDATION.email}?subject=${encodeURIComponent('Odstąpienie od umowy / Contract withdrawal')}`}>{FOUNDATION.email}</a>
        <address>{FOUNDATION.serviceAddress}</address>
      </aside>

      <footer className="wd-footer">
        <p>{FOUNDATION_FOOTER_PL}</p>
        <nav>
          <Link to="/terms">{t('Regulamin', 'Terms')}</Link>
          <Link to="/privacy">{t('Prywatność', 'Privacy')}</Link>
          <Link to="/cookies">Cookies</Link>
          <a href="/kontakt/">{t('Kontakt', 'Contact')}</a>
          <a href="/faq/">{t('Pytania', 'FAQ')}</a>
        </nav>
      </footer>
    </main>
  )
}
