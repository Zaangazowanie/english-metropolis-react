// Animated three.js dusk-metro backdrop for the practice-module showcase.
// One shared scene behind every module: instanced skyline with lit windows,
// a metro train sliding through on a loop, twinkling stars, a low neon sun,
// idle camera drift plus gentle pointer parallax. Pauses when the arcade is
// offscreen (is-paused on the viewport) and renders a single still frame
// when the visitor prefers reduced motion.
import { useEffect, useRef } from 'react'
import * as THREE from 'three'

export default function ArcadeCityBackdrop({ reduced }) {
  const mountRef = useRef(null)

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return undefined

    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: 'low-power' })
    renderer.setPixelRatio(1)
    renderer.setClearColor(0x000000, 0)
    mount.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    scene.fog = new THREE.Fog(0x0d0818, 18, 60)
    const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 90)
    camera.position.set(0, 3.1, 15)

    scene.add(new THREE.AmbientLight(0x8f7fb8, 0.85))
    const key = new THREE.DirectionalLight(0xb983ff, 0.5)
    key.position.set(-6, 9, 6)
    scene.add(key)

    // Low sun behind the skyline
    const sun = new THREE.Mesh(
      new THREE.SphereGeometry(3.4, 24, 24),
      new THREE.MeshBasicMaterial({ color: 0xd9788f }),
    )
    sun.position.set(7, 2.4, -34)
    scene.add(sun)
    const sunGlow = new THREE.Mesh(
      new THREE.SphereGeometry(5.2, 24, 24),
      new THREE.MeshBasicMaterial({ color: 0xb983ff, transparent: true, opacity: 0.16 }),
    )
    sunGlow.position.copy(sun.position)
    scene.add(sunGlow)

    // Instanced skyline, two depth rows
    const buildingGeo = new THREE.BoxGeometry(1, 1, 1)
    const buildingMat = new THREE.MeshLambertMaterial({ color: 0x171126 })
    const buildings = new THREE.InstancedMesh(buildingGeo, buildingMat, 46)
    const tmp = new THREE.Object3D()
    let bi = 0
    for (let row = 0; row < 2; row += 1) {
      const z = row === 0 ? -26 : -16
      const count = row === 0 ? 26 : 20
      for (let i = 0; i < count; i += 1) {
        const w = 1.4 + ((i * 7) % 5) * 0.5
        const h = 2.2 + ((i * 13 + row * 5) % 9) * (row === 0 ? 1.15 : 0.75)
        const x = -30 + i * (row === 0 ? 2.4 : 3.1) + ((i * 11) % 3) * 0.4
        tmp.position.set(x, h / 2 - 0.6, z)
        tmp.scale.set(w, h, 1.6)
        tmp.updateMatrix()
        buildings.setMatrixAt(bi, tmp.matrix)
        bi += 1
      }
    }
    buildings.count = bi
    scene.add(buildings)

    // Lit windows: instanced planes scattered on the building faces
    const winGeo = new THREE.PlaneGeometry(0.22, 0.3)
    const winMat = new THREE.MeshBasicMaterial({ color: 0xb983ff, transparent: true, opacity: 0.85 })
    const windows = new THREE.InstancedMesh(winGeo, winMat, 220)
    const winColor = new THREE.Color()
    for (let i = 0; i < 220; i += 1) {
      const nearRow = i % 3 === 0
      const z = nearRow ? -15.1 : -25.1
      tmp.position.set(-29 + ((i * 17) % 580) / 10, 0.4 + ((i * 29) % 90) / 11, z)
      tmp.scale.setScalar(0.8 + ((i * 7) % 5) / 6)
      tmp.updateMatrix()
      windows.setMatrixAt(i, tmp.matrix)
      winColor.setHex([0xb983ff, 0x67d8d2, 0xf5d9a0][i % 3])
      windows.setColorAt(i, winColor)
    }
    scene.add(windows)

    // Elevated rail + train
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(64, 0.12, 0.5),
      new THREE.MeshLambertMaterial({ color: 0x241a33 }),
    )
    rail.position.set(0, 1.65, -10)
    scene.add(rail)
    const train = new THREE.Group()
    const carGeo = new THREE.BoxGeometry(2.5, 0.72, 0.72)
    const carMat = new THREE.MeshLambertMaterial({ color: 0x3d324d })
    const carGlowMat = new THREE.MeshBasicMaterial({ color: 0x67d8d2, transparent: true, opacity: 0.9 })
    for (let c = 0; c < 5; c += 1) {
      const car = new THREE.Mesh(carGeo, carMat)
      car.position.x = c * 2.75
      train.add(car)
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 0.2), carGlowMat)
      strip.position.set(c * 2.75, 0.08, 0.37)
      train.add(strip)
    }
    train.position.set(-46, 2.15, -10)
    scene.add(train)

    // Stars
    const starGeo = new THREE.BufferGeometry()
    const starPos = new Float32Array(150 * 3)
    for (let i = 0; i < 150; i += 1) {
      starPos[i * 3] = -40 + ((i * 37) % 800) / 10
      starPos[i * 3 + 1] = 6 + ((i * 53) % 260) / 14
      starPos[i * 3 + 2] = -30 - ((i * 19) % 140) / 10
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3))
    const starMat = new THREE.PointsMaterial({ color: 0xcabfe0, size: 0.14, transparent: true, opacity: 0.8 })
    scene.add(new THREE.Points(starGeo, starMat))

    // Street glow strip under the fog line
    const street = new THREE.Mesh(
      new THREE.PlaneGeometry(90, 14),
      new THREE.MeshBasicMaterial({ color: 0x110b1f }),
    )
    street.rotation.x = -Math.PI / 2
    street.position.set(0, -0.62, -8)
    scene.add(street)

    const pointer = { x: 0, y: 0, tx: 0, ty: 0 }
    const onPointer = (e) => {
      const rect = mount.getBoundingClientRect()
      pointer.tx = ((e.clientX - rect.left) / rect.width - 0.5) * 1.2
      pointer.ty = ((e.clientY - rect.top) / rect.height - 0.5) * 0.5
    }
    const host = mount.closest('.gh-arcade-viewport') || mount
    const finePointer = typeof matchMedia !== 'undefined' && matchMedia('(pointer: fine)').matches
    if (finePointer) host.addEventListener('pointermove', onPointer)

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = mount
      if (!w || !h) return
      // Render internally at 70% and upscale via CSS: the dusk scene is soft,
      // nobody can tell, and it cuts fill-rate by half.
      renderer.setSize(Math.round(w * 0.7), Math.round(h * 0.7), false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(mount)

    let raf = 0
    const clock = new THREE.Clock()
    let elapsed = 0
    const renderFrame = () => {
      const dt = Math.min(clock.getDelta(), 0.05)
      elapsed += dt
      // Train loop with a small sway
      train.position.x += dt * 6.2
      if (train.position.x > 46) train.position.x = -52
      train.position.y = 2.15 + Math.sin(elapsed * 7) * 0.015
      // Window shimmer
      winMat.opacity = 0.72 + Math.sin(elapsed * 1.7) * 0.13
      starMat.opacity = 0.65 + Math.sin(elapsed * 0.9) * 0.2
      // Idle drift + pointer parallax
      pointer.x += (pointer.tx - pointer.x) * 0.04
      pointer.y += (pointer.ty - pointer.y) * 0.04
      camera.position.x = Math.sin(elapsed * 0.11) * 0.7 + pointer.x
      camera.position.y = 3.1 + Math.sin(elapsed * 0.07) * 0.18 - pointer.y
      camera.lookAt(0, 2.2, -18)
      renderer.render(scene, camera)
    }
    let last = 0
    const loop = (ts) => {
      raf = requestAnimationFrame(loop)
      if (host.classList.contains('is-paused')) return
      if (ts - last < 33) return // ~30fps is plenty for an ambient backdrop
      last = ts
      renderFrame()
    }
    if (reduced) {
      renderFrame()
    } else {
      loop()
    }

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      host.removeEventListener('pointermove', onPointer)
      renderer.dispose()
      buildingGeo.dispose(); buildingMat.dispose()
      winGeo.dispose(); winMat.dispose()
      carGeo.dispose(); carMat.dispose(); carGlowMat.dispose()
      starGeo.dispose(); starMat.dispose()
      mount.removeChild(renderer.domElement)
    }
  }, [reduced])

  return <div ref={mountRef} className="gh-arcade-backdrop" aria-hidden/>
}
