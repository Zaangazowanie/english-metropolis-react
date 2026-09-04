import { useEffect, useRef } from 'react'
import { useThreeCanvas, easeOut } from './useThreeCanvas.js'

// WordTower — the student's vocabulary as a stacked tower.
//   one ring per lesson (oldest at the bottom), ring width = words in it
//   each segment is one keyword:
//     solid pink   = marked mastered in the lesson data (mastery_level)
//     lit violet   = opened as a flashcard in this session
//     glass        = not yet touched
//   the active card's segment glows and the tower turns to face it
// Props: rings [{ id, count, mastered:Set<idx>, seen:Set<idx> }], active {ring, idx}.
// Frames draw only on pointer moves and during the 600ms turn.
const PINK = 0xd946ef, VIOLET = 0xa855f7, EMERALD = 0x34d399

export default function WordTower({ rings = [], active = null, isDay = false, size = 240 }) {
  const canvasRef = useRef(null)
  const segsRef = useRef([])
  const groupRef = useRef(null)
  const rotRef = useRef({ from: 0, to: 0, start: 0 })
  const stage = useThreeCanvas(canvasRef, (stage) => {
    const { THREE, scene, camera } = stage
    scene.add(new THREE.AmbientLight(0xffffff, isDay ? 1.7 : 1.4))
    const key = new THREE.DirectionalLight(0xffffff, isDay ? 1.1 : 1.6); key.position.set(3, 5, 4); scene.add(key)
    const rim = new THREE.PointLight(PINK, 5, 10); rim.position.set(-3, 2, 2); scene.add(rim)
    const group = new THREE.Group(); scene.add(group); groupRef.current = group
    const n = Math.min(14, rings.length)
    const h = 0.34, gap = 0.1
    const total = n * (h + gap)
    // Fit: back the camera off so the widest ring (and the full stack) sit
    // inside the canvas with a little air, from a 3/4 elevated view.
    const maxR = 0.9 + Math.min(1.1, Math.max(1, ...rings.slice(0, n).map(r => r.count || 1)) / 40)
    const span = Math.max(maxR * 2.3, total * 1.6)
    let dist = 6
    const fit = (w, hh) => {
      const aspect = Math.max(0.6, Math.min(1, w / Math.max(1, hh)))
      dist = Math.max(3, (span / 2) / (Math.tan((camera.fov * Math.PI) / 360) * aspect))
      camera.position.set(0, dist * 0.42, dist)
      camera.lookAt(0, 0, 0)
    }
    fit(stage.width, stage.height)
    segsRef.current = []
    rings.slice(0, n).forEach((ring, ri) => {
      const count = Math.max(1, Math.min(48, ring.count || 1))
      const radius = 0.9 + Math.min(1.1, count / 40)
      const y = ri * (h + gap) - total / 2 + h / 2
      const arc = (Math.PI * 2) / count
      for (let i = 0; i < count; i++) {
        const mastered = ring.mastered?.has(i), seen = ring.seen?.has(i)
        const geo = new THREE.CylinderGeometry(radius, radius, h, 8, 1, false, i * arc + 0.02, arc - 0.04)
        // Untouched segments are glass: readable against both page grounds
        // (a faint violet glow at night, a lilac tint by day) but clearly
        // dimmer than a seen or mastered one.
        const mat = new THREE.MeshStandardMaterial({
          color: mastered ? PINK : seen ? VIOLET : (isDay ? 0xe9e1ff : 0x4c3a86),
          emissive: mastered ? PINK : seen ? VIOLET : (isDay ? 0x000000 : 0x5b3fa8),
          emissiveIntensity: mastered ? (isDay ? 0.3 : 0.75) : seen ? (isDay ? 0.2 : 0.55) : (isDay ? 0 : 0.18),
          transparent: !mastered && !seen, opacity: mastered || seen ? 1 : (isDay ? 0.95 : 0.78),
          roughness: 0.45, metalness: 0.1,
        })
        const m = new THREE.Mesh(geo, mat); m.position.y = y
        m.userData = { ri, i, arc, baseE: mat.emissive.getHex(), baseI: mat.emissiveIntensity, baseO: mat.opacity }
        group.add(m); segsRef.current.push(m)
      }
    })
    let drag = null
    return {
      onPointer: (x, y, type) => {
        if (type === 'pointerdown') drag = x
        else if (type === 'pointerleave') drag = null
        else if (type === 'pointermove') {
          // Fine-pointer parallax; a held pointer turns the tower 1:1.
          if (drag !== null) { group.rotation.y += (x - drag) * 3; drag = x; rotRef.current.to = group.rotation.y }
          camera.position.set((x - 0.5) * dist * 0.15, dist * 0.42 - (y - 0.5) * dist * 0.12, dist)
          camera.lookAt(0, 0, 0)
        }
        stage.requestRender()
      },
      onResize: (w, hh) => fit(w, hh),
    }
  }, [rings, isDay])

  // Active card: glow its segment and turn the tower so it faces the camera.
  useEffect(() => {
    const group = groupRef.current
    if (!group) return
    let target = null
    for (const m of segsRef.current) {
      const isActive = active && m.userData.ri === active.ring && m.userData.i === active.idx
      if (isActive) target = m
      m.material.emissive.setHex(isActive ? EMERALD : m.userData.baseE)
      m.material.emissiveIntensity = isActive ? 1.2 : m.userData.baseI
      m.material.opacity = isActive ? 1 : m.userData.baseO
    }
    if (target) {
      const mid = target.userData.i * target.userData.arc + target.userData.arc / 2
      // Bring segment centre to +Z (facing camera): rotation such that angle mid maps to PI/2.
      const want = Math.PI / 2 - mid
      const cur = group.rotation.y
      const delta = Math.atan2(Math.sin(want - cur), Math.cos(want - cur))
      rotRef.current = { from: cur, to: cur + delta, start: performance.now() }
      const r = rotRef.current
      stage.current?.animateFor(620, (now) => { group.rotation.y = r.from + (r.to - r.from) * easeOut((now - r.start) / 620) })
    } else stage.current?.requestRender()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, rings, isDay])

  return <canvas ref={canvasRef} aria-hidden style={{ display: 'block', width: '100%', height: size, touchAction: 'pan-y', cursor: 'grab' }}/>
}
