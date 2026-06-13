// Airplane3D — "Paper Plane Post", the Royal Mail Sky Route district.
//
// A three.js re-skin of the canonical 2D Airplane shell (src/practice/shells/
// Airplane.tsx). The MECHANIC, scoring, round count, hint/skip rules and the
// no-fail forgiving review are inherited verbatim from the 2D shell — this
// file changes only the stagecraft. Same puzzle in (WrapperPuzzle from
// generateAirplane → generateWrapperPuzzle), same session result out
// (SessionResult). Built on the Fluent City GameKit (CityStage + useGameLoop
// + Bajla + palette).
//
// Re-skin note (binding, from docs/game3d/storyboards/airplane.md): this is a
// *presentation* of the Airplane shell. The graded act is SELECTING one of
// four word-bearing targets — identical to the 2D "tap the cloud" verb. The
// plane is on autopilot and auto-threads the chosen ring; "steering /
// collision" is the cosmetic expression of a discrete selection, NOT a
// skill-based dodge. Scoring (correctCount = total − distinct wrong
// questionIds), 8 production rounds / 6 demo, 2 hints (each dims one wrong
// ring), Skip = advance, the 1400ms verdict pause and the verbatim
// "Correct." / "Wrong. The right one was <word>." announcements all mirror
// Airplane.tsx exactly. Pedagogy is not changed.
//
// Contract compliance: single CityStage canvas (DPR clamped, aria-hidden);
// all readable English lives in the DOM overlay (never a 3D texture); quality
// tiers + reducedMotion honoured; full keyboard + touch input; procedural
// geometry + vertex/instance colours only (no GLB, no textures, no external
// URLs, no new deps, no helper-lib barrels); allocation-free render loop;
// instanced repeats only.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Color, MathUtils, Object3D, Vector3 } from 'three'
import type { Group, InstancedMesh, PerspectiveCamera, PointLight } from 'three'
import { Bajla, CityStage, palette, useStageQuality } from './kit'
import type { Game3DProps, SessionResult, Vocab3DItem } from './types'
import { generateAirplane } from '../generators/generateAirplane'
import type { WrapperPuzzle, WrapperRound } from '../generators/wrapperPuzzle'

// ── Canonical accent + timing (identical to the 2D shell) ─────────────────
const ACCENT = '#7DD3FC'      // ring / selection accent (2D ACCENT)
const CORRECT = '#34D399'     // correct-green flash
const CORRECT_SOFT = '#7fb069' // park-leaf green (palette.leaf)
const WRONG = '#FB7185'       // wrong-pink
const VERDICT_MS = 1400       // verdict pause before next round (2D timeout)
const HINT_MAX = 2            // 2 hints per session (2D: hintsUsed >= 2)
const RING_COUNT = 4          // four options, always

// World layout — rings approach the camera along +Z→ toward the plane. The
// plane sits near the camera at small Z; rings spawn deep (negative Z) and
// drift forward. A shallow vertical/lateral fan echoes the 2D 22–68% spread.
const PLANE_Z = 3.2
const NEAR_Z = 4.6            // a ring at/after this depth has drifted "past"
const FAR_Z = -7.5           // spawn depth (furthest)
const RING_SPACING = 3.4     // depth between consecutive rings in the fan
const DRIFT_UPS = 1.55       // world units / sec the rings approach (full fx)
const DRIFT_UPS_LOW = 1.0    // slower drift on low tier (storyboard)

type Verdict = 'right' | 'wrong' | null

interface RingModel {
  optionIdx: number
  text: string
  isAnswer: boolean
  laneX: number   // lateral fan offset
  laneY: number   // vertical fan offset
}

interface RingRuntime {
  z: number       // current depth (drifts toward NEAR_Z)
  dimmed: boolean // hint-dimmed wrong ring
}

interface GameState {
  rings: RingRuntime[]
  models: RingModel[]
  highlight: number  // keyboard-highlighted ring index
  verdict: Verdict
  picked: number | null
  paused: boolean
}

// ── Built-in demo puzzle — copied verbatim from the 2D shell (AP_DEMO) so
// anonymous home-page play behaves identically (Game3DProps requires a demo
// when no puzzle / vocab is supplied). 6 rounds, exactly like the 2D demo. ──
const DEMO_PUZZLE: WrapperPuzzle = {
  rounds: [
    { id: 'cloud', prompt: 'A puff of water vapour in the sky is a ___.', options: ['fog', 'cloud', 'mist', 'storm'], answerIndex: 1, hint: 'You can see one from below.', hint_pl: 'Po polsku: chmura.' },
    { id: 'wing', prompt: 'A part that lets a plane fly is its ___.', options: ['wing', 'wheel', 'tail', 'door'], answerIndex: 0, hint: 'There are two — one each side.', hint_pl: 'Po polsku: skrzydło.' },
    { id: 'runway', prompt: 'The long strip a plane uses to take off is the ___.', options: ['platform', 'pier', 'runway', 'avenue'], answerIndex: 2, hint: 'Numbered with big letters.', hint_pl: 'Po polsku: pas startowy.' },
    { id: 'takeoff', prompt: 'The moment a plane leaves the ground is ___.', options: ['descent', 'landing', 'takeoff', 'taxi'], answerIndex: 2, hint: 'Opposite of landing.', hint_pl: 'Po polsku: start.' },
    { id: 'altitude', prompt: 'How high above the ground you are is your ___.', options: ['speed', 'pressure', 'altitude', 'mass'], answerIndex: 2, hint: 'Measured in feet or metres.', hint_pl: 'Po polsku: wysokość.' },
    { id: 'descent', prompt: 'When a plane goes down toward the airport it is in ___.', options: ['descent', 'climb', 'cruise', 'taxi'], answerIndex: 0, hint: 'The opposite of climb.', hint_pl: 'Po polsku: opadanie.' },
  ],
}

// Per-shell answer-leak guard — belt-and-suspenders with the generator's
// maskAnswerInPrompt. If the rendered prompt still contains the answer word
// (case-insensitive, whole word) replace it with `___`.
function maskAnswerInPrompt(prompt: string | undefined, answer: string | undefined): string {
  if (!prompt) return ''
  if (!answer) return prompt
  const ans = answer.toLowerCase().trim()
  if (!ans) return prompt
  const safe = ans.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return prompt.replace(new RegExp(`\\b${safe}\\b`, 'gi'), '___')
}

const vocabToWrapper = (v: Vocab3DItem[]) =>
  v.map((it) => ({
    word: it.word,
    word_pl: it.word_pl ?? '',
    partOfSpeech: it.partOfSpeech,
    exampleEn: it.exampleEn,
    exampleEn_pl: it.example_pl,
  }))

// Deterministic fan layout for a round's rings — stable across re-renders so
// the scatter matches the canonical vertical spread without per-frame churn.
function buildModels(round: WrapperRound): RingModel[] {
  let seed = (round.id.split('').reduce((a, ch) => a + ch.charCodeAt(0), 0) * 17 + 13) >>> 0
  const rand = (): number => {
    seed = (seed + 0x6d2b79f5) >>> 0
    let t = seed
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return round.options.map((opt, i) => {
    // Lateral fan: spread across [-2.4, 2.4]; vertical fan: gentle stagger
    // mirroring the 2D 22–68% band, jittered for life.
    const laneX = -2.4 + (4.8 / Math.max(RING_COUNT - 1, 1)) * i
    const laneY = 0.5 + (i % 2 === 0 ? 0.55 : -0.35) + (rand() - 0.5) * 0.4
    return { optionIdx: i, text: opt, isAnswer: i === round.answerIndex, laneX, laneY }
  })
}

// ── Allocation-free scratch objects (single canvas, single game instance) ──
const _pos = new Vector3()
const _obj = new Object3D()
const _col = new Color()
const _ringBase = new Color(ACCENT)

// =========================================================================
// Scene (inside the Canvas — reads the live game ref each frame)
// =========================================================================
interface SceneProps {
  game: React.MutableRefObject<GameState>
  models: RingModel[]
  reducedMotion: boolean
  started: boolean
  bajla: 'idle' | 'flyby' | 'celebrate'
  planeReact: React.MutableRefObject<{ until: number; kind: Verdict }>
  labelRefs: React.MutableRefObject<(HTMLDivElement | null)[]>
}

function SkyScene({ game, models, reducedMotion, started, bajla, planeReact, labelRefs }: SceneProps) {
  const { settings, tier } = useStageQuality()
  const highFx = tier === 'high' && !reducedMotion

  return (
    <group>
      <CameraRig drift={highFx} reducedMotion={reducedMotion} />
      {tier === 'high' && <fog attach="fog" args={[palette.duskHorizon, 10, 26]} />}
      {/* Warm lantern key raking from the horizon. */}
      <directionalLight position={[-2, 1.6, -6]} intensity={0.7} color={palette.lanternAmber} />

      <Skyline shadows={settings.shadows} />
      <Lanterns flicker={tier !== 'low' && !reducedMotion} highFx={highFx} />
      {tier !== 'low' && <Stars reducedMotion={reducedMotion} />}
      {settings.particles > 0 && <SparkBurst game={game} density={settings.particles} reducedMotion={reducedMotion} />}

      <Rings game={game} models={models} reducedMotion={reducedMotion} />
      <RingLabelProjector game={game} models={models} labelRefs={labelRefs} />
      <PaperPlane game={game} reducedMotion={reducedMotion} started={started} planeReact={planeReact} shadows={settings.shadows} />

      <Bajla
        variant={bajla}
        reducedMotion={reducedMotion}
        scale={0.42}
        position={[1.7, 1.6, PLANE_Z - 0.6]}
      />
    </group>
  )
}

function CameraRig({ drift, reducedMotion }: { drift: boolean; reducedMotion: boolean }) {
  const cam = useThree((s) => s.camera) as PerspectiveCamera
  // Fixed 3/4 chase — just behind and slightly above the plane, looking
  // forward over the rooftops at the oncoming rings. No free orbit.
  const base = useRef<[number, number, number]>([0, 2.4, 6.4])
  useFrame((state) => {
    const [bx, by, bz] = base.current
    if (drift && !reducedMotion) {
      const t = state.clock.elapsedTime
      cam.position.set(bx + Math.sin(t * 0.16) * 0.18, by + Math.sin(t * 0.12) * 0.08, bz)
    } else {
      cam.position.set(bx, by, bz)
    }
    cam.lookAt(0, 1.0, -3)
  })
  return null
}

// Instanced low-poly rooftops + chimney pots, extruded Big Ben / dome
// silhouettes on the skyline. Vertex/material colours only.
function Skyline({ shadows }: { shadows: boolean }) {
  const roofs = useRef<InstancedMesh>(null)
  const chimneys = useRef<InstancedMesh>(null)
  const ROOF_N = 18
  const layout = useMemo(() => {
    const out: { x: number; z: number; w: number; h: number; d: number }[] = []
    for (let i = 0; i < ROOF_N; i++) {
      const row = i % 2
      const x = -9 + (i * 1.05) % 18
      const z = -9.5 - row * 1.4 - ((i * 7) % 3) * 0.4
      out.push({ x, z, w: 0.8 + ((i * 13) % 5) * 0.12, h: 0.7 + ((i * 5) % 6) * 0.22, d: 0.8 })
    }
    return out
  }, [])
  useEffect(() => {
    const rm = roofs.current
    const cm = chimneys.current
    if (rm) {
      layout.forEach((b, i) => {
        _obj.position.set(b.x, b.h / 2 - 1.2, b.z)
        _obj.rotation.set(0, 0, 0)
        _obj.scale.set(b.w, b.h, b.d)
        _obj.updateMatrix()
        rm.setMatrixAt(i, _obj.matrix)
        _col.set(palette.night).lerp(_ringBase.clone().set(palette.ink), (i % 4) / 4)
        rm.setColorAt(i, _col)
      })
      rm.instanceMatrix.needsUpdate = true
      if (rm.instanceColor) rm.instanceColor.needsUpdate = true
    }
    if (cm) {
      layout.forEach((b, i) => {
        _obj.position.set(b.x + 0.18, b.h - 1.2 + 0.18, b.z)
        _obj.rotation.set(0, 0, 0)
        _obj.scale.set(0.14, 0.3, 0.14)
        _obj.updateMatrix()
        cm.setMatrixAt(i, _obj.matrix)
      })
      cm.instanceMatrix.needsUpdate = true
    }
  }, [layout])
  return (
    <group>
      {/* Ground haze plane catching the lantern key (and one cheap shadow). */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.25, -3]} receiveShadow={shadows}>
        <planeGeometry args={[40, 28]} />
        <meshStandardMaterial color={palette.ink} roughness={1} />
      </mesh>
      <instancedMesh ref={roofs} args={[undefined, undefined, ROOF_N]} frustumCulled={false} castShadow={shadows}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.95} />
      </instancedMesh>
      <instancedMesh ref={chimneys} args={[undefined, undefined, ROOF_N]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color={palette.night} roughness={1} />
      </instancedMesh>
      {/* Big Ben tower silhouette */}
      <mesh position={[-6.5, 0.2, -10.5]}>
        <boxGeometry args={[0.7, 3.0, 0.7]} />
        <meshStandardMaterial color={palette.night} roughness={1} />
      </mesh>
      <mesh position={[-6.5, 1.9, -10.5]}>
        <coneGeometry args={[0.55, 0.9, 4]} />
        <meshStandardMaterial color={palette.night} roughness={1} />
      </mesh>
      {/* Domed silhouette (St Paul's nod) */}
      <mesh position={[5.6, -0.2, -10.8]}>
        <cylinderGeometry args={[0.9, 0.9, 1.4, 18]} />
        <meshStandardMaterial color={palette.night} roughness={1} />
      </mesh>
      <mesh position={[5.6, 0.7, -10.8]}>
        <sphereGeometry args={[0.85, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color={palette.night} roughness={1} />
      </mesh>
    </group>
  )
}

// Instanced paper lanterns glowing amber, strung above the rooftops.
function Lanterns({ flicker, highFx }: { flicker: boolean; highFx: boolean }) {
  const inst = useRef<InstancedMesh>(null)
  const light = useRef<PointLight>(null)
  const positions = useMemo(() => {
    const out: [number, number, number][] = []
    for (let i = 0; i < 10; i++) {
      const x = -7.5 + i * 1.7
      const y = 0.2 + Math.sin(i * 1.3) * 0.25
      out.push([x, y, -8.8 - (i % 2) * 0.8])
    }
    return out
  }, [])
  useEffect(() => {
    const mesh = inst.current
    if (!mesh) return
    positions.forEach((p, i) => {
      _obj.position.set(p[0], p[1], p[2])
      _obj.rotation.set(0, 0, 0)
      _obj.scale.set(1, 1.2, 1)
      _obj.updateMatrix()
      mesh.setMatrixAt(i, _obj.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
  }, [positions])
  useFrame((state) => {
    if (!flicker) return
    const f = 0.55 + Math.sin(state.clock.elapsedTime * 6.5) * 0.12 + Math.sin(state.clock.elapsedTime * 12) * 0.06
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
        <sphereGeometry args={[0.13, 12, 10]} />
        <meshStandardMaterial color={palette.lanternCore} emissive={palette.lanternAmber} emissiveIntensity={0.9} roughness={0.6} />
      </instancedMesh>
      {highFx && <pointLight ref={light} position={[0, 0.6, -8.5]} color={palette.lanternAmber} intensity={0.6} distance={14} decay={2} />}
    </group>
  )
}

// Instanced twinkling stars high in the dusk dome.
function Stars({ reducedMotion }: { reducedMotion: boolean }) {
  const inst = useRef<InstancedMesh>(null)
  const COUNT = 48
  const seeds = useMemo(() => Array.from({ length: COUNT }, (_, i) => ({
    x: (Math.sin(i * 12.9898) * 43758.5453 % 1) * 22 - 11,
    y: 2.6 + (Math.sin(i * 4.123) * 7654.321 % 1) * 3.4,
    z: -11 - ((i * 3) % 4) * 0.6,
    tw: 0.4 + (i % 5) * 0.12,
  })), [])
  useEffect(() => {
    const mesh = inst.current
    if (!mesh) return
    seeds.forEach((s, i) => {
      _obj.position.set(s.x, s.y, s.z)
      _obj.rotation.set(0, 0, 0)
      _obj.scale.setScalar(0.03 + (i % 3) * 0.01)
      _obj.updateMatrix()
      mesh.setMatrixAt(i, _obj.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
  }, [seeds])
  useFrame((state) => {
    const mesh = inst.current
    if (!mesh || reducedMotion) return
    const mat = mesh.material as { emissiveIntensity?: number }
    if (mat) mat.emissiveIntensity = 0.6 + Math.sin(state.clock.elapsedTime * 2.4) * 0.25
  })
  return (
    <instancedMesh ref={inst} args={[undefined, undefined, COUNT]} frustumCulled={false}>
      <sphereGeometry args={[1, 6, 6]} />
      <meshStandardMaterial color={palette.ember} emissive={palette.ember} emissiveIntensity={0.6} />
    </instancedMesh>
  )
}

// Instanced spark burst — pooled, fired when a ring is threaded (correct).
function SparkBurst({ game, density, reducedMotion }: { game: React.MutableRefObject<GameState>; density: number; reducedMotion: boolean }) {
  const inst = useRef<InstancedMesh>(null)
  const count = Math.max(8, Math.round(60 * density))
  const start = useRef(-1)
  const origin = useRef(new Vector3())
  const seeds = useMemo(() => Array.from({ length: count }, (_, i) => ({
    dx: Math.cos(i * 2.3994) * (0.6 + (i % 4) * 0.25),
    dy: Math.sin(i * 2.3994) * (0.6 + (i % 3) * 0.25),
    dz: ((i % 5) - 2) * 0.2,
    sp: 1.4 + (i % 5) * 0.4,
  })), [count])
  const lastVerdict = useRef<Verdict>(null)
  useFrame((state) => {
    const mesh = inst.current
    if (!mesh) return
    const g = game.current
    // Trigger on a fresh correct verdict.
    if (g.verdict === 'right' && lastVerdict.current !== 'right' && g.picked != null) {
      start.current = state.clock.elapsedTime
      const m = g.models[g.picked]
      const z = g.rings[g.picked]?.z ?? 0
      origin.current.set(m ? m.laneX : 0, m ? 1.0 + m.laneY : 1.0, z)
    }
    lastVerdict.current = g.verdict
    const t0 = start.current
    if (t0 < 0) { mesh.count = 0; return }
    const age = state.clock.elapsedTime - t0
    if (age > 0.9 || reducedMotion) { mesh.count = 0; if (reducedMotion) start.current = -1; return }
    const o = origin.current
    for (let i = 0; i < count; i++) {
      const s = seeds[i]
      const k = age * s.sp
      _obj.position.set(o.x + s.dx * k, o.y + s.dy * k, o.z + s.dz * k)
      const sc = Math.max(0, 0.07 * (1 - age / 0.9))
      _obj.scale.setScalar(sc)
      _obj.updateMatrix()
      mesh.setMatrixAt(i, _obj.matrix)
    }
    mesh.count = count
    mesh.instanceMatrix.needsUpdate = true
  })
  return (
    <instancedMesh ref={inst} args={[undefined, undefined, count]} frustumCulled={false}>
      <sphereGeometry args={[1, 6, 6]} />
      <meshStandardMaterial color={palette.lanternAmber} emissive={palette.lanternCore} emissiveIntensity={1} transparent opacity={0.9} />
    </instancedMesh>
  )
}

// The four word-rings (procedural torus, instanced) drifting from depth.
function Rings({ game, models, reducedMotion }: { game: React.MutableRefObject<GameState>; models: RingModel[]; reducedMotion: boolean }) {
  const inst = useRef<InstancedMesh>(null)
  useFrame((state) => {
    const mesh = inst.current
    if (!mesh) return
    const g = game.current
    const n = Math.min(models.length, g.rings.length)
    for (let i = 0; i < n; i++) {
      const m = models[i]
      const rt = g.rings[i]
      const eaten = g.verdict === 'right' && g.picked === i
      const x = m.laneX
      const y = 1.0 + m.laneY
      _obj.position.set(x, y, rt.z)
      // Face the camera; gentle spin on the answer-less idle for life.
      const spin = reducedMotion ? 0 : state.clock.elapsedTime * 0.6 + i
      _obj.rotation.set(0, 0, spin)
      const isHi = g.highlight === i && g.verdict == null
      const pulse = reducedMotion ? 1 : 1 + Math.sin(state.clock.elapsedTime * 3.2 + i) * 0.05
      const sc = (eaten ? 0.001 : (isHi ? 1.18 : 1)) * pulse
      _obj.scale.set(sc, sc, sc)
      _obj.updateMatrix()
      mesh.setMatrixAt(i, _obj.matrix)
      // Colour: highlight/correct/wrong/dimmed states.
      if (g.verdict === 'right' && g.picked === i) _col.set(CORRECT)
      else if (g.verdict === 'wrong' && g.picked === i) _col.set(WRONG)
      else if (g.verdict != null && m.isAnswer) _col.set(CORRECT_SOFT) // reveal the right ring
      else if (rt.dimmed) _col.set(palette.duskMid)
      else if (isHi) _col.set(palette.lanternCore)
      else _col.copy(_ringBase)
      mesh.setColorAt(i, _col)
    }
    mesh.count = n
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  })
  return (
    <instancedMesh ref={inst} args={[undefined, undefined, RING_COUNT]} frustumCulled={false}>
      <torusGeometry args={[0.62, 0.12, 12, 28]} />
      <meshStandardMaterial emissive={ACCENT} emissiveIntensity={0.45} roughness={0.4} metalness={0.2} vertexColors={false} />
    </instancedMesh>
  )
}

// Procedural folded-paper plane near the camera; auto-banks toward the chosen
// ring and noses up/down on the verdict (mirrors em-ap-plane-rise / -dive).
function PaperPlane({ game, reducedMotion, started, planeReact, shadows }: { game: React.MutableRefObject<GameState>; reducedMotion: boolean; started: boolean; planeReact: React.MutableRefObject<{ until: number; kind: Verdict }>; shadows: boolean }) {
  const root = useRef<Group>(null)
  useFrame((state) => {
    const g = root.current
    if (!g) return
    const gs = game.current
    const t = state.clock.elapsedTime
    // Resting position near the camera, centred.
    let targetX = 0
    let bankZ = 0
    let pitchX = 0
    let bob = reducedMotion ? 0 : Math.sin(t * 1.8) * 0.05
    // Bank toward the highlighted (pre-commit) or picked (post-commit) ring.
    const focus = gs.picked != null ? gs.picked : gs.highlight
    const fm = gs.models[focus]
    if (fm && !reducedMotion) {
      targetX = MathUtils.clamp(fm.laneX * 0.35, -1.0, 1.0)
      bankZ = -fm.laneX * 0.12
    }
    // Verdict reaction (rise on correct, dive on wrong) for a short beat.
    const pr = planeReact.current
    if (!reducedMotion && pr.kind && state.clock.elapsedTime * 1000 < pr.until) {
      if (pr.kind === 'right') { pitchX = -0.32; bob += 0.35 }
      else { pitchX = 0.34; bob -= 0.32 }
    }
    g.position.x += (targetX - g.position.x) * 0.08
    g.position.y += (1.0 + bob - g.position.y) * 0.12
    g.position.z = PLANE_Z
    g.rotation.z += (bankZ - g.rotation.z) * 0.1
    g.rotation.x += (pitchX - g.rotation.x) * 0.12
    g.rotation.y = Math.PI // nose pointing away from camera (into the scene)
  })
  return (
    <group ref={root} position={[0, 1.0, PLANE_Z]}>
      {/* Folded-paper plane: a flat dart from triangles, cream + accent. */}
      <mesh castShadow={shadows} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.34, 1.1, 3]} />
        <meshStandardMaterial color="#F4EFEF" roughness={0.7} flatShading metalness={0} />
      </mesh>
      {/* Centre crease keel */}
      <mesh position={[0, -0.08, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[0.18, 1, 1]}>
        <coneGeometry args={[0.34, 1.1, 3]} />
        <meshStandardMaterial color="#D4C4A8" roughness={0.8} flatShading />
      </mesh>
      {/* Accent wing tips */}
      <mesh position={[0, -0.02, 0.18]} scale={[1, 0.3, 0.5]}>
        <boxGeometry args={[0.66, 0.04, 0.5]} />
        <meshStandardMaterial color={ACCENT} emissive={ACCENT} emissiveIntensity={0.25} roughness={0.5} />
      </mesh>
    </group>
  )
}

// Projects each ring's world position to screen px and writes it onto the DOM
// nameplate transforms (English stays crisp DOM, never a 3D texture). Mirrors
// Snake3D's LabelProjector exactly.
function RingLabelProjector({ game, models, labelRefs }: { game: React.MutableRefObject<GameState>; models: RingModel[]; labelRefs: React.MutableRefObject<(HTMLDivElement | null)[]> }) {
  const cam = useThree((s) => s.camera) as PerspectiveCamera
  const size = useThree((s) => s.size)
  useFrame(() => {
    const g = game.current
    for (let i = 0; i < models.length; i++) {
      const el = labelRefs.current[i]
      if (!el) continue
      const rt = g.rings[i]
      const eaten = g.verdict === 'right' && g.picked === i
      if (!rt || eaten) { el.style.opacity = '0'; continue }
      const m = models[i]
      // Pin the nameplate just under the ring body.
      _pos.set(m.laneX, 1.0 + m.laneY - 0.95, rt.z).project(cam)
      if (_pos.z > 1) { el.style.opacity = '0'; continue }
      const x = (_pos.x * 0.5 + 0.5) * size.width
      const y = (-_pos.y * 0.5 + 0.5) * size.height
      // Fade distant (deep) rings slightly; dim hint-killed ones.
      const depth = MathUtils.clamp((rt.z - FAR_Z) / (NEAR_Z - FAR_Z), 0.35, 1)
      el.style.opacity = String(rt.dimmed ? 0.3 : depth)
      el.style.transform = `translate(-50%, -50%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`
    }
  })
  return null
}

// =========================================================================
// Airplane3D — the Game3D component (default export)
// =========================================================================
export default function Airplane3D({ puzzle, vocab, onSessionComplete, quality, reducedMotion, fullscreen }: Game3DProps) {
  const prefersReduced = usePrefersReducedMotion()
  const reduce = reducedMotion ?? prefersReduced

  const activePuzzle = useMemo<WrapperPuzzle>(() => {
    const p = puzzle as WrapperPuzzle | undefined
    if (p && Array.isArray(p.rounds) && p.rounds.length > 0) return p
    if (vocab && vocab.length > 0) {
      const gen = generateAirplane(vocabToWrapper(vocab))
      if (gen && gen.rounds.length > 0) return gen
    }
    return DEMO_PUZZLE
  }, [puzzle, vocab])
  const rounds = activePuzzle.rounds
  const total = rounds.length

  // Game ref — the live simulation read each frame by the scene.
  const game = useRef<GameState>({ rings: [], models: [], highlight: 0, verdict: null, picked: null, paused: false })
  const planeReact = useRef<{ until: number; kind: Verdict }>({ until: 0, kind: null })
  const labelRefs = useRef<(HTMLDivElement | null)[]>([])
  const startMs = useRef(performance.now())
  const fired = useRef(false)
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wrongIds = useRef<Set<string>>(new Set())

  const [idx, setIdx] = useState(0)
  const [verdict, setVerdict] = useState<Verdict>(null)
  const [picked, setPicked] = useState<number | null>(null)
  const [highlight, setHighlight] = useState(0)
  const [score, setScore] = useState<{ right: number; wrong: number }>({ right: 0, wrong: 0 })
  const [hintsUsed, setHintsUsed] = useState(0)
  const [revealedHint, setRevealedHint] = useState(false)
  const [started, setStarted] = useState(false)
  const [paused, setPaused] = useState(false)
  const [live, setLive] = useState('')

  const round: WrapperRound | undefined = rounds[idx]
  const completed = total > 0 && idx >= total
  const models = useMemo(() => (round ? buildModels(round) : []), [round?.id])
  const answerWord = round ? round.options[round.answerIndex] : ''
  const renderedPrompt = useMemo(() => maskAnswerInPrompt(round?.prompt, answerWord), [round?.prompt, answerWord])
  const bajla: 'idle' | 'flyby' | 'celebrate' = completed ? 'celebrate' : !started ? 'flyby' : 'idle'

  // Round setup — seed the ring runtimes in a depth-staggered fan and reset
  // verdict/highlight. Mirrors the 2D cloud build per round.
  useEffect(() => {
    if (!round) return
    game.current.models = models
    // With drift: stagger deep so the fan approaches over a few seconds.
    // Reduced motion: distribute statically across the visible band (no
    // drift), mirroring the 2D reduced-motion static cloud layout.
    game.current.rings = models.map((_, i) => ({
      z: reduce
        ? -2.6 + (i / Math.max(models.length - 1, 1)) * 5.0
        : FAR_Z - i * RING_SPACING,
      dimmed: false,
    }))
    game.current.highlight = 0
    game.current.verdict = null
    game.current.picked = null
    setHighlight(0)
    setVerdict(null)
    setPicked(null)
    setRevealedHint(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, round?.id, reduce])

  // Keep the game ref's view-only flags in sync with React state.
  useEffect(() => { game.current.verdict = verdict }, [verdict])
  useEffect(() => { game.current.picked = picked }, [picked])
  useEffect(() => { game.current.highlight = highlight }, [highlight])
  useEffect(() => { game.current.paused = paused }, [paused])

  // Commit a selection — identical scoring to the 2D onTapCloud.
  const commit = useCallback((optionIdx: number) => {
    if (!started) setStarted(true)
    if (paused || completed || !round || verdict !== null) return
    const right = optionIdx === round.answerIndex
    setPicked(optionIdx)
    setVerdict(right ? 'right' : 'wrong')
    game.current.picked = optionIdx
    game.current.verdict = right ? 'right' : 'wrong'
    planeReact.current = { until: performance.now() + 650, kind: right ? 'right' : 'wrong' }
    setLive(right ? 'Correct.' : `Wrong. The right one was ${round.options[round.answerIndex]}.`)
    if (right) setScore((s) => ({ ...s, right: s.right + 1 }))
    else {
      setScore((s) => ({ ...s, wrong: s.wrong + 1 }))
      wrongIds.current.add(round.id)
    }
    if (advanceTimer.current) clearTimeout(advanceTimer.current)
    advanceTimer.current = setTimeout(() => {
      setIdx((i) => i + 1)
      setVerdict(null)
      setPicked(null)
      setRevealedHint(false)
    }, VERDICT_MS)
  }, [started, paused, completed, round, verdict])

  // Drift loop — rings approach the camera. Skipped entirely under reduced
  // motion (rings sit static), and frozen during a verdict pause / when paused
  // (mirrors the 2D drift-loop guards). When a ring drifts past the plane
  // un-picked it counts as a miss and the round retries with a fresh bank —
  // exactly the 2D "drifts off the left edge → miss, round retries" rule.
  useEffect(() => {
    if (reduce || !started || paused || completed || verdict !== null) return
    let raf = 0
    let last = 0
    const speed = quality === 'low' ? DRIFT_UPS_LOW : DRIFT_UPS
    const tick = (now: number) => {
      const prev = last || now
      const dt = Math.min(0.05, (now - prev) / 1000)
      last = now
      const g = game.current
      let passed = false
      for (let i = 0; i < g.rings.length; i++) {
        g.rings[i].z += speed * dt
        if (g.rings[i].z > NEAR_Z) passed = true
      }
      if (passed) {
        // The fan slipped past the plane un-answered → miss + retry round.
        cancelAnimationFrame(raf)
        setScore((s) => ({ ...s, wrong: s.wrong + 1 }))
        if (round) wrongIds.current.add(round.id)
        setLive('Missed — the rings drifted past. Fresh approach.')
        // Re-seed the same round's fan deep again (retry, like the 2D recycle).
        g.rings = g.models.map((_, i) => ({ z: FAR_Z - i * RING_SPACING, dimmed: g.rings[i]?.dimmed ?? false }))
        return
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [reduce, started, paused, completed, verdict, round?.id, quality])

  // Fire the session result exactly once, on completion. Contract shape:
  // { correctCount, totalQuestions, durationMs, shellKey:'airplane' }, with
  // correctCount = total − distinct wrong questionIds (the 2D semantics).
  useEffect(() => {
    if (completed && !fired.current) {
      fired.current = true
      const correctCount = Math.max(0, total - wrongIds.current.size)
      setLive('Wheels down. Safe landing.')
      const result: SessionResult = {
        correctCount,
        totalQuestions: total,
        durationMs: Math.round(performance.now() - startMs.current),
        shellKey: 'airplane',
      }
      onSessionComplete?.(result)
    }
  }, [completed, total, onSessionComplete])

  // Keyboard — ←/→ (↑/↓ too) cycle the highlighted ring, Enter/Space commit;
  // H hint; S skip; Space starts when idle (mirrors the storyboard input map).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (completed) return
      const k = e.key
      if (k === 'ArrowLeft' || k === 'ArrowUp' || k === 'a' || k === 'A') {
        e.preventDefault()
        if (!started) setStarted(true)
        setHighlight((h) => (h + RING_COUNT - 1) % RING_COUNT)
      } else if (k === 'ArrowRight' || k === 'ArrowDown' || k === 'd' || k === 'D') {
        e.preventDefault()
        if (!started) setStarted(true)
        setHighlight((h) => (h + 1) % RING_COUNT)
      } else if (k === 'Enter') {
        e.preventDefault()
        if (!started) { setStarted(true); return }
        commit(highlight)
      } else if (k === ' ' || k === 'Spacebar') {
        e.preventDefault()
        if (!started) setStarted(true)
        else commit(highlight)
      } else if (k === 'h' || k === 'H') {
        e.preventDefault()
        useHint()
      } else if (k === 's' || k === 'S') {
        e.preventDefault()
        skip()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, completed, highlight, commit])

  // Cleanup timers on unmount.
  useEffect(() => () => { if (advanceTimer.current) clearTimeout(advanceTimer.current) }, [])

  // Hint — dim one wrong ring (mirrors the 2D "dims one wrong cloud"); 2 max.
  const useHint = useCallback(() => {
    if (hintsUsed >= HINT_MAX || !round || verdict !== null) return
    setHintsUsed((h) => h + 1)
    setRevealedHint(true)
    // Dim the first not-yet-dimmed wrong ring.
    const g = game.current
    for (let i = 0; i < g.rings.length; i++) {
      if (i !== round.answerIndex && !g.rings[i].dimmed) { g.rings[i].dimmed = true; break }
    }
  }, [hintsUsed, round, verdict])

  // Skip — counts as wrong and advances (verbatim 2D SkipButton behaviour).
  const skip = useCallback(() => {
    if (completed || !round) return
    if (verdict === null) wrongIds.current.add(round.id)
    if (advanceTimer.current) clearTimeout(advanceTimer.current)
    setScore((s) => (verdict === null ? { ...s, wrong: s.wrong + 1 } : s))
    setIdx((i) => i + 1)
    setVerdict(null)
    setPicked(null)
    setRevealedHint(false)
  }, [completed, round, verdict])

  const replay = useCallback(() => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current)
    fired.current = false
    startMs.current = performance.now()
    wrongIds.current = new Set()
    setScore({ right: 0, wrong: 0 })
    setHintsUsed(0)
    setRevealedHint(false)
    setVerdict(null)
    setPicked(null)
    setPaused(false)
    setLive('')
    setStarted(true)
    setHighlight(0)
    setIdx(0)
  }, [])

  const overlay = (
    <div style={{ position: 'absolute', inset: 0, fontFamily: 'var(--em-mono, ui-monospace, monospace)', color: '#EDE6FF' }}>
      <style>{`
        @keyframes ap-pop { 0%{transform:translateY(8px);opacity:0} 100%{transform:translateY(0);opacity:1} }
      `}</style>

      {/* Screen-reader live region (canvas is aria-hidden inside CityStage) */}
      <div role="status" aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{live}</div>

      {/* Prompt strip — pinned top-centre (eyebrow + gap-fill sentence) */}
      {!completed && round && (
        <div style={{
          position: 'absolute', top: 14, left: '50%', transform: 'translateX(-50%)',
          maxWidth: 'min(620px, 88%)', padding: '12px 22px', borderRadius: 14,
          background: 'linear-gradient(180deg, rgba(20,8,42,0.85) 0%, rgba(8,4,26,0.9) 100%)',
          border: `1px solid ${ACCENT}66`, backdropFilter: 'blur(4px)', textAlign: 'center',
          boxShadow: `0 18px 36px rgba(0,0,0,0.4), 0 0 18px ${ACCENT}33`,
          animation: 'ap-pop 320ms ease',
        }} key={`p-${idx}`}>
          <div style={{ fontSize: 11, letterSpacing: '0.2em', color: ACCENT, marginBottom: 4 }}>QUESTION · PYTANIE {String(idx + 1).padStart(2, '0')}</div>
          <div style={{ fontFamily: 'var(--em-decor, var(--em-mono, system-ui))', fontSize: 18, lineHeight: 1.35 }}>{renderedPrompt}</div>
          {revealedHint && <div style={{ marginTop: 6, fontSize: 12, color: ACCENT, fontStyle: 'italic' }}>💡 {round.hint}</div>}
        </div>
      )}

      {/* HUD — district nameplate + Q N/M + tally chip, top row */}
      <div style={{ position: 'absolute', top: 14, left: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <HudPill label="DISTRICT · DZIELNICA" value="Royal Mail Sky Route" />
        <HudPill label="QUESTION · PYTANIE" value={`${Math.min(idx + (completed ? 0 : 1), total)} / ${total}`} />
      </div>
      <div
        aria-label={`Score: ${score.right} hit, ${score.wrong} miss`}
        style={{
          position: 'absolute', top: 14, right: 14, display: 'inline-flex', gap: 6, alignItems: 'center',
          padding: '6px 12px', borderRadius: 999, background: 'rgba(14,10,26,0.6)',
          border: `1px solid ${ACCENT}40`, fontFamily: 'var(--em-mono, ui-monospace, monospace)', fontSize: 12, fontWeight: 700,
        }}
      >
        <span style={{ color: CORRECT }}>✓ {score.right}</span>
        <span style={{ color: 'rgba(255,255,255,0.25)' }}>·</span>
        <span style={{ color: WRONG }}>✗ {score.wrong}</span>
      </div>

      {/* Ring nameplates — DOM, positioned by the 3D RingLabelProjector.
          Each is a tappable button (≥44px) so touch/click commits a pick. */}
      {models.map((m, i) => (
        <button
          key={i}
          ref={(el) => { labelRefs.current[i] = el }}
          type="button"
          onClick={() => commit(m.optionIdx)}
          disabled={completed || verdict !== null || paused}
          aria-label={`Word ring ${String.fromCharCode(65 + i)}: ${m.text}`}
          style={{
            position: 'absolute', top: 0, left: 0, opacity: 0,
            pointerEvents: completed || verdict !== null || paused ? 'none' : 'auto',
            minHeight: 44, padding: '8px 14px', borderRadius: 12, whiteSpace: 'nowrap',
            fontFamily: 'var(--em-decor, Georgia, serif)', fontSize: 14, fontWeight: 700, letterSpacing: '0.02em',
            background: 'rgba(14,10,26,0.9)',
            color: m.isAnswer && verdict != null ? CORRECT : '#F4EFEF',
            border: `1px solid ${highlight === i && verdict == null ? palette.lanternCore : (m.isAnswer && verdict != null ? CORRECT : ACCENT + '66')}`,
            boxShadow: highlight === i && verdict == null ? `0 0 12px ${ACCENT}cc` : '0 6px 12px rgba(0,0,0,0.45)',
            cursor: 'pointer', touchAction: 'manipulation',
          }}
          onMouseEnter={() => verdict == null && setHighlight(i)}
        >
          <span style={{ fontFamily: 'var(--em-mono, monospace)', fontSize: 10, color: ACCENT, opacity: 0.7, marginRight: 8 }}>{String.fromCharCode(65 + i)}</span>
          {m.text}
        </button>
      ))}

      {/* Controls — Skip / Hint, bottom-left (≥44px tap targets) */}
      <div style={{ position: 'absolute', bottom: 14, left: 14, display: 'flex', gap: 8, pointerEvents: 'auto' }}>
        <button onClick={skip} style={btnStyle()} aria-label="Skip round">SKIP</button>
        <button onClick={useHint} disabled={hintsUsed >= HINT_MAX} style={btnStyle(hintsUsed >= HINT_MAX)} aria-label={`Hint, ${HINT_MAX - hintsUsed} left`}>HINT {HINT_MAX - hintsUsed}</button>
        <button onClick={() => started && !completed && setPaused((p) => !p)} style={btnStyle()} aria-label={paused ? 'Resume' : 'Pause'}>{paused ? '▶' : '❚❚'}</button>
      </div>

      {/* Keyboard hint — bottom-right */}
      <div style={{ position: 'absolute', bottom: 16, right: 16, fontSize: 10, letterSpacing: '0.12em', color: 'rgba(237,230,255,0.6)', textAlign: 'right', pointerEvents: 'none' }}>
        ← → CHOOSE · ENTER PICK
      </div>

      {/* Start gate */}
      {!started && !completed && (
        <button
          onClick={() => setStarted(true)}
          style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, background: 'rgba(10,5,24,0.35)', border: 'none', cursor: 'pointer', pointerEvents: 'auto', color: '#EDE6FF' }}
        >
          <div style={{ fontFamily: 'var(--em-decor, system-ui)', fontSize: 34, color: ACCENT, textShadow: `0 0 18px ${ACCENT}aa` }}>Paper Plane Post</div>
          <div style={{ fontSize: 12, letterSpacing: '0.2em', opacity: 0.85 }}>ROYAL MAIL SKY ROUTE · press / tap to start</div>
        </button>
      )}

      {/* Pause veil */}
      {paused && started && !completed && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(10,5,24,0.55)' }}>
          <div style={{ fontFamily: 'var(--em-decor, system-ui)', fontSize: 30, color: ACCENT }}>PAUSED</div>
        </div>
      )}

      {/* Completion card — "Wheels down. Safe landing." + HIT / MISS tally */}
      {completed && (
        <div role="dialog" aria-label="Paper Plane Post complete" style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, background: `radial-gradient(ellipse, ${ACCENT}22, rgba(10,5,24,0.72))`, backdropFilter: 'blur(6px)', pointerEvents: 'auto' }}>
          <div style={{ fontFamily: 'var(--em-decor, system-ui)', fontSize: 36, color: ACCENT, textShadow: `0 0 20px ${ACCENT}aa` }}>Wheels down. Safe landing.</div>
          <div style={{ fontSize: 11, letterSpacing: '0.2em', color: ACCENT }}>RUNWAY CLEAR · LĄDOWANIE UDANE</div>
          <div style={{ display: 'flex', gap: 28, alignItems: 'baseline' }}>
            <div style={{ textAlign: 'center' }}><div style={{ fontFamily: 'var(--em-decor, system-ui)', fontSize: 40, color: CORRECT }}>{score.right}</div><div style={{ fontSize: 10, letterSpacing: '0.14em', color: CORRECT }}>HIT · TRAFIONE</div></div>
            <div style={{ textAlign: 'center' }}><div style={{ fontFamily: 'var(--em-decor, system-ui)', fontSize: 40, color: WRONG }}>{score.wrong}</div><div style={{ fontSize: 10, letterSpacing: '0.14em', color: WRONG }}>MISS · CHYBIONE</div></div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <button onClick={replay} style={btnStyle()}>Try another</button>
            <button onClick={replay} style={{ ...btnStyle(), background: ACCENT, color: '#06222E', borderColor: ACCENT }}>Next district →</button>
          </div>
        </div>
      )}
    </div>
  )

  return (
    <div
      role="application"
      aria-label="Paper Plane Post — pick the word-ring that completes the sentence"
      style={{ position: 'relative', width: '100%', height: '100%', minHeight: 320 }}
    >
      <CityStage
        quality={quality}
        reducedMotion={reduce}
        fullscreen={fullscreen}
        cameraPosition={[0, 2.4, 6.4]}
        cameraFov={50}
        overlay={overlay}
      >
        <SkyScene
          game={game}
          models={models}
          reducedMotion={reduce}
          started={started}
          bajla={bajla}
          planeReact={planeReact}
          labelRefs={labelRefs}
        />
      </CityStage>
    </div>
  )
}

// ── Small DOM helpers ──────────────────────────────────────────────────────
function HudPill({ label, value, accent }: { label: string; value: string; accent?: string }) {
  const c = accent ?? ACCENT
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
    background: `rgba(125,211,252,0.16)`, border: `1px solid ${ACCENT}66`,
    color: ACCENT, fontFamily: 'var(--em-mono, ui-monospace, monospace)', fontSize: 12,
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
