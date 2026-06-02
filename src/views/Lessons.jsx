import { useState, useMemo, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useI18n } from '../i18n'
import { fetchJSONCached, fetchWithTimeout } from '../practice/lib/practice-cache'
import { ensureJsPdf, ensurePdfFonts } from '../utils/pdf-loader'
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
    // 30s AbortController-backed timeout — see practice-cache.ts.
    const resp = await fetchWithTimeout('/api/tts/tts', {
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
  // 30s AbortController-backed timeout — see practice-cache.ts.
  const resp = await fetchWithTimeout(`/api/youglish/keyword?q=${encodeURIComponent(query)}`)
  if (!resp.ok) throw new Error(`YouGlish ${resp.status}`)
  return resp.json()
}

// Map a free-form practice-advice line to a deep link into the practice
// arena. Returns { url, label } when we recognise the intent, otherwise
// null and the caller falls back to the generic free-write box.
//
// Mike 2026-05-04: every advice card should land the student in a useful
// shell + filter, not the generic free-write — the cards are the bridge
// from analysis to practice.
function classifyAdviceLink(text, slug) {
  const lower = String(text || '').toLowerCase()
  const base = `/app/${slug}/practice`
  // IMPORTANT: do NOT pass &advice= here. Practice.jsx checks
  // inFreeWriteMode (driven by adviceParam) BEFORE inFocusMode, so attaching
  // advice would dump the student back into the free-write box and skip the
  // FocusPicker we're trying to land them in.
  const link = (params, label) => ({ url: `${base}?${params}`, label })

  // Pronunciation drills — Speakeasy / Listening Comp
  if (/(minimal pair|pronunciation drill|pronunciation practice|phoneme|word stress|silent letter|consonant cluster|vowel sound|stress placement|polysyllabic)/.test(lower)) {
    return link('category=pronunciation', 'Open pronunciation drill')
  }

  // Reflexive vs reciprocal pronouns — Sentence Correction grammar
  if (/(reflexive|reciprocal|each other|one another|pronoun (use|filter|drill))/.test(lower)) {
    return link('category=grammar&focus=reflexive', 'Open pronoun grammar drill')
  }

  // Word formation / suffix transforms / nationality adjectives
  if (/(word formation|suffix|nationality adjective|noun.*verb.*transform|verb to noun|adjective to adverb|adjective to noun|transformation drill)/.test(lower)) {
    return link('category=vocabulary&focus=word%20formation', 'Open word formation drill')
  }

  // Used to / be used to / get used to
  if (/(\bused to\b|be used to|get used to|getting used to)/.test(lower)) {
    return link('category=grammar&focus=used%20to', 'Open used-to grammar drill')
  }

  // Article / determiner
  if (/(article (use|usage|omission)|definite article|indefinite article|determiner|the\/a\/an)/.test(lower)) {
    return link('category=grammar&focus=article', 'Open article drill')
  }

  // Tense — present perfect / past simple
  if (/(present perfect|past simple|past participle|verb tense|tense (use|drill|workshop))/.test(lower)) {
    return link('category=grammar&focus=tense', 'Open verb tense drill')
  }

  // Preposition collocations
  if (/(preposition|prepositional|interested in|depend on|focus on)/.test(lower)) {
    return link('category=grammar&focus=preposition', 'Open preposition drill')
  }

  // Reading comprehension / summarising
  if (/(reading comprehension|article reading|read aloud|summari[sz]e|reading task|extended reading)/.test(lower)) {
    return link('category=fluency&focus=reading', 'Open reading drill')
  }

  // Speaking / monologue / role-play / extended turns — fluency
  if (/(monologue|extended turn|speaking practice|role[- ]?play|conversation drill|spoken summary)/.test(lower)) {
    return link('category=fluency&focus=speaking', 'Open speaking drill')
  }

  // Vocabulary review / collocation / chunk
  if (/(collocation|chunk|fixed expression|set phrase|vocabulary review|target keyword)/.test(lower)) {
    return link('category=vocabulary', 'Open vocabulary drill')
  }

  // Subject-verb agreement
  if (/(subject.{0,3}verb|agreement|third[- ]?person|3rd person|singular.{0,3}plural)/.test(lower)) {
    return link('category=grammar&focus=agreement', 'Open agreement drill')
  }

  // No match — fall back to free-write
  return null
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

// PDF loader helpers (loadScript, ensureJsPdf, ensurePdfFonts) hoisted to
// src/utils/pdf-loader.js (Tier 3 cleanup, 2026-05-02). Three callsites
// (this file, src/views/v3/lessons-pdf.js, src/views/admin/StudentDetail.jsx)
// previously each had a private copy.

async function generateLessonPdf(profile, lesson, analysis) {
  let jspdfLib
  try {
    jspdfLib = await ensureJsPdf()
  } catch (e) {
    console.error('[PDF] jsPDF load failed', e)
    alert('PDF library failed to load. Check your connection and try again.')
    return
  }
  if (!jspdfLib?.jsPDF) { alert('PDF library not loaded.'); return }
  try {
    await ensurePdfFonts()
  } catch (e) {
    console.warn('[PDF] fonts failed, proceeding with defaults', e)
  }
  const { jsPDF } = jspdfLib
  const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true })
  try {
    doc.addFileToVFS('NotoSans-Regular.ttf', window.__NOTO_REGULAR_B64)
    doc.addFont('NotoSans-Regular.ttf', 'NotoSans-Regular', 'normal')
    doc.addFileToVFS('NotoSans-Bold.ttf', window.__NOTO_BOLD_B64)
    doc.addFont('NotoSans-Bold.ttf', 'NotoSans-Bold', 'bold')
  } catch (e) { console.warn('Font load', e) }

  // Wait for brand fonts so the canvas wordmark chip renders correctly.
  try {
    await Promise.all([
      document.fonts.load('900 72px "Plus Jakarta Sans"'),
      document.fonts.load('800 30px "Plus Jakarta Sans"'),
      document.fonts.load('italic 500 48px "Newsreader"'),
    ])
  } catch {}

  // Load the skyline silhouette for the wordmark chip.
  let skylineImg = null
  try {
    skylineImg = await new Promise((resolve, reject) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => resolve(img)
      img.onerror = reject
      img.src = '/em-skyline.png'
    })
  } catch {}

  const W = 595
  const H = 842
  const MX = 42
  const FH = 38

  // Editorial palette — clean white background, navy headings, fuchsia
  // accent for numerals + Metro., sky/teal/amber for metrics.
  const C = {
    navy:       [12, 22, 46],
    navyDeep:   [8, 15, 35],
    slate900:   [15, 23, 42],
    slate800:   [30, 41, 59],
    slate700:   [51, 65, 85],
    slate600:   [71, 85, 105],
    slate500:   [100, 116, 139],
    slate400:   [148, 163, 184],
    slate300:   [203, 213, 225],
    slate200:   [226, 232, 240],
    slate100:   [241, 245, 249],
    slate50:    [248, 250, 252],
    fuchsia:    [217, 70, 239],
    fuchsiaDeep:[168, 31, 193],
    pink:       [236, 72, 153],
    violet:     [139, 92, 246],
    violetDeep: [109, 40, 217],
    purple:     [168, 85, 247],
    indigo:     [99, 102, 241],
    blue:       [59, 130, 246],
    skyDeep:    [3, 105, 161],
    sky:        [56, 189, 248],
    teal:       [20, 184, 166],
    cyan:       [34, 211, 238],
    emerald:    [16, 185, 129],
    emeraldDeep:[4, 120, 87],
    amber:      [245, 158, 11],
    amberDeep:  [217, 119, 6],
    rose:       [244, 63, 94],
    roseDeep:   [190, 18, 60],
    white:      [255, 255, 255],
    creamBg:    [252, 247, 237],
    violetBg:   [243, 238, 255],
    fuchsiaBg:  [253, 232, 255],
    skyBg:      [240, 249, 255],
    emeraldBg:  [209, 250, 229],
    amberBg:    [254, 243, 199],
    roseBg:     [254, 226, 226],
  }

  const setColor  = (c) => doc.setTextColor(c[0], c[1], c[2])
  const setFill   = (c) => doc.setFillColor(c[0], c[1], c[2])
  const setStroke = (c) => doc.setDrawColor(c[0], c[1], c[2])
  const fontR = () => doc.setFont('NotoSans-Regular', 'normal')
  const fontB = () => doc.setFont('NotoSans-Bold', 'bold')
  const roundRect = (x, y, w, h, r, style = 'S') => doc.roundedRect(x, y, w, h, r, r, style)

  function programKicker() {
    if (!profile?.type) return 'ENGLISH METROPOLIS'
    if (profile.type === 'individual') return 'PVT · ENGLISH METROPOLIS'
    return 'CONVERSA SCHOOL · ENGLISH METROPOLIS'
  }

  function formatDateLong(iso) {
    if (!iso) return ''
    try {
      const d = new Date(`${iso}T00:00:00`)
      return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    } catch { return iso }
  }

  // ------------------------------------------------------------------------
  // Build a small stacked wordmark lockup as a canvas PNG. Transparent bg
  // so it sits cleanly on the white PDF page. Skyline + English / Metro.
  // ------------------------------------------------------------------------
  function buildWordmarkChip(pxW, pxH) {
    const canvas = document.createElement('canvas')
    canvas.width = pxW; canvas.height = pxH
    const ctx = canvas.getContext('2d')

    // Skyline on top (small, only silhouette tops)
    let skyH = 0
    if (skylineImg) {
      const skyW_c = Math.round(pxW * 0.92)
      skyH = Math.round(skyW_c * (skylineImg.height / skylineImg.width) * 0.55)
      const sc = document.createElement('canvas')
      sc.width = skyW_c; sc.height = skyH
      const sctx = sc.getContext('2d')
      const grad = sctx.createLinearGradient(0, 0, skyW_c, skyH)
      grad.addColorStop(0, '#d946ef')
      grad.addColorStop(1, '#a855f7')
      sctx.fillStyle = grad; sctx.fillRect(0, 0, skyW_c, skyH)
      sctx.globalCompositeOperation = 'destination-in'
      // Use top-half of the skyline graphic so it reads as a compact silhouette
      sctx.drawImage(skylineImg, 0, 0, skylineImg.width, skylineImg.height * 0.55,
                                 0, 0, skyW_c, skyH)
      ctx.drawImage(sc, Math.round((pxW - skyW_c) / 2), 0)
    }

    // "English" — dark navy, stacked bold
    const wSize = Math.round(pxH * 0.33)
    ctx.font = `900 ${wSize}px "Plus Jakarta Sans", "Inter", sans-serif`
    ctx.fillStyle = '#0c1226'
    const englishY = skyH + wSize * 1.05
    ctx.fillText('English', 0, englishY)

    // "Metro." — fuchsia → purple gradient stacked
    const metroY = englishY + wSize * 0.98
    const metroGrad = ctx.createLinearGradient(0, metroY - wSize, pxW, metroY)
    metroGrad.addColorStop(0, '#d946ef')
    metroGrad.addColorStop(0.6, '#a855f7')
    metroGrad.addColorStop(1, '#7c3aed')
    ctx.fillStyle = metroGrad
    ctx.fillText('Metro', 0, metroY)
    const mw = ctx.measureText('Metro').width
    // Amber dot
    ctx.fillStyle = '#fbbf24'
    ctx.fillText('.', mw, metroY)

    return canvas.toDataURL('image/png')
  }

  // ------------------------------------------------------------------------
  // Page headers — white, editorial. Left: wordmark chip. Right: student
  // identity (name, subtitle, date + score pill, context chips).
  // ------------------------------------------------------------------------
  const WORDMARK_PDF_W = 88
  const WORDMARK_PDF_H = 68
  const WORDMARK_CANVAS_W = 440
  const WORDMARK_CANVAS_H = 340

  function drawHero(pageIdx) {
    // Kicker above the wordmark (violet, letter-spaced caps)
    fontB(); doc.setFontSize(7.5); setColor(C.violet)
    doc.text(programKicker(), MX, MX - 4, { charSpace: 1.4 })

    // Wordmark lockup chip
    const chipDataURL = buildWordmarkChip(WORDMARK_CANVAS_W, WORDMARK_CANVAS_H)
    doc.addImage(chipDataURL, 'PNG', MX, MX + 2, WORDMARK_PDF_W, WORDMARK_PDF_H, undefined, 'FAST')

    const rightX = W - MX

    if (pageIdx === 1) {
      // Student name — big bold navy (treated as display title)
      fontB(); doc.setFontSize(28); setColor(C.navyDeep)
      doc.text(profile?.name || 'Student', rightX, MX + 14, { align: 'right' })

      // Lesson title — medium grey
      fontR(); doc.setFontSize(11.5); setColor(C.slate500)
      const titleLines = doc.splitTextToSize(lesson?.title || 'Lesson', 340)
      let ty = MX + 32
      for (const ln of titleLines.slice(0, 2)) {
        doc.text(ln, rightX, ty, { align: 'right' })
        ty += 14
      }

      // Date pill + score pill row (right-aligned)
      const pillY = ty + 4
      let pillX = rightX

      if (analysis) {
        const band = analysis.cefrBand || profile?.level || 'B2'
        const score = Math.round(analysis.overallScore || 0)
        const scoreText = `${band}   ${score}/100`
        fontB(); doc.setFontSize(10)
        const scoreW = doc.getTextWidth(scoreText) + 20
        // Gradient pill — approximate with overlaid fuchsia/violet rects
        setFill(C.fuchsia); roundRect(pillX - scoreW, pillY - 10, scoreW, 18, 9, 'F')
        setFill(C.violet);  roundRect(pillX - scoreW + scoreW * 0.45, pillY - 10, scoreW * 0.55, 18, 9, 'F')
        // Clip-ish: draw the pill outline once more to round the right half
        setFill(C.violet);  roundRect(pillX - scoreW * 0.35, pillY - 10, scoreW * 0.35, 18, 9, 'F')
        setColor(C.white)
        // Band label (left part, smaller bold)
        fontB(); doc.setFontSize(9)
        doc.text(band, pillX - scoreW + 10, pillY + 2.5)
        // Score (right part, bold)
        doc.setFontSize(10)
        doc.text(`${score}/100`, pillX - 10, pillY + 2.5, { align: 'right' })
        pillX -= scoreW + 10
      }

      if (lesson?.date) {
        fontR(); doc.setFontSize(9.5)
        const dText = formatDateLong(lesson.date)
        const dW = doc.getTextWidth(dText) + 22
        setFill(C.slate100); setStroke(C.slate200); doc.setLineWidth(0.5)
        roundRect(pillX - dW, pillY - 10, dW, 18, 9, 'FD')
        // Small calendar glyph (just a dot so we don't pull in icon fonts)
        setFill(C.slate500); doc.circle(pillX - dW + 8, pillY - 1, 1.6, 'F')
        setColor(C.slate700)
        doc.text(dText, pillX - dW + 14, pillY + 2.5)
        pillX -= dW + 8
      }

      // Context chips row — topics + program
      const chipsY = pillY + 18
      const chips = []
      if (profile?.type === 'individual') chips.push({ t: 'PVT 1:1', c: C.violetDeep, bg: C.violetBg })
      const topicChips = (lesson?.topics || []).slice(0, 4).map(t => ({ t, c: C.slate700, bg: C.slate100 }))
      chips.push(...topicChips)
      if (analysis?.cefrBand) chips.push({ t: analysis.cefrBand, c: C.emeraldDeep, bg: C.emeraldBg })

      let cx = rightX
      fontB(); doc.setFontSize(8)
      for (const ch of chips) {
        const tw = doc.getTextWidth(ch.t) + 14
        setFill(ch.bg); setStroke(ch.bg); doc.setLineWidth(0.4)
        roundRect(cx - tw, chipsY, tw, 14, 7, 'FD')
        setColor(ch.c)
        doc.text(ch.t, cx - 7, chipsY + 9.5, { align: 'right', charSpace: 0.4 })
        cx -= tw + 4
        if (cx < MX + WORDMARK_PDF_W + 10) break
      }

      // Divider rule below the hero
      setStroke(C.slate200); doc.setLineWidth(0.5)
      doc.line(MX, MX + WORDMARK_PDF_H + 14, W - MX, MX + WORDMARK_PDF_H + 14)
    } else {
      // Compact header (pages 2+) — same lockup, right side: "Lesson
      // Diagnostics & Practice" + date + score pill.
      fontB(); doc.setFontSize(22); setColor(C.navyDeep)
      doc.text('Lesson Diagnostics & Practice', rightX, MX + 24, { align: 'right' })

      const pillY = MX + 48
      let pillX = rightX
      if (analysis) {
        const band = analysis.cefrBand || 'B2'
        const score = Math.round(analysis.overallScore || 0)
        fontB(); doc.setFontSize(10)
        const scoreText = `${band}   ${score}/100`
        const scoreW = doc.getTextWidth(scoreText) + 20
        setFill(C.fuchsia); roundRect(pillX - scoreW, pillY - 10, scoreW, 18, 9, 'F')
        setFill(C.violet);  roundRect(pillX - scoreW * 0.55, pillY - 10, scoreW * 0.55, 18, 9, 'F')
        setColor(C.white)
        fontB(); doc.setFontSize(9)
        doc.text(band, pillX - scoreW + 10, pillY + 2.5)
        doc.setFontSize(10)
        doc.text(`${score}/100`, pillX - 10, pillY + 2.5, { align: 'right' })
        pillX -= scoreW + 10
      }
      if (lesson?.date) {
        fontR(); doc.setFontSize(9.5)
        const dText = formatDateLong(lesson.date)
        const dW = doc.getTextWidth(dText) + 22
        setFill(C.slate100); setStroke(C.slate200); doc.setLineWidth(0.5)
        roundRect(pillX - dW, pillY - 10, dW, 18, 9, 'FD')
        setFill(C.slate500); doc.circle(pillX - dW + 8, pillY - 1, 1.6, 'F')
        setColor(C.slate700)
        doc.text(dText, pillX - dW + 14, pillY + 2.5)
      }

      setStroke(C.slate200); doc.setLineWidth(0.5)
      doc.line(MX, MX + WORDMARK_PDF_H + 14, W - MX, MX + WORDMARK_PDF_H + 14)
    }
  }

  function drawFooter(pageIdx) {
    // Thin slate rule + kicker left, student center, page right
    setStroke(C.slate200); doc.setLineWidth(0.4)
    doc.line(MX, H - FH + 8, W - MX, H - FH + 8)
    fontR(); doc.setFontSize(8.5); setColor(C.slate500)
    doc.text(programKicker(), MX, H - FH + 22, { charSpace: 0.8 })
    doc.text(`${profile?.name || 'Student'} — Lesson Analysis`, W / 2, H - FH + 22, { align: 'center' })
    doc.text(`Page ${pageIdx} of ${doc.getNumberOfPages() || pageIdx}`, W - MX, H - FH + 22, { align: 'right' })
    setColor(C.violetDeep); doc.setFontSize(7.5)
    doc.text('englishmetro.com', W - MX, H - FH + 32, { align: 'right', charSpace: 1.0 })
  }

  const CONTENT_TOP_P1 = MX + WORDMARK_PDF_H + 32
  const CONTENT_TOP_PN = MX + WORDMARK_PDF_H + 32
  const CONTENT_BOTTOM = H - FH - 14

  let pageNum = 1
  let y = CONTENT_TOP_P1

  function ensureSpace(need) {
    if (y + need > CONTENT_BOTTOM) {
      drawFooter(pageNum)
      doc.addPage()
      pageNum += 1
      drawHero(pageNum)
      y = CONTENT_TOP_PN
    }
  }

  // ------------------------------------------------------------------------
  // Content primitives
  // ------------------------------------------------------------------------

  function sectionHeader(num, title) {
    ensureSpace(42)
    fontB(); doc.setFontSize(32); setColor(C.fuchsia)
    doc.text(String(num), MX, y + 18)
    fontB(); doc.setFontSize(16); setColor(C.navyDeep)
    doc.text(title, MX + 28, y + 12)
    y += 26
  }

  function paragraphBlock(text, opts = {}) {
    const { size = 10.5, color = C.slate700, leading = 14.5, paraGap = 8, indent = 0, maxLines = 200 } = opts
    if (!text) return
    const paras = String(text).split(/\n\s*\n+/).map(p => p.trim()).filter(Boolean)
    fontR(); doc.setFontSize(size); setColor(color)
    const width = W - MX * 2 - indent
    let lineCount = 0
    for (const para of paras) {
      const lines = doc.splitTextToSize(para, width)
      for (const ln of lines) {
        if (lineCount >= maxLines) return
        ensureSpace(leading)
        doc.text(ln, MX + indent, y)
        y += leading
        lineCount++
      }
      y += paraGap
    }
  }

  function bulletList(items, opts = {}) {
    const { marker = '•', color = C.fuchsia, size = 10.5, leading = 14, indent = 18, gap = 4, textColor = C.slate700 } = opts
    if (!items || !items.length) return
    fontR(); doc.setFontSize(size)
    const width = W - MX * 2 - indent
    for (const raw of items) {
      const t = typeof raw === 'string' ? raw : String(raw?.text || raw?.error || '')
      if (!t) continue
      const lines = doc.splitTextToSize(t, width)
      ensureSpace(lines.length * leading + gap)
      fontB(); setColor(color); doc.setFontSize(size + 1)
      doc.text(marker, MX, y)
      fontR(); setColor(textColor); doc.setFontSize(size)
      for (let i = 0; i < lines.length; i++) {
        doc.text(lines[i], MX + indent, y)
        y += leading
      }
      y += gap
    }
  }

  // ------------------------------------------------------------------------
  // Section 1 — Performance Snapshot (gradient horizontal bars)
  // ------------------------------------------------------------------------
  const METRIC_CONFIG = [
    { key: 'vocabularyRange',            label: 'Vocabulary',    color: C.violet,  soft: C.violetBg },
    { key: 'grammaticalAccuracy',        label: 'Grammar',       color: C.indigo,  soft: C.skyBg },
    { key: 'fluencyAndCoherence',        label: 'Fluency',       color: C.sky,     soft: C.skyBg },
    { key: 'pronunciation',              label: 'Pronunciation', color: C.amber,   soft: C.amberBg },
    { key: 'communicativeEffectiveness', label: 'Communication', color: C.fuchsia, soft: C.fuchsiaBg },
  ]

  function renderPerformance() {
    if (!analysis) return
    sectionHeader(1, 'Performance Snapshot')
    y += 6
    const labelW = 124
    const scoreW = 36
    const barX = MX + labelW + 14
    const barW = W - MX - barX - scoreW - 10
    const rowH = 22
    for (const m of METRIC_CONFIG) {
      const v = Math.max(0, Math.min(100, analysis[m.key] || 0))
      ensureSpace(rowH + 4)
      // Soft tinted dot
      setFill(m.soft); doc.circle(MX + 6, y + 6, 5.5, 'F')
      setFill(m.color); doc.circle(MX + 6, y + 6, 3, 'F')
      // Label
      fontB(); doc.setFontSize(11); setColor(C.slate800)
      doc.text(m.label, MX + 18, y + 9)
      // Bar track
      setFill(C.slate100); roundRect(barX, y + 3, barW, 10, 5, 'F')
      // Fill
      setFill(m.color); roundRect(barX, y + 3, Math.max(6, barW * (v / 100)), 10, 5, 'F')
      // Score
      fontB(); doc.setFontSize(12); setColor(C.slate900)
      doc.text(String(Math.round(v)), W - MX, y + 10, { align: 'right' })
      y += rowH
    }
    y += 14
  }

  // ------------------------------------------------------------------------
  // Section 2 — Lesson Summary & Clinical Analysis
  // Long-form prose, multi-paragraph. Matches LessonSummaryOnion on the web.
  // ------------------------------------------------------------------------
  function renderSummary() {
    if (!analysis?.lessonSummary) return
    sectionHeader(2, 'Lesson Summary & Clinical Analysis')
    y += 6
    paragraphBlock(String(analysis.lessonSummary), { size: 10.5, color: C.slate700, leading: 14.5, paraGap: 10 })
    y += 6
  }

  // ------------------------------------------------------------------------
  // Sections 3 & 4 — What You Nailed / What to Work On (two-column)
  // ------------------------------------------------------------------------
  function renderStrengthsImprovements() {
    const s = analysis?.strengths || []
    const i = analysis?.improvements || []
    if (!s.length && !i.length) return

    ensureSpace(60)
    const startY = y
    const colW = (W - MX * 2 - 24) / 2
    const leftX = MX
    const rightXCol = MX + colW + 24

    // Headers
    fontB(); doc.setFontSize(32); setColor(C.emerald)
    doc.text('3', leftX, startY + 18)
    fontB(); doc.setFontSize(15); setColor(C.navyDeep)
    doc.text('What You Nailed', leftX + 28, startY + 12)

    fontB(); doc.setFontSize(32); setColor(C.amber)
    doc.text('4', rightXCol, startY + 18)
    fontB(); doc.setFontSize(15); setColor(C.navyDeep)
    doc.text('What to Work On', rightXCol + 28, startY + 12)
    y = startY + 32

    const renderCol = (items, colX, markerDraw) => {
      let cy = y
      fontR(); doc.setFontSize(10); setColor(C.slate700)
      for (const item of items.slice(0, 6)) {
        const text = typeof item === 'string' ? item : String(item?.text || '')
        if (!text) continue
        const lines = doc.splitTextToSize(text, colW - 20)
        const blockH = lines.length * 13 + 6
        if (cy + blockH > CONTENT_BOTTOM) break
        markerDraw(colX, cy)
        for (let li = 0; li < lines.length; li++) {
          doc.text(lines[li], colX + 18, cy + 4 + li * 13)
        }
        cy += blockH
      }
      return cy
    }

    const leftEnd = renderCol(s, leftX, (x, ry) => {
      setStroke(C.emerald); setFill(C.white); doc.setLineWidth(1.2)
      doc.circle(x + 6, ry + 2, 5, 'FD')
      fontB(); doc.setFontSize(9); setColor(C.emerald)
      doc.text('✓', x + 6, ry + 5, { align: 'center' })
      fontR(); setColor(C.slate700); doc.setFontSize(10)
    })
    const rightEnd = renderCol(i, rightXCol, (x, ry) => {
      setStroke(C.amber); setFill(C.white); doc.setLineWidth(1.2)
      doc.circle(x + 6, ry + 2, 5, 'FD')
      fontB(); doc.setFontSize(9); setColor(C.amber)
      doc.text('!', x + 6, ry + 5, { align: 'center' })
      fontR(); setColor(C.slate700); doc.setFontSize(10)
    })
    y = Math.max(leftEnd, rightEnd) + 12
  }

  // ------------------------------------------------------------------------
  // Section 5 — Key Errors & Corrections (3-column table)
  // ------------------------------------------------------------------------
  function renderKeyErrors() {
    if (!analysis?.keyErrors?.length) return
    sectionHeader(4, 'Key Errors & Corrections')
    y += 6

    // Column geometry
    const col1X = MX + 18           // #
    const col2X = MX + 38           // utterance
    const col3X = MX + 220          // arrow + corrected
    const col4X = W - MX - 78       // category chip

    // Header row
    fontB(); doc.setFontSize(8); setColor(C.violet)
    doc.text('STUDENT UTTERANCE', col2X, y, { charSpace: 1.3 })
    doc.text('CORRECTED VERSION', col3X + 16, y, { charSpace: 1.3 })
    doc.text('CATEGORY', W - MX, y, { align: 'right', charSpace: 1.3 })
    y += 8
    setStroke(C.slate200); doc.setLineWidth(0.5)
    doc.line(MX, y, W - MX, y)
    y += 10

    for (let idx = 0; idx < analysis.keyErrors.length; idx++) {
      const e = analysis.keyErrors[idx]
      const errText  = typeof e === 'string' ? e : (e?.error || '')
      const corrText = (typeof e === 'object' && e?.correction) || ''
      const catText  = (typeof e === 'object' && e?.category) || ''
      if (!errText) continue

      fontR(); doc.setFontSize(9.5)
      const errLines = doc.splitTextToSize(`"${errText}"`, col3X - col2X - 14)
      const corrLines = doc.splitTextToSize(corrText ? `"${corrText}"` : '', col4X - col3X - 24)
      const rowH = Math.max(errLines.length, corrLines.length, 1) * 12 + 6
      ensureSpace(rowH)

      // #
      setFill(C.violetBg); doc.circle(MX + 6, y + 3, 7, 'F')
      fontB(); doc.setFontSize(8); setColor(C.violet)
      doc.text(String(idx + 1), MX + 6, y + 5.5, { align: 'center' })

      // Utterance (slate-700)
      fontR(); doc.setFontSize(9.5); setColor(C.slate700)
      for (let li = 0; li < errLines.length; li++) {
        doc.text(errLines[li], col2X, y + 4 + li * 12)
      }

      // Arrow
      fontB(); doc.setFontSize(11); setColor(C.violet)
      doc.text('→', col3X, y + 5)

      // Corrected (navy)
      if (corrText) {
        fontR(); doc.setFontSize(9.5); setColor(C.navyDeep)
        for (let li = 0; li < corrLines.length; li++) {
          doc.text(corrLines[li], col3X + 16, y + 4 + li * 12)
        }
      }

      // Category chip
      if (catText) {
        const pal = catText === 'FORM' ? { bg: C.fuchsiaBg, fg: C.fuchsiaDeep }
                  : catText === 'VOCABULARY' ? { bg: C.violetBg, fg: C.violetDeep }
                  : catText === 'PRONUNCIATION' ? { bg: C.amberBg, fg: C.amberDeep }
                  : catText === 'REGISTER' ? { bg: C.skyBg, fg: C.skyDeep }
                  : { bg: C.slate100, fg: C.slate700 }
        fontB(); doc.setFontSize(7.5)
        const chipText = catText.toUpperCase()
        const cw = doc.getTextWidth(chipText) + 12
        setFill(pal.bg); roundRect(W - MX - cw, y + 1, cw, 12, 6, 'F')
        setColor(pal.fg)
        doc.text(chipText, W - MX - 6, y + 9, { align: 'right', charSpace: 0.6 })
      }

      y += rowH + 2
      setStroke(C.slate100); doc.setLineWidth(0.3)
      doc.line(MX, y, W - MX, y)
      y += 6
    }
    y += 6
  }

  // ------------------------------------------------------------------------
  // Section 6 — Practice Advice (cream card with colored label prefixes)
  // ------------------------------------------------------------------------
  const PRACTICE_LABELS = [
    { match: /^grammar/i,        label: 'Grammar Focus',         color: C.violetDeep },
    { match: /^vocabulary/i,     label: 'Vocabulary Building',   color: C.fuchsiaDeep },
    { match: /^fluency/i,        label: 'Fluency Drill',         color: C.skyDeep },
    { match: /^pronunciation/i,  label: 'Pronunciation',         color: C.amberDeep },
    { match: /^communication/i,  label: 'Communication Strategy',color: C.emeraldDeep },
  ]

  function classifyPractice(text) {
    const first = String(text || '').split(':')[0].trim()
    for (const rule of PRACTICE_LABELS) {
      if (rule.match.test(first)) return { ...rule, rest: text.replace(new RegExp(`^${first}\\s*:?\\s*`, 'i'), '') }
    }
    return { label: 'Practice', color: C.slate700, rest: text }
  }

  function renderPracticeAdvice() {
    if (!analysis?.practiceAdvice?.length) return
    sectionHeader(5, 'Practice Advice')
    y += 4

    // Cream card
    ensureSpace(90)
    const cardStart = y
    setFill(C.creamBg); setStroke(C.amberBg); doc.setLineWidth(0.6)
    const cardX = MX, cardY = y
    // Draw after we know the height by pre-rendering text lines into a buffer
    const pad = 14
    let textY = cardY + pad + 4

    fontR(); doc.setFontSize(10)
    for (const raw of analysis.practiceAdvice.slice(0, 8)) {
      const { label, color, rest } = classifyPractice(raw)
      const text = rest || String(raw)
      const lines = doc.splitTextToSize(text, W - MX * 2 - pad * 2 - doc.getTextWidth(label + ':  '))
      ensureSpace(lines.length * 13 + 6)
      // label
      fontB(); setColor(color)
      doc.text(`${label}:`, cardX + pad, textY)
      const labelW = doc.getTextWidth(`${label}:`) + 6
      // rest
      fontR(); setColor(C.slate700)
      for (let li = 0; li < lines.length; li++) {
        doc.text(lines[li], cardX + pad + labelW, textY + li * 13)
      }
      textY += Math.max(13, lines.length * 13) + 5
    }
    textY += pad
    const cardH = textY - cardY
    // Now draw the card background under the text — overpaint is fine since
    // PDF renders in order, but text was already rendered. Instead, stash the
    // pre-card y and re-render. For simplicity, draw a thin left rule instead.
    setFill(C.amber); doc.rect(cardX, cardStart, 2.2, cardH, 'F')
    setStroke(C.amberBg); doc.setLineWidth(0.6)
    roundRect(cardX, cardStart, W - MX * 2, cardH, 8, 'S')
    y = textY + 4
  }

  // ------------------------------------------------------------------------
  // Section 7 — Personalized Recommendations (4-up grid)
  // ------------------------------------------------------------------------
  function extractRecommendations() {
    const direct = Array.isArray(analysis?.recommendations) ? analysis.recommendations : []
    if (direct.length) return direct
    const raw = (analysis?.personalDetails || []).find((x) => String(x).startsWith('personalizedRecs:'))
    if (!raw) return []
    try {
      const parsed = JSON.parse(String(raw).replace(/^personalizedRecs:/, ''))
      return Array.isArray(parsed?.recommendations) ? parsed.recommendations : []
    } catch { return [] }
  }

  function renderRecommendations() {
    const recs = extractRecommendations()
    if (!recs.length) return
    sectionHeader(6, 'Personalized Recommendations')
    y += 4

    const gap = 10
    const colW = (W - MX * 2 - gap) / 2
    const cardH = 100

    const palette = (type) => {
      const t = String(type || '').toUpperCase()
      if (t === 'YOUTUBE')  return { chip: C.rose,        bg: C.roseBg }
      if (t === 'PODCAST')  return { chip: C.emeraldDeep, bg: C.emeraldBg }
      if (t === 'ARTICLE')  return { chip: C.amberDeep,   bg: C.amberBg }
      if (t === 'BOOK')     return { chip: C.violetDeep,  bg: C.violetBg }
      if (t === 'COURSE')   return { chip: C.skyDeep,     bg: C.skyBg }
      return { chip: C.fuchsiaDeep, bg: C.fuchsiaBg }
    }

    for (let i = 0; i < Math.min(4, recs.length); i++) {
      const r = recs[i]
      if (i % 2 === 0) ensureSpace(cardH + 8)
      const col = i % 2
      const row = Math.floor(i / 2)
      const cx = MX + col * (colW + gap)
      const cy = y + row * (cardH + gap)
      const pal = palette(r.type)

      // Border
      setStroke(C.slate200); doc.setLineWidth(0.6)
      setFill(C.white)
      roundRect(cx, cy, colW, cardH, 10, 'FD')
      // Type chip
      fontB(); doc.setFontSize(7.5)
      const chipText = String(r.type || 'RESOURCE').toUpperCase()
      const cwChip = doc.getTextWidth(chipText) + 12
      setFill(pal.bg); roundRect(cx + 10, cy + 10, cwChip, 12, 6, 'F')
      setColor(pal.chip)
      doc.text(chipText, cx + 16, cy + 18, { charSpace: 0.6 })

      // Title
      fontB(); doc.setFontSize(11); setColor(C.navyDeep)
      const titleLines = doc.splitTextToSize(r.title || 'Recommendation', colW - 20)
      doc.text(titleLines[0], cx + 10, cy + 36)
      if (titleLines[1]) doc.text(titleLines[1], cx + 10, cy + 48)
      // Creator
      fontR(); doc.setFontSize(9); setColor(C.slate500)
      if (r.creator) doc.text(r.creator, cx + 10, cy + 60)

      // Why / How (compressed)
      fontR(); doc.setFontSize(8.5); setColor(C.slate600)
      const why = r.whyThisMatches ? doc.splitTextToSize(`Why: ${r.whyThisMatches}`, colW - 20).slice(0, 2) : []
      const how = r.howToUse ? doc.splitTextToSize(`How: ${r.howToUse}`, colW - 20).slice(0, 2) : []
      let yy = cy + 72
      for (const ln of why) { doc.text(ln, cx + 10, yy); yy += 10 }
      for (const ln of how) { doc.text(ln, cx + 10, yy); yy += 10 }

      // URL
      if (r.url) {
        fontR(); doc.setFontSize(7.5); setColor(C.violetDeep)
        doc.text(String(r.url).replace(/^https?:\/\//, '').slice(0, 60), cx + 10, cy + cardH - 8)
      }
    }
    const rows = Math.ceil(Math.min(4, recs.length) / 2)
    y += rows * (cardH + gap) + 4
  }

  // ------------------------------------------------------------------------
  // Section 8 — Vocabulary Bank (dense 2-column list)
  // ------------------------------------------------------------------------
  function renderVocabulary() {
    if (!lesson?.keywords?.length) return
    sectionHeader(7, `Vocabulary Bank · ${lesson.keywords.length} keywords`)
    y += 4

    const gap = 16
    const colW = (W - MX * 2 - gap) / 2
    let col = 0
    const colY = [y, y]
    const max = Math.min(36, lesson.keywords.length)
    for (let i = 0; i < max; i++) {
      const kw = lesson.keywords[i]
      let cy = colY[col]
      const colX = MX + col * (colW + gap)
      const exText = kw.exampleEn || kw.example_en
      const needed = 20 + (exText ? 18 : 0)
      if (cy + needed > CONTENT_BOTTOM) {
        if (col === 0) { col = 1; continue }
        // Both columns full -> new page
        drawFooter(pageNum); doc.addPage(); pageNum += 1
        drawHero(pageNum)
        colY[0] = CONTENT_TOP_PN; colY[1] = CONTENT_TOP_PN
        col = 0
        cy = colY[col]
      }
      // Word
      fontB(); doc.setFontSize(10.5); setColor(C.violetDeep)
      doc.text(String(kw.word || ''), colX, cy + 4)
      // IPA
      if (kw.ipa) {
        fontR(); doc.setFontSize(8.5); setColor(C.slate500)
        doc.text(String(kw.ipa).slice(0, 30), colX + doc.getTextWidth(String(kw.word || '')) + 6, cy + 4)
      }
      cy += 12
      // Translation (fuchsia)
      if (kw.translation) {
        fontR(); doc.setFontSize(9.5); setColor(C.fuchsiaDeep)
        const tLines = doc.splitTextToSize(String(kw.translation), colW)
        doc.text(tLines[0], colX, cy + 3)
        cy += 12
      }
      // Example
      if (exText) {
        fontR(); doc.setFontSize(8.5); setColor(C.slate500)
        const eLines = doc.splitTextToSize(`"${exText}"`, colW)
        doc.text(eLines[0], colX, cy + 3)
        cy += 11
      }
      setStroke(C.slate100); doc.setLineWidth(0.3)
      doc.line(colX, cy + 3, colX + colW, cy + 3)
      cy += 8
      colY[col] = cy
      col = col === 0 ? 1 : 0
    }
    y = Math.max(colY[0], colY[1]) + 6
  }

  // ------------------------------------------------------------------------
  // Render flow
  // ------------------------------------------------------------------------
  drawHero(1)
  renderPerformance()
  renderSummary()
  renderStrengthsImprovements()
  renderKeyErrors()
  renderPracticeAdvice()
  renderRecommendations()
  renderVocabulary()
  drawFooter(pageNum)

  // Update footer page totals across all pages.
  const total = doc.getNumberOfPages()
  for (let p = 1; p <= total; p++) {
    doc.setPage(p)
    // Wipe old footer and redraw with correct total
    setFill(C.white)
    doc.rect(0, H - FH, W, FH, 'F')
    setStroke(C.slate200); doc.setLineWidth(0.4)
    doc.line(MX, H - FH + 8, W - MX, H - FH + 8)
    fontR(); doc.setFontSize(8.5); setColor(C.slate500)
    doc.text(programKicker(), MX, H - FH + 22, { charSpace: 0.8 })
    doc.text(`${profile?.name || 'Student'} — Lesson Analysis`, W / 2, H - FH + 22, { align: 'center' })
    doc.text(`Page ${p} of ${total}`, W - MX, H - FH + 22, { align: 'right' })
    setColor(C.violetDeep); doc.setFontSize(7.5)
    doc.text('englishmetro.com', W - MX, H - FH + 32, { align: 'right', charSpace: 1.0 })
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
  // enablejsapi=1 + explicit mute=0 so we can postMessage unMute() after the
  // user's first interaction (clicking open the modal counts) and dodge
  // Chrome's autoplay-without-sound fallback.
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
                  onLoad={() => {
                    // The cross-origin iframe inherits Chrome's autoplay policy
                    // from youtube.com, not our origin, so autoplay often starts
                    // muted. Ride on the user's click that opened/advanced the
                    // modal (counts as user gesture) and postMessage unMute+play
                    // to YouTube's IFrame API. Safe no-op if sound was already on.
                    try {
                      const w = playerRef.current?.contentWindow
                      if (!w) return
                      w.postMessage(JSON.stringify({ event: 'command', func: 'unMute', args: [] }), '*')
                      w.postMessage(JSON.stringify({ event: 'command', func: 'setVolume', args: [100] }), '*')
                      w.postMessage(JSON.stringify({ event: 'command', func: 'playVideo', args: [] }), '*')
                    } catch (e) { /* ignore cross-origin rejection */ }
                  }}
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
              <span className="text-[9px] text-slate-400">{t('lessons.kwAbbrev', { n: l.keywordCount || l.keyword_count || l.keywords?.length || 0 })}</span>
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
    let cancelled = false
    // 30s timeout + 5-min cache — small static file, no need to refetch on
    // every Lessons remount.
    fetchJSONCached('/lesson-pdfs.json', { cacheKey: 'lesson-pdfs' })
      .then(d => { if (!cancelled) setPdfMap(d || {}) })
      .catch(() => { if (!cancelled) setPdfMap({}) })
    return () => { cancelled = true }
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

  // Split filtered lessons into upcoming (status=planned) and completed.
  // Upcoming lessons render under a collapsible "Upcoming Lessons (N)"
  // dropdown — minimised by default per Mike's 2026-05-04 directive — so
  // they don't dominate the lessons feed once the queue grows.
  const upcomingLessons = useMemo(
    () => filteredLessons.filter(l => (l.status || '') === 'planned'),
    [filteredLessons]
  )
  const completedLessons = useMemo(
    () => filteredLessons.filter(l => (l.status || '') !== 'planned'),
    [filteredLessons]
  )

  const [upcomingOpen, setUpcomingOpen] = useState(() => {
    try { return localStorage.getItem('em.lessons.upcomingOpen') === '1' } catch { return false }
  })
  useEffect(() => {
    try { localStorage.setItem('em.lessons.upcomingOpen', upcomingOpen ? '1' : '0') } catch {}
  }, [upcomingOpen])

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

      {/* Horizontal lesson navigator — completed lessons only.
          Upcoming lessons live inside the collapsible block below. */}
      <HorizontalLessonNavigator lessons={completedLessons} />

      {/* Upcoming Lessons — collapsible, minimised by default */}
      {upcomingLessons.length > 0 && (
        <div className="rounded-[1.5rem] border border-violet-200/70 bg-gradient-to-br from-violet-50/60 via-white to-sky-50/40 overflow-hidden">
          <button
            type="button"
            onClick={() => setUpcomingOpen(o => !o)}
            className="w-full px-5 py-3.5 flex items-center justify-between gap-3 hover:bg-white/40 transition-colors"
            aria-expanded={upcomingOpen}
          >
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-violet-600 text-xl">event_upcoming</span>
              <p className="font-label text-sm font-bold uppercase tracking-[0.18em] text-violet-700">
                {t('lessons.upcoming.heading', { defaultValue: 'Upcoming Lessons' })} ({upcomingLessons.length})
              </p>
            </div>
            <span
              className="material-symbols-outlined text-violet-600 text-xl transition-transform"
              style={{ transform: upcomingOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
            >
              expand_more
            </span>
          </button>
          {upcomingOpen && (
            <div className="px-5 pb-5 pt-1 space-y-2">
              {upcomingLessons.map(lesson => (
                <div
                  key={lesson.id}
                  className="rounded-[1rem] border border-violet-200/60 bg-white/70 px-4 py-3 flex items-center justify-between gap-3 grayscale opacity-80 cursor-default"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="material-symbols-outlined text-violet-500 text-base shrink-0">schedule</span>
                    <div className="min-w-0">
                      <p className="font-label text-[10px] font-bold uppercase tracking-[0.16em] text-violet-600">
                        {formatDate(lesson.date)}
                      </p>
                      <p className="text-sm font-semibold text-slate-700 leading-snug truncate">
                        {lesson.title}
                      </p>
                    </div>
                  </div>
                  <span className="font-label text-[9px] font-bold uppercase tracking-[0.18em] text-violet-500 shrink-0">
                    {t('lessons.upcoming.tag', { defaultValue: 'Upcoming' })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div>
        <div className="space-y-4">
          {completedLessons.length ? completedLessons.map(lesson => {
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
                          {t('lessons.wordsCount', { n: lesson.keywordCount || lesson.keyword_count || lesson.keywords?.length || 0 })}
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
                    {/* Lesson Preview — currently scoped to Aleksandra's BYD Bridge L3/L4.
                        Opens the interactive prototype in a new tab. Feature-flagged by
                        title-based lookup so it doesn't appear on every card site-wide. */}
                    {(() => {
                      // Match by date (stable) or legacy title code — so renames
                      // don't break the preview CTA.
                      const map = {
                        '2026-04-27': '/lesson-previews/byd-bridge-l3.html',
                        '2026-04-28': '/lesson-previews/byd-bridge-l4.html',
                        'IND-AG-27042026': '/lesson-previews/byd-bridge-l3.html',
                        'IND-AG-28042026': '/lesson-previews/byd-bridge-l4.html',
                      }
                      const url = map[lesson.date] || map[lesson.title]
                      if (!url) return null
                      return (
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700 px-3 py-1 text-[10px] font-label font-bold uppercase tracking-[0.14em] text-white transition shadow-md"
                          title="Interactive lesson preview"
                        >
                          <span className="material-symbols-outlined text-[14px]">auto_awesome</span>
                          Preview lesson
                        </a>
                      )
                    })()}
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

      {/* Practice advice — classified into a specific shell + filter when
          we can recognise the intent (Mike 2026-05-04: don't dump everything
          into the generic free-write box). Falls back to free-write if the
          advice text doesn't match any known shell heuristic. */}
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
              const slugStr = studentSlug || 'szymon-karpinski'
              const link = classifyAdviceLink(adviceText, slugStr)
              return (
                <button
                  key={i}
                  type="button"
                  onClick={(e) => {
                    e.preventDefault(); e.stopPropagation()
                    if (link) navigate(link.url)
                    else navigate(`/app/${slugStr}/practice?advice=${encodeURIComponent(adviceText.slice(0, 200))}`)
                  }}
                  className="advice-item text-left cursor-pointer hover:-translate-y-0.5 transition-all hover:shadow-md w-full"
                >
                  <span className="advice-number">{i + 1}</span>
                  <p className="text-sm text-slate-700 leading-relaxed"><RichInline text={p} /></p>
                  <span className="mt-2 inline-flex items-center gap-1 text-[10px] font-label font-bold uppercase tracking-[0.14em] text-sky-600">
                    <span className="material-symbols-outlined text-[12px]">{link ? 'arrow_forward' : 'edit_note'}</span>
                    {link ? link.label : t('lessons.detail.openFreewrite')}
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
