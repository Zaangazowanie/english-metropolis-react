import { detectInitial } from '../../i18n'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Skyline } from '../../design/v3/primitives.jsx'
import { useCart, cart, cartTotalPLN, formatPLN } from './cart-store.js'
import { PACKAGE_LESSONS, packageValidity } from './packages.js'
import { FOUNDATION, FOUNDATION_FOOTER_PL, FOUNDATION_FOOTER_EN } from '../legal/foundation-legal-content.js'
import { fetchWithTimeout } from '../../practice/lib/practice-cache'
import PaymentMethods from './PaymentMethods.jsx'
import { KNOWN_METHOD_KEYS } from './payment-method-copy.js'
import './checkout.css'

// Checkout = account + order + server-registered Przelewy24 payment. The
// browser sends only catalog IDs and quantities; Convex is the price authority
// and returns the P24 redirect after storing the payment session and order lines.
const GOOGLE_CLIENT_ID = '960729188616-r2ql4rjid9aibbo1psi678gonf8lp04o.apps.googleusercontent.com'

const ADMIN_NOTICE_PL = 'Administratorem danych wprowadzonych do formularza jest Fundacja Rozwoju Przedsiębiorczości „Twój StartUp". Dane będą przetwarzane w celu zrealizowania usługi oraz w celach marketingowych – w przypadku wyrażenia zgody. Informujemy o możliwości wycofania zgody. Pełne informacje o przetwarzaniu danych i przysługujących prawach znajdują się w polityce prywatności.'
const ADMIN_NOTICE_EN = 'The controller of the data entered in this form is Fundacja Rozwoju Przedsiębiorczości "Twój StartUp". The data will be processed to deliver the service and, if you consent, for marketing purposes. Consent can be withdrawn at any time. Full information about data processing and your rights is available in the privacy policy.'

async function callConvex(kind, path, args) {
  const response = await fetchWithTimeout(`/api/${kind}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, args }),
  })
  const payload = await response.json()
  if (payload?.status !== 'success') throw new Error(payload?.errorMessage || `${path} failed`)
  return payload.value
}

// Polish NIP: 10 digits, weighted checksum (mod 11). KSeF structured invoices
// carry the NIP as bare digits, so the value is normalized before sending.
function validNIP(raw) {
  const d = String(raw || '').replace(/[^0-9]/g, '')
  if (d.length !== 10) return false
  const w = [6, 5, 7, 2, 3, 4, 5, 6, 7]
  const sum = w.reduce((s, wi, i) => s + wi * Number(d[i]), 0)
  return sum % 11 === Number(d[9])
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
  const state = useCart()
  // Seeded from the app's stored language so a student sent here from the
  // English in-app UI is not consented in Polish. Visitors without the key
  // (public site, first visit) keep the Polish default.
  const [lang, setLang] = useState(() => detectInitial())
  // Account section
  const [session, setSession] = useState(() => readSession())
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [phone, setPhone] = useState('')
  // Compulsory from 2026-08-10: only adults may hold an account. Buying FOR a
  // child is the `forChild` declaration further down, not a younger birthdate.
  const [dateOfBirth, setDateOfBirth] = useState('')
  // A brand-new Google identity arrives verified but with no birthdate, so the
  // token waits here until the field below is answered.
  const [pendingGoogleToken, setPendingGoogleToken] = useState(null)
  const [emailTaken, setEmailTaken] = useState(false)
  const googleBtnRef = useRef(null)
  const [googleReady, setGoogleReady] = useState(false)
  // Whether GIS actually painted a button. Blocked, offline or ad-blocked, the
  // slot stayed an empty 44px gap above a divider reading "or create an account
  // with email" — an "or" with nothing on the other side of it.
  const [googleRendered, setGoogleRendered] = useState(false)
  // Order section
  const [invoiceOpen, setInvoiceOpen] = useState(false)
  const [company, setCompany] = useState('')
  const [nip, setNip] = useState('')
  const [address, setAddress] = useState('')
  const [postalCode, setPostalCode] = useState('')
  const [city, setCity] = useState('')
  const [country, setCountry] = useState('Polska')
  const [notes, setNotes] = useState('')
  // PayPo requires a Polish residential address for its eligibility check.
  // It stays separate from the optional invoice details above: using deferred
  // payment must not silently ask us to issue an invoice.
  const [payPoAddress, setPayPoAddress] = useState('')
  const [payPoPostalCode, setPayPoPostalCode] = useState('')
  const [payPoCity, setPayPoCity] = useState('')
  // Buying for a child. Declared by the adult at the till, and the only thing
  // that decides it — the analysis add-on is then not offered at all, and the
  // server refuses it even if the request is forged.
  const [forChild, setForChild] = useState(false)
  // Off by default. The one exception is arriving from Bajla's own CTA
  // (?addon=1), where the customer has just tapped a button that says buying
  // this is what switches her on — so starting it ticked reflects what they
  // asked for rather than pre-selecting something nobody mentioned. It stays a
  // plain checkbox they can untick, and the consent itself is still only
  // written on a verified payment in p24:finalizePaid.
  const [analysisAddon, setAnalysisAddon] = useState(
    () => new URLSearchParams(window.location.search).get('addon') === '1')
  // Consents + submission
  const [consentTerms, setConsentTerms] = useState(false)
  // Early performance is a CHOICE with no default: null until the customer picks.
  // Regulamin § 193 requires a "odrębne, aktywne i domyślnie niezaznaczone
  // oświadczenie" — separate, active, unticked by default — so neither option may
  // start selected. Presenting both and requiring one is what stops a buyer
  // skimming past the request and landing on the slow path by accident; it is
  // the framing that changes, never the default.
  const [performanceChoice, setPerformanceChoice] = useState(null) // null | 'now' | 'wait'
  const consentImmediate = performanceChoice === 'now'
  const [consentMarketing, setConsentMarketing] = useState(false)
  // ── Quote mode (2026-08-17) ──
  // ?quote=<ref> checks out a price the SERVER worked out and stored, instead of
  // the cart. It is how the AI-analysis upgrade is bought, and how a negotiated
  // price gets paid through this page rather than a hand-registered P24 link.
  // The reference is all the browser holds; the amount is re-read server-side at
  // registration, so editing this URL cannot change what is charged.
  const quoteRef = useMemo(
    () => new URLSearchParams(window.location.search).get('quote') || null, [])
  const [quote, setQuote] = useState(null)      // null while loading, false if unusable
  // Buying the analysis IS the consent — but it has to be its own explicit,
  // informed action, never folded into the Terms or marketing tickbox.
  const [consentAnalysis, setConsentAnalysis] = useState(false)
  const [error, setError] = useState('')
  const [phase, setPhase] = useState('idle') // idle | account | order
  const [accountReady, setAccountReady] = useState(false)
  // Payment methods come from P24 at mount, never from a list kept here, so the
  // page cannot offer something the account is not actually enabled for.
  const [methodGroups, setMethodGroups] = useState(null)
  const [methodsFailed, setMethodsFailed] = useState(false)
  const [methodKey, setMethodKey] = useState(null)

  // Display only. convex/p24.ts re-derives this and is the price authority; if
  // the two ever disagree the customer is charged what the server computed, so
  // this constant and ANALYSIS_ADDON_PLN_PER_LESSON must be changed together.
  const ANALYSIS_PLN_PER_LESSON = 20
  const quoteMode = !!quoteRef
  const quoteReady = quoteMode && quote && quote.status === 'open' && !quote.expired
  const quoteNeedsAnalysisConsent = !!quoteReady && !!quote.grantAnalysisScope
  const analysisLessons = state.items.reduce(
    (n, item) => n + (PACKAGE_LESSONS[item.id] ?? 0) * item.qty, 0)
  // The per-package add-on is a cart concept. A quote already carries its own
  // price for the analysis, so offering it again here would double-charge.
  const analysisOffered = !quoteMode && !forChild && analysisLessons > 0
  const analysisPLN = analysisOffered && analysisAddon ? analysisLessons * ANALYSIS_PLN_PER_LESSON : 0
  // Shown to the customer. The server charges `quote.amount` regardless.
  const total = quoteReady ? quote.amount / 100 : cartTotalPLN(state) + analysisPLN
  const isPl = lang === 'pl'
  const t = (en, pl) => (isPl ? pl : en)
  // The reference identifies one cart, not one page visit. If it survived a cart
  // edit, a retry after a failed attempt would resume the earlier payment and
  // charge the earlier total, so it is re-minted whenever the cart changes.
  const cartKey = quoteRef || state.items.map(item => `${item.id}x${item.qty}`).sort().join('|')
  const orderRef = useMemo(() => {
    const d = new Date()
    const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
    let hash = 0
    for (let i = 0; i < cartKey.length; i += 1) hash = (hash * 31 + cartKey.charCodeAt(i)) >>> 0
    const rand = crypto.getRandomValues(new Uint32Array(1))[0]
    return `EM-${ymd}-${hash.toString(36).slice(-4).toUpperCase()}${rand.toString(36).slice(0, 6).toUpperCase()}`
  }, [cartKey])

  // Invoice details: optional as a whole, but once any field is filled the set
  // must be complete enough for a compliant faktura VAT (art. 106e: buyer name
  // and address always; NIP for a company). Issued through KSeF, which rejects
  // malformed buyer data outright, so this is validated here, not at the
  // accountant's desk.
  const invoiceUsed = [company, nip, address, postalCode, city].some(s => s.trim())
  const isPolandInvoice = /pol|^pl$/i.test(country.trim() || 'Polska')
  function invoiceProblem() {
    if (!invoiceUsed) return null
    if (company.trim() && !nip.trim()) {
      return t('A company invoice must carry the company NIP. Add it, or clear the company name for a personal invoice.',
        'Faktura na firmę musi zawierać NIP. Uzupełnij NIP albo usuń nazwę firmy, aby otrzymać fakturę imienną.')
    }
    if (nip.trim() && !validNIP(nip)) {
      return t('The NIP looks invalid. Check the 10 digits.', 'NIP wygląda na niepoprawny. Sprawdź, czy wpisano 10 cyfr.')
    }
    const addr = address.trim()
    if (addr.length < 4 || !/\d/.test(addr)) {
      return t('The invoice needs a street with a house or flat number.', 'Do faktury potrzebny jest adres z numerem domu lub lokalu.')
    }
    if (isPolandInvoice ? !/^\d{2}-\d{3}$/.test(postalCode.trim()) : postalCode.trim().length < 3) {
      return t('Enter the postal code (00-000 in Poland).', 'Podaj kod pocztowy w formacie 00-000.')
    }
    if (city.trim().length < 2) {
      return t('Enter the city or town for the invoice.', 'Podaj miejscowość do faktury.')
    }
    return null
  }

  function payPoProblem() {
    if (methodKey !== 'paypo') return null
    const addr = payPoAddress.trim()
    if (addr.length < 4 || !/\d/.test(addr)) {
      return t('PayPo needs your street and house or flat number.', 'PayPo wymaga ulicy oraz numeru domu lub lokalu.')
    }
    if (!/^\d{2}-\d{3}$/.test(payPoPostalCode.trim())) {
      return t('Enter your postal code in the 00-000 format for PayPo.', 'Podaj kod pocztowy dla PayPo w formacie 00-000.')
    }
    if (payPoCity.trim().length < 2) {
      return t('Enter your city or town for PayPo.', 'Podaj miejscowość dla PayPo.')
    }
    return null
  }

  useEffect(() => { if (forChild) setAnalysisAddon(false) }, [forChild])

  const accountDone = !!session
  const emailFormValid = fullName.trim().length >= 2 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()) && password.length >= 8 && !!dateOfBirth
  const kontoStepDone = accountDone || emailFormValid
  const sending = phase === 'account' || phase === 'order'
  // Calendar arithmetic, not 18×365.25 days, or the boundary drifts by a day
  // across leap years and turns away someone who is exactly 18 today.
  const maxDob = useMemo(() => {
    const d = new Date()
    d.setFullYear(d.getFullYear() - 18)
    return d.toISOString().slice(0, 10)
  }, [])
  const DOB_COPY = {
    DOB_REQUIRED: t('Please enter your date of birth.', 'Podaj datę urodzenia.'),
    DOB_INVALID: t('Please enter a valid date of birth.', 'Podaj poprawną datę urodzenia.'),
    DOB_UNDERAGE: t(
      'You must be 18 or over to create an account. A parent or guardian can create one and buy lessons for a child.',
      'Konto może założyć wyłącznie osoba, która ukończyła 18 lat. Rodzic lub opiekun może założyć konto i kupić lekcje dla dziecka.',
    ),
  }
  const dobMessage = (r) => (r?.code && DOB_COPY[r.code]) || r?.error || ''

  // ── Google Sign-In (same GIS client as /login and /signup) ──
  async function submitGoogle(idToken, dob) {
    setError('')
    try {
      const result = await callConvex('action', 'googleAuth:googleSignIn',
        { idToken, ...(dob ? { dateOfBirth: dob } : {}) })
      // Verified identity, no account yet, no birthdate. Nothing is created
      // until the field below is answered; the token waits.
      if (result?.needsDateOfBirth) {
        setPendingGoogleToken(idToken)
        setError(result.code
          ? dobMessage(result)
          : t('Add your date of birth to finish creating the account.',
               'Podaj datę urodzenia, aby dokończyć zakładanie konta.'))
        return
      }
      if (!result?.success || result.kind !== 'student') {
        setError(dobMessage(result) || t('Google sign-in did not work. Use e-mail and password below.', 'Logowanie Google nie powiodło się. Użyj adresu e-mail i hasła poniżej.'))
        return
      }
      setPendingGoogleToken(null)
      persistSession(result.student, result.sessionToken)
      setSession(readSession() || { ...result.student, sessionToken: result.sessionToken })
    } catch (ex) {
      setError(ex.message || 'Google sign-in failed')
    }
  }

  async function handleGoogleCredential(response) {
    const idToken = response?.credential
    if (!idToken) return
    await submitGoogle(idToken, dateOfBirth)
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
      setGoogleRendered(googleBtnRef.current.childElementCount > 0)
    } catch { /* password path still works */ }
  }, [googleReady, session])

  // Fetched once, deliberately not per language. P24 localise the bank NAMES,
  // which this page never shows, so refetching on an EN/PL toggle would only
  // collapse the list back to skeletons and replay its entrance for nothing.
  useEffect(() => {
    let cancelled = false
    callConvex('action', 'p24:listMethods', { lang: 'pl' })
      .then((result) => {
        if (cancelled) return
        // A group we have no copy for would render as an invisible row that can
        // still be submitted, so unknown keys are dropped rather than displayed.
        const groups = (Array.isArray(result?.groups) ? result.groups : [])
          .filter(group => KNOWN_METHOD_KEYS.includes(group?.key))
        setMethodGroups(groups)
        // Preselect the first method so the common path is one tap shorter.
        setMethodKey(groups[0]?.key ?? null)
      })
      .catch(() => { if (!cancelled) { setMethodsFailed(true); setMethodGroups([]) } })
    return () => { cancelled = true }
  }, [])

  // A quote is written for one student, so it can only be paid by that student
  // while signed in. Someone arriving with a quote link and no session is sent
  // to log in and back — never offered account creation, which would allocate
  // the purchase to a brand-new, wrong account (the 2026-08-10 legacy-slug bug).
  useEffect(() => {
    if (!quoteRef) return
    const active = readSession()
    if (!active) {
      const next = encodeURIComponent(`/checkout?quote=${quoteRef}`)
      window.location.assign(`/login?next=${next}`)
      return
    }
    let cancelled = false
    callConvex('query', 'analysisOffers:getQuote', {
      sessionToken: active.sessionToken, quoteRef,
    })
      .then(value => { if (!cancelled) setQuote(value || false) })
      .catch(() => { if (!cancelled) setQuote(false) })
    return () => { cancelled = true }
  }, [quoteRef])

  function changeAccount() {
    try { window.localStorage.removeItem('em-student-session') } catch { /* no-op */ }
    setSession(null)
    setAccountReady(false)
  }

  // ── Submit: (create account) → register one P24 transaction ──
  async function startPayment(activeSession) {
    setPhase('order')
    const billing = {
      fullName: activeSession.name || fullName.trim(),
      email: activeSession.email || email.trim(),
      phone: phone.trim() || undefined,
      company: company.trim() || undefined,
      nip: nip.replace(/[^0-9]/g, '') || undefined,
      addressLine: address.trim() || undefined,
      postalCode: postalCode.trim() || undefined,
      city: city.trim() || undefined,
      country: invoiceUsed ? (country.trim() || 'Polska') : undefined,
      notes: notes.trim() || undefined,
    }
    // Transfers deliberately send no method: the bank list, and each bank's
    // availability hours, are Przelewy24's to present.
    const chosen = (methodGroups || []).find(group => group.key === methodKey)
    const payment = await callConvex('action', 'p24:createPayment', {
      sessionToken: activeSession.sessionToken,
      checkoutRef: orderRef,
      // A quote replaces the cart outright — the server refuses the two together.
      items: quoteMode ? [] : state.items.map(item => ({ packageId: item.id, qty: item.qty })),
      billing,
      lang,
      consentTerms,
      consentImmediate,
      consentMarketing,
      analysisAddon: analysisOffered && analysisAddon,
      forChild,
      ...(quoteMode ? { quoteRef, consentAnalysis } : {}),
      ...(chosen?.methodId ? { method: chosen.methodId } : {}),
      ...(methodKey === 'paypo' ? {
        payPoDetails: {
          addressLine: payPoAddress.trim(),
          postalCode: payPoPostalCode.trim(),
          city: payPoCity.trim(),
        },
      } : {}),
    })
    if (!payment?.redirectUrl || !/^https:\/\//.test(payment.redirectUrl)) {
      throw new Error(t('The secure payment link was not returned.', 'Nie otrzymaliśmy bezpiecznego linku do płatności.'))
    }
    window.location.assign(payment.redirectUrl)
  }

  async function submitOrder(event) {
    event.preventDefault()
    if (sending) return
    setError('')
    setEmailTaken(false)
    if (!consentTerms) return setError(t('Accepting the Terms (Regulamin) is required to place an order.', 'Do złożenia zamówienia wymagana jest akceptacja Regulaminu.'))
    if (quoteMode && !quoteReady) {
      return setError(t('This offer is no longer valid. Open the upgrade again from your lesson to get a fresh price.',
        'Ta oferta wygasła. Otwórz ulepszenie ponownie ze swojej lekcji, aby otrzymać aktualną cenę.'))
    }
    // The analysis consent is its own gate, separate from the Terms above. The
    // server refuses the payment without it too — this is only the earlier,
    // clearer refusal.
    if (quoteNeedsAnalysisConsent && !consentAnalysis) {
      return setError(t('To buy the AI lesson analysis you must agree to your lessons being recorded, transcribed and analysed.',
        'Aby kupić analizę lekcji AI, musisz wyrazić zgodę na nagrywanie, transkrypcję i analizę Twoich lekcji.'))
    }
    // Requiring a pick is not the same as defaulting to one. Both options are
    // offered equally and neither is preselected, so the early-performance
    // request stays an active declaration — a buyer simply cannot skim past it
    // and be put on the 14-day wait without having chosen it.
    if (performanceChoice === null) {
      return setError(t(
        'Choose when your package should activate — straight away, or after the 14-day withdrawal period.',
        'Wybierz, kiedy pakiet ma zostać aktywowany — od razu czy po upływie 14-dniowego terminu na odstąpienie.',
      ))
    }
    const payPoError = payPoProblem()
    if (payPoError) return setError(payPoError)
    const invoiceError = invoiceProblem()
    if (invoiceError) { setInvoiceOpen(true); return setError(invoiceError) }
    try {
      let activeSession = session
      if (!activeSession) {
        if (!emailFormValid) {
          return setError(t('Enter your full name, a valid email address, your date of birth and a password of at least 8 characters.', 'Podaj imię i nazwisko, poprawny adres e-mail, datę urodzenia oraz hasło składające się z co najmniej 8 znaków.'))
        }
        setPhase('account')
        const r = await callConvex('action', 'studentAuth:studentSignupAction', {
          name: fullName.trim(), email: email.trim(), password, phone: phone.trim() || undefined,
          dateOfBirth,
        })
        if (!r?.success) {
          setPhase('idle')
          if (/already exists|istnieje/i.test(r?.error || '')) { setEmailTaken(true); return }
          return setError(dobMessage(r) || t('Could not create the account.', 'Nie udało się utworzyć konta.'))
        }
        persistSession(r.student, r.sessionToken)
        activeSession = { ...r.student, sessionToken: r.sessionToken }
        setSession(activeSession)
      }
      setAccountReady(true)
      await startPayment(activeSession)
    } catch (ex) {
      setPhase('idle')
      if (/CART_CHANGED/.test(ex.message || '')) {
        return setError(t(
          'Your cart changed after this payment was started. Reload the page and order again so you are charged the total shown.',
          'Koszyk zmienił się po rozpoczęciu tej płatności. Odśwież stronę i złóż zamówienie ponownie, aby pobrana kwota odpowiadała wyświetlanej sumie.',
        ))
      }
      if (/PAYPO_ADDRESS_REQUIRED/.test(ex.message || '')) {
        return setError(t(
          'Check the address, postal code and city required for PayPo.',
          'Sprawdź adres, kod pocztowy i miejscowość wymagane przez PayPo.',
        ))
      }
      setError((accountReady
        ? t('Your account was created, but we could not save the order. Try again to complete it.', 'Konto zostało utworzone, ale nie udało się zapisać zamówienia. Spróbuj ponownie, aby je dokończyć.')
        : (ex.message || t('We could not complete this step. Please try again.', 'Nie udało się wykonać tej operacji. Spróbuj ponownie.'))))
    }
  }

  // Named from the live method list, so the summary can never advertise a
  // method the account cannot take. New methods appear here when P24 enable them.
  const payKinds = (methodGroups || [])
    .map(group => ({
      blik: 'BLIK',
      card: t('cards', 'karty'),
      paypo: 'PayPo',
      transfer: t('online transfer', 'przelew online'),
    })[group.key])
    .filter(Boolean)
    .join(' · ')

  const buttonLabel = phase === 'account'
    ? t('Creating your account…', 'Tworzymy konto…')
    : phase === 'order'
      ? t('Opening secure payment…', 'Otwieramy bezpieczną płatność…')
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

      {quoteMode && quote === null ? (
        <section className="co-shell co-empty">
          <h1>{t('Loading your offer…', 'Wczytujemy Twoją ofertę…')}</h1>
        </section>
      ) : quoteMode && !quoteReady ? (
        <section className="co-shell co-empty">
          <span className="material-symbols-outlined" aria-hidden>error</span>
          <h1>{t('This offer is no longer valid.', 'Ta oferta jest już nieaktualna.')}</h1>
          <p>{t('Prices are worked out for your account when you ask for them, and they do not last for ever. Open the upgrade again from your lesson to get a current one.',
            'Ceny wyliczamy dla Twojego konta w chwili zapytania i nie obowiązują bezterminowo. Otwórz ulepszenie ponownie ze swojej lekcji, aby zobaczyć aktualną cenę.')}</p>
          <Link className="lp-button lp-button-primary" to="/">
            {t('Back to your lessons', 'Wróć do swoich lekcji')}
          </Link>
        </section>
      ) : !quoteMode && state.items.length === 0 ? (
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
                    <div className="co-google-slot" data-rendered={googleRendered}>
                      <div ref={googleBtnRef} aria-label="Google Sign-In" />
                    </div>
                    {googleRendered && (
                      <div className="co-divider" aria-hidden>
                        <span>{t('or create an account with email', 'lub załóż konto przez e-mail')}</span>
                      </div>
                    )}
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
                      <span>{t('Date of birth', 'Data urodzenia')} *</span>
                      <input value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)}
                        type="date" max={maxDob} autoComplete="bday" required />
                      <small className="co-hint" data-ok={!!dateOfBirth}>
                        {t(
                          'The account holder must be 18 or over. Buying for a child? Create the account in your own name and tick the box in the learner details below.',
                          'Właściciel konta musi mieć ukończone 18 lat. Kupujesz dla dziecka? Załóż konto na swoje dane i zaznacz pole w danych ucznia poniżej.',
                        )}
                      </small>
                    </label>
                    {pendingGoogleToken && (
                      <button type="button" className="lp-button lp-button-primary co-google-dob"
                        disabled={!dateOfBirth}
                        onClick={() => submitGoogle(pendingGoogleToken, dateOfBirth)}>
                        {t('Finish creating my Google account', 'Dokończ zakładanie konta Google')}
                      </button>
                    )}
                    <label className="co-field">
                      <span>{t('Phone number (optional)', 'Numer telefonu (opcjonalnie)')}</span>
                      <input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" autoComplete="tel" placeholder="+48 600 000 000" />
                    </label>
                  </>
                )}
              </fieldset>

              {/* ── 2. Zamówienie ── */}
              <div className="co-later" data-ready={kontoStepDone}>
                <fieldset className="co-block co-invoice" data-open={invoiceOpen}>
                  <legend>
                    <button type="button" className="co-invoice-toggle" onClick={() => setInvoiceOpen((v) => !v)} aria-expanded={invoiceOpen}>
                      <span className="material-symbols-outlined" aria-hidden>{invoiceOpen ? 'expand_less' : 'expand_more'}</span>
                      {t('Invoice details (optional)', 'Dane do faktury (opcjonalnie)')}
                    </button>
                  </legend>
                  <div className="co-collapse" data-open={invoiceOpen}>
                    <div className="co-collapse-inner">
                      <p className="co-consent-hint">
                        {t(
                          'The invoice is issued by the Foundation through the national KSeF e-invoicing system. It must carry your full address, and for a company purchase also the company NIP.',
                          'Fakturę wystawia Fundacja w krajowym systemie e-faktur KSeF. Faktura musi zawierać pełny adres, a przy zakupie na firmę także NIP firmy.',
                        )}
                      </p>
                      <label className="co-field">
                        <span>{t('Company name', 'Nazwa firmy')}</span>
                        <input value={company} onChange={(e) => setCompany(e.target.value)} autoComplete="organization" />
                        <small className="co-hint">
                          {t('Leave empty for an invoice issued to you as a private person.', 'Zostaw puste, jeśli faktura ma być wystawiona na osobę prywatną.')}
                        </small>
                      </label>
                      <label className="co-field">
                        <span>NIP{company.trim() ? ' *' : ''}</span>
                        <input value={nip} onChange={(e) => setNip(e.target.value)} inputMode="numeric" placeholder="0000000000" />
                      </label>
                      <label className="co-field">
                        <span>{t('Street and number', 'Ulica i numer')}{invoiceUsed ? ' *' : ''}</span>
                        <input value={address} onChange={(e) => setAddress(e.target.value)} autoComplete="street-address" placeholder={t('e.g. Prosta 5/12', 'np. Prosta 5/12')} />
                      </label>
                      <label className="co-field">
                        <span>{t('Postal code', 'Kod pocztowy')}{invoiceUsed ? ' *' : ''}</span>
                        <input value={postalCode} inputMode="numeric" placeholder={isPolandInvoice ? '00-000' : undefined}
                          onChange={(e) => {
                            let v = e.target.value
                            if (isPolandInvoice) {
                              const d = v.replace(/\D/g, '').slice(0, 5)
                              v = d.length > 2 ? `${d.slice(0, 2)}-${d.slice(2)}` : d
                            }
                            setPostalCode(v)
                          }} autoComplete="postal-code" />
                      </label>
                      <label className="co-field">
                        <span>{t('City / town', 'Miejscowość')}{invoiceUsed ? ' *' : ''}</span>
                        <input value={city} onChange={(e) => setCity(e.target.value)} autoComplete="address-level2" />
                      </label>
                      <label className="co-field">
                        <span>{t('Country', 'Kraj')}</span>
                        <input value={country} onChange={(e) => setCountry(e.target.value)} autoComplete="country-name" />
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
                  <label className="co-check co-child-check">
                    <input type="checkbox" checked={forChild} onChange={(e) => setForChild(e.target.checked)} />
                    <span>
                      {t('This package is for a learner under 18.', 'Ten pakiet jest dla osoby poniżej 18 lat.')}
                      <small className="co-consent-hint">
                        {t(
                          'Their lessons are never recorded or analysed, and the optional AI lesson analysis is not offered on that account.',
                          'Lekcje nie są nagrywane ani analizowane, a opcjonalna analiza lekcji AI nie jest dostępna na tym koncie.',
                        )}
                      </small>
                    </span>
                  </label>
                  <label className="co-field">
                    <span className="sr-only">{t('Notes', 'Uwagi')}</span>
                    <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)}
                      placeholder={t('E.g. the package is for Zosia, age 12; exam preparation.', 'Np. pakiet dla Zosi, 12 lat; przygotowanie do egzaminu ósmoklasisty.')} />
                  </label>
                </fieldset>

                {/* ── 3. Płatność ── */}
                <fieldset className="co-block">
                  <legend>{t('How would you like to pay?', 'Jak chcesz zapłacić?')}</legend>
                  <PaymentMethods
                    lang={lang}
                    groups={methodGroups}
                    loading={methodGroups === null}
                    failed={methodsFailed}
                    value={methodKey}
                    onChange={setMethodKey}
                  />
                  {methodKey === 'paypo' && (
                    <div className="co-paypo-details">
                      <p>
                        {t(
                          'PayPo needs your residential address to assess and process the deferred payment. We send these details securely to Przelewy24 for PayPo.',
                          'PayPo potrzebuje Twojego adresu zamieszkania, aby ocenić i obsłużyć płatność odroczoną. Dane przekazujemy bezpiecznie do Przelewy24 na potrzeby PayPo.',
                        )}
                      </p>
                      <label className="co-field">
                        <span>{t('Street and house/flat number', 'Ulica i numer domu/lokalu')}</span>
                        <input value={payPoAddress} autoComplete="street-address" required
                          onChange={(e) => setPayPoAddress(e.target.value)} />
                      </label>
                      <div className="co-paypo-row">
                        <label className="co-field">
                          <span>{t('Postal code', 'Kod pocztowy')}</span>
                          <input value={payPoPostalCode} inputMode="numeric" autoComplete="postal-code"
                            placeholder="00-000" maxLength={6} required
                            onChange={(e) => {
                              const digits = e.target.value.replace(/\D/g, '').slice(0, 5)
                              setPayPoPostalCode(digits.length > 2 ? `${digits.slice(0, 2)}-${digits.slice(2)}` : digits)
                            }} />
                        </label>
                        <label className="co-field">
                          <span>{t('City or town', 'Miejscowość')}</span>
                          <input value={payPoCity} autoComplete="address-level2" required
                            onChange={(e) => setPayPoCity(e.target.value)} />
                        </label>
                      </div>
                    </div>
                  )}
                  <p className="co-consent-hint">
                    {t(
                      'You finish the payment on the secure Przelewy24 page. This page never sees your card or banking details.',
                      'Płatność dokończysz na bezpiecznej stronie Przelewy24. Ta strona nie widzi danych Twojej karty ani danych bankowych.',
                    )}
                  </p>
                </fieldset>

                {analysisOffered && (
                  <fieldset className="co-block">
                    <legend>{t('Add AI lesson analysis (optional)', 'Dodaj analizę lekcji AI (opcjonalnie)')}</legend>
                    <label className="co-choice co-addon" data-selected={analysisAddon}>
                      <input type="checkbox" checked={analysisAddon}
                        onChange={(e) => setAnalysisAddon(e.target.checked)} />
                      <span className="co-choice-body">
                        <strong>
                          {t('Written analysis after every lesson, plus Bajla', 'Pisemna analiza po każdej lekcji i Bajla')}
                          <span className="co-addon-price">
                            +{formatPLN(analysisLessons * ANALYSIS_PLN_PER_LESSON)}
                          </span>
                        </strong>
                        <small className="co-choice-what">
                          {t(
                            `A CEFR assessment, your strengths, the exact mistakes you made with corrections, and what to practise next \u2014 for each of your ${analysisLessons} lessons. ${ANALYSIS_PLN_PER_LESSON} PLN per lesson. It also switches on Bajla, your WhatsApp assistant, for good.`,
                            `Ocena poziomu CEFR, mocne strony, konkretne błędy wraz z poprawkami i wskazówki do dalszej pracy \u2014 dla każdej z ${analysisLessons} lekcji. ${ANALYSIS_PLN_PER_LESSON} PLN za lekcję. Włącza też na stałe Bajlę, Twoją asystentkę na WhatsAppie.`,
                          )}
                        </small>
                        <small className="co-choice-legal">
                          {t(
                            'To do this we record and transcribe your lessons and a language model writes the analysis. Lessons are not recorded unless you tick this. You can withdraw at any time in Settings, and we delete the recordings.',
                            'W tym celu nagrywamy i transkrybujemy Twoje lekcje, a analizę przygotowuje model językowy. Bez zaznaczenia tego pola lekcje nie są nagrywane. Zgodę możesz wycofać w każdej chwili w Ustawieniach, a nagrania usuwamy.',
                          )}{' '}
                          <Link to="/lesson-analysis" target="_blank">
                            {t('How we handle this data', 'Jak przetwarzamy te dane')}
                          </Link>
                        </small>
                      </span>
                      <span className="co-choice-mark co-choice-mark-square" aria-hidden />
                    </label>
                  </fieldset>
                )}

                {/* The analysis consent stands on its own, above the general
                    consents and never inside them. Buying the analysis IS
                    consenting to it, but the customer has to say so in a
                    separate, informed act — it must never ride in on the Terms
                    tickbox or on anything else they were going to tick anyway. */}
                {quoteNeedsAnalysisConsent && (
                  <fieldset className="co-block co-consents co-analysis-consent">
                    <legend>{t('Consent to the AI lesson analysis', 'Zgoda na analizę lekcji AI')}</legend>
                    <label className="co-check">
                      <input type="checkbox" checked={consentAnalysis}
                        onChange={(e) => setConsentAnalysis(e.target.checked)} required />
                      <span>
                        {isPl ? (
                          <>Zgadzam się, aby moje lekcje były nagrywane i transkrybowane, a zapis rozmowy przekazywany do modelu językowego, który przygotuje dla mnie pisemną analizę. *
                            <small className="co-consent-hint">
                              Zgodę możesz wycofać w każdej chwili w Ustawieniach; nagrania usuwamy w ciągu 30 dni. Szczegóły: <Link to="/lesson-analysis" target="_blank">informacja o analizie lekcji</Link>.
                            </small>
                          </>
                        ) : (
                          <>I agree to my lessons being recorded and transcribed, and the transcript being sent to a language model that writes my analysis. *
                            <small className="co-consent-hint">
                              You can withdraw at any time in Settings, and we delete the recordings within 30 days. Details: <Link to="/lesson-analysis" target="_blank">lesson analysis notice</Link>.
                            </small>
                          </>
                        )}
                      </span>
                    </label>
                  </fieldset>
                )}

                <fieldset className="co-block co-consents">
                  <legend>{t('Consents', 'Zgody')}</legend>
                  <label className="co-check">
                    <input type="checkbox" checked={consentTerms} onChange={(e) => setConsentTerms(e.target.checked)} required />
                    <span>
                      {isPl ? (
                        <>Akceptuję <Link to="/terms" target="_blank">Regulamin</Link> serwisu prowadzonego przez Fundację Rozwoju Przedsiębiorczości „Twój StartUp" z siedzibą w Warszawie. *
                          <small className="co-consent-hint">Prawo odstąpienia możesz wykonać bez logowania przez stale dostępną funkcję <Link to="/withdraw" target="_blank">„Odstąp od umowy tutaj”</Link>.</small>
                        </>
                      ) : (
                        <>I accept the <Link to="/terms" target="_blank">Terms (Regulamin)</Link> of the service operated by Fundacja Rozwoju Przedsiębiorczości "Twój StartUp", Warsaw. *
                          <small className="co-consent-hint">You can exercise the right of withdrawal without signing in through the continuously available <Link to="/withdraw" target="_blank">“Withdraw from a contract here”</Link> function.</small>
                        </>
                      )}
                    </span>
                  </label>
                  <fieldset className="co-performance-choice">
                    <legend>{t('When should your package activate?', 'Kiedy aktywować pakiet?')} *</legend>
                    <p className="co-consent-hint co-choice-lede">
                      {t(
                        'Pick one. Your 14-day right to withdraw applies either way — this only sets when your lessons become bookable.',
                        'Wybierz jedną opcję. 14-dniowe prawo odstąpienia przysługuje Ci w obu przypadkach — ta decyzja określa tylko, kiedy będzie można rezerwować lekcje.',
                      )}
                    </p>
                    <div className="co-choices">
                      {/* The operative declaration is counsel-approved wording and is
                          reproduced verbatim; only its framing changed. */}
                      <label className="co-choice" data-selected={performanceChoice === 'now'}>
                        <input
                          type="radio"
                          name="co-performance"
                          checked={performanceChoice === 'now'}
                          onChange={() => setPerformanceChoice('now')}
                        />
                        <span className="co-choice-body">
                          <strong>{t('Start straight away', 'Zacznij od razu')}</strong>
                          <small className="co-choice-what">
                            {t(
                              'Your package activates as soon as payment is confirmed and you can book lessons immediately.',
                              'Pakiet zostanie aktywowany zaraz po potwierdzeniu płatności i od razu zarezerwujesz lekcje.',
                            )}
                          </small>
                          <small className="co-choice-legal">
                            {isPl
                              ? 'Wyraźnie żądam rozpoczęcia świadczenia usług niezwłocznie po potwierdzeniu płatności, przed upływem 14 dni od zawarcia umowy, w tym aktywacji pakietu oraz udostępnienia rezerwacji i realizacji lekcji. Jeżeli odstąpię w tym terminie, zapłacę proporcjonalnie za lekcje zrealizowane przed odstąpieniem. Prawo odstąpienia utracę dopiero po pełnym wykonaniu usługi.'
                              : 'I expressly request that the services begin immediately after payment is confirmed, before 14 days have passed from conclusion of the contract, including package activation and access to booking and taking lessons. If I withdraw during that period, I will pay proportionately for lessons supplied before withdrawal. I lose the withdrawal right only after the service has been fully performed.'}
                          </small>
                        </span>
                        <span className="co-choice-mark" aria-hidden />
                      </label>

                      <label className="co-choice" data-selected={performanceChoice === 'wait'}>
                        <input
                          type="radio"
                          name="co-performance"
                          checked={performanceChoice === 'wait'}
                          onChange={() => setPerformanceChoice('wait')}
                        />
                        <span className="co-choice-body">
                          <strong>{t('Wait until the 14 days are over', 'Poczekaj do końca 14 dni')}</strong>
                          <small className="co-choice-what">
                            {t(
                              'Your package activates once the 14-day withdrawal period ends, and booking opens then.',
                              'Pakiet zostanie aktywowany po upływie 14-dniowego terminu na odstąpienie i wtedy otworzy się rezerwacja lekcji.',
                            )}
                          </small>
                        </span>
                        <span className="co-choice-mark" aria-hidden />
                      </label>
                    </div>
                  </fieldset>
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
                    ? t('Pressing the button registers the order and opens the secure Przelewy24 payment page.',
                        'Klikając przycisk, zarejestrujesz zamówienie i przejdziesz do bezpiecznej płatności Przelewy24.')
                    : t('Pressing the button creates your EnglishMetro account, registers the order and opens Przelewy24.',
                        'Klikając przycisk, utworzysz konto EnglishMetro, zarejestrujesz zamówienie i przejdziesz do Przelewy24.')}
                </p>

                <p className="co-admin-note">{isPl ? ADMIN_NOTICE_PL : ADMIN_NOTICE_EN}</p>
              </div>
            </form>

            <aside className="co-summary" aria-label={t('Order summary', 'Podsumowanie zamówienia')}>
              <h2>{t('Order summary', 'Podsumowanie')}</h2>
              <ul className="co-items">
                {quoteReady && (
                  <li key="quote" style={{ '--co-i': 0 }}>
                    <div className="co-item-main">
                      <strong>{quote.label}</strong>
                      <span>
                        {t('Price worked out for your account', 'Cena wyliczona dla Twojego konta')}
                      </span>
                    </div>
                    <div className="co-item-side">
                      <strong>{formatPLN(quote.amount / 100)}</strong>
                    </div>
                  </li>
                )}
                {quoteReady && quote.listAmount > quote.amount && (
                  <li key="quote-saving" className="co-quote-saving" style={{ '--co-i': 1 }}>
                    <div className="co-item-main">
                      <span>{t('Normal price', 'Cena standardowa')} {formatPLN(quote.listAmount / 100)}</span>
                    </div>
                    <div className="co-item-side">
                      <strong>−{formatPLN((quote.listAmount - quote.amount) / 100)}</strong>
                    </div>
                  </li>
                )}
                {!quoteMode && state.items.map((item, idx) => (
                  <li key={item.id} style={{ '--co-i': idx }}>
                    <div className="co-item-main">
                      <strong>{item.name}{item.qty > 1 ? ` ×${item.qty}` : ''}</strong>
                      <span>{isPl ? item.pacePl || item.pace : item.pace} · {packageValidity(PACKAGE_LESSONS[item.id])[isPl ? 'pl' : 'en']}</span>
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
              {analysisPLN > 0 && (
                <div className="co-addon-line">
                  <span>{t('AI lesson analysis', 'Analiza lekcji AI')}</span>
                  <strong>{formatPLN(analysisPLN)}</strong>
                </div>
              )}
              <div className="co-total">
                <span>{t('Total (VAT included)', 'Razem (z VAT)')}</span>
                <strong>{formatPLN(total)}</strong>
              </div>
              <div className="co-payment">
                <h3>{t('Payment', 'Płatność')}</h3>
                <div className="co-pay-method" data-active="true">
                  <span className="co-pay-brand">{t('Secure online payment', 'Bezpieczna płatność online')}</span>
                  <span className="co-pay-kinds">
                    {t('Processed securely by Przelewy24', 'Realizowana bezpiecznie przez Przelewy24')}
                    {payKinds ? ` · ${payKinds}` : ''}
                  </span>
                </div>
                <ol className="co-next-steps">
                  <li>{t('We create your account and order.', 'Utworzymy konto i zamówienie.')}</li>
                  <li>{t('You pay on the secure Przelewy24 page.', 'Płacisz na bezpiecznej stronie Przelewy24.')}</li>
                  <li>{t('After verified payment, lessons are allocated automatically.', 'Po zweryfikowaniu płatności lekcje zostaną przydzielone automatycznie.')}</li>
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
        <p className="co-payment-operator">
          {t(
            'Electronic payments are processed by PayPro S.A., with its registered office in Poznań (60-198), ul. Pastelowa 8, KRS 0000347935, NIP 7792369887, REGON 301345068, operating the Przelewy24 payment service.',
            'Płatności elektroniczne są obsługiwane przez PayPro S.A. z siedzibą w Poznaniu (60-198), ul. Pastelowa 8, KRS 0000347935, NIP 7792369887, REGON 301345068, prowadzącą serwis płatniczy Przelewy24.',
          )}
        </p>
        <p>{t('Contact', 'Kontakt')}: <a href={`mailto:${FOUNDATION.email}`}>{FOUNDATION.email}</a> · <a href="tel:+48662563507">{FOUNDATION.phone}</a> · <a href="/kontakt/">{t('company details', 'dane firmy')}</a></p>
      </footer>
    </main>
  )
}
