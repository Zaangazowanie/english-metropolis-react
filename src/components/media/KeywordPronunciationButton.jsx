import { useEffect, useId, useRef, useState } from 'react'
import { pronunciationSource } from './pronunciation.mjs'
import { announceKeywordPlayback } from './keyword-media.mjs'

export default function KeywordPronunciationButton({ word, lang }) {
  const owner = useId(), audio = useRef(null), request = useRef(0)
  const [state, setState] = useState('idle')
  const pl = lang === 'pl'
  useEffect(() => {
    const element = audio.current
    const cancel = () => { request.current++; element?.pause() }
    const pause = () => { cancel(); setState('idle') }
    const other = event => { if (event.detail !== owner) pause() }
    const hidden = () => { if (document.hidden) pause() }
    document.addEventListener('em-keyword-play', other)
    document.addEventListener('em-public-clip-play', other)
    document.addEventListener('visibilitychange', hidden)
    return () => {
      cancel()
      document.removeEventListener('em-keyword-play', other)
      document.removeEventListener('em-public-clip-play', other)
      document.removeEventListener('visibilitychange', hidden)
    }
  }, [owner])
  async function play() {
    if (state === 'playing') { request.current++; audio.current?.pause(); setState('idle'); return }
    const revision = ++request.current
    setState('loading')
    try {
      const src = await pronunciationSource(word)
      if (revision !== request.current || !audio.current) return
      audio.current.src = src
      audio.current.currentTime = 0
      announceKeywordPlayback(owner)
      await audio.current.play()
    } catch { if (revision === request.current) setState('error') }
  }
  return <>
    <button type="button" className="gh-action gh-action--secondary gh-action--sm em-keyword-audio" onClick={play}
      aria-label={`${pl ? 'Wymowa Kokoro' : 'Kokoro pronunciation'}: ${word}`}
      aria-pressed={state === 'playing'} aria-busy={state === 'loading'} disabled={state === 'loading'}
      title={state === 'error' ? (pl ? 'Spróbuj ponownie' : 'Try again') : `Kokoro · ${word}`}>
      <span className="material-symbols-outlined" aria-hidden>{state === 'playing' ? 'stop_circle' : state === 'error' ? 'refresh' : 'volume_up'}</span>
      <span className="em-keyword-action-label">{state === 'loading' ? (pl ? 'Ładowanie…' : 'Loading…') : state === 'error' ? (pl ? 'Ponów' : 'Retry') : 'Kokoro'}</span>
    </button>
    <audio ref={audio} data-keyword-pronunciation={word} preload="none" hidden
      onPlaying={() => setState('playing')} onEnded={() => setState('idle')} onError={() => setState('error')}/>
    {state === 'error' && <span role="status" className="em-keyword-audio-error">{pl ? 'Nie udało się odtworzyć wymowy.' : 'Pronunciation could not play.'}</span>}
  </>
}
