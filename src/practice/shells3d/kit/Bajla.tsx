import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import { palette } from './palette'

export type BajlaVariant = 'idle' | 'flyby' | 'celebrate'

export interface BajlaProps {
  /** Behaviour: gentle hover (idle), full-arc cross (flyby), spin+hop
   *  (celebrate). Default 'idle'. */
  variant?: BajlaVariant
  /** Hold a calm resting pose with no continuous motion. */
  reducedMotion?: boolean
  scale?: number
  position?: [number, number, number]
}

/**
 * Bajla — the Fluent City guide, a procedural low-poly purple owl. Built from
 * primitive geometry + flat-shaded material colours only (no textures, no GLB,
 * nothing to download). A single allocation-free `useFrame` drives all three
 * behaviours; `reducedMotion` freezes her to a resting pose. Must be rendered
 * inside a `CityStage` / r3f `<Canvas>`.
 */
export function Bajla({
  variant = 'idle',
  reducedMotion = false,
  scale = 1,
  position = [0, 0, 0],
}: BajlaProps) {
  const root = useRef<Group>(null)
  const leftWing = useRef<Group>(null)
  const rightWing = useRef<Group>(null)

  useFrame((state) => {
    const g = root.current
    if (!g) return

    if (reducedMotion) {
      g.position.set(position[0], position[1], position[2])
      g.rotation.set(0, 0, 0)
      if (leftWing.current) leftWing.current.rotation.z = 0.2
      if (rightWing.current) rightWing.current.rotation.z = -0.2
      return
    }

    const t = state.clock.elapsedTime
    let flap = 0.2

    if (variant === 'flyby') {
      const span = 6
      const x = ((t * 1.6) % (span * 2)) - span
      g.position.x = position[0] + x
      g.position.y = position[1] + Math.sin((x / span) * Math.PI) * 1.2 + 0.6
      g.rotation.z = Math.cos((x / span) * Math.PI) * 0.25
      g.rotation.y = 0.4
      flap = 0.7 + Math.sin(t * 16) * 0.6
    } else if (variant === 'celebrate') {
      g.position.x = position[0]
      g.position.y = position[1] + Math.abs(Math.sin(t * 4)) * 0.4
      g.rotation.z = 0
      g.rotation.y = t * 2
      flap = 0.6 + Math.sin(t * 18) * 0.7
    } else {
      // idle
      g.position.x = position[0]
      g.position.y = position[1] + Math.sin(t * 1.6) * 0.08
      g.rotation.z = Math.sin(t * 0.9) * 0.04
      g.rotation.y = Math.sin(t * 0.5) * 0.15
      flap = 0.18 + Math.sin(t * 2) * 0.06
    }

    if (leftWing.current) leftWing.current.rotation.z = flap
    if (rightWing.current) rightWing.current.rotation.z = -flap
  })

  return (
    <group ref={root} position={position} scale={scale}>
      {/* Body */}
      <mesh castShadow scale={[1, 1.25, 1]}>
        <sphereGeometry args={[0.6, 18, 14]} />
        <meshStandardMaterial color={palette.bajlaPurple} roughness={0.85} flatShading />
      </mesh>
      {/* Belly / chest */}
      <mesh position={[0, -0.05, 0.42]} scale={[0.78, 0.95, 0.6]}>
        <sphereGeometry args={[0.55, 16, 12]} />
        <meshStandardMaterial color={palette.bajlaBelly} roughness={0.9} flatShading />
      </mesh>

      {/* Head group */}
      <group position={[0, 0.72, 0.05]}>
        <mesh castShadow>
          <sphereGeometry args={[0.46, 18, 14]} />
          <meshStandardMaterial color={palette.bajlaPurple} roughness={0.85} flatShading />
        </mesh>
        {/* Face disc */}
        <mesh position={[0, -0.02, 0.34]} scale={[1, 1, 0.5]}>
          <sphereGeometry args={[0.38, 16, 12]} />
          <meshStandardMaterial color={palette.bajlaBelly} roughness={0.9} flatShading />
        </mesh>
        {/* Eyes (sclera) */}
        <mesh position={[-0.16, 0.04, 0.5]}>
          <sphereGeometry args={[0.13, 14, 12]} />
          <meshStandardMaterial
            color={palette.ember}
            emissive={palette.ember}
            emissiveIntensity={0.25}
          />
        </mesh>
        <mesh position={[0.16, 0.04, 0.5]}>
          <sphereGeometry args={[0.13, 14, 12]} />
          <meshStandardMaterial
            color={palette.ember}
            emissive={palette.ember}
            emissiveIntensity={0.25}
          />
        </mesh>
        {/* Pupils */}
        <mesh position={[-0.16, 0.04, 0.62]}>
          <sphereGeometry args={[0.06, 10, 8]} />
          <meshStandardMaterial color={palette.night} />
        </mesh>
        <mesh position={[0.16, 0.04, 0.62]}>
          <sphereGeometry args={[0.06, 10, 8]} />
          <meshStandardMaterial color={palette.night} />
        </mesh>
        {/* Beak */}
        <mesh position={[0, -0.12, 0.56]} rotation={[Math.PI / 2, 0, 0]}>
          <coneGeometry args={[0.08, 0.22, 8]} />
          <meshStandardMaterial color={palette.beak} roughness={0.5} flatShading />
        </mesh>
        {/* Ear tufts */}
        <mesh position={[-0.3, 0.42, 0]} rotation={[0, 0, 0.4]}>
          <coneGeometry args={[0.1, 0.34, 6]} />
          <meshStandardMaterial color={palette.bajlaWing} roughness={0.9} flatShading />
        </mesh>
        <mesh position={[0.3, 0.42, 0]} rotation={[0, 0, -0.4]}>
          <coneGeometry args={[0.1, 0.34, 6]} />
          <meshStandardMaterial color={palette.bajlaWing} roughness={0.9} flatShading />
        </mesh>
      </group>

      {/* Wings — pivot groups flap around the shoulder */}
      <group ref={leftWing} position={[-0.55, 0.1, 0]}>
        <mesh castShadow position={[-0.25, -0.1, 0]} rotation={[0, 0, 0.3]} scale={[1, 1.6, 0.4]}>
          <sphereGeometry args={[0.3, 10, 8]} />
          <meshStandardMaterial color={palette.bajlaWing} roughness={0.9} flatShading />
        </mesh>
      </group>
      <group ref={rightWing} position={[0.55, 0.1, 0]}>
        <mesh castShadow position={[0.25, -0.1, 0]} rotation={[0, 0, -0.3]} scale={[1, 1.6, 0.4]}>
          <sphereGeometry args={[0.3, 10, 8]} />
          <meshStandardMaterial color={palette.bajlaWing} roughness={0.9} flatShading />
        </mesh>
      </group>

      {/* Tail */}
      <mesh position={[0, -0.5, -0.4]} rotation={[0.5, 0, 0]} scale={[1, 1, 0.5]}>
        <coneGeometry args={[0.34, 0.5, 6]} />
        <meshStandardMaterial color={palette.bajlaWing} roughness={0.9} flatShading />
      </mesh>

      {/* Feet */}
      <mesh position={[-0.18, -0.8, 0.2]} rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[0.08, 0.18, 6]} />
        <meshStandardMaterial color={palette.beak} flatShading />
      </mesh>
      <mesh position={[0.18, -0.8, 0.2]} rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[0.08, 0.18, 6]} />
        <meshStandardMaterial color={palette.beak} flatShading />
      </mesh>
    </group>
  )
}

export default Bajla
