// NpcResidents — four canon English Metro residents drifting around the plaza.
// Each is a distinct, fully-built character from the Story Bible cast, rendered
// as a proper procedural 3D person — not an instanced silhouette blob.
//
// Characters:
//   0  Older Lanterngate local — plum coat, grey hair, warm amber shawl
//   1  Flora-adjacent vendor   — sage green coat, auburn hair, cream apron
//   2  Mr. Chen-adjacent cafe  — deep teal coat, greying hair, white collar
//   3  Tomás-adjacent young    — rust coat, dark hair, bright amber scarf
//
// Each character: coat body + coat hem + neck + head + hair + 2 eyes + 1
// character-specific accessory = 8 draw calls. 4 × 8 = 32 draw calls for the
// whole NPC system. Replaces the 2-draw-call instanced silhouettes.
//
// Orbital logic: each resident runs its own useFrame, orbiting at NPC_RADIUS
// on a slow individual arc (per-character speed multiplier). reducedMotion →
// static (holds initial position). No per-frame allocations (module-scope
// scratch Vector3 avoided by scalar position writes).
//
// CONTRACT: zero new deps, no external URLs, no textures. Procedural geometry
// + MeshToonMaterial only (no TremblingOutline — residents are background
// characters; the outline budget is reserved for Wren).

import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'

const NPC_RADIUS = 12.5
const BASE_SPEED = 0.14

// Per-character design spec — all original English Metro canon.
interface ResidentDef {
  coat: string     // coat body color
  hem: string      // coat hem shadow band
  skin: string     // skin tone
  hair: string     // hair color
  accent: string   // character-defining accessory color
  style: 'scarf' | 'apron' | 'collar' | 'cap'
  initAngle: number  // starting orbit angle (radians)
  speedMul: number   // orbit speed multiplier
  bodyW: number      // coat top radius (girth variation)
  bodyB: number      // coat bottom radius
  headR: number      // head radius (height/build variation)
}

const RESIDENTS: ResidentDef[] = [
  {
    // 0. Older Lanterngate local — plum coat, warm grey hair, amber shawl-scarf
    coat: '#6B4F70', hem: '#52305A', skin: '#E8C8A8', hair: '#8A7F7A',
    accent: '#C2913F', style: 'scarf',
    initAngle: 0.6, speedMul: 0.88, bodyW: 0.25, bodyB: 0.42, headR: 0.21,
  },
  {
    // 1. Flora-adjacent vendor — sage green coat, auburn hair, cream apron
    coat: '#5A7A5E', hem: '#3E5942', skin: '#E8C8A8', hair: '#7A4A2A',
    accent: '#D9CDB4', style: 'apron',
    initAngle: 0.6 + Math.PI * 0.5, speedMul: 1.14, bodyW: 0.22, bodyB: 0.34, headR: 0.19,
  },
  {
    // 2. Mr. Chen-adjacent café-keeper — deep teal coat, grey hair, white collar
    coat: '#2E5C65', hem: '#1F4048', skin: '#D2A77E', hair: '#6E6E6E',
    accent: '#F6EFE2', style: 'collar',
    initAngle: 0.6 + Math.PI, speedMul: 1.04, bodyW: 0.24, bodyB: 0.40, headR: 0.22,
  },
  {
    // 3. Tomás-adjacent young patron — rust coat, dark hair, bright amber scarf
    coat: '#8A5A3A', hem: '#663E22', skin: '#F0D0B0', hair: '#2E2622',
    accent: '#E8920A', style: 'scarf',
    initAngle: 0.6 + Math.PI * 1.5, speedMul: 1.28, bodyW: 0.20, bodyB: 0.30, headR: 0.18,
  },
]

interface ResidentProps {
  def: ResidentDef
  reducedMotion: boolean
}

// One fully-built resident that orbits at NPC_RADIUS.
function Resident({ def, reducedMotion }: ResidentProps) {
  const groupRef = useRef<Group>(null!)
  const t = useRef(0)

  useFrame((_, delta) => {
    if (!groupRef.current) return
    const dt = reducedMotion ? 0 : delta
    t.current += dt * def.speedMul * BASE_SPEED
    const angle = def.initAngle + t.current
    groupRef.current.position.set(
      Math.cos(angle) * NPC_RADIUS,
      0,
      Math.sin(angle) * NPC_RADIUS,
    )
    // Face the direction of travel (tangent = angle + π/2).
    groupRef.current.rotation.y = -angle + Math.PI / 2
  })

  const hw = def.headR  // head radius

  return (
    <group ref={groupRef}>
      {/* ─── Coat body (A-line silhouette) ─── */}
      <mesh position={[0, 0.7, 0]} castShadow>
        <cylinderGeometry args={[def.bodyW, def.bodyB, 1.4, 9]} />
        <meshToonMaterial color={def.coat} />
      </mesh>
      {/* Coat hem shadow band */}
      <mesh position={[0, 0.02, 0]}>
        <cylinderGeometry args={[def.bodyB + 0.01, def.bodyB + 0.01, 0.07, 9]} />
        <meshToonMaterial color={def.hem} />
      </mesh>

      {/* ─── Character-defining accessory ─── */}
      {def.style === 'scarf' && (
        // Warm scarf loop at neck
        <mesh position={[0, 1.41, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[def.bodyW * 0.55, 0.055, 6, 12]} />
          <meshToonMaterial color={def.accent} />
        </mesh>
      )}
      {def.style === 'apron' && (
        // Cream apron panel over the coat front (+Z)
        <mesh position={[0, 0.72, def.bodyW + 0.02]}>
          <boxGeometry args={[def.bodyW * 1.1, 0.6, 0.04]} />
          <meshToonMaterial color={def.accent} />
        </mesh>
      )}
      {def.style === 'collar' && (
        // White collar at the coat top showing under the face
        <mesh position={[0, 1.36, def.bodyW * 0.6]}>
          <boxGeometry args={[def.bodyW * 1.4, 0.09, 0.04]} />
          <meshToonMaterial color={def.accent} />
        </mesh>
      )}
      {def.style === 'cap' && (
        // Postal / work cap above the hair
        <mesh position={[0, 1.7 + hw + 0.04, 0.04]}>
          <boxGeometry args={[hw * 2.2, 0.1, hw * 2.2]} />
          <meshToonMaterial color={def.accent} />
        </mesh>
      )}

      {/* ─── Neck ─── */}
      <mesh position={[0, 1.44, 0]}>
        <cylinderGeometry args={[0.08, 0.09, 0.12, 7]} />
        <meshToonMaterial color={def.skin} />
      </mesh>

      {/* ─── Head ─── */}
      <mesh position={[0, 1.58 + hw, 0]} castShadow>
        <sphereGeometry args={[hw, 14, 11]} />
        <meshToonMaterial color={def.skin} />
      </mesh>

      {/* ─── Hair cap (upper dome over the head) ─── */}
      <mesh position={[0, 1.64 + hw, -0.02]}>
        <sphereGeometry args={[hw * 1.06, 11, 9, 0, Math.PI * 2, 0, Math.PI * 0.6]} />
        <meshToonMaterial color={def.hair} />
      </mesh>

      {/* ─── Eyes (dark spheres, front face = +Z) ─── */}
      <mesh position={[-hw * 0.36, 1.61 + hw, hw * 0.9]}>
        <sphereGeometry args={[hw * 0.15, 7, 6]} />
        <meshToonMaterial color="#1A1410" />
      </mesh>
      <mesh position={[hw * 0.36, 1.61 + hw, hw * 0.9]}>
        <sphereGeometry args={[hw * 0.15, 7, 6]} />
        <meshToonMaterial color="#1A1410" />
      </mesh>
    </group>
  )
}

export interface NpcResidentsProps {
  reducedMotion: boolean
}

/** Renders all 4 canon residents. Drop-in replacement for NpcSilhouettes. */
export function NpcResidents({ reducedMotion }: NpcResidentsProps) {
  return (
    <>
      {RESIDENTS.map((def, i) => (
        <Resident key={i} def={def} reducedMotion={reducedMotion} />
      ))}
    </>
  )
}
