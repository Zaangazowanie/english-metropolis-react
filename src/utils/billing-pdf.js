// Billing PDFs — Phase A3 (2026-06-03).
// Client-side jsPDF generation for monthly statements + CEFR certificates,
// using the shared loader (src/utils/pdf-loader.js) and NotoSans fonts.

import { ensureJsPdf, ensurePdfFonts } from './pdf-loader.js'

const C = {
  ink: [15, 23, 42],        // slate-900
  slate: [100, 116, 139],   // slate-500
  light: [148, 163, 184],   // slate-400
  primary: [2, 132, 199],   // sky-600
  deep: [29, 78, 216],      // blue-700
  line: [226, 232, 240],    // slate-200
  rowAlt: [248, 250, 252],  // slate-50
}

async function newDoc(orientation) {
  const jspdfLib = await ensureJsPdf()
  await ensurePdfFonts()
  const { jsPDF } = jspdfLib
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation, compress: true })
  doc.addFileToVFS('NotoSans-Regular.ttf', window.__NOTO_REGULAR_B64)
  doc.addFont('NotoSans-Regular.ttf', 'NotoSans', 'normal')
  doc.addFileToVFS('NotoSans-Bold.ttf', window.__NOTO_BOLD_B64)
  doc.addFont('NotoSans-Bold.ttf', 'NotoSans', 'bold')
  doc.setFont('NotoSans', 'normal')
  return doc
}

function monthLabel(monthKey) {
  const [y, m] = String(monthKey).split('-').map(Number)
  const names = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December']
  return `${names[(m || 1) - 1]} ${y}`
}

// ─── Consolidated monthly statement (A4 portrait) ───────────────────────────
// monthRow: { month, completedLessons, lateCancellations, billableTotal, perStudent }
export async function downloadStatementPdf(org, monthRow) {
  const doc = await newDoc('portrait')
  const W = doc.internal.pageSize.getWidth()
  const M = 56 // margin
  let y = 64

  // Header band
  doc.setFillColor(...C.deep)
  doc.rect(0, 0, W, 8, 'F')

  doc.setTextColor(...C.primary).setFont('NotoSans', 'bold').setFontSize(10)
  doc.text('MONTHLY STATEMENT', M, y)
  y += 26
  doc.setTextColor(...C.ink).setFontSize(24)
  doc.text(org?.name || 'Organization', M, y)
  y += 20
  doc.setFont('NotoSans', 'normal').setFontSize(12).setTextColor(...C.slate)
  doc.text(monthLabel(monthRow.month), M, y)

  // Billing contact block (right-aligned)
  const bc = org?.billingContact
  if (bc && (bc.name || bc.email || bc.address)) {
    let cy = 64
    doc.setFontSize(8).setTextColor(...C.light).setFont('NotoSans', 'bold')
    doc.text('BILL TO', W - M, cy, { align: 'right' })
    cy += 14
    doc.setFont('NotoSans', 'normal').setFontSize(9).setTextColor(...C.ink)
    for (const line of [bc.name, bc.address, bc.email, bc.phone, bc.taxId ? `NIP: ${bc.taxId}` : null].filter(Boolean)) {
      doc.text(String(line), W - M, cy, { align: 'right' })
      cy += 13
    }
  }

  y += 36

  // Summary cards
  const summary = [
    ['Lessons taught', monthRow.completedLessons],
    ['Late cancellations', monthRow.lateCancellations],
    ['Billable total', monthRow.billableTotal],
  ]
  const cardW = (W - M * 2 - 24) / 3
  summary.forEach(([label, value], i) => {
    const x = M + i * (cardW + 12)
    doc.setDrawColor(...C.line).setFillColor(...C.rowAlt)
    doc.roundedRect(x, y, cardW, 64, 8, 8, 'FD')
    doc.setTextColor(...C.slate).setFont('NotoSans', 'normal').setFontSize(8)
    doc.text(String(label).toUpperCase(), x + 14, y + 22)
    doc.setTextColor(i === 2 ? C.deep[0] : C.ink[0], i === 2 ? C.deep[1] : C.ink[1], i === 2 ? C.deep[2] : C.ink[2])
    doc.setFont('NotoSans', 'bold').setFontSize(24)
    doc.text(String(value), x + 14, y + 50)
  })
  y += 100

  // Per-student table
  doc.setTextColor(...C.ink).setFont('NotoSans', 'bold').setFontSize(12)
  doc.text('Per-student breakdown', M, y)
  y += 20

  // Column x-positions shared by the header and the data rows below.
  const cols = [
    { label: 'STUDENT', x: M, align: 'left' },
    { label: 'LESSONS', x: M + 350, align: 'right' },
    { label: 'LATE CANC.', x: M + 440, align: 'right' },
    { label: 'BILLABLE', x: W - M, align: 'right' },
  ]
  doc.setFontSize(8).setTextColor(...C.light)
  for (const col of cols) doc.text(col.label, col.x, y, { align: col.align })
  y += 8
  doc.setDrawColor(...C.line).line(M, y, W - M, y)
  y += 18

  const students = Object.values(monthRow.perStudent || {})
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  doc.setFont('NotoSans', 'normal').setFontSize(10)
  let alt = false
  for (const s of students) {
    if (y > doc.internal.pageSize.getHeight() - 90) {
      doc.addPage()
      y = 64
    }
    if (alt) {
      doc.setFillColor(...C.rowAlt)
      doc.rect(M - 8, y - 12, W - M * 2 + 16, 22, 'F')
    }
    alt = !alt
    const billable = (s.completed || 0) + (s.lateCancellations || 0)
    doc.setTextColor(...C.ink)
    doc.text(String(s.name || 'Unknown'), M, y)
    doc.text(String(s.completed || 0), M + 350, y, { align: 'right' })
    doc.text(String(s.lateCancellations || 0), M + 440, y, { align: 'right' })
    doc.setFont('NotoSans', 'bold')
    doc.text(String(billable), W - M, y, { align: 'right' })
    doc.setFont('NotoSans', 'normal')
    y += 22
  }

  // Totals row
  y += 4
  doc.setDrawColor(...C.line).line(M, y - 12, W - M, y - 12)
  doc.setFont('NotoSans', 'bold').setTextColor(...C.deep)
  doc.text('Total', M, y + 4)
  doc.text(String(monthRow.completedLessons), M + 350, y + 4, { align: 'right' })
  doc.text(String(monthRow.lateCancellations), M + 440, y + 4, { align: 'right' })
  doc.text(String(monthRow.billableTotal), W - M, y + 4, { align: 'right' })

  // Footer
  const H = doc.internal.pageSize.getHeight()
  doc.setFont('NotoSans', 'normal').setFontSize(8).setTextColor(...C.light)
  doc.text(
    `Generated ${new Date().toISOString().slice(0, 10)} · Completed lessons, late cancellations (<12h), and student no-shows after 20 minutes are billable.`,
    M, H - 40,
  )

  doc.save(`statement-${(org?.slug || 'org')}-${monthRow.month}.pdf`)
}

// ─── CEFR certificate (A4 landscape) ────────────────────────────────────────
// cert: { studentName, cefrLevel, lessonsCompleted, hoursCompleted, verificationId, issuedAt, issuedByName }
export async function downloadCertificatePdf(org, cert) {
  const doc = await newDoc('landscape')
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const cx = W / 2

  // Border frame
  doc.setDrawColor(...C.deep).setLineWidth(2)
  doc.rect(28, 28, W - 56, H - 56)
  doc.setDrawColor(...C.primary).setLineWidth(0.75)
  doc.rect(36, 36, W - 72, H - 72)

  let y = 110
  doc.setTextColor(...C.primary).setFont('NotoSans', 'bold').setFontSize(11)
  doc.text((org?.name || 'ENGLISH SCHOOL').toUpperCase(), cx, y, { align: 'center' })
  y += 18
  doc.setTextColor(...C.light).setFont('NotoSans', 'normal').setFontSize(9)
  doc.text('CERTIFICATE OF LANGUAGE PROFICIENCY', cx, y, { align: 'center' })

  y += 58
  doc.setTextColor(...C.slate).setFontSize(12)
  doc.text('This certifies that', cx, y, { align: 'center' })
  y += 40
  doc.setTextColor(...C.ink).setFont('NotoSans', 'bold').setFontSize(34)
  doc.text(cert.studentName, cx, y, { align: 'center' })
  y += 36
  doc.setTextColor(...C.slate).setFont('NotoSans', 'normal').setFontSize(12)
  doc.text('has attained the Common European Framework of Reference level', cx, y, { align: 'center' })

  y += 56
  // CEFR badge
  doc.setFillColor(...C.deep)
  doc.roundedRect(cx - 60, y - 38, 120, 56, 12, 12, 'F')
  doc.setTextColor(255, 255, 255).setFont('NotoSans', 'bold').setFontSize(32)
  doc.text(cert.cefrLevel, cx, y, { align: 'center' })

  y += 50
  doc.setTextColor(...C.slate).setFont('NotoSans', 'normal').setFontSize(11)
  doc.text(
    `following ${cert.lessonsCompleted} lessons (${cert.hoursCompleted} hours) of instruction`,
    cx, y, { align: 'center' },
  )

  // Signature + date + verification
  const by = H - 110
  const issuedDate = new Date(cert.issuedAt).toISOString().slice(0, 10)
  doc.setDrawColor(...C.line).setLineWidth(0.75)

  doc.line(90, by, 290, by)
  doc.setFontSize(9).setTextColor(...C.ink)
  doc.text(cert.issuedByName || '', 190, by - 8, { align: 'center' })
  doc.setTextColor(...C.light)
  doc.text('INSTRUCTOR', 190, by + 14, { align: 'center' })

  doc.line(W - 290, by, W - 90, by)
  doc.setTextColor(...C.ink)
  doc.text(issuedDate, W - 190, by - 8, { align: 'center' })
  doc.setTextColor(...C.light)
  doc.text('DATE OF ISSUE', W - 190, by + 14, { align: 'center' })

  doc.setFontSize(8).setTextColor(...C.light)
  doc.text(`Verification ID: ${cert.verificationId}`, cx, H - 52, { align: 'center' })

  doc.save(`certificate-${cert.verificationId}.pdf`)
}
