// Wren — the English Metro player character, a fully-fleshed procedural human
// built to the canonical WREN character sheet ("WORLD PALETTE: DUSK-TEAL &
// AMBER"): messy dark hair framing a young face (eyes + rosy cheeks), a neck,
// an oversized dusk-teal hooded coat with a collar + toggle buttons, a long
// amber scarf (canon: "Wren's scarf is a lamp she carries"), a brown leather
// crossbody satchel slung at the hip with little colored errand-tags, grey
// cuffed trousers, brown ankle boots, and hands that swing with the arms.
//
// Procedural low-poly + MeshToonMaterial with the TremblingOutline shader on
// the dominant silhouette (coat + head) — the hand-drawn graphite-ink look that
// is English Metro's signature. 100% original geometry (no GLB, no textures, no
// deps). Faces +Z at heading 0 so the controller's atan2 heading maps directly
// to rotation.y.
//
// Animation: arms (with hands) swing and the scarf tail sways, scaled by a live
// `speedRef` (0 idle → 1 walking); legs (with boots) stride contralaterally.
// reducedMotion stops decorative sway and holds the outline static. No per-frame
// allocations.

import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Object3D, Color } from 'three'
import type { Group, InstancedMesh, Mesh } from 'three'
import { palette } from '../practice/shells3d/kit/palette'
import { TremblingOutlineMesh } from './TremblingOutline'

// Module-scope scratch for one-shot instanced placement (no per-frame allocs).
const _wb = new Object3D()
const _wc = new Color()
// Button positions (local y, z — all at x=0 on the coat front).
const BTN_POS: Array<[number, number]> = [[1.06, 0.30], [0.9, 0.33], [0.74, 0.355]]

// Wren's palette — keyed to the character sheet's dusk-teal & amber swatches.
const COAT    = '#5E7378' // dusk teal-grey wool
const COAT_D  = '#43565B' // coat shadow / hem / hood / collar
const SKIN    = '#E8C8A8' // face + hands
const SKIN_D  = '#D9B595' // nose / under-shadow
const CHEEK   = '#E0A07A' // warm rosy cheek
const EYE     = '#241A16' // dark eye
const HAIR    = '#2E2622' // near-black espresso, messy
const SCARF   = palette.lanternAmber // ties Wren to the lamps
const SCARF_D = '#D97E12' // scarf wrap shadow (deeper amber)
const LEATHER   = '#7A5A45' // satchel body — warm tan leather
const LEATHER_D = '#553C2B' // satchel flap / strap — darker leather
const BUTTON  = '#C8A86E' // toggle buttons — pale brass-tan
const TROUSER = '#7E8079' // warm grey trousers
const CUFF    = '#8E9088' // lighter trouser cuff
const BOOT    = '#4A2F25' // dark brown ankle boots
// Little colored errand-tags hanging from the satchel (red / teal / amber).
const TAGS = ['#B5572E', '#2B5F6E', '#E8920A'] as const

export interface WrenProps {
  /** Live 0..1 walk intensity (parent rig writes it each frame). */
  speedRef: React.MutableRefObject<number>
  reducedMotion?: boolean
}

// Outline tuning for Wren's scale (~1.85 world units tall).
const COAT_THICKNESS = 0.038
const HEAD_THICKNESS = 0.026
const OUTLINE_JITTER  = 0.007

/** Wren, built at local origin with feet at y=0, facing +Z. */
export function Wren({ speedRef, reducedMotion = false }: WrenProps) {
  const lArm = useRef<Group>(null!)
  const rArm = useRef<Group>(null!)
  const lLeg = useRef<Group>(null!)
  const rLeg = useRef<Group>(null!)
  const body = useRef<Group>(null!)
  const scarfTail = useRef<Mesh>(null!)
  const btnRef = useRef<InstancedMesh>(null!)
  const tagRef = useRef<InstancedMesh>(null!)
  const t = useRef(0)

  // Place buttons + tags once (static geometry → no per-frame work).
  useEffect(() => {
    // Toggle buttons — 3 identical gold cubes down the placket.
    BTN_POS.forEach(([y, z], i) => {
      _wb.position.set(0, y, z); _wb.rotation.set(0, 0, 0); _wb.scale.setScalar(1)
      _wb.updateMatrix(); btnRef.current.setMatrixAt(i, _wb.matrix)
    })
    btnRef.current.instanceMatrix.needsUpdate = true
    // Errand-tags — 3 colored tags hanging from the satchel flap.
    TAGS.forEach((c, i) => {
      _wb.position.set(0.3 + i * 0.07, 0.68, 0.2); _wb.rotation.set(0, 0, 0); _wb.scale.setScalar(1)
      _wb.updateMatrix(); tagRef.current.setMatrixAt(i, _wb.matrix)
      _wc.set(c); tagRef.current.setColorAt(i, _wc)
    })
    tagRef.current.instanceMatrix.needsUpdate = true
    if (tagRef.current.instanceColor) tagRef.current.instanceColor.needsUpdate = true
  }, [])

  useFrame((_, delta) => {
    const sp = speedRef.current
    if (reducedMotion) {
      if (lArm.current) lArm.current.rotation.x = 0
      if (rArm.current) rArm.current.rotation.x = 0
      if (lLeg.current) lLeg.current.rotation.x = 0
      if (rLeg.current) rLeg.current.rotation.x = 0
      if (body.current) body.current.position.y = 0
      if (scarfTail.current) scarfTail.current.rotation.x = 0.2
      return
    }
    t.current += delta * 9
    const swing = Math.sin(t.current) * 0.6 * sp
    if (lArm.current) lArm.current.rotation.x = swing
    if (rArm.current) rArm.current.rotation.x = -swing
    // Legs stride contralaterally with the same-side arm.
    const stride = Math.sin(t.current) * 0.5 * sp
    if (lLeg.current) lLeg.current.rotation.x = -stride
    if (rLeg.current) rLeg.current.rotation.x = stride
    // Idle breathing: a slow chest lift when standing still, faded out as Wren
    // starts to walk (so it never fights the stride bob).
    if (body.current) {
      const idle = 1 - Math.min(1, sp * 2.2)
      body.current.position.y = Math.sin(t.current * 0.13) * 0.02 * idle
    }
    // Scarf trails: lifts toward horizontal as Wren moves, with a flutter.
    if (scarfTail.current) {
      scarfTail.current.rotation.x = 0.2 + sp * (0.9 + Math.sin(t.current * 1.3) * 0.25)
    }
  })

  return (
    <group ref={body}>
      {/* ── Legs (hip-pivot; stride) + cuffs + brown boots ── */}
      <group ref={lLeg} position={[-0.12, 0.56, 0]}>
        <mesh position={[0, -0.26, 0]} castShadow>
          <cylinderGeometry args={[0.09, 0.08, 0.52, 8]} />
          <meshToonMaterial color={TROUSER} />
        </mesh>
        <mesh position={[0, -0.5, 0]}>
          <cylinderGeometry args={[0.095, 0.095, 0.08, 8]} />
          <meshToonMaterial color={CUFF} />
        </mesh>
        <mesh position={[0, -0.57, 0.04]} castShadow>
          <boxGeometry args={[0.15, 0.12, 0.26]} />
          <meshToonMaterial color={BOOT} />
        </mesh>
      </group>
      <group ref={rLeg} position={[0.12, 0.56, 0]}>
        <mesh position={[0, -0.26, 0]} castShadow>
          <cylinderGeometry args={[0.09, 0.08, 0.52, 8]} />
          <meshToonMaterial color={TROUSER} />
        </mesh>
        <mesh position={[0, -0.5, 0]}>
          <cylinderGeometry args={[0.095, 0.095, 0.08, 8]} />
          <meshToonMaterial color={CUFF} />
        </mesh>
        <mesh position={[0, -0.57, 0.04]} castShadow>
          <boxGeometry args={[0.15, 0.12, 0.26]} />
          <meshToonMaterial color={BOOT} />
        </mesh>
      </group>

      {/* ── Coat (dominant A-line silhouette) ── */}
      <mesh position={[0, 0.92, 0]} castShadow>
        <cylinderGeometry args={[0.26, 0.46, 1.0, 12]} />
        <meshToonMaterial color={COAT} />
      </mesh>
      <TremblingOutlineMesh
        position={[0, 0.92, 0]}
        thickness={COAT_THICKNESS}
        jitter={OUTLINE_JITTER}
        reducedMotion={reducedMotion}
      >
        <cylinderGeometry args={[0.26, 0.46, 1.0, 12]} />
      </TremblingOutlineMesh>
      {/* Coat hem shadow band */}
      <mesh position={[0, 0.44, 0]}>
        <cylinderGeometry args={[0.455, 0.46, 0.08, 12]} />
        <meshToonMaterial color={COAT_D} />
      </mesh>
      {/* Shoulders — rounded yoke so the coat reads tailored, not a tube */}
      <mesh position={[0, 1.32, 0]} castShadow>
        <sphereGeometry args={[0.3, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55]} />
        <meshToonMaterial color={COAT} />
      </mesh>
      {/* Front placket seam */}
      <mesh position={[0, 0.92, 0.30]}>
        <boxGeometry args={[0.04, 0.92, 0.04]} />
        <meshToonMaterial color={COAT_D} />
      </mesh>
      {/* Toggle buttons — 3 → 1 instanced draw call */}
      <instancedMesh ref={btnRef} args={[undefined, undefined, 3]}>
        <boxGeometry args={[0.05, 0.05, 0.04]} />
        <meshToonMaterial color={BUTTON} />
      </instancedMesh>

      {/* ── Hood bunched behind the neck (−Z) ── */}
      <mesh position={[0, 1.44, -0.13]} scale={[1, 0.82, 0.92]} castShadow>
        <sphereGeometry args={[0.22, 12, 9]} />
        <meshToonMaterial color={COAT_D} />
      </mesh>
      {/* Coat collar ring framing the scarf */}
      <mesh position={[0, 1.5, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.17, 0.05, 6, 14]} />
        <meshToonMaterial color={COAT_D} />
      </mesh>

      {/* ── Leather crossbody satchel: strap over shoulder, bag at the hip ── */}
      <mesh position={[0.04, 1.04, 0.2]} rotation={[0, 0, 0.92]}>
        <boxGeometry args={[0.06, 0.86, 0.04]} />
        <meshToonMaterial color={LEATHER_D} />
      </mesh>
      <mesh position={[0.4, 0.8, 0.12]} rotation={[0, -0.5, 0]} castShadow>
        <boxGeometry args={[0.3, 0.32, 0.14]} />
        <meshToonMaterial color={LEATHER} />
      </mesh>
      <mesh position={[0.4, 0.95, 0.13]} rotation={[0, -0.5, 0]}>
        <boxGeometry args={[0.31, 0.1, 0.15]} />
        <meshToonMaterial color={LEATHER_D} />
      </mesh>
      {/* Errand-tags — 3 → 1 instanced draw call (colors via instanceColor) */}
      <instancedMesh ref={tagRef} args={[undefined, undefined, 3]}>
        <boxGeometry args={[0.035, 0.1, 0.02]} />
        <meshToonMaterial />
      </instancedMesh>

      {/* ── Arms (shoulder-pivot; swing) + sleeves + hands ── */}
      <group ref={lArm} position={[-0.34, 1.28, 0]}>
        <mesh position={[0, -0.26, 0]} castShadow>
          <cylinderGeometry args={[0.07, 0.06, 0.54, 8]} />
          <meshToonMaterial color={COAT} />
        </mesh>
        {/* hand */}
        <mesh position={[0, -0.56, 0.02]} castShadow>
          <sphereGeometry args={[0.075, 8, 7]} />
          <meshToonMaterial color={SKIN} />
        </mesh>
      </group>
      <group ref={rArm} position={[0.34, 1.28, 0]}>
        <mesh position={[0, -0.26, 0]} castShadow>
          <cylinderGeometry args={[0.07, 0.06, 0.54, 8]} />
          <meshToonMaterial color={COAT} />
        </mesh>
        <mesh position={[0, -0.56, 0.02]} castShadow>
          <sphereGeometry args={[0.075, 8, 7]} />
          <meshToonMaterial color={SKIN} />
        </mesh>
      </group>

      {/* ── Scarf — Wren's signature: a big chunky wrapped cowl + thick tail ── */}
      {/* fat cowl wrapping the neck up to the chin */}
      <mesh position={[0, 1.52, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.185, 0.12, 10, 18]} />
        <meshToonMaterial color={SCARF} />
      </mesh>
      {/* a second offset wrap band for woolly volume */}
      <mesh position={[0, 1.43, 0.03]} rotation={[Math.PI / 2 - 0.12, 0, 0]}>
        <torusGeometry args={[0.2, 0.085, 9, 18]} />
        <meshToonMaterial color={SCARF_D} />
      </mesh>
      {/* thick trailing tail down the front (animated sway) */}
      <mesh ref={scarfTail} position={[0.07, 1.32, 0.2]} rotation={[0.26, 0, 0.08]}>
        <boxGeometry args={[0.18, 0.62, 0.08]} />
        <meshToonMaterial color={SCARF} />
      </mesh>
      {/* tail fringe end (darker) */}
      <mesh position={[0.1, 1.0, 0.27]} rotation={[0.26, 0, 0.08]}>
        <boxGeometry args={[0.17, 0.12, 0.075]} />
        <meshToonMaterial color={SCARF_D} />
      </mesh>

      {/* ── Neck ── */}
      <mesh position={[0, 1.55, 0]}>
        <cylinderGeometry args={[0.08, 0.09, 0.14, 8]} />
        <meshToonMaterial color={SKIN} />
      </mesh>

      {/* ── Head ── */}
      <mesh position={[0, 1.74, 0]} castShadow>
        <sphereGeometry args={[0.21, 16, 13]} />
        <meshToonMaterial color={SKIN} />
      </mesh>
      <TremblingOutlineMesh
        position={[0, 1.74, 0]}
        thickness={HEAD_THICKNESS}
        jitter={OUTLINE_JITTER}
        reducedMotion={reducedMotion}
      >
        <sphereGeometry args={[0.21, 16, 13]} />
      </TremblingOutlineMesh>

      {/* Face — eyes (smaller, softer), brows, cheeks, a soft nose (front = +Z) */}
      <mesh position={[-0.078, 1.758, 0.188]} scale={[0.85, 1.15, 1]}>
        <sphereGeometry args={[0.027, 8, 7]} />
        <meshToonMaterial color={EYE} />
      </mesh>
      <mesh position={[0.078, 1.758, 0.188]} scale={[0.85, 1.15, 1]}>
        <sphereGeometry args={[0.027, 8, 7]} />
        <meshToonMaterial color={EYE} />
      </mesh>
      {/* eyebrows — a touch of expression */}
      <mesh position={[-0.078, 1.8, 0.185]} rotation={[0, 0, -0.12]}>
        <boxGeometry args={[0.055, 0.014, 0.02]} />
        <meshToonMaterial color={HAIR} />
      </mesh>
      <mesh position={[0.078, 1.8, 0.185]} rotation={[0, 0, 0.12]}>
        <boxGeometry args={[0.055, 0.014, 0.02]} />
        <meshToonMaterial color={HAIR} />
      </mesh>
      {/* eye highlights (tiny cream catchlights) */}
      <mesh position={[-0.065, 1.775, 0.207]}>
        <sphereGeometry args={[0.011, 6, 5]} />
        <meshBasicMaterial color="#fff6e8" />
      </mesh>
      <mesh position={[0.085, 1.775, 0.207]}>
        <sphereGeometry args={[0.011, 6, 5]} />
        <meshBasicMaterial color="#fff6e8" />
      </mesh>
      {/* rosy cheeks */}
      <mesh position={[-0.13, 1.7, 0.16]} scale={[1, 0.7, 0.5]}>
        <sphereGeometry args={[0.038, 8, 6]} />
        <meshToonMaterial color={CHEEK} />
      </mesh>
      <mesh position={[0.13, 1.7, 0.16]} scale={[1, 0.7, 0.5]}>
        <sphereGeometry args={[0.038, 8, 6]} />
        <meshToonMaterial color={CHEEK} />
      </mesh>
      {/* soft nose */}
      <mesh position={[0, 1.715, 0.205]}>
        <sphereGeometry args={[0.022, 7, 6]} />
        <meshToonMaterial color={SKIN_D} />
      </mesh>

      {/* ── Hair — a fuller messy mop: cap + fringe + tufts ── */}
      <mesh position={[0, 1.82, -0.02]} castShadow>
        <sphereGeometry args={[0.225, 14, 11, 0, Math.PI * 2, 0, Math.PI * 0.66]} />
        <meshToonMaterial color={HAIR} />
      </mesh>
      {/* front fringe */}
      <mesh position={[0, 1.86, 0.12]} rotation={[0.5, 0, 0]} scale={[1.1, 0.6, 0.7]}>
        <sphereGeometry args={[0.16, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.6]} />
        <meshToonMaterial color={HAIR} />
      </mesh>
      {/* messy tufts */}
      <mesh position={[-0.15, 1.86, 0.05]} rotation={[0.3, 0, 0.6]}>
        <coneGeometry args={[0.06, 0.18, 5]} />
        <meshToonMaterial color={HAIR} />
      </mesh>
      <mesh position={[0.14, 1.9, -0.03]} rotation={[-0.2, 0, -0.5]}>
        <coneGeometry args={[0.055, 0.17, 5]} />
        <meshToonMaterial color={HAIR} />
      </mesh>
      <mesh position={[0.02, 1.96, 0.04]} rotation={[0.3, 0, 0.05]}>
        <coneGeometry args={[0.05, 0.16, 5]} />
        <meshToonMaterial color={HAIR} />
      </mesh>
      <mesh position={[-0.05, 1.88, -0.16]} rotation={[-0.6, 0, 0.2]}>
        <coneGeometry args={[0.05, 0.15, 5]} />
        <meshToonMaterial color={HAIR} />
      </mesh>
    </group>
  )
}
