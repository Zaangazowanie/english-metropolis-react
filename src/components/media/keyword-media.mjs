export const KEYWORD_MEDIA_ROOT = '/media/keyword-cache-20260909'
let manifestPromise

export function loadKeywordMedia() {
  if (!manifestPromise) manifestPromise = fetch(`${KEYWORD_MEDIA_ROOT}/manifest.json`)
    .then(response => response.ok ? response.json() : { clips: {} })
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

export function announceKeywordPlayback(owner) {
  document.dispatchEvent(new CustomEvent('em-keyword-play', { detail: owner }))
  document.dispatchEvent(new CustomEvent('em-public-clip-play', { detail: owner }))
  if (window.parent !== window) window.parent.postMessage({ type: 'em-preview-media-play' }, window.location.origin)
}
