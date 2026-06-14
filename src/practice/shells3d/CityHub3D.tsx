// CityHub3D — "City Hub", The Central Square. The Wave-1 FLAGSHIP.
//
// The lantern-lit London-at-dusk plaza players spawn into: a ring of eight
// glowing district buildings around a central lamppost, paper-lantern strings
// overhead, a procedural London skyline (Big Ben / London Eye / St Paul's) in
// silhouette, deterministic twinkling stars + moon, and Bajla the purple owl
// swooping in to greet you. This screen is the public home page of English
// Metropolis and the navigation spine for every practice game.
//
// Binding spec: docs/game3d/storyboards/city-hub.md (read LIVE from gold-deploy).
// `city-hub` is a routing/home label, NOT a 2D shell key — the Hub re-skins no
// single mechanic, so there is no Snake-style "mirror the 2D shell" port. It is
// authored directly against the storyboard's stagecraft and input map.
//
// CONTRACT NOTE (see PR body): the Hub is navigational, not a Q&A puzzle. It
// still implements Game3DProps so the host can mount it through the SAME entry
// point as every other 3D game, and its registry entry `load()` resolves to
// this default export. The storyboard maps the template's question→feedback arc
// onto hub semantics: the "question" is choosing a district, the "correct
// commit" is pressing Enter to dive in. On commit the Hub announces
// "Loading <district>…" and emits ONE SessionResult via onSessionComplete
// (correctCount:1, totalQuestions:1, shellKey:'city-hub') so the host can react
// to the navigation event and lazy-load that district's own 3D shell (the
// existing kit registry owns the real chunk swap + 2D fallback). The Hub adds
// no new backend calls and imports no sibling game chunks (avoids coupling to
// chunks that may not yet exist); the district list is a local Wave-1 manifest
// that mirrors the registry shape.
//
// Contract compliance: single CityStage canvas (DPR clamped, aria-hidden);
// ALL readable English lives in the DOM overlay (never a 3D texture) — building
// nameplates are DOM labels positioned by a LabelProjector exactly like
// Snake3D; quality tiers + reducedMotion honoured (drift / parallax / flicker /
// motes / shadow all gated by useStageQuality()); full keyboard + touch input
// with ≥44px tap targets; procedural geometry + vertex/instance colours only
// (no GLB, no textures, no external URLs, no new deps); allocation-free render
// loop; instanced repeats for buildings, lanterns, stars and motes.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Color, MathUtils, Object3D, Vector3 } from 'three'
import type { InstancedMesh, Mesh, PerspectiveCamera, PointLight } from 'three'
import { Bajla, CityStage, palette, useStageQuality } from './kit'
import type { Game3DProps, SessionResult } from './types'

// ── District manifest — the ring of Wave-1 word-game districts. A local copy
// of the registry shape (shellKey / title / district / objective) so the Hub
// stays self-contained and never imports a sibling game chunk. `objective` is
// the one-line hover hint the storyboard's shot #2 calls for. ───────────────
interface District {
  shellKey: string
  title: string
  district: string
  objective: string
}

const DISTRICTS: District[] = [
  { shellKey: 'snake', title: 'Metro Snake', district: 'The Underground', objective: 'Collect the right word-carriages.' },
  { shellKey: 'hangman', title: 'Lantern Alley', district: 'Lantern Alley', objective: 'Light the lanterns — guess the word.' },
  { shellKey: 'museum', title: 'Museum After Dark', district: 'The Museum', objective: 'Match the artefact to its label.' },
  { shellKey: 'market', title: 'Borough Market', district: 'The Market', objective: 'Trade for the word that fits.' },
  { shellKey: 'mazechase', title: 'Backstreet Chase', district: 'The Backstreets', objective: 'Outrun the fog to the answer.' },
  { shellKey: 'arcade', title: 'Pier Arcade', district: 'The Pier', objective: 'Win tickets with the right pick.' },
  { shellKey: 'observatory', title: 'Greenwich Lights', district: 'The Observatory', objective: 'Chart the word among the stars.' },
  { shellKey: 'gallery', title: 'South Bank Gallery', district: 'The South Bank', objective: 'Frame the matching phrase.' },
]
const RING = DISTRICTS.length // 8

// ── World layout — a ¾-isometric square. Buildings sit on a ring of radius R
// around the origin; the central landmark (lamppost) is at the centre. ──────
const RADIUS = 3.0
const BUILDING_Y = 0 // base sits on the cobbles
const angleFor = (i: number): number => (i / RING) * Math.PI * 2 - Math.PI / 2
const ringX = (i: number): number => Math.cos(angleFor(i)) * RADIUS
const ringZ = (i: number): number => Math.sin(angleFor(i)) * RADIUS

// Per-building deterministic heights / hues (storybook variety without assets).
const BUILDING_H = [1.7, 2.3, 1.4, 2.0, 1.55, 2.45, 1.85, 2.15]
const WINDOW_WARM = '#ffcf7a'

// ── Allocation-free scratch objects (single canvas, single hub instance) ───
const _pos = new Vector3()
const _obj = new Object3D()
const _col = new Color()
const _colA = new Color(palette.duskMid)
const _colB = new Color(palette.ink)

// =========================================================================
// Scene (inside the Canvas — reads live focus/entering each frame via props)
// =========================================================================
interface SceneProps {
  focusIdx: number
  entering: boolean
  reducedMotion: boolean
  bajla: 'idle' | 'flyby' | 'celebrate'
  labelRefs: React.MutableRefObject<(HTMLDivElement | null)[]>
  parallax: React.MutableRefObject<{ x: number; y: number }>
}

function PlazaScene({ focusIdx, entering, reducedMotion, bajla, labelRefs, parallax }: SceneProps) {
  const { settings, tier } = useStageQuality()
  const highFx = tier === 'high' && !reducedMotion

  return (
    <group>
      <CameraRig focusIdx={focusIdx} entering={entering} drift={highFx} reducedMotion={reducedMotion} parallax={parallax} />
      {tier === 'high' && <fog attach="fog" args={[palette.duskHorizon, 11, 26]} />}

      <Skyline />
      <Stars reducedMotion={reducedMotion} count={tier === 'low' ? 0 : tier === 'medium' ? 70 : 120} />
      <Moon />
      <Plaza shadows={settings.shadows} />
      <Buildings focusIdx={focusIdx} reducedMotion={reducedMotion} shadows={settings.shadows} highFx={highFx} />
      <Landmark shadows={settings.shadows} reducedMotion={reducedMotion} highFx={highFx} />
      <LanternStrings flicker={tier !== 'low' && !reducedMotion} highFx={highFx} />
      {settings.particles > 0 && <Motes density={settings.particles} reducedMotion={reducedMotion} />}

      <LabelProjector labelRefs={labelRefs} />

      <Bajla
        variant={bajla}
        reducedMotion={reducedMotion}
        scale={0.42}
        position={[0, 2.35, 0]}
      />
    </group>
  )
}

// ── Camera — fixed ¾-iso framing. Idle = slow orbital drift + clamped mouse
// parallax; on enter = a short dolly-push toward the focused doorway. Drift +
// parallax disabled under reducedMotion (instant). ─────────────────────────
function CameraRig({ focusIdx, entering, drift, reducedMotion, parallax }: { focusIdx: number; entering: boolean; drift: boolean; reducedMotion: boolean; parallax: React.MutableRefObject<{ x: number; y: number }> }) {
  const cam = useThree((s) => s.camera) as PerspectiveCamera
  const base = useRef<[number, number, number]>([0, 6.4, 7.6])
  const lookY = useRef(0.6)
  useFrame((state) => {
    const [bx, by, bz] = base.current
    // Dolly-push target = part-way toward the focused building.
    const dollyX = entering ? ringX(focusIdx) * 0.9 : 0
    const dollyZ = entering ? ringZ(focusIdx) * 0.9 : 0
    const push = entering ? 0.62 : 0 // pull the camera in toward the doorway
    let px = bx + dollyX
    let py = by - push * 1.6
    let pz = bz - push * 3.2 + dollyZ

    if (drift && !reducedMotion && !entering) {
      const t = state.clock.elapsedTime
      px += Math.sin(t * 0.16) * 0.55 + parallax.current.x * 0.6
      py += Math.sin(t * 0.12) * 0.18 - parallax.current.y * 0.35
      pz += Math.cos(t * 0.14) * 0.35
    }

    if (reducedMotion) {
      cam.position.set(px, py, pz)
    } else {
      cam.position.lerp(_pos.set(px, py, pz), entering ? 0.08 : 0.05)
    }
    const ly = entering ? lookY.current + 0.4 : lookY.current
    cam.lookAt(entering ? dollyX : 0, ly, entering ? dollyZ : 0)
  })
  return null
}

// ── London skyline backdrop — procedural extruded silhouette. Big Ben (boxed
// tower + spire), the London Eye (a thin torus + hub), St Paul's (drum + dome
// + lantern), and a run of plain silhouette blocks. Instanced where possible;
// all flat night-violet vertex colour, fading into the CityStage dusk sky. ──
function Skyline() {
  const blocks = useRef<InstancedMesh>(null)
  const SLABS = 14
  const layout = useMemo(() => {
    // Deterministic block field along a back arc (behind the building ring).
    let s = 9
    const rand = (): number => { s = (s * 9301 + 49297) % 233280; return s / 233280 }
    const out: { x: number; y: number; w: number; h: number; d: number }[] = []
    for (let i = 0; i < SLABS; i++) {
      const spread = (i / (SLABS - 1) - 0.5) * 22
      const h = 1.6 + rand() * 3.4
      out.push({ x: spread, y: h / 2 - 0.5, w: 0.9 + rand() * 1.3, h, d: 0.6 + rand() * 0.6 })
    }
    return out
  }, [])
  useEffect(() => {
    const mesh = blocks.current
    if (!mesh) return
    layout.forEach((b, i) => {
      _obj.position.set(b.x, b.y, -8.5 - (i % 3) * 0.7)
      _obj.rotation.set(0, 0, 0)
      _obj.scale.set(b.w, b.h, b.d)
      _obj.updateMatrix()
      mesh.setMatrixAt(i, _obj.matrix)
      _col.lerpColors(_colA, _colB, (i % 5) / 5)
      mesh.setColorAt(i, _col)
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [layout])

  return (
    <group>
      {/* Generic silhouette block field */}
      <instancedMesh ref={blocks} args={[undefined, undefined, SLABS]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial vertexColors roughness={1} />
      </instancedMesh>

      {/* Big Ben — tower + clock face + spire, far left */}
      <group position={[-7.4, 0, -9.2]}>
        <mesh position={[0, 2.1, 0]}>
          <boxGeometry args={[1.0, 4.6, 1.0]} />
          <meshStandardMaterial color={palette.night} roughness={1} />
        </mesh>
        {/* Clock face (emissive, no text — readable English never baked in 3D) */}
        <mesh position={[0, 3.7, 0.52]}>
          <circleGeometry args={[0.3, 20]} />
          <meshStandardMaterial color={WINDOW_WARM} emissive={WINDOW_WARM} emissiveIntensity={0.7} />
        </mesh>
        {/* Spire */}
        <mesh position={[0, 4.9, 0]}>
          <coneGeometry args={[0.62, 1.1, 4]} />
          <meshStandardMaterial color={palette.night} roughness={1} />
        </mesh>
      </group>

      {/* London Eye — open wheel of thin spokes + hub, mid-left */}
      <group position={[-3.0, 2.7, -10.0]}>
        <mesh rotation={[0, 0, 0]}>
          <torusGeometry args={[1.5, 0.05, 8, 36]} />
          <meshStandardMaterial color={palette.night} roughness={1} />
        </mesh>
        <mesh>
          <sphereGeometry args={[0.16, 10, 8]} />
          <meshStandardMaterial color={palette.night} roughness={1} />
        </mesh>
        <Spokes />
      </group>

      {/* St Paul's — drum + dome + lantern, right */}
      <group position={[6.4, 0, -9.4]}>
        <mesh position={[0, 1.6, 0]}>
          <boxGeometry args={[2.0, 3.2, 1.4]} />
          <meshStandardMaterial color={palette.night} roughness={1} />
        </mesh>
        <mesh position={[0, 3.5, 0]}>
          <sphereGeometry args={[1.0, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color={palette.night} roughness={1} />
        </mesh>
        <mesh position={[0, 4.5, 0]}>
          <cylinderGeometry args={[0.18, 0.22, 0.5, 10]} />
          <meshStandardMaterial color={palette.night} roughness={1} />
        </mesh>
        <mesh position={[0, 4.85, 0]}>
          <coneGeometry args={[0.16, 0.3, 8]} />
          <meshStandardMaterial color={palette.night} roughness={1} />
        </mesh>
      </group>
    </group>
  )
}

// Thin radial spokes of the London Eye (static, instanced).
function Spokes() {
  const inst = useRef<InstancedMesh>(null)
  const N = 12
  useEffect(() => {
    const mesh = inst.current
    if (!mesh) return
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2
      _obj.position.set(Math.cos(a) * 0.75, Math.sin(a) * 0.75, 0)
      _obj.rotation.set(0, 0, a + Math.PI / 2)
      _obj.scale.set(0.02, 1.5, 0.02)
      _obj.updateMatrix()
      mesh.setMatrixAt(i, _obj.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  }, [])
  return (
    <instancedMesh ref={inst} args={[undefined, undefined, N]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color={palette.night} roughness={1} />
    </instancedMesh>
  )
}

// ── Deterministic twinkling stars (instanced) + moon. ──────────────────────
function Stars({ reducedMotion, count }: { reducedMotion: boolean; count: number }) {
  const inst = useRef<InstancedMesh>(null)
  const seeds = useMemo(() => {
    let s = 7
    const rand = (): number => { s = (s * 9301 + 49297) % 233280; return s / 233280 }
    return Array.from({ length: count }, () => ({
      x: (rand() - 0.5) * 30,
      y: 5 + rand() * 9,
      z: -12 - rand() * 4,
      sc: 0.02 + rand() * 0.05,
      ph: rand() * 6.28,
    }))
  }, [count])
  useEffect(() => {
    const mesh = inst.current
    if (!mesh || count === 0) return
    seeds.forEach((st, i) => {
      _obj.position.set(st.x, st.y, st.z)
      _obj.rotation.set(0, 0, 0)
      _obj.scale.setScalar(st.sc)
      _obj.updateMatrix()
      mesh.setMatrixAt(i, _obj.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
  }, [seeds, count])
  useFrame((state) => {
    const mesh = inst.current
    if (!mesh || count === 0 || reducedMotion) return
    const mat = mesh.material as { emissiveIntensity?: number }
    if (mat) mat.emissiveIntensity = 0.7 + Math.sin(state.clock.elapsedTime * 1.6) * 0.25
  })
  if (count === 0) return null
  return (
    <instancedMesh ref={inst} args={[undefined, undefined, count]} frustumCulled={false}>
      <sphereGeometry args={[1, 6, 6]} />
      <meshStandardMaterial color={palette.ember} emissive={palette.ember} emissiveIntensity={0.8} />
    </instancedMesh>
  )
}

function Moon() {
  return (
    <group position={[5.5, 7.2, -11]}>
      <mesh>
        <sphereGeometry args={[0.9, 20, 16]} />
        <meshStandardMaterial color={palette.lanternCore} emissive={palette.lanternCore} emissiveIntensity={0.55} roughness={1} />
      </mesh>
      <mesh scale={1.4}>
        <sphereGeometry args={[0.9, 16, 12]} />
        <meshStandardMaterial color={palette.skyGlow} emissive={palette.skyGlow} emissiveIntensity={0.18} transparent opacity={0.18} />
      </mesh>
    </group>
  )
}

// ── Plaza ground — low-poly wet cobble slab with warm reflections + a brass
// ring inlay tracing the district circle. Receives the lone shadow on high. ─
function Plaza({ shadows }: { shadows: boolean }) {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow={shadows}>
        <circleGeometry args={[6.2, 48]} />
        <meshStandardMaterial color={palette.ink} roughness={0.55} metalness={0.2} />
      </mesh>
      {/* Warm reflection pool under the lamppost */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.015, 0]}>
        <circleGeometry args={[1.6, 32]} />
        <meshStandardMaterial color={palette.lanternAmber} emissive={palette.lanternAmber} emissiveIntensity={0.12} transparent opacity={0.22} roughness={0.4} />
      </mesh>
      {/* Brass ring inlay tracing the district circle */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <ringGeometry args={[RADIUS - 0.12, RADIUS + 0.12, 56]} />
        <meshStandardMaterial color={palette.brass} emissive={palette.brass} emissiveIntensity={0.18} roughness={0.5} metalness={0.5} side={2} />
      </mesh>
      {/* Outer plaza lip */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]}>
        <ringGeometry args={[6.0, 6.4, 56]} />
        <meshStandardMaterial color={palette.duskMid} roughness={1} side={2} />
      </mesh>
    </group>
  )
}

// ── District buildings — eight instanced low-poly shells around the ring, each
// with a warm doorway + window band. The FOCUSED building lifts and its lantern
// brightens (instant under reducedMotion). Shared geometry, vertex colours. ─
function Buildings({ focusIdx, reducedMotion, shadows, highFx }: { focusIdx: number; reducedMotion: boolean; shadows: boolean; highFx: boolean }) {
  const shells = useRef<InstancedMesh>(null)
  const doors = useRef<InstancedMesh>(null)
  const lanterns = useRef<InstancedMesh>(null)
  const lift = useRef<number[]>(DISTRICTS.map(() => 0))

  // Static colour bake for the shells (deterministic hue variety).
  useEffect(() => {
    const mesh = shells.current
    if (!mesh) return
    for (let i = 0; i < RING; i++) {
      _col.set(palette.duskMid).lerp(_colB, (i % 4) / 6)
      mesh.setColorAt(i, _col)
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [])

  useFrame((state) => {
    const shellMesh = shells.current
    const doorMesh = doors.current
    const lantMesh = lanterns.current
    if (!shellMesh || !doorMesh || !lantMesh) return
    const t = state.clock.elapsedTime
    for (let i = 0; i < RING; i++) {
      const focused = i === focusIdx
      const target = focused ? 0.42 : 0
      lift.current[i] = reducedMotion ? target : MathUtils.lerp(lift.current[i], target, 0.16)
      const y = lift.current[i]
      const h = BUILDING_H[i]
      const x = ringX(i)
      const z = ringZ(i)
      const face = angleFor(i) + Math.PI / 2 // face inward toward the centre

      // Shell
      _obj.position.set(x, BUILDING_Y + h / 2 + y, z)
      _obj.rotation.set(0, -face, 0)
      _obj.scale.set(1.1, h, 1.1)
      _obj.updateMatrix()
      shellMesh.setMatrixAt(i, _obj.matrix)

      // Doorway (slightly proud of the inward face)
      const dx = x - Math.cos(angleFor(i)) * 0.6
      const dz = z - Math.sin(angleFor(i)) * 0.6
      _obj.position.set(dx, BUILDING_Y + 0.34 + y, dz)
      _obj.rotation.set(0, -face, 0)
      _obj.scale.set(0.42, 0.68, 0.1)
      _obj.updateMatrix()
      doorMesh.setMatrixAt(i, _obj.matrix)

      // Rooftop lantern — brighten on focus
      _obj.position.set(x, BUILDING_Y + h + 0.28 + y, z)
      _obj.rotation.set(0, 0, 0)
      const pulse = focused && highFx ? 1 + Math.sin(t * 5) * 0.12 : 1
      _obj.scale.setScalar(0.16 * pulse)
      _obj.updateMatrix()
      lantMesh.setMatrixAt(i, _obj.matrix)
      _col.set(focused ? palette.lanternCore : palette.lanternAmber)
      lantMesh.setColorAt(i, _col)
    }
    shellMesh.instanceMatrix.needsUpdate = true
    doorMesh.instanceMatrix.needsUpdate = true
    lantMesh.instanceMatrix.needsUpdate = true
    if (lantMesh.instanceColor) lantMesh.instanceColor.needsUpdate = true
  })

  return (
    <group>
      <instancedMesh ref={shells} args={[undefined, undefined, RING]} castShadow={shadows} receiveShadow={shadows} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial vertexColors roughness={0.9} />
      </instancedMesh>
      {/* Warm doorways — emissive amber glow (the "lit doorway" you pick) */}
      <instancedMesh ref={doors} args={[undefined, undefined, RING]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color={WINDOW_WARM} emissive={WINDOW_WARM} emissiveIntensity={0.6} roughness={0.5} />
      </instancedMesh>
      {/* Rooftop lanterns */}
      <instancedMesh ref={lanterns} args={[undefined, undefined, RING]} frustumCulled={false}>
        <sphereGeometry args={[1, 12, 10]} />
        <meshStandardMaterial vertexColors emissive={palette.lanternAmber} emissiveIntensity={0.85} roughness={0.6} />
      </instancedMesh>
    </group>
  )
}

// ── Central landmark — a tall Victorian lamppost where Bajla perches. One warm
// point light on high tier; gentle flicker. ─────────────────────────────────
function Landmark({ shadows, reducedMotion, highFx }: { shadows: boolean; reducedMotion: boolean; highFx: boolean }) {
  const lamp = useRef<Mesh>(null)
  const light = useRef<PointLight>(null)
  useFrame((state) => {
    if (reducedMotion) return
    const f = 0.7 + Math.sin(state.clock.elapsedTime * 6) * 0.12 + Math.sin(state.clock.elapsedTime * 11) * 0.06
    const m = lamp.current
    if (m) {
      const mat = m.material as { emissiveIntensity?: number }
      if (mat) mat.emissiveIntensity = 0.8 + f * 0.4
    }
    if (light.current && highFx) light.current.intensity = 0.7 + f * 0.5
  })
  return (
    <group>
      {/* Base + column */}
      <mesh position={[0, 0.12, 0]} castShadow={shadows}>
        <cylinderGeometry args={[0.34, 0.4, 0.24, 12]} />
        <meshStandardMaterial color={palette.ink} roughness={0.8} metalness={0.3} />
      </mesh>
      <mesh position={[0, 1.1, 0]} castShadow={shadows}>
        <cylinderGeometry args={[0.08, 0.12, 2.0, 10]} />
        <meshStandardMaterial color={palette.brass} roughness={0.5} metalness={0.5} />
      </mesh>
      {/* Lamp head */}
      <mesh ref={lamp} position={[0, 2.2, 0]}>
        <sphereGeometry args={[0.26, 14, 12]} />
        <meshStandardMaterial color={palette.lanternCore} emissive={palette.lanternAmber} emissiveIntensity={0.9} roughness={0.6} />
      </mesh>
      <mesh position={[0, 2.46, 0]}>
        <coneGeometry args={[0.22, 0.22, 8]} />
        <meshStandardMaterial color={palette.brass} roughness={0.5} metalness={0.5} />
      </mesh>
      {highFx && <pointLight ref={light} position={[0, 2.2, 0]} color={palette.lanternAmber} intensity={0.8} distance={10} decay={2} />}
    </group>
  )
}

// ── Paper-lantern strings overhead — instanced glowing spheres on sagging
// arcs spanning the plaza. Gentle emissive flicker on high/medium. ──────────
function LanternStrings({ flicker, highFx }: { flicker: boolean; highFx: boolean }) {
  const inst = useRef<InstancedMesh>(null)
  const STRANDS = 4
  const PER = 6
  const total = STRANDS * PER
  const positions = useMemo(() => {
    const out: [number, number, number][] = []
    for (let s = 0; s < STRANDS; s++) {
      const a = (s / STRANDS) * Math.PI - Math.PI / 2
      const x0 = Math.cos(a) * 4.6
      const z0 = Math.sin(a) * 4.6
      const x1 = -x0
      const z1 = -z0
      for (let i = 0; i < PER; i++) {
        const t = (i + 0.5) / PER
        const x = x0 + (x1 - x0) * t
        const z = z0 + (z1 - z0) * t
        const sag = Math.sin(t * Math.PI) * 0.7
        out.push([x, 4.0 - sag, z])
      }
    }
    return out
  }, [])
  useEffect(() => {
    const mesh = inst.current
    if (!mesh) return
    positions.forEach((p, i) => {
      _obj.position.set(p[0], p[1], p[2])
      _obj.rotation.set(0, 0, 0)
      _obj.scale.setScalar(0.11)
      _obj.updateMatrix()
      mesh.setMatrixAt(i, _obj.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
  }, [positions])
  useFrame((state) => {
    if (!flicker) return
    const mesh = inst.current
    if (!mesh) return
    const mat = mesh.material as { emissiveIntensity?: number }
    if (mat) mat.emissiveIntensity = 0.85 + Math.sin(state.clock.elapsedTime * 5.5) * 0.18
  })
  return (
    <group>
      <instancedMesh ref={inst} args={[undefined, undefined, total]} frustumCulled={false}>
        <sphereGeometry args={[1, 12, 10]} />
        <meshStandardMaterial color={palette.lanternCore} emissive={palette.lanternAmber} emissiveIntensity={0.85} roughness={0.6} />
      </instancedMesh>
      {/* A faint rope arc per strand (thin static boxes) */}
      <StringRopes strands={STRANDS} />
      {highFx && <pointLight position={[0, 3.6, 0]} color={palette.lanternAmber} intensity={0.4} distance={9} decay={2} />}
    </group>
  )
}

// Thin gold rope arcs (one stretched box per strand — purely decorative).
function StringRopes({ strands }: { strands: number }) {
  const inst = useRef<InstancedMesh>(null)
  useEffect(() => {
    const mesh = inst.current
    if (!mesh) return
    for (let s = 0; s < strands; s++) {
      const a = (s / strands) * Math.PI - Math.PI / 2
      _obj.position.set(0, 3.85, 0)
      _obj.rotation.set(0, -a, 0)
      _obj.scale.set(9.2, 0.02, 0.02)
      _obj.updateMatrix()
      mesh.setMatrixAt(s, _obj.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  }, [strands])
  return (
    <instancedMesh ref={inst} args={[undefined, undefined, strands]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color={palette.gold} emissive={palette.gold} emissiveIntensity={0.15} roughness={0.6} metalness={0.4} />
    </instancedMesh>
  )
}

// ── Light motes — sparse drifting embers (gated by quality particle budget). ─
function Motes({ density, reducedMotion }: { density: number; reducedMotion: boolean }) {
  const inst = useRef<InstancedMesh>(null)
  const count = Math.max(0, Math.round(36 * density))
  const seeds = useMemo(() => Array.from({ length: count }, (_, i) => ({
    x: (Math.sin(i * 12.9898) * 43758.5453 % 1) * 11 - 5.5,
    z: (Math.sin(i * 78.233) * 12543.123 % 1) * 11 - 5.5,
    speed: 0.16 + (i % 5) * 0.03,
    phase: (i / Math.max(1, count)) * 4,
  })), [count])
  useFrame((state) => {
    const mesh = inst.current
    if (!mesh || count === 0) return
    const t = reducedMotion ? 0 : state.clock.elapsedTime
    for (let i = 0; i < count; i++) {
      const s = seeds[i]
      const y = ((t * s.speed + s.phase) % 3.4) + 0.2
      _obj.position.set(s.x + Math.sin(t * 0.4 + i) * 0.12, y, s.z)
      _obj.scale.setScalar(0.02 + (i % 3) * 0.006)
      _obj.updateMatrix()
      mesh.setMatrixAt(i, _obj.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  })
  if (count === 0) return null
  return (
    <instancedMesh ref={inst} args={[undefined, undefined, count]} frustumCulled={false}>
      <sphereGeometry args={[1, 6, 6]} />
      <meshStandardMaterial color={palette.ember} emissive={palette.ember} emissiveIntensity={0.8} transparent opacity={0.75} />
    </instancedMesh>
  )
}

// ── LabelProjector — projects each building's 3D world position to screen px
// and writes it onto the DOM nameplate transforms. ALL readable English (the
// district titles + objectives) stays crisp DOM, never baked into a texture. ─
function LabelProjector({ labelRefs }: { labelRefs: React.MutableRefObject<(HTMLDivElement | null)[]> }) {
  const cam = useThree((s) => s.camera) as PerspectiveCamera
  const size = useThree((s) => s.size)
  useFrame(() => {
    for (let i = 0; i < RING; i++) {
      const el = labelRefs.current[i]
      if (!el) continue
      _pos.set(ringX(i), BUILDING_H[i] + 0.7, ringZ(i)).project(cam)
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
// CityHub3D — the Game3D component (default export)
// =========================================================================
export default function CityHub3D({ onSessionComplete, quality, reducedMotion, fullscreen }: Game3DProps) {
  const prefersReduced = usePrefersReducedMotion()
  const reduce = reducedMotion ?? prefersReduced

  const labelRefs = useRef<(HTMLDivElement | null)[]>([])
  const parallax = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  const startMs = useRef(performance.now())
  const greeted = useRef(false)

  const [focusIdx, setFocusIdx] = useState(0)
  const [entering, setEntering] = useState<number | null>(null)
  const [greeting, setGreeting] = useState(true)
  const [signedIn, setSignedIn] = useState(false)
  const [showLogin, setShowLogin] = useState(false)
  const [live, setLive] = useState('Welcome to Fluent City. Use arrow keys to choose a district, then press Enter to play.')
  const enterTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const focused = DISTRICTS[focusIdx]
  const bajla: 'idle' | 'flyby' | 'celebrate' = greeting ? 'flyby' : signedIn ? 'celebrate' : 'idle'

  // Bajla's intro flyby plays once on spawn, then she settles to idle guide.
  useEffect(() => {
    if (greeted.current) return
    greeted.current = true
    const id = setTimeout(() => setGreeting(false), reduce ? 0 : 2600)
    return () => clearTimeout(id)
  }, [reduce])

  const announceFocus = useCallback((idx: number) => {
    const d = DISTRICTS[idx]
    setLive(`Focused: ${d.title}. ${d.objective} Press Enter to play.`)
  }, [])

  const moveFocus = useCallback((delta: number) => {
    setFocusIdx((i) => {
      const next = (i + delta + RING) % RING
      announceFocus(next)
      return next
    })
  }, [announceFocus])

  const enterDistrict = useCallback((idx: number) => {
    if (entering !== null) return
    const d = DISTRICTS[idx]
    setEntering(idx)
    setLive(`Loading ${d.title}…`)
    // The dolly-push masks the (host-owned) chunk load. After the push we emit
    // the navigation event so the host can lazy-load the district's 3D shell.
    if (enterTimer.current) clearTimeout(enterTimer.current)
    enterTimer.current = setTimeout(() => {
      const result: SessionResult = {
        correctCount: 1,
        totalQuestions: 1,
        durationMs: Math.round(performance.now() - startMs.current),
        shellKey: 'city-hub',
      }
      onSessionComplete?.(result)
    }, reduce ? 0 : 1400)
  }, [entering, onSessionComplete, reduce])

  // Keyboard — Arrow/WASD rotate focus around the ring; Enter/Space enters;
  // Esc closes the login sheet (the storyboard's "return to Hub").
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (showLogin) {
        if (e.key === 'Escape') { e.preventDefault(); setShowLogin(false); setLive('Sign-in closed.') }
        return
      }
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D' || e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
        e.preventDefault(); moveFocus(1)
      } else if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A' || e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        e.preventDefault(); moveFocus(-1)
      } else if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault(); enterDistrict(focusIdx)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        if (entering !== null) { setEntering(null); setLive('Returned to the square.') }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [moveFocus, enterDistrict, focusIdx, entering, showLogin])

  // Clamped mouse parallax (high tier only — read in CameraRig). reducedMotion
  // leaves it at zero so the camera stays still.
  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (reduce) return
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    parallax.current.x = MathUtils.clamp(((e.clientX - r.left) / r.width - 0.5) * 2, -1, 1)
    parallax.current.y = MathUtils.clamp(((e.clientY - r.top) / r.height - 0.5) * 2, -1, 1)
  }, [reduce])

  // Touch — swipe to rotate focus around the ring.
  const touch = useRef<{ x: number; y: number } | null>(null)
  const onTouchStart = (e: React.TouchEvent) => { const t = e.touches[0]; touch.current = { x: t.clientX, y: t.clientY } }
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!touch.current) return
    const t = e.changedTouches[0]
    const dx = t.clientX - touch.current.x
    const dy = t.clientY - touch.current.y
    touch.current = null
    if (Math.abs(dx) < 30 && Math.abs(dy) < 30) return
    moveFocus(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : -1) : (dy > 0 ? 1 : -1))
  }

  const signIn = useCallback(() => {
    // The Hub adds no backend calls — this is the diegetic gate stub that the
    // host wires to the existing auth contexts. Lighting the gate is local UI.
    setSignedIn(true)
    setShowLogin(false)
    setLive('Signed in — the whole metropolis lights up. All districts unlocked.')
  }, [])

  // Cleanup timer on unmount.
  useEffect(() => () => { if (enterTimer.current) clearTimeout(enterTimer.current) }, [])

  const overlay = (
    <div style={{ position: 'absolute', inset: 0, fontFamily: 'var(--em-mono, ui-monospace, monospace)', color: '#EDE6FF' }}>
      <style>{`
        @keyframes ch-pop { 0%{transform:translateY(8px);opacity:0} 100%{transform:translateY(0);opacity:1} }
        @keyframes ch-pulse { 0%,100%{box-shadow:0 0 0 0 ${palette.lanternAmber}00} 50%{box-shadow:0 0 0 3px ${palette.lanternAmber}cc} }
      `}</style>

      {/* Screen-reader live region (canvas is aria-hidden inside CityStage) */}
      <div role="status" aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{live}</div>

      {/* Wordmark — top-left */}
      <div style={{ position: 'absolute', top: 14, left: 16 }}>
        <div style={{ fontFamily: 'var(--em-decor, system-ui)', fontSize: 22, letterSpacing: '0.04em', color: palette.lanternCore, textShadow: `0 0 18px ${palette.lanternAmber}88` }}>Fluent City</div>
        <div style={{ fontSize: 10, letterSpacing: '0.22em', opacity: 0.75, textTransform: 'uppercase' }}>The Central Square</div>
      </div>

      {/* Sign in / signed-in chip — top-right */}
      <div style={{ position: 'absolute', top: 14, right: 16, pointerEvents: 'auto' }}>
        {signedIn ? (
          <span style={{ fontSize: 11, letterSpacing: '0.14em', color: palette.leaf, border: `1px solid ${palette.leaf}66`, borderRadius: 999, padding: '8px 14px', background: 'rgba(127,176,105,0.12)' }}>SIGNED IN ✦</span>
        ) : (
          <button onClick={() => { setShowLogin(true); setLive('Sign-in opened. Two tabs collapsed into one form, plus continue with Google.') }} style={chipStyle()} aria-label="Sign in to Fluent City">Sign in</button>
        )}
      </div>

      {/* District nameplates — DOM, positioned by the 3D LabelProjector. The
          focused plate lifts its styling; clicking a plate focuses, clicking
          again enters (mirrors tap-to-focus / tap-again-to-enter). */}
      {DISTRICTS.map((d, i) => (
        <button
          key={d.shellKey}
          ref={(el) => { labelRefs.current[i] = el }}
          onClick={() => (i === focusIdx ? enterDistrict(i) : (setFocusIdx(i), announceFocus(i)))}
          aria-label={`${d.title}. ${d.objective}${i === focusIdx ? ' Focused — press Enter to play.' : ''}`}
          aria-current={i === focusIdx ? 'true' : undefined}
          style={{
            position: 'absolute', top: 0, left: 0, opacity: 0, pointerEvents: 'auto',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
            minHeight: 44, padding: '6px 12px', borderRadius: 12, whiteSpace: 'nowrap', cursor: 'pointer',
            background: i === focusIdx ? 'rgba(20,16,42,0.96)' : 'rgba(14,10,26,0.78)',
            border: `1px solid ${i === focusIdx ? palette.lanternAmber : 'rgba(255,255,255,0.22)'}`,
            color: i === focusIdx ? palette.lanternCore : '#EDE6FF',
            boxShadow: i === focusIdx ? `0 0 18px ${palette.lanternAmber}66` : 'none',
            transition: reduce ? 'none' : 'border-color 160ms, box-shadow 160ms, background 160ms',
            touchAction: 'manipulation',
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 700 }}>{d.title}</span>
          {i === focusIdx && <span style={{ fontSize: 10, opacity: 0.85, letterSpacing: '0.04em', fontWeight: 400 }}>{d.objective}</span>}
        </button>
      ))}

      {/* Focused-district panel — bottom-centre, with the canonical Enter CTA */}
      {entering === null && (
        <div style={{
          position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
          display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 14,
          background: 'linear-gradient(90deg, rgba(255,179,71,0.14), rgba(20,16,42,0.85))',
          border: `1px solid ${palette.lanternAmber}55`, backdropFilter: 'blur(4px)',
          pointerEvents: 'auto', maxWidth: 'min(560px, 92%)', animation: reduce ? undefined : 'ch-pop 320ms ease',
        }} key={`f-${focusIdx}`}>
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <span style={{ fontSize: 9, letterSpacing: '0.2em', color: palette.lanternAmber, textTransform: 'uppercase' }}>{focused.district}</span>
            <span style={{ fontFamily: 'var(--em-decor, var(--em-mono, system-ui))', fontSize: 16, lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis' }}>{focused.title}</span>
          </div>
          <button onClick={() => enterDistrict(focusIdx)} style={enterBtnStyle()} aria-label={`Enter ${focused.title}`}>Enter →</button>
        </div>
      )}

      {/* Ring controls — bottom-left arrows to rotate focus (touch friendly) */}
      <div style={{ position: 'absolute', bottom: 16, left: 16, display: 'flex', gap: 8, pointerEvents: 'auto' }}>
        <button onClick={() => moveFocus(-1)} style={navBtnStyle()} aria-label="Previous district">‹</button>
        <button onClick={() => moveFocus(1)} style={navBtnStyle()} aria-label="Next district">›</button>
      </div>

      {/* Greeting veil — Bajla swoops in; dismiss to start choosing */}
      {greeting && (
        <button
          onClick={() => setGreeting(false)}
          style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, background: 'rgba(10,5,24,0.35)', border: 'none', cursor: 'pointer', pointerEvents: 'auto', color: '#EDE6FF' }}
          aria-label="Enter the square"
        >
          <div style={{ fontFamily: 'var(--em-decor, system-ui)', fontSize: 36, color: palette.lanternCore, textShadow: `0 0 22px ${palette.lanternAmber}aa` }}>Fluent City</div>
          <div style={{ fontSize: 12, letterSpacing: '0.2em', opacity: 0.85 }}>THE CENTRAL SQUARE · press / tap to begin</div>
        </button>
      )}

      {/* Entering veil — dolly-push announcement */}
      {entering !== null && (
        <div role="status" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `radial-gradient(ellipse, ${palette.lanternAmber}22, rgba(10,5,24,0.5))` }}>
          <div style={{ fontFamily: 'var(--em-decor, system-ui)', fontSize: 26, color: palette.lanternCore, textShadow: `0 0 18px ${palette.lanternAmber}aa` }}>Loading {DISTRICTS[entering].title}…</div>
        </div>
      )}

      {/* Diegetic gate — the universal sign-in as a DOM card / bottom-sheet.
          The Hub introduces no new auth; this is the gate the host wires to the
          existing student/admin/Google contexts. */}
      {showLogin && (
        <div role="dialog" aria-modal="true" aria-label="Sign in to Fluent City" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', background: 'rgba(10,5,24,0.55)', backdropFilter: 'blur(6px)', pointerEvents: 'auto' }}>
          <div style={{ width: 'min(420px, 96%)', margin: 16, padding: 20, borderRadius: 16, background: 'rgba(20,14,42,0.98)', border: `1px solid ${palette.brass}77`, boxShadow: `0 0 40px ${palette.lanternAmber}44` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <span style={{ fontFamily: 'var(--em-decor, system-ui)', fontSize: 20, color: palette.lanternCore }}>Light up the city</span>
              <button onClick={() => { setShowLogin(false); setLive('Sign-in closed.') }} style={navBtnStyle()} aria-label="Close sign-in">✕</button>
            </div>
            <label style={{ fontSize: 11, letterSpacing: '0.12em', opacity: 0.8, textTransform: 'uppercase' }}>Email
              <input type="email" autoComplete="username" style={inputStyle()} placeholder="you@example.com" />
            </label>
            <label style={{ fontSize: 11, letterSpacing: '0.12em', opacity: 0.8, textTransform: 'uppercase', marginTop: 10, display: 'block' }}>Password
              <input type="password" autoComplete="current-password" style={inputStyle()} placeholder="••••••••" />
            </label>
            <button onClick={signIn} style={{ ...enterBtnStyle(), width: '100%', marginTop: 16, justifyContent: 'center' }}>Sign in</button>
            <button onClick={signIn} style={{ ...chipStyle(), width: '100%', marginTop: 8, justifyContent: 'center', display: 'flex' }} aria-label="Continue with Google">Continue with Google</button>
            <p style={{ fontSize: 10, opacity: 0.6, marginTop: 12, lineHeight: 1.4 }}>One form for students and schools — tries student then school sign-in. Signing in unlocks every district and fullscreen.</p>
          </div>
        </div>
      )}

      {/* Signed-in celebrate ribbon — appears once the gate lanterns light */}
      {signedIn && (
        <div style={{ position: 'absolute', top: 56, right: 16, fontSize: 11, letterSpacing: '0.06em', color: palette.leaf, background: 'rgba(127,176,105,0.1)', border: `1px solid ${palette.leaf}55`, borderRadius: 10, padding: '8px 12px', maxWidth: 220 }}>
          The metropolis is lit. Pick any district and dive in.
        </div>
      )}
    </div>
  )

  return (
    <div
      role="application"
      aria-label="City Hub — the Fluent City central square. Choose a district and press Enter to play."
      style={{ position: 'relative', width: '100%', height: '100%', minHeight: 320 }}
      onPointerMove={onPointerMove}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <CityStage
        quality={quality}
        reducedMotion={reduce}
        fullscreen={fullscreen}
        cameraPosition={[0, 6.4, 7.6]}
        cameraFov={35}
        overlay={overlay}
      >
        <PlazaScene
          focusIdx={focusIdx}
          entering={entering !== null}
          reducedMotion={reduce}
          bajla={bajla}
          labelRefs={labelRefs}
          parallax={parallax}
        />
      </CityStage>
    </div>
  )
}

// ── Small DOM helpers ──────────────────────────────────────────────────────
function enterBtnStyle(): React.CSSProperties {
  return {
    minHeight: 44, minWidth: 88, padding: '10px 18px', borderRadius: 10,
    background: palette.lanternAmber, border: `1px solid ${palette.lanternCore}`,
    color: '#2a1604', fontFamily: 'var(--em-mono, ui-monospace, monospace)', fontSize: 13, fontWeight: 700,
    letterSpacing: '0.06em', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
    touchAction: 'manipulation', flexShrink: 0,
  }
}

function chipStyle(): React.CSSProperties {
  return {
    minHeight: 44, padding: '10px 16px', borderRadius: 999,
    background: 'rgba(255,179,71,0.14)', border: `1px solid ${palette.lanternAmber}88`,
    color: palette.lanternCore, fontFamily: 'var(--em-mono, ui-monospace, monospace)', fontSize: 12,
    letterSpacing: '0.08em', cursor: 'pointer', touchAction: 'manipulation',
  }
}

function navBtnStyle(): React.CSSProperties {
  return {
    minWidth: 46, minHeight: 46, borderRadius: 10,
    background: 'rgba(255,179,71,0.16)', border: `1px solid ${palette.lanternAmber}66`,
    color: palette.lanternCore, fontSize: 20, cursor: 'pointer', touchAction: 'manipulation',
  }
}

function inputStyle(): React.CSSProperties {
  return {
    width: '100%', marginTop: 6, padding: '12px 12px', borderRadius: 10, boxSizing: 'border-box',
    background: 'rgba(10,5,24,0.7)', border: `1px solid ${palette.brass}66`, color: '#EDE6FF',
    fontFamily: 'var(--em-mono, ui-monospace, monospace)', fontSize: 14, minHeight: 44,
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
