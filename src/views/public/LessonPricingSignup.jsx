import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Skyline } from '../../design/v3/primitives.jsx'
import './lesson-pricing-signup.css'

const PRIVATE_PACKAGES = [
  {
    id: 'single',
    name: 'One-off 1:1',
    pace: '1 live lesson',
    price: '135 PLN',
    perLesson: '135 PLN / lesson',
    bestFor: 'A focused first session with a clear next-step plan',
    features: ['Placement and goal check', '1 x 60 min 1:1 lesson', 'Personal CEFR snapshot', 'Lesson notes and practice path'],
    badge: 'Once off',
    accent: 'sky',
  },
  {
    id: 'private-core',
    name: 'Private Core',
    pace: '4 live lessons',
    price: '480 PLN',
    perLesson: '120 PLN / lesson',
    bestFor: 'A compact first month for regular speaking progress',
    features: ['Placement and goal check', 'Personal CEFR plan', '4 x 60 min 1:1 lessons', 'Lesson notes after each session'],
    badge: 'Start here',
    accent: 'sky',
  },
  {
    id: 'momentum',
    name: 'Fluency Momentum',
    pace: '8 live lessons',
    price: '880 PLN',
    perLesson: '110 PLN / lesson',
    bestFor: 'The strongest routine for steady fluency work',
    features: ['Placement and goal check', 'Personal CEFR plan', '8 x 60 min 1:1 lessons', 'Lesson notes and weekly targets'],
    badge: 'Most chosen',
    accent: 'brand',
  },
  {
    id: 'fluency-16',
    name: 'Fluency Builder',
    pace: '16 live lessons',
    price: '1,600 PLN',
    perLesson: '100 PLN / lesson',
    bestFor: 'A deeper programme for visible speaking progress',
    features: ['Placement and goal check', 'Personal CEFR plan', '16 x 60 min 1:1 lessons', 'Lesson notes and progress reviews'],
    badge: 'Best rhythm',
    accent: 'brand',
  },
  {
    id: 'fluency-24',
    name: 'Fluency Mastery',
    pace: '24 live lessons',
    price: '2,160 PLN',
    perLesson: '90 PLN / lesson',
    bestFor: 'The best value for sustained private coaching',
    features: ['Placement and goal check', 'Personal CEFR plan', '24 x 60 min 1:1 lessons', 'Lesson notes and monthly reviews'],
    badge: 'Best value',
    accent: 'sky',
  },
]

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

const PACKAGES = [...PRIVATE_PACKAGES, ...SPECIALIST_PACKAGES]

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
    price: '200 PLN / student',
    detail: 'September only - 4 weekly lessons - max 4 students',
  },
  {
    id: 'two-month-bundle',
    name: 'August + September Bundle',
    price: '400 PLN / student',
    detail: 'August and September - 8 weekly lessons - max 4 students',
  },
]

const FORMATS = [
  { id: 'one-to-one', label: '1:1', detail: 'Private lessons' },
  { id: 'specialist', label: 'Specialist', detail: 'Exam / business' },
  { id: 'team', label: 'Group', detail: 'August / September, max 4' },
]

const POLICIES = [
  {
    icon: 'hourglass_top',
    title: 'Lesson validity',
    copy: 'One-off lessons are valid for 90 days. Private packs are valid for 6 months for 4-8 lessons and 12 months for 16-24 lessons. Specialist packs are valid for 6, 9, and 12 months.',
  },
  {
    icon: 'more_time',
    title: 'Extensions',
    copy: 'Ask before expiry and we will normally extend unused lessons once at no extra charge: 3 months for smaller packs and 6 months for 16-24 lesson packs.',
  },
  {
    icon: 'verified_user',
    title: 'Student protection',
    copy: 'If lessons cannot happen because of EnglishMetro availability, teacher cancellation, or another reason on our side, the affected validity is extended or the unused lesson is credited or refunded.',
  },
  {
    icon: 'undo',
    title: 'Refunds and credits',
    copy: 'Unused lessons can be refunded pro-rata or kept as credit while the package is valid or extended. Lessons already delivered are charged proportionally, and statutory withdrawal rights are always respected.',
  },
  {
    icon: 'event_repeat',
    title: 'Schedule changes',
    copy: 'Move a lesson with at least 24 hours notice. If there is illness, emergency, or a serious work or family conflict, contact us and we will try to protect the lesson fairly.',
  },
  {
    icon: 'receipt_long',
    title: 'Clear billing',
    copy: 'Before paying, you see the price, package length, expiry date, extension route, invoice details, and payment method. No card details are collected on this page.',
  },
  {
    icon: 'lock',
    title: 'Online payments',
    copy: 'Online payment will be connected after the Polish gateway and Twoj Startup review are approved.',
  },
]

const PACKAGE_PL = {
  single: {
    pace: '1 lekcja online',
    perLesson: '135 PLN / lekcja',
    bestFor: 'Jedna konkretna lekcja z jasnym planem kolejnego kroku',
    features: ['Sprawdzenie poziomu i celu', '1 x 60 min lekcja 1:1', 'Osobisty obraz poziomu CEFR', 'Notatki i sciezka praktyki'],
    badge: 'Jednorazowo',
  },
  'private-core': {
    pace: '4 lekcje online',
    perLesson: '120 PLN / lekcja',
    bestFor: 'Kompaktowy pierwszy miesiac regularnej pracy nad mowieniem',
    features: ['Sprawdzenie poziomu i celu', 'Osobisty plan CEFR', '4 x 60 min lekcje 1:1', 'Notatki po kazdej lekcji'],
    badge: 'Dobry start',
  },
  momentum: {
    pace: '8 lekcji online',
    perLesson: '110 PLN / lekcja',
    bestFor: 'Najmocniejszy rytm stalej pracy nad plynnoscia',
    features: ['Sprawdzenie poziomu i celu', 'Osobisty plan CEFR', '8 x 60 min lekcje 1:1', 'Notatki i cele tygodniowe'],
    badge: 'Najczesciej wybierany',
  },
  'fluency-16': {
    pace: '16 lekcji online',
    perLesson: '100 PLN / lekcja',
    bestFor: 'Glebszy program dla widocznego postepu w mowieniu',
    features: ['Sprawdzenie poziomu i celu', 'Osobisty plan CEFR', '16 x 60 min lekcje 1:1', 'Notatki i przeglady postepu'],
    badge: 'Dobry rytm',
  },
  'fluency-24': {
    pace: '24 lekcje online',
    perLesson: '90 PLN / lekcja',
    bestFor: 'Najlepsza wartosc przy stalej pracy indywidualnej',
    features: ['Sprawdzenie poziomu i celu', 'Osobisty plan CEFR', '24 x 60 min lekcje 1:1', 'Notatki i miesieczne przeglady'],
    badge: 'Najlepsza cena',
  },
  specialist: {
    pace: '6 lekcji specjalistycznych',
    perLesson: '150 PLN / lekcja',
    bestFor: 'Rozmowy kwalifikacyjne, egzaminy, relokacja i angielski w pracy',
    features: ['Diagnostyczna rozmowa poziomujaca', 'Specjalistyczny plan CEFR', '6 x 60 min lekcje specjalistyczne', 'Notatki po kazdej lekcji'],
    badge: 'Celowany',
  },
  'specialist-12': {
    pace: '12 lekcji specjalistycznych',
    perLesson: '130 PLN / lekcja',
    bestFor: 'Konkretny plan pod egzamin, rozmowe kwalifikacyjna albo angielski w pracy',
    features: ['Diagnostyczna rozmowa poziomujaca', 'Specjalistyczny plan CEFR', '12 x 60 min lekcje specjalistyczne', 'Dwa przeglady pisania lub mowienia'],
    badge: 'Glebszy cel',
  },
  'specialist-24': {
    pace: '24 lekcje specjalistyczne',
    perLesson: '110 PLN / lekcja',
    bestFor: 'Najlepsza wartosc przy dluzszym coachingu specjalistycznym',
    features: ['Diagnostyczna rozmowa poziomujaca', 'Specjalistyczny plan CEFR', '24 x 60 min lekcje specjalistyczne', 'Miesieczne przeglady i notatki'],
    badge: 'Najlepsza cena specjalistyczna',
  },
}

const COURSE_PL = {
  august: {
    name: 'Kurs sierpniowy',
    detail: 'Tylko sierpien - 4 lekcje raz w tygodniu - maks. 4 osoby',
  },
  september: {
    name: 'Kurs wrzesniowy',
    detail: 'Tylko wrzesien - 4 lekcje raz w tygodniu - maks. 4 osoby',
  },
  'two-month-bundle': {
    name: 'Pakiet sierpien + wrzesien',
    detail: 'Sierpien i wrzesien - 8 lekcji raz w tygodniu - maks. 4 osoby',
  },
}

const FORMAT_PL = {
  'one-to-one': { label: '1:1', detail: 'Lekcje indywidualne' },
  specialist: { label: 'Specjalistyczne', detail: 'Egzamin / biznes' },
  team: { label: 'Grupa', detail: 'Sierpien / wrzesien, maks. 4' },
}

const POLICY_PL = {
  'Lesson validity': {
    title: 'Waznosc lekcji',
    copy: 'Lekcja jednorazowa jest wazna 90 dni. Pakiety prywatne sa wazne 6 miesiecy dla 4-8 lekcji i 12 miesiecy dla 16-24 lekcji. Pakiety specjalistyczne sa wazne 6, 9 i 12 miesiecy.',
  },
  Extensions: {
    title: 'Przedluzenia',
    copy: 'Napisz przed koncem waznosci. Zwykle przedluzymy niewykorzystane lekcje raz bez oplaty: o 3 miesiace dla mniejszych pakietow i o 6 miesiecy dla pakietow 16-24 lekcji.',
  },
  'Student protection': {
    title: 'Ochrona ucznia',
    copy: 'Jesli lekcje nie moga sie odbyc z powodu dostepnosci EnglishMetro, odwolania przez nauczyciela albo innej przyczyny po naszej stronie, waznosc jest przedluzana albo niewykorzystana lekcja jest kredytowana lub zwracana.',
  },
  'Refunds and credits': {
    title: 'Zwroty i kredyt',
    copy: 'Niewykorzystane lekcje moga zostac zwrocone proporcjonalnie albo zostac jako kredyt w czasie waznosci lub przedluzenia pakietu. Odbyte lekcje sa rozliczane proporcjonalnie, a ustawowe prawa odstapienia sa zawsze respektowane.',
  },
  'Schedule changes': {
    title: 'Zmiana terminu',
    copy: 'Mozesz przelozyc lekcje z co najmniej 24-godzinnym wyprzedzeniem. Przy chorobie, naglej sytuacji albo powaznym konflikcie rodzinnym lub zawodowym napisz do nas, a postaramy sie uczciwie ochronyc lekcje.',
  },
  'Clear billing': {
    title: 'Jasne platnosci',
    copy: 'Przed platnoscia widzisz cene, dlugosc pakietu, date waznosci, sposob przedluzenia, dane do faktury i metode platnosci. Ta strona nie zbiera danych karty.',
  },
  'Online payments': {
    title: 'Platnosci online',
    copy: 'Platnosc online zostanie podlaczona po akceptacji bramki platniczej i przegladzie Twoj Startup.',
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
    `${lang === 'pl' ? 'Uczen' : 'Learner'}: ${learnerName || (lang === 'pl' ? 'Nie podano' : 'Not provided')}`,
    `Email: ${email || (lang === 'pl' ? 'Nie podano' : 'Not provided')}`,
    `${lang === 'pl' ? 'Obecny poziom' : 'Current level'}: ${level || (lang === 'pl' ? 'Nie wiem jeszcze' : 'Not sure yet')}`,
    `${lang === 'pl' ? 'Cele' : 'Goals'}: ${goals || (lang === 'pl' ? 'Nie podano' : 'Not provided')}`,
    '',
    lang === 'pl'
      ? 'Prosze potwierdzic dostepne terminy, dopasowanie pakietu i kolejny krok platnosci lub faktury.'
      : 'Please confirm availability, package fit, and the payment link or invoice next step.',
  ].join('\n')
}

export default function LessonPricingSignup() {
  const location = useLocation()
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
    window.setTimeout(() => target.scrollIntoView({ behavior: 'auto', block: 'start' }), 80)
  }, [location.pathname])

  function submitSignup(event) {
    event.preventDefault()
    setError('')
    if (!accepted) {
      setError(t('Please accept the lesson and payment summary before sending the request.', 'Zaakceptuj podsumowanie lekcji i platnosci przed wyslaniem prosby.'))
      return
    }
    if (!email.trim()) {
      setError(t('Please add an email address so we can reply with available slots.', 'Podaj email, zebysmy mogli odpisac z dostepnymi terminami.'))
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

  function choosePackage(nextPackageId) {
    setPackageId(nextPackageId)
    triggerPolish()
  }

  function chooseFormat(nextFormatId) {
    setFormatId(nextFormatId)
    triggerPolish()
  }

  return (
    <main className="lp-page">
      {polishKey > 0 && <span key={polishKey} className="lp-click-bloom" aria-hidden />}
      <header className="lp-nav">
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
        <div className="lp-hero-copy">
          <p className="lp-kicker">
            <span className="material-symbols-outlined" aria-hidden>verified</span>
            {t('Human lessons plus EnglishMetro practice', 'Lekcje z nauczycielem plus praktyka EnglishMetro')}
          </p>
          <h1 id="lp-title">{t('EnglishMetro private lessons', 'Prywatne lekcje EnglishMetro')}</h1>
          <p>
            {t(
              'Live 1:1 English coaching, a playable practice route after every session, and a clear payment path after your teacher and slot are confirmed.',
              'Lekcje angielskiego 1:1 na zywo, praktyka po kazdej lekcji i jasna platnosc dopiero po potwierdzeniu nauczyciela oraz terminu.',
            )}
          </p>
          <div className="lp-hero-actions">
            <a className="lp-button lp-button-primary" href="#signup">
              <span className="material-symbols-outlined" aria-hidden>edit_calendar</span>
              {t('Request a lesson plan', 'Popros o plan lekcji')}
            </a>
            <a className="lp-button lp-button-ghost" href="#pricing">
              <span className="material-symbols-outlined" aria-hidden>payments</span>
              {t('View packages', 'Zobacz pakiety')}
            </a>
          </div>
        </div>
        <div className="lp-hero-panel" aria-label="Next available lesson flow">
          <div>
            <span>01</span>
            <strong>{t('Choose package', 'Wybierz pakiet')}</strong>
            <p>{t('Pick pace, format, and goals.', 'Wybierz tempo, format i cele.')}</p>
          </div>
          <div>
            <span>02</span>
            <strong>{t('Confirm slot', 'Potwierdz termin')}</strong>
            <p>{t('Teacher fit and calendar are checked first.', 'Najpierw sprawdzamy nauczyciela i kalendarz.')}</p>
          </div>
          <div>
            <span>03</span>
            <strong>{t('Pay securely', 'Zaplac bezpiecznie')}</strong>
            <p>{t('Checkout link or invoice follows confirmation.', 'Link do platnosci albo faktura przychodzi po potwierdzeniu.')}</p>
          </div>
        </div>
      </section>

      <section id="packages" className="lp-band lp-intro">
        <div>
          <p className="lp-section-label">{t('Lesson packages', 'Pakiety lekcji')}</p>
          <h2>{t('Flexible private lessons, booked by package.', 'Elastyczne lekcje indywidualne w pakietach.')}</h2>
        </div>
        <p>
          {t(
            'Individual lessons are not limited to summer. You book the package that fits your goals, then we confirm the schedule and payment route.',
            'Lekcje indywidualne nie sa ograniczone do wakacji. Wybierasz pakiet do swoich celow, a potem potwierdzamy terminy i sposob platnosci.',
          )}
        </p>
      </section>

      <section id="pricing" ref={pricingRef} className="lp-section" aria-labelledby="pricing-title">
        <div className="lp-section-head">
          <div>
            <p className="lp-section-label">{t('Pricing', 'Cennik')}</p>
            <h2 id="pricing-title">{t('Pick your lesson rhythm', 'Wybierz rytm lekcji')}</h2>
          </div>
          <p>{t('All live lessons are 60 minutes. Prices are shown before checkout; invoice and payment details are confirmed before payment.', 'Wszystkie lekcje na zywo trwaja 60 minut. Ceny sa widoczne przed checkoutem; faktura i platnosc sa potwierdzane przed zaplata.')}</p>
        </div>

        <div className="lp-package-grid">
          {PRIVATE_PACKAGES.map((pkg) => (
            <article key={pkg.id} className={`lp-package lp-package-${pkg.accent} ${pkg.id === packageId ? 'is-selected' : ''}`}>
              <div className="lp-package-top">
                <span>{isPl ? (PACKAGE_PL[pkg.id]?.badge || pkg.badge) : pkg.badge}</span>
                <button type="button" onClick={() => choosePackage(pkg.id)} aria-pressed={pkg.id === packageId}>
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
            </article>
          ))}
        </div>

        <div className="lp-specialist-block" aria-labelledby="specialist-title">
          <div className="lp-specialist-head">
            <p className="lp-section-label">{t('Specialist 1:1', 'Lekcje specjalistyczne 1:1')}</p>
            <h3 id="specialist-title">{t('Exam, interview, relocation, and business English.', 'Egzamin, rozmowa kwalifikacyjna, relokacja i angielski biznesowy.')}</h3>
            <p>
              {t(
                'These packs are separate from normal fluency coaching because they include diagnostic targeting, review work, and tighter outcomes.',
                'Te pakiety sa oddzielone od zwyklych lekcji plynnej komunikacji, bo obejmuja diagnoze, przeglady pracy i konkretniejsze cele.',
              )}
            </p>
          </div>
          <div className="lp-package-grid lp-specialist-grid">
            {SPECIALIST_PACKAGES.map((pkg) => (
              <article key={pkg.id} className={`lp-package lp-package-${pkg.accent} ${pkg.id === packageId ? 'is-selected' : ''}`}>
                <div className="lp-package-top">
                  <span>{isPl ? (PACKAGE_PL[pkg.id]?.badge || pkg.badge) : pkg.badge}</span>
                  <button type="button" onClick={() => choosePackage(pkg.id)} aria-pressed={pkg.id === packageId}>
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
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-section" aria-labelledby="summer-title">
        <div className="lp-section-head">
          <div>
            <p className="lp-section-label">{t('Group lessons', 'Lekcje grupowe')}</p>
            <h2 id="summer-title">{t('August and September group courses.', 'Kursy grupowe w sierpniu i wrzesniu.')}</h2>
          </div>
          <p>
            {t(
              'Summer lessons are group courses only: B1 pre, B1 inter, B2, and B2/C1. Choose August, September, or both. Each group is capped at 4 students and each lesson is 60 minutes.',
              'Lekcje wakacyjne sa kursami grupowymi: B1 pre, B1 inter, B2 i B2/C1. Wybierz sierpien, wrzesien albo oba miesiace. Kazda grupa ma maksymalnie 4 osoby, a lekcja trwa 60 minut.',
            )}
          </p>
        </div>
        <div className="lp-course-grid lp-course-grid-four">
          {SUMMER_COURSES.map((course) => (
            <article key={course.id} className="lp-course-card lp-course-card-summer">
              <span className="material-symbols-outlined" aria-hidden>sunny</span>
              <h3>{isPl ? (COURSE_PL[course.id]?.name || course.name) : course.name}</h3>
              <strong>{course.price}</strong>
              <small>{isPl ? (COURSE_PL[course.id]?.detail || course.detail) : course.detail}</small>
            </article>
          ))}
        </div>
      </section>

      <section className="lp-section lp-payment" aria-labelledby="payment-title">
        <div className="lp-section-head">
          <div>
            <p className="lp-section-label">{t('Payments', 'Platnosci')}</p>
            <h2 id="payment-title">{t('Pay after your slot is confirmed.', 'Placisz po potwierdzeniu terminu.')}</h2>
          </div>
          <p>
            {t(
              'Send a request first. We confirm the right package, schedule, and invoice details before payment.',
              'Najpierw wysylasz prosbe o zapis. Przed platnoscia potwierdzamy pakiet, termin i dane do faktury.',
            )}
          </p>
        </div>
        <div className="lp-readiness">
          <div className="lp-readiness-row">
            <span className="lp-dot lp-dot-done" aria-hidden />
            <strong>{t('Request', 'Prosba')}</strong>
            <p>{t('Choose a package and tell us your goal.', 'Wybierz pakiet i napisz swoj cel.')}</p>
          </div>
          <div className="lp-readiness-row">
            <span className="lp-dot lp-dot-done" aria-hidden />
            <strong>{t('Confirm', 'Potwierdzenie')}</strong>
            <p>{t('We reply with available times and the final payment route.', 'Odpisujemy z terminami i finalna forma platnosci.')}</p>
          </div>
          <div className="lp-readiness-row">
            <span className="lp-dot lp-dot-pending" aria-hidden />
            <strong>{t('Pay', 'Platnosc')}</strong>
            <p>{t('Online checkout will be enabled after Polish gateway approval.', 'Platnosc online zostanie wlaczona po akceptacji polskiej bramki.')}</p>
          </div>
        </div>
      </section>
      <section className="lp-section lp-policy" aria-labelledby="policy-title">
        <div className="lp-section-head">
          <div>
            <p className="lp-section-label">{t('Policy', 'Zasady')}</p>
            <h2 id="policy-title">{t('Simple terms before payment.', 'Proste zasady przed platnoscia.')}</h2>
          </div>
          <p>
            {t(
              'Expiry, extensions, scheduling, billing, and refunds are shown before payment and stay more generous than the minimum where we can be.',
              'Waznosc, przedluzenia, terminy, platnosci i zwroty sa pokazane przed platnoscia i sa mozliwie bardziej przyjazne niz minimum.',
            )}
          </p>
        </div>
        <div className="lp-policy-grid">
          {POLICIES.map((policy) => (
            <article key={policy.title} className="lp-policy-item">
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
              'Odpowiemy z dostepnoscia nauczyciela i kolejnym krokiem platnosci. Ta strona nie zbiera danych karty.',
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
                'Rozumiem, ze to prosba o zapis, a nie platnosc karta. Znam podsumowanie waznosci lekcji, przedluzen, odwolania, zwrotow i platnosci.',
              )}
            </span>
          </label>

          {error && <p className="lp-error" role="alert">{error}</p>}

          <button className="lp-button lp-button-primary lp-submit" type="submit">
            <span className="material-symbols-outlined" aria-hidden>send</span>
            {t('Prepare signup request', 'Przygotuj prosbe o zapis')}
          </button>

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
            {t('Before payment, you can review', 'Przed platnoscia mozesz sprawdzic')} <Link to="/terms">{t('Terms', 'Regulamin')}</Link>, <Link to="/privacy">{t('Privacy', 'Prywatnosc')}</Link>,
            {t(' and ', ' oraz ')}<Link to="/cookies">Cookies</Link>.
          </p>
        </form>
      </section>
    </main>
  )
}
