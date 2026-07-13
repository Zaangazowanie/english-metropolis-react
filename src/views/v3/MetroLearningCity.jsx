import { useEffect, useRef } from 'react'

const ROUTES = [
  { color: 0xff4fa3, points: [[-5.7, -2.7], [-3.3, -1.25], [-1.1, -1.7], [1.55, -0.3], [5.55, -1.35]] },
  { color: 0x8b7dff, points: [[-5.4, 2.65], [-2.65, 1.1], [0.15, 2.0], [2.5, 0.72], [5.4, 2.18]] },
  { color: 0x4deeea, points: [[-5.35, -0.05], [-2.55, 0.58], [-0.25, -0.22], [2.2, 1.52], [5.3, 0.1]] },
]

function disposeScene(scene) {
  const geometries = new Set()
  const materials = new Set()
  const textures = new Set()
  scene.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry)
    const objectMaterials = Array.isArray(object.material) ? object.material : [object.material]
    objectMaterials.filter(Boolean).forEach((material) => {
      materials.add(material)
      Object.values(material).forEach((value) => {
        if (value?.isTexture) textures.add(value)
      })
    })
  })
  geometries.forEach((geometry) => geometry.dispose())
  materials.forEach((material) => material.dispose())
  textures.forEach((texture) => texture.dispose())
}

function makeBar(THREE, start, end, radius, material) {
  const delta = new THREE.Vector3().subVectors(end, start)
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, delta.length(), 7), material)
  bar.position.copy(start).add(end).multiplyScalar(0.5)
  bar.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize())
  return bar
}

function buildMiniTram(THREE, color) {
  const group = new THREE.Group()
  const shell = new THREE.MeshStandardMaterial({ color, metalness: 0.5, roughness: 0.3 })
  const chrome = new THREE.MeshStandardMaterial({ color: 0xcad5e8, metalness: 0.82, roughness: 0.2 })
  const glass = new THREE.MeshStandardMaterial({
    color: 0x143b62,
    emissive: 0x4deeea,
    emissiveIntensity: 1.15,
    metalness: 0.55,
    roughness: 0.14,
  })
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.34, 1.42), shell)
  body.position.y = 0.31
  const cab = new THREE.Mesh(new THREE.BoxGeometry(0.43, 0.28, 1.25), chrome)
  cab.position.y = 0.58
  group.add(body, cab)

  const dummy = new THREE.Object3D()
  const panes = new THREE.InstancedMesh(new THREE.BoxGeometry(0.018, 0.19, 0.26), glass, 6)
  const stripes = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.02, 0.055, 1.35),
    new THREE.MeshBasicMaterial({ color, toneMapped: false }),
    2,
  )
  const bogies = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.34, 0.11, 0.2),
    new THREE.MeshStandardMaterial({ color: 0x080d1b }),
    2,
  )
  let paneIndex = 0
  for (const side of [-1, 1]) {
    for (const z of [-0.42, 0, 0.42]) {
      dummy.position.set(side * 0.223, 0.59, z)
      dummy.updateMatrix()
      panes.setMatrixAt(paneIndex++, dummy.matrix)
    }
    dummy.position.set(side * 0.238, 0.36, 0)
    dummy.updateMatrix()
    stripes.setMatrixAt(side > 0 ? 1 : 0, dummy.matrix)
  }
  for (const [index, z] of [-0.46, 0.46].entries()) {
    dummy.position.set(0, 0.09, z)
    dummy.updateMatrix()
    bogies.setMatrixAt(index, dummy.matrix)
  }
  panes.instanceMatrix.needsUpdate = true
  stripes.instanceMatrix.needsUpdate = true
  bogies.instanceMatrix.needsUpdate = true
  group.add(panes, stripes, bogies)
  return group
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

      const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches
      const compactViewport = (host.clientWidth || window.innerWidth) < 720
      const limitedMemory = navigator.deviceMemory && navigator.deviceMemory <= 4
      const limitedCores = navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4
      const quality = coarsePointer || compactViewport || limitedMemory || limitedCores ? 'balanced' : 'high'
      host.dataset.quality = quality

      const THREE = await import('three')
      if (stopped) return

      let renderer
      try {
        renderer = new THREE.WebGLRenderer({
          alpha: true,
          antialias: quality === 'high',
          powerPreference: quality === 'high' ? 'high-performance' : 'default',
        })
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

      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality === 'high' ? 1.35 : 1))
      renderer.outputColorSpace = THREE.SRGBColorSpace
      renderer.toneMapping = THREE.ACESFilmicToneMapping
      renderer.toneMappingExposure = night ? 1.12 : 1.02
      renderer.setClearColor(0x000000, 0)
      renderer.domElement.setAttribute('aria-hidden', 'true')
      renderer.domElement.style.touchAction = 'pan-y'
      host.appendChild(renderer.domElement)
      host.dataset.webgl = 'ready'

      scene = new THREE.Scene()
      scene.fog = new THREE.FogExp2(night ? 0x080d20 : 0xd9d6ee, night ? 0.038 : 0.027)

      const camera = new THREE.PerspectiveCamera(37, 1, 0.1, 90)
      camera.position.set(8.1, 6.25, 10.1)
      camera.lookAt(0, 1.15, 0)

      const city = new THREE.Group()
      city.rotation.y = -0.25
      city.rotation.x = -0.045
      scene.add(city)

      scene.add(new THREE.HemisphereLight(night ? 0x99e8ff : 0xffffff, night ? 0x1a1038 : 0xa899cc, 2.3))
      const keyLight = new THREE.DirectionalLight(night ? 0xffa3bd : 0xfff5ff, night ? 3.2 : 2.25)
      keyLight.position.set(-4, 9, 6)
      scene.add(keyLight)
      const cyanLight = new THREE.PointLight(0x4deeea, night ? 42 : 18, 18, 2)
      cyanLight.position.set(4.2, 3.4, 3.2)
      const pinkLight = new THREE.PointLight(0xff4fa3, night ? 46 : 20, 18, 2)
      pinkLight.position.set(-4.5, 4.1, -2.4)
      scene.add(cyanLight, pinkLight)

      const floorMaterial = new THREE.MeshStandardMaterial({
        color: night ? 0x111a32 : 0xd6d4e9,
        roughness: 0.48,
        metalness: 0.42,
        transparent: true,
        opacity: night ? 0.92 : 0.86,
      })
      const roundSegments = quality === 'high' ? 64 : 40
      const floor = new THREE.Mesh(new THREE.CylinderGeometry(7.25, 7.25, 0.32, roundSegments), floorMaterial)
      floor.position.y = -0.24
      city.add(floor)

      const water = new THREE.Mesh(
        new THREE.RingGeometry(5.9, 7.12, roundSegments),
        new THREE.MeshStandardMaterial({
          color: night ? 0x0a4c68 : 0x88d8e2,
          emissive: night ? 0x062a4e : 0x163447,
          emissiveIntensity: night ? 0.72 : 0.18,
          metalness: 0.78,
          roughness: 0.13,
          transparent: true,
          opacity: 0.82,
          side: THREE.DoubleSide,
        }),
      )
      water.rotation.x = -Math.PI / 2
      water.position.y = -0.045
      city.add(water)

      const innerDeck = new THREE.Mesh(
        new THREE.CircleGeometry(5.82, roundSegments),
        new THREE.MeshStandardMaterial({ color: night ? 0x18233f : 0xe2e0f0, roughness: 0.6, metalness: 0.26 }),
      )
      innerDeck.rotation.x = -Math.PI / 2
      innerDeck.position.y = -0.035
      city.add(innerDeck)

      // Cross-city streets and slimmer side streets make the urban fabric legible.
      const roadMaterial = new THREE.MeshStandardMaterial({ color: night ? 0x080f22 : 0x8790a7, roughness: 0.76, metalness: 0.22 })
      for (const [w, h, x, z, rz] of [
        [11.2, 0.8, 0, 0, 0], [0.82, 11.2, 0, 0, 0], [9.2, 0.38, 0.2, 2.55, 0.22],
        [8.8, 0.38, -0.5, -2.45, -0.28],
      ]) {
        const road = new THREE.Mesh(new THREE.PlaneGeometry(w, h), roadMaterial)
        road.rotation.x = -Math.PI / 2
        road.rotation.z = rz
        road.position.set(x, -0.012, z)
        city.add(road)
      }

      const buildingSites = []
      for (let row = -3; row <= 3; row += 1) {
        for (let col = -4; col <= 4; col += 1) {
          if (Math.abs(row) < 1 && Math.abs(col) < 2) continue
          if ((row + col + 20) % 7 === 0) continue
          const x = col * 1.23 + Math.sin((row + 4) * 1.7 + col) * 0.12
          const z = row * 1.23 + Math.cos((col + 5) * 1.4 + row) * 0.12
          if (Math.hypot(x, z) > 5.7) continue
          const seed = (row + 5) * 31 + (col + 6) * 17
          if (quality === 'balanced' && seed % 4 === 0) continue
          buildingSites.push({
            x, z,
            width: 0.56 + (seed % 5) * 0.075,
            depth: 0.55 + ((seed * 3) % 5) * 0.072,
            height: 0.86 + ((seed * 7) % 17) * 0.19,
            yaw: ((seed % 4) - 1.5) * 0.035,
            tone: seed % 6,
          })
        }
      }

      const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.38, roughness: 0.48 })
      const chromeMaterial = new THREE.MeshStandardMaterial({ color: night ? 0xaabbd2 : 0x7f7b9f, metalness: 0.84, roughness: 0.2 })
      const cyanWindowMaterial = new THREE.MeshBasicMaterial({ color: 0x4deeea, toneMapped: false })
      const pinkWindowMaterial = new THREE.MeshBasicMaterial({ color: 0xff4fa3, toneMapped: false })
      const baseBlocks = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), bodyMaterial, buildingSites.length)
      const upperBlocks = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), bodyMaterial, buildingSites.length)
      const balconyBands = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), chromeMaterial, buildingSites.length * 4)
      const roofCrowns = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 10), chromeMaterial, buildingSites.length)
      const fins = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), pinkWindowMaterial, buildingSites.length * 2)
      const cyanWindows = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), cyanWindowMaterial, 1300)
      const pinkWindows = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), pinkWindowMaterial, 500)
      const dummy = new THREE.Object3D()
      const local = new THREE.Vector3()
      const yAxis = new THREE.Vector3(0, 1, 0)
      const tones = night
        ? [0x273b64, 0x314f6c, 0x423c71, 0x285968, 0x35445f, 0x51406e]
        : [0x8fa4c9, 0xa5b7ce, 0x9d91bd, 0x82b5bb, 0xa9a3c6, 0xb09bb8]
      let baseCount = 0, upperCount = 0, bandCount = 0, crownCount = 0, finCount = 0
      let cyanCount = 0, pinkCount = 0
      const place = (mesh, index, site, lx, ly, lz, sx, sy, sz, extraYaw = 0) => {
        local.set(lx, ly, lz).applyAxisAngle(yAxis, site.yaw)
        dummy.position.set(site.x + local.x, local.y, site.z + local.z)
        dummy.rotation.set(0, site.yaw + extraYaw, 0)
        dummy.scale.set(sx, sy, sz)
        dummy.updateMatrix()
        mesh.setMatrixAt(index, dummy.matrix)
      }
      const pane = (site, lx, ly, lz, sx, sy, extraYaw, pink) => {
        if (pink) place(pinkWindows, pinkCount++, site, lx, ly, lz, sx, sy, 0.018, extraYaw)
        else place(cyanWindows, cyanCount++, site, lx, ly, lz, sx, sy, 0.018, extraYaw)
      }

      buildingSites.forEach((site, siteIndex) => {
        const lowerHeight = site.height * (site.height > 2.4 ? 0.58 : 0.84)
        const upperHeight = Math.max(0.18, site.height - lowerHeight)
        const upperScale = site.height > 2.4 ? 0.72 : 0.84
        place(baseBlocks, baseCount, site, 0, lowerHeight / 2, 0, site.width, lowerHeight, site.depth)
        baseBlocks.setColorAt(baseCount++, new THREE.Color(tones[site.tone]))
        place(upperBlocks, upperCount, site, 0, lowerHeight + upperHeight / 2, 0,
          site.width * upperScale, upperHeight, site.depth * upperScale)
        upperBlocks.setColorAt(upperCount++, new THREE.Color(tones[(site.tone + 1) % tones.length]))

        const bandTotal = Math.min(4, Math.max(1, Math.floor(site.height / 0.9)))
        for (let band = 0; band < bandTotal; band += 1) {
          const y = 0.72 + band * ((site.height - 0.45) / bandTotal)
          const scale = y > lowerHeight ? upperScale + 0.04 : 1.04
          place(balconyBands, bandCount++, site, 0, y, 0, site.width * scale, 0.035, site.depth * scale)
        }
        place(roofCrowns, crownCount++, site, 0, site.height + 0.12, 0, site.width * 0.2, 0.24, site.depth * 0.2)
        place(fins, finCount++, site, 0, site.height * 0.62, site.depth * 0.51, 0.035, site.height * 0.58, 0.025)
        place(fins, finCount++, site, 0, 0.52, site.depth * 0.54, site.width * 0.46, 0.045, 0.025)

        for (let y = 0.38, floorIndex = 0; y < site.height - 0.18; y += 0.4, floorIndex += 1) {
          const tierScale = y > lowerHeight ? upperScale : 1
          const width = site.width * tierScale
          const depth = site.depth * tierScale
          const frontCols = Math.max(2, Math.floor(width / 0.24))
          for (let col = 0; col < frontCols; col += 1) {
            const x = (col - (frontCols - 1) / 2) * (width * 0.75 / Math.max(frontCols - 1, 1))
            pane(site, x, y, depth / 2 + 0.012, 0.105, 0.18, 0, (siteIndex + floorIndex + col) % 9 === 0)
          }
          for (const side of [-1, 1]) {
            const sideCols = Math.max(1, Math.floor(depth / 0.28))
            for (let col = 0; col < sideCols; col += 1) {
              const z = (col - (sideCols - 1) / 2) * (depth * 0.72 / Math.max(sideCols - 1, 1))
              pane(site, side * (width / 2 + 0.012), y, z, 0.105, 0.18,
                side > 0 ? Math.PI / 2 : -Math.PI / 2, (siteIndex + floorIndex + col + 3) % 11 === 0)
            }
          }
        }
      })

      baseBlocks.count = baseCount
      upperBlocks.count = upperCount
      balconyBands.count = bandCount
      roofCrowns.count = crownCount
      fins.count = finCount
      cyanWindows.count = cyanCount
      pinkWindows.count = pinkCount
      for (const mesh of [baseBlocks, upperBlocks, balconyBands, roofCrowns, fins, cyanWindows, pinkWindows]) {
        mesh.instanceMatrix.needsUpdate = true
      }
      if (baseBlocks.instanceColor) baseBlocks.instanceColor.needsUpdate = true
      if (upperBlocks.instanceColor) upperBlocks.instanceColor.needsUpdate = true
      city.add(baseBlocks, upperBlocks, balconyBands, roofCrowns, fins, cyanWindows, pinkWindows)

      // Central language beacon: tiered, ringed and asymmetric, not another box.
      const beacon = new THREE.Group()
      const beaconMaterial = new THREE.MeshStandardMaterial({
        color: 0xff755f,
        emissive: 0xff4f81,
        emissiveIntensity: night ? 1.28 : 0.42,
        metalness: 0.46,
        roughness: 0.27,
      })
      const beaconCore = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.68, 3.45, 12), beaconMaterial)
      beaconCore.position.y = 1.72
      const beaconTop = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.42, 1.28, 12), chromeMaterial)
      beaconTop.position.y = 4.04
      beacon.add(beaconCore, beaconTop)
      for (const y of [0.7, 1.45, 2.2, 2.95, 3.5]) {
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(0.57 - y * 0.035, 0.035, 8, 32),
          new THREE.MeshBasicMaterial({ color: y % 1 < 0.5 ? 0x4deeea : 0xff4fa3, toneMapped: false }),
        )
        ring.rotation.x = Math.PI / 2
        ring.position.y = y
        beacon.add(ring)
      }
      const spire = makeBar(THREE, new THREE.Vector3(0, 4.5, 0), new THREE.Vector3(0.2, 5.45, 0), 0.035, pinkWindowMaterial)
      beacon.add(spire)
      city.add(beacon)

      const routeCurves = []
      const stations = []
      ROUTES.forEach((route, routeIndex) => {
        const curvePoints = route.points.map(([x, z]) => new THREE.Vector3(x, 0.12 + routeIndex * 0.032, z))
        const curve = new THREE.CatmullRomCurve3(curvePoints)
        routeCurves.push(curve)
        const routeMaterial = new THREE.MeshBasicMaterial({ color: route.color, transparent: true, opacity: night ? 0.98 : 0.76, toneMapped: false })
        city.add(new THREE.Mesh(new THREE.TubeGeometry(
          curve,
          quality === 'high' ? 72 : 42,
          0.045,
          quality === 'high' ? 8 : 6,
          false,
        ), routeMaterial))
        curvePoints.forEach((point, pointIndex) => {
          if (pointIndex === 0 || pointIndex === curvePoints.length - 1 || pointIndex === 2) {
            const station = new THREE.Group()
            const disc = new THREE.Mesh(
              new THREE.CylinderGeometry(0.13, 0.18, 0.08, 18),
              new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: route.color, emissiveIntensity: night ? 1.8 : 0.55 }),
            )
            const halo = new THREE.Mesh(
              new THREE.TorusGeometry(0.21, 0.018, 8, 24),
              new THREE.MeshBasicMaterial({ color: route.color, toneMapped: false }),
            )
            halo.rotation.x = Math.PI / 2
            halo.position.y = 0.055
            station.position.copy(point)
            station.userData.phase = routeIndex * 1.7 + pointIndex * 0.8
            station.add(disc, halo)
            city.add(station)
            stations.push(station)
          }
        })
      })

      const trams = routeCurves.slice(0, 2).map((curve, index) => {
        const object = buildMiniTram(THREE, ROUTES[index].color)
        object.scale.setScalar(0.82)
        city.add(object)
        return {
          object,
          curve,
          phase: index * 0.47,
          speed: 0.035 + index * 0.006,
          position: new THREE.Vector3(),
          tangent: new THREE.Vector3(),
        }
      })

      // Palm-lined waterfront makes the city feel coastal rather than abstract.
      const palmCount = quality === 'high' ? 12 : 8
      const trunks = new THREE.InstancedMesh(
        new THREE.CylinderGeometry(0.045, 0.08, 1, 7),
        new THREE.MeshStandardMaterial({ color: 0x805147, roughness: 0.78 }),
        palmCount,
      )
      const leaves = new THREE.InstancedMesh(
        new THREE.ConeGeometry(0.075, 1.15, 3),
        new THREE.MeshStandardMaterial({ color: night ? 0x2fa98b : 0x3f9d82, roughness: 0.62 }),
        palmCount * 6,
      )
      let leafCount = 0
      for (let i = 0; i < palmCount; i += 1) {
        const angle = (i / palmCount) * Math.PI * 2 + 0.18
        const x = Math.cos(angle) * 5.48
        const z = Math.sin(angle) * 5.48
        const height = 1.02 + (i % 3) * 0.08
        dummy.position.set(x, height / 2, z)
        dummy.rotation.set(0, angle, 0)
        dummy.scale.set(1, height, 1)
        dummy.updateMatrix()
        trunks.setMatrixAt(i, dummy.matrix)
        for (let leaf = 0; leaf < 6; leaf += 1) {
          const yaw = angle + (leaf / 6) * Math.PI * 2
          dummy.position.set(x + Math.sin(yaw) * 0.34, height + 0.02, z + Math.cos(yaw) * 0.34)
          dummy.rotation.set(Math.PI / 2 + 0.22, yaw, 0)
          dummy.scale.set(1, 1, 1)
          dummy.updateMatrix()
          leaves.setMatrixAt(leafCount++, dummy.matrix)
        }
      }
      trunks.instanceMatrix.needsUpdate = true
      leaves.instanceMatrix.needsUpdate = true
      city.add(trunks, leaves)

      const orbitRing = new THREE.Mesh(
        new THREE.TorusGeometry(4.25, 0.014, 8, quality === 'high' ? 128 : 72),
        new THREE.MeshBasicMaterial({ color: 0xff4fa3, transparent: true, opacity: 0.4, toneMapped: false }),
      )
      orbitRing.rotation.x = Math.PI / 2
      orbitRing.position.y = 3.0
      city.add(orbitRing)

      const particlePositions = []
      const particleCount = quality === 'high' ? 150 : 72
      for (let i = 0; i < particleCount; i += 1) {
        const angle = i * 2.39996
        const radius = 3.8 + (i % 13) * 0.24
        particlePositions.push(Math.cos(angle) * radius, 0.65 + (i % 21) * 0.2, Math.sin(angle) * radius)
      }
      const particleGeometry = new THREE.BufferGeometry()
      particleGeometry.setAttribute('position', new THREE.Float32BufferAttribute(particlePositions, 3))
      const particles = new THREE.Points(particleGeometry, new THREE.PointsMaterial({
        color: night ? 0x9ffcf1 : 0x765ec8,
        size: 0.036,
        transparent: true,
        opacity: night ? 0.62 : 0.34,
        depthWrite: false,
      }))
      city.add(particles)

      let frameId = 0
      let visible = true
      let dragging = false
      let lastPointerX = 0
      let targetRotationY = city.rotation.y
      let targetRotationX = city.rotation.x
      let hoverYaw = 0
      const startTime = performance.now()
      let lastFrame = startTime
      let lastPaint = startTime - (quality === 'balanced' ? 1000 / 30 : 0)
      const frameInterval = quality === 'balanced' ? 1000 / 30 : 0

      const render = () => renderer.render(scene, camera)
      const animate = (now) => {
        frameId = 0
        if (!visible || stopped || reduced) return
        if (frameInterval && now - lastPaint < frameInterval) {
          frameId = requestAnimationFrame(animate)
          return
        }
        const elapsed = (now - startTime) / 1000
        const delta = Math.min((now - lastFrame) / 1000, 0.05)
        lastFrame = now
        lastPaint = now
        if (!dragging) targetRotationY += delta * 0.025
        const follow = 1 - Math.exp(-delta * 6)
        city.rotation.y += (targetRotationY + hoverYaw - city.rotation.y) * follow
        city.rotation.x += (targetRotationX - city.rotation.x) * follow
        orbitRing.rotation.z = elapsed * 0.065
        particles.rotation.y = -elapsed * 0.014
        water.material.emissiveIntensity = (night ? 0.66 : 0.16) + Math.sin(elapsed * 0.72) * 0.08
        stations.forEach((station) => {
          const pulse = 0.92 + Math.sin(elapsed * 2.2 + station.userData.phase) * 0.16
          station.scale.setScalar(pulse)
        })
        trams.forEach((tram) => {
          const progress = (tram.phase + elapsed * tram.speed) % 1
          tram.curve.getPointAt(progress, tram.position)
          tram.curve.getTangentAt(progress, tram.tangent)
          tram.object.position.copy(tram.position)
          tram.object.position.y += 0.08
          tram.object.rotation.y = Math.atan2(tram.tangent.x, tram.tangent.z)
        })
        render()
        frameId = requestAnimationFrame(animate)
      }
      const startLoop = () => {
        if (!reduced && visible && !frameId) {
          lastFrame = performance.now()
          frameId = requestAnimationFrame(animate)
        }
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
        const portraitScale = Math.min(1.3, 1 + Math.max(0, 1 - camera.aspect) * 0.72)
        camera.position.set(8.1 * portraitScale, 6.25 * portraitScale, 10.1 * portraitScale)
        camera.lookAt(0, 1.15, 0)
        camera.updateProjectionMatrix()
        render()
      }
      const onPointerDown = (event) => {
        dragging = true
        hoverYaw = 0
        lastPointerX = event.clientX
        renderer.domElement.setPointerCapture?.(event.pointerId)
      }
      const onPointerMove = (event) => {
        const box = host.getBoundingClientRect()
        const horizontal = ((event.clientX - box.left) / Math.max(box.width, 1)) - 0.5
        const vertical = ((event.clientY - box.top) / Math.max(box.height, 1)) - 0.5
        if (dragging) {
          targetRotationY += (event.clientX - lastPointerX) * 0.006
          lastPointerX = event.clientX
          targetRotationX = -0.045 + vertical * 0.1
        } else if (!reduced) {
          hoverYaw = horizontal * 0.16
          targetRotationX = -0.045 + vertical * 0.08
        }
        if (reduced && dragging) {
          city.rotation.y = targetRotationY
          city.rotation.x = targetRotationX
          render()
        }
      }
      const onPointerUp = (event) => {
        dragging = false
        if (renderer.domElement.hasPointerCapture?.(event.pointerId)) {
          renderer.domElement.releasePointerCapture(event.pointerId)
        }
      }
      const onPointerLeave = () => {
        dragging = false
        hoverYaw = 0
        targetRotationX = -0.045
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
          if (visible) startLoop()
          else stopLoop()
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
