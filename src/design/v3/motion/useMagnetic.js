import { useEffect } from 'react'
import { hasFinePointer, prefersReducedMotion } from './useReducedMotion.js'

// useMagnetic(ref, opts) — pointer-tracking press physics for any element:
//   * the element leans a few px toward the pointer (spring-eased transform)
//   * an optional sheen child (.em-sheen) lights up under the pointer
//   * pointerdown scales to 0.97 instantly (feedback on press, not release)
// Everything is written straight onto the element (no React state, no CSS
// variables inherited by children), so a pointermove costs one style write.
// Gated behind (hover:hover) and (pointer:fine); reduced motion keeps the
// press scale off and the sheen opacity-only.
export function useMagnetic(ref, { strength = 4, press = 0.97, sheen = true, lift = 0 } = {}) {
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const fine = hasFinePointer()
    const reduced = prefersReducedMotion()
    const glow = sheen ? el.querySelector(':scope > .em-sheen') : null
    let pressed = false, hovering = false

    const apply = (dx = 0, dy = 0) => {
      const s = pressed ? press : 1
      const l = hovering && !pressed ? -lift : 0
      el.style.transform = reduced
        ? (pressed ? `scale(${press})` : '')
        : `translate(${dx}px, ${dy + l}px) scale(${s})`
    }
    const onMove = (e) => {
      if (!fine) return
      const r = el.getBoundingClientRect()
      const nx = ((e.clientX - r.left) / r.width) * 2 - 1
      const ny = ((e.clientY - r.top) / r.height) * 2 - 1
      hovering = true
      apply(nx * strength, ny * strength * 0.6)
      if (glow) {
        glow.style.background = `radial-gradient(140px circle at ${e.clientX - r.left}px ${e.clientY - r.top}px, rgba(255,255,255,0.28), rgba(255,255,255,0) 62%)`
        glow.style.opacity = '1'
      }
    }
    const onEnter = () => { hovering = true; apply() }
    const onLeave = () => { hovering = false; pressed = false; el.removeAttribute('data-pressed'); apply(); if (glow) glow.style.opacity = '0' }
    const onDown = () => { pressed = true; el.setAttribute('data-pressed', '1'); apply() }
    const onUp = () => { pressed = false; el.removeAttribute('data-pressed'); apply() }
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerenter', onEnter)
    el.addEventListener('pointerleave', onLeave)
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onUp)
    return () => {
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerenter', onEnter)
      el.removeEventListener('pointerleave', onLeave)
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onUp)
      el.style.transform = ''
    }
  }, [ref, strength, press, sheen, lift])
}

// usePointerGlow(ref) — the card version: a soft radial highlight follows the
// pointer across a `.em-glow` child; nothing moves, so it is safe on cards
// that hold position:fixed children. Fine pointers only.
export function usePointerGlow(ref, { color = 'rgba(217,70,239,0.16)', radius = 260 } = {}) {
  useEffect(() => {
    const el = ref.current
    if (!el || !hasFinePointer()) return
    const glow = el.querySelector(':scope > .em-glow')
    if (!glow) return
    const onMove = (e) => {
      const r = el.getBoundingClientRect()
      glow.style.background = `radial-gradient(${radius}px circle at ${e.clientX - r.left}px ${e.clientY - r.top}px, ${color}, rgba(255,255,255,0) 70%)`
      glow.style.opacity = '1'
    }
    const onLeave = () => { glow.style.opacity = '0' }
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerleave', onLeave)
    return () => { el.removeEventListener('pointermove', onMove); el.removeEventListener('pointerleave', onLeave) }
  }, [ref, color, radius])
}

