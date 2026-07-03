// TeacherKeywords — "Keywords": table editor for a student's vocabulary (P2, slice 4).
//
// Contract (docs/console/API-CONTRACT.md, teacher-scoped):
//   GET  /api/console/teacher/keywords?student_slug=&lesson_id=
//        → { rows:[{id, word, translation, ipa, definitionEn, definitionPl,
//                   exampleEn, examplePl, wordType, difficulty, mastery}] }
//   POST /api/console/teacher/keywords/add    { student_slug, lesson_id?, word, ... } → { ok, id }
//   POST /api/console/teacher/keywords/update { id, ...changed fields }              → { ok }
//   POST /api/console/teacher/keywords/delete { id }                                 → { ok }
//
// UI: a simple table editor consistent with the 9-col keyword shape (BRIEF P2).
// The 9 content columns are editable inline (add row on top, per-row edit);
// `mastery` is a learned metric — displayed read-only. The backend enriches
// missing fields asynchronously after add, and scopes every call to the
// teacher's own students server-side. Until the GET is live: calm
// "backend not live yet" panel — rows are never mocked (KICKOFF.md rule 4).

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useOutletContext, useSearchParams } from 'react-router-dom'
import {
  addTeacherKeyword,
  deleteTeacherKeyword,
  getTeacherKeywords,
  updateTeacherKeyword,
} from './consoleApi.js'
import { BackendNotLive, SectionError, SectionLoading } from './TeacherPanels.jsx'

// The 9 editable columns of the keyword shape (mastery is read-only).
const COLS = [
  { key: 'word', label: 'Word', width: 'w-36', required: true },
  { key: 'translation', label: 'Translation', width: 'w-36' },
  { key: 'ipa', label: 'IPA', width: 'w-28' },
  { key: 'definitionEn', label: 'Definition (EN)', width: 'w-56' },
  { key: 'definitionPl', label: 'Definition (PL)', width: 'w-56' },
  { key: 'exampleEn', label: 'Example (EN)', width: 'w-56' },
  { key: 'examplePl', label: 'Example (PL)', width: 'w-56' },
  { key: 'wordType', label: 'Type', width: 'w-24' },
  { key: 'difficulty', label: 'Difficulty', width: 'w-24' },
]

const emptyDraft = () => Object.fromEntries(COLS.map(c => [c.key, '']))

// Only send fields that actually carry a value (add) / actually changed (update).
function nonEmptyFields(draft) {
  const out = {}
  for (const c of COLS) {
    const v = String(draft[c.key] ?? '').trim()
    if (v) out[c.key] = v
  }
  return out
}

function changedFields(draft, original) {
  const out = {}
  for (const c of COLS) {
    const next = String(draft[c.key] ?? '').trim()
    const prev = String(original?.[c.key] ?? '').trim()
    if (next !== prev) out[c.key] = next
  }
  return out
}

export default function TeacherKeywords() {
  const { me } = useOutletContext()

  const students = useMemo(
    () => (Array.isArray(me?.students) ? [...me.students] : [])
      .sort((a, b) => String(a?.name || a?.slug || '').localeCompare(String(b?.name || b?.slug || ''))),
    [me],
  )
  const rosterLive = students.length > 0

  // ?student=<slug> preselects the student and ?lesson=<id> pre-fills the
  // lesson filter — used by the student detail view's "Edit keywords"
  // hand-off and the Materials rows' "Keywords" links. Server-side scoping
  // still applies regardless of what the URL carries.
  const [searchParams] = useSearchParams()
  const presetSlug = (searchParams.get('student') || '').trim()
  const presetLesson = (searchParams.get('lesson') || '').trim()

  const [studentSlug, setStudentSlug] = useState(presetSlug)
  const [manualSlug, setManualSlug] = useState(presetSlug)
  const [lessonId, setLessonId] = useState(presetLesson)
  const activeSlug = (rosterLive ? studentSlug : manualSlug).trim()

  const [state, setState] = useState({ loading: false, error: null, rows: null })
  const [notice, setNotice] = useState(null) // { kind:'ok'|'err', text }
  const [busy, setBusy] = useState(false)    // any mutation in flight

  const [addDraft, setAddDraft] = useState(emptyDraft())
  const [editingId, setEditingId] = useState(null)
  const [editDraft, setEditDraft] = useState(emptyDraft())
  const [armedDeleteId, setArmedDeleteId] = useState(null)

  const load = useCallback(async () => {
    if (!activeSlug) { setState({ loading: false, error: null, rows: null }); return }
    setState(s => ({ ...s, loading: true, error: null }))
    setEditingId(null)
    setArmedDeleteId(null)
    try {
      const data = await getTeacherKeywords({ studentSlug: activeSlug, lessonId: lessonId.trim() || undefined })
      setState({ loading: false, error: null, rows: Array.isArray(data?.rows) ? data.rows : [] })
    } catch (err) {
      setState({ loading: false, error: err, rows: null })
    }
  }, [activeSlug, lessonId])
  useEffect(() => { load() }, [load])

  const runMutation = async (fn, okText) => {
    if (busy) return false
    setBusy(true)
    setNotice(null)
    try {
      const res = await fn()
      if (res && res.ok === false) {
        setNotice({ kind: 'err', text: 'The backend rejected this change — nothing was saved.' })
        return false
      }
      if (okText) setNotice({ kind: 'ok', text: okText })
      await load()
      return true
    } catch (err) {
      setNotice({
        kind: 'err',
        text: err?.kind === 'not-live'
          ? 'The keywords write endpoints are not live yet — nothing was saved.'
          : String(err?.message || 'The change failed.'),
      })
      return false
    } finally {
      setBusy(false)
    }
  }

  const submitAdd = async () => {
    const word = String(addDraft.word || '').trim()
    if (!word) { setNotice({ kind: 'err', text: 'A new keyword needs at least the word itself.' }); return }
    const ok = await runMutation(
      () => addTeacherKeyword({
        student_slug: activeSlug,
        ...(lessonId.trim() ? { lesson_id: lessonId.trim() } : {}),
        ...nonEmptyFields(addDraft),
      }),
      `“${word}” added — missing fields are enriched automatically in the background.`,
    )
    if (ok) setAddDraft(emptyDraft())
  }

  const startEdit = (row) => {
    setEditingId(row.id)
    setArmedDeleteId(null)
    setEditDraft(Object.fromEntries(COLS.map(c => [c.key, row?.[c.key] ?? ''])))
  }

  const submitEdit = async (row) => {
    const changes = changedFields(editDraft, row)
    if (!Object.keys(changes).length) { setEditingId(null); return }
    if ('word' in changes && !changes.word) {
      setNotice({ kind: 'err', text: 'The word itself can’t be empty.' })
      return
    }
    const ok = await runMutation(
      () => updateTeacherKeyword({ id: row.id, ...changes }),
      `“${String(editDraft.word || row.word)}” updated.`,
    )
    if (ok) setEditingId(null)
  }

  const submitDelete = async (row) => {
    const ok = await runMutation(
      () => deleteTeacherKeyword(row.id),
      `“${String(row.word || 'keyword')}” removed.`,
    )
    if (ok) setArmedDeleteId(null)
  }

  const cellInput = (draft, setDraft, col, compactPlaceholder) => (
    <input
      type="text"
      value={draft[col.key] ?? ''}
      onChange={e => setDraft(d => ({ ...d, [col.key]: e.target.value }))}
      placeholder={compactPlaceholder ? col.label : undefined}
      className={`${col.width} min-w-0 rounded-[0.6rem] border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 focus:border-sky-400 focus:outline-none`}
    />
  )

  const rows = state.rows || []
  const inputCls = 'rounded-[0.75rem] border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 focus:border-sky-400 focus:outline-none'

  return (
    <section className="glass-panel rounded-[2rem] border border-white/50 px-5 py-6 editorial-shadow sm:px-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-label text-xs font-bold uppercase tracking-[0.28em] text-sky-600">Keywords</p>
          <h2 className="mt-1 font-headline text-3xl text-slate-900">Vocabulary <span className="italic text-sky-600">Editor</span></h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
            Add, correct or remove keywords on your students’ lessons. Only the word is required when
            adding — the enrichment pipeline fills in IPA, definitions and examples in the background.
            Mastery is learned from practice and is read-only.
          </p>
        </div>
        <button
          onClick={load}
          title="Refresh"
          disabled={!activeSlug}
          className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-600 hover:border-sky-300 hover:text-sky-700 transition enabled:cursor-pointer disabled:opacity-40"
        >
          <span className="material-symbols-outlined text-lg">refresh</span>
          Refresh
        </button>
      </div>

      {/* student + lesson filter */}
      <div className="mt-4 flex flex-wrap items-end gap-3">
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
        <label className="flex min-w-[12rem] flex-col gap-1">
          <span className="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Lesson ID (optional)</span>
          <input type="text" value={lessonId} onChange={e => setLessonId(e.target.value)}
            placeholder="filter to one lesson" className={inputCls} />
        </label>
      </div>

      {notice && (
        <div className={`mt-4 rounded-[1.25rem] border px-5 py-3 text-sm font-semibold ${
          notice.kind === 'ok' ? 'border-emerald-200 bg-emerald-50/80 text-emerald-800'
          : 'border-rose-200 bg-rose-50/80 text-rose-800'
        }`}>
          {notice.text}
        </div>
      )}

      <div className="mt-4">
        {!activeSlug ? (
          <p className="rounded-[1rem] border border-dashed border-sky-300 bg-white/60 px-4 py-3 text-sm text-slate-500">
            Pick a student to load their keywords.
          </p>
        ) : state.loading ? (
          <SectionLoading />
        ) : state.error?.kind === 'not-live' ? (
          <BackendNotLive endpoint="GET /api/console/teacher/keywords" />
        ) : state.error ? (
          <SectionError error={state.error} onRetry={load} />
        ) : (
          <div className="overflow-x-auto rounded-[1.25rem] border border-white/70 bg-white/80">
            <table className="w-full min-w-[1450px] border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-100">
                  {COLS.map(c => (
                    <th key={c.key} className="px-3 py-2.5 font-label text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                      {c.label}{c.required && <span className="text-rose-400"> *</span>}
                    </th>
                  ))}
                  <th className="px-3 py-2.5 font-label text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Mastery</th>
                  <th className="px-3 py-2.5 font-label text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Actions</th>
                </tr>
              </thead>
              <tbody>
                {/* add row */}
                <tr className="border-b border-slate-100 bg-sky-50/40 align-top">
                  {COLS.map(c => (
                    <td key={c.key} className="px-2 py-2">{cellInput(addDraft, setAddDraft, c, true)}</td>
                  ))}
                  <td className="px-3 py-2 text-xs text-slate-400">—</td>
                  <td className="px-2 py-2">
                    <button
                      onClick={submitAdd}
                      disabled={busy}
                      className="inline-flex items-center gap-1.5 rounded-full border border-sky-300 bg-white px-3 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-50 transition enabled:cursor-pointer disabled:opacity-40"
                    >
                      <span className="material-symbols-outlined text-sm">add</span>
                      Add
                    </button>
                  </td>
                </tr>

                {/* data rows */}
                {rows.map(row => {
                  const isEditing = editingId === row.id
                  return (
                    <tr key={row.id} className="border-b border-slate-50 align-top hover:bg-sky-50/30 transition">
                      {COLS.map(c => (
                        <td key={c.key} className="px-2 py-2">
                          {isEditing ? cellInput(editDraft, setEditDraft, c, false) : (
                            <span
                              title={String(row?.[c.key] ?? '')}
                              className={`block ${c.width} truncate text-xs ${c.key === 'word' ? 'font-bold text-slate-900' : 'font-medium text-slate-600'}`}
                            >
                              {String(row?.[c.key] ?? '') || <span className="text-slate-300">·</span>}
                            </span>
                          )}
                        </td>
                      ))}
                      <td className="px-3 py-2">
                        {row?.mastery !== undefined && row?.mastery !== null ? (
                          <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                            {String(row.mastery)}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-300">·</span>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-1.5">
                          {isEditing ? (
                            <>
                              <button onClick={() => submitEdit(row)} disabled={busy} title="Save"
                                className="flex h-8 w-8 items-center justify-center rounded-full border border-emerald-200 bg-white text-emerald-600 hover:bg-emerald-50 transition enabled:cursor-pointer disabled:opacity-40">
                                <span className="material-symbols-outlined text-base">check</span>
                              </button>
                              <button onClick={() => setEditingId(null)} disabled={busy} title="Cancel"
                                className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 transition enabled:cursor-pointer disabled:opacity-40">
                                <span className="material-symbols-outlined text-base">close</span>
                              </button>
                            </>
                          ) : armedDeleteId === row.id ? (
                            <>
                              <button onClick={() => submitDelete(row)} disabled={busy} title="Confirm delete"
                                className="inline-flex items-center gap-1 rounded-full border border-rose-300 bg-rose-50 px-2.5 py-1 text-[11px] font-bold text-rose-700 hover:bg-rose-100 transition enabled:cursor-pointer disabled:opacity-40">
                                <span className="material-symbols-outlined text-sm">delete_forever</span>
                                Sure?
                              </button>
                              <button onClick={() => setArmedDeleteId(null)} disabled={busy} title="Keep it"
                                className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 transition enabled:cursor-pointer disabled:opacity-40">
                                <span className="material-symbols-outlined text-base">close</span>
                              </button>
                            </>
                          ) : (
                            <>
                              <button onClick={() => startEdit(row)} disabled={busy} title="Edit"
                                className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 hover:border-sky-300 hover:text-sky-700 transition enabled:cursor-pointer disabled:opacity-40">
                                <span className="material-symbols-outlined text-base">edit</span>
                              </button>
                              <button onClick={() => { setArmedDeleteId(row.id); setEditingId(null) }} disabled={busy} title="Delete"
                                className="flex h-8 w-8 items-center justify-center rounded-full border border-rose-200 bg-white text-rose-500 hover:bg-rose-50 transition enabled:cursor-pointer disabled:opacity-40">
                                <span className="material-symbols-outlined text-base">delete</span>
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}

                {rows.length === 0 && (
                  <tr>
                    <td colSpan={COLS.length + 2} className="px-4 py-6 text-center text-sm text-slate-500">
                      No keywords {lessonId.trim() ? 'on this lesson' : 'for this student'} yet — add the first one in the row above.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  )
}
