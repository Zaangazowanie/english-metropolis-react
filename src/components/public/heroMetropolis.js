// All repeated architectural details share instanced geometry. No model downloads,
// texture requests, postprocessing passes, or per-window animation allocations.
export function buildMetropolis(THREE, scene, day) {
  const p = day ? {
    stone: [0xaaa1c3, 0xc3bad5, 0xd4cce0], glass: [0x718798, 0x8292af, 0x9d99b9],
    trim: 0xe8dfed, dark: 0x57516f, pane: 0xa8c4d1, warm: 0xffe4b7,
    ground: 0xe0dbe9, pavement: 0xc6bfd4, road: 0x9a96b0, green: 0x658d86,
    rail: 0x89809d, metal: 0xaca6ba, accent: 0x9568d4,
  } : {
    stone: [0x4e456b, 0x68607b, 0x827087], glass: [0x223c54, 0x344968, 0x4c416b],
    trim: 0x827799, dark: 0x191b32, pane: 0x466984, warm: 0xffd7a0,
    ground: 0x211b36, pavement: 0x38314e, road: 0x191c30, green: 0x294d4c,
    rail: 0x706882, metal: 0x69718c, accent: 0xbb87f3,
  }
  const random = (n) => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v) }
  const boxGeo = new THREE.BoxGeometry(1, 1, 1)
  const leafGeo = new THREE.IcosahedronGeometry(1, 1)
  const coneGeo = new THREE.CylinderGeometry(0.03, 0.5, 1, 4)
  const roundGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 32)
  const solid = new THREE.MeshStandardMaterial({ roughness: 0.72, metalness: 0.18 })
  const glass = new THREE.MeshStandardMaterial({ roughness: 0.28, metalness: 0.55 })
  const light = new THREE.MeshBasicMaterial({ toneMapped: false })
  const pools = new Map()
  const windowRecords = []
  const matrix = new THREE.Object3D()
  function part(type, x, y, z, w, h, d, color, rotation = 0) {
    if (!pools.has(type)) pools.set(type, [])
    const items = pools.get(type)
    items.push({ x, y, z, w, h, d, color, rotation })
    return items.length - 1
  }
  function box(x, y, z, w, h, d, color) { return part('solid', x, y, z, w, h, d, color) }
  function lamp(x, z, height = 1.05) {
    box(x, height / 2, z, 0.045, height, 0.045, p.metal)
    box(x + 0.12, height, z, 0.29, 0.04, 0.06, p.metal)
    part('light', x + 0.22, height - 0.04, z, 0.15, 0.045, 0.12, p.warm)
  }
  function tree(x, z, size = 0.65) {
    box(x, 0.32, z, 0.07, 0.64, 0.07, p.dark)
    part('leaf', x, size * 0.95, z, size * 0.52, size * 0.72, size * 0.48, p.green)
    part('leaf', x - size * 0.25, size * 0.78, z + 0.1, size * 0.38, size * 0.45, size * 0.4, day ? 0x81a297 : 0x3b645d)
  }
  // Side panes are actual geometry, so the façades hold up under parallax.
  function building(x, z, w, h, d, style, seed, far = false) {
    const bodyColor = (style % 2 ? p.stone : p.glass)[seed % 3]
    const podium = 0.58
    box(x, podium / 2, z, w + 0.25, podium, d + 0.22, p.stone[(seed + 1) % 3])
    part(style % 2 ? 'solid' : 'glass', x, h / 2 + podium, z, w, h, d, bodyColor)
    const floors = Math.floor(h / 0.4)
    const columns = Math.max(3, Math.floor(w / 0.28))
    const sides = Math.max(2, Math.floor(d / 0.3))
    const dx = w / columns
    for (let f = 0; f < floors; f++) {
      const y = podium + 0.2 + f * 0.4
      // Limestone cornices / glass curtain-wall transoms.
      if (f % (style === 1 ? 2 : 1) === 0) box(x, y + 0.17, z, w + 0.035, 0.032, d + 0.035, style % 2 ? p.trim : p.dark)
      for (let c = 0; c < columns; c++) {
        const hash = random(seed * 701 + f * 31 + c)
        const color = hash > (far ? 0.7 : 0.47) ? (hash > 0.88 ? 0x9cdce1 : p.warm) : p.pane
        const idx = part('light', x - w / 2 + dx * (c + 0.5), y, z + d / 2 + 0.012,
          dx * (style % 2 ? 0.48 : 0.78), style % 2 ? 0.19 : 0.27, 0.015, day && hash < 0.8 ? p.pane : color)
        windowRecords.push({ index: idx, x, color: day && hash < 0.8 ? p.pane : color })
      }
      for (let c = 0; c < sides; c++) {
        const color = random(seed * 61 + f * 19 + c) > 0.65 ? p.warm : p.pane
        part('light', x + w / 2 + 0.012, y, z - d / 2 + d / sides * (c + 0.5),
          0.015, 0.22, d / sides * 0.52, day ? p.pane : color)
      }
    }
    // Vertical structural fins make each tower read as architecture at small sizes.
    for (let c = 0; c <= (style % 2 ? 3 : 5); c++) {
      const count = style % 2 ? 3 : 5
      box(x - w / 2 + w * c / count, h / 2 + podium, z + d / 2 + 0.04,
        style % 2 ? 0.065 : 0.032, h, 0.06, p.trim)
    }
    const top = h + podium
    box(x, top + 0.05, z, w + 0.13, 0.1, d + 0.13, p.trim)
    // Recessed roof, parapet, lift housing, air conditioning and antennae.
    box(x, top + 0.11, z, w * 0.88, 0.08, d * 0.86, p.dark)
    box(x - w * 0.16, top + 0.25, z - 0.1, w * 0.37, 0.36, d * 0.4, bodyColor)
    for (let a = 0; a < 2; a++) {
      box(x + w * 0.24, top + 0.17, z - d * 0.22 + a * 0.36, 0.27, 0.18, 0.23, p.metal)
    }
    if (style === 2 || style === 3) {
      const crownH = h * 0.18
      box(x, top + crownH / 2, z, w * 0.68, crownH, d * 0.67, bodyColor)
      for (let i = 0; i < 3; i++) box(x, top + crownH * i / 3, z, w * 0.72, 0.055, d * 0.71, p.trim)
      if (style === 3) {
        part('spire', x, top + crownH + 0.35, z, w * 0.65, 0.7, d * 0.65, p.metal, Math.PI / 4)
        box(x, top + crownH + 1.05, z, 0.045, 0.8, 0.045, p.trim)
        part('light', x, top + crownH + 1.47, z, 0.075, 0.065, 0.075, 0xff967f)
      } else {
        box(x, top + crownH + 0.07, z, w * 0.75, 0.14, d * 0.74, p.trim)
        part('light', x, top + crownH - 0.09, z + d * 0.34, w * 0.65, 0.045, 0.02, day ? p.pane : 0x93cbd7)
      }
    } else if (seed % 3 === 0) {
      box(x + w * 0.22, top + 0.5, z, 0.035, 0.8, 0.035, p.metal)
    }
    // Street-facing glazed lobbies with individual doors and canopy.
    for (let c = 0; c < 4; c++) {
      part('light', x - w * 0.36 + c * w * 0.24, 0.29, z + d / 2 + 0.12, w * 0.17, 0.4, 0.025, day ? p.glass[0] : p.warm)
    }
    box(x, 0.57, z + d / 2 + 0.24, w + 0.26, 0.07, 0.4, p.accent)
  }

  function roundTower(x, z, height, seed) {
    const diameter = 2.8
    part('round', x, height / 2, z, diameter, height, diameter, p.glass[0])
    for (let floor = 0; floor < Math.floor(height / 0.38); floor++) {
      const y = floor * 0.38 + 0.22
      part('round', x, y + 0.17, z, diameter + 0.07, 0.045, diameter + 0.07, p.trim)
      for (let c = 0; c < 24; c++) {
        const angle = c / 24 * Math.PI * 2
        const color = !day && random(seed + floor * 31 + c) > 0.5 ? p.warm : p.pane
        part('light', x + Math.sin(angle) * 1.406, y, z + Math.cos(angle) * 1.406,
          0.21, 0.25, 0.022, color, angle)
      }
    }
    part('round', x, height + 0.08, z, diameter + 0.16, 0.16, diameter + 0.16, p.trim)
    part('round', x, height + 0.25, z, diameter * 0.68, 0.35, diameter * 0.68, p.dark)
  }

  // Uneven skyline peaks, deliberate street gaps, and four separate depth layers.
  for (let i = 0; i < 33; i++) {
    const x = -40 + i * 2.5
    const h = 3.2 + random(i * 13) * 5.5
    building(x, -17 - random(i) * 1.8, 1.5 + random(i + 1) * 0.7, h, 1.5, i % 7 === 0 ? 3 : i % 2, i + 101, true)
  }
  const heights = [4.2, 6.1, 4.8, 8.8, 6.2, 5.4, 9.8, 6.8, 11.2, 7, 5.8, 8.6, 10, 6.6, 5.2, 8.9, 6.2, 4.7, 6.8, 4.2]
  heights.forEach((h, i) => {
    const x = -37 + i * 3.9, z = -10.5 - random(i + 80) * 2
    if (i === 4 || i === 14) roundTower(x, z, h + 1.8, i * 90)
    else building(x, z, 2.1 + random(i * 17) * 0.8, h, 2.2, i % 4, i + 11)
  })
  for (let i = 0; i < 23; i++) {
    const x = -39 + i * 3.5
    if (i === 7 || i === 15) continue // pocket parks / sight lines into downtown
    building(x, -4.8 - random(i) * 0.8, 2.2 + random(i + 2) * 0.65,
      1.3 + random(i * 3 + 20) * 2.9, 1.8, i % 2, i + 60)
  }

  // Street grid: pavements, planted blocks, crossings, two lanes of traffic.
  box(0, -0.18, -7.3, 88, 0.3, 24, p.ground)
  box(0, 0.015, 0.45, 86, 0.07, 2.8, p.road)
  box(0, 0.05, -1.45, 85, 0.13, 0.85, p.pavement)
  box(0, 0.05, 2.1, 85, 0.13, 0.55, p.pavement)
  for (let x = -42; x < 43; x += 1.2) box(x, 0.065, 0.45, 0.54, 0.015, 0.05, p.trim)
  for (const x of [-29, -12, 15, 31]) {
    box(x, 0.03, -7, 1.25, 0.05, 14, p.road)
    for (let i = 0; i < 8; i++) box(x, 0.08, -0.66 + i * 0.31, 0.72, 0.02, 0.16, p.trim)
  }
  for (let i = 0; i < 41; i++) {
    const x = -41 + i * 2.05
    tree(x, -2.02, 0.6 + random(i) * 0.3)
    if (i % 2 === 0) lamp(x + 0.65, -1.2)
    if (i % 5 === 0) {
      box(x + 0.6, 0.25, -1.85, 0.58, 0.09, 0.21, p.stone[1])
      box(x + 0.6, 0.39, -1.95, 0.58, 0.22, 0.06, p.stone[1])
    }
  }
  for (const x of [-14.5, 13]) {
    box(x, 0.09, -4.7, 2.8, 0.2, 3.1, p.green)
    for (let i = 0; i < 5; i++) tree(x - 0.9 + (i % 3) * 0.8, -5.6 + Math.floor(i / 3) * 1.3, 0.85)
  }
  // Elevated viaduct: twin steel rails, ties, concrete piers, safety parapets.
  box(0, 0.86, 4.05, 87, 0.22, 1.06, p.pavement)
  box(0, 0.7, 4.05, 87, 0.15, 0.56, p.rail)
  for (let x = -42; x <= 42; x += 3.2) {
    box(x, 0.31, 4.05, 0.19, 0.65, 0.62, p.pavement)
    box(x, 0.67, 4.05, 0.75, 0.12, 0.75, p.trim)
  }
  for (let x = -43; x < 44; x += 0.39) box(x, 1, 4.05, 0.12, 0.05, 0.78, p.dark)
  for (const z of [3.78, 4.32]) box(0, 1.03, z, 87, 0.045, 0.045, p.metal)
  box(0, 0.98, 4.64, 87, 0.09, 0.055, p.accent)

  // Glass-roofed station: platform, canopy ribs, backlit metro sign.
  const stationX = 10
  box(stationX, 0.89, 3.2, 7.2, 0.2, 1.1, p.trim)
  for (let i = -3; i <= 3; i++) {
    box(stationX + i, 1.49, 2.9, 0.055, 1.2, 0.055, p.metal)
    box(stationX + i, 2.08, 3.3, 0.06, 0.08, 1.4, p.trim)
  }
  part('glass', stationX, 2.12, 3.3, 7.6, 0.07, 1.5, day ? 0x9bbac9 : 0x506b83)
  part('light', stationX, 1.98, 3.95, 7.4, 0.045, 0.04, p.warm)
  box(stationX - 3.8, 1.85, 4.62, 0.42, 0.48, 0.08, p.accent)
  // The station's M is geometry rather than a network font or texture.
  for (const dx of [-0.11, 0.11]) part('light', stationX - 3.8 + dx, 1.85, 4.67, 0.035, 0.26, 0.015, 0xffffff)
  part('light', stationX - 3.8, 1.89, 4.67, 0.17, 0.045, 0.015, 0xffffff)

  const meshes = new Map()
  for (const [type, items] of pools) {
    const geo = type === 'leaf' ? leafGeo : type === 'spire' ? coneGeo : type === 'round' ? roundGeo : boxGeo
    const material = type === 'light' ? light : type === 'glass' || type === 'round' ? glass : solid
    const mesh = new THREE.InstancedMesh(geo, material, items.length)
    const color = new THREE.Color()
    items.forEach((item, i) => {
      matrix.position.set(item.x, item.y, item.z)
      matrix.scale.set(item.w, item.h, item.d)
      matrix.rotation.set(0, item.rotation, 0)
      matrix.updateMatrix()
      mesh.setMatrixAt(i, matrix.matrix)
      mesh.setColorAt(i, color.setHex(item.color))
    })
    mesh.computeBoundingSphere()
    scene.add(mesh)
    meshes.set(type, mesh)
  }

  // Shared train and car geometry/materials keep moving objects inexpensive too.
  const vehicleMaterials = new Map()
  function vehicleBox(group, x, y, z, w, h, d, color, emissive = false) {
    const key = `${color}-${emissive}`
    if (!vehicleMaterials.has(key)) vehicleMaterials.set(key, emissive
      ? new THREE.MeshBasicMaterial({ color, toneMapped: false })
      : new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.4 }))
    const mesh = new THREE.Mesh(boxGeo, vehicleMaterials.get(key))
    mesh.position.set(x, y, z); mesh.scale.set(w, h, d)
    group.add(mesh)
  }
  const train = new THREE.Group()
  for (let i = 0; i < 3; i++) {
    const x = (i - 1) * 2.05
    vehicleBox(train, x, 0.27, 0, 1.92, 0.43, 0.6, day ? 0xe4dce9 : 0xc4bad9)
    vehicleBox(train, x, 0.5, 0, 1.82, 0.065, 0.54, p.metal)
    vehicleBox(train, x, 0.13, 0.31, 1.89, 0.105, 0.025, p.accent)
    vehicleBox(train, x, 0.02, 0, 1.65, 0.12, 0.43, p.dark)
    for (let j = 0; j < 6; j++) vehicleBox(train, x - 0.74 + j * 0.29, 0.33, 0.309, 0.21, 0.18, 0.02, j % 3 === 0 ? p.pane : p.warm, true)
    for (const dx of [-0.62, 0.62]) vehicleBox(train, x + dx, -0.035, 0, 0.28, 0.17, 0.55, p.dark)
  }
  vehicleBox(train, 3.02, 0.3, 0, 0.025, 0.16, 0.45, p.pane)
  vehicleBox(train, 3.05, 0.14, 0.21, 0.03, 0.07, 0.09, 0xffecca, true)
  train.position.set(-16, 1.15, 4.05)
  scene.add(train)
  const cars = []
  for (let i = 0; i < 9; i++) {
    const car = new THREE.Group()
    const color = [p.accent, 0xc7baba, 0xb99157, 0x7793a3][i % 4]
    vehicleBox(car, 0, 0.18, 0, 0.72, 0.21, 0.31, color)
    vehicleBox(car, -0.02, 0.33, 0, 0.39, 0.16, 0.27, p.glass[0])
    vehicleBox(car, 0.36, 0.17, 0, 0.035, 0.06, 0.27, p.warm, true)
    const direction = i % 2 ? -1 : 1
    car.position.set(-38 + i * 9, 0.04, direction > 0 ? 1.02 : -0.14)
    car.rotation.y = direction < 0 ? Math.PI : 0
    scene.add(car)
    cars.push({ mesh: car, direction, speed: 1.1 + random(i) * 0.65 })
  }
  let lastFocus = undefined
  const tint = new THREE.Color(), base = new THREE.Color(), highlight = new THREE.Color(day ? 0xf7e6cc : 0xffe3b1)
  return {
    train, cars,
    focus(x) {
      if (x === lastFocus) return
      lastFocus = x
      const mesh = meshes.get('light')
      for (const w of windowRecords) {
        const amount = x === null ? 0 : Math.max(0, 1 - Math.abs(w.x - x) / 6) * 0.8
        tint.copy(base.setHex(w.color)).lerp(highlight, amount)
        mesh.setColorAt(w.index, tint)
      }
      mesh.instanceColor.needsUpdate = true
    },
  }
}
