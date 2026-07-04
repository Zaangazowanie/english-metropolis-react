// TeacherUpload — "Upload": hand in a finished lesson or transcript (P2, slice 3).
//
// POST /api/console/teacher/upload (docs/console/API-CONTRACT.md) — multipart:
//   file (pdf / txt / vtt), fields student_slug, date, title?, kind =
//   finished_lesson | transcript.
// The backend stores the file and creates/updates the `lessons` record
// (materials[]). LIVE behaviour (2026-07-04): transcript auto-ingestion
// stays superadmin-side (a Convex guard) — teacher uploads are stored and
// audited, and the school starts AI ingestion from the admin console, so
// ingestion_job_id only appears if the backend actually queued a job.
//   → { ok, lesson_id?, ingestion_job_id?, url }
//
// The endpoint is POST-only, so there is no mount-time probe: the form always
// renders, and a 404 on submit surfaces the standard "backend not live yet"
// panel (never fake success). Student choice comes from the /me roster; while
// that endpoint isn't live yet a clearly-labelled manual slug field keeps the
// form usable — the backend still enforces teacher scope server-side either way.

import { useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { postTeacherUpload, teacherConsoleFetchBlob } from './consoleApi.js'
import { BackendNotLive } from './TeacherPanels.jsx'

const KINDS = [
  {
    key: 'finished_lesson',
    icon: 'picture_as_pdf',
    label: 'Finished lesson (PDF)',
    hint: 'The lesson file as taught — stored on the student’s record and visible under Materials.',
    accept: '.pdf',
    pattern: /\.pdf$/i,
    patternHint: 'a .pdf file',
  },
  {
    key: 'transcript',
    icon: 'description',
    label: 'Transcript (txt / vtt)',
    hint: 'A lesson transcript — stored on the student’s record; the school starts AI ingestion from the admin console.',
    accept: '.txt,.vtt',
    pattern: /\.(txt|vtt)$/i,
    patternHint: 'a .txt or .vtt file',
  },
]

function isoToday() { return new Date().toISOString().slice(0, 10) }

function fmtSize(bytes) {
  const n = Number(bytes) || 0
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  if (n >= 1024) return `${Math.round(n / 1024)} KB`
  return `${n} B`
}

export default function TeacherUpload() {
  const { me } = useOutletContext()

  const students = useMemo(
    () => (Array.isArray(me?.students) ? [...me.students] : [])
      .sort((a, b) => String(a?.name || a?.slug || '').localeCompare(String(b?.name || b?.slug || ''))),
    [me],
  )
  const rosterLive = students.length > 0

  const [studentSlug, setStudentSlug] = useState('')
  const [manualSlug, setManualSlug] = useState('')
  const [kindKey, setKindKey] = useState('finished_lesson')
  const [date, setDate] = useState(isoToday())
  const [title, setTitle] = useState('')
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [notLive, setNotLive] = useState(false)
  const [notice, setNotice] = useState(null) // { kind:'ok'|'err', text, url?, lessonId?, jobId? }

  const kind = KINDS.find(k => k.key === kindKey) || KINDS[0]

  const pickKind = (key) => {
    setKindKey(key)
    // A picked file that no longer matches the kind would fail validation —
    // clear it so the accept filter and the file agree.
    const next = KINDS.find(k => k.key === key)
    if (file && next && !next.pattern.test(file.name)) setFile(null)
  }

  const submit = async (e) => {
    e.preventDefault()
    if (busy) return
    setNotice(null)
    setNotLive(false)

    const slug = (rosterLive ? studentSlug : manualSlug).trim()
    if (!slug) { setNotice({ kind: 'err', text: 'Pick the student this upload belongs to.' }); return }
    if (!date) { setNotice({ kind: 'err', text: 'Set the lesson date.' }); return }
    if (!file) { setNotice({ kind: 'err', text: 'Choose a file to upload.' }); return }
    if (!kind.pattern.test(file.name)) {
      setNotice({ kind: 'err', text: `${kind.label} needs ${kind.patternHint} — “${file.name}” doesn’t match.` })
      return
    }

    setBusy(true)
    try {
      const res = await postTeacherUpload({
        file,
        studentSlug: slug,
        date,
        title: title.trim() || undefined,
        kind: kind.key,
      })
      if (res && res.ok === false) {
        setNotice({ kind: 'err', text: 'The backend rejected this upload — nothing was stored.' })
      } else {
        setNotice({
          kind: 'ok',
          text: kind.key === 'transcript'
            ? (res?.ingestion_job_id
              ? 'Transcript uploaded — it’s now queued for the ingestion pipeline.'
              : 'Transcript uploaded and stored — the school starts AI ingestion from the admin console.')
            : 'Lesson uploaded — it’s stored on the student’s record.',
          lessonId: res?.lesson_id,
          jobId: res?.ingestion_job_id,
          url: res?.url,
        })
        setFile(null)
        setTitle('')
      }
    } catch (err) {
      if (err?.kind === 'not-live') setNotLive(true)
      else setNotice({ kind: 'err', text: String(err?.message || 'Upload failed.') })
    } finally {
      setBusy(false)
    }
  }

  // The stored-file URL may need the bearer header — same-origin paths are
  // fetched as a blob and opened; absolute URLs open directly.
  const openStored = async (url) => {
    if (!url) return
    if (/^https?:\/\//i.test(url)) {
      window.open(url, '_blank', 'noopener')
      return
    }
    try {
      const blob = await teacherConsoleFetchBlob(url)
      const objectUrl = URL.createObjectURL(blob)
      window.open(objectUrl, '_blank', 'noopener')
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60000)
    } catch (err) {
      setNotice({ kind: 'err', text: `Could not open the stored file — ${String(err?.message || err)}` })
    }
  }

  const inputCls = 'rounded-[0.75rem] border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 focus:border-sky-400 focus:outline-none'

  return (
    <section className="glass-panel rounded-[2rem] border border-white/50 px-5 py-6 editorial-shadow sm:px-8">
      <p className="font-label text-xs font-bold uppercase tracking-[0.28em] text-sky-600">Upload</p>
      <h2 className="mt-1 font-headline text-3xl text-slate-900">Hand in a <span className="italic text-sky-600">Lesson</span></h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
        Upload the finished lesson PDF for a student’s record, or a lesson transcript — transcripts
        are stored on the record and the school starts AI ingestion from the admin console.
        Everything lands on your own students only — scope is enforced on the server.
      </p>

      {notLive && (
        <div className="mt-5"><BackendNotLive endpoint="POST /api/console/teacher/upload" /></div>
      )}

      {notice && (
        <div className={`mt-5 rounded-[1.25rem] border px-5 py-4 text-sm ${
          notice.kind === 'ok' ? 'border-emerald-200 bg-emerald-50/80 text-emerald-800'
          : 'border-rose-200 bg-rose-50/80 text-rose-800'
        }`}>
          <p className="font-semibold">{notice.text}</p>
          {(notice.lessonId || notice.jobId || notice.url) && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {notice.lessonId && (
                <span className="rounded-full border border-emerald-200 bg-white px-2.5 py-0.5 text-xs font-semibold text-emerald-700">lesson {String(notice.lessonId)}</span>
              )}
              {notice.jobId && (
                <span className="rounded-full border border-emerald-200 bg-white px-2.5 py-0.5 text-xs font-semibold text-emerald-700">ingestion job {String(notice.jobId)}</span>
              )}
              {notice.url && (
                <button onClick={() => openStored(notice.url)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-white px-3 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 transition cursor-pointer">
                  <span className="material-symbols-outlined text-sm">open_in_new</span>
                  Open stored file
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <form onSubmit={submit} className="mt-5 space-y-5">
        {/* kind picker */}
        <div className="grid gap-3 sm:grid-cols-2">
          {KINDS.map(k => (
            <button
              key={k.key}
              type="button"
              onClick={() => pickKind(k.key)}
              className={`rounded-[1.25rem] border px-4 py-3 text-left transition cursor-pointer ${
                kindKey === k.key
                  ? 'border-sky-300 bg-sky-50/70 shadow-[0_14px_30px_-24px_rgba(2,132,199,0.8)]'
                  : 'border-slate-200 bg-white/70 hover:border-sky-200'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className={`material-symbols-outlined text-xl ${kindKey === k.key ? 'text-sky-600' : 'text-slate-400'}`}>{k.icon}</span>
                <span className="text-sm font-semibold text-slate-900">{k.label}</span>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-500">{k.hint}</p>
            </button>
          ))}
        </div>

        {/* student + date + title */}
        <div className="flex flex-wrap items-end gap-3">
          {rosterLive ? (
            <label className="flex min-w-[14rem] flex-col gap-1">
              <span className="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Student</span>
              <select value={studentSlug} onChange={e => setStudentSlug(e.target.value)} className={`${inputCls} cursor-pointer`}>
                <option value="">Choose a student…</option>
                {students.map(s => <option key={s?.slug} value={s?.slug}>{s?.name || s?.slug}</option>)}
              </select>
            </label>
          ) : (
            <label className="flex min-w-[14rem] flex-col gap-1">
              <span className="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Student slug</span>
              <input type="text" value={manualSlug} onChange={e => setManualSlug(e.target.value)}
                placeholder="e.g. anna-kowalska" className={inputCls} />
              <span className="text-xs text-slate-400">Roster endpoint isn’t live yet — enter the student’s slug manually for now.</span>
            </label>
          )}
          <label className="flex flex-col gap-1">
            <span className="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Lesson date</span>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputCls} />
          </label>
          <label className="flex min-w-[14rem] flex-1 flex-col gap-1">
            <span className="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Title (optional)</span>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Travel idioms — lesson 12" className={inputCls} />
          </label>
        </div>

        {/* file picker */}
        <div className="rounded-[1.25rem] border border-dashed border-sky-300 bg-white/60 px-4 py-4">
          {file ? (
            <div className="flex flex-wrap items-center gap-3">
              <span className="material-symbols-outlined text-2xl text-sky-500">{kind.icon}</span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">{file.name}</p>
                <p className="text-xs text-slate-400">{fmtSize(file.size)}</p>
              </div>
              <button type="button" onClick={() => setFile(null)} title="Remove file"
                className="ml-auto flex h-9 w-9 items-center justify-center rounded-full border border-rose-200 bg-white text-rose-600 hover:bg-rose-50 transition cursor-pointer">
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>
          ) : (
            <label className="flex cursor-pointer flex-wrap items-center gap-3">
              <span className="material-symbols-outlined text-2xl text-sky-400">upload_file</span>
              <span className="text-sm font-semibold text-sky-700">Choose {kind.patternHint}…</span>
              <span className="text-xs text-slate-400">({kind.accept})</span>
              <input
                type="file"
                accept={kind.accept}
                className="hidden"
                onChange={e => { setFile(e.target.files?.[0] || null); e.target.value = '' }}
              />
            </label>
          )}
        </div>

        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-sky-600 to-blue-700 px-6 py-3 text-sm font-semibold text-white shadow-[0_16px_35px_-18px_rgba(2,132,199,0.9)] transition-all duration-300 enabled:hover:-translate-y-0.5 enabled:cursor-pointer disabled:opacity-40"
        >
          <span className="material-symbols-outlined text-lg">cloud_upload</span>
          {busy ? 'Uploading…' : 'Upload'}
        </button>
      </form>
    </section>
  )
}
