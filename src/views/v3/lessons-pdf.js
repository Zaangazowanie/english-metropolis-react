// Lesson PDF generator — ported byte-for-byte from ../../Lessons.jsx (lines 170-1018).
// Uses window.jspdf (UMD) loaded via /students/vendor/jspdf.umd.min.js in index.html.
//
// PDF loader helpers (loadScript, ensureJsPdf, ensurePdfFonts) hoisted to
// src/utils/pdf-loader.js (Tier 3 cleanup, 2026-05-02).

import { ensureJsPdf, ensurePdfFonts } from '../../utils/pdf-loader.js'

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

export { generateLessonPdf }
