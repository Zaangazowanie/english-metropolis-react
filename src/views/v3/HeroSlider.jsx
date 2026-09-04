import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

const AUTOPLAY_MS = 6500

function Slide({ slide, image, active, minimal }) {
  const Wrap = slide.href ? 'a' : Link
  const wrapProps = slide.href ? { href: slide.href } : { to: slide.to }

  return (
    <li className="gh-hs-slide" data-active={active} aria-hidden={!active}>
      <img src={image} alt={slide.alt} loading={active ? 'eager' : 'lazy'}
        width="1600" height="900" draggable="false"/>
      {/* A real element, not ::before: em-motion's .em-carousel-dramatic
          .gh-hs-slide::before owns that pseudo for the vignette and outranks
          us, which is why the English note rendered empty on 2026-09-04. */}
      {slide.aiNote && <span className="gh-ai-note">{slide.aiNote}</span>}
      {minimal ? (
        <span className="gh-hs-chip">
          <span className="material-symbols-outlined" aria-hidden>
            {slide.key === 'lessons' ? 'diversity_3' : slide.key === 'course' ? 'track_changes' : 'style'}
          </span>
          {slide.eyebrow}
        </span>
      ) : (
        <div className="gh-hs-caption">
          <span className="gh-hs-eyebrow">{slide.eyebrow}</span>
          <strong className="gh-hs-title">{slide.title}</strong>
          <div className="gh-hs-actions">
            <Wrap {...wrapProps} className="gh-hs-btn gh-hs-btn--primary" tabIndex={active ? 0 : -1}>
              {slide.cta}
            </Wrap>
            {slide.cta2 && (
              <Link to={slide.to2} className="gh-hs-btn gh-hs-btn--secondary" tabIndex={active ? 0 : -1}>
                {slide.cta2}
              </Link>
            )}
          </div>
        </div>
      )}
    </li>
  )
}

export default function HeroSlider({ slides, label, prevLabel, nextLabel, minimal = false }) {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const touchX = useRef(null)
  const count = slides.length

  const [images] = useState(() => {
    const used = new Set()
    return slides.map((slide) => {
      const available = slide.images.filter((src) => !used.has(src))
      const pool = available.length ? available : slide.images
      const image = pool[Math.floor(Math.random() * pool.length)]
      used.add(image)
      return image
    })
  })

  const go = useCallback((next) => {
    setIndex(((next % count) + count) % count)
  }, [count])

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced || paused) return undefined
    const id = window.setInterval(() => setIndex((current) => (current + 1) % count), AUTOPLAY_MS)
    return () => window.clearInterval(id)
  }, [paused, count])

  useEffect(() => {
    const onVisibilityChange = () => setPaused(document.hidden)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [])

  return (
    <div className="gh-hs" role="group" aria-roledescription="carousel" aria-label={label}
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'ArrowRight') { event.preventDefault(); go(index + 1) }
        if (event.key === 'ArrowLeft') { event.preventDefault(); go(index - 1) }
      }}
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}
      onTouchStart={(event) => { touchX.current = event.touches[0].clientX }}
      onTouchEnd={(event) => {
        if (touchX.current == null) return
        const distance = event.changedTouches[0].clientX - touchX.current
        if (Math.abs(distance) > 44) go(index + (distance < 0 ? 1 : -1))
        touchX.current = null
      }}>
      <ul className="gh-hs-track">
        {slides.map((slide, slideIndex) => (
          <Slide key={slide.key} slide={slide} image={images[slideIndex]}
            active={slideIndex === index} minimal={minimal}/>
        ))}
      </ul>

      <button type="button" className="gh-hs-arrow gh-hs-arrow--prev"
        aria-label={prevLabel} onClick={() => go(index - 1)}>
        <span className="material-symbols-outlined" aria-hidden>chevron_left</span>
      </button>
      <button type="button" className="gh-hs-arrow gh-hs-arrow--next"
        aria-label={nextLabel} onClick={() => go(index + 1)}>
        <span className="material-symbols-outlined" aria-hidden>chevron_right</span>
      </button>

      <div className="gh-hs-dots" role="tablist" aria-label={label}>
        {slides.map((slide, slideIndex) => (
          <button key={slide.key} type="button" role="tab" className="gh-hs-dot"
            data-active={slideIndex === index} aria-selected={slideIndex === index}
            aria-label={slide.title} onClick={() => go(slideIndex)}/>
        ))}
      </div>
    </div>
  )
}
