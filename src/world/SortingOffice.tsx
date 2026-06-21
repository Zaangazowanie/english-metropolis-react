// SortingOffice — Mr. Frank's night sorting office (canon district "The Sorting
// Office", spellingbee errand). The postal building where every parcel matters:
// a tall dusk-stone facade with warm night-windows (Mr. Frank works late), an
// iconic red British pillar postbox out front, and a stack of waiting parcels.
//
// Procedural geometry only (no textures/GLBs/URLs). Static prop — no per-frame
// work, reducedMotion-agnostic. Instancing for windows + parcels. ~7 draw calls.

import { useEffect, useRef } from 'react'
import { Object3D } from 'three'
import type { InstancedMesh } from 'three'
import { palette } from '../practice/shells3d/kit/palette'

const _o = new Object3D()

const STONE = '#2E4A50'    // dusk-teal stone facade
const DOOR = '#3A2A1E'     // dark postal door
const POSTBOX = '#A8392C'  // warm British postbox red
const POSTBOX_D = '#822A20' // darker dome / slot
const PARCEL = '#9A7B52'   // kraft-brown parcels

// Warm night-windows (instanced) — flanking + above the door.
const WINDOWS: Array<[number, number, number]> = [
  [-0.92, 1.7, -0.13], [0.92, 1.7, -0.13], [0, 2.35, -0.13],
]
// Waiting parcels stacked by the door (instanced).
const PARCELS: Array<[number, number, number, number]> = [
  // x, y, z, size
  [1.35, 0.16, 0.5, 0.32], [1.35, 0.46, 0.46, 0.3], [1.3, 0.72, 0.52, 0.26],
]

export interface SortingOfficeProps {
  position?: [number, number, number]
  rotation?: [number, number, number]
}

export function SortingOffice({ position = [0, 0, 0], rotation = [0, 0, 0] }: SortingOfficeProps) {
  const winRef = useRef<InstancedMesh>(null!)
  const parcelRef = useRef<InstancedMesh>(null!)

  useEffect(() => {
    WINDOWS.forEach((w, i) => {
      _o.position.set(w[0], w[1], w[2]); _o.rotation.set(0, 0, 0); _o.scale.set(1, 1, 1)
      _o.updateMatrix(); winRef.current.setMatrixAt(i, _o.matrix)
    })
    winRef.current.instanceMatrix.needsUpdate = true
    PARCELS.forEach((p, i) => {
      _o.position.set(p[0], p[1], p[2]); _o.rotation.set(0, (i * 0.3) % 0.6, 0); _o.scale.set(p[3], p[3] * 0.8, p[3])
      _o.updateMatrix(); parcelRef.current.setMatrixAt(i, _o.matrix)
    })
    parcelRef.current.instanceMatrix.needsUpdate = true
  }, [])

  return (
    <group position={position} rotation={rotation}>
      {/* ── Tall stone facade ── */}
      <mesh position={[0, 1.45, -0.3]} castShadow>
        <boxGeometry args={[3.0, 2.9, 0.3]} />
        <meshToonMaterial color={STONE} />
      </mesh>
      {/* Door */}
      <mesh position={[0, 0.85, -0.13]}>
        <boxGeometry args={[0.85, 1.7, 0.08]} />
        <meshToonMaterial color={DOOR} />
      </mesh>
      {/* Warm night-windows (instanced) */}
      <instancedMesh ref={winRef} args={[undefined, undefined, WINDOWS.length]} frustumCulled={false}>
        <boxGeometry args={[0.62, 0.7, 0.06]} />
        <meshBasicMaterial color={palette.lanternCore} />
      </instancedMesh>

      {/* ── Red pillar postbox out front ── */}
      <mesh position={[-1.35, 0.55, 0.7]} castShadow>
        <cylinderGeometry args={[0.22, 0.24, 1.1, 12]} />
        <meshToonMaterial color={POSTBOX} />
      </mesh>
      {/* domed cap */}
      <mesh position={[-1.35, 1.1, 0.7]}>
        <sphereGeometry args={[0.22, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshToonMaterial color={POSTBOX_D} />
      </mesh>
      {/* posting slot */}
      <mesh position={[-1.35, 0.82, 0.92]}>
        <boxGeometry args={[0.22, 0.05, 0.04]} />
        <meshToonMaterial color={POSTBOX_D} />
      </mesh>

      {/* ── Waiting parcels (instanced) ── */}
      <instancedMesh ref={parcelRef} args={[undefined, undefined, PARCELS.length]} frustumCulled={false} castShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshToonMaterial color={PARCEL} />
      </instancedMesh>
    </group>
  )
}
