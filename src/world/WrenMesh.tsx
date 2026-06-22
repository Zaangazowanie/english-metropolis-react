// WrenMesh — the player as a REAL rigged mesh (our Meshy-generated Wren with a
// baked walking animation), replacing the procedural primitive Wren. Drops into
// PlanetWorld's PlayerRig group, which already orients it on the sphere (local
// +Y = surface normal, +Z = heading) and writes speedRef each frame.
//
// Loads the Draco GLB (three's GLTFLoader + DRACOLoader, decoder self-hosted at
// public/draco/), normalizes it to ~Wren height with feet at y=0, faces +Z, and
// plays the walk clip via an AnimationMixer at a rate driven by speedRef (frozen
// when idle / reducedMotion). No new deps.

import { useEffect, useMemo, useRef } from 'react'
import { useLoader, useFrame } from '@react-three/fiber'
import { AnimationMixer, Box3, Vector3 } from 'three'
import type { Group, AnimationAction } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'

let _draco: DRACOLoader | null = null
function withDraco(loader: GLTFLoader) {
  if (!_draco) { _draco = new DRACOLoader(); _draco.setDecoderPath('/draco/') }
  loader.setDRACOLoader(_draco)
}

export interface WrenMeshProps {
  speedRef: React.MutableRefObject<number>
  reducedMotion?: boolean
  /** Target height in world units (Wren ~1.5 on the planet). */
  height?: number
  /** Extra yaw if the mesh's forward isn't +Z. */
  faceYaw?: number
}

export function WrenMesh({ speedRef, reducedMotion = false, height = 1.55, faceYaw = 0 }: WrenMeshProps) {
  const gltf = useLoader(GLTFLoader, '/world/wren.glb', withDraco)
  const root = useRef<Group>(null!)
  const mixer = useMemo(() => new AnimationMixer(gltf.scene), [gltf])
  const action = useRef<AnimationAction | null>(null)

  useEffect(() => {
    // play the (single) walk clip
    if (gltf.animations.length) {
      const a = mixer.clipAction(gltf.animations[0])
      a.play()
      action.current = a
    }
    // normalize: scale to `height`, drop feet to y=0
    const box = new Box3().setFromObject(gltf.scene)
    const size = new Vector3(); box.getSize(size)
    const s = height / (size.y || 1)
    root.current.scale.setScalar(s)
    root.current.position.set(0, -box.min.y * s, 0)
    root.current.rotation.y = faceYaw
    return () => { mixer.stopAllAction() }
  }, [gltf, mixer, height, faceYaw])

  useFrame((_, delta) => {
    const sp = reducedMotion ? 0 : speedRef.current
    // advance the walk in proportion to speed; frozen (rest) when idle
    mixer.update(delta * (sp > 0.05 ? 0.7 + sp * 1.1 : 0))
  })

  return <group ref={root}><primitive object={gltf.scene} /></group>
}

export default WrenMesh
