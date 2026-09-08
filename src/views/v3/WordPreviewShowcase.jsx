import { useState } from 'react'
import NativeWordClip from './NativeWordClip.jsx'
import { PREVIEW_CLIPS } from './preview-clips.mjs'
import './feature-previews.css'

export default function WordPreviewShowcase({ lang }) {
  const pl = lang === 'pl', [word, setWord] = useState('mural'), [playback, setPlayback] = useState(null)
  const clip = PREVIEW_CLIPS[word]
  const play = () => setPlayback(previous => ({ word, revision: (previous?.revision || 0) + 1 }))
  return <section className="gh-section em-feature-preview em-words-showcase" id="words-in-context" aria-labelledby="em-words-title">
    <div className="em-preview-heading">
      <h2 id="em-words-title">{pl ? <>Twoje słowa.<br/><span>Prawdziwe rozmowy.</span></> : <>Your words.<br/><span>Out in the world.</span></>}</h2>
      <p>{pl ? 'Słowo z lekcji zamienia się w fiszkę i krótki klip. Usłysz, jak ktoś naprawdę go używa.' : 'A word from your lesson becomes a flashcard and a short clip. Hear how someone really uses it.'}</p>
    </div>
    <div className="em-words-layout gh-glass">
      <div className="em-word-library">
        <p className="em-preview-instruction">{pl ? 'Wybierz słowo i włącz dźwięk' : 'Pick a word. Press play. Hear it.'}</p>
        <div role="group" aria-label={pl ? 'Przykładowe słowa' : 'Example words'} className="em-word-picker">
          {Object.values(PREVIEW_CLIPS).map(item => <button key={item.word} aria-pressed={word === item.word} onClick={() => { setWord(item.word); setPlayback(null) }}>
            <span><strong>{item.word}</strong><small>{item.ipa}</small></span><span className="material-symbols-outlined" aria-hidden="true">{word === item.word ? 'graphic_eq' : 'arrow_outward'}</span>
          </button>)}
        </div>
        <div className="em-word-definition" key={word}>
          <small>{pl ? 'Znaczenie' : 'Meaning in Polish'}</small><p>{clip.meaning}</p><p className="em-word-note">{clip.note[pl ? 1 : 0]}</p>
        </div>
        <div className="em-word-learning-loop"><span className="material-symbols-outlined" aria-hidden="true">style</span><p>{pl ? 'Z lekcji do fiszki. Z fiszki do prawdziwego użycia.' : 'From your lesson, to your flashcard, to real life.'}</p></div>
      </div>
      <div className="em-word-player" key={word}>
        <NativeWordClip clip={clip} pl={pl} active={playback?.word === word} revision={playback?.revision} onPlayRequest={play}/>
        <blockquote>{clip.before}<mark>{word}</mark>{clip.after}</blockquote>
        <div className="em-word-credit"><strong>{clip.title}</strong><span>{clip.creator}</span></div>
      </div>
    </div>
  </section>
}
