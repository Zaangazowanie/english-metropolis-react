import { useEffect, useRef, useState } from 'react'
import { useV3Theme } from '../../design/v3/ThemeProvider.jsx'
import { usePrefersReducedMotion } from '../../practice/lib/usePrefersReducedMotion'
import { LESSON_TOUR } from '../../previews/student-demo-data.mjs'
import './student-feature-frame.css'

export default function StudentFeatureFrame({ feature, lang }) {
  const frame = useRef(null), host = useRef(null), { mode } = useV3Theme()
  const reduced = usePrefersReducedMotion(), pl = lang === 'pl'
  const [loaded, setLoaded] = useState(false), [ready, setReady] = useState(false), [visible, setVisible] = useState(false)
  const [playing, setPlaying] = useState(feature === 'analysis' && !reduced), [step, setStep] = useState(0)
  const send = data => frame.current?.contentWindow?.postMessage(data, location.origin)
  const url = `/student-preview.html?feature=${feature}&lang=${lang}&mode=${mode}`
  const [initialUrl] = useState(url)
  const configuration = useRef({ lang, mode })
  useEffect(() => { configuration.current = { lang, mode } }, [lang, mode])
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setLoaded(true)
      setVisible(entry.isIntersecting)
      if (!entry.isIntersecting) send({ type: 'em-preview-pause-media' })
    }, { threshold: 0.1 })
    observer.observe(host.current)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    const handler = event => {
      if (event.origin !== location.origin || event.source !== frame.current?.contentWindow) return
      if (event.data?.type === 'em-preview-ready') { setReady(true); send({ type: 'em-preview-config', ...configuration.current }) }
      if (event.data?.type === 'em-preview-interaction') setPlaying(false)
      if (event.data?.type === 'em-preview-open-account') location.assign('/signup')
      if (event.data?.type === 'em-preview-media-play') {
        document.dispatchEvent(new CustomEvent('em-public-clip-play', { detail: feature }))
        for (const other of document.querySelectorAll('iframe[data-student-preview]')) {
          if (other !== frame.current) other.contentWindow.postMessage({ type: 'em-preview-pause-media' }, location.origin)
        }
      }
    }
    const pause = event => { if (event.detail !== feature) send({ type: 'em-preview-pause-media' }) }
    window.addEventListener('message', handler)
    document.addEventListener('em-public-clip-play', pause)
    return () => { window.removeEventListener('message', handler); document.removeEventListener('em-public-clip-play', pause) }
  }, [feature])
  useEffect(() => { if (ready) send({ type: 'em-preview-config', lang, mode }) }, [ready, lang, mode])
  useEffect(() => {
    if (!ready || feature !== 'analysis') return
    send({ type: 'em-preview-step', index: step })
  }, [ready, step, feature])
  useEffect(() => {
    if (!ready || !visible || !playing || reduced || feature !== 'analysis') return
    const timer = setTimeout(() => {
      if (document.hidden) return
      if (step === LESSON_TOUR.length - 1) setPlaying(false)
      else setStep(value => value + 1)
    }, step === 0 ? 10000 : 8500)
    return () => clearTimeout(timer)
  }, [ready, visible, playing, reduced, feature, step])
  useEffect(() => {
    const query = matchMedia('(prefers-reduced-motion: reduce)')
    const change = event => { if (event.matches) setPlaying(false) }
    query.addEventListener('change', change)
    return () => query.removeEventListener('change', change)
  }, [])

  return <div ref={host} className="em-student-preview gh-glass">
    <div className="em-student-preview-toolbar">
      <span>{feature === 'analysis' ? (pl ? 'Twoja lekcja, krok po kroku' : 'Your lesson, step by step') : (pl ? 'Wybierz fiszkę. Otwórz nagrania.' : 'Choose a flashcard. Open the videos.')}</span>
      <div>
        {feature === 'analysis' && <>
          <span className="em-student-preview-step">{step + 1} / {LESSON_TOUR.length}</span>
          <button type="button" onClick={() => { setPlaying(false); setStep(value => Math.max(0, value - 1)) }} disabled={step === 0} aria-label={pl ? 'Poprzedni krok' : 'Previous tour step'}><span className="material-symbols-outlined">chevron_left</span></button>
          <button type="button" aria-pressed={playing} onClick={() => { if (step === LESSON_TOUR.length - 1) setStep(0); setPlaying(value => !value) }} aria-label={playing ? (pl ? 'Wstrzymaj pokaz' : 'Pause lesson tour') : (pl ? 'Odtwórz pokaz' : 'Play lesson tour')}><span className="material-symbols-outlined">{playing ? 'pause' : 'play_arrow'}</span></button>
          <button type="button" onClick={() => { setPlaying(false); setStep(value => Math.min(LESSON_TOUR.length - 1, value + 1)) }} disabled={step === LESSON_TOUR.length - 1} aria-label={pl ? 'Następny krok' : 'Next tour step'}><span className="material-symbols-outlined">chevron_right</span></button>
        </>}
        <a href={url} target="_blank" rel="noopener noreferrer" aria-label={pl ? 'Otwórz podgląd w pełnym oknie' : 'Open full-size app preview'}><span className="material-symbols-outlined">open_in_new</span></a>
      </div>
    </div>
    {feature === 'analysis' && <nav className="em-student-tour-nav" aria-label={pl ? 'Kroki prezentacji lekcji' : 'Lesson tour steps'}>
      {LESSON_TOUR.map(([key, en, polish], index) => <button key={key} type="button" aria-current={step === index ? 'step' : undefined}
        onClick={() => { setPlaying(false); setStep(index) }}>{pl ? polish : en}</button>)}
    </nav>}
    {loaded ? <iframe ref={frame} data-student-preview={feature} src={initialUrl} title={feature === 'analysis' ? (pl ? 'Analiza lekcji w aplikacji English Metro' : 'English Metro lesson analysis app') : (pl ? 'Słownictwo w aplikacji English Metro' : 'English Metro vocabulary app')}
      allow="autoplay; fullscreen; picture-in-picture" className="em-student-preview-frame"/> : <div className="em-student-preview-placeholder" aria-hidden/>}
  </div>
}
