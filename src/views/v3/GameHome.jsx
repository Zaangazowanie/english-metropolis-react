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
import { Btn, Skyline } from '../../design/v3/primitives.jsx'
import { useV3Theme } from '../../design/v3/ThemeProvider.jsx'
import { game3dRegistry } from '../../practice/shells3d/kit/registry'
import { usePrefersReducedMotion } from '../../practice/lib/usePrefersReducedMotion'
import { useI18n } from '../../i18n'
import { PRIVATE_PACKAGES } from '../public/packages.js'
import './game-home.css'

// Scroll-triggered reveal: fades/rises a block the first time it enters the
// viewport. Inert under prefers-reduced-motion (.gh-still forces visible).
function Reveal({ children, delay = 0, style }) {
  const ref = useRef(null)
  const [on, setOn] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') { setOn(true); return }
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setOn(true); io.disconnect() }
    }, { threshold: 0.15 })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    <div ref={ref} className={`gh-sr${on ? ' on' : ''}`}
      style={{ transitionDelay: `${delay}ms`, ...style }}>
      {children}
    </div>
  )
}

// ── Landing marketing copy, EN + PL (Polish is the site default) ───────────
const GH = {
  en: {
    navPricing: 'Pricing', navSignin: 'Sign in', navSignup: 'Sign up', navDash: 'My dashboard',
    navPlay: 'Play the World',
    eyebrow: 'online english school · live 1:1 lessons',
    h1a: 'Learn it live.', h1b: 'Live it daily',
    heroSub: (n) => <>
      <b>60-minute 1:1 lessons</b> with your own teacher, courses matched to your CEFR level,
      and every keyword you meet turned into flashcards. Between lessons, keep the streak alive
      inside <b>EnglishMetro World</b> — our living open-city game — and {n} instant practice
      games. Book online in minutes.</>,
    ctaBook: 'Book your first lesson', ctaPricing: 'See pricing', ctaWorld: 'Play the World — free',
    chips: ['60-min live 1:1 lessons', 'CEFR-matched courses', 'keywords become flashcards', 'book online in minutes'],
    arcadeBadge: 'live practice · try it now',
    worldLink: 'Prefer the full adventure? Step into the 3D city — free',
    stepsKicker: 'from sign-up to speaking', stepsTitle: 'Your first lesson is four steps away',
    steps: [
      { icon: 'person_add', title: 'Create your account', body: 'Two minutes — email and password, or one tap with Google.' },
      { icon: 'shopping_bag', title: 'Pick a package', body: 'From a single try-out lesson to 24. Pay by invoice today — online payment is coming.' },
      { icon: 'event_available', title: 'Book your times', body: 'Choose slots inside your teacher’s live availability. The Meet link and calendar invite land in your inbox.' },
      { icon: 'school', title: 'Learn, then replay', body: 'Every lesson becomes a PDF in your library and its keywords become flashcards — revise, practise, repeat.' },
    ],
    packsKicker: '1:1 lesson packages', packsTitle: 'Pick your pace', packsLink: 'Full pricing & details',
    packsStart: 'Start', packsEach: '60 min each',
    doorsKicker: 'between lessons', doorsTitle: 'The city keeps teaching',
  },
  pl: {
    navPricing: 'Cennik', navSignin: 'Zaloguj się', navSignup: 'Załóż konto', navDash: 'Mój panel',
    navPlay: 'Zagraj w World',
    eyebrow: 'szkoła angielskiego online · lekcje 1:1 na żywo',
    h1a: 'Ucz się na żywo.', h1b: 'Mów na co dzień',
    heroSub: (n) => <>
      <b>60-minutowe lekcje 1:1</b> z własnym lektorem, kursy dopasowane do Twojego poziomu CEFR,
      a każde poznane słówko zamienia się w fiszki. Między lekcjami trenujesz dalej w{' '}
      <b>EnglishMetro World</b> — naszej żywej, otwartej grze-mieście — i w {n} błyskawicznych
      grach do ćwiczeń. Rezerwacja online w kilka minut.</>,
    ctaBook: 'Zarezerwuj pierwszą lekcję', ctaPricing: 'Zobacz cennik', ctaWorld: 'Zagraj w World — za darmo',
    chips: ['lekcje 1:1 na żywo, 60 min', 'kursy pod poziom CEFR', 'słówka stają się fiszkami', 'rezerwacja online w minuty'],
    arcadeBadge: 'prawdziwe ćwiczenia · wypróbuj teraz',
    worldLink: 'Wolisz pełną przygodę? Wejdź do miasta 3D — za darmo',
    stepsKicker: 'od rejestracji do mówienia', stepsTitle: 'Twoja pierwsza lekcja w czterech krokach',
    steps: [
      { icon: 'person_add', title: 'Załóż konto', body: 'Dwie minuty — e-mail i hasło albo jedno kliknięcie z Google.' },
      { icon: 'shopping_bag', title: 'Wybierz pakiet', body: 'Od pojedynczej lekcji próbnej do 24. Dziś płatność fakturą — płatności online już wkrótce.' },
      { icon: 'event_available', title: 'Zarezerwuj terminy', body: 'Wybierz godziny w dostępności lektora. Link Meet i zaproszenie do kalendarza trafią na Twój e-mail.' },
      { icon: 'school', title: 'Ucz się i powtarzaj', body: 'Każda lekcja trafia jako PDF do Twojej biblioteki, a słówka stają się fiszkami — powtarzaj, ćwicz, graj.' },
    ],
    packsKicker: 'pakiety lekcji 1:1', packsTitle: 'Wybierz swoje tempo', packsLink: 'Pełny cennik i szczegóły',
    packsStart: 'Zaczynam', packsEach: 'po 60 min',
    doorsKicker: 'między lekcjami', doorsTitle: 'Miasto uczy dalej',
  },
}

// ── Hero arcade: REAL practice exercises, playable right in the hero ───────
// (replaced the recorded-gameplay video 2026-07-10 — headless capture ran at
// ~10fps and looked frozen. These are the same DOM-based shells as the
// catalog, with their built-in demo puzzles: smooth, instant, no canvas.)
const HERO_GAMES = [
  { key: 'flashcards', title: 'Flashcards', icon: 'style', load: () => import('../../practice/shells/Flashcards') },
  { key: 'multiplechoice', title: 'Quiz', icon: 'quiz', load: () => import('../../practice/shells/MultipleChoice') },
  { key: 'gapfill', title: 'Gap fill', icon: 'edit_note', load: () => import('../../practice/shells/GapFill') },
  { key: 'truefalse', title: 'True / False', icon: 'balance', load: () => import('../../practice/shells/TrueFalse') },
  { key: 'unjumble', title: 'Unjumble', icon: 'low_priority', load: () => import('../../practice/shells/Unjumble') },
  { key: 'matching', title: 'Matching', icon: 'join_inner', load: () => import('../../practice/shells/Matching') },
  { key: 'concentration', title: 'Memory', icon: 'grid_view', load: () => import('../../practice/shells/Concentration') },
]

function HeroArcade({ night, badge }) {
  const [active, setActive] = useState(0)
  const Shell = useMemo(() => lazy(HERO_GAMES[active].load), [active])
  const tabsRef = useRef(null)
  const go = (dir) => setActive(i => (i + dir + HERO_GAMES.length) % HERO_GAMES.length)
  useEffect(() => {
    tabsRef.current?.querySelector('.gh-arcade-tab.on')
      ?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
  }, [active])
  return (
    <div className="gh-hero-frame">
      <div className="gh-postcard" style={{ background: '#120a26' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
          borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, flex: 'none' }}>
            <span className="gh-live-dot" aria-hidden/>
            <span className="gh-arcade-badge" style={{ fontFamily: FONT.mono, fontSize: 10, fontWeight: 700,
              letterSpacing: '0.24em', textTransform: 'uppercase', color: '#F5F0FF' }}>
              {badge}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto', minWidth: 0 }}>
            <div ref={tabsRef} className="gh-arcade-tabs">
              {HERO_GAMES.map((g, i) => (
                <button key={g.key} type="button" onClick={() => setActive(i)}
                  className={`gh-arcade-tab${i === active ? ' on' : ''}`}>
                  <span className="material-symbols-outlined" style={{ fontSize: 15 }}>{g.icon}</span>
                  {g.title}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div style={{ position: 'relative' }}>
          <div style={{ height: 'min(56vh, 460px)', overflow: 'auto', background: DUSK.bg }}>
            <ShellBoundary key={HERO_GAMES[active].key}>
              <Suspense fallback={
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%',
                  color: DUSK.dim, fontFamily: FONT.mono, fontSize: 12, letterSpacing: '0.2em' }}>
                  NEXT TRAIN APPROACHING…
                </div>
              }>
                <Shell/>
              </Suspense>
            </ShellBoundary>
          </div>
          <button type="button" className="gh-slider-arrow gh-slider-prev" aria-label="Previous exercise"
            onClick={() => go(-1)}>
            <span className="material-symbols-outlined" style={{ fontSize: 26 }}>chevron_left</span>
          </button>
          <button type="button" className="gh-slider-arrow gh-slider-next" aria-label="Next exercise"
            onClick={() => go(1)}>
            <span className="material-symbols-outlined" style={{ fontSize: 26 }}>chevron_right</span>
          </button>
          <div className="gh-slider-dots" aria-hidden>
            {HERO_GAMES.map((g, i) => (
              <button key={g.key} type="button" tabIndex={-1}
                className={`gh-slider-dot${i === active ? ' on' : ''}`} onClick={() => setActive(i)}/>
            ))}
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

// The world game lives OUTSIDE the SPA as static files (own loader, own
// three.js build) — a plain anchor, not a router Link.
const WORLD_URL = '/play/'

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
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [onClose])

  return (
    <div role="dialog" aria-modal="true" aria-label={`Playing ${game.title}`}
      style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', flexDirection: 'column',
        background: DUSK.bg, backdropFilter: 'blur(14px)' }}>
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
          <button type="button" onClick={onClose} aria-label="Close game"
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
            <div className="gh-rise" style={{ maxWidth: 440, width: '100%', textAlign: 'center',
              background: 'linear-gradient(180deg, rgba(30,20,60,0.92) 0%, rgba(15,10,35,0.92) 100%)',
              border: '1px solid rgba(217,70,239,0.35)', borderRadius: 20, padding: '36px 32px',
              boxShadow: '0 30px 80px -20px rgba(0,0,0,0.7), 0 0 60px -20px rgba(217,70,239,0.3)' }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>🦉</div>
              <div style={{ fontFamily: FONT.display, fontWeight: 700, fontSize: 24, color: DUSK.text, marginBottom: 10 }}>
                {doneOnce ? 'Nice round.' : 'Go full screen?'}
              </div>
              <p style={{ color: DUSK.dim, fontSize: 14, lineHeight: 1.6, margin: '0 0 22px' }}>
                {doneOnce
                  ? 'Create a free account to save your progress, build a streak, and unlock every district of the city.'
                  : 'Full-screen play comes with a free account — along with saved progress and streaks.'}
              </p>
              <Link to="/signup" style={{ textDecoration: 'none' }}>
                <Btn variant="primary" size="lg" full trailingIcon="arrow_forward">Create free account</Btn>
              </Link>
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

function GameCard({ g, color, T, night, onPlay, index, soon }) {
  return (
    <button type="button" className="gh-card" disabled={soon}
      onClick={soon ? undefined : () => onPlay(g)}
      aria-label={soon ? `${g.title} — arriving soon` : `Play ${g.title}`}
      style={{ textAlign: 'left', cursor: soon ? 'default' : 'pointer', borderRadius: 16,
        border: `1px solid ${T.border}`, padding: '18px 18px 16px',
        background: night
          ? 'linear-gradient(180deg, rgba(30,20,60,0.34) 0%, rgba(12,7,28,0.5) 100%)'
          : 'linear-gradient(180deg, rgba(255,255,255,0.85) 0%, rgba(245,242,252,0.9) 100%)',
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
function LineSection({ line, T, night, open, onToggle, onPlay, count, subtitle, children }) {
  return (
    <div className="gh-acc" data-open={open}
      style={{ border: `1px solid ${open ? T.borderHi : T.border}`, borderRadius: 20,
        background: night ? 'rgba(14,9,30,0.55)' : 'rgba(255,255,255,0.7)',
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
          <div style={{ display: 'grid', gap: 14, padding: '4px 18px 20px',
            gridTemplateColumns: 'repeat(auto-fill, minmax(225px, 1fr))' }}>
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
  const [openLines, setOpenLines] = useState(() => new Set([LINES[0].line]))
  const practiceRef = useRef(null)

  const quickPick = useMemo(() => {
    const day = Math.floor(Date.now() / 86400000)
    const key = FEATURED_KEYS[day % FEATURED_KEYS.length]
    return ALL_GAMES.find((g) => g.key === key) || ALL_GAMES[0]
  }, [])

  const playable3d = useMemo(() =>
    game3dRegistry.filter((e) => !e.shellKey.startsWith('world-'))
      .map((e) => ({ ...e, is3d: true, load3d: e.load, color: DUSK.amber })), [])
  const arrivingSoon = useMemo(() => {
    const live = new Set(game3dRegistry.map((e) => e.shellKey))
    return ARRIVING.filter((a) => !live.has(a.key))
  }, [])

  const tickerNames = useMemo(() => {
    const names = ['EnglishMetro World — OPEN BETA', ...playable3d.map((e) => `${e.title} — 3D`),
      ...ALL_GAMES.map((g) => g.title)]
    return [...names, ...names] // doubled for a seamless -50% loop
  }, [playable3d])

  const toggleLine = (name) => setOpenLines((prev) => {
    const next = new Set(prev)
    if (next.has(name)) next.delete(name); else next.add(name)
    return next
  })
  const scrollToPractice = () => practiceRef.current?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' })

  return (
    <div className={reduced ? 'gh-still' : ''} style={{ position: 'relative', minHeight: '100vh',
      background: T.pageBg, color: T.text, fontFamily: FONT.body, overflowX: 'hidden',
      transition: 'background 500ms ease, color 500ms ease' }}>
      {/* Atmosphere */}
      <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none',
        background: night ? G.aurora : G.auroraDay, transition: 'opacity 500ms ease' }}/>
      {night ? <StarField/> : <DayClouds/>}

      <div style={{ position: 'relative', zIndex: 2, maxWidth: 1840, margin: '0 auto', padding: '0 24px' }}>
        {/* ── Header ── */}
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '22px 0', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Skyline size={30}/>
            <div style={{ fontFamily: FONT.display, fontWeight: 700, fontSize: 19, letterSpacing: '-0.02em' }}>
              English <span style={{ background: G.brand, WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Metro</span>
              <span style={{ color: T.ember }}>.</span>
            </div>
          </div>
          <nav style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <Link to="/pricing" style={{ textDecoration: 'none' }}>
              <Btn variant="ghost" size="md">{W.navPricing}</Btn>
            </Link>
            {studentSession?.slug ? (
              <Link to={`/app/${studentSession.slug}/dashboard`} style={{ textDecoration: 'none' }}>
                <Btn variant="ghost" size="md" icon="account_circle">{W.navDash}</Btn>
              </Link>
            ) : (
              <>
                <Link to="/login" style={{ textDecoration: 'none' }}>
                  <Btn variant="ghost" size="md">{W.navSignin}</Btn>
                </Link>
                <Link to="/signup" style={{ textDecoration: 'none' }}>
                  <Btn variant="secondary" size="md">{W.navSignup}</Btn>
                </Link>
              </>
            )}
            <div className="gh-lang" role="group" aria-label="Language">
              {['pl', 'en'].map(l => (
                <button key={l} type="button" onClick={() => setLang(l)}
                  className={`gh-lang-btn${lang === l ? ' on' : ''}`}>{l.toUpperCase()}</button>
              ))}
            </div>
            <ThemeToggle mode={mode} setMode={setMode} T={T}/>
            {/* NB: a <button> nested in an <a> does NOT activate the link —
                every Btn that leads to the world navigates via onClick. */}
            <a href={WORLD_URL} style={{ textDecoration: 'none' }}>
              <Btn variant="primary" size="md" trailingIcon="play_arrow"
                onClick={() => window.location.assign(WORLD_URL)}
                style={{ whiteSpace: 'nowrap' }}>{W.navPlay}</Btn>
            </a>
          </nav>
        </header>

        {/* ── Hero: live lessons first, the city as your practice ground ── */}
        <section className="gh-hero-grid" style={{ display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.02fr) minmax(0, 0.98fr)',
          gap: 52, alignItems: 'center', padding: '46px 0 64px' }}>
          <div style={{ minWidth: 0 }}>
            <div className="gh-rise gh-rise-1" style={{ display: 'inline-flex', alignItems: 'center', gap: 10,
              marginBottom: 20 }}>
              <span style={{ fontFamily: FONT.mono, fontSize: 11, fontWeight: 700, letterSpacing: '0.3em',
                textTransform: 'uppercase', color: T.emerald }}>
                {W.eyebrow}
              </span>
            </div>
            <h1 className="gh-rise gh-rise-2" style={{ fontFamily: FONT.display, fontWeight: 700,
              fontSize: 'clamp(42px, 6.4vw, 82px)', lineHeight: 0.98, letterSpacing: '-0.04em', margin: 0 }}>
              {W.h1a}
              <br/>
              <span style={{ background: G.brand, WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>{W.h1b}</span>
              <span style={{ color: T.ember }}>.</span>
            </h1>
            <p className="gh-rise gh-rise-3" style={{ marginTop: 24, fontSize: 'clamp(15px, 1.6vw, 18px)',
              color: T.textDim, lineHeight: 1.65, maxWidth: 540 }}>
              {W.heroSub(ALL_GAMES.length)}
            </p>
            <div className="gh-rise gh-rise-4" style={{ marginTop: 30, display: 'flex', gap: 14,
              flexWrap: 'wrap', alignItems: 'center' }}>
              <Link to="/signup" style={{ textDecoration: 'none' }}>
                <Btn variant="primary" size="lg" trailingIcon="arrow_forward"
                  style={{ fontSize: 15, padding: '18px 32px' }}>
                  {W.ctaBook}
                </Btn>
              </Link>
              <Link to="/pricing" style={{ textDecoration: 'none' }}>
                <Btn variant="secondary" size="lg" trailingIcon="sell">
                  {W.ctaPricing}
                </Btn>
              </Link>
              <a href={WORLD_URL} onClick={(e) => { e.preventDefault(); window.location.assign(WORLD_URL) }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: T.violet,
                  fontSize: 13.5, fontWeight: 700, letterSpacing: '0.03em', textDecoration: 'none' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 17 }}>play_circle</span>
                {W.ctaWorld}
              </a>
            </div>
            <div className="gh-rise gh-rise-4" style={{ marginTop: 22, display: 'flex', gap: 18, flexWrap: 'wrap' }}>
              {W.chips.map((f) => (
                <span key={f} style={{ display: 'inline-flex', alignItems: 'center', gap: 7,
                  fontSize: 12, color: T.textDim, letterSpacing: '0.04em' }}>
                  <span className="material-symbols-outlined" aria-hidden
                    style={{ fontSize: 15, color: T.emerald }}>check_circle</span>
                  {f}
                </span>
              ))}
            </div>
          </div>

          <div className="gh-rise gh-rise-3" style={{ minWidth: 0 }}>
            <HeroArcade night={night} badge={W.arcadeBadge}/>
            <div style={{ marginTop: 12, textAlign: 'center' }}>
              <a href={WORLD_URL} onClick={(e) => { e.preventDefault(); window.location.assign(WORLD_URL) }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: T.textDim,
                  fontSize: 12.5, fontWeight: 600, letterSpacing: '0.04em', textDecoration: 'none' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16, color: T.violet }}>public</span>
                {W.worldLink}
              </a>
            </div>
          </div>
        </section>

        {/* ── How lessons work ── */}
        <section style={{ paddingBottom: 64 }}>
          <Reveal>
            <div style={{ fontFamily: FONT.mono, fontSize: 11, fontWeight: 700, letterSpacing: '0.3em',
              textTransform: 'uppercase', color: T.fuchsia, marginBottom: 10 }}>{W.stepsKicker}</div>
            <h2 style={{ fontFamily: FONT.display, fontWeight: 700, fontSize: 'clamp(26px, 3vw, 38px)',
              letterSpacing: '-0.03em', margin: '0 0 26px' }}>
              {W.stepsTitle}
            </h2>
          </Reveal>
          <div className="gh-steps" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 16 }}>
            {W.steps.map((s, i) => (
              <Reveal key={s.title} delay={i * 90}>
                <div className="gh-step" style={{ border: `1px solid ${T.border}`, height: '100%',
                  background: night ? 'rgba(20,12,40,0.55)' : 'rgba(255,255,255,0.82)' }}>
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
        <section style={{ paddingBottom: 64 }}>
          <Reveal>
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
          <div className="gh-packs" style={{ display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 16, alignItems: 'stretch' }}>
            {PRIVATE_PACKAGES.map((p, i) => {
              const hot = p.accent === 'brand'
              return (
                <Reveal key={p.id} delay={i * 80} style={{ height: '100%' }}>
                  <div className="gh-pack" style={{ height: '100%', display: 'flex', flexDirection: 'column',
                    border: hot ? '1px solid transparent' : `1px solid ${T.border}`,
                    background: hot
                      ? `linear-gradient(${night ? 'rgba(22,10,44,0.92)' : 'rgba(255,255,255,0.96)'}, ${night ? 'rgba(22,10,44,0.92)' : 'rgba(255,255,255,0.96)'}) padding-box, ${G.brand} border-box`
                      : night ? 'rgba(20,12,40,0.55)' : 'rgba(255,255,255,0.82)',
                    boxShadow: hot ? '0 24px 70px -30px rgba(217,70,239,0.55)' : 'none' }}>
                    <div style={{ fontFamily: FONT.mono, fontSize: 10, fontWeight: 700, letterSpacing: '0.22em',
                      textTransform: 'uppercase', color: hot ? T.fuchsia : T.textMute, marginBottom: 10 }}>{lang === 'pl' ? (p.badgePl || p.badge) : p.badge}</div>
                    <div style={{ fontFamily: FONT.display, fontWeight: 700, fontSize: 18, marginBottom: 2 }}>{p.name}</div>
                    <div style={{ fontSize: 12.5, color: T.textDim, marginBottom: 14 }}>{lang === 'pl' ? (p.pacePl || p.pace) : p.pace} · {W.packsEach}</div>
                    <div style={{ fontFamily: FONT.display, fontWeight: 700, fontSize: 30, letterSpacing: '-0.02em' }}>{p.price}</div>
                    <div style={{ fontSize: 12, color: T.textMute, marginBottom: 14 }}>{p.perLesson}</div>
                    <p style={{ margin: '0 0 18px', fontSize: 12.5, lineHeight: 1.55, color: T.textDim, flexGrow: 1 }}>{lang === 'pl' ? (p.bestForPl || p.bestFor) : p.bestFor}</p>
                    <Link to={`/signup?package=${p.id}`} style={{ textDecoration: 'none' }}>
                      <Btn variant={hot ? 'primary' : 'secondary'} size="md" full trailingIcon="arrow_forward">
                        {W.packsStart}
                      </Btn>
                    </Link>
                  </div>
                </Reveal>
              )
            })}
          </div>
        </section>

        {/* ── Two ways in — the practice layer between lessons ── */}
        <section style={{ paddingBottom: 58 }}>
          <Reveal>
            <div style={{ fontFamily: FONT.mono, fontSize: 11, fontWeight: 700, letterSpacing: '0.3em',
              textTransform: 'uppercase', color: T.violet, marginBottom: 10 }}>{W.doorsKicker}</div>
            <h2 style={{ fontFamily: FONT.display, fontWeight: 700, fontSize: 'clamp(26px, 3vw, 38px)',
              letterSpacing: '-0.03em', margin: '0 0 26px' }}>
              {W.doorsTitle}
            </h2>
          </Reveal>
          <div className="gh-doors" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
            <a href={WORLD_URL} className="gh-door" style={{ textDecoration: 'none',
              border: `1px solid ${T.border}`, color: T.text,
              background: night
                ? 'linear-gradient(135deg, rgba(139,92,246,0.16) 0%, rgba(12,7,28,0.65) 100%)'
                : 'linear-gradient(135deg, rgba(139,92,246,0.10) 0%, rgba(255,255,255,0.9) 100%)' }}>
              <div className="gh-door-ribbon">BETA</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                <span className="material-symbols-outlined" aria-hidden
                  style={{ fontSize: 26, color: T.violet }}>public</span>
                <span style={{ fontFamily: FONT.display, fontWeight: 700, fontSize: 20 }}>The Open World</span>
              </div>
              <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, color: T.textDim }}>
                The full adventure. Explore the city as Wren, ride the metro between
                dialect districts, help the locals and level up your English district by district.
              </p>
              <span className="gh-door-go" style={{ color: T.violet }}>
                Start exploring <span className="material-symbols-outlined" style={{ fontSize: 15 }}>arrow_forward</span>
              </span>
            </a>
            <button type="button" className="gh-door" onClick={scrollToPractice}
              style={{ textAlign: 'left', cursor: 'pointer', border: `1px solid ${T.border}`, color: T.text,
                background: night
                  ? 'linear-gradient(135deg, rgba(52,211,153,0.10) 0%, rgba(12,7,28,0.65) 100%)'
                  : 'linear-gradient(135deg, rgba(52,211,153,0.10) 0%, rgba(255,255,255,0.9) 100%)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                <span className="material-symbols-outlined" aria-hidden
                  style={{ fontSize: 26, color: T.emerald }}>bolt</span>
                <span style={{ fontFamily: FONT.display, fontWeight: 700, fontSize: 20 }}>Quick Practice</span>
              </div>
              <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, color: T.textDim }}>
                {ALL_GAMES.length} instant games across four metro lines — vocabulary, grammar,
                listening, speaking. Two minutes or twenty, zero setup.
              </p>
              <span className="gh-door-go" style={{ color: T.emerald }}>
                Tonight&apos;s pick: {quickPick.title} <span className="material-symbols-outlined" style={{ fontSize: 15 }}>arrow_forward</span>
              </span>
            </button>
          </div>
        </section>

        {/* ── Ticker ── */}
        <div className="gh-ticker" style={{ overflow: 'hidden', borderTop: `1px solid ${T.border}`,
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
        <section ref={practiceRef} style={{ scrollMarginTop: 24, paddingBottom: 36 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
            flexWrap: 'wrap', gap: 12, marginBottom: 8 }}>
            <h2 style={{ fontFamily: FONT.display, fontWeight: 700, fontSize: 'clamp(26px, 3vw, 38px)',
              letterSpacing: '-0.03em', margin: 0 }}>
              Quick practice, four lines
            </h2>
            <div style={{ fontSize: 12, color: T.textMute, letterSpacing: '0.08em' }}>
              Tap a line to open it · every game plays instantly
            </div>
          </div>
          <p style={{ color: T.textDim, fontSize: 14, margin: '0 0 26px', maxWidth: 560 }}>
            The whole catalog, folded neatly. Pick a line, pick a station, play —
            no account needed for a first ride.
          </p>

          <div style={{ display: 'grid', gap: 14 }}>
            {LINES.map((line) => (
              <LineSection key={line.line} line={line} T={T} night={night}
                open={openLines.has(line.line)} onToggle={() => toggleLine(line.line)}
                count={`${line.games.length} games`}
                subtitle={`${line.tag} — ${line.games.slice(0, 3).map((g) => g.title).join(', ')}…`}>
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
              count={`${playable3d.length} live · ${arrivingSoon.length} arriving`}
              subtitle="The Fluent City in 3D — new districts land here automatically with every update">
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
        <section style={{ margin: '40px 0 90px', textAlign: 'center', padding: '64px 28px',
          borderRadius: 26, border: `1px solid ${T.borderHi}`, position: 'relative', overflow: 'hidden',
          background: night
            ? `radial-gradient(ellipse 90% 130% at 50% 130%, rgba(217,70,239,0.16), transparent 65%),
               linear-gradient(180deg, rgba(30,20,60,0.5) 0%, rgba(12,7,28,0.7) 100%)`
            : `radial-gradient(ellipse 90% 130% at 50% 130%, rgba(217,70,239,0.10), transparent 65%),
               linear-gradient(180deg, rgba(255,255,255,0.9) 0%, rgba(245,242,252,0.95) 100%)` }}>
          <div style={{ fontSize: 38, marginBottom: 14 }}>🦉</div>
          <h2 style={{ fontFamily: FONT.display, fontWeight: 700, fontSize: 'clamp(28px, 4vw, 46px)',
            letterSpacing: '-0.03em', margin: '0 0 12px' }}>
            The city remembers its players.
          </h2>
          <p style={{ color: T.textDim, fontSize: 15, lineHeight: 1.6, maxWidth: 480, margin: '0 auto 28px' }}>
            A free account keeps your streaks, tracks every word you master, and
            opens full-screen play across all districts — in the world and the arcade.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link to="/signup" style={{ textDecoration: 'none' }}>
              <Btn variant="primary" size="lg" trailingIcon="arrow_forward">Start playing free</Btn>
            </Link>
            <a href={WORLD_URL} style={{ textDecoration: 'none' }}>
              <Btn variant="secondary" size="lg" trailingIcon="public"
                onClick={() => window.location.assign(WORLD_URL)}>Try the beta world</Btn>
            </a>
          </div>
        </section>

        {/* ── Footer ── */}
        <footer style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: 14, padding: '0 0 34px', fontSize: 11, color: T.textMute }}>
          <div style={{ letterSpacing: '0.24em', textTransform: 'uppercase' }}>
            © {new Date().getFullYear()} englishmetro.com — Warszawa → The World
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            <Link to="/pricing" style={{ color: T.textMute, textDecoration: 'none' }}>Pricing</Link>
            <Link to="/signup" style={{ color: T.textMute, textDecoration: 'none' }}>Sign up</Link>
            <Link to="/privacy" style={{ color: T.textMute, textDecoration: 'none' }}>Privacy</Link>
            <Link to="/cookies" style={{ color: T.textMute, textDecoration: 'none' }}>Cookies</Link>
            <Link to="/terms" style={{ color: T.textMute, textDecoration: 'none' }}>Terms</Link>
            <a href="mailto:hello@englishmetro.com" style={{ color: T.textMute, textDecoration: 'none' }}>Contact</a>
          </div>
        </footer>
      </div>

      {playing && <PlayOverlay game={playing} onClose={() => setPlaying(null)}/>}
    </div>
  )
}
