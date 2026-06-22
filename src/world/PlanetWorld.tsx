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

// ── World dimensions — MATCHED to abeto's measured scale ─────────────────────
// abeto (read from its live scene): planet surface radius ~26, character 1.66
// tall (≈16:1), follow-cam FOV 45 sitting ~4 above the surface ~30 from centre.
// At that ratio the local patch reads FLAT while you walk, but the whole map is
// the globe. Must match GlbCity's R.
const R = 26 // planet radius (abeto-matched)
const SURFACE_N = 1400 // golden-spiral candidates → planned downtown + organic outskirts

// ── Locomotion + camera tuning (abeto follow-cam) ────────────────────────────
const WALK_SPEED = 4.0 // surface units / sec (1.66-tall character, brisk walk)
const TURN_RATE = 2.0 // rad / sec
const CAM_BACK = 5.0 // camera distance behind the player (along −heading)
const CAM_UP = 4.0 // camera height above the player (≈2.4× char, like abeto)
const LOOK_UP = 1.5 // look at the street/skyline ahead
const CAM_LERP = 0.12 // follow-camera spring (snaps when reducedMotion)
const CAM_FOV = 45 // abeto's gameplay FOV
const PLAYER_H = 1.66 // character height (abeto-matched)

// ── Palettes — DAYTIME (abeto is bright sunny daylight, not dusk) ────────────
const LAND = '#8aa861' // sunny grass-green ground
const SKY_TOP = '#5fa8e8' // daytime sky (dome top)
const SKY_LOW = '#cfeaf6' // pale horizon
const ATMO = '#eaf6ff' // bright atmosphere rim
const CANOPY = ['#5f9a44', '#6fae4e', '#7cb85a', '#88c065', '#6aa84c']
const TRUNK = '#6b4a32'
const POST = '#4a5560'

// ── Deterministic hash (GLSL-style; stable across reloads) ───────────────────
const fract = (x: number) => x - Math.floor(x)
const hash = (i: number, s: number) => fract(Math.sin((i + 1) * 12.9898 + s * 78.233) * 43758.5453)

// ── Precompute the dense town once (module scope → constant instance counts) ──
// A PLANNED downtown — radial avenues + concentric ring roads carve dynamic,
// gently-curving streets through densely-packed SMALL buildings (5 mesh types) —
// wrapped in an organic forest/suburb ring. All deterministic (golden-spiral
// candidates + hash) so the instance counts are stable across reloads.
interface Tree { x: number; y: number; z: number; trunkH: number; rl: number; ru: number; green: number }
interface Lamp { x: number; y: number; z: number }

const TOWER_PLACE: Placement[] = []
const HOUSE_PLACE: Placement[] = []
const APT_PLACE: Placement[] = []
const MIX_PLACE: Placement[] = []
const DOME_PLACE: Placement[] = []
const TREES: Tree[] = []
const LAMPS: Lamp[] = []

// Downtown plan parameters (angular, radians on the unit sphere). The city is
// centred on the player's SPAWN (the north pole) so you start in the plaza and
// the streets + skyline open up around you — scenic, abeto-style.
// Downtown centre sits a bit AHEAD of the spawn (spawn = north pole, facing −Z),
// so the player starts among the core towers looking INTO the dense skyline + Eye.
const DT_AXIS = new Vector3(0.0, 0.95, -0.32).normalize()
const CAP_R = 1.5            // downtown angular radius (≈ the whole near hemisphere)
const PLAZA_R = 0.06         // open plaza at the core centre (Eye there, ahead of spawn)
const RINGS = [0.34, 0.62, 0.92, 1.22]
const ROAD_W = 0.055         // road half-width → ~3-unit (≈2-char-wide) walkable streets on R26
const N_RADIAL = 7           // avenues radiating outward (scenic sightlines)
const RADIAL_MIN = 0.34      // radials start beyond the core so they don't carve it hollow

;(() => {
  // Robust tangent basis (DT_AXIS ≈ +Y, so seed from +X to avoid a degenerate cross).
  const seed = Math.abs(DT_AXIS.y) > 0.9 ? new Vector3(1, 0, 0) : UP
  const right = new Vector3().crossVectors(seed, DT_AXIS).normalize()
  const fwd = new Vector3().crossVectors(DT_AXIS, right).normalize()
  const radialN: Vector3[] = []
  for (let k = 0; k < N_RADIAL; k++) {
    const a = (k * Math.PI) / N_RADIAL
    const tan = right.clone().multiplyScalar(Math.cos(a)).addScaledVector(fwd, Math.sin(a))
    radialN.push(new Vector3().crossVectors(DT_AXIS, tan).normalize())
  }
  const P = new Vector3()
  const clamp = (v: number) => Math.max(-1, Math.min(1, v))
  for (let i = 0; i < SURFACE_N; i++) {
    const sy = 1 - (i / (SURFACE_N - 1)) * 2
    const rad = Math.sqrt(Math.max(0, 1 - sy * sy))
    const th = i * GOLDEN
    const dx = Math.cos(th) * rad, dy = sy, dz = Math.sin(th) * rad
    P.set(dx, dy, dz)
    const ang = Math.acos(clamp(P.dot(DT_AXIS)))
    const ht = hash(i, 1)

    if (ang < CAP_R) {
      // ── planned downtown ──
      if (ang < PLAZA_R) continue // open plaza — the Eye is the centrepiece
      // organic wobble so streets curve rather than run mechanically straight
      const wob = 0.7 + 0.55 * (0.5 + 0.5 * Math.sin(dx * 7.0 + dz * 5.0 + dy * 3.0))
      let onRoad = false
      for (const rr of RINGS) if (Math.abs(ang - rr) < ROAD_W * wob) { onRoad = true; break }
      // radial avenues only beyond the core (so the converging spokes don't hollow the centre)
      if (!onRoad && ang > RADIAL_MIN) for (const n of radialN) if (Math.abs(Math.asin(clamp(P.dot(n)))) < ROAD_W * wob) { onRoad = true; break }
      if (onRoad) {
        if (hash(i, 7) < 0.10) LAMPS.push({ x: dx, y: dy, z: dz }) // street lamps line the roads
        continue
      }
      if (hash(i, 2) < 0.14) continue // pocket plazas / gaps within the blocks
      const yaw = Math.floor(hash(i, 5) * 8) * (Math.PI / 4) + (hash(i, 6) - 0.5) * 0.22
      const b = 0.86 + hash(i, 9) * 0.26 // per-instance brightness
      const pick = hash(i, 8)
      // flat cel colour per building type (× brightness) — varied, abeto-bright.
      const put = (arr: Placement[], scale: number, syr: number, c: [number, number, number]) =>
        arr.push({ x: dx, y: dy, z: dz, scale, yaw, sy: syr, tint: [c[0] * b, c[1] * b, c[2] * b] })
      // Moderate building footprints (player/trees are the tiny ones) so the city
      // packs densely in the small patch the close, low camera sees.
      if (ang < 0.72) {
        // core: varied + colourful (mostly cream apartments + brick mixed-use +
        // domes), with a FEW skyscrapers for skyline — not a dark glass canyon.
        if (pick < 0.30) put(APT_PLACE, 2.0 + ht * 0.8, 1.8 + ht * 1.2, [0.80, 0.74, 0.60])
        else if (pick < 0.55) put(MIX_PLACE, 2.2 + ht * 0.8, 1.5 + ht * 0.9, [0.66, 0.42, 0.34])
        else if (pick < 0.78) put(HOUSE_PLACE, 1.9 + ht * 0.8, 1.0 + ht * 0.6, [0.62, 0.36, 0.30])
        else if (pick < 0.92) put(TOWER_PLACE, 1.8 + ht * 0.9, 2.2 + ht * 3.4, [0.46, 0.56, 0.64])
        else put(DOME_PLACE, 2.8 + ht * 1.2, 1.0, [0.78, 0.80, 0.82])
      } else if (ang < 1.16) {
        // mid: apartments + brick-glass mixed-use + a few towers
        if (pick < 0.42) put(APT_PLACE, 2.0 + ht * 0.8, 1.6 + ht * 1.0, [0.82, 0.72, 0.56])
        else if (pick < 0.80) put(MIX_PLACE, 2.2 + ht * 0.8, 1.4 + ht * 0.8, [0.66, 0.42, 0.34])
        else put(TOWER_PLACE, 1.8 + ht * 0.8, 2.2 + ht * 2.2, [0.44, 0.54, 0.62])
      } else {
        // edge: brick-glass mixed-use + rustic townhouses (low-rise)
        if (pick < 0.5) put(MIX_PLACE, 2.2 + ht * 0.8, 1.2 + ht * 0.6, [0.70, 0.45, 0.36])
        else put(HOUSE_PLACE, 1.8 + ht * 0.8, 1.0 + ht * 0.6, [0.62, 0.36, 0.30])
      }
    } else {
      // ── organic outskirts: forest + scattered suburb cottages ──
      const f = fract(i * 0.61803398875)
      if (f < 0.13) {
        const b2 = 0.86 + hash(i, 9) * 0.26
        HOUSE_PLACE.push({ x: dx, y: dy, z: dz, scale: 1.7 + ht * 0.7, yaw: hash(i, 5) * Math.PI * 2, sy: 1.1 + ht * 0.7, tint: [0.60 * b2, 0.40 * b2, 0.32 * b2] })
      } else if (f < 0.19) {
        LAMPS.push({ x: dx, y: dy, z: dz })
      } else {
        const rl = 0.9 + hash(i, 3) * 0.7 // street trees (~1-2x character)
        TREES.push({ x: dx, y: dy, z: dz, trunkH: 0.6 + hash(i, 4) * 0.5, rl, ru: rl * 0.78, green: i % CANOPY.length })
      }
    }
  }
})()

const N_T = TREES.length
const N_L = LAMPS.length

// Landmarks (single GLB instances) at scenic focal points the avenues lead to.
// Spawn faces −Z, so the Eye sits just ahead at the plaza edge; the Bridge is a
// mid-distance landmark off to the side that an avenue leads toward.
const EYE_PLACE: Placement = { x: 0.12, y: 0.90, z: -0.42, scale: 7, yaw: 0, tint: [0.74, 0.78, 0.84] }      // core centre, ahead of spawn
const BRIDGE_PLACE: Placement = { x: 0.50, y: 0.66, z: -0.56, scale: 5, yaw: 0.4, tint: [0.60, 0.55, 0.62] }  // scenic mid landmark

// Orient an instance so local +Y follows the surface normal, then sit it at
// `dist` from the centre with `(sx,sy,sz)` scale → matrix in module scratch _o.
function placeOnSurface(b: { x: number; y: number; z: number }, dist: number, sx: number, sy: number, sz: number): void {
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
      placeOnSurface(t, R + t.trunkH / 2, 0.12, t.trunkH, 0.12)
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
      placeOnSurface(l, R + 0.16, 0.05, 0.32, 0.05)
      lampPosts.current.setMatrixAt(i, _o.matrix)
      placeOnSurface(l, R + 0.38, 0.11, 0.11, 0.11)
      lampGlows.current.setMatrixAt(i, _o.matrix)
    }
    lampPosts.current.instanceMatrix.needsUpdate = true
    lampGlows.current.instanceMatrix.needsUpdate = true
  }, [])

  return (
    <group>
      {/* Daytime sky dome — bright blue, drawn behind everything (abeto daylight). */}
      <mesh>
        <sphereGeometry args={[R + 30, 32, 20]} />
        <meshBasicMaterial color={SKY_TOP} side={1 /* BackSide */} depthWrite={false} fog={false} />
      </mesh>
      <mesh>
        <sphereGeometry args={[R + 2.5, 32, 24]} />
        <meshBasicMaterial color={ATMO} transparent opacity={0.12} side={1 /* BackSide */} depthWrite={false} />
      </mesh>
      <mesh receiveShadow>
        <sphereGeometry args={[R, 96, 64]} />
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
      _wpos.addScaledVector(_up, Math.abs(Math.sin(performance.now() * 0.012)) * 0.004 * speedRef.current)
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
        <WrenMesh speedRef={speedRef} reducedMotion={reducedMotion} height={PLAYER_H} />
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
      cameraPosition={[0, R + CAM_UP, CAM_BACK]}
      cameraFov={CAM_FOV}
      overlay={overlay}
    >
      {/* abeto-matched daylight: ONE strong sun (casts shadows) + a soft sky/ground
          hemisphere fill so cel faces keep colour as the player turns. */}
      <hemisphereLight args={['#eaf4ff', '#6f8a55', 0.65]} />
      <ambientLight intensity={0.35} />
      <directionalLight
        position={[R * 1.4, R * 1.9, R * 0.8]}
        intensity={2.6}
        color={'#fff6e8'}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={1}
        shadow-camera-far={R * 4}
        shadow-camera-left={-R}
        shadow-camera-right={R}
        shadow-camera-top={R}
        shadow-camera-bottom={-R}
        shadow-bias={-0.0005}
      />
      <Planet />
      <Suspense fallback={null}>
        <GlbCity
          towers={TOWER_PLACE}
          houses={HOUSE_PLACE}
          apartments={APT_PLACE}
          mixed={MIX_PLACE}
          domes={DOME_PLACE}
          eye={EYE_PLACE}
          bridge={BRIDGE_PLACE}
        />
        <PlanetNpcs />
      </Suspense>
      <PlayerRig keysRef={keysRef} joyRef={joyRef} reducedMotion={reducedMotion} />
      <InkOutline />
    </CityStage>
  )
}
