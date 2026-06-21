// PostcardPier — Posta's pier (canon district "Postcard Pier", gapfill errand).
// The dreamy pier-keeper who keeps the postcards that never sailed. A small
// plank dock reaching out over a hint of teal water, a postcard rack of cream
// cards waiting to be sent, and a mooring bollard.
//
// Procedural geometry only (no textures/GLBs/URLs). Static prop — no per-frame
// work, reducedMotion-agnostic. Instancing for railing posts + postcards.
// ~7 draw calls. The pier's local -Z reaches "out to sea"; +Z faces the plaza.

import { useEffect, useRef } from 'react'
import { Object3D, AdditiveBlending } from 'three'
import type { InstancedMesh } from 'three'

const _o = new Object3D()

const PLANK = '#6E5236'   // weathered pier wood
const POST = '#3A2A1C'    // dark pilings / rail posts
const WATER = '#1C4350'   // deep dusk-teal water
const CARD = '#F2ECDD'    // cream postcards
const RACK = '#5E4429'    // rack wood
const BOLLARD = '#3A4A50' // dark metal mooring bollard
const LAMP = '#FFE9B0'    // warm harbor-lamp glow
const LAMP_AMBER = '#E8920A' // halo

// Railing posts down both sides of the deck (instanced).
const RAIL_POSTS: Array<[number, number]> = [
  [-0.92, 0.1], [-0.92, -0.7], [-0.92, -1.5],
  [0.92, 0.1], [0.92, -0.7], [0.92, -1.5],
]
// Cream postcards on the rack (instanced), slight tilts.
const CARDS: Array<[number, number, number]> = [
  [-0.28, 1.02, 0.12], [0.0, 1.06, -0.1], [0.28, 1.0, 0.08], [-0.14, 0.84, -0.06], [0.16, 0.82, 0.1],
]

export interface PostcardPierProps {
  position?: [number, number, number]
  rotation?: [number, number, number]
}

export function PostcardPier({ position = [0, 0, 0], rotation = [0, 0, 0] }: PostcardPierProps) {
  const railRef = useRef<InstancedMesh>(null!)
  const cardRef = useRef<InstancedMesh>(null!)

  useEffect(() => {
    RAIL_POSTS.forEach((p, i) => {
      _o.position.set(p[0], 0.28, p[1]); _o.rotation.set(0, 0, 0); _o.scale.set(1, 1, 1)
      _o.updateMatrix(); railRef.current.setMatrixAt(i, _o.matrix)
    })
    railRef.current.instanceMatrix.needsUpdate = true
    CARDS.forEach((c, i) => {
      _o.position.set(c[0], c[1], 0.62); _o.rotation.set(0, 0, c[2]); _o.scale.set(1, 1, 1)
      _o.updateMatrix(); cardRef.current.setMatrixAt(i, _o.matrix)
    })
    cardRef.current.instanceMatrix.needsUpdate = true
  }, [])

  return (
    <group position={position} rotation={rotation}>
      {/* ── Hint of teal water beyond the pier ── */}
      <mesh position={[0, 0.02, -2.0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[3.2, 2.6]} />
        <meshBasicMaterial color={WATER} transparent opacity={0.7} />
      </mesh>

      {/* ── Plank deck reaching out (local -Z) ── */}
      <mesh position={[0, 0.07, -0.6]} castShadow>
        <boxGeometry args={[1.9, 0.12, 2.0]} />
        <meshToonMaterial color={PLANK} />
      </mesh>

      {/* ── Railing posts (instanced, both sides) ── */}
      <instancedMesh ref={railRef} args={[undefined, undefined, RAIL_POSTS.length]} frustumCulled={false}>
        <cylinderGeometry args={[0.04, 0.05, 0.44, 6]} />
        <meshToonMaterial color={POST} />
      </instancedMesh>

      {/* ── Postcard rack at the plaza-facing end ── */}
      <mesh position={[0, 0.5, 0.58]} castShadow>
        <boxGeometry args={[0.8, 0.9, 0.06]} />
        <meshToonMaterial color={RACK} />
      </mesh>
      {/* Cream postcards (instanced) */}
      <instancedMesh ref={cardRef} args={[undefined, undefined, CARDS.length]} frustumCulled={false}>
        <boxGeometry args={[0.2, 0.14, 0.02]} />
        <meshToonMaterial color={CARD} />
      </instancedMesh>

      {/* ── Mooring bollard ── */}
      <mesh position={[0.78, 0.22, 0.3]} castShadow>
        <cylinderGeometry args={[0.1, 0.12, 0.44, 8]} />
        <meshToonMaterial color={BOLLARD} />
      </mesh>

      {/* ── Harbor lamp at the seaward end (Posta keeps a light burning) ── */}
      <mesh position={[-0.85, 0.85, -1.5]} castShadow>
        <cylinderGeometry args={[0.045, 0.055, 1.7, 6]} />
        <meshToonMaterial color={POST} />
      </mesh>
      {/* glowing lamp head */}
      <mesh position={[-0.85, 1.78, -1.5]}>
        <sphereGeometry args={[0.12, 10, 8]} />
        <meshBasicMaterial color={LAMP} />
      </mesh>
      {/* soft warm halo over the water */}
      <mesh position={[-0.85, 1.78, -1.5]}>
        <sphereGeometry args={[0.38, 12, 10]} />
        <meshBasicMaterial color={LAMP_AMBER} transparent opacity={0.13} blending={AdditiveBlending} depthWrite={false} />
      </mesh>
    </group>
  )
}
