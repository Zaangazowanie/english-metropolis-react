import { Canvas, useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { MutableRefObject, PointerEvent } from 'react'
import {
  BackSide,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  ConeGeometry,
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
  roof: string
}

const PLANET_RADIUS = 6
const LAND = '#2b5f6e'
const LAND_EDGE = '#38798a'
const SKY_DUSK = '#071321'
const SKY_WARM = '#edbd82'
const AMBER = '#e8920a'
const AMBER_CORE = '#ffd38a'
const PURPLE = '#6b4fa0'
const PLAYER_COAT = '#5f77b4'
const PLAYER_COAT_LIGHT = '#8ca7d8'
const PLAYER_FACE = '#f1cfa4'
const INK = '#172233'
const WINDOW_GLOW = '#ffe0a5'
const tmpNormal = new Vector3()
const tmpForward = new Vector3()
const tmpRight = new Vector3()
const tmpPosition = new Vector3()
const tmpMatrix = new Matrix4()
const tmpBasis = new Matrix4()
const tmpQuaternion = new Quaternion()
const tmpScale = new Vector3()

const OBSTACLES: ObstacleSpec[] = [
  { normal: [0.0, 1.0, -0.18], yaw: 0.0, width: 1.55, height: 0.78, depth: 0.24, color: '#496d78', roof: '#203847' },
  { normal: [-0.36, 0.92, -0.18], yaw: 0.72, width: 1.05, height: 0.92, depth: 0.26, color: '#6f8793', roof: '#263a4a' },
  { normal: [0.42, 0.89, -0.18], yaw: -0.62, width: 1.18, height: 0.72, depth: 0.25, color: '#8a665f', roof: '#382f42' },
  { normal: [0.08, 0.92, -0.38], yaw: 1.35, width: 0.38, height: 1.15, depth: 0.38, color: PURPLE, roof: '#2b2443' },
  { normal: [-0.2, 0.95, 0.24], yaw: -0.25, width: 1.35, height: 0.52, depth: 0.22, color: '#3f6370', roof: '#1e3440' },
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

function buildSurfaceBasis(normalTuple: [number, number, number], yaw: number) {
  tmpNormal.set(normalTuple[0], normalTuple[1], normalTuple[2]).normalize()
  tmpForward.set(0, 0, -1).addScaledVector(tmpNormal, -tmpForward.dot(tmpNormal))
  if (tmpForward.lengthSq() < 0.000001) tmpForward.set(1, 0, 0).addScaledVector(tmpNormal, -tmpNormal.x)
  tmpForward.normalize()
  tmpQuaternion.setFromAxisAngle(tmpNormal, yaw)
  tmpForward.applyQuaternion(tmpQuaternion).normalize()
  tmpRight.copy(tmpNormal).cross(tmpForward).normalize()
  tmpBasis.makeBasis(tmpRight, tmpNormal, tmpForward)
  tmpQuaternion.setFromRotationMatrix(tmpBasis)
}

function makeSurfaceMatrix(normalTuple: [number, number, number], yaw: number, width: number, height: number, depth: number) {
  buildSurfaceBasis(normalTuple, yaw)
  tmpPosition.copy(tmpNormal).multiplyScalar(PLANET_RADIUS + height * 0.5)
  tmpScale.set(width, height, depth)
  tmpMatrix.compose(tmpPosition, tmpQuaternion, tmpScale)
  return tmpMatrix.clone()
}

function makeSurfaceOffsetMatrix(
  normalTuple: [number, number, number],
  yaw: number,
  width: number,
  height: number,
  depth: number,
  rightOffset: number,
  upOffset: number,
  forwardOffset: number,
) {
  buildSurfaceBasis(normalTuple, yaw)
  tmpPosition.copy(tmpNormal).multiplyScalar(PLANET_RADIUS + upOffset + height * 0.5)
  tmpPosition.addScaledVector(tmpRight, rightOffset)
  tmpPosition.addScaledVector(tmpForward, forwardOffset)
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
        background: 'rgba(7,13,28,0.55)',
        border: '1px solid rgba(255,224,165,0.24)',
        touchAction: 'none',
        pointerEvents: 'auto',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 12px 36px rgba(0,0,0,0.22)',
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
  const atmosphereGeometry = useMemo(() => new SphereGeometry(PLANET_RADIUS + 0.62, 32, 20), [])
  const obstacleGeometry = useMemo(() => new BoxGeometry(1, 1, 1), [])
  const windowGeometry = useMemo(() => new BoxGeometry(1, 1, 1), [])
  const bodyGeometry = useMemo(() => new IcosahedronGeometry(0.22, 1), [])
  const headGeometry = useMemo(() => new IcosahedronGeometry(0.18, 1), [])
  const eyeGeometry = useMemo(() => new SphereGeometry(0.026, 8, 6), [])
  const noseGeometry = useMemo(() => new ConeGeometry(0.04, 0.12, 8), [])
  const armGeometry = useMemo(() => new CylinderGeometry(0.032, 0.038, 0.2, 8), [])
  const footGeometry = useMemo(() => new SphereGeometry(0.085, 10, 8), [])
  const planetMaterial = useMemo(() => new MeshToonMaterial({ color: LAND }), [])
  const planetEdgeMaterial = useMemo(() => new MeshBasicMaterial({ color: LAND_EDGE, transparent: true, opacity: 0.08, side: BackSide, depthWrite: false }), [])
  const atmosphereMaterial = useMemo(() => new MeshBasicMaterial({ color: AMBER, transparent: true, opacity: 0.07, side: BackSide, depthWrite: false }), [])
  const obstacleMaterials = useMemo(() => OBSTACLES.map((obstacle) => new MeshToonMaterial({ color: obstacle.color })), [])
  const roofMaterials = useMemo(() => OBSTACLES.map((obstacle) => new MeshToonMaterial({ color: obstacle.roof })), [])
  const windowMaterial = useMemo(() => new MeshBasicMaterial({ color: WINDOW_GLOW, transparent: true, opacity: 0.78 }), [])
  const bodyMaterial = useMemo(() => new MeshToonMaterial({ color: PLAYER_COAT }), [])
  const bellyMaterial = useMemo(() => new MeshToonMaterial({ color: PLAYER_COAT_LIGHT }), [])
  const headMaterial = useMemo(() => new MeshToonMaterial({ color: PLAYER_FACE }), [])
  const scarfMaterial = useMemo(() => new MeshBasicMaterial({ color: PURPLE }), [])
  const inkMaterial = useMemo(() => new MeshBasicMaterial({ color: INK }), [])

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
    windowGeometry.dispose()
    bodyGeometry.dispose()
    headGeometry.dispose()
    eyeGeometry.dispose()
    noseGeometry.dispose()
    armGeometry.dispose()
    footGeometry.dispose()
    planetMaterial.dispose()
    planetEdgeMaterial.dispose()
    atmosphereMaterial.dispose()
    for (const material of obstacleMaterials) material.dispose()
    for (const material of roofMaterials) material.dispose()
    windowMaterial.dispose()
    bodyMaterial.dispose()
    bellyMaterial.dispose()
    headMaterial.dispose()
    scarfMaterial.dispose()
    inkMaterial.dispose()
  }, [atmosphereGeometry, atmosphereMaterial, bellyMaterial, bodyGeometry, bodyMaterial, colliderGeometry, eyeGeometry, footGeometry, headGeometry, headMaterial, inkMaterial, noseGeometry, obstacleGeometry, obstacleMaterials, planetEdgeMaterial, planetGeometry, planetMaterial, roofMaterials, scarfMaterial, windowGeometry, windowMaterial])

  return (
    <group>
      <hemisphereLight args={[SKY_WARM, '#25465a', 1.2]} />
      <ambientLight intensity={0.34} color="#7d91b7" />
      <directionalLight position={[-4.5, 3.1, 2.5]} intensity={1.15} color={AMBER_CORE} />
      <directionalLight position={[2.0, 4.4, -5.0]} intensity={0.24} color="#7fa6d9" />
      <mesh geometry={atmosphereGeometry} material={atmosphereMaterial} />
      <mesh geometry={atmosphereGeometry} material={planetEdgeMaterial} scale={[0.985, 0.985, 0.985]} />
      <mesh geometry={planetGeometry} material={planetMaterial} />
      {OBSTACLES.map((obstacle, index) => {
        const rowY = Math.max(0.14, obstacle.height * 0.36)
        const windowW = Math.max(0.08, obstacle.width * 0.12)
        const gap = obstacle.width * 0.18
        return (
          <group key={`${obstacle.normal.join(':')}:${index}`}>
            <mesh
              geometry={obstacleGeometry}
              material={obstacleMaterials[index]}
              matrixAutoUpdate={false}
              matrix={makeSurfaceMatrix(obstacle.normal, obstacle.yaw, obstacle.width, obstacle.height, obstacle.depth)}
            />
            <mesh
              geometry={obstacleGeometry}
              material={roofMaterials[index]}
              matrixAutoUpdate={false}
              matrix={makeSurfaceOffsetMatrix(obstacle.normal, obstacle.yaw, obstacle.width * 1.04, 0.055, obstacle.depth * 1.08, 0, obstacle.height, 0)}
            />
            <mesh
              geometry={windowGeometry}
              material={windowMaterial}
              matrixAutoUpdate={false}
              matrix={makeSurfaceOffsetMatrix(obstacle.normal, obstacle.yaw, windowW, Math.max(0.06, obstacle.height * 0.16), 0.014, -gap, rowY, obstacle.depth * 0.53)}
            />
            <mesh
              geometry={windowGeometry}
              material={windowMaterial}
              matrixAutoUpdate={false}
              matrix={makeSurfaceOffsetMatrix(obstacle.normal, obstacle.yaw, windowW, Math.max(0.06, obstacle.height * 0.16), 0.014, gap, rowY, obstacle.depth * 0.53)}
            />
            {obstacle.width > 0.75 && (
              <mesh
                geometry={windowGeometry}
                material={windowMaterial}
                matrixAutoUpdate={false}
                matrix={makeSurfaceOffsetMatrix(obstacle.normal, obstacle.yaw, windowW * 0.9, Math.max(0.05, obstacle.height * 0.12), 0.014, 0, rowY + obstacle.height * 0.26, obstacle.depth * 0.53)}
              />
            )}
          </group>
        )
      })}
      <group ref={playerRef}>
        <mesh geometry={bodyGeometry} material={bodyMaterial} position={[0, 0.34, 0]} scale={[1.1, 1.28, 0.95]} />
        <mesh geometry={bodyGeometry} material={bellyMaterial} position={[0, 0.36, 0.145]} scale={[0.46, 0.58, 0.16]} />
        <mesh geometry={headGeometry} material={headMaterial} position={[0, 0.66, 0]} scale={[1.04, 1.0, 0.96]} />
        <mesh geometry={eyeGeometry} material={inkMaterial} position={[-0.055, 0.705, 0.155]} />
        <mesh geometry={eyeGeometry} material={inkMaterial} position={[0.055, 0.705, 0.155]} />
        <mesh geometry={noseGeometry} material={scarfMaterial} position={[0, 0.675, 0.2]} rotation={[Math.PI / 2, 0, 0]} />
        <mesh geometry={armGeometry} material={bodyMaterial} position={[-0.22, 0.37, 0.02]} rotation={[0.15, 0, -0.42]} />
        <mesh geometry={armGeometry} material={bodyMaterial} position={[0.22, 0.37, 0.02]} rotation={[0.15, 0, 0.42]} />
        <mesh geometry={footGeometry} material={scarfMaterial} position={[-0.09, 0.11, 0.055]} scale={[1.2, 0.65, 1]} />
        <mesh geometry={footGeometry} material={scarfMaterial} position={[0.09, 0.11, 0.055]} scale={[1.2, 0.65, 1]} />
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
    <div style={{ position: 'fixed', inset: 0, background: SKY_DUSK }}>
      <div style={{ position: 'absolute', zIndex: 1, left: 24, top: 24, maxWidth: 440, color: '#f8efe2', fontFamily: 'Inter, system-ui, sans-serif', textShadow: '0 2px 14px rgba(3,2,8,0.72)' }}>
        <p style={{ margin: 0, fontSize: 12, letterSpacing: '0.24em', textTransform: 'uppercase', color: AMBER_CORE }}>World Next</p>
        <h1 style={{ margin: '6px 0 8px', fontSize: 28, lineHeight: 1.05 }}>Cozy dusk courier test</h1>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: '#e7d9f5' }}>
          Use WASD or arrow keys to walk and turn. Press Space to hop. The little courier now reads against a warm English Metro dusk planet with building-like collision blocks.
        </p>
      </div>
      <div aria-live="polite" style={{ position: 'absolute', left: -9999, width: 1, height: 1, overflow: 'hidden' }}>
        {moving ? 'The courier is walking through World Next.' : 'World Next is a walkable dusk city test scene. Use keyboard controls to explore the planet.'}
      </div>
      <TouchPad inputRef={inputRef} />
      <Canvas aria-hidden dpr={dpr} camera={{ position: [0, PLANET_RADIUS + 1.35, 2.65], fov: 46 }} frameloop="always">
        <color attach="background" args={[SKY_DUSK]} />
        <fog attach="fog" args={[SKY_DUSK, 9, 18]} />
        <SeedScene world={world} />
        <EngineLoop world={world} inputRef={inputRef} keysRef={keysRef} reducedMotion={reducedMotion} onMotion={setMoving} />
      </Canvas>
    </div>
  )
}
