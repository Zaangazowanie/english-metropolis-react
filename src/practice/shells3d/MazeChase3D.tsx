// MazeChase3D — "Museum After Dark", a 3D re-skin of The Backstreets.
//
// A three.js presentation of the canonical 2D Maze Chase shell
// (src/practice/shells/MazeChase.tsx). The MECHANIC, scoring, round count,
// hint/skip rules, deterministic token placement and the no-fail behaviour
// are inherited verbatim from the 2D shell — this file changes ONLY the
// stagecraft. Same puzzle in (ArcadePuzzle), same session result out
// (SessionResult). Built on the Fluent City GameKit
// (CityStage + useGameLoop + Bajla + palette).
//
// Fidelity / pedagogy lock (binding, from docs/game3d/storyboards/mazechase.md):
// the 2D Maze Chase has NO catch-you pursuer — the only scored outcomes are
// reaching the one CYAN answer-token (round solved, +1) and bumping a ROSE
// distractor (lantern dims, miss++, the round CONTINUES). The ghost-curators
// and statues here are STAGECRAFT: they patrol fixed loops and recede on a
// wrong bump, but they NEVER collide-to-penalise, never end a round, and never
// touch correctCount / totalQuestions. The 13x11 maze topology, the start cell
// {r:1,c:1}, the open-cell Manhattan>=4 deterministic placement seeded by round
// id, the 5-round cap, the 3-hint budget and Skip-counts-unsolved are mirrored
// exactly. Real pursuer pressure would be new pedagogy → out of scope.
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
import { generateMazeChasePuzzle } from '../generators/generateMazeChase'
import type { ArcadeInput, ArcadePuzzle, ArcadeRound } from '../generators/generateArcade'

// ── Canonical grid + timing (identical to the 2D shell) ──────────────────
const COLS = 13
const ROWS = 11
const ADVANCE_MS = 1100 // correct → next round
const CLEAR_MS = 700 // wrong feedback clear
const HINT_MAX = 3
const HINT_MS = 3000
const STEP_MS = 110 // lantern tween cadence (visual only; input is event-driven)

// Token affordance colours carried VERBATIM from the 2D shell.
const CYAN = '#7DD3FC' // correct
const ROSE = '#FB7185' // wrong
const WARM = '#FFB347' // lantern amber

// Maze layout — 1 = wall (vitrine / partition), 0 = path (marble corridor).
// 13 wide x 11 tall, borders walls. COPIED BYTE-FOR-BYTE from the 2D shell so
// the corridor topology and every reachable cell match exactly.
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

const START: Cell = { r: 1, c: 1 }

type Cell = { r: number; c: number }
type Dir = 'up' | 'down' | 'left' | 'right'

const isOpen = (r: number, c: number): boolean =>
  r >= 0 && r < ROWS && c >= 0 && c < COLS && MAZE[r][c] === 0

interface Token {
  cell: Cell
  optionIdx: number
  word: string
  isAnswer: boolean
  eaten: boolean
}

// ── World mapping — gallery floor centred on the origin in the XZ plane.
// Smaller row index = further from camera (back of the hall). ─────────────
const CELL = 0.62
const HALF_W = (COLS * CELL) / 2
const HALF_D = (ROWS * CELL) / 2
const worldX = (c: number): number => (c + 0.5) * CELL - HALF_W
const worldZ = (r: number): number => (r + 0.5) * CELL - HALF_D

// ── Built-in demo puzzle — copied verbatim from the 2D shell so anonymous
// home-page play behaves identically (Game3DProps requires a demo when no
// puzzle / vocab is supplied). ───────────────────────────────────────────
const DEMO_PUZZLE: ArcadePuzzle = {
  rounds: [
    { id: 'mz1', prompt: 'A small narrow street with shops on both sides.', options: ['arcade', 'plaza', 'cellar', 'spire'], answerIndex: 0, hint: 'Often glass-roofed; Victorian shopping streets.', hint_pl: 'pasaż' },
    { id: 'mz2', prompt: 'Stones laid as paving on an old street.', options: ['cobbles', 'pebbles', 'planks', 'tiles'], answerIndex: 0, hint: 'Round, rough, hard to walk in heels.', hint_pl: 'kocie łby' },
    { id: 'mz3', prompt: 'A passage between two buildings.', options: ['alley', 'attic', 'plinth', 'gable'], answerIndex: 0, hint: 'Cats live there; bins are kept there.', hint_pl: 'zaułek' },
    { id: 'mz4', prompt: 'A pool of light from a streetlight.', options: ['glow', 'shadow', 'plinth', 'beacon'], answerIndex: 0, hint: 'The bright circle on the pavement at night.', hint_pl: 'blask' },
    { id: 'mz5', prompt: 'A wall painted with art.', options: ['mural', 'fresco', 'lintel', 'awning'], answerIndex: 0, hint: 'Big urban paintings; often political.', hint_pl: 'mural' },
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

// Deterministic token placement — IDENTICAL seeding + filter to the 2D shell:
// open cells with Manhattan distance from the start cell >= 4, shuffled by a
// seed derived from the round id, one token per option.
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

// ── Allocation-free scratch objects (single canvas, single game instance) ─
const _pos = new Vector3()
const _obj = new Object3D()
const _col = new Color()
const _wallTop = new Color('#2d3a6b')
const _wallBot = new Color('#161029')

interface GameState {
  pos: Cell
  prev: Cell
  stepAt: number
}

// =========================================================================
// Scene (inside the Canvas — reads the live game ref each frame)
// =========================================================================
interface SceneProps {
  game: React.MutableRefObject<GameState>
  tokens: Token[]
  hintActive: boolean
  reducedMotion: boolean
  bajla: 'idle' | 'flyby' | 'celebrate'
  lampLevel: number
  labelRefs: React.MutableRefObject<(HTMLDivElement | null)[]>
}

function GalleryScene({ game, tokens, hintActive, reducedMotion, bajla, lampLevel, labelRefs }: SceneProps) {
  const { settings, tier } = useStageQuality()
  const highFx = tier === 'high' && !reducedMotion
  const backZ = worldZ(0) - 1.6

  return (
    <group>
      <CameraRig drift={highFx} reducedMotion={reducedMotion} />
      {tier === 'high' && <fog attach="fog" args={[palette.night, 11, 24]} />}

      <Floor shadows={settings.shadows} />
      <Walls />
      <Lanterns flicker={tier !== 'low' && !reducedMotion} highFx={highFx} />
      {settings.particles > 0 && <DustMotes density={settings.particles} reducedMotion={reducedMotion} />}
      <Skyline z={backZ} />
      {tier !== 'low' && <Curators reducedMotion={reducedMotion} />}

      <Plinths tokens={tokens} hintActive={hintActive} reducedMotion={reducedMotion} />
      <LabelProjector tokens={tokens} labelRefs={labelRefs} />
      <Lantern game={game} reducedMotion={reducedMotion} lampLevel={lampLevel} highFx={highFx} />

      <Bajla variant={bajla} reducedMotion={reducedMotion} scale={0.42} position={[HALF_W - 0.3, 2.1, backZ + 0.4]} />
    </group>
  )
}

function CameraRig({ drift, reducedMotion }: { drift: boolean; reducedMotion: boolean }) {
  const cam = useThree((s) => s.camera) as PerspectiveCamera
  const base = useRef<[number, number, number]>([0, 8.6, 6.2])
  const settled = useRef(0)
  useFrame((state, delta) => {
    const [bx, by, bz] = base.current
    // One gentle intro push-in that settles to the play angle.
    settled.current = Math.min(1, settled.current + delta / 1.2)
    const ease = reducedMotion ? 1 : 1 - Math.pow(1 - settled.current, 3)
    const startY = by + 1.6
    const startZ = bz + 1.4
    let x = bx
    let y = MathUtils.lerp(startY, by, ease)
    let z = MathUtils.lerp(startZ, bz, ease)
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

// Marble corridor floor — instanced tiles over the open cells, with a dark
// slab beneath. Vertex/instance colours only.
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
      // Subtle marble checker via vertex colour.
      const checker = (cell.r + cell.c) % 2 === 0
      _col.set(checker ? '#3a3f63' : '#2c3052')
      mesh.setColorAt(i, _col)
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [open])
  return (
    <group>
      {/* Base slab beneath the whole hall */}
      <mesh position={[0, -0.14, 0]} receiveShadow={shadows}>
        <boxGeometry args={[COLS * CELL + 1.2, 0.28, ROWS * CELL + 1.2]} />
        <meshStandardMaterial color={palette.night} roughness={0.96} />
      </mesh>
      {/* Marble corridor tiles */}
      <instancedMesh ref={tiles} args={[undefined, undefined, open.length]} frustumCulled={false} receiveShadow={shadows}>
        <boxGeometry args={[CELL * 0.96, 0.04, CELL * 0.96]} />
        <meshStandardMaterial roughness={0.45} metalness={0.12} vertexColors />
      </instancedMesh>
      {/* Brass thresholds along the front lip */}
      <mesh position={[0, 0.0, HALF_D + 0.35]}>
        <boxGeometry args={[COLS * CELL + 1.0, 0.05, 0.1]} />
        <meshStandardMaterial color={palette.brass} roughness={0.5} metalness={0.4} emissive={palette.brass} emissiveIntensity={0.1} />
      </mesh>
    </group>
  )
}

// Vitrine / partition walls — instanced boxes over the wall cells, vertex
// gradient (cool top → ink base) + brass cap row. Single draw call for bodies.
function Walls() {
  const bodies = useRef<InstancedMesh>(null)
  const caps = useRef<InstancedMesh>(null)
  const walls = useMemo(() => {
    const out: Cell[] = []
    // Skip the outer border ring (cells on r=0/ROWS-1/c=0/COLS-1) so the hall
    // reads as open-walled rather than a closed box; interior walls are the
    // vitrines that actually block movement and the player never reaches the
    // border anyway.
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
      {/* Vitrine bodies (glass-tinted partitions) */}
      <instancedMesh ref={bodies} args={[undefined, undefined, walls.length]} frustumCulled={false} castShadow>
        <boxGeometry args={[CELL * 0.92, 0.72, CELL * 0.92]} />
        <meshStandardMaterial roughness={0.3} metalness={0.15} transparent opacity={0.92} vertexColors />
      </instancedMesh>
      {/* Brass cap rails on top of each vitrine */}
      <instancedMesh ref={caps} args={[undefined, undefined, walls.length]} frustumCulled={false}>
        <boxGeometry args={[CELL * 0.96, 0.05, CELL * 0.96]} />
        <meshStandardMaterial color={palette.brass} roughness={0.45} metalness={0.5} emissive={palette.brass} emissiveIntensity={0.12} />
      </instancedMesh>
    </group>
  )
}

// Paper lanterns strung overhead — instanced glow spheres + one cheap warm
// point light on high. Baked/vertex feel; the flicker only scales emissive.
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

// Floating dust motes in the moonlight — instanced, gated by particle tier.
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

// Big Ben + London skyline silhouette beyond the arched windows. Vertex-
// coloured procedural boxes against the dusk gradient. Purely decorative.
function Skyline({ z }: { z: number }) {
  const towers = useMemo(() => ([
    { x: -3.4, w: 0.7, h: 1.6 }, { x: -2.4, w: 0.5, h: 2.2 }, { x: -1.4, w: 0.6, h: 1.3 },
    { x: 0, w: 0.5, h: 2.9 }, // Big Ben tower
    { x: 1.3, w: 0.7, h: 1.5 }, { x: 2.3, w: 0.5, h: 2.0 }, { x: 3.3, w: 0.8, h: 1.7 },
  ]), [])
  return (
    <group position={[0, 0, z]}>
      {/* Back wall with arched-window dusk band */}
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
      {/* Big Ben clock face — a small warm disc (no readable text) */}
      <mesh position={[0, 2.7, 0.16]}>
        <cylinderGeometry args={[0.12, 0.12, 0.04, 16]} />
        <meshStandardMaterial color={palette.lanternCore} emissive={palette.lanternAmber} emissiveIntensity={0.5} />
      </mesh>
    </group>
  )
}

// Ghost-curators — PURE STAGECRAFT. They drift fixed loops and never collide
// to penalise, never end a round, never touch the score. Frozen as statues on
// reducedMotion (handled by the caller passing reducedMotion); omitted on low.
function Curators({ reducedMotion }: { reducedMotion: boolean }) {
  const inst = useRef<InstancedMesh>(null)
  const loops = useMemo(() => ([
    { cells: [{ r: 1, c: 1 }, { r: 1, c: 3 }, { r: 3, c: 3 }, { r: 3, c: 1 }] },
    { cells: [{ r: 8, c: 9 }, { r: 8, c: 11 }, { r: 6, c: 11 }, { r: 6, c: 9 }] },
    { cells: [{ r: 5, c: 5 }, { r: 5, c: 7 }, { r: 8, c: 7 }, { r: 8, c: 5 }] },
  ].map((l) => ({ pts: l.cells.map((c) => new Vector3(worldX(c.c), 0.5, worldZ(c.r))) }))), [])
  useFrame((state) => {
    const mesh = inst.current
    if (!mesh) return
    const t = reducedMotion ? 0 : state.clock.elapsedTime * 0.12
    for (let i = 0; i < loops.length; i++) {
      const pts = loops[i].pts
      const seg = pts.length
      const f = ((t + i * 0.37) % 1) * seg
      const a = Math.floor(f) % seg
      const b = (a + 1) % seg
      const k = f - Math.floor(f)
      _pos.copy(pts[a]).lerp(pts[b], k)
      const bob = reducedMotion ? 0 : Math.sin(state.clock.elapsedTime * 1.4 + i) * 0.06
      _obj.position.set(_pos.x, _pos.y + bob, _pos.z)
      _obj.rotation.set(0, 0, 0)
      _obj.scale.set(1, 1, 1)
      _obj.updateMatrix()
      mesh.setMatrixAt(i, _obj.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  })
  return (
    <instancedMesh ref={inst} args={[undefined, undefined, loops.length]} frustumCulled={false}>
      <coneGeometry args={[0.22, 0.8, 8]} />
      <meshStandardMaterial color={palette.bajlaBelly} emissive={palette.duskMid} emissiveIntensity={0.25} transparent opacity={0.3} roughness={1} />
    </instancedMesh>
  )
}

// Artifact plinths — one per token, with a glowing disc (CYAN answer / ROSE
// distractor) on a small glass plinth. A pulsing ring marks the correct cell.
function Plinths({ tokens, hintActive, reducedMotion }: { tokens: Token[]; hintActive: boolean; reducedMotion: boolean }) {
  const halo = useRef<Mesh>(null)
  const answer = tokens.find((t) => t.isAnswer && !t.eaten)
  useFrame((state) => {
    const m = halo.current
    if (!m) return
    if (!answer) { m.visible = false; return }
    m.visible = true
    m.position.set(worldX(answer.cell.c), 0.05, worldZ(answer.cell.r))
    const pulse = reducedMotion ? 1 : 1 + Math.sin(state.clock.elapsedTime * 4.0) * 0.12
    const boost = hintActive ? 1.4 : 1
    m.scale.set(pulse * boost, pulse * boost, 1)
    const mat = m.material as { emissiveIntensity?: number }
    if (mat) mat.emissiveIntensity = reducedMotion ? 0.7 : (hintActive ? 1.5 : 0.7 + Math.sin(state.clock.elapsedTime * 4.0) * 0.3)
  })
  return (
    <group>
      {/* Pulsing cyan ring around the correct artifact */}
      <mesh ref={halo} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
        <ringGeometry args={[0.22, 0.32, 28]} />
        <meshStandardMaterial color={CYAN} emissive={CYAN} emissiveIntensity={0.7} transparent opacity={0.9} side={2} />
      </mesh>
      {tokens.map((tok, i) => (
        tok.eaten ? null : (
          <group key={i} position={[worldX(tok.cell.c), 0, worldZ(tok.cell.r)]}>
            {/* Glass plinth base */}
            <mesh position={[0, 0.12, 0]}>
              <boxGeometry args={[0.26, 0.24, 0.26]} />
              <meshStandardMaterial color={palette.duskMid} transparent opacity={0.5} roughness={0.2} metalness={0.2} />
            </mesh>
            {/* Brass plinth cap */}
            <mesh position={[0, 0.25, 0]}>
              <boxGeometry args={[0.3, 0.04, 0.3]} />
              <meshStandardMaterial color={palette.brass} roughness={0.45} metalness={0.5} />
            </mesh>
            {/* The word-artifact — glowing disc, colour = affordance */}
            <mesh position={[0, 0.42, 0]} rotation={[-Math.PI / 2, 0, 0]} castShadow>
              <cylinderGeometry args={[0.13, 0.13, 0.05, 20]} />
              <meshStandardMaterial
                color={tok.isAnswer ? CYAN : ROSE}
                emissive={tok.isAnswer ? CYAN : ROSE}
                emissiveIntensity={tok.isAnswer ? 0.6 : 0.4}
                roughness={0.4}
                metalness={0.25}
              />
            </mesh>
          </group>
        )
      ))}
    </group>
  )
}

// Lantern-bearer — the player marker. A warm glowing orb on a small base that
// snaps (reducedMotion) or tweens cell-to-cell. lampLevel dims it per wrong bump.
function Lantern({ game, reducedMotion, lampLevel, highFx }: { game: React.MutableRefObject<GameState>; reducedMotion: boolean; lampLevel: number; highFx: boolean }) {
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
    if (light.current) light.current.intensity = (0.5 + lampLevel * 0.5) * (highFx ? 1 : 0.001)
  })
  const dim = MathUtils.clamp(lampLevel, 0.25, 1)
  return (
    <group ref={root} position={[worldX(START.c), 0.3, worldZ(START.r)]}>
      {/* Warden figure base */}
      <mesh position={[0, -0.1, 0]}>
        <cylinderGeometry args={[0.1, 0.13, 0.32, 10]} />
        <meshStandardMaterial color={palette.bajlaWing} roughness={0.8} />
      </mesh>
      {/* Lantern halo */}
      <mesh>
        <sphereGeometry args={[0.17, 16, 12]} />
        <meshStandardMaterial color={WARM} emissive={WARM} emissiveIntensity={0.8 * dim} transparent opacity={0.5 * dim} />
      </mesh>
      {/* Lantern core */}
      <mesh>
        <sphereGeometry args={[0.08, 12, 10]} />
        <meshStandardMaterial color={palette.lanternCore} emissive={palette.lanternCore} emissiveIntensity={1.1 * dim} />
      </mesh>
      {highFx && <pointLight ref={light} color={WARM} intensity={0.6} distance={3.2} decay={2} />}
    </group>
  )
}

// Projects each plinth's world position to screen px and writes it onto the
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
      _pos.set(worldX(tok.cell.c), 0.78, worldZ(tok.cell.r)).project(cam)
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
// MazeChase3D — the Game3D component (default export)
// =========================================================================
export default function MazeChase3D({ puzzle, vocab, onSessionComplete, quality, reducedMotion, fullscreen }: Game3DProps) {
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

  const game = useRef<GameState>({ pos: { ...START }, prev: { ...START }, stepAt: performance.now() })
  const labelRefs = useRef<(HTMLDivElement | null)[]>([])
  const startMs = useRef(performance.now())
  const fired = useRef(false)
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [roundIdx, setRoundIdx] = useState(0)
  const [solved, setSolved] = useState<boolean[]>(() => rounds.map(() => false))
  const [tokens, setTokens] = useState<Token[]>([])
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null)
  const [missCount, setMissCount] = useState(0)
  const [hintsUsed, setHintsUsed] = useState(0)
  const [hintActive, setHintActive] = useState(false)
  const [live, setLive] = useState('')
  // Lantern brightness — starts full, dims one notch per wrong bump (never to 0).
  const lampLevel = Math.max(0.25, 1 - missCount * 0.18)

  const cur = rounds[roundIdx]
  const completed = total > 0 && solved.every(Boolean)
  const correctCount = solved.filter(Boolean).length
  const answerWord = cur ? cur.options[cur.answerIndex] : ''
  const renderedPrompt = useMemo(() => maskAnswerInPrompt(cur?.prompt, answerWord), [cur?.prompt, answerWord])
  const bajla: 'idle' | 'flyby' | 'celebrate' = completed ? 'celebrate' : roundIdx === 0 && correctCount === 0 && missCount === 0 ? 'flyby' : 'idle'

  // Round setup — reset the lantern to the start cell and scatter tokens.
  useEffect(() => {
    if (!cur) return
    const placed = placeTokens(cur)
    game.current.pos = { ...START }
    game.current.prev = { ...START }
    game.current.stepAt = performance.now()
    setTokens(placed)
    setFeedback(null)
    setMissCount(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundIdx, cur?.id])

  // Move one cell — the canonical Maze Chase step, re-skinned in 3D. Walls
  // block; backtracking is always allowed (you can never get stuck).
  const moveOne = useCallback((d: Dir) => {
    if (completed) return
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
      setLive('Correct token collected.')
      if (advanceTimer.current) clearTimeout(advanceTimer.current)
      advanceTimer.current = setTimeout(() => {
        setRoundIdx((i) => (i + 1 < total ? i + 1 : i))
      }, ADVANCE_MS)
    } else {
      setFeedback('wrong')
      setMissCount((m) => m + 1)
      setTokens((arr) => arr.map((p) => (p.optionIdx === tok.optionIdx ? { ...p, eaten: true } : p)))
      setLive('Wrong token. The lantern dims.')
      if (clearTimer.current) clearTimeout(clearTimer.current)
      clearTimer.current = setTimeout(() => setFeedback(null), CLEAR_MS)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokens, roundIdx, total, completed])

  // Keep a tween cadence alive so the lantern interpolates between cells.
  // No game logic runs in update — movement is event-driven from input — but
  // the loop keeps the render clock warm and respects reducedMotion.
  useGameLoop(() => {}, undefined, { stepMs: STEP_MS, running: !completed, reducedMotion: reduce })

  // Fire the session result exactly once, on completion.
  useEffect(() => {
    if (completed && !fired.current) {
      fired.current = true
      setLive('You found the way out.')
      const result: SessionResult = {
        correctCount,
        totalQuestions: total,
        durationMs: Math.round(performance.now() - startMs.current),
        shellKey: 'mazechase',
      }
      onSessionComplete?.(result)
    }
  }, [completed, correctCount, total, onSessionComplete])

  // Keyboard — arrows / WASD move one cell (mirrors the 2D shell exactly).
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

  // Cleanup timers on unmount.
  useEffect(() => () => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current)
    if (clearTimer.current) clearTimeout(clearTimer.current)
    if (hintTimer.current) clearTimeout(hintTimer.current)
  }, [])

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
    setMissCount(0)
    setHintsUsed(0)
    setHintActive(false)
    setFeedback(null)
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
    <div style={{ position: 'absolute', inset: 0, fontFamily: 'var(--em-mono, ui-monospace, monospace)', color: '#EDE6FF' }}>
      <style>{`
        @keyframes mc-pop { 0%{transform:translateY(8px);opacity:0} 100%{transform:translateY(0);opacity:1} }
        @keyframes mc-hint { 0%,100%{box-shadow:0 0 0 0 ${CYAN}00} 50%{box-shadow:0 0 0 3px ${CYAN}cc} }
      `}</style>

      {/* Screen-reader live region (canvas is aria-hidden inside CityStage) */}
      <div role="status" aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{live}</div>

      {/* Prompt panel — pinned top-centre */}
      {cur && (
        <div style={{
          position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
          maxWidth: 'min(620px, 88%)', padding: '10px 16px', borderRadius: 12,
          background: 'linear-gradient(90deg, rgba(125,211,252,0.16), rgba(20,16,42,0.82))',
          border: `1px solid ${CYAN}66`, backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', gap: 12, animation: 'mc-pop 320ms ease',
        }} key={`p-${roundIdx}`}>
          <span style={{ fontSize: 11, letterSpacing: '0.18em', color: CYAN, border: `1px solid ${CYAN}66`, borderRadius: 4, padding: '3px 7px', flexShrink: 0 }}>RND {String(roundIdx + 1).padStart(2, '0')}/{String(total).padStart(2, '0')}</span>
          <span style={{ fontFamily: 'var(--em-decor, var(--em-mono, system-ui))', fontSize: 17, lineHeight: 1.3, flex: 1 }}>{renderedPrompt}</span>
        </div>
      )}

      {/* HUD — FOUND / TARGET, top-left (mirrors the 2D shell tally) */}
      <div style={{ position: 'absolute', top: 12, left: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <HudPill label="FOUND · ZNALEZIONE" value={`${correctCount}/${total}`} />
        <HudPill label="TARGET · CEL" value={answerWord} accent={CYAN} />
      </div>

      {missCount > 0 && (
        <div style={{ position: 'absolute', top: 12, right: 12, fontSize: 10, letterSpacing: '0.14em', color: ROSE, padding: '4px 8px', background: 'rgba(251,113,133,0.12)', border: `1px solid ${ROSE}66`, borderRadius: 4 }}>
          {missCount} WRONG TURN{missCount === 1 ? '' : 'S'}
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
            border: `1px solid ${tok.isAnswer ? CYAN : 'rgba(255,255,255,0.28)'}`,
            color: tok.isAnswer ? CYAN : '#FFFFFF',
            animation: tok.isAnswer && hintActive ? 'mc-hint 0.6s ease-in-out 3' : undefined,
          }}
        >{tok.word}</div>
      ))}

      {/* Controls — Skip / Hint (>=44px tap targets) */}
      <div style={{ position: 'absolute', bottom: 12, left: 12, display: 'flex', gap: 8, pointerEvents: 'auto' }}>
        <button onClick={skip} style={btnStyle()} aria-label="Skip round">SKIP</button>
        <button onClick={useHint} disabled={hintsUsed >= HINT_MAX} style={btnStyle(hintsUsed >= HINT_MAX)} aria-label={`Hint, ${HINT_MAX - hintsUsed} left`}>HINT {HINT_MAX - hintsUsed}</button>
      </div>

      {/* Touch D-pad — bottom-right (mirrors the 2D .em-mz-dpad) */}
      <div style={{ position: 'absolute', bottom: 12, right: 12, display: 'grid', gridTemplateColumns: 'repeat(3, 46px)', gridTemplateRows: 'repeat(3, 46px)', gap: 4, pointerEvents: 'auto' }}>
        <span /><button onClick={() => moveOne('up')} style={dpad()} aria-label="Up">↑</button><span />
        <button onClick={() => moveOne('left')} style={dpad()} aria-label="Left">←</button><span /><button onClick={() => moveOne('right')} style={dpad()} aria-label="Right">→</button>
        <span /><button onClick={() => moveOne('down')} style={dpad()} aria-label="Down">↓</button><span />
      </div>

      {/* Colour legend — CYAN = CORRECT / ROSE = WRONG (glyph + colour a11y) */}
      <div style={{ position: 'absolute', bottom: 70, left: 12, display: 'flex', gap: 10, fontSize: 10, letterSpacing: '0.1em', alignItems: 'center' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: CYAN }}>
          <span aria-hidden="true" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 14, height: 14, borderRadius: '50%', background: CYAN, color: '#0E0A1A', fontSize: 10, fontWeight: 900 }}>✓</span>
          CYAN = CORRECT
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: ROSE }}>
          <span aria-hidden="true" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 14, height: 14, borderRadius: '50%', background: ROSE, color: '#0E0A1A', fontSize: 10, fontWeight: 900 }}>✗</span>
          ROSE = WRONG
        </span>
      </div>

      {/* End card */}
      {completed && (
        <div role="dialog" aria-label="Museum After Dark complete" style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, background: `radial-gradient(ellipse, ${CYAN}22, rgba(10,5,24,0.72))`, backdropFilter: 'blur(6px)', pointerEvents: 'auto' }}>
          <div style={{ fontFamily: 'var(--em-decor, system-ui)', fontSize: 34, color: CYAN, textShadow: `0 0 18px ${CYAN}aa` }}>You found the way out.</div>
          <div style={{ fontSize: 14 }}>You collected <strong style={{ color: CYAN }}>{correctCount}</strong> / {total} artifacts</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={replay} style={btnStyle()}>Try another</button>
            <button onClick={replay} style={{ ...btnStyle(), background: CYAN, color: '#06212B', borderColor: CYAN }}>Next district →</button>
          </div>
        </div>
      )}
    </div>
  )

  return (
    <div
      role="application"
      aria-label="Museum After Dark — steer the lantern through the gallery maze to the word that matches the clue"
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
          hintActive={hintActive}
          reducedMotion={reduce}
          bajla={bajla}
          lampLevel={lampLevel}
          labelRefs={labelRefs}
        />
      </CityStage>
    </div>
  )
}

// ── Small DOM helpers ─────────────────────────────────────────────────────
function HudPill({ label, value, accent }: { label: string; value: string; accent?: string }) {
  const c = accent ?? CYAN
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
    background: 'rgba(125,211,252,0.16)', border: `1px solid ${CYAN}66`,
    color: CYAN, fontFamily: 'var(--em-mono, ui-monospace, monospace)', fontSize: 12,
    letterSpacing: '0.1em', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.45 : 1,
    touchAction: 'manipulation',
  }
}

function dpad(): React.CSSProperties {
  return {
    minWidth: 46, minHeight: 46, background: 'rgba(125,211,252,0.18)',
    border: `1px solid ${CYAN}66`, borderRadius: 8, color: CYAN,
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
