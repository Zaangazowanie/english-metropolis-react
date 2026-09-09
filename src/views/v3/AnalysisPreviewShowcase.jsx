import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import './feature-previews.css'

const AnalysisFilm = lazy(() => import('../../previews/AnalysisFilm.jsx'))

export default function AnalysisPreviewShowcase({ lang }) {
  const host = useRef(null), [loaded, setLoaded] = useState(false)
  const title = lang === 'pl' ? 'Podgląd pełnej analizy lekcji' : 'Full lesson analysis preview'
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setLoaded(true); observer.disconnect() }
    }, { rootMargin: '300px' })
    observer.observe(host.current)
    return () => observer.disconnect()
  }, [])
  const placeholder = <div className="gh-glass" style={{ height: 490, borderRadius: 24 }} aria-label={title}/>
  return <section ref={host} className="gh-section em-feature-preview" id="lesson-analysis-preview" aria-label={title}>
    {loaded ? <Suspense fallback={placeholder}><AnalysisFilm key={lang} lang={lang}/></Suspense> : placeholder}
  </section>
}
