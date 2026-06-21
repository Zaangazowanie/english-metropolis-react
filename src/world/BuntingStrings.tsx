// BuntingStrings — triangular pennant flags strung between the lamp posts of
// the Lanterngate ring. A string of small coloured bunting hanging higher than
// the festoon lights, adding festive depth to the dusk market. Each flag hangs
// from a straight cord between adjacent posts; three flags per span, colours
// cycling cream / amber / soft teal so every span reads as a different mix.
//
// Procedural geometry only (no textures/GLBs/URLs). Static — placed once in a
// useEffect, no per-frame work, reducedMotion-agnostic.
// 2 draw calls: 1 LineSegments (cords) + 1 InstancedMesh (48 pennants, per-
// instance colour via instanceColor). Pennants are downward-pointing cones
// (apex down, thin radialSegments so they read as triangular flags).

import { useEffect, useMemo, useRef } from 'react'
import { Object3D, Color, BufferGeometry, Float32BufferAttribute } from 'three'
import type { InstancedMesh } from 'three'

const _o = new Object3D()
const _c = new Color()

// Mirror lamp-ring constants.
const LAMP_COUNT = 16
const LAMP_R = 8.5
const STRING_Y = 3.4           // higher than festoon lights (2.88)
const FLAGS_PER = 3            // flags per inter-post span
const FLAG_TOTAL = LAMP_COUNT * FLAGS_PER

// Alternating pennant palette — cream, warm amber, dusty soft teal.
const PENNANT = ['#E9DFC6', '#E8920A', '#7FB0BD']

// Lamp post X,Z positions (same formula as LampRing in EnglishMetroWorld).
const LAMP_POS: Array<[number, number]> = Array.from({ length: LAMP_COUNT }, (_, i) => {
  const a = (i / LAMP_COUNT) * Math.PI * 2
  return [Math.cos(a) * LAMP_R, Math.sin(a) * LAMP_R]
})

// Build one merged LineSegments geometry for the string cords.
function buildCordGeo(): BufferGeometry {
  const pts: number[] = []
  for (let s = 0; s < LAMP_COUNT; s++) {
    const [ax, az] = LAMP_POS[s]
    const [bx, bz] = LAMP_POS[(s + 1) % LAMP_COUNT]
    pts.push(ax, STRING_Y, az, bx, STRING_Y, bz)
  }
  const geo = new BufferGeometry()
  geo.setAttribute('position', new Float32BufferAttribute(new Float32Array(pts), 3))
  return geo
}

export function BuntingStrings() {
  const flagRef = useRef<InstancedMesh>(null!)
  const cordGeo = useMemo(buildCordGeo, [])

  useEffect(() => {
    if (!flagRef.current) return
    let n = 0
    for (let s = 0; s < LAMP_COUNT; s++) {
      const [ax, az] = LAMP_POS[s]
      const [bx, bz] = LAMP_POS[(s + 1) % LAMP_COUNT]
      for (let k = 0; k < FLAGS_PER; k++) {
        const t = (k + 1) / (FLAGS_PER + 1)
        const x = ax + (bx - ax) * t
        const z = az + (bz - az) * t
        // Slight yaw so adjacent flags face different ways — adds visual texture.
        const yaw = Math.atan2(bx - ax, bz - az) + (k % 2 === 0 ? 0.3 : -0.3)
        _o.position.set(x, STRING_Y - 0.14, z) // hang slightly below the cord
        _o.rotation.set(0, yaw, 0)
        _o.scale.setScalar(1)
        _o.updateMatrix()
        flagRef.current.setMatrixAt(n, _o.matrix)
        _c.set(PENNANT[(s + k) % PENNANT.length])
        flagRef.current.setColorAt(n, _c)
        n++
      }
    }
    flagRef.current.instanceMatrix.needsUpdate = true
    if (flagRef.current.instanceColor) flagRef.current.instanceColor.needsUpdate = true
  }, [])

  return (
    <group>
      {/* Taut cord strings between posts */}
      <lineSegments geometry={cordGeo} frustumCulled={false}>
        <lineBasicMaterial color="#3A2A18" transparent opacity={0.55} />
      </lineSegments>
      {/* Pennant flags — downward-pointing cones, per-flag colour */}
      <instancedMesh ref={flagRef} args={[undefined, undefined, FLAG_TOTAL]} frustumCulled={false}>
        <coneGeometry args={[0.09, 0.22, 4]} />
        <meshToonMaterial />
      </instancedMesh>
    </group>
  )
}
