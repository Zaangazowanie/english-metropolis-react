// Shared pointer polish for public marketing surfaces.
// CSS consumes these custom properties, so pointer movement never re-renders React.
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
}

export function clearPointerPolish(event) {
  const element = event.currentTarget
  element.style.setProperty('--motion-x', '50%')
  element.style.setProperty('--motion-y', '50%')
  element.style.setProperty('--motion-tilt-x', '0deg')
  element.style.setProperty('--motion-tilt-y', '0deg')
}
