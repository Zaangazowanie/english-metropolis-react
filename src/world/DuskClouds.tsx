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

export function DuskClouds({ reducedMotion = false }: { reducedMotion?: boolean }) {
  const groupRef = useRef<Group>(null!)
  const meshRef = useRef<InstancedMesh>(null!)
  const starMatRef = useRef<ShaderMaterial>(null!)

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
      // Alternate warm rose vs cooler violet for depth.
      _c.set(c.warm ? palette.skyGlow : palette.duskHorizon)
      meshRef.current.setColorAt(i, _c)
    })
    meshRef.current.instanceMatrix.needsUpdate = true
    if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true
  }, [])

  useFrame((_, delta) => {
    if (reducedMotion) return
    if (groupRef.current) groupRef.current.rotation.y += delta * DRIFT_SPEED
    if (starMatRef.current) starMatRef.current.uniforms.uTime.value += delta
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
    </>
  )
}
