// PlanetWorld — the English Metro "tiny planet": a walkable dusk-London globe.
//
// Directive B: re-architect the world onto a spherical, walk-around-a-globe
// template (the dusk-London town wrapped over a small planet) while keeping the
// flat plaza (EnglishMetroWorld) as the live A option. This is the SECOND B
// piece: the walk-on-sphere player controller, on top of the dimensional
// template + procedural town landed earlier. Still a parallel, non-breaking
// 'world-planet' entry — it never imports or mutates the live plaza.
//
// Everything is OUR original procedural art — no GLBs, no textures, no deps:
//   • dusk-teal toon globe + amber rim-glow atmosphere
//   • our dusk-London facades, plane-tree canopies, amber lamps placed on the
//     surface via normal-aligned instancing (golden-spiral + setFromUnitVectors)
//   • Wren (our courier) walks the surface, oriented to the local "up"
//
// Sphere-walking is hand-rolled (no physics dep): the player's position and
// heading are unit vectors on the sphere; walking rotates them along the great
// circle (setFromAxisAngle about pos×fwd); turning rotates the heading about the
// local up. The follow-camera sets camera.up to the surface normal each frame —
// without that it rolls wildly as you round the globe — and starts the player at
// the north pole so the opening frame is upright. Tank-style controls (forward
// walks along facing, left/right turns) are the robust choice for a sphere.
//
// Perf: ~8 static draw calls (globe + atmosphere + 6 InstancedMeshes) + Wren;
// no per-frame allocations (module-scope scratch); slow nothing — the player is
// the only motion. reducedMotion → camera snaps, no walk-bob. Learner-facing
// English lives in the DOM overlay (rule 9); canvas stays aria-hidden.

import { Suspense, useCallback, useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Object3D, Quaternion, Vector3, Color, Matrix4, MathUtils } from 'three'
import type { Group, InstancedMesh } from 'three'
import type { Game3DProps, SessionResult } from '../practice/shells3d/types'
import { CityStage } from '../practice/shells3d/kit/CityStage'
import { palette } from '../practice/shells3d/kit/palette'
import { WrenMesh } from './WrenMesh'
import { InkOutline } from './InkOutline'
import { GlbCity, PlanetNpcs } from './GlbCity'
import type { Placement } from './GlbCity'
import { useWorldInput, readKeys } from './useWorldInput'
import type { JoyVec } from './useWorldInput'

// ── Module-scope scratch (no per-frame allocation) ───────────────────────────
const _o = new Object3D()
const _q = new Quaternion()
const _dir = new Vector3()
const _c = new Color()
const UP = new Vector3(0, 1, 0)
const GOLDEN = Math.PI * (3 - Math.sqrt(5))
// rig-only scratch (used in useFrame; never concurrent with the mount-effect set)
const _axis = new Vector3()
const _up = new Vector3()
const _right = new Vector3()
const _wpos = new Vector3()
const _cam = new Vector3()
const _look = new Vector3()
const _qa = new Quaternion()
const _m = new Matrix4()

// ── World dimensions ─────────────────────────────────────────────────────────
const R = 6 // planet radius (surface = where the town + player's feet sit)
// Candidate surface points (golden-spiral). abeto's planet is fully built-up — a
// dense city cluster wrapped in thick forest, NO bare ground. We match that
// density with OUR meshes: a high point count, ~no empty band, forest-dominant
// fill so the globe reads like a packed little world instead of a sparse scatter.
const SURFACE_N = 820

// ── Locomotion + camera tuning ───────────────────────────────────────────────
const WALK_SPEED = 2.6 // surface units / sec
const TURN_RATE = 2.2 // rad / sec
const CAM_BACK = 4.6 // camera distance behind the player (along −heading)
const CAM_UP = 2.6 // camera height above the player (along surface normal)
const LOOK_UP = 0.7 // look slightly above the player's feet
const CAM_LERP = 0.1 // follow-camera spring (snaps when reducedMotion)

// ── Palettes (ours — match the reskinned plaza so it reads as the same town) ──
const LAND = '#2B5F6E' // canon Dusk Teal land/ocean
const ATMO = palette.lanternAmber // warm rim-glow + lit windows + lamp beads
const CANOPY = ['#2E4A3A', '#3E5E3A', '#46583C', '#54603A', '#5E6E3A']
const TRUNK = '#3A2C22'
const POST = '#23303a'

// ── Deterministic hash (GLSL-style; stable across reloads) ───────────────────
const fract = (x: number) => x - Math.floor(x)
const hash = (i: number, s: number) => fract(Math.sin((i + 1) * 12.9898 + s * 78.233) * 43758.5453)

// ── Precompute the town layout once (module scope → constant instance counts) ─
// Buildings are real little houses now: a chunky box body (separate width/depth)
// + a clay pitched roof, kept short so they read as a packed village, not the
// thin slabs of the first pass.
interface Building { x: number; y: number; z: number; h: number }
interface Tree { x: number; y: number; z: number; trunkH: number; rl: number; ru: number; green: number }
interface Lamp { x: number; y: number; z: number }

const BUILDINGS: Building[] = []
const TREES: Tree[] = []
const LAMPS: Lamp[] = []

for (let i = 0; i < SURFACE_N; i++) {
  const sy = 1 - (i / (SURFACE_N - 1)) * 2
  const rad = Math.sqrt(Math.max(0, 1 - sy * sy))
  const theta = i * GOLDEN
  const dx = Math.cos(theta) * rad
  const dy = sy
  const dz = Math.sin(theta) * rad
  const f = fract(i * 0.61803398875)
  // Cluster buildings toward a "downtown" cap (near the +Z/+Y opening view) and
  // let forest dominate everywhere else — like abeto's city-in-a-forest. `built`
  // is the local probability of a building, highest near the cluster centre.
  const toCentre = dx * 0.30 + dy * 0.42 + dz * 0.86 // dot with downtown axis
  const built = 0.20 + 0.34 * Math.max(0, toCentre) // 0.20 far side → ~0.54 downtown
  if (f < built) {
    // a built point — height drives the mesh scale in GlbCity (tower vs house)
    BUILDINGS.push({ x: dx, y: dy, z: dz, h: 0.34 + hash(i, 1) * 0.5 })
  } else if (f < built + 0.06) {
    LAMPS.push({ x: dx, y: dy, z: dz })
  } else {
    // everything else is forest — big overlapping canopies so the globe reads as
    // continuous woodland (abeto-dense), never bare teal between trees.
    const rl = 0.30 + hash(i, 3) * 0.20
    TREES.push({ x: dx, y: dy, z: dz, trunkH: 0.22 + hash(i, 4) * 0.14, rl, ru: rl * 0.78, green: i % CANOPY.length })
  }
}

const N_T = TREES.length
const N_L = LAMPS.length

// Real building MESHES (GlbCity) replace the procedural box houses. Split the
// built points into 2050 skyscrapers vs rustic townhouses (deterministic by
// position), scaled to a world height; plus one London Eye landmark.
const TOWER_PLACE: Placement[] = []
const HOUSE_PLACE: Placement[] = []
for (const b of BUILDINGS) {
  const isTower = fract(Math.abs(b.x) * 12.9898 + Math.abs(b.z) * 78.233) > 0.58
  if (isTower) TOWER_PLACE.push({ x: b.x, y: b.y, z: b.z, scale: 1.3 + (b.h - 0.34) * 2.6 })
  else HOUSE_PLACE.push({ x: b.x, y: b.y, z: b.z, scale: 0.72 + (b.h - 0.34) * 0.5 })
}
// London Eye landmark — on the near (+Z) hemisphere so it's in the opening view.
const EYE_PLACE: Placement = { x: 0.32, y: 0.42, z: 0.85, scale: 2.9, yaw: 1.2 }
// Tower Bridge landmark — near hemisphere, opposite the Eye, low on the horizon
// so its wide span reads against the globe curve. (Single GLB instance.)
const BRIDGE_PLACE: Placement = { x: -0.46, y: 0.06, z: 0.88, scale: 2.0, yaw: 0.5 }

// Orient an instance so local +Y follows the surface normal, then sit it at
// `dist` from the centre with `(sx,sy,sz)` scale → matrix in module scratch _o.
function placeOnSurface(b: Building | Tree | Lamp, dist: number, sx: number, sy: number, sz: number): void {
  _dir.set(b.x, b.y, b.z).normalize()
  _o.position.copy(_dir).multiplyScalar(dist)
  _q.setFromUnitVectors(UP, _dir)
  _o.quaternion.copy(_q)
  _o.scale.set(sx, sy, sz)
  _o.updateMatrix()
}

// ── The planet + its instanced town (fully static — the player is the motion) ─
function Planet() {
  const trunks = useRef<InstancedMesh>(null!)
  const canopyLo = useRef<InstancedMesh>(null!)
  const canopyHi = useRef<InstancedMesh>(null!)
  const lampPosts = useRef<InstancedMesh>(null!)
  const lampGlows = useRef<InstancedMesh>(null!)

  useEffect(() => {
    // Buildings are now REAL meshes (see <GlbCity/>). Trees + lamps stay procedural.
    for (let i = 0; i < N_T; i++) {
      const t = TREES[i]
      placeOnSurface(t, R + t.trunkH / 2, 0.06, t.trunkH, 0.06)
      trunks.current.setMatrixAt(i, _o.matrix)
      placeOnSurface(t, R + t.trunkH + t.rl * 0.6, t.rl, t.rl, t.rl)
      canopyLo.current.setMatrixAt(i, _o.matrix)
      _c.set(CANOPY[t.green])
      canopyLo.current.setColorAt(i, _c)
      placeOnSurface(t, R + t.trunkH + t.rl * 1.35, t.ru, t.ru, t.ru)
      canopyHi.current.setMatrixAt(i, _o.matrix)
      _c.set(CANOPY[(t.green + 2) % CANOPY.length])
      canopyHi.current.setColorAt(i, _c)
    }
    trunks.current.instanceMatrix.needsUpdate = true
    canopyLo.current.instanceMatrix.needsUpdate = true
    canopyHi.current.instanceMatrix.needsUpdate = true
    if (canopyLo.current.instanceColor) canopyLo.current.instanceColor.needsUpdate = true
    if (canopyHi.current.instanceColor) canopyHi.current.instanceColor.needsUpdate = true

    for (let i = 0; i < N_L; i++) {
      const l = LAMPS[i]
      placeOnSurface(l, R + 0.09, 0.025, 0.18, 0.025)
      lampPosts.current.setMatrixAt(i, _o.matrix)
      placeOnSurface(l, R + 0.2, 0.06, 0.06, 0.06)
      lampGlows.current.setMatrixAt(i, _o.matrix)
    }
    lampPosts.current.instanceMatrix.needsUpdate = true
    lampGlows.current.instanceMatrix.needsUpdate = true
  }, [])

  return (
    <group>
      <mesh>
        <sphereGeometry args={[R + 0.7, 32, 24]} />
        <meshBasicMaterial color={ATMO} transparent opacity={0.07} side={1 /* BackSide */} depthWrite={false} />
      </mesh>
      <mesh>
        <sphereGeometry args={[R, 64, 48]} />
        <meshToonMaterial color={LAND} />
      </mesh>
      <instancedMesh ref={trunks} args={[undefined, undefined, N_T]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshToonMaterial color={TRUNK} />
      </instancedMesh>
      <instancedMesh ref={canopyLo} args={[undefined, undefined, N_T]} frustumCulled={false}>
        <icosahedronGeometry args={[1, 0]} />
        <meshToonMaterial />
      </instancedMesh>
      <instancedMesh ref={canopyHi} args={[undefined, undefined, N_T]} frustumCulled={false}>
        <icosahedronGeometry args={[1, 0]} />
        <meshToonMaterial />
      </instancedMesh>
      <instancedMesh ref={lampPosts} args={[undefined, undefined, N_L]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshToonMaterial color={POST} />
      </instancedMesh>
      <instancedMesh ref={lampGlows} args={[undefined, undefined, N_L]} frustumCulled={false}>
        <sphereGeometry args={[1, 8, 6]} />
        <meshBasicMaterial color={ATMO} />
      </instancedMesh>
    </group>
  )
}

// ── PlayerRig — walk-on-sphere controller + normal-up follow camera ──────────
interface PlayerRigProps {
  keysRef: React.MutableRefObject<Set<string>>
  joyRef: React.MutableRefObject<JoyVec | null>
  reducedMotion: boolean
}
function PlayerRig({ keysRef, joyRef, reducedMotion }: PlayerRigProps) {
  const { camera } = useThree()
  const groupRef = useRef<Group>(null!)
  const posRef = useRef(new Vector3(0, 1, 0)) // start on the north pole (upright frame)
  const fwdRef = useRef(new Vector3(0, 0, -1)) // facing −Z, a clean tangent at the pole
  const speedRef = useRef(0)
  const first = useRef(true)

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05)
    const g = groupRef.current
    if (!g) return
    const pos = posRef.current
    const fwd = fwdRef.current

    // 1. Input — joystick wins over keyboard. x = turn, y = walk (forward +).
    const joy = joyRef.current
    let ix = joy ? joy.x : 0
    let iy = joy ? joy.y : 0
    if (!joy) { const k = readKeys(keysRef.current); ix = k.x; iy = k.y }

    // 2. Turn the heading about the local up (= pos).
    if (Math.abs(ix) > 0.04) {
      _qa.setFromAxisAngle(pos, -ix * TURN_RATE * dt)
      fwd.applyQuaternion(_qa)
    }

    // 3. Walk along the great circle toward the heading (axis = pos × fwd).
    const moving = Math.abs(iy) > 0.04
    if (moving) {
      _axis.copy(pos).cross(fwd).normalize()
      _qa.setFromAxisAngle(_axis, (WALK_SPEED * dt * iy) / R)
      pos.applyQuaternion(_qa)
      fwd.applyQuaternion(_qa)
    }
    // Re-orthonormalise to fight numeric drift (keep pos unit, fwd tangent).
    pos.normalize()
    fwd.addScaledVector(pos, -pos.dot(fwd)).normalize()

    // 4. Wren's walk animation speed.
    speedRef.current = MathUtils.lerp(speedRef.current, moving ? Math.min(1, Math.abs(iy)) : 0, 0.25)

    // 5. Place + orient the player: local +Y → up (normal), +Z → heading.
    _up.copy(pos)
    _wpos.copy(pos).multiplyScalar(R)
    if (!reducedMotion && speedRef.current > 0.01) {
      _wpos.addScaledVector(_up, Math.abs(Math.sin(performance.now() * 0.012)) * 0.05 * speedRef.current)
    }
    g.position.copy(_wpos)
    _right.copy(_up).cross(fwd).normalize()
    _m.makeBasis(_right, _up, fwd)
    g.quaternion.setFromRotationMatrix(_m)

    // 6. Follow camera — behind the heading, above the surface, up = the normal.
    _cam.copy(_wpos).addScaledVector(_up, CAM_UP).addScaledVector(fwd, -CAM_BACK)
    if (first.current || reducedMotion) { camera.position.copy(_cam); first.current = false }
    else camera.position.lerp(_cam, CAM_LERP)
    camera.up.copy(_up)
    _look.copy(_wpos).addScaledVector(_up, LOOK_UP)
    camera.lookAt(_look)
  })

  return (
    <group ref={groupRef}>
      <Suspense fallback={null}>
        <WrenMesh speedRef={speedRef} reducedMotion={reducedMotion} height={1.55} />
      </Suspense>
    </group>
  )
}

// ── Touch joystick (DOM overlay; writes into joyRef) ─────────────────────────
// A thumb pad in the bottom-left — pointer events cover touch + mouse-drag.
// aria-hidden: keyboard (WASD/arrows) is the accessible movement path.
const JOY_R = 56
function TouchJoystick({ joyRef }: { joyRef: React.MutableRefObject<JoyVec | null> }) {
  const padRef = useRef<HTMLDivElement>(null)
  const knobRef = useRef<HTMLDivElement>(null)
  const originRef = useRef<{ x: number; y: number } | null>(null)

  const setKnob = (dx: number, dy: number) => {
    if (knobRef.current) knobRef.current.style.transform = `translate(${dx}px, ${dy}px)`
  }
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const o = originRef.current
    if (!o) return
    let dx = e.clientX - o.x
    let dy = e.clientY - o.y
    const dist = Math.hypot(dx, dy)
    if (dist > JOY_R) { dx = (dx / dist) * JOY_R; dy = (dy / dist) * JOY_R }
    setKnob(dx, dy)
    joyRef.current = { x: dx / JOY_R, y: -dy / JOY_R } // screen-down → backward
  }
  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = padRef.current?.getBoundingClientRect()
    if (!rect) return
    originRef.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    onMove(e)
  }
  const onUp = () => { originRef.current = null; joyRef.current = null; setKnob(0, 0) }

  return (
    <div
      ref={padRef}
      aria-hidden="true"
      onPointerDown={onDown}
      onPointerMove={(e) => originRef.current && onMove(e)}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      style={{
        position: 'absolute', left: 26, bottom: 26,
        width: JOY_R * 2, height: JOY_R * 2, borderRadius: '50%',
        background: 'rgba(10,4,24,0.42)', border: '1px solid rgba(245,240,250,0.18)',
        touchAction: 'none', pointerEvents: 'auto',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div ref={knobRef} style={{
        width: 46, height: 46, borderRadius: '50%',
        background: `radial-gradient(circle at 40% 35%, ${palette.lanternCore}, ${palette.lanternAmber})`,
        boxShadow: `0 0 18px ${palette.lanternAmber}aa`,
        pointerEvents: 'none', willChange: 'transform',
      }} />
    </div>
  )
}

// ── Game3DProps shell — anonymous-playable; built-in world needs no puzzle ───
export default function PlanetWorld({
  onSessionComplete,
  quality,
  reducedMotion = false,
  fullscreen = false,
}: Game3DProps) {
  const startMs = useRef(Date.now())
  const { keysRef, joyRef } = useWorldInput(true)

  const handleDone = useCallback(() => {
    const result: SessionResult = {
      correctCount: 0,
      totalQuestions: 0,
      durationMs: Date.now() - startMs.current,
      shellKey: 'world-planet',
    }
    onSessionComplete?.(result)
  }, [onSessionComplete])

  const overlay = (
    <div
      style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        padding: 'clamp(16px, 4vw, 32px)', boxSizing: 'border-box',
        fontFamily: '"Segoe UI", system-ui, sans-serif', color: '#f6efe2',
      }}
    >
      <div style={{ maxWidth: 540, textShadow: '0 2px 12px rgba(8,4,20,0.7)' }}>
        <div style={{ fontSize: 'clamp(20px, 3.4vw, 30px)', fontWeight: 700, letterSpacing: '0.01em' }}>
          English Metro — the Tiny Planet
        </div>
        <p style={{ margin: '8px 0 0', fontSize: 'clamp(13px, 1.7vw, 15px)', lineHeight: 1.55, opacity: 0.9 }}>
          Walk the little world. <strong>Arrow keys</strong> or <strong>W A S D</strong> — or drag the pad — to
          roam: forward walks, left and right turn. The town curves away over the horizon.
        </p>
      </div>
      {onSessionComplete && (
        <div style={{ alignSelf: 'flex-end', pointerEvents: 'auto' }}>
          <button
            type="button"
            onClick={handleDone}
            style={{
              border: '1px solid rgba(246,239,226,0.35)', background: 'rgba(10,4,24,0.45)',
              color: '#f6efe2', borderRadius: 999, padding: '10px 22px',
              fontSize: 15, fontWeight: 600, cursor: 'pointer', backdropFilter: 'blur(4px)',
            }}
          >
            Done exploring
          </button>
        </div>
      )}
      <TouchJoystick joyRef={joyRef} />
    </div>
  )

  return (
    <CityStage
      quality={quality}
      reducedMotion={reducedMotion}
      fullscreen={fullscreen}
      cameraPosition={[0, 6 + CAM_UP, CAM_BACK]}
      cameraFov={42}
      overlay={overlay}
    >
      <Planet />
      <Suspense fallback={null}>
        <GlbCity towers={TOWER_PLACE} houses={HOUSE_PLACE} eye={EYE_PLACE} bridge={BRIDGE_PLACE} />
        <PlanetNpcs />
      </Suspense>
      <PlayerRig keysRef={keysRef} joyRef={joyRef} reducedMotion={reducedMotion} />
      <InkOutline />
    </CityStage>
  )
}
