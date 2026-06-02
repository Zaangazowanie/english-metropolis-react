import { useState, useMemo, useEffect, useRef } from 'react'
import {
  CefrBadge,
  formatDate,
  RichInline,
} from '../components/analytics/AnalyticsPrimitives.jsx'
import { useI18n } from '../i18n'
import { fetchWithTimeout } from '../practice/lib/practice-cache'

/* ============================================================================
   TTS — shared with Lessons
   ============================================================================ */

const ttsCache = new Map()
let currentAudio = null

// Read the user's selected TTS voice from localStorage (set by VoiceSelector in the header)
function currentVoice() {
  try { return localStorage.getItem('tts_voice') || 'af_heart' } catch { return 'af_heart' }
}

// playTTS returns the audio element so callers can attach sync handlers.
// If no voice is passed, we read the header VoiceSelector choice at call time
// so previews always match whatever the user just picked.
async function playTTS(text, voice, onTimeUpdate = null, onEnded = null) {
  if (!text) return null
  const v = voice || currentVoice()
  voice = v
  const key = `${text}::${v}`
  let audio
  if (ttsCache.has(key)) {
    audio = ttsCache.get(key)
  } else {
    try {
      // 30s AbortController-backed timeout — see practice-cache.ts.
      const resp = await fetchWithTimeout('/api/tts/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice, lang: voice[0] || 'a' }),
      })
      if (!resp.ok) throw new Error(`TTS ${resp.status}`)
      const blob = await resp.blob()
      const url = URL.createObjectURL(blob)
      audio = new Audio(url)
      ttsCache.set(key, audio)
    } catch (err) {
      console.error('TTS error:', err)
      return null
    }
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
   YouGlish fetch — shared
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
  const words = key.split(' ').filter(Boolean)
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
    } catch { /* fall through to next variant */ }
  }
  const empty = { keyword: key, videos: [], fallbackFrom: key }
  youglishCache.set(key, empty)
  return empty
}

/* ============================================================================
   Respelling — prefers the keyword's own stressUK/stressUS if present,
   otherwise derives an approximate English respelling from the IPA.
   ============================================================================ */

function getRespelling(keyword) {
  // Prefer explicit respelling provided with the keyword
  if (keyword?.stressUK && keyword.stressUK.trim()) return keyword.stressUK.trim()
  if (keyword?.stressUS && keyword.stressUS.trim()) return keyword.stressUS.trim()
  return deriveRespelling(keyword?.ipa)
}

function deriveRespelling(ipa) {
  if (!ipa) return ''
  // Extract the first /.../ block
  const match = String(ipa).match(/\/([^\/]+)\//)
  const clean = (match ? match[1] : String(ipa)).trim()
  // Ordered multi-char mappings first
  const pairs = [
    ['tʃ', 'CH'], ['dʒ', 'J'], ['ʃ', 'SH'], ['ʒ', 'ZH'], ['θ', 'TH'], ['ð', 'TH'],
    ['ŋ', 'NG'], ['eɪ', 'AY'], ['aɪ', 'EYE'], ['ɔɪ', 'OY'], ['aʊ', 'OW'], ['əʊ', 'OH'], ['oʊ', 'OH'],
    ['ɪə', 'EER'], ['eə', 'AIR'], ['ʊə', 'OOR'], ['iː', 'EE'], ['uː', 'OO'], ['ɔː', 'AW'],
    ['ɑː', 'AH'], ['ɜː', 'UR'], ['ɑ', 'AH'], ['æ', 'A'], ['ɒ', 'OH'], ['ʌ', 'UH'],
    ['ə', 'UH'], ['ʊ', 'UU'], ['ɪ', 'IH'], ['i', 'EE'], ['u', 'OO'], ['o', 'OH'], ['e', 'EH'],
    ['ˈ', '-'], ['ˌ', ''], ['.', '-'],
  ]
  let out = clean
  for (const [from, to] of pairs) out = out.split(from).join(to)
  return out.toUpperCase().replace(/^-+/, '').replace(/-+$/, '').replace(/--+/g, '-')
}

function splitRespellingSyllables(respelling) {
  if (!respelling) return []
  // Split on dashes or hyphens
  const parts = String(respelling).split(/[-·]+/).map(s => s.trim()).filter(Boolean)
  return parts.length ? parts : [respelling]
}

/* ============================================================================
   YouGlish Modal (local copy — simplified)
   ============================================================================ */

function YouGlishModal({ word, onClose }) {
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
  const embedUrl = video
    ? `https://www.youtube.com/embed/${video.videoId}?autoplay=1&start=${Math.floor(start)}&rel=0&modestbranding=1`
    : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 youglish-modal-enter">
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900/80 via-blue-900/60 to-violet-900/70 backdrop-blur-md" onClick={onClose} />
      <div className="relative w-full max-w-3xl rounded-[2rem] border border-white/10 bg-slate-900 shadow-2xl overflow-hidden youglish-modal-pop">
        <div className="bg-gradient-to-r from-sky-500 via-blue-600 to-violet-600 px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-[0.9rem] bg-white/20 backdrop-blur-sm">
              <span className="material-symbols-outlined text-white">record_voice_over</span>
            </div>
            <div>
              <p className="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-white/80">{t('vocabulary.youglish.kicker')}</p>
              <h3 className="font-headline text-xl text-white">"{word}"</h3>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-full bg-white/20 hover:bg-white/30 p-2 text-white transition">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="p-5">
          {state.loading && <div className="aspect-video rounded-xl bg-slate-800 animate-pulse flex items-center justify-center"><p className="text-sm text-slate-400">{t('vocabulary.youglish.loading')}</p></div>}
          {state.error && <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-6 text-center"><p className="text-sm text-rose-200">{t('vocabulary.youglish.error', { error: state.error })}</p></div>}
          {!state.loading && !state.error && videos.length === 0 && <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-8 text-center"><p className="text-sm text-slate-400">{t('vocabulary.youglish.empty')}</p></div>}
          {embedUrl && (
            <>
              <div className="aspect-video rounded-xl overflow-hidden border border-slate-700">
                <iframe key={`${video.videoId}-${occIdx}`} src={embedUrl} allow="autoplay; encrypted-media" allowFullScreen className="w-full h-full" />
              </div>
              {occurrence?.text && <p className="mt-3 text-sm text-slate-300 text-center italic">"{occurrence.text}"</p>}
              <div className="mt-4 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (occIdx > 0) setOccIdx(occIdx - 1)
                    else if (videoIdx > 0) { setVideoIdx(videoIdx - 1); setOccIdx(0) }
                  }}
                  disabled={videoIdx === 0 && occIdx === 0}
                  className="rounded-full bg-slate-800 border border-slate-700 px-4 py-2 text-xs font-bold text-slate-300 disabled:opacity-30 hover:bg-slate-700 transition"
                >{t('vocabulary.youglish.previous')}</button>
                <p className="text-xs text-sky-400">{t('vocabulary.youglish.clipCounter', { current: occIdx + 1, total: video?.occurrences?.length || 0, videoCurrent: videoIdx + 1, videoTotal: videos.length })}</p>
                <button
                  type="button"
                  onClick={() => {
                    if (occIdx < (video?.occurrences?.length || 1) - 1) setOccIdx(occIdx + 1)
                    else if (videoIdx < videos.length - 1) { setVideoIdx(videoIdx + 1); setOccIdx(0) }
                  }}
                  disabled={videoIdx === videos.length - 1 && occIdx === (video?.occurrences?.length || 1) - 1}
                  className="rounded-full bg-slate-800 border border-slate-700 px-4 py-2 text-xs font-bold text-slate-300 disabled:opacity-30 hover:bg-slate-700 transition"
                >{t('vocabulary.youglish.next')}</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/* ============================================================================
   Flashcard — 3D flip animation, front/back, rich detail
   ============================================================================ */

function Flashcard({ keyword, onYouglish, onJumpToLesson, summonPulse = 0 }) {
  const { t } = useI18n()
  const [flipped, setFlipped] = useState(false)
  const [activeSyllable, setActiveSyllable] = useState(-1)
  const [summoned, setSummoned] = useState(false)

  useEffect(() => { setFlipped(false); setActiveSyllable(-1) }, [keyword?.id])
  useEffect(() => {
    if (!summonPulse) return
    setSummoned(true)
    const id = setTimeout(() => setSummoned(false), 1400)
    return () => clearTimeout(id)
  }, [summonPulse])

  if (!keyword) {
    return (
      <div className="aspect-[5/3] rounded-[2rem] border border-slate-200 bg-white flex items-center justify-center">
        <p className="text-slate-400">{t('vocabulary.card.empty')}</p>
      </div>
    )
  }

  const respelling = getRespelling(keyword)
  const syllables = splitRespellingSyllables(respelling)
  const collocGroups = keyword?.collocations
    ? ['commonCollocations', 'contexts', 'usagePatterns']
        .map(k => ({ key: k, items: keyword.collocations?.[k] || [] }))
        .filter(g => g.items.length > 0)
    : []

  async function playWithSync() {
    setActiveSyllable(0)
    await playTTS(
      keyword.word,
      undefined,
      (currentTime, duration) => {
        if (!duration || syllables.length === 0) return
        // Distribute syllables across duration
        const idx = Math.min(syllables.length - 1, Math.floor((currentTime / duration) * syllables.length))
        setActiveSyllable(idx)
      },
      () => setTimeout(() => setActiveSyllable(-1), 200)
    )
  }

  // Colorful rotation for syllables
  const syllableColors = [
    'text-sky-600 bg-sky-100 border-sky-300',
    'text-violet-600 bg-violet-100 border-violet-300',
    'text-emerald-600 bg-emerald-100 border-emerald-300',
    'text-amber-600 bg-amber-100 border-amber-300',
    'text-rose-600 bg-rose-100 border-rose-300',
  ]

  return (
    <div className={`flashcard-scene ${summoned ? 'is-summoned' : ''}`}>
      {/* Sparkle layer — six tiny twinkles distributed around the card */}
      <span className="flashcard-sparkles" aria-hidden="true">
        <span /><span /><span /><span /><span /><span />
      </span>
      {/* Curl-corner peel hint, encourages flip interaction */}
      <span className="flashcard-curl" aria-hidden="true" />
      <div
        className={`flashcard-inner ${flipped ? 'is-flipped' : ''}`}
        onClick={() => setFlipped(!flipped)}
      >
        {/* FRONT */}
        <div className="flashcard-face flashcard-face-front rounded-[2rem] border-2 border-sky-200 bg-gradient-to-br from-white via-sky-50 to-blue-50 p-6 sm:p-8 cursor-pointer shadow-xl">
          <div className="flex items-start justify-between mb-4 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <p className="font-label text-[10px] font-bold uppercase tracking-[0.22em] text-sky-600">{t('vocabulary.card.wordLabel')}</p>
              {keyword.cefr_level && (
                <span className="rounded-full bg-emerald-100 border border-emerald-200 px-2 py-0.5 text-[10px] font-label font-bold text-emerald-700">{keyword.cefr_level}</span>
              )}
            </div>
            <p className="text-[10px] text-slate-400 italic">{t('vocabulary.card.clickToFlip')}</p>
          </div>
          <div className="text-center py-4">
            <h2 className="font-headline text-5xl sm:text-6xl text-slate-900 leading-none">{keyword.word}</h2>
            {keyword.ipa && (
              <p className="mt-3 font-mono text-xl text-sky-700">{keyword.ipa}</p>
            )}
            {/* Colorful karaoke-style syllable display (big + bold) */}
            {syllables.length > 0 && (
              <div className="mt-4 flex items-center justify-center gap-2 flex-wrap">
                {syllables.map((syl, i) => {
                  const color = syllableColors[i % syllableColors.length]
                  const isActive = activeSyllable === i
                  const hasPlayed = activeSyllable > i
                  return (
                    <span
                      key={i}
                      className={`inline-block rounded-xl border-2 px-3.5 py-2 font-headline text-2xl sm:text-3xl font-bold uppercase tracking-wide transition-all duration-200 ${color} ${
                        isActive ? 'scale-125 shadow-lg' : hasPlayed ? 'opacity-80' : 'opacity-70'
                      }`}
                    >
                      {syl}
                    </span>
                  )
                })}
              </div>
            )}
            <div className="mt-6 flex items-center justify-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); playWithSync() }}
                className="inline-flex items-center gap-1.5 rounded-full bg-sky-600 px-5 py-2.5 text-sm font-label font-bold uppercase tracking-[0.14em] text-white hover:bg-sky-700 transition cursor-pointer shadow-md"
                title={t('vocabulary.card.hearItTitle')}
              >
                <span className="material-symbols-outlined text-base">volume_up</span>
                {t('vocabulary.card.hearIt')}
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onYouglish(keyword.word) }}
                className="inline-flex items-center gap-1.5 rounded-full bg-rose-600 px-5 py-2.5 text-sm font-label font-bold uppercase tracking-[0.14em] text-white hover:bg-rose-700 transition cursor-pointer shadow-md"
                title={t('vocabulary.card.inContextTitle')}
              >
                <span className="material-symbols-outlined text-base">smart_display</span>
                {t('vocabulary.card.inContext')}
              </button>
            </div>
          </div>
          {/* Big "From lesson" link — fills card width, truncates long titles so
              "FROM LESSON N" + arrow stay pinned at their anchor points. */}
          <div className="mt-3 pt-3 border-t border-sky-100">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onJumpToLesson && onJumpToLesson(keyword.lessonId, keyword.word) }}
              className="group flex w-full items-center gap-2 rounded-full bg-white border border-sky-200 px-4 py-2 hover:border-sky-400 hover:bg-sky-50 transition cursor-pointer min-w-0"
              title={keyword.lessonTitle}
            >
              <span className="material-symbols-outlined text-base text-sky-600 shrink-0">menu_book</span>
              <span className="text-left flex-1 min-w-0 overflow-hidden">
                <span className="block font-label text-[9px] font-bold uppercase tracking-[0.14em] text-slate-400 truncate">{t('vocabulary.card.fromLesson', { number: keyword.lessonNumber || '' })}</span>
                <span className="block text-sm font-semibold text-slate-800 group-hover:text-sky-700 transition truncate">{keyword.lessonTitle}</span>
              </span>
              <span className="material-symbols-outlined text-sm text-slate-300 group-hover:text-sky-600 shrink-0">arrow_forward</span>
            </button>
          </div>
        </div>

        {/* BACK */}
        <div className="flashcard-face flashcard-face-back rounded-[2rem] border-2 border-violet-200 bg-gradient-to-br from-white via-violet-50 to-fuchsia-50 p-6 sm:p-8 cursor-pointer shadow-xl">
          <div className="flashcard-back-scroll">
            <div className="flex items-start justify-between mb-4 flex-wrap gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-headline text-3xl sm:text-4xl text-slate-900">{keyword.word}</h3>
                {keyword.ipa && <span className="font-mono text-base text-violet-700">{keyword.ipa}</span>}
              </div>
              <p className="text-[11px] text-slate-400 italic">{t('vocabulary.card.clickToFlipBack')}</p>
            </div>
            <p className="text-2xl font-semibold text-violet-800 mb-4">{keyword.translation}</p>
            {keyword.definition && (
              <div className="mb-4">
                <p className="font-label text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">{t('vocabulary.card.definitionEn')}</p>
                <p className="mt-1 text-base text-slate-700 leading-relaxed">{keyword.definition}</p>
              </div>
            )}
            {keyword.definitionPl && (
              <div className="mb-4">
                <p className="font-label text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">{t('vocabulary.card.definitionPl')}</p>
                <p className="mt-1 text-base text-slate-700 leading-relaxed">{keyword.definitionPl}</p>
              </div>
            )}
            {keyword.example && (
              <div className="mb-4 rounded-[1rem] border border-sky-100 bg-sky-50/60 px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-base italic text-slate-700 flex-1">"{keyword.example}"</p>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); playTTS(keyword.example) }}
                    className="shrink-0 flex h-8 w-8 items-center justify-center rounded-full bg-white border border-sky-200 text-sky-700 hover:bg-sky-100 transition cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-base">volume_up</span>
                  </button>
                </div>
              </div>
            )}
            {collocGroups.length > 0 && (
              <div>
                <p className="font-label text-[11px] font-bold uppercase tracking-[0.18em] text-violet-700 mb-2">{t('vocabulary.card.collocations')}</p>
                {collocGroups.map(g => (
                  <div key={g.key} className="mb-3">
                    <p className="text-[11px] font-label font-bold uppercase tracking-[0.14em] text-slate-500">
                      {g.key === 'commonCollocations' ? t('vocabulary.card.collocations.common') : g.key === 'contexts' ? t('vocabulary.card.collocations.contexts') : t('vocabulary.card.collocations.usage')}
                    </p>
                    <ul className="mt-1 space-y-1">
                      {g.items.slice(0, 6).map((c, i) => (
                        <li key={i} className="text-sm text-slate-700">
                          <span className="font-semibold">{c.phrase}</span>
                          {c.example && <span className="text-slate-500"> — "{c.example}"</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
          {/* Scroll-to-top button — appears when content overflows */}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); e.currentTarget.previousElementSibling?.scrollTo({ top: 0, behavior: 'smooth' }) }}
            className="flashcard-back-scrolltop"
            aria-label="Scroll to top"
          >
            <span className="material-symbols-outlined text-[18px]">keyboard_arrow_up</span>
          </button>
        </div>
      </div>
    </div>
  )
}

/* ============================================================================
   Main Vocabulary view
   ============================================================================ */

export default function Vocabulary({ data }) {
  const { t } = useI18n()
  const lessons = data?.lessons || []
  const keywords = data?.keywords || []
  const [mode, setMode] = useState('browse') // browse | study
  const [lessonFilter, setLessonFilter] = useState('all')
  const [topicFilter, setTopicFilter] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [summonPulse, setSummonPulse] = useState(0)
  const stageRef = useRef(null)
  const summonCard = (i) => {
    setActiveIndex(i)
    setSummonPulse(p => p + 1)
    setTimeout(() => {
      stageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 30)
  }
  const [studyDeck, setStudyDeck] = useState([])
  const [youglishWord, setYouglishWord] = useState(null)

  const baseKeywords = mode === 'study' ? studyDeck : keywords
  const filteredKeywords = useMemo(() => {
    const q = searchTerm.trim().toLowerCase()
    return baseKeywords.filter(kw => {
      if (lessonFilter !== 'all') {
        // Defensive: match on both lessonId and lessonDate since lessons.id is often the date
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
    for (const kw of baseKeywords) {
      if (Array.isArray(kw.topics)) kw.topics.forEach(t => topics.add(t))
    }
    return [...topics].filter(Boolean).sort()
  }, [baseKeywords])

  // Topics available within the currently selected lesson (for disabled state)
  const topicsInCurrentLesson = useMemo(() => {
    if (lessonFilter === 'all') return null
    const set = new Set()
    for (const kw of baseKeywords) {
      const kwLessonId = String(kw.lessonId || '')
      const kwLessonDate = String(kw.lessonDate || '')
      if (kwLessonId === lessonFilter || kwLessonDate === lessonFilter) {
        ;(kw.topics || []).forEach(t => set.add(t))
      }
    }
    return set
  }, [baseKeywords, lessonFilter])

  useEffect(() => {
    if (mode === 'study') {
      const shuffled = [...keywords].sort(() => Math.random() - 0.5)
      setStudyDeck(shuffled)
    }
  }, [mode, keywords])

  useEffect(() => {
    setActiveIndex(0)
  }, [searchTerm, lessonFilter, topicFilter, mode])

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
    // Navigate to the Lessons tab with query params that auto-open the lesson + highlight the keyword
    const pathParts = window.location.pathname.split('/')
    const slugIdx = pathParts.indexOf('app') + 1
    if (slugIdx > 0 && pathParts[slugIdx]) {
      const params = new URLSearchParams({ openLesson: lessonId, from: 'vocabulary' })
      if (keywordWord) params.set('focusKeyword', keywordWord)
      window.location.href = `/app/${pathParts[slugIdx]}/lessons?${params.toString()}`
    }
  }

  return (
    <section className="space-y-4" id="page-vocabulary">
      {/* Hero */}
      <div className="rounded-[1.75rem] bg-gradient-to-br from-white via-sky-50/60 to-violet-50/50 border border-white/70 editorial-shadow px-5 py-5 sm:px-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="font-label text-[11px] font-bold uppercase tracking-[0.24em] text-violet-700">{t('vocabulary.hero.kicker')}</p>
            <h1 className="mt-1.5 font-headline text-2xl sm:text-3xl text-slate-900">{t('vocabulary.hero.title')}</h1>
            <p className="mt-1.5 text-sm text-slate-600 max-w-2xl">
              {t('vocabulary.hero.subtitle')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMode('browse')}
              className={`rounded-full px-4 py-2 text-[11px] font-label font-bold uppercase tracking-[0.16em] transition cursor-pointer ${mode === 'browse' ? 'bg-sky-600 text-white shadow-md' : 'bg-white text-slate-600 border border-slate-200 hover:border-sky-300'}`}
            >
              {t('vocabulary.mode.browse')}
            </button>
            <button
              type="button"
              onClick={() => setMode('study')}
              className={`rounded-full px-4 py-2 text-[11px] font-label font-bold uppercase tracking-[0.16em] transition cursor-pointer ${mode === 'study' ? 'bg-violet-600 text-white shadow-md' : 'bg-white text-slate-600 border border-slate-200 hover:border-violet-300'}`}
            >
              {t('vocabulary.mode.study')}
            </button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-[1.5rem] border border-white/70 bg-white/80 editorial-shadow p-4 space-y-3">
        <input
          type="search"
          placeholder={t('vocabulary.searchPlaceholder')}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full rounded-2xl border border-slate-200/60 bg-white px-4 py-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <select
            value={lessonFilter}
            onChange={(e) => setLessonFilter(e.target.value)}
            className="w-full rounded-2xl border border-slate-200/60 bg-white px-4 py-2.5 text-sm text-slate-700 cursor-pointer focus:border-sky-300 focus:outline-none"
          >
            <option value="all">{t('vocabulary.filter.allLessons', { count: keywords.length })}</option>
            {lessons.map(l => {
              const num = l.lessonNumber || ''
              const keywordCount = l.keywordCount || l.keyword_count || l.keywords?.length || 0
              return (
                <option key={l.id} value={l.id}>
                  {num ? t('vocabulary.filter.lessonPrefix', { number: num }) : ''}{formatDate(l.date)} · {l.title} {t('vocabulary.filter.lessonKwSuffix', { count: keywordCount })}
                </option>
              )
            })}
          </select>
          <div className="vocab-topic-clamp">
            <button
              type="button"
              onClick={() => setTopicFilter('all')}
              className={`topic-tag ${topicFilter === 'all' ? 'is-active' : ''}`}
            >
              {t('vocabulary.filter.allTopics')}
            </button>
            {availableTopics.slice(0, 12).map(tp => {
              const inCurrent = !topicsInCurrentLesson || topicsInCurrentLesson.has(tp)
              const disabled = !inCurrent && lessonFilter !== 'all'
              return (
                <button
                  key={tp}
                  type="button"
                  onClick={() => !disabled && setTopicFilter(topicFilter === tp ? 'all' : tp)}
                  disabled={disabled}
                  title={disabled ? t('vocabulary.filter.topicDisabled') : ''}
                  className={`topic-tag ${topicFilter === tp ? 'is-active' : ''} ${disabled ? 'is-disabled' : ''}`}
                >
                  {tp}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Main flashcard stage */}
      <div ref={stageRef} className="grid gap-4 lg:grid-cols-[minmax(0,1fr),260px]">
        <div className="space-y-3">
          {filteredKeywords.length > 0 ? (
            <>
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setActiveIndex(i => Math.max(0, i - 1))}
                  disabled={activeIndex === 0}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 disabled:opacity-30 hover:border-sky-300 hover:text-sky-700 transition cursor-pointer"
                  aria-label={t('vocabulary.nav.previousCard')}
                >
                  <span className="material-symbols-outlined">arrow_back_ios_new</span>
                </button>
                <div className="text-center flex-1">
                  <p className="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                    {t('vocabulary.nav.cardCounter', { current: activeIndex + 1, total: filteredKeywords.length })}
                  </p>
                  <div className="mt-1 h-1 max-w-xs mx-auto rounded-full bg-slate-200 overflow-hidden">
                    <div className="h-1 rounded-full bg-gradient-to-r from-sky-500 to-violet-600" style={{ width: `${(activeIndex + 1) / filteredKeywords.length * 100}%` }} />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveIndex(i => Math.min(filteredKeywords.length - 1, i + 1))}
                  disabled={activeIndex === filteredKeywords.length - 1}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 disabled:opacity-30 hover:border-sky-300 hover:text-sky-700 transition cursor-pointer"
                  aria-label={t('vocabulary.nav.nextCard')}
                >
                  <span className="material-symbols-outlined">arrow_forward_ios</span>
                </button>
              </div>
              <Flashcard keyword={activeKeyword} onYouglish={setYouglishWord} onJumpToLesson={jumpToLesson} summonPulse={summonPulse} />
              <p className="text-center text-[11px] text-slate-400">
                <kbd className="rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[10px]">←</kbd> {t('vocabulary.nav.previous')} ·
                <kbd className="rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[10px] mx-1">→</kbd> {t('vocabulary.nav.next')} ·
                {' '}{t('vocabulary.nav.clickToFlip')}
              </p>
            </>
          ) : (
            <div className="rounded-[1.5rem] border border-slate-200 bg-white px-6 py-10 text-center">
              <span className="material-symbols-outlined text-3xl text-slate-300">search_off</span>
              <p className="mt-2 text-sm text-slate-500">{t('vocabulary.empty.noMatches')}</p>
            </div>
          )}
        </div>
        {/* Side list for quick navigation */}
        <aside className="rounded-[1.5rem] border border-white/70 bg-white/80 editorial-shadow p-3">
          <p className="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 px-2 pt-1 pb-3">
            {t('vocabulary.sidebar.allCards', { count: filteredKeywords.length })}
          </p>
          <div className="space-y-1 max-h-[520px] overflow-y-auto">
            {filteredKeywords.slice(0, 100).map((kw, i) => (
              <button
                key={kw.id}
                type="button"
                onClick={() => summonCard(i)}
                className={`w-full rounded-[0.75rem] px-3 py-2 text-left transition cursor-pointer ${activeIndex === i ? 'bg-sky-50 border border-sky-200' : 'bg-white border border-transparent hover:bg-slate-50'}`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-800 truncate flex-1">{kw.word}</span>
                  {kw.ipa && <span className="font-mono text-[10px] text-sky-600 shrink-0">{kw.ipa}</span>}
                </div>
                <p className="text-[11px] text-slate-500 truncate">{kw.translation}</p>
              </button>
            ))}
            {filteredKeywords.length > 100 && (
              <p className="text-[11px] text-slate-400 text-center py-2">{t('vocabulary.sidebar.truncated')}</p>
            )}
          </div>
        </aside>
      </div>

      {/* YouGlish Modal */}
      {youglishWord && <YouGlishModal word={youglishWord} onClose={() => setYouglishWord(null)} />}
    </section>
  )
}
