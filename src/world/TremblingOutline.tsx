// TremblingOutline — the signature graphite-ink outline shader for English Metro.
//
// Technique: inverted-hull (renders the mesh a second time with BackSide,
// slightly expanded along vertex normals). The "trembling" effect comes from
// adding a per-vertex time-varying jitter to the expansion, so different parts
// of the outline oscillate at different phases — giving the hand-drawn graphite
// pencil feel seen in the concept frames.
//
// CONTRACT: no new deps. Uses THREE.ShaderMaterial (already in vendor-three).
// Zero per-frame allocations — uTime is updated by writing to the uniform ref,
// not by creating new objects. reducedMotion → jitter amplitude → 0 (static
// outline). The component still renders the outline; it just stops trembling.

import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Color, ShaderMaterial } from 'three'
import type { ReactNode } from 'react'
import { palette } from '../practice/shells3d/kit/palette'

// ── GLSL ─────────────────────────────────────────────────────────────────────
// THREE.ShaderMaterial prepends attribute/uniform declarations automatically:
//   attribute vec3 position; attribute vec3 normal;
//   uniform mat4 projectionMatrix; uniform mat4 modelViewMatrix;
const VERT = /* glsl */`
uniform float uTime;
uniform float uThickness;
uniform float uJitter;

void main() {
  // Per-vertex phase: vertices at different world positions oscillate
  // independently, breaking the mechanical look.
  float phase = position.x * 7.31 + position.y * 5.17 + position.z * 3.73;
  float jitter = sin(uTime * 13.5 + phase) * uJitter
                + sin(uTime * 7.1  + phase * 1.7) * uJitter * 0.4;
  vec3 displaced = position + normal * (uThickness + jitter);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
}
`

const FRAG = /* glsl */`
uniform vec3 uColor;
void main() {
  gl_FragColor = vec4(uColor, 1.0);
}
`

// ── TremblingOutlineMesh ──────────────────────────────────────────────────────
// Drop-in wrapper: pass geometry as children, position/scale/rotation as usual.
// Renders ONLY the outline pass (BackSide). Pair with a normal toon-shaded mesh
// that renders the FrontSide geometry. Draw call count: 1 per TremblingOutlineMesh.
//
// Thickness units: world-space units added to the normal expansion. ~0.03–0.06
// looks natural at the scale of Wren (~1.8 units tall). Reduce for small props.
//
// Example:
//   {/* Toon FrontSide — the filled look */}
//   <mesh position={p}><cylinderGeometry .../><meshToonMaterial .../></mesh>
//   {/* Outline BackSide — trembling graphite ink */}
//   <TremblingOutlineMesh position={p} thickness={0.04} jitter={0.006}>
//     <cylinderGeometry ... />
//   </TremblingOutlineMesh>
export interface TremblingOutlineMeshProps {
  children: ReactNode          // geometry JSX (e.g. <cylinderGeometry .../>)
  position?: [number, number, number]
  rotation?: [number, number, number]
  scale?: [number, number, number] | number
  thickness?: number           // normal-expansion base (default 0.04)
  jitter?: number              // max trembling amplitude (default 0.007)
  reducedMotion?: boolean      // true → zero jitter (static outline)
}

export function TremblingOutlineMesh({
  children,
  position,
  rotation,
  scale,
  thickness = 0.04,
  jitter = 0.007,
  reducedMotion = false,
}: TremblingOutlineMeshProps) {
  const matRef = useRef<ShaderMaterial>(null!)
  // Stable uniform object — never recreated (avoids per-render alloc).
  const uniforms = useMemo(() => ({
    uTime:      { value: 0 },
    uThickness: { value: thickness },
    uJitter:    { value: reducedMotion ? 0 : jitter },
    uColor:     { value: new Color(palette.night) },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), []) // intentionally empty — we update values imperatively below

  useFrame(({ clock }) => {
    const mat = matRef.current
    if (!mat) return
    mat.uniforms.uTime.value      = clock.elapsedTime
    mat.uniforms.uJitter.value    = reducedMotion ? 0 : jitter
    mat.uniforms.uThickness.value = thickness
  })

  return (
    <mesh position={position} rotation={rotation} scale={scale}>
      {children}
      <shaderMaterial
        ref={matRef}
        side={1 /* THREE.BackSide */}
        vertexShader={VERT}
        fragmentShader={FRAG}
        uniforms={uniforms}
        depthWrite={false}
      />
    </mesh>
  )
}

// ── Convenience: outline-pair helper ─────────────────────────────────────────
// Returns TWO JSX elements: the toon-shaded front mesh + the trembling outline.
// The geometry is duplicated JSX (accepted cost: both meshes share the same
// GPU geometry buffer since R3F deduplicates). Import the fragment if you want
// to inline both elements in a group.
export interface OutlinedMeshProps extends TremblingOutlineMeshProps {
  toonColor: string
  castShadow?: boolean
}

export function OutlinedMesh({
  children,
  position,
  rotation,
  scale,
  thickness,
  jitter,
  reducedMotion,
  toonColor,
  castShadow = false,
}: OutlinedMeshProps) {
  return (
    <>
      <mesh position={position} rotation={rotation} scale={scale} castShadow={castShadow}>
        {children}
        <meshToonMaterial color={toonColor} />
      </mesh>
      <TremblingOutlineMesh
        position={position}
        rotation={rotation}
        scale={scale}
        thickness={thickness}
        jitter={jitter}
        reducedMotion={reducedMotion}
      >
        {children}
      </TremblingOutlineMesh>
    </>
  )
}
