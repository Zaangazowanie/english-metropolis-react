// MazeChase3D — "Topiary Gardens / The Hedge Maze" (WAVE-2 pastel reference).
//
// A three.js presentation of the canonical 2D Maze Chase shell. WAVE-2 = ART
// layer only: the bright, pastel, HAND-DRAWN look (toon + ink outlines +
// painted sky + boiling line) via the shared GameKit pipeline (kit/paper).
// The DATA CONTRACT is unchanged (generateMazeChase in; SessionResult out:
// { correctCount, totalQuestions, durationMs, shellKey:'mazechase' }) and the
// gameplay is the one Mike approved (no answer reveal, wardens contest the
// path with friction only, Bajla teach-on-wrong).
//
// THEME IS SWAPPABLE: the `TOPIARY` object below holds the palette + prop
// choices; the render pipeline (kit/paper) is theme-agnostic, so flipping to a
// moonlit-pastel variant is a one-object change. Bajla is a PIGEON (the
// app-wide animated pigeon avatar wires into primitives.tsx later via R&D's
// bajla_avatar_kit; here she is the DOM teach-card pigeon glyph).
//
// Hard rules: no new deps, no external URLs, procedural-only, single CityStage
// canvas (DPR≤1.5), reducedMotion (boiling/clouds/drift off), English-in-DOM
// over an AA scrim, a11y. Bloom dropped — toon+ink is cheaper. CI game3d-gate
// is the budget authority.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Color, MathUtils, Object3D, Vector3 } from 'three'
import type { Group, InstancedMesh, PerspectiveCamera, PointLight } from 'three'
import {
  CityStage, InkOutline, PaperPost, PastelSky, toonRamp, useGameLoop, useStageQuality,
} from './kit'
import type { PaperTheme } from './kit'
import type { Game3DProps, SessionResult, Vocab3DItem } from './types'
import { generateMazeChasePuzzle } from '../generators/generateMazeChase'
import type { ArcadeInput, ArcadePuzzle, ArcadeRound } from '../generators/generateArcade'

// ── Canonical grid + timing (identical to the 2D shell) ──────────────────
const COLS = 13
const ROWS = 11
const ADVANCE_MS = 1100
const STEP_MS = 110
const STUN_MS = 450
const BUMP_COOLDOWN_MS = 900
const HINT_MAX = 2 // (1) rephrase clue, (2) eliminate one distractor — never the answer

// Post-selection FEEDBACK colours only (NOT pre-reveal affordances).
const OK = '#4f9e6a' // success green flash
const NO = '#e98a7a' // wrong coral flash

// ── Theme (SWAPPABLE) — palette + props isolated from the pipeline. Flip this
// one object for a moonlit-pastel variant; the pipeline stays generic. ─────
interface MazeTheme {
  paper: PaperTheme
  pathA: string
  pathB: string
  hedgeTop: string
  hedgeBot: string
  hedgeCap: string
  post: string // signpost wood
  board: string // signpost board
  warden: string
  player: string
  playerGlow: string
  pollen: string
  ui: string // DOM chrome accent
}
const TOPIARY: MazeTheme = {
  paper: {
    ink: '#33304a', paper: '#fbf3e0', liftAmt: 0.16, paperTint: '#fdf4ea',
    grain: 0.03, posterize: true, skyTop: '#8fd0e8', skyBottom: '#eaf6ec', cloud: '#ffffff',
  },
  pathA: '#efe2c2', pathB: '#e7d8b4',
  hedgeTop: '#8ed49a', hedgeBot: '#4f9e6a', hedgeCap: '#b9e7a6',
  post: '#c8a26a', board: '#9a6a44',
  warden: '#62b884', player: '#ffce7d', playerGlow: '#fff1b8',
  pollen: '#ffe7a8', ui: '#3f8f63',
}

// Maze layout — 1 = hedge (wall), 0 = path. COPIED BYTE-FOR-BYTE from the 2D
// shell so corridor topology + every reachable cell match exactly.
const MAZE: number[][] = [
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1],
  [1, 0, 1, 0, 1, 0, 1, 0, 0, 0, 1, 0, 1],
  [1, 0, 1, 0, 0, 0, 1, 0, 1, 0, 1, 0, 1],
  [1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 1],
  [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0, 0, 1],
  [1, 0, 1, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1],
  [1, 0, 1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
]

type Cell = { r: number; c: number }
type Dir = 'up' | 'down' | 'left' | 'right'
const START: Cell = { r: 1, c: 1 }
const isOpen = (r: number, c: number): boolean =>
  r >= 0 && r < ROWS && c >= 0 && c < COLS && MAZE[r][c] === 0

interface Token {
  cell: Cell
  optionIdx: number
  word: string
  isAnswer: boolean
  eaten: boolean
}

const CELL = 0.62
const HALF_W = (COLS * CELL) / 2
const HALF_D = (ROWS * CELL) / 2
const worldX = (c: number): number => (c + 0.5) * CELL - HALF_W
const worldZ = (r: number): number => (r + 0.5) * CELL - HALF_D

// Built-in demo puzzle — verbatim from the 2D shell (anonymous play).
const DEMO_PUZZLE: ArcadePuzzle = {
  rounds: [
    { id: 'mz1', prompt: 'A small narrow street with shops on both sides.', options: ['arcade', 'plaza', 'cellar', 'spire'], answerIndex: 0, hint: 'Often glass-roofed; Victorian shopping streets.', hint_pl: 'pasaż' },
    { id: 'mz2', prompt: 'Stones laid as paving on an old street.', options: ['cobbles', 'pebbles', 'planks', 'tiles'], answerIndex: 0, hint: 'Round, rough, hard to walk in heels.', hint_pl: 'kocie łby' },
    { id: 'mz3', prompt: 'A passage between two buildings.', options: ['alley', 'attic', 'plinth', 'gable'], answerIndex: 0, hint: 'Cats live there; bins are kept there.', hint_pl: 'zaułek' },
    { id: 'mz4', prompt: 'A pool of light from a streetlight.', options: ['glow', 'shadow', 'plinth', 'beacon'], answerIndex: 0, hint: 'The bright circle on the pavement at night.', hint_pl: 'blask' },
    { id: 'mz5', prompt: 'A wall painted with art.', options: ['mural', 'fresco', 'lintel', 'awning'], answerIndex: 0, hint: 'Big urban paintings; often political.', hint_pl: 'mural' },
  ],
}

function maskAnswerInPrompt(prompt: string | undefined, answer: string | undefined): string {
  if (!prompt) return ''
  if (!answer) return prompt
  const ans = answer.toLowerCase().trim()
  if (!ans) return prompt
  const safe = ans.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return prompt.replace(new RegExp(`\\b${safe}\\b`, 'gi'), '___')
}

// Teach-on-wrong — client-side template from the clue/answer meaning (no
// backend change). Faithful: re-anchors on what the clue points to; never
// asserts a meaning for the distractor. FUTURE hook: if a per-distractor
// rationale map ever ships on the round, prefer it here.
const TEACH_INTROS = ['Coo — not that one.', 'Mind the clue.', 'Close, but no.', 'Look again.']
function explainWrong(round: ArcadeRound, chosenWord: string, attempt: number): string {
  const answer = round.options[round.answerIndex]
  const intro = TEACH_INTROS[attempt % TEACH_INTROS.length]
  const clue = (round.hint || '').trim()
  const clueBit = clue ? ` — ${clue.replace(/\.$/, '')}` : ''
  return `${intro} “${chosenWord}” doesn’t match this clue. “${round.prompt}” points to “${answer}”${clueBit}. Read it again and pick the word that fits.`
}

// Deterministic token placement — IDENTICAL seeding + filter to the 2D shell.
function placeTokens(round: ArcadeRound): Token[] {
  const all: Cell[] = []
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (MAZE[r][c] === 0) all.push({ r, c })
  const farFromStart = all.filter((c) => Math.abs(c.r - START.r) + Math.abs(c.c - START.c) >= 4)
  let seed = (round.id.split('').reduce((a, ch) => a + ch.charCodeAt(0), 0) * 2654435761) >>> 0
  const detRand = (): number => {
    seed = (seed + 0x6d2b79f5) >>> 0
    let t = seed
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  for (let i = farFromStart.length - 1; i > 0; i--) {
    const j = Math.floor(detRand() * (i + 1))
    ;[farFromStart[i], farFromStart[j]] = [farFromStart[j], farFromStart[i]]
  }
  return round.options.map((opt, oi) => ({
    cell: farFromStart[oi] ?? all[oi + 5] ?? { r: 5, c: 5 },
    optionIdx: oi,
    word: opt,
    isAnswer: oi === round.answerIndex,
    eaten: false,
  }))
}

const vocabToArcade = (v: Vocab3DItem[]): ArcadeInput[] =>
  v.map((it) => ({ word: it.word, word_pl: it.word_pl ?? '', clue: it.exampleEn, partOfSpeech: it.partOfSpeech, topic: it.topic }))

// Allocation-free scratch (single canvas, single game instance).
const _pos = new Vector3()
const _obj = new Object3D()
const _col = new Color()
const _hedgeTop = new Color(TOPIARY.hedgeTop)
const _hedgeBot = new Color(TOPIARY.hedgeBot)
const _pathA = new Color(TOPIARY.pathA)
const _pathB = new Color(TOPIARY.pathB)
const _playerWorld = new Vector3()

interface GameState {
  pos: Cell
  prev: Cell
  stepAt: number
  stunUntil: number
}

export default function MazeChase3D(props: Game3DProps) {
  return <MazeChase3DImpl {...props} />
}

function MazeChase3DImpl({ puzzle, vocab, onSessionComplete, quality, reducedMotion, fullscreen }: Game3DProps) {
  const prefersReduced = usePrefersReducedMotion()
  const reduce = reducedMotion ?? prefersReduced
  const theme = TOPIARY

  const activePuzzle = useMemo<ArcadePuzzle>(() => {
    const p = puzzle as ArcadePuzzle | undefined
    if (p && Array.isArray(p.rounds) && p.rounds.length > 0) return p
    if (vocab && vocab.length > 0) {
      const gen = generateMazeChasePuzzle(vocabToArcade(vocab), { seed: 7 })
      if (gen && gen.rounds.length > 0) return gen
    }
    return DEMO_PUZZLE
  }, [puzzle, vocab])
  const rounds = activePuzzle.rounds
  const total = rounds.length

  const game = useRef<GameState>({ pos: { ...START }, prev: { ...START }, stepAt: performance.now(), stunUntil: 0 })
  const labelRefs = useRef<(HTMLDivElement | null)[]>([])
  const startMs = useRef(performance.now())
  const fired = useRef(false)
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const teachTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastBumpAt = useRef(0)

  const [roundIdx, setRoundIdx] = useState(0)
  const [solved, setSolved] = useState<boolean[]>(() => rounds.map(() => false))
  const [tokens, setTokens] = useState<Token[]>([])
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null)
  const [missCount, setMissCount] = useState(0) // telemetry only — NOT in SessionResult
  const [bumpCount, setBumpCount] = useState(0) // telemetry only — NOT in SessionResult
  const [hintsUsed, setHintsUsed] = useState(0)
  const [clueExpanded, setClueExpanded] = useState(false)
  const [teach, setTeach] = useState<string | null>(null)
  const [stunned, setStunned] = useState(false)
  const [live, setLive] = useState('')

  const lampLevel = Math.max(0.35, 1 - missCount * 0.1)
  const cur = rounds[roundIdx]
  const completed = total > 0 && solved.every(Boolean)
  const correctCount = solved.filter(Boolean).length
  const answerWord = cur ? cur.options[cur.answerIndex] : ''
  const renderedPrompt = useMemo(() => maskAnswerInPrompt(cur?.prompt, answerWord), [cur?.prompt, answerWord])

  useEffect(() => {
    if (!cur) return
    const placed = placeTokens(cur)
    game.current.pos = { ...START }
    game.current.prev = { ...START }
    game.current.stepAt = performance.now()
    game.current.stunUntil = 0
    setTokens(placed)
    setFeedback(null)
    setClueExpanded(false)
    setTeach(null)
    setStunned(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundIdx, cur?.id])

  const moveOne = useCallback((d: Dir) => {
    if (completed) return
    if (performance.now() < game.current.stunUntil) return
    const g = game.current
    const next: Cell = { r: g.pos.r, c: g.pos.c }
    if (d === 'up') next.r -= 1
    else if (d === 'down') next.r += 1
    else if (d === 'left') next.c -= 1
    else next.c += 1
    if (!isOpen(next.r, next.c)) return
    g.prev = { ...g.pos }
    g.pos = next
    g.stepAt = performance.now()

    const tok = tokens.find((t) => !t.eaten && t.cell.r === next.r && t.cell.c === next.c)
    if (!tok) return
    if (tok.isAnswer) {
      setFeedback('correct')
      setSolved((arr) => arr.map((v, i) => (i === roundIdx ? true : v)))
      setTokens((arr) => arr.map((p) => (p.optionIdx === tok.optionIdx ? { ...p, eaten: true } : p)))
      setTeach(null)
      setLive(`Correct — “${tok.word}” fits the clue.`)
      if (advanceTimer.current) clearTimeout(advanceTimer.current)
      advanceTimer.current = setTimeout(() => setRoundIdx((i) => (i + 1 < total ? i + 1 : i)), ADVANCE_MS)
    } else {
      setFeedback('wrong')
      setMissCount((m) => m + 1)
      setTokens((arr) => arr.map((p) => (p.optionIdx === tok.optionIdx ? { ...p, eaten: true } : p)))
      const text = cur ? explainWrong(cur, tok.word, missCount) : ''
      setTeach(text)
      setLive(text)
      if (teachTimer.current) clearTimeout(teachTimer.current)
      teachTimer.current = setTimeout(() => { setTeach(null); setFeedback(null) }, 6000)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokens, roundIdx, total, completed, cur, missCount])

  const onWardenBump = useCallback(() => {
    const now = performance.now()
    if (now - lastBumpAt.current < BUMP_COOLDOWN_MS) return
    lastBumpAt.current = now
    setBumpCount((b) => b + 1)
    setStunned(true)
    setLive('A hedge warden blocks your path — wait a moment.')
    window.setTimeout(() => setStunned(false), STUN_MS)
  }, [])

  useGameLoop(() => {}, undefined, { stepMs: STEP_MS, running: !completed, reducedMotion: reduce })

  useEffect(() => {
    if (completed && !fired.current) {
      fired.current = true
      setLive('You reached the garden gate.')
      const result: SessionResult = {
        correctCount,
        totalQuestions: total,
        durationMs: Math.round(performance.now() - startMs.current),
        shellKey: 'mazechase',
      }
      onSessionComplete?.(result)
    }
  }, [completed, correctCount, total, onSessionComplete])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const map: Record<string, Dir | undefined> = {
        ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
        w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right',
      }
      const dir = map[e.key]
      if (dir) { e.preventDefault(); moveOne(dir) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [moveOne])

  useEffect(() => () => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current)
    if (teachTimer.current) clearTimeout(teachTimer.current)
  }, [])

  const useHint = useCallback(() => {
    if (hintsUsed >= HINT_MAX || completed) return
    if (hintsUsed === 0) {
      setClueExpanded(true)
      setHintsUsed(1)
      setLive('Hint: the clue, in other words.')
      return
    }
    setTokens((arr) => {
      const victim = arr.find((t) => !t.isAnswer && !t.eaten)
      if (!victim) return arr
      setLive(`Hint: “${victim.word}” is ruled out.`)
      return arr.map((t) => (t.optionIdx === victim.optionIdx ? { ...t, eaten: true } : t))
    })
    setHintsUsed(2)
  }, [hintsUsed, completed])

  const skip = useCallback(() => setRoundIdx((i) => (i + 1 < total ? i + 1 : i)), [total])

  const replay = useCallback(() => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current)
    if (teachTimer.current) clearTimeout(teachTimer.current)
    fired.current = false
    startMs.current = performance.now()
    setSolved(rounds.map(() => false))
    setMissCount(0)
    setBumpCount(0)
    setHintsUsed(0)
    setClueExpanded(false)
    setFeedback(null)
    setTeach(null)
    setLive('')
    setRoundIdx(0)
  }, [rounds])

  const touch = useRef<{ x: number; y: number } | null>(null)
  const onTouchStart = (e: React.TouchEvent) => { const t = e.touches[0]; touch.current = { x: t.clientX, y: t.clientY } }
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!touch.current) return
    const t = e.changedTouches[0]
    const dx = t.clientX - touch.current.x
    const dy = t.clientY - touch.current.y
    if (Math.abs(dx) < 28 && Math.abs(dy) < 28) { touch.current = null; return }
    if (Math.abs(dx) > Math.abs(dy)) moveOne(dx > 0 ? 'right' : 'left')
    else moveOne(dy > 0 ? 'down' : 'up')
    touch.current = null
  }

  const overlay = (
    <Overlay
      theme={theme}
      cur={cur}
      total={total}
      roundIdx={roundIdx}
      correctCount={correctCount}
      renderedPrompt={renderedPrompt}
      clueExpanded={clueExpanded}
      teach={teach}
      stunned={stunned}
      feedback={feedback}
      bumpCount={bumpCount}
      hintsUsed={hintsUsed}
      completed={completed}
      live={live}
      tokens={tokens}
      labelRefs={labelRefs}
      onHint={useHint}
      onSkip={skip}
      onMove={moveOne}
      onReplay={replay}
    />
  )

  return (
    <div
      role="application"
      aria-label="Topiary Gardens hedge maze — read the clue and steer to the signpost that fits; hedge wardens patrol the paths"
      style={{ position: 'relative', width: '100%', height: '100%', minHeight: 320 }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <CityStage
        quality={quality}
        reducedMotion={reduce}
        fullscreen={fullscreen}
        cameraPosition={[0, 8.6, 6.2]}
        cameraFov={32}
        overlay={overlay}
      >
        <GardenScene
          game={game}
          tokens={tokens}
          feedback={feedback}
          reducedMotion={reduce}
          lampLevel={lampLevel}
          labelRefs={labelRefs}
          onWardenBump={onWardenBump}
          theme={theme}
        />
      </CityStage>
    </div>
  )
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mq.matches)
    const on = () => setReduced(mq.matches)
    mq.addEventListener?.('change', on)
    return () => mq.removeEventListener?.('change', on)
  }, [])
  return reduced
}
// =========================================================================
// Scene
// =========================================================================
interface SceneProps {
  game: React.MutableRefObject<GameState>
  tokens: Token[]
  feedback: 'correct' | 'wrong' | null
  reducedMotion: boolean
  lampLevel: number
  labelRefs: React.MutableRefObject<(HTMLDivElement | null)[]>
  onWardenBump: () => void
  theme: MazeTheme
}

function GardenScene({ game, tokens, feedback, reducedMotion, lampLevel, labelRefs, onWardenBump, theme }: SceneProps) {
  const { settings, tier } = useStageQuality()
  const highFx = tier === 'high' && !reducedMotion
  return (
    <group>
      <CameraRig drift={highFx} reducedMotion={reducedMotion} />
      <DaylightRig shadows={settings.shadows} />
      <PastelSky theme={theme.paper} reducedMotion={reducedMotion} />

      <GardenPath shadows={settings.shadows} theme={theme} />
      <Hedges theme={theme} />
      {settings.particles > 0 && <Pollen density={settings.particles} reducedMotion={reducedMotion} theme={theme} />}
      {tier !== 'low' && <TopiaryWardens game={game} reducedMotion={reducedMotion} onBump={onWardenBump} shadows={settings.shadows} theme={theme} />}

      <Signposts tokens={tokens} shadows={settings.shadows} theme={theme} />
      <LabelProjector tokens={tokens} labelRefs={labelRefs} />
      <PlayerLantern game={game} reducedMotion={reducedMotion} lampLevel={lampLevel} highFx={highFx} feedback={feedback} theme={theme} />

      {tier !== 'low' && <PaperPost theme={theme.paper} />}
    </group>
  )
}

// Bright high-key daylight rig (toon needs a clear key to band). Layers over
// CityStage's ambient; warm key + cool sky-fill + soft rim.
function DaylightRig({ shadows }: { shadows: boolean }) {
  return (
    <>
      <ambientLight intensity={0.75} color={'#fff6e8'} />
      <hemisphereLight args={['#bfe9ff', '#d8edcf', 0.6]} />
      <directionalLight
        position={[-5, 8, 4]}
        intensity={1.15}
        color={'#fff3d6'}
        castShadow={shadows}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-near={1}
        shadow-camera-far={28}
        shadow-camera-left={-8}
        shadow-camera-right={8}
        shadow-camera-top={8}
        shadow-camera-bottom={-8}
        shadow-bias={-0.0005}
      />
      <directionalLight position={[6, 4, -3]} intensity={0.35} color={'#bcd8ff'} />
    </>
  )
}

function CameraRig({ drift, reducedMotion }: { drift: boolean; reducedMotion: boolean }) {
  const cam = useThree((s) => s.camera) as PerspectiveCamera
  const base = useRef<[number, number, number]>([0, 8.6, 6.2])
  const settled = useRef(0)
  useFrame((state, delta) => {
    const [bx, by, bz] = base.current
    settled.current = Math.min(1, settled.current + delta / 1.2)
    const ease = reducedMotion ? 1 : 1 - Math.pow(1 - settled.current, 3)
    let x = bx
    let y = MathUtils.lerp(by + 1.6, by, ease)
    let z = MathUtils.lerp(bz + 1.4, bz, ease)
    if (drift && !reducedMotion && settled.current >= 1) {
      const t = state.clock.elapsedTime
      x += Math.sin(t * 0.16) * 0.22
      y += Math.sin(t * 0.12) * 0.08
      z += Math.cos(t * 0.14) * 0.12
    }
    cam.position.set(x, y, z)
    cam.lookAt(0, 0, 0)
  })
  return null
}

// Procedural soft contact/blob shadow (radial-alpha, no texture/URL).
function BlobShadow({ position, radius = 0.3, strength = 0.45 }: { position: [number, number, number]; radius?: number; strength?: number }) {
  const uniforms = useMemo(() => ({ uStrength: { value: strength } }), [strength])
  return (
    <mesh position={position} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[radius, 24]} />
      <shaderMaterial
        transparent
        depthWrite={false}
        toneMapped={false}
        uniforms={uniforms}
        vertexShader={'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }'}
        fragmentShader={'varying vec2 vUv; uniform float uStrength; void main(){ float d = distance(vUv, vec2(0.5)); float a = smoothstep(0.5, 0.04, d) * uStrength; gl_FragColor = vec4(0.16, 0.22, 0.14, a); }'}
      />
    </mesh>
  )
}
// Garden path — grass base slab + instanced cream gravel tiles over open cells.
function GardenPath({ shadows, theme }: { shadows: boolean; theme: MazeTheme }) {
  const tiles = useRef<InstancedMesh>(null)
  const open = useMemo(() => {
    const out: Cell[] = []
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (MAZE[r][c] === 0) out.push({ r, c })
    return out
  }, [])
  useEffect(() => {
    const mesh = tiles.current
    if (!mesh) return
    open.forEach((cell, i) => {
      _obj.position.set(worldX(cell.c), 0.02, worldZ(cell.r))
      _obj.rotation.set(0, 0, 0)
      _obj.scale.set(1, 1, 1)
      _obj.updateMatrix()
      mesh.setMatrixAt(i, _obj.matrix)
      _col.lerpColors(_pathA, _pathB, ((cell.r * 5 + cell.c * 3) % 4) / 4)
      mesh.setColorAt(i, _col)
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [open])
  return (
    <group>
      {/* Grass base slab */}
      <mesh position={[0, -0.12, 0]} receiveShadow={shadows}>
        <boxGeometry args={[COLS * CELL + 1.4, 0.24, ROWS * CELL + 1.4]} />
        <meshToonMaterial color={theme.hedgeBot} gradientMap={toonRamp} />
      </mesh>
      {/* Cream gravel path tiles */}
      <instancedMesh ref={tiles} args={[undefined, undefined, open.length]} frustumCulled={false} receiveShadow={shadows}>
        <boxGeometry args={[CELL * 0.98, 0.05, CELL * 0.98]} />
        <meshToonMaterial gradientMap={toonRamp} vertexColors />
      </instancedMesh>
    </group>
  )
}

// Hedges — instanced clipped-hedge blocks (vertex gradient bottom→top) + a
// lighter trimmed cap row. Ink outlines come from PaperPost's depth edges.
function Hedges({ theme }: { theme: MazeTheme }) {
  const bodies = useRef<InstancedMesh>(null)
  const caps = useRef<InstancedMesh>(null)
  const walls = useMemo(() => {
    const out: Cell[] = []
    for (let r = 1; r < ROWS - 1; r++) for (let c = 1; c < COLS - 1; c++) if (MAZE[r][c] === 1) out.push({ r, c })
    return out
  }, [])
  useEffect(() => {
    const body = bodies.current
    if (body) {
      walls.forEach((cell, i) => {
        _obj.position.set(worldX(cell.c), 0.4, worldZ(cell.r))
        _obj.rotation.set(0, ((cell.r * 13 + cell.c * 7) % 6) * 0.02, 0)
        _obj.scale.set(1, 1, 1)
        _obj.updateMatrix()
        body.setMatrixAt(i, _obj.matrix)
        _col.lerpColors(_hedgeBot, _hedgeTop, 0.45 + ((cell.r * 7 + cell.c * 3) % 5) * 0.08)
        body.setColorAt(i, _col)
      })
      body.instanceMatrix.needsUpdate = true
      if (body.instanceColor) body.instanceColor.needsUpdate = true
    }
    const cap = caps.current
    if (cap) {
      walls.forEach((cell, i) => {
        _obj.position.set(worldX(cell.c), 0.82, worldZ(cell.r))
        _obj.rotation.set(0, 0, 0)
        _obj.scale.set(1, 1, 1)
        _obj.updateMatrix()
        cap.setMatrixAt(i, _obj.matrix)
      })
      cap.instanceMatrix.needsUpdate = true
    }
  }, [walls])
  return (
    <group>
      <instancedMesh ref={bodies} args={[undefined, undefined, walls.length]} frustumCulled={false} castShadow receiveShadow>
        <boxGeometry args={[CELL * 0.94, 0.8, CELL * 0.94]} />
        <meshToonMaterial gradientMap={toonRamp} vertexColors />
      </instancedMesh>
      <instancedMesh ref={caps} args={[undefined, undefined, walls.length]} frustumCulled={false}>
        <boxGeometry args={[CELL * 0.99, 0.12, CELL * 0.99]} />
        <meshToonMaterial color={theme.hedgeCap} gradientMap={toonRamp} />
      </instancedMesh>
    </group>
  )
}

// Drifting pollen/p001len motes — instanced, gated by particle tier; off-ish
// under reducedMotion (held positions, no drift).
function Pollen({ density, reducedMotion, theme }: { density: number; reducedMotion: boolean; theme: MazeTheme }) {
  const inst = useRef<InstancedMesh>(null)
  const count = Math.max(0, Math.round(30 * density))
  const seeds = useMemo(() => Array.from({ length: count }, (_, i) => ({
    x: ((Math.sin(i * 12.9898) * 43758.5453) % 1) * (COLS * CELL) - HALF_W,
    z: ((Math.sin(i * 78.233) * 12543.123) % 1) * (ROWS * CELL) - HALF_D,
    speed: 0.08 + (i % 5) * 0.02,
    phase: (i / Math.max(1, count)) * 3,
  })), [count])
  useFrame((state) => {
    const mesh = inst.current
    if (!mesh || count === 0) return
    const t = reducedMotion ? 0 : state.clock.elapsedTime
    for (let i = 0; i < count; i++) {
      const s = seeds[i]
      const y = ((t * s.speed + s.phase) % 2.4) + 0.4
      _obj.position.set(s.x + Math.sin(t * 0.5 + i) * 0.18, y, s.z)
      const sc = 0.012 + (i % 3) * 0.004
      _obj.scale.set(sc, sc, sc)
      _obj.updateMatrix()
      mesh.setMatrixAt(i, _obj.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  })
  if (count === 0) return null
  return (
    <instancedMesh ref={inst} args={[undefined, undefined, count]} frustumCulled={false}>
      <sphereGeometry args={[1, 6, 6]} />
      <meshBasicMaterial color={theme.pollen} transparent opacity={0.8} toneMapped={false} />
    </instancedMesh>
  )
}
// P0-4 — Signposts. Every word-token is VISUALLY IDENTICAL (a little wooden
// garden signpost) — no colour-by-correctness, no halo. Vanishes when collected
// (correct), ruled out (wrong pick), or eliminated by a hint. Ink-outlined board.
function Signposts({ tokens, shadows, theme }: { tokens: Token[]; shadows: boolean; theme: MazeTheme }) {
  return (
    <group>
      {tokens.map((tok, i) => (
        tok.eaten ? null : (
          <group key={i} position={[worldX(tok.cell.c), 0, worldZ(tok.cell.r)]}>
            <BlobShadow position={[0, 0.05, 0]} radius={0.24} strength={0.4} />
            {/* post */}
            <mesh position={[0, 0.22, 0]} castShadow={shadows}>
              <cylinderGeometry args={[0.035, 0.045, 0.44, 8]} />
              <meshToonMaterial color={theme.post} gradientMap={toonRamp} />
            </mesh>
            {/* board (ink-outlined for a crisp hand-drawn edge) */}
            <group position={[0, 0.5, 0]}>
              <InkOutline color={theme.paper.ink} scale={1.08}>
                <boxGeometry args={[0.34, 0.2, 0.05]} />
              </InkOutline>
              <mesh castShadow={shadows}>
                <boxGeometry args={[0.34, 0.2, 0.05]} />
                <meshToonMaterial color={theme.board} gradientMap={toonRamp} />
              </mesh>
            </group>
          </group>
        )
      ))}
    </group>
  )
}

// Player lantern-bearer — tweens cell-to-cell; glow tints green/coral on the
// last pick (post-selection feedback only); flickers while a warden stuns.
function PlayerLantern({ game, reducedMotion, lampLevel, highFx, feedback, theme }: { game: React.MutableRefObject<GameState>; reducedMotion: boolean; lampLevel: number; highFx: boolean; feedback: 'correct' | 'wrong' | null; theme: MazeTheme }) {
  const root = useRef<Group>(null)
  const light = useRef<PointLight>(null)
  useFrame(() => {
    const g = game.current
    const root3 = root.current
    if (!root3) return
    const alpha = reducedMotion ? 1 : MathUtils.clamp((performance.now() - g.stepAt) / STEP_MS, 0, 1)
    const cx = worldX(g.prev.c) + (worldX(g.pos.c) - worldX(g.prev.c)) * alpha
    const cz = worldZ(g.prev.r) + (worldZ(g.pos.r) - worldZ(g.prev.r)) * alpha
    root3.position.set(cx, 0.3, cz)
    const stunned = performance.now() < g.stunUntil
    const flick = stunned && !reducedMotion ? 0.45 + Math.sin(performance.now() * 0.05) * 0.35 : 1
    if (light.current) light.current.intensity = (0.4 + lampLevel * 0.4) * flick * (highFx ? 1 : 0.001)
  })
  const glow = feedback === 'correct' ? OK : feedback === 'wrong' ? NO : theme.playerGlow
  const dim = MathUtils.clamp(lampLevel, 0.35, 1)
  return (
    <group ref={root} position={[worldX(START.c), 0.3, worldZ(START.r)]}>
      <BlobShadow position={[0, -0.25, 0]} radius={0.28} strength={0.5} />
      {/* body (ink-outlined) */}
      <InkOutline color={theme.paper.ink} scale={1.08}>
        <cylinderGeometry args={[0.12, 0.15, 0.34, 10]} />
      </InkOutline>
      <mesh position={[0, -0.02, 0]} castShadow>
        <cylinderGeometry args={[0.12, 0.15, 0.34, 10]} />
        <meshToonMaterial color={theme.player} gradientMap={toonRamp} />
      </mesh>
      {/* little lantern orb */}
      <mesh position={[0, 0.16, 0.12]}>
        <sphereGeometry args={[0.09, 14, 12]} />
        <meshBasicMaterial color={glow} toneMapped={false} />
      </mesh>
      {highFx && <pointLight ref={light} color={glow} intensity={0.5} distance={3.2} decay={2} />}
    </group>
  )
}

// Projects each token world position to screen px → DOM nameplate transform.
function LabelProjector({ tokens, labelRefs }: { tokens: Token[]; labelRefs: React.MutableRefObject<(HTMLDivElement | null)[]> }) {
  const cam = useThree((s) => s.camera) as PerspectiveCamera
  const size = useThree((s) => s.size)
  useFrame(() => {
    for (let i = 0; i < tokens.length; i++) {
      const el = labelRefs.current[i]
      if (!el) continue
      const tok = tokens[i]
      if (tok.eaten) { el.style.opacity = '0'; continue }
      _pos.set(worldX(tok.cell.c), 0.86, worldZ(tok.cell.r)).project(cam)
      if (_pos.z > 1) { el.style.opacity = '0'; continue }
      const x = (_pos.x * 0.5 + 0.5) * size.width
      const y = (-_pos.y * 0.5 + 0.5) * size.height
      el.style.opacity = '1'
      el.style.transform = `translate(-50%, -50%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`
    }
  })
  return null
}
// P0-4 — Topiary "Hedge Wardens": REAL opponents that patrol corridors and
// contest the route. On contact they FRICTION the player (brief stun via
// game.stunUntil + a DOM/aria nudge) — they NEVER end a round, never restart,
// never touch solved/correctCount. Static under reducedMotion; omitted on low.
function TopiaryWardens({ game, reducedMotion, onBump, shadows, theme }: { game: React.MutableRefObject<GameState>; reducedMotion: boolean; onBump: () => void; shadows: boolean; theme: MazeTheme }) {
  const groups = useRef<(Group | null)[]>([])
  const loops = useMemo(() => ([
    [{ r: 1, c: 1 }, { r: 1, c: 3 }, { r: 3, c: 3 }, { r: 3, c: 1 }],
    [{ r: 8, c: 9 }, { r: 8, c: 11 }, { r: 6, c: 11 }, { r: 6, c: 9 }],
    [{ r: 5, c: 5 }, { r: 5, c: 7 }, { r: 8, c: 7 }, { r: 8, c: 5 }],
  ].map((cells) => cells.map((c) => new Vector3(worldX(c.c), 0, worldZ(c.r))))), [])
  useFrame((state) => {
    const pc = game.current.pos
    _playerWorld.set(worldX(pc.c), 0, worldZ(pc.r))
    const now = performance.now()
    const speed = reducedMotion ? 0 : 0.16
    for (let i = 0; i < loops.length; i++) {
      const g = groups.current[i]
      if (!g) continue
      const pts = loops[i]
      const seg = pts.length
      const f = ((state.clock.elapsedTime * speed + i * 0.37) % 1) * seg
      const a = Math.floor(f) % seg
      const b = (a + 1) % seg
      const k = f - Math.floor(f)
      _pos.copy(pts[a]).lerp(pts[b], k)
      g.position.set(_pos.x, 0, _pos.z)
      if (!reducedMotion) {
        g.rotation.y = Math.atan2(pts[b].x - pts[a].x, pts[b].z - pts[a].z)
        g.position.y = Math.sin(state.clock.elapsedTime * 2.2 + i) * 0.04
      }
      const dx = _pos.x - _playerWorld.x
      const dz = _pos.z - _playerWorld.z
      if (dx * dx + dz * dz < 0.3 && now > game.current.stunUntil) {
        game.current.stunUntil = now + STUN_MS
        onBump()
      }
    }
  })
  return (
    <>
      {loops.map((_, i) => (
        <group key={i} ref={(el) => { groups.current[i] = el }}>
          <BlobShadow position={[0, 0.05, 0]} radius={0.28} strength={0.45} />
          {/* topiary critter: clipped-bush body + head, ink-outlined */}
          <group position={[0, 0.34, 0]}>
            <InkOutline color={theme.paper.ink} scale={1.07}>
              <sphereGeometry args={[0.26, 12, 10]} />
            </InkOutline>
            <mesh castShadow={shadows}>
              <sphereGeometry args={[0.26, 12, 10]} />
              <meshToonMaterial color={theme.warden} gradientMap={toonRamp} />
            </mesh>
          </group>
          <group position={[0, 0.74, 0.04]}>
            <InkOutline color={theme.paper.ink} scale={1.1}>
              <sphereGeometry args={[0.16, 12, 10]} />
            </InkOutline>
            <mesh castShadow={shadows}>
              <sphereGeometry args={[0.16, 12, 10]} />
              <meshToonMaterial color={theme.warden} gradientMap={toonRamp} />
            </mesh>
            {/* little ears/leaves */}
            <mesh position={[-0.1, 0.16, 0]} rotation={[0, 0, 0.5]}>
              <coneGeometry args={[0.05, 0.16, 6]} />
              <meshToonMaterial color={theme.hedgeCap} gradientMap={toonRamp} />
            </mesh>
            <mesh position={[0.1, 0.16, 0]} rotation={[0, 0, -0.5]}>
              <coneGeometry args={[0.05, 0.16, 6]} />
              <meshToonMaterial color={theme.hedgeCap} gradientMap={toonRamp} />
            </mesh>
          </group>
        </group>
      ))}
    </>
  )
}
// =========================================================================
// DOM overlay — all readable English here (never a 3D texture). P0-3: big,
// high-contrast type over a subtle dark SCRIM so it hits AA over the bright
// pastel scene (R&D flag). P0-4: no answer reveal. P0-5: Bajla (PIGEON) teach.
// =========================================================================
interface OverlayProps {
  theme: MazeTheme
  cur: ArcadeRound | undefined
  total: number
  roundIdx: number
  correctCount: number
  renderedPrompt: string
  clueExpanded: boolean
  teach: string | null
  stunned: boolean
  feedback: 'correct' | 'wrong' | null
  bumpCount: number
  hintsUsed: number
  completed: boolean
  live: string
  tokens: Token[]
  labelRefs: React.MutableRefObject<(HTMLDivElement | null)[]>
  onHint: () => void
  onSkip: () => void
  onMove: (d: Dir) => void
  onReplay: () => void
}

function Overlay(p: OverlayProps) {
  const ui = p.theme.ui
  const hintLabel = p.hintsUsed === 0 ? 'HINT · CLUE' : p.hintsUsed === 1 ? 'HINT · RULE OUT' : 'NO HINTS'
  // Dark scrim panels keep white text ≥7:1 over the bright pastel world (AA+).
  const scrim = 'rgba(20,16,30,0.86)'
  return (
    <div className="mc-ov" style={{ position: 'absolute', inset: 0, fontFamily: 'var(--em-mono, ui-monospace, monospace)', color: '#FFFFFF' }}>
      <style>{`
        .mc-ov button:focus-visible { outline: 3px solid ${ui}; outline-offset: 2px; }
        @keyframes mc-pop { 0%{transform:translate(-50%,8px);opacity:0} 100%{transform:translate(-50%,0);opacity:1} }
        @keyframes mc-teach { 0%{transform:translate(-50%,14px);opacity:0} 100%{transform:translate(-50%,0);opacity:1} }
      `}</style>

      <div role="status" aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{p.live}</div>

      {/* Prompt panel — pinned top-centre, AA scrim. */}
      {p.cur && (
        <div
          key={`p-${p.roundIdx}`}
          style={{
            position: 'absolute', top: 14, left: '50%', transform: 'translateX(-50%)',
            maxWidth: 'min(660px, 92%)', padding: '14px 22px', borderRadius: 16,
            background: scrim, border: `2px solid ${ui}`, boxShadow: '0 14px 34px rgba(40,30,10,0.35)',
            textAlign: 'center', animation: 'mc-pop 320ms ease',
          }}
        >
          <div style={{ fontSize: 12, letterSpacing: '0.22em', color: '#CFE8D6', fontWeight: 700, marginBottom: 6 }}>
            CLUE · WSKAZÓWKA &nbsp;·&nbsp; {String(p.roundIdx + 1).padStart(2, '0')} / {String(p.total).padStart(2, '0')}
          </div>
          <div style={{ fontFamily: 'var(--em-decor, Georgia, "Times New Roman", serif)', fontSize: 22, lineHeight: 1.3, fontWeight: 700, color: '#FFFFFF' }}>
            {p.renderedPrompt}
          </div>
          {p.clueExpanded && p.cur.hint && (
            <div style={{ marginTop: 8, fontSize: 15, lineHeight: 1.35, color: '#EAF6EC', fontStyle: 'italic' }}>
              In other words: {p.cur.hint}
            </div>
          )}
        </div>
      )}

      {/* HUD — progress only, NO answer reveal. */}
      <div style={{ position: 'absolute', top: 14, left: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <HudPill label="FOUND · ZNALEZIONE" value={`${p.correctCount} / ${p.total}`} accent={ui} scrim={scrim} />
        {p.bumpCount > 0 && <HudPill label="WARDEN BLOCKS" value={String(p.bumpCount)} accent="#e6c14d" scrim={scrim} />}
      </div>

      {/* Neutral signpost nameplates — identical for every option, on a scrim. */}
      {p.tokens.map((tok, i) => (
        <div
          key={i}
          ref={(el) => { p.labelRefs.current[i] = el }}
          style={{
            position: 'absolute', top: 0, left: 0, opacity: 0, pointerEvents: 'none',
            padding: '5px 12px', borderRadius: 10, fontSize: 14, fontWeight: 800, whiteSpace: 'nowrap',
            letterSpacing: '0.01em', background: scrim, color: '#FFFFFF',
            border: '1px solid rgba(255,255,255,0.5)', textShadow: '0 1px 2px rgba(0,0,0,0.7)',
            fontFamily: 'var(--em-decor, Georgia, serif)',
          }}
        >{tok.word}</div>
      ))}

      {/* Bajla teach-on-wrong (PIGEON), aria-assertive, AA scrim. */}
      {p.teach && !p.completed && (
        <div
          role="alert"
          style={{
            position: 'absolute', bottom: 92, left: '50%', transform: 'translateX(-50%)',
            maxWidth: 'min(560px, 92%)', padding: '12px 16px', borderRadius: 16,
            background: scrim, border: `2px solid ${NO}`, display: 'flex', gap: 12, alignItems: 'flex-start',
            animation: 'mc-teach 260ms ease', boxShadow: '0 14px 30px rgba(40,30,10,0.4)',
          }}
        >
          <PigeonGlyph />
          <div>
            <div style={{ fontSize: 11, letterSpacing: '0.18em', color: '#F7C9BE', fontWeight: 700, marginBottom: 3 }}>BAJLA</div>
            <div style={{ fontSize: 15, lineHeight: 1.4, color: '#FFF1EC' }}>{p.teach}</div>
          </div>
        </div>
      )}

      {p.stunned && !p.completed && (
        <div style={{ position: 'absolute', top: 84, left: '50%', transform: 'translateX(-50%)', padding: '6px 14px', borderRadius: 999, background: scrim, border: '1px solid #e6c14d88', color: '#FBE9A8', fontSize: 12, letterSpacing: '0.12em' }}>
          ⚠ A HEDGE WARDEN BLOCKS THE WAY
        </div>
      )}
      {p.feedback === 'correct' && !p.completed && (
        <div style={{ position: 'absolute', top: 84, left: '50%', transform: 'translateX(-50%)', padding: '6px 14px', borderRadius: 999, background: scrim, border: `1px solid ${OK}`, color: '#C9F0D2', fontSize: 13, fontWeight: 700, letterSpacing: '0.1em' }}>
          ✓ THAT FITS THE CLUE
        </div>
      )}

      {/* Controls */}
      <div style={{ position: 'absolute', bottom: 14, left: 14, display: 'flex', gap: 8, pointerEvents: 'auto' }}>
        <button onClick={p.onSkip} style={btnStyle(ui)} aria-label="Skip this round">SKIP</button>
        <button onClick={p.onHint} disabled={p.hintsUsed >= HINT_MAX} style={btnStyle(ui, p.hintsUsed >= HINT_MAX)} aria-label={p.hintsUsed === 0 ? 'Hint: rephrase the clue' : p.hintsUsed === 1 ? 'Hint: rule out one wrong word' : 'No hints left'}>{hintLabel}</button>
      </div>

      <div style={{ position: 'absolute', bottom: 14, right: 14, display: 'grid', gridTemplateColumns: 'repeat(3, 48px)', gridTemplateRows: 'repeat(3, 48px)', gap: 4, pointerEvents: 'auto' }}>
        <span /><button onClick={() => p.onMove('up')} style={dpad(ui)} aria-label="Move up">↑</button><span />
        <button onClick={() => p.onMove('left')} style={dpad(ui)} aria-label="Move left">←</button><span /><button onClick={() => p.onMove('right')} style={dpad(ui)} aria-label="Move right">→</button>
        <span /><button onClick={() => p.onMove('down')} style={dpad(ui)} aria-label="Move down">↓</button><span />
      </div>

      {p.completed && (
        <div role="dialog" aria-label="Topiary Gardens complete" style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, background: 'rgba(20,16,30,0.66)', backdropFilter: 'blur(6px)', pointerEvents: 'auto' }}>
          <div style={{ fontFamily: 'var(--em-decor, Georgia, serif)', fontSize: 36, fontWeight: 800, color: '#FFFFFF', textShadow: `0 0 16px ${ui}` }}>You reached the garden gate.</div>
          <div style={{ fontSize: 15 }}>You found <strong style={{ color: '#CFE8D6' }}>{p.correctCount}</strong> / {p.total} words</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={p.onReplay} style={btnStyle(ui)}>Try again</button>
            <button onClick={p.onReplay} style={{ ...btnStyle(ui), background: ui, color: '#0c2a18', fontWeight: 800 }}>Next district →</button>
          </div>
        </div>
      )}
    </div>
  )
}

// Bajla the PIGEON — small inline DOM glyph for the teach card (placeholder
// until R&D's bajla_avatar_kit animated avatar is wired into primitives.tsx).
function PigeonGlyph() {
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" aria-hidden="true" style={{ flexShrink: 0 }}>
      <ellipse cx="17" cy="22" rx="11" ry="8" fill="#9fb6c9" />
      <path d="M6 22 q-3 -4 1 -7 q4 2 6 5 z" fill="#7f99ad" />
      <circle cx="25" cy="14" r="6" fill="#b6c8d6" />
      <circle cx="27" cy="13" r="1.5" fill="#1e1730" />
      <path d="M31 14 l5 1 -5 2 z" fill="#e89a4a" />
      <path d="M22 18 q3 1 5 0" stroke="#5aa06f" strokeWidth="2" fill="none" opacity="0.7" />
      <path d="M10 28 l3 4 M16 29 l2 4" stroke="#e89a4a" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function HudPill({ label, value, accent, scrim }: { label: string; value: string; accent: string; scrim: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 11px', background: scrim, border: `1px solid ${accent}`, borderRadius: 8 }}>
      <span style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#CFE8D6', fontWeight: 700 }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 800, color: '#FFFFFF' }}>{value}</span>
    </div>
  )
}

function btnStyle(accent: string, disabled = false): React.CSSProperties {
  return {
    minHeight: 44, minWidth: 56, padding: '9px 16px', borderRadius: 10,
    background: 'rgba(20,16,30,0.82)', border: `1px solid ${accent}`,
    color: '#FFFFFF', fontFamily: 'var(--em-mono, ui-monospace, monospace)', fontSize: 13, fontWeight: 700,
    letterSpacing: '0.08em', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.45 : 1,
    touchAction: 'manipulation',
  }
}

function dpad(accent: string): React.CSSProperties {
  return {
    minWidth: 48, minHeight: 48, background: 'rgba(20,16,30,0.82)',
    border: `1px solid ${accent}`, borderRadius: 10, color: '#FFFFFF',
    fontSize: 20, fontWeight: 700, cursor: 'pointer', touchAction: 'manipulation',
  }
}

