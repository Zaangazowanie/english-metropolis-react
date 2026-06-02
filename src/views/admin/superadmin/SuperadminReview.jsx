import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { queryAdminConvex, mutateAdminConvex } from '../../../contexts/AdminAuthContext.jsx'

const CATEGORIES = ['grammar', 'vocabulary', 'pronunciation', 'collocation', 'article', 'preposition', 'word-order', 'register', 'spelling']

export default function SuperadminReview() {
  const { jobId } = useParams()
  const navigate = useNavigate()

  const [payload, setPayload] = useState(null)
  const [analysis, setAnalysis] = useState(null)
  const [keywords, setKeywords] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [pollTimer, setPollTimer] = useState(0)

  const loadJob = useCallback(async () => {
    try {
      const res = await queryAdminConvex('ingestion:getIngestionJob', { jobId })
      if (!res) {
        setError('Job not found')
        setLoading(false)
        return
      }
      setPayload(res)
      if (res.job.stagedAnalysis) setAnalysis(res.job.stagedAnalysis)
      if (res.job.stagedKeywords) setKeywords(res.job.stagedKeywords)
      setLoading(false)
    } catch (e) {
      setError(e.message || String(e))
      setLoading(false)
    }
  }, [jobId])

  useEffect(() => { loadJob() }, [loadJob])

  // Poll while the job is queued/processing so the UI flips to the editor
  // as soon as Claude finishes.
  useEffect(() => {
    if (!payload) return
    const status = payload.job.status
    if (status !== 'queued' && status !== 'processing') return
    const id = setTimeout(() => setPollTimer(x => x + 1), 3000)
    return () => clearTimeout(id)
  }, [payload, pollTimer])
  useEffect(() => { if (pollTimer > 0) loadJob() }, [pollTimer, loadJob])

  async function saveAnalysis() {
    if (!analysis) return
    setSaving(true)
    try {
      await mutateAdminConvex('ingestion:updateStagedAnalysis', {
        jobId,
        stagedAnalysis: {
          ...analysis,
          vocabularyRange: Number(analysis.vocabularyRange) || 0,
          grammaticalAccuracy: Number(analysis.grammaticalAccuracy) || 0,
          fluencyAndCoherence: Number(analysis.fluencyAndCoherence) || 0,
          pronunciation: Number(analysis.pronunciation) || 0,
          communicativeEffectiveness: Number(analysis.communicativeEffectiveness) || 0,
          overallScore: Number(analysis.overallScore) || 0,
        },
      })
    } catch (e) { setError(e.message) }
    setSaving(false)
  }

  async function saveKeywords() {
    setSaving(true)
    try {
      await mutateAdminConvex('ingestion:updateStagedKeywords', {
        jobId,
        stagedKeywords: keywords,
      })
    } catch (e) { setError(e.message) }
    setSaving(false)
  }

  async function commit() {
    if (!confirm('Commit this lesson to the live student profile? The staged data will be copied into lessons/transcriptAnalyses/keywords.')) return
    setCommitting(true)
    try {
      // Save latest edits first, then commit.
      await saveAnalysis()
      await saveKeywords()
      const result = await mutateAdminConvex('ingestion:commitIngestionJob', {
        jobId,
      })
      navigate('/admin/superadmin/jobs')
    } catch (e) {
      setError(e.message || String(e))
      setCommitting(false)
    }
  }

  async function retry() {
    setError(null)
    try {
      await mutateAdminConvex('ingestion:retryIngestionJob', {
        jobId,
      })
      await loadJob()
    } catch (e) { setError(e.message) }
  }

  if (loading) return <p style={{ color: 'rgba(203,213,225,0.7)' }}>Loading job…</p>
  if (error && !payload) return <p style={{ color: '#fca5a5' }}>Error: {error}</p>
  if (!payload) return null

  const { job, student, prevAnalysis } = payload
  const status = job.status

  // Status banner
  const statusContent = {
    queued: { text: 'Queued for processing…', tone: '#cbd5e1' },
    processing: { text: 'Claude is analyzing the transcript. Hold tight — typically 20-40 seconds.', tone: '#7dd3fc' },
    awaiting_review: { text: 'Ready for review. Edit anything, then commit when you are happy.', tone: '#fcd34d' },
    committed: { text: 'Committed to live student profile.', tone: '#86efac' },
    failed: { text: `Processing failed: ${job.error || 'unknown error'}`, tone: '#fca5a5' },
  }[status]

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="sa-card">
        <div className="sa-card-body flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link to="/admin/superadmin/jobs" className="text-[11px] uppercase tracking-widest" style={{ color: 'rgba(148,163,184,0.75)' }}>
              ← Back to queue
            </Link>
            <h1 className="mt-1 text-2xl font-bold" style={{ color: '#f8fafc' }}>
              {job.detectedTitle || 'Untitled lesson'}
            </h1>
            <p className="text-sm" style={{ color: 'rgba(203,213,225,0.78)' }}>
              {student?.name ?? 'No student'} · {job.detectedDate ?? '—'} · <span className={`sa-badge sa-badge-${status}`}>{status.replace('_', ' ')}</span>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {status === 'failed' && (
              <button onClick={retry} className="sa-btn sa-btn-ghost">
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>refresh</span>
                Retry
              </button>
            )}
            {status === 'awaiting_review' && (
              <>
                <button onClick={saveAnalysis} disabled={saving} className="sa-btn sa-btn-ghost">
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>save</span>
                  {saving ? 'Saving…' : 'Save draft'}
                </button>
                <button onClick={commit} disabled={committing} className="sa-btn sa-btn-primary">
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>check_circle</span>
                  {committing ? 'Committing…' : 'Commit to live'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Status banner */}
      <div className="sa-card" style={{ borderColor: `${statusContent.tone}33` }}>
        <div className="sa-card-body flex items-center gap-3">
          <span className="material-symbols-outlined" style={{ color: statusContent.tone, fontSize: 22 }}>
            {status === 'processing' ? 'auto_awesome' : status === 'awaiting_review' ? 'rate_review' : status === 'failed' ? 'error' : 'info'}
          </span>
          <p style={{ color: statusContent.tone, fontSize: '0.85rem' }}>{statusContent.text}</p>
        </div>
      </div>

      {error && (
        <div className="sa-card">
          <div className="sa-card-body" style={{ color: '#fca5a5' }}>Error: {error}</div>
        </div>
      )}

      {/* Analysis editor */}
      {analysis && (
        <div className="sa-card">
          <div className="sa-card-header">
            <h2>CEFR analysis</h2>
            {prevAnalysis && (
              <p className="text-[11px]" style={{ color: 'rgba(148,163,184,0.7)' }}>
                Previous score: {prevAnalysis.overallScore}/100 · {prevAnalysis.cefrBand}
              </p>
            )}
          </div>
          <div className="sa-card-body space-y-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
              {['vocabularyRange', 'grammaticalAccuracy', 'fluencyAndCoherence', 'pronunciation', 'communicativeEffectiveness', 'overallScore'].map(k => (
                <label key={k} className="block">
                  <span className="sa-stat-label block mb-1">{k.replace(/([A-Z])/g, ' $1').trim()}</span>
                  <input
                    type="number"
                    min={0} max={100}
                    className="sa-input"
                    value={analysis[k]}
                    onChange={e => setAnalysis({ ...analysis, [k]: e.target.value })}
                  />
                </label>
              ))}
            </div>

            <label className="block">
              <span className="sa-stat-label block mb-1">CEFR Band</span>
              <select
                className="sa-input"
                value={analysis.cefrBand}
                onChange={e => setAnalysis({ ...analysis, cefrBand: e.target.value })}
              >
                {['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </label>

            <label className="block">
              <span className="sa-stat-label block mb-1">Lesson summary</span>
              <textarea
                className="sa-input sa-textarea"
                style={{ minHeight: '14rem' }}
                value={analysis.lessonSummary}
                onChange={e => setAnalysis({ ...analysis, lessonSummary: e.target.value })}
              />
            </label>

            {['strengths', 'improvements', 'personalDetails', 'practiceAdvice'].map(field => (
              <StringArrayEditor
                key={field}
                label={field}
                items={analysis[field] || []}
                onChange={items => setAnalysis({ ...analysis, [field]: items })}
              />
            ))}

            <div>
              <p className="sa-stat-label mb-2">Key errors</p>
              {(analysis.keyErrors || []).map((err, i) => (
                <div key={i} className="mb-2 grid gap-2 sm:grid-cols-[2fr_2fr_1fr_auto]">
                  <input
                    className="sa-input"
                    placeholder="Error utterance"
                    value={err.error}
                    onChange={e => {
                      const next = [...analysis.keyErrors]
                      next[i] = { ...next[i], error: e.target.value }
                      setAnalysis({ ...analysis, keyErrors: next })
                    }}
                  />
                  <input
                    className="sa-input"
                    placeholder="Correction"
                    value={err.correction}
                    onChange={e => {
                      const next = [...analysis.keyErrors]
                      next[i] = { ...next[i], correction: e.target.value }
                      setAnalysis({ ...analysis, keyErrors: next })
                    }}
                  />
                  <select
                    className="sa-input"
                    value={err.category}
                    onChange={e => {
                      const next = [...analysis.keyErrors]
                      next[i] = { ...next[i], category: e.target.value }
                      setAnalysis({ ...analysis, keyErrors: next })
                    }}
                  >
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <button
                    type="button"
                    className="sa-btn sa-btn-ghost"
                    onClick={() => setAnalysis({ ...analysis, keyErrors: analysis.keyErrors.filter((_, j) => j !== i) })}
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="sa-btn sa-btn-ghost mt-2"
                onClick={() => setAnalysis({ ...analysis, keyErrors: [...(analysis.keyErrors || []), { error: '', correction: '', category: 'grammar' }] })}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span> Add key error
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Keywords editor */}
      {keywords.length > 0 && (
        <div className="sa-card">
          <div className="sa-card-header">
            <h2>Vocabulary ({keywords.length})</h2>
            <button onClick={saveKeywords} disabled={saving} className="sa-btn sa-btn-ghost">
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>save</span>
              Save keywords
            </button>
          </div>
          <div className="sa-card-body space-y-4">
            {keywords.map((kw, i) => (
              <div key={i} className="rounded-lg border p-4" style={{ borderColor: 'rgba(148,163,184,0.15)', background: 'rgba(15, 23, 42, 0.5)' }}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <input className="sa-input" placeholder="word" value={kw.word} onChange={e => updateKw(i, 'word', e.target.value)} />
                  <input className="sa-input" placeholder="translation" value={kw.translation} onChange={e => updateKw(i, 'translation', e.target.value)} />
                  <input className="sa-input" placeholder="definition EN" value={kw.definitionEn} onChange={e => updateKw(i, 'definitionEn', e.target.value)} />
                  <input className="sa-input" placeholder="definition PL" value={kw.definitionPl} onChange={e => updateKw(i, 'definitionPl', e.target.value)} />
                  <input className="sa-input" placeholder="example EN" value={kw.exampleEn} onChange={e => updateKw(i, 'exampleEn', e.target.value)} />
                  <input className="sa-input" placeholder="example PL" value={kw.examplePl} onChange={e => updateKw(i, 'examplePl', e.target.value)} />
                  <input className="sa-input" placeholder="IPA" value={kw.ipa} onChange={e => updateKw(i, 'ipa', e.target.value)} />
                  <input className="sa-input" placeholder="stress UK" value={kw.stressUK} onChange={e => updateKw(i, 'stressUK', e.target.value)} />
                </div>
                <div className="mt-2 flex justify-end">
                  <button className="sa-btn sa-btn-ghost" onClick={() => setKeywords(keywords.filter((_, j) => j !== i))}>
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )

  function updateKw(idx, field, value) {
    const next = [...keywords]
    next[idx] = { ...next[idx], [field]: value }
    setKeywords(next)
  }
}

function StringArrayEditor({ label, items, onChange }) {
  return (
    <div>
      <p className="sa-stat-label mb-2">{label}</p>
      {items.map((item, i) => (
        <div key={i} className="mb-2 flex gap-2">
          <textarea
            className="sa-input"
            rows={2}
            value={item}
            onChange={e => {
              const next = [...items]
              next[i] = e.target.value
              onChange(next)
            }}
          />
          <button type="button" className="sa-btn sa-btn-ghost" onClick={() => onChange(items.filter((_, j) => j !== i))}>×</button>
        </div>
      ))}
      <button
        type="button"
        className="sa-btn sa-btn-ghost mt-1"
        onClick={() => onChange([...items, ''])}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span> Add {label.replace(/s$/, '')}
      </button>
    </div>
  )
}
