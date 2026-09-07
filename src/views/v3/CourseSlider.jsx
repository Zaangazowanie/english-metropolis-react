import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { COURSE_SLIDES } from './course-slides.js'
import { clearPointerPolish, pulsePointerPolish, setPointerPolish } from '../../components/public/motionPolish.js'
import './course-slider.css'

export default function CourseSlider({ lang = 'en' }) {
  const pl = lang === 'pl'
  const slides = COURSE_SLIDES[pl ? 'pl' : 'en']
  const [active, setActive] = useState(0)
  const tabs = useRef([])
  const touch = useRef(null)
  const select = (index, focus = false) => {
    const next = (index + slides.length) % slides.length
    setActive(next)
    if (focus) tabs.current[next]?.focus({ preventScroll: true })
  }
  const onKeyDown = (event) => {
    const next = { ArrowRight: active + 1, ArrowLeft: active - 1, Home: 0, End: slides.length - 1 }[event.key]
    if (next === undefined) return
    event.preventDefault()
    select(next, true)
  }
  return (
    <section className="gh-section gh-courses" id="courses" aria-labelledby="gh-courses-title">
      <div className="gh-courses-heading">
        <div>
          <div className="gh-kicker">{pl ? 'Kursy specjalistyczne i małe grupy' : 'Specialist courses & small groups'}</div>
          <h2 id="gh-courses-title">{pl ? 'Twój angielski. Twój konkretny cel.' : 'Your English. A real purpose.'}</h2>
        </div>
        <p>{pl ? 'Przygotuj się do ważnej rozmowy lub rozwijaj język w małej grupie. Zobacz, jak możemy Ci pomóc.' : 'Prepare for an important conversation or grow your English in a small group. Explore how we can help.'}</p>
      </div>
      <div className="gh-course-tabs" role="tablist" aria-label={pl ? 'Wybierz cel nauki' : 'Choose your learning goal'} onKeyDown={onKeyDown}>
        {slides.map((slide, index) => <button type="button" role="tab" key={slide.id}
          id={`course-tab-${slide.id}`} aria-controls={`course-panel-${slide.id}`} aria-selected={active === index}
          tabIndex={active === index ? 0 : -1} ref={el => { tabs.current[index] = el }} onClick={() => select(index)}
          onPointerMove={setPointerPolish} onPointerLeave={clearPointerPolish} onPointerDown={pulsePointerPolish}>
          <span className="gh-course-tab-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>{slide.label}
        </button>)}
      </div>
      <div className="gh-course-stage" onTouchStart={event => {
        if (event.touches.length === 1) touch.current = { x: event.touches[0].clientX, y: event.touches[0].clientY }
      }} onTouchCancel={() => { touch.current = null }} onTouchEnd={event => {
        if (!touch.current || !event.changedTouches[0]) return
        const dx = event.changedTouches[0].clientX - touch.current.x
        const dy = event.changedTouches[0].clientY - touch.current.y
        touch.current = null
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) select(active + (dx < 0 ? 1 : -1))
      }}>
        {slides.map((slide, index) => <div className={`gh-course-panel${active === index ? ' is-active' : ''}`}
          key={slide.id} role="tabpanel" id={`course-panel-${slide.id}`} aria-labelledby={`course-tab-${slide.id}`}
          aria-hidden={active !== index} inert={active !== index} tabIndex={active === index ? 0 : -1}>
          <figure className="gh-course-visual" onPointerMove={setPointerPolish} onPointerLeave={clearPointerPolish}>
            <img src={`/home/courses/${slide.id}.webp`} alt={slide.alt} width="502" height="502" loading="lazy"/>
            <span className="gh-course-image-label"><small>{slide.tag}</small>{slide.label}</span>
            {/* Same lockup as every hero slide and photograph (.gh-watermark in
                game-home.css), with the AI disclosure tucked above it. */}
            <figcaption className="gh-ai-note">{pl ? 'Ilustracja wygenerowana przez AI' : 'AI-generated illustration'}</figcaption>
            <span className="gh-watermark" aria-hidden="true"/>
          </figure>
          <div className="gh-course-copy">
            <p className="gh-course-tag">{slide.tag}</p>
            <h3>{slide.title}</h3>
            <p className="gh-course-intro">{slide.body}</p>
            <ul>{slide.points.map(point => <li key={point}><span className="material-symbols-outlined" aria-hidden="true">check_circle</span>{point}</li>)}</ul>
            <p className="gh-course-example">{slide.example}</p>
            <div className="gh-course-actions">
              {/* Both buttons are the header pills (.gh-action). Specialist goals
                  scroll to the specialist programmes on this page; the group
                  course lives on the pricing page. */}
              {slide.id === 'groups' ? (
                <Link className="gh-action gh-action--primary gh-action--md" to="/pricing#summer-title"
                  onPointerMove={setPointerPolish} onPointerLeave={clearPointerPolish} onPointerDown={pulsePointerPolish}>
                  <span>{pl ? 'Zobacz kursy grupowe' : 'Explore group courses'}</span>
                  <span className="material-symbols-outlined" aria-hidden="true">arrow_forward</span>
                </Link>
              ) : (
                <a className="gh-action gh-action--primary gh-action--md" href="#specialist-packs"
                  onPointerMove={setPointerPolish} onPointerLeave={clearPointerPolish} onPointerDown={pulsePointerPolish}>
                  <span>{pl ? 'Zobacz programy specjalistyczne' : 'See specialist programmes'}</span>
                  <span className="material-symbols-outlined" aria-hidden="true">arrow_downward</span>
                </a>
              )}
              <Link className="gh-action gh-action--secondary gh-action--md" to="/signup"
                onPointerMove={setPointerPolish} onPointerLeave={clearPointerPolish} onPointerDown={pulsePointerPolish}>
                <span>{pl ? 'Porozmawiajmy o Twoim celu' : 'Tell us your goal'}</span>
                <span className="material-symbols-outlined" aria-hidden="true">forum</span>
              </Link>
            </div>
          </div>
        </div>)}
      </div>
      <div className="gh-course-controls">
        <p aria-live="polite" aria-atomic="true"><b>{String(active + 1).padStart(2, '0')}</b> / {String(slides.length).padStart(2, '0')}<span>{slides[active].label}</span></p>
        <div>
          <button type="button" onClick={() => select(active - 1)} aria-label={pl ? 'Poprzedni kurs' : 'Previous course'}
            onPointerMove={setPointerPolish} onPointerLeave={clearPointerPolish} onPointerDown={pulsePointerPolish}><span className="material-symbols-outlined" aria-hidden="true">arrow_back</span></button>
          <button type="button" onClick={() => select(active + 1)} aria-label={pl ? 'Następny kurs' : 'Next course'}
            onPointerMove={setPointerPolish} onPointerLeave={clearPointerPolish} onPointerDown={pulsePointerPolish}><span className="material-symbols-outlined" aria-hidden="true">arrow_forward</span></button>
        </div>
      </div>
    </section>
  )
}
