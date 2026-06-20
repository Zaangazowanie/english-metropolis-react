// WorldPortal — a "walk up and play" marker in the world. A soft amber beam
// rising from a lamp post + a pulsing ground ring. When Wren walks within
// range (handled by WrenRig), EnglishMetroWorld shows a DOM prompt and Enter/
// tap lazy-loads the linked per-game shell.
//
// CONTRACT: procedural geometry only, MeshBasicMaterial (additive amber glow),
// no textures/URLs/deps. 2 draw calls per portal (beam + ring). reducedMotion
// → static (no pulse). No per-frame allocations.

import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending } from 'three'
import type { Mesh } from 'three'
import { palette } from '../practice/shells3d/kit/palette'

/** One district portal: links a world location to a registered game shell. */
export interface PortalDef {
  /** Must equal a game3dRegistry shellKey (e.g. 'labelleddiagram'). */
  shellKey: string
  /** Learner-facing English name shown in the DOM prompt. */
  title: string
  /** World position [x, y, z] — y is ignored (beam sits on the ground). */
  position: [number, number, number]
}

export interface WorldPortalProps {
  position: [number, number, number]
  /** Highlighted when Wren is in range (brighter, faster pulse). */
  active?: boolean
  /** Completed once (steady brighter glow). */
  lit?: boolean
  reducedMotion?: boolean
}

export function WorldPortal({ position, active = false, lit = false, reducedMotion = false }: WorldPortalProps) {
  const beamRef = useRef<Mesh>(null!)
  const ringRef = useRef<Mesh>(null!)
  const t = useRef(0)

  const baseOpacity = lit ? 0.5 : active ? 0.42 : 0.26

  useFrame((_, delta) => {
    if (reducedMotion) return
    t.current += delta * (active ? 3.2 : 1.6)
    const pulse = (Math.sin(t.current) * 0.5 + 0.5) * 0.18
    if (beamRef.current) {
      const m = beamRef.current.material as { opacity: number }
      m.opacity = baseOpacity + pulse
      beamRef.current.scale.x = 1 + pulse * 0.3
      beamRef.current.scale.z = 1 + pulse * 0.3
    }
    if (ringRef.current) {
      const m = ringRef.current.material as { opacity: number }
      m.opacity = baseOpacity + 0.25 + pulse
    }
  })

  return (
    <group position={[position[0], 0, position[2]]}>
      {/* Vertical beam */}
      <mesh ref={beamRef} position={[0, 1.2, 0]}>
        <cylinderGeometry args={[0.34, 0.5, 2.4, 12, 1, true]} />
        <meshBasicMaterial
          color={palette.lanternAmber}
          transparent
          opacity={baseOpacity}
          blending={AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      {/* Bright inner core */}
      <mesh position={[0, 1.1, 0]}>
        <cylinderGeometry args={[0.1, 0.14, 2.2, 8]} />
        <meshBasicMaterial
          color={palette.lanternCore}
          transparent
          opacity={baseOpacity + 0.2}
          blending={AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      {/* Ground ring */}
      <mesh ref={ringRef} position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.72, 0.98, 28]} />
        <meshBasicMaterial
          color={palette.lanternAmber}
          transparent
          opacity={baseOpacity + 0.25}
          blending={AdditiveBlending}
          depthWrite={false}
          side={2 /* DoubleSide */}
        />
      </mesh>
    </group>
  )
}
