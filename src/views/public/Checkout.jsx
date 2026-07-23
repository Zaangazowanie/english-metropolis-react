import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Skyline } from '../../design/v3/primitives.jsx'
import { useCart, cart, cartTotalPLN, formatPLN } from './cart-store.js'
import { FOUNDATION, FOUNDATION_FOOTER_PL, FOUNDATION_FOOTER_EN } from '../legal/foundation-legal-content.js'
import { fetchWithTimeout } from '../../practice/lib/practice-cache'
import './checkout.css'

// Checkout = account + order in one progressive page (GPT-5.6 Sol consultation,
// 2026-07-23): Konto → Zamówienie → Płatność. Creating the account is a visible
// part of the purchase — Google or e-mail+password — and the order is written
// through Convex orders:createOrder against that student. The old guest relay
// is no longer called from here; the Convex order pipeline is authoritative.
const GOOGLE_CLIENT_ID = '960729188616-r2ql4rjid9aibbo1psi678gonf8lp04o.apps.googleusercontent.com'

const ADMIN_NOTICE_PL = 'Administratorem danych wprowadzonych do formularza jest Fundacja Rozwoju Przedsiębiorczości „Twój StartUp". Dane będą przetwarzane w celu zrealizowania usługi oraz w celach marketingowych – w przypadku wyrażenia zgody. Informujemy o możliwości wycofania zgody. Pełne informacje o przetwarzaniu danych i przysługujących prawach znajdują się w polityce prywatności.'
const ADMIN_NOTICE_EN = 'The controller of the data entered in this form is Fundacja Rozwoju Przedsiębiorczości "Twój StartUp". The data will be processed to deliver the service and, if you consent, for marketing purposes. Consent can be withdrawn at any time. Full information about data processing and your rights is available in the privacy policy.'

// Lessons allocated per catalog id — mirrors PACKAGE_LESSONS plus the
// specialist packs and summer group courses sold on /lessons.
const LESSONS_BY_ID = {
  single: 1, 'private-core': 4, momentum: 8, 'fluency-16': 16, 'fluency-24': 24,
  specialist: 6, 'specialist-12': 12, 'specialist-24': 24,
  august: 4, september: 4, 'two-month-bundle': 8,
}

async function callConvex(kind, path, args) {
  const response = await fetchWithTimeout(`/api/${kind}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, args }),
  })
  const payload = await response.json()
  if (payload?.status !== 'success') throw new Error(payload?.errorMessage || `${path} failed`)
  return payload.value
}

function readSession() {
  try {
    const s = JSON.parse(window.localStorage.getItem('em-student-session') || 'null')
    return s && s._id && s.sessionToken ? s : null
  } catch { return null }
}

function persistSession(student, sessionToken) {
  try {
    window.localStorage.setItem('em-student-session', JSON.stringify({ ...student, sessionToken }))
  } catch { /* checkout continues with the in-memory session */ }
}

export default function Checkout() {
  const navigate = useNavigate()
  const state = useCart()
  const [lang, setLang] = useState('pl')
  // Account section
  const [session, setSession] = useState(() => readSession())
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [phone, setPhone] = useState('')
  const [emailTaken, setEmailTaken] = useState(false)
  const googleBtnRef = useRef(null)
  const [googleReady, setGoogleReady] = useState(false)
  // Order section
  const [invoiceOpen, setInvoiceOpen] = useState(false)
  const [company, setCompany] = useState('')
  const [nip, setNip] = useState('')
  const [address, setAddress] = useState('')
  const [notes, setNotes] = useState('')
  // Consents + submission
  const [consentTerms, setConsentTerms] = useState(false)
  const [consentImmediate, setConsentImmediate] = useState(false)
  const [consentMarketing, setConsentMarketing] = useState(false)
  const [error, setError] = useState('')
  const [phase, setPhase] = useState('idle') // idle | account | order | done
  const [accountReady, setAccountReady] = useState(false)
  const [done, setDone] = useState(null)

  const total = cartTotalPLN(state)
  const isPl = lang === 'pl'
  const t = (en, pl) => (isPl ? pl : en)
  const orderRef = useMemo(() => {
    const d = new Date()
    const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
    return `EM-${ymd}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
  }, [])

  const accountDone = !!session
  const emailFormValid = fullName.trim().length >= 2 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()) && password.length >= 8
  const kontoStepDone = accountDone || emailFormValid
  const sending = phase === 'account' || phase === 'order'

  // ── Google Sign-In (same GIS client as /login and /signup) ──
  async function handleGoogleCredential(response) {
    setError('')
    try {
      const idToken = response?.credential
      if (!idToken) return
      const result = await callConvex('action', 'googleAuth:googleSignIn', { idToken })
      if (!result?.success || result.kind !== 'student') {
        setError(result?.error || t('Google sign-in did not work. Use e-mail and password below.', 'Logowanie Google nie powiodło się. Użyj adresu e-mail i hasła poniżej.'))
        return
      }
      persistSession(result.student, result.sessionToken)
      setSession(readSession() || { ...result.student, sessionToken: result.sessionToken })
    } catch (ex) {
      setError(ex.message || 'Google sign-in failed')
    }
  }

  useEffect(() => {
    if (session) return undefined
    let cancelled = false
    function tryInit() {
      if (cancelled) return
      if (!window.google?.accounts?.id) return setTimeout(tryInit, 120)
      try {
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID, callback: handleGoogleCredential,
          ux_mode: 'popup', auto_select: false,
        })
        setGoogleReady(true)
      } catch { /* password path still works */ }
    }
    tryInit()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session])

  useEffect(() => {
    if (!googleReady || !googleBtnRef.current || session) return
    googleBtnRef.current.innerHTML = ''
    const slotW = googleBtnRef.current.parentElement?.offsetWidth || 360
    try {
      window.google.accounts.id.renderButton(googleBtnRef.current, {
        type: 'standard', theme: 'outline', size: 'large', text: 'continue_with',
        shape: 'pill', logo_alignment: 'left', width: Math.max(220, Math.min(400, Math.round(slotW))),
      })
    } catch { /* password path still works */ }
  }, [googleReady, session])

  function changeAccount() {
    try { window.localStorage.removeItem('em-student-session') } catch { /* no-op */ }
    setSession(null)
    setAccountReady(false)
  }

  // ── Submit: (create account) → create the Convex order(s) ──
  async function placeOrders(activeSession) {
    setPhase('order')
    const consentNote = `[${orderRef}] Zgody: regulamin TAK; niezwłoczna realizacja ${consentImmediate ? 'TAK' : 'NIE'}; marketing ${consentMarketing ? 'TAK' : 'NIE'}.`
    const billing = {
      fullName: activeSession.name || fullName.trim(),
      email: activeSession.email || email.trim(),
      phone: phone.trim() || undefined,
      company: company.trim() || undefined,
      nip: nip.trim() || undefined,
      addressLine: address.trim() || undefined,
      notes: [notes.trim(), consentNote].filter(Boolean).join('\n'),
    }
    for (const item of state.items) {
      const lessons = (LESSONS_BY_ID[item.id] || 1) * item.qty
      await callConvex('mutation', 'orders:createOrder', {
        studentId: activeSession._id,
        packageId: item.id,
        packageName: item.qty > 1 ? `${item.name} ×${item.qty}` : item.name,
        lessons,
        priceLabel: formatPLN(item.pricePLN * item.qty),
        billing,
      })
    }
    setDone({ ref: orderRef, email: activeSession.email || email.trim(), name: activeSession.name || fullName.trim() })
    cart.clear()
    setPhase('done')
  }

  async function submitOrder(event) {
    event.preventDefault()
    if (sending) return
    setError('')
    setEmailTaken(false)
    if (!consentTerms) return setError(t('Accepting the Terms (Regulamin) is required to place an order.', 'Do złożenia zamówienia wymagana jest akceptacja Regulaminu.'))
    try {
      let activeSession = session
      if (!activeSession) {
        if (!emailFormValid) {
          return setError(t('Enter your full name, a valid email address and a password of at least 8 characters.', 'Podaj imię i nazwisko, poprawny adres e-mail oraz hasło składające się z co najmniej 8 znaków.'))
        }
        setPhase('account')
        const r = await callConvex('action', 'studentAuth:studentSignupAction', {
          name: fullName.trim(), email: email.trim(), password, phone: phone.trim() || undefined,
        })
        if (!r?.success) {
          setPhase('idle')
          if (/already exists|istnieje/i.test(r?.error || '')) { setEmailTaken(true); return }
          return setError(r?.error || t('Could not create the account.', 'Nie udało się utworzyć konta.'))
        }
        persistSession(r.student, r.sessionToken)
        activeSession = { ...r.student, sessionToken: r.sessionToken }
        setSession(activeSession)
      }
      setAccountReady(true)
      await placeOrders(activeSession)
    } catch (ex) {
      setPhase('idle')
      setError((accountReady
        ? t('Your account was created, but we could not save the order. Try again to complete it.', 'Konto zostało utworzone, ale nie udało się zapisać zamówienia. Spróbuj ponownie, aby je dokończyć.')
        : (ex.message || t('We could not complete this step. Please try again.', 'Nie udało się wykonać tej operacji. Spróbuj ponownie.'))))
    }
  }

  const buttonLabel = phase === 'account'
    ? t('Creating your account…', 'Tworzymy konto…')
    : phase === 'order'
      ? t('Saving your order…', 'Zapisujemy zamówienie…')
      : t('Order with an obligation to pay', 'Zamówienie z obowiązkiem zapłaty')

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
          <h1>{t('Your account has been created and your order has been placed.', 'Konto zostało utworzone, a zamówienie złożone.')}</h1>
          <p className="co-success-ref">{t('Order reference', 'Numer zamówienia')}: <strong>{done.ref}</strong></p>
          <ul className="co-status-list">
            <li data-state="ok">
              <span className="material-symbols-outlined" aria-hidden>check_circle</span>
              {t('EnglishMetro account: created', 'Konto EnglishMetro: utworzone')} · {done.email}
            </li>
            <li data-state="wait">
              <span className="material-symbols-outlined" aria-hidden>schedule</span>
              {t('Order: awaiting payment', 'Zamówienie: oczekuje na płatność')}
            </li>
            <li data-state="next">
              <span className="material-symbols-outlined" aria-hidden>school</span>
              {t('Lesson package: added after payment is confirmed', 'Pakiet lekcji: zostanie dodany po potwierdzeniu płatności')}
            </li>
          </ul>
          <p className="co-success-copy">
            {t(
              `We sent the confirmation, the Terms (with the withdrawal form) and the secure payment link details to ${done.email}. Payment runs through Przelewy24 (BLIK, cards, fast transfer).`,
              `Potwierdzenie, Regulamin (z formularzem odstąpienia) oraz informacje o bezpiecznej płatności wysłaliśmy na adres ${done.email}. Płatność realizuje Przelewy24 (BLIK, karty, szybki przelew).`,
            )}
          </p>
          <div className="co-success-actions">
            {session?.slug && (
              <a className="lp-button lp-button-primary" href={`/app/${session.slug}/dashboard`}>
                <span className="material-symbols-outlined" aria-hidden>dashboard</span>
                {t('Go to your account', 'Przejdź do konta')}
              </a>
            )}
            <Link className="lp-button lp-button-ghost" to="/lessons">
              <span className="material-symbols-outlined" aria-hidden>school</span>
              {t('Back to lessons', 'Wróć do lekcji')}
            </Link>
          </div>
        </section>
      ) : state.items.length === 0 ? (
        <section className="co-shell co-empty">
          <span className="material-symbols-outlined" aria-hidden>shopping_cart</span>
          <h1>{t('Your cart is empty.', 'Twój koszyk jest pusty.')}</h1>
          <p>{t('Add a lesson package to continue to checkout.', 'Dodaj pakiet lekcji, aby przejść do finalizacji zamówienia.')}</p>
          <Link className="lp-button lp-button-primary" to="/lessons#pricing">
            <span className="material-symbols-outlined" aria-hidden>storefront</span>
            {t('Browse packages', 'Zobacz pakiety')}
          </Link>
        </section>
      ) : (
        <section className="co-shell">
          <header className="co-head">
            <p className="lp-section-label">{t('Checkout', 'Finalizacja zamówienia')}</p>
            <h1>{t('Create your account and order your package.', 'Załóż konto i zamów pakiet.')}</h1>
            <p className="co-head-sub">
              {t(
                'The account links your lessons to you. Once payment is confirmed, the package appears on your account.',
                'Konto pozwala przypisać lekcje do właściwej osoby. Po potwierdzeniu płatności pakiet pojawi się na Twoim koncie.',
              )}
            </p>
            <ol className="co-steps">
              <li data-active={true} data-done={kontoStepDone}>{t('Account', 'Konto')}</li>
              <li data-active={kontoStepDone}>{t('Order', 'Zamówienie')}</li>
              <li data-active={kontoStepDone && consentTerms}>{t('Payment', 'Płatność')}</li>
            </ol>
          </header>

          <div className="co-grid">
            <form className="co-form" onSubmit={submitOrder} noValidate>
              {/* ── 1. Konto ── */}
              <fieldset className="co-block co-account" data-done={accountDone}>
                <legend>{t('Create your EnglishMetro account', 'Utwórz konto EnglishMetro')}</legend>
                {session ? (
                  <div className="co-account-ready">
                    <span className="co-account-check material-symbols-outlined" aria-hidden>check_circle</span>
                    <div className="co-account-id">
                      <strong>{t('Account ready', 'Konto gotowe')}</strong>
                      <span>{session.name} · {session.email}</span>
                    </div>
                    <button type="button" className="co-account-change" onClick={changeAccount}>
                      {t('Use a different account', 'Użyj innego konta')}
                    </button>
                  </div>
                ) : (
                  <>
                    <p className="co-account-signin">
                      {t('Already have an account?', 'Masz już konto?')}{' '}
                      <Link to="/login?next=/checkout">{t('Sign in', 'Zaloguj się')}</Link>
                    </p>
                    <div className="co-google-slot">
                      <div ref={googleBtnRef} aria-label="Google Sign-In" />
                    </div>
                    <div className="co-divider" aria-hidden>
                      <span>{t('or create an account with email', 'lub załóż konto przez e-mail')}</span>
                    </div>
                    <label className="co-field">
                      <span>{t('Full name', 'Imię i nazwisko')} *</span>
                      <input value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" placeholder="Marta Kowalska" required />
                    </label>
                    <label className="co-field">
                      <span>E-mail *</span>
                      <input value={email} onChange={(e) => { setEmail(e.target.value); setEmailTaken(false) }} type="email" autoComplete="email" placeholder="marta@example.com" required />
                    </label>
                    {emailTaken && (
                      <div className="co-email-taken" role="alert">
                        <strong>{t('An account already exists for this email address.', 'Dla tego adresu e-mail istnieje już konto.')}</strong>
                        <p>{t('Sign in to complete your order. Your cart and entered details will be saved.', 'Zaloguj się, aby dokończyć zamówienie. Koszyk i wprowadzone dane zostaną zachowane.')}</p>
                        <Link className="lp-button lp-button-primary co-email-taken-cta" to="/login?next=/checkout">
                          {t('Sign in and return to checkout', 'Zaloguj się i wróć do finalizacji zamówienia')}
                        </Link>
                      </div>
                    )}
                    <label className="co-field">
                      <span>{t('Password', 'Hasło')} *</span>
                      <div className="co-pw-wrap">
                        <input value={password} onChange={(e) => setPassword(e.target.value)} type={showPw ? 'text' : 'password'} autoComplete="new-password" required minLength={8} />
                        <button type="button" className="co-pw-toggle" onClick={() => setShowPw(v => !v)}
                          aria-label={showPw ? t('Hide password', 'Ukryj hasło') : t('Show password', 'Pokaż hasło')}>
                          <span className="material-symbols-outlined" aria-hidden>{showPw ? 'visibility_off' : 'visibility'}</span>
                        </button>
                      </div>
                      <small className="co-hint" data-ok={password.length >= 8}>
                        {t('Minimum 8 characters. You will use it to sign in to your account.', 'Minimum 8 znaków. Hasło będzie służyło do logowania na Twoje konto.')}
                      </small>
                    </label>
                    <label className="co-field">
                      <span>{t('Phone number (optional)', 'Numer telefonu (opcjonalnie)')}</span>
                      <input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" autoComplete="tel" placeholder="+48 600 000 000" />
                    </label>
                  </>
                )}
              </fieldset>

              {/* ── 2. Zamówienie ── */}
              <div className="co-later" data-ready={kontoStepDone}>
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
                  <legend>{t('Learner details and notes (optional)', 'Dane ucznia i uwagi dla lektora (opcjonalnie)')}</legend>
                  <p className="co-parent-hint">
                    {t(
                      'Buying for your child? Create the account in your own name and add the learner\'s name and details below.',
                      'Kupujesz pakiet dla dziecka? Konto załóż na dane rodzica lub opiekuna, a poniżej wpisz imię dziecka i ważne informacje dla lektora.',
                    )}
                  </p>
                  <label className="co-field">
                    <span className="sr-only">{t('Notes', 'Uwagi')}</span>
                    <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)}
                      placeholder={t('E.g. the package is for Zosia, age 12; exam preparation.', 'Np. pakiet dla Zosi, 12 lat; przygotowanie do egzaminu ósmoklasisty.')} />
                  </label>
                </fieldset>

                {/* ── 3. Płatność ── */}
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
                      <small className="co-consent-hint">
                        {t('Optional. This concerns starting lessons before the 14-day withdrawal period ends.',
                           'Opcjonalne. Dotyczy rozpoczęcia lekcji przed upływem 14-dniowego terminu odstąpienia.')}
                      </small>
                    </span>
                  </label>
                  <label className="co-check">
                    <input type="checkbox" checked={consentMarketing} onChange={(e) => setConsentMarketing(e.target.checked)} />
                    <span>
                      {isPl ? 'Chcę otrzymywać informacje handlowe i marketingowe.' : 'I would like to receive commercial and marketing information.'}
                      <small className="co-consent-hint">
                        {t('Optional. Occasional e-mails about lessons and offers.', 'Opcjonalne. Sporadyczne e-maile o lekcjach i ofertach.')}
                      </small>
                    </span>
                  </label>
                </fieldset>

                {error && <p className="co-error" role="alert">{error}</p>}

                <button className="co-submit" type="submit" disabled={sending} data-sending={sending}>
                  <span className="material-symbols-outlined" aria-hidden>{sending ? 'progress_activity' : 'lock'}</span>
                  {buttonLabel}
                </button>

                <p className="co-next-line">
                  {session
                    ? t('Pressing the button places the order on your account. The secure payment link arrives by e-mail.',
                        'Klikając przycisk, złożysz zamówienie na swoim koncie. Link do bezpiecznej płatności otrzymasz e-mailem.')
                    : t('Pressing the button creates your EnglishMetro account and places the order. The secure payment link arrives by e-mail.',
                        'Klikając przycisk, utworzysz konto EnglishMetro i złożysz zamówienie. Link do bezpiecznej płatności otrzymasz e-mailem.')}
                </p>

                <p className="co-admin-note">{isPl ? ADMIN_NOTICE_PL : ADMIN_NOTICE_EN}</p>
              </div>
            </form>

            <aside className="co-summary" aria-label={t('Order summary', 'Podsumowanie zamówienia')}>
              <h2>{t('Order summary', 'Podsumowanie')}</h2>
              <ul className="co-items">
                {state.items.map((item, idx) => (
                  <li key={item.id} style={{ '--co-i': idx }}>
                    <div className="co-item-main">
                      <strong>{item.name}{item.qty > 1 ? ` ×${item.qty}` : ''}</strong>
                      <span>{isPl ? item.pacePl || item.pace : item.pace}</span>
                    </div>
                    <div className="co-item-side">
                      <strong>{formatPLN(item.pricePLN * item.qty)}</strong>
                      <button type="button" className="co-item-remove" onClick={() => cart.remove(item.id)}
                        aria-label={t('Remove', 'Usuń')}>
                        <span className="material-symbols-outlined" aria-hidden>close</span>
                      </button>
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
                  <span className="co-pay-brand">{t('Payment link by e-mail', 'Link do płatności e-mailem')}</span>
                  <span className="co-pay-kinds">{t('Processed securely by Przelewy24 · BLIK · cards · fast transfer', 'Realizowana bezpiecznie przez Przelewy24 · BLIK · karty · szybki przelew')}</span>
                </div>
                <ol className="co-next-steps">
                  <li>{t('We create your account and order.', 'Utworzymy konto i zamówienie.')}</li>
                  <li>{t('You receive the payment link.', 'Otrzymasz link do płatności.')}</li>
                  <li>{t('After payment, the lessons are allocated.', 'Po płatności przydzielimy lekcje.')}</li>
                </ol>
                <p className="co-pay-note">
                  {t(
                    'No card details are collected on this page. Lesson validity: single lesson 90 days; 4-8 lesson packs 6 months; 16-24 lesson packs 12 months. Statutory 14-day withdrawal rights apply.',
                    'Ta strona nie zbiera danych karty. Ważność pakietów: lekcja jednorazowa 90 dni; pakiety 4-8 lekcji 6 miesięcy; pakiety 16-24 lekcji 12 miesięcy. Przysługuje ustawowe 14-dniowe prawo odstąpienia.',
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
