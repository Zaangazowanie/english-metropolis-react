import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { prefersReducedMotion } from '../motion/useReducedMotion.js'
import { hasWebGL } from './useThreeCanvas.js'

// <ThreeSlot load={() => import('./MetroLine.jsx')} fallback={<Svg/>} {...props}>
// Mounts a lazy three.js piece only when (a) it scrolls into view, (b) WebGL
// is available and (c) motion is not reduced. Otherwise the static fallback
// (SVG/CSS, same data) renders, so the slot is never empty. The three.js
// chunk is not requested until the slot is actually visible.
const registry = new Map()
function lazyFor(load, key) {
  if (!registry.has(key)) registry.set(key, lazy(load))
  return registry.get(key)
}

export function ThreeSlot({ load, id, fallback, style, className, ...props }) {
  const ref = useRef(null)
  const [webgl] = useState(() => hasWebGL() && !prefersReducedMotion())
  const [ready, setReady] = useState(() => typeof IntersectionObserver === 'undefined')
  const [Comp] = useState(() => (webgl ? lazyFor(load, id) : null))
  useEffect(() => {
    if (ready || !webgl) return
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver((es) => { if (es.some(e => e.isIntersecting)) { setReady(true); io.disconnect() } }, { rootMargin: '120px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [ready, webgl])
  return (
    <div ref={ref} className={className} style={{ position: 'relative', ...style }}>
      {Comp && ready
        ? <Suspense fallback={fallback}><Comp {...props}/></Suspense>
        : fallback}
    </div>
  )
}
