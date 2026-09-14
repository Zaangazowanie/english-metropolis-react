// Optional QA server: npm run dev -- --config tests/motion/vite.config.js
// Serves one anonymous, generated PDF; never included by the release build.
import { defineConfig, mergeConfig } from 'vite'
import base from '../../vite.config.js'

function samplePdf() {
  const stream = 'BT /F1 24 Tf 60 700 Td (EnglishMetro motion QA) Tj ET'
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ]
  let pdf = '%PDF-1.4\n'
  const offsets = [0]
  objects.forEach((object, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${object}\nendobj\n` })
  const xref = pdf.length
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(n => `${String(n).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  return pdf
}

export default mergeConfig(base, defineConfig({ plugins: [{
  name: 'anonymous-motion-pdf-fixture',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (req.url !== '/api/console/student/next-lesson/pdf?lesson=demo') return next()
      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Cache-Control', 'no-store')
      res.end(samplePdf())
    })
  },
}] }))
