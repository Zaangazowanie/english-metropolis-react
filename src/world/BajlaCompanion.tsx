// BajlaCompanion — Bajla the owl glides alongside Wren as his calm dusk guide.
// An outer group eases toward a point high to Wren's left-and-slightly-behind
// (a frame-rate-independent spring → she trails when he moves and settles when
// he stops), yawing to face travel and banking into turns. The canonical kit
// <Bajla> bobs + flaps locally inside, so the owl itself is reused exactly — no
// geometry duplication, same purple-owl canon. On mount she swoops down from
// above to join him; variant 'celebrate' makes her spin a happy flourish in
// place (pairs with an errand's lamp-relight). reducedMotion → she holds the
// fixed offset with no spring / bank / swoop.
//
// CONTRACT: procedural (reuses Bajla's primitives), no textures/URLs/deps, no
// per-frame allocations (module-scope scratch Vector3s; MathUtils in place).
// Net draw calls unchanged vs. the perched Bajla it replaces.

import { useRef } from 'react'
import type { MutableRefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { Vector3, MathUtils } from 'three'
import type { Group } from 'three'
import { Bajla } from '../practice/shells3d/kit/Bajla'
import type { BajlaVariant } from '../practice/shells3d/kit/Bajla'

const _target = new Vector3()
const _prev = new Vector3()

// Resting offset from Wren (world units): up high, to his left, a touch behind —
// out of the camera's straight-ahead sightline so she frames the scene.
const OFF_X = -1.6
const OFF_Y = 2.8
const OFF_Z = -0.7
const FOLLOW_RATE = 2.4 // spring rate toward the target (1/s)
const BANK_MAX = 0.45
const TWO_PI = Math.PI * 2

/** Shortest signed angular step a→b, then a fractional ease of it. */
function lerpAngle(a: number, b: number, t: number): number {
  const d = (((b - a) % TWO_PI) + Math.PI * 3) % TWO_PI - Math.PI
  return a + d * t
}

export interface BajlaCompanionProps {
  /** Wren's live world position (written each frame by WrenRig). */
  wrenPosRef: MutableRefObject<Vector3>
  variant?: BajlaVariant
  reducedMotion?: boolean
}

export function BajlaCompanion({ wrenPosRef, variant = 'idle', reducedMotion = false }: BajlaCompanionProps) {
  const groupRef = useRef<Group>(null!)
  const yawRef = useRef(0)
  const bankRef = useRef(0)
  const inited = useRef(false)

  useFrame((_, delta) => {
    const g = groupRef.current
    if (!g) return
    const w = wrenPosRef.current
    _target.set(w.x + OFF_X, OFF_Y, w.z + OFF_Z)

    if (reducedMotion) {
      g.position.copy(_target)
      g.rotation.set(0, 0, 0)
      return
    }

    // First frame: start high above the target → swoop down to join Wren.
    if (!inited.current) {
      g.position.set(_target.x, _target.y + 6, _target.z - 3)
      inited.current = true
    }

    _prev.copy(g.position)
    const a = 1 - Math.exp(-FOLLOW_RATE * Math.min(delta, 0.05)) // FPS-independent ease
    g.position.lerp(_target, a)

    // Derive this frame's horizontal step → yaw toward travel + bank into turns.
    const dx = g.position.x - _prev.x
    const dz = g.position.z - _prev.z
    let targetBank = 0
    if (dx * dx + dz * dz > 1e-8) {
      const desired = Math.atan2(dx, dz)
      const newYaw = lerpAngle(yawRef.current, desired, 0.1)
      const turn = (((newYaw - yawRef.current) % TWO_PI) + Math.PI * 3) % TWO_PI - Math.PI
      yawRef.current = newYaw
      targetBank = MathUtils.clamp(-turn * 8, -BANK_MAX, BANK_MAX)
    }
    bankRef.current = MathUtils.lerp(bankRef.current, targetBank, 0.1)
    g.rotation.set(0, yawRef.current, bankRef.current)
  })

  return (
    <group ref={groupRef}>
      <Bajla
        variant={variant === 'celebrate' ? 'celebrate' : 'idle'}
        reducedMotion={reducedMotion}
        scale={0.46}
        position={[0, 0, 0]}
      />
    </group>
  )
}

export default BajlaCompanion
