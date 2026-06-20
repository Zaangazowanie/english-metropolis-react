// Wren — the English Metro player character, reskinned to the canonical WREN
// character sheet ("WORLD PALETTE: DUSK-TEAL & AMBER"): an oversized dusk-teal
// hooded coat with toggle buttons, a long amber scarf (canon: "Wren's scarf is
// a lamp she carries"), a BROWN LEATHER crossbody messenger satchel slung at
// the hip with little colored errand-tags, grey cuffed trousers, and brown
// ankle boots. Messy dark hair.
//
// Procedural low-poly + MeshToonMaterial with the TremblingOutline shader on
// the dominant silhouette (coat + head) — the hand-drawn graphite-ink look that
// is English Metro's signature style. Faces +Z at heading 0 so the controller's
// atan2 heading maps directly to rotation.y.
//
// Animation: arms swing and the scarf tail sways, scaled by a live `speedRef`
// (0 idle → 1 walking) the parent rig updates each frame; boots stride with the
// legs. reducedMotion stops decorative sway and holds the outline static. No
// per-frame allocations.

import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group, Mesh } from 'three'
import { palette } from '../practice/shells3d/kit/palette'
import { TremblingOutlineMesh } from './TremblingOutline'

// Wren's palette — keyed to the character sheet's dusk-teal & amber swatches.
const COAT    = '#5E7378' // dusk teal-grey wool (reads against the teal street)
const COAT_D  = '#43565B' // coat shadow / hem / hood
const SKIN    = '#E8C8A8'
const HAIR    = '#2E2622' // near-black espresso, messy
const SCARF   = palette.lanternAmber // ties Wren to the lamps
const LEATHER   = '#7A5A45' // satchel body — warm tan leather
const LEATHER_D = '#553C2B' // satchel flap / strap — darker leather
const BUTTON  = '#C8A86E' // toggle buttons / buckle — pale brass-tan
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

// Outline tuning for Wren's scale (~1.8 world units tall).
const COAT_THICKNESS = 0.038
const HEAD_THICKNESS = 0.028
const OUTLINE_JITTER  = 0.007

/** Wren, built at local origin with feet at y=0, facing +Z. */
export function Wren({ speedRef, reducedMotion = false }: WrenProps) {
  const lArm = useRef<Group>(null!)
  const rArm = useRef<Group>(null!)
  const lLeg = useRef<Group>(null!)
  const rLeg = useRef<Group>(null!)
  const scarfTail = useRef<Mesh>(null!)
  const t = useRef(0)

  useFrame((_, delta) => {
    const sp = speedRef.current
    if (reducedMotion) {
      // Hold a neutral pose.
      if (lArm.current) lArm.current.rotation.x = 0
      if (rArm.current) rArm.current.rotation.x = 0
      if (lLeg.current) lLeg.current.rotation.x = 0
      if (rLeg.current) rLeg.current.rotation.x = 0
      if (scarfTail.current) scarfTail.current.rotation.x = 0.2
      return
    }
    t.current += delta * 9
    const swing = Math.sin(t.current) * 0.6 * sp
    if (lArm.current) lArm.current.rotation.x = swing
    if (rArm.current) rArm.current.rotation.x = -swing
    // Legs stride contralaterally — each leg opposes its same-side arm so the
    // gait reads as a natural walk. Amplitude scales with walk intensity.
    const stride = Math.sin(t.current) * 0.5 * sp
    if (lLeg.current) lLeg.current.rotation.x = -stride
    if (rLeg.current) rLeg.current.rotation.x = stride
    // Scarf trails: lifts toward horizontal as Wren moves, with a flutter.
    if (scarfTail.current) {
      scarfTail.current.rotation.x = 0.2 + sp * (0.9 + Math.sin(t.current * 1.3) * 0.25)
    }
  })

  return (
    <group>
      {/* ── Legs (pivot at the hip; stride contralaterally) + boots + cuffs ── */}
      <group ref={lLeg} position={[-0.12, 0.56, 0]}>
        <mesh position={[0, -0.26, 0]} castShadow>
          <cylinderGeometry args={[0.09, 0.08, 0.52, 6]} />
          <meshToonMaterial color={TROUSER} />
        </mesh>
        {/* cuff */}
        <mesh position={[0, -0.5, 0]}>
          <cylinderGeometry args={[0.095, 0.095, 0.08, 6]} />
          <meshToonMaterial color={CUFF} />
        </mesh>
        {/* brown ankle boot (toe forward, +Z) */}
        <mesh position={[0, -0.57, 0.04]} castShadow>
          <boxGeometry args={[0.15, 0.12, 0.26]} />
          <meshToonMaterial color={BOOT} />
        </mesh>
      </group>
      <group ref={rLeg} position={[0.12, 0.56, 0]}>
        <mesh position={[0, -0.26, 0]} castShadow>
          <cylinderGeometry args={[0.09, 0.08, 0.52, 6]} />
          <meshToonMaterial color={TROUSER} />
        </mesh>
        <mesh position={[0, -0.5, 0]}>
          <cylinderGeometry args={[0.095, 0.095, 0.08, 6]} />
          <meshToonMaterial color={CUFF} />
        </mesh>
        <mesh position={[0, -0.57, 0.04]} castShadow>
          <boxGeometry args={[0.15, 0.12, 0.26]} />
          <meshToonMaterial color={BOOT} />
        </mesh>
      </group>

      {/* ── Coat (dominant silhouette, A-line) ── */}
      <mesh position={[0, 0.92, 0]} castShadow>
        <cylinderGeometry args={[0.26, 0.46, 1.0, 10]} />
        <meshToonMaterial color={COAT} />
      </mesh>
      {/* Coat trembling graphite outline — the signature English Metro look */}
      <TremblingOutlineMesh
        position={[0, 0.92, 0]}
        thickness={COAT_THICKNESS}
        jitter={OUTLINE_JITTER}
        reducedMotion={reducedMotion}
      >
        <cylinderGeometry args={[0.26, 0.46, 1.0, 10]} />
      </TremblingOutlineMesh>
      {/* Coat hem shadow band */}
      <mesh position={[0, 0.44, 0]}>
        <cylinderGeometry args={[0.455, 0.46, 0.08, 10]} />
        <meshToonMaterial color={COAT_D} />
      </mesh>
      {/* Toggle buttons down the front placket (+Z face) */}
      <mesh position={[0, 1.06, 0.28]}>
        <boxGeometry args={[0.05, 0.05, 0.03]} />
        <meshToonMaterial color={BUTTON} />
      </mesh>
      <mesh position={[0, 0.9, 0.31]}>
        <boxGeometry args={[0.05, 0.05, 0.03]} />
        <meshToonMaterial color={BUTTON} />
      </mesh>
      <mesh position={[0, 0.74, 0.345]}>
        <boxGeometry args={[0.05, 0.05, 0.03]} />
        <meshToonMaterial color={BUTTON} />
      </mesh>

      {/* ── Hood bunched behind the neck (−Z) ── */}
      <mesh position={[0, 1.42, -0.12]} scale={[1, 0.8, 0.9]} castShadow>
        <sphereGeometry args={[0.2, 10, 8]} />
        <meshToonMaterial color={COAT_D} />
      </mesh>

      {/* ── Leather crossbody satchel: strap over the shoulder, bag at the hip ── */}
      {/* Strap — left shoulder down to right hip, across the chest */}
      <mesh position={[0.04, 1.04, 0.2]} rotation={[0, 0, 0.92]}>
        <boxGeometry args={[0.06, 0.86, 0.04]} />
        <meshToonMaterial color={LEATHER_D} />
      </mesh>
      {/* Bag body slung on the right hip */}
      <mesh position={[0.4, 0.8, 0.12]} rotation={[0, -0.5, 0]} castShadow>
        <boxGeometry args={[0.3, 0.32, 0.14]} />
        <meshToonMaterial color={LEATHER} />
      </mesh>
      {/* Bag flap */}
      <mesh position={[0.4, 0.95, 0.13]} rotation={[0, -0.5, 0]}>
        <boxGeometry args={[0.31, 0.1, 0.15]} />
        <meshToonMaterial color={LEATHER_D} />
      </mesh>
      {/* Little colored errand-tags hanging from the flap */}
      {TAGS.map((c, i) => (
        <mesh key={c} position={[0.3 + i * 0.07, 0.68, 0.2]}>
          <boxGeometry args={[0.035, 0.1, 0.02]} />
          <meshToonMaterial color={c} />
        </mesh>
      ))}

      {/* ── Arms (pivot at shoulder; swing with walk) ── */}
      <group ref={lArm} position={[-0.34, 1.28, 0]}>
        <mesh position={[0, -0.28, 0]} castShadow>
          <cylinderGeometry args={[0.07, 0.06, 0.58, 6]} />
          <meshToonMaterial color={COAT} />
        </mesh>
      </group>
      <group ref={rArm} position={[0.34, 1.28, 0]}>
        <mesh position={[0, -0.28, 0]} castShadow>
          <cylinderGeometry args={[0.07, 0.06, 0.58, 6]} />
          <meshToonMaterial color={COAT} />
        </mesh>
      </group>

      {/* ── Scarf: ring at the neck + trailing tail down the front ── */}
      <mesh position={[0, 1.42, 0]}>
        <torusGeometry args={[0.16, 0.06, 6, 12]} />
        <meshToonMaterial color={SCARF} />
      </mesh>
      <mesh ref={scarfTail} position={[0, 1.36, 0.12]} rotation={[0.2, 0, 0]}>
        <boxGeometry args={[0.14, 0.5, 0.04]} />
        <meshToonMaterial color={SCARF} />
      </mesh>

      {/* ── Head + hair ── */}
      <mesh position={[0, 1.62, 0]} castShadow>
        <sphereGeometry args={[0.2, 12, 10]} />
        <meshToonMaterial color={SKIN} />
      </mesh>
      {/* Head trembling outline */}
      <TremblingOutlineMesh
        position={[0, 1.62, 0]}
        thickness={HEAD_THICKNESS}
        jitter={OUTLINE_JITTER}
        reducedMotion={reducedMotion}
      >
        <sphereGeometry args={[0.2, 12, 10]} />
      </TremblingOutlineMesh>
      {/* Hair cap */}
      <mesh position={[0, 1.7, -0.02]}>
        <sphereGeometry args={[0.205, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.62]} />
        <meshToonMaterial color={HAIR} />
      </mesh>
      {/* Messy hair tufts */}
      <mesh position={[-0.13, 1.74, 0.06]} rotation={[0.3, 0, 0.5]}>
        <coneGeometry args={[0.06, 0.16, 5]} />
        <meshToonMaterial color={HAIR} />
      </mesh>
      <mesh position={[0.12, 1.76, -0.02]} rotation={[-0.2, 0, -0.4]}>
        <coneGeometry args={[0.055, 0.15, 5]} />
        <meshToonMaterial color={HAIR} />
      </mesh>
      <mesh position={[0.02, 1.78, 0.12]} rotation={[0.5, 0, 0.05]}>
        <coneGeometry args={[0.05, 0.13, 5]} />
        <meshToonMaterial color={HAIR} />
      </mesh>
    </group>
  )
}
