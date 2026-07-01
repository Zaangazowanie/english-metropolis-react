import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Skyline } from '../../design/v3/primitives.jsx'
import './lesson-pricing-signup.css'

const PACKAGES = [
  {
    id: 'single',
    name: 'One-off 1:1',
    pace: '1 live lesson',
    price: '135 PLN',
    perLesson: '135 PLN / lesson',
    bestFor: 'A single private lesson before choosing a package',
    features: ['1 x 60 min 1:1 lesson', 'Goal check', 'EnglishMetro practice suggestion', 'Option to continue into a package'],
    badge: 'Once off',
    accent: 'sky',
  },
  {
    id: 'private-core',
    name: 'Private Core',
    pace: '4 live lessons',
    price: '480 PLN',
    perLesson: '120 PLN / lesson',
    bestFor: 'A first month of steady B1/B2 speaking work',
    features: ['Placement call', '4 x 60 min 1:1 lessons', 'EnglishMetro practice path', 'Lesson notes after each session'],
    badge: 'Start here',
    accent: 'sky',
  },
  {
    id: 'momentum',
    name: 'Fluency Momentum',
    pace: '8 live lessons',
    price: '880 PLN',
    perLesson: '110 PLN / lesson',
    bestFor: 'The strongest routine for fluency work',
    features: ['Personal CEFR plan', '8 x 60 min 1:1 lessons', 'Weekly speaking targets', 'Priority reschedule window'],
    badge: 'Most chosen',
    accent: 'brand',
  },
  {
    id: 'fluency-16',
    name: 'Fluency Builder',
    pace: '16 live lessons',
    price: '1,600 PLN',
    perLesson: '100 PLN / lesson',
    bestFor: 'A longer routine for visible speaking progress',
    features: ['Personal CEFR plan', '16 x 60 min 1:1 lessons', 'Progress checkpoints', 'Lesson notes after each session'],
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
    features: ['Personal CEFR plan', '24 x 60 min 1:1 lessons', 'Monthly progress review', 'Priority reschedule window'],
    badge: 'Best value',
    accent: 'sky',
  },
  {
    id: 'specialist',
    name: 'Specialist Sprint',
    pace: '6 specialist lessons',
    price: '900 PLN',
    perLesson: '150 PLN / lesson',
    bestFor: 'Interview, exam, relocation, and business pressure',
    features: ['Diagnostic interview', '6 x 60 min specialist 1:1 lessons', 'Writing or speaking review', 'Checkout or invoice option'],
    badge: 'Focused',
    accent: 'ember',
  },
]

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
    icon: 'event_repeat',
    title: 'Schedule changes',
    copy: 'You can move a lesson with at least 24 hours notice. Late cancellations may count as used unless we agree otherwise.',
  },
  {
    icon: 'undo',
    title: 'Refunds',
    copy: 'Our refund policy follows EU consumer rules. Completed lessons are payable; unused lessons can be refunded or credited where the policy applies.',
  },
  {
    icon: 'receipt_long',
    title: 'Clear billing',
    copy: 'You see the price, package length, invoice details, and payment route before paying. No card details are collected on this page.',
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
    bestFor: 'Jedna prywatna lekcja przed wyborem pakietu',
    features: ['1 x 60 min lekcja 1:1', 'Sprawdzenie celu', 'Sugestia praktyki EnglishMetro', 'Mozliwosc przejscia do pakietu'],
    badge: 'Jednorazowo',
  },
  'private-core': {
    pace: '4 lekcje online',
    perLesson: '120 PLN / lekcja',
    bestFor: 'Pierwszy miesiac regularnej pracy nad mowieniem na poziomie B1/B2',
    features: ['Rozmowa poziomujaca', '4 x 60 min lekcje 1:1', 'Sciezka praktyki EnglishMetro', 'Notatki po kazdej lekcji'],
    badge: 'Dobry start',
  },
  momentum: {
    pace: '8 lekcji online',
    perLesson: '110 PLN / lekcja',
    bestFor: 'Najmocniejszy rytm pracy nad plynnoscia',
    features: ['Osobisty plan CEFR', '8 x 60 min lekcje 1:1', 'Cotygodniowe cele mowienia', 'Priorytet przy zmianie terminu'],
    badge: 'Najczesciej wybierany',
  },
  'fluency-16': {
    pace: '16 lekcji online',
    perLesson: '100 PLN / lekcja',
    bestFor: 'Dluzszy rytm pracy dla widocznego postepu w mowieniu',
    features: ['Osobisty plan CEFR', '16 x 60 min lekcje 1:1', 'Kontrole postepu', 'Notatki po kazdej lekcji'],
    badge: 'Dobry rytm',
  },
  'fluency-24': {
    pace: '24 lekcje online',
    perLesson: '90 PLN / lekcja',
    bestFor: 'Najlepsza wartosc przy stalej pracy indywidualnej',
    features: ['Osobisty plan CEFR', '24 x 60 min lekcje 1:1', 'Miesieczny przeglad postepu', 'Priorytet przy zmianie terminu'],
    badge: 'Najlepsza cena',
  },
  specialist: {
    pace: '6 lekcji specjalistycznych',
    perLesson: '150 PLN / lekcja',
    bestFor: 'Rozmowy kwalifikacyjne, egzaminy, relokacja i angielski w pracy',
    features: ['Rozmowa diagnostyczna', '6 x 60 min lekcje specjalistyczne 1:1', 'Przeglad pisania lub mowienia', 'Platnosc online albo faktura'],
    badge: 'Celowany',
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
  'Schedule changes': {
    title: 'Zmiana terminu',
    copy: 'Mozesz przelozyc lekcje z co najmniej 24-godzinnym wyprzedzeniem. Pozniejsze odwolanie moze oznaczac wykorzystanie lekcji, chyba ze ustalimy inaczej.',
  },
  Refunds: {
    title: 'Zwroty',
    copy: 'Nasza polityka zwrotow jest zgodna z zasadami konsumenckimi UE. Odbyte lekcje sa platne; niewykorzystane lekcje moga zostac zwrocone albo przeniesione zgodnie z polityka.',
  },
  'Clear billing': {
    title: 'Jasne platnosci',
    copy: 'Przed platnoscia widzisz cene, dlugosc pakietu, dane do faktury i sposob platnosci. Ta strona nie zbiera danych karty.',
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
  const [lang, setLang] = useState('en')
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

  const selectedPackage = useMemo(
    () => PACKAGES.find((pkg) => pkg.id === packageId) || PACKAGES[1],
    [packageId],
  )
  const selectedFormat = useMemo(
    () => FORMATS.find((item) => item.id === formatId) || FORMATS[0],
    [formatId],
  )
  const isPl = lang === 'pl'
  const t = (en, pl) => (isPl ? pl : en)
  const packageCopy = PACKAGE_PL[selectedPackage.id] || {}
  const formatCopy = FORMAT_PL[selectedFormat.id] || {}
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

  return (
    <main className="lp-page">
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
          <button type="button" className={lang === 'en' ? 'is-active' : ''} onClick={() => setLang('en')}>EN</button>
          <button type="button" className={lang === 'pl' ? 'is-active' : ''} onClick={() => setLang('pl')}>PL</button>
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
          {PACKAGES.map((pkg) => (
            <article key={pkg.id} className={`lp-package lp-package-${pkg.accent} ${pkg.id === packageId ? 'is-selected' : ''}`}>
              <div className="lp-package-top">
                <span>{isPl ? (PACKAGE_PL[pkg.id]?.badge || pkg.badge) : pkg.badge}</span>
                <button type="button" onClick={() => setPackageId(pkg.id)} aria-pressed={pkg.id === packageId}>
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
            {t('Clear scheduling, billing, and refund rules are confirmed before payment.', 'Terminy, platnosci i zwroty sa jasno potwierdzane przed zaplata.')}
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
                  onClick={() => setFormatId(format.id)}
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
                'I understand this is a signup request, not a card payment. I have reviewed the cancellation, refund, and payment summary.',
                'Rozumiem, ze to prosba o zapis, a nie platnosc karta. Znam podsumowanie zasad odwolania, zwrotow i platnosci.',
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
