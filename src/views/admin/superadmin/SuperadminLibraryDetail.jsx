// Superadmin › Library › lesson detail — in-console deck preview + download.
//
// Data: GET /api/console/library/{lesson_id} (manifest + registry +
// assignments), GET …/{lesson_id}/html (iframe preview; decks are fixed
// 1920×1080, so the iframe renders at native size and is scaled to fit) and
// GET …/{lesson_id}/pdf (embedded viewer + download). All three per
// docs/console/API-CONTRACT.md. Assign/unassign controls land in the next
// console slice — assignments render read-only here.

import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { consoleGet, consoleGetBlob, saveBlob, libraryHtmlPath, libraryPdfPath } from './consoleApi.js'
import { ConsoleLoading, ConsoleNotLive, ConsoleErrorPanel, LevelBadge, BasketBadge } from './ConsoleStates.jsx'

// Decks are authored at exactly 1920×1080. Render the iframe at native size
// and scale it down to the card width so the preview is layout-true.
const DECK_W = 1920
const DECK_H = 1080

function DeckFrame({ src, title }) {
  const hostRef = useRef(null)
  const [scale, setScale] = useState(0)

  useEffect(() => {
    const el = hostRef.current
    if (!el) return
    const measure = () => setScale(el.clientWidth / DECK_W)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={hostRef}
      style={{
        position: 'relative',
        width: '100%',
        aspectRatio: `${DECK_W} / ${DECK_H}`,
        overflow: 'hidden',
        borderRadius: '0.9rem',
        background: '#0f172a',
        border: '1px solid rgba(148, 163, 184, 0.15)',
      }}
    >
      {scale > 0 && (
        <iframe
          src={src}
          title={title}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: DECK_W,
            height: DECK_H,
            border: 0,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
          }}
        />
      )}
    </div>
  )
}

export default function SuperadminLibraryDetail() {
  const { lessonId } = useParams()

  const [detail, setDetail] = useState(null) // { manifest, registry, assignments }
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)

  const [tab, setTab] = useState('html')
  // per-tab preview: { status: 'loading' | 'ready' | 'error', url?, error? }
  const [previews, setPreviews] = useState({})
  const urlsRef = useRef({})
  const startedRef = useRef({})

  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    consoleGet(`/api/console/library/${encodeURIComponent(lessonId)}`)
      .then(d => { if (alive) setDetail(d) })
      .catch(e => { if (alive) { setError(e); setDetail(null) } })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [lessonId, reloadKey])

  const fetchPreview = useCallback((which) => {
    if (startedRef.current[which]) return
    startedRef.current[which] = true
    setPreviews(prev => ({ ...prev, [which]: { status: 'loading' } }))
    const path = which === 'html' ? libraryHtmlPath(lessonId) : libraryPdfPath(lessonId)
    consoleGetBlob(path)
      .then(blob => {
        const url = URL.createObjectURL(blob)
        urlsRef.current[which] = url
        setPreviews(prev => ({ ...prev, [which]: { status: 'ready', url } }))
      })
      .catch(err => {
        startedRef.current[which] = false
        setPreviews(prev => ({ ...prev, [which]: { status: 'error', error: err } }))
      })
  }, [lessonId])

  // Load the active tab's preview once the detail endpoint answered (any
  // answer — file serving can be live even while metadata is still rolling
  // out, but a fully 404 backend should not fire three failing requests).
  useEffect(() => {
    if (loading) return
    if (error?.notLive) return
    fetchPreview(tab)
  }, [loading, error, tab, fetchPreview])

  // Revoke object URLs on unmount.
  useEffect(() => () => {
    Object.values(urlsRef.current).forEach(url => URL.revokeObjectURL(url))
  }, [])

  async function downloadPdf() {
    setDownloadError(null)
    setDownloading(true)
    try {
      const blob = await consoleGetBlob(libraryPdfPath(lessonId))
      saveBlob(blob, `${lessonId}.pdf`)
    } catch (e) {
      setDownloadError(`PDF download failed: ${e.message}`)
    } finally {
      setDownloading(false)
    }
  }

  const manifest = detail?.manifest || null
  const registry = detail?.registry || null
  const assignments = Array.isArray(detail?.assignments) ? detail.assignments : []
  const title = manifest?.title || lessonId
  const keywords = Array.isArray(manifest?.keywords) ? manifest.keywords : []
  const topics = Array.isArray(registry?.topics) ? registry.topics : null
  const videoUrl = typeof manifest?.video_url === 'string' ? manifest.video_url : null
  const preview = previews[tab]

  return (
    <div className="space-y-5">
      <Link
        to="/admin/superadmin/library"
        className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-widest"
        style={{ color: 'rgba(148, 163, 184, 0.8)' }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 15 }}>arrow_back</span>
        Course library
      </Link>

      <div className="sa-card">
        <div className="sa-card-header">
          <h2>Lesson deck</h2>
          <div className="flex items-center gap-2">
            {videoUrl && (
              <a href={videoUrl} target="_blank" rel="noopener noreferrer" className="sa-btn sa-btn-ghost">
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>play_circle</span>
                Video
              </a>
            )}
            <button
              type="button"
              className="sa-btn sa-btn-primary"
              onClick={downloadPdf}
              disabled={downloading}
              style={downloading ? { opacity: 0.5, cursor: 'wait' } : undefined}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>download</span>
              {downloading ? 'Downloading…' : 'Download PDF'}
            </button>
          </div>
        </div>
        <div className="sa-card-body">
          <h3 className="text-xl font-bold" style={{ color: '#f8fafc', letterSpacing: '-0.01em' }}>{title}</h3>
          <p className="mt-1 font-mono text-[11px]" style={{ color: 'rgba(148, 163, 184, 0.65)' }}>{lessonId}</p>
          {manifest && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <LevelBadge level={manifest.level} />
              <BasketBadge basket={manifest.basket} />
              {manifest.course_id && (
                <span className="sa-badge" style={{ background: 'rgba(148, 163, 184, 0.14)', color: '#cbd5e1' }}>
                  {manifest.course_id}
                  {manifest.lesson_number != null ? ` · #${manifest.lesson_number}` : ''}
                </span>
              )}
              {manifest.topic && (
                <span className="text-sm" style={{ color: 'rgba(203, 213, 225, 0.75)' }}>{manifest.topic}</span>
              )}
            </div>
          )}
          {downloadError && <p className="mt-3 text-sm" style={{ color: '#fca5a5' }}>{downloadError}</p>}
        </div>
      </div>

      {loading && (
        <div className="sa-card"><div className="sa-card-body"><ConsoleLoading label="Loading lesson…" /></div></div>
      )}
      {!loading && error && error.notLive && (
        <ConsoleNotLive endpoint={`GET /api/console/library/${lessonId}`} />
      )}
      {!loading && error && !error.notLive && (
        <ConsoleErrorPanel error={error} onRetry={() => setReloadKey(k => k + 1)} />
      )}

      {!loading && !error?.notLive && (
        <div className="sa-card">
          <div className="sa-card-header">
            <h2>Preview</h2>
            <div className="flex gap-2">
              <button
                type="button"
                className={`sa-btn ${tab === 'html' ? 'sa-btn-primary' : 'sa-btn-ghost'}`}
                onClick={() => setTab('html')}
              >
                Deck
              </button>
              <button
                type="button"
                className={`sa-btn ${tab === 'pdf' ? 'sa-btn-primary' : 'sa-btn-ghost'}`}
                onClick={() => setTab('pdf')}
              >
                PDF
              </button>
            </div>
          </div>
          <div className="sa-card-body">
            {(!preview || preview.status === 'loading') && <ConsoleLoading label="Loading preview…" />}
            {preview?.status === 'error' && preview.error?.notLive && (
              <ConsoleNotLive endpoint={`GET ${tab === 'html' ? libraryHtmlPath(lessonId) : libraryPdfPath(lessonId)}`} />
            )}
            {preview?.status === 'error' && !preview.error?.notLive && (
              <ConsoleErrorPanel error={preview.error} onRetry={() => fetchPreview(tab)} />
            )}
            {preview?.status === 'ready' && tab === 'html' && (
              <DeckFrame src={preview.url} title={`${lessonId} deck preview`} />
            )}
            {preview?.status === 'ready' && tab === 'pdf' && (
              <iframe
                src={preview.url}
                title={`${lessonId} PDF preview`}
                style={{
                  width: '100%',
                  height: '72vh',
                  border: '1px solid rgba(148, 163, 184, 0.15)',
                  borderRadius: '0.9rem',
                  background: '#0f172a',
                }}
              />
            )}
          </div>
        </div>
      )}

      {!loading && !error && detail && (
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="sa-card">
            <div className="sa-card-header"><h2>Keywords & topics</h2></div>
            <div className="sa-card-body">
              {keywords.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {keywords.map(word => (
                    <span
                      key={word}
                      className="rounded-full px-2.5 py-1 text-xs"
                      style={{ background: 'rgba(148, 163, 184, 0.12)', color: '#cbd5e1' }}
                    >
                      {word}
                    </span>
                  ))}
                </div>
              ) : (
                <p style={{ color: 'rgba(148, 163, 184, 0.6)' }}>No keywords in the manifest.</p>
              )}
              {(topics || registry?.questions_count != null) && (
                <div className="mt-4 border-t pt-4" style={{ borderColor: 'rgba(148, 163, 184, 0.1)' }}>
                  {topics && (
                    <p className="text-sm" style={{ color: 'rgba(203, 213, 225, 0.75)' }}>
                      <span className="sa-stat-label">Registry topics · </span>
                      {topics.join(', ')}
                    </p>
                  )}
                  {registry?.questions_count != null && (
                    <p className="mt-2 text-sm" style={{ color: 'rgba(203, 213, 225, 0.75)' }}>
                      <span className="sa-stat-label">Questions · </span>
                      {registry.questions_count}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="sa-card">
            <div className="sa-card-header"><h2>Assignments · {assignments.length}</h2></div>
            <div className="sa-card-body">
              {assignments.length === 0 ? (
                <p style={{ color: 'rgba(148, 163, 184, 0.6)' }}>Not assigned to anyone yet.</p>
              ) : (
                <ul className="space-y-2">
                  {assignments.map((a, i) => (
                    <li
                      key={`${a.student_slug || a.group_id || 'row'}-${i}`}
                      className="flex flex-wrap items-center gap-2 text-sm"
                      style={{ color: '#e2e8f0' }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'rgba(148, 163, 184, 0.7)' }}>
                        {a.group_id ? 'groups' : 'person'}
                      </span>
                      <span className="font-semibold">{a.student_slug || a.group_id}</span>
                      {a.date && <span style={{ color: 'rgba(203, 213, 225, 0.7)' }}>lesson {a.date}</span>}
                      {a.assigned_at && (
                        <span style={{ color: 'rgba(148, 163, 184, 0.55)', fontSize: '0.72rem' }}>
                          assigned {new Date(a.assigned_at).toLocaleString()}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-4 text-[11px] uppercase tracking-widest" style={{ color: 'rgba(148, 163, 184, 0.55)' }}>
                Assign / unassign controls land in the next console slice.
              </p>
            </div>
          </div>
        </div>
      )}

      {!loading && !error && manifest && (
        <div className="sa-card">
          <div className="sa-card-header"><h2>Raw manifest</h2></div>
          <div className="sa-card-body">
            <details>
              <summary
                className="cursor-pointer text-[11px] font-bold uppercase tracking-widest"
                style={{ color: 'rgba(148, 163, 184, 0.8)' }}
              >
                Show manifest.json
              </summary>
              <pre
                className="mt-3 overflow-x-auto rounded-xl p-4 text-xs"
                style={{ background: 'rgba(2, 6, 23, 0.6)', color: '#cbd5e1', lineHeight: 1.5 }}
              >
                {JSON.stringify(manifest, null, 2)}
              </pre>
            </details>
          </div>
        </div>
      )}
    </div>
  )
}
