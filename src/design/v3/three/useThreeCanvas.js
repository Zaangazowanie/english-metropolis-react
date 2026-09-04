import { useEffect, useRef } from 'react'
import * as THREE from 'three'

// useThreeCanvas(canvasRef, setup, deps)
// Shared plumbing for the portal's functional 3D pieces:
//   * WebGL renderer with alpha, pixel ratio capped at 1.5
//   * render ON DEMAND: stage.requestRender() draws one frame on the next rAF;
//     stage.animateFor(ms, onFrame) runs frames only for that window. There is
//     never a continuous loop while idle, and nothing draws while offscreen.
//   * ResizeObserver keeps the drawing buffer in step with the CSS box
//   * full disposal on unmount (geometries, materials, textures, renderer,
//     context loss) so a tab switch releases the GPU.
// setup(stage) receives { THREE, renderer, scene, camera, width, height } and
// returns optional { onResize(w, h), onPointer(x, y, type), dispose }.
export function useThreeCanvas(canvasRef, setup, deps = [], { pointerTarget = 'self' } = {}) {
  const stageRef = useRef(null)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let renderer
    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' })
    } catch { return }
    renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1))
    renderer.setClearColor(0x000000, 0)
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100)
    const stage = { THREE, renderer, scene, camera, width: 1, height: 1, visible: true }
    let rafId = 0, animEnd = 0, animCb = null, disposed = false

    const draw = () => { if (!disposed && stage.visible) renderer.render(scene, camera) }
    const loop = (now) => {
      rafId = 0
      if (disposed) return
      if (animCb && now < animEnd) { animCb(now); draw(); rafId = requestAnimationFrame(loop); return }
      if (animCb) { animCb(animEnd); animCb = null }
      draw()
    }
    stage.requestRender = () => { if (!rafId && !disposed) rafId = requestAnimationFrame(loop) }
    stage.animateFor = (ms, cb) => { animEnd = performance.now() + ms; animCb = cb; stage.requestRender() }
    stage.stopAnimation = () => { animCb = null }

    const resize = () => {
      const w = Math.max(1, canvas.clientWidth), h = Math.max(1, canvas.clientHeight)
      stage.width = w; stage.height = h
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      hooks?.onResize?.(w, h)
      stage.requestRender()
    }
    // Expose the stage before setup so pieces can start their entrance
    // animation from inside setup (stage.animateFor is already wired).
    stageRef.current = stage
    let hooks = null
    hooks = setup(stage) || {}
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    // Offscreen: stop drawing entirely (and drop any running animation).
    const io = new IntersectionObserver(([e]) => {
      stage.visible = !!e?.isIntersecting
      if (stage.visible) stage.requestRender(); else stage.stopAnimation()
    }, { threshold: 0.05 })
    io.observe(canvas)
    const onPointer = (e) => {
      const r = canvas.getBoundingClientRect()
      hooks?.onPointer?.((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height, e.type)
    }
    const pt = pointerTarget === 'parent' ? canvas.parentElement
      : (pointerTarget && typeof pointerTarget === 'object' && 'current' in pointerTarget) ? pointerTarget.current
      : canvas
    if (hooks.onPointer && pt) {
      pt.addEventListener('pointermove', onPointer)
      pt.addEventListener('pointerleave', onPointer)
      pt.addEventListener('pointerdown', onPointer)
    }
    return () => {
      disposed = true
      if (rafId) cancelAnimationFrame(rafId)
      ro.disconnect(); io.disconnect()
      if (pt) {
        pt.removeEventListener('pointermove', onPointer)
        pt.removeEventListener('pointerleave', onPointer)
        pt.removeEventListener('pointerdown', onPointer)
      }
      hooks?.dispose?.()
      scene.traverse(obj => {
        obj.geometry?.dispose?.()
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
        mats.forEach(m => { if (!m) return; Object.values(m).forEach(v => v?.isTexture && v.dispose()); m.dispose?.() })
      })
      renderer.dispose()
      renderer.forceContextLoss?.()
      stageRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return stageRef
}

export function hasWebGL() {
  if (typeof document === 'undefined') return false
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch { return false }
}

// Critically damped approach helper for on-demand animations.
export const easeOut = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3)
