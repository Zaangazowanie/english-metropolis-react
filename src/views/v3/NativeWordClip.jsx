import { useEffect, useId, useRef, useState } from 'react'
import { CLIP_ASSET_ROOT, clipSource } from './preview-clips.mjs'
import './native-word-clip.css'

export default function NativeWordClip({ clip, pl = false, active = false, revision = 0, onPlayRequest }) {
  const video = useRef(null), host = useRef(null), owner = useId()
  const [failed, setFailed] = useState(false)
  const [ended, setEnded] = useState(false)
  const [blocked, setBlocked] = useState(false)
  useEffect(() => {
    const stop = event => { if (event.detail !== owner) video.current?.pause() }
    const hide = () => { if (document.hidden) video.current?.pause() }
    document.addEventListener('em-public-clip-play', stop)
    document.addEventListener('visibilitychange', hide)
    const observer = new IntersectionObserver(([entry]) => { if (!entry.isIntersecting) video.current?.pause() })
    observer.observe(host.current)
    return () => { observer.disconnect(); document.removeEventListener('em-public-clip-play', stop); document.removeEventListener('visibilitychange', hide) }
  }, [owner])
  function play() {
    setFailed(false); setEnded(false); setBlocked(false)
    if (video.current) {
      video.current.currentTime = 0
      video.current.play()?.catch(() => setBlocked(true))
    }
    onPlayRequest()
  }
  return <div className="em-word-media" ref={host}>
    <div className="em-word-screen">
      {active && !failed ? <video key={revision} ref={video} controls playsInline autoPlay preload="none"
        poster={`${CLIP_ASSET_ROOT}/${clip.word}.jpg`} aria-label={`${clip.word}: ${pl ? 'klip z dźwiękiem' : 'clip with original audio'}`}
        src={`${CLIP_ASSET_ROOT}/${clip.word}.mp4`}
        onLoadedData={event => { event.currentTarget.play()?.catch(() => setBlocked(true)) }}
        onPlaying={() => { setBlocked(false); setEnded(false); document.dispatchEvent(new CustomEvent('em-public-clip-play', { detail: owner })) }}
        onEnded={() => setEnded(true)} onError={() => setFailed(true)}>
        <track kind="captions" src={`${CLIP_ASSET_ROOT}/${clip.word}.vtt`} srcLang="en" label="English" />
      </video> : <button className="em-word-poster" onClick={play} aria-label={`${pl ? 'Odtwórz klip z dźwiękiem' : 'Play clip with sound'}: ${clip.word}`}>
        <img src={`${CLIP_ASSET_ROOT}/${clip.word}.jpg`} width="1920" height="1080" loading="lazy" decoding="async" alt={`${clip.title} · ${clip.creator}`} />
        <span className="em-word-play"><span className="material-symbols-outlined" aria-hidden="true">play_arrow</span></span>
        <span className="em-word-duration">{Math.round(clip.end - clip.start)}s · {pl ? 'z dźwiękiem' : 'sound on'}</span>
      </button>}
    </div>
    {(failed || blocked || ended) && <p className="em-word-status" role="status">{failed ? (pl ? 'Nie udało się wczytać klipu. Spróbuj ponownie lub otwórz YouTube.' : 'The clip could not load. Retry or open the YouTube source.') : blocked ? (pl ? 'Naciśnij odtwarzanie w nagraniu, aby usłyszeć dźwięk.' : 'Press play in the video to hear the audio.') : (pl ? 'Koniec klipu. Możesz posłuchać jeszcze raz.' : 'That’s the whole clip. Listen again whenever you like.')}</p>}
    <div className="em-word-media-actions">
      <button type="button" onClick={play}><span className="material-symbols-outlined" aria-hidden="true">replay</span>{pl ? 'Powtórz klip' : 'Replay clip'}</button>
      <a href={clipSource(clip)} target="_blank" rel="noopener noreferrer">{pl ? 'Pełne nagranie na YouTube' : 'Full video on YouTube'}<span className="material-symbols-outlined" aria-hidden="true">open_in_new</span></a>
    </div>
  </div>
}
