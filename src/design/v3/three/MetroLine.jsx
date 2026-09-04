import { useRef } from 'react'
import { useThreeCanvas } from './useThreeCanvas.js'
import { buildLessonMetro } from './lessonMetroScene.js'

export default function MetroLine({ stations = 0, lit = 0, next = false, isDay = false, height = 240 }) {
  const canvasRef = useRef(null)
  useThreeCanvas(canvasRef, stage => {
    const { THREE, scene, camera } = stage
    scene.add(new THREE.AmbientLight(0xffffff, isDay ? 2.2 : 1.3))
    const key = new THREE.DirectionalLight(0xddd4ff, 2.5); key.position.set(-2, 6, 5); scene.add(key)
    const rim = new THREE.DirectionalLight(0xea9bdc, 1.5); rim.position.set(3, 2, -3); scene.add(rim)
    const model = buildLessonMetro(THREE, scene, { stations, lit, next, isDay })
    let distance = 7
    const fit = (w, h) => {
      distance = Math.max(3.8, 6.25 / Math.tan(camera.fov * Math.PI / 360) / Math.max(.5, w / h))
      camera.position.set(0, distance * .48, distance); camera.lookAt(0, .35, 0)
    }
    fit(stage.width, stage.height)
    model.placeTrain(model.target)
    return {
      onResize: fit,
      onPointer: (x, y, type) => {
        if (window.matchMedia('(prefers-reduced-motion: reduce), (pointer: coarse)').matches) return
        const dx = type === 'pointerleave' ? 0 : (x - .5) * .045
        const dy = type === 'pointerleave' ? 0 : (y - .5) * .025
        camera.position.set(dx * distance, distance * (.48 - dy), distance); camera.lookAt(0, .35, 0)
        stage.requestRender()
      },
    }
  }, [stations, lit, next, isDay])
  // useThreeCanvas releases its WebGL context when dependencies change.
  // Give the replacement scene a fresh canvas rather than a lost context.
  return <canvas key={`${stations}-${lit}-${next}-${isDay}`} ref={canvasRef} aria-hidden style={{ display: 'block', width: '100%', height }}/>
}
