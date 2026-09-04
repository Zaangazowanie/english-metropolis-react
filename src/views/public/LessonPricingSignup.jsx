import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Skyline } from '../../design/v3/primitives.jsx'
import './lesson-pricing-signup.css'
import { COMPANY_PACKAGES, PRIVATE_PACKAGES, PACKAGE_LESSONS, packageValidity } from './packages.js'
import CartUI from './CartUI.jsx'
import PackageDial from './PackageDial.jsx'
import PaymentMark from './PaymentMarks.jsx'
import { cart, parsePricePLN, formatPLN } from './cart-store.js'
import { detectInitial } from '../../i18n'
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
    id: 'september',
    name: 'September Group Course',
    price: '400 PLN / student / month',
    priceUnit: '/ student / month',
    priceUnitPl: '/ osoba / miesiąc',
    detail: 'September only, 2 lessons per week, 8 lessons, max 4 students',
  },
]

const FORMATS = [
  { id: 'one-to-one', label: '1:1', detail: 'Private lessons' },
  { id: 'specialist', label: 'Specialist', detail: 'Exam / business' },
  { id: 'company', label: 'Company', detail: 'Team of up to 5' },
  { id: 'team', label: 'Group', detail: 'September, max 4' },
]

const POLICIES = [
  {
    icon: 'hourglass_top',
    title: 'Lesson validity',
    copy: 'One-off lessons are valid for 90 days. Private packages are valid for 6 months (4-8 lessons), 12 months (16-24 lessons) or 24 months (48 lessons). Company packages are valid for 12 months (24 lessons) or 24 months (48 lessons). Specialist package validity is shown with each package.',
  },
  {
    icon: 'more_time',
    title: 'Extensions',
    copy: 'Contact us before expiry. We normally extend unused lessons once at no extra charge: by 3 months for smaller packages and 6 months for packages of 16-48 lessons.',
  },
  {
    icon: 'verified_user',
    title: 'Student protection',
    copy: 'If a lesson cannot take place because of teacher cancellation, lack of availability or another issue caused by English Metro, we extend the package validity, credit the unused lesson or issue a refund.',
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
    features: ['Diagnostyczna rozmowa poziomująca', 'Specjalistyczny plan CEFR', '24 x 60 min lekcje specjalistyczne', 'Miesięczne przeglądy i notatki'],
    badge: 'Najlepsza cena specjalistyczna',
  },
  'company-24': {
    pace: '24 firmowe lekcje grupowe',
    calculation: '24 x 200 PLN = 4 800 PLN',
    perLesson: '200 PLN / lekcja grupowa',
    perStudentPackage: '960 PLN / pracownik / pakiet',
    perStudent: '40 PLN / pracownik / lekcja',
    bestFor: '24-lekcyjny program dla stałej grupy do 5 pracowników',
    features: ['Diagnoza poziomu i celów dla maks. 5 osób', 'Plan CEFR dopasowany do celów firmy', '24 x 60 min lekcje grupowe online', 'Miesięczne podsumowanie postępów dla firmy'],
    badge: 'Do 5 pracowników',
  },
  'company-48': {
    pace: '48 firmowych lekcji grupowych',
    calculation: '7 600 PLN - 20% = 6 080 PLN',
    perLesson: '126,67 PLN / lekcja grupowa',
    perStudentPackage: '1 216 PLN / pracownik / pakiet',
    perStudent: '25,33 PLN / pracownik / lekcja',
    bestFor: '20% rabatu od wyliczenia 7 600 PLN za program 48 lekcji',
    features: ['Diagnoza poziomu i celów dla maks. 5 osób', 'Plan CEFR dopasowany do celów firmy', '48 x 60 min lekcje grupowe online', 'Miesięczne podsumowanie postępów dla firmy'],
    badge: '20% rabatu',
  },
}

const COURSE_PL = {
  september: {
    name: 'Kurs wrześniowy',
    detail: 'Tylko wrzesień, 2 lekcje w tygodniu, 8 lekcji, maks. 4 osoby',
  },
}

const FORMAT_PL = {
  'one-to-one': { label: '1:1', detail: 'Lekcje indywidualne' },
  specialist: { label: 'Specjalistyczne', detail: 'Egzamin / biznes' },
  company: { label: 'Dla firm', detail: 'Grupa do 5 osób' },
  team: { label: 'Grupa', detail: 'Wrzesień, maks. 4' },
}

const POLICY_PL = {
  'Lesson validity': {
    title: 'Ważność lekcji',
    copy: 'Lekcja jednorazowa jest ważna 90 dni. Pakiety prywatne są ważne 6 miesięcy (4-8 lekcji), 12 miesięcy (16-24 lekcje) lub 24 miesiące (48 lekcji). Pakiety firmowe są ważne 12 miesięcy (24 lekcje) lub 24 miesiące (48 lekcji). Ważność pakietów specjalistycznych jest podana przy każdym pakiecie.',
  },
  Extensions: {
    title: 'Przedłużenia',
    copy: 'Napisz do nas przed końcem ważności. Zwykle przedłużamy niewykorzystane lekcje raz bez opłaty: o 3 miesiące dla mniejszych pakietów i o 6 miesięcy dla pakietów 16-48 lekcji.',
  },
  'Student protection': {
    title: 'Ochrona ucznia',
    copy: 'Jeśli lekcja nie może się odbyć z powodu odwołania przez lektora, braku dostępności lub innej przyczyny po stronie English Metro, przedłużamy ważność pakietu, zaliczamy lekcję na poczet kolejnych albo zwracamy pieniądze.',
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
    copy: 'Dodaj pakiety do koszyka i złóż zamówienie. Bezpieczna płatność online otwiera się w Przelewy24, z metodami dostępnymi dla danej transakcji.',
  },
}
function buildSummary({ selectedPackage, format, learnerName, email, level, goals, lang }) {
  const packageCopy = lang === 'pl' ? PACKAGE_PL[selectedPackage.id] : null
  const formatCopy = lang === 'pl' ? FORMAT_PL[format.id] : null
  return [
    lang === 'pl' ? 'Prośba o zapis na lekcje English Metro' : 'English Metro lesson signup request',
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

// One card for private, specialist and company packages. The card itself is
// the selector (click or Enter/Space); the only button on it adds to the cart
// (or, for company packages, prepares the enquiry).
// Memoised: selecting or adding used to re-render all twelve cards (576 dial
// ticks) for one changed flag. Now only the card whose props changed repaints.
const PackageCard = memo(function PackageCard({ pkg, formatId, selected, lang, added, company = false, onSelect, onAdd, onEnquiry }) {
  const isPl = lang === 'pl'
  const t = (en, pl) => (isPl ? pl : en)
  const priceOf = (item) => formatPLN(parsePricePLN(item.price))
  const copy = PACKAGE_PL[pkg.id] || {}
  const lessons = PACKAGE_LESSONS[pkg.id]
  const validity = packageValidity(lessons)[isPl ? 'pl' : 'en']
  const select = () => onSelect(pkg.id, formatId)
  return (
    <article
      className={`lp-package lp-package-${pkg.accent} ${selected ? 'is-selected' : ''}`}
      data-selected={selected}
      tabIndex={0}
      onClick={(event) => { if (!event.target.closest('button, a')) select() }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select() }
      }}
      onPointerMove={setPointerPolish} onPointerLeave={clearPointerPolish}
    >
      <div className="lp-package-top">
        <span>{isPl ? (copy.badge || pkg.badge) : pkg.badge}</span>
        <div className="lp-package-visual">
          <PackageDial lessons={lessons} selected={selected} lang={lang} />
          <span className="lp-package-selected" aria-hidden>
            <span className="material-symbols-outlined">check</span>
          </span>
        </div>
      </div>
      <h3>{pkg.name}</h3>
      <p className="lp-package-pace">{isPl ? (copy.pace || pkg.pace) : pkg.pace}</p>
      <div className="lp-price">
        {priceOf(pkg)}
        <small>{t('incl. VAT', 'z VAT')}</small>
      </div>
      {company && (
        <p className="lp-price-calculation">
          <span>{t('Package calculation', 'Wyliczenie pakietu')}</span>
          <strong>{isPl ? (copy.calculation || pkg.calculation) : pkg.calculation}</strong>
        </p>
      )}
      <p className="lp-per-lesson">{isPl ? (copy.perLesson || pkg.perLesson) : pkg.perLesson}</p>
      {company && (
        <>
          <p className="lp-per-student-package">{isPl ? (copy.perStudentPackage || pkg.perStudentPackage) : pkg.perStudentPackage}</p>
          <p className="lp-per-student">{isPl ? (copy.perStudent || pkg.perStudent) : pkg.perStudent}</p>
        </>
      )}
      <p className="lp-package-validity">
        <span className="material-symbols-outlined" aria-hidden>event_available</span>
        {validity}
      </p>
      <p className="lp-best">{isPl ? (copy.bestFor || pkg.bestFor) : pkg.bestFor}</p>
      <ul>
        {(isPl ? (copy.features || pkg.features) : pkg.features).map((feature) => (
          <li key={feature}>
            <span className="material-symbols-outlined" aria-hidden>check_circle</span>
            {feature}
          </li>
        ))}
      </ul>
      {company ? (
        <button
          type="button"
          className="lp-add-cart"
          onClick={() => onEnquiry(pkg.id)}
        >
          <span className="material-symbols-outlined" aria-hidden>business_center</span>
          {t('Prepare company enquiry', 'Przygotuj zapytanie firmowe')}
        </button>
      ) : (
        <button
          type="button"
          className="lp-add-cart"
          data-added={added}
          aria-label={t(`Add ${pkg.name} to cart, ${priceOf(pkg)}`, `Dodaj ${pkg.name} do koszyka, ${priceOf(pkg)}`)}
          onClick={() => onAdd(pkg)}
        >
          <span className="material-symbols-outlined" aria-hidden>
            {added ? 'check' : 'add_shopping_cart'}
          </span>
          {added ? t('Added', 'Dodano') : t('Add to cart', 'Do koszyka')}
        </button>
      )}
    </article>
  )
})

export default function LessonPricingSignup() {
  const location = useLocation()
  const pageRef = useRef(null)
  const pricingRef = useRef(null)
  const signupRef = useRef(null)
  const [lang, setLang] = useState(() => detectInitial())
  const [packageId, setPackageId] = useState('momentum')
  const [stickyOn, setStickyOn] = useState(false)
  const [announce, setAnnounce] = useState('')
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

  const addToCart = useCallback((pkg, extra = {}) => {
    cart.add({
      id: pkg.id,
      name: pkg.name,
      namePl: COURSE_PL[pkg.id]?.name || pkg.name,
      pace: pkg.pace || pkg.detail || '',
      pacePl: PACKAGE_PL[pkg.id]?.pace || COURSE_PL[pkg.id]?.detail || pkg.pace || pkg.detail || '',
      pricePLN: parsePricePLN(pkg.price),
      ...extra,
    })
    // Adding IS choosing: the card lights up and the signup summary follows,
    // so there is one selection on the page, not two competing ones.
    if (PACKAGES.some((item) => item.id === pkg.id)) setPackageId(pkg.id)
    setJustAdded(pkg.id)
    setAnnounce(t(`${pkg.name} added to cart`, `${COURSE_PL[pkg.id]?.name || pkg.name} dodano do koszyka`))
    window.clearTimeout(addedTimer.current)
    addedTimer.current = window.setTimeout(() => setJustAdded(null), 1400)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang])
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

  // Sticky mobile CTA: on once the pricing grid has been reached, off again
  // while the signup form (which has its own buttons) is on screen.
  useEffect(() => {
    const pricing = pricingRef.current
    const signup = signupRef.current
    if (!pricing || !signup || typeof IntersectionObserver === 'undefined') return undefined
    let pricingSeen = false
    let signupIn = false
    const apply = () => setStickyOn(pricingSeen && !signupIn)
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.target === pricing) {
          if (entry.isIntersecting) pricingSeen = true
          else if (entry.boundingClientRect.top > 0) pricingSeen = false
        }
        if (entry.target === signup) signupIn = entry.isIntersecting
      })
      apply()
    }, { threshold: 0.02 })
    io.observe(pricing)
    io.observe(signup)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    document.body.setAttribute('data-lp-sticky', stickyOn ? 'true' : 'false')
    return () => document.body.removeAttribute('data-lp-sticky')
  }, [stickyOn])

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
    // Same key the rest of the site reads (i18n detectInitial), so the choice
    // made here follows the visitor into /checkout instead of resetting to PL.
    try { window.localStorage.setItem('em.lang.v2', nextLang) } catch { /* private mode */ }
  }

  const choosePackage = useCallback((nextPackageId, nextFormatId) => {
    setPackageId(nextPackageId)
    if (nextFormatId) setFormatId(nextFormatId)
    const pkg = PACKAGES.find((item) => item.id === nextPackageId)
    if (pkg) setAnnounce(lang === 'pl' ? `Wybrano: ${pkg.name}` : `Selected: ${pkg.name}`)
    setPolishKey((current) => current + 1)
  }, [lang])

  const enquireCompany = useCallback((id) => {
    choosePackage(id, 'company')
    signupRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [choosePackage])

  function chooseFormat(nextFormatId) {
    setFormatId(nextFormatId)
    triggerPolish()
  }


  const priceOf = (pkg) => formatPLN(parsePricePLN(pkg.price))

  return (
    <main ref={pageRef} className="lp-page">
      {polishKey > 0 && <span key={polishKey} className="lp-click-bloom" aria-hidden />}
      <p className="sr-only" role="status" aria-live="polite">{announce}</p>
      <header className="lp-nav" onPointerMove={setPointerPolish} onPointerLeave={clearPointerPolish}>
        <Link to="/" className="lp-brand" aria-label={t('English Metro home', 'English Metro, strona główna')}>
          <Skyline size={30} />
          <span>English<span>Metro</span>.</span>
        </Link>
        <nav className="lp-nav-links" aria-label={t('Public lessons navigation', 'Nawigacja strony lekcji')}>
          <a href="#packages">{t('Lessons', 'Lekcje')}</a>
          <a href="#pricing">{t('Pricing', 'Cennik')}</a>
          <a href="#signup">{t('Signup', 'Zapisy')}</a>
          <Link to="/login">{t('Sign in', 'Logowanie')}</Link>
        </nav>
        <div className="lp-lang-toggle" role="group" aria-label={t('Language', 'Język')}>
          <button type="button" className={lang === 'en' ? 'is-active' : ''} aria-pressed={lang === 'en'} onClick={() => chooseLanguage('en')}>EN</button>
          <button type="button" className={lang === 'pl' ? 'is-active' : ''} aria-pressed={lang === 'pl'} onClick={() => chooseLanguage('pl')}>PL</button>
        </div>
      </header>

      <section className="lp-hero" aria-labelledby="lp-title">
        <MetroSignalField className="lp-hero-signal" mode="light" density={66}/>
        <div className="lp-hero-copy">
          <p className="lp-kicker">
            <span className="material-symbols-outlined" aria-hidden>verified</span>
            {t('Live 1:1 lessons with a teacher, practice in English Metro World', 'Lekcje 1:1 na żywo z lektorem i ćwiczenia w English Metro World')}
          </p>
          <h1 id="lp-title">{t('English Metro private lessons', 'Prywatne lekcje English Metro')}</h1>
          <p>
            {t(
              'Pick a package, pay securely through Przelewy24 and book your lessons from your account. Every package shows its price with VAT and its validity before you pay.',
              'Wybierz pakiet, zapłać bezpiecznie przez Przelewy24 i rezerwuj lekcje ze swojego konta. Każdy pakiet pokazuje cenę z VAT i okres ważności, zanim zapłacisz.',
            )}
          </p>
          <div className="lp-hero-actions">
            <a className="lp-button lp-button-primary" href="#pricing">
              <span className="material-symbols-outlined" aria-hidden>payments</span>
              {t('View packages', 'Zobacz pakiety')}
            </a>
            <a className="lp-button lp-button-ghost" href="#signup">
              <span className="material-symbols-outlined" aria-hidden>edit_calendar</span>
              {t('Ask for a learning plan', 'Poproś o plan nauki')}
            </a>
          </div>
        </div>
        <div className="lp-hero-panel" aria-label={t('How buying lessons works', 'Jak kupić lekcje')}
          onPointerMove={setPointerPolish} onPointerLeave={clearPointerPolish}>
          <div>
            <span>01</span>
            <strong>{t('Add a package to the cart', 'Dodaj pakiet do koszyka')}</strong>
            <p>{t('Compare lesson count, price per lesson and validity.', 'Porównaj liczbę lekcji, cenę za lekcję i ważność.')}</p>
          </div>
          <div>
            <span>02</span>
            <strong>{t('Create your account and pay', 'Załóż konto i zapłać')}</strong>
            <p>{t('BLIK, card, bank transfer or PayPo, on the secure Przelewy24 page. Invoice on request.', 'BLIK, karta, przelew lub PayPo na bezpiecznej stronie Przelewy24. Faktura na życzenie.')}</p>
          </div>
          <div>
            <span>03</span>
            <strong>{t('Book lessons from your account', 'Rezerwuj lekcje ze swojego konta')}</strong>
            <p>{t('Right away, or after the 14-day withdrawal period if you prefer. Cancel free with 24 hours notice.', 'Od razu albo po 14-dniowym okresie na odstąpienie, jak wolisz. Odwołanie bez opłaty z 24-godzinnym wyprzedzeniem.')}</p>
          </div>
        </div>
      </section>

      <section id="packages" className="lp-band lp-intro">
        <div>
          <p className="lp-section-label">{t('Lesson packages', 'Pakiety lekcji')}</p>
          <h2>{t('Every package includes the same lesson. You choose how many.', 'Każdy pakiet to ta sama lekcja. Ty wybierasz, ile ich będzie.')}</h2>
        </div>
        <ul className="lp-includes" aria-label={t('Included in every package', 'W każdym pakiecie')}>
          <li>
            <span className="material-symbols-outlined" aria-hidden>video_camera_front</span>
            <div>
              <strong>{t('60-minute live 1:1 lesson', '60-minutowa lekcja 1:1 na żywo')}</strong>
              <p>{t('Online, with your teacher, booked from your account.', 'Online, z Twoim lektorem, rezerwowana z konta.')}</p>
            </div>
          </li>
          <li>
            <span className="material-symbols-outlined" aria-hidden>description</span>
            <div>
              <strong>{t('PDF notes after each lesson', 'Notatki PDF po każdej lekcji')}</strong>
              <p>{t('What you covered, corrected, and what to practise.', 'Co było na lekcji, co poprawiono i co ćwiczyć dalej.')}</p>
            </div>
          </li>
          <li>
            <span className="material-symbols-outlined" aria-hidden>style</span>
            <div>
              <strong>{t('Flashcards with a YouTube clip for every word', 'Fiszki z klipem z YouTube do każdego słowa')}</strong>
              <p>{t('Hear each word from your lesson used by native speakers.', 'Usłysz każde słowo z lekcji w ustach native speakerów.')}</p>
            </div>
          </li>
          <li>
            <span className="material-symbols-outlined" aria-hidden>sports_esports</span>
            <div>
              <strong>{t('Practice in English Metro World', 'Ćwiczenia w English Metro World')}</strong>
              <p>{t('Your lesson vocabulary, in the 3D city, between lessons.', 'Słownictwo z lekcji w mieście 3D, między lekcjami.')}</p>
            </div>
          </li>
        </ul>
        <p>
          <span className="lp-optional-tag">{t('Optional at checkout', 'Opcjonalnie w kasie')}</span>{' '}
          {t(
            'AI lesson analysis: a written CEFR assessment after every lesson, 20 PLN per lesson, which also unlocks Bajla, your assistant on WhatsApp. Never added without your tick.',
            'Analiza lekcji AI: pisemna ocena CEFR po każdej lekcji, 20 PLN za lekcję, która włącza też Bajlę, Twoją asystentkę na WhatsAppie. Nigdy nie jest dodawana bez Twojego zaznaczenia.',
          )}
        </p>
      </section>

      <section id="pricing" ref={pricingRef} className="lp-section" aria-labelledby="pricing-title">
        <div className="lp-section-head">
          <div>
            <p className="lp-section-label">{t('Pricing', 'Cennik')}</p>
            <h2 id="pricing-title">{t('Choose how often you learn', 'Wybierz częstotliwość lekcji')}</h2>
          </div>
          <p>{t('Prices are gross, VAT included. Click a card to compare it in the summary below, then add it to the cart.', 'Ceny brutto, z VAT. Kliknij kartę, aby porównać ją w podsumowaniu poniżej, a potem dodaj do koszyka.')}</p>
        </div>

        <ul className="lp-trust" aria-label={t('Payment and cancellation terms', 'Warunki płatności i odwołania')}>
          <li>
            <span className="lp-trust-marks" aria-hidden>
              <PaymentMark kind="blik" /><PaymentMark kind="card" /><PaymentMark kind="bank" />
            </span>
            <span><strong>Przelewy24</strong> {t('BLIK, card, transfer, PayPo', 'BLIK, karta, przelew, PayPo')}</span>
          </li>
          <li>
            <span className="material-symbols-outlined" aria-hidden>receipt_long</span>
            <span>{t('Invoice (KSeF) on request', 'Faktura (KSeF) na życzenie')}</span>
          </li>
          <li>
            <span className="material-symbols-outlined" aria-hidden>event_busy</span>
            <span>{t('Free cancellation 24 h before a lesson', 'Bezpłatne odwołanie 24 h przed lekcją')}</span>
          </li>
          <li>
            <span className="material-symbols-outlined" aria-hidden>undo</span>
            <span>{t('14-day right of withdrawal', '14 dni na odstąpienie od umowy')}</span>
          </li>
        </ul>

        <div className="lp-package-grid">
          {PRIVATE_PACKAGES.map((pkg) => (
            <PackageCard key={pkg.id} pkg={pkg} formatId="one-to-one" selected={pkg.id === packageId} lang={lang}
              added={justAdded === pkg.id} onSelect={choosePackage} onAdd={addToCart} />
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
              <PackageCard key={pkg.id} pkg={pkg} formatId="specialist" selected={pkg.id === packageId} lang={lang}
                added={justAdded === pkg.id} onSelect={choosePackage} onAdd={addToCart} />
            ))}
          </div>
        </div>

        <div className="lp-company-block" aria-labelledby="company-title">
          <div className="lp-company-head">
            <p className="lp-section-label">{t('Company groups', 'Kursy dla firm')}</p>
            <h3 id="company-title">{t('One English course for a team of up to 5 employees.', 'Jeden kurs angielskiego dla zespołu do 5 pracowników.')}</h3>
            <p>
              {t(
                'The 24-lesson package is 4 800 PLN. The 48-lesson calculation starts at 7 600 PLN and receives a 20% discount. Company packages are arranged by enquiry and invoiced.',
                'Pakiet 24 lekcji kosztuje 4 800 PLN. Wyliczenie dla 48 lekcji zaczyna się od 7 600 PLN i obejmuje 20% rabatu. Pakiety firmowe ustalamy na podstawie zapytania i rozliczamy fakturą.',
              )}
            </p>
          </div>
          <div className="lp-package-grid lp-company-grid">
            {COMPANY_PACKAGES.map((pkg) => (
              <PackageCard key={pkg.id} pkg={pkg} formatId="company" selected={pkg.id === packageId} lang={lang} company
                added={false} onSelect={choosePackage} onEnquiry={enquireCompany} />
            ))}
          </div>
        </div>
      </section>

      <section className="lp-section" aria-labelledby="summer-title">
        <div className="lp-section-head">
          <div>
            <p className="lp-section-label">{t('Group lessons', 'Lekcje grupowe')}</p>
            <h2 id="summer-title">{t('September group courses.', 'Kursy grupowe we wrześniu.')}</h2>
          </div>
          <p>
            {t(
              'Group courses run in four levels: B1 pre, B1 inter, B2, and B2/C1. September runs twice a week for the month. Each group is capped at 4 students and each lesson is 60 minutes.',
              'Kursy grupowe prowadzimy na czterech poziomach: B1 pre, B1 inter, B2 i B2/C1. Wrzesień to dwie lekcje w tygodniu przez cały miesiąc. Każda grupa liczy maksymalnie 4 osoby, a lekcja trwa 60 minut.',
            )}
          </p>
        </div>
        <div className="lp-course-grid">
          {SUMMER_COURSES.map((course) => (
            <article key={course.id} className="lp-course-card lp-course-card-summer"
              onPointerMove={setPointerPolish} onPointerLeave={clearPointerPolish}>
              <span className="material-symbols-outlined" aria-hidden>sunny</span>
              <h3>{isPl ? (COURSE_PL[course.id]?.name || course.name) : course.name}</h3>
              <strong>{priceOf(course)} <small>{isPl ? course.priceUnitPl : course.priceUnit}</small></strong>
              <small>{isPl ? (COURSE_PL[course.id]?.detail || course.detail) : course.detail}</small>
              <p className="lp-package-validity">
                <span className="material-symbols-outlined" aria-hidden>event_available</span>
                {packageValidity(PACKAGE_LESSONS[course.id])[isPl ? 'pl' : 'en']}
              </p>
              <button
                type="button"
                className="lp-add-cart lp-add-cart-course"
                data-added={justAdded === course.id}
                onClick={() => addToCart({ ...course, name: course.name })}
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
            <h2 id="payment-title">{t('From cart to first lesson.', 'Od koszyka do pierwszej lekcji.')}</h2>
          </div>
          <p>
            {t(
              'You pay at checkout, once, for the whole package. Your lessons are then allocated to your account automatically after Przelewy24 confirms the payment.',
              'Płacisz w kasie, raz, za cały pakiet. Po potwierdzeniu płatności przez Przelewy24 lekcje są automatycznie przypisywane do Twojego konta.',
            )}
          </p>
        </div>
        <div className="lp-readiness">
          <div className="lp-readiness-row">
            <span className="lp-step-n" aria-hidden>1</span>
            <strong>{t('Cart', 'Koszyk')}</strong>
            <p>{t('Add one or more packages. The cart keeps them for 7 days.', 'Dodaj jeden lub więcej pakietów. Koszyk pamięta je przez 7 dni.')}</p>
          </div>
          <div className="lp-readiness-row">
            <span className="lp-step-n" aria-hidden>2</span>
            <strong>{t('Account and payment', 'Konto i płatność')}</strong>
            <p>{t('Create your account (or sign in), add invoice details if you need them, and pay on the secure Przelewy24 page.', 'Załóż konto (lub zaloguj się), podaj dane do faktury, jeśli ich potrzebujesz, i zapłać na bezpiecznej stronie Przelewy24.')}</p>
          </div>
          <div className="lp-readiness-row">
            <span className="lp-step-n" aria-hidden>3</span>
            <strong>{t('Book', 'Rezerwacja')}</strong>
            <p>{t('Lessons appear in your account after payment is verified. You choose at checkout whether booking opens straight away or after the 14-day withdrawal period.', 'Lekcje pojawiają się na koncie po zweryfikowaniu płatności. W kasie decydujesz, czy rezerwacja otwiera się od razu, czy po 14-dniowym okresie na odstąpienie.')}</p>
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
              'Prefer to talk first, or buying for a company? Send a request and we reply with teacher availability and the next step. No card data is collected here.',
              'Wolisz najpierw porozmawiać albo kupujesz dla firmy? Wyślij prośbę, a odpowiemy z dostępnością lektora i kolejnym krokiem. Ta strona nie zbiera danych karty.',
            )}
          </p>
          <div className="lp-selected">
            <span className="material-symbols-outlined" aria-hidden>local_activity</span>
            <div>
              <strong>{selectedPackage.name}</strong>
              <p>{isPl ? (packageCopy.pace || selectedPackage.pace) : selectedPackage.pace} · {priceOf(selectedPackage)} · {packageValidity(PACKAGE_LESSONS[selectedPackage.id])[isPl ? 'pl' : 'en']}</p>
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
            <span>{t('Learner name', 'Imię ucznia')}</span>
            <input value={learnerName} onChange={(event) => setLearnerName(event.target.value)} autoComplete="name" placeholder="Marta Kowalska" />
          </label>

          <label className="lp-field">
            <span>E-mail</span>
            <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" placeholder="you@example.com" required aria-invalid={error && !email.trim() ? 'true' : undefined} />
          </label>

          <label className="lp-field">
            <span>{t('Current level', 'Obecny poziom')}</span>
            <select value={level} onChange={(event) => setLevel(event.target.value)} autoComplete="off">
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
              autoComplete="off"
              placeholder={t('Conversation confidence, job interview, IELTS, school support...', 'Pewniejsze rozmowy, praca, egzamin, wsparcie szkolne...')}
            />
          </label>

          <label className="lp-check">
            <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} aria-invalid={error && !accepted ? 'true' : undefined} />
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
                {t('Prefer e-mail? Prepare a request', 'Wolisz e-mail? Przygotuj prośbę')}
              </button>
            </>
          )}

          {submitted && (
            <div className="lp-confirmation" role="status">
              <strong>{t('Signup request prepared.', 'Prośba o zapis gotowa.')}</strong>
              <p>{t('Open the e-mail draft or copy the summary for your message to English Metro.', 'Otwórz szkic e-maila albo skopiuj podsumowanie wiadomości do English Metro.')}</p>
              <div>
                <a className="lp-button lp-button-ghost" href={mailHref}>
                  <span className="material-symbols-outlined" aria-hidden>mail</span>
                  {t('Open e-mail draft', 'Otwórz e-mail')}
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

      {!isCompanyPackage && (
        <div className="lp-sticky-cta" data-visible={stickyOn} aria-hidden={!stickyOn}>
          <div className="lp-sticky-cta-info">
            <strong>{selectedPackage.name}</strong>
            <span>{priceOf(selectedPackage)} · {isPl ? (packageCopy.pace || selectedPackage.pace) : selectedPackage.pace}</span>
          </div>
          <button
            type="button"
            className="lp-add-cart"
            data-added={justAdded === selectedPackage.id}
            tabIndex={stickyOn ? 0 : -1}
            onClick={() => addToCart(selectedPackage)}
          >
            <span className="material-symbols-outlined" aria-hidden>
              {justAdded === selectedPackage.id ? 'check' : 'add_shopping_cart'}
            </span>
            {justAdded === selectedPackage.id ? t('Added', 'Dodano') : t('Add to cart', 'Do koszyka')}
          </button>
        </div>
      )}

      <CartUI lang={lang} />
    </main>
  )
}

