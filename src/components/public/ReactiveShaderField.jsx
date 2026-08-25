import { useEffect, useRef } from 'react'

const SIGNAL_EVENT = 'englishmetro:surface-signal'

const vertexShader = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const fragmentShader = `
  precision highp float;

  varying vec2 vUv;
  uniform float uTime;
  uniform float uEnergy;
  uniform float uAspect;
  uniform float uTheme;
  uniform vec2 uPointer;

  void main() {
    vec2 lensUv = vUv - uPointer;
    lensUv.x *= uAspect;
    float distanceToPointer = length(lensUv);
    float lens = exp(-distanceToPointer * 4.8);

    float ripplePhase = distanceToPointer * 36.0 - uTime * 3.2;
    float ripple = (sin(ripplePhase) * 0.5 + 0.5) * lens;
    float ribbonA = sin(vUv.x * 12.0 + vUv.y * 8.0 - uTime * 0.72);
    float ribbonB = sin(vUv.x * -7.0 + vUv.y * 15.0 + uTime * 0.54);
    float interference = smoothstep(0.66, 1.0, (ribbonA + ribbonB) * 0.25 + 0.5);
    float auroraShape = sin(vUv.x * 5.2 + sin(vUv.y * 4.0 - uTime * 0.32) * 1.5 - uTime * 0.25);
    float aurora = smoothstep(0.42, 0.98, auroraShape * 0.5 + 0.5);
    aurora *= smoothstep(0.0, 0.18, vUv.y) * smoothstep(0.0, 0.16, 1.0 - vUv.y);

    float rail = abs(fract((vUv.x + vUv.y * 0.22) * 7.0 - uTime * 0.055) - 0.5);
    rail = smoothstep(0.49, 0.455, rail) * 0.18;

    vec3 violet = vec3(0.545, 0.361, 0.965);
    vec3 fuchsia = vec3(0.851, 0.275, 0.937);
    vec3 cyan = vec3(0.235, 0.831, 0.945);
    vec3 spectrum = mix(violet, fuchsia, smoothstep(0.12, 0.88, vUv.x));
    spectrum = mix(spectrum, cyan, ripple * 0.56 + interference * 0.14);
    spectrum = mix(spectrum, fuchsia, aurora * 0.18);

    float baseAlpha = mix(0.065, 0.040, uTheme);
    float energyAlpha = uEnergy * (lens * 0.200 + ripple * 0.110);
    float ambientAlpha = interference * baseAlpha + aurora * baseAlpha * 0.8 + rail * baseAlpha;
    float alpha = min(0.48, ambientAlpha + energyAlpha);

    gl_FragColor = vec4(spectrum, alpha);
  }
`

/**
 * One deferred Three.js plane provides a shared, pointer-reactive material for
 * the hero. Buttons and other controls publish small surface signals to it,
 * avoiding a separate WebGL context for every interactive element.
 */
export default function ReactiveShaderField({ className = '', mode = 'dark' }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const host = canvas?.parentElement
    if (!canvas || !host) return undefined

    const reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    let reduced = reducedQuery.matches
    let disposed = false
    let visible = true
    let frame = 0
    let idleHandle = 0
    let renderer
    let geometry
    let material
    let scene
    let camera
    let width = 1
    let height = 1
    let lastTime = performance.now()

    const pointer = { x: 0.54, y: 0.46, tx: 0.54, ty: 0.46 }
    let energy = 0.08
    let targetEnergy = 0.08

    function canAnimate() {
      return !disposed && visible && !reduced && !document.hidden && renderer
    }

    function mapPointer(clientX, clientY) {
      const bounds = host.getBoundingClientRect()
      if (!bounds.width || !bounds.height) return
      pointer.tx = Math.min(1, Math.max(0, (clientX - bounds.left) / bounds.width))
      pointer.ty = 1 - Math.min(1, Math.max(0, (clientY - bounds.top) / bounds.height))
    }

    function resize() {
      const bounds = host.getBoundingClientRect()
      width = Math.max(1, bounds.width)
      height = Math.max(1, bounds.height)
      if (!renderer || !material) return
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, width < 760 ? 1 : 1.35))
      renderer.setSize(width, height, false)
      material.uniforms.uAspect.value = width / height
    }

    function render(time, still = false) {
      if (!renderer || !material || !scene || !camera) return
      const delta = Math.min(48, Math.max(0, time - lastTime))
      lastTime = time
      const pointerEase = still ? 1 : 1 - Math.pow(0.82, delta / 16.67)
      pointer.x += (pointer.tx - pointer.x) * pointerEase
      pointer.y += (pointer.ty - pointer.y) * pointerEase
      energy += (targetEnergy - energy) * (still ? 1 : 0.085)
      targetEnergy = Math.max(0.075, targetEnergy * (still ? 1 : 0.96))

      material.uniforms.uTime.value = time / 1000
      material.uniforms.uEnergy.value = energy
      material.uniforms.uPointer.value.set(pointer.x, pointer.y)
      renderer.render(scene, camera)
    }

    function animate(time) {
      frame = 0
      render(time)
      if (canAnimate()) frame = window.requestAnimationFrame(animate)
    }

    function start() {
      if (!frame && canAnimate()) frame = window.requestAnimationFrame(animate)
    }

    function handleSurfaceSignal(event) {
      const detail = event.detail || {}
      if (Number.isFinite(detail.clientX) && Number.isFinite(detail.clientY)) {
        mapPointer(detail.clientX, detail.clientY)
      }
      targetEnergy = Math.max(targetEnergy, Math.min(0.86, detail.intensity || 0.48))
      start()
    }

    function handleHostPointer(event) {
      mapPointer(event.clientX, event.clientY)
      targetEnergy = Math.max(targetEnergy, 0.22)
      start()
    }

    function handleVisibility() {
      window.cancelAnimationFrame(frame)
      frame = 0
      if (document.hidden) return
      if (reduced) render(performance.now(), true)
      else start()
    }

    function handleMotionChange(event) {
      reduced = event.matches
      window.cancelAnimationFrame(frame)
      frame = 0
      if (reduced) render(performance.now(), true)
      else start()
    }

    const resizeObserver = new ResizeObserver(resize)
    const visibilityObserver = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      window.cancelAnimationFrame(frame)
      frame = 0
      if (visible) {
        if (reduced) render(performance.now(), true)
        else start()
      }
    }, { rootMargin: '180px 0px' })

    async function initialise() {
      try {
        const THREE = await import('three')
        if (disposed) return

        renderer = new THREE.WebGLRenderer({
          canvas,
          alpha: true,
          antialias: false,
          powerPreference: 'low-power',
        })
        renderer.setClearColor(0x000000, 0)
        scene = new THREE.Scene()
        camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
        geometry = new THREE.PlaneGeometry(2, 2)
        material = new THREE.ShaderMaterial({
          vertexShader,
          fragmentShader,
          transparent: true,
          depthTest: false,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          uniforms: {
            uTime: { value: 0 },
            uEnergy: { value: energy },
            uAspect: { value: width / height },
            uTheme: { value: mode === 'light' ? 1 : 0 },
            uPointer: { value: new THREE.Vector2(pointer.x, pointer.y) },
          },
        })
        scene.add(new THREE.Mesh(geometry, material))
        resize()
        render(performance.now(), reduced)
        start()
      } catch {
        canvas.hidden = true
      }
    }

    resizeObserver.observe(host)
    visibilityObserver.observe(canvas)
    host.addEventListener('pointermove', handleHostPointer, { passive: true })
    window.addEventListener(SIGNAL_EVENT, handleSurfaceSignal)
    document.addEventListener('visibilitychange', handleVisibility)
    reducedQuery.addEventListener?.('change', handleMotionChange)
    resize()

    if ('requestIdleCallback' in window) {
      idleHandle = window.requestIdleCallback(initialise, { timeout: 700 })
    } else {
      idleHandle = window.setTimeout(initialise, 180)
    }

    return () => {
      disposed = true
      window.cancelAnimationFrame(frame)
      if ('cancelIdleCallback' in window) window.cancelIdleCallback(idleHandle)
      else window.clearTimeout(idleHandle)
      resizeObserver.disconnect()
      visibilityObserver.disconnect()
      host.removeEventListener('pointermove', handleHostPointer)
      window.removeEventListener(SIGNAL_EVENT, handleSurfaceSignal)
      document.removeEventListener('visibilitychange', handleVisibility)
      reducedQuery.removeEventListener?.('change', handleMotionChange)
      geometry?.dispose()
      material?.dispose()
      renderer?.dispose()
    }
  }, [mode])

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />
}

