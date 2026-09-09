import StudentFeatureFrame from './StudentFeatureFrame.jsx'
import './feature-previews.css'

export default function AnalysisPreviewShowcase({ lang }) {
  const pl = lang === 'pl'
  return <section className="gh-section em-feature-preview" id="lesson-analysis-preview" aria-labelledby="em-analysis-title">
    <div className="em-preview-heading">
      <h2 id="em-analysis-title">{pl ? <>Zobacz swój angielski.<br/><span>I swój kolejny krok.</span></> : <>See your English.<br/><span>And your next step.</span></>}</h2>
      <div><p>{pl ? 'Otwórz lekcję i poznaj pełną analizę: od słownictwa i poprawek po osobiste rekomendacje.' : 'Open the lesson and explore its full analysis, from your vocabulary and corrections to personal recommendations.'}</p>
      <a className="em-preview-plan" href="/pricing">{pl ? 'Dostępne z opcjonalnym dodatkiem analizy lekcji AI' : 'Available with the optional AI lesson analysis add-on'} <span className="material-symbols-outlined" aria-hidden="true">arrow_forward</span></a></div>
    </div>
    <StudentFeatureFrame feature="analysis" lang={lang}/>
  </section>
}
