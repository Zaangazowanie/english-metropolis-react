// WhackAMole3D — "Camden Pop-Up Pigeons", the Camden Market district.
//
// A three.js re-skin of the canonical 2D Whack-a-Mole shell (src/practice/
// shells/WhackAMole.tsx). The MECHANIC, scoring, round count, hint/skip rules
// and the forgiving no-fail behaviour are inherited verbatim from the 2D shell
// — this file changes only the stagecraft (subway moles in conductor caps →
// Camden pigeons popping from market crates). Same puzzle in (ArcadePuzzle),
// same session result out (SessionResult). Built on the Fluent City GameKit
// (CityStage + useGameLoop + Bajla + palette).
//
// Fidelity note (binding, from docs/game3d/storyboards/whackamole.md): timed
// visual-search MCQ. Pigeons rise from 6 crates on a staggered timer, each
// holding a DOM word-placard; tap the one whose word fits the gap-sentence
// before it ducks. Wrong taps cost a point and the pigeon dives, but the round
// NEVER ends on a wrong tap — the correct pigeon keeps popping (recycling) and
// the answer is shown on review. Timing parity mirrored EXACTLY: POP_DURATION
// 2400ms, rise 280ms, fall 260ms, bop 360ms, idle bob 1.6s, RESPAWN_INTERVAL
// 1800ms, ROUND_TIMEOUT 45000ms, FIRST_POP_DELAY 250ms, ~380ms stagger,
// advance 1200ms, wrong-slot reset 600ms, hint 2400ms; 6 crates, 3 hints.
//
// Contract compliance: single CityStage canvas (DPR clamped, aria-hidden); all
// readable English lives in the DOM overlay (projected placards via
// LabelProjector — never a 3D texture); quality tiers + reducedMotion honoured;
// full keyboard + touch input (≥64px tap targets); procedural geometry +
// vertex/instance colours only (no GLB, no textures, no external URLs, no new
// deps); allocation-free render loop; instanced repeats.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Color, MathUtils, Object3D, Vector3 } from 'three'
import type { Group, InstancedMesh, Mesh, PerspectiveCamera, PointLight } from 'three'
import { Bajla, CityStage, palette, useStageQuality } from './kit'
import type { Game3DProps, SessionResult, Vocab3DItem } from './types'
import { generateWhackAMolePuzzle } from '../generators/generateWhackAMole'
import type { ArcadeInput, ArcadePuzzle } from '../generators/generateArcade'

// ── Canonical layout + timing (identical to the 2D shell) ─────────────────
const HOLES = 6
const POP_DURATION = 2400 // ms a pigeon stays up (time to read + tap)
const ROUND_TIMEOUT = 45000 // ms before round auto-fails (recycling keeps spawning)
const RESPAWN_INTERVAL = 1800 // ms between consecutive re-pops once recycling
const FIRST_POP_DELAY = 250 // ms before the very first pigeon rises after START
const STAGGER_MS = 380 // ms between staggered first-wave pops
const RISE_MS = 280
const FALL_MS = 260
const BOP_MS = 360
const ADVANCE_MS = 1200 // ms after a correct bop before the round advances
const WRONG_RESET_MS = 600 // ms before a wrong-tapped crate resets to 'down'
const WRONG_CLEAR_MS = 800 // ms a 'wrong' feedback flash holds
const HINT_MAX = 3
const HINT_MS = 2400
const BAJLA_FLINCH_MS = 480

// Camden palette accents (mirror the storyboard: leaf-green correct, rose wrong)
const LEAF = palette.leaf // #7fb069 correct
const ROSE = '#FB7185' // wrong / fluster
const AMBER = palette.lanternAmber // hint / warm key

// ── World mapping — a 3×2 grid of crates laid out on the cobbled lane in the
// XZ plane. Smaller row index = further from camera. Two columns of three? No:
// 3 across, 2 deep, exactly like the 2D `holePositions` 3×2 grid. ──────────
const GRID_COLS = 3
const GRID_ROWS = 2
const SPACING_X = 1.5
const SPACING_Z = 1.55
const crateX = (i: number): number => ((i % GRID_COLS) - (GRID_COLS - 1) / 2) * SPACING_X
const crateZ = (i: number): number => (Math.floor(i / GRID_COLS) - (GRID_ROWS - 1) / 2) * SPACING_Z

type MoleState = 'down' | 'rising' | 'up' | 'falling' | 'whacked' | 'missed'
interface MoleSlot {
  holeIdx: number
  word: string
  isAnswer: boolean
  state: MoleState
  spawnedAt: number
}

// ── Built-in demo puzzle — copied verbatim from the 2D shell so anonymous
// home-page play behaves identically (Game3DProps requires a demo when no
// puzzle / vocab is supplied). 5 rounds. ──────────────────────────────────
const DEMO_PUZZLE: ArcadePuzzle = {
  rounds: [
    { id: 'm1', prompt: 'Underground transit train', options: ['subway', 'bus', 'taxi', 'tram'], answerIndex: 0, hint: 'Runs through tunnels below the city.', hint_pl: 'metro' },
    { id: 'm2', prompt: 'Where you wait to board the train', options: ['platform', 'lobby', 'aisle', 'rooftop'], answerIndex: 0, hint: 'A long, raised walkway alongside the tracks.', hint_pl: 'peron' },
    { id: 'm3', prompt: 'A small ticket machine', options: ['kiosk', 'turnstile', 'cellar', 'spire'], answerIndex: 1, hint: 'Bars rotate after you tap your ticket.', hint_pl: 'kołowrót, bramka' },
    { id: 'm4', prompt: 'Stairway leading down to the trains', options: ['attic', 'staircase', 'cupola', 'balcony'], answerIndex: 1, hint: 'Steps going down. Often tiled.', hint_pl: 'schody' },
    { id: 'm5', prompt: 'Map of the train lines', options: ['ledger', 'menu', 'diagram', 'scroll'], answerIndex: 2, hint: 'Coloured lines, named stations.', hint_pl: 'schemat' },
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

// ── Allocation-free scratch objects (single canvas, single game instance) ─
const _pos = new Vector3()
const _obj = new Object3D()
const _col = new Color()
const _colCrate = new Color(palette.brass)

// =========================================================================
// Scene (inside the Canvas — reads live mole state each frame via the ref)
// =========================================================================
interface SceneProps {
  moles: React.MutableRefObject<MoleSlot[]>
  version: number
  hintHole: number | null
  feedback: 'correct' | 'wrong' | null
  reducedMotion: boolean
  bajla: 'idle' | 'flyby' | 'celebrate'
  bajlaFlinch: boolean
  labelRefs: React.MutableRefObject<(HTMLDivElement | null)[]>
}

function CamdenScene({ moles, version, hintHole, feedback, reducedMotion, bajla, bajlaFlinch, labelRefs }: SceneProps) {
  const { settings, tier } = useStageQuality()
  const highFx = tier === 'high' && !reducedMotion

  return (
    <group>
      <CameraRig drift={highFx} reducedMotion={reducedMotion} />
      {tier === 'high' && <fog attach="fog" args={[palette.duskHorizon, 11, 24]} />}

      <Lane shadows={settings.shadows} />
      <Crates shadows={settings.shadows} />
      <Skyline />
      <Lanterns flicker={tier !== 'low' && !reducedMotion} highFx={highFx} />
      {settings.particles > 0 && <Embers density={settings.particles} reducedMotion={reducedMotion} />}

      <Pigeons moles={moles} version={version} hintHole={hintHole} feedback={feedback} reducedMotion={reducedMotion} />
      <PlacardProjector moles={moles} labelRefs={labelRefs} />

      <Bajla
        variant={bajla}
        reducedMotion={reducedMotion}
        scale={0.5}
        position={[bajlaFlinch ? 1.7 : 1.55, 2.0, -SPACING_Z - 0.6]}
      />
    </group>
  )
}

function CameraRig({ drift, reducedMotion }: { drift: boolean; reducedMotion: boolean }) {
  const cam = useThree((s) => s.camera) as PerspectiveCamera
  const base = useRef<[number, number, number]>([0, 4.8, 5.4])
  useFrame((state) => {
    const [bx, by, bz] = base.current
    if (drift && !reducedMotion) {
      const t = state.clock.elapsedTime
      cam.position.set(bx + Math.sin(t * 0.16) * 0.28, by + Math.sin(t * 0.12) * 0.1, bz + Math.cos(t * 0.15) * 0.16)
    } else {
      cam.position.set(bx, by, bz)
    }
    cam.lookAt(0, 0.4, 0)
  })
  return null
}

function Lane({ shadows }: { shadows: boolean }) {
  return (
    <group>
      {/* Cobbled lane slab */}
      <mesh position={[0, -0.2, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow={shadows}>
        <planeGeometry args={[GRID_COLS * SPACING_X + 2.4, GRID_ROWS * SPACING_Z + 3.0]} />
        <meshStandardMaterial color={palette.ink} roughness={1} />
      </mesh>
      {/* Warm under-glow band near the front (lantern spill on cobbles) */}
      <mesh position={[0, -0.19, SPACING_Z + 0.6]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[GRID_COLS * SPACING_X + 2.0, 1.4]} />
        <meshStandardMaterial color={palette.lanternAmber} transparent opacity={0.06} roughness={1} />
      </mesh>
    </group>
  )
}

// Six timber crates with a dark opening on top (the pigeon rises from inside).
// Instanced bodies + a separate instanced "awning" strip above the back row.
function Crates({ shadows }: { shadows: boolean }) {
  const bodies = useRef<InstancedMesh>(null)
  const rims = useRef<InstancedMesh>(null)
  useEffect(() => {
    const b = bodies.current
    const r = rims.current
    for (let i = 0; i < HOLES; i++) {
      _obj.position.set(crateX(i), -0.05, crateZ(i))
      _obj.rotation.set(0, 0, 0)
      _obj.scale.set(1, 1, 1)
      _obj.updateMatrix()
      if (b) {
        b.setMatrixAt(i, _obj.matrix)
        _col.copy(_colCrate).offsetHSL(0, 0, ((i % 2) - 0.5) * 0.05)
        b.setColorAt(i, _col)
      }
      if (r) {
        _obj.position.set(crateX(i), 0.27, crateZ(i))
        _obj.updateMatrix()
        r.setMatrixAt(i, _obj.matrix)
      }
    }
    if (b) {
      b.instanceMatrix.needsUpdate = true
      if (b.instanceColor) b.instanceColor.needsUpdate = true
    }
    if (r) r.instanceMatrix.needsUpdate = true
  }, [])
  return (
    <group>
      {/* Crate bodies */}
      <instancedMesh ref={bodies} args={[undefined, undefined, HOLES]} frustumCulled={false} castShadow={shadows} receiveShadow={shadows}>
        <boxGeometry args={[0.92, 0.6, 0.92]} />
        <meshStandardMaterial roughness={0.85} flatShading />
      </instancedMesh>
      {/* Dark crate openings (vertex-baked AO so depth reads w/o realtime shadow) */}
      <instancedMesh ref={rims} args={[undefined, undefined, HOLES]} frustumCulled={false}>
        <boxGeometry args={[0.72, 0.06, 0.72]} />
        <meshStandardMaterial color={palette.night} roughness={1} />
      </instancedMesh>
    </group>
  )
}

// Distant Camden chimney / lock-bridge silhouette + canal band behind the stalls.
function Skyline() {
  const z = -GRID_ROWS * SPACING_Z - 2.2
  return (
    <group position={[0, 0, z]}>
      {/* Canal band (dark water catching a sliver of dusk) */}
      <mesh position={[0, -0.16, 1.1]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[GRID_COLS * SPACING_X + 3.0, 1.0]} />
        <meshStandardMaterial color={palette.duskTop} roughness={0.5} metalness={0.2} emissive={palette.duskHorizon} emissiveIntensity={0.12} />
      </mesh>
      {/* Chimney */}
      <mesh position={[-2.0, 1.0, 0]}>
        <boxGeometry args={[0.4, 2.4, 0.4]} />
        <meshStandardMaterial color={palette.night} roughness={1} />
      </mesh>
      {/* Lock-bridge slab */}
      <mesh position={[1.4, 0.7, 0]}>
        <boxGeometry args={[2.6, 0.5, 0.3]} />
        <meshStandardMaterial color={palette.night} roughness={1} />
      </mesh>
      <mesh position={[0.5, 0.45, 0]}>
        <boxGeometry args={[0.18, 0.6, 0.3]} />
        <meshStandardMaterial color={palette.night} roughness={1} />
      </mesh>
      <mesh position={[2.3, 0.45, 0]}>
        <boxGeometry args={[0.18, 0.6, 0.3]} />
        <meshStandardMaterial color={palette.night} roughness={1} />
      </mesh>
    </group>
  )
}

// Strings of paper lanterns swagging overhead — instanced glow spheres + one
// cheap warm point light on high.
function Lanterns({ flicker, highFx }: { flicker: boolean; highFx: boolean }) {
  const inst = useRef<InstancedMesh>(null)
  const light = useRef<PointLight>(null)
  const positions = useMemo(() => {
    const out: [number, number, number][] = []
    const span = GRID_COLS * SPACING_X + 1.4
    const PER = 7
    for (let i = 0; i < PER; i++) {
      const x = -span / 2 + (i / (PER - 1)) * span
      // gentle catenary sag
      const sag = Math.sin((i / (PER - 1)) * Math.PI) * 0.35
      out.push([x, 2.5 - sag, SPACING_Z + 0.4])
      out.push([x, 2.7 - sag, -SPACING_Z - 0.4])
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
    const f = 0.55 + Math.sin(state.clock.elapsedTime * 6.5) * 0.12 + Math.sin(state.clock.elapsedTime * 12.0) * 0.06
    const mesh = inst.current
    if (mesh) {
      const mat = mesh.material as { emissiveIntensity?: number }
      if (mat) mat.emissiveIntensity = 0.8 + f * 0.4
    }
    if (light.current) light.current.intensity = 0.55 + f * 0.45
  })
  return (
    <group>
      <instancedMesh ref={inst} args={[undefined, undefined, positions.length]} frustumCulled={false}>
        <sphereGeometry args={[0.11, 12, 10]} />
        <meshStandardMaterial color={palette.lanternCore} emissive={palette.lanternAmber} emissiveIntensity={0.9} roughness={0.6} />
      </instancedMesh>
      {highFx && <pointLight ref={light} position={[0, 2.4, 0]} color={palette.lanternAmber} intensity={0.7} distance={11} decay={2} />}
    </group>
  )
}

function Embers({ density, reducedMotion }: { density: number; reducedMotion: boolean }) {
  const inst = useRef<InstancedMesh>(null)
  const count = Math.max(0, Math.round(28 * density))
  const spanX = GRID_COLS * SPACING_X + 1.5
  const spanZ = GRID_ROWS * SPACING_Z + 1.5
  const seeds = useMemo(() => Array.from({ length: count }, (_, i) => ({
    x: ((Math.sin(i * 12.9898) * 43758.5453) % 1) * spanX - spanX / 2,
    z: ((Math.sin(i * 78.233) * 12543.123) % 1) * spanZ - spanZ / 2,
    speed: 0.16 + (i % 5) * 0.035,
    phase: (i / Math.max(1, count)) * 3,
  })), [count, spanX, spanZ])
  useFrame((state) => {
    const mesh = inst.current
    if (!mesh || count === 0) return
    const t = reducedMotion ? 0 : state.clock.elapsedTime
    for (let i = 0; i < count; i++) {
      const s = seeds[i]
      const y = ((t * s.speed + s.phase) % 2.6) + 0.1
      _obj.position.set(s.x + Math.sin(t * 0.5 + i) * 0.1, y, s.z)
      const sc = 0.016 + (i % 3) * 0.006
      _obj.scale.set(sc, sc, sc)
      _obj.rotation.set(0, 0, 0)
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

// Six pooled pigeons, one per crate. Each frame we read the live mole ref and
// drive each pigeon's Y offset / scale from its state + spawnedAt timestamp
// (rise/fall/bop tweens), or snap to discrete up/down under reducedMotion.
// Allocation-free: every pigeon group is a stable ref; no per-frame `new`.
function Pigeons({ moles, version, hintHole, feedback, reducedMotion }: {
  moles: React.MutableRefObject<MoleSlot[]>
  version: number
  hintHole: number | null
  feedback: 'correct' | 'wrong' | null
  reducedMotion: boolean
}) {
  const groups = useRef<(Group | null)[]>([])
  const bodies = useRef<(Mesh | null)[]>([])
  // `version` forces a re-render when placements change so colours (answer
  // glow) refresh; the per-frame motion reads the ref directly.
  void version

  useFrame((state) => {
    const arr = moles.current
    const now = performance.now()
    for (let i = 0; i < HOLES; i++) {
      const g = groups.current[i]
      if (!g) continue
      // Find the slot currently assigned to hole i (if any) that is not 'down'.
      const slot = arr.find((m) => m.holeIdx === i && m.state !== 'down')
      if (!slot) {
        g.visible = false
        continue
      }
      g.visible = true
      g.position.set(crateX(i), 0, crateZ(i))
      const dt = now - slot.spawnedAt
      let yOff = -0.55 // hidden inside the crate
      let sx = 1
      let sy = 1

      if (reducedMotion) {
        // Discrete pop — appear fully up or hidden; no tweening.
        yOff = (slot.state === 'whacked' || slot.state === 'falling' || slot.state === 'missed') ? -0.55 : 0
      } else if (slot.state === 'rising') {
        const k = MathUtils.clamp(dt / RISE_MS, 0, 1)
        yOff = -0.55 + k * 0.55
        sy = 0.8 + 0.2 * k + (k > 0.7 ? Math.sin((k - 0.7) / 0.3 * Math.PI) * 0.08 : 0)
      } else if (slot.state === 'falling') {
        const k = MathUtils.clamp(dt / FALL_MS, 0, 1)
        yOff = -k * 0.55
        sy = 1 - 0.3 * k
      } else if (slot.state === 'whacked') {
        const k = MathUtils.clamp(dt / BOP_MS, 0, 1)
        yOff = -k * 0.7
        sy = 1 - 0.6 * k
        sx = 1 + 0.4 * k
      } else if (slot.state === 'missed') {
        yOff = -0.55
      } else {
        // up — gentle idle bob (1.6s period)
        yOff = Math.sin(state.clock.elapsedTime * (Math.PI * 2 / 1.6)) * 0.04
      }

      g.position.y = yOff
      g.scale.set(sx, sy, 1)

      // Tint the body: answer pigeon gets a leaf hint when its crate is hinted;
      // correct/wrong feedback briefly flashes the active pigeon.
      const body = bodies.current[i]
      if (body) {
        const mat = body.material as { emissive?: Color; emissiveIntensity?: number }
        if (mat && mat.emissive) {
          if (hintHole === i && slot.isAnswer) {
            mat.emissive.set(AMBER)
            mat.emissiveIntensity = 0.6
          } else if (feedback === 'correct' && slot.state === 'whacked' && slot.isAnswer) {
            mat.emissive.set(LEAF)
            mat.emissiveIntensity = 0.7
          } else if (feedback === 'wrong' && slot.state === 'whacked' && !slot.isAnswer) {
            mat.emissive.set(ROSE)
            mat.emissiveIntensity = 0.6
          } else {
            mat.emissive.set('#000000')
            mat.emissiveIntensity = 0
          }
        }
      }
    }
  })

  return (
    <group>
      {Array.from({ length: HOLES }, (_, i) => (
        <group key={i} ref={(el) => { groups.current[i] = el }} visible={false}>
          {/* Body */}
          <mesh ref={(el) => { bodies.current[i] = el }} position={[0, 0.34, 0]} castShadow scale={[1, 1.1, 1]}>
            <sphereGeometry args={[0.26, 14, 12]} />
            <meshStandardMaterial color="#6b7a90" roughness={0.85} flatShading />
          </mesh>
          {/* Head */}
          <mesh position={[0, 0.62, 0.06]} castShadow>
            <sphereGeometry args={[0.17, 14, 12]} />
            <meshStandardMaterial color="#7c8aa0" roughness={0.85} flatShading />
          </mesh>
          {/* Iridescent neck collar */}
          <mesh position={[0, 0.5, 0.05]} scale={[1, 0.5, 1]}>
            <sphereGeometry args={[0.2, 14, 10]} />
            <meshStandardMaterial color={palette.bajlaIris} roughness={0.5} metalness={0.3} emissive={palette.bajlaIris} emissiveIntensity={0.12} flatShading />
          </mesh>
          {/* Eyes */}
          <mesh position={[-0.07, 0.66, 0.18]}><sphereGeometry args={[0.035, 8, 8]} /><meshStandardMaterial color={palette.night} /></mesh>
          <mesh position={[0.07, 0.66, 0.18]}><sphereGeometry args={[0.035, 8, 8]} /><meshStandardMaterial color={palette.night} /></mesh>
          {/* Beak (holds the placard) */}
          <mesh position={[0, 0.6, 0.24]} rotation={[Math.PI / 2, 0, 0]}>
            <coneGeometry args={[0.05, 0.16, 8]} />
            <meshStandardMaterial color={palette.beak} roughness={0.5} flatShading />
          </mesh>
          {/* Little word-sign held in the beak (blank board — text is DOM) */}
          <mesh position={[0, 0.5, 0.34]} rotation={[0.25, 0, 0]}>
            <boxGeometry args={[0.34, 0.18, 0.02]} />
            <meshStandardMaterial color={palette.ember} roughness={0.7} />
          </mesh>
          {/* Tail */}
          <mesh position={[0, 0.3, -0.24]} rotation={[-0.6, 0, 0]} scale={[1, 1, 0.5]}>
            <coneGeometry args={[0.16, 0.3, 6]} />
            <meshStandardMaterial color="#56657d" roughness={0.9} flatShading />
          </mesh>
        </group>
      ))}
    </group>
  )
}

// Projects each crate's world position to screen px and writes it onto the DOM
// placard transforms (English stays crisp DOM, never a 3D texture). One DOM
// layer positioned from projected crate coords — not 6 portals (risk #2).
function PlacardProjector({ moles, labelRefs }: { moles: React.MutableRefObject<MoleSlot[]>; labelRefs: React.MutableRefObject<(HTMLDivElement | null)[]> }) {
  const cam = useThree((s) => s.camera) as PerspectiveCamera
  const size = useThree((s) => s.size)
  useFrame(() => {
    const arr = moles.current
    for (let i = 0; i < HOLES; i++) {
      const el = labelRefs.current[i]
      if (!el) continue
      const slot = arr.find((m) => m.holeIdx === i && m.state !== 'down')
      const visible = !!slot && (slot.state === 'rising' || slot.state === 'up')
      if (!visible) { el.style.opacity = '0'; el.style.pointerEvents = 'none'; continue }
      _pos.set(crateX(i), 0.95, crateZ(i)).project(cam)
      if (_pos.z > 1) { el.style.opacity = '0'; el.style.pointerEvents = 'none'; continue }
      const x = (_pos.x * 0.5 + 0.5) * size.width
      const y = (-_pos.y * 0.5 + 0.5) * size.height
      el.style.opacity = '1'
      el.style.pointerEvents = 'auto'
      el.style.transform = `translate(-50%, -50%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`
      el.setAttribute('data-word', slot!.word)
      el.setAttribute('data-answer', slot!.isAnswer ? '1' : '0')
    }
  })
  return null
}

// =========================================================================
// WhackAMole3D — the Game3D component (default export)
// =========================================================================
export default function WhackAMole3D({ puzzle, vocab, onSessionComplete, quality, reducedMotion, fullscreen }: Game3DProps) {
  const prefersReduced = usePrefersReducedMotion()
  const reduce = reducedMotion ?? prefersReduced

  const activePuzzle = useMemo<ArcadePuzzle>(() => {
    const p = puzzle as ArcadePuzzle | undefined
    if (p && Array.isArray(p.rounds) && p.rounds.length > 0) return p
    if (vocab && vocab.length > 0) {
      const gen = generateWhackAMolePuzzle(vocabToArcade(vocab), { seed: 7 })
      if (gen && gen.rounds.length > 0) return gen
    }
    return DEMO_PUZZLE
  }, [puzzle, vocab])
  const rounds = activePuzzle.rounds
  const total = rounds.length

  // Live mole state lives in a ref (read allocation-free in the render loop);
  // a `version` counter bumps React when placements change so the overlay /
  // colours re-render. Mirrors the 2D shell's `moles` state machine exactly.
  const moles = useRef<MoleSlot[]>([])
  const [version, setVersion] = useState(0)
  const bump = useCallback(() => setVersion((v) => v + 1), [])
  const labelRefs = useRef<(HTMLDivElement | null)[]>([])

  const startMs = useRef(performance.now())
  const fired = useRef(false)
  const roundTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const moleTimers = useRef<ReturnType<typeof setTimeout>[]>([])
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const flinchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [roundIdx, setRoundIdx] = useState(0)
  const [solved, setSolved] = useState<boolean[]>(() => rounds.map(() => false))
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null)
  const [hintsUsed, setHintsUsed] = useState(0)
  const [hintHole, setHintHole] = useState<number | null>(null)
  const [missCount, setMissCount] = useState(0)
  const [bajlaFlinch, setBajlaFlinch] = useState(false)
  const [started, setStarted] = useState(false)
  const [live, setLive] = useState('')

  const cur = rounds[roundIdx]
  const completed = total > 0 && solved.every(Boolean)
  const correctCount = solved.filter(Boolean).length
  const answerWord = cur ? cur.options[cur.answerIndex] : ''
  const renderedPrompt = useMemo(() => maskAnswerInPrompt(cur?.prompt, answerWord), [cur?.prompt, answerWord])
  const bajla: 'idle' | 'flyby' | 'celebrate' = completed ? 'celebrate' : !started ? 'flyby' : 'idle'

  const clearTimers = useCallback(() => {
    if (roundTimer.current) { clearTimeout(roundTimer.current); roundTimer.current = null }
    moleTimers.current.forEach((t) => clearTimeout(t))
    moleTimers.current = []
  }, [])

  // popOneMole — a single pigeon's rise → up → fall → down lifecycle, then
  // auto-clears its 'down' state so the recycling loop can re-pop the slot.
  // Mirrors the 2D shell's popOneMole timings (rise 280, up 2400, fall 260).
  const popOneMole = useCallback((slotIdx: number) => {
    const arr = moles.current
    const s = arr[slotIdx]
    if (!s || s.state !== 'down') return
    s.state = 'rising'
    s.spawnedAt = performance.now()
    bump()
    const upT = setTimeout(() => {
      const m = moles.current[slotIdx]
      if (m && m.state === 'rising') { m.state = 'up'; bump() }
    }, RISE_MS)
    moleTimers.current.push(upT)

    const downT = setTimeout(() => {
      const m = moles.current[slotIdx]
      if (!m || m.state === 'whacked') return
      m.state = 'falling'
      m.spawnedAt = performance.now()
      bump()
      const hideT = setTimeout(() => {
        const mm = moles.current[slotIdx]
        if (mm && mm.state === 'falling') { mm.state = 'down'; bump() }
      }, FALL_MS)
      moleTimers.current.push(hideT)
    }, POP_DURATION)
    moleTimers.current.push(downT)
  }, [bump])

  // spawnMoles — build this round's placements (one option per crate, answer
  // included, in distinct shuffled holes; 2 crates stay empty), then drive the
  // staggered first wave + recycling interval + round fail-safe. Mirror of the
  // 2D shell's spawnMoles, EXACTLY.
  const spawnMoles = useCallback(() => {
    clearTimers()
    if (!cur) return
    const opts = cur.options
    const indices = Array.from({ length: HOLES }, (_, i) => i)
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[indices[i], indices[j]] = [indices[j], indices[i]]
    }
    const placements: MoleSlot[] = opts.map((opt, oi) => ({
      holeIdx: indices[oi % HOLES],
      word: opt,
      isAnswer: oi === cur.answerIndex,
      state: 'down',
      spawnedAt: 0,
    }))
    moles.current = placements
    setFeedback(null)
    setMissCount(0)
    bump()

    // Initial staggered wave.
    placements.forEach((_, i) => {
      const popDelay = FIRST_POP_DELAY + i * STAGGER_MS + Math.random() * 180
      const popT = setTimeout(() => popOneMole(i), popDelay)
      moleTimers.current.push(popT)
    })

    // Recycling interval — re-pop a 'down' slot into a free hole every
    // RESPAWN_INTERVAL ms until the round resolves (keeps the lane alive after
    // the first wave ducks). Mirrors the 2D recycle tick.
    const initialWaveLastDelay = FIRST_POP_DELAY + (placements.length - 1) * STAGGER_MS + 180
    const recycleStart = initialWaveLastDelay + POP_DURATION + 400
    const recycleT = setTimeout(() => {
      const tick = (): void => {
        if (moleTimers.current.length === 0 && roundTimer.current === null) return
        const arr = moles.current
        const downIdx = arr.findIndex((s) => s.state === 'down')
        if (downIdx >= 0) {
          const occupied = new Set(arr.filter((s) => s.state !== 'down').map((s) => s.holeIdx))
          const free = Array.from({ length: HOLES }, (_, h) => h).filter((h) => !occupied.has(h))
          const newHole = free.length > 0 ? free[Math.floor(Math.random() * free.length)] : arr[downIdx].holeIdx
          arr[downIdx].holeIdx = newHole
          bump()
          const popT = setTimeout(() => popOneMole(downIdx), 0)
          moleTimers.current.push(popT)
        }
        const nextT = setTimeout(tick, RESPAWN_INTERVAL)
        moleTimers.current.push(nextT)
      }
      tick()
    }, recycleStart)
    moleTimers.current.push(recycleT)

    // Round-level fail-safe (very long — recycling normally keeps pigeons
    // popping until the student answers or skips).
    roundTimer.current = setTimeout(() => {
      const arr = moles.current
      arr.forEach((s) => { if (s.state === 'up' || s.state === 'rising') s.state = 'missed' })
      bump()
      setBajlaFlinch(true)
      if (flinchTimer.current) clearTimeout(flinchTimer.current)
      flinchTimer.current = setTimeout(() => setBajlaFlinch(false), BAJLA_FLINCH_MS)
    }, ROUND_TIMEOUT)
  }, [cur, clearTimers, popOneMole, bump])

  // Spawn when the round changes — but only after START (first-impression fix,
  // mirrors the 2D `started` gate). Deliberately depends only on the real state
  // transitions (round change or START), like the 2D shell.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!started) return
    spawnMoles()
    return clearTimers
  }, [roundIdx, started])

  useEffect(() => () => {
    clearTimers()
    if (advanceTimer.current) clearTimeout(advanceTimer.current)
    if (hintTimer.current) clearTimeout(hintTimer.current)
    if (flinchTimer.current) clearTimeout(flinchTimer.current)
  }, [clearTimers])

  // Fire the session result exactly once, on completion.
  useEffect(() => {
    if (completed && !fired.current) {
      fired.current = true
      setLive('The market quiets — every sign is filled.')
      const result: SessionResult = {
        correctCount,
        totalQuestions: total,
        durationMs: Math.round(performance.now() - startMs.current),
        shellKey: 'whackamole',
      }
      onSessionComplete?.(result)
    }
  }, [completed, correctCount, total, onSessionComplete])

  // whack — the core resolution. Identical scoring/feedback to the 2D shell:
  // correct → solve round, advance after 1200ms; wrong → miss+1, Bajla flinch,
  // clear flash after 800ms, reset that crate to 'down' after 600ms so the
  // recycling loop can re-pop it. A wrong tap NEVER ends the round.
  const whack = useCallback((holeIdx: number) => {
    const arr = moles.current
    const slotIdx = arr.findIndex((m) => m.holeIdx === holeIdx && (m.state === 'up' || m.state === 'rising'))
    if (slotIdx < 0) return
    const m = arr[slotIdx]
    const isCorrect = m.isAnswer
    m.state = 'whacked'
    m.spawnedAt = performance.now()
    bump()
    if (isCorrect) {
      setFeedback('correct')
      setSolved((prev) => prev.map((v, i) => (i === roundIdx ? true : v)))
      setLive('Correct — the pigeon tips its head and coos.')
      clearTimers()
      if (advanceTimer.current) clearTimeout(advanceTimer.current)
      advanceTimer.current = setTimeout(() => {
        setRoundIdx((i) => (i + 1 < total ? i + 1 : i))
      }, ADVANCE_MS)
    } else {
      setFeedback('wrong')
      setMissCount((c) => c + 1)
      setLive('Wrong — the right pigeon is still up.')
      setBajlaFlinch(true)
      if (flinchTimer.current) clearTimeout(flinchTimer.current)
      flinchTimer.current = setTimeout(() => setBajlaFlinch(false), BAJLA_FLINCH_MS)
      setTimeout(() => setFeedback(null), WRONG_CLEAR_MS)
      // Reset the wrong-tapped crate to 'down' so recycling can re-pop it.
      setTimeout(() => {
        const mm = moles.current[slotIdx]
        if (mm && mm.state === 'whacked') { mm.state = 'down'; bump() }
      }, WRONG_RESET_MS)
    }
  }, [roundIdx, total, clearTimers, bump])

  const useHint = useCallback(() => {
    if (hintsUsed >= HINT_MAX) return
    const answer = moles.current.find((m) => m.isAnswer)
    if (!answer) return
    setHintHole(answer.holeIdx)
    setHintsUsed((h) => h + 1)
    setLive('Bajla flutters toward the right crate.')
    if (hintTimer.current) clearTimeout(hintTimer.current)
    hintTimer.current = setTimeout(() => setHintHole(null), HINT_MS)
  }, [hintsUsed])

  const skip = useCallback(() => {
    clearTimers()
    setRoundIdx((i) => (i + 1 < total ? i + 1 : i))
  }, [total, clearTimers])

  const replay = useCallback(() => {
    clearTimers()
    if (advanceTimer.current) clearTimeout(advanceTimer.current)
    fired.current = false
    startMs.current = performance.now()
    moles.current = []
    setSolved(rounds.map(() => false))
    setFeedback(null)
    setHintsUsed(0)
    setHintHole(null)
    setMissCount(0)
    setBajlaFlinch(false)
    setLive('')
    setRoundIdx(0)
    setStarted(true)
    bump()
  }, [rounds, clearTimers, bump])

  // Keyboard — number keys 1–6 map to the 3×2 crates; arrows move a focus
  // reticle; Enter/Space bops the focused crate's pigeon (or starts). Focus
  // auto-snaps to a risen pigeon when one exists. Mirrors the storyboard map.
  const [focusHole, setFocusHole] = useState(0)
  const focusRef = useRef(0)
  focusRef.current = focusHole
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!started && (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar')) {
        e.preventDefault(); setStarted(true); return
      }
      if (e.key >= '1' && e.key <= '6') {
        e.preventDefault()
        const h = parseInt(e.key, 10) - 1
        setFocusHole(h)
        whack(h)
        return
      }
      if (e.key === 'h' || e.key === 'H') { e.preventDefault(); useHint(); return }
      if (e.key === 's' || e.key === 'S') { e.preventDefault(); skip(); return }
      const f = focusRef.current
      if (e.key === 'ArrowLeft') { e.preventDefault(); setFocusHole((f % GRID_COLS === 0) ? f + GRID_COLS - 1 : f - 1) }
      else if (e.key === 'ArrowRight') { e.preventDefault(); setFocusHole((f % GRID_COLS === GRID_COLS - 1) ? f - GRID_COLS + 1 : f + 1) }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setFocusHole((f - GRID_COLS + HOLES) % HOLES) }
      else if (e.key === 'ArrowDown') { e.preventDefault(); setFocusHole((f + GRID_COLS) % HOLES) }
      else if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); whack(f) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [started, whack, useHint, skip])

  // Auto-snap focus to a risen pigeon when one exists (storyboard input map).
  useEffect(() => {
    if (!started) return
    const risen = moles.current.find((m) => m.state === 'up' || m.state === 'rising')
    if (risen) setFocusHole(risen.holeIdx)
  }, [version, started])

  const overlay = (
    <div style={{ position: 'absolute', inset: 0, fontFamily: 'var(--em-mono, ui-monospace, monospace)', color: '#EDE6FF' }}>
      <style>{`
        @keyframes wm-pop { 0%{transform:translateY(8px);opacity:0} 100%{transform:translateY(0);opacity:1} }
        @keyframes wm-hint { 0%,100%{box-shadow:0 0 0 0 ${AMBER}00} 50%{box-shadow:0 0 0 3px ${AMBER}cc} }
      `}</style>

      {/* Screen-reader live region (canvas is aria-hidden inside CityStage) */}
      <div role="status" aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{live}</div>

      {/* Prompt sign — pinned top-centre (masked gap-fill, RND NN badge) */}
      {cur && (
        <div style={{
          position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
          maxWidth: 'min(620px, 88%)', padding: '10px 16px', borderRadius: 12,
          background: `linear-gradient(90deg, ${LEAF}28, rgba(20,16,42,0.82))`,
          border: `1px solid ${LEAF}66`, backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', gap: 12, animation: 'wm-pop 320ms ease',
        }} key={`p-${roundIdx}`}>
          <span style={{ fontSize: 11, letterSpacing: '0.18em', color: LEAF, border: `1px solid ${LEAF}66`, borderRadius: 4, padding: '3px 7px', flexShrink: 0 }}>RND {String(roundIdx + 1).padStart(2, '0')}</span>
          <span style={{ fontFamily: 'var(--em-decor, var(--em-mono, system-ui))', fontSize: 17, lineHeight: 1.3, flex: 1 }}>{renderedPrompt}</span>
        </div>
      )}

      {/* Tally chip — top-right (✓ correct · ✗ miss), mirrors the 2D chip */}
      {(correctCount > 0 || missCount > 0) && (
        <div
          aria-label={`${correctCount} correct, ${missCount} miss${missCount === 1 ? '' : 'es'}`}
          style={{
            position: 'absolute', top: 12, right: 12, display: 'inline-flex', alignItems: 'center', gap: 6,
            fontSize: 11, letterSpacing: '0.12em', padding: '5px 10px', borderRadius: 6,
            background: 'rgba(14,10,26,0.85)', border: '1px solid rgba(255,255,255,0.18)',
          }}
        >
          <span style={{ color: LEAF }}>✓ {correctCount}</span>
          <span style={{ opacity: 0.4 }}>·</span>
          <span style={{ color: ROSE }}>✗ {missCount}</span>
        </div>
      )}

      {/* Service board — round list with NOW marker (mirrors the 2D side panel) */}
      <div style={{
        position: 'absolute', top: 64, right: 12, width: 200, maxWidth: '42%',
        background: 'rgba(14,10,26,0.78)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10,
        padding: 10, display: 'flex', flexDirection: 'column', gap: 5,
      }} className="wm-board">
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, letterSpacing: '0.16em', opacity: 0.7 }}>
          <span>SERVICE BOARD · TABLICA</span><span style={{ color: LEAF }}>{correctCount}/{total}</span>
        </div>
        {rounds.map((r, i) => {
          const isDone = solved[i]
          const isCurrent = i === roundIdx
          return (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', borderRadius: 6,
              background: isDone ? `${LEAF}18` : isCurrent ? `${AMBER}14` : 'rgba(255,255,255,0.03)',
              border: `1px solid ${isDone ? `${LEAF}55` : isCurrent ? `${AMBER}66` : 'rgba(255,255,255,0.1)'}`,
            }}>
              <span style={{ fontSize: 9, minWidth: 18, color: isDone ? LEAF : isCurrent ? AMBER : 'rgba(237,230,255,0.6)' }}>{String(i + 1).padStart(2, '0')}</span>
              <span style={{ fontSize: 11, flex: 1, opacity: isDone ? 0.7 : 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{maskAnswerInPrompt(r.prompt, r.options[r.answerIndex])}</span>
              {isDone && <span style={{ color: LEAF, fontSize: 10 }}>✓</span>}
              {isCurrent && !isDone && <span style={{ color: AMBER, fontSize: 9 }}>NOW</span>}
            </div>
          )
        })}
      </div>

      {/* Pigeon word-placards — DOM, positioned by the 3D PlacardProjector. Each
          is a real tap target (≥64px); clicking bops that crate's pigeon. */}
      {Array.from({ length: HOLES }, (_, i) => (
        <button
          key={i}
          ref={(el) => { labelRefs.current[i] = el }}
          onClick={() => whack(i)}
          aria-label={`Pigeon at crate ${i + 1} — tap to choose`}
          style={{
            position: 'absolute', top: 0, left: 0, opacity: 0, pointerEvents: 'none',
            minWidth: 64, minHeight: 44, padding: '6px 12px', borderRadius: 10,
            fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', cursor: 'pointer',
            fontFamily: 'var(--em-decor, var(--em-mono, system-ui))',
            background: 'rgba(255,233,176,0.96)', color: '#1a1208',
            border: focusHole === i ? `2px solid ${AMBER}` : '1px solid rgba(26,18,8,0.4)',
            boxShadow: hintHole === i ? `0 0 0 3px ${AMBER}cc` : '0 2px 8px rgba(0,0,0,0.4)',
            animation: hintHole === i ? 'wm-hint 0.6s ease-in-out 3' : undefined,
            touchAction: 'manipulation',
          }}
        >
          <Placard idx={i} moles={moles} version={version} />
        </button>
      ))}

      {/* Controls — Skip / Hint (≥44px tap targets) */}
      <div style={{ position: 'absolute', bottom: 12, left: 12, display: 'flex', gap: 8, pointerEvents: 'auto' }}>
        <button onClick={skip} style={btnStyle()} aria-label="Skip round (S)">SKIP</button>
        <button onClick={useHint} disabled={hintsUsed >= HINT_MAX} style={btnStyle(hintsUsed >= HINT_MAX)} aria-label={`Hint, ${HINT_MAX - hintsUsed} left (H)`}>HINT {HINT_MAX - hintsUsed}</button>
      </div>

      {/* START · ROZPOCZNIJ gate — holds the first round so the prompt is read
          before any pigeon rises (mirrors the 2D `started` gate). */}
      {!started && !completed && (
        <button
          onClick={() => setStarted(true)}
          style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, background: 'rgba(10,5,24,0.42)', border: 'none', cursor: 'pointer', pointerEvents: 'auto', color: '#EDE6FF', padding: '0 24px' }}
        >
          <div style={{ fontSize: 11, letterSpacing: '0.2em', color: LEAF, opacity: 0.9 }}>READY · GOTOWY</div>
          <div style={{ fontFamily: 'var(--em-decor, system-ui)', fontSize: 32, color: LEAF, textShadow: `0 0 18px ${LEAF}88`, textAlign: 'center', lineHeight: 1.15 }}>Camden Pop-Up Pigeons</div>
          <div style={{ maxWidth: 440, textAlign: 'center', fontSize: 13, lineHeight: 1.5, opacity: 0.85 }}>
            Tap the pigeon whose word fits the gap before it ducks. Wait for the right one — wrong taps cost you.
            <br />
            <span style={{ opacity: 0.75 }}>Stuknij gołębia, którego słowo pasuje do luki, zanim się schowa. Poczekaj na właściwego — błędne stuknięcia kosztują.</span>
          </div>
          <div style={{ marginTop: 6, fontSize: 12, letterSpacing: '0.18em', color: AMBER }}>START · ROZPOCZNIJ</div>
        </button>
      )}

      {/* End card */}
      {completed && (
        <div role="dialog" aria-label="Camden Pop-Up Pigeons complete" style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, background: `radial-gradient(ellipse, ${LEAF}22, rgba(10,5,24,0.72))`, backdropFilter: 'blur(6px)', pointerEvents: 'auto' }}>
          <div style={{ fontFamily: 'var(--em-decor, system-ui)', fontSize: 34, color: LEAF, textShadow: `0 0 18px ${LEAF}aa` }}>The market quiets.</div>
          <div style={{ fontSize: 14 }}>You filled <strong style={{ color: AMBER }}>{correctCount}</strong> / {total} signs</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={replay} style={btnStyle()}>Replay</button>
            <button onClick={replay} style={{ ...btnStyle(), background: LEAF, color: '#0c2110', borderColor: LEAF }}>Next district →</button>
          </div>
        </div>
      )}
    </div>
  )

  return (
    <div
      role="application"
      aria-label="Camden Pop-Up Pigeons — tap the pigeon holding the word that completes the sentence"
      style={{ position: 'relative', width: '100%', height: '100%', minHeight: 320 }}
    >
      <CityStage
        quality={quality}
        reducedMotion={reduce}
        fullscreen={fullscreen}
        cameraPosition={[0, 4.8, 5.4]}
        cameraFov={38}
        overlay={overlay}
      >
        <CamdenScene
          moles={moles}
          version={version}
          hintHole={hintHole}
          feedback={feedback}
          reducedMotion={reduce}
          bajla={bajla}
          bajlaFlinch={bajlaFlinch}
          labelRefs={labelRefs}
        />
      </CityStage>
    </div>
  )
}

// Reads the live word for crate `idx` from the mole ref (re-rendered on
// `version`). Keeps the placard text crisp DOM — never a 3D texture.
function Placard({ idx, moles, version }: { idx: number; moles: React.MutableRefObject<MoleSlot[]>; version: number }) {
  void version
  const slot = moles.current.find((m) => m.holeIdx === idx && m.state !== 'down')
  return <>{slot ? slot.word : ''}</>
}

// ── Small DOM helpers ─────────────────────────────────────────────────────
function btnStyle(disabled = false): React.CSSProperties {
  return {
    minHeight: 44, minWidth: 52, padding: '8px 14px', borderRadius: 8,
    background: `${LEAF}28`, border: `1px solid ${LEAF}66`,
    color: LEAF, fontFamily: 'var(--em-mono, ui-monospace, monospace)', fontSize: 12,
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
