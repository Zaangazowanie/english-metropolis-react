// GlbCity — REAL building meshes instanced over the planet sphere, replacing the
// procedural box buildings. Loads our own Meshy-generated, Draco-compressed GLBs
// (skyscraper / townhouse / London Eye), normalizes each to unit height, and
// scatters instances normal-aligned on the globe. Because an InstancedMesh shares
// ONE geometry, a detailed building instanced dozens of times stays cheap.
//
// Assets are same-origin under public/world/ ; the Draco decoder is self-hosted
// at public/draco/ (no external URLs, no new npm deps — GLTFLoader + DRACOLoader
// are three's own examples/jsm).

import { useEffect, useMemo, useRef } from 'react'
import { useLoader } from '@react-three/fiber'
import { Object3D, Quaternion, Vector3, Box3 } from 'three'
import type { InstancedMesh, Mesh, BufferGeometry, Material } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'

const _o = new Object3D()
const _q = new Quaternion()
const _qy = new Quaternion()
const _dir = new Vector3()
const UP = new Vector3(0, 1, 0)
const R = 6 // planet radius (must match PlanetWorld)

let _draco: DRACOLoader | null = null
function withDraco(loader: GLTFLoader) {
  if (!_draco) {
    _draco = new DRACOLoader()
    _draco.setDecoderPath('/draco/')
  }
  loader.setDRACOLoader(_draco)
}

export interface Placement { x: number; y: number; z: number; scale: number; yaw?: number }

/** Load a GLB, merge-pick its first mesh, bake world transform, and normalize so
 *  the geometry is centred on X/Z with its base at y=0 and a height of 1. */
function useNormalized(url: string): { geometry: BufferGeometry; material: Material } {
  const gltf = useLoader(GLTFLoader, url, withDraco)
  return useMemo(() => {
    gltf.scene.updateWorldMatrix(true, true)
    let mesh: Mesh | null = null
    gltf.scene.traverse((o) => {
      const m = o as Mesh
      if (m.isMesh && mesh === null) mesh = m
    })
    const src = mesh as unknown as Mesh
    const geo = src.geometry.clone()
    geo.applyMatrix4(src.matrixWorld)
    const bb = new Box3().setFromObject(src)
    const cx = (bb.min.x + bb.max.x) / 2
    const cz = (bb.min.z + bb.max.z) / 2
    const h = bb.max.y - bb.min.y || 1
    geo.translate(-cx, -bb.min.y, -cz)
    geo.scale(1 / h, 1 / h, 1 / h)
    return { geometry: geo, material: src.material as Material }
  }, [gltf])
}

function Instanced({ url, items }: { url: string; items: Placement[] }) {
  const { geometry, material } = useNormalized(url)
  const ref = useRef<InstancedMesh>(null!)
  useEffect(() => {
    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      _dir.set(it.x, it.y, it.z).normalize()
      _q.setFromUnitVectors(UP, _dir)
      if (it.yaw) {
        _qy.setFromAxisAngle(UP, it.yaw) // yaw about the model's own up
        _q.multiply(_qy)
      }
      _o.position.copy(_dir).multiplyScalar(R) // base sits on the surface
      _o.quaternion.copy(_q)
      _o.scale.setScalar(it.scale)
      _o.updateMatrix()
      ref.current.setMatrixAt(i, _o.matrix)
    }
    ref.current.instanceMatrix.needsUpdate = true
  }, [geometry, items])
  return <instancedMesh ref={ref} args={[geometry, material, items.length]} frustumCulled={false} />
}

export interface GlbCityProps {
  towers: Placement[]
  houses: Placement[]
  eye: Placement
}

export function GlbCity({ towers, houses, eye }: GlbCityProps) {
  return (
    <group>
      <Instanced url="/world/skyscraper.glb" items={towers} />
      <Instanced url="/world/townhouse.glb" items={houses} />
      <Instanced url="/world/londoneye.glb" items={[eye]} />
    </group>
  )
}

export default GlbCity
