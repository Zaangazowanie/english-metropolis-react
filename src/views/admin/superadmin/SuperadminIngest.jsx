import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { queryAdminConvex, mutateAdminConvex } from '../../../contexts/AdminAuthContext.jsx'

const CONVEX_ORIGIN = 'https://wooden-manatee-881.convex.cloud'

export default function SuperadminIngest() {
  const navigate = useNavigate()

  const [students, setStudents] = useState([])
  const [studentId, setStudentId] = useState('')
  const [lessonDate, setLessonDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [lessonTitle, setLessonTitle] = useState('')

  const [transcriptFile, setTranscriptFile] = useState(null)
  const [transcriptText, setTranscriptText] = useState('')
  const [notesFile, setNotesFile] = useState(null)
  const [sourceKind, setSourceKind] = useState('manual_upload')

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let alive = true
    queryAdminConvex('students:listStudents', {})
      .then(d => { if (alive) setStudents(d) })
      .catch(e => { if (alive) setError(e.message) })
    return () => { alive = false }
  }, [])

  async function uploadToStorage(file) {
    const uploadUrl = await mutateAdminConvex('ingestion:generateUploadUrl', {})
    const res = await fetch(uploadUrl, {
      method: 'POST',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file,
    })
    if (!res.ok) throw new Error(`Upload failed: ${res.status}`)
    const { storageId } = await res.json()
    return storageId
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)

    if (!studentId) {
      setError('Pick a student before submitting.')
      return
    }
    if (!transcriptFile && !transcriptText.trim()) {
      setError('Either upload a transcript file or paste transcript text.')
      return
    }

    setBusy(true)
    try {
      const args = {
        sourceKind: transcriptText.trim() ? 'manual_paste' : sourceKind,
        detectedStudentId: studentId,
        detectedDate: lessonDate,
        detectedTitle: lessonTitle || undefined,
      }
      if (transcriptFile) {
        args.transcriptStorageId = await uploadToStorage(transcriptFile)
        args.sourceFilename = transcriptFile.name
      } else if (transcriptText.trim()) {
        args.transcriptText = transcriptText.trim()
      }
      if (notesFile) {
        args.notesStorageId = await uploadToStorage(notesFile)
      }
      const result = await mutateAdminConvex('ingestion:createIngestionJob', args)
      navigate(`/admin/superadmin/curriculum/ingest/${result.jobId}`)
    } catch (e) {
      setError(e.message || String(e))
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="sa-card">
        <div className="sa-card-header">
          <h2>Ingest a new lesson</h2>
          <span className="sa-toolbar-count">
            Claude processes → you review → you commit
          </span>
        </div>
        <div className="sa-card-body">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid gap-5 md:grid-cols-2">
              <label className="block">
                <span className="sa-stat-label mb-1 block">
                  Student
                </span>
                <select
                  className="sa-input"
                  value={studentId}
                  onChange={e => setStudentId(e.target.value)}
                  required
                >
                  <option value="">Pick a student…</option>
                  {students.map(s => (
                    <option key={s._id} value={s._id}>{s.name} · {s.level}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="sa-stat-label mb-1 block">
                  Lesson date
                </span>
                <input
                  type="date"
                  className="sa-input"
                  value={lessonDate}
                  onChange={e => setLessonDate(e.target.value)}
                  required
                />
              </label>
              <label className="block md:col-span-2">
                <span className="sa-stat-label mb-1 block">
                  Lesson title (optional)
                </span>
                <input
                  type="text"
                  className="sa-input"
                  placeholder="e.g. Prohibition and Policy Parallels"
                  value={lessonTitle}
                  onChange={e => setLessonTitle(e.target.value)}
                />
              </label>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <label className="block">
                <span className="sa-stat-label mb-1 block">
                  Transcript file (.txt from Tactiq)
                </span>
                <input
                  type="file"
                  accept=".txt,.md,.srt,.vtt"
                  className="sa-input"
                  onChange={e => setTranscriptFile(e.target.files[0] || null)}
                  style={{ paddingTop: '0.55rem', paddingBottom: '0.55rem' }}
                />
              </label>
              <label className="block">
                <span className="sa-stat-label mb-1 block">
                  Lesson notes PDF (optional)
                </span>
                <input
                  type="file"
                  accept=".pdf,.txt,.md"
                  className="sa-input"
                  onChange={e => setNotesFile(e.target.files[0] || null)}
                  style={{ paddingTop: '0.55rem', paddingBottom: '0.55rem' }}
                />
              </label>
            </div>

            <label className="block">
              <span className="sa-stat-label mb-1 block">
                …or paste transcript text directly (fallback)
              </span>
              <textarea
                className="sa-input sa-textarea"
                placeholder="Paste a raw transcript here if you don't have a file."
                value={transcriptText}
                onChange={e => setTranscriptText(e.target.value)}
              />
            </label>

            {error && (
              <div
                className="rounded-lg border p-3 text-sm"
                style={{
                  background: 'var(--sa-bad-soft)',
                  borderColor: 'var(--sa-bad)',
                  color: 'var(--sa-bad)',
                }}
              >
                {error}
              </div>
            )}

            <div className="flex gap-3">
              <button type="submit" className="sa-btn sa-btn-primary" disabled={busy}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                  {busy ? 'hourglass_top' : 'auto_awesome'}
                </span>
                {busy ? 'Uploading & processing…' : 'Process with Claude'}
              </button>
              <button
                type="button"
                className="sa-btn sa-btn-ghost"
                onClick={() => navigate('/admin/superadmin')}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>

      <div className="sa-card">
        <div className="sa-card-body text-sm" style={{ color: 'var(--sa-text-muted)', lineHeight: 1.65 }}>
          <p className="mb-2 font-semibold" style={{ color: 'var(--sa-text)' }}>How this works</p>
          <ol className="ml-4 list-decimal space-y-1">
            <li>We upload your files straight to Convex storage.</li>
            <li>The backend calls Claude Opus 4.6 for analysis + Claude Sonnet 4.6 for keyword extraction.</li>
            <li>You land on a review page where every field is editable.</li>
            <li>Nothing touches the live lesson timeline until you click <strong style={{ color: 'var(--sa-violet-600)' }}>Commit</strong>.</li>
          </ol>
        </div>
      </div>
    </div>
  )
}
