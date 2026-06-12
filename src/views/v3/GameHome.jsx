// GameHome — the public home page of englishmetro.com (2026-06-12).
//
// The site leads with PLAY: an instantly-playable featured game, a London
// Underground "departures board" of every game, and a stations grid. No
// student/school/admin framing anywhere — one "Sign in" and one "Play free"
// path. 3D games from the Fluent City arcade (src/practice/shells3d) appear
// automatically as build PRs land: the grid merges game3dRegistry at render
// time, and Wave-1 titles show as "arriving soon" until then.
//
// Anonymous play is free by design: every 2D shell falls back to its built-in
// demo puzzle when `puzzle` is undefined (the `?? DEMO_PUZZLE` ternary in each
// shell). After the first completed round we raise the sign-up CTA; the
// fullscreen control is also gated behind sign-up (Mike, SPEC 2026-06-06).
import { Suspense, lazy, useEffect, useMemo, useRef, useState, Component } from 'react'
import { Link } from 'react-router-dom'
import { FONT, G, EASE } from '../../design/v3/tokens.js'
import { Btn, Skyline } from '../../design/v3/primitives.jsx'
import { game3dRegistry } from '../../practice/shells3d/kit/registry'
import { usePrefersReducedMotion } from '../../practice/lib/usePrefersReducedMotion'
import './game-home.css'

// ── Dusk-always palette (the arcade never sees daylight) ──────────────────
const C = {
  bg: '#050309',
  text: '#F5F0FA',
  dim: 'rgba(228, 218, 244, 0.62)',
  mute: 'rgba(228, 218, 244, 0.38)',
  emerald: '#34D399',
  ember: '#FB923C',
  pink: '#D946EF',
  line: 'rgba(255,255,255,0.09)',
  amber: '#FFB347',
}

// ── The catalog — every playable 2D shell, as a metro "line" map ───────────
// Venue names follow src/practice/lib/shell-selector.ts. `load` mirrors the
// Shells map in StudentPractice so vite's manualChunks reuses the SAME
// one-chunk-per-shell outputs (no duplicate chunks).
const LINES = [
  {
    line: 'Arcade Line',
    color: '#D946EF',
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

// Featured cabinet candidates: arcade-feel shells that demo brilliantly cold.
const FEATURED_KEYS = ['balloonpop', 'snake', 'whackamole', 'spinthewheel', 'openthebox', 'mazechase', 'quizshow', 'battleship']

function StarField({ count = 70 }) {
  const stars = useMemo(() =>
    Array.from({ length: count }, (_, i) => ({
      left: ((i * 73) % 100), top: ((i * 37) % 62),
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

function SkylineBand() {
  return (
    <svg viewBox="0 0 1600 400" preserveAspectRatio="xMidYMax slice" aria-hidden
      style={{ position: 'absolute', bottom: 0, left: 0, right: 0, width: '100%', height: '52%',
        opacity: 0.4, pointerEvents: 'none' }}>
      <defs>
        <linearGradient id="ghsky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0A0618" stopOpacity="0"/>
          <stop offset="50%" stopColor="#12082A" stopOpacity="0.5"/>
          <stop offset="100%" stopColor="#1A0B3A" stopOpacity="1"/>
        </linearGradient>
      </defs>
      <g fill="url(#ghsky)">
        {[[0,280,80],[90,220,70],[170,260,60],[240,180,90],[340,240,65],[415,140,100],[525,200,75],
          [610,260,55],[675,120,85],[770,220,70],[850,260,60],[920,150,95],[1025,210,70],[1105,250,58],
          [1173,160,80],[1263,220,72],[1345,260,62],[1417,180,88],[1515,240,68],[1593,270,55],
        ].map(([x, y, h], i) => <rect key={i} x={x} y={y} width={h * 0.75} height={400 - y} rx="1"/>)}
      </g>
      <g fill="#FBCFE8" opacity={0.35}>
        {Array.from({ length: 60 }).map((_, i) => (
          <rect key={i} x={80 + (i * 27) % 1440} y={180 + (i * 17) % 200} width="2" height="3"/>
        ))}
      </g>
    </svg>
  )
}

// Ambient attract video: renders only if /home/attract.webm exists (the
// Hyperagent video directive delivers it). onError unmounts — zero risk.
function AttractVideo() {
  const [ok, setOk] = useState(true)
  const reduced = usePrefersReducedMotion()
  if (!ok || reduced) return null
  return (
    <video aria-hidden muted loop autoPlay playsInline preload="metadata"
      src="/home/attract.webm" poster="/home/attract-poster.jpg"
      onError={() => setOk(false)}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%',
        objectFit: 'cover', opacity: 0.26, pointerEvents: 'none' }}/>
  )
}

class ShellBoundary extends Component {
  constructor(props) { super(props); this.state = { broken: false } }
  static getDerivedStateFromError() { return { broken: true } }
  componentDidCatch(err) { console.error('[GameHome shell crashed]', err) }
  render() {
    if (this.state.broken) {
      return (
        <div style={{ padding: 48, textAlign: 'center', color: C.dim, fontFamily: FONT.body }}>
          <div style={{ fontSize: 34, marginBottom: 12 }}>🛠️</div>
          This station is under maintenance — pick another game.
        </div>
      )
    }
    return this.props.children
  }
}

// ── Full-screen play overlay ───────────────────────────────────────────────
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
        background: 'rgba(5, 3, 9, 0.96)', backdropFilter: 'blur(14px)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 20px', borderBottom: `1px solid ${C.line}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: game.color || C.pink, flex: 'none' }}/>
          <div style={{ fontFamily: FONT.display, fontWeight: 700, color: C.text, fontSize: 16,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {game.title}
            <span style={{ color: C.mute, fontWeight: 400, fontSize: 12, marginLeft: 10 }}>{game.venue || game.district}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button type="button" onClick={() => setShowCta(true)}
            aria-label="Fullscreen (free account)"
            style={{ background: 'transparent', border: `1px solid ${C.line}`, color: C.dim,
              borderRadius: 8, padding: '7px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>fullscreen</span>
          </button>
          <button type="button" onClick={onClose} aria-label="Close game"
            style={{ background: 'transparent', border: `1px solid ${C.line}`, color: C.dim,
              borderRadius: 8, padding: '7px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
        <ShellBoundary>
          <Suspense fallback={
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%',
              color: C.dim, fontFamily: FONT.mono, fontSize: 13, letterSpacing: '0.2em' }}>
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
              <div style={{ fontFamily: FONT.display, fontWeight: 700, fontSize: 24, color: C.text, marginBottom: 10 }}>
                {doneOnce ? 'Nice round.' : 'Go full screen?'}
              </div>
              <p style={{ color: C.dim, fontSize: 14, lineHeight: 1.6, margin: '0 0 22px' }}>
                {doneOnce
                  ? 'Create a free account to save your progress, build a streak, and unlock every district of the city.'
                  : 'Full-screen play comes with a free account — along with saved progress and streaks.'}
              </p>
              <Link to="/login" style={{ textDecoration: 'none' }}>
                <Btn variant="primary" size="lg" full trailingIcon="arrow_forward">Create free account</Btn>
              </Link>
              <button type="button" onClick={() => setShowCta(false)}
                style={{ marginTop: 14, background: 'transparent', border: 'none', color: C.mute,
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

// ── Departures board ───────────────────────────────────────────────────────
function DeparturesBoard({ onPlay }) {
  const playable3d = new Set(game3dRegistry.map((e) => e.shellKey))
  const rows = [
    ...game3dRegistry.map((e) => ({ key: `3d-${e.shellKey}`, title: e.title, dest: e.district,
      status: 'NOW PLAYING · 3D', live: true, game: { ...e, title: e.title, is3d: true, load3d: e.load, color: C.amber } })),
    ...ARRIVING.filter((a) => !playable3d.has(a.key)).map((a) => ({
      key: `soon-${a.key}`, title: a.title, dest: a.district, status: 'ARRIVING SOON · 3D', live: false })),
    ...ALL_GAMES.slice(0, 10).map((g) => ({ key: g.key, title: g.title, dest: g.venue, status: 'NOW PLAYING', live: true, game: g })),
  ]
  return (
    <div style={{ borderRadius: 18, overflow: 'hidden', border: `1px solid ${C.line}`,
      background: 'linear-gradient(180deg, rgba(14,9,30,0.92) 0%, rgba(8,5,18,0.95) 100%)',
      boxShadow: '0 30px 80px -30px rgba(0,0,0,0.8)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 22px', borderBottom: `1px solid ${C.line}`, background: 'rgba(217,70,239,0.05)' }}>
        <div style={{ fontFamily: FONT.mono, fontSize: 12, letterSpacing: '0.3em', color: C.amber }}>
          DEPARTURES — THE FLUENT CITY
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: FONT.mono,
          fontSize: 10, letterSpacing: '0.2em', color: C.emerald }}>
          <span className="gh-live-dot" style={{ width: 7, height: 7, borderRadius: '50%', background: C.emerald }}/>
          ALL LINES RUNNING
        </div>
      </div>
      <div role="list">
        {rows.map((r, i) => (
          <div role="listitem" key={r.key} className="gh-board-row"
            onClick={r.live && r.game ? () => onPlay(r.game) : undefined}
            onKeyDown={r.live && r.game ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPlay(r.game) } } : undefined}
            tabIndex={r.live && r.game ? 0 : -1}
            aria-label={r.live ? `Play ${r.title}` : `${r.title} — arriving soon`}
            style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.5fr) minmax(0,1fr) auto',
              gap: 12, alignItems: 'center', padding: '13px 22px',
              borderBottom: i < rows.length - 1 ? `1px solid rgba(255,255,255,0.05)` : 'none',
              cursor: r.live && r.game ? 'pointer' : 'default', opacity: r.live ? 1 : 0.55 }}>
            <div className="gh-flap" style={{ fontFamily: FONT.mono, fontSize: 14, fontWeight: 700,
              color: r.live ? C.text : C.dim, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {r.title}
            </div>
            <div style={{ fontFamily: FONT.mono, fontSize: 12, color: C.mute,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.dest}</div>
            <div style={{ fontFamily: FONT.mono, fontSize: 10, letterSpacing: '0.14em',
              color: r.live ? C.emerald : C.amber, whiteSpace: 'nowrap' }}>{r.status}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Featured cabinet (instantly playable hero game) ────────────────────────
function FeaturedCabinet({ game, onPlay }) {
  return (
    <div className="gh-cab" style={{ position: 'relative', borderRadius: 24,
      border: '1px solid rgba(217,70,239,0.3)', overflow: 'hidden',
      background: 'linear-gradient(180deg, rgba(30,20,60,0.6) 0%, rgba(12,7,28,0.85) 100%)',
      boxShadow: '0 40px 100px -30px rgba(217,70,239,0.35), 0 30px 60px -30px rgba(0,0,0,0.8)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 18px', borderBottom: `1px solid ${C.line}` }}>
        <div style={{ fontFamily: FONT.mono, fontSize: 10, letterSpacing: '0.28em', color: C.amber }}>
          ★ TONIGHT&apos;S FEATURE
        </div>
        <div style={{ fontFamily: FONT.mono, fontSize: 10, letterSpacing: '0.18em', color: C.mute }}>
          FREE PLAY · NO COIN NEEDED
        </div>
      </div>
      <div style={{ padding: '26px 24px 24px' }}>
        <div style={{ fontFamily: FONT.display, fontWeight: 700, fontSize: 30, color: C.text, lineHeight: 1.05 }}>
          {game.title}
        </div>
        <div style={{ marginTop: 6, fontSize: 13, color: C.dim }}>{game.venue} · {game.line}</div>
        <p style={{ margin: '14px 0 22px', fontSize: 14, color: C.dim, lineHeight: 1.55 }}>{game.blurb}</p>
        <Btn variant="primary" size="lg" full trailingIcon="play_arrow" onClick={() => onPlay(game)}>
          Play now — it&apos;s instant
        </Btn>
        <div style={{ marginTop: 12, textAlign: 'center', fontSize: 11, color: C.mute, letterSpacing: '0.08em' }}>
          No download. No sign-up to try.
        </div>
      </div>
    </div>
  )
}

export default function GameHome() {
  const [playing, setPlaying] = useState(null)
  const arcadeRef = useRef(null)
  const featured = useMemo(() => {
    const day = Math.floor(Date.now() / 86400000)
    const key = FEATURED_KEYS[day % FEATURED_KEYS.length]
    return ALL_GAMES.find((g) => g.key === key) || ALL_GAMES[0]
  }, [])
  const tickerNames = useMemo(() => {
    const names = [...ARRIVING.map((a) => `${a.title} — soon`), ...ALL_GAMES.map((g) => g.title)]
    return [...names, ...names] // doubled for a seamless -50% loop
  }, [])

  return (
    <div style={{ position: 'relative', minHeight: '100vh', background: C.bg, color: C.text,
      fontFamily: FONT.body, overflowX: 'hidden' }}>
      {/* Atmosphere */}
      <div aria-hidden style={{ position: 'absolute', inset: 0,
        background: `radial-gradient(ellipse 140% 80% at 50% 120%, rgba(139,92,246,0.28), transparent 60%),
          radial-gradient(ellipse 80% 60% at 80% 10%, rgba(217,70,239,0.16), transparent 60%),
          linear-gradient(180deg, #030208 0%, #0A0618 45%, #120929 100%)` }}/>
      <AttractVideo/>
      <StarField/>
      <SkylineBand/>

      <div style={{ position: 'relative', zIndex: 2, maxWidth: 1280, margin: '0 auto', padding: '0 24px' }}>
        {/* ── Header ── */}
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '22px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Skyline size={30}/>
            <div style={{ fontFamily: FONT.display, fontWeight: 700, fontSize: 19, letterSpacing: '-0.02em' }}>
              English <span style={{ background: G.brand, WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Metro</span>
              <span style={{ color: C.ember }}>.</span>
            </div>
          </div>
          <nav style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Link to="/login" style={{ textDecoration: 'none' }}>
              <Btn variant="ghost" size="md">Sign in</Btn>
            </Link>
            <Link to="/login" style={{ textDecoration: 'none' }}>
              <Btn variant="primary" size="md" trailingIcon="arrow_forward">Play free</Btn>
            </Link>
          </nav>
        </header>

        {/* ── Hero ── */}
        <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.15fr) minmax(0, 0.85fr)',
          gap: 56, alignItems: 'center', padding: '54px 0 70px' }}
          className="gh-hero-grid">
          <div style={{ minWidth: 0 }}>
            <div className="gh-rise gh-rise-1" style={{ fontFamily: FONT.body, fontSize: 11, fontWeight: 700,
              letterSpacing: '0.3em', textTransform: 'uppercase', color: C.emerald,
              marginBottom: 22, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <span className="gh-live-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: C.emerald }}/>
              The Fluent City · open all night
            </div>
            <h1 className="gh-rise gh-rise-2" style={{ fontFamily: FONT.display, fontWeight: 700,
              fontSize: 'clamp(44px, 6.5vw, 84px)', lineHeight: 0.98, letterSpacing: '-0.04em', margin: 0 }}>
              English is a city.
              <br/>
              <span style={{ background: G.brand, WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Play your way in</span>
              <span style={{ color: C.ember, textShadow: `0 0 20px ${C.ember}aa` }}>.</span>
            </h1>
            <p className="gh-rise gh-rise-3" style={{ marginTop: 26, fontSize: 'clamp(15px, 1.6vw, 18px)',
              color: C.dim, lineHeight: 1.6, maxWidth: 520 }}>
              Dozens of fast, beautiful word games set in a neon-lit London.
              Press play, learn real English, and watch new 3D districts open
              every week. Free to start — right now, right here.
            </p>
            <div className="gh-rise gh-rise-4" style={{ marginTop: 32, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              <Btn variant="primary" size="lg" trailingIcon="sports_esports"
                onClick={() => arcadeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
                Enter the arcade
              </Btn>
              <Link to="/login" style={{ textDecoration: 'none' }}>
                <Btn variant="ghost" size="lg">Create free account</Btn>
              </Link>
            </div>
          </div>
          <div className="gh-rise gh-rise-3" style={{ minWidth: 0 }}>
            <FeaturedCabinet game={featured} onPlay={setPlaying}/>
          </div>
        </section>

        {/* ── Ticker ── */}
        <div className="gh-ticker" style={{ overflow: 'hidden', borderTop: `1px solid ${C.line}`,
          borderBottom: `1px solid ${C.line}`, padding: '12px 0', marginBottom: 64 }}>
          <div className="gh-ticker-track">
            {tickerNames.map((n, i) => (
              <span key={i} style={{ fontFamily: FONT.mono, fontSize: 12, letterSpacing: '0.18em',
                textTransform: 'uppercase', color: i % 2 ? C.mute : C.dim, padding: '0 28px' }}>
                {n} <span style={{ color: C.pink, marginLeft: 28 }}>●</span>
              </span>
            ))}
          </div>
        </div>

        {/* ── Departures board ── */}
        <section style={{ marginBottom: 80 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
            flexWrap: 'wrap', gap: 12, marginBottom: 22 }}>
            <h2 style={{ fontFamily: FONT.display, fontWeight: 700, fontSize: 'clamp(26px, 3vw, 38px)',
              letterSpacing: '-0.03em', margin: 0 }}>
              Now departing
            </h2>
            <div style={{ fontSize: 12, color: C.mute, letterSpacing: '0.08em' }}>
              New 3D games land here as they ship — no app updates, ever.
            </div>
          </div>
          <DeparturesBoard onPlay={setPlaying}/>
        </section>

        {/* ── Stations grid ── */}
        <section ref={arcadeRef} style={{ scrollMarginTop: 24, paddingBottom: 30 }}>
          <h2 style={{ fontFamily: FONT.display, fontWeight: 700, fontSize: 'clamp(26px, 3vw, 38px)',
            letterSpacing: '-0.03em', margin: '0 0 8px' }}>
            Every station, every game
          </h2>
          <p style={{ color: C.dim, fontSize: 14, margin: '0 0 36px', maxWidth: 560 }}>
            Four lines. {ALL_GAMES.length} games tonight, and the 3D districts arriving with every update.
            Tap any station to play instantly.
          </p>

          {LINES.map((line) => (
            <div key={line.line} style={{ marginBottom: 44 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
                <span style={{ width: 26, height: 8, borderRadius: 999, background: line.color }}/>
                <div style={{ fontFamily: FONT.mono, fontSize: 12, letterSpacing: '0.3em',
                  textTransform: 'uppercase', color: C.dim }}>{line.line}</div>
                <div style={{ flex: 1, height: 1, background: C.line }}/>
              </div>
              <div style={{ display: 'grid', gap: 14,
                gridTemplateColumns: 'repeat(auto-fill, minmax(225px, 1fr))' }}>
                {line.games.map((g) => (
                  <button key={g.key} type="button" className="gh-card"
                    onClick={() => setPlaying({ ...g, color: line.color })}
                    aria-label={`Play ${g.title}`}
                    style={{ textAlign: 'left', cursor: 'pointer', borderRadius: 16,
                      border: `1px solid ${C.line}`, padding: '18px 18px 16px',
                      background: 'linear-gradient(180deg, rgba(30,20,60,0.34) 0%, rgba(12,7,28,0.5) 100%)',
                      color: C.text, fontFamily: FONT.body }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                      <span aria-hidden style={{ width: 14, height: 14, borderRadius: '50%',
                        border: `3px solid ${line.color}`, background: 'transparent', flex: 'none' }}/>
                      <span style={{ fontFamily: FONT.display, fontWeight: 700, fontSize: 16 }}>{g.title}</span>
                    </div>
                    <div style={{ fontSize: 11, color: C.mute, letterSpacing: '0.06em', marginBottom: 8 }}>{g.venue}</div>
                    <div style={{ fontSize: 12.5, color: C.dim, lineHeight: 1.5, minHeight: 36 }}>{g.blurb}</div>
                    <div className="gh-card-play" style={{ marginTop: 12, display: 'inline-flex', alignItems: 'center',
                      gap: 6, fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase',
                      color: line.color }}>
                      Play <span className="material-symbols-outlined" style={{ fontSize: 14 }}>arrow_forward</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </section>

        {/* ── Bottom CTA ── */}
        <section style={{ margin: '40px 0 90px', textAlign: 'center', padding: '64px 28px',
          borderRadius: 26, border: '1px solid rgba(217,70,239,0.25)',
          background: `radial-gradient(ellipse 90% 130% at 50% 130%, rgba(217,70,239,0.16), transparent 65%),
            linear-gradient(180deg, rgba(30,20,60,0.5) 0%, rgba(12,7,28,0.7) 100%)` }}>
          <div style={{ fontSize: 38, marginBottom: 14 }}>🦉</div>
          <h2 style={{ fontFamily: FONT.display, fontWeight: 700, fontSize: 'clamp(28px, 4vw, 46px)',
            letterSpacing: '-0.03em', margin: '0 0 12px' }}>
            The city remembers its players.
          </h2>
          <p style={{ color: C.dim, fontSize: 15, lineHeight: 1.6, maxWidth: 480, margin: '0 auto 28px' }}>
            A free account keeps your streaks, tracks every word you master, and
            opens full-screen play across all districts.
          </p>
          <Link to="/login" style={{ textDecoration: 'none' }}>
            <Btn variant="primary" size="lg" trailingIcon="arrow_forward">Start playing free</Btn>
          </Link>
        </section>

        {/* ── Footer ── */}
        <footer style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: 14, padding: '0 0 34px', fontSize: 11, color: C.mute }}>
          <div style={{ letterSpacing: '0.24em', textTransform: 'uppercase' }}>
            © {new Date().getFullYear()} englishmetro.com — Warszawa → The World
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            <Link to="/privacy" style={{ color: C.mute, textDecoration: 'none' }}>Privacy</Link>
            <Link to="/cookies" style={{ color: C.mute, textDecoration: 'none' }}>Cookies</Link>
            <Link to="/terms" style={{ color: C.mute, textDecoration: 'none' }}>Terms</Link>
            <a href="mailto:hello@englishmetro.com" style={{ color: C.mute, textDecoration: 'none' }}>Contact</a>
          </div>
        </footer>
      </div>

      {playing && <PlayOverlay game={playing} onClose={() => setPlaying(null)}/>}

      {/* Narrow screens: stack the hero (inline <style> keeps this file self-contained) */}
      <style>{`@media (max-width: 920px) { .gh-hero-grid { grid-template-columns: 1fr !important; gap: 36px !important; padding: 30px 0 50px !important; } }`}</style>
    </div>
  )
}
