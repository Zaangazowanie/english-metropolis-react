// NamedResidents — the four canon English Metro NPCs pinned at their district
// landmarks: Flora at her flower stall, Mr. Chen at the café doorway, Mr. Frank
// at the Sorting Office, and Posta at the pier. Each is a static posed figure
// (no orbit — they stand still, slightly turned to their place of work) built at
// the same fidelity as the drifting NpcResidents (coat + head + hair + eyes +
// accessory). 4 × 6 draw calls = 24 draw calls total.
//
// CONTRACT: zero new deps, no textures/GLBs/URLs. Procedural geometry only.
// Pure static — no useFrame, no per-frame allocations. reducedMotion-agnostic.
// Positions + rotations mirror the landmark placements in EnglishMetroWorld.tsx.

import type { JSX } from 'react'

// ── Shared geometry parameters ────────────────────────────────────────────────
const EYE = '#1A1410'

// ── Static canon figure ───────────────────────────────────────────────────────
function StaticFigure({
  position, rotation, coat, hem, skin, hair, accent,
  style,
}: {
  position: [number, number, number]
  rotation: [number, number, number]
  coat: string; hem: string; skin: string; hair: string; accent: string
  style: 'scarf' | 'apron' | 'collar' | 'cap'
}): JSX.Element {
  const headR = 0.19
  const girth = 0.36
  const top = 1.4

  return (
    <group position={position} rotation={rotation}>
      {/* coat body */}
      <mesh position={[0, 0.7, 0]} castShadow>
        <cylinderGeometry args={[girth * 0.7, girth, 1.4, 9]} />
        <meshToonMaterial color={coat} />
      </mesh>
      {/* coat hem */}
      <mesh position={[0, 0.04, 0]}>
        <cylinderGeometry args={[girth + 0.01, girth + 0.01, 0.07, 9]} />
        <meshToonMaterial color={hem} />
      </mesh>
      {/* accessory */}
      {style === 'scarf' && (
        <mesh position={[0, top + 0.02, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[girth * 0.5, 0.055, 6, 12]} />
          <meshToonMaterial color={accent} />
        </mesh>
      )}
      {style === 'apron' && (
        <mesh position={[0, 0.72, girth * 0.85]}>
          <boxGeometry args={[girth * 1.05, 0.58, 0.04]} />
          <meshToonMaterial color={accent} />
        </mesh>
      )}
      {style === 'collar' && (
        <mesh position={[0, top - 0.04, girth * 0.52]}>
          <boxGeometry args={[girth * 1.2, 0.09, 0.04]} />
          <meshToonMaterial color={accent} />
        </mesh>
      )}
      {style === 'cap' && (
        <mesh position={[0, top + 0.22 + headR * 2, 0.02]}>
          <boxGeometry args={[headR * 2.2, 0.1, headR * 2.2]} />
          <meshToonMaterial color={accent} />
        </mesh>
      )}
      {/* neck */}
      <mesh position={[0, top + 0.04, 0]}>
        <cylinderGeometry args={[0.08, 0.09, 0.12, 7]} />
        <meshToonMaterial color={skin} />
      </mesh>
      {/* head */}
      <mesh position={[0, top + 0.18 + headR, 0]} castShadow>
        <sphereGeometry args={[headR, 14, 11]} />
        <meshToonMaterial color={skin} />
      </mesh>
      {/* hair cap */}
      <mesh position={[0, top + 0.24 + headR, -0.02]}>
        <sphereGeometry args={[headR * 1.06, 11, 9, 0, Math.PI * 2, 0, Math.PI * 0.6]} />
        <meshToonMaterial color={hair} />
      </mesh>
      {/* eyes */}
      <mesh position={[-headR * 0.36, top + 0.15 + headR, headR * 0.92]}>
        <sphereGeometry args={[headR * 0.15, 7, 6]} />
        <meshToonMaterial color={EYE} />
      </mesh>
      <mesh position={[headR * 0.36, top + 0.15 + headR, headR * 0.92]}>
        <sphereGeometry args={[headR * 0.15, 7, 6]} />
        <meshToonMaterial color={EYE} />
      </mesh>
    </group>
  )
}

// ── Named canon figures at their landmarks ────────────────────────────────────

/** Flora — behind her flower stall, green coat + apron, facing the plaza. */
function Flora(): JSX.Element {
  return (
    <StaticFigure
      position={[-5.9, 0, 3.8]} rotation={[0, 2.18 + Math.PI, 0]}
      coat="#5A7A5E" hem="#3E5942" skin="#E8C8A8" hair="#7A4A2A"
      accent="#D9CDB4" style="apron"
    />
  )
}

/** Mr. Chen — in the café doorway, deep-teal coat + white collar, turned slightly. */
function MrChen(): JSX.Element {
  return (
    <StaticFigure
      position={[2.85, 0, -6.7]} rotation={[0, -0.405 + Math.PI, 0]}
      coat="#2E5C65" hem="#1F4048" skin="#D2A77E" hair="#6E6E6E"
      accent="#F6EFE2" style="collar"
    />
  )
}

/** Mr. Frank — by the Sorting Office door, navy-teal coat + peaked cap. */
function MrFrank(): JSX.Element {
  return (
    <StaticFigure
      position={[-5.6, 0, -3.8]} rotation={[0, 0.93 + Math.PI, 0]}
      coat="#34506B" hem="#243B52" skin="#E8C8A8" hair="#9A9590"
      accent="#2B2540" style="cap"
    />
  )
}

/** Posta — at the pier rack, mauve coat + rose scarf, dreamy, facing the plaza. */
function Posta(): JSX.Element {
  return (
    <StaticFigure
      position={[2.3, 0, 6.6]} rotation={[0, -2.80 + Math.PI, 0]}
      coat="#7A5A6E" hem="#5A3E50" skin="#D2A77E" hair="#3A2E2A"
      accent="#C57195" style="scarf"
    />
  )
}

/** Renders all four named NPCs at their district landmarks. */
export function NamedResidents(): JSX.Element {
  return (
    <>
      <Flora />
      <MrChen />
      <MrFrank />
      <Posta />
    </>
  )
}
