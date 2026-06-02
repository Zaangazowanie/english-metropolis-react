// Shared jsPDF + Noto Sans loader
//
// Consolidated 2026-05-02 (Tier 3 cleanup) from three previously-duplicated
// copies in:
//   - src/views/Lessons.jsx          (loadScript, ensureJsPdf, ensurePdfFonts)
//   - src/views/v3/lessons-pdf.js    (loadScript, ensureJsPdf, ensurePdfFonts)
//   - src/views/admin/StudentDetail.jsx (ensurePdfFonts only — uses
//                                         already-loaded window.jspdf)
//
// jsPDF is loaded as a UMD bundle from /students/vendor/jspdf.umd.min.js
// (NOT bundled into our SPA chunks — keeps the main bundle small).
// VENDOR_V is a cache-bust query param; bump it when the vendor dir changes.

// Vendor bundle version — bumps invalidate Cloudflare's cached 404s when
// the vendor dir changes. Increment when you swap jsPDF versions.
export const VENDOR_V = '2'

export function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = src
    s.onload = () => resolve()
    s.onerror = () => reject(new Error(`script load failed: ${src}`))
    document.head.appendChild(s)
  })
}

let _jspdfLoading = null
export async function ensureJsPdf() {
  if (typeof window !== 'undefined' && window.jspdf?.jsPDF) return window.jspdf
  if (!_jspdfLoading) {
    _jspdfLoading = loadScript(`/students/vendor/jspdf.umd.min.js?v=${VENDOR_V}`)
  }
  await _jspdfLoading
  return window.jspdf
}

let _pdfFontsLoaded = false
export async function ensurePdfFonts() {
  if (_pdfFontsLoaded) return
  if (!window.__NOTO_REGULAR_B64) await loadScript(`/students/vendor/fonts/NotoSans-Regular.b64.js?v=${VENDOR_V}`)
  if (!window.__NOTO_BOLD_B64) await loadScript(`/students/vendor/fonts/NotoSans-Bold.b64.js?v=${VENDOR_V}`)
  _pdfFontsLoaded = true
}
