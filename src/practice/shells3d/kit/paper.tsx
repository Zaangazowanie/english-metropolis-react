// Fluent City GameKit — "Hand-Drawn Pastel Pipeline" (Wave-2 shared render).
//
// A theme-AGNOSTIC toon + ink-outline + painted-sky pipeline that every 3D
// game can adopt for the bright, pastel, hand-drawn look (à la the
// messenger.abeto.co reference). Nothing here hard-codes a district palette —
// callers pass a small `PaperTheme` (colours + a few params), so a game can
// flip Topiary-day ↔ moonlit-pastel by swapping one object.
//
// Pieces (R&D "Hand-Drawn Pastel Pipeline" recipes):
//  • toonRamp / makeGradientMap — N-step gradient map for MeshToonMaterial cel
//    banding (use `<meshToonMaterial gradientMap={toonRamp} .../>`).
//  • InkOutline — cheap inverted-hull (back-face, inflated) ink outline for
//    hero meshes that want a guaranteed crisp line.
//  • PastelSky — painted vertical-gradient sky dome + slow drifting soft clouds.
//  • PaperPost — ONE fullscreen post pass: depth + luma Sobel INK edges, cel
//    posterize, pastel high-key grade (lift + tint + gentle desaturate), paper
//    grain + dither, and a ~10fps "boiling-line" wobble. Pure three CORE (RT +
//    ortho quad + DepthTexture) — NO @react-three/postprocessing, NO
//    examples/jsm, NO bloom — so vendor-three stays flat and it's CHEAPER than
//    the old bloom pass.
//
// Hard rules held: no new deps, no external URLs, procedural-only, single
// canvas, DPR≤1.5 (CityStage), reducedMotion (boiling + cloud drift OFF),
// allocation-free loops. CI game3d-gate is the budget authority.

import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import {
  BackSide, Color, DataTexture, DepthTexture, Mesh, NearestFilter,
  OrthographicCamera, PlaneGeometry, RGBAFormat, Scene, ShaderMaterial,
  Vector2, WebGLRenderTarget,
} from 'three'
import type { Group, PerspectiveCamera, WebGLRenderer } from 'three'
import { useStageQuality } from './CityStage'

// ── Theme contract — the ONLY thing a game customises. Pipeline stays generic.
export interface PaperTheme {
  ink: string // outline / line colour
  paper: string // high-key "paper" colour the grade lifts toward
  liftAmt: number // 0..1 — how far blacks lift toward `paper`
  paperTint: string // soft pastel multiply tint
  grain: number // paper-grain strength (0..~0.06)
  posterize: boolean // extra cel posterize in post (on top of MeshToon)
  skyTop: string
  skyBottom: string
  cloud: string
}

// ── Cel gradient map — procedural N-step ramp (no texture/URL). ────────────
export function makeGradientMap(steps = 3): DataTexture {
  const n = Math.max(2, steps)
  const data = new Uint8Array(n * 4)
  for (let i = 0; i < n; i++) {
    const v = Math.round(255 * (i / (n - 1)))
    data[i * 4] = v
    data[i * 4 + 1] = v
    data[i * 4 + 2] = v
    data[i * 4 + 3] = 255
  }
  const tex = new DataTexture(data, n, 1, RGBAFormat)
  tex.minFilter = NearestFilter
  tex.magFilter = NearestFilter
  tex.generateMipmaps = false
  tex.needsUpdate = true
  return tex
}

// Shared 3-step ramp — import and pass to `<meshToonMaterial gradientMap={toonRamp} />`.
export const toonRamp: DataTexture = makeGradientMap(3)

// ── Inverted-hull ink outline for a hero mesh. Wrap a single geometry element:
//   <InkOutline color={theme.ink}><sphereGeometry args={[0.2, 16, 12]} /></InkOutline>
// Renders a back-face, slightly inflated copy in flat ink. Pair with the real
// (front) mesh that uses the same geometry. ───────────────────────────────
export function InkOutline({ color = '#1a1730', scale = 1.06, children }: { color?: string; scale?: number; children: React.ReactNode }) {
  return (
    <mesh scale={scale}>
      {children}
      <meshBasicMaterial color={color} side={BackSide} toneMapped={false} />
    </mesh>
  )
}

// ── Painted pastel sky — gradient dome + slow soft clouds. reducedMotion: clouds hold.
export function PastelSky({ theme, reducedMotion }: { theme: PaperTheme; reducedMotion: boolean }) {
  const clouds = useRef<Group>(null)
  const skyUniforms = useMemo(() => ({
    uTop: { value: new Color(theme.skyTop) },
    uBottom: { value: new Color(theme.skyBottom) },
  }), [theme.skyTop, theme.skyBottom])
  const cloudDefs = useMemo(() => ([
    { x: -7, y: 7.5, z: -12, s: 4.5, sp: 0.06 },
    { x: 5, y: 9, z: -14, s: 6, sp: 0.04 },
    { x: 11, y: 6.5, z: -10, s: 3.6, sp: 0.08 },
    { x: -12, y: 10, z: -16, s: 5.2, sp: 0.05 },
  ]), [])
  useFrame((state) => {
    const g = clouds.current
    if (!g || reducedMotion) return
    const t = state.clock.elapsedTime
    for (let i = 0; i < g.children.length; i++) {
      const def = cloudDefs[i]
      const span = 30
      const x = ((def.x + t * def.sp + span / 2) % span) - span / 2
      g.children[i].position.x = x
    }
  })
  return (
    <group>
      {/* Gradient sky dome */}
      <mesh scale={[40, 40, 40]}>
        <sphereGeometry args={[1, 24, 16]} />
        <shaderMaterial
          side={BackSide}
          depthWrite={false}
          uniforms={skyUniforms}
          vertexShader={'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }'}
          fragmentShader={'varying vec3 vP; uniform vec3 uTop; uniform vec3 uBottom; void main(){ float h = clamp(vP.y * 0.5 + 0.5, 0.0, 1.0); gl_FragColor = vec4(mix(uBottom, uTop, pow(h, 0.8)), 1.0); }'}
        />
      </mesh>
      {/* Soft clouds */}
      <group ref={clouds}>
        {cloudDefs.map((d, i) => (
          <mesh key={i} position={[d.x, d.y, d.z]} scale={[d.s, d.s * 0.6, 1]}>
            <planeGeometry args={[1, 1]} />
            <shaderMaterial
              transparent
              depthWrite={false}
              toneMapped={false}
              uniforms={{ uCol: { value: new Color(theme.cloud) } }}
              vertexShader={'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }'}
              fragmentShader={'varying vec2 vUv; uniform vec3 uCol; float h(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); } void main(){ vec2 p = vUv - 0.5; float puff = smoothstep(0.5, 0.12, length(p * vec2(1.0, 1.7))); float lump = 0.6 + 0.4 * h(floor(vUv * 6.0)); gl_FragColor = vec4(uCol, puff * lump * 0.9); }'}
            />
          </mesh>
        ))}
      </group>
    </group>
  )
}

// ── PaperPost — the one shared post pass. Mount inside a CityStage scene:
//   {tier !== 'low' && <PaperPost theme={theme} />}
// Reads tier/reducedMotion from useStageQuality. ───────────────────────────
const POST_VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }'

const postFrag = (taps: number): string => `
precision highp float;
varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform sampler2D tDepth;
uniform vec2 uTexel;
uniform float uNear, uFar, uBoil, uInkStrength, uGrain, uLiftAmt, uPosterize;
uniform vec3 uInk, uPaper, uPaperTint;
float luma(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float linDepth(vec2 uv){
  float z = texture2D(tDepth, uv).x;
  return (2.0 * uNear) / (uFar + uNear - (z * 2.0 - 1.0) * (uFar - uNear));
}
void main(){
  vec2 t = uTexel;
  // ~10fps boiling-line jitter on the ink sample offset (hand-drawn wobble)
  vec2 cellJ = floor(vUv / (t * 3.0));
  vec2 jit = vec2(hash(cellJ + uBoil) - 0.5, hash(cellJ + uBoil + 7.3) - 0.5) * t * 1.6;
  vec2 uv = vUv;
  vec3 base = texture2D(tDiffuse, uv).rgb;
  // depth Sobel → silhouettes
  float d0 = linDepth(uv + jit);
  float dE = abs(d0 - linDepth(uv + jit + vec2(t.x, 0.0)))
           + abs(d0 - linDepth(uv + jit + vec2(-t.x, 0.0)))
           + abs(d0 - linDepth(uv + jit + vec2(0.0, t.y)))
           + abs(d0 - linDepth(uv + jit + vec2(0.0, -t.y)));
  float depthLine = smoothstep(0.006, 0.03, dE);
  // luma Sobel → interior creases
  float l0 = luma(base);
  float lE = abs(l0 - luma(texture2D(tDiffuse, uv + jit + vec2(t.x, 0.0)).rgb))
           + abs(l0 - luma(texture2D(tDiffuse, uv + jit + vec2(0.0, t.y)).rgb))
           + abs(l0 - luma(texture2D(tDiffuse, uv + jit + vec2(-t.x, -t.y)).rgb));
  float lumaLine = smoothstep(0.22, 0.55, lE);
  float ink = clamp(max(depthLine, lumaLine) * uInkStrength, 0.0, 1.0);
  // cel posterize (reinforces MeshToon banding for non-toon materials)
  vec3 col = base;
  if (uPosterize > 0.5) col = floor(col * 5.0 + 0.5) / 5.0;
  // pastel high-key grade: lift blacks toward paper, gentle desaturate, tint
  col = mix(col, uPaper, uLiftAmt * (1.0 - luma(col)));
  float g = luma(col);
  col = mix(vec3(g), col, 0.85);
  col *= uPaperTint;
  // ink over
  col = mix(col, uInk, ink);
  // paper grain (boils slowly) + 1-LSB dither to kill banding
  float grain = hash(vUv * vec2(900.0, 900.0) + floor(uBoil)) - 0.5;
  col += grain * uGrain;
  col += (hash(gl_FragCoord.xy) - 0.5) / 255.0;
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`

export function PaperPost({ theme }: { theme: PaperTheme }) {
  const gl = useThree((s) => s.gl) as WebGLRenderer
  const scene = useThree((s) => s.scene) as Scene
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const size = useThree((s) => s.size)
  const { tier, reducedMotion } = useStageQuality()

  const rt = useMemo(() => {
    const target = new WebGLRenderTarget(1, 1, { depthBuffer: true, stencilBuffer: false })
    target.depthTexture = new DepthTexture(1, 1)
    return target
  }, [])
  const postScene = useMemo(() => new Scene(), [])
  const postCam = useMemo(() => new OrthographicCamera(-1, 1, 1, -1, 0, 1), [])
  const material = useMemo(() => new ShaderMaterial({
    uniforms: {
      tDiffuse: { value: null },
      tDepth: { value: null },
      uTexel: { value: new Vector2(1 / 1280, 1 / 720) },
      uNear: { value: 0.1 },
      uFar: { value: 100 },
      uBoil: { value: 0 },
      uInkStrength: { value: 1.0 },
      uGrain: { value: theme.grain },
      uLiftAmt: { value: theme.liftAmt },
      uPosterize: { value: theme.posterize ? 1 : 0 },
      uInk: { value: new Color(theme.ink) },
      uPaper: { value: new Color(theme.paper) },
      uPaperTint: { value: new Color(theme.paperTint) },
    },
    vertexShader: POST_VERT,
    fragmentShader: postFrag(tier === 'high' ? 1 : 1),
    depthTest: false,
    depthWrite: false,
  }), [tier, theme])
  const quad = useMemo(() => new Mesh(new PlaneGeometry(2, 2), material), [material])

  useEffect(() => {
    rt.texture.colorSpace = gl.outputColorSpace
    postScene.add(quad)
    return () => { postScene.remove(quad); rt.dispose(); rt.depthTexture?.dispose(); quad.geometry.dispose(); material.dispose() }
  }, [rt, postScene, quad, material, gl])

  useEffect(() => {
    const dpr = gl.getPixelRatio()
    const w = Math.max(1, Math.floor(size.width * dpr))
    const h = Math.max(1, Math.floor(size.height * dpr))
    rt.setSize(w, h)
    ;(material.uniforms.uTexel.value as Vector2).set(1 / w, 1 / h)
  }, [size, gl, rt, material])

  useFrame((state) => {
    material.uniforms.tDiffuse.value = rt.texture
    material.uniforms.tDepth.value = rt.depthTexture
    material.uniforms.uNear.value = camera.near
    material.uniforms.uFar.value = camera.far
    // quantise time to ~10fps so the linework wobbles like hand-animation
    material.uniforms.uBoil.value = reducedMotion ? 0 : Math.floor(state.clock.elapsedTime * 10)
    gl.setRenderTarget(rt)
    gl.render(scene, camera)
    gl.setRenderTarget(null)
    gl.render(postScene, postCam)
  }, 1)
  return null
}
