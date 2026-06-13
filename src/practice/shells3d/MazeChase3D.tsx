// MazeChase3D — "Museum After Dark" (WAVE-2 reference build).
//
// A three.js presentation of the canonical 2D Maze Chase shell
// (src/practice/shells/MazeChase.tsx). WAVE-2 uplift: graphics + game-feel
// only. The DATA CONTRACT is unchanged — same puzzle in (ArcadePuzzle via
// generateMazeChase), same session result out (SessionResult:
// { correctCount, totalQuestions, durationMs, shellKey:'mazechase' }) — and
// the LEARNING CONTENT stays faithful (we change interaction/feel, never the
// English truth). Built on the Fluent City GameKit (CityStage + Bajla +
// palette + useStageQuality + useGameLoop).
//
// WAVE-2 P0 moves applied (Mike's brief, draft reference — DO NOT MERGE):
//  (1) Colour mgmt (ACES + sRGB) + ONE hand-rolled three-core fullscreen post
//      pass: cheap bloom + vignette + dusk grade + ordered dither. No
//      @react-three/postprocessing, no examples/jsm EffectComposer.
//  (2) Diorama 3-light rig (key/fill/rim) + dither (anti-band) + soft procedural
//      contact/blob shadows under pieces.
//  (3) Bigger, higher-contrast DOM typography (WCAG-AA prompt + labels, clear
//      focus-visible states).
//  (4) Distractor design: NO answer pre-reveal — all word-tokens are visually
//      identical until chosen (no colour-by-correctness, no halo, no TARGET
//      HUD). Real opponents (Night Wardens) patrol corridors and contest the
//      path with FRICTION ONLY (brief stun) — collisions NEVER change the
//      score; score reflects word correctness only.
//  (5) Bajla teach-on-wrong: picking a wrong word triggers a short, contextual
//      explanation (client-side template derived from the clue/answer meaning;
//      structured so a per-distractor rationale can slot in later).
//
// Scoring (UNCHANGED measure vs the live shell): a round counts as correct when
// the correct word-token is collected. Wrong picks are LEARNING moments (teach
// + the token is ruled out) and warden bumps are pure time-cost — neither
// lowers correctCount (logged only as local telemetry). Skip advances unsolved.
//
// Contract compliance: single CityStage canvas (DPR clamped, aria-hidden); all
// readable English in the DOM overlay (never a 3D texture); quality tiers +
// reducedMotion honoured; full keyboard + touch; procedural geometry +
// vertex/instance colours only (no GLB, no textures, no external URLs, no new
// deps); allocation-free render loop; instancing for repeats.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import {
  Color, MathUtils, Mesh, Object3D, OrthographicCamera, PlaneGeometry, Scene,
  ShaderMaterial, SRGBColorSpace, Vector2, Vector3, WebGLRenderTarget,
} from 'three'
import type { Group, InstancedMesh, PerspectiveCamera, PointLight, WebGLRenderer } from 'three'
import { Bajla, CityStage, palette, useGameLoop, useStageQuality } from './kit'
import type { Game3DProps, SessionResult, Vocab3DItem } from './types'
import { generateMazeChasePuzzle } from '../generators/generateMazeChase'
import type { ArcadeInput, ArcadePuzzle, ArcadeRound } from '../generators/generateArcade'

// ── Canonical grid + timing (identical to the 2D shell) ──────────────────
const COLS = 13
const ROWS = 11
const ADVANCE_MS = 1100 // correct → next round
const STEP_MS = 110 // lantern tween cadence (visual only; input is event-driven)
const STUN_MS = 450 // warden bump = brief stun (friction only, never scored)
const BUMP_COOLDOWN_MS = 900 // min gap between scored-feel bumps
const HINT_MAX = 2 // (1) rephrase clue, (2) eliminate one distractor — never the answer

// Post-selection FEEDBACK colours only (NOT pre-reveal affordances).
const OK = '#7FB069' // success-green flash (palette.leaf)
const NO = '#FB7185' // wrong flash
const WARM = '#FFB347' // lantern amber
const FOCUS = '#7DD3FC' // UI focus ring (chrome only, not tied to correctness)

// Maze layout — 1 = wall (vitrine / partition), 0 = path. COPIED BYTE-FOR-BYTE
// from the 2D shell so the corridor topology + every reachable cell match.
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
  eaten: boolean // collected (correct) OR ruled out (wrong pick / hint)
}

// ── World mapping — gallery floor centred on origin (XZ plane) ────────────
const CELL = 0.62
const HALF_W = (COLS * CELL) / 2
const HALF_D = (ROWS * CELL) / 2
const worldX = (c: number): number => (c + 0.5) * CELL - HALF_W
const worldZ = (r: number): number => (r + 0.5) * CELL - HALF_D

// ── Built-in demo puzzle — verbatim from the 2D shell (anonymous play) ─────
const DEMO_PUZZLE: ArcadePuzzle = {
  rounds: [
    { id: 'mz1', prompt: 'A small narrow street with shops on both sides.', options: ['arcade', 'plaza', 'cellar', 'spire'], answerIndex: 0, hint: 'Often glass-roofed; Victorian shopping streets.', hint_pl: 'pasaż' },
    { id: 'mz2', prompt: 'Stones laid as paving on an old street.', options: ['cobbles', 'pebbles', 'planks', 'tiles'], answerIndex: 0, hint: 'Round, rough, hard to walk in heels.', hint_pl: 'kocie łby' },
    { id: 'mz3', prompt: 'A passage between two buildings.', options: ['alley', 'attic', 'plinth', 'gable'], answerIndex: 0, hint: 'Cats live there; bins are kept there.', hint_pl: 'zaułek' },
    { id: 'mz4', prompt: 'A pool of light from a streetlight.', options: ['glow', 'shadow', 'plinth', 'beacon'], answerIndex: 0, hint: 'The bright circle on the pavement at night.', hint_pl: 'blask' },
    { id: 'mz5', prompt: 'A wall painted with art.', options: ['mural', 'fresco', 'lintel', 'awning'], answerIndex: 0, hint: 'Big urban paintings; often political.', hint_pl: 'mural' },
  ],
}

// Per-shell answer-leak guard (belt-and-suspenders with the generator mask).
function maskAnswerInPrompt(prompt: string | undefined, answer: string | undefined): string {
  if (!prompt) return ''
  if (!answer) return prompt
  const ans = answer.toLowerCase().trim()
  if (!ans) return prompt
  const safe = ans.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return prompt.replace(new RegExp(`\\b${safe}\\b`, 'gi'), '___')
}

// ── Teach-on-wrong: a short, contextual explanation of why the chosen word is
// wrong. Client-side template ONLY (no backend/generator change) derived from
// the answer's clue/meaning — faithful: it never asserts a (possibly false)
// meaning for the distractor, it re-anchors the learner on what the clue
// actually points to. Structured so a future per-distractor rationale can slot
// in without a rewrite (see the FUTURE hook below). ────────────────────────
const TEACH_INTROS = ['Hoo — not that one.', 'Mind the clue.', 'Close, but no.', 'Look again.']
function explainWrong(round: ArcadeRound, chosenWord: string, attempt: number): string {
  // FUTURE (Mike-approved per-distractor step): if a rationale map ever ships
  // on the round, prefer it here, e.g. round.rationales?.[chosenWord].
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

// ── Allocation-free scratch (single canvas, single game instance) ──────────
const _pos = new Vector3()
const _obj = new Object3D()
const _col = new Color()
const _wallTop = new Color('#2d3a6b')
const _wallBot = new Color('#161029')
const _playerWorld = new Vector3()

interface GameState {
  pos: Cell
  prev: Cell
  stepAt: number
  stunUntil: number // performance.now() until which input is blocked (warden bump)
}

export default function MazeChase3D(props: Game3DProps) {
  return <MazeChase3DImpl {...props} />
}

// Split so the heavy scene/loop code reads top-down; default export above.
function MazeChase3DImpl({ puzzle, vocab, onSessionComplete, quality, reducedMotion, fullscreen }: Game3DProps) {
  const prefersReduced = usePrefersReducedMotion()
  const reduce = reducedMotion ?? prefersReduced

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

  const lampLevel = Math.max(0.3, 1 - missCount * 0.12)
  const cur = rounds[roundIdx]
  const completed = total > 0 && solved.every(Boolean)
  const correctCount = solved.filter(Boolean).length
  const answerWord = cur ? cur.options[cur.answerIndex] : ''
  const renderedPrompt = useMemo(() => maskAnswerInPrompt(cur?.prompt, answerWord), [cur?.prompt, answerWord])
  const bajla: 'idle' | 'flyby' | 'celebrate' = completed ? 'celebrate' : roundIdx === 0 && correctCount === 0 && missCount === 0 ? 'flyby' : 'idle'

  // Round setup — reset lantern to start + scatter tokens (deterministic).
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

  // Move one cell — event-driven. Walls block; backtracking always allowed;
  // input ignored while stunned (warden bump = friction/time-cost only).
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
      setLive(`Correct — “${tok.word}” fits the clue. Artifact recovered.`)
      if (advanceTimer.current) clearTimeout(advanceTimer.current)
      advanceTimer.current = setTimeout(() => setRoundIdx((i) => (i + 1 < total ? i + 1 : i)), ADVANCE_MS)
    } else {
      // Wrong WORD — a learning moment. Teach why, rule the token out, continue.
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

  // Warden bump callback (throttled) — DOM flash + aria-live. FRICTION ONLY:
  // never changes solved/correctCount; bumpCount is local telemetry.
  const onWardenBump = useCallback(() => {
    const now = performance.now()
    if (now - lastBumpAt.current < BUMP_COOLDOWN_MS) return
    lastBumpAt.current = now
    setBumpCount((b) => b + 1)
    setStunned(true)
    setLive('A night warden blocks your path — wait a moment.')
    window.setTimeout(() => setStunned(false), STUN_MS)
  }, [])

  // Keep a render-clock cadence alive (lantern interpolation); reducedMotion
  // caps catch-up so motion reads as discrete hops.
  useGameLoop(() => {}, undefined, { stepMs: STEP_MS, running: !completed, reducedMotion: reduce })

  // Fire the session result exactly once, on completion. SHAPE UNCHANGED.
  useEffect(() => {
    if (completed && !fired.current) {
      fired.current = true
      setLive('You found the way out. The gallery is yours.')
      const result: SessionResult = {
        correctCount,
        totalQuestions: total,
        durationMs: Math.round(performance.now() - startMs.current),
        shellKey: 'mazechase',
      }
      onSessionComplete?.(result)
    }
  }, [completed, correctCount, total, onSessionComplete])

  // Keyboard — arrows / WASD move one cell.
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

  // Hint — NEVER points at the correct token. Press 1 = rephrase/expand the
  // clue (best for learning); press 2 = eliminate ONE distractor (50/50 aid).
  const useHint = useCallback(() => {
    if (hintsUsed >= HINT_MAX || completed) return
    if (hintsUsed === 0) {
      setClueExpanded(true)
      setHintsUsed(1)
      setLive('Hint: the clue, in other words.')
      return
    }
    // press 2 → eliminate one not-answer, not-eaten token
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

  // Touch swipe — quick flick moves one cell.
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
      aria-label="Museum After Dark — read the clue and steer the lantern to the word that fits; wardens patrol the halls"
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
        <GalleryScene
          game={game}
          tokens={tokens}
          feedback={feedback}
          reducedMotion={reduce}
          bajla={bajla}
          lampLevel={lampLevel}
          labelRefs={labelRefs}
          onWardenBump={onWardenBump}
        />
      </CityStage>
    </div>
  )
}

// Local prefers-reduced-motion probe (no external dep; SSR-safe).
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
// Scene (inside the Canvas — reads the live game ref each frame)
// =========================================================================
interface SceneProps {
  game: React.MutableRefObject<GameState>
  tokens: Token[]
  feedback: 'correct' | 'wrong' | null
  reducedMotion: boolean
  bajla: 'idle' | 'flyby' | 'celebrate'
  lampLevel: number
  labelRefs: React.MutableRefObject<(HTMLDivElement | null)[]>
  onWardenBump: () => void
}

function GalleryScene({ game, tokens, feedback, reducedMotion, bajla, lampLevel, labelRefs, onWardenBump }: SceneProps) {
  const { settings, tier } = useStageQuality()
  const highFx = tier === 'high' && !reducedMotion
  const backZ = worldZ(0) - 1.6
  // P0-1 post pass runs on medium/high; low + reducedMotion render straight
  // (guaranteed-safe fallback path that never depends on the post pipeline).
  const postEnabled = (tier === 'high' || tier === 'medium') && !reducedMotion

  return (
    <group>
      <CameraRig drift={highFx} reducedMotion={reducedMotion} />
      <DioramaLights shadows={settings.shadows} />
      {tier === 'high' && <fog attach="fog" args={[palette.night, 11, 24]} />}

      <Floor shadows={settings.shadows} />
      <Walls />
      <Lanterns flicker={tier !== 'low' && !reducedMotion} highFx={highFx} />
      {settings.particles > 0 && <DustMotes density={settings.particles} reducedMotion={reducedMotion} />}
      <Skyline z={backZ} />
      {tier !== 'low' && <Wardens game={game} reducedMotion={reducedMotion} onBump={onWardenBump} shadows={settings.shadows} />}

      <ArtifactPlinths tokens={tokens} reducedMotion={reducedMotion} shadows={settings.shadows} />
      <LabelProjector tokens={tokens} labelRefs={labelRefs} />
      <Lantern game={game} reducedMotion={reducedMotion} lampLevel={lampLevel} highFx={highFx} feedback={feedback} />

      <Bajla variant={bajla} reducedMotion={reducedMotion} scale={0.42} position={[HALF_W - 0.3, 2.1, backZ + 0.4]} />
      {postEnabled && <PostFx tier={tier} />}
    </group>
  )
}

// P0-2 — soft diorama 3-light rig (key/fill/rim) layered over CityStage's
// dusk ambient. Key carries the one cheap shadow on high; fill/rim are cheap
// directionals that separate pieces from the gallery gloom.
function DioramaLights({ shadows }: { shadows: boolean }) {
  return (
    <>
      <directionalLight
        position={[-4.2, 7, 5]}
        intensity={0.95}
        color={'#ffe9c2'}
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
      <directionalLight position={[5, 4, -2]} intensity={0.32} color={'#8fb3ff'} />
      <directionalLight position={[0, 5, -8]} intensity={0.55} color={'#cfe0ff'} />
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

// P0-2 — procedural soft contact/blob shadow (radial-alpha, no texture/URL).
function BlobShadow({ position, radius = 0.34, strength = 0.5 }: { position: [number, number, number]; radius?: number; strength?: number }) {
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
        fragmentShader={'varying vec2 vUv; uniform float uStrength; void main(){ float d = distance(vUv, vec2(0.5)); float a = smoothstep(0.5, 0.04, d) * uStrength; gl_FragColor = vec4(0.0, 0.0, 0.0, a); }'}
      />
    </mesh>
  )
}
// Marble corridor floor — instanced tiles over open cells + dark base slab.
function Floor({ shadows }: { shadows: boolean }) {
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
      _obj.position.set(worldX(cell.c), 0.01, worldZ(cell.r))
      _obj.rotation.set(0, 0, 0)
      _obj.scale.set(1, 1, 1)
      _obj.updateMatrix()
      mesh.setMatrixAt(i, _obj.matrix)
      const checker = (cell.r + cell.c) % 2 === 0
      _col.set(checker ? '#3a3f63' : '#2c3052')
      mesh.setColorAt(i, _col)
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [open])
  return (
    <group>
      <mesh position={[0, -0.14, 0]} receiveShadow={shadows}>
        <boxGeometry args={[COLS * CELL + 1.2, 0.28, ROWS * CELL + 1.2]} />
        <meshStandardMaterial color={palette.night} roughness={0.96} />
      </mesh>
      <instancedMesh ref={tiles} args={[undefined, undefined, open.length]} frustumCulled={false} receiveShadow={shadows}>
        <boxGeometry args={[CELL * 0.96, 0.04, CELL * 0.96]} />
        <meshStandardMaterial roughness={0.4} metalness={0.14} vertexColors />
      </instancedMesh>
      <mesh position={[0, 0.0, HALF_D + 0.35]}>
        <boxGeometry args={[COLS * CELL + 1.0, 0.05, 0.1]} />
        <meshStandardMaterial color={palette.brass} roughness={0.5} metalness={0.4} emissive={palette.brass} emissiveIntensity={0.1} />
      </mesh>
    </group>
  )
}

// Vitrine / partition walls — instanced bodies (vertex gradient) + brass caps.
function Walls() {
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
        _obj.position.set(worldX(cell.c), 0.36, worldZ(cell.r))
        _obj.rotation.set(0, 0, 0)
        _obj.scale.set(1, 1, 1)
        _obj.updateMatrix()
        body.setMatrixAt(i, _obj.matrix)
        _col.lerpColors(_wallBot, _wallTop, 0.4 + ((cell.r * 7 + cell.c * 3) % 5) * 0.08)
        body.setColorAt(i, _col)
      })
      body.instanceMatrix.needsUpdate = true
      if (body.instanceColor) body.instanceColor.needsUpdate = true
    }
    const cap = caps.current
    if (cap) {
      walls.forEach((cell, i) => {
        _obj.position.set(worldX(cell.c), 0.74, worldZ(cell.r))
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
      <instancedMesh ref={bodies} args={[undefined, undefined, walls.length]} frustumCulled={false} castShadow>
        <boxGeometry args={[CELL * 0.92, 0.72, CELL * 0.92]} />
        <meshStandardMaterial roughness={0.3} metalness={0.15} transparent opacity={0.92} vertexColors />
      </instancedMesh>
      <instancedMesh ref={caps} args={[undefined, undefined, walls.length]} frustumCulled={false}>
        <boxGeometry args={[CELL * 0.96, 0.05, CELL * 0.96]} />
        <meshStandardMaterial color={palette.brass} roughness={0.45} metalness={0.5} emissive={palette.brass} emissiveIntensity={0.12} />
      </instancedMesh>
    </group>
  )
}
// Paper lanterns strung overhead — instanced glow + one cheap warm point light.
function Lanterns({ flicker, highFx }: { flicker: boolean; highFx: boolean }) {
  const inst = useRef<InstancedMesh>(null)
  const light = useRef<PointLight>(null)
  const positions = useMemo(() => {
    const out: [number, number, number][] = []
    const PER = 4
    for (let i = 0; i < PER; i++) {
      const z = -HALF_D + 0.8 + (i / (PER - 1)) * (ROWS * CELL - 1.6)
      out.push([-HALF_W * 0.5, 2.3, z])
      out.push([HALF_W * 0.5, 2.3, z])
    }
    return out
  }, [])
  useEffect(() => {
    const mesh = inst.current
    if (!mesh) return
    positions.forEach((p, i) => {
      _obj.position.set(p[0], p[1], p[2])
      _obj.rotation.set(0, 0, 0)
      _obj.scale.set(1, 1, 1)
      _obj.updateMatrix()
      mesh.setMatrixAt(i, _obj.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
  }, [positions])
  useFrame((state) => {
    if (!flicker) return
    const f = 0.55 + Math.sin(state.clock.elapsedTime * 6.0) * 0.12 + Math.sin(state.clock.elapsedTime * 11.0) * 0.05
    const mesh = inst.current
    if (mesh) {
      const mat = mesh.material as { emissiveIntensity?: number }
      if (mat) mat.emissiveIntensity = 0.7 + f * 0.4
    }
    if (light.current) light.current.intensity = 0.5 + f * 0.4
  })
  return (
    <group>
      <instancedMesh ref={inst} args={[undefined, undefined, positions.length]} frustumCulled={false}>
        <sphereGeometry args={[0.16, 12, 10]} />
        <meshStandardMaterial color={palette.lanternCore} emissive={palette.lanternAmber} emissiveIntensity={0.8} roughness={0.6} />
      </instancedMesh>
      {highFx && <pointLight ref={light} position={[0, 2.4, 0]} color={palette.lanternAmber} intensity={0.6} distance={12} decay={2} />}
    </group>
  )
}

// Floating dust motes — instanced, gated by particle tier.
function DustMotes({ density, reducedMotion }: { density: number; reducedMotion: boolean }) {
  const inst = useRef<InstancedMesh>(null)
  const count = Math.max(0, Math.round(34 * density))
  const seeds = useMemo(() => Array.from({ length: count }, (_, i) => ({
    x: ((Math.sin(i * 12.9898) * 43758.5453) % 1) * (COLS * CELL) - HALF_W,
    z: ((Math.sin(i * 78.233) * 12543.123) % 1) * (ROWS * CELL) - HALF_D,
    speed: 0.1 + (i % 5) * 0.03,
    phase: (i / Math.max(1, count)) * 3,
  })), [count])
  useFrame((state) => {
    const mesh = inst.current
    if (!mesh || count === 0) return
    const t = reducedMotion ? 0 : state.clock.elapsedTime
    for (let i = 0; i < count; i++) {
      const s = seeds[i]
      const y = ((t * s.speed + s.phase) % 2.6) + 0.3
      _obj.position.set(s.x + Math.sin(t * 0.4 + i) * 0.12, y, s.z)
      const sc = 0.014 + (i % 3) * 0.005
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
      <meshStandardMaterial color={palette.ember} emissive={palette.ember} emissiveIntensity={0.6} transparent opacity={0.7} />
    </instancedMesh>
  )
}

// Big Ben + London skyline silhouette beyond the windows. Decorative.
function Skyline({ z }: { z: number }) {
  const towers = useMemo(() => ([
    { x: -3.4, w: 0.7, h: 1.6 }, { x: -2.4, w: 0.5, h: 2.2 }, { x: -1.4, w: 0.6, h: 1.3 },
    { x: 0, w: 0.5, h: 2.9 },
    { x: 1.3, w: 0.7, h: 1.5 }, { x: 2.3, w: 0.5, h: 2.0 }, { x: 3.3, w: 0.8, h: 1.7 },
  ]), [])
  return (
    <group position={[0, 0, z]}>
      <mesh position={[0, 1.4, -0.2]}>
        <boxGeometry args={[COLS * CELL + 2.0, 3.2, 0.12]} />
        <meshStandardMaterial color={palette.ink} roughness={1} />
      </mesh>
      {towers.map((t, i) => (
        <mesh key={i} position={[t.x, t.h / 2 + 0.2, 0]}>
          <boxGeometry args={[t.w, t.h, 0.18]} />
          <meshStandardMaterial color={palette.night} roughness={1} />
        </mesh>
      ))}
      <mesh position={[0, 2.7, 0.16]}>
        <cylinderGeometry args={[0.12, 0.12, 0.04, 16]} />
        <meshStandardMaterial color={palette.lanternCore} emissive={palette.lanternAmber} emissiveIntensity={0.5} />
      </mesh>
    </group>
  )
}
// P0-4 — Night Wardens: REAL opponents that patrol corridors and contest the
// route. On contact they FRICTION the player (a brief stun set on game.stunUntil
// + a DOM/aria nudge via onBump) — they NEVER end a round, never restart, and
// never touch solved/correctCount. Static (non-moving) under reducedMotion;
// omitted entirely on the low tier (caller-gated).
function Wardens({ game, reducedMotion, onBump, shadows }: { game: React.MutableRefObject<GameState>; reducedMotion: boolean; onBump: () => void; shadows: boolean }) {
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
      if (!reducedMotion) g.rotation.y = Math.atan2(pts[b].x - pts[a].x, pts[b].z - pts[a].z)
      const dx = _pos.x - _playerWorld.x
      const dz = _pos.z - _playerWorld.z
      if (dx * dx + dz * dz < 0.30 && now > game.current.stunUntil) {
        game.current.stunUntil = now + STUN_MS
        onBump()
      }
    }
  })
  return (
    <>
      {loops.map((_, i) => (
        <group key={i} ref={(el) => { groups.current[i] = el }}>
          <BlobShadow position={[0, 0.05, 0]} radius={0.3} strength={0.5} />
          <mesh castShadow={shadows} position={[0, 0.42, 0]}>
            <coneGeometry args={[0.2, 0.72, 10]} />
            <meshStandardMaterial color={palette.bajlaWing} emissive={palette.duskMid} emissiveIntensity={0.28} roughness={0.82} />
          </mesh>
          <mesh castShadow={shadows} position={[0, 0.88, 0]}>
            <sphereGeometry args={[0.13, 12, 10]} />
            <meshStandardMaterial color={palette.bajlaBelly} roughness={0.7} />
          </mesh>
          {/* the warden's own lantern — a glint that telegraphs their position */}
          <mesh position={[0.17, 0.52, 0.17]}>
            <sphereGeometry args={[0.06, 10, 8]} />
            <meshStandardMaterial color={palette.lanternCore} emissive={palette.lanternAmber} emissiveIntensity={0.95} />
          </mesh>
        </group>
      ))}
    </>
  )
}
// P0-4 — Artifact plinths. Every word-token is VISUALLY IDENTICAL (warm brass
// artifact disc) — NO colour-by-correctness, NO answer halo, nothing that
// pre-reveals the answer. A token vanishes when collected (correct), ruled out
// (wrong pick), or eliminated by a hint. Soft contact shadow grounds each.
function ArtifactPlinths({ tokens, reducedMotion, shadows }: { tokens: Token[]; reducedMotion: boolean; shadows: boolean }) {
  const discs = useRef<(Mesh | null)[]>([])
  useFrame((state) => {
    if (reducedMotion) return
    const t = state.clock.elapsedTime
    for (let i = 0; i < tokens.length; i++) {
      const m = discs.current[i]
      if (m) m.rotation.z = t * 0.5 + i
    }
  })
  return (
    <group>
      {tokens.map((tok, i) => (
        tok.eaten ? null : (
          <group key={i} position={[worldX(tok.cell.c), 0, worldZ(tok.cell.r)]}>
            <BlobShadow position={[0, 0.045, 0]} radius={0.26} strength={0.45} />
            <mesh position={[0, 0.12, 0]}>
              <boxGeometry args={[0.26, 0.24, 0.26]} />
              <meshStandardMaterial color={palette.duskMid} transparent opacity={0.5} roughness={0.2} metalness={0.2} />
            </mesh>
            <mesh position={[0, 0.25, 0]}>
              <boxGeometry args={[0.3, 0.04, 0.3]} />
              <meshStandardMaterial color={palette.brass} roughness={0.45} metalness={0.5} />
            </mesh>
            <mesh ref={(el) => { discs.current[i] = el }} position={[0, 0.42, 0]} rotation={[-Math.PI / 2, 0, 0]} castShadow={shadows}>
              <cylinderGeometry args={[0.13, 0.13, 0.05, 20]} />
              <meshStandardMaterial color={palette.gold} emissive={palette.brass} emissiveIntensity={0.3} roughness={0.4} metalness={0.45} />
            </mesh>
          </group>
        )
      ))}
    </group>
  )
}

// Player lantern-bearer — tweens cell-to-cell; glow tints green/rose on the
// last pick (post-selection feedback only), flickers while stunned by a warden.
function Lantern({ game, reducedMotion, lampLevel, highFx, feedback }: { game: React.MutableRefObject<GameState>; reducedMotion: boolean; lampLevel: number; highFx: boolean; feedback: 'correct' | 'wrong' | null }) {
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
    if (light.current) light.current.intensity = (0.5 + lampLevel * 0.5) * flick * (highFx ? 1 : 0.001)
  })
  const glow = feedback === 'correct' ? OK : feedback === 'wrong' ? NO : WARM
  const dim = MathUtils.clamp(lampLevel, 0.3, 1)
  return (
    <group ref={root} position={[worldX(START.c), 0.3, worldZ(START.r)]}>
      <BlobShadow position={[0, -0.25, 0]} radius={0.3} strength={0.55} />
      <mesh position={[0, -0.1, 0]}>
        <cylinderGeometry args={[0.1, 0.13, 0.32, 10]} />
        <meshStandardMaterial color={palette.bajlaWing} roughness={0.8} />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.17, 16, 12]} />
        <meshStandardMaterial color={glow} emissive={glow} emissiveIntensity={0.85 * dim} transparent opacity={0.5 * dim} />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.08, 12, 10]} />
        <meshStandardMaterial color={palette.lanternCore} emissive={glow} emissiveIntensity={1.1 * dim} />
      </mesh>
      {highFx && <pointLight ref={light} color={glow} intensity={0.6} distance={3.4} decay={2} />}
    </group>
  )
}

// Projects each token world position to screen px → DOM nameplate transform
// (English stays crisp DOM, never a 3D texture). Styling lives in the overlay.
function LabelProjector({ tokens, labelRefs }: { tokens: Token[]; labelRefs: React.MutableRefObject<(HTMLDivElement | null)[]> }) {
  const cam = useThree((s) => s.camera) as PerspectiveCamera
  const size = useThree((s) => s.size)
  useFrame(() => {
    for (let i = 0; i < tokens.length; i++) {
      const el = labelRefs.current[i]
      if (!el) continue
      const tok = tokens[i]
      if (tok.eaten) { el.style.opacity = '0'; continue }
      _pos.set(worldX(tok.cell.c), 0.82, worldZ(tok.cell.r)).project(cam)
      if (_pos.z > 1) { el.style.opacity = '0'; continue }
      const x = (_pos.x * 0.5 + 0.5) * size.width
      const y = (-_pos.y * 0.5 + 0.5) * size.height
      el.style.opacity = '1'
      el.style.transform = `translate(-50%, -50%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`
    }
  })
  return null
}
// P0-1 — ONE hand-rolled fullscreen post pass: cheap ring-tap bloom + dusk
// split-tone grade + vignette + value-noise dither, in a single fragment
// shader. Pure three CORE (RT + ortho quad) — NO @react-three/postprocessing,
// NO examples/jsm EffectComposer/UnrealBloomPass, so vendor-three stays flat.
// Mounted on medium/high only; low + reducedMotion render straight (the safe
// fallback path). Render priority 1 takes over r3f's draw for this frame.
// NOTE: visually unverified locally (sandbox has no build); QA/preview should
// confirm tuning. CI game3d-gate is the budget authority — if it flags chunk
// >250KB gz or vendor-three >350KB gz, drop tap count / post-target res first.
const POST_VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }'
const postFrag = (taps: number): string => `
precision highp float;
varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform vec2 uTexel;
uniform float uBloom, uThreshold, uVignette;
float luma(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
void main(){
  vec3 base = texture2D(tDiffuse, vUv).rgb;
  vec3 bloom = vec3(0.0);
  for (int i = 0; i < ${taps}; i++) {
    float a = 6.2831853 * float(i) / float(${taps});
    vec2 off = vec2(cos(a), sin(a)) * uTexel;
    bloom += max(texture2D(tDiffuse, vUv + off * 2.5).rgb - uThreshold, 0.0);
    bloom += max(texture2D(tDiffuse, vUv + off * 5.0).rgb - uThreshold, 0.0) * 0.5;
  }
  bloom /= float(${taps});
  vec3 col = base + bloom * uBloom;
  float l = luma(col);
  vec3 cool = vec3(0.88, 0.93, 1.05); // shadows toward dusk blue
  vec3 warm = vec3(1.06, 0.99, 0.88); // highlights toward lantern amber
  col *= mix(cool, warm, smoothstep(0.15, 0.7, l));
  col = mix(vec3(l), col, 1.08); // gentle saturation
  float d = distance(vUv, vec2(0.5));
  col *= mix(1.0, smoothstep(0.85, 0.32, d), uVignette);
  float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  col += (n - 0.5) / 255.0;
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`

function PostFx({ tier }: { tier: 'high' | 'medium' | 'low' }) {
  const gl = useThree((s) => s.gl) as WebGLRenderer
  const scene = useThree((s) => s.scene) as Scene
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const size = useThree((s) => s.size)

  const rt = useMemo(() => new WebGLRenderTarget(1, 1, { depthBuffer: true, stencilBuffer: false }), [])
  const postScene = useMemo(() => new Scene(), [])
  const postCam = useMemo(() => new OrthographicCamera(-1, 1, 1, -1, 0, 1), [])
  const material = useMemo(() => new ShaderMaterial({
    uniforms: {
      tDiffuse: { value: null },
      uTexel: { value: new Vector2(1 / 1280, 1 / 720) },
      uBloom: { value: tier === 'high' ? 0.9 : 0.6 },
      uThreshold: { value: 0.62 },
      uVignette: { value: 0.9 },
    },
    vertexShader: POST_VERT,
    fragmentShader: postFrag(tier === 'high' ? 8 : 5),
    depthTest: false,
    depthWrite: false,
  }), [tier])
  const quad = useMemo(() => new Mesh(new PlaneGeometry(2, 2), material), [material])

  useEffect(() => {
    // Capture into a display-ready (sRGB) target so the post shader operates on
    // the same colours that would normally hit the screen (renderer keeps its
    // default ACES tone-mapping + sRGB output — no renderer-state mutation).
    rt.texture.colorSpace = SRGBColorSpace
    postScene.add(quad)
    return () => { postScene.remove(quad); rt.dispose(); quad.geometry.dispose(); material.dispose() }
  }, [rt, postScene, quad, material])

  useEffect(() => {
    const dpr = gl.getPixelRatio()
    const w = Math.max(1, Math.floor(size.width * dpr))
    const h = Math.max(1, Math.floor(size.height * dpr))
    rt.setSize(w, h)
    ;(material.uniforms.uTexel.value as Vector2).set(1 / w, 1 / h)
  }, [size, gl, rt, material])

  useFrame(() => {
    const r = rt
    material.uniforms.tDiffuse.value = r.texture
    gl.setRenderTarget(r)
    gl.render(scene, camera)
    gl.setRenderTarget(null)
    gl.render(postScene, postCam)
  }, 1)
  return null
}
// =========================================================================
// DOM overlay — all readable English lives here (never a 3D texture). P0-3:
// big, high-contrast typography (WCAG-AA), clear focus-visible states. P0-4:
// NO answer reveal (no TARGET pill, neutral identical nameplates). P0-5: the
// Bajla teach-on-wrong card.
// =========================================================================
interface OverlayProps {
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
  const hintLabel = p.hintsUsed === 0 ? 'HINT · CLUE' : p.hintsUsed === 1 ? 'HINT · RULE OUT' : 'NO HINTS'
  return (
    <div className="mc-ov" style={{ position: 'absolute', inset: 0, fontFamily: 'var(--em-mono, ui-monospace, monospace)', color: '#F4F0FF' }}>
      <style>{`
        .mc-ov button:focus-visible { outline: 3px solid ${FOCUS}; outline-offset: 2px; }
        @keyframes mc-pop { 0%{transform:translate(-50%,8px);opacity:0} 100%{transform:translate(-50%,0);opacity:1} }
        @keyframes mc-teach { 0%{transform:translate(-50%,14px);opacity:0} 100%{transform:translate(-50%,0);opacity:1} }
      `}</style>

      {/* Screen-reader live region (canvas is aria-hidden inside CityStage) */}
      <div role="status" aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{p.live}</div>

      {/* Prompt panel — pinned top-centre. Bigger + high contrast (AA). */}
      {p.cur && (
        <div
          key={`p-${p.roundIdx}`}
          style={{
            position: 'absolute', top: 14, left: '50%', transform: 'translateX(-50%)',
            maxWidth: 'min(660px, 92%)', padding: '14px 22px', borderRadius: 14,
            background: 'rgba(10,6,20,0.92)', border: `2px solid ${FOCUS}`,
            boxShadow: '0 18px 40px rgba(0,0,0,0.5)', textAlign: 'center', animation: 'mc-pop 320ms ease',
          }}
        >
          <div style={{ fontSize: 12, letterSpacing: '0.22em', color: FOCUS, fontWeight: 700, marginBottom: 6 }}>
            CLUE · WSKAZÓWKA &nbsp;·&nbsp; {String(p.roundIdx + 1).padStart(2, '0')} / {String(p.total).padStart(2, '0')}
          </div>
          <div style={{ fontFamily: 'var(--em-decor, Georgia, "Times New Roman", serif)', fontSize: 22, lineHeight: 1.3, fontWeight: 700, color: '#FFFFFF' }}>
            {p.renderedPrompt}
          </div>
          {p.clueExpanded && p.cur.hint && (
            <div style={{ marginTop: 8, fontSize: 15, lineHeight: 1.35, color: '#E7DffF', fontStyle: 'italic' }}>
              In other words: {p.cur.hint}
            </div>
          )}
        </div>
      )}

      {/* HUD — progress only. NO target/answer reveal. */}
      <div style={{ position: 'absolute', top: 14, left: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <HudPill label="RECOVERED · ZEBRANE" value={`${p.correctCount} / ${p.total}`} />
        {p.bumpCount > 0 && <HudPill label="WARDEN BLOCKS" value={String(p.bumpCount)} accent="#cbb7ff" />}
      </div>

      {/* Neutral token nameplates — IDENTICAL for every option (no pre-reveal).
          Positioned each frame by the 3D LabelProjector. */}
      {p.tokens.map((tok, i) => (
        <div
          key={i}
          ref={(el) => { p.labelRefs.current[i] = el }}
          style={{
            position: 'absolute', top: 0, left: 0, opacity: 0, pointerEvents: 'none',
            padding: '5px 12px', borderRadius: 10, fontSize: 14, fontWeight: 800, whiteSpace: 'nowrap',
            letterSpacing: '0.01em', background: 'rgba(8,5,18,0.95)', color: '#FFFFFF',
            border: '1px solid rgba(255,255,255,0.42)', textShadow: '0 1px 2px rgba(0,0,0,0.8)',
            fontFamily: 'var(--em-decor, Georgia, serif)',
          }}
        >{tok.word}</div>
      ))}

      {/* Bajla teach-on-wrong card (P0-5) — contextual, aria-assertive. */}
      {p.teach && !p.completed && (
        <div
          role="alert"
          style={{
            position: 'absolute', bottom: 92, left: '50%', transform: 'translateX(-50%)',
            maxWidth: 'min(560px, 92%)', padding: '12px 16px', borderRadius: 14,
            background: 'rgba(24,12,40,0.96)', border: `2px solid ${NO}`,
            display: 'flex', gap: 12, alignItems: 'flex-start', animation: 'mc-teach 260ms ease',
            boxShadow: '0 16px 36px rgba(0,0,0,0.5)',
          }}
        >
          <BajlaGlyph />
          <div>
            <div style={{ fontSize: 11, letterSpacing: '0.18em', color: NO, fontWeight: 700, marginBottom: 3 }}>BAJLA</div>
            <div style={{ fontSize: 15, lineHeight: 1.4, color: '#FFF3F6' }}>{p.teach}</div>
          </div>
        </div>
      )}

      {/* Stun toast — warden friction (time-cost only, never scored). */}
      {p.stunned && !p.completed && (
        <div style={{ position: 'absolute', top: 84, left: '50%', transform: 'translateX(-50%)', padding: '6px 14px', borderRadius: 999, background: 'rgba(40,18,60,0.92)', border: '1px solid #cbb7ff66', color: '#E9DEFF', fontSize: 12, letterSpacing: '0.12em' }}>
          ⚠ A WARDEN BLOCKS THE WAY
        </div>
      )}

      {/* Correct flash toast */}
      {p.feedback === 'correct' && !p.completed && (
        <div style={{ position: 'absolute', top: 84, left: '50%', transform: 'translateX(-50%)', padding: '6px 14px', borderRadius: 999, background: 'rgba(18,40,20,0.92)', border: `1px solid ${OK}88`, color: OK, fontSize: 13, fontWeight: 700, letterSpacing: '0.1em' }}>
          ✓ THAT FITS THE CLUE
        </div>
      )}

      {/* Controls — Skip / Hint (≥44px, focus-visible) */}
      <div style={{ position: 'absolute', bottom: 14, left: 14, display: 'flex', gap: 8, pointerEvents: 'auto' }}>
        <button onClick={p.onSkip} style={btnStyle()} aria-label="Skip this round">SKIP</button>
        <button onClick={p.onHint} disabled={p.hintsUsed >= HINT_MAX} style={btnStyle(p.hintsUsed >= HINT_MAX)} aria-label={p.hintsUsed === 0 ? 'Hint: rephrase the clue' : p.hintsUsed === 1 ? 'Hint: rule out one wrong word' : 'No hints left'}>{hintLabel}</button>
      </div>

      {/* Touch D-pad */}
      <div style={{ position: 'absolute', bottom: 14, right: 14, display: 'grid', gridTemplateColumns: 'repeat(3, 48px)', gridTemplateRows: 'repeat(3, 48px)', gap: 4, pointerEvents: 'auto' }}>
        <span /><button onClick={() => p.onMove('up')} style={dpad()} aria-label="Move up">↑</button><span />
        <button onClick={() => p.onMove('left')} style={dpad()} aria-label="Move left">←</button><span /><button onClick={() => p.onMove('right')} style={dpad()} aria-label="Move right">→</button>
        <span /><button onClick={() => p.onMove('down')} style={dpad()} aria-label="Move down">↓</button><span />
      </div>

      {/* End card */}
      {p.completed && (
        <div role="dialog" aria-label="Museum After Dark complete" style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, background: `radial-gradient(ellipse, ${FOCUS}22, rgba(8,4,18,0.78))`, backdropFilter: 'blur(6px)', pointerEvents: 'auto' }}>
          <div style={{ fontFamily: 'var(--em-decor, Georgia, serif)', fontSize: 36, fontWeight: 800, color: '#FFFFFF', textShadow: `0 0 18px ${FOCUS}aa` }}>You found the way out.</div>
          <div style={{ fontSize: 15 }}>You recovered <strong style={{ color: FOCUS }}>{p.correctCount}</strong> / {p.total} artifacts</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={p.onReplay} style={btnStyle()}>Try again</button>
            <button onClick={p.onReplay} style={{ ...btnStyle(), background: FOCUS, color: '#06212B', borderColor: FOCUS, fontWeight: 800 }}>Next district →</button>
          </div>
        </div>
      )}
    </div>
  )
}

// Small inline owl glyph for the Bajla teach card (DOM, not a 3D texture).
function BajlaGlyph() {
  return (
    <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true" style={{ flexShrink: 0 }}>
      <circle cx="17" cy="18" r="12" fill={palette.bajlaPurple} />
      <circle cx="12" cy="15" r="4.5" fill={palette.ember} />
      <circle cx="22" cy="15" r="4.5" fill={palette.ember} />
      <circle cx="12" cy="15" r="2" fill={palette.night} />
      <circle cx="22" cy="15" r="2" fill={palette.night} />
      <path d="M17 18 l-2.4 3 h4.8 z" fill={palette.beak} />
      <path d="M7 7 l3 5 -5 -1 z" fill={palette.bajlaWing} />
      <path d="M27 7 l-3 5 5 -1 z" fill={palette.bajlaWing} />
    </svg>
  )
}

function HudPill({ label, value, accent }: { label: string; value: string; accent?: string }) {
  const c = accent ?? FOCUS
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 11px', background: 'rgba(8,5,18,0.9)', border: `1px solid ${c}88`, borderRadius: 6 }}>
      <span style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: c, fontWeight: 700 }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 800, color: '#FFFFFF' }}>{value}</span>
    </div>
  )
}

function btnStyle(disabled = false): React.CSSProperties {
  return {
    minHeight: 44, minWidth: 56, padding: '9px 16px', borderRadius: 8,
    background: 'rgba(125,211,252,0.16)', border: `1px solid ${FOCUS}88`,
    color: '#FFFFFF', fontFamily: 'var(--em-mono, ui-monospace, monospace)', fontSize: 13, fontWeight: 700,
    letterSpacing: '0.08em', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.4 : 1,
    touchAction: 'manipulation',
  }
}

function dpad(): React.CSSProperties {
  return {
    minWidth: 48, minHeight: 48, background: 'rgba(125,211,252,0.18)',
    border: `1px solid ${FOCUS}88`, borderRadius: 8, color: '#FFFFFF',
    fontSize: 20, fontWeight: 700, cursor: 'pointer', touchAction: 'manipulation',
  }
}
