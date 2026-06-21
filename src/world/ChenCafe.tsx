// ChenCafe — Mr. Chen's café "The Still Cup" (canon Vertical Slice Beat 4b,
// Saffron Market): a small shopfront with a warm-lit window, a cream awning,
// and — out front on the pavement — the canon WIND-SCATTERED CHALKBOARD: a dark
// slate A-frame board whose chalk letters the wind has blown into faint, jumbled
// ghosts (the anagram errand's diegetic surface). Readable English never lives
// on the 3D board (contract rule 9) — the chalk here is just abstract smudges.
//
// Procedural geometry only (no textures/GLBs/URLs). Static prop — no per-frame
// work, reducedMotion-agnostic. Instancing for the chalk smudges. ~7 draw calls.

import { useEffect, useRef } from 'react'
import { Object3D } from 'three'
import type { InstancedMesh } from 'three'
import { palette } from '../practice/shells3d/kit/palette'

const _o = new Object3D()

const BRICK = '#2A4348'  // dark dusk-teal café facade
const DOOR = '#3A2A1E'   // dark closed door
const AWNING = '#D9CDB4' // cream awning canvas
const SLATE = '#1C2622'  // chalkboard slate
const FRAME = '#5E4429'  // chalkboard wooden frame
const CHALK = '#C9C4B8'  // faint chalk ghost

// Wind-scattered chalk smudges on the slate face — abstract jumbled marks
// (deterministic), each a thin little box at a small tilt.
const SMUDGES: Array<[number, number, number]> = [
  [-0.28, 0.34, 0.5], [0.1, 0.36, -0.4], [0.26, 0.2, 0.3],
  [-0.18, 0.06, -0.6], [0.04, -0.1, 0.2], [-0.3, -0.22, 0.5],
  [0.22, -0.28, -0.3], [0.0, 0.2, 0.1],
]

export interface ChenCafeProps {
  position?: [number, number, number]
  rotation?: [number, number, number]
}

export function ChenCafe({ position = [0, 0, 0], rotation = [0, 0, 0] }: ChenCafeProps) {
  const smudgeRef = useRef<InstancedMesh>(null!)

  useEffect(() => {
    if (!smudgeRef.current) return
    SMUDGES.forEach((s, i) => {
      _o.position.set(s[0], 0.78 + s[1] * 0.5, 0.09) // on the slate face (local board space)
      _o.rotation.set(0, 0, s[2]) // jumbled tilt
      _o.scale.set(0.16 + (i % 3) * 0.05, 0.03, 1)
      _o.updateMatrix()
      smudgeRef.current.setMatrixAt(i, _o.matrix)
    })
    smudgeRef.current.instanceMatrix.needsUpdate = true
  }, [])

  return (
    <group position={position} rotation={rotation}>
      {/* ── Facade wall ── */}
      <mesh position={[0, 1.15, -0.3]} castShadow>
        <boxGeometry args={[2.6, 2.3, 0.3]} />
        <meshToonMaterial color={BRICK} />
      </mesh>
      {/* Closed door */}
      <mesh position={[-0.55, 0.75, -0.13]}>
        <boxGeometry args={[0.7, 1.5, 0.08]} />
        <meshToonMaterial color={DOOR} />
      </mesh>
      {/* Warm-lit window (the café still keeps a pilot glow) */}
      <mesh position={[0.7, 1.25, -0.13]}>
        <boxGeometry args={[0.95, 0.85, 0.06]} />
        <meshBasicMaterial color={palette.lanternCore} />
      </mesh>
      {/* Window frame muntin (cross) */}
      <mesh position={[0.7, 1.25, -0.1]}>
        <boxGeometry args={[1.0, 0.06, 0.04]} />
        <meshToonMaterial color={DOOR} />
      </mesh>

      {/* ── Cream awning over the shopfront ── */}
      <mesh position={[0, 2.32, 0.18]} rotation={[-0.18, 0, 0]} castShadow>
        <boxGeometry args={[2.7, 0.06, 0.8]} />
        <meshToonMaterial color={AWNING} />
      </mesh>

      {/* ── The wind-scattered chalkboard (A-frame, on the pavement out front) ── */}
      <group position={[0.1, 0, 1.05]} rotation={[0.1, 0.1, 0]}>
        {/* wooden frame */}
        <mesh position={[0, 0.78, 0]} castShadow>
          <boxGeometry args={[1.12, 1.32, 0.08]} />
          <meshToonMaterial color={FRAME} />
        </mesh>
        {/* slate */}
        <mesh position={[0, 0.78, 0.06]}>
          <boxGeometry args={[0.96, 1.14, 0.04]} />
          <meshToonMaterial color={SLATE} />
        </mesh>
        {/* chalk ghosts (instanced) */}
        <instancedMesh ref={smudgeRef} args={[undefined, undefined, SMUDGES.length]} frustumCulled={false}>
          <boxGeometry args={[1, 1, 0.02]} />
          <meshToonMaterial color={CHALK} />
        </instancedMesh>
      </group>
    </group>
  )
}
