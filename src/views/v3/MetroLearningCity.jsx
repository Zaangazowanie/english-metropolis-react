import { useEffect, useRef } from 'react'

const ROUTES = [
  { color: 0xd946ef, points: [[-5, -2.7], [-2.8, -1.2], [-0.8, -1.7], [1.6, -0.3], [4.8, -1.2]] },
  { color: 0x8b5cf6, points: [[-4.6, 2.5], [-2.2, 1.2], [0.2, 1.9], [2.2, 0.7], [4.7, 2.1]] },
  { color: 0x34d399, points: [[-4.4, -0.1], [-2.1, 0.5], [-0.2, -0.2], [2.1, 1.5], [4.5, 0.2]] },
]

function disposeScene(scene) {
  const geometries = new Set()
  const materials = new Set()
  scene.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry)
    const objectMaterials = Array.isArray(object.material) ? object.material : [object.material]
    objectMaterials.filter(Boolean).forEach((material) => materials.add(material))
  })
  geometries.forEach((geometry) => geometry.dispose())
  materials.forEach((material) => material.dispose())
}

export default function MetroLearningCity({ reduced = false, night = true, label }) {
  const hostRef = useRef(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return undefined

    let stopped = false
    let cleanup = () => {}

    const initialise = async () => {
      const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection
      if (connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType || '') ||
        (navigator.deviceMemory && navigator.deviceMemory <= 2)) {
        host.dataset.webgl = 'fallback'
        return
      }
      const THREE = await import('three')
      if (stopped) return

      let renderer
      try {
        renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' })
      } catch {
        host.dataset.webgl = 'fallback'
        return
      }

      let scene
      let rendererDisposed = false
      const disposeRenderer = () => {
        if (rendererDisposed) return
        rendererDisposed = true
        if (scene) disposeScene(scene)
        renderer.dispose()
        renderer.forceContextLoss?.()
        if (renderer.domElement.parentNode === host) host.removeChild(renderer.domElement)
      }
      cleanup = disposeRenderer

      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25))
      renderer.outputColorSpace = THREE.SRGBColorSpace
      renderer.setClearColor(0x000000, 0)
      renderer.domElement.setAttribute('aria-hidden', 'true')
      renderer.domElement.style.touchAction = 'pan-y'
      host.appendChild(renderer.domElement)
      host.dataset.webgl = 'ready'

      scene = new THREE.Scene()
      scene.fog = new THREE.FogExp2(night ? 0x100820 : 0xe8ddff, night ? 0.052 : 0.035)

      const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 80)
      camera.position.set(8.4, 7.2, 10.8)
      camera.lookAt(0, 0.7, 0)

      const city = new THREE.Group()
      city.rotation.y = -0.22
      city.rotation.x = -0.04
      scene.add(city)

      scene.add(new THREE.HemisphereLight(night ? 0xc4b5fd : 0xffffff, night ? 0x15082d : 0xbda6e8, 2.1))
      const keyLight = new THREE.DirectionalLight(0xf5d0fe, night ? 3.6 : 2.2)
      keyLight.position.set(4, 9, 6)
      scene.add(keyLight)
      const accentLight = new THREE.PointLight(0xd946ef, night ? 35 : 22, 18, 2)
      accentLight.position.set(-3.5, 3.5, 2.5)
      scene.add(accentLight)

      const floorMaterial = new THREE.MeshStandardMaterial({
        color: night ? 0x140b2d : 0xe9e0fb,
        roughness: 0.88,
        metalness: 0.12,
        transparent: true,
        opacity: night ? 0.78 : 0.72,
      })
      const floor = new THREE.Mesh(new THREE.CylinderGeometry(7.1, 7.1, 0.26, 64), floorMaterial)
      floor.position.y = -0.2
      city.add(floor)

      const grid = new THREE.GridHelper(12.5, 18, night ? 0x8b5cf6 : 0x7250b8, night ? 0x39235f : 0xc8b6ea)
      grid.position.y = -0.05
      grid.material.transparent = true
      grid.material.opacity = night ? 0.28 : 0.22
      city.add(grid)

      const buildingGeometry = new THREE.BoxGeometry(1, 1, 1)
      const buildingMaterial = new THREE.MeshStandardMaterial({
        color: night ? 0x33215c : 0x9a83c7,
        emissive: night ? 0x14052f : 0x24133f,
        emissiveIntensity: night ? 0.45 : 0.08,
        metalness: 0.24,
        roughness: 0.64,
      })
      const buildingCount = 38
      const buildings = new THREE.InstancedMesh(buildingGeometry, buildingMaterial, buildingCount)
      const dummy = new THREE.Object3D()
      for (let i = 0; i < buildingCount; i += 1) {
        const column = i % 8
        const row = Math.floor(i / 8)
        const height = 0.65 + ((i * 7) % 13) * 0.16
        const width = 0.46 + ((i * 3) % 5) * 0.08
        dummy.position.set((column - 3.5) * 1.35, height / 2, (row - 2) * 1.28)
        dummy.scale.set(width, height, width * (0.84 + (i % 3) * 0.08))
        dummy.rotation.y = ((i % 4) - 1.5) * 0.045
        dummy.updateMatrix()
        buildings.setMatrixAt(i, dummy.matrix)
      }
      buildings.instanceMatrix.needsUpdate = true
      city.add(buildings)

      const crownMaterial = new THREE.MeshStandardMaterial({
        color: 0xffb347,
        emissive: 0xff7a18,
        emissiveIntensity: night ? 1.8 : 0.65,
        metalness: 0.35,
        roughness: 0.34,
      })
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.58, 2.8, 6), crownMaterial)
      crown.position.set(0.1, 1.4, -0.15)
      city.add(crown)

      const stationMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0xffffff,
        emissiveIntensity: night ? 2.2 : 0.7,
        metalness: 0.18,
        roughness: 0.28,
      })
      const stationGeometry = new THREE.SphereGeometry(0.11, 16, 16)
      const stations = []

      ROUTES.forEach((route, routeIndex) => {
        const curvePoints = route.points.map(([x, z]) => new THREE.Vector3(x, 0.18 + routeIndex * 0.035, z))
        const curve = new THREE.CatmullRomCurve3(curvePoints)
        const routeMaterial = new THREE.MeshBasicMaterial({ color: route.color, transparent: true, opacity: night ? 0.92 : 0.78 })
        const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 64, 0.055, 8, false), routeMaterial)
        city.add(tube)

        curvePoints.forEach((point, pointIndex) => {
          if (pointIndex === 0 || pointIndex === curvePoints.length - 1 || pointIndex === 2) {
            const station = new THREE.Mesh(stationGeometry, stationMaterial)
            station.position.copy(point)
            station.position.y += 0.06
            station.userData.phase = routeIndex * 1.7 + pointIndex * 0.8
            city.add(station)
            stations.push(station)
          }
        })
      })

      const ringMaterial = new THREE.MeshBasicMaterial({ color: 0xd946ef, transparent: true, opacity: 0.34 })
      const ring = new THREE.Mesh(new THREE.TorusGeometry(3.7, 0.018, 8, 96), ringMaterial)
      ring.rotation.x = Math.PI / 2
      ring.position.y = 2.25
      city.add(ring)

      const particlePositions = []
      for (let i = 0; i < 90; i += 1) {
        const angle = i * 2.39996
        const radius = 3.8 + (i % 11) * 0.23
        particlePositions.push(Math.cos(angle) * radius, 0.8 + (i % 17) * 0.23, Math.sin(angle) * radius)
      }
      const particleGeometry = new THREE.BufferGeometry()
      particleGeometry.setAttribute('position', new THREE.Float32BufferAttribute(particlePositions, 3))
      const particles = new THREE.Points(particleGeometry, new THREE.PointsMaterial({
        color: night ? 0xf5d0fe : 0x8b5cf6,
        size: 0.045,
        transparent: true,
        opacity: night ? 0.62 : 0.38,
      }))
      city.add(particles)

      let frameId = 0
      let visible = true
      let dragging = false
      let lastPointerX = 0
      let targetRotationY = city.rotation.y
      let targetRotationX = city.rotation.x
      const startTime = performance.now()

      const render = () => renderer.render(scene, camera)
      const animate = (now) => {
        frameId = 0
        if (!visible || stopped || reduced) return
        const elapsed = (now - startTime) / 1000
        city.rotation.y += (targetRotationY - city.rotation.y) * 0.045
        city.rotation.x += (targetRotationX - city.rotation.x) * 0.045
        ring.rotation.z = elapsed * 0.075
        particles.rotation.y = -elapsed * 0.018
        stations.forEach((station) => {
          const pulse = 0.9 + Math.sin(elapsed * 2.1 + station.userData.phase) * 0.22
          station.scale.setScalar(pulse)
        })
        render()
        frameId = requestAnimationFrame(animate)
      }
      const startLoop = () => {
        if (!reduced && visible && !frameId) frameId = requestAnimationFrame(animate)
        if (reduced) render()
      }
      const stopLoop = () => {
        if (frameId) cancelAnimationFrame(frameId)
        frameId = 0
      }
      const onContextLost = (event) => {
        event.preventDefault()
        stopLoop()
        host.dataset.webgl = 'fallback'
      }
      const onContextRestored = () => {
        host.dataset.webgl = 'ready'
        render()
        startLoop()
      }

      const resize = () => {
        const width = Math.max(host.clientWidth, 1)
        const height = Math.max(host.clientHeight, 1)
        renderer.setSize(width, height, false)
        camera.aspect = width / height
        camera.updateProjectionMatrix()
        render()
      }
      const onPointerDown = (event) => {
        dragging = true
        lastPointerX = event.clientX
      }
      const onPointerMove = (event) => {
        const box = host.getBoundingClientRect()
        if (dragging) {
          targetRotationY += (event.clientX - lastPointerX) * 0.006
          lastPointerX = event.clientX
        } else {
          targetRotationY = -0.22 + ((event.clientX - box.left) / box.width - 0.5) * 0.34
        }
        targetRotationX = -0.04 + ((event.clientY - box.top) / box.height - 0.5) * 0.12
        if (reduced) {
          city.rotation.y = targetRotationY
          city.rotation.x = targetRotationX
          render()
        }
      }
      const onPointerUp = () => { dragging = false }
      const onPointerLeave = () => {
        dragging = false
        targetRotationY = -0.22
        targetRotationX = -0.04
      }

      let resizeObserver = null
      let visibilityObserver = null
      const removeRuntimeListeners = () => {
        stopLoop()
        resizeObserver?.disconnect()
        visibilityObserver?.disconnect()
        window.removeEventListener('resize', resize)
        host.removeEventListener('pointerdown', onPointerDown)
        host.removeEventListener('pointermove', onPointerMove)
        host.removeEventListener('pointerup', onPointerUp)
        host.removeEventListener('pointercancel', onPointerUp)
        host.removeEventListener('pointerleave', onPointerLeave)
        renderer.domElement.removeEventListener('webglcontextlost', onContextLost)
        renderer.domElement.removeEventListener('webglcontextrestored', onContextRestored)
        disposeRenderer()
      }
      cleanup = removeRuntimeListeners

      host.addEventListener('pointerdown', onPointerDown)
      host.addEventListener('pointermove', onPointerMove)
      host.addEventListener('pointerup', onPointerUp)
      host.addEventListener('pointercancel', onPointerUp)
      host.addEventListener('pointerleave', onPointerLeave)
      renderer.domElement.addEventListener('webglcontextlost', onContextLost)
      renderer.domElement.addEventListener('webglcontextrestored', onContextRestored)

      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(resize)
        resizeObserver.observe(host)
      } else {
        window.addEventListener('resize', resize)
      }
      if (typeof IntersectionObserver !== 'undefined') {
        visibilityObserver = new IntersectionObserver(([entry]) => {
          visible = entry.isIntersecting
          if (visible) startLoop(); else stopLoop()
        }, { rootMargin: '180px' })
        visibilityObserver.observe(host)
      }

      resize()
      startLoop()

    }

    initialise().catch(() => {
      cleanup()
      cleanup = () => {}
      if (!stopped) host.dataset.webgl = 'fallback'
    })

    return () => {
      stopped = true
      cleanup()
    }
  }, [night, reduced])

  return (
    <div ref={hostRef} className="gh-three-canvas" role="img" aria-label={label} data-webgl="loading">
      <div className="gh-three-css-fallback" aria-hidden>
        <span/><span/><span/><span/><span/><span/>
      </div>
    </div>
  )
}
