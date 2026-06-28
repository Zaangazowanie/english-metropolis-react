import { Canvas, useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { MutableRefObject, PointerEvent } from 'react'
import {
  BackSide,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  Matrix4,
  MeshBasicMaterial,
  MeshToonMaterial,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three'
import type { World } from 'koota'
import { runEngineSystems } from './systems'
import {
  CapsuleCollider,
  PlayerControlled,
  PlayerController,
  RadialGravity,
  Renderable,
  Transform,
  Velocity,
  WorldCollider,
} from './traits'
import { createEngineWorld } from './world'

type EngineCanvasProps = {
  quality?: 'high' | 'medium' | 'low'
  reducedMotion?: boolean
}

type InputState = {
  x: number
  y: number
  jump: boolean
  touchActive: boolean
}

type ObstacleSpec = {
  normal: [number, number, number]
  yaw: number
  width: number
  height: number
  depth: number
  color: string
}

const PLANET_RADIUS = 6
const LAND = '#2b5f6e'
const LAND_DARK = '#143944'
const AMBER = '#e8920a'
const AMBER_CORE = '#ffd38a'
const PURPLE = '#6b4fa0'
const tmpNormal = new Vector3()
const tmpForward = new Vector3()
const tmpRight = new Vector3()
const tmpPosition = new Vector3()
const tmpMatrix = new Matrix4()
const tmpBasis = new Matrix4()
const tmpQuaternion = new Quaternion()
const tmpScale = new Vector3()

const OBSTACLES: ObstacleSpec[] = [
  { normal: [0.0, 1.0, -0.18], yaw: 0.0, width: 1.55, height: 0.78, depth: 0.22, color: '#c47a36' },
  { normal: [-0.36, 0.92, -0.18], yaw: 0.72, width: 1.05, height: 0.92, depth: 0.24, color: '#7d8da3' },
  { normal: [0.42, 0.89, -0.18], yaw: -0.62, width: 1.18, height: 0.72, depth: 0.24, color: '#b85945' },
  { normal: [0.08, 0.92, -0.38], yaw: 1.35, width: 0.34, height: 1.15, depth: 0.34, color: PURPLE },
  { normal: [-0.2, 0.95, 0.24], yaw: -0.25, width: 1.35, height: 0.52, depth: 0.22, color: '#496d78' },
]

function readKeyboard(keys: Set<string>, input: InputState) {
  if (!input.touchActive) {
    input.x = 0
    input.y = 0
    if (keys.has('a') || keys.has('arrowleft')) input.x -= 1
    if (keys.has('d') || keys.has('arrowright')) input.x += 1
    if (keys.has('w') || keys.has('arrowup')) input.y += 1
    if (keys.has('s') || keys.has('arrowdown')) input.y -= 1
  }
  if (keys.has(' ') || keys.has('spacebar')) input.jump = true
}

function useEngineInput(enabled: boolean) {
  const keysRef = useRef<Set<string>>(new Set())
  const inputRef = useRef<InputState>({ x: 0, y: 0, jump: false, touchActive: false })

  useEffect(() => {
    if (!enabled) {
      keysRef.current.clear()
      return
    }
    const down = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase()
      if (
        key === 'w' || key === 'a' || key === 's' || key === 'd' ||
        key === 'arrowup' || key === 'arrowdown' || key === 'arrowleft' || key === 'arrowright' ||
        key === ' ' || key === 'spacebar'
      ) {
        keysRef.current.add(key)
        event.preventDefault()
      }
    }
    const up = (event: KeyboardEvent) => {
      keysRef.current.delete(event.key.toLowerCase())
    }
    const blur = () => keysRef.current.clear()
    window.addEventListener('keydown', down, { passive: false })
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
      keysRef.current.clear()
    }
  }, [enabled])

  return { keysRef, inputRef }
}

function EngineLoop({ world, inputRef, keysRef, reducedMotion, onMotion }: {
  world: World
  inputRef: MutableRefObject<InputState>
  keysRef: MutableRefObject<Set<string>>
  reducedMotion: boolean
  onMotion: (moving: boolean) => void
}) {
  const wasMovingRef = useRef(false)

  useFrame((state, delta) => {
    const input = inputRef.current
    readKeyboard(keysRef.current, input)
    const isMoving = Math.abs(input.x) > 0.04 || Math.abs(input.y) > 0.04
    if (isMoving !== wasMovingRef.current) {
      wasMovingRef.current = isMoving
      onMotion(isMoving)
    }
    world.query(PlayerControlled).updateEach(([player]) => {
      player.inputX = input.x
      player.inputY = input.y
      player.jumpQueued = player.jumpQueued || input.jump
    })
    input.jump = false
    runEngineSystems(world, state, delta, reducedMotion)
  })
  return null
}

function makeSurfaceMatrix(normalTuple: [number, number, number], yaw: number, width: number, height: number, depth: number) {
  tmpNormal.set(normalTuple[0], normalTuple[1], normalTuple[2]).normalize()
  tmpForward.set(0, 0, -1).addScaledVector(tmpNormal, -tmpForward.dot(tmpNormal))
  if (tmpForward.lengthSq() < 0.000001) tmpForward.set(1, 0, 0).addScaledVector(tmpNormal, -tmpNormal.x)
  tmpForward.normalize()
  tmpQuaternion.setFromAxisAngle(tmpNormal, yaw)
  tmpForward.applyQuaternion(tmpQuaternion).normalize()
  tmpRight.copy(tmpNormal).cross(tmpForward).normalize()
  tmpPosition.copy(tmpNormal).multiplyScalar(PLANET_RADIUS + height * 0.5)
  tmpBasis.makeBasis(tmpRight, tmpNormal, tmpForward)
  tmpQuaternion.setFromRotationMatrix(tmpBasis)
  tmpScale.set(width, height, depth)
  tmpMatrix.compose(tmpPosition, tmpQuaternion, tmpScale)
  return tmpMatrix.clone()
}

function mergeWorldColliderGeometry() {
  const geometries: BufferGeometry[] = []
  const planet = new SphereGeometry(PLANET_RADIUS, 48, 32)
  geometries.push(planet.toNonIndexed())

  for (const obstacle of OBSTACLES) {
    const box = new BoxGeometry(1, 1, 1)
    box.applyMatrix4(makeSurfaceMatrix(obstacle.normal, obstacle.yaw, obstacle.width, obstacle.height, obstacle.depth))
    geometries.push(box.toNonIndexed())
  }

  let vertexCount = 0
  for (const geometry of geometries) vertexCount += geometry.getAttribute('position').count
  const positions = new Float32Array(vertexCount * 3)
  let offset = 0
  for (const geometry of geometries) {
    const source = geometry.getAttribute('position') as BufferAttribute
    positions.set(source.array as Float32Array, offset)
    offset += source.count * 3
  }

  const merged = new BufferGeometry()
  merged.setAttribute('position', new BufferAttribute(positions, 3))
  merged.computeVertexNormals()
  merged.computeBoundingBox()
  for (const geometry of geometries) geometry.dispose()
  return merged
}

const JOY_RADIUS = 54

function TouchPad({ inputRef }: { inputRef: MutableRefObject<InputState> }) {
  const padRef = useRef<HTMLDivElement>(null)
  const knobRef = useRef<HTMLDivElement>(null)
  const originRef = useRef<{ x: number; y: number } | null>(null)

  const setKnob = (x: number, y: number) => {
    if (knobRef.current) knobRef.current.style.transform = `translate(${x}px, ${y}px)`
  }
  const updatePointer = (event: PointerEvent<HTMLDivElement>) => {
    const origin = originRef.current
    if (!origin) return
    let dx = event.clientX - origin.x
    let dy = event.clientY - origin.y
    const distance = Math.hypot(dx, dy)
    if (distance > JOY_RADIUS) {
      dx = (dx / distance) * JOY_RADIUS
      dy = (dy / distance) * JOY_RADIUS
    }
    setKnob(dx, dy)
    const input = inputRef.current
    input.x = dx / JOY_RADIUS
    input.y = -dy / JOY_RADIUS
    input.touchActive = true
  }
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const rect = padRef.current?.getBoundingClientRect()
    if (!rect) return
    originRef.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
    event.currentTarget.setPointerCapture(event.pointerId)
    updatePointer(event)
  }
  const onPointerUp = () => {
    originRef.current = null
    const input = inputRef.current
    input.x = 0
    input.y = 0
    input.touchActive = false
    setKnob(0, 0)
  }

  return (
    <div
      ref={padRef}
      aria-hidden="true"
      onPointerDown={onPointerDown}
      onPointerMove={(event) => originRef.current && updatePointer(event)}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{
        position: 'absolute',
        zIndex: 2,
        left: 24,
        bottom: 24,
        width: JOY_RADIUS * 2,
        height: JOY_RADIUS * 2,
        borderRadius: '50%',
        background: 'rgba(10,4,24,0.46)',
        border: '1px solid rgba(248,239,226,0.18)',
        touchAction: 'none',
        pointerEvents: 'auto',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        ref={knobRef}
        style={{
          width: 44,
          height: 44,
          borderRadius: '50%',
          background: `radial-gradient(circle at 40% 35%, ${AMBER_CORE}, ${AMBER})`,
          boxShadow: `0 0 18px ${AMBER}aa`,
          pointerEvents: 'none',
          willChange: 'transform',
        }}
      />
    </div>
  )
}

function SeedScene({ world }: { world: World }) {
  const playerRef = useRef<Group>(null)
  const colliderGeometry = useMemo(() => mergeWorldColliderGeometry(), [])
  const planetGeometry = useMemo(() => new SphereGeometry(PLANET_RADIUS, 64, 40), [])
  const atmosphereGeometry = useMemo(() => new SphereGeometry(PLANET_RADIUS + 0.55, 32, 20), [])
  const obstacleGeometry = useMemo(() => new BoxGeometry(1, 1, 1), [])
  const bodyGeometry = useMemo(() => new CylinderGeometry(0.14, 0.16, 0.44, 10), [])
  const headGeometry = useMemo(() => new IcosahedronGeometry(0.19, 1), [])
  const footGeometry = useMemo(() => new SphereGeometry(0.1, 10, 8), [])
  const planetMaterial = useMemo(() => new MeshToonMaterial({ color: LAND }), [])
  const atmosphereMaterial = useMemo(() => new MeshBasicMaterial({ color: AMBER, transparent: true, opacity: 0.08, side: BackSide, depthWrite: false }), [])
  const obstacleMaterials = useMemo(() => OBSTACLES.map((obstacle) => new MeshToonMaterial({ color: obstacle.color })), [])
  const playerMaterial = useMemo(() => new MeshToonMaterial({ color: AMBER }), [])
  const scarfMaterial = useMemo(() => new MeshBasicMaterial({ color: PURPLE }), [])

  useEffect(() => {
    const player = world.spawn(
      Transform,
      Velocity,
      PlayerControlled,
      PlayerController,
      CapsuleCollider({ radius: 0.16, height: 0.72, skin: 0.018 }),
      RadialGravity({ radius: PLANET_RADIUS, strength: 8.2 }),
      Renderable({ object: playerRef.current }),
    )
    const transform = player.get(Transform)
    transform?.position.set(0, PLANET_RADIUS, 0)
    const controller = player.get(PlayerController)
    controller?.forward.set(0, 0, -1)
    controller?.surfaceNormal.set(0, 1, 0)

    const collider = world.spawn(WorldCollider({ geometry: colliderGeometry, ready: true }))

    return () => {
      player.destroy()
      collider.destroy()
    }
  }, [colliderGeometry, world])

  useEffect(() => () => {
    colliderGeometry.dispose()
    planetGeometry.dispose()
    atmosphereGeometry.dispose()
    obstacleGeometry.dispose()
    bodyGeometry.dispose()
    headGeometry.dispose()
    footGeometry.dispose()
    planetMaterial.dispose()
    atmosphereMaterial.dispose()
    for (const material of obstacleMaterials) material.dispose()
    playerMaterial.dispose()
    scarfMaterial.dispose()
  }, [atmosphereGeometry, atmosphereMaterial, bodyGeometry, colliderGeometry, footGeometry, headGeometry, obstacleGeometry, obstacleMaterials, planetGeometry, planetMaterial, playerMaterial, scarfMaterial])

  return (
    <group>
      <hemisphereLight args={['#dbe7f6', LAND_DARK, 1.15]} />
      <ambientLight intensity={0.48} />
      <directionalLight position={[3, 7, 4]} intensity={0.95} color={AMBER_CORE} />
      <mesh geometry={atmosphereGeometry} material={atmosphereMaterial} />
      <mesh geometry={planetGeometry} material={planetMaterial} />
      {OBSTACLES.map((obstacle, index) => (
        <mesh
          key={`${obstacle.normal.join(':')}:${index}`}
          geometry={obstacleGeometry}
          material={obstacleMaterials[index]}
          matrixAutoUpdate={false}
          matrix={makeSurfaceMatrix(obstacle.normal, obstacle.yaw, obstacle.width, obstacle.height, obstacle.depth)}
        />
      ))}
      <group ref={playerRef}>
        <mesh geometry={bodyGeometry} material={playerMaterial} position={[0, 0.36, 0]} />
        <mesh geometry={headGeometry} material={playerMaterial} position={[0, 0.68, 0]} />
        <mesh geometry={footGeometry} material={scarfMaterial} position={[-0.08, 0.1, 0.04]} />
        <mesh geometry={footGeometry} material={scarfMaterial} position={[0.08, 0.1, 0.04]} />
      </group>
    </group>
  )
}

export default function EngineCanvas({ quality = 'medium', reducedMotion = false }: EngineCanvasProps) {
  const world = useMemo(() => createEngineWorld(), [])
  const dpr = quality === 'high' ? 1.5 : quality === 'medium' ? 1.25 : 1
  const { keysRef, inputRef } = useEngineInput(true)
  const [moving, setMoving] = useState(false)

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#030208' }}>
      <div style={{ position: 'absolute', zIndex: 1, left: 24, top: 24, maxWidth: 440, color: '#f8efe2', fontFamily: 'Inter, system-ui, sans-serif', textShadow: '0 2px 14px rgba(3,2,8,0.7)' }}>
        <p style={{ margin: 0, fontSize: 12, letterSpacing: '0.24em', textTransform: 'uppercase', color: AMBER }}>World Next</p>
        <h1 style={{ margin: '6px 0 8px', fontSize: 28, lineHeight: 1.05 }}>Walkable ECS planet</h1>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: '#e7d9f5' }}>
          Use WASD or arrow keys to walk and turn. Press Space to hop. The capsule player collides with the planet and test walls through the engine systems.
        </p>
      </div>
      <div aria-live="polite" style={{ position: 'absolute', left: -9999, width: 1, height: 1, overflow: 'hidden' }}>
        {moving ? 'The courier is walking through World Next.' : 'World Next is a walkable test scene. Use keyboard controls to explore the planet.'}
      </div>
      <TouchPad inputRef={inputRef} />
      <Canvas aria-hidden dpr={dpr} camera={{ position: [0, PLANET_RADIUS + 1.0, 1.8], fov: 45 }} frameloop="always">
        <color attach="background" args={['#030208']} />
        <SeedScene world={world} />
        <EngineLoop world={world} inputRef={inputRef} keysRef={keysRef} reducedMotion={reducedMotion} onMotion={setMoving} />
      </Canvas>
    </div>
  )
}
