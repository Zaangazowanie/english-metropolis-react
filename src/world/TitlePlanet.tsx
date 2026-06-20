// TitlePlanet — the menu "tiny planet" (abeto-style homage, canon menu layer):
// a small rotating dusk world studded with city buildings and amber lamps,
// floating high over the plaza on the title screen. The "ENGLISHMETRO"
// lettering itself is the crisp DOM wordmark in the title overlay (contract
// rule 9) — this is the 3D world it sits above.
//
// Mounted ONLY in the title phase; it also drives the title camera (a gentle
// orbit framing the planet deterministically), so framing never drifts.
// On Begin, this unmounts and WrenRig's follow-cam eases down into the city —
// a "descend from the menu planet into the world" reveal.
//
// Procedural: 1 sphere + 1 InstancedMesh of building studs + a rim-glow shell.
// No textures/GLBs/deps. reducedMotion → planet + camera hold still.

import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Object3D, Quaternion, Vector3, Color } from 'three'
import type { Group, InstancedMesh } from 'three'
import { palette } from '../practice/shells3d/kit/palette'

const _o = new Object3D()
const _q = new Quaternion()
const _dir = new Vector3()
const _c = new Color()
const UP = new Vector3(0, 1, 0)

const PLANET_POS: [number, number, number] = [0, 9, 0]
const PLANET_R = 2.4
const STUDS = 46
const CAM_R = 7
const GOLDEN = Math.PI * (3 - Math.sqrt(5))

const PLANET = '#235A66'   // dusk-teal ocean
const LAND   = palette.night
const AMBER  = palette.lanternAmber

export function TitlePlanet({ reducedMotion = false }: { reducedMotion?: boolean }) {
  const { camera } = useThree()
  const spinRef = useRef<Group>(null!)
  const studRef = useRef<InstancedMesh>(null!)
  const t = useRef(0)

  // Distribute building studs over the sphere (golden-spiral), oriented outward.
  useEffect(() => {
    if (!studRef.current) return
    for (let i = 0; i < STUDS; i++) {
      const y = 1 - (i / (STUDS - 1)) * 2
      const rad = Math.sqrt(Math.max(0, 1 - y * y))
      const theta = i * GOLDEN
      _dir.set(Math.cos(theta) * rad, y, Math.sin(theta) * rad).normalize()
      const h = 0.16 + ((i * 0.137) % 1) * 0.4
      _o.position.copy(_dir).multiplyScalar(PLANET_R + h / 2)
      _q.setFromUnitVectors(UP, _dir)
      _o.quaternion.copy(_q)
      _o.scale.set(0.16, h, 0.16)
      _o.updateMatrix()
      studRef.current.setMatrixAt(i, _o.matrix)
      _c.set(i % 4 === 0 ? AMBER : LAND)
      studRef.current.setColorAt(i, _c)
    }
    studRef.current.instanceMatrix.needsUpdate = true
    if (studRef.current.instanceColor) studRef.current.instanceColor.needsUpdate = true
  }, [])

  useFrame((_, delta) => {
    // Gentle planet spin.
    if (spinRef.current && !reducedMotion) spinRef.current.rotation.y += delta * 0.18
    // Deterministic title camera: orbit the planet, always looking at it.
    if (!reducedMotion) t.current += delta * 0.12
    const a = t.current
    camera.position.set(
      PLANET_POS[0] + Math.sin(a) * CAM_R,
      PLANET_POS[1] + 1.3,
      PLANET_POS[2] + Math.cos(a) * CAM_R,
    )
    camera.lookAt(PLANET_POS[0], PLANET_POS[1], PLANET_POS[2])
  })

  return (
    <group position={PLANET_POS}>
      {/* rim-glow atmosphere */}
      <mesh>
        <sphereGeometry args={[PLANET_R + 0.4, 24, 18]} />
        <meshBasicMaterial color={AMBER} transparent opacity={0.07} side={1 /* BackSide */} depthWrite={false} />
      </mesh>
      {/* spinning world */}
      <group ref={spinRef}>
        <mesh>
          <sphereGeometry args={[PLANET_R, 32, 24]} />
          <meshToonMaterial color={PLANET} />
        </mesh>
        {/* city studs */}
        <instancedMesh ref={studRef} args={[undefined, undefined, STUDS]} frustumCulled={false}>
          <boxGeometry args={[1, 1, 1]} />
          <meshToonMaterial color={LAND} />
        </instancedMesh>
      </group>
    </group>
  )
}
