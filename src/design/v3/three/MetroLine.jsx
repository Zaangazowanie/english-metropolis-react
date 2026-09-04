import { useEffect, useRef } from 'react'
import { useThreeCanvas, easeOut } from './useThreeCanvas.js'

// MetroLine — the student's lesson package drawn as a metro line.
//   stations = allocated lessons in the current package(s)
//   lit (brand pink) = lessons already taken from it
//   emerald halo     = the next station when a lesson is booked
//   dim glass        = lessons still to book
//   the train sits at the last taken lesson and slides there on mount
// Encodes orders:getStudentAllocation {allocated, used} + data.upcomingLesson.
// Pointer x/y tilts the camera slightly (fine pointer); frames are drawn only
// on pointer events and during the two short animations.
const PINK = 0xd946ef, VIOLET = 0x8b5cf6, EMERALD = 0x34d399

function linePoints(THREE, n, width) {
  const pts = []
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1)
    const x = (t - 0.5) * width
    const y = Math.sin(t * Math.PI * 1.6 + 0.4) * 0.22
    pts.push(new THREE.Vector3(x, y, 0))
  }
  return pts
}

export default function MetroLine({ stations = 0, lit = 0, next = false, isDay = false, height = 150 }) {
  const canvasRef = useRef(null)
  const stage = useThreeCanvas(canvasRef, (stage) => {
    const { THREE, scene, camera } = stage
    const n = Math.max(2, Math.min(30, stations || 2))
    const width = 10
    // Fit: the camera backs off until the 10-unit line spans ~82% of the
    // canvas width, whatever the aspect (a wide desktop strip or a phone).
    let dist = 6.2
    const fit = (w, h) => {
      const aspect = Math.max(0.5, w / Math.max(1, h))
      dist = Math.max(3, (width / 0.82 / 2) / (Math.tan((camera.fov * Math.PI) / 360) * aspect))
      camera.position.set(0, dist * 0.22, dist)
      camera.lookAt(0, 0, 0)
    }
    fit(stage.width, stage.height)
    scene.add(new THREE.AmbientLight(0xffffff, isDay ? 1.6 : 1.5))
    const key = new THREE.DirectionalLight(0xffffff, isDay ? 1.2 : 1.8)
    key.position.set(2, 4, 5); scene.add(key)
    const rim = new THREE.PointLight(PINK, 6, 12); rim.position.set(-2, 1.5, 2); scene.add(rim)

    const pts = linePoints(THREE, n, width)
    const curve = new THREE.CatmullRomCurve3(pts)
    const tube = new THREE.Mesh(
      new THREE.TubeGeometry(curve, Math.max(32, n * 6), 0.045, 10, false),
      new THREE.MeshStandardMaterial({ color: isDay ? 0xc4b5fd : 0x6d4fc2, emissive: isDay ? 0x000000 : 0x3b2a7a, emissiveIntensity: isDay ? 0 : 0.5, roughness: 0.5, metalness: 0.2 }))
    scene.add(tube)
    // Lit portion of the track: a second tube covering the taken stretch.
    const litN = Math.max(0, Math.min(n, lit))
    if (litN > 1) {
      const litCurve = new THREE.CatmullRomCurve3(pts.slice(0, litN))
      const litTube = new THREE.Mesh(new THREE.TubeGeometry(litCurve, Math.max(16, litN * 6), 0.06, 10, false),
        new THREE.MeshStandardMaterial({ color: PINK, emissive: PINK, emissiveIntensity: isDay ? 0.25 : 0.7, roughness: 0.3 }))
      scene.add(litTube)
    }
    const stationGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.08, 24)
    const ringGeo = new THREE.TorusGeometry(0.2, 0.025, 10, 32)
    pts.forEach((p, i) => {
      const taken = i < litN
      const isNext = next && i === litN && i < n
      const mat = new THREE.MeshStandardMaterial({
        color: taken ? PINK : isNext ? EMERALD : (isDay ? 0xffffff : 0x6b57b3),
        emissive: taken ? PINK : isNext ? EMERALD : (isDay ? 0x000000 : 0x4c3a86),
        emissiveIntensity: taken ? (isDay ? 0.3 : 0.8) : isNext ? 0.9 : (isDay ? 0 : 0.35),
        roughness: 0.35, metalness: 0.15, transparent: !taken && !isNext, opacity: taken || isNext ? 1 : (isDay ? 0.95 : 0.9),
      })
      const st = new THREE.Mesh(stationGeo, mat)
      st.rotation.x = Math.PI / 2
      st.position.copy(p)
      scene.add(st)
      if (isNext) {
        const halo = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: EMERALD, transparent: true, opacity: 0.85 }))
        halo.position.copy(p); scene.add(halo)
      }
    })
    // Train: rounded capsule that slides from the depot to the last taken lesson.
    const train = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.34, 6, 14),
      new THREE.MeshStandardMaterial({ color: isDay ? 0xffffff : 0xf4f0ff, emissive: VIOLET, emissiveIntensity: isDay ? 0.15 : 0.5, roughness: 0.25 }))
    train.rotation.z = Math.PI / 2
    scene.add(train)
    const targetT = n === 1 ? 0.5 : Math.max(0, litN - 1) / (n - 1)
    const placeTrain = (t) => {
      const p = curve.getPointAt(Math.min(0.999, Math.max(0, t)))
      const tan = curve.getTangentAt(Math.min(0.999, Math.max(0, t)))
      train.position.set(p.x, p.y + 0.02, 0.12)
      train.rotation.z = Math.atan2(tan.y, tan.x)
    }
    placeTrain(0)
    const start = performance.now()
    stage.animateFor(1300, (now) => placeTrain(targetT * easeOut((now - start) / 1300)))

    let tilt = { x: 0, y: 0 }
    return {
      onPointer: (x, y, type) => {
        if (type === 'pointerleave') tilt = { x: 0, y: 0 }
        else tilt = { x: (x - 0.5) * 0.5, y: (y - 0.5) * 0.25 }
        camera.position.set(tilt.x * dist * 0.15, dist * 0.22 - tilt.y * dist * 0.1, dist)
        camera.lookAt(0, 0, 0)
        stage.requestRender()
      },
      onResize: (w, h) => fit(w, h),
    }
  }, [stations, lit, next, isDay])
  useEffect(() => { stage.current?.requestRender() }, [stage])
  return <canvas ref={canvasRef} aria-hidden style={{ display: 'block', width: '100%', height }}/>
}
