import { useEffect, useRef } from 'react'

const ROUTES = [
  { color: 0xff4fa3, points: [[-5.45, -2.42], [-2.7, -2.32], [0, -2.44], [2.72, -2.3], [5.45, -2.4]] },
  { color: 0x8b7dff, points: [[-5.45, 2.42], [-2.72, 2.3], [0, 2.44], [2.7, 2.31], [5.45, 2.4]] },
  { color: 0x4deeea, points: [[2.42, -5.35], [2.32, -2.68], [2.45, 0], [2.31, 2.7], [2.4, 5.35]] },
]

const MEDIA_CAMPAIGNS = [
  { kicker: 'ENGLISHMETRO', title: 'SPEAK|THE CITY', background: '#ff3f9f', ink: '#071225' },
  { kicker: 'LIVE LANGUAGE', title: 'WORDS|IN MOTION', background: '#43e8df', ink: '#071225' },
  { kicker: 'CENTRAL HUB', title: 'LIVE 1:1|EVERY DAY', background: '#f7b43a', ink: '#151027' },
  { kicker: 'NIGHT MARKET', title: 'TASTE|MEET TALK', background: '#8b7dff', ink: '#ffffff' },
  { kicker: 'NEXT STOP', title: 'FLUENCY|EXPRESS', background: '#ff715b', ink: '#071225' },
]

function distanceToSegment(x, z, [ax, az], [bx, bz]) {
  const dx = bx - ax
  const dz = bz - az
  const lengthSquared = dx * dx + dz * dz
  const amount = lengthSquared ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / lengthSquared)) : 0
  return Math.hypot(x - (ax + dx * amount), z - (az + dz * amount))
}

function distanceToRoute(x, z, points) {
  let distance = Infinity
  for (let index = 1; index < points.length; index += 1) {
    distance = Math.min(distance, distanceToSegment(x, z, points[index - 1], points[index]))
  }
  return distance
}

function makeMediaTexture(THREE, campaign) {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 256
  const context = canvas.getContext('2d')
  context.fillStyle = campaign.background
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = campaign.ink
  context.fillRect(0, 0, 18, canvas.height)
  context.font = '700 28px Arial, sans-serif'
  context.fillText(campaign.kicker, 44, 56)
  context.font = '900 68px Arial, sans-serif'
  campaign.title.split('|').forEach((line, index) => context.fillText(line, 42, 134 + index * 72))
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

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

function buildMiniCar(THREE, color) {
  const group = new THREE.Group()
  const paint = new THREE.MeshStandardMaterial({ color, metalness: 0.62, roughness: 0.26 })
  const glass = new THREE.MeshStandardMaterial({
    color: 0x10284c,
    emissive: 0x4deeea,
    emissiveIntensity: 0.72,
    metalness: 0.56,
    roughness: 0.16,
  })
  const light = new THREE.MeshBasicMaterial({ color: 0xffd66b, toneMapped: false })
  const tail = new THREE.MeshBasicMaterial({ color: 0xff315c, toneMapped: false })
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.15, 0.68), paint)
  body.position.y = 0.13
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.29, 0.14, 0.34), glass)
  cabin.position.set(0, 0.25, -0.015)
  const frontLights = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.045, 0.025), light)
  frontLights.position.set(0, 0.15, 0.35)
  const tailLights = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.045, 0.025), tail)
  tailLights.position.set(0, 0.15, -0.35)
  group.add(body, cabin, frontLights, tailLights)
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

      // A legible road hierarchy keeps traffic separate from the protected tram corridors.
      const roadMaterial = new THREE.MeshStandardMaterial({ color: night ? 0x080f22 : 0x8790a7, roughness: 0.76, metalness: 0.22 })
      for (const [w, h, x, z] of [[11.2, 0.92, 0, 0], [0.92, 11.2, 0, 0]]) {
        const road = new THREE.Mesh(new THREE.PlaneGeometry(w, h), roadMaterial)
        road.rotation.x = -Math.PI / 2
        road.position.set(x, -0.012, z)
        city.add(road)
      }
      const ringRoad = new THREE.Mesh(
        new THREE.RingGeometry(4.68, 5.22, roundSegments),
        roadMaterial,
      )
      ringRoad.rotation.x = -Math.PI / 2
      ringRoad.position.y = -0.011
      city.add(ringRoad)

      const roadMarkMaterial = new THREE.MeshBasicMaterial({ color: night ? 0xc9d9ee : 0xf5f5f7, toneMapped: false })
      const roadMarks = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), roadMarkMaterial, 88)
      const roadDummy = new THREE.Object3D()
      let roadMarkCount = 0
      for (let amount = -4.7; amount <= 4.7; amount += 0.72) {
        for (const lane of [-0.23, 0.23]) {
          roadDummy.position.set(amount, 0.016, lane)
          roadDummy.rotation.set(0, 0, 0)
          roadDummy.scale.set(0.38, 0.012, 0.018)
          roadDummy.updateMatrix()
          roadMarks.setMatrixAt(roadMarkCount++, roadDummy.matrix)

          roadDummy.position.set(lane, 0.016, amount)
          roadDummy.rotation.set(0, Math.PI / 2, 0)
          roadDummy.updateMatrix()
          roadMarks.setMatrixAt(roadMarkCount++, roadDummy.matrix)
        }
      }
      for (let index = -4; index <= 4; index += 1) {
        roadDummy.position.set(index * 0.085, 0.019, 0.65)
        roadDummy.rotation.set(0, 0, 0)
        roadDummy.scale.set(0.048, 0.014, 0.28)
        roadDummy.updateMatrix()
        roadMarks.setMatrixAt(roadMarkCount++, roadDummy.matrix)
        roadDummy.position.set(0.65, 0.019, index * 0.085)
        roadDummy.rotation.set(0, Math.PI / 2, 0)
        roadDummy.updateMatrix()
        roadMarks.setMatrixAt(roadMarkCount++, roadDummy.matrix)
      }
      roadMarks.count = roadMarkCount
      roadMarks.instanceMatrix.needsUpdate = true
      city.add(roadMarks)
      const ringLaneMark = new THREE.Mesh(
        new THREE.TorusGeometry(4.95, 0.018, 6, roundSegments),
        roadMarkMaterial,
      )
      ringLaneMark.rotation.x = Math.PI / 2
      ringLaneMark.position.y = 0.018
      city.add(ringLaneMark)

      const buildingSites = []
      const reservedPlazas = [[-1.45, 1.28, 0.78], [1.48, -1.28, 0.8], [-1.48, -1.3, 0.62]]
      for (let row = -3; row <= 3; row += 1) {
        for (let col = -4; col <= 4; col += 1) {
          if (Math.abs(row) < 1 && Math.abs(col) < 2) continue
          if ((row + col + 20) % 7 === 0) continue
          const x = col * 1.23 + Math.sin((row + 4) * 1.7 + col) * 0.12
          const z = row * 1.23 + Math.cos((col + 5) * 1.4 + row) * 0.12
          if (Math.hypot(x, z) > 4.45 || Math.abs(x) < 0.68 || Math.abs(z) < 0.68) continue
          const seed = (row + 5) * 31 + (col + 6) * 17
          if (quality === 'balanced' && seed % 4 === 0) continue
          const site = {
            x, z,
            width: 0.56 + (seed % 5) * 0.075,
            depth: 0.55 + ((seed * 3) % 5) * 0.072,
            height: 0.86 + ((seed * 7) % 17) * 0.19,
            yaw: ((seed % 4) - 1.5) * 0.035,
            tone: seed % 6,
          }
          const footprintRadius = Math.max(site.width, site.depth) * 0.58
          if (ROUTES.some((route) => distanceToRoute(x, z, route.points) < footprintRadius + 0.25)) continue
          if (reservedPlazas.some(([px, pz, radius]) => Math.hypot(x - px, z - pz) < radius + footprintRadius)) continue
          buildingSites.push(site)
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

      // Street-level awnings, roof aerials and media bands break up the repeated towers.
      const detailedSites = buildingSites.filter((_, index) => index % 2 === 0)
      const awnings = new THREE.InstancedMesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x26112f, emissiveIntensity: night ? 0.5 : 0.08 }),
        detailedSites.length,
      )
      const aerials = new THREE.InstancedMesh(
        new THREE.CylinderGeometry(0.018, 0.026, 1, 6),
        chromeMaterial,
        detailedSites.length,
      )
      detailedSites.forEach((site, index) => {
        place(awnings, index, site, 0, 0.3, site.depth * 0.55, site.width * 0.78, 0.075, 0.19)
        awnings.setColorAt(index, new THREE.Color([0x4deeea, 0xff4fa3, 0xf7b43a, 0x8b7dff][index % 4]))
        place(aerials, index, site, site.width * 0.18, site.height + 0.38, 0, 1, 0.72 + (index % 3) * 0.16, 1)
      })
      awnings.instanceMatrix.needsUpdate = true
      aerials.instanceMatrix.needsUpdate = true
      if (awnings.instanceColor) awnings.instanceColor.needsUpdate = true
      city.add(awnings, aerials)

      const mediaTextures = MEDIA_CAMPAIGNS.map((campaign) => makeMediaTexture(THREE, campaign))
      const venueSpecs = [
        { x: -1.48, z: 1.28, color: 0x243b67, accent: 0xff4fa3, media: 3 },
        { x: 1.5, z: -1.28, color: 0x275c63, accent: 0xf7b43a, media: 1 },
        { x: -1.5, z: -1.3, color: 0x493860, accent: 0x4deeea, media: 4 },
      ]
      const venueWindows = new THREE.MeshStandardMaterial({
        color: 0x173453,
        emissive: 0x4deeea,
        emissiveIntensity: night ? 1.5 : 0.38,
        metalness: 0.4,
        roughness: 0.18,
      })
      venueSpecs.forEach((spec) => {
        const venue = new THREE.Group()
        const shell = new THREE.Mesh(
          new THREE.BoxGeometry(1.05, 0.48, 0.7),
          new THREE.MeshStandardMaterial({ color: spec.color, metalness: 0.28, roughness: 0.5 }),
        )
        shell.position.y = 0.24
        const window = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.24, 0.025), venueWindows)
        window.position.set(0, 0.26, 0.36)
        const canopy = new THREE.Mesh(
          new THREE.BoxGeometry(1.12, 0.07, 0.28),
          new THREE.MeshBasicMaterial({ color: spec.accent, toneMapped: false }),
        )
        canopy.position.set(0, 0.53, 0.43)
        const sign = new THREE.Mesh(
          new THREE.PlaneGeometry(0.64, 0.24),
          new THREE.MeshBasicMaterial({ map: mediaTextures[spec.media], toneMapped: false }),
        )
        sign.position.set(0, 0.78, 0.355)
        venue.position.set(spec.x, 0, spec.z)
        venue.add(shell, window, canopy, sign)
        city.add(venue)
      })

      const billboardSpecs = [
        [-3.38, 2.42, 3.42, 0.04, 0], [3.62, 2.22, 1.25, -1.22, 1],
        [-3.48, 1.9, -1.25, 1.18, 2], [1.25, 2.55, 3.52, 0.08, 3],
        [3.55, 2.75, -3.18, -0.78, 4], [-1.18, 2.25, -3.54, Math.PI, 1],
      ].slice(0, quality === 'high' ? 6 : 4)
      billboardSpecs.forEach(([x, y, z, yaw, media], index) => {
        const billboard = new THREE.Group()
        const width = index % 2 ? 1.26 : 1.48
        const height = index % 2 ? 0.62 : 0.72
        const frame = new THREE.Mesh(
          new THREE.BoxGeometry(width + 0.09, height + 0.09, 0.075),
          new THREE.MeshStandardMaterial({ color: 0x17213d, metalness: 0.72, roughness: 0.22 }),
        )
        const display = new THREE.Mesh(
          new THREE.PlaneGeometry(width, height),
          new THREE.MeshBasicMaterial({ map: mediaTextures[media], side: THREE.DoubleSide, toneMapped: false }),
        )
        display.position.z = 0.042
        const mast = new THREE.Mesh(new THREE.BoxGeometry(0.06, y * 0.62, 0.06), chromeMaterial)
        mast.position.y = -height / 2 - y * 0.31
        billboard.position.set(x, y, z)
        billboard.rotation.y = yaw
        billboard.add(frame, display, mast)
        city.add(billboard)
      })

      // Market carts, cafe tables and flower stands make the central blocks feel occupied.
      const marketGroup = new THREE.Group()
      const cartColors = [0xff4fa3, 0xf7b43a, 0x4deeea, 0x8b7dff]
      const cartSites = [[-1.02, 1.02], [-1.92, 1.06], [1.03, -1.04], [-1.03, -1.04]]
      cartSites.slice(0, quality === 'high' ? 4 : 3).forEach(([x, z], index) => {
        const cart = new THREE.Group()
        const counter = new THREE.Mesh(
          new THREE.BoxGeometry(0.38, 0.22, 0.24),
          new THREE.MeshStandardMaterial({ color: 0x203657, metalness: 0.32, roughness: 0.44 }),
        )
        counter.position.y = 0.14
        const canopy = new THREE.Mesh(
          new THREE.BoxGeometry(0.48, 0.045, 0.34),
          new THREE.MeshBasicMaterial({ color: cartColors[index], toneMapped: false }),
        )
        canopy.position.y = 0.55
        for (const side of [-1, 1]) {
          const post = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.42, 0.018), chromeMaterial)
          post.position.set(side * 0.18, 0.36, 0)
          cart.add(post)
        }
        for (let item = 0; item < 5; item += 1) {
          const goods = new THREE.Mesh(
            new THREE.SphereGeometry(0.035, 7, 5),
            new THREE.MeshBasicMaterial({ color: cartColors[(index + item + 1) % cartColors.length], toneMapped: false }),
          )
          goods.position.set((item - 2) * 0.065, 0.29, 0.04)
          cart.add(goods)
        }
        cart.position.set(x, 0, z)
        cart.add(counter, canopy)
        marketGroup.add(cart)
      })
      for (const [x, z, color] of [[1.08, 1.08, 0xff715b], [1.62, 1.15, 0x4deeea], [1.32, 1.68, 0xf7b43a]]) {
        const cafe = new THREE.Group()
        const table = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.18, 10), chromeMaterial)
        table.position.y = 0.1
        const parasol = new THREE.Mesh(
          new THREE.ConeGeometry(0.3, 0.16, 12),
          new THREE.MeshBasicMaterial({ color, toneMapped: false }),
        )
        parasol.position.y = 0.58
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.48, 6), chromeMaterial)
        pole.position.y = 0.38
        cafe.position.set(x, 0, z)
        cafe.add(table, parasol, pole)
        marketGroup.add(cafe)
      }
      city.add(marketGroup)

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
      const routeSamples = quality === 'high' ? 52 : 34
      const trackBeds = new THREE.InstancedMesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshStandardMaterial({ color: night ? 0x19253d : 0x65718a, roughness: 0.72, metalness: 0.3 }),
        ROUTES.length * routeSamples,
      )
      const railSegments = new THREE.InstancedMesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshStandardMaterial({ color: 0xc7d6e6, metalness: 0.94, roughness: 0.16 }),
        ROUTES.length * routeSamples * 2,
      )
      const sleepers = new THREE.InstancedMesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshStandardMaterial({ color: night ? 0x44516b : 0x5e6474, metalness: 0.42, roughness: 0.56 }),
        ROUTES.length * Math.ceil(routeSamples / 3),
      )
      const emergencyCabinets = new THREE.InstancedMesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshStandardMaterial({ color: 0xff315c, emissive: 0xff173f, emissiveIntensity: night ? 1.8 : 0.52 }),
        ROUTES.length * 3,
      )
      const trackBollards = new THREE.InstancedMesh(
        new THREE.CylinderGeometry(0.025, 0.03, 1, 6),
        new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }),
        ROUTES.length * Math.ceil(routeSamples / 6) * 2,
      )
      let bedCount = 0
      let railCount = 0
      let sleeperCount = 0
      let cabinetCount = 0
      let bollardCount = 0
      ROUTES.forEach((route, routeIndex) => {
        const curvePoints = route.points.map(([x, z]) => new THREE.Vector3(x, 0.055, z))
        const curve = new THREE.CatmullRomCurve3(curvePoints)
        routeCurves.push(curve)
        const start = new THREE.Vector3()
        const end = new THREE.Vector3()
        const midpoint = new THREE.Vector3()
        const tangent = new THREE.Vector3()
        for (let segment = 0; segment < routeSamples; segment += 1) {
          curve.getPoint(segment / routeSamples, start)
          curve.getPoint((segment + 1) / routeSamples, end)
          tangent.subVectors(end, start)
          const length = tangent.length()
          const yaw = Math.atan2(tangent.x, tangent.z)
          midpoint.addVectors(start, end).multiplyScalar(0.5)
          dummy.position.set(midpoint.x, 0.02, midpoint.z)
          dummy.rotation.set(0, yaw, 0)
          dummy.scale.set(0.34, 0.035, length * 1.08)
          dummy.updateMatrix()
          trackBeds.setMatrixAt(bedCount++, dummy.matrix)
          for (const side of [-1, 1]) {
            const sideX = Math.cos(yaw) * side * 0.09
            const sideZ = -Math.sin(yaw) * side * 0.09
            dummy.position.set(midpoint.x + sideX, 0.065, midpoint.z + sideZ)
            dummy.scale.set(0.026, 0.028, length * 1.06)
            dummy.updateMatrix()
            railSegments.setMatrixAt(railCount++, dummy.matrix)
          }
          if (segment % 3 === 0) {
            dummy.position.set(midpoint.x, 0.052, midpoint.z)
            dummy.scale.set(0.31, 0.025, 0.045)
            dummy.updateMatrix()
            sleepers.setMatrixAt(sleeperCount++, dummy.matrix)
          }
          if (segment % 6 === 0) {
            for (const side of [-1, 1]) {
              const sideX = Math.cos(yaw) * side * 0.24
              const sideZ = -Math.sin(yaw) * side * 0.24
              dummy.position.set(midpoint.x + sideX, 0.11, midpoint.z + sideZ)
              dummy.scale.set(1, 0.22, 1)
              dummy.updateMatrix()
              trackBollards.setMatrixAt(bollardCount, dummy.matrix)
              trackBollards.setColorAt(bollardCount++, new THREE.Color(route.color))
            }
          }
        }
        const routeMaterial = new THREE.MeshBasicMaterial({ color: route.color, transparent: true, opacity: 0.8, toneMapped: false })
        city.add(new THREE.Mesh(new THREE.TubeGeometry(curve, routeSamples, 0.014, 5, false), routeMaterial))
        for (const pointIndex of [0, 2, 4]) {
            const point = curvePoints[pointIndex]
            const progress = pointIndex / (curvePoints.length - 1)
            const direction = curve.getTangentAt(progress)
            const yaw = Math.atan2(direction.x, direction.z)
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
            const platform = new THREE.Mesh(
              new THREE.BoxGeometry(0.62, 0.055, 0.24),
              new THREE.MeshStandardMaterial({ color: night ? 0xb6c4d9 : 0xe7e9ee, metalness: 0.55, roughness: 0.34 }),
            )
            platform.position.set(point.x, 0.055, point.z)
            platform.rotation.y = yaw
            city.add(platform)
            dummy.position.set(point.x + Math.cos(yaw) * 0.34, 0.22, point.z - Math.sin(yaw) * 0.34)
            dummy.rotation.set(0, yaw, 0)
            dummy.scale.set(0.08, 0.34, 0.08)
            dummy.updateMatrix()
            emergencyCabinets.setMatrixAt(cabinetCount++, dummy.matrix)
        }
      })

      trackBeds.count = bedCount
      railSegments.count = railCount
      sleepers.count = sleeperCount
      emergencyCabinets.count = cabinetCount
      trackBollards.count = bollardCount
      for (const mesh of [trackBeds, railSegments, sleepers, emergencyCabinets, trackBollards]) {
        mesh.instanceMatrix.needsUpdate = true
      }
      if (trackBollards.instanceColor) trackBollards.instanceColor.needsUpdate = true
      city.add(trackBeds, sleepers, railSegments, trackBollards, emergencyCabinets)

      const trams = routeCurves.slice(0, quality === 'high' ? 3 : 2).map((curve, index) => {
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
      const updateTrams = (elapsed) => {
        trams.forEach((tram) => {
          const sweep = (tram.phase * 2 + elapsed * tram.speed) % 2
          const backwards = sweep > 1
          const progress = backwards ? 2 - sweep : sweep
          tram.curve.getPointAt(progress, tram.position)
          tram.curve.getTangentAt(progress, tram.tangent)
          if (backwards) tram.tangent.multiplyScalar(-1)
          tram.object.position.copy(tram.position)
          tram.object.position.y += 0.08
          tram.object.rotation.y = Math.atan2(tram.tangent.x, tram.tangent.z)
        })
      }
      updateTrams(0)

      const makeRingCurve = (radius) => new THREE.CatmullRomCurve3(
        Array.from({ length: 24 }, (_, index) => {
          const angle = (index / 24) * Math.PI * 2
          return new THREE.Vector3(Math.cos(angle) * radius, 0.085, Math.sin(angle) * radius)
        }),
        true,
      )
      const carRoutes = [
        { curve: makeRingCurve(4.82), closed: true },
        { curve: makeRingCurve(5.08), closed: true },
        { curve: new THREE.LineCurve3(new THREE.Vector3(-4.55, 0.085, -0.23), new THREE.Vector3(4.55, 0.085, -0.23)), closed: false },
        { curve: new THREE.LineCurve3(new THREE.Vector3(4.55, 0.085, 0.23), new THREE.Vector3(-4.55, 0.085, 0.23)), closed: false },
        { curve: new THREE.LineCurve3(new THREE.Vector3(-0.23, 0.085, -4.55), new THREE.Vector3(-0.23, 0.085, 4.55)), closed: false },
        { curve: new THREE.LineCurve3(new THREE.Vector3(0.23, 0.085, 4.55), new THREE.Vector3(0.23, 0.085, -4.55)), closed: false },
      ]
      const carPalette = [0xff4fa3, 0x4deeea, 0xf7b43a, 0xff715b, 0x8b7dff, 0xe7edf7]
      const cars = Array.from({ length: quality === 'high' ? 10 : 6 }, (_, index) => {
        const route = carRoutes[index % carRoutes.length]
        const object = buildMiniCar(THREE, carPalette[index % carPalette.length])
        object.scale.setScalar(index % 4 === 0 ? 1.08 : 0.92)
        city.add(object)
        return {
          object,
          ...route,
          phase: (index * 0.173) % 1,
          speed: 0.045 + (index % 4) * 0.007,
          direction: index % 2 === 0 ? 1 : -1,
          position: new THREE.Vector3(),
          tangent: new THREE.Vector3(),
        }
      })
      const updateCars = (elapsed) => {
        cars.forEach((car) => {
          let progress
          let backwards = false
          if (car.closed) {
            progress = ((car.phase + elapsed * car.speed * car.direction) % 1 + 1) % 1
          } else {
            const sweep = ((car.phase * 2 + elapsed * car.speed * car.direction) % 2 + 2) % 2
            backwards = sweep > 1
            progress = backwards ? 2 - sweep : sweep
          }
          car.curve.getPointAt(progress, car.position)
          car.curve.getTangentAt(progress, car.tangent)
          if (backwards) car.tangent.multiplyScalar(-1)
          car.object.position.copy(car.position)
          car.object.rotation.y = Math.atan2(car.tangent.x, car.tangent.z)
        })
      }
      updateCars(0)

      const pedestrianCount = quality === 'high' ? 32 : 18
      const pedestrianBodies = new THREE.InstancedMesh(
        new THREE.CylinderGeometry(0.045, 0.065, 0.22, 6),
        new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.72, metalness: 0.08 }),
        pedestrianCount,
      )
      const pedestrianHeads = new THREE.InstancedMesh(
        new THREE.SphereGeometry(0.062, 7, 5),
        new THREE.MeshStandardMaterial({ color: 0xf1bda2, roughness: 0.82 }),
        pedestrianCount,
      )
      const crowdCenters = [[-1.48, 1.3], [1.5, -1.28], [-1.5, -1.3], [1.35, 1.4]]
      const pedestrianPalette = [0xff4fa3, 0x4deeea, 0xf7b43a, 0x8b7dff, 0xff715b, 0x5fd38d]
      const pedestrians = Array.from({ length: pedestrianCount }, (_, index) => ({
        center: crowdCenters[index % crowdCenters.length],
        phase: (index * 0.61803398875) % 1,
        speed: 0.018 + (index % 5) * 0.003,
        radiusX: 0.38 + (index % 3) * 0.09,
        radiusZ: 0.32 + ((index + 1) % 3) * 0.08,
      }))
      pedestrians.forEach((_, index) => pedestrianBodies.setColorAt(index, new THREE.Color(pedestrianPalette[index % pedestrianPalette.length])))
      if (pedestrianBodies.instanceColor) pedestrianBodies.instanceColor.needsUpdate = true
      pedestrianBodies.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      pedestrianHeads.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      city.add(pedestrianBodies, pedestrianHeads)

      const updatePedestrians = (elapsed) => {
        pedestrians.forEach((person, index) => {
          const angle = (person.phase + elapsed * person.speed) * Math.PI * 2
          const x = person.center[0] + Math.cos(angle) * person.radiusX
          const z = person.center[1] + Math.sin(angle) * person.radiusZ
          const yaw = Math.atan2(-Math.sin(angle) * person.radiusX, Math.cos(angle) * person.radiusZ)
          const bounce = Math.abs(Math.sin(angle * 2)) * 0.018
          dummy.position.set(x, 0.18 + bounce, z)
          dummy.rotation.set(0, yaw, 0)
          dummy.scale.set(1, 1, 1)
          dummy.updateMatrix()
          pedestrianBodies.setMatrixAt(index, dummy.matrix)
          dummy.position.set(x, 0.36 + bounce, z)
          dummy.rotation.set(0, yaw, 0)
          dummy.updateMatrix()
          pedestrianHeads.setMatrixAt(index, dummy.matrix)
        })
        pedestrianBodies.instanceMatrix.needsUpdate = true
        pedestrianHeads.instanceMatrix.needsUpdate = true
      }
      updatePedestrians(0)

      const trafficSignals = new THREE.Group()
      for (const [x, z, yaw] of [[-0.62, -0.62, 0], [0.62, 0.62, Math.PI], [-0.62, 0.62, Math.PI / 2], [0.62, -0.62, -Math.PI / 2]]) {
        const signal = new THREE.Group()
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.72, 7), chromeMaterial)
        pole.position.y = 0.36
        const lamp = new THREE.Mesh(
          new THREE.BoxGeometry(0.12, 0.24, 0.1),
          new THREE.MeshStandardMaterial({ color: 0x111b2c, metalness: 0.58, roughness: 0.34 }),
        )
        lamp.position.y = 0.73
        const green = new THREE.Mesh(
          new THREE.SphereGeometry(0.028, 7, 5),
          new THREE.MeshBasicMaterial({ color: 0x5cff99, toneMapped: false }),
        )
        green.position.set(0, 0.69, 0.055)
        signal.position.set(x, 0, z)
        signal.rotation.y = yaw
        signal.add(pole, lamp, green)
        trafficSignals.add(signal)
      }
      city.add(trafficSignals)

      const amberLight = new THREE.PointLight(0xf7b43a, night ? 18 : 7, 5, 2)
      amberLight.position.set(-1.4, 1.8, 1.2)
      const violetLight = new THREE.PointLight(0x8b7dff, night ? 16 : 6, 5, 2)
      violetLight.position.set(1.5, 1.7, -1.2)
      city.add(amberLight, violetLight)

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
        updateTrams(elapsed)
        updateCars(elapsed)
        updatePedestrians(elapsed)
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
