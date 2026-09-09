import { warmDemoPronunciations } from '../../components/media/pronunciation.mjs'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Flashcard, InjectVocabStyle, YouGlishModal } from './Vocabulary.jsx'
import KeywordPronunciationButton from '../../components/media/KeywordPronunciationButton.jsx'
import { studentDemoData } from '../../previews/student-demo-data.mjs'
import ActionLink from './ActionLink.jsx'
import './feature-previews.css'
import './focused-keyword-previews.css'

export default function WordPreviewShowcase({ lang }) {
  const pl = lang === 'pl'
  const words = useMemo(() => studentDemoData(lang).keywords, [lang])
  const [index, setIndex] = useState(0), [playRevision, setPlayRevision] = useState(0)
  const [loaded, setLoaded] = useState(false), [modalWord, setModalWord] = useState(null)
  const stage = useRef(null)
  const keyword = words[index]
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setLoaded(true); warmDemoPronunciations() }
      else stage.current?.querySelectorAll('video, audio').forEach(media => media.pause())
    }, { threshold: .05 })
    observer.observe(stage.current)
    return () => observer.disconnect()
  }, [])
  function chooseWord(next, play = false) {
    setIndex(next)
    setLoaded(true)
    setPlayRevision(play ? value => value + 1 : 0)
  }
  return <section className="gh-section em-feature-preview" id="words-in-context" aria-labelledby="em-words-title">
    <div className="em-preview-heading">
      <h2 id="em-words-title">{pl ? 'Słowa z lekcji w klipach z YouTube' : 'YouTube clips for words from your lesson'}</h2>
      <p>{pl ? 'Po każdej lekcji oglądaj krótkie klipy z nowymi słowami. Posłuchaj wymowy i zobacz, jak używać ich w zdaniach.' : 'After each lesson, watch short clips featuring your new words. Hear the pronunciation and learn how to use them in a sentence.'}</p>
      <ActionLink to="/pricing" variant="secondary" trailingIcon="arrow_forward">{pl ? 'Wybierz pakiet lekcji' : 'Choose a lesson package'}</ActionLink>
    </div>
    <div className="em-keyword-showcase" ref={stage}>
      <div className="em-keyword-list gh-glass">
        <div className="em-keyword-list-heading"><h3>{pl ? 'Wypróbuj wymowę i nagrania' : 'Try the pronunciation and clips'}</h3><span><span className="material-symbols-outlined" aria-hidden>volume_up</span> / <span className="material-symbols-outlined" aria-hidden>smart_display</span></span></div>
        <div className="em-keyword-rows" role="group" aria-label={pl ? 'Słowa z nagraniami' : 'Words with YouTube clips'}>
          {words.map((item, i) => <div key={item.word} className={`em-keyword-row${index === i ? ' is-selected' : ''}`}>
            <button type="button" className="em-keyword-name" aria-pressed={index === i} onClick={() => chooseWord(i)} aria-controls="em-keyword-video-stage">
              <strong>{item.word}</strong><span>{item.ipa}</span>
            </button>
            <div className="em-keyword-row-actions">
              <KeywordPronunciationButton word={item.word} lang={lang}/>
              <button type="button" className="gh-action gh-action--secondary gh-action--sm" onClick={() => chooseWord(i, true)}
                aria-label={`YouTube: ${item.word}`} title={`YouTube: ${item.word}`} aria-controls="em-keyword-video-stage">
                <span className="material-symbols-outlined" aria-hidden>smart_display</span><span className="em-keyword-action-label">YouTube</span>
              </button>
            </div>
          </div>)}
        </div>
      </div>
      <div id="em-keyword-video-stage" className="em-keyword-video-stage gh-glass">
        <div className="em-keyword-stage-heading"><span className="material-symbols-outlined" aria-hidden>smart_display</span><span>{pl ? 'YouTube · słowo w kontekście' : 'YouTube · the word in context'}</span><strong>{keyword.word}</strong></div>
        {loaded ? <YouGlishModal key={`${keyword.word}-${playRevision}`} word={keyword.word} inline autoPlay={playRevision > 0}/>
          : <div className="em-inline-video em-keyword-placeholder"><span className="material-symbols-outlined" aria-hidden>play_circle</span></div>}
      </div>
    </div>
    <div className="em-flashcard-example" aria-labelledby="em-flashcard-title">
      <div className="em-flashcard-copy">
        <span className="material-symbols-outlined" aria-hidden>style</span>
        <h3 id="em-flashcard-title">{pl ? 'Interaktywne fiszki po każdej lekcji' : 'Interactive flashcards after every lesson'}</h3>
        <p>{pl ? 'Powtarzaj słowa z lekcji z wymową, wyjaśnieniami, przykładami i typowymi połączeniami wyrazów.' : 'Review your lesson vocabulary with pronunciation, explanations, examples and common word combinations.'}</p>
      </div>
      <div className="em-flashcard-stage">
        <InjectVocabStyle/>
        <Flashcard keyword={keyword} compact showLessonLink={false} onYouglish={setModalWord}/>
        <div className="em-flashcard-navigation">
          <button type="button" className="gh-action gh-action--secondary gh-action--sm" onClick={() => chooseWord((index + words.length - 1) % words.length)} aria-label={pl ? 'Poprzednia fiszka' : 'Previous flashcard'}><span className="material-symbols-outlined" aria-hidden>arrow_back</span></button>
          <span>{index + 1} / {words.length}</span>
          <button type="button" className="gh-action gh-action--secondary gh-action--sm" onClick={() => chooseWord((index + 1) % words.length)} aria-label={pl ? 'Następna fiszka' : 'Next flashcard'}><span className="material-symbols-outlined" aria-hidden>arrow_forward</span></button>
        </div>
      </div>
    </div>
    {modalWord && <YouGlishModal word={modalWord} onClose={() => setModalWord(null)}/>}
  </section>
}
