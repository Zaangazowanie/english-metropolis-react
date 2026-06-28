import { Canvas, useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { BoxGeometry, Mesh, MeshBasicMaterial, Object3D, SphereGeometry } from 'three'
import type { World } from 'koota'
import { runEngineSystems } from './systems'
import { PlayerControlled, RadialGravity, Renderable, Transform, Velocity } from './traits'
import { createEngineWorld } from './world'

type EngineCanvasProps = {
  quality?: 'high' | 'medium' | 'low'
  reducedMotion?: boolean
}

function EngineLoop({ world }: { world: World }) {
  useFrame((state, delta) => {
    runEngineSystems(world, state, delta)
  })
  return null
}

function SeedScene({ world }: { world: World }) {
  const playerRef = useRef<Mesh>(null)
  const planetRef = useRef<Mesh>(null)

  useEffect(() => {
    const player = world.spawn(
      Transform,
      Velocity,
      PlayerControlled,
      Renderable({ object: playerRef.current }),
    )
    player.get(Transform)?.position.set(0, 1.25, 0)

    const planet = world.spawn(
      Transform,
      RadialGravity({ radius: 8 }),
      Renderable({ object: planetRef.current }),
    )
    planet.get(Transform)?.scale.set(8, 8, 8)

    return () => {
      player.destroy()
      planet.destroy()
    }
  }, [world])

  const playerGeometry = useMemo(() => new BoxGeometry(0.7, 1.2, 0.7), [])
  const planetGeometry = useMemo(() => new SphereGeometry(1, 32, 16), [])
  const playerMaterial = useMemo(() => new MeshBasicMaterial({ color: '#e8920a' }), [])
  const planetMaterial = useMemo(() => new MeshBasicMaterial({ color: '#2b5f6e', wireframe: true }), [])

  useEffect(() => () => {
    playerGeometry.dispose()
    planetGeometry.dispose()
    playerMaterial.dispose()
    planetMaterial.dispose()
  }, [planetGeometry, planetMaterial, playerGeometry, playerMaterial])

  return (
    <group>
      <mesh ref={planetRef} geometry={planetGeometry} material={planetMaterial} />
      <mesh ref={playerRef} geometry={playerGeometry} material={playerMaterial} />
    </group>
  )
}

export default function EngineCanvas({ quality = 'medium', reducedMotion = false }: EngineCanvasProps) {
  const world = useMemo(() => createEngineWorld(), [])
  const dpr = quality === 'high' ? 1.5 : quality === 'medium' ? 1.25 : 1

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#030208' }}>
      <div style={{ position: 'absolute', zIndex: 1, left: 24, top: 24, maxWidth: 420, color: '#f8efe2', fontFamily: 'Inter, system-ui, sans-serif' }}>
        <p style={{ margin: 0, fontSize: 12, letterSpacing: '0.24em', textTransform: 'uppercase', color: '#e8920a' }}>World Next</p>
        <h1 style={{ margin: '6px 0 8px', fontSize: 28, lineHeight: 1.05 }}>ECS foundation route</h1>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: '#c9bddc' }}>
          Hidden Phase 0 engine mount. The live English Metro world remains on the existing route.
        </p>
      </div>
      <Canvas aria-hidden dpr={dpr} camera={{ position: [0, 4.5, 8], fov: 45 }} frameloop={reducedMotion ? 'demand' : 'always'}>
        <color attach="background" args={['#030208']} />
        <SeedScene world={world} />
        {!reducedMotion && <EngineLoop world={world} />}
      </Canvas>
    </div>
  )
}
