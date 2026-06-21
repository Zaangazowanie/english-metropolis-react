// WorldPortals — all district portals rendered INSTANCED-per-part: one
// InstancedMesh for every beam, one for cores, one for rings, plus a single
// combined sparks Points. N portals cost ~4 draw calls instead of N×4 (was 20
// for 5 portals → now ~4). Replaces the per-portal <WorldPortal> components.
//
// Each portal is a "walk up and play" beacon: an amber beam + ground ring +
// rising light-sparks. State is encoded as instanceColor BRIGHTNESS on additive
// material (no per-instance opacity needed): idle (dim), active (Wren near —
// brighter + pulse), lit (completed — steady bright). Inner cores are high-
// quality only.
//
// CONTRACT: procedural, additive MeshBasic + Points, no textures/URLs/deps.
// reducedMotion → static (no pulse, no spark rise). Allocation-free per frame
// (module-scope scratch Object3D/Color; in-place spark array writes).

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, Object3D, Color } from 'three'
import type { InstancedMesh, BufferGeometry, Float32BufferAttribute } from 'three'
import { palette } from '../practice/shells3d/kit/palette'
import { useStageQuality } from '../practice/shells3d/kit/CityStage'
import type { PortalDef } from './WorldPortal'

const SPARKS_PER = 9 // rising light-motes per portal beam ("words carry light")
const _o = new Object3D()
const _c = new Color()
const AMBER = new Color(palette.lanternAmber)

export interface WorldPortalsProps {
  portals: PortalDef[]
  /** shellKey of the portal Wren is currently near (active), or null. */
  nearShellKey: string | null
  /** Completed errands (lit portals). */
  completed: Set<string>
  reducedMotion?: boolean
}

export function WorldPortals({ portals, nearShellKey, completed, reducedMotion = false }: WorldPortalsProps) {
  const beamRef = useRef<InstancedMesh>(null!)
  const coreRef = useRef<InstancedMesh>(null!)
  const ringRef = useRef<InstancedMesh>(null!)
  const sparkGeo = useRef<BufferGeometry>(null!)
  const t = useRef(0)
  const { tier } = useStageQuality()
  const highFx = tier === 'high'
  const N = portals.length

  // Combined spark positions — absolute world (portal xz + local rise height y).
  const sparkInit = useMemo(() => {
    const arr = new Float32Array(N * SPARKS_PER * 3)
    portals.forEach((p, pi) => {
      for (let i = 0; i < SPARKS_PER; i++) {
        const ang = (i / SPARKS_PER) * Math.PI * 2 * 2.7
        const rad = 0.06 + (i % 4) * 0.06
        const idx = (pi * SPARKS_PER + i) * 3
        arr[idx] = p.position[0] + Math.cos(ang) * rad
        arr[idx + 1] = (i * 0.51) % 2.3
        arr[idx + 2] = p.position[2] + Math.sin(ang) * rad
      }
    })
    return arr
  }, [portals, N])

  // Place beam / core / ring instance matrices once (positions are static).
  useEffect(() => {
    portals.forEach((p, i) => {
      _o.rotation.set(0, 0, 0); _o.scale.setScalar(1)
      _o.position.set(p.position[0], 1.2, p.position[2]); _o.updateMatrix()
      beamRef.current.setMatrixAt(i, _o.matrix)
      if (coreRef.current) {
        _o.position.set(p.position[0], 1.1, p.position[2]); _o.updateMatrix()
        coreRef.current.setMatrixAt(i, _o.matrix)
      }
      _o.position.set(p.position[0], 0.03, p.position[2]); _o.rotation.set(-Math.PI / 2, 0, 0); _o.updateMatrix()
      ringRef.current.setMatrixAt(i, _o.matrix)
    })
    beamRef.current.instanceMatrix.needsUpdate = true
    ringRef.current.instanceMatrix.needsUpdate = true
    if (coreRef.current) coreRef.current.instanceMatrix.needsUpdate = true
  }, [portals, highFx])

  // Apply per-portal brightness (instanceColor) — base state + optional pulse.
  const applyColors = (pulse: number) => {
    if (!beamRef.current || !ringRef.current) return
    for (let i = 0; i < N; i++) {
      const p = portals[i]
      const lit = completed.has(p.shellKey)
      const active = nearShellKey === p.shellKey
      const base = lit ? 0.7 : active ? 0.55 : 0.34
      const b = base + (active ? pulse : 0)
      _c.copy(AMBER).multiplyScalar(b);        beamRef.current.setColorAt(i, _c)
      _c.copy(AMBER).multiplyScalar(b + 0.18); ringRef.current.setColorAt(i, _c)
      if (coreRef.current) { _c.copy(AMBER).multiplyScalar(b + 0.3); coreRef.current.setColorAt(i, _c) }
    }
    if (beamRef.current.instanceColor) beamRef.current.instanceColor.needsUpdate = true
    if (ringRef.current.instanceColor) ringRef.current.instanceColor.needsUpdate = true
    if (coreRef.current?.instanceColor) coreRef.current.instanceColor.needsUpdate = true
  }

  // Set base colors on state change (covers reducedMotion, which skips useFrame).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { applyColors(0) }, [nearShellKey, completed, highFx, portals])

  useFrame((_, delta) => {
    if (reducedMotion) return
    t.current += delta * 2.4
    const pulse = (Math.sin(t.current) * 0.5 + 0.5) * 0.2
    applyColors(pulse)
    // Rise the combined sparks (in-place; wrap at the top of the beam).
    const geo = sparkGeo.current
    if (geo && geo.attributes.position) {
      const attr = geo.attributes.position as Float32BufferAttribute
      const a = attr.array as Float32Array
      const rise = delta * 0.7
      for (let i = 0; i < N * SPARKS_PER; i++) {
        a[i * 3 + 1] += rise
        if (a[i * 3 + 1] > 2.3) a[i * 3 + 1] = 0.02
      }
      attr.needsUpdate = true
    }
  })

  return (
    <group>
      {/* Beams — additive amber, brightness via instanceColor */}
      <instancedMesh ref={beamRef} args={[undefined, undefined, N]} frustumCulled={false}>
        <cylinderGeometry args={[0.34, 0.5, 2.4, 12, 1, true]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.7} blending={AdditiveBlending} depthWrite={false} />
      </instancedMesh>
      {/* Inner cores — high quality only */}
      {highFx && (
        <instancedMesh ref={coreRef} args={[undefined, undefined, N]} frustumCulled={false}>
          <cylinderGeometry args={[0.1, 0.14, 2.2, 8]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.8} blending={AdditiveBlending} depthWrite={false} />
        </instancedMesh>
      )}
      {/* Ground rings */}
      <instancedMesh ref={ringRef} args={[undefined, undefined, N]} frustumCulled={false}>
        <ringGeometry args={[0.72, 0.98, 28]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.8} blending={AdditiveBlending} depthWrite={false} side={2 /* DoubleSide */} />
      </instancedMesh>
      {/* Combined rising sparks across all portals */}
      <points>
        <bufferGeometry ref={sparkGeo}>
          <bufferAttribute attach="attributes-position" args={[sparkInit, 3]} />
        </bufferGeometry>
        <pointsMaterial color={palette.lanternCore} size={0.07} sizeAttenuation transparent opacity={0.85} blending={AdditiveBlending} depthWrite={false} />
      </points>
    </group>
  )
}
