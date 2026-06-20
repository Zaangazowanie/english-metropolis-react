// LampRelight — the brief amber bloom when a lamp first lights.
// Canon: "each correct card makes its object glow amber. When all four are
// placed, the lamp-post ignites — a slow warm bloom, not a flash."
//
// Renders an expanding additive sphere burst at the portal position for
// DURATION seconds, then fades out. Driven by useFrame, no per-frame allocs.
// reducedMotion → instant fade (bloom skipped). 1 draw call.

import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending } from 'three'
import type { Mesh } from 'three'
import { palette } from '../practice/shells3d/kit/palette'

const DURATION = 1.3  // seconds for the full bloom cycle

export interface LampRelightProps {
  position: [number, number, number]
  reducedMotion?: boolean
}

export function LampRelight({ position, reducedMotion = false }: LampRelightProps) {
  const coreRef  = useRef<Mesh>(null!)
  const outerRef = useRef<Mesh>(null!)
  const t = useRef(0)

  useFrame((_, delta) => {
    t.current = Math.min(t.current + delta, DURATION)
    const p = t.current / DURATION   // 0 → 1

    if (reducedMotion) {
      // Still render briefly to confirm the lamp lit, just no expansion.
      const fast = Math.min(t.current * 8, 1)
      ;(coreRef.current.material as { opacity: number }).opacity  = (1 - fast) * 0.5
      ;(outerRef.current.material as { opacity: number }).opacity = 0
      return
    }

    // Core: expands quickly then fades — the "ignition" flash.
    const coreS = 0.4 + p * 2.4           // scale 0.4 → 2.8
    const coreO = p < 0.15 ? (p / 0.15) * 0.82 : (1 - (p - 0.15) / 0.85) * 0.82
    coreRef.current.scale.setScalar(coreS)
    ;(coreRef.current.material as { opacity: number }).opacity = Math.max(0, coreO)

    // Outer ring: starts later, expands slower — the "bloom" spreading.
    const op = Math.max(0, p - 0.1) / 0.9
    const outerS = 0.6 + op * 4.5
    const outerO = op < 0.3 ? (op / 0.3) * 0.38 : (1 - (op - 0.3) / 0.7) * 0.38
    outerRef.current.scale.setScalar(outerS)
    ;(outerRef.current.material as { opacity: number }).opacity = Math.max(0, outerO)
  })

  return (
    <group position={[position[0], 1.4, position[2]]}>
      {/* Inner core flash */}
      <mesh ref={coreRef}>
        <sphereGeometry args={[0.5, 12, 10]} />
        <meshBasicMaterial
          color={palette.lanternCore}
          transparent opacity={0}
          blending={AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      {/* Outer amber bloom */}
      <mesh ref={outerRef}>
        <sphereGeometry args={[0.5, 10, 8]} />
        <meshBasicMaterial
          color={palette.lanternAmber}
          transparent opacity={0}
          blending={AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  )
}
