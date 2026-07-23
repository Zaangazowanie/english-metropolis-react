import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Skyline } from '../../design/v3/primitives.jsx'
import { useCart, cart, cartTotalPLN, formatPLN } from './cart-store.js'
import { FOUNDATION, FOUNDATION_FOOTER_PL, FOUNDATION_FOOTER_EN } from '../legal/foundation-legal-content.js'
import './checkout.css'

// Public checkout — cart summary → billing details → Twój StartUp consent set
// → "zamówienie z obowiązkiem zapłaty" (Regulamin § 5(10)). Order lands at the
// em-report relay; the Przelewy24 payment link follows by e-mail until the
// gateway goes fully live on-site.
const ADMIN_NOTICE_PL = 'Administratorem danych wprowadzonych do formularza jest Fundacja Rozwoju Przedsiębiorczości „Twój StartUp". Dane będą przetwarzane w celu zrealizowania usługi oraz w celach marketingowych – w przypadku wyrażenia zgody. Informujemy o możliwości wycofania zgody. Pełne informacje o przetwarzaniu danych i przysługujących prawach znajdują się w polityce prywatności.'
const ADMIN_NOTICE_EN = 'The controller of the data entered in this form is Fundacja Rozwoju Przedsiębiorczości "Twój StartUp". The data will be processed to deliver the service and, if you consent, for marketing purposes. Consent can be withdrawn at any time. Full information about data processing and your rights is available in the privacy policy.'

export default function Checkout() {
  const navigate = useNavigate()
  const state = useCart()
  const [lang, setLang] = useState('pl')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [invoiceOpen, setInvoiceOpen] = useState(false)
  const [company, setCompany] = useState('')
  const [nip, setNip] = useState('')
  const [address, setAddress] = useState('')
  const [notes, setNotes] = useState('')
  const [consentTerms, setConsentTerms] = useState(false)
  const [consentImmediate, setConsentImmediate] = useState(false)
  const [consentMarketing, setConsentMarketing] = useState(false)
  const [company2, setCompany2] = useState('') // honeypot — real users never see it
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const [done, setDone] = useState(null)

  const total = cartTotalPLN(state)
  const isPl = lang === 'pl'
  const t = (en, pl) => (isPl ? pl : en)
  const orderRef = useMemo(() => {
    const d = new Date()
    const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
    return `EM-${ymd}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
  }, [])

  async function submitOrder(event) {
    event.preventDefault()
    setError('')
    if (!fullName.trim()) return setError(t('Please add your full name.', 'Podaj imię i nazwisko.'))
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setError(t('Please add a valid e-mail address.', 'Podaj poprawny adres e-mail.'))
    if (!consentTerms) return setError(t('Accepting the Terms (Regulamin) is required to place an order.', 'Do złożenia zamówienia wymagana jest akceptacja Regulaminu.'))
    setSending(true)
    try {
      const res = await fetch('/api/order-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ref: orderRef,
          lang,
          items: state.items.map((i) => ({ id: i.id, name: i.name, pace: i.pace, qty: i.qty, pricePLN: i.pricePLN })),
          totalPLN: total,
          billing: { fullName, email, phone, company, nip, address, notes },
          consents: { terms: consentTerms, immediateService: consentImmediate, marketing: consentMarketing },
          website: company2,
        }),
      })
      if (!res.ok) throw new Error(`order-request ${res.status}`)
      setDone({ ref: orderRef, email })
      cart.clear()
    } catch {
      setError(t(
        'We could not submit the order. Please try again, or email us at ',
        'Nie udało się wysłać zamówienia. Spróbuj ponownie albo napisz na ',
      ) + FOUNDATION.email)
    } finally {
      setSending(false)
    }
  }

  return (
    <main className="lp-page co-page">
      <header className="lp-nav">
        <Link to="/" className="lp-brand" aria-label="EnglishMetro home">
          <Skyline size={30} />
          <span>English<span>Metro</span>.</span>
        </Link>
        <nav className="lp-nav-links" aria-label="Checkout navigation">
          <Link to="/lessons">{t('Back to packages', 'Wróć do pakietów')}</Link>
        </nav>
        <div className="lp-lang-toggle" role="group" aria-label="Language">
          <button type="button" className={lang === 'en' ? 'is-active' : ''} onClick={() => setLang('en')}>EN</button>
          <button type="button" className={lang === 'pl' ? 'is-active' : ''} onClick={() => setLang('pl')}>PL</button>
        </div>
      </header>

      {done ? (
        <section className="co-shell co-success" aria-live="polite">
          <div className="co-success-mark" aria-hidden>
            <span className="material-symbols-outlined">check</span>
          </div>
          <h1>{t('Order received.', 'Zamówienie przyjęte.')}</h1>
          <p className="co-success-ref">{t('Order reference', 'Numer zamówienia')}: <strong>{done.ref}</strong></p>
          <p className="co-success-copy">
            {t(
              `A confirmation with the Terms (Regulamin) and the withdrawal form template is on its way to ${done.email}. Online payment via Przelewy24 (BLIK, cards, fast transfer) is being activated — we will send your secure payment link by e-mail, and we confirm your teacher and schedule in the same message.`,
              `Potwierdzenie wraz z Regulaminem i wzorem formularza odstąpienia od umowy wysyłamy na adres ${done.email}. Płatność online przez Przelewy24 (BLIK, karty, szybki przelew) jest w trakcie aktywacji — bezpieczny link do płatności otrzymasz e-mailem, a w tej samej wiadomości potwierdzimy lektora i terminy.`,
            )}
          </p>
          <div className="co-success-actions">
            <Link className="lp-button lp-button-primary" to="/lessons">
              <span className="material-symbols-outlined" aria-hidden>school</span>
              {t('Back to lessons', 'Wróć do lekcji')}
            </Link>
            <Link className="lp-button lp-button-ghost" to="/signup">
              <span className="material-symbols-outlined" aria-hidden>person_add</span>
              {t('Create your student account', 'Załóż konto ucznia')}
            </Link>
          </div>
        </section>
      ) : state.items.length === 0 ? (
        <section className="co-shell co-empty">
          <span className="material-symbols-outlined" aria-hidden>shopping_cart</span>
          <h1>{t('Your cart is empty.', 'Twój koszyk jest pusty.')}</h1>
          <p>{t('Add a lesson package to proceed to checkout.', 'Dodaj pakiet lekcji, aby przejść do kasy.')}</p>
          <Link className="lp-button lp-button-primary" to="/lessons#pricing">
            <span className="material-symbols-outlined" aria-hidden>storefront</span>
            {t('Browse packages', 'Zobacz pakiety')}
          </Link>
        </section>
      ) : (
        <section className="co-shell">
          <header className="co-head">
            <p className="lp-section-label">{t('Checkout', 'Kasa')}</p>
            <h1>{t('Review and place your order.', 'Sprawdź i złóż zamówienie.')}</h1>
            <ol className="co-steps" aria-hidden>
              <li data-active="true">{t('Cart', 'Koszyk')}</li>
              <li data-active="true">{t('Your details', 'Twoje dane')}</li>
              <li>{t('Payment', 'Płatność')}</li>
            </ol>
          </header>

          <div className="co-grid">
            <form className="co-form" onSubmit={submitOrder} noValidate>
              <fieldset className="co-block">
                <legend>{t('Contact details', 'Dane kontaktowe')}</legend>
                <label className="co-field">
                  <span>{t('Full name', 'Imię i nazwisko')} *</span>
                  <input value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" placeholder="Marta Kowalska" required />
                </label>
                <label className="co-field">
                  <span>E-mail *</span>
                  <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" placeholder="you@example.com" required />
                </label>
                <label className="co-field">
                  <span>{t('Phone (optional)', 'Telefon (opcjonalnie)')}</span>
                  <input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" autoComplete="tel" placeholder="+48 600 000 000" />
                </label>
                <label className="co-honey" aria-hidden>
                  <span>Company website</span>
                  <input tabIndex={-1} autoComplete="off" value={company2} onChange={(e) => setCompany2(e.target.value)} />
                </label>
              </fieldset>

              <fieldset className="co-block">
                <legend>
                  <button type="button" className="co-invoice-toggle" onClick={() => setInvoiceOpen((v) => !v)} aria-expanded={invoiceOpen}>
                    <span className="material-symbols-outlined" aria-hidden>{invoiceOpen ? 'expand_less' : 'expand_more'}</span>
                    {t('Invoice details (optional)', 'Dane do faktury (opcjonalnie)')}
                  </button>
                </legend>
                <div className="co-collapse" data-open={invoiceOpen}>
                  <div className="co-collapse-inner">
                    <label className="co-field">
                      <span>{t('Company name', 'Nazwa firmy')}</span>
                      <input value={company} onChange={(e) => setCompany(e.target.value)} autoComplete="organization" />
                    </label>
                    <label className="co-field">
                      <span>NIP</span>
                      <input value={nip} onChange={(e) => setNip(e.target.value)} inputMode="numeric" placeholder="0000000000" />
                    </label>
                    <label className="co-field">
                      <span>{t('Address', 'Adres')}</span>
                      <input value={address} onChange={(e) => setAddress(e.target.value)} autoComplete="street-address" />
                    </label>
                  </div>
                </div>
              </fieldset>

              <fieldset className="co-block">
                <legend>{t('Notes for your teacher (optional)', 'Uwagi dla lektora (opcjonalnie)')}</legend>
                <label className="co-field">
                  <span className="sr-only">{t('Notes', 'Uwagi')}</span>
                  <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('Level, goals, preferred days and times...', 'Poziom, cele, preferowane dni i godziny...')} />
                </label>
              </fieldset>

              <fieldset className="co-block co-consents">
                <legend>{t('Consents', 'Zgody')}</legend>
                <label className="co-check">
                  <input type="checkbox" checked={consentTerms} onChange={(e) => setConsentTerms(e.target.checked)} required />
                  <span>
                    {isPl ? (
                      <>Akceptuję <Link to="/terms" target="_blank">Regulamin</Link> serwisu prowadzonego przez Fundację Rozwoju Przedsiębiorczości „Twój StartUp" z siedzibą w Warszawie. *</>
                    ) : (
                      <>I accept the <Link to="/terms" target="_blank">Terms (Regulamin)</Link> of the service operated by Fundacja Rozwoju Przedsiębiorczości "Twój StartUp", Warsaw. *</>
                    )}
                  </span>
                </label>
                <label className="co-check">
                  <input type="checkbox" checked={consentImmediate} onChange={(e) => setConsentImmediate(e.target.checked)} />
                  <span>
                    {isPl
                      ? 'Chcę, aby usługa została zrealizowana niezwłocznie i przyjmuję do wiadomości, że z chwilą spełnienia świadczenia przez Fundację Rozwoju Przedsiębiorczości „Twój StartUp", utracę prawo do odstąpienia od umowy.'
                      : 'I want the service to begin immediately and I acknowledge that once the service has been fully performed by Fundacja Rozwoju Przedsiębiorczości "Twój StartUp", I lose the right to withdraw from the contract.'}
                  </span>
                </label>
                <label className="co-check">
                  <input type="checkbox" checked={consentMarketing} onChange={(e) => setConsentMarketing(e.target.checked)} />
                  <span>{isPl ? 'Chcę otrzymywać informacje handlowe i marketingowe.' : 'I would like to receive commercial and marketing information.'}</span>
                </label>
              </fieldset>

              {error && <p className="co-error" role="alert">{error}</p>}

              <button className="co-submit" type="submit" disabled={sending} data-sending={sending}>
                <span className="material-symbols-outlined" aria-hidden>{sending ? 'progress_activity' : 'lock'}</span>
                {sending
                  ? t('Sending...', 'Wysyłanie...')
                  : t('Order with an obligation to pay', 'Zamówienie z obowiązkiem zapłaty')}
              </button>

              <p className="co-admin-note">{isPl ? ADMIN_NOTICE_PL : ADMIN_NOTICE_EN}</p>
            </form>

            <aside className="co-summary" aria-label={t('Order summary', 'Podsumowanie zamówienia')}>
              <h2>{t('Order summary', 'Podsumowanie')}</h2>
              <ul className="co-items">
                {state.items.map((item, idx) => (
                  <li key={item.id} style={{ '--co-i': idx }}>
                    <div className="co-item-main">
                      <strong>{item.name}</strong>
                      <span>{isPl ? item.pacePl || item.pace : item.pace}</span>
                    </div>
                    <div className="co-item-side">
                      <div className="co-qty" role="group" aria-label={t('Quantity', 'Ilość')}>
                        <button type="button" onClick={() => cart.setQty(item.id, item.qty - 1)} aria-label={t('Decrease', 'Zmniejsz')}>−</button>
                        <span>{item.qty}</span>
                        <button type="button" onClick={() => cart.setQty(item.id, item.qty + 1)} aria-label={t('Increase', 'Zwiększ')}>+</button>
                      </div>
                      <strong>{formatPLN(item.pricePLN * item.qty)}</strong>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="co-total">
                <span>{t('Total (VAT included)', 'Razem (z VAT)')}</span>
                <strong>{formatPLN(total)}</strong>
              </div>
              <div className="co-payment">
                <h3>{t('Payment', 'Płatność')}</h3>
                <div className="co-pay-method" data-active="true">
                  <span className="co-pay-brand">Przelewy24</span>
                  <span className="co-pay-kinds">BLIK · {t('cards', 'karty')} · {t('fast transfer', 'szybki przelew')}</span>
                  <span className="co-pay-status">{t('Activating — secure payment link arrives by e-mail', 'W trakcie aktywacji — bezpieczny link do płatności otrzymasz e-mailem')}</span>
                </div>
                <p className="co-pay-note">
                  {t(
                    'No card details are collected on this page. Lesson validity: single lesson 90 days; 4-8 lesson packs 6 months; 16-24 lesson packs 12 months. Statutory 14-day withdrawal rights apply — see the Terms.',
                    'Ta strona nie zbiera danych karty. Ważność pakietów: lekcja jednorazowa 90 dni; pakiety 4-8 lekcji 6 miesięcy; pakiety 16-24 lekcji 12 miesięcy. Przysługuje ustawowe 14-dniowe prawo odstąpienia — szczegóły w Regulaminie.',
                  )}
                </p>
              </div>
              <p className="co-legal-links">
                <Link to="/terms" target="_blank">{t('Terms', 'Regulamin')}</Link> · <Link to="/privacy" target="_blank">{t('Privacy', 'Prywatność')}</Link> · <Link to="/cookies" target="_blank">Cookies</Link>
              </p>
            </aside>
          </div>
        </section>
      )}

      <footer className="co-foot">
        <p>{isPl ? FOUNDATION_FOOTER_PL : FOUNDATION_FOOTER_EN}</p>
        <p>{t('Contact', 'Kontakt')}: <a href={`mailto:${FOUNDATION.email}`}>{FOUNDATION.email}</a> · {FOUNDATION.phone}</p>
      </footer>
    </main>
  )
}
