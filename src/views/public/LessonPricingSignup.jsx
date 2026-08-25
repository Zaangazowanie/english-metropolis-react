import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Skyline } from '../../design/v3/primitives.jsx'
import './lesson-pricing-signup.css'
import { COMPANY_PACKAGES, PRIVATE_PACKAGES } from './packages.js'
import CartUI from './CartUI.jsx'
import { cart, parsePricePLN } from './cart-store.js'
import { FOUNDATION, FOUNDATION_FOOTER_PL, FOUNDATION_FOOTER_EN } from '../legal/foundation-legal-content.js'
import MetroSignalField from '../../components/public/MetroSignalField.jsx'
import { clearPointerPolish, setPointerPolish } from '../../components/public/motionPolish.js'


const SPECIALIST_PACKAGES = [
  {
    id: 'specialist',
    name: 'Specialist Sprint',
    pace: '6 specialist lessons',
    price: '900 PLN',
    perLesson: '150 PLN / lesson',
    bestFor: 'Interview, exam, relocation, and business pressure',
    features: ['Diagnostic placement call', 'Specialist CEFR outcome plan', '6 x 60 min specialist lessons', 'Review notes after each session'],
    badge: 'Focused',
    accent: 'ember',
  },
  {
    id: 'specialist-12',
    name: 'Specialist Track',
    pace: '12 specialist lessons',
    price: '1,560 PLN',
    perLesson: '130 PLN / lesson',
    bestFor: 'A focused plan for exam, interview, or business outcomes',
    features: ['Diagnostic placement call', 'Specialist CEFR outcome plan', '12 x 60 min specialist lessons', 'Two writing or speaking reviews'],
    badge: 'Deeper focus',
    accent: 'ember',
  },
  {
    id: 'specialist-24',
    name: 'Specialist Mastery',
    pace: '24 specialist lessons',
    price: '2,640 PLN',
    perLesson: '110 PLN / lesson',
    bestFor: 'The best value for long-term specialist coaching',
    features: ['Diagnostic placement call', 'Specialist CEFR outcome plan', '24 x 60 min specialist lessons', 'Monthly review and lesson notes'],
    badge: 'Best specialist value',
    accent: 'ember',
  },
]

const PACKAGES = [...PRIVATE_PACKAGES, ...SPECIALIST_PACKAGES, ...COMPANY_PACKAGES]

const SUMMER_COURSES = [
  {
    id: 'august',
    name: 'August Summer Course',
    price: '200 PLN / student',
    detail: 'August only - 4 weekly lessons - max 4 students',
  },
  {
    id: 'september',
    name: 'September Summer Course',
    price: '400 PLN / student / month',
    pricePl: '400 PLN / osoba / miesiąc',
    detail: 'September only - 4 weekly lessons - max 4 students',
  },
  {
    id: 'two-month-bundle',
    name: 'August + September Bundle',
    price: '600 PLN / student',
    pricePl: '600 PLN / osoba',
    detail: 'August and September - 8 weekly lessons - max 4 students',
  },
]

const FORMATS = [
  { id: 'one-to-one', label: '1:1', detail: 'Private lessons' },
  { id: 'specialist', label: 'Specialist', detail: 'Exam / business' },
  { id: 'company', label: 'Company', detail: 'Team of up to 5' },
  { id: 'team', label: 'Group', detail: 'August / September, max 4' },
]

const POLICIES = [
  {
    icon: 'hourglass_top',
    title: 'Lesson validity',
    copy: 'One-off lessons are valid for 90 days. Private packages are valid for 6 months (4-8 lessons), 12 months (16-24 lessons) or 18 months (48 lessons). Company packages are valid for 12 months (24 lessons) or 18 months (48 lessons). Specialist package validity is shown with each package.',
  },
  {
    icon: 'more_time',
    title: 'Extensions',
    copy: 'Contact us before expiry. We normally extend unused lessons once at no extra charge: by 3 months for smaller packages and 6 months for packages of 16-48 lessons.',
  },
  {
    icon: 'verified_user',
    title: 'Student protection',
    copy: 'If a lesson cannot take place because of teacher cancellation, lack of availability or another issue caused by EnglishMetro, we extend the package validity, credit the unused lesson or issue a refund.',
  },
  {
    icon: 'undo',
    title: 'Refunds and credits',
    copy: 'Unused lessons can be refunded pro-rata or kept as credit while the package is valid or extended. Lessons already delivered are charged proportionally, and statutory withdrawal rights are always respected.',
  },
  {
    icon: 'event_repeat',
    title: 'Schedule changes',
    copy: 'Move a lesson with at least 24 hours notice. In cases of illness or emergency, contact us as soon as possible. We review exceptional cases individually.',
  },
  {
    icon: 'receipt_long',
    title: 'Clear billing',
    copy: 'Before paying, you see the price, package length, validity period, extension terms, invoice details and payment method. No card details are collected on this page.',
  },
  {
    icon: 'lock',
    title: 'Online payments',
    copy: 'Add packages to the cart and place your order. Secure online payment opens in Przelewy24, with the methods available for your transaction.',
  },
]

const PACKAGE_PL = {
  single: {
    pace: '1 lekcja online',
    perLesson: '135 PLN / lekcja',
    bestFor: 'Jedna konkretna lekcja z jasnym planem kolejnego kroku',
    features: ['Sprawdzenie poziomu i celu', '1 x 60 min lekcja 1:1', 'Osobisty obraz poziomu CEFR', 'Notatki i ścieżka ćwiczeń'],
    badge: 'Jednorazowo',
  },
  'private-core': {
    pace: '4 lekcje online',
    perLesson: '120 PLN / lekcja',
    bestFor: 'Kompaktowy pierwszy miesiąc regularnej pracy nad mówieniem',
    features: ['Sprawdzenie poziomu i celu', 'Osobisty plan CEFR', '4 x 60 min lekcje 1:1', 'Notatki po każdej lekcji'],
    badge: 'Dobry start',
  },
  momentum: {
    pace: '8 lekcji online',
    perLesson: '110 PLN / lekcja',
    bestFor: 'Najmocniejszy rytm stałej pracy nad płynnością',
    features: ['Sprawdzenie poziomu i celu', 'Osobisty plan CEFR', '8 x 60 min lekcje 1:1', 'Notatki i cele tygodniowe'],
    badge: 'Najczęściej wybierany',
  },
  'fluency-16': {
    pace: '16 lekcji online',
    perLesson: '100 PLN / lekcja',
    bestFor: 'Głębszy program dla widocznego postępu w mówieniu',
    features: ['Sprawdzenie poziomu i celu', 'Osobisty plan CEFR', '16 x 60 min lekcje 1:1', 'Notatki i przeglądy postępu'],
    badge: 'Dobry rytm',
  },
  'fluency-24': {
    pace: '24 lekcje online',
    perLesson: '90 PLN / lekcja',
    bestFor: 'Najlepsza wartość przy stałej pracy indywidualnej',
    features: ['Sprawdzenie poziomu i celu', 'Osobisty plan CEFR', '24 x 60 min lekcje 1:1', 'Notatki i miesięczne przeglądy'],
    badge: 'Najlepsza cena',
  },
  'fluency-48': {
    pace: '48 lekcji online',
    perLesson: '80 PLN / lekcja',
    bestFor: 'Najniższa cena lekcji przy pełnym roku regularnej nauki',
    features: ['Sprawdzenie poziomu i celu', 'Osobisty plan CEFR', '48 x 60 min lekcje 1:1', 'Notatki i miesięczne przeglądy'],
    badge: 'Najniższa cena lekcji',
  },
  specialist: {
    pace: '6 lekcji specjalistycznych',
    perLesson: '150 PLN / lekcja',
    bestFor: 'Rozmowy kwalifikacyjne, egzaminy i angielski w pracy',
    features: ['Diagnostyczna rozmowa poziomująca', 'Specjalistyczny plan CEFR', '6 x 60 min lekcje specjalistyczne', 'Notatki po każdej lekcji'],
    badge: 'Ukierunkowany',
  },
  'specialist-12': {
    pace: '12 lekcji specjalistycznych',
    perLesson: '130 PLN / lekcja',
    bestFor: 'Konkretny plan pod egzamin, rozmowę kwalifikacyjną albo angielski w pracy',
    features: ['Diagnostyczna rozmowa poziomująca', 'Specjalistyczny plan CEFR', '12 x 60 min lekcje specjalistyczne', 'Dwa przeglądy pisania lub mówienia'],
    badge: 'Głębszy cel',
  },
  'specialist-24': {
    pace: '24 lekcje specjalistyczne',
    perLesson: '110 PLN / lekcja',
    bestFor: 'Najlepsza wartość przy dłuższym coachingu specjalistycznym',
    features: ['Diagnostyczna rozmowa poziomująca', 'Specjalistyczny plan CEFR', '24 x 60 min lekcje specjalistyczne', 'Miesieczne przeglady i notatki'],
    badge: 'Najlepsza cena specjalistyczna',
  },
  'company-24': {
    pace: '24 firmowe lekcje grupowe',
    calculation: '24 x 200 PLN = 4,800 PLN',
    perLesson: '200 PLN / lekcja grupowa',
    perStudentPackage: '960 PLN / pracownik / pakiet',
    perStudent: '40 PLN / pracownik / lekcja',
    bestFor: '24-lekcyjny program dla stałej grupy do 5 pracowników',
    features: ['Diagnoza poziomu i celów dla maks. 5 osób', 'Plan CEFR dopasowany do celów firmy', '24 x 60 min lekcje grupowe online', 'Miesięczne podsumowanie postępów dla firmy'],
    badge: 'Do 5 pracowników',
  },
  'company-48': {
    pace: '48 firmowych lekcji grupowych',
    calculation: '7,600 PLN - 20% = 6,080 PLN',
    perLesson: '126,67 PLN / lekcja grupowa',
    perStudentPackage: '1,216 PLN / pracownik / pakiet',
    perStudent: '25,33 PLN / pracownik / lekcja',
    bestFor: '20% rabatu od wyliczenia 7,600 PLN za program 48 lekcji',
    features: ['Diagnoza poziomu i celów dla maks. 5 osób', 'Plan CEFR dopasowany do celów firmy', '48 x 60 min lekcje grupowe online', 'Miesięczne podsumowanie postępów dla firmy'],
    badge: '20% rabatu',
  },
}

const COURSE_PL = {
  august: {
    name: 'Kurs sierpniowy',
    detail: 'Tylko sierpień - 4 lekcje raz w tygodniu - maks. 4 osoby',
  },
  september: {
    name: 'Kurs wrześniowy',
    detail: 'Tylko wrzesień - 4 lekcje raz w tygodniu - maks. 4 osoby',
  },
  'two-month-bundle': {
    name: 'Pakiet sierpień + wrzesień',
    detail: 'Sierpień i wrzesień - 8 lekcji raz w tygodniu - maks. 4 osoby',
  },
}

const FORMAT_PL = {
  'one-to-one': { label: '1:1', detail: 'Lekcje indywidualne' },
  specialist: { label: 'Specjalistyczne', detail: 'Egzamin / biznes' },
  company: { label: 'Dla firm', detail: 'Grupa do 5 osób' },
  team: { label: 'Grupa', detail: 'Sierpień / wrzesień, maks. 4' },
}

const POLICY_PL = {
  'Lesson validity': {
    title: 'Ważność lekcji',
    copy: 'Lekcja jednorazowa jest ważna 90 dni. Pakiety prywatne są ważne 6 miesięcy (4-8 lekcji), 12 miesięcy (16-24 lekcje) lub 18 miesięcy (48 lekcji). Pakiety firmowe są ważne 12 miesięcy (24 lekcje) lub 18 miesięcy (48 lekcji). Ważność pakietów specjalistycznych jest podana przy każdym pakiecie.',
  },
  Extensions: {
    title: 'Przedłużenia',
    copy: 'Napisz do nas przed końcem ważności. Zwykle przedłużamy niewykorzystane lekcje raz bez opłaty: o 3 miesiące dla mniejszych pakietów i o 6 miesięcy dla pakietów 16-48 lekcji.',
  },
  'Student protection': {
    title: 'Ochrona ucznia',
    copy: 'Jeśli lekcja nie może się odbyć z powodu odwołania przez lektora, braku dostępności lub innej przyczyny po stronie EnglishMetro, przedłużamy ważność pakietu, zaliczamy lekcję na poczet kolejnych albo zwracamy pieniądze.',
  },
  'Refunds and credits': {
    title: 'Zwroty i kredyt',
    copy: 'Niewykorzystane lekcje możemy zwrócić proporcjonalnie albo zaliczyć jako kredyt w okresie ważności pakietu. Odbyte lekcje rozliczamy proporcjonalnie, a ustawowe prawo odstąpienia jest zawsze respektowane.',
  },
  'Schedule changes': {
    title: 'Zmiana terminu',
    copy: 'Możesz przełożyć lekcję z co najmniej 24-godzinnym wyprzedzeniem. W razie choroby lub nagłej sytuacji napisz do nas jak najszybciej. Wyjątkowe przypadki rozpatrujemy indywidualnie.',
  },
  'Clear billing': {
    title: 'Jasne płatności',
    copy: 'Przed płatnością widzisz cenę, długość pakietu, okres ważności, zasady przedłużenia, dane do faktury i sposób płatności. Ta strona nie zbiera danych karty.',
  },
  'Online payments': {
    title: 'Płatności online',
    copy: 'Dodaj pakiety do koszyka i złóż zamówienie. Płatności online przez Przelewy24 (BLIK, karty, szybkie przelewy) są w trakcie aktywacji. Do tego czasu link do płatności wysyłamy e-mailem.',
  },
}
function buildSummary({ selectedPackage, format, learnerName, email, level, goals, lang }) {
  const packageCopy = lang === 'pl' ? PACKAGE_PL[selectedPackage.id] : null
  const formatCopy = lang === 'pl' ? FORMAT_PL[format.id] : null
  return [
    lang === 'pl' ? 'Prosba o zapis na lekcje EnglishMetro' : 'EnglishMetro lesson signup request',
    '',
    `${lang === 'pl' ? 'Pakiet' : 'Package'}: ${selectedPackage.name} (${packageCopy?.pace || selectedPackage.pace}, ${selectedPackage.price})`,
    `${lang === 'pl' ? 'Format' : 'Format'}: ${formatCopy?.label || format.label} - ${formatCopy?.detail || format.detail}`,
    `${lang === 'pl' ? 'Uczeń' : 'Learner'}: ${learnerName || (lang === 'pl' ? 'Nie podano' : 'Not provided')}`,
    `Email: ${email || (lang === 'pl' ? 'Nie podano' : 'Not provided')}`,
    `${lang === 'pl' ? 'Obecny poziom' : 'Current level'}: ${level || (lang === 'pl' ? 'Nie wiem jeszcze' : 'Not sure yet')}`,
    `${lang === 'pl' ? 'Cele' : 'Goals'}: ${goals || (lang === 'pl' ? 'Nie podano' : 'Not provided')}`,
    '',
    lang === 'pl'
      ? 'Proszę potwierdzić dostępne terminy, dopasowanie pakietu i kolejny krok płatności lub faktury.'
      : 'Please confirm availability, package fit, and the payment link or invoice next step.',
  ].join('\n')
}

export default function LessonPricingSignup() {
  const location = useLocation()
  const pageRef = useRef(null)
  const pricingRef = useRef(null)
  const signupRef = useRef(null)
  const [lang, setLang] = useState('pl')
  const [packageId, setPackageId] = useState('momentum')
  const [formatId, setFormatId] = useState('one-to-one')
  const [learnerName, setLearnerName] = useState('')
  const [email, setEmail] = useState('')
  const [level, setLevel] = useState('')
  const [goals, setGoals] = useState('')
  const [accepted, setAccepted] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [polishKey, setPolishKey] = useState(0)
  const [justAdded, setJustAdded] = useState(null)
  const addedTimer = useRef(null)

  function addToCart(pkg, extra = {}) {
    cart.add({
      id: pkg.id,
      name: pkg.name,
      pace: pkg.pace || pkg.detail || '',
      pacePl: PACKAGE_PL[pkg.id]?.pace || COURSE_PL[pkg.id]?.detail || pkg.pace || pkg.detail || '',
      pricePLN: parsePricePLN(pkg.price),
      ...extra,
    })
    setJustAdded(pkg.id)
    window.clearTimeout(addedTimer.current)
    addedTimer.current = window.setTimeout(() => setJustAdded(null), 1400)
  }

  const selectedPackage = useMemo(
    () => PACKAGES.find((pkg) => pkg.id === packageId) || PRIVATE_PACKAGES[2],
    [packageId],
  )
  const selectedFormat = useMemo(
    () => FORMATS.find((item) => item.id === formatId) || FORMATS[0],
    [formatId],
  )
  const isPl = lang === 'pl'
  const t = (en, pl) => (isPl ? pl : en)
  const packageCopy = PACKAGE_PL[selectedPackage.id] || {}
  const isCompanyPackage = selectedPackage.id.startsWith('company-')
  const summary = useMemo(
    () => buildSummary({ selectedPackage, format: selectedFormat, learnerName, email, level, goals, lang }),
    [selectedPackage, selectedFormat, learnerName, email, level, goals, lang],
  )
  const mailHref = `mailto:hello@englishmetro.com?subject=${encodeURIComponent(`${isPl ? 'Zapis na lekcje' : 'Lessons signup'} - ${selectedPackage.name}`)}&body=${encodeURIComponent(summary)}`

  useEffect(() => {
    const target = location.pathname.includes('signup')
      ? signupRef.current
      : location.pathname.includes('pricing')
        ? pricingRef.current
        : null
    if (!target) return
    const timer = window.setTimeout(() => target.scrollIntoView({ behavior: 'auto', block: 'start' }), 80)
    return () => window.clearTimeout(timer)
  }, [location.pathname])

  useEffect(() => {
    const root = pageRef.current
    if (!root || typeof IntersectionObserver === 'undefined') return undefined

    const targets = [...root.querySelectorAll([
      '.lp-intro',
      '.lp-section-head',
      '.lp-package-grid',
      '.lp-specialist-block',
      '.lp-company-block',
      '.lp-readiness',
      '.lp-policy-grid',
      '.lp-signup-copy',
      '.lp-form',
    ].join(','))]

    targets.forEach((target, index) => {
      target.classList.add('lp-reveal-pending')
      target.style.setProperty('--lp-reveal-delay', `${(index % 4) * 45}ms`)
    })

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return
        entry.target.classList.add('is-visible')
        observer.unobserve(entry.target)
      })
    }, { threshold: 0.1, rootMargin: '0px 0px -7% 0px' })

    targets.forEach((target) => observer.observe(target))
    return () => observer.disconnect()
  }, [])

  useEffect(() => () => window.clearTimeout(addedTimer.current), [])

  function submitSignup(event) {
    event.preventDefault()
    setError('')
    if (!accepted) {
      setError(t('Confirm the lesson and payment summary before sending your request.', 'Przed wysłaniem prośby potwierdź podsumowanie lekcji i płatności.'))
      return
    }
    if (!email.trim()) {
      setError(t('Enter your email address so we can send you the available times.', 'Podaj adres e-mail, abyśmy mogli przesłać dostępne terminy.'))
      return
    }
    try {
      window.localStorage.setItem('em.lessonSignupDraft', JSON.stringify({
        packageId,
        formatId,
        learnerName,
        email,
        level,
        goals,
        savedAt: new Date().toISOString(),
      }))
    } catch {
      // Signup can continue even when localStorage is unavailable.
    }
    setSubmitted(true)
    setCopied(false)
  }

  async function copySummary() {
    try {
      await navigator.clipboard.writeText(summary)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  function triggerPolish() {
    setPolishKey((current) => current + 1)
  }

  function chooseLanguage(nextLang) {
    setLang(nextLang)
    triggerPolish()
  }

  function choosePackage(nextPackageId, nextFormatId) {
    setPackageId(nextPackageId)
    if (nextFormatId) setFormatId(nextFormatId)
    triggerPolish()
  }

  function chooseFormat(nextFormatId) {
    setFormatId(nextFormatId)
    triggerPolish()
  }

  return (
    <main ref={pageRef} className="lp-page">
      {polishKey > 0 && <span key={polishKey} className="lp-click-bloom" aria-hidden />}
      <header className="lp-nav" onPointerMove={setPointerPolish} onPointerLeave={clearPointerPolish}>
        <Link to="/" className="lp-brand" aria-label="EnglishMetro home">
          <Skyline size={30} />
          <span>English<span>Metro</span>.</span>
        </Link>
        <nav className="lp-nav-links" aria-label="Public lessons navigation">
          <a href="#packages">{t('Lessons', 'Lekcje')}</a>
          <a href="#pricing">{t('Pricing', 'Cennik')}</a>
          <a href="#signup">{t('Signup', 'Zapisy')}</a>
          <Link to="/login">{t('Sign in', 'Logowanie')}</Link>
        </nav>
        <div className="lp-lang-toggle" role="group" aria-label="Language">
          <button type="button" className={lang === 'en' ? 'is-active' : ''} onClick={() => chooseLanguage('en')}>EN</button>
          <button type="button" className={lang === 'pl' ? 'is-active' : ''} onClick={() => chooseLanguage('pl')}>PL</button>
        </div>
      </header>

      <section className="lp-hero" aria-labelledby="lp-title">
        <MetroSignalField className="lp-hero-signal" mode="light" density={66}/>
        <div className="lp-hero-copy">
          <p className="lp-kicker">
            <span className="material-symbols-outlined" aria-hidden>verified</span>
            {t('Live lessons with a teacher and EnglishMetro practice', 'Lekcje na żywo z lektorem i ćwiczenia w EnglishMetro')}
          </p>
          <h1 id="lp-title">{t('EnglishMetro private lessons', 'Prywatne lekcje EnglishMetro')}</h1>
          <p>
            {t(
              'Live 1:1 English lessons, practice after each session, and payment only after we confirm your teacher and time.',
              'Lekcje angielskiego 1:1 na żywo, ćwiczenia po każdych zajęciach i płatność dopiero po potwierdzeniu lektora oraz terminu.',
            )}
          </p>
          <div className="lp-hero-actions">
            <a className="lp-button lp-button-primary" href="#signup">
              <span className="material-symbols-outlined" aria-hidden>edit_calendar</span>
              {t('Ask for a learning plan', 'Poproś o plan nauki')}
            </a>
            <a className="lp-button lp-button-ghost" href="#pricing">
              <span className="material-symbols-outlined" aria-hidden>payments</span>
              {t('View packages', 'Zobacz pakiety')}
            </a>
          </div>
        </div>
        <div className="lp-hero-panel" aria-label="Next available lesson flow"
          onPointerMove={setPointerPolish} onPointerLeave={clearPointerPolish}>
          <div>
            <span>01</span>
            <strong>{t('Choose package', 'Wybierz pakiet')}</strong>
            <p>{t('Pick pace, format, and goals.', 'Wybierz tempo, format i cele.')}</p>
          </div>
          <div>
            <span>02</span>
            <strong>{t('Confirm a time', 'Potwierdź termin')}</strong>
            <p>{t('We first match you with a teacher and confirm an available time.', 'Najpierw dobieramy lektora i potwierdzamy dostępny termin.')}</p>
          </div>
          <div>
            <span>03</span>
            <strong>{t('Pay securely', 'Zapłać bezpiecznie')}</strong>
            <p>{t('After confirmation, we send a payment link or invoice.', 'Po potwierdzeniu wysyłamy link do płatności lub fakturę.')}</p>
          </div>
        </div>
      </section>

      <section id="packages" className="lp-band lp-intro">
        <div>
          <p className="lp-section-label">{t('Lesson packages', 'Pakiety lekcji')}</p>
          <h2>{t('Flexible 1:1 lessons available in packages.', 'Elastyczne lekcje 1:1 dostępne w pakietach.')}</h2>
        </div>
        <p>
          {t(
            'Choose a package that fits your goals. We then confirm the schedule and payment method.',
            'Wybierz pakiet dopasowany do swoich celów. Następnie potwierdzimy terminy i sposób płatności.',
          )}
        </p>
      </section>

      <section id="pricing" ref={pricingRef} className="lp-section" aria-labelledby="pricing-title">
        <div className="lp-section-head">
          <div>
            <p className="lp-section-label">{t('Pricing', 'Cennik')}</p>
            <h2 id="pricing-title">{t('Choose how often you learn', 'Wybierz częstotliwość lekcji')}</h2>
          </div>
          <p>{t('All live lessons are 60 minutes. You see the price, invoice information and payment method before paying.', 'Wszystkie lekcje na żywo trwają 60 minut. Przed płatnością zobaczysz cenę, informacje o fakturze i sposób płatności.')}</p>
        </div>

        <div className="lp-package-grid">
          {PRIVATE_PACKAGES.map((pkg) => (
            <article key={pkg.id} className={`lp-package lp-package-${pkg.accent} ${pkg.id === packageId ? 'is-selected' : ''}`}
              onPointerMove={setPointerPolish} onPointerLeave={clearPointerPolish}>
              <div className="lp-package-top">
                <span>{isPl ? (PACKAGE_PL[pkg.id]?.badge || pkg.badge) : pkg.badge}</span>
                <button type="button" onClick={() => choosePackage(pkg.id, 'one-to-one')} aria-pressed={pkg.id === packageId}>
                  {pkg.id === packageId ? t('Selected', 'Wybrany') : t('Choose', 'Wybierz')}
                </button>
              </div>
              <h3>{pkg.name}</h3>
              <p className="lp-package-pace">{isPl ? (PACKAGE_PL[pkg.id]?.pace || pkg.pace) : pkg.pace}</p>
              <div className="lp-price">{pkg.price}</div>
              <p className="lp-per-lesson">{isPl ? (PACKAGE_PL[pkg.id]?.perLesson || pkg.perLesson) : pkg.perLesson}</p>
              <p className="lp-best">{isPl ? (PACKAGE_PL[pkg.id]?.bestFor || pkg.bestFor) : pkg.bestFor}</p>
              <ul>
                {(isPl ? (PACKAGE_PL[pkg.id]?.features || pkg.features) : pkg.features).map((feature) => (
                  <li key={feature}>
                    <span className="material-symbols-outlined" aria-hidden>check_circle</span>
                    {feature}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className="lp-add-cart"
                data-added={justAdded === pkg.id}
                onClick={() => addToCart(pkg)}
              >
                <span className="material-symbols-outlined" aria-hidden>
                  {justAdded === pkg.id ? 'check' : 'add_shopping_cart'}
                </span>
                {justAdded === pkg.id ? t('Added', 'Dodano') : t('Add to cart', 'Do koszyka')}
              </button>
            </article>
          ))}
        </div>

        <div className="lp-specialist-block" aria-labelledby="specialist-title">
          <div className="lp-specialist-head">
            <p className="lp-section-label">{t('Specialist 1:1', 'Lekcje specjalistyczne 1:1')}</p>
            <h3 id="specialist-title">{t('English for exams, job interviews, relocation and business.', 'Przygotowanie do egzaminów i rozmów kwalifikacyjnych oraz angielski biznesowy.')}</h3>
            <p>
              {t(
                'These packages focus on a specific goal and include an initial assessment, targeted practice and progress reviews.',
                'Te pakiety są przeznaczone do pracy nad konkretnym celem i obejmują wstępną ocenę poziomu, ukierunkowane ćwiczenia oraz przeglądy postępów.',
              )}
            </p>
          </div>
          <div className="lp-package-grid lp-specialist-grid">
            {SPECIALIST_PACKAGES.map((pkg) => (
              <article key={pkg.id} className={`lp-package lp-package-${pkg.accent} ${pkg.id === packageId ? 'is-selected' : ''}`}
                onPointerMove={setPointerPolish} onPointerLeave={clearPointerPolish}>
                <div className="lp-package-top">
                  <span>{isPl ? (PACKAGE_PL[pkg.id]?.badge || pkg.badge) : pkg.badge}</span>
                  <button type="button" onClick={() => choosePackage(pkg.id, 'specialist')} aria-pressed={pkg.id === packageId}>
                    {pkg.id === packageId ? t('Selected', 'Wybrany') : t('Choose', 'Wybierz')}
                  </button>
                </div>
                <h3>{pkg.name}</h3>
                <p className="lp-package-pace">{isPl ? (PACKAGE_PL[pkg.id]?.pace || pkg.pace) : pkg.pace}</p>
                <div className="lp-price">{pkg.price}</div>
                <p className="lp-per-lesson">{isPl ? (PACKAGE_PL[pkg.id]?.perLesson || pkg.perLesson) : pkg.perLesson}</p>
                <p className="lp-best">{isPl ? (PACKAGE_PL[pkg.id]?.bestFor || pkg.bestFor) : pkg.bestFor}</p>
                <ul>
                  {(isPl ? (PACKAGE_PL[pkg.id]?.features || pkg.features) : pkg.features).map((feature) => (
                    <li key={feature}>
                      <span className="material-symbols-outlined" aria-hidden>check_circle</span>
                      {feature}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  className="lp-add-cart"
                  data-added={justAdded === pkg.id}
                  onClick={() => addToCart(pkg)}
                >
                  <span className="material-symbols-outlined" aria-hidden>
                    {justAdded === pkg.id ? 'check' : 'add_shopping_cart'}
                  </span>
                  {justAdded === pkg.id ? t('Added', 'Dodano') : t('Add to cart', 'Do koszyka')}
                </button>
              </article>
            ))}
          </div>
        </div>

        <div className="lp-company-block" aria-labelledby="company-title">
          <div className="lp-company-head">
            <p className="lp-section-label">{t('Company groups', 'Kursy dla firm')}</p>
            <h3 id="company-title">{t('One English course for a team of up to 5 employees.', 'Jeden kurs angielskiego dla zespołu do 5 pracowników.')}</h3>
            <p>
              {t(
                'The 24-lesson package is 4,800 PLN. The 48-lesson calculation starts at 7,600 PLN and receives a 20% discount.',
                'Pakiet 24 lekcji kosztuje 4,800 PLN. Wyliczenie dla 48 lekcji zaczyna się od 7,600 PLN i obejmuje 20% rabatu.',
              )}
            </p>
          </div>
          <div className="lp-package-grid lp-company-grid">
            {COMPANY_PACKAGES.map((pkg) => (
              <article key={pkg.id} className={`lp-package lp-package-${pkg.accent} ${pkg.id === packageId ? 'is-selected' : ''}`}
                onPointerMove={setPointerPolish} onPointerLeave={clearPointerPolish}>
                <div className="lp-package-top">
                  <span>{isPl ? (PACKAGE_PL[pkg.id]?.badge || pkg.badge) : pkg.badge}</span>
                  <button type="button" onClick={() => choosePackage(pkg.id, 'company')} aria-pressed={pkg.id === packageId}>
                    {pkg.id === packageId ? t('Selected', 'Wybrany') : t('Choose', 'Wybierz')}
                  </button>
                </div>
                <h3>{pkg.name}</h3>
                <p className="lp-package-pace">{isPl ? (PACKAGE_PL[pkg.id]?.pace || pkg.pace) : pkg.pace}</p>
                <div className="lp-price">{pkg.price}</div>
                <p className="lp-price-calculation">
                  <span>{t('Package calculation', 'Wyliczenie pakietu')}</span>
                  <strong>{isPl ? (PACKAGE_PL[pkg.id]?.calculation || pkg.calculation) : pkg.calculation}</strong>
                </p>
                <p className="lp-per-lesson">{isPl ? (PACKAGE_PL[pkg.id]?.perLesson || pkg.perLesson) : pkg.perLesson}</p>
                <p className="lp-per-student-package">{isPl ? (PACKAGE_PL[pkg.id]?.perStudentPackage || pkg.perStudentPackage) : pkg.perStudentPackage}</p>
                <p className="lp-per-student">{isPl ? (PACKAGE_PL[pkg.id]?.perStudent || pkg.perStudent) : pkg.perStudent}</p>
                <p className="lp-best">{isPl ? (PACKAGE_PL[pkg.id]?.bestFor || pkg.bestFor) : pkg.bestFor}</p>
                <ul>
                  {(isPl ? (PACKAGE_PL[pkg.id]?.features || pkg.features) : pkg.features).map((feature) => (
                    <li key={feature}>
                      <span className="material-symbols-outlined" aria-hidden>check_circle</span>
                      {feature}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  className="lp-add-cart"
                  data-added={justAdded === pkg.id}
                  onClick={() => addToCart(pkg, { pacePl: PACKAGE_PL[pkg.id]?.pace || pkg.pace })}
                >
                  <span className="material-symbols-outlined" aria-hidden>
                    {justAdded === pkg.id ? 'check' : 'add_shopping_cart'}
                  </span>
                  {justAdded === pkg.id ? t('Added', 'Dodano') : t('Add to cart', 'Do koszyka')}
                </button>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-section" aria-labelledby="summer-title">
        <div className="lp-section-head">
          <div>
            <p className="lp-section-label">{t('Group lessons', 'Lekcje grupowe')}</p>
            <h2 id="summer-title">{t('August and September group courses.', 'Kursy grupowe w sierpniu i wrześniu.')}</h2>
          </div>
          <p>
            {t(
              'Summer lessons are group courses only: B1 pre, B1 inter, B2, and B2/C1. Choose August, September, or both. Each group is capped at 4 students and each lesson is 60 minutes.',
              'Lekcje wakacyjne są kursami grupowymi: B1 pre, B1 inter, B2 i B2/C1. Wybierz sierpień, wrzesień albo oba miesiące. Każda grupa ma maksymalnie 4 osoby, a lekcja trwa 60 minut.',
            )}
          </p>
        </div>
        <div className="lp-course-grid lp-course-grid-four">
          {SUMMER_COURSES.map((course) => (
            <article key={course.id} className="lp-course-card lp-course-card-summer"
              onPointerMove={setPointerPolish} onPointerLeave={clearPointerPolish}>
              <span className="material-symbols-outlined" aria-hidden>sunny</span>
              <h3>{isPl ? (COURSE_PL[course.id]?.name || course.name) : course.name}</h3>
              <strong>{isPl ? (course.pricePl || course.price) : course.price}</strong>
              <small>{isPl ? (COURSE_PL[course.id]?.detail || course.detail) : course.detail}</small>
              <button
                type="button"
                className="lp-add-cart lp-add-cart-course"
                data-added={justAdded === course.id}
                onClick={() => addToCart({ ...course, name: isPl ? (COURSE_PL[course.id]?.name || course.name) : course.name })}
              >
                <span className="material-symbols-outlined" aria-hidden>
                  {justAdded === course.id ? 'check' : 'add_shopping_cart'}
                </span>
                {justAdded === course.id ? t('Added', 'Dodano') : t('Add to cart', 'Do koszyka')}
              </button>
            </article>
          ))}
        </div>
      </section>

      <section className="lp-section lp-payment" aria-labelledby="payment-title">
        <div className="lp-section-head">
          <div>
            <p className="lp-section-label">{t('Payments', 'Płatności')}</p>
            <h2 id="payment-title">{t('Pay after your slot is confirmed.', 'Płacisz po potwierdzeniu terminu.')}</h2>
          </div>
          <p>
            {t(
              'Send a request first. We confirm the right package, schedule, and invoice details before payment.',
              'Najpierw wysyłasz prośbę o zapis. Przed płatnością potwierdzamy pakiet, termin i dane do faktury.',
            )}
          </p>
        </div>
        <div className="lp-readiness">
          <div className="lp-readiness-row">
            <span className="lp-dot lp-dot-done" aria-hidden />
            <strong>{t('Request', 'Prośba')}</strong>
            <p>{t('Choose a package and tell us your goal.', 'Wybierz pakiet i napisz swój cel.')}</p>
          </div>
          <div className="lp-readiness-row">
            <span className="lp-dot lp-dot-done" aria-hidden />
            <strong>{t('Confirm', 'Potwierdzenie')}</strong>
            <p>{t('We reply with available times and the final payment route.', 'Odpisujemy z terminami i finalną formą płatności.')}</p>
          </div>
          <div className="lp-readiness-row">
            <span className="lp-dot lp-dot-pending" aria-hidden />
            <strong>{t('Pay', 'Płatność')}</strong>
            <p>{t('Secure online payment opens in Przelewy24, with the methods available for your transaction.', 'Bezpieczna płatność online otwiera się w Przelewy24, z metodami dostępnymi dla danej transakcji.')}</p>
          </div>
        </div>
      </section>
      <section className="lp-section lp-policy" aria-labelledby="policy-title">
        <div className="lp-section-head">
          <div>
            <p className="lp-section-label">{t('Policy', 'Zasady')}</p>
            <h2 id="policy-title">{t('Simple terms before payment.', 'Proste zasady przed płatnością.')}</h2>
          </div>
          <p>
            {t(
              'Expiry, extensions, scheduling, billing, and refunds are shown before payment and stay more generous than the minimum where we can be.',
              'Ważność, przedłużenia, terminy, płatności i zwroty są pokazane przed płatnością i są możliwie bardziej przyjazne niż minimum.',
            )}
          </p>
        </div>
        <div className="lp-policy-grid">
          {POLICIES.map((policy) => (
            <article key={policy.title} className="lp-policy-item"
              onPointerMove={setPointerPolish} onPointerLeave={clearPointerPolish}>
              <span className="material-symbols-outlined" aria-hidden>{policy.icon}</span>
              <h3>{isPl ? (POLICY_PL[policy.title]?.title || policy.title) : policy.title}</h3>
              <p>{isPl ? (POLICY_PL[policy.title]?.copy || policy.copy) : policy.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="signup" ref={signupRef} className="lp-section lp-signup" aria-labelledby="signup-title">
        <div className="lp-signup-copy">
          <p className="lp-section-label">{t('Student signup', 'Zapis ucznia')}</p>
          <h2 id="signup-title">{t('Tell us the package, goal, and schedule shape.', 'Podaj pakiet, cel i preferowany rytm lekcji.')}</h2>
          <p>
            {t(
              'We will reply with teacher availability and the right payment next step. No card data is collected here.',
              'Odpowiemy z dostępnością nauczyciela i kolejnym krokiem płatności. Ta strona nie zbiera danych karty.',
            )}
          </p>
          <div className="lp-selected">
            <span className="material-symbols-outlined" aria-hidden>local_activity</span>
            <div>
              <strong>{selectedPackage.name}</strong>
              <p>{isPl ? (packageCopy.pace || selectedPackage.pace) : selectedPackage.pace} - {selectedPackage.price}</p>
            </div>
          </div>
        </div>

        <form className="lp-form" onSubmit={submitSignup}>
          <fieldset className="lp-fieldset">
            <legend>{t('Lesson format', 'Format lekcji')}</legend>
            <div className="lp-segment">
              {FORMATS.map((format) => (
                <button
                  key={format.id}
                  type="button"
                  className={format.id === formatId ? 'is-active' : ''}
                  onClick={() => chooseFormat(format.id)}
                  aria-pressed={format.id === formatId}
                >
                  <strong>{isPl ? (FORMAT_PL[format.id]?.label || format.label) : format.label}</strong>
                  <span>{isPl ? (FORMAT_PL[format.id]?.detail || format.detail) : format.detail}</span>
                </button>
              ))}
            </div>
          </fieldset>

          <label className="lp-field">
            <span>{t('Learner name', 'Imie ucznia')}</span>
            <input value={learnerName} onChange={(event) => setLearnerName(event.target.value)} autoComplete="name" placeholder="Marta Kowalska" />
          </label>

          <label className="lp-field">
            <span>Email</span>
            <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" placeholder="you@example.com" required />
          </label>

          <label className="lp-field">
            <span>{t('Current level', 'Obecny poziom')}</span>
            <select value={level} onChange={(event) => setLevel(event.target.value)}>
              <option value="">{t('Not sure yet', 'Nie wiem jeszcze')}</option>
              <option value="A2">A2</option>
              <option value="B1">B1</option>
              <option value="B2">B2</option>
              <option value="C1">C1</option>
              <option value="C2">C2</option>
            </select>
          </label>

          <label className="lp-field">
            <span>{t('Goal', 'Cel')}</span>
            <textarea
              value={goals}
              onChange={(event) => setGoals(event.target.value)}
              rows={4}
              placeholder={t('Conversation confidence, job interview, IELTS, school support...', 'Pewniejsze rozmowy, praca, egzamin, wsparcie szkolne...')}
            />
          </label>

          <label className="lp-check">
            <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} />
            <span>
              {t(
                'I understand this is a signup request, not a card payment. I have reviewed the lesson validity, extension, cancellation, refund, and payment summary.',
                'Rozumiem, że to prośba o zapis, a nie płatność kartą. Znam podsumowanie ważności lekcji, przedłużeń, odwołania, zwrotów i płatności.',
              )}
            </span>
          </label>

          {error && <p className="lp-error" role="alert">{error}</p>}

          {isCompanyPackage ? (
            <button className="lp-button lp-button-primary lp-submit" type="submit">
              <span className="material-symbols-outlined" aria-hidden>business_center</span>
              {t('Prepare company enquiry', 'Przygotuj zapytanie firmowe')}
            </button>
          ) : (
            <>
              <a className="lp-button lp-button-primary lp-submit" href={`/signup?package=${encodeURIComponent(packageId)}`}>
                <span className="material-symbols-outlined" aria-hidden>rocket_launch</span>
                {t('Create your account & book', 'Załóż konto i zarezerwuj')}
              </a>

              <button className="lp-button lp-button-ghost lp-submit" type="submit">
                <span className="material-symbols-outlined" aria-hidden>send</span>
                {t('Prefer email? Prepare a request', 'Wolisz email? Przygotuj prośbę')}
              </button>
            </>
          )}

          {submitted && (
            <div className="lp-confirmation" role="status">
              <strong>{t('Signup request prepared.', 'Prosba o zapis gotowa.')}</strong>
              <p>{t('Open the email draft or copy the summary for your message to EnglishMetro.', 'Otworz szkic emaila albo skopiuj podsumowanie wiadomosci do EnglishMetro.')}</p>
              <div>
                <a className="lp-button lp-button-ghost" href={mailHref}>
                  <span className="material-symbols-outlined" aria-hidden>mail</span>
                  {t('Open email draft', 'Otworz email')}
                </a>
                <button className="lp-button lp-button-soft" type="button" onClick={copySummary}>
                  <span className="material-symbols-outlined" aria-hidden>content_copy</span>
                  {copied ? t('Copied', 'Skopiowano') : t('Copy summary', 'Kopiuj podsumowanie')}
                </button>
              </div>
            </div>
          )}

          <p className="lp-form-foot">
            {t('Before payment, you can review', 'Przed płatnością możesz sprawdzić')} <Link to="/terms">{t('Terms', 'Regulamin')}</Link>, <Link to="/privacy">{t('Privacy', 'Prywatność')}</Link>,
            {t(' and ', ' oraz ')}<Link to="/cookies">Cookies</Link>.
          </p>
        </form>
      </section>

      <footer className="lp-footer">
        <p>{isPl ? FOUNDATION_FOOTER_PL : FOUNDATION_FOOTER_EN}</p>
        <p>{t(
          'Online payments and payment-card processing are operated by PayPro S.A. Agent Rozliczeniowy, ul. Pastelowa 8, 60-198 Poznań, KRS 0000347935, NIP 7792369887, REGON 301345068.',
          'Operatorem płatności online i kart płatniczych jest PayPro S.A. Agent Rozliczeniowy, ul. Pastelowa 8, 60-198 Poznań, KRS 0000347935, NIP 7792369887, REGON 301345068.',
        )}</p>
        <nav aria-label={t('Legal', 'Dokumenty prawne')}>
          <Link to="/terms">{t('Terms', 'Regulamin')}</Link>
          <Link to="/privacy">{t('Privacy Policy', 'Polityka prywatności')}</Link>
          <Link to="/cookies">{t('Cookies Policy', 'Polityka cookies')}</Link>
          <a href={`mailto:${FOUNDATION.email}`}>{FOUNDATION.email}</a>
        </nav>
      </footer>

      <CartUI lang={lang} />
    </main>
  )
}
