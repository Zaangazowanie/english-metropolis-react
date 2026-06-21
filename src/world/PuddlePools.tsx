// PuddlePools — shallow puddles on the cobbles that catch the lamplight (canon
// World Bible: "warm lantern light pools on wet cobbles"). Each puddle is a flat
// dark wet-teal disc (semi-transparent, so the cobbles show through) with a soft
// amber sheen disc fake-reflecting the dusk lamps.
//
// CONTRACT: zero new deps, no textures/GLBs/URLs. Procedural geometry only.
// Static — placed once in a useEffect, no per-frame work, reducedMotion-agnostic.
// 2 draw calls (puddles + sheens, both instanced). Discs sit just above the
// cobbles (y≈0.035) and below Wren's feet.

import { useEffect, useRef } from 'react'
import { Object3D, AdditiveBlending } from 'three'
import type { InstancedMesh } from 'three'

const _o = new Object3D()

const WET = '#163A44'     // dark wet teal (puddle water)
const SHEEN = '#E8920A'   // amber lamplight caught in the water
const GOLDEN = Math.PI * (3 - Math.sqrt(5))
const PUDDLES = 11

export function PuddlePools() {
  const poolRef = useRef<InstancedMesh>(null!)
  const sheenRef = useRef<InstancedMesh>(null!)

  useEffect(() => {
    if (!poolRef.current) return
    for (let i = 0; i < PUDDLES; i++) {
      const ang = i * GOLDEN
      const r = 3.4 + (i % 5) * 1.0          // 3.4 .. 7.4 (across the plaza, near lamps)
      const x = Math.cos(ang) * r
      const z = Math.sin(ang) * r
      const sx = 0.5 + ((i * 0.41) % 1) * 0.6 // elongated, varied
      const sz = sx * (0.6 + ((i * 0.27) % 1) * 0.5)
      const yaw = (i * 1.3) % (Math.PI * 2)

      // Puddle disc — flat (face +Y), semi-transparent over the cobbles.
      _o.position.set(x, 0.035, z)
      _o.rotation.set(-Math.PI / 2, 0, yaw)
      _o.scale.set(sx, sz, 1)
      _o.updateMatrix()
      poolRef.current.setMatrixAt(i, _o.matrix)

      // Amber sheen — smaller, slightly offset, additive glow.
      _o.position.set(x + sx * 0.12, 0.04, z)
      _o.rotation.set(-Math.PI / 2, 0, yaw)
      _o.scale.set(sx * 0.5, sz * 0.5, 1)
      _o.updateMatrix()
      sheenRef.current.setMatrixAt(i, _o.matrix)
    }
    poolRef.current.instanceMatrix.needsUpdate = true
    sheenRef.current.instanceMatrix.needsUpdate = true
  }, [])

  return (
    <group>
      {/* Wet puddles (semi-transparent dark teal) */}
      <instancedMesh ref={poolRef} args={[undefined, undefined, PUDDLES]} frustumCulled={false}>
        <circleGeometry args={[0.6, 16]} />
        <meshBasicMaterial color={WET} transparent opacity={0.55} depthWrite={false} />
      </instancedMesh>
      {/* Amber lamplight sheen caught in the water (additive) */}
      <instancedMesh ref={sheenRef} args={[undefined, undefined, PUDDLES]} frustumCulled={false}>
        <circleGeometry args={[0.6, 12]} />
        <meshBasicMaterial color={SHEEN} transparent opacity={0.14} blending={AdditiveBlending} depthWrite={false} />
      </instancedMesh>
    </group>
  )
}
