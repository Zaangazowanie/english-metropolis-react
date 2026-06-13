// Snake3D — "Metro Snake", The Underground district.
//
// A three.js re-skin of the canonical 2D Snake shell (src/practice/shells/
// Snake.tsx). The MECHANIC, scoring, round count, hint/skip rules and the
// no-fail wrapping tick are inherited verbatim from the 2D shell — this file
// changes only the stagecraft. Same puzzle in (ArcadePuzzle), same session
// result out (SessionResult). Built on the Fluent City GameKit
// (CityStage + useGameLoop + Bajla + palette).
//
// Fidelity note (binding, from docs/game3d/storyboards/snake.md): the 2D Snake
// WRAPS at the edges and has NO self-collision / wall-crash fail state — the
// only scored outcomes are right-token (grow, +10) and wrong-token (shrink,
// +miss). The trailing carriages are visual delight, never a lose condition.
//
// Contract compliance: single CityStage canvas (DPR clamped, aria-hidden);
// all readable English lives in the DOM overlay (never a 3D texture); quality
// tiers + reducedMotion honoured; full keyboard + touch input; procedural
// geometry + vertex/instance colours only (no GLB, no textures, no external
// URLs, no new deps); allocation-free render loop; instanced repeats.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Color, MathUtils, Object3D, Vector3 } from 'three'
import type { Group, InstancedMesh, Mesh, PerspectiveCamera, PointLight } from 'three'
import { Bajla, CityStage, palette, useGameLoop, useStageQuality } from './kit'
import type { Game3DProps, SessionResult, Vocab3DItem } from './types'
import { generateSnakePuzzle } from '../generators/generateSnake'
import type { ArcadeInput, ArcadePuzzle, ArcadeRound } from '../generators/generateArcade'

// ── Canonical grid + timing (identical to the 2D shell) ──────────────────
const COLS = 16
const ROWS = 12
const TICK_MS = 180
const START_LEN = 5
const MIN_LEN = 2
const HINT_MAX = 3
const HINT_MS = 3000
const ADVANCE_MS = 1100
const CLEAR_MS = 700

// District-line green train + amber halo (mirrors the 2D ACCENT palette).
const TRAIN_HEAD = '#22C55E'
const TRAIN_TAIL = '#15803D'
const HALO = '#FBBF24'
const ROSE = '#FB7185'

// World mapping — board centred on the origin in the XZ plane. Smaller row
// index = further from camera (towards the tunnel mouth at -Z).
const CELL = 0.4
const HALF_W = (COLS * CELL) / 2
const HALF_D = (ROWS * CELL) / 2
const worldX = (c: number): number => (c + 0.5) * CELL - HALF_W
const worldZ = (r: number): number => (r + 0.5) * CELL - HALF_D

const MAX_SEG = START_LEN + 8 // grows by 1 per correct over <=5 rounds

type Cell = { r: number; c: number }
type Dir = 'up' | 'down' | 'left' | 'right'
const OPP: Record<Dir, Dir> = { up: 'down', down: 'up', left: 'right', right: 'left' }
const DIR_YAW: Record<Dir, number> = { right: 0, up: Math.PI / 2, left: Math.PI, down: -Math.PI / 2 }

interface Token {
  cell: Cell
  optionIdx: number
  word: string
  isAnswer: boolean
  eaten: boolean
}

interface GameState {
  cells: Cell[]
  prev: Cell[]
  dir: Dir
  queued: Dir | null
  tokens: Token[]
  roundIdx: number
  stepAt: number
}

// ── Built-in demo puzzle — copied verbatim from the 2D shell so anonymous
// home-page play behaves identically (Game3DProps requires a demo when no
// puzzle / vocab is supplied). ───────────────────────────────────────────
const DEMO_PUZZLE: ArcadePuzzle = {
  rounds: [
    { id: 's1', prompt: 'Wide leafy walking street.', options: ['avenue', 'cellar', 'gutter', 'spire'], answerIndex: 0, hint: 'Tree-lined and wide.', hint_pl: 'aleja' },
    { id: 's2', prompt: 'Tall street light beside the path.', options: ['lamppost', 'lantern', 'beacon', 'plinth'], answerIndex: 0, hint: 'Cast iron, single bulb at top, Victorian streets.', hint_pl: 'latarnia' },
    { id: 's3', prompt: 'Trimmed wall of bushes.', options: ['hedge', 'fence', 'plinth', 'gable'], answerIndex: 0, hint: 'Living green wall in a garden.', hint_pl: 'żywopłot' },
    { id: 's4', prompt: 'A long wooden seat in a park.', options: ['stool', 'bench', 'pew', 'crate'], answerIndex: 1, hint: 'For sitting and feeding pigeons.', hint_pl: 'ławka' },
    { id: 's5', prompt: 'Stone steps going up a slope.', options: ['terrace', 'stairway', 'cellar', 'grille'], answerIndex: 1, hint: 'A flight of steps.', hint_pl: 'schody' },
  ],
}

// Per-shell answer-leak guard — belt-and-suspenders with the generator's
// maskAnswerInPrompt. If the rendered prompt contains the answer word
// (case-insensitive, whole word) replace it with `___`.
function maskAnswerInPrompt(prompt: string | undefined, answer: string | undefined): string {
  if (!prompt) return ''
  if (!answer) return prompt
  const ans = answer.toLowerCase().trim()
  if (!ans) return prompt
  const safe = ans.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return prompt.replace(new RegExp(`\\b${safe}\\b`, 'gi'), '___')
}

// Deterministic token placement — identical seeding to the 2D shell so the
// scatter is stable across re-renders and matches the canonical layout.
function placeTokens(round: ArcadeRound, occupied: Set<string>): Token[] {
  let seed = ((round.id.split('').reduce((a, ch) => a + ch.charCodeAt(0), 0) * 2654435761) >>> 0)
  const rand = (): number => {
    seed = (seed + 0x6d2b79f5) >>> 0
    let t = seed
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const used = new Set(occupied)
  const placed: Token[] = []
  for (let i = 0; i < round.options.length; i++) {
    let attempt = 0
    while (attempt < 200) {
      const r = 1 + Math.floor(rand() * (ROWS - 2))
      const c = 6 + Math.floor(rand() * (COLS - 8))
      const key = `${r},${c}`
      if (!used.has(key)) {
        used.add(key)
        placed.push({ cell: { r, c }, optionIdx: i, word: round.options[i], isAnswer: i === round.answerIndex, eaten: false })
        break
      }
      attempt++
    }
  }
  return placed
}

function startCells(): Cell[] {
  const row = Math.floor(ROWS / 2)
  return [
    { r: row, c: 6 }, { r: row, c: 5 }, { r: row, c: 4 }, { r: row, c: 3 }, { r: row, c: 2 },
  ]
}

const vocabToArcade = (v: Vocab3DItem[]): ArcadeInput[] =>
  v.map((it) => ({ word: it.word, word_pl: it.word_pl ?? '', clue: it.exampleEn, partOfSpeech: it.partOfSpeech, topic: it.topic }))

// ── Allocation-free scratch objects (single canvas, single game instance) ─
const _pos = new Vector3()
const _prevPos = new Vector3()
const _obj = new Object3D()
const _col = new Color()
const _colHead = new Color(TRAIN_HEAD)
const _colTail = new Color(TRAIN_TAIL)

const segWorld = (cell: Cell, out: Vector3, y: number): Vector3 => out.set(worldX(cell.c), y, worldZ(cell.r))

// =========================================================================
// Scene (inside the Canvas — reads the live game ref each frame)
// =========================================================================
interface SceneProps {
  game: React.MutableRefObject<GameState>
  tokens: Token[]
  hintActive: boolean
  started: boolean
  reducedMotion: boolean
  bajla: 'idle' | 'flyby' | 'celebrate'
  labelRefs: React.MutableRefObject<(HTMLDivElement | null)[]>
}

function MetroScene({ game, tokens, hintActive, started, reducedMotion, bajla, labelRefs }: SceneProps) {
  const { settings, tier } = useStageQuality()
  const highFx = tier === 'high' && !reducedMotion
  const tunnelZ = worldZ(0) - 1.05

  return (
    <group>
      <CameraRig drift={highFx} reducedMotion={reducedMotion} />
      {tier === 'high' && <fog attach="fog" args={[palette.duskHorizon, 9, 20]} />}

      <Platform shadows={settings.shadows} />
      <TunnelRoundel z={tunnelZ} reducedMotion={reducedMotion} />
      <Lanterns flicker={tier !== 'low' && !reducedMotion} highFx={highFx} />
      {settings.particles > 0 && <Embers density={settings.particles} reducedMotion={reducedMotion} />}

      <Train game={game} reducedMotion={reducedMotion} started={started} shadows={settings.shadows} />
      <Tokens tokens={tokens} hintActive={hintActive} reducedMotion={reducedMotion} />
      <LabelProjector tokens={tokens} labelRefs={labelRefs} />

      <Bajla
        variant={bajla}
        reducedMotion={reducedMotion}
        scale={0.5}
        position={[0, 1.85, tunnelZ + 0.15]}
      />
    </group>
  )
}

function CameraRig({ drift, reducedMotion }: { drift: boolean; reducedMotion: boolean }) {
  const cam = useThree((s) => s.camera) as PerspectiveCamera
  const base = useRef<[number, number, number]>([0, 7.5, 4.5])
  useFrame((state) => {
    const [bx, by, bz] = base.current
    if (drift && !reducedMotion) {
      const t = state.clock.elapsedTime
      cam.position.set(bx + Math.sin(t * 0.18) * 0.35, by + Math.sin(t * 0.13) * 0.12, bz + Math.cos(t * 0.16) * 0.2)
    } else {
      cam.position.set(bx, by, bz)
    }
    cam.lookAt(0, 0, 0)
  })
  return null
}

function Platform({ shadows }: { shadows: boolean }) {
  const stripes = useRef<InstancedMesh>(null)
  const NUM = 7
  useEffect(() => {
    const mesh = stripes.current
    if (!mesh) return
    for (let i = 0; i < NUM; i++) {
      _obj.position.set(worldX(2 + i * 2), 0.012, 0)
      _obj.rotation.set(0, 0, 0)
      _obj.scale.set(1, 1, 1)
      _obj.updateMatrix()
      mesh.setMatrixAt(i, _obj.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  }, [])
  return (
    <group>
      {/* Platform slab */}
      <mesh position={[0, -0.12, 0]} receiveShadow={shadows}>
        <boxGeometry args={[COLS * CELL + 1.4, 0.24, ROWS * CELL + 1.1]} />
        <meshStandardMaterial color={palette.ink} roughness={0.95} />
      </mesh>
      {/* Platform face tiles (front lip) */}
      <mesh position={[0, -0.12, HALF_D + 0.5]}>
        <boxGeometry args={[COLS * CELL + 1.4, 0.42, 0.12]} />
        <meshStandardMaterial color={palette.duskMid} roughness={0.9} />
      </mesh>
      {/* Brass platform edges */}
      <mesh position={[-(HALF_W + 0.3), 0.02, 0]}>
        <boxGeometry args={[0.12, 0.06, ROWS * CELL + 1.0]} />
        <meshStandardMaterial color={palette.brass} roughness={0.5} metalness={0.4} emissive={palette.brass} emissiveIntensity={0.12} />
      </mesh>
      <mesh position={[HALF_W + 0.3, 0.02, 0]}>
        <boxGeometry args={[0.12, 0.06, ROWS * CELL + 1.0]} />
        <meshStandardMaterial color={palette.brass} roughness={0.5} metalness={0.4} emissive={palette.brass} emissiveIntensity={0.12} />
      </mesh>
      {/* Brass lane stripes running with the track */}
      <instancedMesh ref={stripes} args={[undefined, undefined, NUM]} frustumCulled={false}>
        <boxGeometry args={[0.03, 0.01, ROWS * CELL]} />
        <meshStandardMaterial color={palette.brass} roughness={0.6} emissive={palette.brass} emissiveIntensity={0.18} />
      </instancedMesh>
      {/* Tiled back wall (fades into the CityStage dusk-sky gradient) */}
      <mesh position={[0, 1.0, worldZ(0) - 1.7]}>
        <boxGeometry args={[COLS * CELL + 2.4, 2.6, 0.1]} />
        <meshStandardMaterial color={palette.duskMid} roughness={1} />
      </mesh>
    </group>
  )
}

function TunnelRoundel({ z, reducedMotion }: { z: number; reducedMotion: boolean }) {
  const ring = useRef<Mesh>(null)
  useFrame((state) => {
    const m = ring.current
    if (!m) return
    const base = 0.7
    const mat = m.material as { emissiveIntensity?: number }
    if (mat) mat.emissiveIntensity = reducedMotion ? base : base + Math.sin(state.clock.elapsedTime * 2.2) * 0.25
  })
  return (
    <group position={[0, 1.25, z]}>
      {/* Tunnel mouth — dark arch behind the roundel */}
      <mesh position={[0, -0.2, -0.25]}>
        <cylinderGeometry args={[1.5, 1.5, 0.4, 24, 1, true, 0, Math.PI]} />
        <meshStandardMaterial color={palette.night} roughness={1} side={2} />
      </mesh>
      <mesh position={[0, -0.5, -0.3]}>
        <boxGeometry args={[3.0, 0.3, 0.3]} />
        <meshStandardMaterial color={palette.night} roughness={1} />
      </mesh>
      {/* London Underground roundel — red ring + blue bar */}
      <mesh ref={ring}>
        <torusGeometry args={[0.55, 0.16, 14, 32]} />
        <meshStandardMaterial color="#E1251B" emissive="#E1251B" emissiveIntensity={0.7} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0, 0.02]}>
        <boxGeometry args={[1.7, 0.34, 0.12]} />
        <meshStandardMaterial color="#10357F" emissive="#10357F" emissiveIntensity={0.55} roughness={0.4} />
      </mesh>
    </group>
  )
}

function Lanterns({ flicker, highFx }: { flicker: boolean; highFx: boolean }) {
  const inst = useRef<InstancedMesh>(null)
  const light = useRef<PointLight>(null)
  const PER = 6
  const positions = useMemo(() => {
    const out: [number, number, number][] = []
    for (let i = 0; i < PER; i++) {
      const z = -HALF_D + 0.4 + (i / (PER - 1)) * (ROWS * CELL - 0.8)
      out.push([-(HALF_W + 0.42), 1.15, z])
      out.push([HALF_W + 0.42, 1.15, z])
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
    const f = 0.55 + Math.sin(state.clock.elapsedTime * 7.0) * 0.12 + Math.sin(state.clock.elapsedTime * 13.0) * 0.06
    const mesh = inst.current
    if (mesh) {
      const mat = mesh.material as { emissiveIntensity?: number }
      if (mat) mat.emissiveIntensity = 0.8 + f * 0.4
    }
    if (light.current) light.current.intensity = 0.6 + f * 0.5
  })
  return (
    <group>
      <instancedMesh ref={inst} args={[undefined, undefined, positions.length]} frustumCulled={false}>
        <sphereGeometry args={[0.12, 12, 10]} />
        <meshStandardMaterial color={palette.lanternCore} emissive={palette.lanternAmber} emissiveIntensity={0.9} roughness={0.6} />
      </instancedMesh>
      {highFx && <pointLight ref={light} position={[0, 1.4, 0]} color={palette.lanternAmber} intensity={0.8} distance={9} decay={2} />}
    </group>
  )
}

function Embers({ density, reducedMotion }: { density: number; reducedMotion: boolean }) {
  const inst = useRef<InstancedMesh>(null)
  const count = Math.max(0, Math.round(40 * density))
  const seeds = useMemo(() => Array.from({ length: count }, (_, i) => ({
    x: (Math.sin(i * 12.9898) * 43758.5453 % 1) * (COLS * CELL) - HALF_W,
    z: (Math.sin(i * 78.233) * 12543.123 % 1) * (ROWS * CELL) - HALF_D,
    speed: 0.18 + (i % 5) * 0.04,
    phase: (i / Math.max(1, count)) * 4,
  })), [count])
  useFrame((state) => {
    const mesh = inst.current
    if (!mesh || count === 0) return
    const t = reducedMotion ? 0 : state.clock.elapsedTime
    for (let i = 0; i < count; i++) {
      const s = seeds[i]
      const y = ((t * s.speed + s.phase) % 2.4) + 0.1
      _obj.position.set(s.x + Math.sin(t * 0.5 + i) * 0.1, y, s.z)
      const sc = 0.018 + (i % 3) * 0.006
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
      <meshStandardMaterial color={palette.ember} emissive={palette.ember} emissiveIntensity={0.8} transparent opacity={0.8} />
    </instancedMesh>
  )
}

function Tokens({ tokens, hintActive, reducedMotion }: { tokens: Token[]; hintActive: boolean; reducedMotion: boolean }) {
  const halo = useRef<Mesh>(null)
  const answer = tokens.find((t) => t.isAnswer && !t.eaten)
  useFrame((state) => {
    const m = halo.current
    if (!m) return
    if (!answer) { m.visible = false; return }
    m.visible = true
    m.position.set(worldX(answer.cell.c), 0.16, worldZ(answer.cell.r))
    const pulse = reducedMotion ? 1 : 1 + Math.sin(state.clock.elapsedTime * 4.2) * 0.12
    const boost = hintActive ? 1.35 : 1
    m.scale.set(pulse * boost, pulse * boost, 1)
    const mat = m.material as { emissiveIntensity?: number }
    if (mat) mat.emissiveIntensity = reducedMotion ? 0.6 : (hintActive ? 1.4 : 0.6 + Math.sin(state.clock.elapsedTime * 4.2) * 0.3)
  })
  return (
    <group>
      {/* Pulsing amber halo around the correct token */}
      <mesh ref={halo} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.16, 0]}>
        <ringGeometry args={[0.2, 0.3, 28]} />
        <meshStandardMaterial color={HALO} emissive={HALO} emissiveIntensity={0.6} transparent opacity={0.9} side={2} />
      </mesh>
      {tokens.map((tok, i) => (
        tok.eaten ? null : (
          <group key={i} position={[worldX(tok.cell.c), 0.16, worldZ(tok.cell.r)]}>
            {/* Roundel disc — a dropped travel card glowing on the track */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} castShadow>
              <cylinderGeometry args={[0.15, 0.15, 0.05, 20]} />
              <meshStandardMaterial
                color={tok.isAnswer ? HALO : palette.gold}
                emissive={tok.isAnswer ? HALO : palette.brass}
                emissiveIntensity={tok.isAnswer ? 0.5 : 0.25}
                roughness={0.45}
                metalness={0.3}
              />
            </mesh>
            <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[0.05, 0.09, 16]} />
              <meshStandardMaterial color={palette.night} side={2} />
            </mesh>
          </group>
        )
      ))}
    </group>
  )
}

function Train({ game, reducedMotion, started, shadows }: { game: React.MutableRefObject<GameState>; reducedMotion: boolean; started: boolean; shadows: boolean }) {
  const head = useRef<Group>(null)
  const carriages = useRef<InstancedMesh>(null)
  const lastCount = useRef(-1)
  useFrame(() => {
    const g = game.current
    const cells = g.cells
    if (!cells.length) return
    const alpha = (!started || reducedMotion) ? 1 : MathUtils.clamp((performance.now() - g.stepAt) / TICK_MS, 0, 1)
    const interp = (i: number, out: Vector3, y: number): void => {
      const cur = cells[i]
      const prev = g.prev[i] ?? cur
      segWorld(cur, out, y)
      if (Math.abs(prev.c - cur.c) > 1 || Math.abs(prev.r - cur.r) > 1) return // wrap — snap, no streak
      segWorld(prev, _prevPos, y)
      out.lerpVectors(_prevPos, out, alpha)
    }

    // Head
    if (head.current) {
      interp(0, _pos, 0.22)
      head.current.position.copy(_pos)
      head.current.rotation.y = DIR_YAW[g.dir]
    }
    // Carriages (instanced) — segments 1..n
    const mesh = carriages.current
    if (mesh) {
      const n = Math.min(cells.length - 1, MAX_SEG - 1)
      for (let i = 0; i < n; i++) {
        interp(i + 1, _pos, 0.2)
        _obj.position.copy(_pos)
        _obj.rotation.set(0, 0, 0)
        const taper = 1 - (i / Math.max(1, cells.length - 1)) * 0.4
        _obj.scale.set(0.3 * taper, 0.26 * taper, 0.3 * taper)
        _obj.updateMatrix()
        mesh.setMatrixAt(i, _obj.matrix)
        if (lastCount.current !== cells.length) {
          _col.lerpColors(_colHead, _colTail, i / Math.max(1, MAX_SEG - 1))
          mesh.setColorAt(i, _col)
        }
      }
      mesh.count = n
      mesh.instanceMatrix.needsUpdate = true
      if (lastCount.current !== cells.length && mesh.instanceColor) mesh.instanceColor.needsUpdate = true
      lastCount.current = cells.length
    }
  })
  return (
    <group>
      {/* Locomotive head — rounded green box with a bright face */}
      <group ref={head}>
        <mesh castShadow={shadows}>
          <boxGeometry args={[0.34, 0.3, 0.34]} />
          <meshStandardMaterial color={TRAIN_HEAD} emissive={TRAIN_HEAD} emissiveIntensity={0.35} roughness={0.4} />
        </mesh>
        {/* Front windscreen */}
        <mesh position={[0.18, 0.04, 0]}>
          <boxGeometry args={[0.04, 0.16, 0.26]} />
          <meshStandardMaterial color={palette.skyGlow} emissive={palette.lanternCore} emissiveIntensity={0.5} roughness={0.2} />
        </mesh>
        {/* Headlamp */}
        <mesh position={[0.2, -0.06, 0]}>
          <sphereGeometry args={[0.04, 10, 8]} />
          <meshStandardMaterial color={palette.lanternCore} emissive={palette.lanternCore} emissiveIntensity={0.9} />
        </mesh>
      </group>
      <instancedMesh ref={carriages} args={[undefined, undefined, MAX_SEG]} frustumCulled={false} castShadow={shadows}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.5} metalness={0.1} />
      </instancedMesh>
    </group>
  )
}

// Projects each token's world position to screen px and writes it onto the
// DOM nameplate transforms (English stays crisp DOM, never a 3D texture).
function LabelProjector({ tokens, labelRefs }: { tokens: Token[]; labelRefs: React.MutableRefObject<(HTMLDivElement | null)[]> }) {
  const cam = useThree((s) => s.camera) as PerspectiveCamera
  const size = useThree((s) => s.size)
  useFrame(() => {
    for (let i = 0; i < tokens.length; i++) {
      const el = labelRefs.current[i]
      if (!el) continue
      const tok = tokens[i]
      if (tok.eaten) { el.style.opacity = '0'; continue }
      _pos.set(worldX(tok.cell.c), 0.5, worldZ(tok.cell.r)).project(cam)
      if (_pos.z > 1) { el.style.opacity = '0'; continue }
      const x = (_pos.x * 0.5 + 0.5) * size.width
      const y = (-_pos.y * 0.5 + 0.5) * size.height
      el.style.opacity = '1'
      el.style.transform = `translate(-50%, -50%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`
    }
  })
  return null
}

// =========================================================================
// Snake3D — the Game3D component (default export)
// =========================================================================
export default function Snake3D({ puzzle, vocab, onSessionComplete, quality, reducedMotion, fullscreen }: Game3DProps) {
  const prefersReduced = usePrefersReducedMotion()
  const reduce = reducedMotion ?? prefersReduced

  const activePuzzle = useMemo<ArcadePuzzle>(() => {
    const p = puzzle as ArcadePuzzle | undefined
    if (p && Array.isArray(p.rounds) && p.rounds.length > 0) return p
    if (vocab && vocab.length > 0) {
      const gen = generateSnakePuzzle(vocabToArcade(vocab), { seed: 7 })
      if (gen && gen.rounds.length > 0) return gen
    }
    return DEMO_PUZZLE
  }, [puzzle, vocab])
  const rounds = activePuzzle.rounds
  const total = rounds.length

  const game = useRef<GameState>({ cells: startCells(), prev: startCells(), dir: 'right', queued: null, tokens: [], roundIdx: 0, stepAt: performance.now() })
  const labelRefs = useRef<(HTMLDivElement | null)[]>([])
  const startMs = useRef(performance.now())
  const fired = useRef(false)
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [roundIdx, setRoundIdx] = useState(0)
  const [solved, setSolved] = useState<boolean[]>(() => rounds.map(() => false))
  const [tokens, setTokens] = useState<Token[]>([])
  const [score, setScore] = useState(0)
  const [length, setLength] = useState(START_LEN)
  const [miss, setMiss] = useState(0)
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null)
  const [hintsUsed, setHintsUsed] = useState(0)
  const [hintActive, setHintActive] = useState(false)
  const [paused, setPaused] = useState(false)
  const [started, setStarted] = useState(false)
  const [live, setLive] = useState('')

  const cur = rounds[roundIdx]
  const completed = total > 0 && solved.every(Boolean)
  const correctCount = solved.filter(Boolean).length
  const answerWord = cur ? cur.options[cur.answerIndex] : ''
  const renderedPrompt = useMemo(() => maskAnswerInPrompt(cur?.prompt, answerWord), [cur?.prompt, answerWord])
  const bajla: 'idle' | 'flyby' | 'celebrate' = completed ? 'celebrate' : !started ? 'flyby' : 'idle'

  // Round setup — reset the train and scatter this round's tokens.
  useEffect(() => {
    if (!cur) return
    const cells = startCells()
    const occupied = new Set(cells.map((s) => `${s.r},${s.c}`))
    const placed = placeTokens(cur, occupied)
    game.current.cells = cells
    game.current.prev = cells.map((c) => ({ ...c }))
    game.current.dir = 'right'
    game.current.queued = null
    game.current.tokens = placed
    game.current.roundIdx = roundIdx
    game.current.stepAt = performance.now()
    setTokens(placed)
    setLength(cells.length)
    setMiss(0)
    setFeedback(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundIdx, cur?.id])

  // Fixed-timestep tick — the canonical Snake movement, re-skinned in 3D.
  const update = useCallback(() => {
    const g = game.current
    if (!g.cells.length) return
    if (g.queued && OPP[g.queued] !== g.dir) g.dir = g.queued
    g.queued = null

    const headCell = g.cells[0]
    let nr = headCell.r
    let nc = headCell.c
    if (g.dir === 'up') nr -= 1
    else if (g.dir === 'down') nr += 1
    else if (g.dir === 'left') nc -= 1
    else nc += 1
    nr = (nr + ROWS) % ROWS
    nc = (nc + COLS) % COLS

    g.prev = g.cells.map((c) => ({ ...c }))
    const nextHead: Cell = { r: nr, c: nc }
    const pre = g.cells
    const tok = g.tokens.find((p) => !p.eaten && p.cell.r === nr && p.cell.c === nc)

    if (tok) {
      tok.eaten = true
      if (tok.isAnswer) {
        g.cells = [nextHead, ...pre] // grow (no tail drop)
        g.stepAt = performance.now()
        setScore((s) => s + 10)
        setLength(g.cells.length)
        setFeedback('correct')
        setSolved((arr) => arr.map((v, i) => (i === g.roundIdx ? true : v)))
        setTokens((arr) => arr.map((p) => (p.optionIdx === tok.optionIdx ? { ...p, eaten: true } : p)))
        setLive(`Correct — train grew to ${g.cells.length} carriages.`)
        if (advanceTimer.current) clearTimeout(advanceTimer.current)
        advanceTimer.current = setTimeout(() => {
          setRoundIdx((i) => (i + 1 < total ? i + 1 : i))
        }, ADVANCE_MS)
        return
      }
      // wrong — shrink
      g.cells = [nextHead, ...pre.slice(0, Math.max(MIN_LEN, pre.length - 1))]
      g.stepAt = performance.now()
      setMiss((m) => m + 1)
      setLength(g.cells.length)
      setFeedback('wrong')
      setTokens((arr) => arr.map((p) => (p.optionIdx === tok.optionIdx ? { ...p, eaten: true } : p)))
      setLive('Wrong token — a carriage uncoupled.')
      if (clearTimer.current) clearTimeout(clearTimer.current)
      clearTimer.current = setTimeout(() => setFeedback(null), CLEAR_MS)
      return
    }
    // plain move
    g.cells = [nextHead, ...pre.slice(0, pre.length - 1)]
    g.stepAt = performance.now()
  }, [total])

  useGameLoop(update, undefined, { stepMs: TICK_MS, running: started && !paused && !completed, reducedMotion: reduce })

  // Fire the session result exactly once, on completion.
  useEffect(() => {
    if (completed && !fired.current) {
      fired.current = true
      setLive('All tokens collected — the train pulls into the tunnel.')
      const result: SessionResult = {
        correctCount,
        totalQuestions: total,
        durationMs: Math.round(performance.now() - startMs.current),
        shellKey: 'snake',
      }
      onSessionComplete?.(result)
    }
  }, [completed, correctCount, total, onSessionComplete])

  // Keyboard — arrows / WASD steer (queued, no 180° reverse); Space pauses.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const map: Record<string, Dir | undefined> = {
        ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
        w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right',
      }
      const dir = map[e.key]
      if (dir) {
        e.preventDefault()
        if (!started) setStarted(true)
        game.current.queued = dir
      } else if (e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault()
        if (!started) setStarted(true)
        else if (!completed) setPaused((p) => !p)
      } else if (!started && (e.key === 'Enter')) {
        setStarted(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [started, completed])

  // Cleanup timers on unmount.
  useEffect(() => () => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current)
    if (clearTimer.current) clearTimeout(clearTimer.current)
    if (hintTimer.current) clearTimeout(hintTimer.current)
  }, [])

  const steer = useCallback((d: Dir) => {
    if (!started) setStarted(true)
    game.current.queued = d
  }, [started])

  const useHint = useCallback(() => {
    if (hintsUsed >= HINT_MAX) return
    setHintsUsed((h) => h + 1)
    setHintActive(true)
    if (hintTimer.current) clearTimeout(hintTimer.current)
    hintTimer.current = setTimeout(() => setHintActive(false), HINT_MS)
  }, [hintsUsed])

  const skip = useCallback(() => {
    setRoundIdx((i) => (i + 1 < total ? i + 1 : i))
  }, [total])

  const replay = useCallback(() => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current)
    if (clearTimer.current) clearTimeout(clearTimer.current)
    fired.current = false
    startMs.current = performance.now()
    setSolved(rounds.map(() => false))
    setScore(0)
    setMiss(0)
    setHintsUsed(0)
    setHintActive(false)
    setFeedback(null)
    setPaused(false)
    setLive('')
    setStarted(true)
    setRoundIdx(0)
  }, [rounds])

  // Touch swipe (optional) — quick flick to turn.
  const touch = useRef<{ x: number; y: number } | null>(null)
  const onTouchStart = (e: React.TouchEvent) => { const t = e.touches[0]; touch.current = { x: t.clientX, y: t.clientY } }
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!touch.current) return
    const t = e.changedTouches[0]
    const dx = t.clientX - touch.current.x
    const dy = t.clientY - touch.current.y
    if (Math.abs(dx) < 28 && Math.abs(dy) < 28) { touch.current = null; return }
    if (!started) setStarted(true)
    if (Math.abs(dx) > Math.abs(dy)) steer(dx > 0 ? 'right' : 'left')
    else steer(dy > 0 ? 'down' : 'up')
    touch.current = null
  }

  const overlay = (
    <div style={{ position: 'absolute', inset: 0, fontFamily: 'var(--em-mono, ui-monospace, monospace)', color: '#EDE6FF' }}>
      <style>{`
        @keyframes ms-pop { 0%{transform:translateY(8px);opacity:0} 100%{transform:translateY(0);opacity:1} }
        @keyframes ms-hint { 0%,100%{box-shadow:0 0 0 0 ${HALO}00} 50%{box-shadow:0 0 0 3px ${HALO}cc} }
      `}</style>

      {/* Screen-reader live region (canvas is aria-hidden inside CityStage) */}
      <div role="status" aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{live}</div>

      {/* Prompt panel — pinned top-centre */}
      {cur && (
        <div style={{
          position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
          maxWidth: 'min(620px, 88%)', padding: '10px 16px', borderRadius: 12,
          background: 'linear-gradient(90deg, rgba(34,197,94,0.16), rgba(20,16,42,0.82))',
          border: `1px solid ${TRAIN_HEAD}66`, backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', gap: 12, animation: 'ms-pop 320ms ease',
        }} key={`p-${roundIdx}`}>
          <span style={{ fontSize: 11, letterSpacing: '0.18em', color: TRAIN_HEAD, border: `1px solid ${TRAIN_HEAD}66`, borderRadius: 4, padding: '3px 7px', flexShrink: 0 }}>RND {String(roundIdx + 1).padStart(2, '0')}</span>
          <span style={{ fontFamily: 'var(--em-decor, var(--em-mono, system-ui))', fontSize: 17, lineHeight: 1.3, flex: 1 }}>{renderedPrompt}</span>
        </div>
      )}

      {/* HUD — SCORE / LENGTH / TARGET, top-left (mirrors the 2D shell) */}
      <div style={{ position: 'absolute', top: 12, left: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <HudPill label="SCORE · WYNIK" value={String(score)} />
        <HudPill label="LENGTH · DŁUGOŚĆ" value={String(length)} />
        <HudPill label="TARGET · CEL" value={answerWord} accent={HALO} />
      </div>

      {miss > 0 && (
        <div style={{ position: 'absolute', top: 12, right: 12, fontSize: 10, letterSpacing: '0.14em', color: ROSE, padding: '4px 8px', background: 'rgba(251,113,133,0.12)', border: `1px solid ${ROSE}66`, borderRadius: 4 }}>
          {miss} WRONG{miss === 1 ? '' : ' ·'} {miss === 1 ? 'TOKEN' : 'TOKENS'}
        </div>
      )}

      {/* Token nameplates — DOM, positioned by the 3D LabelProjector */}
      {tokens.map((tok, i) => (
        <div
          key={i}
          ref={(el) => { labelRefs.current[i] = el }}
          style={{
            position: 'absolute', top: 0, left: 0, opacity: 0, pointerEvents: 'none',
            padding: '3px 9px', borderRadius: 999, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
            background: 'rgba(14,10,26,0.95)',
            border: `1px solid ${tok.isAnswer ? HALO : 'rgba(255,255,255,0.28)'}`,
            color: tok.isAnswer ? HALO : '#FFFFFF',
            animation: tok.isAnswer && hintActive ? 'ms-hint 0.6s ease-in-out 3' : undefined,
          }}
        >{tok.word}</div>
      ))}

      {/* Controls — Skip / Hint / Pause (≥44px tap targets) */}
      <div style={{ position: 'absolute', bottom: 12, left: 12, display: 'flex', gap: 8, pointerEvents: 'auto' }}>
        <button onClick={skip} style={btnStyle()} aria-label="Skip round">SKIP</button>
        <button onClick={useHint} disabled={hintsUsed >= HINT_MAX} style={btnStyle(hintsUsed >= HINT_MAX)} aria-label={`Hint, ${HINT_MAX - hintsUsed} left`}>HINT {HINT_MAX - hintsUsed}</button>
        <button onClick={() => started && !completed && setPaused((p) => !p)} style={btnStyle()} aria-label={paused ? 'Resume' : 'Pause'}>{paused ? '▶' : '❚❚'}</button>
      </div>

      {/* Touch D-pad — bottom-right (mirrors the 2D .em-snake-dpad) */}
      <div style={{ position: 'absolute', bottom: 12, right: 12, display: 'grid', gridTemplateColumns: 'repeat(3, 46px)', gridTemplateRows: 'repeat(3, 46px)', gap: 4, pointerEvents: 'auto' }}>
        <span /><button onClick={() => steer('up')} style={dpad()} aria-label="Up">↑</button><span />
        <button onClick={() => steer('left')} style={dpad()} aria-label="Left">←</button><span /><button onClick={() => steer('right')} style={dpad()} aria-label="Right">→</button>
        <span /><button onClick={() => steer('down')} style={dpad()} aria-label="Down">↓</button><span />
      </div>

      {/* Start gate */}
      {!started && !completed && (
        <button
          onClick={() => setStarted(true)}
          style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, background: 'rgba(10,5,24,0.35)', border: 'none', cursor: 'pointer', pointerEvents: 'auto', color: '#EDE6FF' }}
        >
          <div style={{ fontFamily: 'var(--em-decor, system-ui)', fontSize: 34, color: TRAIN_HEAD, textShadow: `0 0 18px ${TRAIN_HEAD}aa` }}>Metro Snake</div>
          <div style={{ fontSize: 12, letterSpacing: '0.2em', opacity: 0.85 }}>THE UNDERGROUND · press / tap to start</div>
        </button>
      )}

      {/* Pause veil */}
      {paused && started && !completed && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(10,5,24,0.55)' }}>
          <div style={{ fontFamily: 'var(--em-decor, system-ui)', fontSize: 30, color: TRAIN_HEAD }}>PAUSED</div>
        </div>
      )}

      {/* End card */}
      {completed && (
        <div role="dialog" aria-label="Metro Snake complete" style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, background: `radial-gradient(ellipse, ${TRAIN_HEAD}22, rgba(10,5,24,0.72))`, backdropFilter: 'blur(6px)', pointerEvents: 'auto' }}>
          <div style={{ fontFamily: 'var(--em-decor, system-ui)', fontSize: 34, color: TRAIN_HEAD, textShadow: `0 0 18px ${TRAIN_HEAD}aa` }}>End of the line!</div>
          <div style={{ fontSize: 14 }}>You collected <strong style={{ color: HALO }}>{correctCount}</strong> / {total} tokens</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={replay} style={btnStyle()}>Replay</button>
            <button onClick={replay} style={{ ...btnStyle(), background: TRAIN_HEAD, color: '#06210F', borderColor: TRAIN_HEAD }}>Next district →</button>
          </div>
        </div>
      )}
    </div>
  )

  return (
    <div
      role="application"
      aria-label="Metro Snake — steer the train to the word that completes the sentence"
      style={{ position: 'relative', width: '100%', height: '100%', minHeight: 320 }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <CityStage
        quality={quality}
        reducedMotion={reduce}
        fullscreen={fullscreen}
        cameraPosition={[0, 7.5, 4.5]}
        cameraFov={45}
        overlay={overlay}
      >
        <MetroScene
          game={game}
          tokens={tokens}
          hintActive={hintActive}
          started={started}
          reducedMotion={reduce}
          bajla={bajla}
          labelRefs={labelRefs}
        />
      </CityStage>
    </div>
  )
}

// ── Small DOM helpers ─────────────────────────────────────────────────────
function HudPill({ label, value, accent }: { label: string; value: string; accent?: string }) {
  const c = accent ?? '#22C55E'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 10px', background: 'rgba(14,10,26,0.85)', border: `1px solid ${c}66`, borderRadius: 6 }}>
      <span style={{ fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: c }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 700, color: accent ?? '#FFFFFF' }}>{value}</span>
    </div>
  )
}

function btnStyle(disabled = false): React.CSSProperties {
  return {
    minHeight: 44, minWidth: 52, padding: '8px 14px', borderRadius: 8,
    background: 'rgba(34,197,94,0.16)', border: `1px solid ${TRAIN_HEAD}66`,
    color: TRAIN_HEAD, fontFamily: 'var(--em-mono, ui-monospace, monospace)', fontSize: 12,
    letterSpacing: '0.1em', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.45 : 1,
    touchAction: 'manipulation',
  }
}

function dpad(): React.CSSProperties {
  return {
    minWidth: 46, minHeight: 46, background: 'rgba(34,197,94,0.18)',
    border: `1px solid ${TRAIN_HEAD}66`, borderRadius: 8, color: TRAIN_HEAD,
    fontSize: 18, cursor: 'pointer', touchAction: 'manipulation',
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
