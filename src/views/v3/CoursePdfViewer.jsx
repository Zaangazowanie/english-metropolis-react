import { useEffect, useRef, useState } from 'react'
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
// Emit a same-origin worker file; a data: import is blocked by production CSP.
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?worker&url'
import { useI18n } from '../../i18n'

GlobalWorkerOptions.workerSrc = workerUrl

export default function CoursePdfViewer({ url, title }) {
  const { t } = useI18n()
  const [pdf, setPdf] = useState(null)
  const [pageNumber, setPageNumber] = useState(1)
  const [zoom, setZoom] = useState(1)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [error, setError] = useState(false)
  const [rendering, setRendering] = useState(true)
  const frame = useRef(null)
  const canvas = useRef(null)

  useEffect(() => {
    const task = getDocument({ url, isEvalSupported: false })
    let alive = true
    task.promise.then(doc => { if (alive) setPdf(doc) }).catch(() => { if (alive) setError(true) })
    return () => { alive = false; task.destroy() }
  }, [url])

  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height })
    })
    observer.observe(frame.current)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!pdf || !size.width || !size.height) return
    let cancelled = false, renderTask
    Promise.resolve().then(() => pdf.getPage(pageNumber)).then(async page => {
      if (cancelled) return
      setRendering(true)
      setError(false)
      const unit = page.getViewport({ scale: 1 })
      const scale = Math.min((size.width - 28) / unit.width, (size.height - 28) / unit.height) * zoom
      const viewport = page.getViewport({ scale: Math.max(.1, scale) })
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      const el = canvas.current
      el.width = Math.floor(viewport.width * ratio)
      el.height = Math.floor(viewport.height * ratio)
      el.style.width = `${Math.floor(viewport.width)}px`
      el.style.height = `${Math.floor(viewport.height)}px`
      renderTask = page.render({ canvasContext: el.getContext('2d'), viewport,
        transform: ratio === 1 ? null : [ratio, 0, 0, ratio, 0, 0] })
      await renderTask.promise
      if (!cancelled) setRendering(false)
    }).catch(e => {
      if (!cancelled && e.name !== 'RenderingCancelledException') setError(true)
    })
    return () => { cancelled = true; renderTask?.cancel() }
  }, [pdf, pageNumber, size, zoom])

  return <div className="em-course-pdf-viewer">
    <div className="em-course-pdf-controls">
      <button disabled={!pdf || pageNumber === 1} onClick={() => setPageNumber(n => n - 1)} aria-label={t('coursePreview.previousPage')}>‹</button>
      <span aria-live="polite">{pdf ? t('coursePreview.page', { n: pageNumber, total: pdf.numPages }) : t('coursePreview.loadingPdf')}</span>
      <button disabled={!pdf || pageNumber === pdf.numPages} onClick={() => setPageNumber(n => n + 1)} aria-label={t('coursePreview.nextPage')}>›</button>
      <button disabled={zoom <= 1} onClick={() => setZoom(z => z - .5)} aria-label={t('coursePreview.zoomOut')}>−</button>
      <button disabled={zoom >= 3} onClick={() => setZoom(z => z + .5)} aria-label={t('coursePreview.zoomIn')}>+</button>
    </div>
    <div ref={frame} className="em-course-pdf-page" aria-busy={rendering && !error}>
      {error && <p role="alert">{t('coursePreview.pdfError')}</p>}
      {rendering && !error && <span className="em-course-pdf-loading" role="status">{t('coursePreview.loadingPdf')}</span>}
      <canvas ref={canvas} role="img" aria-label={t('coursePreview.pdfPageTitle', { title, n: pageNumber })}/>
    </div>
  </div>
}
