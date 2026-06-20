// ReflectionBench — the "Watch the Last Train" bench (canon Vertical Slice
// Beat 5). A wooden bench with ornate cast-iron armrests, sitting at the edge
// of the plaza. After all errands are done, Bajla leads Wren here and they
// just sit. Non-interactive by design — the scene is a reward, not a puzzle.
//
// Geometry: procedural (box slats + cylinder legs + thin armrests). No textures,
// no GLBs, no external assets. MeshToonMaterial. TremblingOutlineMesh on the
// main seat so it reads as drawn rather than placed. 1 draw call = instanced
// slats; ~6 total. No per-frame allocations.

import { TremblingOutlineMesh } from './TremblingOutline'
import { palette } from '../practice/shells3d/kit/palette'

// Wood: warm slightly-light teak; iron: dark brass-grey.
const WOOD = '#7A5C3A'
const IRON = '#4A4038'
const WOOD_DARK = '#5E4429'

interface ReflectionBenchProps {
  position?: [number, number, number]
  rotation?: [number, number, number]
  reducedMotion?: boolean
}

export function ReflectionBench({
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  reducedMotion = false,
}: ReflectionBenchProps) {
  return (
    <group position={position} rotation={rotation}>
      {/* ── Seat slats (3 × horizontal plank) ── */}
      {[0, 0.07, 0.14].map((z, i) => (
        <mesh key={`slat-${i}`} position={[0, 0.44, z - 0.07]} castShadow>
          <boxGeometry args={[1.1, 0.045, 0.18]} />
          <meshToonMaterial color={WOOD} />
        </mesh>
      ))}
      {/* Seat outline (back slat only — most visible) */}
      <TremblingOutlineMesh
        position={[0, 0.44, -0.07]}
        thickness={0.022}
        jitter={0.005}
        reducedMotion={reducedMotion}
      >
        <boxGeometry args={[1.1, 0.045, 0.18]} />
      </TremblingOutlineMesh>

      {/* ── Backrest slats (2 × vertical) ── */}
      {[0, 0.1].map((z, i) => (
        <mesh key={`back-${i}`} position={[0, 0.72, z + 0.15]} castShadow>
          <boxGeometry args={[1.1, 0.38, 0.04]} />
          <meshToonMaterial color={WOOD} />
        </mesh>
      ))}

      {/* ── Cast-iron legs (4 legs) ── */}
      {([[-0.44, -0.07], [-0.44, 0.14], [0.44, -0.07], [0.44, 0.14]] as Array<[number, number]>).map(([x, z]) => (
        <mesh key={`leg-${x}-${z}`} position={[x, 0.22, z]} castShadow>
          <cylinderGeometry args={[0.025, 0.028, 0.44, 6]} />
          <meshToonMaterial color={IRON} />
        </mesh>
      ))}

      {/* ── Armrests (iron, one each side) ── */}
      {([-0.5, 0.5] as const).map((x) => (
        <group key={`arm-${x}`} position={[x, 0.54, 0.03]}>
          <mesh>
            <boxGeometry args={[0.04, 0.04, 0.38]} />
            <meshToonMaterial color={IRON} />
          </mesh>
          {/* Decorative curved top cap */}
          <mesh position={[0, 0.025, -0.14]}>
            <sphereGeometry args={[0.032, 6, 5]} />
            <meshToonMaterial color={IRON} />
          </mesh>
        </group>
      ))}

      {/* ── Connecting lower brace ── */}
      <mesh position={[0, 0.08, 0.035]}>
        <boxGeometry args={[1.0, 0.03, 0.04]} />
        <meshToonMaterial color={WOOD_DARK} />
      </mesh>
    </group>
  )
}
