export const KEYWORD_MEDIA_ROOT = '/media/keyword-cache-20260909'
let manifestPromise

export function loadKeywordMedia() {
  if (!manifestPromise) manifestPromise = fetch(`${KEYWORD_MEDIA_ROOT}/manifest.json?v=landmark-3`)
    .then(response => {
      if (!response.ok) throw new Error('Clip catalogue unavailable')
      return response.json()
    })
    .catch(() => { manifestPromise = null; return { clips: {} } })
  return manifestPromise
}

export function excerptKey(videoId, start) {
  return `${videoId}-${Number(start)}`
}

export function captionAt(cues, time) {
  if (!Number.isFinite(time)) return -1
  return cues.findIndex(cue => time >= cue.start && time < cue.end)
}

// Accept real, absolute media timestamps only. An excerpt's sentence duration
// cannot tell us when its individual words were spoken.
export function timedWords(words) {
  if (!Array.isArray(words)) return []
  return words.filter(cue => typeof cue?.word === 'string' && cue.word.trim() &&
    typeof cue.start === 'number' && Number.isFinite(cue.start) && cue.start >= 0 &&
    typeof cue.end === 'number' && Number.isFinite(cue.end) && cue.end > cue.start)
}

export function announceKeywordPlayback(owner) {
  document.dispatchEvent(new CustomEvent('em-keyword-play', { detail: owner }))
  document.dispatchEvent(new CustomEvent('em-public-clip-play', { detail: owner }))
  if (window.parent !== window) window.parent.postMessage({ type: 'em-preview-media-play' }, window.location.origin)
}
