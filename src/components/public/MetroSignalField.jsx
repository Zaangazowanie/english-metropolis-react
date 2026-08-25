import { useEffect, useRef } from 'react'

const PALETTES = {
  dark: {
    grid: '105, 225, 255',
    violet: '139, 92, 246',
    fuchsia: '236, 72, 153',
    sky: '96, 165, 250',
    wash: '16, 10, 40',
  },
  light: {
    grid: '96, 165, 250',
    violet: '124, 58, 237',
    fuchsia: '219, 39, 119',
    sky: '14, 165, 233',
    wash: '248, 246, 255',
  },
}

function seededRandom(seed) {
  let value = seed >>> 0
  return () => {
    value += 0x6D2B79F5
    let next = value
    next = Math.imul(next ^ (next >>> 15), next | 1)
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61)
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * A small Canvas 2D signal field inspired by metro maps, lesson routes, and
 * predictive interfaces. It deliberately avoids WebGL so the existing 3D city
 * keeps the page's main GPU budget.
 */
export default function MetroSignalField({ className = '', mode = 'dark', density = 58 }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const host = canvas?.parentElement
    if (!canvas || !host) return undefined

    const context = canvas.getContext('2d', { alpha: true, desynchronized: true })
    if (!context) return undefined

    const palette = PALETTES[mode] || PALETTES.dark
    const random = seededRandom(mode === 'dark' ? 918273 : 192837)
    const nodes = Array.from({ length: density }, (_, index) => ({
      x: random(),
      y: random(),
      radius: 0.7 + random() * 1.7,
      phase: random() * Math.PI * 2,
      speed: 0.45 + random() * 0.9,
      color: index % 7 === 0 ? palette.fuchsia : index % 5 === 0 ? palette.sky : palette.violet,
    }))
    const routePairs = nodes.slice(0, 12).map((node, index) => [node, nodes[(index * 5 + 17) % nodes.length]])

    const reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    let reduced = reducedQuery.matches
    let visible = true
    let frame = 0
    let width = 0
    let height = 0
    let pixelRatio = 1
    const pointer = { x: 0.5, y: 0.42, tx: 0.5, ty: 0.42 }

    function resize() {
      const bounds = host.getBoundingClientRect()
      width = Math.max(1, bounds.width)
      height = Math.max(1, bounds.height)
      pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5)
      canvas.width = Math.round(width * pixelRatio)
      canvas.height = Math.round(height * pixelRatio)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      draw(performance.now(), true)
    }

    function nodePosition(node, seconds, still) {
      const drift = still ? 0 : Math.sin(seconds * node.speed + node.phase) * 0.006
      const depth = 0.72 + node.y * 0.48
      return {
        x: (node.x + drift + (pointer.x - 0.5) * 0.012 * depth) * width,
        y: (node.y - drift * 0.7 + (pointer.y - 0.5) * 0.009 * depth) * height,
      }
    }

    function draw(time = 0, forceStill = false) {
      if (!width || !height) return
      const seconds = time / 1000
      const still = reduced || forceStill
      pointer.x += (pointer.tx - pointer.x) * 0.055
      pointer.y += (pointer.ty - pointer.y) * 0.055

      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
      context.clearRect(0, 0, width, height)

      const lens = context.createRadialGradient(pointer.x * width, pointer.y * height, 0, pointer.x * width, pointer.y * height, Math.max(width, height) * 0.45)
      lens.addColorStop(0, `rgba(${palette.violet}, ${mode === 'dark' ? 0.13 : 0.075})`)
      lens.addColorStop(0.45, `rgba(${palette.fuchsia}, ${mode === 'dark' ? 0.055 : 0.032})`)
      lens.addColorStop(1, 'rgba(0,0,0,0)')
      context.fillStyle = lens
      context.fillRect(0, 0, width, height)

      context.save()
      context.lineWidth = 1
      for (let row = 0; row < 8; row += 1) {
        const progress = row / 7
        const y = height * (0.16 + progress * progress * 0.82)
        context.strokeStyle = `rgba(${palette.grid}, ${0.018 + progress * 0.025})`
        context.beginPath()
        context.moveTo(-width * 0.08, y)
        context.lineTo(width * 1.08, y - height * 0.045)
        context.stroke()
      }
      for (let column = -2; column <= 10; column += 1) {
        const topX = width * (0.5 + (column - 4) * 0.045)
        const bottomX = width * (0.5 + (column - 4) * 0.16)
        context.strokeStyle = `rgba(${palette.grid}, 0.026)`
        context.beginPath()
        context.moveTo(topX, height * 0.08)
        context.lineTo(bottomX, height * 1.04)
        context.stroke()
      }
      context.restore()

      routePairs.forEach(([from, to], index) => {
        const a = nodePosition(from, seconds, still)
        const b = nodePosition(to, seconds, still)
        const pulse = still ? 0.38 : 0.22 + (Math.sin(seconds * 0.72 + index) + 1) * 0.11
        context.strokeStyle = `rgba(${index % 2 ? palette.sky : palette.fuchsia}, ${pulse * 0.34})`
        context.lineWidth = index % 3 === 0 ? 1.2 : 0.7
        context.beginPath()
        context.moveTo(a.x, a.y)
        const arc = Math.min(height * 0.18, Math.abs(b.x - a.x) * 0.15 + 18)
        context.quadraticCurveTo((a.x + b.x) / 2, Math.min(a.y, b.y) - arc, b.x, b.y)
        context.stroke()
      })

      nodes.forEach((node, index) => {
        const position = nodePosition(node, seconds, still)
        const breathe = still ? 1 : 0.82 + Math.sin(seconds * node.speed + node.phase) * 0.18
        const nearPointer = Math.hypot(position.x / width - pointer.x, position.y / height - pointer.y)
        const attention = Math.max(0, 1 - nearPointer * 3.7)
        const radius = node.radius * breathe + attention * 2.2

        if (index % 9 === 0) {
          const halo = context.createRadialGradient(position.x, position.y, 0, position.x, position.y, radius * 7)
          halo.addColorStop(0, `rgba(${node.color}, ${0.18 + attention * 0.18})`)
          halo.addColorStop(1, `rgba(${node.color}, 0)`)
          context.fillStyle = halo
          context.beginPath()
          context.arc(position.x, position.y, radius * 7, 0, Math.PI * 2)
          context.fill()
        }

        context.fillStyle = `rgba(${node.color}, ${0.22 + attention * 0.48})`
        context.beginPath()
        context.arc(position.x, position.y, radius, 0, Math.PI * 2)
        context.fill()
      })

      if (!still) {
        const travel = ((seconds * 0.055) % 1.35) - 0.18
        const beamX = travel * width
        const beam = context.createLinearGradient(beamX - 90, 0, beamX + 90, 0)
        beam.addColorStop(0, 'rgba(0,0,0,0)')
        beam.addColorStop(0.5, `rgba(${palette.sky}, ${mode === 'dark' ? 0.075 : 0.04})`)
        beam.addColorStop(1, 'rgba(0,0,0,0)')
        context.fillStyle = beam
        context.fillRect(beamX - 90, 0, 180, height)
      }
    }

    function animate(time) {
      draw(time)
      if (visible && !reduced) frame = window.requestAnimationFrame(animate)
    }

    function handlePointer(event) {
      const bounds = host.getBoundingClientRect()
      pointer.tx = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width))
      pointer.ty = Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height))
    }

    function handleMotionChange(event) {
      reduced = event.matches
      window.cancelAnimationFrame(frame)
      if (reduced) draw(performance.now(), true)
      else if (visible) frame = window.requestAnimationFrame(animate)
    }

    const resizeObserver = new ResizeObserver(resize)
    const visibilityObserver = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      window.cancelAnimationFrame(frame)
      if (visible && !reduced) frame = window.requestAnimationFrame(animate)
    }, { rootMargin: '160px 0px' })

    resizeObserver.observe(host)
    visibilityObserver.observe(canvas)
    window.addEventListener('pointermove', handlePointer, { passive: true })
    reducedQuery.addEventListener?.('change', handleMotionChange)
    resize()
    if (!reduced) frame = window.requestAnimationFrame(animate)

    return () => {
      window.cancelAnimationFrame(frame)
      resizeObserver.disconnect()
      visibilityObserver.disconnect()
      window.removeEventListener('pointermove', handlePointer)
      reducedQuery.removeEventListener?.('change', handleMotionChange)
    }
  }, [density, mode])

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />
}
