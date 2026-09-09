import { useEffect, useId, useRef, useState } from 'react'
import { announceKeywordPlayback, excerptKey, KEYWORD_MEDIA_ROOT, loadKeywordMedia } from './keyword-media.mjs'

let youtubeReady
function loadYouTube() {
  if (window.YT?.Player) return Promise.resolve(window.YT)
  if (!youtubeReady) youtubeReady = new Promise(resolve => {
    const previous = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => { previous?.(); resolve(window.YT) }
    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const script = document.createElement('script')
      script.src = 'https://www.youtube.com/iframe_api'; script.async = true
      document.head.appendChild(script)
    }
  })
  return youtubeReady
}

// Used by the production lesson and vocabulary views, and therefore by their
// public previews. The media clock is authoritative: pause, seek and buffering
// can never advance captions independently of the video.
export default function KeywordVideoPlayer(props) {
  return <MediaPlayer key={excerptKey(props.videoId, props.occurrence?.start)} {...props}/>
}

function MediaPlayer({ videoId, occurrence, word, onClock, autoPlay = true }) {
  const owner = useId(), media = useRef(null), iframe = useRef(null), youtube = useRef(null)
  const clock = useRef(onClock)
  useEffect(() => { clock.current = onClock }, [onClock])
  const [cached, setCached] = useState(undefined)
  const [failed, setFailed] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const key = excerptKey(videoId, occurrence?.start)

  useEffect(() => {
    if (!cached) return
    const timer = setInterval(() => {
      const element = media.current
      if (element && !element.paused) clock.current?.({ time: cached.clipStart + element.currentTime, cues: cached.words || [] })
    }, 80)
    return () => clearInterval(timer)
  }, [cached])

  useEffect(() => {
    let cancelled = false
    clock.current?.({ time: null, cues: [] })
    loadKeywordMedia().then(data => { if (!cancelled) setCached(data.clips?.[key] || null) })
    return () => { cancelled = true }
  }, [key])

  useEffect(() => {
    const pause = () => { media.current?.pause(); youtube.current?.pauseVideo?.() }
    const another = event => { if (event.detail !== owner) pause() }
    const hidden = () => { if (document.hidden) pause() }
    const message = event => {
      if (event.origin === location.origin && event.source === window.parent && event.data?.type === 'em-preview-pause-media') pause()
    }
    document.addEventListener('em-keyword-play', another)
    document.addEventListener('em-public-clip-play', another)
    document.addEventListener('visibilitychange', hidden)
    window.addEventListener('message', message)
    return () => {
      pause(); document.removeEventListener('em-keyword-play', another)
      document.removeEventListener('em-public-clip-play', another)
      document.removeEventListener('visibilitychange', hidden); window.removeEventListener('message', message)
    }
  }, [owner])

  const useEmbed = cached === null || failed
  const start = Math.max(0, Number(occurrence?.start || 0) - 2)
  const end = Number(occurrence?.end || start + 6) + 1
  const embedUrl = `https://www.youtube.com/embed/${videoId}?autoplay=${autoPlay ? 1 : 0}&mute=0&start=${Math.floor(start)}&end=${Math.ceil(end)}&rel=0&controls=1&enablejsapi=1&playsinline=1&cc_load_policy=1&cc_lang_pref=en&origin=${encodeURIComponent(location.origin)}`

  useEffect(() => {
    if (!useEmbed || !iframe.current) return
    let cancelled = false, interval
    loadYouTube().then(YT => {
      if (cancelled || !iframe.current) return
      const player = new YT.Player(iframe.current, { events: {
        onReady: event => {
          if (autoPlay) { event.target.unMute(); event.target.setVolume(100); event.target.playVideo() }
          interval = window.setInterval(() => {
            const time = player.getCurrentTime?.()
            if (Number.isFinite(time)) clock.current?.({ time, cues: [] })
          }, 100)
        },
        onStateChange: event => { if (event.data === YT.PlayerState.PLAYING) announceKeywordPlayback(owner) },
        onAutoplayBlocked: () => setBlocked(true),
      } })
      youtube.current = player
    })
    return () => { cancelled = true; clearInterval(interval); youtube.current?.destroy?.(); youtube.current = null }
  }, [useEmbed, key, autoPlay, owner])

  function updateClock(event) {
    if (!cached) return
    clock.current?.({ time: cached.clipStart + event.currentTarget.currentTime, cues: cached.words || [] })
  }
  const fullSize = { width: '100%', height: '100%', border: 0, display: 'block' }
  return <div data-keyword-player={key} style={{ width: '100%', height: '100%', position: 'relative', background: '#000' }}>
    {cached === undefined ? <img alt="" src={`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`} style={{ ...fullSize, objectFit: 'contain' }} />
      : useEmbed ? <iframe ref={iframe} src={embedUrl} title={`“${word}” spoken in a YouTube clip`} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen style={fullSize}/>
      : <video ref={media} key={key} src={`${KEYWORD_MEDIA_ROOT}/${key}.mp4`} poster={`${KEYWORD_MEDIA_ROOT}/${key}.jpg`}
          controls playsInline autoPlay={autoPlay} preload="metadata" aria-label={`“${word}” spoken in a YouTube clip`} style={fullSize}
          onTimeUpdate={updateClock} onSeeked={updateClock} onPause={updateClock} onEnded={updateClock}
          onLoadedData={event => { updateClock(event); if (autoPlay) event.currentTarget.play()?.catch(() => setBlocked(true)) }}
          onPlaying={() => { setBlocked(false); announceKeywordPlayback(owner) }} onError={() => setFailed(true)}>
          <track kind="captions" src={`${KEYWORD_MEDIA_ROOT}/${key}.vtt`} srcLang="en" label="English" default/>
        </video>}
    {blocked && <button type="button" aria-label="Play video with sound" onClick={() => {
      media.current?.play()?.catch(() => {}); youtube.current?.unMute?.(); youtube.current?.playVideo?.(); setBlocked(false)
    }} style={{ position: 'absolute', inset: '35% 35%', border: '1px solid #ffffff80', borderRadius: 16, background: '#140c32dc', color: '#fff', cursor: 'pointer' }}>
      <span className="material-symbols-outlined">play_arrow</span>
    </button>}
  </div>
}
