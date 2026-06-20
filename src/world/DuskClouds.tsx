// DuskClouds — soft watercolor clouds drifting high over the city, the slow
// "ebb and flow" wind that makes the dusk sky feel alive. The whole cloud bank
// rotates very slowly around the world so clouds glide past on the breeze.
//
// Procedural: one InstancedMesh of flattened, low-opacity spheres (soft blobs)
// tinted with the warm horizon glow. No textures, no GLBs, no external assets.
// reducedMotion → the bank holds still. 1 draw call. Positions set once; the
// only per-frame work is a single scalar rotation on the parent group.

import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Object3D, Color } from 'three'
import type { Group, InstancedMesh } from 'three'
import { palette } from '../practice/shells3d/kit/palette'

const _o = new Object3D()
const _c = new Color()

const CLOUD_COUNT = 9
const DRIFT_SPEED = 0.011 // radians / second — barely-perceptible breeze

// Deterministic cloud layout (radius, height, scale, tint) — no Math.random so
// it's stable across reloads.
const CLOUDS = Array.from({ length: CLOUD_COUNT }, (_, i) => {
  const angle = (i / CLOUD_COUNT) * Math.PI * 2 + (i % 3) * 0.4
  const radius = 22 + (i % 4) * 4          // 22..34
  const height = 13 + ((i * 2.3) % 7)      // 13..20
  const sx = 7 + ((i * 1.7) % 6)           // 7..13 wide
  const sz = 4 + ((i * 1.3) % 4)           // 4..8 deep
  return { angle, radius, height, sx, sy: 1.4, sz, warm: i % 2 === 0 }
})

export function DuskClouds({ reducedMotion = false }: { reducedMotion?: boolean }) {
  const groupRef = useRef<Group>(null!)
  const meshRef = useRef<InstancedMesh>(null!)

  useEffect(() => {
    if (!meshRef.current) return
    CLOUDS.forEach((c, i) => {
      _o.position.set(Math.cos(c.angle) * c.radius, c.height, Math.sin(c.angle) * c.radius)
      _o.rotation.set(0, -c.angle, 0)
      _o.scale.set(c.sx, c.sy, c.sz)
      _o.updateMatrix()
      meshRef.current.setMatrixAt(i, _o.matrix)
      // Alternate warm rose vs cooler violet for depth.
      _c.set(c.warm ? palette.skyGlow : palette.duskHorizon)
      meshRef.current.setColorAt(i, _c)
    })
    meshRef.current.instanceMatrix.needsUpdate = true
    if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true
  }, [])

  useFrame((_, delta) => {
    if (reducedMotion || !groupRef.current) return
    groupRef.current.rotation.y += delta * DRIFT_SPEED
  })

  return (
    <group ref={groupRef}>
      <instancedMesh ref={meshRef} args={[undefined, undefined, CLOUD_COUNT]} frustumCulled={false}>
        <sphereGeometry args={[1, 10, 8]} />
        <meshBasicMaterial transparent opacity={0.16} depthWrite={false} />
      </instancedMesh>
    </group>
  )
}
