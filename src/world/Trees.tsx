// Trees — a ring of dusk London plane-trees framing the plaza, our original
// replacement for abeto's tree set (their world ships tree-leaves_0-4 .drc +
// leaf textures). A backdrop grove just beyond the resident orbit: dark trunks
// rising into soft low-poly canopies in muted dusk greens, a couple touched
// warm where the lamplight reaches. They give the flat plaza a treeline and a
// sense of a city that goes on past the lamps.
//
// CONTRACT: zero new deps, no textures/GLBs/URLs. Procedural geometry only,
// INSTANCED (trunk + 2 canopy layers = 3 draw calls for the whole grove,
// regardless of tree count). Static — placed once in a useEffect, no per-frame
// work, reducedMotion-agnostic. Sits at r≈14–18, behind the drifting cast
// (orbit r=12.5) and inside the building skyline, so it never blocks play.

import { useEffect, useRef } from 'react'
import { Object3D, Color } from 'three'
import type { InstancedMesh } from 'three'

const _o = new Object3D()
const _c = new Color()

const TRUNK = '#3A2A1E'        // dark dusk bark
// Dusk foliage palette — muted greens, one amber-touched for lamplight.
const CANOPY = ['#2E4A3A', '#3E5E3A', '#46583C', '#54603A', '#5E6E3A']
const N_TREES = 14

// Deterministic scatter on a framing ring (even angles + a little jitter).
interface TreeDef { x: number; z: number; s: number; hue: number; lean: number }
const TREES: TreeDef[] = Array.from({ length: N_TREES }, (_, i) => {
  const a = (i / N_TREES) * Math.PI * 2 + ((i * 37) % 11) * 0.03
  const r = 14 + (i % 4) * 1.3                         // 14 .. 17.9
  return {
    x: Math.cos(a) * r,
    z: Math.sin(a) * r,
    s: 0.82 + ((i * 5) % 6) * 0.11,                    // 0.82 .. 1.37 height/build
    hue: i % CANOPY.length,
    lean: (((i * 13) % 7) - 3) * 0.015,                // tiny varied lean
  }
})

export function Trees() {
  const trunkRef = useRef<InstancedMesh>(null!)
  const canopyRef = useRef<InstancedMesh>(null!)
  const puffRef = useRef<InstancedMesh>(null!)

  useEffect(() => {
    TREES.forEach((t, i) => {
      // Trunk — base at y=0, scaled by build.
      _o.position.set(t.x, 1.1 * t.s, t.z)
      _o.rotation.set(0, (i * 1.7) % (Math.PI * 2), t.lean)
      _o.scale.set(t.s, t.s, t.s)
      _o.updateMatrix(); trunkRef.current.setMatrixAt(i, _o.matrix)

      // Main canopy — broad soft dome atop the trunk.
      _o.position.set(t.x, (2.5 + 0.2) * t.s, t.z)
      _o.rotation.set(0, (i * 0.9) % (Math.PI * 2), 0)
      _o.scale.set(t.s, t.s * 0.85, t.s)
      _o.updateMatrix(); canopyRef.current.setMatrixAt(i, _o.matrix)
      _c.set(CANOPY[t.hue]); canopyRef.current.setColorAt(i, _c)

      // Upper puff — smaller, brighter, offset, for a layered low-poly crown.
      _o.position.set(t.x + 0.25 * t.s, 3.25 * t.s, t.z - 0.2 * t.s)
      _o.rotation.set(0, (i * 2.3) % (Math.PI * 2), 0)
      _o.scale.setScalar(t.s * 0.62)
      _o.updateMatrix(); puffRef.current.setMatrixAt(i, _o.matrix)
      _c.set(CANOPY[(t.hue + 2) % CANOPY.length]); puffRef.current.setColorAt(i, _c)
    })
    trunkRef.current.instanceMatrix.needsUpdate = true
    canopyRef.current.instanceMatrix.needsUpdate = true
    puffRef.current.instanceMatrix.needsUpdate = true
    if (canopyRef.current.instanceColor) canopyRef.current.instanceColor.needsUpdate = true
    if (puffRef.current.instanceColor) puffRef.current.instanceColor.needsUpdate = true
  }, [])

  return (
    <group>
      {/* Trunks (tapered cylinders) */}
      <instancedMesh ref={trunkRef} args={[undefined, undefined, N_TREES]} frustumCulled={false} castShadow>
        <cylinderGeometry args={[0.16, 0.24, 2.2, 7]} />
        <meshToonMaterial color={TRUNK} />
      </instancedMesh>
      {/* Main canopy domes (low-poly spheres, per-instance dusk-green) */}
      <instancedMesh ref={canopyRef} args={[undefined, undefined, N_TREES]} frustumCulled={false} castShadow>
        <sphereGeometry args={[1.5, 9, 7]} />
        <meshToonMaterial vertexColors />
      </instancedMesh>
      {/* Upper crown puffs */}
      <instancedMesh ref={puffRef} args={[undefined, undefined, N_TREES]} frustumCulled={false}>
        <sphereGeometry args={[1.5, 8, 6]} />
        <meshToonMaterial vertexColors />
      </instancedMesh>
    </group>
  )
}
