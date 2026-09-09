// Visit every analysis section, including content taller than the player.
// Measurements come from the shared app renderer at its current width.
export function analysisTimeline(sections, contentHeight, viewportHeight) {
  const maxScroll = Math.max(0, contentHeight - viewportHeight)
  const clamp = value => Math.max(0, Math.min(maxScroll, value))
  const segments = []
  let duration = 0, position = 0
  const add = (to, seconds, section, pan = false) => {
    // Keep the endpoint stable when the native seek control serializes it.
    const end = Math.round((duration + seconds) * 1000) / 1000
    segments.push({ start: duration, end, from: position, to, section, pan })
    duration = end
    position = to
  }
  for (const section of sections) {
    const top = Math.max(position, clamp(section.top - 24))
    const bottom = Math.max(top, clamp(section.bottom - viewportHeight + 24))
    if (top > position) add(top, 1.1, section.key)
    add(top, 3.5, section.key)
    if (bottom > top) {
      add(bottom, Math.max(2, (bottom - top) / 24), section.key, true)
      add(bottom, 2.5, section.key)
    }
  }
  if (position < maxScroll) add(maxScroll, Math.max(1.1, (maxScroll - position) / 24), 'end', true)
  add(maxScroll, 4, sections.at(-1)?.key || 'overview')
  return { segments, duration, maxScroll }
}

export function analysisCamera(timeline, seconds) {
  const segment = timeline.segments.find(part => seconds < part.end) || timeline.segments.at(-1)
  if (!segment) return 0
  const progress = Math.max(0, Math.min(1, (seconds - segment.start) / (segment.end - segment.start)))
  const eased = segment.pan ? progress : progress * progress * (3 - 2 * progress)
  return segment.from + (segment.to - segment.from) * eased
}

export function filmClock(seconds) {
  const whole = Math.max(0, Math.floor(seconds))
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}
