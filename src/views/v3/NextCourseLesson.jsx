import { lazy, Suspense, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation } from 'react-router-dom'
import { useV3Theme } from '../../design/v3/ThemeProvider.jsx'
import { Btn, Glass, Pill } from '../../design/v3/primitives.jsx'
import { Collapse, usePresence } from '../../design/v3/motion/index.js'
import { FONT } from '../../design/v3/tokens.js'
import { useI18n } from '../../i18n'
import { getStudentSessionToken } from '../../lib/student-session.js'
import { COURSE_PREVIEW_PATH } from '../../lib/course-preview.js'
import { fetchWithTimeout } from '../../practice/lib/practice-cache'
import './next-course-lesson.css'
const CoursePdfViewer = lazy(() => import('./CoursePdfViewer.jsx'))

export default function NextCourseLesson({ data }) {
  const { T } = useV3Theme()
  const { t } = useI18n()
  const { search } = useLocation()
  const preview = data?.coursePreview
  const [expanded, setExpanded] = useState(false)
  const [pdf, setPdf] = useState(null)
  const [pdfClosing, setPdfClosing] = useState(false)
  const pdfMotion = usePresence(Boolean(pdf) && !pdfClosing)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const request = useRef(0)
  const dialog = useRef(null)
  const pdfButton = useRef(null)
  const keywordId = useId()
  const titleId = useId()

  useEffect(() => {
    setExpanded(new URLSearchParams(search).get('preview') === 'next')
    setPdf(null)
    setError(false)
    setBusy(false)
    request.current += 1
    return () => { request.current += 1 }
  }, [preview?.id, search])

  useEffect(() => {
    if (!pdf) return
    dialog.current?.showModal()
    return () => URL.revokeObjectURL(pdf)
  }, [pdf])

  useEffect(() => {
    if (pdfClosing && !pdfMotion.mounted) {
      setPdf(null)
      setPdfClosing(false)
      pdfButton.current?.focus({ preventScroll: true })
    }
  }, [pdfClosing, pdfMotion.mounted])

  async function openPdf() {
    const version = ++request.current
    setBusy(true)
    setError(false)
    try {
      const response = await fetchWithTimeout(`${COURSE_PREVIEW_PATH}/pdf?lesson=${encodeURIComponent(preview.id)}`, {
        headers: { Authorization: `Bearer ${getStudentSessionToken() || ''}` }, cache: 'no-store',
      })
      if (!response.ok || !response.headers.get('content-type')?.includes('application/pdf')) throw new Error('PDF unavailable')
      const blob = await response.blob()
      if (version === request.current) { setPdfClosing(false); setPdf(URL.createObjectURL(blob)) }
    } catch {
      if (version === request.current) setError(true)
    } finally {
      if (version === request.current) setBusy(false)
    }
  }

  function closePdf() {
    setPdfClosing(true)
  }

  if (!preview && !data?.coursePreviewError) return null
  const variables = { '--preview-text': T.text, '--preview-dim': T.textDim,
    '--preview-border': T.border, '--preview-surface': T.bg0, '--preview-accent': T.violet }

  return <section className="em-next-course" style={variables} aria-label={t('coursePreview.heading')}>
    <Glass padding={24}>
      <div className="em-next-course-heading">{t('coursePreview.heading')}</div>
      {!preview ? <div role="status">
        <p>{t('coursePreview.error')}</p>
        <Btn onClick={() => data?.refresh?.()} disabled={data?.loading}>{t('coursePreview.retry')}</Btn>
      </div> : <>
        <div className="em-next-course-top">
          <div>
            <h2 style={{ fontFamily: FONT.display }}>{preview.title}</h2>
            <div className="em-next-course-meta">
              {preview.level && <Pill tone="violet">{preview.level}</Pill>}
              {preview.lessonNumber && <span>{t('coursePreview.lesson', { n: preview.lessonNumber })}</span>}
              <span>{t('coursePreview.words', { n: preview.keywords.length })}</span>
            </div>
          </div>
          <div className="em-next-course-actions">
            <Btn variant="secondary" icon="translate" aria-expanded={expanded} aria-controls={keywordId}
              onClick={() => setExpanded(v => !v)}>{t(expanded ? 'coursePreview.hideWords' : 'coursePreview.showWords')}</Btn>
            {preview.hasPdf && <span ref={pdfButton} tabIndex={-1}>
              <Btn variant="primary" icon="picture_as_pdf" disabled={busy} onClick={openPdf}>
                {t(busy ? 'coursePreview.loadingPdf' : 'coursePreview.openPdf')}
              </Btn>
            </span>}
          </div>
        </div>
        <p className="em-next-course-intro">{t('coursePreview.intro')}</p>
        {!preview.hasPdf && <p className="em-next-course-intro">{t('coursePreview.pdfPending')}</p>}
        {error && <p role="alert">{t('coursePreview.pdfError')} <button onClick={openPdf}>{t('coursePreview.retry')}</button></p>}
        {!expanded && <div className="em-next-course-chips" aria-hidden="true">
          {preview.keywords.slice(0, 5).map((k, i) => <span key={i}>{k.word}</span>)}
          {preview.keywords.length > 5 && <span>+{preview.keywords.length - 5}</span>}
        </div>}
        <Collapse open={expanded} id={keywordId}><div className="em-next-course-words">
          <h3>{t('coursePreview.wordHeading')}</h3>
          {preview.keywords.length ? <div className="em-next-course-grid">
            {preview.keywords.map((k, i) => <article key={i}>
              <div><strong>{k.word}</strong> {k.ipa && <span className="em-next-course-ipa">{k.ipa}</span>}</div>
              {k.pl && <p lang="pl" className="em-next-course-translation">{k.pl}</p>}
              {k.example && <p lang="en" className="em-next-course-example">{k.example}</p>}
            </article>)}
          </div> : <p>{t('coursePreview.wordsPending')}</p>}
        </div></Collapse>
      </>}
    </Glass>
    {pdfMotion.mounted && pdf && preview && createPortal(<dialog ref={dialog} className={`em-next-course-dialog t-modal ${pdfMotion.className}`} style={variables} inert={pdfMotion.inert}
      aria-labelledby={titleId} onCancel={event => { event.preventDefault(); closePdf() }}>
      <div className="em-next-course-pdfbar">
        <h2 id={titleId}>{preview.title}</h2>
        <a href={pdf} download={`${preview.id}.pdf`}>{t('coursePreview.download')}</a>
        <button autoFocus onClick={closePdf} aria-label={t('coursePreview.close')}>×</button>
      </div>
      <Suspense fallback={<p role="status">{t('coursePreview.loadingPdf')}</p>}>
        <CoursePdfViewer url={pdf} title={preview.title}/>
      </Suspense>
    </dialog>, document.body)}
  </section>
}
