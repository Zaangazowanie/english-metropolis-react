import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Skyline } from '../../design/v3/primitives.jsx'
import './lesson-pricing-signup.css'

const PACKAGES = [
  {
    id: 'private-core',
    name: 'Private Core',
    pace: '4 live lessons',
    price: '420 PLN',
    perLesson: '105 PLN / lesson',
    bestFor: 'A first month of steady B1/B2 speaking work',
    features: ['Placement call', '4 x 50 min 1:1 lessons', 'EnglishMetro practice path', 'Lesson notes after each session'],
    badge: 'Start here',
    accent: 'sky',
  },
  {
    id: 'momentum',
    name: 'Fluency Momentum',
    pace: '8 live lessons',
    price: '920 PLN',
    perLesson: '115 PLN / lesson',
    bestFor: 'The strongest routine for fluency work',
    features: ['Personal CEFR plan', '8 x 50 min 1:1 lessons', 'Weekly speaking targets', 'Priority reschedule window'],
    badge: 'Most chosen',
    accent: 'brand',
  },
  {
    id: 'specialist',
    name: 'Specialist Sprint',
    pace: '6 specialist lessons',
    price: '780 PLN',
    perLesson: '130 PLN / lesson',
    bestFor: 'Interview, exam, relocation, and business pressure',
    features: ['Diagnostic interview', '6 x 50 min specialist 1:1 lessons', 'Writing or speaking review', 'Checkout or invoice option'],
    badge: 'Focused',
    accent: 'ember',
  },
]

const GROUP_OFFERS = [
  {
    id: 'small-group-session',
    name: 'Small-group drop-in',
    price: '89 PLN',
    detail: 'One 90 min session',
    copy: 'Best for trying a group lesson before committing.',
  },
  {
    id: 'small-group-month',
    name: 'Monthly group seat',
    price: '329 PLN',
    detail: '4 weekly sessions',
    copy: 'A practical monthly rhythm for speaking confidence.',
  },
  {
    id: 'small-group-term',
    name: '8-week group course',
    price: '890 PLN',
    detail: 'Max 5 students',
    copy: 'Small enough for real correction, structured enough to finish.',
  },
]

const SUMMER_COURSES = [
  {
    id: 'august',
    name: 'August Summer Course',
    price: '890 PLN',
    detail: 'B1 pre, B1 inter, B2, or B2/C1',
  },
  {
    id: 'september',
    name: 'September Summer Course',
    price: '890 PLN',
    detail: 'B1 pre, B1 inter, B2, or B2/C1',
  },
  {
    id: 'summer-intensive',
    name: 'Summer Intensive',
    price: '1,290 PLN',
    detail: 'More contact hours, max 5 students',
  },
  {
    id: 'two-month-bundle',
    name: 'August + September Bundle',
    price: '1,490 PLN',
    detail: 'Best value for the full summer arc',
  },
]

const FORMATS = [
  { id: 'one-to-one', label: '1:1', detail: 'Private lessons' },
  { id: 'specialist', label: 'Specialist', detail: 'Exam / business' },
  { id: 'team', label: 'Group', detail: 'Max 5 students' },
]

const POLICIES = [
  {
    icon: 'event_repeat',
    title: 'Schedule changes',
    copy: 'Move a lesson freely with at least 24 hours notice. Late cancellation may count as used unless we agree an exception.',
  },
  {
    icon: 'undo',
    title: 'Withdrawal and refunds',
    copy: 'EU consumers get a 14-day withdrawal window. If lessons start during that window, completed lessons are payable and unused lessons remain refundable or creditable.',
  },
  {
    icon: 'receipt_long',
    title: 'Transparent billing',
    copy: 'Gross prices, package length, invoice identity, and VAT-exemption wording are shown before payment. No card details are collected on this page.',
  },
  {
    icon: 'lock',
    title: 'Payment readiness',
    copy: 'The surface is prepared for a hosted Polish gateway handoff through Twój Startup after their legal and payment review.',
  },
]

const READINESS = [
  ['Pricing', '1:1, specialist, group, and summer-course prices are visible before checkout', 'done'],
  ['Signup', 'Student request is captured in-browser and prepared for email handoff', 'done'],
  ['Checkout', 'Ready for a hosted payment-gateway session; card collection is not live here', 'pending'],
  ['Legal copy', 'Withdrawal, refund, no-show, invoice, and complaint rules are visible before commitment', 'done'],
  ['Gateway review', 'Seller data and final checkout wording will be inserted after Twój Startup approval', 'pending'],
]

function buildSummary({ selectedPackage, format, learnerName, email, level, goals }) {
  return [
    'EnglishMetro lesson signup request',
    '',
    `Package: ${selectedPackage.name} (${selectedPackage.pace}, ${selectedPackage.price})`,
    `Format: ${format.label} - ${format.detail}`,
    `Learner: ${learnerName || 'Not provided'}`,
    `Email: ${email || 'Not provided'}`,
    `Current level: ${level || 'Not sure yet'}`,
    `Goals: ${goals || 'Not provided'}`,
    '',
    'Please confirm availability, package fit, and the payment link or invoice next step.',
  ].join('\n')
}

export default function LessonPricingSignup() {
  const location = useLocation()
  const pricingRef = useRef(null)
  const signupRef = useRef(null)
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
  const summary = useMemo(
    () => buildSummary({ selectedPackage, format: selectedFormat, learnerName, email, level, goals }),
    [selectedPackage, selectedFormat, learnerName, email, level, goals],
  )
  const mailHref = `mailto:hello@englishmetro.com?subject=${encodeURIComponent(`Lessons signup - ${selectedPackage.name}`)}&body=${encodeURIComponent(summary)}`

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
      setError('Please accept the lesson and payment policy preview before sending the request.')
      return
    }
    if (!email.trim()) {
      setError('Please add an email address so we can reply with available slots.')
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
          <a href="#packages">Lessons</a>
          <a href="#pricing">Pricing</a>
          <a href="#signup">Signup</a>
          <Link to="/login">Sign in</Link>
        </nav>
      </header>

      <section className="lp-hero" aria-labelledby="lp-title">
        <div className="lp-hero-copy">
          <p className="lp-kicker">
            <span className="material-symbols-outlined" aria-hidden>verified</span>
            Human lessons plus EnglishMetro practice
          </p>
          <h1 id="lp-title">EnglishMetro private lessons</h1>
          <p>
            Live 1:1 English coaching, a playable practice route after every session, and
            a clear payment path that waits until your teacher and slot are confirmed.
          </p>
          <div className="lp-hero-actions">
            <a className="lp-button lp-button-primary" href="#signup">
              <span className="material-symbols-outlined" aria-hidden>edit_calendar</span>
              Request a lesson plan
            </a>
            <a className="lp-button lp-button-ghost" href="#pricing">
              <span className="material-symbols-outlined" aria-hidden>payments</span>
              View packages
            </a>
          </div>
        </div>
        <div className="lp-hero-panel" aria-label="Next available lesson flow">
          <div>
            <span>01</span>
            <strong>Choose package</strong>
            <p>Pick pace, format, and goals.</p>
          </div>
          <div>
            <span>02</span>
            <strong>Confirm slot</strong>
            <p>Teacher fit and calendar are checked first.</p>
          </div>
          <div>
            <span>03</span>
            <strong>Pay securely</strong>
            <p>Checkout link or invoice follows confirmation.</p>
          </div>
        </div>
      </section>

      <section id="packages" className="lp-band lp-intro">
        <div>
          <p className="lp-section-label">Why packages</p>
          <h2>Clear enough to buy, flexible enough to learn.</h2>
        </div>
        <p>
          Online English tutoring prices vary widely by tutor, market, and specialty.
          These packages position EnglishMetro as coached private tuition with a practice
          system included, not a marketplace listing or a pay-per-minute chat.
        </p>
      </section>

      <section className="lp-section lp-market" aria-labelledby="market-title">
        <div className="lp-section-head">
          <div>
            <p className="lp-section-label">Market position</p>
            <h2 id="market-title">Competitive, but not a race to the bottom.</h2>
          </div>
          <p>
            Marketplace tutors can be cheaper, branded schools are often more expensive, and specialist lessons cost more.
            EnglishMetro sits in the middle: private coaching plus a student practice system after class.
          </p>
        </div>
        <div className="lp-market-strip">
          <div>
            <span>Drop-in 1:1</span>
            <strong>110-130 PLN</strong>
            <p>Level and focus dependent</p>
          </div>
          <div>
            <span>Package range</span>
            <strong>105-130 PLN</strong>
            <p>Per 50 min lesson</p>
          </div>
          <div>
            <span>Small group</span>
            <strong>89 PLN</strong>
            <p>Per 90 min session</p>
          </div>
        </div>
      </section>

      <section id="pricing" ref={pricingRef} className="lp-section" aria-labelledby="pricing-title">
        <div className="lp-section-head">
          <div>
            <p className="lp-section-label">Pricing</p>
            <h2 id="pricing-title">Pick your lesson rhythm</h2>
          </div>
          <p>All prices are shown before checkout. Final tax and invoice details are confirmed before payment.</p>
        </div>

        <div className="lp-package-grid">
          {PACKAGES.map((pkg) => (
            <article key={pkg.id} className={`lp-package lp-package-${pkg.accent} ${pkg.id === packageId ? 'is-selected' : ''}`}>
              <div className="lp-package-top">
                <span>{pkg.badge}</span>
                <button type="button" onClick={() => setPackageId(pkg.id)} aria-pressed={pkg.id === packageId}>
                  {pkg.id === packageId ? 'Selected' : 'Choose'}
                </button>
              </div>
              <h3>{pkg.name}</h3>
              <p className="lp-package-pace">{pkg.pace}</p>
              <div className="lp-price">{pkg.price}</div>
              <p className="lp-per-lesson">{pkg.perLesson}</p>
              <p className="lp-best">{pkg.bestFor}</p>
              <ul>
                {pkg.features.map((feature) => (
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

      <section className="lp-section" aria-labelledby="groups-title">
        <div className="lp-section-head">
          <div>
            <p className="lp-section-label">Group lessons</p>
            <h2 id="groups-title">Small groups, capped at five students.</h2>
          </div>
          <p>
            Group lessons are priced as real speaking practice, not a lecture. Each group is built around level,
            confidence, and correction needs.
          </p>
        </div>
        <div className="lp-course-grid">
          {GROUP_OFFERS.map((offer) => (
            <article key={offer.id} className="lp-course-card">
              <span className="material-symbols-outlined" aria-hidden>groups</span>
              <h3>{offer.name}</h3>
              <p>{offer.copy}</p>
              <strong>{offer.price}</strong>
              <small>{offer.detail}</small>
            </article>
          ))}
        </div>
      </section>

      <section className="lp-section" aria-labelledby="summer-title">
        <div className="lp-section-head">
          <div>
            <p className="lp-section-label">Summer courses</p>
            <h2 id="summer-title">August and September course seats.</h2>
          </div>
          <p>
            Levels: B1 pre, B1 inter, B2, and B2/C1. Course material will be published later;
            this page prepares the payment and reservation surface now.
          </p>
        </div>
        <div className="lp-course-grid lp-course-grid-four">
          {SUMMER_COURSES.map((course) => (
            <article key={course.id} className="lp-course-card lp-course-card-summer">
              <span className="material-symbols-outlined" aria-hidden>sunny</span>
              <h3>{course.name}</h3>
              <strong>{course.price}</strong>
              <small>{course.detail}</small>
            </article>
          ))}
        </div>
      </section>

      <section className="lp-section lp-payment" aria-labelledby="payment-title">
        <div className="lp-section-head">
          <div>
            <p className="lp-section-label">Payment readiness</p>
            <h2 id="payment-title">Ready for checkout without pretending checkout is live.</h2>
          </div>
          <p>
            The public surface can accept intent today. Card collection should only turn on after
            the backend creates a secure hosted payment session and the Twój Startup legal/payment setup is approved.
          </p>
        </div>
        <div className="lp-readiness">
          {READINESS.map(([label, copy, state]) => (
            <div key={label} className="lp-readiness-row">
              <span className={`lp-dot lp-dot-${state}`} aria-hidden />
              <strong>{label}</strong>
              <p>{copy}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="lp-section lp-policy" aria-labelledby="policy-title">
        <div className="lp-section-head">
          <div>
            <p className="lp-section-label">Policy preview</p>
            <h2 id="policy-title">Plain-language rules before anyone pays.</h2>
          </div>
          <p>
            This summary supports the signup decision. The final checkout will use clear purchase wording,
            immediate-start consent when needed, invoice details, and a no-surprises refund path for untaught lessons.
          </p>
        </div>
        <div className="lp-policy-grid">
          {POLICIES.map((policy) => (
            <article key={policy.title} className="lp-policy-item">
              <span className="material-symbols-outlined" aria-hidden>{policy.icon}</span>
              <h3>{policy.title}</h3>
              <p>{policy.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="signup" ref={signupRef} className="lp-section lp-signup" aria-labelledby="signup-title">
        <div className="lp-signup-copy">
          <p className="lp-section-label">Student signup</p>
          <h2 id="signup-title">Tell us the package, goal, and schedule shape.</h2>
          <p>
            We will reply with teacher availability and the right payment next step. No card data is
            collected here.
          </p>
          <div className="lp-selected">
            <span className="material-symbols-outlined" aria-hidden>local_activity</span>
            <div>
              <strong>{selectedPackage.name}</strong>
              <p>{selectedPackage.pace} - {selectedPackage.price}</p>
            </div>
          </div>
        </div>

        <form className="lp-form" onSubmit={submitSignup}>
          <fieldset className="lp-fieldset">
            <legend>Lesson format</legend>
            <div className="lp-segment">
              {FORMATS.map((format) => (
                <button
                  key={format.id}
                  type="button"
                  className={format.id === formatId ? 'is-active' : ''}
                  onClick={() => setFormatId(format.id)}
                  aria-pressed={format.id === formatId}
                >
                  <strong>{format.label}</strong>
                  <span>{format.detail}</span>
                </button>
              ))}
            </div>
          </fieldset>

          <label className="lp-field">
            <span>Learner name</span>
            <input value={learnerName} onChange={(event) => setLearnerName(event.target.value)} autoComplete="name" placeholder="Marta Kowalska" />
          </label>

          <label className="lp-field">
            <span>Email</span>
            <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" placeholder="you@example.com" required />
          </label>

          <label className="lp-field">
            <span>Current level</span>
            <select value={level} onChange={(event) => setLevel(event.target.value)}>
              <option value="">Not sure yet</option>
              <option value="A2">A2</option>
              <option value="B1">B1</option>
              <option value="B2">B2</option>
              <option value="C1">C1</option>
              <option value="C2">C2</option>
            </select>
          </label>

          <label className="lp-field">
            <span>Goal</span>
            <textarea value={goals} onChange={(event) => setGoals(event.target.value)} rows={4} placeholder="Conversation confidence, job interview, IELTS, school support..." />
          </label>

          <label className="lp-check">
            <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} />
            <span>
              I understand this is a signup request, not a card payment. I have reviewed the cancellation,
              refund, and payment-readiness summary.
            </span>
          </label>

          {error && <p className="lp-error" role="alert">{error}</p>}

          <button className="lp-button lp-button-primary lp-submit" type="submit">
            <span className="material-symbols-outlined" aria-hidden>send</span>
            Prepare signup request
          </button>

          {submitted && (
            <div className="lp-confirmation" role="status">
              <strong>Signup request prepared.</strong>
              <p>Open the email draft or copy the summary for your message to EnglishMetro.</p>
              <div>
                <a className="lp-button lp-button-ghost" href={mailHref}>
                  <span className="material-symbols-outlined" aria-hidden>mail</span>
                  Open email draft
                </a>
                <button className="lp-button lp-button-soft" type="button" onClick={copySummary}>
                  <span className="material-symbols-outlined" aria-hidden>content_copy</span>
                  {copied ? 'Copied' : 'Copy summary'}
                </button>
              </div>
            </div>
          )}

          <p className="lp-form-foot">
            By continuing, you can review <Link to="/terms">Terms</Link>, <Link to="/privacy">Privacy</Link>,
            and <Link to="/cookies">Cookies</Link> before payment.
          </p>
        </form>
      </section>
    </main>
  )
}
