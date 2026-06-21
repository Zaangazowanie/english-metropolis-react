// ModularResident — assembles ONE original English Metro character entirely
// from procedural geometry, driven by a ResidentSpec from wardrobe.ts.
//
// This is our code replacement for abeto's binary avatar + accessory meshes
// (their base/hair/top/bottom/shoes .drc files merged by charactergeoworker).
// Here every part is a small composition of toon-shaded primitives, so a
// character is "code, not assets": readable, zero bytes, zero new deps.
//
// A character is a <group> of part meshes (base body + hair + top + bottom +
// shoes). Mesh count per character ≈ 12-15; for a large cast this should be
// merged to one BufferGeometry (planned: a charactergeoworker-equivalent
// merge util) before scaling past ~12 on screen.
//
// Idle animation: a gentle breathing bob + weight-shift sway on an inner group
// (per-character phase so the cast isn't synchronised). One transform write per
// character per frame — allocation-free. Frozen under reducedMotion.

import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import type { ResidentSpec, HairStyle, TopStyle, BottomStyle, ShoeStyle } from './wardrobe'

const EYE = '#1A1410'

/** Deterministic hash → stable 0..2π phase so residents don't breathe in sync. */
function phaseOf(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return ((Math.abs(h) % 1000) / 1000) * Math.PI * 2
}

export interface ModularResidentProps {
  spec: ResidentSpec
  position?: [number, number, number]
  rotation?: [number, number, number]
  /** Drop eyes + arms at low quality to save draw calls. */
  detail?: boolean
  /** Freeze the idle animation (accessibility). */
  reducedMotion?: boolean
}

// ── Hair (7 styles) ───────────────────────────────────────────────────────────
function Hair({ style, color, hr, hy }: { style: HairStyle; color: string; hr: number; hy: number }) {
  const cap = (
    <mesh position={[0, hy + hr * 0.18, -0.01]}>
      <sphereGeometry args={[hr * 1.08, 12, 9, 0, Math.PI * 2, 0, Math.PI * 0.62]} />
      <meshToonMaterial color={color} />
    </mesh>
  )
  switch (style) {
    case 'crop':
      return cap
    case 'fade':
      return (
        <mesh position={[0, hy + hr * 0.3, -0.01]}>
          <sphereGeometry args={[hr * 1.04, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.42]} />
          <meshToonMaterial color={color} />
        </mesh>
      )
    case 'bun':
      return (
        <group>
          {cap}
          <mesh position={[0, hy + hr * 1.05, -0.06]}><sphereGeometry args={[hr * 0.42, 9, 8]} /><meshToonMaterial color={color} /></mesh>
        </group>
      )
    case 'tousled':
      return (
        <group>
          {cap}
          <mesh position={[hr * 0.4, hy + hr * 0.8, 0.05]}><sphereGeometry args={[hr * 0.34, 8, 7]} /><meshToonMaterial color={color} /></mesh>
          <mesh position={[-hr * 0.36, hy + hr * 0.86, -0.04]}><sphereGeometry args={[hr * 0.3, 8, 7]} /><meshToonMaterial color={color} /></mesh>
        </group>
      )
    case 'curls':
      return (
        <group>
          <mesh position={[0, hy + hr * 0.26, -0.01]}><sphereGeometry args={[hr * 1.16, 12, 9, 0, Math.PI * 2, 0, Math.PI * 0.68]} /><meshToonMaterial color={color} /></mesh>
          <mesh position={[hr * 0.7, hy + hr * 0.45, 0]}><sphereGeometry args={[hr * 0.3, 8, 7]} /><meshToonMaterial color={color} /></mesh>
          <mesh position={[-hr * 0.7, hy + hr * 0.45, 0]}><sphereGeometry args={[hr * 0.3, 8, 7]} /><meshToonMaterial color={color} /></mesh>
        </group>
      )
    case 'braid':
      return (
        <group>
          {cap}
          <mesh position={[0, hy - hr * 0.6, -hr * 0.7]}><cylinderGeometry args={[hr * 0.18, hr * 0.12, hr * 1.7, 6]} /><meshToonMaterial color={color} /></mesh>
        </group>
      )
    case 'long':
      return (
        <group>
          {cap}
          <mesh position={[0, hy - hr * 0.35, -hr * 0.55]}><boxGeometry args={[hr * 1.7, hr * 1.9, hr * 0.5]} /><meshToonMaterial color={color} /></mesh>
        </group>
      )
  }
}

// ── Top (9 styles) — garment over the torso ──────────────────────────────────
function Top({ style, color, g, torsoY, torsoH, hy, hr }: {
  style: TopStyle; color: string; g: number; torsoY: number; torsoH: number; hy: number; hr: number
}) {
  const mat = <meshToonMaterial color={color} />
  switch (style) {
    case 'coat':
      return <mesh position={[0, torsoY - torsoH * 0.25, 0]} castShadow><cylinderGeometry args={[0.2 * g, 0.34 * g, torsoH * 1.5, 10]} />{mat}</mesh>
    case 'apron':
      return (
        <group>
          <mesh position={[0, torsoY, 0]}><cylinderGeometry args={[0.21 * g, 0.27 * g, torsoH, 10]} />{mat}</mesh>
          <mesh position={[0, torsoY - torsoH * 0.1, 0.22 * g]}><boxGeometry args={[0.34 * g, torsoH * 1.1, 0.04]} />{mat}</mesh>
        </group>
      )
    case 'vest':
      return <mesh position={[0, torsoY + torsoH * 0.05, 0]}><cylinderGeometry args={[0.22 * g, 0.25 * g, torsoH * 0.8, 10]} />{mat}</mesh>
    case 'pullover':
      return <mesh position={[0, torsoY, 0]}><cylinderGeometry args={[0.24 * g, 0.26 * g, torsoH * 1.05, 10]} />{mat}</mesh>
    case 'shawl':
      return (
        <group>
          <mesh position={[0, torsoY, 0]}><cylinderGeometry args={[0.22 * g, 0.27 * g, torsoH, 10]} />{mat}</mesh>
          <mesh position={[0, torsoY + torsoH * 0.42, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.26 * g, 0.08 * g, 7, 14]} />{mat}</mesh>
        </group>
      )
    case 'uniform':
      return (
        <group>
          <mesh position={[0, torsoY, 0]}><cylinderGeometry args={[0.22 * g, 0.26 * g, torsoH, 10]} />{mat}</mesh>
          <mesh position={[0, torsoY + torsoH * 0.45, 0.16 * g]}><boxGeometry args={[0.34 * g, 0.08, 0.05]} />{mat}</mesh>
        </group>
      )
    case 'raincoat':
      return (
        <group>
          <mesh position={[0, torsoY - torsoH * 0.3, 0]} castShadow><cylinderGeometry args={[0.24 * g, 0.36 * g, torsoH * 1.7, 10]} />{mat}</mesh>
          <mesh position={[0, hy + hr * 0.2, -0.04]}><sphereGeometry args={[hr * 1.35, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.5]} />{mat}</mesh>
        </group>
      )
    case 'cardigan':
      return <mesh position={[0, torsoY, 0]}><cylinderGeometry args={[0.23 * g, 0.27 * g, torsoH * 1.05, 10]} />{mat}</mesh>
    case 'smock':
      return <mesh position={[0, torsoY - torsoH * 0.05, 0]}><cylinderGeometry args={[0.28 * g, 0.32 * g, torsoH * 1.15, 10]} />{mat}</mesh>
  }
}

// ── Bottom (7 styles) ─────────────────────────────────────────────────────────
function Bottom({ style, color, g, hipY, legLen }: {
  style: BottomStyle; color: string; g: number; hipY: number; legLen: number
}) {
  const mat = <meshToonMaterial color={color} />
  const legX = 0.1 * g
  const legPair = (len: number, r1: number, r2: number) => (
    <group>
      <mesh position={[-legX, hipY - len / 2, 0]}><cylinderGeometry args={[r1, r2, len, 7]} />{mat}</mesh>
      <mesh position={[legX, hipY - len / 2, 0]}><cylinderGeometry args={[r1, r2, len, 7]} />{mat}</mesh>
    </group>
  )
  switch (style) {
    case 'trousers': return legPair(legLen, 0.08 * g, 0.07 * g)
    case 'shorts': return legPair(legLen * 0.5, 0.1 * g, 0.09 * g)
    case 'overalls':
      return (
        <group>
          {legPair(legLen, 0.09 * g, 0.08 * g)}
          <mesh position={[0, hipY + legLen * 0.18, 0.0]}><boxGeometry args={[0.26 * g, legLen * 0.5, 0.16 * g]} />{mat}</mesh>
        </group>
      )
    case 'culottes': return legPair(legLen * 0.62, 0.13 * g, 0.12 * g)
    case 'skirt':
      return <mesh position={[0, hipY - legLen * 0.32, 0]}><coneGeometry args={[0.3 * g, legLen * 0.7, 12, 1, true]} />{mat}</mesh>
    case 'longskirt':
      return <mesh position={[0, hipY - legLen * 0.5, 0]}><coneGeometry args={[0.32 * g, legLen * 1.05, 12, 1, true]} />{mat}</mesh>
    case 'kilt':
      return <mesh position={[0, hipY - legLen * 0.22, 0]}><coneGeometry args={[0.28 * g, legLen * 0.5, 10, 1, true]} />{mat}</mesh>
  }
}

// ── Shoes (7 styles) — one per foot ───────────────────────────────────────────
function Shoes({ style, color, g, footY }: { style: ShoeStyle; color: string; g: number; footY: number }) {
  const mat = <meshToonMaterial color={color} />
  const fx = 0.1 * g
  const foot = (jsx: React.ReactNode) => (<group><group position={[-fx, 0, 0]}>{jsx}</group><group position={[fx, 0, 0]}>{jsx}</group></group>)
  switch (style) {
    case 'boots': return foot(<mesh position={[0, footY + 0.07, 0.02]}><boxGeometry args={[0.1 * g, 0.18, 0.2]} />{mat}</mesh>)
    case 'wellies': return foot(<mesh position={[0, footY + 0.1, 0.0]}><cylinderGeometry args={[0.06 * g, 0.07 * g, 0.26, 7]} />{mat}</mesh>)
    case 'hightops': return foot(<mesh position={[0, footY + 0.06, 0.03]}><boxGeometry args={[0.1 * g, 0.14, 0.22]} />{mat}</mesh>)
    case 'clogs': return foot(<mesh position={[0, footY + 0.03, 0.03]}><boxGeometry args={[0.11 * g, 0.08, 0.22]} />{mat}</mesh>)
    case 'sandals': return foot(<mesh position={[0, footY + 0.015, 0.03]}><boxGeometry args={[0.1 * g, 0.04, 0.21]} />{mat}</mesh>)
    case 'loafers': return foot(<mesh position={[0, footY + 0.03, 0.04]}><boxGeometry args={[0.1 * g, 0.07, 0.23]} />{mat}</mesh>)
    case 'flats': return foot(<mesh position={[0, footY + 0.02, 0.03]}><boxGeometry args={[0.09 * g, 0.05, 0.2]} />{mat}</mesh>)
  }
}

// ── The assembled resident ────────────────────────────────────────────────────
export function ModularResident({ spec, position = [0, 0, 0], rotation = [0, 0, 0], detail = true, reducedMotion = false }: ModularResidentProps) {
  const g = spec.girth
  const h = spec.height
  // Idle breathing bob + slow weight-shift sway on an inner group.
  const anim = useRef<Group>(null!)
  const t0 = useRef(phaseOf(spec.name))
  useFrame((_, dt) => {
    if (!anim.current) return
    if (reducedMotion) { anim.current.position.y = 0; anim.current.rotation.z = 0; return }
    t0.current += dt
    const t = t0.current
    anim.current.position.y = Math.sin(t * 1.6) * 0.012 * h        // breathe
    anim.current.rotation.z = Math.sin(t * 0.7) * 0.02             // weight shift
  })
  // Vertical layout (feet at y≈0), scaled by height. A height=1.0 resident
  // stands ~1.55 units tall — sized to the plaza lamps/stalls.
  const footY = 0.0
  const legLen = 0.60 * h
  const hipY = 0.62 * h
  const torsoH = 0.50 * h
  const torsoY = hipY + torsoH * 0.55
  const neckY = torsoY + torsoH * 0.55
  const hr = 0.16 * (0.7 + 0.3 * g)
  const hy = neckY + 0.06 + hr

  return (
    <group position={position} rotation={rotation}>
      <group ref={anim}>
      {/* ── Base body (skin) ── */}
      {/* pelvis */}
      <mesh position={[0, hipY, 0]}><cylinderGeometry args={[0.16 * g, 0.16 * g, 0.14 * h, 8]} /><meshToonMaterial color={spec.skin} /></mesh>
      {/* torso core (under the garment) */}
      <mesh position={[0, torsoY, 0]}><cylinderGeometry args={[0.18 * g, 0.2 * g, torsoH, 9]} /><meshToonMaterial color={spec.skin} /></mesh>
      {/* neck */}
      <mesh position={[0, neckY, 0]}><cylinderGeometry args={[0.06, 0.07, 0.1, 7]} /><meshToonMaterial color={spec.skin} /></mesh>
      {/* head */}
      <mesh position={[0, hy, 0]} castShadow><sphereGeometry args={[hr, 14, 11]} /><meshToonMaterial color={spec.skin} /></mesh>
      {detail && (
        <>
          {/* eyes (front, +Z) */}
          <mesh position={[-hr * 0.36, hy + hr * 0.05, hr * 0.9]}><sphereGeometry args={[hr * 0.15, 7, 6]} /><meshToonMaterial color={EYE} /></mesh>
          <mesh position={[hr * 0.36, hy + hr * 0.05, hr * 0.9]}><sphereGeometry args={[hr * 0.15, 7, 6]} /><meshToonMaterial color={EYE} /></mesh>
          {/* arms (skin; sleeves read via the top's silhouette) */}
          <mesh position={[-0.26 * g, torsoY, 0]} rotation={[0, 0, 0.12]}><cylinderGeometry args={[0.05, 0.05, torsoH * 1.05, 6]} /><meshToonMaterial color={spec.skin} /></mesh>
          <mesh position={[0.26 * g, torsoY, 0]} rotation={[0, 0, -0.12]}><cylinderGeometry args={[0.05, 0.05, torsoH * 1.05, 6]} /><meshToonMaterial color={spec.skin} /></mesh>
        </>
      )}

      {/* ── Wardrobe ── */}
      <Bottom style={spec.bottom} color={spec.bottomColor} g={g} hipY={hipY} legLen={legLen} />
      <Top style={spec.top} color={spec.topColor} g={g} torsoY={torsoY} torsoH={torsoH} hy={hy} hr={hr} />
      <Hair style={spec.hair} color={spec.hairColor} hr={hr} hy={hy} />
      <Shoes style={spec.shoes} color={spec.shoeColor} g={g} footY={footY} />
      </group>
    </group>
  )
}
