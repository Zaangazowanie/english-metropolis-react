import { useEffect, useRef } from 'react'
import { useThreeCanvas } from './useThreeCanvas.js'

// RippleSurface — a shader plane that sits under a confirm button's label.
//   hover: rings ripple outward from the pointer and fade over ~1.2s
//   busy:  a slow breathing wave while the booking request is in flight
//   settled: the surface flattens to emerald and goes still (booking succeeded)
// Frames are drawn only while a ripple or the busy wave is alive.
const FRAG = `
precision mediump float;
uniform vec2 uRes; uniform float uTime; uniform vec2 uPointer; uniform float uBorn; uniform float uBusy; uniform float uSettle;
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  float aspect = uRes.x / uRes.y;
  vec2 p = vec2(uv.x * aspect, uv.y);
  vec2 c = vec2(uPointer.x * aspect, uPointer.y);
  float d = distance(p, c);
  float age = uTime - uBorn;
  float ring = 0.0;
  if (age >= 0.0 && age < 1.4) {
    float r = age * 1.6;
    ring = smoothstep(0.06, 0.0, abs(d - r)) * (1.0 - age / 1.4);
    ring += smoothstep(0.10, 0.0, abs(d - r * 0.55)) * 0.5 * (1.0 - age / 1.4);
  }
  float wave = uBusy * (0.5 + 0.5 * sin(uTime * 3.0 - p.x * 4.0)) * 0.35;
  vec3 brand = mix(vec3(0.545, 0.361, 0.965), vec3(0.957, 0.447, 0.714), uv.x);
  vec3 ok = vec3(0.204, 0.827, 0.6);
  vec3 col = mix(brand, ok, uSettle);
  float a = clamp(ring * 0.9 + wave, 0.0, 1.0) * (1.0 - uSettle) + uSettle * 0.55;
  gl_FragColor = vec4(col, a);
}`
const VERT = `void main(){ gl_Position = vec4(position, 1.0); }`

export default function RippleSurface({ busy = false, settled = false, host = null }) {
  const canvasRef = useRef(null)
  const uRef = useRef(null)
  const stage = useThreeCanvas(canvasRef, (stage) => {
    const { THREE, scene, renderer } = stage
    const uniforms = {
      uRes: { value: new THREE.Vector2(1, 1) }, uTime: { value: 0 }, uPointer: { value: new THREE.Vector2(0.5, 0.5) },
      uBorn: { value: -10 }, uBusy: { value: 0 }, uSettle: { value: 0 },
    }
    uRef.current = uniforms
    uniforms.t0 = performance.now()
    const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthTest: false })
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat))
    const t0 = uniforms.t0
    const tick = (now) => { uniforms.uTime.value = (now - t0) / 1000 }
    return {
      onResize: (w, h) => { const pr = renderer.getPixelRatio(); uniforms.uRes.value.set(w * pr, h * pr) },
      onPointer: (x, y, type) => {
        if (type !== 'pointermove' && type !== 'pointerdown') return
        // A new ripple starts only after the previous one has mostly faded,
        // so a sweeping pointer produces a calm trail, not a storm.
        const t = (performance.now() - t0) / 1000
        if (t - uniforms.uBorn.value > 0.35 || type === 'pointerdown') {
          uniforms.uPointer.value.set(x, 1 - y)
          uniforms.uBorn.value = t
          stage.animateFor(1450, tick)
        }
      },
    }
  }, [], { pointerTarget: host || 'parent' })
  const api = {
    animateFor: (ms, cb) => stage.current?.animateFor(ms, cb),
    requestRender: () => stage.current?.requestRender(),
  }
  useEffect(() => {
    const u = uRef.current
    if (!u) return
    u.uBusy.value = busy && !settled ? 1 : 0
    const st = stage.current
    if (busy && !settled) {
      // Breathing wave: re-armed every 4s only while busy; stops on its own otherwise.
      let alive = true
      const arm = () => { if (!alive) return; api.animateFor(4000, (now) => { u.uTime.value = (now - u.t0) / 1000 }); timer = setTimeout(arm, 3900) }
      let timer = 0
      arm()
      return () => { alive = false; clearTimeout(timer); st?.stopAnimation?.() }
    }
    api.requestRender()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, settled])
  useEffect(() => {
    const u = uRef.current
    if (!u) return
    const from = u.uSettle.value, to = settled ? 1 : 0, start = performance.now()
    api.animateFor(520, (now) => { const p = Math.min(1, (now - start) / 520); u.uSettle.value = from + (to - from) * (1 - Math.pow(1 - p, 3)) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settled])
  return <canvas ref={canvasRef} aria-hidden style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', borderRadius: 999, pointerEvents: 'none', display: 'block' }}/>
}
