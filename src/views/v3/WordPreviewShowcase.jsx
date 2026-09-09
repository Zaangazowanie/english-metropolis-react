import StudentFeatureFrame from './StudentFeatureFrame.jsx'
import './feature-previews.css'

export default function WordPreviewShowcase({ lang }) {
  const pl = lang === 'pl'
  return <section className="gh-section em-feature-preview" id="words-in-context" aria-labelledby="em-words-title">
    <div className="em-preview-heading">
      <h2 id="em-words-title">{pl ? <>Twoje słowa.<br/><span>Prawdziwe rozmowy.</span></> : <>Your words.<br/><span>Out in the world.</span></>}</h2>
      <div><p>{pl ? 'Poznaj słownictwo tak jak w aplikacji: odwróć fiszkę, posłuchaj wymowy i wybieraj nagrania prawdziwych rozmówców.' : 'Explore your vocabulary as you do in the app: flip a flashcard, hear the pronunciation and choose between videos of real speakers.'}</p>
      </div>
    </div>
    <StudentFeatureFrame feature="vocabulary" lang={lang}/>
  </section>
}
