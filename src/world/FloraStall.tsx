// FloraStall — Flora's flower stall (canon Vertical Slice Beat 4a, Saffron
// Market): the signature errand landmark. A wooden market counter under a
// striped awning, with zinc buckets of the four canon bouquets — SUNFLOWER,
// ROSE, DAISY, LAVENDER — the exact flowers the player tags in Flora's errand.
// A warm, hand-built diorama prop that makes the plaza read as a living market.
//
// Procedural geometry only (no textures/GLBs/URLs). Static prop — no per-frame
// work, no animation, reducedMotion-agnostic. Instancing for the repeated parts
// (posts, buckets, blooms) + a warm hanging paper lantern over the stall (canon:
// "paper lanterns sway over the lanes"). ~10 draw calls total.

import { useEffect, useRef } from 'react'
import { Object3D, Color, AdditiveBlending } from 'three'
import type { InstancedMesh } from 'three'
import { TremblingOutlineMesh } from './TremblingOutline'

const _o = new Object3D()
const _c = new Color()

const WOOD = '#7A5C3A'
const WOOD_DARK = '#5E4429'
const POST = '#4A3A28'
const CREAM = '#E9DFC6'   // awning canvas
const AMBER = '#E8920A'   // awning valance + sunflowers
const ZINC = '#5E7E88'    // buckets (dusk-teal zinc)
const LANTERN = '#FFE9B0' // warm paper-lantern glow

// Bucket placements (2 on the counter, 2 on the ground in front) + flower color.
const BUCKETS: Array<{ pos: [number, number, number]; bloom: string }> = [
  { pos: [-0.45, 1.04, 0.06], bloom: '#E8920A' }, // sunflower (amber)
  { pos: [0.45, 1.04, 0.06],  bloom: '#C0392B' }, // rose (red)
  { pos: [-0.6, 0.14, 0.5],   bloom: '#F2ECDD' }, // daisy (cream-white)
  { pos: [0.62, 0.14, 0.5],   bloom: '#8B5FBF' }, // lavender (purple)
]
const BLOOMS_PER = 4
const BLOOM_TOTAL = BUCKETS.length * BLOOMS_PER
// Deterministic tight cluster offsets above each bucket rim.
const CLUSTER: Array<[number, number, number]> = [
  [0, 0.0, 0], [-0.07, 0.05, 0.03], [0.07, 0.04, -0.03], [0.0, 0.09, 0.06],
]

export interface FloraStallProps {
  position?: [number, number, number]
  rotation?: [number, number, number]
  reducedMotion?: boolean
}

export function FloraStall({
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  reducedMotion = false,
}: FloraStallProps) {
  const postsRef = useRef<InstancedMesh>(null!)
  const bucketsRef = useRef<InstancedMesh>(null!)
  const bloomsRef = useRef<InstancedMesh>(null!)

  useEffect(() => {
    // Two awning posts at the counter ends.
    const postX = [-0.84, 0.84]
    postX.forEach((x, i) => {
      _o.position.set(x, 1.44, -0.18)
      _o.rotation.set(0, 0, 0)
      _o.scale.set(1, 1, 1)
      _o.updateMatrix()
      postsRef.current.setMatrixAt(i, _o.matrix)
    })
    postsRef.current.instanceMatrix.needsUpdate = true

    // Buckets + bloom clusters.
    BUCKETS.forEach((b, bi) => {
      _o.position.set(b.pos[0], b.pos[1], b.pos[2])
      _o.rotation.set(0, 0, 0)
      _o.scale.set(1, 1, 1)
      _o.updateMatrix()
      bucketsRef.current.setMatrixAt(bi, _o.matrix)

      const top = b.pos[1] + 0.16 // bucket rim
      CLUSTER.forEach((off, ci) => {
        const idx = bi * BLOOMS_PER + ci
        _o.position.set(b.pos[0] + off[0], top + off[1], b.pos[2] + off[2])
        _o.rotation.set(0, 0, 0)
        _o.scale.setScalar(ci === 0 ? 1.1 : 0.85)
        _o.updateMatrix()
        bloomsRef.current.setMatrixAt(idx, _o.matrix)
        _c.set(b.bloom)
        bloomsRef.current.setColorAt(idx, _c)
      })
    })
    bucketsRef.current.instanceMatrix.needsUpdate = true
    bloomsRef.current.instanceMatrix.needsUpdate = true
    if (bloomsRef.current.instanceColor) bloomsRef.current.instanceColor.needsUpdate = true
  }, [])

  return (
    <group position={position} rotation={rotation}>
      {/* ── Counter base ── */}
      <mesh position={[0, 0.43, 0]} castShadow>
        <boxGeometry args={[1.7, 0.85, 0.6]} />
        <meshToonMaterial color={WOOD} />
      </mesh>
      {/* Counter top lip (overhang) + trembling outline (most-seen edge) */}
      <mesh position={[0, 0.88, 0]} castShadow>
        <boxGeometry args={[1.85, 0.08, 0.72]} />
        <meshToonMaterial color={WOOD_DARK} />
      </mesh>
      <TremblingOutlineMesh position={[0, 0.88, 0]} thickness={0.02} jitter={0.005} reducedMotion={reducedMotion}>
        <boxGeometry args={[1.85, 0.08, 0.72]} />
      </TremblingOutlineMesh>

      {/* ── Awning posts (instanced) ── */}
      <instancedMesh ref={postsRef} args={[undefined, undefined, 2]} frustumCulled={false} castShadow>
        <cylinderGeometry args={[0.04, 0.045, 1.12, 6]} />
        <meshToonMaterial color={POST} />
      </instancedMesh>

      {/* ── Striped awning: cream canvas slab + amber valance ── */}
      <mesh position={[0, 2.05, -0.08]} rotation={[-0.16, 0, 0]} castShadow>
        <boxGeometry args={[1.95, 0.05, 0.9]} />
        <meshToonMaterial color={CREAM} />
      </mesh>
      {/* Valance (hanging scalloped front edge) */}
      <mesh position={[0, 1.94, 0.34]}>
        <boxGeometry args={[1.95, 0.18, 0.04]} />
        <meshToonMaterial color={AMBER} />
      </mesh>

      {/* ── Buckets (instanced zinc pails) ── */}
      <instancedMesh ref={bucketsRef} args={[undefined, undefined, BUCKETS.length]} frustumCulled={false} castShadow>
        <cylinderGeometry args={[0.13, 0.1, 0.3, 8]} />
        <meshToonMaterial color={ZINC} />
      </instancedMesh>

      {/* ── Blooms (instanced, per-bucket flower color) ── */}
      <instancedMesh ref={bloomsRef} args={[undefined, undefined, BLOOM_TOTAL]} frustumCulled={false}>
        <sphereGeometry args={[0.09, 8, 6]} />
        <meshToonMaterial />
      </instancedMesh>

      {/* ── Warm hanging paper lantern under the awning front ── */}
      {/* hanger wire */}
      <mesh position={[0, 1.8, 0.36]}>
        <cylinderGeometry args={[0.012, 0.012, 0.3, 4]} />
        <meshToonMaterial color={POST} />
      </mesh>
      {/* paper lantern (glows on its own) */}
      <mesh position={[0, 1.6, 0.36]} scale={[1, 0.9, 1]}>
        <sphereGeometry args={[0.11, 10, 8]} />
        <meshBasicMaterial color={LANTERN} />
      </mesh>
      {/* soft warm halo */}
      <mesh position={[0, 1.6, 0.36]}>
        <sphereGeometry args={[0.32, 12, 10]} />
        <meshBasicMaterial color={AMBER} transparent opacity={0.13} blending={AdditiveBlending} depthWrite={false} />
      </mesh>
    </group>
  )
}
