import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { LessonDetail } from '../views/v3/Lessons.jsx'
import { useV3Theme } from '../design/v3/ThemeProvider.jsx'
import { studentDemoData } from './student-demo-data.mjs'
import { analysisCamera, analysisTimeline, filmClock } from './analysis-film.mjs'
import './analysis-film.css'

const EMPTY_TIMELINE = { segments: [], duration: 0, maxScroll: 0 }
const Icon = ({ name }) => <span className="material-symbols-outlined" aria-hidden="true">{name}</span>
const AnalysisContent = memo(function AnalysisContent({ lesson }) {
  return <LessonDetail lesson={lesson} analysisOnly/>
})

export default function AnalysisFilm({ lang }) {
  const { T, mode } = useV3Theme(), pl = lang === 'pl'
  const lesson = useMemo(() => studentDemoData(lang).lessons[0], [lang])
  const host = useRef(null), viewport = useRef(null), content = useRef(null), clock = useRef(0)
  const [timeline, setTimeline] = useState(EMPTY_TIMELINE)
  const [time, setTime] = useState(0)
  const [playing, setPlaying] = useState(() => !matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [visible, setVisible] = useState(false)
  const [pageVisible, setPageVisible] = useState(() => !document.hidden)

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: .15 })
    observer.observe(host.current)
    const onVisibility = () => setPageVisible(!document.hidden)
    const motion = matchMedia('(prefers-reduced-motion: reduce)')
    const onMotion = event => { if (event.matches) setPlaying(false) }
    document.addEventListener('visibilitychange', onVisibility)
    motion.addEventListener('change', onMotion)
    return () => {
      observer.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      motion.removeEventListener('change', onMotion)
    }
  }, [])

  useEffect(() => {
    let frame, cancelled = false
    const measure = () => {
      if (cancelled || !content.current || !viewport.current) return
      const page = content.current, origin = page.getBoundingClientRect().top
      const sections = [...page.querySelectorAll('[data-lesson-content] > [data-lesson-section]')].map(element => {
        const box = element.getBoundingClientRect()
        return { key: element.dataset.lessonSection, top: box.top - origin, bottom: box.bottom - origin }
      })
      const next = analysisTimeline(sections, page.scrollHeight, viewport.current.clientHeight)
      clock.current = Math.min(clock.current, next.duration)
      page.style.transform = `translate3d(0, ${-analysisCamera(next, clock.current)}px, 0)`
      setTime(clock.current)
      setTimeline(next)
    }
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure) }
    const observer = new ResizeObserver(schedule)
    observer.observe(content.current)
    observer.observe(viewport.current)
    document.fonts.ready.then(schedule)
    schedule()
    return () => { cancelled = true; cancelAnimationFrame(frame); observer.disconnect() }
  }, [])

  useEffect(() => {
    if (!playing || !visible || !pageVisible || !timeline.duration) return
    let frame, last = performance.now(), lastDisplay = 0
    const advance = now => {
      clock.current = Math.min(timeline.duration, clock.current + Math.min(now - last, 100) / 1000)
      last = now
      content.current.style.transform = `translate3d(0, ${-analysisCamera(timeline, clock.current)}px, 0)`
      if (now - lastDisplay >= 100 || clock.current === timeline.duration) { setTime(clock.current); lastDisplay = now }
      if (clock.current === timeline.duration) setPlaying(false)
      else frame = requestAnimationFrame(advance)
    }
    frame = requestAnimationFrame(advance)
    return () => cancelAnimationFrame(frame)
  }, [playing, visible, pageVisible, timeline])

  const seek = value => {
    clock.current = Math.max(0, Math.min(timeline.duration, value))
    content.current.style.transform = `translate3d(0, ${-analysisCamera(timeline, clock.current)}px, 0)`
    setTime(clock.current)
  }
  const toggle = () => {
    if (clock.current >= timeline.duration) seek(0)
    setPlaying(value => !value)
  }
  const playLabel = playing ? (pl ? 'Wstrzymaj podgląd analizy' : 'Pause analysis preview')
    : time >= timeline.duration ? (pl ? 'Odtwórz analizę ponownie' : 'Replay analysis preview')
    : (pl ? 'Odtwórz podgląd analizy' : 'Play analysis preview')

  return <div ref={host} className="em-analysis-film" data-v3-mode={mode}
    style={{ '--analysis-bg': T.bg0, '--analysis-text': T.text }}
    role="group" aria-label={pl ? 'Podgląd pełnej analizy lekcji' : 'Full lesson analysis preview'}>
    <div ref={viewport} className="em-analysis-film-screen" onClick={toggle}>
      <div ref={content} className="em-analysis-film-content" inert>
        <AnalysisContent lesson={lesson}/>
      </div>
    </div>
    <div className="em-analysis-film-controls">
      <button type="button" onClick={toggle} disabled={!timeline.duration} aria-label={playLabel}><Icon name={playing ? 'pause' : time >= timeline.duration ? 'replay' : 'play_arrow'}/></button>
      <input type="range" min="0" max={timeline.duration || 1} step="any" value={time}
        aria-label={pl ? 'Przewiń podgląd analizy' : 'Seek analysis preview'}
        aria-valuetext={`${filmClock(time)} / ${filmClock(timeline.duration)}`}
        onChange={event => { setPlaying(false); seek(Number(event.target.value)) }}
        style={{ '--film-progress': `${timeline.duration ? time / timeline.duration * 100 : 0}%` }}/>
      <span className="em-analysis-film-clock">{filmClock(time)} <span>/ {filmClock(timeline.duration)}</span></span>
    </div>
  </div>
}
