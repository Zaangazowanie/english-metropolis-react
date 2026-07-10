import { useState, useMemo, useEffect, useRef } from 'react'
import { FONT, G, EASE, CEFR_COLOR } from '../../design/v3/tokens.js'
import { useV3Theme } from '../../design/v3/ThemeProvider.jsx'
import { Btn, Glass, Pill } from '../../design/v3/primitives.jsx'
import { useI18n } from '../../i18n'
import { fetchWithTimeout } from '../../practice/lib/practice-cache'

/* ============================================================================
   TTS — identical API to the existing view (POST /api/tts/tts)
   ============================================================================ */

const ttsCache = new Map()
let currentAudio = null

function currentVoice() {
  try { return localStorage.getItem('tts_voice') || 'af_heart' } catch { return 'af_heart' }
}

async function playTTS(text, voice, onTimeUpdate = null, onEnded = null) {
  if (!text) return null
  const v = voice || currentVoice()
  const key = `${text}::${v}`
  let audio
  if (ttsCache.has(key)) audio = ttsCache.get(key)
  else {
    try {
      // 30s AbortController-backed timeout — see practice-cache.ts.
      const resp = await fetchWithTimeout('/api/tts/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice: v, lang: v[0] || 'a' }),
      })
      if (!resp.ok) throw new Error(`TTS ${resp.status}`)
      const blob = await resp.blob()
      audio = new Audio(URL.createObjectURL(blob))
      ttsCache.set(key, audio)
    } catch (err) { console.error('TTS error:', err); return null }
  }
  currentAudio?.pause()
  currentAudio = audio
  audio.currentTime = 0
  if (onTimeUpdate) audio.ontimeupdate = () => onTimeUpdate(audio.currentTime, audio.duration || 0)
  if (onEnded) audio.onended = onEnded
  try { await audio.play() } catch { /* ignore */ }
  return audio
}

/* ============================================================================
   YouGlish — 5-tier query-variant fallback ladder with module-level cache
   ============================================================================ */

const youglishCache = new Map()
const STOPWORDS = new Set([
  'the','a','an','to','of','in','on','at','for','with','by','from','up','out','as',
  'it','its','this','that','these','those','is','are','was','were','be','been','being',
  'and','or','but','so','than','then','if','about','into','over','under','through',
  'do','does','did','have','has','had','will','would','can','could','should','may','might',
  'i','you','he','she','we','they','him','her','them','my','your','our','their','his',
])

function youglishQueryVariants(rawKey) {
  const key = String(rawKey || '').toLowerCase().replace(/_/g, ' ').replace(/[^\p{L}\p{N}\s'-]/gu, ' ').replace(/\s+/g, ' ').trim()
  if (!key) return []
  const out = []
  const seen = new Set()
  const push = (s) => { const v = s.trim(); if (v && !seen.has(v)) { seen.add(v); out.push(v) } }
  push(key)
  // Hyphen handling — YouGlish often indexes "skip level" but not "skip-level".
  // If the key contains a hyphen, also try (a) hyphen → space variant and
  // (b) hyphen removed entirely. Mike: "if the word doesn't catch first time,
  // remember to edit it slightly like removing the -".
  if (key.includes('-')) {
    push(key.replace(/-/g, ' ').replace(/\s+/g, ' ').trim())
    push(key.replace(/-/g, '').replace(/\s+/g, ' ').trim())
  }
  // Use the dehyphenated form for the multi-word ladder so "skip-level"
  // splits into ["skip", "level"] for n-gram + stopword fallbacks.
  const words = key.replace(/-/g, ' ').split(' ').filter(Boolean)
  if (words.length === 1) return out
  let lo = 0, hi = words.length - 1
  while (lo < hi && STOPWORDS.has(words[lo])) lo++
  while (hi > lo && STOPWORDS.has(words[hi])) hi--
  if (lo > 0 || hi < words.length - 1) push(words.slice(lo, hi + 1).join(' '))
  const content = words.filter(w => !STOPWORDS.has(w))
  for (let i = 0; i < content.length - 1; i++) push(`${content[i]} ${content[i + 1]}`)
  content.slice().sort((a, b) => b.length - a.length).forEach(push)
  words.slice().sort((a, b) => b.length - a.length).forEach(push)
  return out
}

async function fetchYouglish(word) {
  const key = String(word || '').toLowerCase().replace(/_/g, ' ').trim()
  if (!key) return { keyword: key, videos: [] }
  if (youglishCache.has(key)) return youglishCache.get(key)
  const variants = youglishQueryVariants(key)
  for (const v of variants) {
    try {
      const resp = await fetchWithTimeout(`/api/youglish/keyword?q=${encodeURIComponent(v)}`)
      if (!resp.ok) continue
      const data = await resp.json()
      const results = Array.isArray(data.results) ? data.results : []
      if (results.length === 0) continue
      const byVid = new Map()
      for (const r of results) {
        if (!byVid.has(r.videoId)) {
          byVid.set(r.videoId, {
            videoId: r.videoId,
            thumbnail: `https://img.youtube.com/vi/${r.videoId}/mqdefault.jpg`,
            occurrences: [],
          })
        }
        byVid.get(r.videoId).occurrences.push({
          start: parseInt(r.start, 10) || 0,
          end: parseFloat(r.end) || (parseInt(r.start, 10) || 0) + 3,
          text: r.display || '',
        })
      }
      const out = { keyword: v, videos: Array.from(byVid.values()), fallbackFrom: v === key ? null : key }
      youglishCache.set(key, out)
      return out
    } catch { /* try next */ }
  }
  const empty = { keyword: key, videos: [], fallbackFrom: key }
  youglishCache.set(key, empty)
  return empty
}

/* ============================================================================
   Respelling — prefers keyword.stressUK / stressUS, otherwise derives from IPA
   ============================================================================ */

function getRespelling(keyword) {
  if (keyword?.stressUK && keyword.stressUK.trim()) return keyword.stressUK.trim()
  if (keyword?.stressUS && keyword.stressUS.trim()) return keyword.stressUS.trim()
  return deriveRespelling(keyword?.ipa)
}

function deriveRespelling(ipa) {
  if (!ipa) return ''
  const match = String(ipa).match(/\/([^\/]+)\//)
  const clean = (match ? match[1] : String(ipa)).trim()
  const pairs = [
    ['tʃ','CH'],['dʒ','J'],['ʃ','SH'],['ʒ','ZH'],['θ','TH'],['ð','TH'],
    ['ŋ','NG'],['eɪ','AY'],['aɪ','EYE'],['ɔɪ','OY'],['aʊ','OW'],['əʊ','OH'],['oʊ','OH'],
    ['ɪə','EER'],['eə','AIR'],['ʊə','OOR'],['iː','EE'],['uː','OO'],['ɔː','AW'],
    ['ɑː','AH'],['ɜː','UR'],['ɑ','AH'],['æ','A'],['ɒ','OH'],['ʌ','UH'],
    ['ə','UH'],['ʊ','UU'],['ɪ','IH'],['i','EE'],['u','OO'],['o','OH'],['e','EH'],
    ['ˈ','-'],['ˌ',''],['.','-'],
  ]
  let out = clean
  for (const [from, to] of pairs) out = out.split(from).join(to)
  return out.toUpperCase().replace(/^-+/, '').replace(/-+$/, '').replace(/--+/g, '-')
}

function splitRespellingSyllables(respelling) {
  if (!respelling) return []
  const parts = String(respelling).split(/[-·]+/).map(s => s.trim()).filter(Boolean)
  return parts.length ? parts : [respelling]
}

/* ============================================================================
   Inline CSS keyframes + flip styles — injected once per mount
   ============================================================================ */

const V3_VOCAB_CSS = `
@keyframes v3VocabSummon{0%{transform:scale(.96);filter:brightness(1) drop-shadow(0 0 0 rgba(217,70,239,0))}30%{transform:scale(1.035);filter:brightness(1.12) drop-shadow(0 0 30px rgba(217,70,239,.55))}100%{transform:scale(1);filter:brightness(1) drop-shadow(0 0 0 rgba(217,70,239,0))}}
@keyframes v3VocabTwinkle{0%,100%{opacity:0;transform:scale(.6)}50%{opacity:.85;transform:scale(1)}}
@keyframes v3VocabFadeIn{from{opacity:0}to{opacity:1}}
@keyframes v3VocabModalPop{from{opacity:0;transform:scale(.96) translateY(8px)}to{opacity:1;transform:scale(1) translateY(0)}}
.v3-flashcard-scene{perspective:1800px;position:relative;width:100%}
.v3-flashcard-scene.is-summoned{animation:v3VocabSummon 1200ms cubic-bezier(.34,1.56,.64,1)}
.v3-flashcard-inner{position:relative;width:100%;min-height:520px;transform-style:preserve-3d;transition:transform 720ms cubic-bezier(.2,.8,.2,1)}
.v3-flashcard-inner.is-flipped{transform:rotateY(180deg)}
.v3-flashcard-face{position:absolute;inset:0;backface-visibility:hidden;-webkit-backface-visibility:hidden;border-radius:20px}
.v3-flashcard-face-back{transform:rotateY(180deg)}
.v3-flashcard-sparkles{position:absolute;inset:0;pointer-events:none;border-radius:20px;overflow:hidden}
.v3-flashcard-sparkles span{position:absolute;width:4px;height:4px;border-radius:50%;background:#F472B6;box-shadow:0 0 8px rgba(244,114,182,.8);animation:v3VocabTwinkle 3s ease-in-out infinite;opacity:0}
.v3-flashcard-sparkles span:nth-child(1){top:14%;left:12%;animation-delay:0s}
.v3-flashcard-sparkles span:nth-child(2){top:26%;right:18%;animation-delay:.5s;background:#A855F7;box-shadow:0 0 8px rgba(168,85,247,.8)}
.v3-flashcard-sparkles span:nth-child(3){bottom:22%;left:22%;animation-delay:1s;background:#FB923C;box-shadow:0 0 8px rgba(251,146,60,.8)}
.v3-flashcard-sparkles span:nth-child(4){bottom:30%;right:14%;animation-delay:1.5s}
.v3-flashcard-sparkles span:nth-child(5){top:48%;left:6%;animation-delay:2s;background:#34D399;box-shadow:0 0 8px rgba(52,211,153,.8)}
.v3-flashcard-sparkles span:nth-child(6){top:58%;right:8%;animation-delay:2.5s}
.v3-flashcard-curl{position:absolute;right:0;bottom:0;width:42px;height:42px;background:linear-gradient(135deg,transparent 50%,rgba(255,255,255,.12) 50%);border-bottom-right-radius:20px;pointer-events:none}
.v3-flashcard-back-scroll{position:absolute;inset:0;overflow-y:auto;border-radius:20px}
.v3-scrolltop-fab{position:absolute;bottom:14px;right:14px;width:34px;height:34px;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;background:rgba(0,0,0,.45);color:#fff;border:1px solid rgba(255,255,255,.2);cursor:pointer;transition:opacity 220ms}
.v3-scroll-area::-webkit-scrollbar{width:8px}
.v3-scroll-area::-webkit-scrollbar-thumb{background:rgba(255,255,255,.15);border-radius:4px}
.v3-topic-pill{padding:6px 12px;border-radius:999px;font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;cursor:pointer;font-family:inherit;transition:all 200ms cubic-bezier(.16,1,.3,1)}
.v3-topic-pill:disabled{cursor:not-allowed;opacity:.35}
`

function InjectVocabStyle() {
  useEffect(() => {
    if (document.getElementById('v3-vocab-style')) return
    const el = document.createElement('style')
    el.id = 'v3-vocab-style'
    el.textContent = V3_VOCAB_CSS
    document.head.appendChild(el)
  }, [])
  return null
}

/* ============================================================================
   YouGlish Modal — 16:9 autoplay, prev/next across occurrences-then-videos
   ============================================================================ */

function YouGlishModal({ word, onClose }) {
  const { T } = useV3Theme()
  const { t } = useI18n()
  const [state, setState] = useState({ loading: true, error: null, data: null })
  const [videoIdx, setVideoIdx] = useState(0)
  const [occIdx, setOccIdx] = useState(0)

  useEffect(() => {
    if (!word) return
    let cancelled = false
    setState({ loading: true, error: null, data: null })
    setVideoIdx(0); setOccIdx(0)
    fetchYouglish(word)
      .then(data => { if (!cancelled) setState({ loading: false, error: null, data }) })
      .catch(err => { if (!cancelled) setState({ loading: false, error: err.message, data: null }) })
    return () => { cancelled = true }
  }, [word])

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!word) return null
  const videos = state.data?.videos || []
  const video = videos[videoIdx]
  const occurrence = video?.occurrences?.[occIdx]
  const start = Math.max(0, (occurrence?.start || 0) - 2)
  const embedUrl = video ? `https://www.youtube.com/embed/${video.videoId}?autoplay=1&start=${Math.floor(start)}&rel=0&modestbranding=1` : null
  const fallbackFrom = state.data?.fallbackFrom
  const canPrev = !(videoIdx === 0 && occIdx === 0)
  const canNext = !(videoIdx === videos.length - 1 && occIdx === (video?.occurrences?.length || 1) - 1)

  const overlayStyle = { position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(5,3,12,0.85)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, animation: 'v3VocabFadeIn 220ms ease' }
  const dialogStyle = { width: 'min(860px, 100%)', maxHeight: '92vh', overflow: 'auto', background: 'linear-gradient(180deg, rgba(20,12,50,0.98), rgba(11,7,28,0.98))', border: `1px solid ${T.borderHi}`, borderRadius: 24, boxShadow: '0 40px 100px -20px rgba(0,0,0,0.8)', animation: 'v3VocabModalPop 320ms cubic-bezier(0.34, 1.56, 0.64, 1)' }
  const headerStyle = { padding: '18px 22px', background: G.brand, borderRadius: '24px 24px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }
  const iconBoxStyle = { width: 38, height: 38, borderRadius: 12, background: 'rgba(255,255,255,0.2)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }
  const closeBtnStyle = { background: 'rgba(255,255,255,0.2)', border: 'none', width: 38, height: 38, borderRadius: '50%', cursor: 'pointer', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }
  const playerFrameStyle = { aspectRatio: '16/9', borderRadius: 14, overflow: 'hidden', background: '#000', border: `1px solid ${T.border}`, marginBottom: 14 }
  const quoteStyle = { padding: 14, background: T.bg2, borderRadius: 12, border: `1px solid ${T.border}`, fontSize: 15, color: T.text, lineHeight: 1.6, fontStyle: 'italic', marginBottom: 14, textAlign: 'center' }

  return (
    <div role="dialog" aria-modal="true" onClick={onClose} style={overlayStyle}>
      <div onClick={(e) => e.stopPropagation()} style={dialogStyle}>
        <div style={headerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={iconBoxStyle}><span className="material-symbols-outlined" style={{ color: '#fff' }}>record_voice_over</span></div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.24em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.8)' }}>{t('vocabulary.youglish.header')}</div>
              <div style={{ fontFamily: FONT.display, fontSize: 22, fontWeight: 600, color: '#fff' }}>"{word}"</div>
            </div>
          </div>
          <button onClick={onClose} aria-label={t('common.close')} style={closeBtnStyle}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        {fallbackFrom && state.data?.keyword && state.data.keyword !== fallbackFrom && (
          <div style={{ padding: '10px 20px', fontSize: 12, color: T.amber, background: 'rgba(252,211,77,0.10)', fontStyle: 'italic' }}>
            {t('vocabulary.youglish.fallback', { from: fallbackFrom, to: state.data.keyword })}
          </div>
        )}
        <div style={{ padding: 22 }}>
          {state.loading && (
            <div style={{ aspectRatio: '16/9', borderRadius: 14, background: T.bg2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 13, color: T.textDim }}>{t('vocabulary.youglish.loading')}</span>
            </div>
          )}
          {state.error && (
            <div style={{ padding: 20, borderRadius: 14, border: `1px solid ${T.bad}`, background: 'rgba(251,113,133,0.10)', textAlign: 'center' }}>
              <span style={{ fontSize: 13, color: T.bad }}>{t('vocabulary.youglish.error', { error: state.error })}</span>
            </div>
          )}
          {!state.loading && !state.error && videos.length === 0 && (
            <div style={{ padding: 32, borderRadius: 14, border: `1px solid ${T.border}`, background: T.surface, textAlign: 'center' }}>
              <span style={{ fontSize: 13, color: T.textDim }}>{t('vocabulary.youglish.empty')}</span>
            </div>
          )}
          {embedUrl && (
            <>
              <div style={playerFrameStyle}>
                <iframe key={`${video.videoId}-${occIdx}`} src={embedUrl} allow="autoplay; encrypted-media" allowFullScreen title="YouGlish" style={{ width: '100%', height: '100%', border: 0 }} />
              </div>
              {occurrence?.text && <div style={quoteStyle}>"{occurrence.text}"</div>}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <Btn size="sm" variant="secondary" icon="chevron_left" disabled={!canPrev}
                  onClick={() => {
                    if (occIdx > 0) setOccIdx(occIdx - 1)
                    else if (videoIdx > 0) { setVideoIdx(videoIdx - 1); setOccIdx(0) }
                  }}>{t('vocabulary.youglish.prevShort')}</Btn>
                <div style={{ fontSize: 11, color: T.textDim, fontFamily: FONT.mono }}>
                  {t('vocabulary.youglish.clipCounter', {
                    current: occIdx + 1,
                    total: video?.occurrences?.length || 0,
                    videoCurrent: videoIdx + 1,
                    videoTotal: videos.length,
                  })}
                </div>
                <Btn size="sm" variant="secondary" trailingIcon="chevron_right" disabled={!canNext}
                  onClick={() => {
                    if (occIdx < (video?.occurrences?.length || 1) - 1) setOccIdx(occIdx + 1)
                    else if (videoIdx < videos.length - 1) { setVideoIdx(videoIdx + 1); setOccIdx(0) }
                  }}>{t('vocabulary.youglish.nextShort')}</Btn>
              </div>
              {videos.length > 1 && (
                <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 6 }}>
                  {videos.map((v, i) => (
                    <div key={v.videoId} onClick={() => { setVideoIdx(i); setOccIdx(0) }}
                      style={{ flexShrink: 0, width: 128, cursor: 'pointer', border: `2px solid ${i === videoIdx ? T.brand : 'transparent'}`, borderRadius: 10, overflow: 'hidden' }}>
                      <img src={v.thumbnail} alt="" style={{ width: '100%', display: 'block' }} />
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/* ============================================================================
   Flashcard — 3D flip, karaoke syllables, TTS, YouGlish, lesson jump
   ============================================================================ */

const KARAOKE = ['#F472B6', '#D946EF', '#A855F7', '#FB923C', '#34D399']
// COLLOC_LABEL_KEYS — i18n keys (resolved at render time) for the three
// collocation buckets shown on the flashcard back. We keep `Collocations` as
// the umbrella label only; sub-buckets get their own keys so PL gets
// "Najczęstsze / Konteksty / Wzorce użycia" instead of one Polish word.
const COLLOC_LABEL_KEYS = {
  commonCollocations: 'vocabulary.card.collocations',
  contexts: 'vocabulary.card.contexts',
  usagePatterns: 'vocabulary.card.usagePatterns',
}

function Flashcard({ keyword, onYouglish, onJumpToLesson, summonPulse = 0 }) {
  const { T, isMobile } = useV3Theme()
  const { t } = useI18n()
  const [flipped, setFlipped] = useState(false)
  const [activeSyllable, setActiveSyllable] = useState(-1)
  const [summoned, setSummoned] = useState(false)
  const backScrollRef = useRef(null)
  const [showScrollTop, setShowScrollTop] = useState(false)

  useEffect(() => { setFlipped(false); setActiveSyllable(-1) }, [keyword?.id])
  useEffect(() => {
    if (!summonPulse) return
    setSummoned(true)
    const id = setTimeout(() => setSummoned(false), 1400)
    return () => clearTimeout(id)
  }, [summonPulse])

  if (!keyword) {
    return <Glass padding={40} style={{ textAlign: 'center', minHeight: 520 }}>
      <span style={{ fontSize: 13, color: T.textDim }}>{t('vocabulary.card.empty')}</span>
    </Glass>
  }

  const syllables = splitRespellingSyllables(getRespelling(keyword))
  const collocGroups = keyword?.collocations
    ? ['commonCollocations','contexts','usagePatterns'].map(k => ({ key: k, items: keyword.collocations?.[k] || [] })).filter(g => g.items.length > 0)
    : []

  async function playWithSync() {
    setActiveSyllable(0)
    await playTTS(keyword.word, undefined,
      (currentTime, duration) => {
        if (!duration || syllables.length === 0) return
        setActiveSyllable(Math.min(syllables.length - 1, Math.floor((currentTime / duration) * syllables.length)))
      },
      () => setTimeout(() => setActiveSyllable(-1), 200),
    )
  }
  const onBackScroll = () => { const el = backScrollRef.current; if (el) setShowScrollTop(el.scrollTop > 140) }
  const stop = (e) => e.stopPropagation()

  // Shared small styles
  const metaRow = { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap', marginBottom: 10 }
  const metaMono = { fontSize: 11, fontFamily: FONT.mono, color: T.textDim, letterSpacing: '0.08em' }
  const ipaStyle = { marginTop: 12, fontFamily: FONT.mono, fontSize: 18, color: T.brandInk || T.brand }
  const sylRow = { marginTop: 16, display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }
  const actionRow = { display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', marginTop: 'auto' }
  const lessonBtn = { width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 14, background: T.surface, border: `1px solid ${T.border}`, color: T.text, cursor: 'pointer', textAlign: 'left', fontFamily: FONT.body, minWidth: 0, transition: `all 220ms ${EASE.springFast}` }
  const lessonLbl = { display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: T.textDim }
  const lessonTitle = { display: 'block', fontSize: 13, fontWeight: 600, color: T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }
  const hintLine = { marginTop: 14, textAlign: 'center', fontSize: 10, color: T.textDim, letterSpacing: '0.16em', textTransform: 'uppercase', fontStyle: 'italic' }

  return (
    <div className={`v3-flashcard-scene ${summoned ? 'is-summoned' : ''}`}>
      <div className={`v3-flashcard-inner ${flipped ? 'is-flipped' : ''}`}>
        {/* FRONT */}
        <div className="v3-flashcard-face v3-flashcard-face-front" onClick={() => setFlipped(true)} style={{ cursor: 'pointer' }}>
          <Glass padding={isMobile ? 24 : 40} style={{ position: 'relative', overflow: 'hidden', minHeight: 520, borderRadius: 20 }}>
            <span className="v3-flashcard-sparkles" aria-hidden><span /><span /><span /><span /><span /><span /></span>
            <span className="v3-flashcard-curl" aria-hidden />
            <div aria-hidden style={{ position: 'absolute', top: -40, right: -40, width: 220, height: 220, background: G.brandSoft, filter: 'blur(60px)', pointerEvents: 'none' }} />
            <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', minHeight: isMobile ? 440 : 460 }}>
              <div style={metaRow}>
                <div style={metaMono}>
                  {keyword.lessonNumber ? `L${keyword.lessonNumber} · ` : ''}{(keyword.lessonTitle || '').slice(0, 70)}
                </div>
                {keyword.cefr_level && (
                  <Pill tone="brand" size="sm" style={{ borderColor: CEFR_COLOR[keyword.cefr_level] || undefined, color: CEFR_COLOR[keyword.cefr_level] || undefined }}>
                    {keyword.cefr_level}
                  </Pill>
                )}
              </div>
              <div style={{ textAlign: 'center', padding: '12px 0 18px' }}>
                <h2 style={{ fontFamily: FONT.display, fontSize: isMobile ? 48 : 72, fontWeight: 600, letterSpacing: '-0.04em', lineHeight: 1, margin: 0, color: T.text }}>
                  {keyword.word}
                </h2>
                {keyword.ipa && <div style={ipaStyle}>{keyword.ipa}</div>}
                {syllables.length > 0 && (
                  <div style={sylRow}>
                    {syllables.map((syl, i) => {
                      const isActive = activeSyllable === i
                      const hasPlayed = activeSyllable > i
                      const color = KARAOKE[i % KARAOKE.length]
                      return (
                        <span key={i} style={{
                          display: 'inline-block', padding: '8px 14px', borderRadius: 12,
                          fontFamily: FONT.display, fontSize: isMobile ? 22 : 26, fontWeight: 700,
                          textTransform: 'uppercase', letterSpacing: '0.04em',
                          background: isActive ? `${color}33` : T.surface,
                          color: isActive ? color : (hasPlayed ? T.textSoft : T.textDim),
                          border: `2px solid ${isActive ? color : T.border}`,
                          transform: isActive ? 'scale(1.25)' : 'scale(1)',
                          transformOrigin: 'bottom center',
                          transition: `all 200ms ${EASE.springSoft}`,
                          boxShadow: isActive ? `0 0 22px ${color}66` : 'none',
                        }}>{syl}</span>
                      )
                    })}
                  </div>
                )}
              </div>
              <div style={actionRow}>
                <Btn variant="primary" icon="volume_up" onClick={(e) => { stop(e); playWithSync() }}>{t('vocabulary.card.hearIt')}</Btn>
                <Btn variant="secondary" icon="smart_display" onClick={(e) => { stop(e); onYouglish(keyword.word) }}>{t('vocabulary.card.inContext')}</Btn>
                <Btn variant="ghost" trailingIcon="flip_camera_android" onClick={(e) => { stop(e); setFlipped(true) }}>{t('vocabulary.card.flip')}</Btn>
              </div>
              <div style={{ marginTop: 18 }}>
                <button type="button" title={keyword.lessonTitle} style={lessonBtn}
                  onClick={(e) => { stop(e); onJumpToLesson && onJumpToLesson(keyword.lessonId, keyword.word) }}>
                  <span className="material-symbols-outlined" style={{ color: T.brandInk || T.brand, flexShrink: 0 }}>menu_book</span>
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                    <span style={lessonLbl}>{t('vocabulary.card.fromLesson', { number: keyword.lessonNumber || '' })}</span>
                    <span style={lessonTitle}>{keyword.lessonTitle}</span>
                  </span>
                  <span className="material-symbols-outlined" style={{ color: T.textDim, flexShrink: 0 }}>arrow_forward</span>
                </button>
              </div>
              <div style={hintLine}>{t('vocabulary.nav.clickToFlip')}</div>
            </div>
          </Glass>
        </div>

        {/* BACK */}
        <div className="v3-flashcard-face v3-flashcard-face-back" onClick={() => setFlipped(false)} style={{ cursor: 'pointer' }}>
          <Glass padding={0} style={{ position: 'relative', minHeight: 520, overflow: 'hidden', borderRadius: 20 }}>
            <div ref={backScrollRef} onScroll={onBackScroll} className="v3-scroll-area v3-flashcard-back-scroll" style={{ padding: isMobile ? 22 : 32 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
                <div>
                  <div style={{ fontFamily: FONT.display, fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em', color: T.text }}>{keyword.word}</div>
                  {keyword.ipa && <div style={{ fontSize: 13, fontFamily: FONT.mono, color: T.textDim, marginTop: 2 }}>{keyword.ipa}</div>}
                </div>
                <Btn size="sm" variant="ghost" icon="flip_to_front" onClick={(e) => { stop(e); setFlipped(false) }}>{t('vocabulary.card.flipBack')}</Btn>
              </div>
              {keyword.translation && (
                <div style={{ fontFamily: FONT.display, fontStyle: 'italic', fontSize: 24, fontWeight: 500, background: G.brand, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', letterSpacing: '-0.01em', marginBottom: 14 }}>
                  {keyword.translation}
                </div>
              )}
              {(keyword.definitionEn || keyword.definition) && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: T.textDim, marginBottom: 6 }}>{t('vocabulary.card.definitionEn')}</div>
                  <p style={{ fontSize: 15, color: T.textSoft, lineHeight: 1.55, margin: 0 }}>{keyword.definitionEn || keyword.definition}</p>
                </div>
              )}
              {keyword.definitionPl && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: T.textDim, marginBottom: 6 }}>{t('vocabulary.card.definitionPl')}</div>
                  <p style={{ fontSize: 15, color: T.textSoft, lineHeight: 1.55, margin: 0 }}>{keyword.definitionPl}</p>
                </div>
              )}
              {(keyword.example || keyword.exampleEn) && (
                <div style={{ padding: 14, background: 'rgba(139,92,246,0.08)', borderRadius: 12, border: `1px solid ${T.border}`, display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 16 }}>
                  <button type="button" title={t('vocabulary.card.hearExample')}
                    onClick={(e) => { stop(e); playTTS(keyword.example || keyword.exampleEn) }}
                    style={{ background: G.brand, border: 'none', cursor: 'pointer', width: 32, height: 32, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#fff' }}>volume_up</span>
                  </button>
                  <div style={{ fontSize: 14, color: T.text, fontStyle: 'italic', lineHeight: 1.5, flex: 1 }}>
                    "{keyword.example || keyword.exampleEn}"
                  </div>
                </div>
              )}
              {keyword.examplePl && (
                <div style={{ fontSize: 13, color: T.textDim, fontStyle: 'italic', marginBottom: 16, marginTop: -8, paddingLeft: 14 }}>{keyword.examplePl}</div>
              )}
              {collocGroups.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  {collocGroups.map(g => (
                    <div key={g.key} style={{ marginBottom: 14 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: T.brandInk || T.brand, marginBottom: 8 }}>
                        {t(COLLOC_LABEL_KEYS[g.key] || 'vocabulary.card.collocations')}
                      </div>
                      <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                        {g.items.slice(0, 6).map((c, i) => {
                          const phrase = typeof c === 'string' ? c : c?.phrase
                          const example = typeof c === 'object' ? c?.example : null
                          return (
                            <li key={i} style={{ display: 'flex', gap: 8, fontSize: 13, color: T.textSoft, lineHeight: 1.5, marginBottom: 4 }}>
                              <span style={{ color: T.brandInk || T.brand, flexShrink: 0 }}>→</span>
                              <span>
                                <span style={{ fontWeight: 600, color: T.text }}>{phrase}</span>
                                {example && <span style={{ color: T.textDim }}> — "{example}"</span>}
                              </span>
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
              {Array.isArray(keyword.topics) && keyword.topics.length > 0 && (
                <div style={{ marginTop: 14, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {keyword.topics.slice(0, 6).map(tp => <Pill key={tp} tone="neutral" size="sm">{tp}</Pill>)}
                </div>
              )}
              <div style={{ marginTop: 22, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Btn size="sm" variant="secondary" icon="smart_display" onClick={(e) => { stop(e); onYouglish(keyword.word) }}>{t('vocabulary.card.inContext')}</Btn>
                {keyword.lessonId && (
                  <Btn size="sm" variant="ghost" icon="school" onClick={(e) => { stop(e); onJumpToLesson && onJumpToLesson(keyword.lessonId, keyword.word) }}>
                    {t('vocabulary.card.fromLessonShort', { number: keyword.lessonNumber || '' })}
                  </Btn>
                )}
              </div>
            </div>
            {showScrollTop && (
              <button type="button" className="v3-scrolltop-fab" aria-label={t('vocabulary.card.scrollToTop')} style={{ opacity: 1 }}
                onClick={(e) => { stop(e); backScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' }) }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>keyboard_arrow_up</span>
              </button>
            )}
          </Glass>
        </div>
      </div>
    </div>
  )
}

/* ============================================================================
   Main Vocabulary view
   ============================================================================ */

export default function VocabularyV3({ data, slug, basePath = '' }) {
  const { T, isMobile } = useV3Theme()
  const { t } = useI18n()
  const lessons = data?.lessons || []
  const keywords = data?.keywords || []

  // ?lesson=<lessonId-or-date> deep-links the deck pre-filtered to one lesson
  // (the Dashboard "Revise your last lesson" card); ?mode=study starts shuffled.
  const initialParams = useMemo(() => {
    if (typeof window === 'undefined') return {}
    const p = new URLSearchParams(window.location.search)
    return { lesson: p.get('lesson') || null, mode: p.get('mode') || null }
  }, [])
  const [mode, setMode] = useState(initialParams.mode === 'study' ? 'study' : 'browse')
  const [lessonFilter, setLessonFilter] = useState(initialParams.lesson || 'all')
  const [topicFilter, setTopicFilter] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [summonPulse, setSummonPulse] = useState(0)
  const [studyDeck, setStudyDeck] = useState([])
  const [youglishWord, setYouglishWord] = useState(null)

  const stageRef = useRef(null)
  const summonCard = (i) => {
    setActiveIndex(i)
    setSummonPulse(p => p + 1)
    setTimeout(() => stageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30)
  }

  const baseKeywords = mode === 'study' ? studyDeck : keywords

  const filteredKeywords = useMemo(() => {
    const q = searchTerm.trim().toLowerCase()
    return baseKeywords.filter(kw => {
      if (lessonFilter !== 'all') {
        const kwLessonId = String(kw.lessonId || '')
        const kwLessonDate = String(kw.lessonDate || '')
        if (kwLessonId !== lessonFilter && kwLessonDate !== lessonFilter) return false
      }
      if (topicFilter !== 'all' && !(kw.topics || []).includes(topicFilter)) return false
      if (q && !(kw.searchText || '').includes(q)) return false
      return true
    })
  }, [baseKeywords, lessonFilter, topicFilter, searchTerm])

  const availableTopics = useMemo(() => {
    const topics = new Set()
    for (const kw of baseKeywords) if (Array.isArray(kw.topics)) kw.topics.forEach(t => topics.add(t))
    return [...topics].filter(Boolean).sort()
  }, [baseKeywords])

  const topicsInCurrentLesson = useMemo(() => {
    if (lessonFilter === 'all') return null
    const set = new Set()
    for (const kw of baseKeywords) {
      const kwLessonId = String(kw.lessonId || '')
      const kwLessonDate = String(kw.lessonDate || '')
      if (kwLessonId === lessonFilter || kwLessonDate === lessonFilter) (kw.topics || []).forEach(t => set.add(t))
    }
    return set
  }, [baseKeywords, lessonFilter])

  useEffect(() => {
    if (mode === 'study') setStudyDeck([...keywords].sort(() => Math.random() - 0.5))
  }, [mode, keywords])

  useEffect(() => { setActiveIndex(0) }, [searchTerm, lessonFilter, topicFilter, mode])
  useEffect(() => {
    setActiveIndex(i => Math.min(Math.max(0, i), Math.max(0, filteredKeywords.length - 1)))
  }, [filteredKeywords.length])

  useEffect(() => {
    function onKey(e) {
      const tag = (e.target?.tagName || '').toLowerCase()
      if (['input', 'textarea', 'select'].includes(tag)) return
      if (e.key === 'ArrowLeft') setActiveIndex(i => Math.max(0, i - 1))
      if (e.key === 'ArrowRight') setActiveIndex(i => Math.min(filteredKeywords.length - 1, i + 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [filteredKeywords.length])

  const activeKeyword = filteredKeywords[activeIndex] || null

  function jumpToLesson(lessonId, keywordWord) {
    if (!lessonId) return
    const pathParts = window.location.pathname.split('/')
    const slugIdx = pathParts.indexOf('app') + 1
    const activeSlug = slug || (slugIdx > 0 ? pathParts[slugIdx] : null)
    if (!activeSlug) return
    const params = new URLSearchParams({ openLesson: lessonId, from: 'vocabulary' })
    if (keywordWord) params.set('focusKeyword', keywordWord)
    window.location.href = `${basePath || '/app'}/${activeSlug}/lessons?${params.toString()}`
  }

  const progressPct = filteredKeywords.length > 0 ? ((activeIndex + 1) / filteredKeywords.length) * 100 : 0

  // Container + shared styles
  const container = { maxWidth: 1840, margin: '0 auto', padding: isMobile ? '24px 18px 80px' : '40px 32px 80px' }
  const kicker = { fontSize: 11, fontWeight: 700, letterSpacing: '0.28em', textTransform: 'uppercase', color: T.brandInk || T.brand, marginBottom: 10 }
  const heroH1 = { fontFamily: FONT.display, fontWeight: 600, fontSize: isMobile ? 36 : 52, letterSpacing: '-0.03em', margin: 0, lineHeight: 1.05, color: T.text }
  const controlsRow = { display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }
  const modeToggle = { display: 'flex', gap: 2, padding: 3, background: T.bg2, borderRadius: 999, border: `1px solid ${T.border}` }
  const inputStyle = { flex: 1, minWidth: 200, padding: '10px 14px', borderRadius: 12, background: T.surface, border: `1px solid ${T.border}`, color: T.text, fontFamily: FONT.body, fontSize: 13, outline: 'none' }
  const selectStyle = { padding: '10px 14px', borderRadius: 12, background: T.surface, border: `1px solid ${T.border}`, color: T.text, fontFamily: FONT.body, fontSize: 13, cursor: 'pointer' }
  const progressOuter = { marginTop: 14, height: 4, background: T.bg2, borderRadius: 999, overflow: 'hidden' }
  const gridStage = { display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '260px 1fr', gap: 20 }
  const sidebarShell = { maxHeight: 620, overflowY: 'auto', background: T.surface, border: `1px solid ${T.border}`, borderRadius: 16, padding: 10 }
  const sidebarHead = { padding: '4px 8px 10px', fontSize: 10, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: T.textDim }
  const navRow = { marginTop: 16, display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' }
  const navHintPill = { fontSize: 11, color: T.textDim, fontFamily: FONT.mono, padding: '6px 12px', background: T.surface, borderRadius: 999, border: `1px solid ${T.border}` }

  return (
    <div style={container}>
      <InjectVocabStyle />
      {/* Hero */}
      <div style={{ marginBottom: isMobile ? 24 : 32 }}>
        <div style={kicker}>{t('vocabulary.hero.kicker')}</div>
        <h1 style={heroH1}>
          <span style={{ background: G.brand, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>{keywords.length}</span>{' '}
          {t('vocabulary.hero.titleSuffix')} <span style={{ fontStyle: 'italic', opacity: 0.6 }}>{t('vocabulary.hero.titleAside')}</span>
        </h1>
      </div>

      {/* Controls */}
      <Glass padding={18} style={{ marginBottom: 24 }}>
        <div style={controlsRow}>
          <div style={modeToggle}>
            {['browse', 'study'].map(m => (
              <button key={m} type="button" onClick={() => setMode(m)}
                style={{ padding: '7px 14px', borderRadius: 999, border: 'none', background: mode === m ? G.brand : 'transparent', color: mode === m ? '#fff' : T.textDim, fontSize: 11, fontFamily: FONT.body, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer' }}>
                {t(`vocabulary.mode.${m}Short`)}
              </button>
            ))}
          </div>
          <input type="search" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder={t('vocabulary.searchPlaceholder')} style={inputStyle} />
          <select value={lessonFilter} onChange={(e) => setLessonFilter(e.target.value)} style={selectStyle}>
            <option value="all">{t('vocabulary.filter.allLessons', { count: keywords.length })}</option>
            {lessons.map(l => {
              const num = l.lessonNumber || ''
              const kwCount = l.keywordCount || l.keyword_count || l.keywords?.length || 0
              const title = (l.title || '').slice(0, 50)
              return <option key={l.id} value={l.id}>{num ? `L${num} · ` : ''}{title} ({kwCount})</option>
            })}
          </select>
          <div style={{ fontSize: 11, color: T.textDim, fontFamily: FONT.mono }}>
            <span style={{ background: G.brand, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', fontWeight: 700 }}>{activeIndex + 1}</span>
            <span style={{ opacity: 0.5 }}> / </span>
            {filteredKeywords.length}
          </div>
        </div>

        {/* Topic pills */}
        {availableTopics.length > 0 && (
          <div style={{ marginTop: 12, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <button type="button" className="v3-topic-pill" onClick={() => setTopicFilter('all')}
              style={{ background: topicFilter === 'all' ? G.brand : T.surface, color: topicFilter === 'all' ? '#fff' : T.textSoft, border: `1px solid ${topicFilter === 'all' ? 'transparent' : T.border}` }}>
              {t('vocabulary.filter.allTopics')}
            </button>
            {availableTopics.slice(0, 12).map(tp => {
              const inCurrent = !topicsInCurrentLesson || topicsInCurrentLesson.has(tp)
              const disabled = !inCurrent && lessonFilter !== 'all'
              const active = topicFilter === tp
              return (
                <button key={tp} type="button" disabled={disabled} className="v3-topic-pill"
                  title={disabled ? t('vocabulary.filter.topicDisabledLesson') : ''}
                  onClick={() => !disabled && setTopicFilter(active ? 'all' : tp)}
                  style={{ background: active ? G.brand : T.surface, color: active ? '#fff' : T.textSoft, border: `1px solid ${active ? 'transparent' : T.border}` }}>
                  {tp}
                </button>
              )
            })}
          </div>
        )}

        {/* Progress bar */}
        <div style={progressOuter}>
          <div style={{ width: `${progressPct}%`, height: '100%', background: G.brand, transition: `width 460ms ${EASE.editorial}` }} />
        </div>
      </Glass>

      {/* Main stage */}
      <div ref={stageRef} style={gridStage}>
        {!isMobile && (
          <div className="v3-scroll-area" style={sidebarShell}>
            <div style={sidebarHead}>{t('vocabulary.sidebar.allCards', { count: filteredKeywords.length })}</div>
            {filteredKeywords.slice(0, 100).map((kw, i) => {
              const isActive = activeIndex === i
              return (
                <button key={kw.id || `${kw.word}-${i}`} type="button" onClick={() => summonCard(i)}
                  style={{ width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: 10, marginBottom: 2, background: isActive ? 'rgba(217,70,239,0.14)' : 'transparent', border: `1px solid ${isActive ? 'rgba(217,70,239,0.4)' : 'transparent'}`, cursor: 'pointer', transition: `all 180ms ${EASE.springFast}`, fontFamily: FONT.body }}>
                  <div style={{ fontSize: 10, fontFamily: FONT.mono, color: T.textDim }}>
                    {String(i + 1).padStart(2, '0')}
                    {kw.cefr_level ? ` · ${kw.cefr_level}` : ''}
                    {kw.lessonNumber ? ` · L${kw.lessonNumber}` : ''}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2 }}>{kw.word}</div>
                  {kw.translation && (
                    <div style={{ fontSize: 11, color: T.textDim, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{kw.translation}</div>
                  )}
                </button>
              )
            })}
            {filteredKeywords.length > 100 && (
              <div style={{ padding: 10, fontSize: 10, color: T.textDim, fontStyle: 'italic', textAlign: 'center' }}>
                {t('vocabulary.sidebar.truncated')}
              </div>
            )}
            {filteredKeywords.length === 0 && (
              <div style={{ padding: 18, fontSize: 12, color: T.textDim, textAlign: 'center' }}>{t('vocabulary.empty.noMatchesShort')}</div>
            )}
          </div>
        )}

        <div>
          {filteredKeywords.length > 0 ? (
            <>
              <Flashcard key={activeKeyword?.id || activeIndex} keyword={activeKeyword} onYouglish={setYouglishWord} onJumpToLesson={jumpToLesson} summonPulse={summonPulse} />
              <div style={navRow}>
                <Btn size="sm" variant="secondary" icon="chevron_left" disabled={activeIndex === 0}
                  onClick={() => setActiveIndex(i => Math.max(0, i - 1))}>{t('vocabulary.nav.prevShort')}</Btn>
                <span style={navHintPill}>{t('vocabulary.nav.flipHint')}</span>
                <Btn size="sm" variant="secondary" trailingIcon="chevron_right" disabled={activeIndex === filteredKeywords.length - 1}
                  onClick={() => setActiveIndex(i => Math.min(filteredKeywords.length - 1, i + 1))}>{t('vocabulary.nav.nextShort')}</Btn>
              </div>
            </>
          ) : (
            <Glass padding={40} style={{ textAlign: 'center' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 32, color: T.textDim }}>search_off</span>
              <div style={{ marginTop: 8, fontSize: 14, color: T.textDim }}>{t('vocabulary.empty.noFilters')}</div>
            </Glass>
          )}
        </div>
      </div>

      {youglishWord && <YouGlishModal word={youglishWord} onClose={() => setYouglishWord(null)} />}
    </div>
  )
}
