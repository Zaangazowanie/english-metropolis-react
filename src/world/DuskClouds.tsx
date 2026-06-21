// DuskClouds — soft watercolor clouds drifting high over the city, the slow
// "ebb and flow" wind that makes the dusk sky feel alive, PLUS a faint field of
// twinkling early-evening stars on the sky dome above. Together they give the
// dusk sky depth: clouds glide on the breeze in the foreground while the stars
// hold fixed overhead and shimmer (a warm "the city's first stars are out").
//
// Procedural only:
//   • clouds  — one InstancedMesh of flattened, low-opacity spheres (soft blobs)
//     tinted with the warm horizon glow. 1 draw call. The cloud bank slowly
//     rotates so blobs glide past on the breeze.
//   • stars   — one Points cloud on a high dome. A tiny raw shaderMaterial gives
//     each star its own twinkle phase (organic shimmer, not a uniform pulse) and
//     soft round sprites — driven by a single uTime uniform, so the only
//     per-frame work is one scalar bump (zero allocations). 1 draw call.
// No textures, no GLBs, no external assets, no new deps. reducedMotion → the
// cloud bank holds still and uTime freezes (stars keep a fixed, varied
// brightness from their phase, so the sky still reads as starry).

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Object3D, Color, AdditiveBlending } from 'three'
import type { Group, InstancedMesh, ShaderMaterial } from 'three'
import { palette } from '../practice/shells3d/kit/palette'

const _o = new Object3D()
const _c = new Color()

const CLOUD_COUNT = 9
const DRIFT_SPEED = 0.011 // radians / second — barely-perceptible breeze
// Cloud tints: warm rose at the horizon (canon "amber bleeding into rose") + a
// dusty teal for the cooler clouds (was palette.duskHorizon violet — the last
// violet remnant of the old palette; now on the Dusk Teal & Amber bible).
const COOL_CLOUD = '#5A8A92'

// Deterministic cloud layout (radius, height, scale, tint) — no Math.random so
// it's stable across reloads.
const CLOUDS = Array.from({ length: CLOUD_COUNT }, (_, i) => {
  const angle = (i / CLOUD_COUNT) * Math.PI * 2 + (i % 3) * 0.4
  const radius = 22 + (i % 4) * 4          // 22..34
  const height = 13 + ((i * 2.3) % 7)      // 13..20
  const sx = 7 + ((i * 1.7) % 6)           // 7..13 wide
  const sz = 4 + ((i * 1.3) % 4)           // 4..8 deep
  return { angle, radius, height, sx, sy: 1.4, sz, warm: i % 2 === 0 }
})

// — Starfield —————————————————————————————————————————————————————————————————
const STAR_COUNT = 140
const STAR_R = 46                      // dome radius (well above the clouds)
const GOLDEN = Math.PI * (3 - Math.sqrt(5))

// Each star: a fixed dome position, a personal twinkle phase, and a base size.
// Built once, deterministically (golden-spiral over the upper cap → even cover).
function buildStars() {
  const pos = new Float32Array(STAR_COUNT * 3)
  const phase = new Float32Array(STAR_COUNT)
  const baseSize = new Float32Array(STAR_COUNT)
  for (let i = 0; i < STAR_COUNT; i++) {
    const t = (i + 0.5) / STAR_COUNT
    const y = 0.1 + t * 0.88                       // 0.1..0.98 — stay above horizon
    const rad = Math.sqrt(Math.max(0, 1 - y * y))
    const theta = i * GOLDEN
    pos[i * 3] = Math.cos(theta) * rad * STAR_R
    pos[i * 3 + 1] = y * STAR_R
    pos[i * 3 + 2] = Math.sin(theta) * rad * STAR_R
    phase[i] = (i * 2.39996) % (Math.PI * 2)       // scattered phases
    baseSize[i] = 1.2 + ((i * 0.37) % 1) * 1.8     // 1.2..3.0 px
  }
  return { pos, phase, baseSize }
}

const STAR_VERT = /* glsl */ `
  attribute float phase;
  attribute float baseSize;
  uniform float uTime;
  varying float vTw;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float tw = 0.45 + 0.55 * (0.5 + 0.5 * sin(uTime * 1.4 + phase));
    vTw = tw;
    gl_PointSize = max(1.0, baseSize * tw * (170.0 / -mv.z));
    gl_Position = projectionMatrix * mv;
  }
`

const STAR_FRAG = /* glsl */ `
  uniform vec3 uColor;
  varying float vTw;
  void main() {
    vec2 d = gl_PointCoord - vec2(0.5);
    float r = dot(d, d);
    if (r > 0.25) discard;                 // round sprite
    float alpha = smoothstep(0.25, 0.0, r) * vTw;
    gl_FragColor = vec4(uColor, alpha);
  }
`

// — Birds ──────────────────────────────────────────────────────────────────────
// A small flock of dusk birds drifting high over the city in a loose V — distant
// dark silhouettes whose formation + slow orbit read as "birds heading home".
const BIRD_COUNT = 7
const BIRD_COLOR = '#2A2622'
const FLOCK_RADIUS = 26
const FLOCK_Y = 14
const FLOCK_SPEED = 0.03 // radians / second (slow)
// V-formation offsets (local; +z trails behind the lead bird).
const VEE: Array<[number, number, number]> = [
  [0, 0, 0], [-0.5, 0.04, 0.45], [0.5, 0.04, 0.45],
  [-1.0, 0.08, 0.9], [1.0, 0.08, 0.9], [-1.5, 0.12, 1.35], [1.5, 0.12, 1.35],
]

export function DuskClouds({ reducedMotion = false }: { reducedMotion?: boolean }) {
  const groupRef = useRef<Group>(null!)
  const meshRef = useRef<InstancedMesh>(null!)
  const starMatRef = useRef<ShaderMaterial>(null!)
  const flockRef = useRef<Group>(null!)
  const birdRef = useRef<InstancedMesh>(null!)
  const flockA = useRef(0)

  const stars = useMemo(buildStars, [])
  const starUniforms = useMemo(
    () => ({ uTime: { value: 0 }, uColor: { value: new Color(palette.lanternCore) } }),
    [],
  )

  useEffect(() => {
    if (!meshRef.current) return
    CLOUDS.forEach((c, i) => {
      _o.position.set(Math.cos(c.angle) * c.radius, c.height, Math.sin(c.angle) * c.radius)
      _o.rotation.set(0, -c.angle, 0)
      _o.scale.set(c.sx, c.sy, c.sz)
      _o.updateMatrix()
      meshRef.current.setMatrixAt(i, _o.matrix)
      // Alternate warm rose vs cool dusty teal for depth (canon Dusk Teal & rose).
      _c.set(c.warm ? palette.skyGlow : COOL_CLOUD)
      meshRef.current.setColorAt(i, _c)
    })
    meshRef.current.instanceMatrix.needsUpdate = true
    if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true
    // Place birds in their V formation (local to the flock group).
    if (birdRef.current) {
      VEE.forEach((v, i) => {
        _o.position.set(v[0], v[1], v[2]); _o.rotation.set(0, 0, 0); _o.scale.set(1, 1, 1)
        _o.updateMatrix(); birdRef.current.setMatrixAt(i, _o.matrix)
      })
      birdRef.current.instanceMatrix.needsUpdate = true
    }
  }, [])

  useFrame((_, delta) => {
    if (reducedMotion) return
    if (groupRef.current) groupRef.current.rotation.y += delta * DRIFT_SPEED
    if (starMatRef.current) starMatRef.current.uniforms.uTime.value += delta
    // Drift the flock on a slow high orbit, facing its direction of travel.
    if (flockRef.current) {
      flockA.current += delta * FLOCK_SPEED
      const a = flockA.current
      flockRef.current.position.set(Math.cos(a) * FLOCK_RADIUS, FLOCK_Y, Math.sin(a) * FLOCK_RADIUS)
      flockRef.current.rotation.y = -a + Math.PI / 2
    }
  })

  return (
    <>
      {/* Twinkling stars — fixed overhead (outside the drifting cloud group). */}
      <points frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[stars.pos, 3]} />
          <bufferAttribute attach="attributes-phase" args={[stars.phase, 1]} />
          <bufferAttribute attach="attributes-baseSize" args={[stars.baseSize, 1]} />
        </bufferGeometry>
        <shaderMaterial
          ref={starMatRef}
          uniforms={starUniforms}
          vertexShader={STAR_VERT}
          fragmentShader={STAR_FRAG}
          transparent
          depthWrite={false}
          blending={AdditiveBlending}
        />
      </points>

      {/* Drifting watercolor cloud bank. */}
      <group ref={groupRef}>
        <instancedMesh ref={meshRef} args={[undefined, undefined, CLOUD_COUNT]} frustumCulled={false}>
          <sphereGeometry args={[1, 10, 8]} />
          <meshBasicMaterial transparent opacity={0.16} depthWrite={false} />
        </instancedMesh>
      </group>

      {/* Distant dusk birds drifting in a loose V (1 instanced draw call). */}
      <group ref={flockRef}>
        <instancedMesh ref={birdRef} args={[undefined, undefined, BIRD_COUNT]} frustumCulled={false}>
          <boxGeometry args={[0.3, 0.03, 0.1]} />
          <meshBasicMaterial color={BIRD_COLOR} />
        </instancedMesh>
      </group>
    </>
  )
}
