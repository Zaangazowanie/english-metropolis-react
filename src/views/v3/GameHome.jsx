// GameHome — the public home page of englishmetro.com (redesigned 2026-07-03).
//
// The page now leads with the OPEN WORLD (beta): a cinematic hero with an
// animated city postcard and one unmissable call-to-action — Play the World.
// Beneath it, the "two ways in" choice (world vs quick practice), then the
// whole 39-game practice catalog folded into four expandable metro-line
// sections plus a 3D Districts section fed by game3dRegistry. Instant
// anonymous play via PlayOverlay is unchanged: every 2D shell falls back to
// its built-in demo puzzle; first completed round raises the sign-up CTA
// (Mike, SPEC 2026-06-06).
//
// Unlike the old dusk-only page, the whole home now rides the v3 design
// system's DAY and NIGHT themes (useV3Theme + tokens.js) with a sun/moon
// toggle in the header — golden-hour by day, neon London by night.
import { Suspense, lazy, useMemo, useRef, useState, useEffect, Component } from 'react'
import { Link } from 'react-router-dom'
import { FONT, G, EASE } from '../../design/v3/tokens.js'
import { Skyline } from '../../design/v3/primitives.jsx'
import { useV3Theme } from '../../design/v3/ThemeProvider.jsx'
import { game3dRegistry } from '../../practice/shells3d/kit/registry'
import { usePrefersReducedMotion } from '../../practice/lib/usePrefersReducedMotion'
import { useI18n } from '../../i18n'
import { PRIVATE_PACKAGES } from '../public/packages.js'
import { cart, parsePricePLN } from '../public/cart-store.js'
import CartUI from '../public/CartUI.jsx'
import HeroSlider from './HeroSlider.jsx'
import HeroPracticePreview from './HeroPracticePreview.jsx'
const ArcadeCityBackdrop = lazy(() => import('./ArcadeCityBackdrop.jsx'))
import './game-home.css'

const MetroLearningCity = lazy(() => import('./MetroLearningCity.jsx'))

// Scroll-triggered reveal: fades/rises a block the first time it enters the
// viewport. Inert under prefers-reduced-motion (.gh-still forces visible).
function Reveal({ children, delay = 0, style, className = '' }) {
  const ref = useRef(null)
  const [on, setOn] = useState(() => typeof IntersectionObserver === 'undefined')
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setOn(true); io.disconnect() }
    }, { threshold: 0.15 })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    <div ref={ref} className={`gh-sr${on ? ' on' : ''}${className ? ` ${className}` : ''}`}
      style={{ transitionDelay: `${delay}ms`, ...style }}>
      {children}
    </div>
  )
}

// Navigation actions render as links all the way through. This avoids the
// invalid link > button nesting that previously made some CTAs unreliable.
function ActionLink({ to, href, children, variant = 'ghost', size = 'md', icon,
  trailingIcon, full = false, className = '', style, onClick }) {
  const classes = [
    'gh-action',
    `gh-action--${variant}`,
    `gh-action--${size}`,
    full ? 'gh-action--full' : '',
    className,
  ].filter(Boolean).join(' ')
  const content = <>
    {icon && <span className="material-symbols-outlined" aria-hidden>{icon}</span>}
    <span>{children}</span>
    {trailingIcon && <span className="material-symbols-outlined" aria-hidden>{trailingIcon}</span>}
  </>

  if (to) {
    return <Link to={to} className={classes} style={style} onClick={onClick}>{content}</Link>
  }
  return <a href={href} className={classes} style={style} onClick={onClick}>{content}</a>
}

function DeferredMetroCity({ reduced, night, label }) {
  const mountRef = useRef(null)
  const [ready, setReady] = useState(() => typeof IntersectionObserver === 'undefined')

  useEffect(() => {
    const mount = mountRef.current
    if (!mount || typeof IntersectionObserver === 'undefined') return undefined
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setReady(true)
        observer.disconnect()
      }
    }, { rootMargin: '360px 0px', threshold: 0.01 })
    observer.observe(mount)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={mountRef} className="gh-three-mount">
      {ready ? (
        <Suspense fallback={<div className="gh-three-loading" aria-hidden/>}>
          <MetroLearningCity reduced={reduced} night={night} label={label}/>
        </Suspense>
      ) : <div className="gh-three-loading" aria-hidden/>}
    </div>
  )
}

// ── Landing marketing copy, EN + PL (Polish is the site default) ───────────
const GH = {
  en: {
    navPricing: 'Pricing', navSignin: 'Sign in', navSignup: 'Sign up', navDash: 'My dashboard',
    navPlay: 'Play the World',
    eyebrow: 'online English school · live 1:1 lessons',
    h1a: 'Learn live.', h1b: 'Speak every day',
    ctaBook: 'Book your first lesson', ctaPricing: 'See pricing', ctaWorld: 'Play the World for free',
    heroSliderLabel: 'What a course with us includes',
    heroSliderPrev: 'Previous slide', heroSliderNext: 'Next slide',
    heroSlides: [
      { eyebrow: 'live 1:1 lessons', title: '60 minutes, with your own teacher', cta: 'Start learning', cta2: 'Find your course', to2: '/pricing' },
      { eyebrow: 'your CEFR course', title: 'A course matched to your level', cta: 'See pricing', cta2: 'Book a lesson', to2: '/signup' },
      { eyebrow: 'practice between lessons', title: 'Practise out loud, on your own time', cta: 'Try it now', cta2: 'See pricing', to2: '/pricing' },
    ],
    chips: ['60-min live 1:1 lessons', 'CEFR-matched courses', 'lesson vocabulary becomes flashcards', 'book online in minutes'],
    arcadeBadge: 'quick practice · try it now',
    officeAlt: 'Students laughing together at the English Metro school',
    officeChip: 'Our students · one school',
    arcadeKicker: 'quick practice · no sign-up',
    arcadeTitle: 'Seven ways to practise. Try them now.',
    arcadeBody: 'These are the same games your flashcards feed after every lesson. Flip a card, catch a train, build a sentence. No account needed.',
    catalogTitle: 'Quick Practice across four lines',
    catalogHint: 'Choose a line to see its games · each game starts immediately',
    catalogBrowse: 'Browse the full catalogue by line and station. You can play your first game without an account.',
    catalogGames: (n) => `${n} games`,
    catalogLive: (a, b) => `${a} live · ${b} arriving`,
    districts3dSubtitle: 'The Fluent City in 3D. New districts land here automatically with every update.',
    doorsBody: (n) => `${n} short games across four metro lines: vocabulary, grammar, listening and speaking. Practise for two minutes or twenty.`,
    doorsGo: 'Recommended game:',
    ctaTitle: 'Save your progress with a free account.',
    ctaBody: 'A free account saves your streaks and vocabulary progress and enables full-screen play in English Metropolis World and Quick Practice.',
    ctaPlay: 'Play for free',
    ctaBeta: 'Try the English Metropolis World beta',
    lineTags: { 'Arcade Line': 'Fast hands, faster words', 'Word Line': 'Letters into language', 'Quiz Line': 'Think quick, answer quicker', 'City Line': 'Real skills, street level' },
    worldLink: 'Explore the full 3D city for free',
    stepsKicker: 'from sign-up to speaking', stepsTitle: 'Your first lesson is four steps away',
    steps: [
      { icon: 'person_add', title: 'Create your account', body: 'It takes about two minutes: use your email and password or continue with Google.' },
      { icon: 'shopping_bag', title: 'Pick a package', body: 'Choose one trial lesson or a package of up to 24 lessons. Pay online or by invoice.' },
      { icon: 'event_available', title: 'Book your times', body: 'Choose an available time in your teacher’s calendar. We will email you the Google Meet link and calendar invitation.' },
      { icon: 'school', title: 'Learn, then replay', body: 'After each lesson, a PDF is added to your library and the lesson vocabulary is turned into flashcards for further practice.' },
    ],
    packsKicker: '1:1 lesson packages', packsTitle: 'Pick your pace', packsLink: 'Full pricing & details',
    packsStart: 'Start', packsEach: '60 min each',
    doorsKicker: 'between lessons', doorsTitle: 'Keep practising in the city',
    proofLabel: 'What your route includes',
    proof: (n) => [
      { value: '1:1', label: 'live teacher' },
      { value: '60 min', label: 'every lesson' },
      { value: 'CEFR', label: 'matched course' },
      { value: String(n), label: 'instant games' },
    ],
    cityKicker: 'live lessons · practice between sessions',
    cityTitle: 'One learning plan. Connected practice.',
    cityBody: 'Your teacher sets the focus. Vocabulary from each lesson becomes flashcards and games in English Metropolis World, so you practise the same material between lessons.',
    cityFeatures: ['Live feedback from your teacher', 'Vocabulary from your own lessons', 'A 3D world for practice between lessons'],
    cityCta: 'Start my learning plan',
    cityLabel: 'Interactive 3D map of EnglishMetro',
    cityHint: 'Drag the city to explore',
    lessonsKicker: 'live 1:1 lessons',
    lessonsTitle: 'A teacher who knows your goals.',
    lessonsBody: 'Every lesson is live, individual and matched to your CEFR level. You speak, your teacher gives feedback, and your lesson vocabulary becomes practice material.',
    lessonsPoints: ['Real conversation from minute one', 'Notes and a PDF after every lesson', 'Flashcards from your lesson vocabulary'],
    lessonsCta: 'Meet your teacher',
    lessonsAltMain: 'A student smiling during a live online English lesson',
    lessonsAltSide: 'A student laughing while practising English on a phone',
    lessonsChipA: 'Live 1:1 · 60 min',
    lessonsChipB: 'CEFR-matched',
    stepsAlt: 'A group of English Metro students laughing and learning together',
    stepsChip: 'Live · your own teacher',
  },
  pl: {
    navPricing: 'Cennik', navSignin: 'Zaloguj się', navSignup: 'Załóż konto', navDash: 'Mój panel',
    navPlay: 'Zagraj w World',
    eyebrow: 'szkoła angielskiego online · lekcje 1:1 na żywo',
    h1a: 'Ucz się na żywo.', h1b: 'Mów po angielsku na co dzień',
    ctaBook: 'Zarezerwuj pierwszą lekcję', ctaPricing: 'Zobacz cennik', ctaWorld: 'Zagraj w World za darmo',
    heroSliderLabel: 'Co obejmuje kurs u nas',
    heroSliderPrev: 'Poprzedni slajd', heroSliderNext: 'Następny slajd',
    heroSlides: [
      { eyebrow: 'lekcje 1:1 na żywo', title: '60 minut, z własnym lektorem', cta: 'Zacznij naukę', cta2: 'Znajdź swój kurs', to2: '/pricing' },
      { eyebrow: 'Twój kurs CEFR', title: 'Kurs dopasowany do Twojego poziomu', cta: 'Zobacz cennik', cta2: 'Zarezerwuj lekcję', to2: '/signup' },
      { eyebrow: 'ćwiczenia między lekcjami', title: 'Ćwicz na głos, we własnym tempie', cta: 'Wypróbuj teraz', cta2: 'Zobacz cennik', to2: '/pricing' },
    ],
    chips: ['lekcje 1:1 na żywo, 60 min', 'kursy dopasowane do poziomu CEFR', 'słownictwo z lekcji trafia do fiszek', 'rezerwacja online w kilka minut'],
    arcadeBadge: 'krótkie ćwiczenia · wypróbuj teraz',
    officeAlt: 'Uczniowie śmiejący się razem w szkole English Metro',
    officeChip: 'Nasi uczniowie · jedna szkoła',
    arcadeKicker: 'krótkie ćwiczenia · bez logowania',
    arcadeTitle: 'Siedem sposobów na ćwiczenie. Wypróbuj je teraz.',
    arcadeBody: 'To te same gry, do których po każdej lekcji trafiają Twoje fiszki. Odkryj kartę, złap pociąg, ułóż zdanie. Bez zakładania konta.',
    catalogTitle: 'Szybkie ćwiczenia na czterech liniach',
    catalogHint: 'Wybierz linię, aby zobaczyć jej gry · każda gra startuje od razu',
    catalogBrowse: 'Przeglądaj pełny katalog według linii i stacji. W pierwszą grę zagrasz bez konta.',
    catalogGames: (n) => `${n} ${n === 1 ? 'gra' : n < 5 ? 'gry' : 'gier'}`,
    catalogLive: (a, b) => `${a} dostępne · ${b} w budowie`,
    districts3dSubtitle: 'Fluent City w 3D. Nowe dzielnice pojawiają się tu automatycznie z każdą aktualizacją.',
    doorsBody: (n) => `${n} krótkich gier na czterech liniach metra: słownictwo, gramatyka, słuchanie i mówienie. Ćwicz dwie minuty albo dwadzieścia.`,
    doorsGo: 'Polecana gra:',
    ctaTitle: 'Zapisuj postępy z darmowym kontem.',
    ctaBody: 'Darmowe konto zapisuje Twoje serie i postępy w słownictwie oraz włącza grę na pełnym ekranie w English Metropolis World i Szybkich ćwiczeniach.',
    ctaPlay: 'Graj za darmo',
    ctaBeta: 'Wypróbuj betę English Metropolis World',
    lineTags: { 'Arcade Line': 'Szybkie ręce, szybsze słowa', 'Word Line': 'Z liter w język', 'Quiz Line': 'Myśl szybko, odpowiadaj szybciej', 'City Line': 'Prawdziwe sytuacje, poziom ulicy' },
    worldLink: 'Poznaj całe miasto 3D za darmo',
    stepsKicker: 'od rejestracji do mówienia', stepsTitle: 'Twoja pierwsza lekcja w czterech krokach',
    steps: [
      { icon: 'person_add', title: 'Załóż konto', body: 'To około dwóch minut: podaj e-mail i hasło lub kontynuuj z Google.' },
      { icon: 'shopping_bag', title: 'Wybierz pakiet', body: 'Wybierz pojedynczą lekcję próbną lub pakiet do 24 lekcji. Zapłać online lub na podstawie faktury.' },
      { icon: 'event_available', title: 'Zarezerwuj terminy', body: 'Wybierz wolny termin w kalendarzu lektora. Link do Google Meet i zaproszenie do kalendarza otrzymasz e-mailem.' },
      { icon: 'school', title: 'Ucz się i powtarzaj', body: 'Po każdej lekcji w bibliotece pojawia się plik PDF, a słownictwo z lekcji trafia do fiszek do dalszych ćwiczeń.' },
    ],
    packsKicker: 'pakiety lekcji 1:1', packsTitle: 'Wybierz swoje tempo', packsLink: 'Pełny cennik i szczegóły',
    packsStart: 'Zaczynam', packsEach: 'po 60 min',
    doorsKicker: 'między lekcjami', doorsTitle: 'Ćwicz dalej w mieście',
    proofLabel: 'Co obejmuje Twoja ścieżka',
    proof: (n) => [
      { value: '1:1', label: 'lektor na żywo' },
      { value: '60 min', label: 'każda lekcja' },
      { value: 'CEFR', label: 'dopasowany kurs' },
      { value: String(n), label: 'gier bez przygotowań' },
    ],
    cityKicker: 'lekcje na żywo · ćwiczenia między zajęciami',
    cityTitle: 'Jeden plan nauki. Spójne ćwiczenia.',
    cityBody: 'Lektor wyznacza zakres materiału. Słownictwo z każdej lekcji trafia do fiszek i gier w English Metropolis World, dzięki czemu między zajęciami ćwiczysz ten sam materiał.',
    cityFeatures: ['Informacja zwrotna od lektora na żywo', 'Słownictwo z Twoich lekcji', 'Świat 3D do ćwiczeń między lekcjami'],
    cityCta: 'Rozpocznij plan nauki',
    cityLabel: 'Interaktywna mapa 3D EnglishMetro',
    cityHint: 'Przeciągnij miasto, aby je odkrywać',
    lessonsKicker: 'lekcje 1:1 na żywo',
    lessonsTitle: 'Lektor, który zna Twoje cele.',
    lessonsBody: 'Każda lekcja jest na żywo, indywidualna i dopasowana do poziomu CEFR. Ty mówisz, lektor daje informację zwrotną, a słownictwo z lekcji trafia do ćwiczeń.',
    lessonsPoints: ['Prawdziwa rozmowa od pierwszej minuty', 'Notatki i PDF po każdej lekcji', 'Fiszki ze słownictwa z Twoich lekcji'],
    lessonsCta: 'Poznaj swojego lektora',
    lessonsAltMain: 'Uśmiechnięta uczennica podczas lekcji angielskiego online na żywo',
    lessonsAltSide: 'Uczeń śmiejący się podczas ćwiczenia angielskiego na telefonie',
    lessonsChipA: 'Na żywo 1:1 · 60 min',
    lessonsChipB: 'Dopasowane do CEFR',
    stepsAlt: 'Grupa uczniów English Metro śmiejących się i uczących razem',
    stepsChip: 'Na żywo · Twój własny lektor',
  },
}

// Homepage-only interactive practice showcases. They mirror the core game
// mechanics without mounting full student shells or writing lesson progress.
const HERO_GAMES = [
  { key: 'flashcards', title: 'Flashcards', icon: 'style' },
  { key: 'multiplechoice', title: 'Quiz', icon: 'quiz' },
  { key: 'gapfill', title: 'Gap fill', icon: 'edit_note' },
  { key: 'truefalse', title: 'True / False', icon: 'balance' },
  { key: 'unjumble', title: 'Unjumble', icon: 'low_priority' },
  { key: 'matching', title: 'Matching', icon: 'join_inner' },
  { key: 'concentration', title: 'Memory', icon: 'grid_view' },
]

function HeroArcade({ badge, reduced, lang }) {
  const [active, setActive] = useState(0)
  const [shown, setShown] = useState(0)
  const [exiting, setExiting] = useState(false)
  const [backdropReady, setBackdropReady] = useState(false)
  const dirRef = useRef(1)
  const swapTimer = useRef(null)
  const activeGame = HERO_GAMES[active]
  const tabsRef = useRef(null)
  const arcadeRef = useRef(null)
  const switchTo = (next) => {
    if (next === active) return
    dirRef.current = next > active ? 1 : -1
    setActive(next)
    clearTimeout(swapTimer.current)
    if (reduced) { setShown(next); setExiting(false); return }
    setExiting(true)
    swapTimer.current = setTimeout(() => { setShown(next); setExiting(false) }, 120)
  }
  useEffect(() => () => clearTimeout(swapTimer.current), [])
  const go = (dir) => switchTo((active + dir + HERO_GAMES.length) % HERO_GAMES.length)
  const selectFromKeyboard = (next) => {
    switchTo(next)
    requestAnimationFrame(() => tabsRef.current?.querySelectorAll('[role="tab"]')[next]?.focus())
  }
  const onTabsKeyDown = (event) => {
    let next = active
    if (event.key === 'ArrowRight') next = (active + 1) % HERO_GAMES.length
    else if (event.key === 'ArrowLeft') next = (active - 1 + HERO_GAMES.length) % HERO_GAMES.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = HERO_GAMES.length - 1
    else return
    event.preventDefault()
    selectFromKeyboard(next)
  }
  useEffect(() => {
    const tabs = tabsRef.current
    const activeTab = tabs?.querySelector('.gh-arcade-tab.on')
    if (!tabs || !activeTab) return
    const tabsBox = tabs.getBoundingClientRect()
    const activeBox = activeTab.getBoundingClientRect()
    const activeLeft = activeBox.left - tabsBox.left + tabs.scrollLeft
    const left = activeLeft - (tabs.clientWidth - activeBox.width) / 2
    tabs.scrollTo({ left, behavior: reduced ? 'auto' : 'smooth' })
  }, [active, reduced])
  useEffect(() => {
    const arcade = arcadeRef.current
    if (!arcade) return undefined
    let inView = true
    const syncPlayback = () => {
      arcade.classList.toggle('is-paused', !inView || document.hidden)
    }
    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting
      if (inView) setBackdropReady(true)
      syncPlayback()
    }, { threshold: 0.08 })
    observer?.observe(arcade)
    document.addEventListener('visibilitychange', syncPlayback)
    return () => {
      observer?.disconnect()
      document.removeEventListener('visibilitychange', syncPlayback)
    }
  }, [])
  return (
    <div className="gh-hero-frame">
      <div className="gh-postcard" style={{ background: '#FCFAFF' }}>
        <div className="gh-arcade-toolbar">
          <div className="gh-arcade-live">
            <span className="gh-live-dot" aria-hidden/>
            <span className="gh-arcade-badge">
              {badge}
            </span>
          </div>
          <div className="gh-arcade-tabs-wrap">
            <div ref={tabsRef} className="gh-arcade-tabs" role="tablist" aria-label="Choose a live practice game"
              onKeyDown={onTabsKeyDown}>
              {HERO_GAMES.map((g, i) => (
                <button key={g.key} type="button" onClick={() => switchTo(i)}
                  id={`gh-arcade-tab-${g.key}`} role="tab" tabIndex={i === active ? 0 : -1}
                  aria-selected={i === active} aria-controls="gh-arcade-stage"
                  className={`gh-arcade-tab${i === active ? ' on' : ''}`}>
                  <span className="material-symbols-outlined" style={{ fontSize: 15 }}>{g.icon}</span>
                  {g.title}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div ref={arcadeRef} className="gh-arcade-viewport">
          <div id="gh-arcade-stage" role="tabpanel" aria-labelledby={`gh-arcade-tab-${activeGame.key}`}
            data-game={HERO_GAMES[shown].key} className="gh-arcade-stage"
            style={{ minHeight: 520, overflow: 'hidden' }}>
            {backdropReady && (
              <Suspense fallback={null}>
                <ArcadeCityBackdrop reduced={reduced}/>
              </Suspense>
            )}
            <div key={HERO_GAMES[shown].key} data-dir={dirRef.current}
              className={`gh-arcade-body${exiting ? ' is-exiting' : ''}`}>
              <HeroPracticePreview game={HERO_GAMES[shown].key} lang={lang}/>
            </div>
          </div>
          <button type="button" className="gh-slider-arrow gh-slider-prev" aria-label="Previous exercise"
            onClick={() => go(-1)}>
            <span className="material-symbols-outlined" style={{ fontSize: 26 }}>chevron_left</span>
          </button>
          <button type="button" className="gh-slider-arrow gh-slider-next" aria-label="Next exercise"
            onClick={() => go(1)}>
            <span className="material-symbols-outlined" style={{ fontSize: 26 }}>chevron_right</span>
          </button>
          <div className="gh-slider-label" aria-live="polite">
            {active + 1} {lang === 'pl' ? 'z' : 'of'} {HERO_GAMES.length} · {activeGame.title}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── The catalog — every playable 2D shell, as a metro "line" map ───────────
// Venue names follow src/practice/lib/shell-selector.ts. `load` mirrors the
// Shells map in StudentPractice so vite's manualChunks reuses the SAME
// one-chunk-per-shell outputs (no duplicate chunks).
const LINES = [
  {
    line: 'Arcade Line',
    color: '#D946EF',
    icon: 'sports_esports',
    tag: 'Fast hands, faster words',
    games: [
      { key: 'snake',        title: 'Snake',          venue: 'The Park Path',      blurb: 'Steer. Snack on the right words.', load: () => import('../../practice/shells/Snake') },
      { key: 'mazechase',    title: 'Maze Chase',     venue: 'The Backstreets',    blurb: 'Outrun the streets, grab the answers.', load: () => import('../../practice/shells/MazeChase') },
      { key: 'balloonpop',   title: 'Balloon Pop',    venue: 'The Rooftop Garden', blurb: 'Pop only the words that fit.', load: () => import('../../practice/shells/BalloonPop') },
      { key: 'whackamole',   title: 'Whack-a-Mole',   venue: 'The Subway Mole',    blurb: 'Fast paws, faster vocabulary.', load: () => import('../../practice/shells/WhackAMole') },
      { key: 'airplane',     title: 'Airplane',       venue: 'The Aerodrome',      blurb: 'Fly through the clouds that read right.', load: () => import('../../practice/shells/Airplane') },
      { key: 'battleship',   title: 'Battleship',     venue: 'The Harbour Grid',   blurb: 'Call the grid. Sink the wrong answers.', load: () => import('../../practice/shells/Battleship') },
      { key: 'spinthewheel', title: 'Spin the Wheel', venue: 'The Carnival Wheel', blurb: 'Round and round the questions go.', load: () => import('../../practice/shells/SpinTheWheel') },
      { key: 'openthebox',   title: 'Open the Box',   venue: 'The Vault Room',     blurb: 'Crack the vault, one answer at a time.', load: () => import('../../practice/shells/OpenTheBox') },
      { key: 'flyingfruit',  title: 'Flying Fruit',   venue: 'The Orchard Square', blurb: 'Catch the catch of the day.', load: () => import('../../practice/shells/FlyingFruit') },
    ],
  },
  {
    line: 'Word Line',
    color: '#8B5CF6',
    icon: 'match_word',
    tag: 'Letters into language',
    games: [
      { key: 'hangman',       title: 'Hangman',        venue: 'Lantern Alley',       blurb: 'Keep the lanterns lit.', load: () => import('../../practice/shells/Hangman') },
      { key: 'crossword',     title: 'Crossword',      venue: 'The Print Shop',      blurb: 'Across, down, fluent.', load: () => import('../../practice/shells/Crossword') },
      { key: 'wordsearch',    title: 'Word Search',    venue: 'The Letterpress',     blurb: 'Hidden words, sharp eyes.', load: () => import('../../practice/shells/Wordsearch') },
      { key: 'anagram',       title: 'Anagram',        venue: 'The Scrabble Café',   blurb: 'Shuffle letters into sense.', load: () => import('../../practice/shells/Anagram') },
      { key: 'spellingbee',   title: 'Spelling Bee',   venue: 'The Concert Hall',    blurb: 'Hear it. Spell it. Own it.', load: () => import('../../practice/shells/SpellingBee') },
      { key: 'typingtest',    title: 'Typing Test',    venue: 'The Telegraph Office', blurb: 'Words per minute, minted.', load: () => import('../../practice/shells/TypingTest') },
      { key: 'wordformation', title: 'Word Formation', venue: "The Mason's Yard",    blurb: 'Build big words from small ones.', load: () => import('../../practice/shells/WordFormation') },
      { key: 'unjumble',      title: 'Unjumble',       venue: 'The Puzzle Workshop', blurb: 'Untangle the sentence.', load: () => import('../../practice/shells/Unjumble') },
    ],
  },
  {
    line: 'Quiz Line',
    color: '#F472B6',
    icon: 'quiz',
    tag: 'Think quick, answer quicker',
    games: [
      { key: 'multiplechoice', title: 'Multiple Choice', venue: 'The Bulletin Board', blurb: 'Four doors. One right answer.', load: () => import('../../practice/shells/MultipleChoice') },
      { key: 'quizshow',       title: 'Quiz Show',       venue: 'The Auditorium',     blurb: 'Lights, camera, vocabulary.', load: () => import('../../practice/shells/QuizShow') },
      { key: 'truefalse',      title: 'True or False',   venue: 'The Courtroom',      blurb: 'Judge every sentence.', load: () => import('../../practice/shells/TrueFalse') },
      { key: 'picturequiz',    title: 'Picture Quiz',    venue: 'The Photography Salon', blurb: 'Name what you see.', load: () => import('../../practice/shells/PictureQuiz') },
      { key: 'concentration',  title: 'Concentration',   venue: 'The Memory Cellar',  blurb: 'Match the pairs. Mind the gaps.', load: () => import('../../practice/shells/Concentration') },
      { key: 'findthematch',   title: 'Find the Match',  venue: 'The Lost & Found',   blurb: 'Everything here has a twin.', load: () => import('../../practice/shells/FindTheMatch') },
      { key: 'randomcards',    title: 'Random Cards',    venue: "The Dealer's Table", blurb: 'Play the hand you’re dealt.', load: () => import('../../practice/shells/RandomCards') },
      { key: 'randomwheel',    title: 'Random Wheel',    venue: 'The Spinner Stand',  blurb: 'Let chance pick the question.', load: () => import('../../practice/shells/RandomWheel') },
    ],
  },
  {
    line: 'City Line',
    color: '#34D399',
    icon: 'location_city',
    tag: 'Real skills, street level',
    games: [
      { key: 'flashcards',         title: 'Flashcards',          venue: 'The Reading Room',     blurb: 'Flip. Learn. Repeat.', load: () => import('../../practice/shells/Flashcards') },
      { key: 'matching',           title: 'Matching',            venue: 'The String Board',     blurb: 'Connect the dots between words.', load: () => import('../../practice/shells/Matching') },
      { key: 'gapfill',            title: 'Gap Fill',            venue: 'The Postcard Desk',    blurb: 'Every sentence is missing you.', load: () => import('../../practice/shells/GapFill') },
      { key: 'dragdrop',           title: 'Drag & Drop',         venue: 'The Sorting Office',   blurb: 'Everything in its right place.', load: () => import('../../practice/shells/DragDrop') },
      { key: 'groupsort',          title: 'Group Sort',          venue: 'The Left-Luggage Room', blurb: 'Sort the city into boxes.', load: () => import('../../practice/shells/GroupSort') },
      { key: 'readingcomp',        title: 'Reading',             venue: 'The Reading Room',     blurb: 'Read between the lines.', load: () => import('../../practice/shells/ReadingComp') },
      { key: 'listeningcomp',      title: 'Listening',           venue: 'The Listening Booth',  blurb: 'The city speaks. Catch it.', load: () => import('../../practice/shells/ListeningComp') },
      { key: 'opencloze',          title: 'Open Cloze',          venue: 'The Vellum Atelier',   blurb: 'No options. Just instinct.', load: () => import('../../practice/shells/OpenCloze') },
      { key: 'sentencetransform',  title: 'Transformations',     venue: "The Translator's Booth", blurb: 'Same meaning, new words.', load: () => import('../../practice/shells/SentenceTransform') },
      { key: 'sentencecorrection', title: 'Corrections',         venue: "The Editor's Office",  blurb: 'Spot the error. Fix the line.', load: () => import('../../practice/shells/SentenceCorrection') },
      { key: 'rankorder',          title: 'Rank Order',          venue: 'The Election Hall',    blurb: 'Put the city in order.', load: () => import('../../practice/shells/RankOrder') },
      { key: 'labelleddiagram',    title: 'Labelled Diagram',    venue: 'The Atrium Schematic', blurb: 'Pin the right name on the map.', load: () => import('../../practice/shells/LabelledDiagram') },
      { key: 'speakingcards',      title: 'Speaking Cards',      venue: 'The Speakeasy',        blurb: 'Say it like you mean it.', load: () => import('../../practice/shells/SpeakingCards') },
    ],
  },
]

// Wave-1 3D games (Fluent City arcade) — shown as "arriving soon" until their
// entry lands in game3dRegistry, then they flip to playable automatically.
const ARRIVING = [
  { key: 'snake',        title: 'Metro Snake',            district: 'The Underground' },
  { key: 'mazechase',    title: 'Museum After Dark',      district: 'The Museum Mile' },
  { key: 'balloonpop',   title: 'Thames Balloon Festival', district: 'The Riverside' },
  { key: 'whackamole',   title: 'Camden Pop-Up Pigeons',  district: 'Camden Market' },
  { key: 'airplane',     title: 'Paper Plane Post',       district: 'The Rooftops' },
  { key: 'battleship',   title: 'Bathtub Fleet',          district: 'The Serpentine' },
  { key: 'spinthewheel', title: 'Pier Carnival Wheel',    district: 'The Pier' },
  { key: 'openthebox',   title: 'The Vault Job',          district: 'The Old Bank' },
]

const ALL_GAMES = LINES.flatMap((l) => l.games.map((g) => ({ ...g, line: l.line, color: l.color })))

// Daily quick-pick candidates: arcade-feel shells that demo brilliantly cold.
const FEATURED_KEYS = ['balloonpop', 'snake', 'whackamole', 'spinthewheel', 'openthebox', 'mazechase', 'quizshow', 'battleship']
const TODAY_NUMBER = Math.floor(new Date().setHours(0, 0, 0, 0) / 86400000)
const DAILY_PICK_KEY = FEATURED_KEYS[TODAY_NUMBER % FEATURED_KEYS.length]
const CURRENT_YEAR = new Date().getFullYear()

// The world game lives OUTSIDE the SPA as static files (own loader, own
// three.js build) — a plain anchor, not a router Link.
const WORLD_URL = '/play/'

// The four hero pillars. Copy comes from the language dictionary; each pillar
// keeps a fixed destination and draws its photograph from a pool, one picked
// per page load, so returning visitors don't meet the same image every time.
// The two product pillars use real captures of the running app — we don't
// generate imagery of our own software.
const HERO_MEDIA = [
  { key: 'lessons',  to: '/signup',            images: [
    '/home/hero/lessons-1.webp', '/home/hero/lessons-12.webp', '/home/hero/lessons-3.webp',
    '/home/hero/lessons-4.webp', '/home/hero/lessons-6.webp',
    '/home/hero/lessons-8.webp', '/home/hero/lessons-9.webp', '/home/hero/lessons-10.webp',
    '/home/hero/lessons-13.webp', '/home/hero/lessons-14.webp',
  ] },
  { key: 'course',   to: '/pricing',           images: [
    '/home/hero/course-1.webp', '/home/hero/course-2.webp', '/home/hero/course-3.webp',
  ] },
  { key: 'practice', href: '#gh-arcade-stage', images: ['/home/hero/practice-4.webp'] },
]

// Games are art-directed for dusk; the play overlay keeps the night palette
// in both site themes.
const DUSK = {
  bg: 'rgba(5, 3, 9, 0.96)',
  text: '#F5F0FA',
  dim: 'rgba(228, 218, 244, 0.62)',
  mute: 'rgba(228, 218, 244, 0.38)',
  line: 'rgba(255,255,255,0.09)',
  pink: '#D946EF',
  amber: '#FFB347',
  emerald: '#34D399',
}

// ── Atmosphere ─────────────────────────────────────────────────────────────
function StarField({ count = 60 }) {
  const stars = useMemo(() =>
    Array.from({ length: count }, (_, i) => ({
      left: ((i * 73) % 100), top: ((i * 37) % 58),
      size: 1 + ((i * 13) % 10) / 7, delay: (i % 9) * 0.45,
    })), [count])
  return (
    <div aria-hidden style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      {stars.map((s, i) => (
        <span key={i} className="gh-star" style={{ position: 'absolute', left: `${s.left}%`, top: `${s.top}%`,
          width: s.size, height: s.size, borderRadius: '50%', background: '#FBCFE8',
          animationDelay: `${s.delay}s` }}/>
      ))}
    </div>
  )
}

function DayClouds() {
  const clouds = useMemo(() => [
    { top: '6%', w: 340, dur: 90, delay: 0, o: 0.5 },
    { top: '16%', w: 220, dur: 120, delay: -40, o: 0.35 },
    { top: '3%', w: 180, dur: 105, delay: -70, o: 0.4 },
    { top: '24%', w: 280, dur: 140, delay: -20, o: 0.28 },
  ], [])
  return (
    <div aria-hidden style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      {clouds.map((c, i) => (
        <span key={i} className="gh-cloud" style={{ top: c.top, width: c.w, height: c.w * 0.28,
          opacity: c.o, animationDuration: `${c.dur}s`, animationDelay: `${c.delay}s` }}/>
      ))}
    </div>
  )
}


// ── Error boundary around lazy-loaded shells ───────────────────────────────
class ShellBoundary extends Component {
  constructor(props) { super(props); this.state = { broken: false } }
  static getDerivedStateFromError() { return { broken: true } }
  componentDidCatch(err) { console.error('[GameHome shell crashed]', err) }
  render() {
    if (this.state.broken) {
      return (
        <div style={{ padding: 48, textAlign: 'center', color: DUSK.dim, fontFamily: FONT.body }}>
          <div style={{ fontSize: 34, marginBottom: 12 }}>🛠️</div>
          This station is under maintenance — pick another game.
        </div>
      )
    }
    return this.props.children
  }
}

// ── Full-screen play overlay (kept from v1 — games are dusk-native) ────────
function PlayOverlay({ game, onClose }) {
  const [LazyShell] = useState(() => lazy(game.is3d ? game.load3d : game.load))
  const [doneOnce, setDoneOnce] = useState(false)
  const [showCta, setShowCta] = useState(false)
  const dialogRef = useRef(null)
  const closeButtonRef = useRef(null)
  const previousFocusRef = useRef(null)
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return undefined
    previousFocusRef.current = document.activeElement
    const previousOverflow = document.body.style.overflow
    const siblingState = [...dialog.parentElement.children]
      .filter((element) => element !== dialog)
      .map((element) => ({ element, inert: element.inert, ariaHidden: element.getAttribute('aria-hidden') }))
    siblingState.forEach(({ element }) => {
      element.inert = true
      element.setAttribute('aria-hidden', 'true')
    })

    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = [...dialog.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )].filter((element) => element.getClientRects().length > 0)
      if (!focusable.length) {
        event.preventDefault()
        dialog.focus()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    const focusFrame = requestAnimationFrame(() => closeButtonRef.current?.focus())
    return () => {
      cancelAnimationFrame(focusFrame)
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
      siblingState.forEach(({ element, inert, ariaHidden }) => {
        element.inert = inert
        if (ariaHidden === null) element.removeAttribute('aria-hidden'); else element.setAttribute('aria-hidden', ariaHidden)
      })
      if (previousFocusRef.current?.isConnected) previousFocusRef.current.focus()
    }
  }, [onClose])

  return (
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={`Playing ${game.title}`}
      tabIndex={-1} className="gh-play-overlay"
      style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', flexDirection: 'column',
        background: DUSK.bg, backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 20px', borderBottom: `1px solid ${DUSK.line}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: game.color || DUSK.pink, flex: 'none' }}/>
          <div style={{ fontFamily: FONT.display, fontWeight: 700, color: DUSK.text, fontSize: 16,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {game.title}
            <span style={{ color: DUSK.mute, fontWeight: 400, fontSize: 12, marginLeft: 10 }}>{game.venue || game.district}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button type="button" onClick={() => setShowCta(true)}
            aria-label="Fullscreen (free account)"
            style={{ background: 'transparent', border: `1px solid ${DUSK.line}`, color: DUSK.dim,
              borderRadius: 8, padding: '7px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>fullscreen</span>
          </button>
          <button ref={closeButtonRef} type="button" onClick={onClose} aria-label="Close game"
            style={{ background: 'transparent', border: `1px solid ${DUSK.line}`, color: DUSK.dim,
              borderRadius: 8, padding: '7px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
        <ShellBoundary>
          <Suspense fallback={
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%',
              color: DUSK.dim, fontFamily: FONT.mono, fontSize: 13, letterSpacing: '0.2em' }}>
              NEXT TRAIN APPROACHING…
            </div>
          }>
            <LazyShell onSessionComplete={() => { if (!doneOnce) { setDoneOnce(true); setShowCta(true) } }}/>
          </Suspense>
        </ShellBoundary>

        {showCta && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
            justifyContent: 'center', background: 'rgba(5,3,9,0.82)', backdropFilter: 'blur(6px)', padding: 24 }}>
            <div className="gh-rise gh-overlay-card" style={{ maxWidth: 440, width: '100%', textAlign: 'center',
              background: 'linear-gradient(180deg, rgba(30,20,60,0.92) 0%, rgba(15,10,35,0.92) 100%)',
              border: '1px solid rgba(217,70,239,0.35)', borderRadius: 20, padding: '36px 32px',
              boxShadow: '0 30px 80px -20px rgba(0,0,0,0.7), 0 0 60px -20px rgba(217,70,239,0.3)' }}>
              <img src="/bajla.png" alt="" width="72" height="72" style={{ objectFit: 'contain', marginBottom: 10 }}/>
              <div style={{ fontFamily: FONT.display, fontWeight: 700, fontSize: 24, color: DUSK.text, marginBottom: 10 }}>
                {doneOnce ? 'Round complete.' : 'Go full screen?'}
              </div>
              <p style={{ color: DUSK.dim, fontSize: 14, lineHeight: 1.6, margin: '0 0 22px' }}>
                {doneOnce
                  ? 'Create a free account to save your progress, build a streak, and unlock every district of the city.'
                  : 'Full-screen play comes with a free account, along with saved progress and streaks.'}
              </p>
              <ActionLink to="/signup" variant="primary" size="lg" full trailingIcon="arrow_forward">
                Create free account
              </ActionLink>
              <button type="button" onClick={() => setShowCta(false)}
                style={{ marginTop: 14, background: 'transparent', border: 'none', color: DUSK.mute,
                  fontSize: 12, cursor: 'pointer', letterSpacing: '0.06em' }}>
                Keep playing
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Small parts ────────────────────────────────────────────────────────────
function ThemeToggle({ mode, setMode, T }) {
  const isDay = mode === 'day'
  return (
    <button type="button" className="gh-theme-btn"
      aria-label={isDay ? 'Switch to night mode' : 'Switch to day mode'}
      onClick={() => setMode(isDay ? 'night' : 'day')}
      style={{ border: `1px solid ${T.border}`, background: T.surface, color: isDay ? T.amber : T.brandInk }}>
      <span className="material-symbols-outlined" style={{ fontSize: 19 }}>
        {isDay ? 'dark_mode' : 'light_mode'}
      </span>
    </button>
  )
}

function GameCard({ g, color, T, onPlay, index, soon }) {
  return (
    <button type="button" className="gh-card gh-glass" disabled={soon}
      onClick={soon ? undefined : () => onPlay(g)}
      aria-label={soon ? `${g.title} — arriving soon` : `Play ${g.title}`}
      style={{ textAlign: 'left', cursor: soon ? 'default' : 'pointer', borderRadius: 16,
        border: `1px solid ${T.border}`, padding: '18px 18px 16px',
        color: T.text, fontFamily: FONT.body, opacity: soon ? 0.55 : 1,
        animationDelay: `${Math.min(index * 45, 450)}ms`, '--gh-card-glow': `${color}44` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <span aria-hidden style={{ width: 14, height: 14, borderRadius: '50%',
          border: `3px solid ${color}`, background: 'transparent', flex: 'none' }}/>
        <span style={{ fontFamily: FONT.display, fontWeight: 700, fontSize: 16 }}>{g.title}</span>
      </div>
      <div style={{ fontSize: 11, color: T.textMute, letterSpacing: '0.06em', marginBottom: 8 }}>
        {g.venue || g.district}
      </div>
      <div style={{ fontSize: 12.5, color: T.textDim, lineHeight: 1.5, minHeight: 36 }}>
        {g.blurb || (soon ? 'A new 3D district under construction.' : 'A Fluent City 3D district.')}
      </div>
      <div className="gh-card-play" style={{ marginTop: 12, display: 'inline-flex', alignItems: 'center',
        gap: 6, fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase',
        color: soon ? T.textMute : color }}>
        {soon ? 'Arriving soon' : 'Play'}
        {!soon && <span className="material-symbols-outlined" style={{ fontSize: 14 }}>arrow_forward</span>}
      </div>
    </button>
  )
}

// One expandable metro line of the practice catalog.
function LineSection({ line, T, open, onToggle, count, subtitle, children }) {
  return (
    <div className="gh-acc gh-glass" data-open={open}
      style={{ border: `1px solid ${open ? T.borderHi : T.border}`, borderRadius: 20,
        boxShadow: open ? T.shadowSm : 'none' }}>
      <button type="button" className="gh-acc-head" onClick={onToggle} aria-expanded={open}
        style={{ color: T.text }}>
        <span className="gh-acc-badge" style={{ background: line.color }} aria-hidden>
          <span className="material-symbols-outlined" style={{ fontSize: 19, color: '#fff' }}>{line.icon}</span>
        </span>
        <span style={{ minWidth: 0, flex: 1, textAlign: 'left' }}>
          <span style={{ display: 'block', fontFamily: FONT.display, fontWeight: 700, fontSize: 18 }}>
            {line.line}
            <span style={{ marginLeft: 10, fontSize: 11, fontWeight: 600, letterSpacing: '0.14em',
              color: T.textMute }}>{count}</span>
          </span>
          <span style={{ display: 'block', fontSize: 12.5, color: T.textDim, marginTop: 2,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {subtitle}
          </span>
        </span>
        <span className="material-symbols-outlined gh-acc-chev" aria-hidden
          style={{ color: T.textDim, fontSize: 24 }}>expand_more</span>
      </button>
      <div className="gh-acc-body">
        <div className="gh-acc-inner">
          <div className="gh-game-grid" style={{ display: 'grid', gap: 14, padding: '4px 18px 20px' }}>
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function GameHome() {
  const { lang, setLang } = useI18n()
  const W = GH[lang === 'pl' ? 'pl' : 'en']
  // Signed-in students see "My dashboard" instead of another Sign in.
  const studentSession = (() => {
    try { return JSON.parse(window.localStorage.getItem('em-student-session') || 'null') } catch { return null }
  })()
  const { T, mode, setMode } = useV3Theme()
  const night = mode !== 'day'
  const reduced = usePrefersReducedMotion()
  const [playing, setPlaying] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [openLines, setOpenLines] = useState(() => new Set([LINES[0].line]))
  const practiceRef = useRef(null)
  // Same cart as /lessons and /checkout — a pack "rings up" here too.
  const [packAdded, setPackAdded] = useState(null)
  const packTimer = useRef(null)
  const addPackToCart = (p) => {
    cart.add({ id: p.id, name: p.name, pace: p.pace,
      pacePl: p.pacePl || p.pace, pricePLN: parsePricePLN(p.price) })
    setPackAdded(p.id)
    window.clearTimeout(packTimer.current)
    packTimer.current = window.setTimeout(() => setPackAdded(null), 1400)
  }

  const quickPick = ALL_GAMES.find((g) => g.key === DAILY_PICK_KEY) || ALL_GAMES[0]

  const playable3d = useMemo(() =>
    game3dRegistry.filter((e) => !e.shellKey.startsWith('world-'))
      .map((e) => ({ ...e, is3d: true, load3d: e.load, color: DUSK.amber })), [])
  const arrivingSoon = useMemo(() => {
    const live = new Set(game3dRegistry.map((e) => e.shellKey))
    return ARRIVING.filter((a) => !live.has(a.key))
  }, [])

  const tickerNames = useMemo(() => {
    const names = ['English Metropolis World · OPEN BETA', ...playable3d.map((e) => `${e.title} · 3D`),
      ...ALL_GAMES.map((g) => g.title)]
    return [...names, ...names] // doubled for a seamless -50% loop
  }, [playable3d])

  const toggleLine = (name) => setOpenLines((prev) => {
    const next = new Set(prev)
    if (next.has(name)) next.delete(name); else next.add(name)
    return next
  })
  const scrollToPractice = () => practiceRef.current?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' })

  useEffect(() => {
    if (!menuOpen) return undefined
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [menuOpen])

  return (
    <div className={`gh-root gh-${night ? 'night' : 'day'}${reduced ? ' gh-still' : ''}`}
      data-theme={night ? 'night' : 'day'} style={{ position: 'relative', minHeight: '100dvh',
      background: T.pageBg, color: T.text, fontFamily: FONT.body, overflowX: 'clip',
      transition: 'background 500ms ease, color 500ms ease',
      '--gh-text': T.text, '--gh-text-soft': T.textSoft, '--gh-text-dim': T.textDim,
      '--gh-border': T.border, '--gh-border-hi': T.borderHi, '--gh-surface': T.surface }}>
      {/* Atmosphere */}
      <div className="gh-aurora" aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none',
        background: night ? G.aurora : G.auroraDay, transition: 'opacity 500ms ease' }}/>
      {night ? <StarField/> : <DayClouds/>}
      <div className="gh-motion-field" aria-hidden>
        <span className="gh-motion-orb gh-motion-orb--one"/>
        <span className="gh-motion-orb gh-motion-orb--two"/>
        <span className="gh-motion-line gh-motion-line--one"/>
        <span className="gh-motion-line gh-motion-line--two"/>
      </div>

      <div className="gh-shell" style={{ position: 'relative', zIndex: 2, maxWidth: 1840, margin: '0 auto', padding: '0 24px' }}>
        {/* ── Header ── */}
        <header className="gh-header gh-glass gh-rise">
          <Link to="/" className="gh-brand" aria-label="English Metro home">
            <Skyline size={30}/>
            <div style={{ fontFamily: FONT.display, fontWeight: 700, fontSize: 19, letterSpacing: '-0.02em' }}>
              English <span style={{ background: G.brand, WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Metro</span>
              <span style={{ color: T.ember }}>.</span>
            </div>
          </Link>
          <button type="button" className="gh-menu-toggle" aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen} aria-controls="gh-primary-nav" onClick={() => setMenuOpen((open) => !open)}>
            <span className="material-symbols-outlined" aria-hidden>{menuOpen ? 'close' : 'menu'}</span>
          </button>
          <nav id="gh-primary-nav" className={`gh-nav${menuOpen ? ' is-open' : ''}`} aria-label="Primary navigation">
            <ActionLink to="/pricing" onClick={() => setMenuOpen(false)}>{W.navPricing}</ActionLink>
            {studentSession?.slug ? (
              <ActionLink to={`/app/${studentSession.slug}/dashboard`} icon="account_circle"
                onClick={() => setMenuOpen(false)}>{W.navDash}</ActionLink>
            ) : (
              <>
                <ActionLink to="/login" onClick={() => setMenuOpen(false)}>{W.navSignin}</ActionLink>
                <ActionLink to="/signup" variant="secondary" onClick={() => setMenuOpen(false)}>{W.navSignup}</ActionLink>
              </>
            )}
            <div className="gh-lang" role="group" aria-label="Language">
              {['pl', 'en'].map(l => (
                <button key={l} type="button" onClick={() => setLang(l)}
                  aria-pressed={lang === l}
                  className={`gh-lang-btn${lang === l ? ' on' : ''}`}>{l.toUpperCase()}</button>
              ))}
            </div>
            <ThemeToggle mode={mode} setMode={setMode} T={T}/>
            <ActionLink href={WORLD_URL} variant="primary" trailingIcon="play_arrow"
              onClick={() => setMenuOpen(false)} style={{ whiteSpace: 'nowrap' }}>{W.navPlay}</ActionLink>
          </nav>
        </header>

        {/* ── Hero: live lessons first, the city as your practice ground ── */}
        <section className="gh-hero-grid" style={{ display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.02fr) minmax(0, 0.98fr)',
          gap: 52, alignItems: 'center', padding: '46px 0 64px' }}>
          <div className="gh-hero-copy" style={{ minWidth: 0 }}>
            <div className="gh-rise gh-rise-1 gh-eyebrow" style={{ display: 'inline-flex', alignItems: 'center', gap: 10,
              marginBottom: 20 }}>
              <span className="gh-eyebrow-mark" aria-hidden/>
              <span style={{ fontFamily: FONT.mono, fontSize: 11, fontWeight: 700, letterSpacing: '0.3em',
                textTransform: 'uppercase', color: T.emerald }}>
                {W.eyebrow}
              </span>
            </div>
            <h1 className="gh-rise gh-rise-2" style={{ fontFamily: FONT.display, fontWeight: 700,
              fontSize: 'clamp(42px, 6.4vw, 82px)', lineHeight: 0.98, letterSpacing: '-0.04em', margin: 0 }}>
              {W.h1a}
              <br/>
              <span className="gh-gradient-word" style={{ background: G.brand, WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>{W.h1b}</span>
              <span style={{ color: T.ember }}>.</span>
            </h1>
            {/* The four pillars that used to sit here as a checklist are now the
                four slides beside it, each with its own destination. Repeating
                them in text made the hero say everything twice. */}
            <div className="gh-rise gh-rise-4" style={{ marginTop: 30, display: 'flex', gap: 14,
              flexWrap: 'wrap', alignItems: 'center' }}>
              <ActionLink to="/signup" variant="primary" size="lg" trailingIcon="arrow_forward"
                style={{ fontSize: 15, padding: '18px 32px' }}>{W.ctaBook}</ActionLink>
              <ActionLink to="/pricing" variant="secondary" size="lg" trailingIcon="sell">
                {W.ctaPricing}
              </ActionLink>
              <a href={WORLD_URL} className="gh-text-link"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: T.violet,
                  fontSize: 13.5, fontWeight: 700, letterSpacing: '0.03em', textDecoration: 'none' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 17 }}>play_circle</span>
                {W.ctaWorld}
              </a>
            </div>

          </div>

          <div className="gh-rise gh-rise-3 gh-hero-stage-wrap" style={{ minWidth: 0 }}>
            <HeroSlider
              label={W.heroSliderLabel}
              prevLabel={W.heroSliderPrev}
              nextLabel={W.heroSliderNext}
              slides={HERO_MEDIA.map((media, i) => ({
                ...media, ...W.heroSlides[i], alt: W.heroSlides[i].title,
              }))}
            />
          </div>
        </section>

        {/* ── Credible proof points, then the teacher-to-city learning loop ── */}
        <section className="gh-proof-rail gh-glass" aria-label={W.proofLabel}>
          {W.proof(ALL_GAMES.length).map((item, index) => (
            <div className="gh-proof-item" key={item.label} style={{ '--gh-proof-delay': `${index * 80}ms` }}>
              <strong>{item.value}</strong>
              <span>{item.label}</span>
            </div>
          ))}
        </section>

        {/* ── Real lessons, real people — photography band ── */}
        <section className="gh-section gh-lessons-band">
          <Reveal className="gh-lessons-media">
            <div className="gh-photo-frame gh-photo-frame--main">
              <img src="/home/photo-student.webp" alt={W.lessonsAltMain} loading="lazy" width="1600" height="1067"/>
              <span className="gh-float-chip gh-float-chip--a">
                <span className="material-symbols-outlined" aria-hidden>videocam</span>
                {W.lessonsChipA}
              </span>
              <span className="gh-float-chip gh-float-chip--b">
                <span className="material-symbols-outlined" aria-hidden>track_changes</span>
                {W.lessonsChipB}
              </span>
            </div>
            <div className="gh-photo-frame gh-photo-frame--side">
              <img src="/home/photo-practice-2607.webp" alt={W.lessonsAltSide} loading="lazy" width="800" height="533"/>
            </div>
          </Reveal>
          <Reveal className="gh-lessons-copy" delay={90}>
            <div style={{ fontFamily: FONT.mono, fontSize: 11, fontWeight: 700, letterSpacing: '0.3em',
              textTransform: 'uppercase', color: T.fuchsia, marginBottom: 12 }}>{W.lessonsKicker}</div>
            <h2 style={{ fontFamily: FONT.display, fontWeight: 700, fontSize: 'clamp(30px, 4.2vw, 52px)',
              lineHeight: 1.04, letterSpacing: '-0.035em', margin: '0 0 18px' }}>{W.lessonsTitle}</h2>
            <p style={{ color: T.textDim, fontSize: 'clamp(14px, 1.35vw, 17px)', lineHeight: 1.7,
              maxWidth: 520, margin: '0 0 22px' }}>{W.lessonsBody}</p>
            <ul className="gh-lessons-points">
              {W.lessonsPoints.map((point) => (
                <li key={point}>
                  <span className="material-symbols-outlined" aria-hidden>check_circle</span>
                  {point}
                </li>
              ))}
            </ul>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 26 }}>
              <ActionLink to="/signup" variant="primary" size="lg" trailingIcon="arrow_forward">
                {W.lessonsCta}
              </ActionLink>
              <ActionLink to="/pricing" variant="secondary" size="lg" trailingIcon="sell">
                {W.ctaPricing}
              </ActionLink>
            </div>
          </Reveal>
        </section>

        <section className="gh-city-loop gh-section">
          <Reveal className="gh-city-copy">
            <div style={{ fontFamily: FONT.mono, fontSize: 11, fontWeight: 700, letterSpacing: '0.3em',
              textTransform: 'uppercase', color: T.emerald, marginBottom: 12 }}>{W.cityKicker}</div>
            <h2 style={{ fontFamily: FONT.display, fontWeight: 700, fontSize: 'clamp(32px, 4.7vw, 58px)',
              lineHeight: 1.02, letterSpacing: '-0.04em', margin: '0 0 20px' }}>{W.cityTitle}</h2>
            <p style={{ color: T.textDim, fontSize: 'clamp(14px, 1.35vw, 17px)', lineHeight: 1.7,
              maxWidth: 560, margin: '0 0 24px' }}>{W.cityBody}</p>
            <div className="gh-city-features">
              {W.cityFeatures.map((feature, index) => (
                <div className="gh-city-feature gh-glass" key={feature}>
                  <span className="material-symbols-outlined gh-city-feature-icon" aria-hidden>
                    {['forum', 'style', 'view_in_ar'][index]}
                  </span>
                  <span>{feature}</span>
                </div>
              ))}
            </div>
            <div className="gh-city-actions">
              <ActionLink to="/signup" variant="primary" size="lg" trailingIcon="arrow_forward">
                {W.cityCta}
              </ActionLink>
              <ActionLink href={WORLD_URL} variant="secondary" size="lg" trailingIcon="view_in_ar">
                {W.navPlay}
              </ActionLink>
            </div>
          </Reveal>

          <Reveal className="gh-three-reveal" delay={100}>
            <div className="gh-three-shell gh-glass-strong">
              <DeferredMetroCity reduced={reduced} night={night} label={W.cityLabel}/>
              <div className="gh-three-hud">
                <span className="gh-three-hint" aria-label={W.cityHint}>
                  <span className="material-symbols-outlined" aria-hidden>drag_pan</span>
                </span>
              </div>
              <div className="gh-three-route" aria-hidden>
                <span>LIVE 1:1</span><i/><span>FLASHCARDS</span><i/><span>WORLD 3D</span>
              </div>
            </div>
          </Reveal>
        </section>

        {/* ── Quick practice modules, in their own section ── */}
        <section className="gh-section gh-arcade-section" style={{ paddingBottom: 64 }}>
          <Reveal className="gh-section-heading">
            <div style={{ fontFamily: FONT.mono, fontSize: 11, fontWeight: 700, letterSpacing: '0.3em',
              textTransform: 'uppercase', color: T.fuchsia, marginBottom: 10 }}>{W.arcadeKicker}</div>
            <h2 style={{ fontFamily: FONT.display, fontWeight: 700, fontSize: 'clamp(26px, 3vw, 38px)',
              letterSpacing: '-0.03em', margin: '0 0 14px' }}>
              {W.arcadeTitle}
            </h2>
            <p style={{ color: T.textDim, fontSize: 'clamp(14px, 1.35vw, 17px)', lineHeight: 1.7,
              maxWidth: 560, margin: '0 0 26px' }}>{W.arcadeBody}</p>
          </Reveal>
          <Reveal delay={80}>
            <HeroArcade badge={W.arcadeBadge} reduced={reduced} lang={lang}/>
            <div style={{ marginTop: 12, textAlign: 'center' }}>
              <a href={WORLD_URL} className="gh-text-link"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: T.textDim,
                  fontSize: 12.5, fontWeight: 600, letterSpacing: '0.04em', textDecoration: 'none' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16, color: T.violet }}>public</span>
                {W.worldLink}
              </a>
            </div>
          </Reveal>
        </section>

        {/* ── How lessons work ── */}
        <section className="gh-section gh-journey-section" style={{ paddingBottom: 64 }}>
          <Reveal className="gh-section-heading">
            <div style={{ fontFamily: FONT.mono, fontSize: 11, fontWeight: 700, letterSpacing: '0.3em',
              textTransform: 'uppercase', color: T.fuchsia, marginBottom: 10 }}>{W.stepsKicker}</div>
            <h2 style={{ fontFamily: FONT.display, fontWeight: 700, fontSize: 'clamp(26px, 3vw, 38px)',
              letterSpacing: '-0.03em', margin: '0 0 26px' }}>
              {W.stepsTitle}
            </h2>
          </Reveal>
          <Reveal className="gh-steps-photo">
            <div className="gh-photo-frame gh-photo-frame--wide">
              <img src="/home/photo-group-2607.webp" alt={W.stepsAlt} loading="lazy" width="1600" height="900"/>
              <span className="gh-float-chip gh-float-chip--a">
                <span className="material-symbols-outlined" aria-hidden>co_present</span>
                {W.stepsChip}
              </span>
            </div>
          </Reveal>
          <div className="gh-steps" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 16 }}>
            {W.steps.map((s, i) => (
              <Reveal key={s.title} delay={i * 90} className="gh-step-slot">
                <div className="gh-step gh-glass" style={{ height: '100%' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                    <span className="gh-step-num" style={{ fontFamily: FONT.mono }}>{i + 1}</span>
                    <span className="material-symbols-outlined" aria-hidden
                      style={{ fontSize: 22, color: T.violet }}>{s.icon}</span>
                  </div>
                  <div style={{ fontFamily: FONT.display, fontWeight: 700, fontSize: 16.5, marginBottom: 8 }}>{s.title}</div>
                  <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: T.textDim }}>{s.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ── Lesson packages — the live pricing, right here ── */}
        <section className="gh-section gh-packages-section" style={{ paddingBottom: 64 }}>
          <Reveal className="gh-section-heading">
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
              flexWrap: 'wrap', gap: 12, marginBottom: 26 }}>
              <div>
                <div style={{ fontFamily: FONT.mono, fontSize: 11, fontWeight: 700, letterSpacing: '0.3em',
                  textTransform: 'uppercase', color: T.emerald, marginBottom: 10 }}>{W.packsKicker}</div>
                <h2 style={{ fontFamily: FONT.display, fontWeight: 700, fontSize: 'clamp(26px, 3vw, 38px)',
                  letterSpacing: '-0.03em', margin: 0 }}>
                  {W.packsTitle}
                </h2>
              </div>
              <Link to="/pricing" style={{ display: 'inline-flex', alignItems: 'center', gap: 6,
                color: T.violet, fontSize: 13.5, fontWeight: 700, textDecoration: 'none' }}>
                {W.packsLink}
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_forward</span>
              </Link>
            </div>
          </Reveal>
          <div className="gh-packs">
            {PRIVATE_PACKAGES.map((p, i) => {
              const hot = p.accent === 'brand'
              return (
                <Reveal key={p.id} delay={i * 80} style={{ height: '100%' }}
                  className={`gh-pack-slot gh-pack-slot--${i + 1}${hot ? ' is-featured' : ''}`}>
                  <div className={`gh-pack gh-glass${hot ? ' is-featured' : ''}`} style={{ height: '100%', display: 'flex', flexDirection: 'column',
                    border: hot ? '1px solid transparent' : `1px solid ${T.border}`,
                    background: hot
                      ? `linear-gradient(${night ? 'rgba(22,10,44,0.92)' : 'rgba(255,255,255,0.96)'}, ${night ? 'rgba(22,10,44,0.92)' : 'rgba(255,255,255,0.96)'}) padding-box, ${G.brand} border-box`
                      : undefined,
                    boxShadow: hot ? '0 24px 70px -30px rgba(217,70,239,0.55)' : 'none' }}>
                    <div style={{ fontFamily: FONT.mono, fontSize: 10, fontWeight: 700, letterSpacing: '0.22em',
                      textTransform: 'uppercase', color: hot ? T.fuchsia : T.textMute, marginBottom: 10 }}>{lang === 'pl' ? (p.badgePl || p.badge) : p.badge}</div>
                    <div style={{ fontFamily: FONT.display, fontWeight: 700, fontSize: 18, marginBottom: 2 }}>{p.name}</div>
                    <div style={{ fontSize: 12.5, color: T.textDim, marginBottom: 14 }}>{lang === 'pl' ? (p.pacePl || p.pace) : p.pace} · {W.packsEach}</div>
                    <div style={{ fontFamily: FONT.display, fontWeight: 700, fontSize: 30, letterSpacing: '-0.02em' }}>{p.price}</div>
                    <div style={{ fontSize: 12, color: T.textMute, marginBottom: 14 }}>{p.perLesson}</div>
                    <p style={{ margin: '0 0 18px', fontSize: 12.5, lineHeight: 1.55, color: T.textDim, flexGrow: 1 }}>{lang === 'pl' ? (p.bestForPl || p.bestFor) : p.bestFor}</p>
                    <button type="button"
                      className={`gh-action gh-action--${hot ? 'primary' : 'secondary'} gh-action--md gh-action--full gh-pack-add`}
                      data-added={packAdded === p.id}
                      onClick={() => addPackToCart(p)}
                      aria-label={`${W.packsStart}: ${p.name}, ${p.price}`}>
                      {packAdded === p.id
                        ? (lang === 'pl' ? 'Dodano do koszyka' : 'Added to cart')
                        : W.packsStart}
                      <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 17 }}>
                        {packAdded === p.id ? 'check' : 'add_shopping_cart'}
                      </span>
                    </button>
                  </div>
                </Reveal>
              )
            })}
          </div>
        </section>

        {/* ── Two ways in — the practice layer between lessons ── */}
        <section className="gh-section gh-doors-section" style={{ paddingBottom: 58 }}>
          <Reveal className="gh-section-heading">
            <div style={{ fontFamily: FONT.mono, fontSize: 11, fontWeight: 700, letterSpacing: '0.3em',
              textTransform: 'uppercase', color: T.violet, marginBottom: 10 }}>{W.doorsKicker}</div>
            <h2 style={{ fontFamily: FONT.display, fontWeight: 700, fontSize: 'clamp(26px, 3vw, 38px)',
              letterSpacing: '-0.03em', margin: '0 0 26px' }}>
              {W.doorsTitle}
            </h2>
          </Reveal>
          <div className="gh-doors" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
            <a href={WORLD_URL} className="gh-door gh-door--world gh-glass" style={{ textDecoration: 'none',
              border: `1px solid ${T.border}`, color: T.text }}>
              <div className="gh-door-ribbon">BETA</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                <span className="material-symbols-outlined" aria-hidden
                  style={{ fontSize: 26, color: T.violet }}>public</span>
                <span style={{ fontFamily: FONT.display, fontWeight: 700, fontSize: 20 }}>The Open World</span>
              </div>
              <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, color: T.textDim }}>
                Explore the full city as Wren. Ride the metro between language districts,
                help local characters and practise English as you progress.
              </p>
              <span className="gh-door-go" style={{ color: T.violet }}>
                Start exploring <span className="material-symbols-outlined" style={{ fontSize: 15 }}>arrow_forward</span>
              </span>
            </a>
            <button type="button" className="gh-door gh-door--practice gh-glass" onClick={scrollToPractice}
              style={{ textAlign: 'left', cursor: 'pointer', border: `1px solid ${T.border}`, color: T.text,
                fontFamily: FONT.body }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                <span className="material-symbols-outlined" aria-hidden
                  style={{ fontSize: 26, color: T.emerald }}>bolt</span>
                <span style={{ fontFamily: FONT.display, fontWeight: 700, fontSize: 20 }}>Quick Practice</span>
              </div>
              <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, color: T.textDim }}>
                {W.doorsBody(ALL_GAMES.length)}
              </p>
              <span className="gh-door-go" style={{ color: T.emerald }}>
                {W.doorsGo} {quickPick.title} <span className="material-symbols-outlined" style={{ fontSize: 15 }}>arrow_forward</span>
              </span>
            </button>
          </div>
        </section>

        {/* ── Ticker ── */}
        <div className="gh-ticker gh-glass-strip" style={{ overflow: 'hidden', borderTop: `1px solid ${T.border}`,
          borderBottom: `1px solid ${T.border}`, padding: '12px 0', marginBottom: 58 }}>
          <div className="gh-ticker-track">
            {tickerNames.map((n, i) => (
              <span key={i} style={{ fontFamily: FONT.mono, fontSize: 12, letterSpacing: '0.18em',
                textTransform: 'uppercase', color: i % 2 ? T.textMute : T.textDim, padding: '0 28px' }}>
                {n} <span style={{ color: T.fuchsia, marginLeft: 28 }}>●</span>
              </span>
            ))}
          </div>
        </div>

        {/* ── Practice catalog: expandable metro lines ── */}
        <section ref={practiceRef} className="gh-section gh-practice-section" style={{ scrollMarginTop: 110, paddingBottom: 36 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
            flexWrap: 'wrap', gap: 12, marginBottom: 8 }}>
            <h2 style={{ fontFamily: FONT.display, fontWeight: 700, fontSize: 'clamp(26px, 3vw, 38px)',
              letterSpacing: '-0.03em', margin: 0 }}>
              {W.catalogTitle}
            </h2>
            <div style={{ fontSize: 12, color: T.textMute, letterSpacing: '0.08em' }}>
              {W.catalogHint}
            </div>
          </div>
          <p style={{ color: T.textDim, fontSize: 14, margin: '0 0 26px', maxWidth: 560 }}>
            {W.catalogBrowse}
          </p>

          <div className="gh-catalog" style={{ display: 'grid', gap: 14 }}>
            {LINES.map((line) => (
              <LineSection key={line.line} line={line} T={T} night={night}
                open={openLines.has(line.line)} onToggle={() => toggleLine(line.line)}
                count={W.catalogGames(line.games.length)}
                subtitle={`${W.lineTags[line.line] || line.tag} · ${line.games.slice(0, 3).map((g) => g.title).join(', ')}…`}>
                {line.games.map((g, i) => (
                  <GameCard key={g.key} g={g} color={line.color} T={T} night={night} index={i}
                    onPlay={(game) => setPlaying({ ...game, color: line.color })}/>
                ))}
              </LineSection>
            ))}

            {/* 3D districts from the Fluent City arcade */}
            <LineSection
              line={{ line: '3D Districts', color: '#FFB347', icon: 'view_in_ar' }}
              T={T} night={night}
              open={openLines.has('3D Districts')} onToggle={() => toggleLine('3D Districts')}
              count={W.catalogLive(playable3d.length, arrivingSoon.length)}
              subtitle={W.districts3dSubtitle}>
              {playable3d.map((e, i) => (
                <GameCard key={`3d-${e.shellKey}`} g={{ ...e, venue: e.district }} color="#FFB347"
                  T={T} night={night} index={i} onPlay={(game) => setPlaying(game)}/>
              ))}
              {arrivingSoon.map((a, i) => (
                <GameCard key={`soon-${a.key}`} g={{ title: a.title, district: a.district }} color="#FFB347"
                  T={T} night={night} index={playable3d.length + i} soon/>
              ))}
            </LineSection>
          </div>
        </section>

        {/* ── Bottom CTA ── */}
        <section className="gh-bottom-cta gh-glass-strong" style={{ margin: '40px 0 90px', textAlign: 'center', padding: '64px 28px',
          borderRadius: 26, border: `1px solid ${T.borderHi}`, position: 'relative', overflow: 'hidden' }}>
          <span className="gh-cta-orb gh-cta-orb--one" aria-hidden/>
          <span className="gh-cta-orb gh-cta-orb--two" aria-hidden/>
          <img className="gh-bajla" src="/bajla.png" alt="Bajla, the EnglishMetro owl" width="112" height="112"/>
          <h2 style={{ fontFamily: FONT.display, fontWeight: 700, fontSize: 'clamp(28px, 4vw, 46px)',
            letterSpacing: '-0.03em', margin: '0 0 12px' }}>
            {W.ctaTitle}
          </h2>
          <p style={{ color: T.textDim, fontSize: 15, lineHeight: 1.6, maxWidth: 480, margin: '0 auto 28px' }}>
            {W.ctaBody}
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <ActionLink to="/signup" variant="primary" size="lg" trailingIcon="arrow_forward">
              {W.ctaPlay}
            </ActionLink>
            <ActionLink href={WORLD_URL} variant="secondary" size="lg" trailingIcon="public">
              {W.ctaBeta}
            </ActionLink>
          </div>
        </section>

        {/* ── Footer ── */}
        <footer style={{ padding: '0 0 34px', fontSize: 11, color: T.textMute }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            flexWrap: 'wrap', gap: 14, marginBottom: 12 }}>
            <div style={{ letterSpacing: '0.24em', textTransform: 'uppercase' }}>
              © {CURRENT_YEAR} englishmetro.com · Warszawa → The World
            </div>
            <div style={{ display: 'flex', gap: 16 }}>
              <Link to="/pricing" style={{ color: T.textMute, textDecoration: 'none' }}>Pricing</Link>
              <Link to="/signup" style={{ color: T.textMute, textDecoration: 'none' }}>Sign up</Link>
              <Link to="/privacy" style={{ color: T.textMute, textDecoration: 'none' }}>Privacy</Link>
              <Link to="/cookies" style={{ color: T.textMute, textDecoration: 'none' }}>Cookies</Link>
              <Link to="/terms" style={{ color: T.textMute, textDecoration: 'none' }}>Terms</Link>
              <a href="/kontakt/" style={{ color: T.textMute, textDecoration: 'none' }}>{lang === 'pl' ? 'Kontakt' : 'Contact'}</a>
            </div>
          </div>
          <p style={{ margin: 0, fontSize: 10.5, lineHeight: 1.6, color: T.textMute, maxWidth: 860 }}>
            {lang === 'pl'
              ? 'EnglishMetro, zorganizowana część przedsiębiorstwa Fundacji Rozwoju Przedsiębiorczości „Twój StartUp" z siedzibą w Warszawie, ul. Żurawia 6/12 lok. 766, 00-503 Warszawa · KRS 0000442857 · NIP 5213641211 · REGON 146433467'
              : 'EnglishMetro, an organised business unit of Fundacja Rozwoju Przedsiębiorczości "Twój StartUp", Warsaw, ul. Żurawia 6/12 lok. 766, 00-503 Warszawa · KRS 0000442857 · NIP (Tax ID) 5213641211 · REGON 146433467'}
          </p>
          <p style={{ margin: '6px 0 0', fontSize: 10.5, lineHeight: 1.6, color: T.textMute, maxWidth: 860 }}>
            {lang === 'pl' ? 'Kontakt' : 'Contact'}:{' '}
            <a href="mailto:michael.poncana@englishmetro.com" style={{ color: T.textMute }}>michael.poncana@englishmetro.com</a>
            {' · '}
            <a href="tel:+48662563507" style={{ color: T.textMute }}>+48 662 563 507</a>
            {lang === 'pl'
              ? ' · Adres do doręczeń: ul. Ignacego Daszyńskiego 1/132, 05-300 Mińsk Mazowiecki'
              : ' · Service address: ul. Ignacego Daszyńskiego 1/132, 05-300 Mińsk Mazowiecki, Poland'}
          </p>
        </footer>
      </div>

      {playing && <PlayOverlay game={playing} onClose={() => setPlaying(null)}/>}
      <CartUI lang={lang === 'pl' ? 'pl' : 'en'}/>
    </div>
  )
}
