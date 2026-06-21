// Deliveries — the six canonical English Metro parcels waiting to be carried.
// Our original replacement for abeto's deliveries set (postcard / letter / note
// / offering / samplebox / clothes — 6 items). A small tidy pile of "outgoing
// post" that sits near the Sorting Office: the things Wren delivers across the
// dusk city. Each is a distinct hand-wrapped object in the warm kraft-&-twine
// dusk palette.
//
// CONTRACT: zero new deps, no textures/GLBs/URLs. Procedural geometry only.
// Pure static — no useFrame, no per-frame allocations. reducedMotion-agnostic.
// ~13 part meshes total (well within budget). All readable English (addresses,
// stamps) stays in the DOM/overlay layer, never baked here.

import type { JSX } from 'react'

const KRAFT = '#B49A6E'   // brown parcel paper
const KRAFT_DK = '#8A7350'
const CREAM = '#EFE3C6'   // postcard / letter paper
const TWINE = '#6E5236'   // string / cord
const WAX = '#9B1C2E'     // red wax seal
const RIBBON = '#2B5F6E'  // dusk-teal ribbon
const CLOTH = '#7A5A6E'   // folded-cloth bundle (mauve)
const CLOTH2 = '#5A7A5E'  // second cloth fold (sage)
const INK = '#2B2540'

export interface DeliveriesProps {
  position?: [number, number, number]
  rotation?: [number, number, number]
}

export function Deliveries({ position = [0, 0, 0], rotation = [0, 0, 0] }: DeliveriesProps): JSX.Element {
  return (
    <group position={position} rotation={rotation}>
      {/* 1 ── Sample box: kraft cube with a twine cross ── */}
      <group position={[0, 0, 0]}>
        <mesh position={[0, 0.16, 0]} castShadow><boxGeometry args={[0.32, 0.32, 0.32]} /><meshToonMaterial color={KRAFT} /></mesh>
        <mesh position={[0, 0.16, 0]}><boxGeometry args={[0.34, 0.04, 0.04]} /><meshToonMaterial color={TWINE} /></mesh>
        <mesh position={[0, 0.16, 0]}><boxGeometry args={[0.04, 0.34, 0.04]} /><meshToonMaterial color={TWINE} /></mesh>
      </group>

      {/* 2 ── Folded-cloth bundle: stacked soft folds tied with cord ── */}
      <group position={[0.42, 0, 0.08]}>
        <mesh position={[0, 0.06, 0]} castShadow><boxGeometry args={[0.34, 0.1, 0.26]} /><meshToonMaterial color={CLOTH} /></mesh>
        <mesh position={[0, 0.15, 0]}><boxGeometry args={[0.3, 0.08, 0.23]} /><meshToonMaterial color={CLOTH2} /></mesh>
        <mesh position={[0, 0.11, 0]}><boxGeometry args={[0.05, 0.24, 0.28]} /><meshToonMaterial color={TWINE} /></mesh>
      </group>

      {/* 3 ── Sealed letter: cream envelope leaning on the box, red wax dot ── */}
      <group position={[-0.34, 0, 0.16]} rotation={[0, 0.5, 0.32]}>
        <mesh position={[0, 0.18, 0]} castShadow><boxGeometry args={[0.26, 0.18, 0.02]} /><meshToonMaterial color={CREAM} /></mesh>
        <mesh position={[0, 0.18, 0.012]}><sphereGeometry args={[0.03, 8, 6]} /><meshToonMaterial color={WAX} /></mesh>
      </group>

      {/* 4 ── Postcard: thin card propped upright against the bundle ── */}
      <group position={[0.34, 0, -0.2]} rotation={[0, -0.4, 0.14]}>
        <mesh position={[0, 0.16, 0]} castShadow><boxGeometry args={[0.24, 0.16, 0.012]} /><meshToonMaterial color={CREAM} /></mesh>
        {/* stamp corner */}
        <mesh position={[0.08, 0.21, 0.008]}><boxGeometry args={[0.05, 0.05, 0.004]} /><meshToonMaterial color={RIBBON} /></mesh>
      </group>

      {/* 5 ── Rolled note (scroll) with a teal ribbon ── */}
      <group position={[-0.18, 0, -0.22]} rotation={[Math.PI / 2, 0, 0.3]}>
        <mesh position={[0, 0, 0]} castShadow><cylinderGeometry args={[0.045, 0.045, 0.34, 10]} /><meshToonMaterial color={CREAM} /></mesh>
        <mesh position={[0, 0, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.05, 0.014, 6, 12]} /><meshToonMaterial color={RIBBON} /></mesh>
      </group>

      {/* 6 ── Wrapped offering: small kraft gift with a folded bow ── */}
      <group position={[0.04, 0.34, 0]}>
        <mesh position={[0, 0.07, 0]} castShadow><boxGeometry args={[0.2, 0.14, 0.2]} /><meshToonMaterial color={KRAFT_DK} /></mesh>
        <mesh position={[0, 0.07, 0]}><boxGeometry args={[0.04, 0.15, 0.21]} /><meshToonMaterial color={WAX} /></mesh>
        <mesh position={[0, 0.16, 0]}><sphereGeometry args={[0.035, 8, 6]} /><meshToonMaterial color={WAX} /></mesh>
        {/* tiny address tag */}
        <mesh position={[0.11, 0.07, 0]} rotation={[0, 0, 0.5]}><boxGeometry args={[0.06, 0.04, 0.004]} /><meshToonMaterial color={INK} /></mesh>
      </group>
    </group>
  )
}
