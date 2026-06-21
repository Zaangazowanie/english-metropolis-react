// EnglishMetroWorld — WorldKit (W1 stage · W2 Wren · W3 Lanterngate).
//
// The canvas and atmosphere that hosts the English Metro RPG.
//   W1: dusk-London plaza, lamp ring, building silhouette, drifting motes,
//       and the "Enter the City" DOM overlay.
//   W2: Wren — third-person player character with a hand-rolled controller
//       (WASD/arrows + on-screen touch joystick) and a spring follow-camera.
//   W3: Lanterngate living zone — paper lanterns swaying between lamp posts
//       (ambient wind), NPC silhouettes drifting in the distance, Bajla
//       flyby triggered once on first entry, and the "LANTERNGATE" district
//       arrival overlay. Wren's coat + head now use TremblingOutlineMesh (the
//       signature hand-drawn graphite ink look deferred from W2).
//
// CONTRACT compliance (docs/game3d/CONTRACT.md + Addendum A, approved):
//   • Implements Game3DProps → onSessionComplete fires on explicit exit.
//   • Built-in demo for anonymous play (no puzzle/vocab required).
//   • Fullscreen CityStage canvas, aria-hidden. English in DOM overlay only.
//   • Zero new npm deps. All imports from existing three/r3f/drei + GameKit.
//     No physics dep — the controller + camera are hand-rolled in TS.
//   • Budget: world-englishmetro chunk target ≤ 600 KB gz (Addendum A).
//   • DPR ≤ 1.5, draw calls < 150 (actual: ~22). reducedMotion honored
//     (no bob / no decorative sway; camera snaps instead of springing).
//   • No per-frame allocations — scratch objects declared at module scope.
//   • Keyboard (WASD/arrows + Escape) + pointer (touch joystick, Begin/Exit).
//   • Canvas aria-hidden; live-region announces state changes.

import { useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense, Component } from 'react'
import type { CSSProperties, ErrorInfo, ReactNode } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import {
  Color,
  FogExp2,
  Object3D,
  Vector3,
  MathUtils,
  Float32BufferAttribute,
  BufferGeometry,
} from 'three'
import type {
  Group,
  InstancedMesh,
  Mesh,
  Points as ThreePoints,
} from 'three'
import type { Game3DProps, SessionResult } from '../practice/shells3d/types'
import { CityStage, useStageQuality } from '../practice/shells3d/kit/CityStage'
import { palette } from '../practice/shells3d/kit/palette'
import { BajlaCompanion } from './BajlaCompanion'
import type { BajlaVariant } from '../practice/shells3d/kit/Bajla'
import { findGame3D } from '../practice/shells3d/kit/registry'
import { Wren } from './Wren'
import { WorldPortal } from './WorldPortal'
import type { PortalDef } from './WorldPortal'
import { useWorldInput, readKeys } from './useWorldInput'
import type { JoyVec } from './useWorldInput'
import { useLampProgress } from './useLampProgress'
import { useDialogue } from './useDialogue'
import { DialogueBox } from './DialogueBox'
import { Pager } from './Pager'
import { MetroMap } from './MetroMap'
import { ReflectionBench } from './ReflectionBench'
import { MetroTrain } from './MetroTrain'
import { DuskClouds } from './DuskClouds'
import { TitlePlanet } from './TitlePlanet'
import { FestoonLights } from './FestoonLights'
import { LampRelight } from './LampRelight'
import { NpcResidents } from './NpcResidents'
import { FloraStall } from './FloraStall'
import { ChenCafe } from './ChenCafe'
import { GrassTufts } from './GrassTufts'
import { useWorldAudio } from './useWorldAudio'
import {
  INTRO_SCRIPT, PORTAL_INTROS,
  hasSeenIntro, markIntroSeen,
  hasSeenPortalIntro, markPortalIntroSeen,
} from './dialogue'

// ─── Scratch (no per-frame allocations) ────────────────────────────────────
const _obj  = new Object3D()
const _col  = new Color()
const _fwd  = new Vector3()
const _right = new Vector3()
const _move = new Vector3()
const _camTarget = new Vector3()
const _lookTarget = new Vector3()

// ─── Layout constants ────────────────────────────────────────────────────────
const LAMP_COUNT       = 16
const BUILDING_COUNT   = 24
const MOTE_COUNT       = 64
const LAMP_RING_RADIUS = 8.5
// NPC residents are now in NpcResidents.tsx (fully-built canon characters).
const FONT_DISPLAY     = '"Space Grotesk", "Inter", ui-sans-serif, system-ui, sans-serif'

// ─── Controller / camera tuning ───────────────────────────────────────────────
const WALK_SPEED   = 4.2   // world units / second
const PLAY_RADIUS  = 7.4   // Wren stays inside the lamp ring
const CAM_DIST     = 5.6   // follow distance behind Wren
const CAM_HEIGHT   = 3.1   // follow height above Wren
const CAM_LOOK_Y   = 1.25  // look-at height (Wren's chest)
const TURN_LERP    = 0.18  // heading easing toward movement direction
const CAM_LERP     = 0.08  // camera spring easing (snaps when reducedMotion)
const START_HEADING = Math.PI // face −Z (into the plaza) so the intro keeps the
                              // camera on the +Z side — no jarring spin-around.

/** Shortest-path angular lerp (radians). */
function lerpAngle(a: number, b: number, t: number): number {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a))
  return a + d * t
}

// ─── District portals — one per errand ─────────────────────────────────────
// Each links a world location to a registered (already-merged) game shell.
// Positions are computed evenly around the lamp ring so any number of portals
// stays reachable by walking a comfortable arc. Portal i sits at angle
// i*(360/N) measured from +Z (Lanterngate), so position[0] stays at +Z.
// Wren is clamped to PLAY_RADIUS (7.4); a portal at radius 8.5 is reached
// within PORTAL_RANGE.
const _R = LAMP_RING_RADIUS
const PORTAL_RANGE = 2.7  // proximity (world units) that opens the play prompt

// Errands in ring order (all are live shells in game3dRegistry). Beats 2/4a/4b
// are the canon Vertical Slice; spellingbee + gapfill extend the playable hub.
// district: the named zone shown in the HUD when Wren is near this lamp.
const PORTAL_DEFS: Array<{ shellKey: string; title: string; district: string }> = [
  { shellKey: 'labelleddiagram', title: 'Light the First Lamp',       district: 'Lanterngate' },
  { shellKey: 'matching',        title: "Flora's Bouquets",           district: 'Saffron Market' },
  { shellKey: 'anagram',         title: "Mr. Chen's Chalkboard",      district: 'Saffron Market' },
  { shellKey: 'spellingbee',     title: "Mr. Frank's Address Board",  district: 'The Sorting Office' },
  { shellKey: 'gapfill',         title: "Posta's Smudged Postcard",   district: 'Postcard Pier' },
]
const PORTALS: PortalDef[] = PORTAL_DEFS.map((d, i) => {
  const a = (i / PORTAL_DEFS.length) * Math.PI * 2 // 0 = +Z, clockwise
  return { shellKey: d.shellKey, title: d.title, position: [Math.sin(a) * _R, 0, Math.cos(a) * _R] }
})
/** Nearest portal's district (for the HUD label). */
const DISTRICT_BY_KEY: Record<string, string> = Object.fromEntries(
  PORTAL_DEFS.map((d) => [d.shellKey, d.district])
)

// ─── Reflection bench — "Watch the Last Train" (canon Beat 5) ─────────────────
// The bench sits just inside the lamp ring at +X (perpendicular to Lanterngate),
// facing south-west toward the plaza. Wren reaches it by walking left from the
// start position. BENCH_RANGE is the proximity that shows the reflection overlay.
const BENCH_POS: [number, number, number] = [6.4, 0, 0]
const BENCH_RANGE = 2.2

// ─── Fog ──────────────────────────────────────────────────────────────────────
function SceneFog() {
  const { scene } = useThree()
  useEffect(() => {
    // Canonical Dusk Teal (deep) — recedes distant geometry into a teal horizon
    // and unifies the whole world to the "Dusk Teal & Amber" art bible (was the
    // blue-violet palette.duskMid, which fought the teal canon).
    scene.fog = new FogExp2('#234E5A', 0.028)
    return () => { scene.fog = null }
  }, [scene])
  return null
}

// ─── Ground plane ─────────────────────────────────────────────────────────────
function Ground() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[120, 120]} />
      {/* Canonical Dusk Teal #2B5F6E — the warm-lit teal street of the look-dev */}
      <meshToonMaterial color="#2B5F6E" />
    </mesh>
  )
}

// ─── Lamp ring ────────────────────────────────────────────────────────────────
// 16 instanced posts (brass cylinders) + 16 instanced amber glow caps.
// Draw calls: 2 (one InstancedMesh each).
function LampRing() {
  const postRef  = useRef<InstancedMesh>(null!)
  const glowRef  = useRef<InstancedMesh>(null!)
  const baseRef  = useRef<InstancedMesh>(null!)
  const { settings } = useStageQuality()

  useEffect(() => {
    for (let i = 0; i < LAMP_COUNT; i++) {
      const angle = (i / LAMP_COUNT) * Math.PI * 2
      const x = Math.cos(angle) * LAMP_RING_RADIUS
      const z = Math.sin(angle) * LAMP_RING_RADIUS

      // Post — stand at ground level
      _obj.position.set(x, 1.4, z)
      _obj.scale.setScalar(1)
      _obj.rotation.set(0, 0, 0)
      _obj.updateMatrix()
      postRef.current.setMatrixAt(i, _obj.matrix)

      // Base disc
      _obj.position.set(x, 0.08, z)
      _obj.scale.set(0.3, 1, 0.3)
      _obj.rotation.set(0, 0, 0)
      _obj.updateMatrix()
      baseRef.current.setMatrixAt(i, _obj.matrix)

      // Glow cap — sits on top of the post
      _obj.position.set(x, 2.88, z)
      _obj.scale.setScalar(settings.particles > 0 ? 0.28 : 0.22)
      _obj.rotation.set(0, 0, 0)
      _obj.updateMatrix()
      glowRef.current.setMatrixAt(i, _obj.matrix)
    }
    postRef.current.instanceMatrix.needsUpdate = true
    glowRef.current.instanceMatrix.needsUpdate = true
    baseRef.current.instanceMatrix.needsUpdate  = true
  }, [settings.particles])

  return (
    <>
      {/* Post shaft */}
      <instancedMesh ref={postRef} args={[undefined, undefined, LAMP_COUNT]}
        castShadow frustumCulled={false}>
        <cylinderGeometry args={[0.055, 0.07, 2.8, 6]} />
        <meshToonMaterial color={palette.brass} />
      </instancedMesh>
      {/* Base disc */}
      <instancedMesh ref={baseRef} args={[undefined, undefined, LAMP_COUNT]}
        frustumCulled={false}>
        <cylinderGeometry args={[1, 1.1, 0.15, 8]} />
        <meshToonMaterial color={palette.brass} />
      </instancedMesh>
      {/* Amber glow cap — MeshBasicMaterial so it never goes dark */}
      <instancedMesh ref={glowRef} args={[undefined, undefined, LAMP_COUNT]}
        frustumCulled={false}>
        <sphereGeometry args={[1, 8, 6]} />
        <meshBasicMaterial color={palette.lanternAmber} />
      </instancedMesh>
    </>
  )
}

// ─── Point lights for amber glow (only 4 — budget-safe) ─────────────────────
// Covers cardinal lamps; remaining 12 are lit by the shared directional + ambient.
function LampLights() {
  const { settings } = useStageQuality()
  if (!settings.shadows) return null   // skip on medium/low — ambient is enough
  const positions: [number, number, number][] = [
    [LAMP_RING_RADIUS, 2.9, 0],
    [-LAMP_RING_RADIUS, 2.9, 0],
    [0, 2.9, LAMP_RING_RADIUS],
    [0, 2.9, -LAMP_RING_RADIUS],
  ]
  return (
    <>
      {positions.map(([x, y, z], i) => (
        <pointLight key={i} position={[x, y, z]}
          color={palette.lanternAmber} intensity={1.8} distance={10} decay={2} />
      ))}
    </>
  )
}

// ─── Building skyline ─────────────────────────────────────────────────────────
// 24 instanced boxes spread in an arc behind the lamp ring (z = -20 to -55).
// Reskinned to warm dusk-London facades (cream/sand/clay) per the "Dusk Teal &
// Amber" look-dev — the teal fog recedes them into the horizon so they read as a
// living warm city around the plaza, not flat black cutouts. Vertex-coloured,
// 1 draw call.
const FACADES = ['#D9CDB4', '#CDBA98', '#BFA079', '#D2C0A0', '#8E9BA0', '#C8AE90']
// Warm lit windows — the em-spike's signature glow. A 2×2 grid of panes on each
// building's plaza-facing (+Z) side; ~3/4 amber-lit, the rest dark. Unlit
// MeshBasic so the panes glow on their own; per-pane color via instanceColor.
const WINDOWS_PER  = 4
const WINDOW_TOTAL = BUILDING_COUNT * WINDOWS_PER
const WIN_LIT = ['#fff1b8', '#ffce86', '#ffb347'] // warm lamp-lit panes
const WIN_OFF = '#15282E'                          // dark / unlit pane (deep teal)
// Red-brown pitched roofs (the em-spike's clay-tiled London rooftops).
const ROOFS = ['#B5572E', '#A24B27', '#9C5333', '#8E4828', '#C2632F']
function BuildingSkyline() {
  const ref = useRef<InstancedMesh>(null!)
  const winRef = useRef<InstancedMesh>(null!)
  const roofRef = useRef<InstancedMesh>(null!)

  useEffect(() => {
    for (let i = 0; i < BUILDING_COUNT; i++) {
      // Spread across -75° to +75° arc, varying depth
      const t       = i / (BUILDING_COUNT - 1)              // 0..1
      const angle   = (t - 0.5) * 2.6                       // −1.3 to +1.3 rad
      const depth   = 28 + (i % 4) * 7                      // 28..49
      const height  = 3 + ((i * 3.17) % 12)                 // 3..15 units
      const width   = 2 + ((i * 1.97) % 3.5)                // 2..5.5 units
      const depthZ  = 2 + ((i * 0.73) % 3)                  // box depth
      const x       = Math.sin(angle) * depth * 0.55
      const z       = -depth + Math.cos(angle) * depth * 0.1

      _obj.position.set(x, height / 2, z)
      _obj.scale.set(width, height, depthZ)
      _obj.rotation.set(0, 0, 0)
      _obj.updateMatrix()
      ref.current.setMatrixAt(i, _obj.matrix)

      _col.set(FACADES[i % FACADES.length])
      ref.current.setColorAt(i, _col)

      // 2×2 grid of windows on the plaza-facing (+Z) face.
      const frontZ = z + depthZ / 2 + 0.06
      const cols = [-width * 0.22, width * 0.22]
      const rows = [height * 0.42, height * 0.68]
      const paneW = Math.min(0.32, width * 0.16)
      let k = 0
      for (let c = 0; c < 2; c++) {
        for (let r = 0; r < 2; r++) {
          const wi = i * WINDOWS_PER + k
          _obj.position.set(x + cols[c], rows[r], frontZ)
          _obj.scale.set(paneW, 0.36, 1)
          _obj.rotation.set(0, 0, 0)
          _obj.updateMatrix()
          winRef.current.setMatrixAt(wi, _obj.matrix)
          const lit = (i * 7 + k * 3) % 4 !== 0
          _col.set(lit ? WIN_LIT[(i + k) % WIN_LIT.length] : WIN_OFF)
          winRef.current.setColorAt(wi, _col)
          k++
        }
      }

      // Red-brown pitched roof cap — a 4-sided pyramid whose base corners match
      // the building footprint (thetaStart=π/4 bakes the 45° so scale maps W×D
      // cleanly). Sits on the building top.
      const roofH = 0.9 + ((i * 1.7) % 1) * 0.8
      _obj.position.set(x, height + roofH / 2, z)
      _obj.scale.set(width, roofH, depthZ)
      _obj.rotation.set(0, 0, 0)
      _obj.updateMatrix()
      roofRef.current.setMatrixAt(i, _obj.matrix)
      _col.set(ROOFS[i % ROOFS.length])
      roofRef.current.setColorAt(i, _col)
    }
    ref.current.instanceMatrix.needsUpdate = true
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true
    winRef.current.instanceMatrix.needsUpdate = true
    if (winRef.current.instanceColor) winRef.current.instanceColor.needsUpdate = true
    roofRef.current.instanceMatrix.needsUpdate = true
    if (roofRef.current.instanceColor) roofRef.current.instanceColor.needsUpdate = true
  }, [])

  return (
    <>
      <instancedMesh ref={ref} args={[undefined, undefined, BUILDING_COUNT]}
        frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshToonMaterial vertexColors />
      </instancedMesh>
      {/* Warm lit windows — glow on their own (unlit), color via instanceColor */}
      <instancedMesh ref={winRef} args={[undefined, undefined, WINDOW_TOTAL]}
        frustumCulled={false}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial />
      </instancedMesh>
      {/* Red-brown pitched roofs — 4-sided pyramids matching each footprint */}
      <instancedMesh ref={roofRef} args={[undefined, undefined, BUILDING_COUNT]}
        frustumCulled={false}>
        <coneGeometry args={[0.707, 1, 4, 1, false, Math.PI / 4]} />
        <meshToonMaterial vertexColors />
      </instancedMesh>
    </>
  )
}

// ─── Floating amber motes ─────────────────────────────────────────────────────
// 64 Points that drift upward; reset to base when they reach ceiling.
// Skipped entirely when reducedMotion = true. Draw call: 1.
function FloatingMotes({ active }: { active: boolean }) {
  const geomRef = useRef<BufferGeometry>(null!)
  const ptsRef  = useRef<ThreePoints>(null!)

  // Deterministic initial positions (no Math.random — uses prime multipliers)
  const initPositions = useMemo(() => {
    const arr = new Float32Array(MOTE_COUNT * 3)
    for (let i = 0; i < MOTE_COUNT; i++) {
      const angle   = (i / MOTE_COUNT) * Math.PI * 2 * 3.1 // spiral spread
      const radius  = 2 + (i % 11) * 0.9                   // 2..11.8
      arr[i * 3]     = Math.cos(angle) * radius
      arr[i * 3 + 1] = (i * 1.73) % 5.5                    // staggered heights
      arr[i * 3 + 2] = Math.sin(angle) * radius
    }
    return arr
  }, [])

  useEffect(() => {
    if (!geomRef.current) return
    const attr = new Float32BufferAttribute(initPositions.slice(), 3)
    geomRef.current.setAttribute('position', attr)
  }, [initPositions])

  useFrame((_, delta) => {
    if (!active || !geomRef.current) return
    const attr = geomRef.current.attributes.position as Float32BufferAttribute
    const arr  = attr.array as Float32Array
    const rise = delta * 0.35
    for (let i = 0; i < MOTE_COUNT; i++) {
      arr[i * 3 + 1] += rise
      if (arr[i * 3 + 1] > 6) arr[i * 3 + 1] = 0.05
    }
    attr.needsUpdate = true
  })

  if (!active) return null

  return (
    <points ref={ptsRef}>
      <bufferGeometry ref={geomRef} />
      <pointsMaterial
        color={palette.lanternAmber}
        size={0.14}
        sizeAttenuation
        transparent
        opacity={0.72}
        depthWrite={false}
      />
    </points>
  )
}

// ─── W3: Paper lanterns (strung between lamp posts, swaying in wind) ──────────
// 16 oval lanterns in amber, one hanging midway between each pair of adjacent
// posts. Each sways around its Z-axis with a unique phase. InstancedMesh → 1
// draw call. reducedMotion → static (no sway). No per-frame allocations.
function PaperLanterns({ reducedMotion }: { reducedMotion: boolean }) {
  const ref = useRef<InstancedMesh>(null!)
  const t   = useRef(0)

  // Pre-compute the midpoint between adjacent lamp-post pairs.
  const midpoints = useMemo(() => {
    return Array.from({ length: LAMP_COUNT }, (_, i) => {
      const a0 = (i / LAMP_COUNT) * Math.PI * 2
      const a1 = ((i + 1) / LAMP_COUNT) * Math.PI * 2
      const r  = LAMP_RING_RADIUS * 0.98
      return {
        x:     (Math.cos(a0) + Math.cos(a1)) / 2 * r,
        z:     (Math.sin(a0) + Math.sin(a1)) / 2 * r,
        phase: i * 0.78,
      }
    })
  }, [])

  useEffect(() => {
    if (!ref.current) return
    midpoints.forEach(({ x, z }, i) => {
      _obj.position.set(x, 3.05, z)
      _obj.rotation.set(0, 0, 0)
      _obj.scale.setScalar(1)
      _obj.updateMatrix()
      ref.current.setMatrixAt(i, _obj.matrix)
    })
    ref.current.instanceMatrix.needsUpdate = true
  }, [midpoints])

  useFrame((_, delta) => {
    if (reducedMotion || !ref.current) return
    t.current += delta
    midpoints.forEach(({ x, z, phase }, i) => {
      const sway = Math.sin(t.current * 1.2 + phase) * 0.11
      _obj.position.set(
        x + Math.sin(sway) * 0.08,
        3.05 - Math.abs(Math.sin(t.current * 0.6 + phase)) * 0.04,
        z + Math.cos(sway) * 0.08,
      )
      _obj.rotation.set(0, 0, sway)
      _obj.scale.setScalar(1)
      _obj.updateMatrix()
      ref.current.setMatrixAt(i, _obj.matrix)
    })
    ref.current.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, LAMP_COUNT]}
      frustumCulled={false}>
      {/* Squat oval lantern shape */}
      <sphereGeometry args={[0.15, 7, 6]} />
      <meshBasicMaterial color={palette.lanternCore} />
    </instancedMesh>
  )
}

// ─── Gentle camera drift (title screen only; respects reducedMotion) ─────────
function CameraDrift({ active }: { active: boolean }) {
  const { camera } = useThree()
  const t = useRef(0)

  useFrame((_, delta) => {
    if (!active) return
    t.current += delta * 0.12
    camera.position.x = Math.sin(t.current) * 0.6
    camera.position.y = 5 + Math.sin(t.current * 0.7) * 0.25
    camera.position.z = 18
    camera.lookAt(0, 0.5, 0)
  })

  return null
}

// ─── WrenRig — third-person controller + spring follow-camera ────────────────
// Hand-rolled (no physics dep). Each frame: read input (touch joystick wins
// over keyboard), move Wren camera-relative on the XZ plane, ease heading to
// face travel, clamp inside the lamp ring, then spring the camera to sit
// behind Wren. reducedMotion → snap camera, no walk bob. Allocation-free:
// every Vector3 is module-scope scratch.
interface WrenRigProps {
  keysRef: React.MutableRefObject<Set<string>>
  joyRef: React.MutableRefObject<JoyVec | null>
  reducedMotion: boolean
  /** Called only when the nearest in-range portal changes (not every frame). */
  onNearPortalChange: (shellKey: string | null) => void
  /** Called when Wren enters/leaves the bench proximity zone. */
  onNearBenchChange: (near: boolean) => void
  /** Called on each stride beat while walking (soft footstep audio). */
  onFootstep: () => void
  /** Wren's live world position, written each frame (for the Bajla companion). */
  posOutRef: React.MutableRefObject<Vector3>
}
function WrenRig({ keysRef, joyRef, reducedMotion, onNearPortalChange, onNearBenchChange, onFootstep, posOutRef }: WrenRigProps) {
  const { camera } = useThree()
  const groupRef = useRef<Group>(null!)
  const posRef = useRef(new Vector3(0, 0, 0))
  const headingRef = useRef(START_HEADING)
  const speedRef = useRef(0)
  const nearRef = useRef<string | null>(null)
  const nearBenchRef = useRef(false)
  const stepClock = useRef(0)

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05) // clamp long frames (tab refocus)
    const g = groupRef.current
    if (!g) return

    // 1. Resolve input — joystick takes precedence when touched.
    const joy = joyRef.current
    const inX = joy ? joy.x : 0
    const inY = joy ? joy.y : 0
    let ix = inX
    let iy = inY
    if (!joy) {
      const k = readKeys(keysRef.current)
      ix = k.x
      iy = k.y
    }
    let mag = Math.hypot(ix, iy)
    if (mag > 1) { ix /= mag; iy /= mag; mag = 1 }

    const pos = posRef.current

    if (mag > 0.04) {
      // 2. Camera-relative basis on the ground plane (use the camera's own
      //    world axes so movement always matches what the player sees).
      _fwd.setFromMatrixColumn(camera.matrix, 2).negate(); _fwd.y = 0; _fwd.normalize()
      _right.setFromMatrixColumn(camera.matrix, 0); _right.y = 0; _right.normalize()
      _move.set(0, 0, 0)
        .addScaledVector(_fwd, iy)
        .addScaledVector(_right, ix)
      if (_move.lengthSq() > 1e-6) _move.normalize()

      // 3. Advance + clamp inside the lamp ring.
      pos.addScaledVector(_move, WALK_SPEED * dt * mag)
      const r = Math.hypot(pos.x, pos.z)
      if (r > PLAY_RADIUS) { pos.x = (pos.x / r) * PLAY_RADIUS; pos.z = (pos.z / r) * PLAY_RADIUS }

      // 4. Turn to face travel.
      const desired = Math.atan2(_move.x, _move.z)
      headingRef.current = reducedMotion
        ? desired
        : lerpAngle(headingRef.current, desired, TURN_LERP)
      speedRef.current = MathUtils.lerp(speedRef.current, 1, 0.25)
    } else {
      speedRef.current = MathUtils.lerp(speedRef.current, 0, 0.25)
    }

    // Publish Wren's ground position so the Bajla companion can trail him.
    posOutRef.current.set(pos.x, 0, pos.z)

    // 5. Apply transform (+ a gentle walk bob unless reducedMotion).
    const bob = reducedMotion ? 0 : Math.abs(Math.sin(performance.now() * 0.012)) * 0.06 * speedRef.current
    g.position.set(pos.x, bob, pos.z)
    g.rotation.y = headingRef.current

    // 6. Spring the camera behind Wren's heading.
    const hx = Math.sin(headingRef.current)
    const hz = Math.cos(headingRef.current)
    _camTarget.set(pos.x - hx * CAM_DIST, CAM_HEIGHT, pos.z - hz * CAM_DIST)
    camera.position.lerp(_camTarget, reducedMotion ? 1 : CAM_LERP)
    _lookTarget.set(pos.x, CAM_LOOK_Y, pos.z)
    camera.lookAt(_lookTarget)

    // 7. Nearest in-range portal (notify parent only when it changes).
    let near: string | null = null
    let bestSq = PORTAL_RANGE * PORTAL_RANGE
    for (let i = 0; i < PORTALS.length; i++) {
      const p = PORTALS[i].position
      const dx = pos.x - p[0]
      const dz = pos.z - p[2]
      const dSq = dx * dx + dz * dz
      if (dSq < bestSq) { bestSq = dSq; near = PORTALS[i].shellKey }
    }
    if (near !== nearRef.current) {
      nearRef.current = near
      onNearPortalChange(near)
    }

    // 8. Bench proximity (Beat 5 trigger).
    const bdx = pos.x - BENCH_POS[0]
    const bdz = pos.z - BENCH_POS[2]
    const nearBench = bdx * bdx + bdz * bdz < BENCH_RANGE * BENCH_RANGE
    if (nearBench !== nearBenchRef.current) {
      nearBenchRef.current = nearBench
      onNearBenchChange(nearBench)
    }

    // 9. Footstep audio — a soft step on each stride beat while walking.
    if (speedRef.current > 0.35) {
      stepClock.current += dt
      if (stepClock.current >= 0.36) { stepClock.current = 0; onFootstep() }
    } else {
      stepClock.current = 0.3 // primed so the first step fires quickly on move
    }
  })

  return (
    <group ref={groupRef}>
      <Wren speedRef={speedRef} reducedMotion={reducedMotion} />
    </group>
  )
}

// ─── Scene root ──────────────────────────────────────────────────────────────
interface SceneProps {
  phase: WorldPhase
  motesActive: boolean
  reducedMotion: boolean
  bajlaVariant: BajlaVariant
  nearPortal: string | null
  completed: Set<string>
  justEarned: string | null  // lamp-relight VFX
  keysRef: React.MutableRefObject<Set<string>>
  joyRef: React.MutableRefObject<JoyVec | null>
  onNearPortalChange: (shellKey: string | null) => void
  onNearBenchChange: (near: boolean) => void
  onFootstep: () => void
}
function WorldScene({
  phase, motesActive, reducedMotion, bajlaVariant, nearPortal, completed, justEarned,
  keysRef, joyRef, onNearPortalChange, onNearBenchChange, onFootstep,
}: SceneProps) {
  const ambient = phase === 'ambient'
  // Wren's live position, written by WrenRig and read by the Bajla companion.
  const wrenPosRef = useRef(new Vector3())
  return (
    <>
      <SceneFog />
      <Ground />
      <LampRing />
      <LampLights />
      <BuildingSkyline />
      {/* Amber festoon string-lights looped between lamp posts — the em-spike signature */}
      <FestoonLights />
      {/* Soft watercolor clouds drifting high on the breeze */}
      <DuskClouds reducedMotion={reducedMotion} />
      {/* The elevated Round + slow last train, circling beyond the plaza */}
      <MetroTrain reducedMotion={reducedMotion} />
      <FloatingMotes active={motesActive} />
      {/* W3: living zone — paper lanterns + fully-built canon residents */}
      <PaperLanterns reducedMotion={reducedMotion} />
      <NpcResidents reducedMotion={reducedMotion} />
      {/* Saffron Market landmarks — Flora's flower stall + Mr. Chen's café */}
      <FloraStall position={[-6.5, 0, 4.5]} rotation={[0, 2.18, 0]} reducedMotion={reducedMotion} />
      <ChenCafe position={[3.0, 0, -7.0]} rotation={[0, -0.405, 0]} />
      {/* Tufts of dusk grass softening the plaza border */}
      <GrassTufts />
      {/* Title: gentle establishing drift. Ambient: Wren + follow-cam. */}
      {/* Title: the menu "tiny planet" (drives the title camera). Ambient: Wren. */}
      {!ambient && <TitlePlanet reducedMotion={reducedMotion} />}
      {ambient && (
        <>
          <WrenRig
            keysRef={keysRef}
            joyRef={joyRef}
            reducedMotion={reducedMotion}
            onNearPortalChange={onNearPortalChange}
            onNearBenchChange={onNearBenchChange}
            onFootstep={onFootstep}
            posOutRef={wrenPosRef}
          />
          {/* Bench Beat — visible in ambient always; glows when Wren nears it */}
          <ReflectionBench
            position={BENCH_POS}
            rotation={[0, -Math.PI / 6, 0]}
            reducedMotion={reducedMotion}
          />
          {/* W4/W5: district portals (walk up → play; lit = completed) */}
          {PORTALS.map((p) => (
            <WorldPortal
              key={p.shellKey}
              position={p.position}
              active={nearPortal === p.shellKey}
              lit={completed.has(p.shellKey)}
              reducedMotion={reducedMotion}
            />
          ))}
          {/* Lamp-relight bloom: brief amber burst at the just-earned portal. */}
          {justEarned && (() => {
            const p = PORTALS.find((portal) => portal.shellKey === justEarned)
            return p ? <LampRelight key={justEarned} position={p.position} reducedMotion={reducedMotion} /> : null
          })()}
          {/* Bajla glides alongside Wren as his guide (celebrate = a flourish). */}
          <BajlaCompanion
            wrenPosRef={wrenPosRef}
            variant={bajlaVariant}
            reducedMotion={reducedMotion}
          />
        </>
      )}
    </>
  )
}

// ─── W4: GameMount — lazy-loads a per-game shell when Wren enters a portal ────
// Single canvas guaranteed: EnglishMetroWorld renders EITHER the world OR this
// mount, never both. The shell brings its own CityStage. onComplete fires when
// the shell calls onSessionComplete (its own no-fail round end).
class GameErrorBoundary extends Component<{ onBack: () => void; children: ReactNode }, { broken: boolean }> {
  state = { broken: false }
  static getDerivedStateFromError() { return { broken: true } }
  componentDidCatch(_e: Error, _i: ErrorInfo) { /* swallowed; UI handles it */ }
  render() {
    if (this.state.broken) {
      return (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 16,
          color: 'rgba(245,240,250,0.8)', fontFamily: FONT_DISPLAY, textAlign: 'center', padding: 24,
        }}>
          <div style={{ fontSize: 34 }}>🛠️</div>
          <div>This errand is resting. Come back to it soon.</div>
          <button type="button" onClick={this.props.onBack} style={backBtnStyle}>← Back to the city</button>
        </div>
      )
    }
    return this.props.children
  }
}

const backBtnStyle: CSSProperties = {
  fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 13,
  color: 'rgba(245,240,250,0.85)', background: 'rgba(10,4,24,0.7)',
  border: '1px solid rgba(245,240,250,0.22)', borderRadius: 8,
  padding: '9px 16px', cursor: 'pointer', letterSpacing: '0.05em',
}

function GameMount({
  shellKey, onBack, onComplete,
}: {
  shellKey: string
  onBack: () => void
  /** Called when the shell's onSessionComplete fires; receives the shellKey so
   *  the parent can mark the lamp complete. */
  onComplete: (key: string) => void
}) {
  const entry = useMemo(() => findGame3D(shellKey), [shellKey])
  const Lazy = useMemo(() => (entry ? lazy(entry.load) : null), [entry])

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: palette.night }}>
      {/* Back-to-world control (always available, above the shell) */}
      <button type="button" onClick={onBack} aria-label="Back to the city"
        style={{ ...backBtnStyle, position: 'absolute', top: 14, left: 14, zIndex: 5 }}>
        ← Back to the city
      </button>
      <GameErrorBoundary onBack={onBack}>
        <Suspense fallback={
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
            justifyContent: 'center', color: 'rgba(245,240,250,0.6)',
            fontFamily: FONT_DISPLAY, letterSpacing: '0.2em', fontSize: 13,
          }}>
            LIGHTING THE LAMP…
          </div>
        }>
          {Lazy
            ? <Lazy onSessionComplete={() => onComplete(shellKey)} fullscreen={false} />
            : <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
                justifyContent: 'center', color: 'rgba(245,240,250,0.7)', fontFamily: FONT_DISPLAY }}>
                This errand hasn&apos;t arrived yet.
              </div>}
        </Suspense>
      </GameErrorBoundary>
    </div>
  )
}

// ─── UI states ────────────────────────────────────────────────────────────────
type WorldPhase = 'title' | 'ambient'

// ─── Touch joystick (DOM overlay; writes into joyRef) ────────────────────────
// A thumb pad in the bottom-left. Pointer events cover touch + mouse-drag.
// Writes a normalised { x, y } (y up = +1) into joyRef while held; clears it
// on release so the keyboard regains control. aria-hidden — keyboard is the
// accessible movement path; this is a supplementary touch control.
const JOY_R = 56  // pad radius (px); knob travel clamped to this
function TouchJoystick({ joyRef }: { joyRef: React.MutableRefObject<JoyVec | null> }) {
  const padRef = useRef<HTMLDivElement>(null)
  const knobRef = useRef<HTMLDivElement>(null)
  const originRef = useRef<{ x: number; y: number } | null>(null)

  const setKnob = (dx: number, dy: number) => {
    if (knobRef.current) knobRef.current.style.transform = `translate(${dx}px, ${dy}px)`
  }

  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = padRef.current?.getBoundingClientRect()
    if (!rect) return
    originRef.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    onMove(e)
  }
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const o = originRef.current
    if (!o) return
    let dx = e.clientX - o.x
    let dy = e.clientY - o.y
    const dist = Math.hypot(dx, dy)
    if (dist > JOY_R) { dx = (dx / dist) * JOY_R; dy = (dy / dist) * JOY_R }
    setKnob(dx, dy)
    // Screen-down (+dy) must be backward (−y), so negate dy.
    joyRef.current = { x: dx / JOY_R, y: -dy / JOY_R }
  }
  const onUp = () => {
    originRef.current = null
    joyRef.current = null
    setKnob(0, 0)
  }

  return (
    <div
      ref={padRef}
      aria-hidden="true"
      onPointerDown={onDown}
      onPointerMove={(e) => originRef.current && onMove(e)}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      style={{
        position: 'absolute', left: 26, bottom: 26,
        width: JOY_R * 2, height: JOY_R * 2, borderRadius: '50%',
        background: 'rgba(10,4,24,0.42)',
        border: '1px solid rgba(245,240,250,0.18)',
        touchAction: 'none', pointerEvents: 'auto',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div ref={knobRef} style={{
        width: 46, height: 46, borderRadius: '50%',
        background: `radial-gradient(circle at 40% 35%, ${palette.lanternCore}, ${palette.lanternAmber})`,
        boxShadow: `0 0 18px ${palette.lanternAmber}aa`,
        pointerEvents: 'none', willChange: 'transform',
      }} />
    </div>
  )
}

// ─── EnglishMetroWorld ────────────────────────────────────────────────────────
export default function EnglishMetroWorld({
  onSessionComplete,
  quality,
  reducedMotion = false,
  // fullscreen intentionally defaults false — GameHome's PlayOverlay already
  // provides the fixed-fullscreen container. Pass fullscreen={true} explicitly
  // when mounting outside PlayOverlay (e.g. a dedicated /world route in W4+).
  fullscreen = false,
}: Game3DProps) {
  const [phase, setPhase]               = useState<WorldPhase>('title')
  const [bajlaVariant, setBajlaVariant] = useState<BajlaVariant>('idle')
  const [showArrival, setShowArrival]   = useState(false)  // W3 district overlay
  const [nearPortal, setNearPortal]     = useState<string | null>(null)  // W4
  const [activeGame, setActiveGame]     = useState<string | null>(null)  // W4
  const [sliceComplete, setSliceComplete] = useState(false) // W5 beat 5
  const [showIntro, setShowIntro]           = useState(false)  // W6 VN cold-open
  const [portalIntroKey, setPortalIntroKey] = useState<string | null>(null) // W7
  const [justEarned, setJustEarned]         = useState<string | null>(null) // W8 pager
  const [showMap, setShowMap]               = useState(false) // The Round map
  const [nearBench, setNearBench]           = useState(false) // Bench Beat
  // District label — sticky: holds the last approached district so the HUD
  // doesn't snap back to "Lanterngate" when Wren steps away from a lamp.
  const [currentDistrict, setCurrentDistrict] = useState('Lanterngate')
  const startMs                             = useRef(Date.now())
  const announced                           = useRef('')
  // W5: persistent lamp progress (localStorage, frontend-only)
  const { completed, markComplete } = useLampProgress()
  const completedRef = useRef(completed)
  useEffect(() => { completedRef.current = completed }, [completed])
  // W9: synthesized audio layer (Web Audio; no files, no deps)
  const audio = useWorldAudio()

  // Refs mirror state so the keyboard handler stays subscribed once.
  const nearPortalRef     = useRef<string | null>(null)
  const activeGameRef     = useRef<string | null>(null)
  const showIntroRef      = useRef(false)
  const portalIntroKeyRef = useRef<string | null>(null)
  const showMapRef        = useRef(false)
  const advanceRef        = useRef<() => void>(() => {})
  useEffect(() => { nearPortalRef.current = nearPortal }, [nearPortal])
  useEffect(() => { activeGameRef.current = activeGame }, [activeGame])
  useEffect(() => { showIntroRef.current = showIntro }, [showIntro])
  useEffect(() => { portalIntroKeyRef.current = portalIntroKey }, [portalIntroKey])
  useEffect(() => { showMapRef.current = showMap }, [showMap])

  // ── W6: VN dialogue (cold-open). Movement pauses while it plays. ───────────
  const endIntro = useCallback(() => { setShowIntro(false); markIntroSeen() }, [])
  const intro = useDialogue(showIntro ? INTRO_SCRIPT : null, {
    reducedMotion,
    onComplete: endIntro,
  })

  // ── W7: per-portal NPC intro — plays once before the errand opens. ──────────
  const endPortalIntro = useCallback(() => {
    const key = portalIntroKeyRef.current
    if (key) markPortalIntroSeen(key)
    setPortalIntroKey(null)
    // Actually open the game after the intro completes.
    if (key) {
      setActiveGame(key)
      setNearPortal(null)
      announced.current = 'Opening errand. Press Escape to return to the city.'
    }
  }, [])
  const portalIntroScript = portalIntroKey ? (PORTAL_INTROS[portalIntroKey] ?? null) : null
  const portalIntro = useDialogue(portalIntroScript, {
    reducedMotion,
    onComplete: endPortalIntro,
  })

  // Master advance ref — whichever dialogue is active, keyboard drives it.
  const activeAdvance = portalIntroKey ? portalIntro.advance : intro.advance
  useEffect(() => { advanceRef.current = activeAdvance }, [activeAdvance])

  // ── Player input (paused while a game, any dialogue, or the map is open) ────
  const anyDialogue = showIntro || !!portalIntroKey
  const { keysRef, joyRef } = useWorldInput(phase === 'ambient' && !activeGame && !anyDialogue && !showMap)

  // ── W4/W7: portal proximity + open/close game ───────────────────────────────
  const handleNearPortalChange = useCallback((key: string | null) => {
    setNearPortal(key)
    // Update the sticky district label when Wren approaches a new lamp.
    if (key && DISTRICT_BY_KEY[key]) setCurrentDistrict(DISTRICT_BY_KEY[key])
  }, [])
  const handleNearBenchChange  = useCallback((near: boolean) => setNearBench(near), [])
  const openNearPortal = useCallback(() => {
    if (activeGameRef.current || !nearPortalRef.current) return
    const key = nearPortalRef.current
    audio.portalTone() // W9: soft rising tone on errand open
    const introLines = PORTAL_INTROS[key]
    if (introLines && !hasSeenPortalIntro(key)) {
      // W7: show the NPC intro first (movement pauses; game opens after it ends)
      setPortalIntroKey(key)
      setNearPortal(null)
      announced.current = 'An errand begins. Press Enter or Space to continue.'
    } else {
      // Skip directly to the game (intro already seen or no intro defined)
      setActiveGame(key)
      setNearPortal(null) // hide prompt; world unmounts while playing
      announced.current = 'Opening errand. Press Escape to return to the city.'
    }
  }, [audio])
  const closeGame = useCallback(() => {
    setActiveGame(null)
    setNearPortal(null) // WrenRig re-detects on remount (Wren spawns away)
    announced.current = 'Back in the city.'
  }, [])
  const handleGameComplete = useCallback((key: string | null) => {
    // No-fail: the shell ended its round. Relight the lamp + return to the world.
    if (key) {
      const isNew = !completedRef.current.has(key)
      markComplete(key)
      // W8: celebrate a genuinely-new stamp on the pager (fades after ~2.6s).
      if (isNew) {
        setJustEarned(key)
        audio.chime()   // W9: pager stamp chime
        audio.relight() // lamp relight arpeggio
        setTimeout(() => setJustEarned((k) => (k === key ? null : k)), 2600)
      }
    }
    setActiveGame(null)
    setNearPortal(null)
    announced.current = '+1 light — the lamp remembers. Back in the city.'
  }, [markComplete, audio])

  // W5: trigger the vertical-slice completion beat when all portals are lit.
  // Uses a useEffect so it reads the freshly-updated `completed` after state settles.
  useEffect(() => {
    if (!sliceComplete && PORTALS.every((p) => completed.has(p.shellKey))) {
      setSliceComplete(true)
    }
  }, [completed, sliceComplete])

  // ── Exit handler ──────────────────────────────────────────────────────────
  const handleExit = useCallback(() => {
    audio.stopAmbient() // W9: fade out the drone on leaving
    const result: SessionResult = {
      correctCount:   0,
      totalQuestions: 0,
      durationMs:     Date.now() - startMs.current,
      shellKey:       'world-englishmetro',
    }
    onSessionComplete?.(result)
  }, [onSessionComplete, audio])

  // ── Begin the journey — triggers W3 arrival + W6 cold-open + W9 ambient ────
  const handleBegin = useCallback(() => {
    setPhase('ambient')
    announced.current = 'You have entered Lanterngate. Press Escape to leave.'
    audio.startAmbient() // W9: the Begin click is the gesture that resumes audio
    // W3: Show "LANTERNGATE" district title for 3s then fade.
    setShowArrival(true)
    setTimeout(() => setShowArrival(false), 3200)
    // W6: play the cold-open VN dialogue once per device (after a short beat
    // so the scene establishes first). Skippable.
    if (!hasSeenIntro()) setTimeout(() => setShowIntro(true), 700)
  }, [audio])

  // ── W3: Bajla flyby — triggers once 1s after entering the world ───────────
  useEffect(() => {
    if (phase !== 'ambient') return
    const t1 = setTimeout(() => setBajlaVariant('flyby'), 1000)
    const t2 = setTimeout(() => setBajlaVariant('idle'),  4800)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [phase])

  // ── Keyboard ───────────────────────────────────────────────────────────────
  // Precedence: map → portal-intro → cold-open → game → portal/world.
  //   • Map open: M / Escape close it.
  //   • Portal-intro playing: Enter/Space advances; Escape skips → opens game.
  //   • Cold-open playing: Enter/Space advances; Escape skips the intro.
  //   • Game open: Escape returns to the city.
  //   • Else: M opens the Round; near a portal Enter/Space opens that errand;
  //     Escape exits the world.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (showMapRef.current) {
        if (e.key === 'Escape' || e.key === 'm' || e.key === 'M') { e.preventDefault(); setShowMap(false) }
        return
      }
      if (portalIntroKeyRef.current) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); advanceRef.current() }
        else if (e.key === 'Escape') { e.preventDefault(); endPortalIntro() }
        return
      }
      if (showIntroRef.current) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); advanceRef.current() }
        else if (e.key === 'Escape') { e.preventDefault(); endIntro() }
        return
      }
      // The Round — only in free-roam (no game/dialogue active).
      if ((e.key === 'm' || e.key === 'M') && !activeGameRef.current) {
        e.preventDefault()
        setShowMap(true)
        return
      }
      if (e.key === 'Escape') {
        if (activeGameRef.current) closeGame()
        else handleExit()
      } else if (e.key === 'Enter') {
        if (!activeGameRef.current && nearPortalRef.current) {
          e.preventDefault()
          openNearPortal()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleExit, closeGame, openNearPortal, endIntro, endPortalIntro])

  // ── Animation flags ────────────────────────────────────────────────────────
  const motesActive = !reducedMotion

  // ── W4: while an errand is open, render ONLY the game (single canvas) ───────
  if (activeGame) {
    const wrap: CSSProperties = fullscreen
      ? { position: 'fixed', inset: 0, width: '100vw', height: '100vh' }
      : { position: 'relative', width: '100%', height: '100%', minHeight: 320 }
    return (
      <div style={wrap}>
        <GameMount shellKey={activeGame} onBack={closeGame} onComplete={handleGameComplete} />
      </div>
    )
  }

  return (
    <CityStage
      quality={quality}
      reducedMotion={reducedMotion}
      fullscreen={fullscreen}
      onError={handleExit}
      cameraPosition={[0, 5, 18]}
      cameraFov={55}
      overlay={
        <>
          {/* Screen-reader live region */}
          <div aria-live="polite" aria-atomic="true"
            style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden',
              clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>
            {announced.current}
          </div>

          {/* Title screen — wordmark sits in the lower band so the menu planet
              reads in the open upper-centre; scrim darkens only toward the text. */}
          {phase === 'title' && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex',
              flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end',
              paddingBottom: '9vh',
              background: 'linear-gradient(180deg, rgba(10,4,24,0) 0%, rgba(10,4,24,0.12) 45%, rgba(10,4,24,0.72) 100%)',
              pointerEvents: 'none',
            }}>
              <div style={{ textAlign: 'center', pointerEvents: 'auto', padding: '0 24px' }}>
                {/* Logo */}
                <div style={{
                  fontFamily: FONT_DISPLAY, fontWeight: 700,
                  fontSize: 'clamp(36px, 10vw, 88px)',
                  letterSpacing: '-0.04em', lineHeight: 0.95,
                  color: '#F5F0FA', marginBottom: 10,
                  textShadow: '0 0 40px rgba(107,79,160,0.6)',
                }}>
                  ENGLISH{' '}
                  <span style={{ color: palette.lanternAmber, textShadow: `0 0 24px ${palette.lanternAmber}99` }}>
                    METRO
                  </span>
                </div>
                {/* Tagline */}
                <p style={{
                  fontFamily: FONT_DISPLAY,
                  fontSize: 'clamp(14px, 2.5vw, 20px)',
                  color: 'rgba(245,240,250,0.65)',
                  letterSpacing: '0.08em', margin: '0 0 40px',
                }}>
                  A city that speaks
                </p>
                {/* Begin CTA */}
                <button
                  type="button"
                  onClick={handleBegin}
                  style={{
                    fontFamily: FONT_DISPLAY, fontWeight: 700,
                    fontSize: 'clamp(14px, 2vw, 18px)',
                    color: palette.night,
                    background: palette.lanternAmber,
                    border: 'none', borderRadius: 9999,
                    padding: '14px 36px',
                    cursor: 'pointer', letterSpacing: '0.03em',
                    boxShadow: `0 0 32px ${palette.lanternAmber}88, 0 4px 24px rgba(0,0,0,0.4)`,
                    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.04)'
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'
                  }}
                >
                  Begin the journey →
                </button>
              </div>
            </div>
          )}

          {/* Ambient HUD (after Begin) */}
          {phase === 'ambient' && (
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', flexDirection: 'column',
              justifyContent: 'flex-end', alignItems: 'flex-end',
              padding: '24px',
              pointerEvents: 'none',
            }}>
              {/* District label */}
              <div style={{
                position: 'absolute', top: 24, left: '50%',
                transform: 'translateX(-50%)',
                fontFamily: FONT_DISPLAY,
                fontSize: 'clamp(11px, 1.5vw, 14px)',
                letterSpacing: '0.28em', textTransform: 'uppercase',
                color: 'rgba(245,240,250,0.55)',
                textShadow: '0 1px 8px rgba(0,0,0,0.6)',
                whiteSpace: 'nowrap',
              }}>
                {currentDistrict} · The Round
              </div>

              {/* Bajla hint (hidden when a portal prompt is showing) */}
              {!nearPortal && (
                <div style={{
                  position: 'absolute', bottom: 80, left: '50%',
                  transform: 'translateX(-50%)',
                  background: 'rgba(10,4,24,0.72)',
                  backdropFilter: 'blur(8px)',
                  borderRadius: 12,
                  padding: '10px 20px',
                  fontFamily: FONT_DISPLAY,
                  fontSize: 'clamp(12px, 1.6vw, 15px)',
                  color: 'rgba(245,240,250,0.78)',
                  textAlign: 'center',
                  border: '1px solid rgba(107,79,160,0.35)',
                  maxWidth: 380,
                }}>
                  🦉 &ldquo;The lamps remember every word you learn.&rdquo; — Bajla
                </div>
              )}

              {/* W4: portal play-prompt — appears when Wren is in range ─────── */}
              {nearPortal && (
                <button
                  type="button"
                  onClick={openNearPortal}
                  style={{
                    position: 'absolute', bottom: 76, left: '50%',
                    transform: 'translateX(-50%)',
                    display: 'flex', alignItems: 'center', gap: 12,
                    background: 'rgba(10,4,24,0.82)',
                    backdropFilter: 'blur(10px)',
                    border: `1px solid ${palette.lanternAmber}88`,
                    borderRadius: 14, padding: '12px 22px',
                    cursor: 'pointer', pointerEvents: 'auto',
                    boxShadow: `0 0 28px ${palette.lanternAmber}44`,
                    animation: 'em-portal-rise 0.28s ease',
                  }}
                >
                  <span style={{
                    fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 13,
                    color: palette.night, background: palette.lanternAmber,
                    borderRadius: 6, padding: '3px 9px', letterSpacing: '0.04em',
                  }}>
                    ↵ Enter
                  </span>
                  <span style={{
                    fontFamily: FONT_DISPLAY, fontWeight: 600,
                    fontSize: 'clamp(13px, 1.7vw, 16px)', color: '#F5F0FA',
                  }}>
                    {PORTALS.find((p) => p.shellKey === nearPortal)?.title ?? 'Play'}
                  </span>
                  <style>{`
                    @keyframes em-portal-rise {
                      from { opacity: 0; transform: translate(-50%, 8px); }
                      to   { opacity: 1; transform: translate(-50%, 0); }
                    }
                  `}</style>
                </button>
              )}

              {/* W8: the Metro Pager (bottom-right) replaces the old top-left
                  counter — it shows the collected stamp seals + progress. */}
              <Pager
                order={PORTALS.map((p) => p.shellKey)}
                completed={completed}
                justEarned={justEarned}
                reducedMotion={reducedMotion}
              />

              {/* W10: "The Round" map button (top-left) */}
              <button
                type="button"
                onClick={() => setShowMap(true)}
                aria-label="Open the Round — district map"
                style={{
                  position: 'absolute', top: 18, left: 24,
                  display: 'flex', alignItems: 'center', gap: 8,
                  fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 12.5,
                  color: 'rgba(245,240,250,0.72)', letterSpacing: '0.06em',
                  background: 'rgba(10,4,24,0.55)',
                  border: '1px solid rgba(245,240,250,0.18)',
                  borderRadius: 9, padding: '8px 14px',
                  cursor: 'pointer', pointerEvents: 'auto',
                }}
              >
                <span style={{ fontSize: 14 }}>◷</span> The Round
              </button>

              {/* W9: mute toggle (top-right) */}
              <button
                type="button"
                onClick={audio.toggleMute}
                aria-label={audio.muted ? 'Unmute sound' : 'Mute sound'}
                style={{
                  position: 'absolute', top: 18, right: 24,
                  width: 34, height: 34, borderRadius: 9,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'rgba(10,4,24,0.55)',
                  border: '1px solid rgba(245,240,250,0.18)',
                  color: 'rgba(245,240,250,0.7)', fontSize: 15,
                  cursor: 'pointer', pointerEvents: 'auto',
                }}
              >
                {audio.muted ? '🔇' : '🔊'}
              </button>

              {/* Controls hint (top-right, below the mute toggle) */}
              <div style={{
                position: 'absolute', top: 60, right: 24,
                fontFamily: FONT_DISPLAY, fontSize: 12,
                color: 'rgba(245,240,250,0.5)', letterSpacing: '0.04em',
                textAlign: 'right', textShadow: '0 1px 6px rgba(0,0,0,0.6)',
                whiteSpace: 'nowrap',
              }}>
                WASD / arrows to walk · Enter to play · drag the dial on touch
              </div>

              {/* Exit button */}
              <button
                type="button"
                onClick={handleExit}
                style={{
                  fontFamily: FONT_DISPLAY, fontWeight: 600,
                  fontSize: 13, color: 'rgba(245,240,250,0.6)',
                  background: 'rgba(10,4,24,0.55)',
                  border: '1px solid rgba(245,240,250,0.18)',
                  borderRadius: 8, padding: '8px 16px',
                  cursor: 'pointer', pointerEvents: 'auto',
                  letterSpacing: '0.06em',
                }}
              >
                Exit city  ⎋
              </button>

              {/* Touch joystick (bottom-left) */}
              <TouchJoystick joyRef={joyRef} />
            </div>
          )}

          {/* W3: "LANTERNGATE" district arrival overlay — fades in+out once */}
          {showArrival && (
            <div
              aria-live="polite"
              style={{
                position: 'absolute', inset: 0,
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                pointerEvents: 'none',
                animation: 'em-arrival 3.2s ease forwards',
              }}
            >
              <style>{`
                @keyframes em-arrival {
                  0%   { opacity: 0; }
                  15%  { opacity: 1; }
                  70%  { opacity: 1; }
                  100% { opacity: 0; }
                }
              `}</style>
              <div style={{
                fontFamily: FONT_DISPLAY, fontWeight: 300,
                fontSize: 'clamp(18px, 4vw, 42px)',
                letterSpacing: '0.52em', textTransform: 'uppercase',
                color: 'rgba(245,240,250,0.9)',
                textShadow: `0 0 32px ${palette.lanternAmber}66, 0 2px 12px rgba(0,0,0,0.7)`,
                marginBottom: 6,
              }}>
                Lanterngate
              </div>
              <div style={{
                fontFamily: FONT_DISPLAY, fontWeight: 400,
                fontSize: 'clamp(11px, 1.5vw, 14px)',
                letterSpacing: '0.22em', textTransform: 'uppercase',
                color: `${palette.lanternAmber}cc`,
              }}>
                The city&apos;s first voice
              </div>
            </div>
          )}

          {/* W5: vertical-slice completion beat (canon Beat 5: "Good errand.") */}
          {sliceComplete && (
            <div
              aria-live="polite"
              role="status"
              style={{
                position: 'absolute', inset: 0,
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                background: 'radial-gradient(ellipse 80% 60% at 50% 60%, rgba(10,4,24,0.82) 0%, rgba(10,4,24,0.55) 100%)',
                pointerEvents: 'auto',
                gap: 16, padding: 24,
                animation: 'em-beat5-in 0.9s ease forwards',
              }}
            >
              <style>{`
                @keyframes em-beat5-in {
                  from { opacity: 0; }
                  to   { opacity: 1; }
                }
              `}</style>
              {/* Bajla quote chip — canon verbatim */}
              <div style={{
                background: 'rgba(10,4,24,0.82)',
                backdropFilter: 'blur(12px)',
                border: `1px solid ${palette.bajlaPurple}55`,
                borderRadius: 16, padding: '18px 28px',
                maxWidth: 420, textAlign: 'center',
              }}>
                <div style={{
                  fontFamily: FONT_DISPLAY, fontWeight: 400,
                  fontSize: 'clamp(16px, 2.4vw, 22px)',
                  color: 'rgba(245,240,250,0.9)',
                  lineHeight: 1.55, marginBottom: 12,
                }}>
                  &ldquo;Good errand.&rdquo;
                </div>
                <div style={{
                  fontFamily: FONT_DISPLAY, fontSize: 13,
                  color: `${palette.bajlaPurple}cc`,
                  letterSpacing: '0.08em',
                }}>
                  — Bajla
                </div>
              </div>
              {/* Lamp count badge */}
              <div style={{
                fontFamily: FONT_DISPLAY, fontWeight: 700,
                fontSize: 'clamp(13px, 2vw, 18px)',
                color: palette.lanternAmber,
                textShadow: `0 0 18px ${palette.lanternAmber}88`,
                letterSpacing: '0.12em',
              }}>
                🕯 {PORTALS.length} lamps lit · the city breathes
              </div>
              {/* Continue button */}
              <button
                type="button"
                onClick={() => setSliceComplete(false)}
                style={{
                  fontFamily: FONT_DISPLAY, fontWeight: 700,
                  fontSize: 14, color: palette.night,
                  background: palette.lanternAmber,
                  border: 'none', borderRadius: 9999,
                  padding: '11px 28px', cursor: 'pointer',
                  letterSpacing: '0.04em', marginTop: 6,
                  boxShadow: `0 0 24px ${palette.lanternAmber}66`,
                }}
              >
                Continue →
              </button>
            </div>
          )}

          {/* W6: VN cold-open dialogue (Bajla → Wren), once per device */}
          {showIntro && intro.line && (
            <DialogueBox
              speaker={intro.line.speaker}
              text={intro.shownText}
              isTyping={intro.isTyping}
              index={intro.index}
              total={intro.total}
              onAdvance={intro.advance}
              onSkip={endIntro}
            />
          )}

          {/* W7: per-portal NPC intro (Flora / Mr. Chen / Bajla) — once per errand */}
          {portalIntroKey && portalIntro.line && (
            <DialogueBox
              speaker={portalIntro.line.speaker}
              text={portalIntro.shownText}
              isTyping={portalIntro.isTyping}
              index={portalIntro.index}
              total={portalIntro.total}
              onAdvance={portalIntro.advance}
              onSkip={endPortalIntro}
            />
          )}

          {/* W10: "The Round" district map */}
          {showMap && (
            <MetroMap completed={completed} onClose={() => setShowMap(false)} reducedMotion={reducedMotion} />
          )}

          {/* Bench Beat — "Watch the Last Train" (canon Beat 5). Shows when
              all errands are complete AND Wren is near the bench. No button —
              Wren just sits; Bajla says one line; the city breathes. */}
          {nearBench && PORTALS.every((p) => completed.has(p.shellKey)) && (
            <div
              aria-live="polite"
              style={{
                position: 'absolute', bottom: 110, left: '50%',
                transform: 'translateX(-50%)',
                pointerEvents: 'none',
                animation: reducedMotion ? 'none' : 'em-bench-in 0.6s ease',
              }}
            >
              <style>{`@keyframes em-bench-in { from { opacity:0; transform: translate(-50%, 10px); } to { opacity:1; transform: translate(-50%, 0); } }`}</style>
              <div style={{
                background: 'rgba(10,4,24,0.78)',
                backdropFilter: 'blur(10px)',
                border: `1px solid ${palette.bajlaPurple}44`,
                borderRadius: 14, padding: '12px 22px',
                textAlign: 'center', maxWidth: 340,
              }}>
                <div style={{
                  fontFamily: FONT_DISPLAY, fontSize: 'clamp(13px, 1.8vw, 16px)',
                  color: 'rgba(245,240,250,0.85)', lineHeight: 1.5,
                }}>
                  &ldquo;The Round never stops. Even when it is quiet.&rdquo;
                </div>
                <div style={{
                  fontFamily: FONT_DISPLAY, fontSize: 12,
                  color: `${palette.bajlaPurple}cc`, marginTop: 6,
                  letterSpacing: '0.08em',
                }}>
                  — Bajla
                </div>
              </div>
            </div>
          )}
        </>
      }
    >
      <WorldScene
        phase={phase}
        motesActive={motesActive}
        reducedMotion={reducedMotion}
        bajlaVariant={bajlaVariant}
        nearPortal={nearPortal}
        completed={completed}
        justEarned={justEarned}
        keysRef={keysRef}
        joyRef={joyRef}
        onNearPortalChange={handleNearPortalChange}
        onNearBenchChange={handleNearBenchChange}
        onFootstep={audio.footstep}
      />
    </CityStage>
  )
}
