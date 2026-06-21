// InkOutline — the abeto "hand-inked anime" look, as a self-contained post pass.
//
// abeto/Messenger's signature is bold black ink outlines + flat cel fills on
// EVERYTHING (characters, buildings, props). Our world had no outline, so it
// read as plain low-poly 3D. This adds a global edge-detection pass that draws
// dark ink lines wherever there's a depth discontinuity (silhouettes, where one
// object overlaps another) or a strong colour boundary (e.g. shirt vs skin),
// then composites them over the normally-shaded scene — preserving the
// transparent canvas so the DOM dusk-sky still shows through.
//
// Drop <InkOutline/> as a child of a CityStage scene. It takes over the render
// loop (useFrame priority 1) for that canvas only — no other game is touched,
// no new deps (three's own EffectComposer FullScreenQuad helper + a small
// shader). reducedMotion-agnostic (the look is static, not animated).

import { useEffect, useMemo } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import {
  WebGLRenderTarget, DepthTexture, DepthFormat, UnsignedIntType,
  RGBAFormat, LinearFilter, NearestFilter, ShaderMaterial, Vector2, Color, SRGBColorSpace,
} from 'three'
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js'

const VERT = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`

const FRAG = /* glsl */`
  precision highp float;
  uniform sampler2D tDiffuse;
  uniform sampler2D tDepth;
  uniform vec2  resolution;
  uniform float thickness;       // line width, px
  uniform float depthThreshold;  // silhouette sensitivity
  uniform float lumaThreshold;   // interior colour-edge sensitivity
  uniform float cameraNear;
  uniform float cameraFar;
  uniform vec3  inkColor;
  uniform float debug;
  varying vec2 vUv;

  float linDepth(float d) {
    float z = d * 2.0 - 1.0;
    return (2.0 * cameraNear * cameraFar) / (cameraFar + cameraNear - z * (cameraFar - cameraNear));
  }
  float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
  // render targets hold LINEAR colour; encode to sRGB for display.
  vec3 lin2srgb(vec3 c) {
    c = max(c, 0.0);
    return mix(1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, c * 12.92, step(c, vec3(0.0031308)));
  }
  // ACES filmic tone-map (Narkowicz) for richer, more cinematic contrast +
  // graceful highlight roll-off (neon doesn't clip harshly). Operates in linear.
  vec3 aces(vec3 x) {
    x *= 1.28; // exposure lift (ACES compresses mids a touch)
    return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
  }

  vec3 sCol(vec2 uv) { return lin2srgb(texture2D(tDiffuse, uv).rgb); }

  void main() {
    vec2 px = thickness / resolution;
    vec4 c = texture2D(tDiffuse, vUv);
    vec3 col = lin2srgb(aces(c.rgb)); // ACES tone-map → sRGB (cinematic)

    // — depth edges (silhouettes + object overlaps) —
    float dC = linDepth(texture2D(tDepth, vUv).x);
    float dU = linDepth(texture2D(tDepth, vUv + vec2(0.0,  px.y)).x);
    float dD = linDepth(texture2D(tDepth, vUv + vec2(0.0, -px.y)).x);
    float dL = linDepth(texture2D(tDepth, vUv + vec2(-px.x, 0.0)).x);
    float dR = linDepth(texture2D(tDepth, vUv + vec2( px.x, 0.0)).x);
    float depthEdge = (abs(dC - dU) + abs(dC - dD) + abs(dC - dL) + abs(dC - dR)) / max(dC, 0.001);
    float de = smoothstep(depthThreshold, depthThreshold * 2.2, depthEdge);

    // — luminance edges on DISPLAY colour (collar, satchel strap, panes) —
    float lC = luma(col);
    float lU = luma(sCol(vUv + vec2(0.0,  px.y)));
    float lD = luma(sCol(vUv + vec2(0.0, -px.y)));
    float lL = luma(sCol(vUv + vec2(-px.x, 0.0)));
    float lR = luma(sCol(vUv + vec2( px.x, 0.0)));
    float lumaEdge = abs(lC - lU) + abs(lC - lD) + abs(lC - lL) + abs(lC - lR);
    float le = smoothstep(lumaThreshold, lumaThreshold * 1.7, lumaEdge) * step(0.02, c.a);

    if (debug > 0.5) { gl_FragColor = vec4(de, le, 0.0, 1.0); return; }

    float edge = max(de, le);
    vec3 rgb = mix(col, inkColor, edge);
    // silhouette lines stay opaque even over the transparent sky; elsewhere keep
    // the scene's own alpha so the DOM dusk-gradient shows through.
    float a = max(c.a, de);
    gl_FragColor = vec4(rgb, a);
  }
`

export interface InkOutlineProps {
  /** Line width in pixels (scaled by DPR internally). */
  thickness?: number
  /** Lower = more silhouette lines. */
  depthThreshold?: number
  /** Lower = more interior colour lines. */
  lumaThreshold?: number
  /** Ink colour (warm near-black to suit dusk). */
  color?: string
  /** Visualise edges: red = depth edges, green = luma edges. */
  debug?: boolean
}

export function InkOutline({
  thickness = 2.2,
  depthThreshold = 0.014,
  lumaThreshold = 0.17,
  color = '#0a0806',
  debug = false,
}: InkOutlineProps) {
  const { gl, scene, camera, size } = useThree()
  const dpr = gl.getPixelRatio()

  const { rt, quad, mat } = useMemo(() => {
    const w = Math.max(1, Math.floor(size.width * dpr))
    const h = Math.max(1, Math.floor(size.height * dpr))
    const depthTexture = new DepthTexture(w, h)
    depthTexture.format = DepthFormat
    depthTexture.type = UnsignedIntType
    depthTexture.minFilter = NearestFilter
    depthTexture.magFilter = NearestFilter
    const rt = new WebGLRenderTarget(w, h, {
      format: RGBAFormat, minFilter: LinearFilter, magFilter: LinearFilter,
      depthTexture, stencilBuffer: false,
    })
    rt.texture.colorSpace = SRGBColorSpace // so sampled colours display correctly
    const mat = new ShaderMaterial({
      uniforms: {
        tDiffuse: { value: rt.texture },
        tDepth: { value: rt.depthTexture },
        resolution: { value: new Vector2(w, h) },
        thickness: { value: thickness },
        depthThreshold: { value: depthThreshold },
        lumaThreshold: { value: lumaThreshold },
        cameraNear: { value: (camera as { near: number }).near },
        cameraFar: { value: (camera as { far: number }).far },
        inkColor: { value: new Color(color) },
        debug: { value: debug ? 1 : 0 },
      },
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthTest: false, depthWrite: false,
    })
    const quad = new FullScreenQuad(mat)
    return { rt, quad, mat }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keep render target + uniforms in sync with canvas size / camera.
  useEffect(() => {
    const w = Math.max(1, Math.floor(size.width * dpr))
    const h = Math.max(1, Math.floor(size.height * dpr))
    rt.setSize(w, h)
    mat.uniforms.resolution.value.set(w, h)
  }, [size, dpr, rt, mat])
  useEffect(() => {
    mat.uniforms.cameraNear.value = (camera as { near: number }).near
    mat.uniforms.cameraFar.value = (camera as { far: number }).far
    mat.uniforms.thickness.value = thickness
    mat.uniforms.depthThreshold.value = depthThreshold
    mat.uniforms.lumaThreshold.value = lumaThreshold
    mat.uniforms.inkColor.value.set(color)
  }, [camera, mat, thickness, depthThreshold, lumaThreshold, color])
  useEffect(() => () => { rt.dispose(); quad.dispose() }, [rt, quad])

  // Take over rendering: scene → RT (color+depth), then ink pass → screen.
  useFrame(() => {
    const prevTarget = gl.getRenderTarget()
    gl.setRenderTarget(rt)
    gl.setClearColor(0x000000, 0)
    gl.clear(true, true, true)
    gl.render(scene, camera)
    gl.setRenderTarget(prevTarget)
    gl.clear(true, true, true)
    quad.render(gl)
  }, 1)

  return null
}

export default InkOutline
