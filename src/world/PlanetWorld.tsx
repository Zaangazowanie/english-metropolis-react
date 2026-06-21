// PlanetWorld — the English Metro "tiny planet" dimensional template (preview).
//
// Directive B: re-architect the world onto a spherical, walk-around-a-globe
// template (the dusk-London town wrapped over a small planet) while keeping the
// flat plaza (EnglishMetroWorld) as the live A option. This is the FOUNDATION:
// a self-contained, non-breaking preview registered as its own 'world-planet'
// entry. It never touches the live plaza — the site keeps working while the
// planet template matures. The walk-on-sphere player controller is a later,
// scoped PR; this lands the dimensional template + our procedural town on it.
//
// Everything is OUR original procedural art — no GLBs, no textures, no deps:
//   • dusk-teal toon globe + an amber rim-glow atmosphere shell
//   • our dusk-London facades, plane-tree canopies and amber lamps placed on the
//     surface via normal-aligned instancing (golden-spiral scatter, each object
//     rotated so "up" follows the surface normal — the abeto planet template,
//     rebuilt from scratch)
//   • a slow planet spin under a fixed, well-framed dusk camera
//
// Perf: 8 draw calls total (globe + atmosphere + 6 InstancedMeshes), no
// per-frame allocations (module-scope scratch, matrices written once), DPR
// clamped by CityStage, reducedMotion → planet holds still. Learner-facing
// English lives in the DOM overlay (contract rule 9); the canvas is aria-hidden.

import { useCallback, useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Object3D, Quaternion, Vector3, Color } from 'three'
import type { Group, InstancedMesh } from 'three'
import type { Game3DProps, SessionResult } from '../practice/shells3d/types'
import { CityStage } from '../practice/shells3d/kit/CityStage'
import { palette } from '../practice/shells3d/kit/palette'

// ── Module-scope scratch (no per-frame allocation) ───────────────────────────
const _o = new Object3D()
const _q = new Quaternion()
const _dir = new Vector3()
const _c = new Color()
const UP = new Vector3(0, 1, 0)
const GOLDEN = Math.PI * (3 - Math.sqrt(5))

// ── World dimensions ─────────────────────────────────────────────────────────
const R = 6 // planet radius
const SURFACE_N = 160 // candidate surface points (golden-spiral)

// ── Palettes (ours — match the reskinned plaza so it reads as the same town) ──
const LAND = '#2B5F6E' // canon Dusk Teal land/ocean
const ATMO = palette.lanternAmber // warm rim-glow
// Warm dusk-London facades (same set as TitlePlanet's city studs).
const FACADES = ['#D9CDB4', '#CDBA98', '#BFA079', '#D2C0A0', '#8E9BA0', '#C8AE90']
// Layered dusk-greens (same grove palette as the Trees PR).
const CANOPY = ['#2E4A3A', '#3E5E3A', '#46583C', '#54603A', '#5E6E3A']
const TRUNK = '#3A2C22' // dark bark
const POST = '#23303a' // dark lamp post

// ── Deterministic hash (GLSL-style; stable across reloads) ───────────────────
const fract = (x: number) => x - Math.floor(x)
const hash = (i: number, s: number) => fract(Math.sin((i + 1) * 12.9898 + s * 78.233) * 43758.5453)

// ── Precompute the town layout once (module scope → constant instance counts) ─
interface Building { x: number; y: number; z: number; h: number; w: number; tan: number; amber: boolean }
interface Tree { x: number; y: number; z: number; trunkH: number; rl: number; ru: number; green: number }
interface Lamp { x: number; y: number; z: number }

const BUILDINGS: Building[] = []
const TREES: Tree[] = []
const LAMPS: Lamp[] = []

for (let i = 0; i < SURFACE_N; i++) {
  // Golden-spiral point on the unit sphere → outward direction.
  const sy = 1 - (i / (SURFACE_N - 1)) * 2
  const rad = Math.sqrt(Math.max(0, 1 - sy * sy))
  const theta = i * GOLDEN
  const dx = Math.cos(theta) * rad
  const dy = sy
  const dz = Math.sin(theta) * rad
  // Low-discrepancy kind selection → spread towns, groves and lamps evenly.
  const f = fract(i * 0.61803398875)
  if (f < 0.4) {
    const h = 0.3 + hash(i, 1) * 0.85
    BUILDINGS.push({ x: dx, y: dy, z: dz, h, w: 0.2 + hash(i, 2) * 0.12, tan: i % FACADES.length, amber: i % 5 === 0 })
  } else if (f < 0.7) {
    const rl = 0.16 + hash(i, 3) * 0.06
    TREES.push({ x: dx, y: dy, z: dz, trunkH: 0.2 + hash(i, 4) * 0.1, rl, ru: rl * 0.72, green: i % CANOPY.length })
  } else if (f < 0.82) {
    LAMPS.push({ x: dx, y: dy, z: dz })
  }
  // else: open land / plaza — left bare so the globe breathes.
}

const N_B = BUILDINGS.length
const N_T = TREES.length
const N_L = LAMPS.length

// Helper: orient an instance so local +Y points along the surface normal, then
// sit it at `dist` from the planet centre with `(sx,sy,sz)` scale.
function placeOnSurface(b: Building | Tree | Lamp, dist: number, sx: number, sy: number, sz: number): void {
  _dir.set(b.x, b.y, b.z).normalize()
  _o.position.copy(_dir).multiplyScalar(dist)
  _q.setFromUnitVectors(UP, _dir)
  _o.quaternion.copy(_q)
  _o.scale.set(sx, sy, sz)
  _o.updateMatrix()
}

// ── The spinning planet + its instanced town ─────────────────────────────────
function Planet({ reducedMotion }: { reducedMotion: boolean }) {
  const spin = useRef<Group>(null!)
  const buildings = useRef<InstancedMesh>(null!)
  const trunks = useRef<InstancedMesh>(null!)
  const canopyLo = useRef<InstancedMesh>(null!)
  const canopyHi = useRef<InstancedMesh>(null!)
  const lampPosts = useRef<InstancedMesh>(null!)
  const lampGlows = useRef<InstancedMesh>(null!)

  useEffect(() => {
    // Buildings — facade box, base on the surface, varied warm tans + lit windows.
    for (let i = 0; i < N_B; i++) {
      const b = BUILDINGS[i]
      placeOnSurface(b, R + b.h / 2, b.w, b.h, b.w)
      buildings.current.setMatrixAt(i, _o.matrix)
      _c.set(b.amber ? ATMO : FACADES[b.tan])
      buildings.current.setColorAt(i, _c)
    }
    buildings.current.instanceMatrix.needsUpdate = true
    if (buildings.current.instanceColor) buildings.current.instanceColor.needsUpdate = true

    // Trees — dark trunk + two stacked dusk-green canopy blobs.
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

    // Lamps — slim dark post + a glowing amber bead on top (the cozy signature).
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

  useFrame((_, delta) => {
    if (spin.current && !reducedMotion) spin.current.rotation.y += delta * 0.06
  })

  return (
    <group>
      {/* amber rim-glow atmosphere */}
      <mesh>
        <sphereGeometry args={[R + 0.7, 32, 24]} />
        <meshBasicMaterial color={ATMO} transparent opacity={0.07} side={1 /* BackSide */} depthWrite={false} />
      </mesh>
      {/* the spinning world */}
      <group ref={spin}>
        <mesh>
          <sphereGeometry args={[R, 64, 48]} />
          <meshToonMaterial color={LAND} />
        </mesh>
        {/* buildings */}
        <instancedMesh ref={buildings} args={[undefined, undefined, N_B]} frustumCulled={false}>
          <boxGeometry args={[1, 1, 1]} />
          <meshToonMaterial />
        </instancedMesh>
        {/* tree trunks */}
        <instancedMesh ref={trunks} args={[undefined, undefined, N_T]} frustumCulled={false}>
          <boxGeometry args={[1, 1, 1]} />
          <meshToonMaterial color={TRUNK} />
        </instancedMesh>
        {/* tree canopy — lower (wider) */}
        <instancedMesh ref={canopyLo} args={[undefined, undefined, N_T]} frustumCulled={false}>
          <icosahedronGeometry args={[1, 0]} />
          <meshToonMaterial />
        </instancedMesh>
        {/* tree canopy — upper (smaller crown) */}
        <instancedMesh ref={canopyHi} args={[undefined, undefined, N_T]} frustumCulled={false}>
          <icosahedronGeometry args={[1, 0]} />
          <meshToonMaterial />
        </instancedMesh>
        {/* lamp posts */}
        <instancedMesh ref={lampPosts} args={[undefined, undefined, N_L]} frustumCulled={false}>
          <boxGeometry args={[1, 1, 1]} />
          <meshToonMaterial color={POST} />
        </instancedMesh>
        {/* lamp glows */}
        <instancedMesh ref={lampGlows} args={[undefined, undefined, N_L]} frustumCulled={false}>
          <sphereGeometry args={[1, 8, 6]} />
          <meshBasicMaterial color={ATMO} />
        </instancedMesh>
      </group>
    </group>
  )
}

// ── Fixed dusk camera — keeps the globe framed; planet spin reveals all sides ─
function CameraRig() {
  const { camera } = useThree()
  useFrame(() => {
    camera.lookAt(0, 0, 0)
  })
  return null
}

// ── Game3DProps shell — anonymous-playable; built-in world needs no puzzle ───
export default function PlanetWorld({
  onSessionComplete,
  quality,
  reducedMotion = false,
  fullscreen = false,
}: Game3DProps) {
  const startMs = useRef(Date.now())

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
      <div style={{ maxWidth: 520, textShadow: '0 2px 12px rgba(8,4,20,0.7)' }}>
        <div style={{ fontSize: 'clamp(20px, 3.4vw, 30px)', fontWeight: 700, letterSpacing: '0.01em' }}>
          English Metro — the Tiny Planet
        </div>
        <p style={{ margin: '8px 0 0', fontSize: 'clamp(13px, 1.7vw, 15px)', lineHeight: 1.55, opacity: 0.9 }}>
          A preview of our dusk-London town wrapped over a little world — the new
          dimensional template. Every building, tree and lamp is placed on the
          curved surface. Walking it comes next.
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
    </div>
  )

  return (
    <CityStage
      quality={quality}
      reducedMotion={reducedMotion}
      fullscreen={fullscreen}
      cameraPosition={[0, 4.5, 15]}
      cameraFov={42}
      overlay={overlay}
    >
      <CameraRig />
      <Planet reducedMotion={reducedMotion} />
    </CityStage>
  )
}
