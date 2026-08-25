import { useEffect, useRef } from 'react'

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
  uniform float uAspect;
  uniform float uEnergy;
  uniform float uFocus;
  uniform float uDark;
  uniform vec2 uPointer;

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float noise21(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
      mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0)), f.x),
      f.y
    );
  }

  float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.52;
    for (int i = 0; i < 4; i++) {
      value += amplitude * noise21(p);
      p = p * 2.03 + vec2(9.17, 3.41);
      amplitude *= 0.48;
    }
    return value;
  }

  void main() {
    vec2 uv = vUv;
    vec2 p = vec2((uv.x - 0.5) * uAspect, uv.y - 0.5);
    vec2 pointer = vec2((uPointer.x - 0.5) * uAspect, uPointer.y - 0.5);
    vec2 delta = p - pointer;
    float distanceToPointer = length(delta);
    float pointerWell = exp(-distanceToPointer * (5.4 - uFocus * 1.4));

    float flow = fbm(uv * vec2(3.8, 2.6) + vec2(uTime * 0.045, -uTime * 0.032));
    vec2 warped = uv;
    warped.x += (flow - 0.5) * (0.026 + uEnergy * 0.018);
    warped.y += sin(uv.x * 8.0 - uTime * 0.16) * 0.006;

    float ribbonA = sin(warped.x * 15.0 + warped.y * 8.0 - uTime * 0.38 + flow * 4.6);
    float ribbonB = sin(warped.x * -8.0 + warped.y * 21.0 + uTime * 0.24);
    float liquidRibbon = smoothstep(0.82, 1.0, ribbonA * 0.55 + ribbonB * 0.22 + 0.38);

    float orbitRadius = 0.11 + uEnergy * 0.035 + sin(uTime * 0.7) * 0.006;
    float orbit = exp(-abs(distanceToPointer - orbitRadius) * 72.0);
    float secondOrbit = exp(-abs(distanceToPointer - orbitRadius * 1.72) * 54.0);
    float ripple = (sin(distanceToPointer * 78.0 - uTime * 4.2) * 0.5 + 0.5) * pointerWell;

    vec2 gridUv = warped * vec2(20.0, 12.0);
    vec2 gridCell = abs(fract(gridUv) - 0.5);
    float gridLine = 1.0 - smoothstep(0.475, 0.5, max(gridCell.x, gridCell.y));
    gridLine *= smoothstep(0.2, 1.0, uv.y) * (0.25 + flow * 0.45);

    vec2 nodeCell = floor(gridUv);
    float nodeSeed = hash21(nodeCell);
    float node = smoothstep(0.072, 0.0, length(fract(gridUv) - 0.5));
    node *= step(0.86, nodeSeed) * (0.55 + 0.45 * sin(uTime * (0.6 + nodeSeed) + nodeSeed * 8.0));

    vec3 violet = vec3(0.545, 0.361, 0.965);
    vec3 fuchsia = vec3(0.851, 0.275, 0.937);
    vec3 rose = vec3(0.957, 0.447, 0.714);
    vec3 spectrum = mix(violet, fuchsia, smoothstep(0.08, 0.9, warped.x + flow * 0.12));
    spectrum = mix(spectrum, rose, orbit * 0.42 + uFocus * pointerWell * 0.28);

    float alpha = liquidRibbon * mix(0.025, 0.062, uDark);
    alpha += gridLine * mix(0.022, 0.046, uDark);
    alpha += node * (0.045 + uEnergy * 0.12);
    alpha += pointerWell * (0.018 + uEnergy * 0.13 + uFocus * 0.055);
    alpha += orbit * (0.04 + uEnergy * 0.18);
    alpha += secondOrbit * uEnergy * 0.08;
    alpha += ripple * uEnergy * 0.075;
    alpha *= smoothstep(0.0, 0.12, uv.y) * smoothstep(0.0, 0.08, 1.0 - uv.y);
    alpha = min(alpha, 0.34);

    gl_FragColor = vec4(spectrum, alpha);
  }
`

export default function LoginSpatialField({ dark = true }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined

    let disposed = false
    let cleanup = () => {}

    async function mount() {
      const {
        AdditiveBlending,
        Mesh,
        OrthographicCamera,
        PlaneGeometry,
        Scene,
        ShaderMaterial,
        Vector2,
        WebGLRenderer,
      } = await import('three')
      if (disposed || !canvas.isConnected) return

      const host = canvas.parentElement
      const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
      let reduced = motionQuery.matches
      let visible = true
      let frame = 0
      let width = 1
      let height = 1
      let energy = 0.07
      let targetEnergy = 0.07
      let focus = 0
      let targetFocus = 0
      let lastTime = performance.now()
      const pointer = { x: 0.67, y: 0.48, tx: 0.67, ty: 0.48 }

      let renderer
      let geometry
      let material

      try {
        renderer = new WebGLRenderer({
          canvas,
          alpha: true,
          antialias: false,
          powerPreference: 'low-power',
        })
        renderer.setClearColor(0x000000, 0)
        const scene = new Scene()
        const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1)
        geometry = new PlaneGeometry(2, 2)
        material = new ShaderMaterial({
          vertexShader,
          fragmentShader,
          transparent: true,
          depthTest: false,
          depthWrite: false,
          blending: AdditiveBlending,
          uniforms: {
            uTime: { value: 0 },
            uAspect: { value: 1 },
            uEnergy: { value: energy },
            uFocus: { value: focus },
            uDark: { value: dark ? 1 : 0 },
            uPointer: { value: new Vector2(pointer.x, pointer.y) },
          },
        })
        scene.add(new Mesh(geometry, material))

        function canAnimate() {
          return !disposed && visible && !reduced && !document.hidden && canvas.isConnected
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
          renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, width < 760 ? 1 : 1.25))
          renderer.setSize(width, height, false)
          material.uniforms.uAspect.value = width / height
        }

        function render(time, still = false) {
          const delta = Math.min(48, Math.max(0, time - lastTime))
          lastTime = time
          const ease = still ? 1 : 1 - Math.pow(0.79, delta / 16.67)
          pointer.x += (pointer.tx - pointer.x) * ease
          pointer.y += (pointer.ty - pointer.y) * ease
          energy += (targetEnergy - energy) * (still ? 1 : 0.09)
          focus += (targetFocus - focus) * (still ? 1 : 0.11)
          targetEnergy = Math.max(0.07, targetEnergy * (still ? 1 : 0.965))
          material.uniforms.uTime.value = time / 1000
          material.uniforms.uEnergy.value = energy
          material.uniforms.uFocus.value = focus
          material.uniforms.uPointer.value.set(pointer.x, pointer.y)
          renderer.render(scene, camera)
        }

        function animate(time) {
          frame = 0
          render(time)
          if (canAnimate()) frame = requestAnimationFrame(animate)
        }

        function start() {
          if (!frame && canAnimate()) frame = requestAnimationFrame(animate)
        }

        function handlePointer(event) {
          mapPointer(event.clientX, event.clientY)
          const interactive = event.target.closest('button, input')
          const surface = event.target.closest('.em-login-spatial-card, .em-login-spatial-photo')
          if (surface) {
            const bounds = surface.getBoundingClientRect()
            const x = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width))
            const y = Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height))
            surface.style.setProperty('--motion-x', `${(x * 100).toFixed(2)}%`)
            surface.style.setProperty('--motion-y', `${(y * 100).toFixed(2)}%`)
            surface.style.setProperty('--motion-tilt-x', `${((0.5 - y) * 4.5).toFixed(2)}deg`)
            surface.style.setProperty('--motion-tilt-y', `${((x - 0.5) * 5.5).toFixed(2)}deg`)
            surface.style.setProperty('--motion-shift-x', `${((x - 0.5) * 4).toFixed(2)}px`)
            surface.style.setProperty('--motion-shift-y', `${((y - 0.5) * 3).toFixed(2)}px`)
          }
          targetEnergy = Math.max(targetEnergy, interactive ? 0.32 : 0.14)
          start()
        }

        function handlePointerLeave() {
          host.querySelectorAll('.em-login-spatial-card, .em-login-spatial-photo').forEach(surface => {
            surface.style.setProperty('--motion-x', '50%')
            surface.style.setProperty('--motion-y', '50%')
            surface.style.setProperty('--motion-tilt-x', '0deg')
            surface.style.setProperty('--motion-tilt-y', '0deg')
            surface.style.setProperty('--motion-shift-x', '0px')
            surface.style.setProperty('--motion-shift-y', '0px')
          })
        }

        function handleFocus(event) {
          const target = event.target
          if (!target.matches('input, button')) return
          const bounds = target.getBoundingClientRect()
          mapPointer(bounds.left + bounds.width * 0.5, bounds.top + bounds.height * 0.5)
          targetFocus = 1
          targetEnergy = Math.max(targetEnergy, target.matches('button[type="submit"]') ? 0.82 : 0.58)
          if (reduced) render(performance.now(), true)
          else start()
        }

        function handleBlur(event) {
          if (!event.relatedTarget || !host.contains(event.relatedTarget)) targetFocus = 0
        }

        function handlePress(event) {
          mapPointer(event.clientX, event.clientY)
          targetEnergy = event.target.closest('button[type="submit"]') ? 1 : 0.72
          targetFocus = event.target.closest('input, button') ? 1 : targetFocus
          if (reduced) render(performance.now(), true)
          else start()
        }

        function handleMotion(event) {
          reduced = event.matches
          cancelAnimationFrame(frame)
          frame = 0
          if (reduced) render(performance.now(), true)
          else start()
        }

        function handleVisibility() {
          cancelAnimationFrame(frame)
          frame = 0
          if (!document.hidden) {
            if (reduced) render(performance.now(), true)
            else start()
          }
        }

        const resizeObserver = new ResizeObserver(() => {
          resize()
          render(performance.now(), true)
        })
        const visibilityObserver = new IntersectionObserver(([entry]) => {
          visible = entry.isIntersecting
          cancelAnimationFrame(frame)
          frame = 0
          if (visible) {
            if (reduced) render(performance.now(), true)
            else start()
          }
        })

        resizeObserver.observe(host)
        visibilityObserver.observe(canvas)
        host.addEventListener('pointermove', handlePointer, { passive: true })
        host.addEventListener('pointerleave', handlePointerLeave, { passive: true })
        host.addEventListener('pointerdown', handlePress, { passive: true })
        host.addEventListener('focusin', handleFocus)
        host.addEventListener('focusout', handleBlur)
        document.addEventListener('visibilitychange', handleVisibility)
        motionQuery.addEventListener?.('change', handleMotion)
        resize()
        render(performance.now(), reduced)
        start()
        canvas.dataset.renderer = 'three-webgl'

        cleanup = () => {
          cancelAnimationFrame(frame)
          resizeObserver.disconnect()
          visibilityObserver.disconnect()
          host.removeEventListener('pointermove', handlePointer)
          host.removeEventListener('pointerleave', handlePointerLeave)
          host.removeEventListener('pointerdown', handlePress)
          host.removeEventListener('focusin', handleFocus)
          host.removeEventListener('focusout', handleBlur)
          document.removeEventListener('visibilitychange', handleVisibility)
          motionQuery.removeEventListener?.('change', handleMotion)
          geometry.dispose()
          material.dispose()
          renderer.dispose()
        }
      } catch {
        canvas.hidden = true
      }
    }

    mount()
    return () => {
      disposed = true
      cleanup()
    }
  }, [dark])

  return <canvas ref={canvasRef} className="em-login-spatial-canvas" aria-hidden="true" />
}
