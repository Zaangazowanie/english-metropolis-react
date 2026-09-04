// Every numbered platform represents one lesson, with the real package state.
export function buildLessonMetro(THREE, scene, { stations, lit, next, isDay }) {
  const n = Math.max(1, Math.floor(stations || 1)), taken = Math.max(0, Math.min(n, lit))
  const mat = (color, glow = 0) => new THREE.MeshStandardMaterial({ color, emissive: glow, emissiveIntensity: .45, roughness: .45, metalness: .3 })
  const dark = mat(isDay ? 0x827896 : 0x24263d), stone = mat(isDay ? 0xd3c9de : 0x41415b)
  const rail = mat(0x9e95b6), pink = mat(0xe2a0f2, 0xc85dea), mint = mat(0x94ecd4, 0x44b99b)
  const window = mat(0xfbd798, 0xffd791), blue = mat(0x7792bb, 0x597bc3), leaf = mat(0x52796d), white = mat(0xe2ddec)
  const geo = new THREE.BoxGeometry(1, 1, 1)
  const box = (parent, x, y, z, w, h, d, material) => {
    const mesh = new THREE.Mesh(geo, material)
    mesh.position.set(x, y, z); mesh.scale.set(w, h, d); parent.add(mesh); return mesh
  }
  const point = t => new THREE.Vector3((t - .5) * 10, .16, Math.sin(t * Math.PI * 1.7) * .22)
  const curve = new THREE.CatmullRomCurve3(Array.from({ length: 41 }, (_, i) => point(i / 40)))
  box(scene, 0, -.16, -.27, 11.1, .18, 2.3, dark)
  box(scene, 0, -.05, -.25, 10.8, .08, 2.05, stone)
  box(scene, 0, .005, -.66, 10.8, .015, .44, dark)
  for (let i = 0; i < 55; i++) box(scene, i * .2 - 5.4, .019, -.7, .1, .005, .016, rail)
  for (let i = 0; i < 105; i++) { const p = point(i / 104); box(scene, p.x, .12, p.z, .045, .05, .29, dark) }
  for (const offset of [-.105, .105]) {
    const path = new THREE.CatmullRomCurve3(Array.from({ length: 60 }, (_, i) => { const p = point(i / 59); p.z += offset; return p }))
    scene.add(new THREE.Mesh(new THREE.TubeGeometry(path, 100, .018, 6, false), rail))
  }
  // Glass facades, warm windows, rooftop machinery and spires.
  const panes = []
  for (let i = 0; i < 33; i++) {
    const x = -5.05 + i * .315, h = .25 + (i * 17 % 29) / 27, z = -1.05
    box(scene, x, h / 2 + .035, z, .23, h, .25, i % 3 ? dark : blue)
    box(scene, x, h + .055, z, .245, .035, .27, stone)
    box(scene, x + .04, h + .09, z, .085, .06, .09, dark)
    if (h > 1) box(scene, x, h + .22, z, .012, .3, .012, rail)
    for (let row = 0; row < Math.floor(h / .09); row++) for (let col = 0; col < 3; col++) {
      if ((row * 3 + col + i) % 5) panes.push([x - .07 + col * .07, .1 + row * .09, z + .128])
    }
  }
  const windows = new THREE.InstancedMesh(geo, window, panes.length), dummy = new THREE.Object3D()
  panes.forEach((p, i) => { dummy.position.set(...p); dummy.scale.set(.029, .042, .004); dummy.updateMatrix(); windows.setMatrixAt(i, dummy.matrix) }); scene.add(windows)
  const stationsGroup = new THREE.Group(); stationsGroup.name = 'lesson-stations'; scene.add(stationsGroup)
  for (let i = 0; i < n; i++) {
    const p = point(n === 1 ? .5 : i / (n - 1)), color = i < taken ? pink : next && i === taken ? mint : stone
    const platform = new THREE.Group(); platform.name = `lesson-${i + 1}`; platform.position.copy(p); stationsGroup.add(platform)
    const width = Math.min(.28, 8 / n)
    box(platform, 0, -.045, .31, width, .11, .3, stone)
    box(platform, 0, .018, .2, width, .012, .045, color)
    box(platform, 0, .155, .41, .012, .3, .012, rail)
    box(platform, 0, .28, .41, Math.min(.2, width), .115, .025, dark)
    if (typeof document !== 'undefined') {
      const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 40
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#171925'; ctx.fillRect(0, 0, 64, 40)
      ctx.fillStyle = i < taken ? '#efaaff' : next && i === taken ? '#93f0d7' : '#d5cde5'
      ctx.font = 'bold 27px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(String(i + 1).padStart(2, '0'), 32, 30)
      const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace
      const label = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(.19, width), .112), new THREE.MeshBasicMaterial({ map: texture }))
      label.position.set(0, .282, .425); platform.add(label)
    }
    if (i % 3 === 0 || (next && i === taken)) {
      box(platform, -width / 2.6, .12, .34, .012, .24, .012, rail)
      box(platform, width / 2.6, .12, .34, .012, .24, .012, rail)
      box(platform, 0, .25, .33, width * 1.1, .024, .28, color)
    }
  }
  // Lamps, trees and traffic add human scale.
  const treeGeo = new THREE.IcosahedronGeometry(.07, 1)
  for (let i = 0; i < 16; i++) {
    const x = i * .65 - 4.9
    box(scene, x, .12, -.42, .016, .24, .016, rail); box(scene, x + .03, .25, -.42, .085, .022, .032, window)
    const tree = new THREE.Mesh(treeGeo, leaf); tree.position.set(x + .17, .15, .79); scene.add(tree)
    box(scene, x + .17, .065, .79, .018, .12, .018, dark)
  }
  for (let i = 0; i < 7; i++) {
    box(scene, i * 1.4 - 4.5, .09, -.65, .19, .085, .095, i % 2 ? pink : blue)
    box(scene, i * 1.4 - 4.5, .14, -.65, .09, .035, .075, dark)
  }
  const train = new THREE.Group(); train.name = 'metro-train'; scene.add(train)
  for (let c = 0; c < 2; c++) {
    const x = c * -.26
    box(train, x, .075, 0, .24, .115, .15, white); box(train, x, .06, .078, .23, .018, .006, pink)
    box(train, x, .14, 0, .17, .025, .12, stone)
    for (let j = 0; j < 3; j++) box(train, x - .077 + j * .075, .1, .077, .046, .04, .006, dark)
    box(train, x + .12, .075, 0, .008, .06, .11, blue)
    for (const side of [-1, 1]) {
      box(train, x + .121, .055, side * .05, .008, .018, .018, window)
      box(train, x - .075, .012, side * .065, .045, .035, .028, dark)
      box(train, x + .075, .012, side * .065, .045, .035, .028, dark)
    }
  }
  const target = n === 1 ? .5 : Math.max(0, taken - 1) / (n - 1)
  return { target, placeTrain(t) { train.position.copy(point(t)); const tangent = curve.getTangent(t); train.rotation.y = -Math.atan2(tangent.z, tangent.x) } }
}
