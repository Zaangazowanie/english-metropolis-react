// Hangman3D — "Lantern Alley", the canonical Fluent City mood district.
//
// A three.js re-skin of the canonical 2D Hangman shell (src/practice/shells/
// Hangman.tsx). The MECHANIC — guess the hidden word letter by letter, each
// wrong letter costs one of `maxWrong` lives, solve the word to win the round,
// run a fixed set of rounds then emit a SessionResult — is inherited verbatim
// from the 2D shell and its generator (src/practice/generators/generateHangman
// .ts). This file changes only the stagecraft. Same puzzle in (HangmanPuzzle[])
// , same session result out (SessionResult). Built on the Fluent City GameKit
// (CityStage + useGameLoop + Bajla + palette).
//
// Fidelity note (binding, from docs/game3d/storyboards/hangman.md): a dusk
// London back-alley strung wall-to-wall with paper lanterns on a sagging gold
// rope. Each lantern is a life; wrong guesses dim them right-to-left with a
// downward ember burst; the low-poly skyline (Big Ben, St Paul's dome) and a
// soft moon sit on the violet horizon. Bajla the owl idles by the first lantern
// and breaks into a celebratory fly-by on a solved word.
//
// Contract compliance: single CityStage canvas (DPR clamped, aria-hidden); all
// readable English/Polish lives in the DOM overlay (word slots, A-Z keyboard,
// clue, HUD, CTAs) — never a 3D texture; quality tiers + reducedMotion honoured;
// procedural geometry + vertex/standard colours only (no GLB, no textures, no
// external link literals, no new deps); allocation-free render loop; instanced
// repeats (skyline, embers); full keyboard + touch input paths.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Color, Object3D } from 'three'
import type { Group, InstancedMesh, Mesh } from 'three'
import { Bajla, CityStage, palette, useGameLoop, useStageQuality } from './kit'
import type { Game3DProps, SessionResult, Vocab3DItem } from './types'
import { generateHangman } from '../generators/generateHangman'
import type { HangmanInput, HangmanPuzzle } from '../generators/generateHangman'

// ── Canonical mechanic constants (identical intent to the 2D shell) ─────────
const HINT_MAX = 3
const DEFAULT_MAX_WRONG = 6
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

// District palette accents — amber lantern light, green correct, rose wrong.
const AMBER = palette.lanternAmber
const GREEN = palette.leaf
const ROSE = '#fb7185'

// Round-transition timing (storyboard: solve beat ≈ 1.2s, loss reveal ≈ 1.6s).
const WIN_MS = 1200
const LOSE_MS = 1600

// ── ASCII-fold (same transform the generator uses) so guessing + display
// always align even when a surface word carries diacritics. ─────────────────
function foldWord(s: string): string {
  return s
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z]/g, '')
}

// ── Built-in demo puzzle — London-flavoured words so anonymous home-page play
// behaves like a real session (Game3DProps requires a demo when no puzzle /
// vocab is supplied). ───────────────────────────────────────────────────────
const DEMO_PUZZLE: HangmanPuzzle[] = [
  { word: 'BRIDGE', word_pl: 'most', hint: 'It crosses the river.', maxWrong: DEFAULT_MAX_WRONG },
  { word: 'LANTERN', word_pl: 'latarnia', hint: 'A paper light that glows at dusk.', maxWrong: DEFAULT_MAX_WRONG },
  { word: 'MARKET', word_pl: 'targ', hint: 'Stalls of sellers and goods.', maxWrong: DEFAULT_MAX_WRONG },
  { word: 'AVENUE', word_pl: 'aleja', hint: 'A wide tree-lined street.', maxWrong: DEFAULT_MAX_WRONG },
  { word: 'TOWER', word_pl: 'wieża', hint: 'Big Ben is one.', maxWrong: DEFAULT_MAX_WRONG },
  { word: 'RIVER', word_pl: 'rzeka', hint: 'The Thames is one.', maxWrong: DEFAULT_MAX_WRONG },
]

const vocabToHangman = (v: Vocab3DItem[]): HangmanInput[] =>
  v.map((it) => ({ word: it.word, word_pl: it.word_pl ?? '', clue: it.exampleEn }))

// ── Allocation-free scratch objects (single canvas, single game instance) ───
const _obj = new Object3D()
const _col = new Color()
const _litColor = new Color(palette.lanternAmber)
const _darkColor = new Color(palette.ink)

// Deterministic low-poly London skyline silhouette (Big Ben left, dome right).
// [x, width, height] in world units; laid along the back wall.
const SKYLINE: ReadonlyArray<readonly [number, number, number]> = [
  [-6.2, 0.9, 1.4], [-5.3, 0.7, 2.0], [-4.5, 0.8, 1.1], [-3.6, 0.6, 1.7],
  [-2.7, 1.0, 1.0], [-1.9, 0.7, 1.5], [-1.0, 0.9, 0.9], [0.0, 0.7, 1.3],
  [0.9, 1.0, 1.0], [1.8, 0.7, 1.8], [2.7, 0.9, 1.1], [3.7, 0.8, 1.5],
  [4.6, 0.7, 1.0], [5.5, 1.0, 1.9], [6.3, 0.8, 1.2],
]
const SKYLINE_Z = -5
const SKYLINE_Y = -0.9 // base of the buildings (rooted into the horizon)

// =========================================================================
// Scene (inside the Canvas — reads live game state via props each frame)
// =========================================================================
interface SceneProps {
  litCount: number
  maxWrong: number
  solved: boolean
  lost: boolean
  wrongCount: number
  reducedMotion: boolean
  bajla: 'idle' | 'flyby' | 'celebrate'
}

function AlleyScene({ litCount, maxWrong, solved, lost, wrongCount, reducedMotion, bajla }: SceneProps) {
  const { settings, tier } = useStageQuality()
  const highFx = tier === 'high' && !reducedMotion
  const lanternXs = useMemo(() => lanternLayout(maxWrong), [maxWrong])

  return (
    <group>
      {tier === 'high' && <fog attach="fog" args={[palette.night, 10, 26]} />}
      <Moon highFx={highFx} />
      <Skyline />
      <Ground shadows={settings.shadows} highFx={highFx} />
      <Rope span={lanternXs.span} />
      <LanternRow
        xs={lanternXs.xs}
        litCount={solved ? maxWrong : lost ? 0 : litCount}
        celebrate={solved}
        reducedMotion={reducedMotion}
        flicker={tier !== 'low' && !reducedMotion}
        shadows={settings.shadows}
      />
      {settings.particles > 0 && (
        <Embers xs={lanternXs.xs} wrongCount={wrongCount} maxWrong={maxWrong} reducedMotion={reducedMotion} />
      )}
      {highFx && <pointLight position={[0, 2.0, 1.6]} color={palette.lanternAmber} intensity={Math.max(0.15, litCount / maxWrong) * 1.1} distance={14} decay={2} />}
      <Bajla
        variant={bajla}
        reducedMotion={reducedMotion}
        scale={0.4}
        position={[lanternXs.xs[0] - 1.2, 1.35, 0.6]}
      />
    </group>
  )
}

// Lantern X positions, centred on origin, plus the rope span half-width.
function lanternLayout(n: number): { xs: number[]; span: number } {
  const spacing = 1.16
  const xs: number[] = []
  for (let i = 0; i < n; i++) xs.push((i - (n - 1) / 2) * spacing)
  const span = ((n - 1) / 2) * spacing + 1.1
  return { xs, span }
}

// Soft dusk moon — pale emissive disc + an additive glow halo on high tier.
function Moon({ highFx }: { highFx: boolean }) {
  return (
    <group position={[3.4, 2.7, -4.2]}>
      <mesh>
        <sphereGeometry args={[0.6, 20, 16]} />
        <meshStandardMaterial color={palette.ember} emissive={palette.ember} emissiveIntensity={0.7} roughness={1} />
      </mesh>
      {highFx && (
        <mesh>
          <sphereGeometry args={[1.05, 18, 14]} />
          <meshBasicMaterial color={palette.skyGlow} transparent opacity={0.18} depthWrite={false} blending={2} />
        </mesh>
      )}
    </group>
  )
}

// Instanced low-poly skyline silhouette + two landmark accents (Big Ben spire,
// St Paul's dome). One instanced draw call for the bulk of the buildings.
function Skyline() {
  const inst = useRef<InstancedMesh>(null)
  useEffect(() => {
    const mesh = inst.current
    if (!mesh) return
    SKYLINE.forEach(([x, w, h], i) => {
      _obj.position.set(x, SKYLINE_Y + h / 2, SKYLINE_Z)
      _obj.rotation.set(0, 0, 0)
      _obj.scale.set(w, h, 0.6)
      _obj.updateMatrix()
      mesh.setMatrixAt(i, _obj.matrix)
      _col.set(palette.night)
      mesh.setColorAt(i, _col)
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [])
  return (
    <group>
      <instancedMesh ref={inst} args={[undefined, undefined, SKYLINE.length]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={1} />
      </instancedMesh>
      {/* Big Ben tower (left) — dark silhouette with a faint warm clock face */}
      <group position={[-5.3, SKYLINE_Y, SKYLINE_Z + 0.2]}>
        <mesh position={[0, 1.2, 0]}>
          <boxGeometry args={[0.42, 2.4, 0.42]} />
          <meshStandardMaterial color={palette.night} roughness={1} />
        </mesh>
        <mesh position={[0, 2.55, 0]}>
          <coneGeometry args={[0.3, 0.6, 4]} />
          <meshStandardMaterial color={palette.night} roughness={1} />
        </mesh>
        <mesh position={[0, 1.7, 0.22]}>
          <circleGeometry args={[0.12, 16]} />
          <meshStandardMaterial color={palette.lanternCore} emissive={palette.lanternAmber} emissiveIntensity={0.6} />
        </mesh>
      </group>
      {/* St Paul's dome (right) */}
      <group position={[5.2, SKYLINE_Y, SKYLINE_Z + 0.2]}>
        <mesh position={[0, 0.9, 0]}>
          <boxGeometry args={[1.0, 1.8, 0.5]} />
          <meshStandardMaterial color={palette.night} roughness={1} />
        </mesh>
        <mesh position={[0, 1.9, 0]}>
          <sphereGeometry args={[0.5, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color={palette.night} roughness={1} />
        </mesh>
        <mesh position={[0, 2.4, 0]}>
          <cylinderGeometry args={[0.05, 0.05, 0.3, 8]} />
          <meshStandardMaterial color={palette.night} roughness={1} />
        </mesh>
      </group>
    </group>
  )
}

// Cobble alley floor — catches the warm lantern key. One plane.
function Ground({ shadows, highFx }: { shadows: boolean; highFx: boolean }) {
  return (
    <mesh position={[0, -1.4, 1.0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow={shadows}>
      <planeGeometry args={[26, 12]} />
      <meshStandardMaterial color={palette.ink} roughness={highFx ? 0.55 : 0.85} metalness={highFx ? 0.25 : 0.08} />
    </mesh>
  )
}

// Sagging gold rope strung between two wall posts at the top of the alley.
function Rope({ span }: { span: number }) {
  return (
    <group position={[0, 2.55, 0]}>
      {[-span, span].map((x, i) => (
        <mesh key={i} position={[x, -0.35, 0]}>
          <cylinderGeometry args={[0.05, 0.06, 1.4, 10]} />
          <meshStandardMaterial color={palette.brass} roughness={0.5} metalness={0.5} emissive={palette.brass} emissiveIntensity={0.1} />
        </mesh>
      ))}
      {/* Rope itself — a thin slightly-bowed box between the posts */}
      <mesh position={[0, -0.02, 0]} rotation={[0, 0, 0]}>
        <boxGeometry args={[span * 2, 0.05, 0.05]} />
        <meshStandardMaterial color={palette.gold} roughness={0.55} metalness={0.4} emissive={palette.brass} emissiveIntensity={0.12} />
      </mesh>
    </group>
  )
}

// The hanging paper lanterns. Each is a group (cord + glowing body + caps);
// the row dims right-to-left as `litCount` drops. Allocation-free: the loop
// tweens emissive intensity + sway via stored refs, no per-frame allocation.
interface LanternRowProps {
  xs: number[]
  litCount: number
  celebrate: boolean
  reducedMotion: boolean
  flicker: boolean
  shadows: boolean
}

function LanternRow({ xs, litCount, celebrate, reducedMotion, flicker, shadows }: LanternRowProps) {
  const groups = useRef<(Group | null)[]>([])
  const cores = useRef<(Mesh | null)[]>([])
  const glows = useRef<(Mesh | null)[]>([])

  useFrame((state) => {
    const t = state.clock.elapsedTime
    for (let i = 0; i < xs.length; i++) {
      const lit = i < litCount
      const g = groups.current[i]
      if (g) {
        // Gentle individual sway (frozen flat under reducedMotion).
        g.rotation.z = reducedMotion ? 0 : Math.sin(t * 1.3 + i * 0.7) * 0.06
      }
      const core = cores.current[i]
      if (core) {
        const mat = core.material as { emissiveIntensity?: number; color?: Color }
        let target = lit ? 1.05 : 0.04
        if (lit && celebrate) target = 1.5 + (reducedMotion ? 0 : Math.sin(t * 6 + i) * 0.25)
        else if (lit && flicker) target = 1.0 + Math.sin(t * 7 + i * 2.1) * 0.16
        if (mat && typeof mat.emissiveIntensity === 'number') {
          mat.emissiveIntensity = reducedMotion ? target : mat.emissiveIntensity + (target - mat.emissiveIntensity) * 0.2
        }
        if (mat.color) mat.color.copy(lit ? _litColor : _darkColor)
      }
      const glow = glows.current[i]
      if (glow) {
        const want = lit ? (celebrate ? 0.32 : 0.2) : 0
        const mat = glow.material as { opacity?: number }
        if (mat && typeof mat.opacity === 'number') {
          mat.opacity = reducedMotion ? want : mat.opacity + (want - mat.opacity) * 0.2
        }
        glow.visible = (mat?.opacity ?? 0) > 0.02
      }
    }
  })

  return (
    <group position={[0, 2.5, 0]}>
      {xs.map((x, i) => {
        const cordLen = 0.5 + (i % 2) * 0.12
        return (
          <group key={i} ref={(el) => { groups.current[i] = el }} position={[x, 0, 0]}>
            {/* Cord */}
            <mesh position={[0, -cordLen / 2, 0]}>
              <cylinderGeometry args={[0.012, 0.012, cordLen, 6]} />
              <meshStandardMaterial color={palette.brass} roughness={0.7} />
            </mesh>
            {/* Top + bottom caps */}
            <mesh position={[0, -cordLen, 0]}>
              <cylinderGeometry args={[0.1, 0.12, 0.06, 12]} />
              <meshStandardMaterial color={palette.brass} roughness={0.6} metalness={0.3} />
            </mesh>
            <mesh position={[0, -cordLen - 0.52, 0]}>
              <cylinderGeometry args={[0.07, 0.05, 0.05, 12]} />
              <meshStandardMaterial color={palette.brass} roughness={0.6} metalness={0.3} />
            </mesh>
            {/* Glowing paper body */}
            <mesh
              ref={(el) => { cores.current[i] = el }}
              position={[0, -cordLen - 0.28, 0]}
              scale={[1, 1.15, 1]}
              castShadow={shadows}
            >
              <sphereGeometry args={[0.24, 16, 12]} />
              <meshStandardMaterial
                color={palette.lanternAmber}
                emissive={palette.lanternAmber}
                emissiveIntensity={1.0}
                roughness={0.6}
                transparent
                opacity={0.96}
              />
            </mesh>
            {/* Additive bloom halo (fake glow — no postprocessing) */}
            <mesh ref={(el) => { glows.current[i] = el }} position={[0, -cordLen - 0.28, 0]}>
              <sphereGeometry args={[0.46, 14, 10]} />
              <meshBasicMaterial color={palette.lanternAmber} transparent opacity={0.2} depthWrite={false} blending={2} />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}

// Ember burst — instanced quads that fall from the just-extinguished lantern.
// Fires when wrongCount increases; idle (scaled to 0) otherwise.
function Embers({ xs, wrongCount, maxWrong, reducedMotion }: { xs: number[]; wrongCount: number; maxWrong: number; reducedMotion: boolean }) {
  const inst = useRef<InstancedMesh>(null)
  const COUNT = 12
  const prevWrong = useRef(wrongCount)
  const startAt = useRef(-10)
  const anchor = useRef<[number, number]>([0, 0])

  useEffect(() => {
    const mesh = inst.current
    if (!mesh) return
    _col.set(palette.ember)
    for (let i = 0; i < COUNT; i++) mesh.setColorAt(i, _col)
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [])

  useFrame((state) => {
    const mesh = inst.current
    if (!mesh) return
    // Detect a fresh wrong guess → anchor embers on the lantern that just died.
    if (wrongCount > prevWrong.current) {
      const litCount = Math.max(0, maxWrong - wrongCount) // index of the newly-dark lantern
      const lx = xs[Math.min(xs.length - 1, Math.max(0, litCount))] ?? 0
      anchor.current = [lx, 2.5 - 0.78]
      startAt.current = state.clock.elapsedTime
    }
    prevWrong.current = wrongCount

    const age = state.clock.elapsedTime - startAt.current
    const life = reducedMotion ? 0 : 1.1
    if (age < 0 || age > life) {
      // idle — hide all embers
      for (let i = 0; i < COUNT; i++) {
        _obj.position.set(0, -999, 0)
        _obj.scale.set(0, 0, 0)
        _obj.updateMatrix()
        mesh.setMatrixAt(i, _obj.matrix)
      }
      mesh.instanceMatrix.needsUpdate = true
      return
    }
    const f = age / life // 0..1
    const [ax, ay] = anchor.current
    for (let i = 0; i < COUNT; i++) {
      const a = (i / COUNT) * Math.PI * 2
      const spread = 0.18 + (i % 3) * 0.05
      const x = ax + Math.cos(a) * spread * (0.5 + f)
      const y = ay - f * (0.7 + (i % 4) * 0.12)
      const s = (1 - f) * 0.07
      _obj.position.set(x, y, 0.3)
      _obj.rotation.set(0, 0, a + f * 3)
      _obj.scale.set(s, s, s)
      _obj.updateMatrix()
      mesh.setMatrixAt(i, _obj.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={inst} args={[undefined, undefined, COUNT]} frustumCulled={false}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial color={palette.ember} transparent opacity={0.9} depthWrite={false} blending={2} />
    </instancedMesh>
  )
}

// =========================================================================
// Hangman3D — the Game3D component (default export)
// =========================================================================
export default function Hangman3D({ puzzle, vocab, onSessionComplete, quality, reducedMotion, fullscreen }: Game3DProps) {
  const prefersReduced = usePrefersReducedMotion()
  const reduce = reducedMotion ?? prefersReduced

  // Resolve the active word list: explicit puzzle → vocab via generator → demo.
  const puzzles = useMemo<HangmanPuzzle[]>(() => {
    const p = puzzle as HangmanPuzzle[] | undefined
    if (Array.isArray(p) && p.length > 0 && typeof p[0]?.word === 'string') return p
    if (vocab && vocab.length > 0) {
      const gen = generateHangman(vocabToHangman(vocab), { seed: 0xA47 })
      if (gen.length > 0) return gen
    }
    return DEMO_PUZZLE
  }, [puzzle, vocab])

  const total = puzzles.length

  const [roundIdx, setRoundIdx] = useState(0)
  const [guessed, setGuessed] = useState<string[]>([])
  const [skipped, setSkipped] = useState(false)
  const [solvedFlags, setSolvedFlags] = useState<boolean[]>(() => puzzles.map(() => false))
  const [hintsUsed, setHintsUsed] = useState(0)
  const [completed, setCompleted] = useState(false)
  const [live, setLive] = useState('')

  const startMs = useRef(performance.now())
  const fired = useRef(false)
  const recorded = useRef<boolean[]>([])
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Derived round state ──────────────────────────────────────────────────
  const cur = puzzles[Math.min(roundIdx, total - 1)]
  const folded = useMemo(() => foldWord(cur?.word ?? ''), [cur])
  const maxWrong = Math.max(1, cur?.maxWrong ?? DEFAULT_MAX_WRONG)
  const uniqueLetters = useMemo(() => Array.from(new Set(folded.split(''))), [folded])
  const wrongLetters = useMemo(() => guessed.filter((g) => !folded.includes(g)), [guessed, folded])
  const wrongCount = wrongLetters.length
  const solved = uniqueLetters.length > 0 && uniqueLetters.every((l) => guessed.includes(l))
  const lost = wrongCount >= maxWrong
  const roundOver = solved || lost || skipped
  const litCount = Math.max(0, maxWrong - wrongCount)
  const livesLeft = lost ? 0 : litCount

  const bajla: 'idle' | 'flyby' | 'celebrate' = completed
    ? 'celebrate'
    : solved
      ? 'flyby'
      : 'idle'

  // useGameLoop kept for GameKit parity — the scene reads game state via props
  // each frame; the mechanic itself is event-driven (like the 2D shell).
  const noop = useCallback(() => {}, [])
  useGameLoop(noop, undefined, { stepMs: 1000 / 30, running: !completed, reducedMotion: reduce })

  // ── Round resolution + advance ─────────────────────────────────────────────
  useEffect(() => {
    if (!roundOver || completed) return
    if (recorded.current[roundIdx]) return
    recorded.current[roundIdx] = true
    const didSolve = solved
    setSolvedFlags((prev) => {
      const n = prev.slice()
      n[roundIdx] = didSolve
      return n
    })
    setLive(
      didSolve
        ? `Solved: ${folded}. ${cur?.word_pl ? `(${cur.word_pl}) ` : ''}Round ${roundIdx + 1} of ${total} complete.`
        : `Out of lanterns. The word was ${folded}.${cur?.word_pl ? ` (${cur.word_pl})` : ''}`,
    )
    advanceTimer.current = setTimeout(() => {
      if (roundIdx + 1 >= total) {
        setCompleted(true)
      } else {
        setRoundIdx((r) => r + 1)
        setGuessed([])
        setSkipped(false)
      }
    }, reduce ? 60 : didSolve ? WIN_MS : LOSE_MS)
  }, [roundOver, solved, completed, roundIdx, total, folded, cur, reduce])

  // Fire the session result exactly once, on completion.
  useEffect(() => {
    if (completed && !fired.current) {
      fired.current = true
      const correctCount = solvedFlags.filter(Boolean).length
      setLive(`Session complete. You solved ${correctCount} of ${total} words.`)
      const result: SessionResult = {
        correctCount,
        totalQuestions: total,
        durationMs: Math.round(performance.now() - startMs.current),
        shellKey: 'hangman',
      }
      onSessionComplete?.(result)
    }
  }, [completed, solvedFlags, total, onSessionComplete])

  // ── Actions ────────────────────────────────────────────────────────────────
  const guess = useCallback((letter: string): void => {
    const L = letter.toUpperCase()
    if (!/^[A-Z]$/.test(L)) return
    if (roundOver || guessed.includes(L)) return
    setGuessed((prev) => (prev.includes(L) ? prev : [...prev, L]))
    setLive(folded.includes(L) ? `${L} is in the word.` : `${L} is not in the word.`)
  }, [roundOver, guessed, folded])

  const useHint = useCallback((): void => {
    if (hintsUsed >= HINT_MAX) return
    const hidden = uniqueLetters.filter((l) => !guessed.includes(l))
    if (hidden.length === 0) return
    const reveal = hidden[0]
    setHintsUsed((h) => h + 1)
    setGuessed((prev) => (prev.includes(reveal) ? prev : [...prev, reveal]))
    setLive(`Hint: the letter ${reveal} is in the word.`)
  }, [hintsUsed, uniqueLetters, guessed])

  const skip = useCallback((): void => {
    if (roundOver) return
    setSkipped(true)
    setLive(`Skipped. The word was ${folded}.`)
  }, [roundOver, folded])

  const replay = useCallback((): void => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current)
    fired.current = false
    recorded.current = []
    startMs.current = performance.now()
    setRoundIdx(0)
    setGuessed([])
    setSkipped(false)
    setHintsUsed(0)
    setCompleted(false)
    setSolvedFlags(puzzles.map(() => false))
    setLive('')
  }, [puzzles])

  // Keyboard — A–Z guess; H hint; S skip; Enter replays on the end card.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (completed) {
        if (e.key === 'Enter') { e.preventDefault(); replay() }
        return
      }
      const k = e.key
      if (/^[a-zA-Z]$/.test(k)) {
        if (roundOver) return
        e.preventDefault()
        guess(k)
      } else if (k === 'h' || k === 'H') {
        e.preventDefault(); useHint()
      } else if (k === 's' || k === 'S') {
        e.preventDefault(); skip()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [completed, roundOver, guess, useHint, skip, replay])

  // Cleanup timer on unmount.
  useEffect(() => () => { if (advanceTimer.current) clearTimeout(advanceTimer.current) }, [])

  const correctCount = solvedFlags.filter(Boolean).length

  // ── DOM overlay (all readable English/Polish lives here) ────────────────────
  const overlay = (
    <div style={{ position: 'absolute', inset: 0, fontFamily: 'var(--em-body, system-ui, sans-serif)', color: '#EDE6FF' }}>
      <style>{`
        @keyframes hm-pop { 0%{transform:translateY(8px);opacity:0} 100%{transform:translateY(0);opacity:1} }
        @keyframes hm-flip { 0%{transform:rotateX(90deg);opacity:0} 100%{transform:rotateX(0);opacity:1} }
        .hm-key:focus-visible { outline: 2px solid ${AMBER}; outline-offset: 2px; }
      `}</style>

      {/* Screen-reader live region (canvas is aria-hidden inside CityStage) */}
      <div role="status" aria-live="polite" style={srOnly}>{live}</div>

      {/* HUD — round + lives + district, top-left */}
      <div style={{ position: 'absolute', top: 12, left: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <HudPill label="ROUND · RUNDA" value={`${Math.min(roundIdx + 1, total)}/${total}`} accent={AMBER} />
        <HudPill label="LANTERNS · LATARNIE" value={`${livesLeft}/${maxWrong}`} accent={livesLeft <= 1 ? ROSE : GREEN} />
        <HudPill label="DISTRICT · DZIELNICA" value="Lantern Alley" accent={AMBER} />
      </div>

      {/* Score, top-right */}
      <div style={{ position: 'absolute', top: 12, right: 12 }}>
        <HudPill label="SOLVED · ROZWIĄZANE" value={`${correctCount}`} accent={GREEN} />
      </div>

      {/* Word slots + clue — the readable core, centred above the keyboard */}
      {!completed && cur && (
        <div style={{ position: 'absolute', left: '50%', top: '34%', transform: 'translate(-50%, -50%)', width: 'min(680px, calc(100% - 24px))', textAlign: 'center', pointerEvents: 'none' }}>
          <div
            role="img"
            aria-label={`Word: ${folded.split('').map((ch) => (solved || lost || guessed.includes(ch) ? ch : 'blank')).join(' ')}`}
            style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}
          >
            {folded.split('').map((ch, i) => {
              const reveal = solved || lost || guessed.includes(ch)
              const missReveal = (lost || skipped) && !guessed.includes(ch)
              return (
                <span
                  key={i}
                  aria-hidden="true"
                  style={{
                    width: 'clamp(26px, 7vw, 44px)', height: 'clamp(38px, 10vw, 60px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: 'var(--em-mono, ui-monospace, monospace)', fontSize: 'clamp(20px, 5vw, 32px)', fontWeight: 700,
                    color: missReveal ? ROSE : reveal ? '#FFF6DF' : 'transparent',
                    borderBottom: `3px solid ${reveal ? AMBER : 'rgba(237,230,255,0.4)'}`,
                    textShadow: reveal ? `0 0 12px ${AMBER}88` : 'none',
                    transition: 'color 200ms ease, border-color 200ms ease',
                  }}
                >
                  {reveal ? ch : ''}
                </span>
              )
            })}
          </div>
          <div style={{ fontSize: 14, color: '#EDE6FF', opacity: 0.92 }}>
            <span style={{ color: AMBER, letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: 11 }}>Clue · Wskazówka: </span>
            <strong style={{ color: '#FFF6DF' }}>{cur.word_pl}</strong>
            {cur.hint ? <span style={{ opacity: 0.85 }}> — {cur.hint}</span> : null}
          </div>
        </div>
      )}

      {/* On-screen A–Z keyboard — primary touch input, fully tabbable */}
      {!completed && (
        <div style={{ position: 'absolute', left: '50%', bottom: 64, transform: 'translateX(-50%)', width: 'min(620px, calc(100% - 16px))', display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', pointerEvents: 'auto' }}>
          {ALPHABET.split('').map((ch) => {
            const used = guessed.includes(ch)
            const inWord = used && folded.includes(ch)
            const isWrong = used && !folded.includes(ch)
            const disabled = used || roundOver
            return (
              <button
                key={ch}
                className="hm-key"
                onClick={() => guess(ch)}
                disabled={disabled}
                aria-label={`Letter ${ch}${used ? (inWord ? ', in the word' : ', not in the word') : ''}`}
                style={{
                  width: 'clamp(28px, 8.5vw, 40px)', height: 44, minWidth: 0, padding: 0, borderRadius: 8,
                  fontFamily: 'var(--em-mono, ui-monospace, monospace)', fontSize: 15, fontWeight: 700,
                  cursor: disabled ? 'default' : 'pointer', touchAction: 'manipulation',
                  background: inWord ? 'rgba(127,176,105,0.22)' : isWrong ? 'rgba(251,113,133,0.16)' : 'rgba(255,255,255,0.06)',
                  border: `1px solid ${inWord ? `${GREEN}aa` : isWrong ? `${ROSE}88` : 'rgba(255,255,255,0.14)'}`,
                  color: inWord ? GREEN : isWrong ? ROSE : '#EDE6FF',
                  opacity: used && !inWord ? 0.5 : 1,
                  transition: 'all 160ms ease',
                }}
              >
                {ch}
              </button>
            )
          })}
        </div>
      )}

      {/* Controls — Hint / Skip, bottom-left */}
      {!completed && (
        <div style={{ position: 'absolute', bottom: 12, left: 12, display: 'flex', gap: 8, pointerEvents: 'auto' }}>
          <button onClick={useHint} disabled={hintsUsed >= HINT_MAX || roundOver} style={btnStyle(hintsUsed >= HINT_MAX || roundOver)} aria-label={`Hint, ${HINT_MAX - hintsUsed} left`}>HINT {HINT_MAX - hintsUsed}</button>
          <button onClick={skip} disabled={roundOver} style={btnStyle(roundOver)} aria-label="Skip this word">SKIP</button>
        </div>
      )}

      {/* End card */}
      {completed && (
        <div role="dialog" aria-label="Lantern Alley complete" style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, background: `radial-gradient(ellipse, ${AMBER}22, rgba(10,5,24,0.74))`, backdropFilter: 'blur(6px)', pointerEvents: 'auto', textAlign: 'center', padding: '0 16px' }}>
          <div style={{ fontFamily: 'var(--em-decor, system-ui)', fontSize: 34, color: AMBER, textShadow: `0 0 18px ${AMBER}aa` }}>The alley is lit.</div>
          <div style={{ fontSize: 15 }}>You solved <strong style={{ color: GREEN }}>{correctCount}</strong> / {total} words</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={replay} style={btnStyle()}>Play again</button>
            <button onClick={replay} style={{ ...btnStyle(), background: GREEN, color: '#06210F', borderColor: GREEN }}>Next district →</button>
          </div>
        </div>
      )}
    </div>
  )

  return (
    <div
      role="application"
      aria-label="Lantern Alley — spell each hidden word before the lanterns go dark"
      style={{ position: 'relative', width: '100%', height: '100%', minHeight: 320 }}
    >
      <CityStage
        quality={quality}
        reducedMotion={reduce}
        fullscreen={fullscreen}
        cameraPosition={[0, 0.8, 7.4]}
        cameraFov={42}
        overlay={overlay}
      >
        <AlleyScene
          litCount={litCount}
          maxWrong={maxWrong}
          solved={solved}
          lost={lost}
          wrongCount={wrongCount}
          reducedMotion={reduce}
          bajla={bajla}
        />
      </CityStage>
    </div>
  )
}

// ── Small DOM helpers ─────────────────────────────────────────────────────────
const srOnly: React.CSSProperties = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }

function HudPill({ label, value, accent }: { label: string; value: string; accent?: string }) {
  const c = accent ?? AMBER
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 10px', background: 'rgba(14,10,26,0.85)', border: `1px solid ${c}66`, borderRadius: 6 }}>
      <span style={{ fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: c }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 700, color: '#FFFFFF' }}>{value}</span>
    </div>
  )
}

function btnStyle(disabled = false): React.CSSProperties {
  return {
    minHeight: 44, minWidth: 52, padding: '8px 14px', borderRadius: 8,
    background: `${AMBER}22`, border: `1px solid ${AMBER}66`,
    color: AMBER, fontFamily: 'var(--em-mono, ui-monospace, monospace)', fontSize: 12,
    letterSpacing: '0.1em', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.45 : 1,
    touchAction: 'manipulation',
  }
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
