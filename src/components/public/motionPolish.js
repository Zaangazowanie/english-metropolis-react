// Shared pointer polish for public marketing surfaces.
// CSS consumes these custom properties, so pointer movement never re-renders React.
const SIGNAL_EVENT = 'englishmetro:surface-signal'
let signalFrame = 0
let queuedSignal = null

function publishSurfaceSignal(event, intensity = 0.42) {
  if (typeof window === 'undefined') return
  queuedSignal = { clientX: event.clientX, clientY: event.clientY, intensity }
  if (signalFrame) return
  signalFrame = window.requestAnimationFrame(() => {
    signalFrame = 0
    if (!queuedSignal) return
    window.dispatchEvent(new CustomEvent(SIGNAL_EVENT, { detail: queuedSignal }))
    queuedSignal = null
  })
}

export function setPointerPolish(event) {
  const element = event.currentTarget
  const bounds = element.getBoundingClientRect()
  if (!bounds.width || !bounds.height) return

  const x = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width))
  const y = Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height))
  element.style.setProperty('--motion-x', `${(x * 100).toFixed(2)}%`)
  element.style.setProperty('--motion-y', `${(y * 100).toFixed(2)}%`)
  element.style.setProperty('--motion-tilt-x', `${((0.5 - y) * 4.5).toFixed(2)}deg`)
  element.style.setProperty('--motion-tilt-y', `${((x - 0.5) * 5.5).toFixed(2)}deg`)
  element.style.setProperty('--motion-shift-x', `${((x - 0.5) * 5).toFixed(2)}px`)
  element.style.setProperty('--motion-shift-y', `${((y - 0.5) * 3.5).toFixed(2)}px`)
  element.style.setProperty('--motion-angle', `${(Math.atan2(y - 0.5, x - 0.5) * 180 / Math.PI + 90).toFixed(2)}deg`)
  publishSurfaceSignal(event)
}

export function pulsePointerPolish(event) {
  publishSurfaceSignal(event, 0.92)
}

export function clearPointerPolish(event) {
  const element = event.currentTarget
  element.style.setProperty('--motion-x', '50%')
  element.style.setProperty('--motion-y', '50%')
  element.style.setProperty('--motion-tilt-x', '0deg')
  element.style.setProperty('--motion-tilt-y', '0deg')
  element.style.setProperty('--motion-shift-x', '0px')
  element.style.setProperty('--motion-shift-y', '0px')
  element.style.setProperty('--motion-angle', '0deg')
}
