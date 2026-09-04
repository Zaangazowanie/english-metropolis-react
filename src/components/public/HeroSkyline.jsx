// HeroSkyline — the three.js city behind the landing hero (2026-09-03).
//
// Replaces the near-invisible 2D "signal field". This one is meant to be SEEN:
// three depth rows of instanced buildings, lit windows, a metro train on a rail
// along the base, day and night palettes that follow the site theme.
//
// It is functional, not wallpaper. The hero CTAs publish a district
// ("school" = book a lesson, "pricing", "world" = the 3D city) on hover/focus
// via the `englishmetro:skyline-focus` event; the matching cluster of
// buildings lights up and the train runs to it, so the skyline answers the
// visitor's intent before they click. Pointer position gives a gentle
// parallax. It pauses offscreen and when the tab is hidden, renders one still
// frame under prefers-reduced-motion, caps the pixel ratio at 1.5 and disposes
// everything on unmount.
import { useEffect, useRef } from 'react'
import { SKYLINE_FOCUS_EVENT } from './motionPolish.js'

const PALETTES = {
  night: {
    rows: [0x1b1040, 0x2a1a5e, 0x3b2680],
    edge: [0x3a2a78, 0x5637a8, 0x7a52d6],
    window: 0xffd7a3, windowCool: 0xf0abfc, windowOff: 0x2c1d5c,
    ground: 0x0d0822, rail: 0x6d4fd0, train: 0xf472b6, trainGlow: 0xfbcfe8,
    ambient: 0.55, key: 0.35, keyColor: 0xc4b5fd, fog: 0x0a0618,
    glow: 0xd946ef,
  },
  day: {
    rows: [0xcfc2ea, 0xb9a6e6, 0x9d84dc],
    edge: [0xb7a6de, 0x9d86d6, 0x7f60c9],
    window: 0xffffff, windowCool: 0xf5edff, windowOff: 0xc9bde6,
    ground: 0xefe9f8, rail: 0x8b5cf6, train: 0xd946ef, trainGlow: 0xfbcfe8,
    ambient: 0.95, key: 0.55, keyColor: 0xffffff, fog: 0xf7f3fd,
    glow: 0xa855f7,
  },
}

// District anchors along x for the three CTAs (world units).
const DISTRICTS = { school: -9, pricing: 0, world: 10 }

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
      const pal = PALETTES[mode === 'day' ? 'day' : 'night']
      let renderer
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' })
      } catch { mount.dataset.webgl = 'fallback'; return }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
      renderer.setClearColor(0x000000, 0)
      renderer.domElement.setAttribute('aria-hidden', 'true')
      mount.appendChild(renderer.domElement)
      mount.dataset.webgl = 'ready'

      const scene = new THREE.Scene()
      scene.fog = new THREE.Fog(pal.fog, 26, 70)
      const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 120)
      const CAM = { x: 0, y: 3.4, z: 26 }
      camera.position.set(CAM.x, CAM.y, CAM.z)

      scene.add(new THREE.AmbientLight(0xffffff, pal.ambient))
      const key = new THREE.DirectionalLight(pal.keyColor, pal.key)
      key.position.set(-8, 14, 10)
      scene.add(key)
      const glow = new THREE.PointLight(pal.glow, 0, 22, 1.6)
      glow.position.set(0, 3, -6)
      scene.add(glow)

      // ── buildings: three depth rows, deterministic layout ──
      const rows = [
        { z: -30, count: 34, step: 2.15, hMin: 2.6, hSpan: 7.5, w: 1.6 },
        { z: -20, count: 26, step: 2.9, hMin: 2.0, hSpan: 5.5, w: 1.9 },
        { z: -11, count: 18, step: 4.3, hMin: 1.4, hSpan: 4.6, w: 2.3 },
      ]
      const total = rows.reduce((n, r) => n + r.count, 0)
      const boxGeo = new THREE.BoxGeometry(1, 1, 1)
      const bodyMat = new THREE.MeshLambertMaterial({ color: 0xffffff })
      const buildings = new THREE.InstancedMesh(boxGeo, bodyMat, total)
      const edges = new THREE.InstancedMesh(new THREE.BoxGeometry(1.04, 1.0, 1.04), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: mode === 'day' ? 0.35 : 0.5, side: THREE.BackSide }), total)
      const tmp = new THREE.Object3D()
      const col = new THREE.Color()
      const meta = [] // per building: x, h, row, district weight
      let bi = 0
      const hash = (n) => { const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x) }
      rows.forEach((row, ri) => {
        for (let i = 0; i < row.count; i += 1) {
          const jitter = (hash(i * 7 + ri * 31) - 0.5) * row.step * 0.6
          const x = -((row.count - 1) * row.step) / 2 + i * row.step + jitter
          const tall = hash(i * 13 + ri * 5)
          const h = row.hMin + tall * tall * row.hSpan + (Math.abs(x) < 6 ? 1.6 : 0)
          const w = row.w * (0.75 + hash(i * 3 + ri) * 0.6)
          tmp.position.set(x, h / 2 - 0.5, row.z)
          tmp.scale.set(w, h, row.w)
          tmp.updateMatrix()
          buildings.setMatrixAt(bi, tmp.matrix)
          edges.setMatrixAt(bi, tmp.matrix)
          col.setHex(pal.rows[ri]).offsetHSL(0, 0, (hash(i + ri * 99) - 0.5) * 0.06)
          buildings.setColorAt(bi, col)
          edges.setColorAt(bi, col.setHex(pal.edge[ri]))
          meta.push({ x, h, w, z: row.z, ri })
          bi += 1
        }
      })
      buildings.instanceMatrix.needsUpdate = true
      scene.add(buildings, edges)

      // ── windows: instanced planes on the near two rows, per-window lit state ──
      const winGeo = new THREE.PlaneGeometry(0.26, 0.34)
      const winMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 })
      const windowsPer = []
      let winTotal = 0
      meta.forEach((b, i) => { if (b.ri > 0) { const n = Math.max(2, Math.floor(b.h * 1.6)); windowsPer.push([i, n]); winTotal += n } })
      const windows = new THREE.InstancedMesh(winGeo, winMat, winTotal)
      const winMeta = []
      let wi = 0
      const lit = new THREE.Color(pal.window), litCool = new THREE.Color(pal.windowCool), off = new THREE.Color(pal.windowOff)
      windowsPer.forEach(([bIndex, n]) => {
        const b = meta[bIndex]
        const cols = 2 + (n > 6 ? 1 : 0)
        for (let k = 0; k < n; k += 1) {
          const cx = b.x + ((k % cols) - (cols - 1) / 2) * 0.55
          const cy = 0.35 + Math.floor(k / cols) * 0.62
          if (cy > b.h - 0.4) break
          tmp.position.set(cx, cy, b.z + rows[b.ri].w / 2 + 0.02)
          tmp.rotation.set(0, 0, 0); tmp.scale.setScalar(1); tmp.updateMatrix()
          windows.setMatrixAt(wi, tmp.matrix)
          const on = hash(wi * 1.7) > (mode === 'day' ? 0.55 : 0.38)
          windows.setColorAt(wi, on ? (hash(wi * 3.3) > 0.75 ? litCool : lit) : off)
          winMeta.push({ bIndex, on, phase: hash(wi) * 6.28 })
          wi += 1
        }
      })
      windows.count = wi
      scene.add(windows)

      // ── ground, rail and the metro train ──
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(140, 40), new THREE.MeshBasicMaterial({ color: pal.ground }))
      ground.rotation.x = -Math.PI / 2; ground.position.set(0, -0.52, -12); scene.add(ground)
      const rail = new THREE.Mesh(new THREE.BoxGeometry(80, 0.08, 0.5), new THREE.MeshBasicMaterial({ color: pal.rail, transparent: true, opacity: mode === 'day' ? 0.55 : 0.8 }))
      rail.position.set(0, -0.46, -6.5); scene.add(rail)
      const train = new THREE.Group()
      const carMat = new THREE.MeshLambertMaterial({ color: pal.train, emissive: pal.train, emissiveIntensity: mode === 'day' ? 0.15 : 0.45 })
      for (let c = 0; c < 3; c += 1) {
        const car = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.62, 0.7), carMat)
        car.position.x = (c - 1) * 2.45
        train.add(car)
      }
      const headlight = new THREE.PointLight(pal.trainGlow, mode === 'day' ? 0.4 : 1.6, 7, 2)
      headlight.position.set(0, 0.2, 0.6)
      train.add(headlight)
      train.position.set(-30, -0.1, -6.5)
      scene.add(train)

      // ── state ──
      const pointer = { x: 0, y: 0, tx: 0, ty: 0 }
      let focus = null            // district name or null
      let focusX = 0              // where the glow should sit
      let glowTarget = 0
      let trainX = -30
      let trainTarget = 34
      let trainWaitUntil = 0
      let entrance = 0            // 0..1 rise-in progress
      let visible = true
      let raf = 0
      let last = performance.now()
      const t0 = last
      const colorScratch = new THREE.Color()

      const resize = () => {
        const w = mount.clientWidth, h = mount.clientHeight
        if (!w || !h) return
        renderer.setSize(w, h, false)
        camera.aspect = w / h
        camera.fov = w < 760 ? 52 : 38
        camera.updateProjectionMatrix()
      }
      resize()
      const ro = new ResizeObserver(resize)
      ro.observe(mount)

      const frame = (now) => {
        raf = 0
        const dt = Math.min(0.05, (now - last) / 1000)
        last = now
        const t = (now - t0) / 1000
        const still = reduced

        // entrance: buildings rise from the ground over ~1.1s (still: instant)
        if (entrance < 1) {
          entrance = still ? 1 : Math.min(1, entrance + dt / 1.1)
          const e = 1 - Math.pow(1 - entrance, 3)
          meta.forEach((b, i) => {
            const rowW = rows[b.ri].w
            const delay = Math.min(0.35, Math.abs(b.x) / 60)
            const local = Math.max(0, Math.min(1, (e - delay) / (1 - delay)))
            const h = Math.max(0.05, b.h * local)
            tmp.position.set(b.x, h / 2 - 0.5, b.z); tmp.rotation.set(0, 0, 0)
            tmp.scale.set(b.w, h, rowW); tmp.updateMatrix()
            buildings.setMatrixAt(i, tmp.matrix); edges.setMatrixAt(i, tmp.matrix)
          })
          buildings.instanceMatrix.needsUpdate = true; edges.instanceMatrix.needsUpdate = true
        }

        // parallax: pointer moves the camera a little, the far row least
        pointer.x += (pointer.tx - pointer.x) * (still ? 1 : 0.06)
        pointer.y += (pointer.ty - pointer.y) * (still ? 1 : 0.06)
        camera.position.x = CAM.x + pointer.x * 1.6
        camera.position.y = CAM.y + pointer.y * 0.5
        camera.lookAt(pointer.x * 0.6, 2.2, -18)

        // focus glow: slides to the district the visitor is considering
        glowTarget = focus ? (mode === 'day' ? 2.4 : 5.5) : 0
        glow.intensity += (glowTarget - glow.intensity) * (still ? 1 : 0.08)
        glow.position.x += (focusX - glow.position.x) * (still ? 1 : 0.08)

        // windows: slow twinkle; the focused district lights fully
        if (!still || focus) {
          for (let i = 0; i < winMeta.length; i += 1) {
            const wm = winMeta[i]; const b = meta[wm.bIndex]
            const near = focus ? Math.max(0, 1 - Math.abs(b.x - focusX) / 5.5) : 0
            let on = wm.on
            if (!still && !on && Math.sin(t * 0.7 + wm.phase) > 0.995) on = true
            const c = near > 0.2 ? litCool.clone().lerp(lit, near) : (on ? lit : off)
            colorScratch.copy(c)
            if (near > 0.2) colorScratch.offsetHSL(0, 0, near * 0.1)
            windows.setColorAt(i, colorScratch)
          }
          windows.instanceColor.needsUpdate = true
        }

        // train: shuttles along the rail; when a district is focused it goes there and waits
        if (!still) {
          if (focus) trainTarget = focusX
          const dx = trainTarget - trainX
          const speed = focus ? 14 : 7
          if (Math.abs(dx) > 0.05) {
            trainX += Math.sign(dx) * Math.min(Math.abs(dx), speed * dt)
            trainWaitUntil = 0
          } else if (!focus) {
            if (!trainWaitUntil) trainWaitUntil = now + 900
            else if (now > trainWaitUntil) { trainTarget = trainTarget > 0 ? -34 : 34; trainWaitUntil = 0 }
          }
          train.position.x = trainX
          train.rotation.y = dx < 0 ? Math.PI : 0
        }

        renderer.render(scene, camera)
        if (!still && visible && !document.hidden) raf = requestAnimationFrame(frame)
      }
      const start = () => { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame) } }

      const onPointer = (e) => {
        const r = mount.getBoundingClientRect()
        if (!r.width) return
        pointer.tx = ((e.clientX - r.left) / r.width - 0.5) * 2
        pointer.ty = -((e.clientY - r.top) / r.height - 0.5) * 2
        start()
      }
      const onFocus = (e) => {
        const d = e.detail?.district || null
        focus = d && d in DISTRICTS ? d : null
        if (focus) focusX = DISTRICTS[focus]
        start()
      }
      const onVisibility = () => { if (document.hidden) { cancelAnimationFrame(raf); raf = 0 } else start() }
      const io = new IntersectionObserver(([en]) => { visible = en.isIntersecting; if (visible) start(); else { cancelAnimationFrame(raf); raf = 0 } }, { rootMargin: '120px 0px' })
      io.observe(mount)
      window.addEventListener('pointermove', onPointer, { passive: true })
      window.addEventListener(SKYLINE_FOCUS_EVENT, onFocus)
      document.addEventListener('visibilitychange', onVisibility)

      // first frame (also the only frame under reduced motion)
      frame(performance.now())
      if (reduced) {
        // one more still pass so the entrance is complete and the train is placed
        entrance = 1; trainX = -6; train.position.x = trainX; renderer.render(scene, camera)
      }

      cleanup = () => {
        cancelAnimationFrame(raf)
        ro.disconnect(); io.disconnect()
        window.removeEventListener('pointermove', onPointer)
        window.removeEventListener(SKYLINE_FOCUS_EVENT, onFocus)
        document.removeEventListener('visibilitychange', onVisibility)
        scene.traverse((o) => { o.geometry?.dispose?.(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose?.()) })
        renderer.dispose()
        if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement)
      }
    })()

    return () => { disposed = true; cleanup() }
  }, [mode, reduced])

  return <div ref={mountRef} className={['gh-skyline', className].filter(Boolean).join(' ')} aria-hidden="true" />
}
