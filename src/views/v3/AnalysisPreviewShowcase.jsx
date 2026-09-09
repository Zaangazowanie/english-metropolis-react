import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import ActionLink from './ActionLink.jsx'
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
    <div className="em-preview-heading">
      <h2>{lang === 'pl' ? 'Analiza AI po każdej lekcji' : 'AI analysis after every lesson'}</h2>
      <p>{lang === 'pl' ? 'Poznaj szacowany poziom CEFR, swoje mocne strony i błędy z poprawkami. Zobacz, co ćwiczyć przed kolejną lekcją.' : 'Get an estimated CEFR level, your strengths and your mistakes with corrections. Know what to practise before your next lesson.'}</p>
      <ActionLink to="/pricing?addon=1" variant="secondary" trailingIcon="arrow_forward">{lang === 'pl' ? 'Wybierz pakiet z analizą AI' : 'Choose a package with AI analysis'}</ActionLink>
    </div>
    {loaded ? <Suspense fallback={placeholder}><AnalysisFilm key={lang} lang={lang}/></Suspense> : placeholder}
  </section>
}
