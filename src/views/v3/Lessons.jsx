// EM v3 · Lessons — full archive w/ rich per-lesson modal, KeywordCards,
// YouGlish modal, Analysis PDF generator, Raw Notes external PDF, topic filter,
// deep-link query params, horizontal navigator. Inline-style port of the
// Tailwind-era Lessons.jsx — functional parity preserved verbatim.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useI18n } from '../../i18n'
import { fetchJSONCached, fetchWithTimeout } from '../../practice/lib/practice-cache'
import {
  METRICS,
  scoreToTier,
  formatDate,
  formatLongDate,
  parseMetricCommentary,
} from '../../components/analytics/AnalyticsPrimitives.jsx'
import { FONT, G, EASE, CEFR_COLOR } from '../../design/v3/tokens.js'
import { useV3Theme } from '../../design/v3/ThemeProvider.jsx'
import { Btn, Glass, Pill } from '../../design/v3/primitives.jsx'
import { generateLessonPdf } from './lessons-pdf.js'

// Dark-mode surface constant (used inside YouGlishModal overlay)
const NIGHT_SURFACE = '#0A0718'

// Map a free-form practice-advice line to a deep link into the practice arena.
// Returns { url, label } when intent is recognised, otherwise null and the
// caller falls back to the generic free-write box. Mike 2026-05-04: every
// advice card should land the student in a useful shell + filter, not the
// generic free-write — the cards are the bridge from analysis to practice.
function classifyAdviceLink(text, slug, basePath = '') {
  const lower = String(text || '').toLowerCase()
  const base = `${basePath || ''}/${slug}/practice`
  // IMPORTANT: do NOT pass &advice= here. Practice.jsx checks
  // inFreeWriteMode (driven by adviceParam) BEFORE inFocusMode, so attaching
  // advice would dump the student back into the free-write box and skip the
  // FocusPicker we're trying to land them in.
  const link = (params, label) => ({ url: `${base}?${params}`, label })

  if (/(minimal pair|pronunciation drill|pronunciation practice|phoneme|word stress|silent letter|consonant cluster|vowel sound|stress placement|polysyllabic)/.test(lower)) {
    return link('category=pronunciation', 'Open pronunciation drill')
  }
  if (/(reflexive|reciprocal|each other|one another|pronoun (use|filter|drill))/.test(lower)) {
    return link('category=grammar&focus=reflexive', 'Open pronoun grammar drill')
  }
  if (/(word formation|suffix|nationality adjective|noun.*verb.*transform|verb to noun|adjective to adverb|adjective to noun|transformation drill)/.test(lower)) {
    return link('category=vocabulary&focus=word%20formation', 'Open word formation drill')
  }
  if (/(\bused to\b|be used to|get used to|getting used to)/.test(lower)) {
    return link('category=grammar&focus=used%20to', 'Open used-to grammar drill')
  }
  if (/(article (use|usage|omission)|definite article|indefinite article|determiner|the\/a\/an)/.test(lower)) {
    return link('category=grammar&focus=article', 'Open article drill')
  }
  if (/(present perfect|past simple|past participle|verb tense|tense (use|drill|workshop))/.test(lower)) {
    return link('category=grammar&focus=tense', 'Open verb tense drill')
  }
  if (/(preposition|prepositional|interested in|depend on|focus on)/.test(lower)) {
    return link('category=grammar&focus=preposition', 'Open preposition drill')
  }
  if (/(reading comprehension|article reading|read aloud|summari[sz]e|reading task|extended reading)/.test(lower)) {
    return link('category=fluency&focus=reading', 'Open reading drill')
  }
  if (/(monologue|extended turn|speaking practice|role[- ]?play|conversation drill|spoken summary)/.test(lower)) {
    return link('category=fluency&focus=speaking', 'Open speaking drill')
  }
  if (/(collocation|chunk|fixed expression|set phrase|vocabulary review|target keyword)/.test(lower)) {
    return link('category=vocabulary', 'Open vocabulary drill')
  }
  if (/(subject.{0,3}verb|agreement|third[- ]?person|3rd person|singular.{0,3}plural)/.test(lower)) {
    return link('category=grammar&focus=agreement', 'Open agreement drill')
  }
  return null
}

/* ============================================================================
   TTS playback — nginx /api/tts/ proxy (same as prod)
   ============================================================================ */
const ttsCache = new Map()
let currentAudio = null
function currentVoice() {
  try { return localStorage.getItem('tts_voice') || 'af_heart' } catch { return 'af_heart' }
}
async function playTTS(text, voice) {
  if (!text) return
  const v = voice || currentVoice()
  const key = `${text}::${v}`
  if (ttsCache.has(key)) {
    const audio = ttsCache.get(key)
    currentAudio?.pause()
    currentAudio = audio
    audio.currentTime = 0
    try { await audio.play() } catch {}
    return
  }
  try {
    // 30s AbortController-backed timeout — see practice-cache.ts.
    const resp = await fetchWithTimeout('/api/tts/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice: v, lang: v[0] || 'a' }),
    })
    if (!resp.ok) throw new Error(`TTS failed ${resp.status}`)
    const blob = await resp.blob()
    const url = URL.createObjectURL(blob)
    const audio = new Audio(url)
    ttsCache.set(key, audio)
    currentAudio?.pause()
    currentAudio = audio
    await audio.play()
  } catch (err) { console.error('TTS error:', err) }
}

/* ============================================================================
   YouGlish fetch — progressive variant relaxation
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
async function fetchYouglishRaw(query) {
  const resp = await fetchWithTimeout(`/api/youglish/keyword?q=${encodeURIComponent(query)}`)
  if (!resp.ok) throw new Error(`YouGlish ${resp.status}`)
  return resp.json()
}
function packYouglishResults(results, queryUsed) {
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
  return { keyword: queryUsed, videos: Array.from(byVid.values()) }
}
async function fetchYouglish(word) {
  const key = String(word || '').toLowerCase().replace(/_/g, ' ').trim()
  if (!key) return { keyword: key, videos: [] }
  if (youglishCache.has(key)) return youglishCache.get(key)
  const variants = youglishQueryVariants(key)
  let lastErr = null
  for (const v of variants) {
    try {
      const data = await fetchYouglishRaw(v)
      const results = Array.isArray(data.results) ? data.results : []
      if (results.length > 0) {
        const out = packYouglishResults(results, v)
        out.fallbackFrom = v === key ? null : key
        youglishCache.set(key, out)
        return out
      }
    } catch (err) { lastErr = err }
  }
  const empty = { keyword: key, videos: [], fallbackFrom: key }
  youglishCache.set(key, empty)
  if (lastErr) console.warn('[YouGlish] all variants failed for', key, lastErr)
  return empty
}

/* ============================================================================
   Small helpers
   ============================================================================ */
function SectionLabel({ children, icon, tone = 'brand', T }) {
  const toneColor = {
    brand: T.brandInk || T.brand,
    emerald: T.emerald,
    amber: T.amber,
    rose: T.rose,
    sky: T.sky,
    violet: T.violet,
  }[tone] || T.textDim
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6,
      fontSize: 10, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase',
      color: toneColor, marginBottom: 12 }}>
      {icon && <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{icon}</span>}
      {children}
    </div>
  )
}

/* ============================================================================
   KeywordCard — rich keyword display with TTS, YouGlish, collocations
   ============================================================================ */
function materialHref(material) {
  return String(material?.url || '').trim()
}

function materialIcon(type) {
  const t = String(type || '').toLowerCase()
  if (t.includes('video')) return 'smart_display'
  if (t.includes('audio')) return 'headphones'
  if (t.includes('image')) return 'image'
  if (t.includes('pdf')) return 'picture_as_pdf'
  return 'attachment'
}

function KeywordCard({ keyword, onYouglish, forceExpanded = false }) {
  const { T, mode } = useV3Theme()
  const isDay = mode === 'day'
  const { t } = useI18n()
  const [expanded, setExpanded] = useState(forceExpanded)
  useEffect(() => { if (forceExpanded) setExpanded(true) }, [forceExpanded])
  const collocGroups = keyword?.collocations
    ? ['commonCollocations', 'contexts', 'usagePatterns']
        .map(k => ({ key: k, items: keyword.collocations?.[k] || [] }))
        .filter(g => g.items.length > 0)
    : []

  const headerBtn = {
    width: '100%', textAlign: 'left', background: 'transparent', border: 'none',
    padding: '14px 16px', cursor: 'pointer', color: T.text,
    display: 'flex', alignItems: 'flex-start', gap: 12,
  }
  const iconBtn = (bg, color, border) => ({
    width: 34, height: 34, borderRadius: '50%', border: `1px solid ${border}`,
    background: bg, color, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    transition: `all 160ms ${EASE.springFast}`,
  })

  return (
    <div style={{
      borderRadius: 16,
      background: isDay ? '#fff' : 'rgba(255,255,255,0.03)',
      border: `1px solid ${expanded ? (isDay ? 'rgba(162,28,175,0.35)' : 'rgba(217,70,239,0.35)') : T.border}`,
      overflow: 'hidden',
      transition: `all 200ms ${EASE.springFast}`,
    }}>
      <button type="button" onClick={() => setExpanded(!expanded)} style={headerBtn}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 2 }}>
            <span style={{ fontFamily: FONT.display, fontSize: 19, fontWeight: 600,
              letterSpacing: '-0.02em', color: T.text }}>{keyword.word}</span>
            {keyword.ipa && (
              <span style={{ fontFamily: FONT.mono, fontSize: 12, color: T.sky }}>{keyword.ipa}</span>
            )}
            {keyword.cefr_level && (
              <span style={{ padding: '2px 7px', borderRadius: 10, fontSize: 9, fontWeight: 700,
                letterSpacing: '0.1em', textTransform: 'uppercase',
                background: isDay ? '#F3EEFE' : 'rgba(217,70,239,0.10)',
                color: T.brandInk || T.brand,
                border: `1px solid ${T.borderSoft}` }}>{keyword.cefr_level}</span>
            )}
          </div>
          <div style={{ fontFamily: "'Fraunces', serif", fontStyle: 'italic', fontSize: 14,
            color: T.brandInk || T.brand }}>{keyword.translation}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <span
            onClick={(e) => { e.stopPropagation(); playTTS(keyword.word) }}
            title={t('lessons.keyword.playPronunciation')}
            style={iconBtn(
              isDay ? '#EFF6FF' : 'rgba(96,165,250,0.10)',
              T.sky,
              isDay ? '#BFDBFE' : 'rgba(96,165,250,0.35)'
            )}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>volume_up</span>
          </span>
          <span
            onClick={(e) => { e.stopPropagation(); onYouglish(keyword.word) }}
            title={t('lessons.keyword.watchYouglish')}
            style={iconBtn(
              isDay ? '#FEF2F2' : 'rgba(251,113,133,0.12)',
              T.rose,
              isDay ? '#FECACA' : 'rgba(251,113,133,0.35)'
            )}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>smart_display</span>
          </span>
          <span className="material-symbols-outlined" style={{
            color: T.textDim, fontSize: 22,
            transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 220ms ease' }}>expand_more</span>
        </div>
      </button>

      {expanded && (
        <div style={{ padding: '0 16px 16px',
          borderTop: `1px solid ${T.borderSoft}`, paddingTop: 14,
          background: isDay ? 'rgba(248,245,255,0.4)' : 'rgba(255,255,255,0.01)',
          display: 'grid', gap: 14 }}>
          {(keyword.definition || keyword.definitionPl) && (
            <div style={{ display: 'grid', gap: 10,
              gridTemplateColumns: keyword.definition && keyword.definitionPl ? '1fr 1fr' : '1fr' }}>
              {keyword.definition && (
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.18em',
                    textTransform: 'uppercase', color: T.textDim, marginBottom: 4 }}>
                    {t('lessons.keyword.definitionEn')}
                  </div>
                  <div style={{ fontSize: 13, color: T.textSoft, lineHeight: 1.55 }}>{keyword.definition}</div>
                </div>
              )}
              {keyword.definitionPl && (
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.18em',
                    textTransform: 'uppercase', color: T.textDim, marginBottom: 4 }}>
                    {t('lessons.keyword.definitionPl')}
                  </div>
                  <div style={{ fontSize: 13, color: T.textSoft, lineHeight: 1.55 }}>{keyword.definitionPl}</div>
                </div>
              )}
            </div>
          )}
          {keyword.example && (
            <div style={{ padding: '10px 14px', borderRadius: 12,
              background: isDay ? 'rgba(240,249,255,0.6)' : 'rgba(96,165,250,0.06)',
              border: `1px solid ${isDay ? 'rgba(191,219,254,0.6)' : 'rgba(96,165,250,0.2)'}`,
              display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.18em',
                  textTransform: 'uppercase', color: T.sky, marginBottom: 4 }}>
                  {t('lessons.keyword.exampleSentence')}
                </div>
                <div style={{ fontFamily: "'Fraunces', serif", fontStyle: 'italic',
                  fontSize: 14, color: T.textSoft, lineHeight: 1.5 }}>"{keyword.example}"</div>
              </div>
              <button type="button" onClick={() => playTTS(keyword.example)}
                title={t('lessons.keyword.playExample')}
                style={{ flexShrink: 0, width: 28, height: 28, borderRadius: '50%',
                  background: isDay ? '#fff' : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${isDay ? '#BFDBFE' : 'rgba(96,165,250,0.35)'}`,
                  color: T.sky, cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>volume_up</span>
              </button>
            </div>
          )}
          {collocGroups.length > 0 && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.18em',
                textTransform: 'uppercase', color: T.violet, marginBottom: 8 }}>
                {t('lessons.keyword.collocationsUsage')}
              </div>
              <div style={{ display: 'grid', gap: 12 }}>
                {collocGroups.map(g => (
                  <div key={g.key}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em',
                      textTransform: 'uppercase', color: T.textDim, marginBottom: 4 }}>
                      {g.key === 'commonCollocations' ? t('lessons.keyword.commonCollocations')
                        : g.key === 'contexts' ? t('lessons.keyword.contexts')
                        : t('lessons.keyword.usagePatterns')}
                    </div>
                    <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 4 }}>
                      {g.items.map((c, i) => {
                        const phrase = typeof c === 'string' ? c : (c?.phrase || c?.word || '')
                        const example = typeof c === 'object' ? (c?.example || c?.sample || null) : null
                        if (!phrase) return null
                        return (
                          <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 6,
                            fontSize: 13, color: T.textSoft, lineHeight: 1.5 }}>
                            <span className="material-symbols-outlined" style={{
                              color: T.violet, fontSize: 14, marginTop: 3, flexShrink: 0 }}>east</span>
                            <span>
                              <span style={{ fontWeight: 600 }}>{phrase}</span>
                              {example && (
                                <span style={{ color: T.textDim, fontStyle: 'italic' }}> — "{example}"</span>
                              )}
                            </span>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ============================================================================
   YouGlishModal — embedded player + karaoke caption + prev/next
   ============================================================================ */
function YouGlishModal({ word, onClose }) {
  const { T, mode } = useV3Theme()
  const isDay = mode === 'day'
  const { t } = useI18n()
  const [state, setState] = useState({ loading: true, error: null, data: null })
  const [videoIdx, setVideoIdx] = useState(0)
  const [occIdx, setOccIdx] = useState(0)
  const [autoplay] = useState(true)
  const playerRef = useRef(null)
  const timerRef = useRef(null)
  const [elapsed, setElapsed] = useState(0)

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

  const videos = state.data?.videos || []
  const video = videos[videoIdx] || null

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') next()
      if (e.key === 'ArrowLeft') prev()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, videoIdx, occIdx, state.data])

  useEffect(() => {
    clearInterval(timerRef.current)
    setElapsed(0)
    if (!word) return
    timerRef.current = setInterval(() => setElapsed(e => e + 0.1), 100)
    return () => clearInterval(timerRef.current)
  }, [word, videoIdx, occIdx])

  if (!word) return null

  const occurrence = video?.occurrences?.[occIdx] || null
  const start = Math.max(0, (occurrence?.start || 0) - 2)
  const embedUrl = video
    ? `https://www.youtube.com/embed/${video.videoId}?autoplay=${autoplay ? 1 : 0}&mute=0&start=${Math.floor(start)}&rel=0&modestbranding=1&iv_load_policy=3&controls=1&enablejsapi=1&origin=${encodeURIComponent(typeof window !== 'undefined' ? window.location.origin : '')}`
    : null

  const totalOccurrences = videos.reduce((sum, v) => sum + v.occurrences.length, 0)
  const globalOccIdx = videos.slice(0, videoIdx).reduce((s, v) => s + v.occurrences.length, 0) + occIdx + 1

  function next() {
    if (!video) return
    if (occIdx < video.occurrences.length - 1) setOccIdx(occIdx + 1)
    else if (videoIdx < videos.length - 1) { setVideoIdx(videoIdx + 1); setOccIdx(0) }
  }
  function prev() {
    if (!video) return
    if (occIdx > 0) setOccIdx(occIdx - 1)
    else if (videoIdx > 0) { setVideoIdx(videoIdx - 1); setOccIdx((videos[videoIdx - 1]?.occurrences?.length || 1) - 1) }
  }

  const IFRAME_STARTUP = 4.0
  const LEAD_IN = 2.0
  const captionWords = useMemo(() => {
    if (!occurrence?.text) return []
    const duration = Math.max(1, (occurrence.end || (occurrence.start + 3)) - occurrence.start)
    const words = occurrence.text.split(/\s+/).filter(Boolean)
    return words.map((w, i) => {
      const perWord = duration / words.length
      const activeAt = IFRAME_STARTUP + LEAD_IN + i * perWord
      return { word: w, activeAt, duration: perWord }
    })
  }, [occurrence])

  const wordColor = (activeAt, duration) => {
    const isActive = elapsed >= activeAt && elapsed < activeAt + duration
    const hasPlayed = elapsed >= activeAt
    if (isActive) return { color: T.sky, fontWeight: 700, transform: 'scale(1.1)' }
    if (hasPlayed) return { color: T.textSoft }
    return { color: T.textMute }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={onClose} style={{
        position: 'absolute', inset: 0,
        background: isDay ? 'rgba(16,10,40,0.5)' : 'rgba(6,4,16,0.75)',
        backdropFilter: 'blur(8px)' }}/>
      <div style={{ position: 'relative', width: '100%', maxWidth: 820,
        borderRadius: 26, overflow: 'hidden',
        background: isDay ? '#fff' : NIGHT_SURFACE,
        border: `1px solid ${T.border}`,
        boxShadow: T.shadow }}>
        {/* Header */}
        <div style={{ background: G.brand, padding: '16px 20px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12,
              background: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(8px)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span className="material-symbols-outlined" style={{ color: '#fff' }}>record_voice_over</span>
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.2em',
                textTransform: 'uppercase', color: 'rgba(255,255,255,0.85)' }}>
                {t('lessons.youglish.kicker')}
              </div>
              <div style={{ fontFamily: FONT.display, fontSize: 22, fontWeight: 600,
                color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                "{word}"
              </div>
              {state.data?.fallbackFrom && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 3,
                  fontSize: 11, color: 'rgba(255,230,150,0.95)' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 13 }}>info</span>
                  {t('lessons.youglish.fallbackHint', { requested: state.data.fallbackFrom, shown: state.data.keyword })}
                </div>
              )}
            </div>
          </div>
          <button type="button" onClick={onClose} style={{
            flexShrink: 0, width: 36, height: 36, borderRadius: '50%',
            background: 'rgba(255,255,255,0.18)', border: 'none', cursor: 'pointer',
            color: '#fff',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 20, background: isDay ? '#FAFAFC' : '#0A0718' }}>
          {state.loading && (
            <div style={{ aspectRatio: '16/9', borderRadius: 14,
              background: isDay ? '#F3F4F6' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${T.border}`,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 40, color: T.sky,
                animation: 'spin 1.4s linear infinite' }}>sync</span>
              <div style={{ marginTop: 10, fontSize: 13, color: T.textDim }}>{t('lessons.youglish.loading')}</div>
            </div>
          )}
          {state.error && (
            <div style={{ borderRadius: 14, padding: 24, textAlign: 'center',
              background: isDay ? '#FEF2F2' : 'rgba(251,113,133,0.08)',
              border: `1px solid ${isDay ? '#FECACA' : 'rgba(251,113,133,0.35)'}` }}>
              <span className="material-symbols-outlined" style={{ fontSize: 32, color: T.rose }}>error_outline</span>
              <div style={{ marginTop: 6, fontSize: 13, color: T.rose }}>{t('lessons.youglish.error')}</div>
              <div style={{ fontSize: 11, color: T.textDim, marginTop: 2 }}>{state.error}</div>
            </div>
          )}
          {!state.loading && !state.error && videos.length === 0 && (
            <div style={{ borderRadius: 14, padding: 32, textAlign: 'center',
              background: isDay ? '#F9FAFB' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${T.border}` }}>
              <span className="material-symbols-outlined" style={{ fontSize: 40, color: T.textDim }}>videocam_off</span>
              <div style={{ marginTop: 10, fontSize: 13, color: T.textSoft }}>{t('lessons.youglish.empty')}</div>
              <div style={{ fontSize: 11, color: T.textDim, marginTop: 3 }}>{t('lessons.youglish.emptyHint')}</div>
            </div>
          )}
          {video && embedUrl && (
            <>
              <div style={{ aspectRatio: '16/9', borderRadius: 14, overflow: 'hidden',
                border: `1px solid ${T.border}`, background: '#000' }}>
                <iframe
                  ref={playerRef}
                  key={`${video.videoId}-${occIdx}`}
                  src={embedUrl}
                  title={`"${word}" spoken in a YouTube clip`}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  style={{ width: '100%', height: '100%', border: 'none' }}
                  onLoad={() => {
                    try {
                      const w = playerRef.current?.contentWindow
                      if (!w) return
                      w.postMessage(JSON.stringify({ event: 'command', func: 'unMute', args: [] }), '*')
                      w.postMessage(JSON.stringify({ event: 'command', func: 'setVolume', args: [100] }), '*')
                      w.postMessage(JSON.stringify({ event: 'command', func: 'playVideo', args: [] }), '*')
                    } catch {}
                  }}
                />
              </div>
              {captionWords.length > 0 && (
                <div style={{ marginTop: 14, padding: '12px 16px', borderRadius: 12,
                  background: isDay ? '#fff' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${T.border}` }}>
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.2em',
                    textTransform: 'uppercase', color: T.sky, marginBottom: 6 }}>
                    {t('lessons.youglish.caption')}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, fontSize: 15, lineHeight: 1.6 }}>
                    {captionWords.map((w, i) => (
                      <span key={i} style={{
                        display: 'inline-block', margin: '0 2px',
                        transition: 'all 200ms ease',
                        ...wordColor(w.activeAt, w.duration),
                      }}>{w.word}</span>
                    ))}
                  </div>
                </div>
              )}
              <div style={{ marginTop: 14, display: 'flex', alignItems: 'center',
                justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <button type="button" onClick={prev}
                  disabled={videoIdx === 0 && occIdx === 0}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    borderRadius: 999, padding: '8px 14px',
                    background: isDay ? '#fff' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${T.border}`,
                    fontSize: 11, fontWeight: 700, letterSpacing: '0.14em',
                    textTransform: 'uppercase', color: T.textSoft, cursor: 'pointer',
                    opacity: (videoIdx === 0 && occIdx === 0) ? 0.3 : 1 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_back</span>
                  {t('lessons.youglish.previous')}
                </button>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.16em',
                    textTransform: 'uppercase', color: T.sky }}>
                    {t('lessons.youglish.clipOf', { a: globalOccIdx, b: totalOccurrences })}
                  </div>
                  <div style={{ fontSize: 11, color: T.textDim }}>
                    {t('lessons.youglish.videoOf', { a: videoIdx + 1, b: videos.length })}
                  </div>
                </div>
                <button type="button" onClick={next}
                  disabled={videoIdx === videos.length - 1 && occIdx === (video?.occurrences.length || 1) - 1}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    borderRadius: 999, padding: '8px 14px',
                    background: isDay ? '#fff' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${T.border}`,
                    fontSize: 11, fontWeight: 700, letterSpacing: '0.14em',
                    textTransform: 'uppercase', color: T.textSoft, cursor: 'pointer',
                    opacity: (videoIdx === videos.length - 1 && occIdx === (video?.occurrences.length || 1) - 1) ? 0.3 : 1 }}>
                  {t('lessons.youglish.next')}
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_forward</span>
                </button>
              </div>
              {videos.length > 1 && (
                <div style={{ marginTop: 14, display: 'flex', gap: 8,
                  overflowX: 'auto', paddingBottom: 4 }}>
                  {videos.map((v, i) => (
                    <button key={v.videoId} type="button"
                      onClick={() => { setVideoIdx(i); setOccIdx(0) }}
                      style={{
                        flexShrink: 0, borderRadius: 10, overflow: 'hidden',
                        border: `2px solid ${videoIdx === i ? T.sky : T.border}`,
                        transform: videoIdx === i ? 'scale(1.05)' : 'none',
                        opacity: videoIdx === i ? 1 : 0.6,
                        cursor: 'pointer', background: 'transparent', padding: 0,
                        transition: 'all 200ms ease' }}>
                      <img src={v.thumbnail} alt=""
                        style={{ width: 96, height: 56, objectFit: 'cover', display: 'block' }}/>
                    </button>
                  ))}
                </div>
              )}
              <div style={{ marginTop: 12, textAlign: 'center',
                fontSize: 10, color: T.textDim }}>
                {t('lessons.youglish.keyboardHint')}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/* ============================================================================
   TopicFilterStrip — horizontal-scroll pills with arrow buttons
   ============================================================================ */
function TopicFilterStrip({ topics, value, onChange, label, allLabel }) {
  const { T, mode } = useV3Theme()
  const isDay = mode === 'day'
  const scrollRef = useRef(null)
  function scroll(dir) {
    const el = scrollRef.current
    if (!el) return
    el.scrollBy({ left: el.clientWidth * 0.6 * dir, behavior: 'smooth' })
  }
  const arrowBtn = {
    width: 28, height: 28, borderRadius: '50%',
    background: isDay ? '#fff' : 'rgba(255,255,255,0.04)',
    border: `1px solid ${T.border}`, color: T.textSoft,
    cursor: 'pointer', flexShrink: 0,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  }
  const pillBtn = (isActive) => ({
    flexShrink: 0, whiteSpace: 'nowrap',
    padding: '5px 12px', borderRadius: 999, cursor: 'pointer',
    fontSize: 11, fontFamily: FONT.mono, fontWeight: 500,
    letterSpacing: '0.06em', textTransform: 'uppercase',
    background: isActive ? G.brand : (isDay ? '#fff' : 'rgba(255,255,255,0.04)'),
    color: isActive ? '#fff' : T.textSoft,
    border: `1px solid ${isActive ? 'transparent' : T.border}`,
    transition: `all 160ms ${EASE.springFast}`,
  })
  return (
    <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.18em',
        textTransform: 'uppercase', color: T.textDim, flexShrink: 0 }}>{label}</span>
      <button type="button" onClick={() => scroll(-1)} style={arrowBtn} aria-label="Scroll topics left">
        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>chevron_left</span>
      </button>
      <div ref={scrollRef} style={{
        display: 'flex', flexWrap: 'nowrap', gap: 6, overflowX: 'auto',
        flex: 1, minWidth: 0, padding: '4px 0', scrollBehavior: 'smooth',
        scrollbarWidth: 'none' }}>
        <button type="button" onClick={() => onChange(null)} style={pillBtn(value === null)}>
          {allLabel}
        </button>
        {topics.map(tp => (
          <button key={tp} type="button"
            onClick={() => onChange(value === tp ? null : tp)}
            style={pillBtn(value === tp)}>
            {tp}
          </button>
        ))}
      </div>
      <button type="button" onClick={() => scroll(1)} style={arrowBtn} aria-label="Scroll topics right">
        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>chevron_right</span>
      </button>
    </div>
  )
}

/* ============================================================================
   HorizontalLessonNavigator — scroll-snap strip
   ============================================================================ */
function HorizontalLessonNavigator({ lessons }) {
  const { T, mode } = useV3Theme()
  const isDay = mode === 'day'
  const { t } = useI18n()
  const scrollRef = useRef(null)
  function scroll(dir) {
    const el = scrollRef.current
    if (!el) return
    el.scrollBy({ left: el.clientWidth * 0.7 * dir, behavior: 'smooth' })
  }
  function jumpTo(id) {
    const el = document.getElementById(`lesson-card-${id}`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  if (!lessons.length) return null
  const arrowBtn = {
    width: 28, height: 28, borderRadius: '50%',
    background: isDay ? '#fff' : 'rgba(255,255,255,0.04)',
    border: `1px solid ${T.border}`, color: T.textSoft,
    cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  }
  return (
    <Glass padding={12} style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 8, padding: '0 6px' }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.2em',
          textTransform: 'uppercase', color: T.textDim }}>
          {t('lessons.nav.quickJump')}
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button type="button" onClick={() => scroll(-1)} style={arrowBtn}
            aria-label={t('lessons.nav.scrollLeft')}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>chevron_left</span>
          </button>
          <button type="button" onClick={() => scroll(1)} style={arrowBtn}
            aria-label={t('lessons.nav.scrollRight')}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>chevron_right</span>
          </button>
        </div>
      </div>
      <div ref={scrollRef} style={{
        display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4,
        scrollSnapType: 'x mandatory', scrollBehavior: 'smooth',
        scrollbarWidth: 'none' }}>
        {lessons.map((l) => {
          const band = l.analysis?.cefrBand
          const overall = l.analysis?.overallScore
          return (
            <button key={l.id} type="button" onClick={() => jumpTo(l.id)}
              style={{
                flexShrink: 0, width: 180, scrollSnapAlign: 'start',
                textAlign: 'left', padding: '10px 12px', borderRadius: 14,
                background: isDay ? '#fff' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${T.border}`, cursor: 'pointer',
                transition: `all 200ms ${EASE.springFast}`,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = T.brand; e.currentTarget.style.transform = 'translateY(-2px)' }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.transform = 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 12, color: T.textDim }}>event</span>
                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.14em',
                  textTransform: 'uppercase', color: T.textDim }}>
                  {formatDate(l.date)}
                </span>
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, color: T.text, lineHeight: 1.3,
                display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                overflow: 'hidden' }}>
                {l.title}
              </div>
              <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                {band && (
                  <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
                    color: CEFR_COLOR[band] || T.textDim }}>
                    {band} {overall ? Math.round(overall) : ''}
                  </span>
                )}
                <span style={{ fontSize: 9, color: T.textDim }}>
                  {t('lessons.kwAbbrev', { n: l.keywordCount || l.keyword_count || l.keywords?.length || 0 })}
                </span>
              </div>
            </button>
          )
        })}
      </div>
    </Glass>
  )
}

/* ============================================================================
   Personalized Recommendations
   ============================================================================ */
function parsePersonalizedRecs(analysis) {
  if (!analysis?.personalDetails) return null
  for (const entry of analysis.personalDetails) {
    if (typeof entry !== 'string') continue
    const m = entry.match(/^personalizedRecs:(.+)$/)
    if (m) { try { return JSON.parse(m[1]) } catch {} }
  }
  return null
}
const RECO_ICON = { book: 'menu_book', article: 'article', podcast: 'podcasts',
  youtube: 'smart_display', series: 'theaters', movie: 'movie',
  documentary: 'videocam', newsletter: 'mail', social: 'groups' }

function PersonalizedRecommendationsBlock({ recs }) {
  const { T, mode, isMobile } = useV3Theme()
  const isDay = mode === 'day'
  const { t } = useI18n()
  const { intro, recommendations } = recs
  if (!recommendations?.length) return null
  return (
    <Glass padding={22}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <div style={{ width: 44, height: 44, borderRadius: 14, background: G.brand,
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
          <span className="material-symbols-outlined">auto_awesome</span>
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.22em',
            textTransform: 'uppercase', color: T.sky }}>{t('lessons.recs.kicker')}</div>
          <div style={{ fontFamily: FONT.display, fontSize: 20, fontWeight: 600, color: T.text }}>
            {t('lessons.recs.title')}
          </div>
        </div>
      </div>
      {intro && (
        <div style={{ fontSize: 13, color: T.textSoft, lineHeight: 1.55, marginBottom: 14,
          fontStyle: 'italic', borderLeft: `2px solid ${T.sky}`, paddingLeft: 12 }}>{intro}</div>
      )}
      <div style={{ display: 'grid', gap: 12,
        gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr' }}>
        {recommendations.map((r, i) => {
          const icon = RECO_ICON[r.type] || 'article'
          const label = String(r.type || 'article').toUpperCase()
          return (
            <a key={i} href={r.url || '#'} target="_blank" rel="noopener"
              style={{
                display: 'block', borderRadius: 16, padding: 16, textDecoration: 'none',
                background: isDay ? '#fff' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${T.border}`,
                transition: `all 220ms ${EASE.springFast}`,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = T.brandInk || T.brand; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = T.shadow }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                  background: G.brand, color: '#fff',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{icon}</span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.18em',
                    textTransform: 'uppercase', color: T.brandInk || T.brand }}>{label}</div>
                  <div style={{ fontFamily: FONT.display, fontSize: 15, fontWeight: 600,
                    color: T.text, lineHeight: 1.3, marginTop: 2 }}>{r.title}</div>
                  {r.creator && (
                    <div style={{ fontSize: 11, color: T.textDim, marginTop: 2 }}>
                      {t('lessons.recs.byCreator', { creator: r.creator })}
                    </div>
                  )}
                </div>
                <span className="material-symbols-outlined" style={{ color: T.textDim, fontSize: 16, flexShrink: 0 }}>open_in_new</span>
              </div>
              {r.whyThisMatches && (
                <div style={{ fontSize: 12, color: T.textSoft, lineHeight: 1.55, marginBottom: 6 }}>
                  <strong style={{ color: T.text }}>{t('lessons.recs.whyMatches')}</strong> {r.whyThisMatches}
                </div>
              )}
              {r.howToNavigate && (
                <div style={{ fontSize: 12, color: T.textSoft, lineHeight: 1.55,
                  marginTop: 6, paddingTop: 6, borderTop: `1px solid ${T.borderSoft}` }}>
                  <strong style={{ color: T.sky }}>{t('lessons.recs.howToUse')}</strong> {r.howToNavigate}
                </div>
              )}
              {r.focusVocab?.length > 0 && (
                <div style={{ marginTop: 8, paddingTop: 8,
                  borderTop: `1px solid ${T.borderSoft}` }}>
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.16em',
                    textTransform: 'uppercase', color: T.textDim, marginBottom: 4 }}>
                    {t('lessons.recs.focusVocab')}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {r.focusVocab.map((w, j) => (
                      <span key={j} style={{ fontSize: 10, fontFamily: FONT.mono,
                        color: T.textSoft, padding: '2px 7px', borderRadius: 6,
                        background: isDay ? '#F3EEFE' : 'rgba(217,70,239,0.08)',
                        border: `1px solid ${T.borderSoft}` }}>{w}</span>
                    ))}
                  </div>
                </div>
              )}
            </a>
          )
        })}
      </div>
    </Glass>
  )
}

/* ============================================================================
   LessonSummaryOnion — bullets + collapsible deeper details
   ============================================================================ */
function LessonSummaryOnion({ summary, title, deeperLabel }) {
  const { T, mode } = useV3Theme()
  const isDay = mode === 'day'
  const { bullets, deepBullets } = useMemo(() => {
    const txt = String(summary || '').trim()
    if (!txt) return { bullets: [], deepBullets: [] }
    const paragraphs = txt.split(/\n\s*\n+/).map(p => p.trim()).filter(Boolean)
    let lightPart, deepPart
    if (paragraphs.length <= 1) {
      const sentences = txt.match(/[^.!?]+[.!?]+\s*/g) || [txt]
      lightPart = sentences.slice(0, 5).join(' ').trim()
      deepPart  = sentences.slice(5).join(' ').trim()
    } else {
      lightPart = paragraphs[0]
      deepPart  = paragraphs.slice(1).join('\n\n')
    }
    const toBullets = (text, max) => (text.match(/[^.!?]+[.!?]+/g) || [text])
      .map(s => s.trim().replace(/\s+/g, ' '))
      .filter(s => s.length > 4)
      .slice(0, max)
    return { bullets: toBullets(lightPart, 6), deepBullets: toBullets(deepPart, 14) }
  }, [summary])

  return (
    <div style={{ borderRadius: 18, padding: 22,
      background: isDay
        ? 'linear-gradient(135deg, rgba(240,249,255,0.5), #fff)'
        : 'linear-gradient(135deg, rgba(96,165,250,0.05), rgba(255,255,255,0.02))',
      border: `1px solid ${isDay ? 'rgba(191,219,254,0.6)' : 'rgba(96,165,250,0.18)'}` }}>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6,
        fontSize: 11, fontWeight: 700, letterSpacing: '0.2em',
        textTransform: 'uppercase', color: T.sky, marginBottom: 16 }}>
        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>auto_stories</span>
        {title}
      </div>
      {bullets.length > 0 ? (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 10 }}>
          {bullets.map((b, i) => (
            <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10,
              fontSize: 15, color: T.textSoft, lineHeight: 1.6 }}>
              <span style={{ marginTop: 8, width: 6, height: 6, borderRadius: '50%',
                background: G.brand, flexShrink: 0 }}/>
              <span style={{ flex: 1 }}>{b}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div style={{ fontSize: 15, color: T.textSoft, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
          {summary}
        </div>
      )}
      {deepBullets.length > 0 && (
        <details style={{ marginTop: 18 }}>
          <summary style={{
            cursor: 'pointer', listStyle: 'none',
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '8px 14px', borderRadius: 999,
            background: isDay
              ? 'linear-gradient(90deg, rgba(243,238,255,1), rgba(219,234,254,1))'
              : 'linear-gradient(90deg, rgba(139,92,246,0.12), rgba(96,165,250,0.12))',
            border: `1px solid ${isDay ? '#DDD6FE' : 'rgba(139,92,246,0.35)'}`,
            fontSize: 11, fontWeight: 700, letterSpacing: '0.14em',
            textTransform: 'uppercase', color: T.violet }}>
            <span className="material-symbols-outlined" style={{ fontSize: 15 }}>science</span>
            {deeperLabel}
          </summary>
          <div style={{ marginTop: 14, padding: '14px 18px', borderLeft: `3px solid ${T.violet}`,
            borderRadius: 10,
            background: isDay ? 'rgba(243,238,255,0.35)' : 'rgba(139,92,246,0.05)' }}>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 10 }}>
              {deepBullets.map((b, i) => (
                <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10,
                  fontSize: 14, color: T.textSoft, lineHeight: 1.6 }}>
                  <span style={{ marginTop: 8, width: 6, height: 6, borderRadius: '50%',
                    background: T.violet, flexShrink: 0 }}/>
                  <span style={{ flex: 1 }}>{b}</span>
                </li>
              ))}
            </ul>
          </div>
        </details>
      )}
    </div>
  )
}

/* ============================================================================
   LessonDetail — full per-lesson modal body
   ============================================================================ */
function LessonDetail({ lesson, onYouglish, focusKeyword, cameFromVocab, studentSlug, basePath }) {
  const { T, mode, isMobile } = useV3Theme()
  const isDay = mode === 'day'
  const { t } = useI18n()
  const navigate = useNavigate()
  const analysis = lesson.analysis
  const [keywordSearch, setKeywordSearch] = useState('')
  const [highlightKeyword, setHighlightKeyword] = useState(null)
  const [analysisOpen, setAnalysisOpen] = useState(false)
  const keywordRefs = useRef({})

  const filteredKeywords = useMemo(() => {
    const kws = lesson.keywords || []
    const q = keywordSearch.trim().toLowerCase()
    if (!q) return kws
    return kws.filter(k =>
      [k.word, k.translation, k.definition_en, k.example_en, k.ipa]
        .join(' ').toLowerCase().includes(q)
    )
  }, [lesson.keywords, keywordSearch])

  const metricCommentary = parseMetricCommentary(analysis || {})

  useEffect(() => {
    if (!focusKeyword) return
    const timer = setTimeout(() => {
      const el = keywordRefs.current[String(focusKeyword).toLowerCase()]
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        setHighlightKeyword(String(focusKeyword).toLowerCase())
        setTimeout(() => setHighlightKeyword(null), 3200)
      }
    }, 350)
    return () => clearTimeout(timer)
  }, [focusKeyword, lesson.id])

  const band = analysis?.cefrBand
  const overall = analysis?.overallScore

  return (
    <div style={{ display: 'grid', gap: 22 }}>
      {/* Floating back-to-vocab button */}
      {cameFromVocab && studentSlug && (
        <a href={`${basePath || ''}/${studentSlug}/vocabulary`}
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '12px 18px', borderRadius: 999, textDecoration: 'none',
            background: G.brand, color: '#fff',
            boxShadow: '0 14px 40px -12px rgba(217,70,239,0.55)',
            fontSize: 12, fontWeight: 700, letterSpacing: '0.14em',
            textTransform: 'uppercase' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 20 }}>arrow_back</span>
          <div style={{ textAlign: 'left', lineHeight: 1.2 }}>
            <div style={{ fontSize: 10, opacity: 0.85, letterSpacing: '0.2em' }}>
              {focusKeyword ? t('lessons.detail.viewingInContext', { kw: focusKeyword }) : t('lessons.detail.jumpedFromVocab')}
            </div>
            <div style={{ fontSize: 12 }}>{t('lessons.detail.backToVocab')}</div>
          </div>
          <span className="material-symbols-outlined" style={{ marginLeft: 'auto', fontSize: 20 }}>library_books</span>
        </a>
      )}

      {/* Header pill row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{
          padding: '5px 12px', borderRadius: 999, background: G.brand, color: '#fff',
          fontSize: 11, fontWeight: 700, letterSpacing: '0.14em',
          textTransform: 'uppercase' }}>
          {formatLongDate(lesson.date)}
        </span>
        {band && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              padding: '5px 10px', borderRadius: 999,
              background: CEFR_COLOR[band] || T.brand, color: '#fff',
              fontSize: 12, fontWeight: 700, letterSpacing: '0.1em',
              fontFamily: FONT.mono }}>{band}</span>
            {typeof overall === 'number' && (
              <span style={{
                fontFamily: FONT.display, fontSize: 20, fontWeight: 600,
                color: T.text }}>{Math.round(overall)}<span style={{ fontSize: 12, color: T.textDim }}>/100</span></span>
            )}
          </div>
        )}
      </div>

      {/* Vocabulary FIRST — the keywords (with TTS + YouGlish previews) are
          what a student revises; the full analysis follows on demand. */}
      {lesson.keywords?.length > 0 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6,
              fontSize: 11, fontWeight: 700, letterSpacing: '0.2em',
              textTransform: 'uppercase', color: T.violet }}>
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>translate</span>
              {t('lessons.detail.vocabHeading', { n: lesson.keywords.length })}
            </div>
            <input type="search" placeholder={t('lessons.detail.searchKeywords')}
              value={keywordSearch} onChange={(e) => setKeywordSearch(e.target.value)}
              style={{ width: 200, padding: '8px 12px', borderRadius: 10,
                background: isDay ? '#fff' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${T.border}`, color: T.text,
                fontSize: 12, outline: 'none' }}/>
          </div>
          <div style={{ fontSize: 11, color: T.textDim, fontStyle: 'italic', marginBottom: 10 }}>
            {t('lessons.detail.vocabHint')}
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            {filteredKeywords.map((kw, i) => {
              const wordKey = String(kw.word || '').toLowerCase()
              const isFocused = highlightKeyword === wordKey
              const isTarget = String(focusKeyword || '').toLowerCase() === wordKey
              return (
                <div key={`${kw.word}-${i}`}
                  ref={el => { if (el) keywordRefs.current[wordKey] = el }}
                  style={isFocused ? {
                    borderRadius: 18,
                    boxShadow: `0 0 0 3px ${T.brandInk || T.brand}, ${T.shadow}`,
                    transition: 'box-shadow 400ms ease' } : undefined}>
                  <KeywordCard
                    keyword={{
                      ...kw,
                      definition: kw.definition_en || kw.definition_pl,
                      definitionPl: kw.definition_pl,
                      example: kw.example_en || kw.example_pl,
                      cefr_level: kw.cefr_level,
                    }}
                    onYouglish={onYouglish}
                    forceExpanded={isTarget}/>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Full analysis — every score, comment and drill lives behind this one
          disclosure so the lesson opens calm and keyword-first. */}
      {analysis && (
        <button type="button" onClick={() => setAnalysisOpen(o => !o)}
          aria-expanded={analysisOpen}
          style={{ width: '100%', textAlign: 'left', cursor: 'pointer',
            background: isDay ? '#fff' : 'rgba(255,255,255,0.03)',
            border: `1px solid ${T.border}`, borderRadius: 16,
            padding: '14px 18px', color: T.text,
            display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="material-symbols-outlined"
            style={{ fontSize: 20, color: T.brand }}>analytics</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.16em',
              textTransform: 'uppercase' }}>{t('lessons.detail.fullAnalysis')}</div>
            <div style={{ fontSize: 11, color: T.textDim, marginTop: 2 }}>
              {t('lessons.detail.fullAnalysisHint')}
            </div>
          </div>
          {typeof overall === 'number' && (
            <span style={{ fontFamily: FONT.display, fontSize: 22, fontWeight: 600,
              color: T.text }}>{Math.round(overall)}
              <span style={{ fontSize: 11, color: T.textDim }}>/100</span></span>
          )}
          <span className="material-symbols-outlined"
            style={{ fontSize: 22, color: T.textDim,
              transform: analysisOpen ? 'rotate(180deg)' : 'none',
              transition: 'transform 220ms ease' }}>expand_more</span>
        </button>
      )}

      {analysisOpen && (<>
      {/* Topics chips */}
      {lesson.topics?.length > 0 && (
        <div>
          <SectionLabel T={T}>{t('lessons.detail.topicsCovered')}</SectionLabel>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {lesson.topics.map((tp, i) => (
              <span key={i} style={{
                padding: '4px 10px', borderRadius: 999,
                background: isDay ? '#F3EEFE' : 'rgba(139,92,246,0.10)',
                border: `1px solid ${isDay ? '#E6DDFB' : 'rgba(139,92,246,0.25)'}`,
                fontSize: 12, color: T.violet }}>{tp}</span>
            ))}
          </div>
        </div>
      )}

      {lesson.materials?.some(materialHref) && (
        <Glass padding={18}>
          <SectionLabel T={T} icon="attachment" tone="sky">Published materials</SectionLabel>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {lesson.materials.filter(materialHref).map((m, i) => (
              <a
                key={`${m.url}-${i}`}
                href={materialHref(m)}
                target="_blank"
                rel="noopener"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 7,
                  padding: '8px 12px',
                  borderRadius: 999,
                  textDecoration: 'none',
                  background: isDay ? '#EFF6FF' : 'rgba(96,165,250,0.10)',
                  border: `1px solid ${isDay ? '#BFDBFE' : 'rgba(96,165,250,0.28)'}`,
                  color: T.sky,
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{materialIcon(m.type)}</span>
                {m.name || 'Lesson material'}
              </a>
            ))}
          </div>
        </Glass>
      )}

      {/* Per-metric mini score cards */}
      {analysis && (
        <div style={{ display: 'grid', gap: 8,
          gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(5, 1fr)' }}>
          {METRICS.map(m => {
            const val = analysis[m.key] || 0
            const tier = scoreToTier(val)
            const commentary = metricCommentary?.[m.key]
            const tierTextColor =
              val >= 85 ? T.emerald
              : val >= 70 ? T.sky
              : val >= 55 ? T.amber
              : T.rose
            return (
              <div key={m.key} style={{
                padding: '12px 14px', borderRadius: 14,
                background: isDay ? '#fff' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${T.border}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 14, color: m.hue.stroke }}>
                    {m.icon}
                  </span>
                  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em',
                    textTransform: 'uppercase', color: T.textSoft,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {m.shortLabel}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{ fontFamily: FONT.display, fontSize: 22, fontWeight: 600,
                    color: T.text, letterSpacing: '-0.02em',
                    fontVariantNumeric: 'tabular-nums' }}>{Math.round(val)}</span>
                  <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
                    textTransform: 'uppercase', color: tierTextColor }}>{tier.label}</span>
                </div>
                <div style={{ marginTop: 6, height: 4, borderRadius: 4, overflow: 'hidden',
                  background: isDay ? '#F3F4F6' : 'rgba(255,255,255,0.06)' }}>
                  <div style={{ height: '100%', borderRadius: 4,
                    width: `${val}%`, transition: 'width 900ms ease-out',
                    background: m.hue.stroke }}/>
                </div>
                {commentary && (
                  <div style={{ marginTop: 8, fontSize: 10, color: T.textDim, fontStyle: 'italic',
                    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                    overflow: 'hidden', lineHeight: 1.4 }}>
                    {commentary.slice(0, 90)}...
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Lesson summary onion */}
      {analysis?.lessonSummary && (
        <LessonSummaryOnion
          summary={analysis.lessonSummary}
          title={t('lessons.detail.summaryHeading')}
          deeperLabel={t('dashboard.summary.technical')}/>
      )}

      {/* Strengths */}
      {analysis?.strengths?.length > 0 && (
        <Glass padding={20}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: T.emerald }}>celebration</span>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.22em',
              textTransform: 'uppercase', color: T.emerald }}>
              {t('lessons.detail.strengthsHeading')}
            </span>
            <span style={{ fontSize: 10, color: T.textDim, fontWeight: 400, textTransform: 'none',
              letterSpacing: 'normal' }}>
              {t('lessons.detail.strengthsHint')}
            </span>
          </div>
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr' }}>
            {analysis.strengths.filter(Boolean).map((s, i) => (
              <div key={i} style={{
                padding: 14, borderRadius: 12,
                background: isDay ? '#F0FDF4' : 'rgba(52,211,153,0.06)',
                border: `1px solid ${isDay ? '#BBF7D0' : 'rgba(52,211,153,0.25)'}`,
                borderLeft: `3px solid ${T.emerald}`,
                display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <span style={{ width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                  background: isDay ? '#fff' : 'rgba(52,211,153,0.15)',
                  border: `1px solid ${T.emerald}`, color: T.emerald,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>check_circle</span>
                </span>
                <div style={{ fontSize: 13, color: T.textSoft, lineHeight: 1.55 }}>
                  {typeof s === 'string' ? s : String(s?.text || '')}
                </div>
              </div>
            ))}
          </div>
        </Glass>
      )}

      {/* Improvements — clickable */}
      {analysis?.improvements?.length > 0 && (
        <Glass padding={20}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: T.amber }}>rocket_launch</span>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.22em',
              textTransform: 'uppercase', color: T.amber }}>
              {t('lessons.detail.improvementsHeading')}
            </span>
            <span style={{ fontSize: 10, color: T.textDim, fontWeight: 400, textTransform: 'none',
              letterSpacing: 'normal' }}>
              {t('lessons.detail.improvementsHint')}
            </span>
          </div>
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr' }}>
            {analysis.improvements.filter(Boolean).map((s, i) => {
              const txt = typeof s === 'string' ? s : JSON.stringify(s)
              return (
                <button key={i} type="button"
                  onClick={(e) => {
                    e.preventDefault(); e.stopPropagation()
                    const slug = studentSlug || 'szymon-karpinski'
                    navigate(`${basePath || ''}/${slug}/practice?focus=${encodeURIComponent(txt.slice(0, 80))}`)
                  }}
                  style={{
                    textAlign: 'left', padding: 14, borderRadius: 12, cursor: 'pointer',
                    background: isDay ? '#FFFBEB' : 'rgba(252,211,77,0.06)',
                    border: `1px solid ${isDay ? '#FDE68A' : 'rgba(252,211,77,0.25)'}`,
                    borderLeft: `3px solid ${T.amber}`,
                    display: 'flex', alignItems: 'flex-start', gap: 10, flexDirection: 'column',
                    transition: `all 200ms ${EASE.springFast}` }}
                  onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = T.shadow }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <span style={{ width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                      background: isDay ? '#fff' : 'rgba(252,211,77,0.15)',
                      border: `1px solid ${T.amber}`, color: T.amber,
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 14 }}>trending_up</span>
                    </span>
                    <div style={{ fontSize: 13, color: T.textSoft, lineHeight: 1.55 }}>
                      {typeof s === 'string' ? s : JSON.stringify(s)}
                    </div>
                  </div>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4,
                    fontSize: 10, fontWeight: 700, letterSpacing: '0.14em',
                    textTransform: 'uppercase', color: T.amber }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 12 }}>play_arrow</span>
                    {t('lessons.detail.practiceThis')}
                  </span>
                </button>
              )
            })}
          </div>
        </Glass>
      )}

      {/* Key errors — clickable */}
      {analysis?.keyErrors?.length > 0 && (
        <Glass padding={20}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: T.rose }}>flag_circle</span>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.22em',
              textTransform: 'uppercase', color: T.rose }}>
              {t('lessons.detail.errorsHeading')}
            </span>
            <span style={{ fontSize: 10, color: T.textDim, fontWeight: 400, textTransform: 'none',
              letterSpacing: 'normal' }}>
              {t('lessons.detail.errorsHint')}
            </span>
          </div>
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr' }}>
            {analysis.keyErrors.map((err, i) => (
              <button key={i} type="button"
                onClick={(e) => {
                  e.preventDefault(); e.stopPropagation()
                  const cat = (err.category || 'grammar').toLowerCase()
                  const slug = studentSlug || 'szymon-karpinski'
                  navigate(`${basePath || ''}/${slug}/practice?category=${encodeURIComponent(cat)}&error=${encodeURIComponent(String(err.error || '').slice(0, 80))}`)
                }}
                style={{
                  textAlign: 'left', padding: 14, borderRadius: 12, cursor: 'pointer',
                  background: isDay ? '#FEF2F2' : 'rgba(251,113,133,0.06)',
                  border: `1px solid ${isDay ? '#FECACA' : 'rgba(251,113,133,0.25)'}`,
                  borderLeft: `3px solid ${T.rose}`,
                  display: 'flex', flexDirection: 'column', gap: 6,
                  transition: `all 200ms ${EASE.springFast}` }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = T.shadow }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ fontFamily: FONT.mono, fontSize: 12, fontStyle: 'italic',
                    color: T.rose, lineHeight: 1.5, flex: 1 }}>"{err.error}"</div>
                  {err.category && (
                    <span style={{ flexShrink: 0, padding: '2px 7px', borderRadius: 999,
                      background: isDay ? '#FEE2E2' : 'rgba(251,113,133,0.15)',
                      border: `1px solid ${isDay ? '#FECACA' : 'rgba(251,113,133,0.3)'}`,
                      fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
                      textTransform: 'uppercase', color: T.rose }}>{err.category}</span>
                  )}
                </div>
                {err.correction && (
                  <div style={{ fontSize: 12, color: T.emerald, lineHeight: 1.5 }}>
                    <strong>→</strong> {err.correction}
                  </div>
                )}
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4,
                  fontSize: 10, fontWeight: 700, letterSpacing: '0.14em',
                  textTransform: 'uppercase', color: T.rose, marginTop: 2 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 12 }}>play_arrow</span>
                  {t('lessons.detail.drillThis')}
                </span>
              </button>
            ))}
          </div>
        </Glass>
      )}

      {/* Practice advice cards */}
      {analysis?.practiceAdvice?.length > 0 && (
        <Glass padding={20}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: T.sky }}>tips_and_updates</span>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.22em',
              textTransform: 'uppercase', color: T.sky }}>
              {t('lessons.detail.adviceHeading')}
            </span>
            <span style={{ fontSize: 10, color: T.textDim, fontWeight: 400, textTransform: 'none',
              letterSpacing: 'normal' }}>
              {t('lessons.detail.adviceHint')}
            </span>
          </div>
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr' }}>
            {analysis.practiceAdvice.map((p, i) => {
              const adviceText = typeof p === 'string' ? p : String(p || '')
              const slugStr = studentSlug || 'szymon-karpinski'
              const link = classifyAdviceLink(adviceText, slugStr, basePath)
              return (
                <button key={i} type="button"
                  onClick={(e) => {
                    e.preventDefault(); e.stopPropagation()
                    if (link) navigate(link.url)
                    else navigate(`${basePath || ''}/${slugStr}/practice?advice=${encodeURIComponent(adviceText.slice(0, 200))}`)
                  }}
                  style={{
                    textAlign: 'left', padding: 14, borderRadius: 12, cursor: 'pointer',
                    background: isDay ? '#EFF6FF' : 'rgba(96,165,250,0.06)',
                    border: `1px solid ${isDay ? '#BFDBFE' : 'rgba(96,165,250,0.22)'}`,
                    display: 'flex', flexDirection: 'column', gap: 6,
                    transition: `all 200ms ${EASE.springFast}`,
                    position: 'relative' }}
                  onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = T.shadow }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <span style={{
                      fontFamily: FONT.display, fontSize: 20, fontWeight: 700,
                      color: T.sky, lineHeight: 1, width: 28, flexShrink: 0 }}>{i + 1}</span>
                    <div style={{ fontSize: 13, color: T.textSoft, lineHeight: 1.55 }}>{adviceText}</div>
                  </div>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4,
                    fontSize: 10, fontWeight: 700, letterSpacing: '0.14em',
                    textTransform: 'uppercase', color: T.sky, marginTop: 4 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 12 }}>{link ? 'arrow_forward' : 'edit_note'}</span>
                    {link ? link.label : t('lessons.detail.openFreewrite')}
                  </span>
                </button>
              )
            })}
          </div>
        </Glass>
      )}

      {/* Personalized recommendations */}
      {(() => {
        const recs = parsePersonalizedRecs(analysis || {})
        if (!recs) return null
        return <PersonalizedRecommendationsBlock recs={recs}/>
      })()}
      </>)}
    </div>
  )
}

/* ============================================================================
   LessonDetailModal — full-height modal wrapper
   ============================================================================ */
function LessonDetailModal({ lesson, onClose, onYouglish, focusKeyword, cameFromVocab, studentSlug, basePath }) {
  const { T, mode, isMobile } = useV3Theme()
  const isDay = mode === 'day'
  const { t } = useI18n()

  useEffect(() => {
    const h = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', h); document.body.style.overflow = prev }
  }, [onClose])

  if (!lesson) return null
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: isMobile ? 0 : 16 }}>
      <div onClick={onClose} style={{
        position: 'absolute', inset: 0,
        background: isDay ? 'rgba(16,10,40,0.45)' : 'rgba(6,4,16,0.75)',
        backdropFilter: 'blur(8px)' }}/>
      <div style={{
        position: 'relative', width: '100%', maxWidth: 1080,
        maxHeight: isMobile ? '100vh' : '90vh',
        borderRadius: isMobile ? 0 : 24,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        background: isDay ? '#FDFCFF' : '#0A0718',
        border: `1px solid ${T.border}`,
        boxShadow: T.shadow }}>
        {/* Header */}
        <div style={{ padding: isMobile ? '18px 20px 14px' : '24px 28px 18px',
          borderBottom: `1px solid ${T.border}`,
          background: isDay
            ? 'linear-gradient(180deg, rgba(243,238,255,0.6), rgba(253,252,255,0))'
            : 'linear-gradient(180deg, rgba(139,92,246,0.15), rgba(139,92,246,0))',
          position: 'relative' }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.24em',
            textTransform: 'uppercase', color: T.brandInk || T.brand, marginBottom: 6 }}>
            {t('lessons.modalDefaultTitle')}
          </div>
          <h2 style={{ fontFamily: FONT.display, fontSize: isMobile ? 22 : 28,
            fontWeight: 600, letterSpacing: '-0.02em', margin: 0, lineHeight: 1.2,
            color: T.text, paddingRight: 44 }}>{lesson.title}</h2>
          <button type="button" onClick={onClose} aria-label="Close"
            style={{ position: 'absolute', top: isMobile ? 14 : 18, right: isMobile ? 14 : 18,
              width: 36, height: 36, borderRadius: 10, border: 'none',
              background: isDay ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.05)',
              color: T.textSoft, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto',
          padding: isMobile ? '18px 20px 28px' : '24px 28px 36px' }}>
          <LessonDetail
            lesson={lesson}
            onYouglish={onYouglish}
            focusKeyword={focusKeyword}
            cameFromVocab={cameFromVocab}
            studentSlug={studentSlug}
            basePath={basePath}/>
        </div>
      </div>
    </div>
  )
}

/* ============================================================================
   Lesson card (list item)
   ============================================================================ */
function LessonCard({ lesson, analysis, pdfUrl, onOpen, onTopicClick, topicFilter, profile }) {
  const { T, mode, isMobile } = useV3Theme()
  const isDay = mode === 'day'
  const { t } = useI18n()
  const [hov, setHov] = useState(false)

  // Preview feature flag — scoped to Aleksandra's BYD Bridge L3/L4
  const previewMap = {
    '2026-04-27': '/lesson-previews/byd-bridge-l3.html',
    '2026-04-28': '/lesson-previews/byd-bridge-l4.html',
    'IND-AG-27042026': '/lesson-previews/byd-bridge-l3.html',
    'IND-AG-28042026': '/lesson-previews/byd-bridge-l4.html',
  }
  const previewUrl = previewMap[lesson.date] || previewMap[lesson.title]

  // Upcoming lesson — Convex `status === "planned"` is canonical, but also
  // treat any future-dated row without an analysis as upcoming so the styling
  // works even before the status field flips. Whole card is desaturated; only
  // the Preview Lesson button stays at full opacity and clickable.
  const todayIso = new Date().toISOString().slice(0, 10)
  const dateIsFuture = typeof lesson.date === 'string' && lesson.date > todayIso
  const isUpcoming = lesson.status === 'planned' || (dateIsFuture && !analysis)

  const band = analysis?.cefrBand
  const overall = analysis?.overallScore
  const keywordCount = lesson.keywordCount || lesson.keyword_count || lesson.keywords?.length || 0

  return (
    <article id={`lesson-card-${lesson.id}`}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        position: 'relative', borderRadius: 22,
        background: isDay ? '#fff' : 'rgba(255,255,255,0.04)',
        backdropFilter: 'blur(14px)',
        border: `1px solid ${hov ? (isDay ? 'rgba(162,28,175,0.35)' : 'rgba(217,70,239,0.35)') : T.border}`,
        overflow: 'hidden', scrollMarginTop: 120,
        transition: `all 240ms ${EASE.springFast}`,
        transform: hov ? 'translateY(-2px)' : 'none',
        boxShadow: hov ? T.shadow : T.shadowSm,
      }}>
      {/* Upcoming-state overlay — full grey wash + grayscale on the card body.
          Preview Lesson button gets pulled above this overlay so it stays
          fully clickable and on-brand. */}
      {isUpcoming && (
        <div aria-hidden style={{
          position: 'absolute', inset: 0,
          background: isDay ? 'rgba(247,245,252,0.55)' : 'rgba(8,4,16,0.55)',
          backdropFilter: 'grayscale(0.85)',
          WebkitBackdropFilter: 'grayscale(0.85)',
          zIndex: 1,
          pointerEvents: 'none',
        }}/>
      )}
      {/* Gradient top band */}
      <div style={{ background: G.brand, padding: '10px 18px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="material-symbols-outlined" style={{ color: '#fff', fontSize: 16 }}>event</span>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.18em',
            textTransform: 'uppercase', color: '#fff' }}>
            {formatDate(lesson.date)}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {band && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '3px 10px', borderRadius: 999,
              background: 'rgba(255,255,255,0.95)', color: T.brand,
              fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
              textTransform: 'uppercase' }}>
              {band}{typeof overall === 'number' ? ` ${Math.round(overall)}` : ''}
            </span>
          )}
          <span style={{ padding: '2px 8px', borderRadius: 999,
            background: 'rgba(255,255,255,0.2)', color: '#fff',
            fontSize: 10, fontWeight: 700, letterSpacing: '0.08em' }}>
            {t('lessons.wordsCount', { n: keywordCount })}
          </span>
        </div>
      </div>

      {/* Body (clickable) */}
      <button type="button" onClick={onOpen}
        style={{ display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
          background: 'transparent', border: 'none', padding: '16px 20px', color: T.text }}>
        <h3 style={{ fontFamily: FONT.display, fontSize: isMobile ? 20 : 22, fontWeight: 600,
          letterSpacing: '-0.01em', margin: 0, lineHeight: 1.25, color: T.text }}>
          {lesson.title}
        </h3>
        {lesson.topics?.length > 0 && (
          <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 5 }}
            onClick={(e) => e.stopPropagation()}>
            {lesson.topics.slice(0, 8).map((tp, i) => (
              <button key={i} type="button"
                onClick={(e) => { e.stopPropagation(); onTopicClick(tp) }}
                style={{
                  padding: '3px 10px', borderRadius: 999, cursor: 'pointer',
                  background: topicFilter === tp ? G.brand : (isDay ? '#F3EEFE' : 'rgba(139,92,246,0.10)'),
                  color: topicFilter === tp ? '#fff' : T.violet,
                  border: `1px solid ${topicFilter === tp ? 'transparent' : (isDay ? '#E6DDFB' : 'rgba(139,92,246,0.25)')}`,
                  fontSize: 11, fontFamily: FONT.mono, fontWeight: 500,
                  letterSpacing: '0.04em',
                  transition: `all 160ms ${EASE.springFast}` }}>
                {tp}
              </button>
            ))}
          </div>
        )}
        {analysis?.lessonSummary && (
          <p style={{ marginTop: 12, fontSize: 13, color: T.textDim, lineHeight: 1.6,
            display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical',
            overflow: 'hidden' }}>
            {analysis.lessonSummary.slice(0, 280)}{analysis.lessonSummary.length > 280 ? '…' : ''}
          </p>
        )}
      </button>

      {/* Action bar */}
      <div style={{
        padding: '10px 20px',
        borderTop: `1px solid ${T.borderSoft}`,
        background: isDay ? 'rgba(247,245,252,0.6)' : 'rgba(0,0,0,0.18)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 8, flexWrap: 'wrap' }}>
        <Btn variant="primary" size="sm" icon="menu_book" onClick={onOpen}>
          {t('lessons.openLesson')}
        </Btn>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {previewUrl && (
            <a href={previewUrl} target="_blank" rel="noopener"
              onClick={(e) => e.stopPropagation()}
              title="Interactive lesson preview"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '6px 12px', borderRadius: 999, textDecoration: 'none',
                background: G.brand, color: '#fff',
                fontSize: 10, fontWeight: 700, letterSpacing: '0.14em',
                textTransform: 'uppercase',
                boxShadow: '0 6px 18px -8px rgba(217,70,239,0.55)',
                // Preview is the ONE escape hatch on a greyed-out upcoming
                // card — pull it above the overlay and keep it on-brand.
                position: 'relative', zIndex: 2,
                filter: isUpcoming ? 'saturate(1.2) brightness(1.05)' : 'none' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>auto_awesome</span>
              Preview lesson
            </a>
          )}
          {pdfUrl && (
            <a href={pdfUrl} target="_blank" rel="noopener"
              onClick={(e) => e.stopPropagation()}
              title={t('lessons.rawNotesTitle')}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '5px 11px', borderRadius: 999, textDecoration: 'none',
                background: isDay ? '#fff' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${T.border}`, color: T.textSoft,
                fontSize: 10, fontWeight: 700, letterSpacing: '0.14em',
                textTransform: 'uppercase' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>description</span>
              {t('lessons.rawNotes')}
            </a>
          )}
          {analysis && (
            <button type="button"
              onClick={(e) => { e.stopPropagation(); generateLessonPdf(profile, lesson, analysis) }}
              title={t('lessons.analysisPdfTitle')}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer',
                padding: '5px 11px', borderRadius: 999,
                background: isDay ? '#fff' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${T.border}`, color: T.textSoft,
                fontSize: 10, fontWeight: 700, letterSpacing: '0.14em',
                textTransform: 'uppercase' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>picture_as_pdf</span>
              {t('lessons.analysisPdf')}
            </button>
          )}
        </div>
      </div>
    </article>
  )
}

/* ============================================================================
   CompactLessonRow — one calm line per older lesson. The latest lesson keeps
   the rich card; history stays scannable instead of a 12,000px wall.
   ============================================================================ */
function CompactLessonRow({ lesson, analysis, onOpen }) {
  const { T, mode, isMobile } = useV3Theme()
  const isDay = mode === 'day'
  const { t } = useI18n()
  const [hov, setHov] = useState(false)
  const band = analysis?.cefrBand
  const overall = analysis?.overallScore
  const keywordCount = lesson.keyword_count || lesson.keywords?.length || 0
  return (
    <button type="button" onClick={onOpen}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        width: '100%', textAlign: 'left', cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: isMobile ? 10 : 16,
        padding: isMobile ? '12px 14px' : '13px 18px', borderRadius: 16,
        background: isDay ? '#fff' : 'rgba(255,255,255,0.03)',
        border: `1px solid ${hov ? (isDay ? 'rgba(162,28,175,0.35)' : 'rgba(217,70,239,0.35)') : T.border}`,
        color: T.text, transition: `all 200ms ${EASE.springFast}`,
        transform: hov ? 'translateY(-1px)' : 'none',
        boxShadow: hov ? T.shadowSm : 'none' }}>
      <span style={{ fontFamily: FONT.mono, fontSize: 11, color: T.textDim,
        letterSpacing: '0.06em', flexShrink: 0, width: isMobile ? 74 : 92 }}>
        {formatDate(lesson.date)}
      </span>
      <span style={{ fontFamily: FONT.display, fontSize: isMobile ? 14 : 15.5, fontWeight: 600,
        letterSpacing: '-0.01em', lineHeight: 1.3, flex: 1, minWidth: 0,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {lesson.title}
      </span>
      {!isMobile && keywordCount > 0 && (
        <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
          color: T.violet, padding: '3px 9px', borderRadius: 999,
          background: isDay ? '#F3EEFE' : 'rgba(139,92,246,0.10)',
          border: `1px solid ${isDay ? '#E6DDFB' : 'rgba(139,92,246,0.25)'}` }}>
          {t('lessons.kwAbbrev', { n: keywordCount })}
        </span>
      )}
      {band && (
        <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 700,
          letterSpacing: '0.1em', fontFamily: FONT.mono, color: '#fff',
          padding: '3px 8px', borderRadius: 999,
          background: CEFR_COLOR[band] || T.brand }}>
          {band}{typeof overall === 'number' ? ` ${Math.round(overall)}` : ''}
        </span>
      )}
      <span className="material-symbols-outlined"
        style={{ fontSize: 18, color: hov ? T.brand : T.textDim, flexShrink: 0 }}>
        chevron_right
      </span>
    </button>
  )
}

/* ============================================================================
   Main Lessons view
   ============================================================================ */
export default function LessonsV3({ data, slug, basePath = '' }) {
  const { T, mode, isMobile } = useV3Theme()
  const isDay = mode === 'day'
  const { t } = useI18n()
  const [selectedLesson, setSelectedLesson] = useState(null)
  const [lessonFilter, setLessonFilter] = useState('')
  const [youglishWord, setYouglishWord] = useState(null)
  const [pdfMap, setPdfMap] = useState({})
  const [focusKeyword, setFocusKeyword] = useState(null)
  const [cameFromVocab, setCameFromVocab] = useState(false)
  const [topicFilter, setTopicFilter] = useState(null)

  const lessons = data?.lessons || []
  const profile = data?.profile || {}
  const studentSlug = slug || profile.slug

  useEffect(() => {
    let cancelled = false
    // 30s timeout + 5-min cache: lesson-pdfs.json is a small static index;
    // re-mounting the Lessons view shouldn't re-pull it.
    fetchJSONCached('/lesson-pdfs.json', { cacheKey: 'lesson-pdfs' })
      .then(d => { if (!cancelled) setPdfMap(d || {}) })
      .catch(() => { if (!cancelled) setPdfMap({}) })
    return () => { cancelled = true }
  }, [])

  const allTopics = useMemo(() => {
    const set = new Set()
    for (const l of lessons) (l.topics || []).forEach(tp => set.add(tp))
    return [...set].filter(Boolean).sort()
  }, [lessons])

  // Deep-link query-param handling
  useEffect(() => {
    if (!lessons.length) return
    const params = new URLSearchParams(window.location.search)
    const openLessonId = params.get('openLesson') || params.get('lessonId')
    const focusKw = params.get('focusKeyword')
    const from = params.get('from')
    if (openLessonId) {
      const lesson = lessons.find(l =>
        String(l.id) === openLessonId ||
        String(l.date) === openLessonId ||
        String(l.analysis?._id || '') === openLessonId ||
        String(l.analysis?.id || '') === openLessonId
      )
      if (lesson) {
        setSelectedLesson(lesson)
        setCameFromVocab(from === 'vocabulary')
        if (focusKw) setFocusKeyword(focusKw)
      }
    }
  }, [lessons])

  const filteredLessons = useMemo(() => {
    const q = lessonFilter.trim().toLowerCase()
    return lessons.filter(l => {
      if (q && !([l.title, l.date, l.topic, ...(l.topics || [])].join(' ').toLowerCase().includes(q))) return false
      if (topicFilter && !(l.topics || []).includes(topicFilter)) return false
      return true
    })
  }, [lessons, lessonFilter, topicFilter])

  // Split filtered lessons into upcoming (status=planned OR future date with no
  // analysis) and completed. Upcoming lessons render under a collapsible
  // "Upcoming Lessons (N)" dropdown — minimised by default per Mike's
  // 2026-05-04 directive — so they don't dominate the lessons feed once the
  // queue grows beyond a few weeks.
  const upcomingLessons = useMemo(() => {
    const today = new Date(); today.setHours(0,0,0,0)
    return filteredLessons.filter(l => {
      if ((l.status || '') === 'planned') return true
      if (l.analysis) return false
      if (!l.date) return false
      const d = new Date(l.date); if (isNaN(d.getTime())) return false
      return d >= today
    })
  }, [filteredLessons])
  const completedLessons = useMemo(
    () => filteredLessons.filter(l => !upcomingLessons.includes(l)),
    [filteredLessons, upcomingLessons]
  )

  const [upcomingOpen, setUpcomingOpen] = useState(() => {
    try { return localStorage.getItem('em.lessons.upcomingOpen') === '1' } catch { return false }
  })
  useEffect(() => {
    try { localStorage.setItem('em.lessons.upcomingOpen', upcomingOpen ? '1' : '0') } catch {}
  }, [upcomingOpen])

  return (
    <div style={{ maxWidth: 1320, margin: '0 auto',
      padding: isMobile ? '24px 18px 80px' : '40px 32px 80px' }}>
      {/* Hero */}
      <Glass padding={isMobile ? 22 : 28} style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
          gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.28em',
              textTransform: 'uppercase', color: T.brandInk || T.brand, marginBottom: 8 }}>
              {t('lessons.hero.kicker')}
            </div>
            <h1 style={{ fontFamily: FONT.display,
              fontSize: isMobile ? 28 : 38, fontWeight: 600,
              letterSpacing: '-0.03em', margin: 0, lineHeight: 1.1, color: T.text }}>
              {t('lessons.hero.title')}
            </h1>
            <p style={{ marginTop: 10, fontSize: 14, color: T.textDim, lineHeight: 1.55, maxWidth: 640 }}>
              {t('lessons.hero.intro')}
            </p>
          </div>
          <div style={{ flexShrink: 0, padding: '10px 16px', borderRadius: 14,
            background: isDay ? '#fff' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${T.border}`, textAlign: 'center', minWidth: 88 }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.18em',
              textTransform: 'uppercase', color: T.textDim }}>
              {t('lessons.hero.statLabel')}
            </div>
            <div style={{ fontFamily: FONT.display, fontSize: 22, fontWeight: 600,
              color: T.text, marginTop: 2 }}>{lessons.length}</div>
          </div>
        </div>
        <input type="search" placeholder={t('lessons.searchPlaceholder')}
          value={lessonFilter} onChange={(e) => setLessonFilter(e.target.value)}
          style={{
            marginTop: 16, width: '100%', padding: '12px 16px', borderRadius: 14,
            background: isDay ? '#fff' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${T.border}`, color: T.text,
            fontSize: 14, fontFamily: FONT.body, outline: 'none',
            boxSizing: 'border-box' }}/>
        {allTopics.length > 0 && (
          <TopicFilterStrip
            topics={allTopics}
            value={topicFilter}
            onChange={setTopicFilter}
            label={t('lessons.filterByTopic')}
            allLabel={t('lessons.allTopics')}/>
        )}
      </Glass>

      {/* Horizontal navigator — completed lessons only.
          Upcoming sit inside the collapsible block below. */}
      <HorizontalLessonNavigator lessons={completedLessons}/>

      {/* Upcoming Lessons — collapsible, minimised by default */}
      {upcomingLessons.length > 0 && (
        <div style={{
          marginBottom: 14,
          borderRadius: 18,
          border: `1px solid ${isDay ? '#DDD6FE' : 'rgba(139,92,246,0.30)'}`,
          background: isDay
            ? 'linear-gradient(135deg, rgba(245,243,255,0.85), rgba(255,255,255,0.65))'
            : 'linear-gradient(135deg, rgba(76,29,149,0.10), rgba(15,23,42,0.30))',
          overflow: 'hidden',
        }}>
          <button
            type="button"
            onClick={() => setUpcomingOpen(o => !o)}
            aria-expanded={upcomingOpen}
            style={{
              width: '100%',
              padding: '14px 18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'inherit',
              fontFamily: 'inherit',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 20, color: T.violet || '#A78BFA' }}>event_upcoming</span>
              <span style={{
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: T.violet || '#A78BFA',
              }}>
                {t('lessons.upcoming.heading', { defaultValue: 'Upcoming Lessons' })} ({upcomingLessons.length})
              </span>
            </div>
            <span
              className="material-symbols-outlined"
              style={{
                fontSize: 22,
                color: T.violet || '#A78BFA',
                transform: upcomingOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 200ms ease',
              }}
            >
              expand_more
            </span>
          </button>
          {upcomingOpen && (
            <div style={{ padding: '4px 18px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {upcomingLessons.map(lesson => {
                const keywordCount = lesson.keywordCount || lesson.keyword_count || lesson.keywords?.length || 0
                return (
                  <button
                    key={lesson.id}
                    type="button"
                    onClick={() => setSelectedLesson(lesson)}
                    style={{
                      width: '100%',
                      padding: '12px 14px',
                      borderRadius: 12,
                      border: `1px solid ${isDay ? '#E9D5FF' : 'rgba(139,92,246,0.25)'}`,
                      background: isDay ? 'rgba(255,255,255,0.65)' : 'rgba(255,255,255,0.04)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                      filter: 'grayscale(0.25)',
                      opacity: 0.92,
                      cursor: 'pointer',
                      color: 'inherit',
                      fontFamily: 'inherit',
                      textAlign: 'left',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 18, color: T.violet || '#A78BFA', flexShrink: 0 }}>schedule</span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{
                          fontSize: 10,
                          fontWeight: 700,
                          letterSpacing: '0.16em',
                          textTransform: 'uppercase',
                          color: T.violet || '#A78BFA',
                        }}>
                          {formatDate(lesson.date)}
                        </div>
                        <div style={{
                          fontSize: 14,
                          fontWeight: 600,
                          color: T.text,
                          lineHeight: 1.3,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}>
                          {lesson.title}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      <span style={{
                        fontSize: 9,
                        fontWeight: 700,
                        letterSpacing: '0.12em',
                        textTransform: 'uppercase',
                        color: T.violet || '#A78BFA',
                      }}>
                        {t('lessons.wordsCount', { n: keywordCount })}
                      </span>
                      <span style={{
                        fontSize: 9,
                        fontWeight: 700,
                        letterSpacing: '0.18em',
                        textTransform: 'uppercase',
                        color: T.violet || '#A78BFA',
                      }}>
                        {t('lessons.upcoming.tag', { defaultValue: 'Upcoming' })}
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Lesson cards — the latest lesson keeps its rich card; every earlier
          lesson is one compact row (full detail one click away). */}
      <div style={{ display: 'grid', gap: 14 }}>
        {completedLessons.length ? completedLessons.map((lesson, idx) => {
          const analysis = lesson.analysis
          const pdf = (pdfMap[studentSlug || ''] || []).find(p => p.date === lesson.date)
          if (idx === 0) {
            return (
              <LessonCard
                key={lesson.id}
                lesson={lesson}
                analysis={analysis}
                pdfUrl={pdf?.url}
                onOpen={() => setSelectedLesson(lesson)}
                onTopicClick={(tp) => setTopicFilter(topicFilter === tp ? null : tp)}
                topicFilter={topicFilter}
                profile={profile}/>
            )
          }
          return (
            <div key={lesson.id} style={{ display: 'grid', gap: 8 }}>
              {idx === 1 && (
                <div style={{ marginTop: 10, fontSize: 10, fontWeight: 700,
                  letterSpacing: '0.24em', textTransform: 'uppercase', color: T.textDim }}>
                  {t('lessons.archive.earlier')}
                </div>
              )}
              <CompactLessonRow
                lesson={lesson}
                analysis={analysis}
                onOpen={() => setSelectedLesson(lesson)}/>
            </div>
          )
        }) : (
          <Glass padding={40} style={{ textAlign: 'center' }}>
            <span className="material-symbols-outlined"
              style={{ fontSize: 36, color: T.textDim }}>search_off</span>
            <div style={{ marginTop: 8, fontSize: 14, color: T.textDim }}>
              {t('lessons.noMatch', { q: lessonFilter })}
            </div>
          </Glass>
        )}
      </div>

      {/* Modals */}
      {selectedLesson && (
        <LessonDetailModal
          lesson={selectedLesson}
          onClose={() => { setSelectedLesson(null); setFocusKeyword(null); setCameFromVocab(false) }}
          onYouglish={(word) => setYouglishWord(word)}
          focusKeyword={focusKeyword}
          cameFromVocab={cameFromVocab}
          studentSlug={studentSlug}
          basePath={basePath}/>
      )}
      {youglishWord && (
        <YouGlishModal word={youglishWord} onClose={() => setYouglishWord(null)}/>
      )}
    </div>
  )
}
