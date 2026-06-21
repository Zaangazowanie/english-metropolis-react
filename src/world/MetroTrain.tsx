// MetroTrain — the elevated "Round" and its slow last train, circling the
// world beyond the plaza. Canon: "the Round never stops. Even when it is quiet."
// Distant background ambiance that makes the city feel alive (and pays off the
// bench beat's "watch the last train").
//
// Procedural: a torus viaduct on instanced pillars + a 3-car warm-windowed
// train that travels the circle, reskinned to the canonical Dusk Teal & Amber
// art bible (dark-teal ironwork, brass rail glint, deep-teal cars, amber
// windows + a warm headlight) and given the canon "it breathes" bob. Passenger
// silhouettes ride in the lit windows — the last train carries people home
// through the dusk ("the Round never stops"). No textures, no GLBs, no external
// assets. reducedMotion → the train parks (no motion / no breath). No per-frame
// allocations (only scalar writes).

import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Object3D } from 'three'
import type { Group, InstancedMesh } from 'three'
import { palette } from '../practice/shells3d/kit/palette'

const _p = new Object3D() // module-scope scratch for instancing

const TRACK_R   = 19      // viaduct radius (well beyond the lamp ring / buildings)
const TRACK_Y   = 4.2     // deck height
const PILLARS   = 14
const TRAIN_SPEED = 0.06  // radians / second (slow, meditative)
const CARS      = 3
const CAR_GAP   = 0.07    // radians between car centres

const VIADUCT  = '#17323A' // dark teal ironwork (canon Dusk Teal, deep)
const RAIL     = palette.brass // warm brass rail glint
const CAR      = '#22454E' // deep dusk-teal car body
const WINDOW   = palette.lanternCore // warm amber window glow
const HEADLAMP = palette.lanternAmber // warm headlight on the lead car
const PASSENGER = '#2A2018' // dark warm passenger silhouette (against lit window)

// Passenger silhouette local positions: just outside each window (both sides),
// two per window, so they read as figures backlit by the warm glow.
const PASSENGERS: Array<[number, number, number]> = []
for (let i = 0; i < CARS; i++) {
  const cz = (i - (CARS - 1) / 2) * (CAR_GAP * TRACK_R)
  for (const sx of [-0.385, 0.385]) {
    for (const zo of [-0.22, 0.22]) PASSENGERS.push([sx, 0.08, cz + zo])
  }
}

export function MetroTrain({ reducedMotion = false }: { reducedMotion?: boolean }) {
  const pillarsRef = useRef<InstancedMesh>(null!)
  const passengersRef = useRef<InstancedMesh>(null!)
  const trainRef = useRef<Group>(null!)
  const angle = useRef(0)
  const t = useRef(0)

  // Place pillars once.
  useFrameOncePillars(pillarsRef)

  // Place passenger silhouettes once (local to the train group → they ride along).
  useEffect(() => {
    if (!passengersRef.current) return
    PASSENGERS.forEach((p, i) => {
      _p.position.set(p[0], p[1], p[2])
      _p.rotation.set(0, 0, 0)
      _p.scale.set(0.5, 1.3, 0.9) // thin in x, tall in y → a head-and-shoulders silhouette
      _p.updateMatrix()
      passengersRef.current.setMatrixAt(i, _p.matrix)
    })
    passengersRef.current.instanceMatrix.needsUpdate = true
  }, [])

  useFrame((_, delta) => {
    if (reducedMotion || !trainRef.current) return
    angle.current = (angle.current + delta * TRAIN_SPEED) % (Math.PI * 2)
    t.current += delta
    const a = angle.current
    const breath = Math.sin(t.current * 1.1) * 0.05 // canon: "it breathes"
    trainRef.current.position.set(Math.sin(a) * TRACK_R, TRACK_Y + 0.35 + breath, Math.cos(a) * TRACK_R)
    trainRef.current.rotation.y = -a // tangent to the circle
  })

  return (
    <group>
      {/* Viaduct deck — a flat torus ring */}
      <mesh position={[0, TRACK_Y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[TRACK_R, 0.22, 6, 64]} />
        <meshToonMaterial color={VIADUCT} />
      </mesh>
      {/* Inner rail highlight */}
      <mesh position={[0, TRACK_Y + 0.16, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[TRACK_R, 0.05, 4, 64]} />
        <meshToonMaterial color={RAIL} />
      </mesh>

      {/* Pillars — instanced cylinders from ground to deck */}
      <instancedMesh ref={pillarsRef} args={[undefined, undefined, PILLARS]} frustumCulled={false}>
        <cylinderGeometry args={[0.16, 0.22, TRACK_Y, 6]} />
        <meshToonMaterial color={VIADUCT} />
      </instancedMesh>

      {/* The last train — 3 warm-windowed cars on the deck */}
      <group ref={trainRef} position={[0, TRACK_Y + 0.35, TRACK_R]}>
        {Array.from({ length: CARS }, (_, i) => {
          const z = (i - (CARS - 1) / 2) * (CAR_GAP * TRACK_R)
          return (
            <group key={i} position={[0, 0, z]}>
              {/* car body */}
              <mesh>
                <boxGeometry args={[0.7, 0.6, 1.0]} />
                <meshToonMaterial color={CAR} />
              </mesh>
              {/* warm window strip (both sides) — MeshBasicMaterial so it glows */}
              <mesh position={[0.36, 0.05, 0]}>
                <boxGeometry args={[0.02, 0.26, 0.8]} />
                <meshBasicMaterial color={WINDOW} />
              </mesh>
              <mesh position={[-0.36, 0.05, 0]}>
                <boxGeometry args={[0.02, 0.26, 0.8]} />
                <meshBasicMaterial color={WINDOW} />
              </mesh>
              {/* Warm headlight on the lead car (front, local +Z) */}
              {i === CARS - 1 && (
                <mesh position={[0, 0, 0.56]}>
                  <sphereGeometry args={[0.09, 8, 6]} />
                  <meshBasicMaterial color={HEADLAMP} />
                </mesh>
              )}
            </group>
          )
        })}
        {/* Passenger silhouettes riding in the lit windows (set once) */}
        <instancedMesh ref={passengersRef} args={[undefined, undefined, PASSENGERS.length]} frustumCulled={false}>
          <sphereGeometry args={[0.06, 7, 6]} />
          <meshBasicMaterial color={PASSENGER} />
        </instancedMesh>
      </group>
    </group>
  )
}

// Position the pillars exactly once when the InstancedMesh mounts.
function useFrameOncePillars(ref: React.MutableRefObject<InstancedMesh>) {
  const done = useRef(false)
  useFrame(() => {
    if (done.current || !ref.current) return
    for (let i = 0; i < PILLARS; i++) {
      const a = (i / PILLARS) * Math.PI * 2
      _p.position.set(Math.sin(a) * TRACK_R, TRACK_Y / 2, Math.cos(a) * TRACK_R)
      _p.rotation.set(0, 0, 0)
      _p.scale.setScalar(1)
      _p.updateMatrix()
      ref.current.setMatrixAt(i, _p.matrix)
    }
    ref.current.instanceMatrix.needsUpdate = true
    done.current = true
  })
}
