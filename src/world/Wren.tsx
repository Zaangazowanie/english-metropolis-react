// Wren — the English Metro player character. An ORIGINAL human messenger:
// oversized teal-grey coat, long amber scarf (the same warm amber as the
// city's lamps — canon: "Wren's scarf is a lamp she carries"), leather
// satchel. Procedural low-poly + MeshToonMaterial with the TremblingOutline
// shader on the dominant silhouette (coat + head) — the hand-drawn graphite
// ink look that is English Metro's signature style. Faces +Z at heading 0
// so the controller's atan2 heading maps directly to rotation.y.
//
// Animation: arms swing and the scarf tail sways, scaled by a live `speedRef`
// (0 idle → 1 walking) the parent rig updates each frame. reducedMotion stops
// decorative sway and holds the outline static. No per-frame allocations.

import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group, Mesh } from 'three'
import { palette } from '../practice/shells3d/kit/palette'
import { TremblingOutlineMesh } from './TremblingOutline'

// Wren's palette — coat reads against the teal ground; scarf = lamp amber.
const COAT   = '#54737D' // soft teal-grey wool
const COAT_D = '#3E5860' // coat shadow / lower hem
const SKIN   = '#E8C8A8'
const HAIR   = '#3A2E2A'
const SCARF  = palette.lanternAmber // ties Wren to the lamps
const BAG    = palette.brass
const TROUSER = '#2C3A42'
// INK constant removed: coat + head outlines are now TremblingOutlineMesh,
// which reads palette.night internally from TremblingOutline.tsx.

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
      {/* ── Legs (pivot at the hip; stride contralaterally with the walk) ── */}
      <group ref={lLeg} position={[-0.12, 0.56, 0]}>
        <mesh position={[0, -0.28, 0]} castShadow>
          <cylinderGeometry args={[0.09, 0.08, 0.56, 6]} />
          <meshToonMaterial color={TROUSER} />
        </mesh>
      </group>
      <group ref={rLeg} position={[0.12, 0.56, 0]}>
        <mesh position={[0, -0.28, 0]} castShadow>
          <cylinderGeometry args={[0.09, 0.08, 0.56, 6]} />
          <meshToonMaterial color={TROUSER} />
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

      {/* ── Satchel on the back (−Z) + strap ── */}
      <mesh position={[0, 0.95, -0.34]} rotation={[0.08, 0, 0]} castShadow>
        <boxGeometry args={[0.46, 0.38, 0.16]} />
        <meshToonMaterial color={BAG} />
      </mesh>
      <mesh position={[0, 1.16, 0]} rotation={[0, 0, Math.PI / 5]}>
        <boxGeometry args={[0.62, 0.07, 0.5]} />
        <meshToonMaterial color={COAT_D} />
      </mesh>

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
    </group>
  )
}
