import { useEffect, useRef } from 'react'
import { SKYLINE_FOCUS_EVENT } from './motionPolish.js'
import { buildMetropolis } from './heroMetropolis.js'

const DISTRICTS = { school: -19, pricing: 0, world: 10 }

export default function HeroSkyline({ className = '', mode = 'night', reduced = false }) {
  const mountRef = useRef(null)
  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return undefined
    let disposed = false
    let cleanup = () => {}
    ;(async () => {
      let THREE
      try { THREE = await import('three') } catch { mount.dataset.webgl = 'fallback'; return }
      if (disposed) return
      const day = mode === 'day'
      let renderer
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' })
      } catch { mount.dataset.webgl = 'fallback'; return }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
      renderer.setClearColor(0x000000, 0)
      renderer.outputColorSpace = THREE.SRGBColorSpace
      renderer.toneMapping = THREE.ACESFilmicToneMapping
      renderer.toneMappingExposure = day ? 1.3 : 1.15
      renderer.domElement.setAttribute('aria-hidden', 'true')
      mount.appendChild(renderer.domElement)
      mount.dataset.webgl = 'ready'
      const scene = new THREE.Scene()
      scene.fog = new THREE.Fog(day ? 0xeee8f7 : 0x211630, 66, 110)
      scene.add(new THREE.HemisphereLight(day ? 0xe8efff : 0xc7c7ff, day ? 0xaca0bd : 0x32263e, day ? 2.1 : 1.35))
      const key = new THREE.DirectionalLight(day ? 0xffe5d1 : 0xd6dcff, day ? 3.2 : 2.5)
      key.position.set(-20, 35, 20)
      scene.add(key)
      const rim = new THREE.DirectionalLight(day ? 0xc2b6ff : 0xb98cf6, day ? 1.2 : 2)
      rim.position.set(22, 12, -12)
      scene.add(rim)
      const camera = new THREE.OrthographicCamera(-45, 45, 10, -10, 0.1, 160)
      const city = buildMetropolis(THREE, scene, day)
      let raf = 0, visible = true, last = 0, elapsed = 0
      let focus = null, trainX = -16, targetX = 38, dwell = 0
      const pointer = { x: 0, y: 0, tx: 0, ty: 0 }
      function draw() {
        camera.position.set(9 + pointer.x * 1.2, 18 + pointer.y * 0.5, 56)
        camera.lookAt(pointer.x * 0.35, 4.5, -5)
        renderer.render(scene, camera)
      }
      function frame(now) {
        raf = 0
        if (disposed || !visible || document.hidden) return
        // Ambient transport needs only 30fps, including on high-refresh screens.
        if (now - last < 32 && !reduced) { raf = requestAnimationFrame(frame); return }
        const dt = Math.min((now - last) / 1000, 0.06)
        last = now
        if (!reduced) {
          elapsed += dt
          pointer.x += (pointer.tx - pointer.x) * 0.075
          pointer.y += (pointer.ty - pointer.y) * 0.075
          if (focus) targetX = DISTRICTS[focus]
          const dx = targetX - trainX
          if (Math.abs(dx) > 0.03) {
            trainX += Math.sign(dx) * Math.min(Math.abs(dx), dt * (focus ? 8 : 3.2))
            dwell = 0
          } else if (!focus) {
            dwell += dt
            if (dwell > 1.8) { targetX = targetX > 0 ? -38 : 38; dwell = 0 }
          }
          city.train.position.x = trainX
          for (const car of city.cars) {
            car.mesh.position.x += dt * car.direction * car.speed
            if (car.mesh.position.x > 43) car.mesh.position.x = -43
            if (car.mesh.position.x < -43) car.mesh.position.x = 43
          }
        }
        city.focus(focus ? DISTRICTS[focus] : null)
        city.animateWindows(elapsed, reduced)
        draw()
        if (!reduced) raf = requestAnimationFrame(frame)
      }
      function start() {
        if (!raf && visible && !document.hidden) {
          last = performance.now() - 34
          raf = requestAnimationFrame(frame)
        }
      }
      function resize() {
        const w = mount.clientWidth, h = mount.clientHeight
        if (!w || !h) return
        renderer.setSize(w, h, false)
        const aspect = w / h
        // Mobile deliberately crops to the central districts instead of shrinking
        // an entire metropolis into illegible pixels.
        const width = w < 600 ? 43 : w < 950 ? 67 : 94
        const height = Math.max(19, width / aspect)
        camera.left = -height * aspect / 2; camera.right = height * aspect / 2
        camera.top = height / 2; camera.bottom = -height / 2
        camera.updateProjectionMatrix()
        draw()
      }
      function onPointer(e) {
        if (reduced || !visible) return
        const r = mount.getBoundingClientRect()
        pointer.tx = Math.max(-1, Math.min(1, (e.clientX - r.left) / r.width * 2 - 1))
        pointer.ty = Math.max(-1, Math.min(1, (e.clientY - r.top) / r.height * 2 - 1))
      }
      function onFocus(e) {
        const d = e.detail?.district
        focus = Object.hasOwn(DISTRICTS, d) ? d : null
        if (!focus) targetX = trainX > 0 ? -38 : 38
        start()
      }
      function onVisibility() {
        if (document.hidden) { cancelAnimationFrame(raf); raf = 0 }
        else start()
      }
      function onContextLost(e) {
        e.preventDefault()
        cancelAnimationFrame(raf); raf = 0
        mount.dataset.webgl = 'fallback'
      }
      function onContextRestored() { mount.dataset.webgl = 'ready'; resize(); start() }
      const ro = new ResizeObserver(resize)
      const io = new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting
        if (visible) start()
        else { cancelAnimationFrame(raf); raf = 0 }
      }, { rootMargin: '80px 0px' })
      ro.observe(mount); io.observe(mount)
      window.addEventListener('pointermove', onPointer, { passive: true })
      window.addEventListener(SKYLINE_FOCUS_EVENT, onFocus)
      document.addEventListener('visibilitychange', onVisibility)
      renderer.domElement.addEventListener('webglcontextlost', onContextLost)
      renderer.domElement.addEventListener('webglcontextrestored', onContextRestored)
      resize(); start()
      cleanup = () => {
        cancelAnimationFrame(raf); ro.disconnect(); io.disconnect()
        window.removeEventListener('pointermove', onPointer)
        window.removeEventListener(SKYLINE_FOCUS_EVENT, onFocus)
        document.removeEventListener('visibilitychange', onVisibility)
        renderer.domElement.removeEventListener('webglcontextlost', onContextLost)
        renderer.domElement.removeEventListener('webglcontextrestored', onContextRestored)
        const geometries = new Set(), materials = new Set()
        scene.traverse((object) => {
          if (object.geometry) geometries.add(object.geometry)
          if (object.material) (Array.isArray(object.material) ? object.material : [object.material]).forEach(m => materials.add(m))
          if (object.isInstancedMesh) object.dispose()
        })
        geometries.forEach(g => g.dispose())
        materials.forEach(m => { m.map?.dispose(); m.dispose() })
        renderer.dispose()
        renderer.domElement.remove()
      }
    })()
    return () => { disposed = true; cleanup() }
  }, [mode, reduced])
  return <div ref={mountRef} className={['gh-skyline', className].filter(Boolean).join(' ')} aria-hidden="true" />
}
