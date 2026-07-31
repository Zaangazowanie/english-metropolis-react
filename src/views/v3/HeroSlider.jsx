import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useVariant } from '../../lib/useVariant.js'

const AUTOPLAY_MS = 6500

// One slide = one product pillar with a fixed call to action. The photograph is
// drawn from that pillar's pool (see useVariant), so the CTA a visitor sees is
// always the same four while the imagery rotates between visits.
function Slide({ slide, active }) {
  const image = useVariant(slide.images)
  const Wrap = slide.href ? 'a' : Link
  const wrapProps = slide.href ? { href: slide.href } : { to: slide.to }
  return (
    <li className="gh-hs-slide" data-active={active} aria-hidden={!active}>
      <img src={image} alt={slide.alt} loading={active ? 'eager' : 'lazy'}
        width="1600" height="900" draggable="false"/>
      <div className="gh-hs-caption">
        <span className="gh-hs-eyebrow">{slide.eyebrow}</span>
        <strong className="gh-hs-title">{slide.title}</strong>
        <Wrap {...wrapProps} className="gh-hs-cta" tabIndex={active ? 0 : -1}>
          {slide.cta}
          <span className="material-symbols-outlined" aria-hidden>arrow_forward</span>
        </Wrap>
      </div>
    </li>
  )
}

export default function HeroSlider({ slides, label }) {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const rootRef = useRef(null)
  const touchX = useRef(null)
  const count = slides.length

  const go = useCallback((next) => setIndex(((next % count) + count) % count), [count])

  // Autoplay stops for reduced-motion users, on hover/focus, and whenever the
  // tab is hidden — an unattended carousel advancing in a background tab just
  // burns the visitor's place in the sequence.
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced || paused) return undefined
    const id = window.setInterval(() => setIndex((i) => (i + 1) % count), AUTOPLAY_MS)
    return () => window.clearInterval(id)
  }, [paused, count])

  useEffect(() => {
    const onVis = () => setPaused(document.hidden)
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  const onKeyDown = (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); go(index + 1) }
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(index - 1) }
  }

  return (
    <div
      ref={rootRef}
      className="gh-hs"
      role="group"
      aria-roledescription="carousel"
      aria-label={label}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onTouchStart={(e) => { touchX.current = e.touches[0].clientX }}
      onTouchEnd={(e) => {
        if (touchX.current == null) return
        const dx = e.changedTouches[0].clientX - touchX.current
        if (Math.abs(dx) > 44) go(index + (dx < 0 ? 1 : -1))
        touchX.current = null
      }}
    >
      <ul className="gh-hs-track">
        {slides.map((slide, i) => (
          <Slide key={slide.key} slide={slide} active={i === index}/>
        ))}
      </ul>

      <div className="gh-hs-dots" role="tablist" aria-label={label}>
        {slides.map((slide, i) => (
          <button
            key={slide.key}
            type="button"
            role="tab"
            className="gh-hs-dot"
            data-active={i === index}
            aria-selected={i === index}
            aria-label={slide.title}
            onClick={() => go(i)}
          />
        ))}
      </div>
    </div>
  )
}
