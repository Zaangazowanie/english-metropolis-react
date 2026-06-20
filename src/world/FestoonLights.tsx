// FestoonLights — amber Edison-bulb string-lights looped between the lamp posts
// of the Lanterngate ring. The most iconic element of the English Metro look-dev:
// the strings sag naturally in catenary curves, each bearing small warm spheres
// at equal intervals that glow amber against the dusk sky and cast pools of
// suggestion on the teal ground below.
//
// Implementation: for each adjacent pair of lamp posts (the full ring of 16),
// one string = a BufferGeometry line (thin quad-tube via two parallel line strips)
// sampled along a quadratic Bézier sag, plus a small InstancedMesh of glow
// spheres at equal intervals. Both use MeshBasicMaterial / unlit so they "glow"
// at any quality tier.
//
// CONTRACT: zero new deps, no external URLs, no per-frame allocations, no GLBs.
// All geometry is procedural and set once. Draw calls: 1 instanced mesh for all
// bulbs (LAMP_COUNT * BULBS_PER = 16*4 = 64 instances), 1 line geometry per
// string segment pre-baked into a single merged BufferGeometry at mount.
// reducedMotion → static (no pulse); the lights are always visible (the city
// needs its lamps to burn even when motion is off).

import { useEffect, useMemo, useRef } from 'react'
import { Object3D, BufferGeometry, Float32BufferAttribute, AdditiveBlending } from 'three'
import type { InstancedMesh } from 'three'
import { palette } from '../practice/shells3d/kit/palette'

const _o = new Object3D()

// Mirror the lamp ring constants from EnglishMetroWorld.tsx (kept in sync here).
const LAMP_COUNT       = 16
const LAMP_RING_RADIUS = 8.5
const LAMP_TOP_Y       = 2.88  // glow cap height from LampRing

const SAG_DEPTH      = 1.0     // how many units the string dips below the post-top
const BULBS_PER      = 4       // glowing bulbs per inter-post span
const BULB_TOTAL     = LAMP_COUNT * BULBS_PER
const SAMPLES        = 8       // curve sub-divisions per span (for the string line)
const BULB_RADIUS    = 0.055   // glow sphere radius

// Pre-compute lamp post anchor positions (top of each post).
const lampPositions: [number, number, number][] = Array.from({ length: LAMP_COUNT }, (_, i) => {
  const a = (i / LAMP_COUNT) * Math.PI * 2
  return [Math.cos(a) * LAMP_RING_RADIUS, LAMP_TOP_Y, Math.sin(a) * LAMP_RING_RADIUS]
})

// Quadratic Bézier: P0 → midpoint-sagged ctrl → P1.
function bezier(
  p0: [number, number, number],
  p1: [number, number, number],
  t: number,
): [number, number, number] {
  const cx = (p0[0] + p1[0]) / 2
  const cy = Math.min(p0[1], p1[1]) - SAG_DEPTH  // control point sags down
  const cz = (p0[2] + p1[2]) / 2
  const mt = 1 - t
  return [
    mt * mt * p0[0] + 2 * mt * t * cx + t * t * p1[0],
    mt * mt * p0[1] + 2 * mt * t * cy + t * t * p1[1],
    mt * mt * p0[2] + 2 * mt * t * cz + t * t * p1[2],
  ]
}

// Build one merged BufferGeometry for all LAMP_COUNT string segments.
// Each segment = SAMPLES+1 points → a lineStrip-style quad tube (2 rows).
function buildStringGeometry(): BufferGeometry {
  const totalPts = LAMP_COUNT * (SAMPLES + 1)
  const pos = new Float32Array(totalPts * 3)
  const idx: number[] = []

  for (let s = 0; s < LAMP_COUNT; s++) {
    const p0 = lampPositions[s]
    const p1 = lampPositions[(s + 1) % LAMP_COUNT]
    const base = s * (SAMPLES + 1)
    for (let k = 0; k <= SAMPLES; k++) {
      const t = k / SAMPLES
      const [x, y, z] = bezier(p0, p1, t)
      const vi = (base + k) * 3
      pos[vi] = x; pos[vi + 1] = y; pos[vi + 2] = z
      if (k < SAMPLES) {
        idx.push(base + k, base + k + 1)
      }
    }
  }

  const geo = new BufferGeometry()
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3))
  geo.setIndex(idx)
  return geo
}

export function FestoonLights() {
  const bulbRef = useRef<InstancedMesh>(null!)
  const stringGeo = useMemo(buildStringGeometry, [])

  // Place all bulbs once at mount.
  useEffect(() => {
    if (!bulbRef.current) return
    let n = 0
    for (let s = 0; s < LAMP_COUNT; s++) {
      const p0 = lampPositions[s]
      const p1 = lampPositions[(s + 1) % LAMP_COUNT]
      for (let k = 0; k < BULBS_PER; k++) {
        const t = (k + 1) / (BULBS_PER + 1)  // evenly spaced, excluding endpoints
        const [x, y, z] = bezier(p0, p1, t)
        _o.position.set(x, y, z)
        _o.rotation.set(0, 0, 0)
        _o.scale.setScalar(1)
        _o.updateMatrix()
        bulbRef.current.setMatrixAt(n++, _o.matrix)
      }
    }
    bulbRef.current.instanceMatrix.needsUpdate = true
  }, [])

  return (
    <group>
      {/* String wire — thin glowing line between each adjacent pair of posts */}
      <lineSegments geometry={stringGeo} frustumCulled={false}>
        <lineBasicMaterial
          color={palette.lanternAmber}
          transparent
          opacity={0.55}
          blending={AdditiveBlending}
          depthWrite={false}
        />
      </lineSegments>

      {/* Glowing Edison bulbs — single InstancedMesh for all 64 bulbs */}
      <instancedMesh
        ref={bulbRef}
        args={[undefined, undefined, BULB_TOTAL]}
        frustumCulled={false}
      >
        <sphereGeometry args={[BULB_RADIUS, 6, 5]} />
        <meshBasicMaterial
          color={palette.lanternCore}
          blending={AdditiveBlending}
          transparent
          opacity={0.92}
          depthWrite={false}
        />
      </instancedMesh>
    </group>
  )
}
