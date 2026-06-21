// CobbleRing — a paved cobblestone floor for the plaza, giving the flat teal
// ground the worn-cobble texture of the look-dev spike's dusk street. One
// InstancedMesh of ~170 low hexagonal pavers, scattered deterministically
// across the walkable circle with subtle per-stone tone + size + yaw variation.
//
// CONTRACT: zero new deps, no textures/GLBs/URLs. Procedural geometry only.
// Static — placed once in a useEffect, no per-frame work, reducedMotion-agnostic.
// 1 draw call. Pavers sit just above the ground (y≈0.02) to avoid z-fighting and
// well below Wren's feet, so they read as the floor he walks on.

import { useEffect, useRef } from 'react'
import { Object3D, Color } from 'three'
import type { InstancedMesh } from 'three'

const _o = new Object3D()
const _c = new Color()

const COBBLES = 170
const GOLDEN = Math.PI * (3 - Math.sqrt(5))
// Early-dusk paving tones around the lifted ground (#387986): mostly lighter
// teal so seams read softly, plus a couple of warmer stones catching the golden
// horizon / lamplight — the cobbles read as a warm-lit dusk street, not murk.
const TONES = ['#387986', '#33707D', '#418490', '#2F6A75', '#4C8089', '#6E8076']

export function CobbleRing() {
  const ref = useRef<InstancedMesh>(null!)

  useEffect(() => {
    if (!ref.current) return
    for (let i = 0; i < COBBLES; i++) {
      const ang = i * GOLDEN
      const radius = 1.0 + Math.sqrt(i / COBBLES) * 7.4 // even areal spread out to ~8.4
      const jx = ((i * 0.37) % 1 - 0.5) * 0.5
      const jz = ((i * 0.71) % 1 - 0.5) * 0.5
      const s = 0.5 + ((i * 0.53) % 1) * 0.35           // 0.5..0.85 paver size
      _o.position.set(Math.cos(ang) * radius + jx, 0.02, Math.sin(ang) * radius + jz)
      _o.rotation.set(0, (i * 1.7) % (Math.PI * 2), 0)
      _o.scale.set(s, 1, s)
      _o.updateMatrix()
      ref.current.setMatrixAt(i, _o.matrix)
      _c.set(TONES[i % TONES.length])
      ref.current.setColorAt(i, _c)
    }
    ref.current.instanceMatrix.needsUpdate = true
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true
  }, [])

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, COBBLES]} frustumCulled={false} receiveShadow>
      {/* low 6-sided paver */}
      <cylinderGeometry args={[0.3, 0.32, 0.05, 6]} />
      <meshToonMaterial />
    </instancedMesh>
  )
}
