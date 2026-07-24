// Quiet three.js daylight skyline behind the practice-module stage.
// Re-skinned for the light design system: pastel buildings, static pastel
// windows, no bloom, no flicker, no train, no parallax. The whole canvas is
// faded to ~10% opacity via CSS so it reads as atmosphere, never content.
// Camera motion is nearly imperceptible (a few px over ~12s). Pauses when the
// arcade is offscreen (is-paused on the viewport) and renders a single still
// frame when the visitor prefers reduced motion.
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
    scene.fog = new THREE.Fog(0xf6f2fb, 18, 60)
    const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 90)
    camera.position.set(0, 3.1, 15)

    scene.add(new THREE.AmbientLight(0xffffff, 0.95))
    const key = new THREE.DirectionalLight(0xffffff, 0.35)
    key.position.set(-6, 9, 6)
    scene.add(key)

    // Instanced skyline, two depth rows: far row mid tone, near row light tone
    const buildingGeo = new THREE.BoxGeometry(1, 1, 1)
    const buildingMat = new THREE.MeshLambertMaterial({ color: 0xffffff })
    const buildings = new THREE.InstancedMesh(buildingGeo, buildingMat, 46)
    const tmp = new THREE.Object3D()
    const tint = new THREE.Color()
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
        tint.setHex(row === 0 ? 0xd9cbe9 : 0xe7ddf3)
        buildings.setColorAt(bi, tint)
        bi += 1
      }
    }
    buildings.count = bi
    scene.add(buildings)

    // Windows: static pastel panes, violet with the occasional warm one
    const winGeo = new THREE.PlaneGeometry(0.22, 0.3)
    const winMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 })
    const windows = new THREE.InstancedMesh(winGeo, winMat, 220)
    const winColor = new THREE.Color()
    for (let i = 0; i < 220; i += 1) {
      const nearRow = i % 3 === 0
      const z = nearRow ? -15.1 : -25.1
      tmp.position.set(-29 + ((i * 17) % 580) / 10, 0.4 + ((i * 29) % 90) / 11, z)
      tmp.scale.setScalar(0.8 + ((i * 7) % 5) / 6)
      tmp.updateMatrix()
      windows.setMatrixAt(i, tmp.matrix)
      winColor.setHex(i % 4 === 0 ? 0xffd99a : 0xc4b0ff)
      windows.setColorAt(i, winColor)
    }
    scene.add(windows)

    // Pale ground plane
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(90, 14),
      new THREE.MeshBasicMaterial({ color: 0xefe9f6 }),
    )
    ground.rotation.x = -Math.PI / 2
    ground.position.set(0, -0.62, -8)
    scene.add(ground)

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = mount
      if (!w || !h) return
      // Render internally at 70% and upscale via CSS: the scene is a soft
      // pastel wash at 10% opacity, nobody can tell, and it halves fill-rate.
      renderer.setSize(Math.round(w * 0.7), Math.round(h * 0.7), false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(mount)

    const host = mount.closest('.gh-arcade-viewport') || mount

    let raf = 0
    const clock = new THREE.Clock()
    let elapsed = 0
    const renderFrame = () => {
      const dt = Math.min(clock.getDelta(), 0.05)
      elapsed += dt
      // Near-imperceptible drift: a couple of px of apparent motion per ~12s
      camera.position.x = Math.sin(elapsed * (Math.PI / 6)) * 0.06
      camera.position.y = 3.1 + Math.sin(elapsed * (Math.PI / 9)) * 0.03
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
      renderFrame() // single still frame: a static skyline
    } else {
      loop()
    }

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      renderer.dispose()
      buildingGeo.dispose(); buildingMat.dispose()
      winGeo.dispose(); winMat.dispose()
      ground.geometry.dispose(); ground.material.dispose()
      mount.removeChild(renderer.domElement)
    }
  }, [reduced])

  return <div ref={mountRef} className="gh-arcade-backdrop" aria-hidden/>
}
