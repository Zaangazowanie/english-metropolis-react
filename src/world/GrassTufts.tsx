// GrassTufts — scattered tufts of dusk grass around the plaza edge, the small
// green-and-gold weeds that grow up through the cobbles in the look-dev spike.
// They soften the lamp-ring border and make the teal ground feel lived-in.
//
// One InstancedMesh of ~130 thin tapered blades, scattered deterministically in
// a ring band just outside the play area (radius ~8–14, so Wren never walks
// through them and they sit among the lamps / around the market). Per-blade
// height, lean, yaw, and a leaf/dry-green tint via instanceColor.
//
// CONTRACT: zero new deps, no textures/GLBs/URLs. Procedural geometry only.
// Static prop — placed once in a useEffect, no per-frame work. 1 draw call.

import { useEffect, useRef } from 'react'
import { Object3D, Color } from 'three'
import type { InstancedMesh } from 'three'

const _o = new Object3D()
const _c = new Color()

const BLADES = 130
const GOLDEN = Math.PI * (3 - Math.sqrt(5))
// Leaf greens + a couple of drier dusk tones.
const GREENS = ['#7FB069', '#6E9A52', '#8FA85A', '#5E8048', '#9CB56A']

export function GrassTufts() {
  const ref = useRef<InstancedMesh>(null!)

  useEffect(() => {
    if (!ref.current) return
    for (let i = 0; i < BLADES; i++) {
      // Even angular spread (golden angle) in a ring band, with deterministic
      // jitter so blades cluster into natural-looking tufts.
      const ang = i * GOLDEN
      const radius = 8.2 + (i % 9) * 0.66            // 8.2 .. 14.1
      const jx = ((i * 0.37) % 1 - 0.5) * 0.7
      const jz = ((i * 0.61) % 1 - 0.5) * 0.7
      const x = Math.cos(ang) * radius + jx
      const z = Math.sin(ang) * radius + jz
      const h = 0.18 + ((i * 0.29) % 1) * 0.24       // 0.18 .. 0.42 tall
      const lean = (((i * 0.53) % 1) - 0.5) * 0.5    // slight tilt
      const yaw = (i * 1.7) % (Math.PI * 2)

      _o.position.set(x, h / 2, z)
      _o.rotation.set(lean, yaw, lean * 0.6)
      _o.scale.set(1, h / 0.3, 1)                    // base blade is 0.3 tall
      _o.updateMatrix()
      ref.current.setMatrixAt(i, _o.matrix)

      _c.set(GREENS[i % GREENS.length])
      ref.current.setColorAt(i, _c)
    }
    ref.current.instanceMatrix.needsUpdate = true
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true
  }, [])

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, BLADES]} frustumCulled={false}>
      {/* thin 3-sided spike — a blade of grass */}
      <coneGeometry args={[0.035, 0.3, 3]} />
      <meshToonMaterial />
    </instancedMesh>
  )
}
