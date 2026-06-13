// BalloonPop3D — "Thames Balloon Festival", the riverside embankment at dusk.
//
// A three.js re-skin of the canonical 2D Balloon Pop shell (src/practice/
// shells/BalloonPop.tsx). The MECHANIC, scoring, round count, hint/skip rules
// and the forgiving wrong-pop behaviour are inherited verbatim from the 2D
// shell — this file changes only the stagecraft. Same puzzle in (ArcadePuzzle),
// same session result out (SessionResult). Built on the Fluent City GameKit
// (CityStage + useGameLoop + Bajla + palette).
//
// Fidelity note (binding, from docs/game3d/storyboards/balloonpop.md): read the
// gap-fill prompt and pop the rising balloon whose word fits before it drifts
// off-screen — 4 options, up to 6 rounds. A wrong pop is FORGIVING (the round
// continues; the correct balloon briefly haloes green); a balloon escaping the
// top is a miss, and once every balloon has left frame a fresh batch respawns
// after 600ms. The round advances only on a correct pop or Skip; the session
// completes — firing onSessionComplete — only when every round is solved. Under
// reducedMotion the balloons do NOT drift or wobble: they spawn at staggered
// fixed heights and hold (no rAF physics, no respawn) so there is no time
// pressure. Rise speed (0.18 + rand*0.08 per ~16.67ms step), wobble amplitude
// (6-12) and the 1200ms / 800ms / 600ms timings all mirror the 2D shell.
//
// Contract compliance: single CityStage canvas (DPR clamped, aria-hidden); all
// readable English lives in the DOM overlay (never a 3D texture) — the four
// balloon word-chips are real focusable DOM <button>s positioned each frame by
// a LabelProjector; quality tiers + reducedMotion honoured; full keyboard +
// touch input (tap targets >=44px); procedural geometry + vertex/instance
// colours only (no GLB, no textures, no external URLs, no new deps);
// allocation-free render loop; instanced repeats.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Color, MathUtils, Object3D, Vector3 } from 'three'
import type { Group, InstancedMesh, Mesh, PerspectiveCamera, PointLight } from 'three'
import { Bajla, CityStage, palette, useGameLoop, useStageQuality } from './kit'
import type { Game3DProps, SessionResult, Vocab3DItem } from './types'
import { generateBalloonPopPuzzle } from '../generators/generateBalloonPop'
import type { ArcadeInput, ArcadePuzzle, ArcadeRound } from '../generators/generateArcade'

// ── Canonical timing (identical to the 2D shell) ──────────────────────────
const STEP_MS = 1000 / 60 // physics tick — the 2D shell advances per ~16.67ms
const ADVANCE_MS = 1200 // correct → queue next round
const CLEAR_MS = 800 // wrong → clear the forgiving feedback cue
const RESPAWN_MS = 600 // all balloons gone → fresh batch (round still live)
const HINT_MAX = 3
const HINT_MS = 2400
const ESCAPE_AT = 105 // bottom% above which a balloon escapes (2D parity)

// Festival accent set — amber lantern key + rose miss + festival green pop.
const AMBER = '#ffb347'
const ROSE = '#FB7185'
const GREEN = '#34D399'
// Per-lane balloon colours (mirror the 2D BALLOON_PALETTE order).
const BALLOON_PALETTE = ['#FB7185', '#FBBF24', '#7DD3FC', '#A78BFA', '#34D399', '#E879F9']

// ── World mapping ──────────────────────────────────────────────────────────
// Balloons travel UP the world Y axis; each option owns a fixed X lane and a
// shallow Z so every word reads flat-on. The 2D model uses a 0..100+ "bottom%"
// rising coordinate, which we keep verbatim for the physics and map to world Y.
const LANES_Z = 0.0
const Y_FLOOR = 0.35 // railing height — bottom% 0 sits here
const Y_PER_PCT = 0.058 // world units per bottom% (≈6 units over the climb)
const X_SPAN = 5.4 // total horizontal spread of the lanes
const worldY = (bottomPct: number): number => Y_FLOOR + bottomPct * Y_PER_PCT
// Map the 2D x% (12..90) to a centred world X.
const worldX = (xPct: number): number => (xPct / 100 - 0.5) * X_SPAN

const MAX_OPTS = 4 // generateBalloonPopPuzzle caps options at 4
const SPARKS = 14 // pooled spark instances per pop (high tier)

type BalloonState = 'rising' | 'popped' | 'deflated' | 'escaped'

interface Balloon {
  id: number
  optionIdx: number
  word: string
  isAnswer: boolean
  x: number // horizontal start (0-100), 2D parity
  bottom: number // current % from bottom (rises over time)
  speed: number // % per ~16.67ms step
  wobble: number // wobble amplitude
  phase: number // wobble phase offset
  color: string
  state: BalloonState
}

interface GameState {
  balloons: Balloon[]
}

// ── Built-in demo puzzle — copied verbatim from the 2D shell so anonymous
// home-page play behaves identically (Game3DProps requires a demo when no
// puzzle / vocab is supplied). Six rounds, exactly like the 2D DEMO_PUZZLE. ──
const DEMO_PUZZLE: ArcadePuzzle = {
  rounds: [
    { id: 'bp1', prompt: 'A garden on top of a building.', options: ['rooftop', 'cellar', 'basement', 'pavement'], answerIndex: 0, hint: "Where you'd grow herbs above the city.", hint_pl: 'dach' },
    { id: 'bp2', prompt: 'A small platform you can stand on outside a flat.', options: ['balcony', 'gutter', 'spire', 'stoop'], answerIndex: 0, hint: 'You step outside but stay high up.', hint_pl: 'balkon' },
    { id: 'bp3', prompt: 'Twinkly tiny lights strung overhead.', options: ['fairy lights', 'lanterns', 'beacons', 'spotlights'], answerIndex: 0, hint: 'Wedding patios and Christmas trees use them.', hint_pl: 'lampki choinkowe' },
    { id: 'bp4', prompt: 'A railing along the edge of a roof.', options: ['gable', 'parapet', 'plinth', 'awning'], answerIndex: 1, hint: 'Low wall stopping you from falling off.', hint_pl: 'attyka' },
    { id: 'bp5', prompt: 'A potted shrub placed on a terrace.', options: ['planter', 'fender', 'gable', 'lintel'], answerIndex: 0, hint: 'Big container for plants.', hint_pl: 'donica' },
    { id: 'bp6', prompt: 'View of city lights from above.', options: ['vista', 'cellar', 'cabinet', 'attic'], answerIndex: 0, hint: 'A scenic outlook.', hint_pl: 'widok' },
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

const vocabToArcade = (v: Vocab3DItem[]): ArcadeInput[] =>
  v.map((it) => ({ word: it.word, word_pl: it.word_pl ?? '', clue: it.exampleEn, partOfSpeech: it.partOfSpeech, topic: it.topic }))

// Lay out options across horizontal positions — identical to the 2D shell.
function lanePct(oi: number, total: number): number {
  return 12 + (oi * 78) / Math.max(1, total - 1)
}

// Tiny deterministic RNG so a re-render of the same batch is stable.
function mulberry32(a: number): () => number {
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Build a fresh batch of balloons for a round. Mirrors the 2D spawnRound:
// staggered negative start (rising up) for normal play; staggered fixed heights
// (frozen, no drift, no wobble) under reducedMotion.
function makeBalloons(round: ArcadeRound, seed: number, reduce: boolean): Balloon[] {
  const opts = round.options
  const rand = mulberry32(seed)
  return opts.map((opt, oi) => ({
    id: seed * 16 + oi + 1,
    optionIdx: oi,
    word: opt,
    isAnswer: oi === round.answerIndex,
    x: lanePct(oi, opts.length),
    bottom: reduce ? 35 + (oi % 2) * 18 : -8 - oi * 8,
    speed: reduce ? 0 : 0.18 + rand() * 0.08,
    wobble: reduce ? 0 : 6 + rand() * 6,
    phase: rand() * Math.PI * 2,
    color: BALLOON_PALETTE[oi % BALLOON_PALETTE.length],
    state: 'rising',
  }))
}

// ── Allocation-free scratch objects (single canvas, single game instance) ──
const _pos = new Vector3()
const _obj = new Object3D()
const _col = new Color()

// =========================================================================
// Scene (inside the Canvas — reads the live game ref each frame)
// =========================================================================
interface SceneProps {
  game: React.MutableRefObject<GameState>
  balloons: Balloon[]
  hintId: number | null
  feedback: 'correct' | 'wrong' | null
  showAnswerHalo: boolean
  reducedMotion: boolean
  bajla: 'idle' | 'flyby' | 'celebrate'
  burstAt: React.MutableRefObject<{ x: number; y: number; t: number; color: string } | null>
  labelRefs: React.MutableRefObject<(HTMLButtonElement | null)[]>
  microDolly: boolean
}

function FestivalScene({ game, balloons, hintId, showAnswerHalo, reducedMotion, bajla, burstAt, labelRefs, microDolly }: SceneProps) {
  const { settings, tier } = useStageQuality()
  const highFx = tier === 'high' && !reducedMotion

  return (
    <group>
      <CameraRig microDolly={microDolly && tier === 'high'} reducedMotion={reducedMotion} />
      {tier === 'high' && <fog attach="fog" args={[palette.duskHorizon, 14, 36]} />}

      <Skyline reducedMotion={reducedMotion} highFx={highFx} />
      <River shimmer={tier === 'high' && !reducedMotion} />
      <Barge shadows={settings.shadows} />
      <Lanterns flicker={tier !== 'low' && !reducedMotion} highFx={highFx} />

      <Balloons
        game={game}
        balloons={balloons}
        hintId={hintId}
        showAnswerHalo={showAnswerHalo}
        reducedMotion={reducedMotion}
        shadows={settings.shadows}
      />
      {settings.particles > 0 && <Sparks burstAt={burstAt} reducedMotion={reducedMotion} />}
      <LabelProjector game={game} balloons={balloons} labelRefs={labelRefs} />

      <Bajla
        variant={bajla}
        reducedMotion={reducedMotion}
        scale={0.5}
        position={[-2.4, 3.6, -1.2]}
      />
    </group>
  )
}

function CameraRig({ microDolly, reducedMotion }: { microDolly: boolean; reducedMotion: boolean }) {
  const cam = useThree((s) => s.camera) as PerspectiveCamera
  const base = useRef<[number, number, number]>([0, 3.0, 8.5])
  const mountAt = useRef(0)
  useFrame((state) => {
    const [bx, by, bz] = base.current
    if (microDolly && !reducedMotion) {
      // 0.4s round-start micro-dolly (high tier only); otherwise locked.
      if (mountAt.current === 0) mountAt.current = state.clock.elapsedTime
      const dt = MathUtils.clamp(state.clock.elapsedTime - mountAt.current, 0, 0.4)
      const ease = 1 - Math.pow(1 - dt / 0.4, 3)
      cam.position.set(bx, by, bz + (1 - ease) * 0.6)
    } else {
      cam.position.set(bx, by, bz)
    }
    cam.lookAt(0, 2.6, 0)
  })
  return null
}

// Low-poly London skyline + Big Ben silhouette as one extruded vertex-coloured
// band against the dusk gradient. Instanced building blocks, one tower spire.
function Skyline({ reducedMotion, highFx }: { reducedMotion: boolean; highFx: boolean }) {
  const inst = useRef<InstancedMesh>(null)
  const blocks = useMemo(() => {
    const out: { x: number; h: number; w: number }[] = []
    const rand = mulberry32(0x5151)
    for (let i = 0; i < 22; i++) {
      const x = -11 + i * 1.0
      const h = 0.8 + rand() * 2.2
      const w = 0.7 + rand() * 0.35
      out.push({ x, h, w })
    }
    return out
  }, [])
  useEffect(() => {
    const mesh = inst.current
    if (!mesh) return
    blocks.forEach((b, i) => {
      _obj.position.set(b.x, b.h / 2 - 0.4, -7.5)
      _obj.rotation.set(0, 0, 0)
      _obj.scale.set(b.w, b.h, 0.6)
      _obj.updateMatrix()
      mesh.setMatrixAt(i, _obj.matrix)
      _col.set(palette.night)
      mesh.setColorAt(i, _col)
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [blocks])
  return (
    <group>
      <instancedMesh ref={inst} args={[undefined, undefined, blocks.length]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial vertexColors roughness={1} />
      </instancedMesh>
      {/* Big Ben silhouette — clock tower with a spire, just off centre */}
      <group position={[3.4, 0, -7.2]}>
        <mesh position={[0, 1.0, 0]}>
          <boxGeometry args={[0.5, 3.0, 0.5]} />
          <meshStandardMaterial color={palette.night} roughness={1} />
        </mesh>
        {/* Clock face — faint amber, decorative only (no readable text) */}
        <mesh position={[0, 2.1, 0.27]}>
          <circleGeometry args={[0.16, 18]} />
          <meshStandardMaterial color={palette.lanternCore} emissive={palette.lanternAmber} emissiveIntensity={highFx ? 0.7 : 0.4} roughness={0.5} />
        </mesh>
        <mesh position={[0, 2.85, 0]}>
          <coneGeometry args={[0.34, 0.9, 4]} />
          <meshStandardMaterial color={palette.ink} roughness={1} />
        </mesh>
      </group>
      {/* A slender bridge pier band behind the river */}
      <mesh position={[-3.2, 0.2, -6.6]}>
        <boxGeometry args={[2.6, 0.5, 0.4]} />
        <meshStandardMaterial color={palette.ink} roughness={1} />
      </mesh>
      {/* Stars / first lights — gentle ember twinkle high in the sky */}
      <Stars reducedMotion={reducedMotion} />
    </group>
  )
}

function Stars({ reducedMotion }: { reducedMotion: boolean }) {
  const inst = useRef<InstancedMesh>(null)
  const N = 26
  const seeds = useMemo(() => {
    const rand = mulberry32(0x2a2a)
    return Array.from({ length: N }, () => ({ x: -11 + rand() * 22, y: 3 + rand() * 4.5, z: -7 }))
  }, [])
  useEffect(() => {
    const mesh = inst.current
    if (!mesh) return
    seeds.forEach((s, i) => {
      _obj.position.set(s.x, s.y, s.z)
      _obj.rotation.set(0, 0, 0)
      _obj.scale.setScalar(0.03)
      _obj.updateMatrix()
      mesh.setMatrixAt(i, _obj.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
  }, [seeds])
  useFrame((state) => {
    const mesh = inst.current
    if (!mesh || reducedMotion) return
    const mat = mesh.material as { emissiveIntensity?: number }
    if (mat) mat.emissiveIntensity = 0.6 + Math.sin(state.clock.elapsedTime * 2.0) * 0.25
  })
  return (
    <instancedMesh ref={inst} args={[undefined, undefined, N]} frustumCulled={false}>
      <sphereGeometry args={[1, 6, 6]} />
      <meshStandardMaterial color={palette.ember} emissive={palette.ember} emissiveIntensity={0.6} />
    </instancedMesh>
  )
}

// The Thames — a vertex-coloured plane with a few scrolling specular
// lantern-reflection streaks (shimmer only on high; static otherwise).
function River({ shimmer }: { shimmer: boolean }) {
  const streaks = useRef<InstancedMesh>(null)
  const N = 7
  useFrame((state) => {
    const mesh = streaks.current
    if (!mesh) return
    const t = shimmer ? state.clock.elapsedTime : 0
    for (let i = 0; i < N; i++) {
      const baseX = -5 + i * 1.6
      const x = baseX + (shimmer ? Math.sin(t * 0.6 + i) * 0.3 : 0)
      const z = -1.5 - (i % 3) * 1.1
      _obj.position.set(x, -0.42, z)
      _obj.rotation.set(-Math.PI / 2, 0, 0)
      const len = 1.6 + (shimmer ? Math.sin(t * 1.2 + i * 1.7) * 0.4 : 0)
      _obj.scale.set(0.18, len, 1)
      _obj.updateMatrix()
      mesh.setMatrixAt(i, _obj.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
    const mat = mesh.material as { opacity?: number }
    if (mat) mat.opacity = shimmer ? 0.35 + Math.sin(t * 2.4) * 0.12 : 0.3
  })
  return (
    <group>
      {/* River surface */}
      <mesh position={[0, -0.45, -1.5]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[26, 12]} />
        <meshStandardMaterial color={palette.duskMid} roughness={0.35} metalness={0.4} />
      </mesh>
      {/* Lantern-reflection streaks */}
      <instancedMesh ref={streaks} args={[undefined, undefined, N]} frustumCulled={false}>
        <planeGeometry args={[1, 1]} />
        <meshStandardMaterial color={AMBER} emissive={AMBER} emissiveIntensity={0.7} transparent opacity={0.32} />
      </instancedMesh>
    </group>
  )
}

// The moored festival barge — railing/parapet strung with lanterns + planters.
function Barge({ shadows }: { shadows: boolean }) {
  const planters = useRef<InstancedMesh>(null)
  const NUM = 4
  useEffect(() => {
    const mesh = planters.current
    if (!mesh) return
    for (let i = 0; i < NUM; i++) {
      const x = worldX(lanePct(i, NUM))
      _obj.position.set(x, 0.1, 1.5)
      _obj.rotation.set(0, 0, 0)
      _obj.scale.set(1, 1, 1)
      _obj.updateMatrix()
      mesh.setMatrixAt(i, _obj.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  }, [])
  return (
    <group>
      {/* Deck slab */}
      <mesh position={[0, -0.15, 1.7]} receiveShadow={shadows}>
        <boxGeometry args={[X_SPAN + 2.6, 0.3, 2.2]} />
        <meshStandardMaterial color={palette.ink} roughness={0.95} />
      </mesh>
      {/* Front parapet rail */}
      <mesh position={[0, 0.28, 0.95]}>
        <boxGeometry args={[X_SPAN + 2.4, 0.1, 0.1]} />
        <meshStandardMaterial color={palette.brass} roughness={0.5} metalness={0.4} emissive={palette.brass} emissiveIntensity={0.12} />
      </mesh>
      {/* Rail posts */}
      {[-1, -0.34, 0.34, 1].map((f, i) => (
        <mesh key={i} position={[f * (X_SPAN / 2 + 0.6), 0.1, 0.95]}>
          <boxGeometry args={[0.08, 0.5, 0.08]} />
          <meshStandardMaterial color={palette.brass} roughness={0.6} metalness={0.3} />
        </mesh>
      ))}
      {/* Planters along the railing (instanced) */}
      <instancedMesh ref={planters} args={[undefined, undefined, NUM]} frustumCulled={false} castShadow={shadows}>
        <boxGeometry args={[0.34, 0.24, 0.3]} />
        <meshStandardMaterial color={'#3D2A18'} roughness={0.95} />
      </instancedMesh>
      {/* Shrub tufts on each planter (brand-kit leaf green) */}
      {Array.from({ length: NUM }).map((_, i) => (
        <mesh key={i} position={[worldX(lanePct(i, NUM)), 0.32, 1.5]}>
          <sphereGeometry args={[0.18, 10, 8]} />
          <meshStandardMaterial color={palette.leaf} roughness={0.9} flatShading />
        </mesh>
      ))}
    </group>
  )
}

// Paper lanterns strung over the barge — instanced amber glows + one warm
// hemispheric point light on high.
function Lanterns({ flicker, highFx }: { flicker: boolean; highFx: boolean }) {
  const inst = useRef<InstancedMesh>(null)
  const light = useRef<PointLight>(null)
  const positions = useMemo(() => {
    const out: [number, number, number][] = []
    const N = 9
    for (let i = 0; i < N; i++) {
      const x = -X_SPAN / 2 - 0.4 + (i / (N - 1)) * (X_SPAN + 0.8)
      const y = 1.05 + Math.sin(i * 0.6) * 0.18
      out.push([x, y, 0.85])
    }
    return out
  }, [])
  useEffect(() => {
    const mesh = inst.current
    if (!mesh) return
    positions.forEach((p, i) => {
      _obj.position.set(p[0], p[1], p[2])
      _obj.rotation.set(0, 0, 0)
      _obj.scale.set(1, 1.15, 1)
      _obj.updateMatrix()
      mesh.setMatrixAt(i, _obj.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
  }, [positions])
  useFrame((state) => {
    if (!flicker) return
    const f = 0.55 + Math.sin(state.clock.elapsedTime * 6.0) * 0.12 + Math.sin(state.clock.elapsedTime * 11.0) * 0.06
    const mesh = inst.current
    if (mesh) {
      const mat = mesh.material as { emissiveIntensity?: number }
      if (mat) mat.emissiveIntensity = 0.8 + f * 0.4
    }
    if (light.current) light.current.intensity = 0.5 + f * 0.4
  })
  return (
    <group>
      <instancedMesh ref={inst} args={[undefined, undefined, positions.length]} frustumCulled={false}>
        <sphereGeometry args={[0.14, 12, 10]} />
        <meshStandardMaterial color={palette.lanternCore} emissive={palette.lanternAmber} emissiveIntensity={0.9} roughness={0.6} />
      </instancedMesh>
      {highFx && <pointLight ref={light} position={[0, 1.4, 1.0]} color={palette.lanternAmber} intensity={0.6} distance={10} decay={2} />}
    </group>
  )
}

// The four lantern-balloons. Each is a small group (body + tie + string) whose
// world position is driven from the live game ref every frame; instancing is
// unnecessary at four balloons and a group keeps per-balloon state legible. A
// green halo ring sits under the answer balloon during a hint or wrong cue
// (mirrors the 2D "correct balloon flashes green").
function Balloons({ game, balloons, hintId, showAnswerHalo, reducedMotion, shadows }: {
  game: React.MutableRefObject<GameState>
  balloons: Balloon[]
  hintId: number | null
  showAnswerHalo: boolean
  reducedMotion: boolean
  shadows: boolean
}) {
  const groups = useRef<(Group | null)[]>([])
  const halo = useRef<Mesh>(null)
  useFrame((state) => {
    const live = game.current.balloons
    const t = reducedMotion ? 0 : state.clock.elapsedTime
    for (let i = 0; i < balloons.length; i++) {
      const g = groups.current[i]
      if (!g) continue
      const b = live[i] ?? balloons[i]
      if (!b || b.state === 'escaped') { g.visible = false; continue }
      const wob = reducedMotion ? 0 : Math.sin(t * 1.25 + b.phase) * (b.wobble / 60)
      g.visible = true
      g.position.set(worldX(b.x) + wob, worldY(b.bottom), LANES_Z)
      // pop → scale out; deflate → sink + shrink; rising → gentle bob.
      if (b.state === 'popped') {
        const k = MathUtils.clamp(g.scale.x - 0.08, 0.0, 1)
        g.scale.setScalar(Math.max(0.001, k))
      } else if (b.state === 'deflated') {
        const k = MathUtils.clamp(g.scale.x - 0.04, 0.2, 1)
        g.scale.setScalar(k)
        g.position.y -= (1 - k) * 0.6
      } else {
        const bob = reducedMotion ? 1 : 1 + Math.sin(t * 2 + b.phase) * 0.03
        g.scale.setScalar(bob)
      }
    }
    // Green answer halo — shown on a hint or while the wrong-cue is up.
    const m = halo.current
    if (m) {
      const ans = live.find((x) => x.isAnswer && x.state === 'rising')
      const show = !!ans && (showAnswerHalo || (!!ans && hintId === ans.id))
      if (!ans || !show) {
        m.visible = false
      } else {
        m.visible = true
        m.position.set(worldX(ans.x), worldY(ans.bottom), LANES_Z - 0.05)
        const pulse = reducedMotion ? 1 : 1 + Math.sin(t * 5) * 0.12
        m.scale.set(pulse, pulse, 1)
        const mat = m.material as { emissiveIntensity?: number }
        if (mat) mat.emissiveIntensity = reducedMotion ? 0.8 : 0.7 + Math.sin(t * 5) * 0.3
      }
    }
  })
  return (
    <group>
      <mesh ref={halo} position={[0, -10, 0]}>
        <ringGeometry args={[0.42, 0.56, 28]} />
        <meshStandardMaterial color={GREEN} emissive={GREEN} emissiveIntensity={0.7} transparent opacity={0.92} side={2} />
      </mesh>
      {balloons.map((b, i) => (
        <group key={b.id} ref={(el) => { groups.current[i] = el }}>
          {/* Balloon body */}
          <mesh castShadow={shadows} scale={[1, 1.2, 1]}>
            <sphereGeometry args={[0.34, 18, 16]} />
            <meshStandardMaterial color={b.color} roughness={0.35} emissive={b.color} emissiveIntensity={0.18} />
          </mesh>
          {/* Specular highlight cap */}
          <mesh position={[-0.1, 0.16, 0.26]}>
            <sphereGeometry args={[0.07, 10, 8]} />
            <meshStandardMaterial color={'#FFFFFF'} transparent opacity={0.4} />
          </mesh>
          {/* Tie */}
          <mesh position={[0, -0.42, 0]}>
            <coneGeometry args={[0.06, 0.1, 8]} />
            <meshStandardMaterial color={b.color} roughness={0.5} />
          </mesh>
          {/* String */}
          <mesh position={[0, -0.62, 0]}>
            <cylinderGeometry args={[0.006, 0.006, 0.32, 5]} />
            <meshStandardMaterial color={'#E9E0FF'} transparent opacity={0.5} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

// Pooled spark/confetti burst on a correct pop — one instancedMesh of SPARKS
// shards fired from the burst position; allocation-free, fades over ~0.5s.
function Sparks({ burstAt, reducedMotion }: { burstAt: React.MutableRefObject<{ x: number; y: number; t: number; color: string } | null>; reducedMotion: boolean }) {
  const inst = useRef<InstancedMesh>(null)
  const seeds = useMemo(() => {
    const rand = mulberry32(0x9e37)
    return Array.from({ length: SPARKS }, (_, i) => ({ a: (i / SPARKS) * Math.PI * 2 + rand() * 0.4, sp: 0.6 + rand() * 0.9, sz: 0.03 + rand() * 0.03 }))
  }, [])
  useFrame((state) => {
    const mesh = inst.current
    if (!mesh) return
    const burst = burstAt.current
    if (!burst || reducedMotion) { mesh.visible = false; return }
    const age = state.clock.elapsedTime - burst.t
    if (age > 0.5 || age < 0) { mesh.visible = false; return }
    mesh.visible = true
    const wx = worldX(burst.x)
    const wy = worldY(burst.y)
    _col.set(burst.color)
    for (let i = 0; i < SPARKS; i++) {
      const s = seeds[i]
      const r = s.sp * age * 2.4
      _obj.position.set(wx + Math.cos(s.a) * r, wy + Math.sin(s.a) * r + age * 0.4, LANES_Z + 0.1)
      const sc = s.sz * (1 - age / 0.5)
      _obj.scale.setScalar(Math.max(0.001, sc))
      _obj.rotation.set(0, 0, s.a + age * 6)
      _obj.updateMatrix()
      mesh.setMatrixAt(i, _obj.matrix)
      mesh.setColorAt(i, _col)
    }
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  })
  return (
    <instancedMesh ref={inst} args={[undefined, undefined, SPARKS]} frustumCulled={false} visible={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial vertexColors emissive={AMBER} emissiveIntensity={0.8} toneMapped={false} />
    </instancedMesh>
  )
}

// Projects each balloon's world position to screen px and writes it onto the
// DOM word-chip transforms (English stays crisp DOM, never a 3D texture). The
// chips are the real focusable <button>s — this only positions them.
function LabelProjector({ game, balloons, labelRefs }: { game: React.MutableRefObject<GameState>; balloons: Balloon[]; labelRefs: React.MutableRefObject<(HTMLButtonElement | null)[]> }) {
  const cam = useThree((s) => s.camera) as PerspectiveCamera
  const size = useThree((s) => s.size)
  useFrame((state) => {
    const live = game.current.balloons
    const t = state.clock.elapsedTime
    for (let i = 0; i < balloons.length; i++) {
      const el = labelRefs.current[i]
      if (!el) continue
      const b = live[i] ?? balloons[i]
      if (!b || b.state === 'escaped' || b.state === 'popped') { el.style.opacity = '0'; el.style.pointerEvents = 'none'; continue }
      const wob = Math.sin(t * 1.25 + b.phase) * (b.wobble / 60)
      _pos.set(worldX(b.x) + wob, worldY(b.bottom) + 0.5, LANES_Z).project(cam)
      if (_pos.z > 1) { el.style.opacity = '0'; el.style.pointerEvents = 'none'; continue }
      const x = (_pos.x * 0.5 + 0.5) * size.width
      const y = (-_pos.y * 0.5 + 0.5) * size.height
      el.style.opacity = b.state === 'deflated' ? '0.35' : '1'
      el.style.pointerEvents = b.state === 'rising' ? 'auto' : 'none'
      el.style.transform = `translate(-50%, -50%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`
    }
  })
  return null
}

// =========================================================================
// BalloonPop3D — the Game3D component (default export)
// =========================================================================
export default function BalloonPop3D({ puzzle, vocab, onSessionComplete, quality, reducedMotion, fullscreen }: Game3DProps) {
  const prefersReduced = usePrefersReducedMotion()
  const reduce = reducedMotion ?? prefersReduced

  const activePuzzle = useMemo<ArcadePuzzle>(() => {
    const p = puzzle as ArcadePuzzle | undefined
    if (p && Array.isArray(p.rounds) && p.rounds.length > 0) return p
    if (vocab && vocab.length > 0) {
      const gen = generateBalloonPopPuzzle(vocabToArcade(vocab), { seed: 7 })
      if (gen && gen.rounds.length > 0) return gen
    }
    return DEMO_PUZZLE
  }, [puzzle, vocab])
  const rounds = activePuzzle.rounds
  const total = rounds.length

  const game = useRef<GameState>({ balloons: [] })
  const labelRefs = useRef<(HTMLButtonElement | null)[]>([])
  const burstAt = useRef<{ x: number; y: number; t: number; color: string } | null>(null)
  const startMs = useRef(performance.now())
  const fired = useRef(false)
  const batchSeed = useRef(1)
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const respawnArmed = useRef(false)

  const [roundIdx, setRoundIdx] = useState(0)
  const [solved, setSolved] = useState<boolean[]>(() => rounds.map(() => false))
  const [balloons, setBalloons] = useState<Balloon[]>([])
  const [score, setScore] = useState(0)
  const [miss, setMiss] = useState(0)
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null)
  const [hintsUsed, setHintsUsed] = useState(0)
  const [hintId, setHintId] = useState<number | null>(null)
  const [focusLane, setFocusLane] = useState(0)
  const [started, setStarted] = useState(false)
  const [paused, setPaused] = useState(false)
  const [live, setLive] = useState('')
  const [microDolly, setMicroDolly] = useState(false)

  const cur = rounds[roundIdx]
  const completed = total > 0 && solved.every(Boolean)
  const correctCount = solved.filter(Boolean).length
  const answerWord = cur ? cur.options[cur.answerIndex] : ''
  const renderedPrompt = useMemo(() => maskAnswerInPrompt(cur?.prompt, answerWord), [cur?.prompt, answerWord])
  const bajla: 'idle' | 'flyby' | 'celebrate' = completed ? 'celebrate' : !started ? 'flyby' : 'idle'

  // Spawn a fresh batch for this round. Mirrors the 2D spawnRound (incl. the
  // reduced-motion frozen layout).
  const spawnRound = useCallback(() => {
    if (!cur) return
    const seed = batchSeed.current++
    const next = makeBalloons(cur, seed, reduce)
    game.current.balloons = next
    setBalloons(next)
    setFeedback(null)
    respawnArmed.current = false
    // Trigger the high-tier round-start micro-dolly.
    setMicroDolly((d) => !d)
  }, [cur, reduce])

  // Round setup — re-spawn on round change.
  useEffect(() => {
    spawnRound()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundIdx, cur?.id])

  // Fixed-timestep tick — the canonical Balloon Pop physics, re-skinned in 3D.
  // Under reducedMotion the loop is not running (see useGameLoop `running`), so
  // balloons hold at their frozen spawn heights exactly like the 2D shell.
  const update = useCallback(() => {
    const g = game.current
    if (!g.balloons.length) return
    let anyRising = false
    let changed = false
    const next = g.balloons.map((b) => {
      if (b.state !== 'rising') return b
      const nb = b.bottom + b.speed // one ~16.67ms step (dt≈1), 2D parity
      if (nb > ESCAPE_AT) {
        changed = true
        return { ...b, state: 'escaped' as BalloonState, bottom: 110 }
      }
      anyRising = true
      changed = true
      return { ...b, bottom: nb }
    })
    g.balloons = next
    if (changed) setBalloons(next)
    // All balloons gone (escaped/popped/deflated) and round unsolved → respawn
    // a fresh batch after 600ms (2D parity; never ends the round).
    if (!anyRising && next.length > 0 && !respawnArmed.current && !solved[roundIdx]) {
      respawnArmed.current = true
      window.setTimeout(() => {
        if (!solved[roundIdx]) {
          setLive('The balloons drifted away — a fresh batch rises.')
          spawnRound()
        }
      }, RESPAWN_MS)
    }
  }, [solved, roundIdx, spawnRound])

  useGameLoop(update, undefined, {
    stepMs: STEP_MS,
    running: started && !paused && !completed && !reduce,
    reducedMotion: reduce,
  })

  // Pop a balloon by id — the single source of truth for both pointer taps and
  // keyboard activation. Mirrors the 2D `pop` exactly.
  const pop = useCallback((id: number) => {
    const g = game.current
    const b = g.balloons.find((x) => x.id === id)
    if (!b || b.state !== 'rising') return
    if (!started) setStarted(true)
    if (b.isAnswer) {
      g.balloons = g.balloons.map((x) => (x.id === id ? { ...x, state: 'popped' as BalloonState } : x))
      setBalloons(g.balloons)
      burstAt.current = { x: b.x, y: b.bottom, t: performance.now() / 1000, color: b.color }
      setScore((s) => s + 1)
      setFeedback('correct')
      setSolved((arr) => arr.map((v, i) => (i === roundIdx ? true : v)))
      setLive('Correct balloon popped.')
      if (advanceTimer.current) clearTimeout(advanceTimer.current)
      advanceTimer.current = setTimeout(() => {
        setRoundIdx((i) => (i + 1 < total ? i + 1 : i))
      }, ADVANCE_MS)
    } else {
      g.balloons = g.balloons.map((x) => (x.id === id ? { ...x, state: 'deflated' as BalloonState } : x))
      setBalloons(g.balloons)
      setMiss((m) => m + 1)
      setFeedback('wrong')
      setLive(`Wrong balloon. ${answerWord} is the answer.`)
      if (clearTimer.current) clearTimeout(clearTimer.current)
      clearTimer.current = setTimeout(() => setFeedback(null), CLEAR_MS)
    }
  }, [started, roundIdx, total, answerWord])

  // Pop the balloon currently in a given lane (1-4 number keys / focus ring).
  const popLane = useCallback((lane: number) => {
    const b = game.current.balloons.find((x) => x.optionIdx === lane && x.state === 'rising')
    if (b) pop(b.id)
  }, [pop])

  // Fire the session result exactly once, on completion.
  useEffect(() => {
    if (completed && !fired.current) {
      fired.current = true
      setLive('The river settles. All balloons popped.')
      const result: SessionResult = {
        correctCount,
        totalQuestions: total,
        durationMs: Math.round(performance.now() - startMs.current),
        shellKey: 'balloonpop',
      }
      onSessionComplete?.(result)
    }
  }, [completed, correctCount, total, onSessionComplete])

  const useHint = useCallback(() => {
    if (hintsUsed >= HINT_MAX) return
    const ans = game.current.balloons.find((b) => b.isAnswer && b.state === 'rising')
    if (!ans) return
    setHintId(ans.id)
    setHintsUsed((h) => h + 1)
    setLive('Hint — the matching balloon glows green.')
    if (hintTimer.current) clearTimeout(hintTimer.current)
    hintTimer.current = setTimeout(() => setHintId(null), HINT_MS)
  }, [hintsUsed])

  const skip = useCallback(() => {
    setRoundIdx((i) => (i + 1 < total ? i + 1 : i))
  }, [total])

  // Stable refs so the keydown handler can call the latest hint/skip without
  // re-subscribing the listener every render.
  const useHintRef = useRef(useHint)
  const skipRef = useRef(skip)
  useHintRef.current = useHint
  skipRef.current = skip

  // Keyboard — 1-4 pop lanes, arrows move the focus ring, Enter/Space pop the
  // focused balloon, H hint, S skip, Space (pre-start) starts / (in play) pauses.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key >= '1' && e.key <= '4') {
        e.preventDefault()
        if (!started) setStarted(true)
        popLane(Number(e.key) - 1)
        return
      }
      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault(); setFocusLane((l) => Math.max(0, l - 1)); break
        case 'ArrowRight':
          e.preventDefault(); setFocusLane((l) => Math.min(MAX_OPTS - 1, l + 1)); break
        case 'Enter':
          e.preventDefault()
          if (!started) { setStarted(true); break }
          popLane(focusLane); break
        case ' ': case 'Spacebar':
          e.preventDefault()
          if (!started) setStarted(true)
          else if (!completed) setPaused((p) => !p)
          break
        case 'h': case 'H':
          e.preventDefault(); useHintRef.current(); break
        case 's': case 'S':
          e.preventDefault(); skipRef.current(); break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [started, completed, focusLane, popLane])

  // Cleanup timers on unmount.
  useEffect(() => () => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current)
    if (clearTimer.current) clearTimeout(clearTimer.current)
    if (hintTimer.current) clearTimeout(hintTimer.current)
  }, [])

  const replay = useCallback(() => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current)
    if (clearTimer.current) clearTimeout(clearTimer.current)
    if (hintTimer.current) clearTimeout(hintTimer.current)
    fired.current = false
    startMs.current = performance.now()
    setSolved(rounds.map(() => false))
    setScore(0)
    setMiss(0)
    setHintsUsed(0)
    setHintId(null)
    setFeedback(null)
    setPaused(false)
    setLive('')
    setStarted(true)
    setFocusLane(0)
    setRoundIdx(0)
  }, [rounds])

  const overlay = (
    <div style={{ position: 'absolute', inset: 0, fontFamily: 'var(--em-mono, ui-monospace, monospace)', color: '#EDE6FF' }}>
      <style>{`
        @keyframes bp3-pop { 0%{transform:translateY(8px);opacity:0} 100%{transform:translateY(0);opacity:1} }
        @keyframes bp3-glow { 0%,100%{box-shadow:0 0 0 0 ${GREEN}00} 50%{box-shadow:0 0 0 3px ${GREEN}cc} }
      `}</style>

      {/* Screen-reader live region (canvas is aria-hidden inside CityStage) */}
      <div role="status" aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{live}</div>

      {/* Prompt panel — pinned top-centre */}
      {cur && (
        <div style={{
          position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
          maxWidth: 'min(620px, 88%)', padding: '10px 16px', borderRadius: 12,
          background: 'linear-gradient(90deg, rgba(255,179,71,0.16), rgba(20,16,42,0.82))',
          border: `1px solid ${AMBER}66`, backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', gap: 12, animation: 'bp3-pop 320ms ease',
        }} key={`p-${roundIdx}`}>
          <span style={{ fontSize: 11, letterSpacing: '0.18em', color: AMBER, border: `1px solid ${AMBER}66`, borderRadius: 4, padding: '3px 7px', flexShrink: 0 }}>RND {String(roundIdx + 1).padStart(2, '0')}</span>
          <span style={{ fontFamily: 'var(--em-decor, var(--em-mono, system-ui))', fontSize: 17, lineHeight: 1.3, flex: 1 }}>{renderedPrompt}</span>
        </div>
      )}

      {/* HUD — SCORE / TARGET, top-left (mirrors the 2D shell) */}
      <div style={{ position: 'absolute', top: 12, left: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <HudPill label="SCORE · WYNIK" value={`${score}/${total}`} />
        <HudPill label="TARGET · CEL" value={answerWord} accent={AMBER} />
      </div>

      {miss > 0 && (
        <div style={{ position: 'absolute', top: 12, right: 12, fontSize: 10, letterSpacing: '0.14em', color: ROSE, padding: '4px 8px', background: 'rgba(251,113,133,0.12)', border: `1px solid ${ROSE}66`, borderRadius: 4 }}>
          {miss} POPPED WRONG
        </div>
      )}

      {/* Balloon word-chips — real focusable DOM buttons, positioned by the 3D
          LabelProjector. These ARE the keyboard interaction (Tab cycles them,
          Enter/Space pops); they mirror the 2D per-balloon <button>. */}
      {balloons.map((b, i) => (
        <button
          key={b.id}
          ref={(el) => { labelRefs.current[i] = el }}
          type="button"
          onClick={() => pop(b.id)}
          onFocus={() => setFocusLane(b.optionIdx)}
          aria-label={`Balloon with answer ${b.word}, activate to pop`}
          disabled={b.state !== 'rising'}
          style={{
            position: 'absolute', top: 0, left: 0, opacity: 0, pointerEvents: 'none',
            padding: '6px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
            minWidth: 44, minHeight: 44, cursor: b.state === 'rising' ? 'pointer' : 'default',
            background: 'rgba(14,10,26,0.92)',
            border: `2px solid ${b.isAnswer && hintId === b.id ? GREEN : (focusLane === b.optionIdx ? AMBER : 'rgba(255,255,255,0.32)')}`,
            color: b.isAnswer && hintId === b.id ? GREEN : '#FFFFFF',
            touchAction: 'manipulation',
            animation: b.isAnswer && hintId === b.id ? 'bp3-glow 0.6s ease-in-out 3' : undefined,
          }}
        >{b.word}</button>
      ))}

      {/* Controls — Skip / Hint / Pause (>=44px tap targets) */}
      <div style={{ position: 'absolute', bottom: 12, left: 12, display: 'flex', gap: 8, pointerEvents: 'auto' }}>
        <button onClick={skip} style={btnStyle()} aria-label="Skip round">SKIP</button>
        <button onClick={useHint} disabled={hintsUsed >= HINT_MAX} style={btnStyle(hintsUsed >= HINT_MAX)} aria-label={`Hint, ${HINT_MAX - hintsUsed} left`}>HINT {HINT_MAX - hintsUsed}</button>
        <button onClick={() => started && !completed && setPaused((p) => !p)} style={btnStyle()} aria-label={paused ? 'Resume' : 'Pause'}>{paused ? '▶' : '❚❚'}</button>
      </div>

      {/* Lane buttons — bottom-right touch fallback (tap a lane to pop it) */}
      <div style={{ position: 'absolute', bottom: 12, right: 12, display: 'flex', gap: 6, pointerEvents: 'auto' }}>
        {Array.from({ length: MAX_OPTS }).map((_, i) => (
          <button key={i} onClick={() => popLane(i)} style={laneBtn(focusLane === i)} aria-label={`Pop balloon in lane ${i + 1}`}>{i + 1}</button>
        ))}
      </div>

      {/* Start gate */}
      {!started && !completed && (
        <button
          onClick={() => setStarted(true)}
          style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, background: 'rgba(10,5,24,0.35)', border: 'none', cursor: 'pointer', pointerEvents: 'auto', color: '#EDE6FF' }}
        >
          <div style={{ fontFamily: 'var(--em-decor, system-ui)', fontSize: 32, color: AMBER, textShadow: `0 0 18px ${AMBER}aa`, textAlign: 'center', padding: '0 16px' }}>Thames Balloon Festival</div>
          <div style={{ fontSize: 12, letterSpacing: '0.2em', opacity: 0.85 }}>POP THE WORD THAT FITS · press / tap to start</div>
        </button>
      )}

      {/* Pause veil */}
      {paused && started && !completed && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(10,5,24,0.55)' }}>
          <div style={{ fontFamily: 'var(--em-decor, system-ui)', fontSize: 30, color: AMBER }}>PAUSED</div>
        </div>
      )}

      {/* End card */}
      {completed && (
        <div role="dialog" aria-label="Thames Balloon Festival complete" style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, background: `radial-gradient(ellipse, ${AMBER}22, rgba(10,5,24,0.72))`, backdropFilter: 'blur(6px)', pointerEvents: 'auto' }}>
          <div style={{ fontFamily: 'var(--em-decor, system-ui)', fontSize: 34, color: AMBER, textShadow: `0 0 18px ${AMBER}aa` }}>The river settles.</div>
          <div style={{ fontSize: 14 }}>You popped <strong style={{ color: GREEN }}>{correctCount}</strong> / {total} balloons</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={replay} style={btnStyle()}>Replay</button>
            <button onClick={replay} style={{ ...btnStyle(), background: AMBER, color: '#2A1604', borderColor: AMBER }}>Next district →</button>
          </div>
        </div>
      )}
    </div>
  )

  return (
    <div
      role="application"
      aria-label="Thames Balloon Festival — pop the rising balloon whose word fits the gap"
      style={{ position: 'relative', width: '100%', height: '100%', minHeight: 320 }}
    >
      <CityStage
        quality={quality}
        reducedMotion={reduce}
        fullscreen={fullscreen}
        cameraPosition={[0, 3.0, 8.5]}
        cameraFov={45}
        overlay={overlay}
      >
        <FestivalScene
          game={game}
          balloons={balloons}
          hintId={hintId}
          feedback={feedback}
          showAnswerHalo={hintId != null || feedback === 'wrong'}
          reducedMotion={reduce}
          bajla={bajla}
          burstAt={burstAt}
          labelRefs={labelRefs}
          microDolly={microDolly}
        />
      </CityStage>
    </div>
  )
}

// ── Small DOM helpers ─────────────────────────────────────────────────────
function HudPill({ label, value, accent }: { label: string; value: string; accent?: string }) {
  const c = accent ?? AMBER
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
    background: 'rgba(255,179,71,0.16)', border: `1px solid ${AMBER}66`,
    color: AMBER, fontFamily: 'var(--em-mono, ui-monospace, monospace)', fontSize: 12,
    letterSpacing: '0.1em', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.45 : 1,
    touchAction: 'manipulation',
  }
}

function laneBtn(active: boolean): React.CSSProperties {
  return {
    minWidth: 46, minHeight: 46, background: active ? 'rgba(255,179,71,0.3)' : 'rgba(255,179,71,0.16)',
    border: `1px solid ${AMBER}${active ? 'cc' : '66'}`, borderRadius: 8, color: AMBER,
    fontSize: 16, fontWeight: 700, cursor: 'pointer', touchAction: 'manipulation',
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
