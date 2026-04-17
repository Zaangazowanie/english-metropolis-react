import { useState, useMemo, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useI18n } from '../i18n'
import {
  METRICS,
  scoreToTier,
  formatDate,
  formatLongDate,
  CefrBadge,
  RichText,
  RichInline,
  MetricLineChart,
  Modal,
  parseMetricCommentary,
} from '../components/analytics/AnalyticsPrimitives.jsx'

/* ============================================================================
   TTS playback — hit the nginx /api/tts/ proxy directly (same as gold bundle)
   ============================================================================ */

const ttsCache = new Map()
let currentAudio = null

function currentVoice() {
  try { return localStorage.getItem('tts_voice') || 'af_heart' } catch { return 'af_heart' }
}

async function playTTS(text, voice) {
  if (!text) return
  const v = voice || currentVoice()
  voice = v
  const key = `${text}::${v}`
  if (ttsCache.has(key)) {
    const audio = ttsCache.get(key)
    currentAudio?.pause()
    currentAudio = audio
    audio.currentTime = 0
    try { await audio.play() } catch { /* ignore */ }
    return
  }
  try {
    const resp = await fetch('/api/tts/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice, lang: voice[0] || 'a' }),
    })
    if (!resp.ok) throw new Error(`TTS failed ${resp.status}`)
    const blob = await resp.blob()
    const url = URL.createObjectURL(blob)
    const audio = new Audio(url)
    ttsCache.set(key, audio)
    currentAudio?.pause()
    currentAudio = audio
    await audio.play()
  } catch (err) {
    console.error('TTS error:', err)
  }
}

/* ============================================================================
   YouGlish fetch — uses /api/youglish/keyword?q=X proxy
   ============================================================================ */

const youglishCache = new Map()

const STOPWORDS = new Set([
  'the','a','an','to','of','in','on','at','for','with','by','from','up','out','as',
  'it','its','this','that','these','those','is','are','was','were','be','been','being',
  'and','or','but','so','than','then','if','about','into','over','under','through',
  'do','does','did','have','has','had','will','would','can','could','should','may','might',
  'i','you','he','she','we','they','him','her','them','my','your','our','their','his','her',
])

/**
 * Generate progressively-relaxed query variants for a word/phrase so we
 * never give up on a YouGlish lookup just because the exact phrase isn't
 * indexed. Order matters — most specific first, most permissive last.
 */
function youglishQueryVariants(rawKey) {
  const key = String(rawKey || '').toLowerCase().replace(/_/g, ' ').replace(/[^\p{L}\p{N}\s'-]/gu, ' ').replace(/\s+/g, ' ').trim()
  if (!key) return []
  const out = []
  const seen = new Set()
  const push = (s) => {
    const v = s.trim()
    if (v && !seen.has(v)) { seen.add(v); out.push(v) }
  }
  // 1) Exact phrase
  push(key)
  const words = key.split(' ').filter(Boolean)
  if (words.length === 1) return out

  // 2) Strip leading/trailing stopwords (e.g. "to break down" → "break down")
  let lo = 0, hi = words.length - 1
  while (lo < hi && STOPWORDS.has(words[lo])) lo++
  while (hi > lo && STOPWORDS.has(words[hi])) hi--
  if (lo > 0 || hi < words.length - 1) push(words.slice(lo, hi + 1).join(' '))

  // 3) Two-word window — every adjacent bigram of content words
  const content = words.filter(w => !STOPWORDS.has(w))
  for (let i = 0; i < content.length - 1; i++) {
    push(`${content[i]} ${content[i + 1]}`)
  }

  // 4) Single content words, longest first (more salient = longer)
  content.slice().sort((a, b) => b.length - a.length).forEach(push)

  // 5) Last-ditch: every original word, longest first
  words.slice().sort((a, b) => b.length - a.length).forEach(push)

  return out
}

async function fetchYouglishRaw(query) {
  const resp = await fetch(`/api/youglish/keyword?q=${encodeURIComponent(query)}`)
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
  // Walk variants in order until one returns results.
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
    } catch (err) {
      lastErr = err
    }
  }
  // Cache empty result so we don't re-walk the variant list every render
  const empty = { keyword: key, videos: [], fallbackFrom: key }
  youglishCache.set(key, empty)
  if (lastErr) console.warn('[YouGlish] all variants failed for', key, lastErr)
  return empty
}

/* ============================================================================
   Per-lesson PDF — beautiful analysis PDF for a single lesson
   ============================================================================ */

let _pdfFontsLoaded = false
async function ensurePdfFonts() {
  if (_pdfFontsLoaded) return
  const load = (src) => new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = src
    s.onload = () => resolve()
    s.onerror = reject
    document.head.appendChild(s)
  })
  if (!window.__NOTO_REGULAR_B64) await load('/students/vendor/fonts/NotoSans-Regular.b64.js')
  if (!window.__NOTO_BOLD_B64) await load('/students/vendor/fonts/NotoSans-Bold.b64.js')
  _pdfFontsLoaded = true
}

async function generateLessonPdf(profile, lesson, analysis) {
  const jspdfLib = typeof window !== 'undefined' ? window.jspdf : null
  if (!jspdfLib?.jsPDF) { alert('PDF library not loaded.'); return }
  await ensurePdfFonts()
  const { jsPDF } = jspdfLib
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  try {
    doc.addFileToVFS('NotoSans-Regular.ttf', window.__NOTO_REGULAR_B64)
    doc.addFont('NotoSans-Regular.ttf', 'NotoSans', 'normal')
    doc.addFileToVFS('NotoSans-Bold.ttf', window.__NOTO_BOLD_B64)
    doc.addFont('NotoSans-Bold.ttf', 'NotoSans', 'bold')
  } catch (e) { console.warn('Font load', e) }

  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 48
  const maxW = pageW - margin * 2

  const C = {
    primary: [37, 99, 235], primaryDark: [29, 78, 216], secondary: [124, 58, 237],
    emerald: [5, 150, 105], amber: [217, 119, 6], rose: [220, 38, 38],
    slate900: [15, 23, 42], slate700: [51, 65, 85], slate500: [100, 116, 139],
    slate400: [148, 163, 184], slate200: [226, 232, 240], slate100: [241, 245, 249],
    slate50: [248, 250, 252], white: [255, 255, 255],
    emeraldSoft: [209, 250, 229], amberSoft: [254, 243, 199], roseSoft: [254, 226, 226], skySoft: [224, 242, 254],
  }

  const setF = (w = 'normal') => doc.setFont('NotoSans', w)
  const setColor = (c) => doc.setTextColor(c[0], c[1], c[2])
  const setFill = (c) => doc.setFillColor(c[0], c[1], c[2])
  const setStroke = (c) => doc.setDrawColor(c[0], c[1], c[2])
  let y = margin

  const ensure = (n) => { if (y + n > pageH - 60) { doc.addPage(); y = margin } }
  const heading = (text, size = 14, color = C.slate900) => {
    ensure(size + 12)
    setF('bold').setFontSize(size); setColor(color)
    doc.text(text, margin, y)
    setStroke(C.primary); doc.setLineWidth(1.2)
    doc.line(margin, y + 3, margin + 28, y + 3)
    y += size + 10
  }
  const sub = (text, size = 10, color = C.slate500) => {
    ensure(size + 4); setF('normal').setFontSize(size); setColor(color)
    doc.text(text, margin, y); y += size + 4
  }
  const para = (text, size = 10, color = C.slate700, indent = 0) => {
    if (!text) return
    setF('normal').setFontSize(size); setColor(color)
    const lines = doc.splitTextToSize(String(text), maxW - indent)
    for (const ln of lines) { ensure(size + 2); doc.text(ln, margin + indent, y); y += size + 3 }
    y += 3
  }
  const bullet = (text, opts = {}) => {
    const { indent = 14, size = 10, color = C.slate700, markerColor = C.primary, marker = '•' } = opts
    if (!text) return
    setF('bold').setFontSize(size); setColor(markerColor)
    doc.text(marker, margin + indent - 8, y)
    setF('normal'); setColor(color)
    const lines = doc.splitTextToSize(String(text), maxW - indent)
    for (let i = 0; i < lines.length; i++) { ensure(size + 2); doc.text(lines[i], margin + indent, y); y += size + 3 }
    y += 1
  }

  // Header band
  setFill(C.primary)
  doc.rect(0, 0, pageW, 120, 'F')
  setFill(C.primaryDark)
  doc.rect(0, 120, pageW, 6, 'F')
  setColor(C.white).setFont('NotoSans', 'bold').setFontSize(9)
  doc.text('CONVERSA SCHOOL · ENGLISH METROPOLIS', margin, 32)
  doc.setFontSize(10)
  doc.text(profile?.name || 'Student', margin, 48)
  doc.setFontSize(20)
  doc.text(lesson.title || 'Lesson', margin, 82)
  doc.setFontSize(11).setFont('NotoSans', 'normal')
  doc.text(`${formatLongDate(lesson.date)}  ·  CEFR ${analysis?.cefrBand || 'N/A'} ${Math.round(analysis?.overallScore || 0)}/100`, margin, 104)
  y = 160

  // Topics pills
  if (lesson.topics?.length) {
    setF('bold').setFontSize(8); setColor(C.slate500)
    doc.text('TOPICS COVERED', margin, y); y += 12
    let px = margin
    for (const t of lesson.topics.slice(0, 10)) {
      const tw = doc.getTextWidth(t) + 14
      if (px + tw > pageW - margin) { y += 20; px = margin }
      setFill([237, 233, 254]); setStroke([196, 181, 253])
      doc.roundedRect(px, y, tw, 16, 8, 8, 'FD')
      setColor([91, 33, 182]).setFont('NotoSans', 'normal').setFontSize(8)
      doc.text(t, px + 7, y + 11)
      px += tw + 4
    }
    y += 30
  }

  // Per-metric scores row
  if (analysis) {
    heading('Per-Metric Scores', 12)
    const scores = [
      { l: 'Vocabulary', v: analysis.vocabularyRange, c: [8, 145, 178] },
      { l: 'Grammar', v: analysis.grammaticalAccuracy, c: [124, 58, 237] },
      { l: 'Fluency', v: analysis.fluencyAndCoherence, c: [5, 150, 105] },
      { l: 'Pronunciation', v: analysis.pronunciation, c: [217, 119, 6] },
      { l: 'Communication', v: analysis.communicativeEffectiveness, c: [37, 99, 235] },
    ]
    const rowH = 18
    const labelW = 110
    for (const s of scores) {
      ensure(rowH + 4)
      setF('bold').setFontSize(9); setColor(C.slate700)
      doc.text(s.l, margin, y + 10)
      // Bar background
      setFill(C.slate100)
      doc.roundedRect(margin + labelW, y + 3, maxW - labelW - 36, 8, 4, 4, 'F')
      // Bar fill
      setFill(s.c)
      doc.roundedRect(margin + labelW, y + 3, (maxW - labelW - 36) * ((s.v || 0) / 100), 8, 4, 4, 'F')
      // Score text
      setF('bold').setFontSize(10); setColor(C.slate900)
      doc.text(String(Math.round(s.v || 0)), pageW - margin - 10, y + 10, { align: 'right' })
      y += rowH
    }
    y += 8
  }

  // Summary
  if (analysis?.lessonSummary) {
    heading('Lesson Summary & Clinical Analysis', 12)
    para(analysis.lessonSummary, 9, C.slate700)
  }

  // Strengths
  if (analysis?.strengths?.length) {
    heading('What You Nailed', 12, C.emerald)
    for (const s of analysis.strengths) {
      bullet(typeof s === 'string' ? s : JSON.stringify(s), { markerColor: C.emerald, marker: '✓' })
    }
    y += 4
  }

  // Improvements
  if (analysis?.improvements?.length) {
    heading('What to Work On', 12, C.amber)
    for (const s of analysis.improvements) {
      bullet(typeof s === 'string' ? s : JSON.stringify(s), { markerColor: C.amber, marker: '▲' })
    }
    y += 4
  }

  // Key errors
  if (analysis?.keyErrors?.length) {
    heading('Key Errors & Corrections', 12, C.rose)
    for (const e of analysis.keyErrors) {
      bullet(`"${e.error}"${e.category ? ` [${e.category}]` : ''}`, { markerColor: C.rose, marker: '✗', color: C.rose })
      if (e.correction) bullet(`${e.correction}`, { indent: 24, markerColor: C.emerald, marker: '→', color: C.emerald })
    }
    y += 4
  }

  // Practice advice
  if (analysis?.practiceAdvice?.length) {
    heading('Practice Advice', 12, C.primary)
    for (const p of analysis.practiceAdvice) bullet(p, { markerColor: C.primary, marker: '•' })
    y += 4
  }

  // Per-metric commentary (from personalDetails)
  const commentary = parseMetricCommentary(analysis)
  if (commentary) {
    heading('Per-Metric Clinical Commentary', 12)
    const metricLabels = {
      vocabularyRange: 'Vocabulary Range',
      grammaticalAccuracy: 'Grammatical Accuracy',
      fluencyAndCoherence: 'Fluency & Coherence',
      pronunciation: 'Pronunciation',
      communicativeEffectiveness: 'Communicative Effectiveness',
    }
    for (const k of Object.keys(metricLabels)) {
      if (commentary[k]) {
        sub(metricLabels[k], 10, C.primary)
        para(commentary[k], 9, C.slate700, 8)
      }
    }
  }

  // Keywords table
  if (lesson.keywords?.length) {
    heading(`Vocabulary (${lesson.keywords.length} keywords)`, 12)
    for (const kw of lesson.keywords.slice(0, 40)) {
      ensure(24)
      setF('bold').setFontSize(10); setColor(C.slate900)
      doc.text(kw.word || '', margin, y)
      setF('normal').setFontSize(9); setColor(C.slate500)
      if (kw.ipa) doc.text(kw.ipa, margin + 100, y)
      setColor(C.slate600).setFontSize(9)
      doc.text(kw.translation || '', margin + 200, y)
      y += 12
      if (kw.example_en) {
        setF('normal').setFontSize(8); setColor(C.slate500)
        const exLines = doc.splitTextToSize(`"${kw.example_en}"`, maxW - 20)
        for (const ln of exLines) { ensure(10); doc.text(ln, margin + 8, y); y += 10 }
      }
      y += 4
    }
  }

  // Footer on all pages
  const total = doc.internal.getNumberOfPages()
  for (let i = 1; i <= total; i++) {
    doc.setPage(i)
    setFill(C.slate50)
    doc.rect(0, pageH - 32, pageW, 32, 'F')
    setStroke(C.slate200); doc.setLineWidth(0.5)
    doc.line(margin, pageH - 32, pageW - margin, pageH - 32)
    setF('normal').setFontSize(8); setColor(C.slate400)
    doc.text(`Conversa School · English Metropolis`, margin, pageH - 16)
    doc.text(`${profile?.name || ''} · ${lesson.title || ''}`, pageW / 2, pageH - 16, { align: 'center' })
    doc.text(`Page ${i} of ${total}`, pageW - margin, pageH - 16, { align: 'right' })
  }

  const safeTitle = String(lesson.title || 'lesson').replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 40)
  const filename = `${profile?.slug || 'student'}-${lesson.date || 'undated'}-${safeTitle}.pdf`
  doc.save(filename)
}

/* ============================================================================
   YouGlish Modal — embedded YouTube player for pronunciation context
   ============================================================================ */

function YouGlishModal({ word, onClose }) {
  const { t } = useI18n()
  const [state, setState] = useState({ loading: true, error: null, data: null })
  const [videoIdx, setVideoIdx] = useState(0)
  const [occIdx, setOccIdx] = useState(0)
  const [autoplay, setAutoplay] = useState(true)
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

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') next()
      if (e.key === 'ArrowLeft') prev()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, videoIdx, occIdx, state.data])

  // Elapsed counter for caption sync fallback
  useEffect(() => {
    clearInterval(timerRef.current)
    setElapsed(0)
    if (!word) return
    timerRef.current = setInterval(() => setElapsed(e => e + 0.1), 100)
    return () => clearInterval(timerRef.current)
  }, [word, videoIdx, occIdx])

  if (!word) return null

  const videos = state.data?.videos || []
  const video = videos[videoIdx] || null
  const occurrence = video?.occurrences?.[occIdx] || null
  const start = Math.max(0, (occurrence?.start || 0) - 2)
  const embedUrl = video
    ? `https://www.youtube.com/embed/${video.videoId}?autoplay=${autoplay ? 1 : 0}&start=${Math.floor(start)}&rel=0&modestbranding=1&iv_load_policy=3&controls=1`
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

  // Build a simple word-by-word caption animation from the occurrence text
  // Timing: We start the video 2s BEFORE the word — so the word itself is at elapsed=2s
  // into the clip. Add a 4s startup offset for iframe load + YouTube buffering.
  const IFRAME_STARTUP = 4.0 // seconds for iframe to load + start playing
  const LEAD_IN = 2.0 // seconds of lead-in before the actual word
  const captionWords = useMemo(() => {
    if (!occurrence?.text) return []
    const duration = Math.max(1, (occurrence.end || (occurrence.start + 3)) - occurrence.start)
    const words = occurrence.text.split(/\s+/).filter(Boolean)
    // Pace each word across the actual clip duration, starting after startup + lead-in
    return words.map((w, i) => {
      const perWord = duration / words.length
      const activeAt = IFRAME_STARTUP + LEAD_IN + i * perWord
      return { word: w, activeAt, duration: perWord }
    })
  }, [occurrence])

  const highlightWord = (word, activeAt, i) => {
    const wordDuration = captionWords[i]?.duration || 0.4
    const isActive = elapsed >= activeAt && elapsed < activeAt + wordDuration
    const hasPlayed = elapsed >= activeAt
    return (
      <span
        key={i}
        className={`inline-block mx-0.5 transition-all duration-200 ${
          isActive ? 'text-sky-400 font-bold scale-110' : hasPlayed ? 'text-slate-300' : 'text-slate-500'
        }`}
      >
        {word}
      </span>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 youglish-modal-enter">
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900/80 via-blue-900/60 to-violet-900/70 backdrop-blur-md" onClick={onClose} />
      <div className="relative w-full max-w-3xl rounded-[2rem] border border-white/10 bg-slate-900 shadow-2xl overflow-hidden youglish-modal-pop">
        {/* Header */}
        <div className="bg-gradient-to-r from-sky-500 via-blue-600 to-violet-600 px-5 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[0.9rem] bg-white/20 backdrop-blur-sm">
              <span className="material-symbols-outlined text-white text-xl">record_voice_over</span>
            </div>
            <div className="min-w-0">
              <p className="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-white/80">{t('lessons.youglish.kicker')}</p>
              <h3 className="font-headline text-xl sm:text-2xl text-white truncate">"{word}"</h3>
              {state.data?.fallbackFrom && (
                <p className="flex items-center gap-1 text-[11px] text-amber-300/80 dark:text-amber-300/70 mt-1">
                  <span className="material-symbols-outlined text-[13px] leading-none shrink-0">info</span>
                  {t('lessons.youglish.fallbackHint', { requested: state.data.fallbackFrom, shown: state.data.keyword })}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-full bg-white/20 hover:bg-white/30 backdrop-blur-sm p-2 text-white transition"
          >
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>

        {/* Body */}
        <div className="p-5 bg-slate-900">
          {state.loading && (
            <div className="aspect-video rounded-xl bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 flex flex-col items-center justify-center animate-pulse">
              <span className="material-symbols-outlined text-4xl text-sky-400 animate-spin">sync</span>
              <p className="mt-3 text-sm text-slate-300">{t('lessons.youglish.loading')}</p>
            </div>
          )}
          {state.error && (
            <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-6 text-center">
              <span className="material-symbols-outlined text-3xl text-rose-400">error_outline</span>
              <p className="mt-2 text-sm text-rose-200">{t('lessons.youglish.error')}</p>
              <p className="text-xs text-rose-400 mt-1">{state.error}</p>
            </div>
          )}
          {!state.loading && !state.error && videos.length === 0 && (
            <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-8 text-center">
              <span className="material-symbols-outlined text-4xl text-slate-500">videocam_off</span>
              <p className="mt-3 text-sm text-slate-300">{t('lessons.youglish.empty')}</p>
              <p className="text-xs text-slate-500 mt-1">{t('lessons.youglish.emptyHint')}</p>
            </div>
          )}
          {video && embedUrl && (
            <>
              <div className="aspect-video rounded-xl overflow-hidden border border-slate-700 bg-black relative">
                <iframe
                  ref={playerRef}
                  key={`${video.videoId}-${occIdx}`}
                  src={embedUrl}
                  title={`"${word}" spoken in a YouTube clip`}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="w-full h-full"
                />
              </div>

              {/* Karaoke-style caption */}
              {captionWords.length > 0 && (
                <div className="mt-4 rounded-xl bg-slate-800/60 border border-slate-700 px-4 py-3">
                  <p className="font-label text-[9px] font-bold uppercase tracking-[0.2em] text-sky-400 mb-1.5">{t('lessons.youglish.caption')}</p>
                  <p className="text-base leading-relaxed text-slate-400 flex flex-wrap">
                    {captionWords.map((w, i) => highlightWord(w.word, w.activeAt, i))}
                  </p>
                </div>
              )}

              {/* Navigation + info */}
              <div className="mt-4 flex items-center justify-between gap-3 flex-wrap">
                <button
                  type="button"
                  onClick={prev}
                  disabled={videoIdx === 0 && occIdx === 0}
                  className="inline-flex items-center gap-1.5 rounded-full bg-slate-800 border border-slate-700 px-4 py-2 text-xs font-label font-bold uppercase tracking-[0.16em] text-slate-300 disabled:opacity-30 hover:bg-slate-700 hover:border-sky-500/50 transition"
                >
                  <span className="material-symbols-outlined text-base">arrow_back</span>
                  {t('lessons.youglish.previous')}
                </button>
                <div className="text-center">
                  <p className="text-[10px] font-label font-bold uppercase tracking-[0.16em] text-sky-400">
                    {t('lessons.youglish.clipOf', { a: globalOccIdx, b: totalOccurrences })}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    {t('lessons.youglish.videoOf', { a: videoIdx + 1, b: videos.length })}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={next}
                  disabled={videoIdx === videos.length - 1 && occIdx === video.occurrences.length - 1}
                  className="inline-flex items-center gap-1.5 rounded-full bg-slate-800 border border-slate-700 px-4 py-2 text-xs font-label font-bold uppercase tracking-[0.16em] text-slate-300 disabled:opacity-30 hover:bg-slate-700 hover:border-sky-500/50 transition"
                >
                  {t('lessons.youglish.next')}
                  <span className="material-symbols-outlined text-base">arrow_forward</span>
                </button>
              </div>

              {/* Video thumbnail strip */}
              {videos.length > 1 && (
                <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
                  {videos.map((v, i) => (
                    <button
                      key={v.videoId}
                      type="button"
                      onClick={() => { setVideoIdx(i); setOccIdx(0) }}
                      className={`shrink-0 rounded-lg border-2 overflow-hidden transition ${videoIdx === i ? 'border-sky-400 scale-105' : 'border-slate-700 opacity-60 hover:opacity-100'}`}
                    >
                      <img src={v.thumbnail} alt="" className="w-24 h-14 object-cover" />
                    </button>
                  ))}
                </div>
              )}

              <p className="mt-3 text-[10px] text-slate-500 text-center">
                {t('lessons.youglish.keyboardHint')}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/* ============================================================================
   KeywordCard — rich keyword display with collocations, TTS, YouGlish
   ============================================================================ */

function KeywordCard({ keyword, onYouglish, forceExpanded = false }) {
  const { t } = useI18n()
  const [expanded, setExpanded] = useState(forceExpanded)
  useEffect(() => { if (forceExpanded) setExpanded(true) }, [forceExpanded])
  const collocGroups = keyword?.collocations
    ? ['commonCollocations', 'contexts', 'usagePatterns']
        .map(k => ({ key: k, items: keyword.collocations?.[k] || [] }))
        .filter(g => g.items.length > 0)
    : []

  return (
    <div className="rounded-[1.25rem] border border-slate-200/80 bg-white overflow-hidden transition-all hover:border-sky-200 hover:shadow-sm">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-start justify-between gap-3 px-4 py-3 text-left cursor-pointer hover:bg-sky-50/30 transition"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-headline text-lg text-slate-900">{keyword.word}</h4>
            {keyword.ipa && <span className="font-mono text-xs text-sky-700">{keyword.ipa}</span>}
            {keyword.cefr_level && (
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-label font-bold text-slate-500">{keyword.cefr_level}</span>
            )}
          </div>
          <p className="mt-1 text-sm text-slate-600">{keyword.translation}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); playTTS(keyword.word) }}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-sky-50 border border-sky-200 text-sky-700 hover:bg-sky-100 transition"
            title={t('lessons.keyword.playPronunciation')}
          >
            <span className="material-symbols-outlined text-base">volume_up</span>
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onYouglish(keyword.word) }}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100 transition"
            title={t('lessons.keyword.watchYouglish')}
          >
            <span className="material-symbols-outlined text-base">smart_display</span>
          </button>
          <span className={`material-symbols-outlined text-slate-400 text-lg transition-transform ${expanded ? 'rotate-180' : ''}`}>expand_more</span>
        </div>
      </button>
      {expanded && (
        <div className="border-t border-slate-100 px-4 py-4 bg-slate-50/30 space-y-4">
          {(keyword.definition || keyword.definitionPl) && (
            <div className="grid gap-3 sm:grid-cols-2">
              {keyword.definition && (
                <div>
                  <p className="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">{t('lessons.keyword.definitionEn')}</p>
                  <p className="mt-1 text-sm text-slate-700">{keyword.definition}</p>
                </div>
              )}
              {keyword.definitionPl && (
                <div>
                  <p className="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">{t('lessons.keyword.definitionPl')}</p>
                  <p className="mt-1 text-sm text-slate-700">{keyword.definitionPl}</p>
                </div>
              )}
            </div>
          )}
          {keyword.example && (
            <div className="rounded-[1rem] border border-sky-100 bg-sky-50/40 px-3 py-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-sky-700">{t('lessons.keyword.exampleSentence')}</p>
                  <p className="mt-1 text-sm italic text-slate-700">"{keyword.example}"</p>
                </div>
                <button
                  type="button"
                  onClick={() => playTTS(keyword.example)}
                  className="shrink-0 flex h-7 w-7 items-center justify-center rounded-full bg-white border border-sky-200 text-sky-700 hover:bg-sky-50 transition"
                  title={t('lessons.keyword.playExample')}
                >
                  <span className="material-symbols-outlined text-sm">volume_up</span>
                </button>
              </div>
            </div>
          )}
          {collocGroups.length > 0 && (
            <div>
              <p className="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-violet-700 mb-2">{t('lessons.keyword.collocationsUsage')}</p>
              <div className="space-y-3">
                {collocGroups.map(g => (
                  <div key={g.key}>
                    <p className="text-[11px] font-label font-bold uppercase tracking-[0.14em] text-slate-500 mb-1">
                      {g.key === 'commonCollocations' ? t('lessons.keyword.commonCollocations') : g.key === 'contexts' ? t('lessons.keyword.contexts') : t('lessons.keyword.usagePatterns')}
                    </p>
                    <ul className="space-y-1">
                      {g.items.map((c, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                          <span className="material-symbols-outlined text-violet-400 text-sm mt-0.5 shrink-0">east</span>
                          <div>
                            <span className="font-semibold">{c.phrase}</span>
                            {c.example && <span className="text-slate-500 italic"> — "{c.example}"</span>}
                          </div>
                        </li>
                      ))}
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
   HorizontalLessonNavigator — scrollable block strip with arrow nav
   ============================================================================ */

function TopicFilterStrip({ topics, value, onChange, label, allLabel }) {
  const scrollRef = useRef(null)
  function scroll(dir) {
    const el = scrollRef.current
    if (!el) return
    el.scrollBy({ left: el.clientWidth * 0.6 * dir, behavior: 'smooth' })
  }
  return (
    <div className="mt-3 flex items-center gap-2">
      <span className="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 shrink-0">{label}</span>
      <button
        type="button"
        onClick={() => scroll(-1)}
        aria-label="Scroll topics left"
        className="topic-strip-arrow"
      >
        <span className="material-symbols-outlined text-[18px]">chevron_left</span>
      </button>
      <div ref={scrollRef} className="flex flex-nowrap gap-1.5 overflow-x-auto scrollbar-hide flex-1 min-w-0 py-1 scroll-smooth">
        <button
          type="button"
          onClick={() => onChange(null)}
          className={`topic-tag whitespace-nowrap shrink-0 ${value === null ? 'is-active' : ''}`}
        >
          {allLabel}
        </button>
        {topics.map(tp => (
          <button
            key={tp}
            type="button"
            onClick={() => onChange(value === tp ? null : tp)}
            className={`topic-tag whitespace-nowrap shrink-0 ${value === tp ? 'is-active' : ''}`}
          >
            {tp}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => scroll(1)}
        aria-label="Scroll topics right"
        className="topic-strip-arrow"
      >
        <span className="material-symbols-outlined text-[18px]">chevron_right</span>
      </button>
    </div>
  )
}

function HorizontalLessonNavigator({ lessons }) {
  const { t } = useI18n()
  const scrollRef = useRef(null)

  function scroll(dir) {
    const el = scrollRef.current
    if (!el) return
    const step = el.clientWidth * 0.7 * dir
    el.scrollBy({ left: step, behavior: 'smooth' })
  }

  function jumpTo(id) {
    const el = document.getElementById(`lesson-card-${id}`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  if (!lessons.length) return null

  return (
    <div className="rounded-[1.5rem] border border-white/70 bg-white/80 editorial-shadow p-3">
      <div className="flex items-center justify-between mb-2 px-2">
        <p className="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">{t('lessons.nav.quickJump')}</p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => scroll(-1)}
            className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 hover:border-sky-300 hover:text-sky-700 hover:bg-sky-50 transition cursor-pointer"
            aria-label={t('lessons.nav.scrollLeft')}
          >
            <span className="material-symbols-outlined text-base">chevron_left</span>
          </button>
          <button
            type="button"
            onClick={() => scroll(1)}
            className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 hover:border-sky-300 hover:text-sky-700 hover:bg-sky-50 transition cursor-pointer"
            aria-label={t('lessons.nav.scrollRight')}
          >
            <span className="material-symbols-outlined text-base">chevron_right</span>
          </button>
        </div>
      </div>
      <div
        ref={scrollRef}
        className="flex gap-2 overflow-x-auto pb-1 px-1 scrollbar-hide scroll-smooth snap-x snap-mandatory"
        style={{ scrollbarWidth: 'none' }}
      >
        {lessons.map((l) => (
          <button
            key={l.id}
            type="button"
            onClick={() => jumpTo(l.id)}
            className="group shrink-0 w-[180px] snap-start rounded-[1rem] border border-slate-200 bg-white px-3 py-2.5 text-left hover:border-sky-300 hover:bg-sky-50 hover:-translate-y-0.5 transition-all cursor-pointer"
          >
            <div className="flex items-center gap-1.5 mb-1">
              <span className="material-symbols-outlined text-[12px] text-slate-400 group-hover:text-sky-600">event</span>
              <p className="font-label text-[9px] font-bold uppercase tracking-[0.14em] text-slate-400 group-hover:text-sky-600">
                {formatDate(l.date)}
              </p>
            </div>
            <p className="text-xs font-semibold text-slate-800 group-hover:text-sky-800 leading-snug line-clamp-2">
              {l.title}
            </p>
            <div className="mt-1.5 flex items-center gap-1.5">
              {l.analysis && <CefrBadge band={l.analysis.cefrBand} score={l.analysis.overallScore} />}
              <span className="text-[9px] text-slate-400">{t('lessons.kwAbbrev', { n: l.keyword_count || l.keywords?.length || 0 })}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

/* ============================================================================
   Personalized Recommendations — pulled from personalDetails JSON blob
   ============================================================================ */

function parsePersonalizedRecs(analysis) {
  if (!analysis?.personalDetails) return null
  for (const entry of analysis.personalDetails) {
    if (typeof entry !== 'string') continue
    const m = entry.match(/^personalizedRecs:(.+)$/)
    if (m) {
      try { return JSON.parse(m[1]) } catch { /* ignore */ }
    }
  }
  return null
}

const RECO_TYPE_META = {
  book: { icon: 'menu_book', label: 'Book', color: 'emerald', tone: 'from-emerald-50 to-green-50 border-emerald-200' },
  article: { icon: 'article', label: 'Article', color: 'sky', tone: 'from-sky-50 to-blue-50 border-sky-200' },
  podcast: { icon: 'podcasts', label: 'Podcast', color: 'violet', tone: 'from-violet-50 to-fuchsia-50 border-violet-200' },
  youtube: { icon: 'smart_display', label: 'YouTube', color: 'rose', tone: 'from-rose-50 to-pink-50 border-rose-200' },
  series: { icon: 'theaters', label: 'TV Series', color: 'amber', tone: 'from-amber-50 to-orange-50 border-amber-200' },
  movie: { icon: 'movie', label: 'Film', color: 'indigo', tone: 'from-indigo-50 to-violet-50 border-indigo-200' },
  documentary: { icon: 'videocam', label: 'Documentary', color: 'teal', tone: 'from-teal-50 to-cyan-50 border-teal-200' },
  newsletter: { icon: 'mail', label: 'Newsletter', color: 'slate', tone: 'from-slate-50 to-zinc-50 border-slate-200' },
  social: { icon: 'groups', label: 'Social', color: 'pink', tone: 'from-pink-50 to-rose-50 border-pink-200' },
}

function PersonalizedRecommendationsBlock({ recs }) {
  const { t } = useI18n()
  const { intro, recommendations, transcriptEvidence } = recs
  if (!recommendations?.length) return null

  return (
    <div className="section-block rounded-[1.5rem] p-5 sm:p-6 border-shimmer">
      <div className="flex items-center gap-3 mb-4">
        <div className="flex h-11 w-11 items-center justify-center rounded-[0.9rem] bg-gradient-to-br from-sky-500 via-blue-600 to-violet-600 shadow-md">
          <span className="material-symbols-outlined text-white text-xl">auto_awesome</span>
        </div>
        <div>
          <p className="font-label text-[10px] font-bold uppercase tracking-[0.22em] text-sky-700">{t('lessons.recs.kicker')}</p>
          <h3 className="font-headline text-xl text-slate-900">{t('lessons.recs.title')}</h3>
        </div>
      </div>
      {intro && (
        <p className="text-sm text-slate-700 leading-relaxed mb-4 italic border-l-2 border-sky-300 pl-3">{intro}</p>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        {recommendations.map((r, i) => {
          const meta = RECO_TYPE_META[r.type] || RECO_TYPE_META.article
          return (
            <a
              key={i}
              href={r.url || '#'}
              target="_blank"
              rel="noopener"
              className={`group block rounded-[1.25rem] border-2 p-4 bg-gradient-to-br ${meta.tone} hover:shadow-lg hover:-translate-y-0.5 transition-all cursor-pointer`}
            >
              <div className="flex items-start gap-3 mb-2">
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.75rem] bg-white border-2 border-${meta.color}-300 shadow-sm`}>
                  <span className={`material-symbols-outlined text-${meta.color}-600 text-lg`}>{meta.icon}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`font-label text-[9px] font-bold uppercase tracking-[0.16em] text-${meta.color}-700`}>{meta.label}</p>
                  <h4 className="mt-0.5 font-headline text-base leading-snug text-slate-900 group-hover:text-sky-800 transition">{r.title}</h4>
                  {r.creator && <p className="text-[11px] text-slate-500 mt-0.5">{t('lessons.recs.byCreator', { creator: r.creator })}</p>}
                </div>
                <span className="material-symbols-outlined text-slate-400 text-base shrink-0 group-hover:text-sky-600 transition">open_in_new</span>
              </div>
              {r.whyThisMatches && (
                <p className="text-xs text-slate-600 leading-relaxed mb-2">
                  <span className="font-bold text-slate-700">{t('lessons.recs.whyMatches')}</span> {r.whyThisMatches}
                </p>
              )}
              {r.howToNavigate && (
                <p className="text-xs text-slate-600 leading-relaxed mb-2 border-t border-slate-200/60 pt-2">
                  <span className="font-bold text-sky-700">{t('lessons.recs.howToUse')}</span> {r.howToNavigate}
                </p>
              )}
              {r.focusVocab?.length > 0 && (
                <div className="mt-2 pt-2 border-t border-slate-200/60">
                  <p className="text-[9px] font-label font-bold uppercase tracking-[0.16em] text-slate-500 mb-1">{t('lessons.recs.focusVocab')}</p>
                  <div className="flex flex-wrap gap-1">
                    {r.focusVocab.map((w, j) => (
                      <span key={j} className="rounded-full bg-white/70 border border-slate-200 px-2 py-0.5 text-[10px] font-mono text-slate-700">{w}</span>
                    ))}
                  </div>
                </div>
              )}
            </a>
          )
        })}
      </div>
    </div>
  )
}

/* ============================================================================
   Main Lessons view
   ============================================================================ */

export default function Lessons({ data }) {
  const { t } = useI18n()
  const [selectedLesson, setSelectedLesson] = useState(null)
  const [lessonFilter, setLessonFilter] = useState('')
  const [youglishWord, setYouglishWord] = useState(null)
  const [pdfMap, setPdfMap] = useState({})
  const [focusKeyword, setFocusKeyword] = useState(null)
  const [cameFromVocab, setCameFromVocab] = useState(false)

  useEffect(() => {
    fetch('/lesson-pdfs.json')
      .then(r => r.ok ? r.json() : {})
      .then(setPdfMap)
      .catch(() => setPdfMap({}))
  }, [])

  const [topicFilter, setTopicFilter] = useState(null)
  const lessons = data?.lessons || []

  // All unique topics across lessons — used for filter tag bar
  const allTopics = useMemo(() => {
    const set = new Set()
    for (const l of lessons) (l.topics || []).forEach(t => set.add(t))
    return [...set].filter(Boolean).sort()
  }, [lessons])

  // Read query params on mount — auto-open a lesson + focus a keyword
  useEffect(() => {
    if (!lessons.length) return
    const params = new URLSearchParams(window.location.search)
    // `openLesson` is the legacy param, `lessonId` is the new one used by Dashboard deep-links
    const openLessonId = params.get('openLesson') || params.get('lessonId')
    const focusKw = params.get('focusKeyword')
    const from = params.get('from')
    if (openLessonId) {
      // Match on id / date / analysisId (Dashboard passes lessonId from analyses, which
      // may be the Convex lesson _id or an analysis _id — try all three)
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

  return (
    <section className="space-y-4" id="page-lessons">
      {/* Hero header */}
      <div className="rounded-[1.75rem] bg-gradient-to-br from-white via-violet-50/50 to-sky-50/60 border border-white/70 editorial-shadow px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-label text-[11px] font-bold uppercase tracking-[0.24em] text-violet-700">{t('lessons.hero.kicker')}</p>
            <h1 className="mt-1.5 font-headline text-2xl sm:text-3xl text-slate-900">{t('lessons.hero.title')}</h1>
            <p className="mt-1.5 text-sm text-slate-600 max-w-2xl">
              {t('lessons.hero.intro')}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="rounded-[1rem] bg-white/70 border border-white/80 px-3 py-2 text-center">
              <p className="text-[9px] font-label font-bold uppercase tracking-[0.18em] text-slate-400">{t('lessons.hero.statLabel')}</p>
              <p className="mt-0.5 font-headline text-xl text-slate-900">{lessons.length}</p>
            </div>
          </div>
        </div>
        <input
          type="search"
          placeholder={t('lessons.searchPlaceholder')}
          value={lessonFilter}
          onChange={(e) => setLessonFilter(e.target.value)}
          className="mt-4 w-full rounded-2xl border-2 border-slate-200 bg-white/90 px-4 py-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-4 focus:ring-sky-100"
        />
        {/* Topic filter pills — single-line horizontal scroll with arrows */}
        {allTopics.length > 0 && (
          <TopicFilterStrip
            topics={allTopics}
            value={topicFilter}
            onChange={setTopicFilter}
            label={t('lessons.filterByTopic')}
            allLabel={t('lessons.allTopics')}
          />
        )}
      </div>

      {/* Horizontal lesson navigator with prev/next arrows */}
      <HorizontalLessonNavigator lessons={filteredLessons} />

      <div>
        <div className="space-y-4">
          {filteredLessons.length ? filteredLessons.map(lesson => {
            const analysis = lesson.analysis
            const pdf = (pdfMap[data?.profile?.slug || ''] || []).find(p => p.date === lesson.date)
            return (
              <article
                key={lesson.id}
                id={`lesson-card-${lesson.id}`}
                className="lesson-card-glass rounded-[1.75rem] bg-white overflow-hidden"
                style={{ scrollMarginTop: '120px' }}
              >
                <button
                  type="button"
                  onClick={() => setSelectedLesson(lesson)}
                  className="block w-full text-left cursor-pointer"
                >
                  {/* Top band: gradient with metadata, no overlap */}
                  <div className="bg-gradient-to-r from-sky-500 via-blue-600 to-indigo-600 px-5 py-3">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-white text-base">event</span>
                        <span className="font-label text-xs font-bold uppercase tracking-[0.18em] text-white">
                          {formatDate(lesson.date)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {analysis && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-0.5 text-[11px] font-label font-bold uppercase tracking-[0.14em] text-blue-700 backdrop-blur">
                            {analysis.cefrBand} {Math.round(analysis.overallScore || 0)}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-label font-bold text-white">
                          {t('lessons.wordsCount', { n: lesson.keyword_count || lesson.keywords?.length || 0 })}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Body */}
                  <div className="px-5 py-4">
                    <h3 className="font-headline text-xl sm:text-2xl text-slate-900 leading-tight">{lesson.title}</h3>
                    {lesson.topics?.length > 0 && (
                      <div className="mt-2.5 flex flex-wrap gap-1.5" onClick={(e) => e.stopPropagation()}>
                        {lesson.topics.slice(0, 8).map((t, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setTopicFilter(topicFilter === t ? null : t) }}
                            className={`topic-tag ${topicFilter === t ? 'is-active' : ''}`}
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                    )}
                    {analysis?.lessonSummary && (
                      <p className="mt-3 text-sm text-slate-600 leading-relaxed line-clamp-3">
                        {analysis.lessonSummary.slice(0, 280)}{analysis.lessonSummary.length > 280 ? '…' : ''}
                      </p>
                    )}
                  </div>
                </button>

                {/* Action bar */}
                <div className="border-t border-slate-100 bg-slate-50/40 px-5 py-2.5 flex items-center justify-between gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setSelectedLesson(lesson)}
                    className="inline-flex items-center gap-1.5 rounded-full bg-sky-600 px-3 py-1.5 text-[11px] font-label font-bold uppercase tracking-[0.14em] text-white hover:bg-sky-700 transition cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-sm">menu_book</span>
                    {t('lessons.openLesson')}
                  </button>
                  <div className="flex items-center gap-1.5">
                    {pdf?.url && (
                      <a
                        href={pdf.url}
                        target="_blank"
                        rel="noopener"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-label font-bold uppercase tracking-[0.14em] text-slate-600 hover:border-sky-300 hover:text-sky-700 transition"
                        title={t('lessons.rawNotesTitle')}
                      >
                        <span className="material-symbols-outlined text-[14px]">description</span>
                        {t('lessons.rawNotes')}
                      </a>
                    )}
                    {analysis && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); generateLessonPdf(data?.profile, lesson, analysis) }}
                        className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-label font-bold uppercase tracking-[0.14em] text-slate-600 hover:border-sky-300 hover:text-sky-700 transition cursor-pointer"
                        title={t('lessons.analysisPdfTitle')}
                      >
                        <span className="material-symbols-outlined text-[14px]">picture_as_pdf</span>
                        {t('lessons.analysisPdf')}
                      </button>
                    )}
                  </div>
                </div>
              </article>
            )
          }) : (
            <div className="rounded-[1.5rem] border border-slate-200 bg-white px-5 py-10 text-center">
              <span className="material-symbols-outlined text-3xl text-slate-300">search_off</span>
              <p className="mt-2 text-sm text-slate-500">{t('lessons.noMatch', { q: lessonFilter })}</p>
            </div>
          )}
        </div>
      </div>

      {/* Lesson Detail Modal */}
      <Modal
        open={!!selectedLesson}
        onClose={() => { setSelectedLesson(null); setFocusKeyword(null); setCameFromVocab(false) }}
        title={selectedLesson?.title || t('lessons.modalDefaultTitle')}
        widthClass="max-w-5xl"
      >
        {selectedLesson && (
          <LessonDetail
            lesson={selectedLesson}
            onYouglish={(word) => setYouglishWord(word)}
            focusKeyword={focusKeyword}
            cameFromVocab={cameFromVocab}
            studentSlug={data?.profile?.slug}
          />
        )}
      </Modal>

      {/* YouGlish Modal */}
      {youglishWord && (
        <YouGlishModal word={youglishWord} onClose={() => setYouglishWord(null)} />
      )}
    </section>
  )
}

/* ============================================================================
   LessonDetail — full lesson dive with analysis + keywords + per-metric scores
   ============================================================================ */

function LessonSummaryOnion({ summary, title, deeperLabel }) {
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
    <div className="rounded-[1.25rem] border border-sky-100 bg-gradient-to-br from-sky-50/40 to-white p-5">
      <p className="font-label text-[11px] font-bold uppercase tracking-[0.2em] text-sky-700 mb-4 flex items-center gap-1.5">
        <span className="material-symbols-outlined text-sm">auto_stories</span>
        {title}
      </p>
      {bullets.length > 0 ? (
        <ul className="space-y-2.5">
          {bullets.map((b, i) => (
            <li key={i} className="flex items-start gap-2.5 text-[15px] text-slate-700 leading-relaxed">
              <span className="mt-2 inline-block h-1.5 w-1.5 rounded-full bg-gradient-to-br from-sky-400 to-violet-500 shrink-0" />
              <span className="flex-1">{b}</span>
            </li>
          ))}
        </ul>
      ) : (
        <RichText text={summary} />
      )}
      {deepBullets.length > 0 && (
        <details className="mt-5 group/details">
          <summary className="cursor-pointer list-none inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-violet-100 to-sky-100 border border-violet-300 hover:border-violet-500 px-4 py-2 text-[11px] font-label font-bold uppercase tracking-[0.14em] text-violet-800 transition shadow-sm">
            <span className="material-symbols-outlined text-[15px] group-open/details:rotate-90 transition-transform">chevron_right</span>
            <span className="material-symbols-outlined text-[15px]">science</span>
            {deeperLabel}
          </summary>
          <div className="mt-4 rounded-[1rem] border-l-4 border-violet-400 bg-gradient-to-br from-violet-50/60 via-sky-50/30 to-white pl-5 pr-4 py-4">
            <div className="flex items-center gap-1.5 mb-3">
              <span className="material-symbols-outlined text-base text-violet-600">science</span>
              <p className="font-label text-[11px] font-bold uppercase tracking-[0.18em] text-violet-700">{deeperLabel}</p>
            </div>
            <ul className="space-y-2.5">
              {deepBullets.map((b, i) => (
                <li key={i} className="flex items-start gap-2.5 text-[15px] text-slate-700 leading-relaxed">
                  <span className="mt-2 inline-block h-1.5 w-1.5 rounded-full bg-gradient-to-br from-violet-500 to-sky-500 shrink-0" />
                  <span className="flex-1">{b}</span>
                </li>
              ))}
            </ul>
          </div>
        </details>
      )}
    </div>
  )
}

function LessonDetail({ lesson, onYouglish, focusKeyword, cameFromVocab, studentSlug }) {
  const { t } = useI18n()
  const navigate = useNavigate()
  const analysis = lesson.analysis
  const [keywordSearch, setKeywordSearch] = useState('')
  const [highlightKeyword, setHighlightKeyword] = useState(null)
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

  // Auto-scroll to the focused keyword + expand its card
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

  return (
    <div className="space-y-6">
      {/* Sticky floating back button when we came from vocab */}
      {cameFromVocab && studentSlug && (
        <a
          href={`/app/${studentSlug}/vocabulary`}
          className="floating-back-btn flex items-center gap-3 rounded-full px-5 py-3.5 text-sm font-label font-bold uppercase tracking-[0.18em] cursor-pointer -mx-1"
        >
          <span className="material-symbols-outlined text-xl">arrow_back</span>
          <div className="text-left leading-tight">
            <div className="text-[10px] opacity-85 tracking-[0.22em]">{focusKeyword ? t('lessons.detail.viewingInContext', { kw: focusKeyword }) : t('lessons.detail.jumpedFromVocab')}</div>
            <div className="text-sm">{t('lessons.detail.backToVocab')}</div>
          </div>
          <span className="ml-auto material-symbols-outlined text-xl">library_books</span>
        </a>
      )}

      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="rounded-full bg-gradient-to-r from-sky-500 to-blue-600 px-3 py-1 text-xs font-label font-bold uppercase tracking-[0.18em] text-white">
          {formatLongDate(lesson.date)}
        </span>
        {analysis && <CefrBadge band={analysis.cefrBand} score={analysis.overallScore} size="lg" />}
      </div>

      {lesson.topics?.length > 0 && (
        <div>
          <p className="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 mb-2">{t('lessons.detail.topicsCovered')}</p>
          <div className="flex flex-wrap gap-1.5">
            {lesson.topics.map((t, i) => (
              <span key={i} className="rounded-full bg-violet-50 border border-violet-200 px-2.5 py-1 text-xs font-label text-violet-700">{t}</span>
            ))}
          </div>
        </div>
      )}

      {/* Per-metric mini scores */}
      {analysis && (
        <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 md:grid-cols-5">
          {METRICS.map(m => {
            const val = analysis[m.key] || 0
            const tier = scoreToTier(val)
            return (
              <div key={m.key} className="rounded-[1rem] border border-slate-200/60 bg-white/90 px-3 py-2.5">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="material-symbols-outlined text-sm" style={{ color: m.hue.stroke }}>{m.icon}</span>
                  <p className="font-label text-[10px] font-bold uppercase tracking-[0.14em] text-slate-600 truncate">{m.shortLabel}</p>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="font-headline text-xl text-slate-900 tabular-nums">{Math.round(val)}</span>
                  <span className={`text-[9px] font-label font-bold uppercase tracking-[0.1em] ${tier.color}`}>{tier.label}</span>
                </div>
                <div className="mt-1.5 h-1 w-full rounded-full bg-slate-100 overflow-hidden">
                  <div className={`h-1 rounded-full ${tier.bar}`} style={{ width: `${val}%`, transition: 'width 900ms ease-out' }} />
                </div>
                {metricCommentary?.[m.key] && (
                  <p className="mt-2 text-[10px] text-slate-500 italic line-clamp-2">{metricCommentary[m.key].slice(0, 90)}...</p>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Analysis summary — light bullet version + collapsible deep details */}
      {analysis?.lessonSummary && (
        <LessonSummaryOnion summary={analysis.lessonSummary} title={t('lessons.detail.summaryHeading')} deeperLabel={t('dashboard.summary.technical')} />
      )}

      {/* Strengths card grid */}
      {analysis?.strengths?.length > 0 && (
        <div className="section-block rounded-[1.25rem] p-5">
          <p className="font-label text-xs font-bold uppercase tracking-[0.22em] text-emerald-700 mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-lg">celebration</span>
            {t('lessons.detail.strengthsHeading')}
            <span className="text-[10px] font-normal text-slate-400 tracking-normal normal-case">{t('lessons.detail.strengthsHint')}</span>
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            {analysis.strengths.filter(Boolean).map((s, i) => (
              <div key={i} className="insight-card is-strength">
                <span className="insight-icon">
                  <span className="material-symbols-outlined text-base">check_circle</span>
                </span>
                <p className="text-sm text-slate-700 leading-relaxed"><RichInline text={s} /></p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Improvements card grid — clickable to practice */}
      {analysis?.improvements?.length > 0 && (
        <div className="section-block rounded-[1.25rem] p-5">
          <p className="font-label text-xs font-bold uppercase tracking-[0.22em] text-amber-700 mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-lg">rocket_launch</span>
            {t('lessons.detail.improvementsHeading')}
            <span className="text-[10px] font-normal text-slate-400 tracking-normal normal-case">{t('lessons.detail.improvementsHint')}</span>
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            {analysis.improvements.filter(Boolean).map((s, i) => {
              const txt = typeof s === 'string' ? s : JSON.stringify(s)
              return (
                <button
                  key={i}
                  type="button"
                  onClick={(e) => {
                    e.preventDefault(); e.stopPropagation();
                    const slug = studentSlug || 'szymon-karpinski'
                    navigate(`/app/${slug}/practice?focus=${encodeURIComponent(txt.slice(0, 80))}`)
                  }}
                  className="insight-card is-improvement is-clickable block text-left w-full"
                >
                  <span className="insight-icon">
                    <span className="material-symbols-outlined text-base">trending_up</span>
                  </span>
                  <p className="text-sm text-slate-700 leading-relaxed"><RichInline text={s} /></p>
                  <span className="insight-practice-btn">
                    <span className="material-symbols-outlined text-[12px]">play_arrow</span>
                    {t('lessons.detail.practiceThis')}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Key errors — clickable cards */}
      {analysis?.keyErrors?.length > 0 && (
        <div className="section-block rounded-[1.25rem] p-5">
          <p className="font-label text-xs font-bold uppercase tracking-[0.22em] text-rose-700 mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-lg">flag_circle</span>
            {t('lessons.detail.errorsHeading')}
            <span className="text-[10px] font-normal text-slate-400 tracking-normal normal-case">{t('lessons.detail.errorsHint')}</span>
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            {analysis.keyErrors.map((err, i) => (
              <button
                key={i}
                type="button"
                onClick={(e) => {
                  e.preventDefault(); e.stopPropagation();
                  const cat = (err.category || 'grammar').toLowerCase()
                  const slug = studentSlug || 'szymon-karpinski'
                  navigate(`/app/${slug}/practice?category=${encodeURIComponent(cat)}&error=${encodeURIComponent(String(err.error || '').slice(0, 80))}`)
                }}
                className="insight-card is-error is-clickable block text-left w-full"
              >
                <span className="insight-icon">
                  <span className="material-symbols-outlined text-base">flag</span>
                </span>
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <p className="font-mono text-xs text-rose-700 italic leading-relaxed flex-1">"<RichInline text={err.error} />"</p>
                  {err.category && (
                    <span className="shrink-0 rounded-full bg-rose-100 border border-rose-200 px-2 py-0.5 text-[10px] font-label font-bold uppercase tracking-[0.12em] text-rose-700">{err.category}</span>
                  )}
                </div>
                {err.correction && (
                  <p className="text-xs text-emerald-700 leading-relaxed"><span className="font-bold">→</span> <RichInline text={err.correction} /></p>
                )}
                <span className="insight-practice-btn">
                  <span className="material-symbols-outlined text-[12px]">play_arrow</span>
                  {t('lessons.detail.drillThis')}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Practice advice — each item is a free-write challenge launcher */}
      {analysis?.practiceAdvice?.length > 0 && (
        <div className="section-block rounded-[1.25rem] p-5">
          <p className="font-label text-xs font-bold uppercase tracking-[0.22em] text-sky-700 mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-lg">tips_and_updates</span>
            {t('lessons.detail.adviceHeading')}
            <span className="text-[10px] font-normal text-slate-400 tracking-normal normal-case">{t('lessons.detail.adviceHint')}</span>
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            {analysis.practiceAdvice.map((p, i) => {
              const adviceText = typeof p === 'string' ? p : String(p || '')
              return (
                <button
                  key={i}
                  type="button"
                  onClick={(e) => {
                    e.preventDefault(); e.stopPropagation()
                    const slugStr = studentSlug || 'szymon-karpinski'
                    navigate(`/app/${slugStr}/practice?advice=${encodeURIComponent(adviceText.slice(0, 200))}`)
                  }}
                  className="advice-item text-left cursor-pointer hover:-translate-y-0.5 transition-all hover:shadow-md w-full"
                >
                  <span className="advice-number">{i + 1}</span>
                  <p className="text-sm text-slate-700 leading-relaxed"><RichInline text={p} /></p>
                  <span className="mt-2 inline-flex items-center gap-1 text-[10px] font-label font-bold uppercase tracking-[0.14em] text-sky-600">
                    <span className="material-symbols-outlined text-[12px]">edit_note</span>
                    {t('lessons.detail.openFreewrite')}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Personalized Recommendations — read from personalDetails */}
      {(() => {
        const recs = parsePersonalizedRecs(analysis || {})
        if (!recs) return null
        return <PersonalizedRecommendationsBlock recs={recs} />
      })()}

      {/* Vocabulary for this lesson */}
      {lesson.keywords?.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <p className="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-violet-700 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-sm">translate</span>
              {t('lessons.detail.vocabHeading', { n: lesson.keywords.length })}
            </p>
            <input
              type="search"
              placeholder={t('lessons.detail.searchKeywords')}
              value={keywordSearch}
              onChange={(e) => setKeywordSearch(e.target.value)}
              className="rounded-xl border border-slate-200/60 bg-white px-3 py-1.5 text-xs text-slate-700 placeholder:text-slate-400 focus:border-sky-300 focus:outline-none w-48"
            />
          </div>
          <p className="text-[11px] text-slate-400 italic mb-3">
            {t('lessons.detail.vocabHint')}
          </p>
          <div className="space-y-2">
            {filteredKeywords.map((kw, i) => {
              const wordKey = String(kw.word || '').toLowerCase()
              const isFocused = highlightKeyword === wordKey
              const isTarget = String(focusKeyword || '').toLowerCase() === wordKey
              return (
                <div
                  key={`${kw.word}-${i}`}
                  ref={el => { if (el) keywordRefs.current[wordKey] = el }}
                  className={isFocused ? 'commentary-highlight rounded-[1.25rem]' : ''}
                >
                  <KeywordCard
                    keyword={{
                      ...kw,
                      definition: kw.definition_en || kw.definition_pl,
                      definitionPl: kw.definition_pl,
                      example: kw.example_en || kw.example_pl,
                      cefr_level: kw.cefr_level,
                    }}
                    onYouglish={onYouglish}
                    forceExpanded={isTarget}
                  />
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
