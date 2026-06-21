// Emotes — ten original English Metro emote bubbles that pop up over the plaza,
// our procedural replacement for abeto's 10 emoji meshes. Each is a little
// speech-bubble with a hand-built glyph (heart, music note, sparkle, smile,
// sleep, leaf, cup, letter, "!", flower) that pops in, floats, and shrinks away
// at a few landmark anchors — the small life of a city that's quietly happy.
//
// CONTRACT: zero new deps, no textures/GLBs/URLs. Procedural geometry only.
// Allocation-free per-frame (only scalar transform writes + a lookAt to the
// camera so bubbles always face the viewer). reducedMotion → a single static
// bubble per anchor (no pop/float). ~3 anchors × ≤5 meshes ≈ 12 draw calls.

import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'

const BUBBLE = '#F6EFE2'   // cream bubble
const ROSE = '#FB7185'
const AMBER = '#E8920A'
const TEAL = '#2B5F6E'
const INK = '#2B2540'
const SAGE = '#5A7A5E'
const KRAFT = '#B49A6E'
const SLATE = '#6E7A82'

const N_GLYPHS = 10
const CYCLE = 4.2          // seconds per emote (pop → float → fade)

// ── The ten glyphs (each ≤4 small meshes, built facing +Z) ────────────────────
function Glyph({ i }: { i: number }) {
  switch (((i % N_GLYPHS) + N_GLYPHS) % N_GLYPHS) {
    case 0: // heart
      return (
        <group>
          <mesh position={[-0.07, 0.05, 0]}><sphereGeometry args={[0.1, 10, 8]} /><meshToonMaterial color={ROSE} /></mesh>
          <mesh position={[0.07, 0.05, 0]}><sphereGeometry args={[0.1, 10, 8]} /><meshToonMaterial color={ROSE} /></mesh>
          <mesh position={[0, -0.08, 0]} rotation={[Math.PI, 0, 0]}><coneGeometry args={[0.15, 0.2, 4]} /><meshToonMaterial color={ROSE} /></mesh>
        </group>
      )
    case 1: // music note
      return (
        <group rotation={[0, 0, 0.12]}>
          <mesh position={[-0.05, -0.06, 0]}><sphereGeometry args={[0.09, 10, 8]} /><meshToonMaterial color={INK} /></mesh>
          <mesh position={[0.04, 0.06, 0]}><boxGeometry args={[0.04, 0.32, 0.04]} /><meshToonMaterial color={INK} /></mesh>
          <mesh position={[0.1, 0.2, 0]} rotation={[0, 0, -0.5]}><boxGeometry args={[0.14, 0.05, 0.04]} /><meshToonMaterial color={INK} /></mesh>
        </group>
      )
    case 2: // sparkle (4-point)
      return (
        <group>
          <mesh><boxGeometry args={[0.08, 0.34, 0.04]} /><meshToonMaterial color={AMBER} /></mesh>
          <mesh rotation={[0, 0, Math.PI / 2]}><boxGeometry args={[0.08, 0.34, 0.04]} /><meshToonMaterial color={AMBER} /></mesh>
          <mesh rotation={[0, 0, Math.PI / 4]} scale={[0.6, 0.6, 1]}><boxGeometry args={[0.08, 0.34, 0.04]} /><meshToonMaterial color={AMBER} /></mesh>
        </group>
      )
    case 3: // smile
      return (
        <group>
          <mesh position={[-0.08, 0.06, 0]}><sphereGeometry args={[0.04, 8, 6]} /><meshToonMaterial color={INK} /></mesh>
          <mesh position={[0.08, 0.06, 0]}><sphereGeometry args={[0.04, 8, 6]} /><meshToonMaterial color={INK} /></mesh>
          <mesh position={[0, -0.06, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.1, 0.025, 6, 10, Math.PI]} /><meshToonMaterial color={INK} /></mesh>
        </group>
      )
    case 4: // sleep (zzz)
      return (
        <group>
          <mesh position={[-0.1, -0.08, 0]} scale={0.7}><boxGeometry args={[0.12, 0.05, 0.04]} /><meshToonMaterial color={SLATE} /></mesh>
          <mesh position={[0.02, 0.03, 0]} scale={0.9}><boxGeometry args={[0.14, 0.05, 0.04]} /><meshToonMaterial color={SLATE} /></mesh>
          <mesh position={[0.14, 0.16, 0]}><boxGeometry args={[0.16, 0.05, 0.04]} /><meshToonMaterial color={SLATE} /></mesh>
        </group>
      )
    case 5: // leaf (Flora)
      return (
        <group rotation={[0, 0, 0.5]}>
          <mesh scale={[0.7, 1.2, 0.5]}><sphereGeometry args={[0.14, 10, 8]} /><meshToonMaterial color={SAGE} /></mesh>
          <mesh position={[0, -0.16, 0]}><boxGeometry args={[0.03, 0.12, 0.03]} /><meshToonMaterial color={'#3E5942'} /></mesh>
        </group>
      )
    case 6: // cup (café)
      return (
        <group>
          <mesh><cylinderGeometry args={[0.12, 0.1, 0.18, 12, 1, true]} /><meshToonMaterial color={BUBBLE} /></mesh>
          <mesh position={[0.16, 0, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.06, 0.02, 6, 10]} /><meshToonMaterial color={BUBBLE} /></mesh>
          <mesh position={[0, 0.11, 0]}><cylinderGeometry args={[0.12, 0.12, 0.02, 12]} /><meshToonMaterial color={TEAL} /></mesh>
        </group>
      )
    case 7: // letter (mail / delivery)
      return (
        <group>
          <mesh><boxGeometry args={[0.32, 0.22, 0.03]} /><meshToonMaterial color={BUBBLE} /></mesh>
          <mesh position={[0, 0.02, 0.02]} rotation={[0, 0, 0.6]}><boxGeometry args={[0.2, 0.03, 0.02]} /><meshToonMaterial color={KRAFT} /></mesh>
          <mesh position={[0, 0.02, 0.02]} rotation={[0, 0, -0.6]}><boxGeometry args={[0.2, 0.03, 0.02]} /><meshToonMaterial color={KRAFT} /></mesh>
        </group>
      )
    case 8: // exclamation
      return (
        <group>
          <mesh position={[0, 0.06, 0]}><boxGeometry args={[0.07, 0.24, 0.05]} /><meshToonMaterial color={AMBER} /></mesh>
          <mesh position={[0, -0.13, 0]}><sphereGeometry args={[0.05, 8, 6]} /><meshToonMaterial color={AMBER} /></mesh>
        </group>
      )
    default: // 9: flower
      return (
        <group>
          <mesh><sphereGeometry args={[0.07, 8, 6]} /><meshToonMaterial color={AMBER} /></mesh>
          {[0, 1, 2, 3, 4].map((p) => {
            const a = (p / 5) * Math.PI * 2
            return <mesh key={p} position={[Math.cos(a) * 0.13, Math.sin(a) * 0.13, 0]}><sphereGeometry args={[0.06, 8, 6]} /><meshToonMaterial color={ROSE} /></mesh>
          })}
        </group>
      )
  }
}

// ── A single bubble anchor that cycles through the glyphs ──────────────────────
function EmoteSlot({ position, phase, reducedMotion }: {
  position: [number, number, number]; phase: number; reducedMotion: boolean
}) {
  const grp = useRef<Group>(null!)
  const clock = useRef(phase)
  const [idx, setIdx] = useState(Math.floor(phase / CYCLE) % N_GLYPHS)

  useFrame((state, dt) => {
    if (!grp.current) return
    // Face the camera (cheap billboard).
    grp.current.lookAt(state.camera.position)
    if (reducedMotion) { grp.current.scale.setScalar(0.9); return }
    clock.current += dt
    const newIdx = Math.floor(clock.current / CYCLE) % N_GLYPHS
    if (newIdx !== idx) setIdx(newIdx)
    const p = (clock.current % CYCLE) / CYCLE // 0..1 within this emote
    // pop in (0..0.18), hold, shrink out (0.82..1)
    const pop = p < 0.18 ? p / 0.18 : p > 0.82 ? (1 - p) / 0.18 : 1
    const s = Math.max(0, pop) * 0.95
    grp.current.scale.set(s, s, s)
  })

  return (
    <group position={position}>
      <group ref={grp}>
        {/* bubble background + little tail */}
        <mesh><sphereGeometry args={[0.34, 14, 12]} /><meshToonMaterial color={BUBBLE} transparent opacity={0.92} /></mesh>
        <mesh position={[0, -0.32, 0]} rotation={[0, 0, Math.PI]}><coneGeometry args={[0.12, 0.18, 8]} /><meshToonMaterial color={BUBBLE} transparent opacity={0.92} /></mesh>
        {/* glyph sits just in front of the bubble */}
        <group position={[0, 0.02, 0.3]} scale={0.8}><Glyph i={idx} /></group>
      </group>
    </group>
  )
}

export interface EmotesProps {
  reducedMotion?: boolean
}

/** Ambient emote bubbles over three plaza landmarks (café, Flora's stall, pier). */
export function Emotes({ reducedMotion = false }: EmotesProps) {
  return (
    <group>
      <EmoteSlot position={[3.0, 2.7, -6.6]} phase={0} reducedMotion={reducedMotion} />
      <EmoteSlot position={[-6.0, 2.5, 4.4]} phase={CYCLE * 3.3} reducedMotion={reducedMotion} />
      <EmoteSlot position={[2.5, 2.5, 6.6]} phase={CYCLE * 6.7} reducedMotion={reducedMotion} />
    </group>
  )
}
