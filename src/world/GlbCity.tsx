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
import { Object3D, Quaternion, Vector3, Box3, Color, MeshToonMaterial, DataTexture, RGBAFormat, LinearFilter } from 'three'
import type { InstancedMesh, Mesh, BufferGeometry } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'

// Soft multi-step toon ramp (the default toon is a HARSH 2-tone split). A 5-level
// ramp that never goes dark (lit floor ~0.5) gives gentle cel bands → the soft,
// airy abeto look instead of rough high-contrast shading.
const SOFT_GRADIENT = (() => {
  const lv = [124, 168, 202, 230, 250]
  const data = new Uint8Array(lv.length * 4)
  for (let i = 0; i < lv.length; i++) { data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = lv[i]; data[i * 4 + 3] = 255 }
  const t = new DataTexture(data, lv.length, 1, RGBAFormat)
  t.minFilter = LinearFilter; t.magFilter = LinearFilter; t.needsUpdate = true
  return t
})()

const _o = new Object3D()
const _q = new Quaternion()
const _qy = new Quaternion()
const _dir = new Vector3()
const _col = new Color()
const UP = new Vector3(0, 1, 0)
const R = 26 // planet radius (must match PlanetWorld)

// Buildings keep their painted TEXTURES (abeto-quality colour + facade detail:
// windows, signage, brick, glass), rendered through a flat MeshToonMaterial so we
// get the cel look + the ink-outline post pass on top — not glossy PBR. One toon
// material per building type (reusing the GLB's baseColor map).

let _draco: DRACOLoader | null = null
function withDraco(loader: GLTFLoader) {
  if (!_draco) {
    _draco = new DRACOLoader()
    _draco.setDecoderPath('/draco/')
  }
  loader.setDRACOLoader(_draco)
}

export interface Placement {
  x: number; y: number; z: number; scale: number; yaw?: number
  /** Height multiplier (footprint = scale; height = scale*sy) — proportion variety. */
  sy?: number
  /** Per-instance RGB multiply (subtle brightness/hue variety). */
  tint?: [number, number, number]
}

/** Load a GLB, pick its first mesh, bake world transform, and normalize so the
 *  geometry is centred on X/Z with its base at y=0 and a height of 1. Returns the
 *  geometry + a flat toon material that reuses the GLB's baseColor texture (cel +
 *  painted detail). */
function useNormalized(url: string): { geometry: BufferGeometry; material: MeshToonMaterial } {
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
    const sm = (Array.isArray(src.material) ? src.material[0] : src.material) as { map?: unknown } | undefined
    const map = sm && sm.map ? (sm.map as ConstructorParameters<typeof MeshToonMaterial>[0]['map']) : undefined
    const material = new MeshToonMaterial({ map: map ?? null, color: map ? 0xffffff : 0xbfc4c9, gradientMap: SOFT_GRADIENT })
    return { geometry: geo, material }
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
      _o.scale.set(it.scale, it.scale * (it.sy ?? 1), it.scale) // sy = height variety
      _o.updateMatrix()
      ref.current.setMatrixAt(i, _o.matrix)
    }
    ref.current.instanceMatrix.needsUpdate = true
  }, [geometry, items])
  return <instancedMesh ref={ref} args={[geometry, material, items.length]} frustumCulled={false} castShadow receiveShadow />
}

export interface GlbCityProps {
  towers: Placement[]
  houses: Placement[]
  eye: Placement
  /** Tower Bridge landmark (single instance). Optional so callers can omit it. */
  bridge?: Placement
  /** Extra building variations — only rendered when a non-empty array is passed
   *  (so the matching GLB must exist under public/world/). */
  apartments?: Placement[]
  domes?: Placement[]
  mixed?: Placement[]
}

export function GlbCity({ towers, houses, eye, bridge, apartments, domes, mixed }: GlbCityProps) {
  return (
    <group>
      <Instanced url="/world/skyscraper.glb" items={towers} />
      <Instanced url="/world/townhouse.glb" items={houses} />
      {apartments && apartments.length > 0 && <Instanced url="/world/apartment.glb" items={apartments} />}
      {mixed && mixed.length > 0 && <Instanced url="/world/mixed.glb" items={mixed} />}
      {domes && domes.length > 0 && <Instanced url="/world/dome.glb" items={domes} />}
      <Instanced url="/world/londoneye.glb" items={[eye]} />
      {bridge && <Instanced url="/world/bridge.glb" items={[bridge]} />}
    </group>
  )
}

// ── Named NPC keepers — real (static) character meshes standing on the sphere ──
export interface NpcSpec { url: string; dir: [number, number, number]; height?: number; yaw?: number }

function Npc({ url, dir, height = 0.11, yaw = 0 }: NpcSpec) {
  const gltf = useLoader(GLTFLoader, url, withDraco)
  const { s, lift, pos, quat } = useMemo(() => {
    const box = new Box3().setFromObject(gltf.scene)
    const size = new Vector3(); box.getSize(size)
    const sc = height / (size.y || 1)
    const d = new Vector3(dir[0], dir[1], dir[2]).normalize()
    const q = new Quaternion().setFromUnitVectors(UP, d)
    if (yaw) q.multiply(new Quaternion().setFromAxisAngle(UP, yaw))
    return { s: sc, lift: -box.min.y * sc, pos: d.clone().multiplyScalar(R), quat: q }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gltf])
  return (
    <group position={[pos.x, pos.y, pos.z]} quaternion={[quat.x, quat.y, quat.z, quat.w]}>
      <primitive object={gltf.scene} scale={s} position={[0, lift, 0]} />
    </group>
  )
}

// Keepers stand IN the city now (downtown is centred on the +Y spawn), spread
// around the plaza + nearby streets so the town feels populated.
export function PlanetNpcs() {
  return (
    <group>
      <Npc url="/world/npc_flora.glb" dir={[0.10, 0.975, -0.20]} yaw={-0.5} />
      <Npc url="/world/npc_frank.glb" dir={[-0.18, 0.965, 0.12]} yaw={0.6} />
      <Npc url="/world/npc_marg.glb" dir={[0.24, 0.955, 0.10]} yaw={0.1} />
      <Npc url="/world/npc_chen.glb" dir={[-0.06, 0.945, -0.32]} yaw={-1.1} />
      <Npc url="/world/npc_posta.glb" dir={[0.32, 0.935, -0.14]} yaw={2.2} />
      <Npc url="/world/npc_pell.glb" dir={[-0.30, 0.935, -0.18]} yaw={0.3} />
      <Npc url="/world/npc_penny.glb" dir={[0.12, 0.95, 0.29]} yaw={1.4} />
    </group>
  )
}

export default GlbCity
