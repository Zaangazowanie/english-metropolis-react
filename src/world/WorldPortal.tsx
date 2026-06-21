// WorldPortal — a "walk up and play" marker in the world. A soft amber beam
// rising from a lamp post + a pulsing ground ring. When Wren walks within
// range (handled by WrenRig), EnglishMetroWorld shows a DOM prompt and Enter/
// tap lazy-loads the linked per-game shell.
//
// CONTRACT: procedural geometry only, MeshBasicMaterial (additive amber glow),
// no textures/URLs/deps. Quality-tiered: high → 4 draw calls (beam + core +
// ring + sparks); medium/low → 3 draw calls (core skipped, ring + sparks kept).
// reducedMotion → static (no pulse). No per-frame allocations.

import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, Float32BufferAttribute } from 'three'
import type { Mesh, Points as ThreePoints, BufferGeometry } from 'three'
import { palette } from '../practice/shells3d/kit/palette'
import { useStageQuality } from '../practice/shells3d/kit/CityStage'

const SPARKS = 9 // rising light-motes inside each beam ("words carry light")

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
  const chevRef = useRef<Mesh>(null!)
  const sparkGeo = useRef<BufferGeometry>(null!)
  const sparkPts = useRef<ThreePoints>(null!)
  const t = useRef(0)
  const { tier } = useStageQuality()
  const highFx = tier === 'high'

  const baseOpacity = lit ? 0.5 : active ? 0.42 : 0.26

  // Deterministic initial spark positions inside the beam (no Math.random).
  const sparkInit = useMemo(() => {
    const arr = new Float32Array(SPARKS * 3)
    for (let i = 0; i < SPARKS; i++) {
      const ang = (i / SPARKS) * Math.PI * 2 * 2.7
      const rad = 0.06 + (i % 4) * 0.06
      arr[i * 3] = Math.cos(ang) * rad
      arr[i * 3 + 1] = (i * 0.51) % 2.3        // staggered heights 0..2.3
      arr[i * 3 + 2] = Math.sin(ang) * rad
    }
    return arr
  }, [])

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
    // Rise the sparks (in-place; wrap at the top of the beam).
    const geo = sparkGeo.current
    if (geo && geo.attributes.position) {
      const attr = geo.attributes.position as Float32BufferAttribute
      const a = attr.array as Float32Array
      const rise = delta * (active ? 0.9 : 0.55)
      for (let i = 0; i < SPARKS; i++) {
        a[i * 3 + 1] += rise
        if (a[i * 3 + 1] > 2.3) a[i * 3 + 1] = 0.02
      }
      attr.needsUpdate = true
    }
    // Bob the "play here" chevron (faster + a touch higher when Wren is near).
    if (chevRef.current) {
      chevRef.current.position.y = 2.95 + Math.sin(t.current * (active ? 2.4 : 1.5)) * 0.14
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
      {/* Bright inner core — high quality only (saves 1 draw call × 5 portals on medium/low) */}
      {highFx && (
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
      )}
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
      {/* Rising light-sparks inside the beam */}
      <points ref={sparkPts}>
        <bufferGeometry ref={sparkGeo}>
          <bufferAttribute attach="attributes-position" args={[sparkInit, 3]} />
        </bufferGeometry>
        <pointsMaterial
          color={palette.lanternCore}
          size={0.07}
          sizeAttenuation
          transparent
          opacity={0.85}
          blending={AdditiveBlending}
          depthWrite={false}
        />
      </points>
      {/* "Play here" chevron — a bobbing green down-arrow over the portal, the
          abeto interaction cue. Hidden once the district is completed (lit). */}
      {!lit && (
        <mesh ref={chevRef} position={[0, 3.15, 0]} rotation={[Math.PI, 0, 0]}>
          <coneGeometry args={[0.34, 0.58, 4]} />
          <meshBasicMaterial color={active ? '#9CFFAC' : '#6FE08A'} />
        </mesh>
      )}
    </group>
  )
}
