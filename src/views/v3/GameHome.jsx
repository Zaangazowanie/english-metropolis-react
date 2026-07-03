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
import './game-home.css'

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

// ── The hero postcard: a living miniature of the open world ───────────────
// Pure SVG + CSS (GDPR-safe, zero assets): layered skyline, a metro train
// crossing the viaduct on a loop, twinkling windows at night, sun/moon and
// weather that follow the site theme, and a passport-style BETA stamp.
function CityPostcard({ mode, still }) {
  const night = mode !== 'day'
  const sky = night
    ? ['#0B0620', '#221040', '#5B2A86', '#B14E9B']
    : ['#7FB4E8', '#BFD9F2', '#F6CE8C', '#F49E5C']
  const backSil = night ? '#2A1650' : '#B58FC9'
  const frontSil = night ? '#150A30' : '#7E5CA8'
  const winOn = night ? '#FFD9A0' : '#FFF4DC'
  const trainBody = '#3FBF8F'
  const windows = useMemo(() =>
    Array.from({ length: 46 }, (_, i) => ({
      x: 28 + (i * 61) % 650, y: 236 + ((i * 29) % 96),
      d: (i % 7) * 0.7,
    })), [])
  return (
    <div className={`gh-postcard ${still ? 'gh-still' : ''}`} aria-hidden>
      <svg viewBox="0 0 720 430" style={{ display: 'block', width: '100%', height: 'auto' }}>
        <defs>
          <linearGradient id="ghp-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={sky[0]}/>
            <stop offset="46%" stopColor={sky[1]}/>
            <stop offset="78%" stopColor={sky[2]}/>
            <stop offset="100%" stopColor={sky[3]}/>
          </linearGradient>
          <radialGradient id="ghp-glow" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0%" stopColor={night ? '#F8E9C8' : '#FFF7E0'} stopOpacity="0.95"/>
            <stop offset="100%" stopColor={night ? '#F8E9C8' : '#FFD98A'} stopOpacity="0"/>
          </radialGradient>
          <clipPath id="ghp-clip"><rect x="0" y="0" width="720" height="430" rx="22"/></clipPath>
        </defs>
        <g clipPath="url(#ghp-clip)">
          <rect width="720" height="430" fill="url(#ghp-sky)"/>

          {/* celestial body */}
          <g className="gh-float">
            <circle cx="588" cy="86" r={night ? 30 : 42} fill="url(#ghp-glow)" opacity="0.9" transform="scale(2.2)" style={{ transformOrigin: '588px 86px' }}/>
            {night
              ? <path d="M 588 58 a 28 28 0 1 0 14 52 a 22 22 0 1 1 -14 -52" fill="#F6ECD4"/>
              : <circle cx="588" cy="86" r="26" fill="#FFE9B8"/>}
          </g>

          {night && (
            <g fill="#F9E8FF">
              {Array.from({ length: 26 }).map((_, i) => (
                <circle key={i} className="gh-twinkle" cx={(i * 137) % 700 + 10} cy={(i * 53) % 150 + 12}
                  r={i % 3 ? 1.1 : 1.7} style={{ animationDelay: `${(i % 8) * 0.5}s` }}/>
              ))}
            </g>
          )}
          {!night && (
            <g stroke="#5F5780" strokeWidth="2" fill="none" opacity="0.55">
              <path d="M 120 92 q 8 -9 16 0 q 8 -9 16 0"/>
              <path d="M 186 64 q 6 -7 12 0 q 6 -7 12 0"/>
            </g>
          )}

          {/* skyline — back rank */}
          <g fill={backSil} opacity="0.75">
            {[[0,206,58],[52,178,44],[112,222,66],[168,150,52],[224,196,60],[300,132,72],[362,208,48],[420,168,58],[488,190,64],[540,140,54],[600,212,60],[656,178,64]
            ].map(([x, y, w], i) => <rect key={i} x={x} y={y} width={w} height={430 - y} rx="2"/>)}
            <circle cx="336" cy="120" r="9"/>
            <rect x="332" y="120" width="8" height="30"/>
          </g>

          {/* skyline — front rank */}
          <g fill={frontSil}>
            {[[8,262,74],[92,232,58],[160,276,88],[258,244,70],[338,286,64],[412,238,84],[506,268,72],[588,246,92],[688,270,32]
            ].map(([x, y, w], i) => <rect key={i} x={x} y={y} width={w} height={430 - y} rx="3"/>)}
            {/* clock tower */}
            <rect x="452" y="176" width="26" height="80" rx="2"/>
            <polygon points="452,176 465,152 478,176"/>
            <circle cx="465" cy="196" r="8" fill={night ? '#FFEBC4' : '#FDF3DE'} opacity="0.95"/>
          </g>

          {/* windows */}
          <g fill={winOn} opacity={night ? 1 : 0.55}>
            {windows.map((w, i) => (
              <rect key={i} className={night ? 'gh-win' : undefined} x={w.x} y={w.y} width="4.5" height="6"
                style={night ? { animationDelay: `${w.d}s` } : undefined}/>
            ))}
          </g>

          {/* viaduct */}
          <g>
            <rect x="0" y="352" width="720" height="18" fill={frontSil}/>
            <g fill={night ? '#0E0724' : '#6A4B94'}>
              {Array.from({ length: 12 }).map((_, i) => (
                <path key={i} d={`M ${i * 62} 430 v -48 a 24 24 0 0 1 48 0 v 48 z`}/>
              ))}
            </g>
          </g>

          {/* the metro train, forever bound for the next district */}
          <g className="gh-train">
            <rect x="-6" y="330" width="190" height="26" rx="12" fill={trainBody}/>
            <rect x="-6" y="330" width="190" height="10" rx="5" fill="#FFFFFF" opacity="0.28"/>
            {[14, 46, 78, 110, 142].map((x, i) => (
              <rect key={i} x={x} y="337" width="18" height="11" rx="3" fill={night ? '#FFF3D0' : '#F0FBFF'} opacity="0.95"/>
            ))}
            <circle cx="182" cy="343" r="5" fill="#FFE9A8"/>
            {night && <ellipse cx="204" cy="343" rx="20" ry="7" fill="#FFE9A8" opacity="0.35"/>}
          </g>

          {/* lamppost + glow */}
          <g>
            <rect x="656" y="300" width="4" height="54" fill={frontSil}/>
            <circle cx="658" cy="296" r="6" fill={winOn}/>
            {night && <circle cx="658" cy="296" r="20" fill="url(#ghp-glow)" opacity="0.7"/>}
          </g>
        </g>

        {/* postcard frame */}
        <rect x="1.5" y="1.5" width="717" height="427" rx="21" fill="none"
          stroke={night ? 'rgba(255,255,255,0.22)' : 'rgba(16,10,40,0.18)'} strokeWidth="3"/>
      </svg>

      {/* passport-style beta stamp */}
      <div className="gh-stamp" style={{ borderColor: night ? 'rgba(255,217,160,0.8)' : 'rgba(124,45,18,0.55)',
        color: night ? '#FFD9A0' : '#7C2D12' }}>
        OPEN WORLD<br/>· BETA ·
      </div>
      <div className="gh-postcard-caption">
        <span className="gh-live-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: '#34D399', display: 'inline-block' }}/>
        &nbsp;44 districts · 3 metro lines · live now
      </div>
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
              <Link to="/login" style={{ textDecoration: 'none' }}>
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
function BetaPill({ T }) {
  return (
    <span className="gh-beta-pill" style={{ color: '#fff', border: '1px solid rgba(255,255,255,0.35)' }}>
      BETA
    </span>
  )
}

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

      <div style={{ position: 'relative', zIndex: 2, maxWidth: 1280, margin: '0 auto', padding: '0 24px' }}>
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
            <Link to="/lessons" style={{ textDecoration: 'none' }}>
              <Btn variant="ghost" size="md">Lessons</Btn>
            </Link>
            <Link to="/login" style={{ textDecoration: 'none' }}>
              <Btn variant="ghost" size="md">Sign in</Btn>
            </Link>
            <ThemeToggle mode={mode} setMode={setMode} T={T}/>
            {/* NB: a <button> nested in an <a> does NOT activate the link —
                every Btn that leads to the world navigates via onClick. */}
            <a href={WORLD_URL} style={{ textDecoration: 'none' }}>
              <Btn variant="primary" size="md" trailingIcon="play_arrow"
                onClick={() => window.location.assign(WORLD_URL)}
                style={{ whiteSpace: 'nowrap' }}>Play the World</Btn>
            </a>
          </nav>
        </header>

        {/* ── Hero: the open world ── */}
        <section className="gh-hero-grid" style={{ display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.02fr) minmax(0, 0.98fr)',
          gap: 52, alignItems: 'center', padding: '46px 0 64px' }}>
          <div style={{ minWidth: 0 }}>
            <div className="gh-rise gh-rise-1" style={{ display: 'inline-flex', alignItems: 'center', gap: 10,
              marginBottom: 20 }}>
              <BetaPill T={T}/>
              <span style={{ fontFamily: FONT.mono, fontSize: 11, fontWeight: 700, letterSpacing: '0.3em',
                textTransform: 'uppercase', color: T.emerald }}>
                open world · now boarding
              </span>
            </div>
            <h1 className="gh-rise gh-rise-2" style={{ fontFamily: FONT.display, fontWeight: 700,
              fontSize: 'clamp(42px, 6.4vw, 82px)', lineHeight: 0.98, letterSpacing: '-0.04em', margin: 0 }}>
              One city.
              <br/>
              <span style={{ background: G.brand, WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Every English</span>
              <span style={{ color: T.ember }}>.</span>
            </h1>
            <p className="gh-rise gh-rise-3" style={{ marginTop: 24, fontSize: 'clamp(15px, 1.6vw, 18px)',
              color: T.textDim, lineHeight: 1.65, maxWidth: 540 }}>
              Walk into <b style={{ color: T.textSoft }}>EnglishMetro World</b> — a living, open city
              with 44 dialect districts on three metro lines. Talk to the locals, take their
              grammar challenges, answer with your voice, and learn the English people
              actually speak. Free in your browser — no download.
            </p>
            <div className="gh-rise gh-rise-4" style={{ marginTop: 30, display: 'flex', gap: 14,
              flexWrap: 'wrap', alignItems: 'center' }}>
              <a href={WORLD_URL} style={{ textDecoration: 'none' }}>
                <Btn variant="primary" size="lg" trailingIcon="arrow_forward"
                  onClick={() => window.location.assign(WORLD_URL)}
                  style={{ fontSize: 15, padding: '18px 32px' }}>
                  ▶&nbsp; Play the World — free beta
                </Btn>
              </a>
              <Btn variant="secondary" size="lg" trailingIcon="expand_more" onClick={scrollToPractice}>
                Quick practice instead
              </Btn>
            </div>
            <div className="gh-rise gh-rise-4" style={{ marginTop: 22, display: 'flex', gap: 18, flexWrap: 'wrap' }}>
              {['44 dialect districts', 'voice answers', 'quests & XP', 'runs on any laptop'].map((f) => (
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
            <a href={WORLD_URL} aria-label="Play EnglishMetro World — open beta"
              style={{ textDecoration: 'none', display: 'block' }}>
              <div className="gh-hero-frame">
                <CityPostcard mode={mode} still={reduced}/>
                <div className="gh-hero-cta" style={{ fontFamily: FONT.display }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 20 }}>play_arrow</span>
                  Step into the city
                </div>
              </div>
            </a>
          </div>
        </section>

        {/* ── Two ways in ── */}
        <section style={{ paddingBottom: 58 }}>
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
            <Link to="/login" style={{ textDecoration: 'none' }}>
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
            <Link to="/lessons" style={{ color: T.textMute, textDecoration: 'none' }}>Lessons</Link>
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
