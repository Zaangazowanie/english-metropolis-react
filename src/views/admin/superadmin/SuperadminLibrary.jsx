// SuperadminLibrary — the COURSE STUDIO (rebuilt 2026-07-09, Mike's spec).
// The library is organised exactly the way the Hyperagent fleet built it:
// course → numbered lessons. Every lesson is fully viewable AND editable in
// place — keywords (rewrites the deck + re-renders the PDF with the fleet's
// own renderer) and PDF page order. Every edit is git-committed to the
// em-course-library repo with the operator's email.

import { useEffect, useMemo, useState } from 'react'
import { consoleGet, consoleGetBlob, consolePost, libraryPdfPath } from './consoleApi.js'
import { ConsoleEmpty, ConsoleLoading, ConsoleSkeleton, LevelBadge } from './ConsoleStates.jsx'

const BASKET_ICON = { IDEAS: 'psychology', PLACES: 'public', SOCIETY: 'newspaper', SPEC: 'work', SUM: 'sunny' }

function groupLabel(cid) {
  if (cid.startsWith('SPEC-')) return 'Specialist tracks'
  if (cid.startsWith('SUM-')) return 'Summer intensives'
  return `General conversation · ${cid.split('-')[1]}`
}

export default function SuperadminLibrary() {
  const [courses, setCourses] = useState(null)
  const [q, setQ] = useState('')
  const [openCourse, setOpenCourse] = useState('')
  const [openLesson, setOpenLesson] = useState('')

  useEffect(() => {
    let alive = true
    consoleGet('/api/console/courses')
      .then(d => { if (alive) setCourses(d.courses || []) })
      .catch(() => { if (alive) setCourses([]) })
    return () => { alive = false }
  }, [])

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const out = new Map()
    for (const c of courses || []) {
      const lessons = needle
        ? c.lessons.filter(l => (l.title + ' ' + l.lesson_id + ' ' + (l.topic || '')).toLowerCase().includes(needle))
        : c.lessons
      if (needle && !lessons.length && !c.course_id.toLowerCase().includes(needle)) continue
      const g = groupLabel(c.course_id)
      if (!out.has(g)) out.set(g, [])
      out.get(g).push({ ...c, lessons })
    }
    return [...out.entries()]
  }, [courses, q])

  if (courses === null) return <ConsoleSkeleton />

  const totalDecks = courses.reduce((n, c) => n + c.lesson_count, 0)

  return (
    <div className="space-y-5">
      <div className="sa-card">
        <div className="sa-card-header" style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
          <h2>Course Studio · {courses.length} courses · {totalDecks} decks</h2>
          <input type="search" className="sa-input" placeholder="Search lessons, topics, course codes…"
            value={q} onChange={e => setQ(e.target.value)} style={{ maxWidth: 340 }} />
        </div>
        <div className="sa-card-body space-y-6">
          {!groups.length && (
            <ConsoleEmpty icon="menu_book" title="No courses match" hint="Adjust the search to see decks again." />
          )}
          {groups.map(([label, cs]) => (
            <div key={label}>
              <p className="sa-stat-label mb-2">{label}</p>
              <div className="space-y-2">
                {cs.map(c => (
                  <div key={c.course_id} className="rounded-2xl border"
                    style={{ borderColor: openCourse === c.course_id ? 'var(--sa-violet-300)' : 'var(--sa-border)',
                      background: 'var(--sa-surface)' }}>
                    <button type="button" className="flex w-full items-center gap-3 px-4 py-3 text-left"
                      style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                      onClick={() => { setOpenCourse(openCourse === c.course_id ? '' : c.course_id); setOpenLesson('') }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--sa-violet-600)' }}>
                        {BASKET_ICON[c.basket] || 'menu_book'}
                      </span>
                      <span className="font-mono text-sm font-bold" style={{ color: 'var(--sa-text)' }}>{c.course_id}</span>
                      {c.level ? <LevelBadge level={c.level} /> : <span className="sa-badge">—</span>}
                      <span className="text-xs" style={{ color: 'var(--sa-text-muted)' }}>{c.lesson_count} lessons</span>
                      <span className="material-symbols-outlined ml-auto" style={{ fontSize: 18, color: 'var(--sa-text-muted)',
                        transform: openCourse === c.course_id ? 'rotate(180deg)' : 'none', transition: 'transform 200ms' }}>
                        expand_more
                      </span>
                    </button>
                    {openCourse === c.course_id && (
                      <div className="space-y-1 px-3 pb-3">
                        {c.lessons.map(l => (
                          <LessonStudioRow key={l.lesson_id} lesson={l}
                            open={openLesson === l.lesson_id}
                            onToggle={() => setOpenLesson(openLesson === l.lesson_id ? '' : l.lesson_id)} />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function LessonStudioRow({ lesson, open, onToggle }) {
  return (
    <div className="rounded-xl border" style={{ borderColor: open ? 'var(--sa-violet-300)' : 'var(--sa-border)',
      background: 'var(--sa-surface-soft)' }}>
      <button type="button" className="flex w-full items-center gap-3 px-3 py-2 text-left"
        style={{ background: 'none', border: 'none', cursor: 'pointer' }} onClick={onToggle}>
        <span className="font-mono text-xs font-bold" style={{ color: 'var(--sa-text-muted)', width: 24 }}>
          {String(lesson.lesson_number ?? '?').padStart(2, '0')}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold" style={{ color: 'var(--sa-text)' }}>{lesson.title}</span>
        <span className="sa-badge sa-badge-queued">{lesson.keyword_count} kw</span>
        <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--sa-text-muted)' }}>
          {open ? 'expand_less' : 'expand_more'}
        </span>
      </button>
      {open && <LessonStudio lesson={lesson} />}
    </div>
  )
}

function LessonStudio({ lesson }) {
  const [kw, setKw] = useState(null)          // editable keyword rows
  const [pages, setPages] = useState(null)    // current page order [1..n]
  const [dirtyKw, setDirtyKw] = useState(false)
  const [dirtyPg, setDirtyPg] = useState(false)
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState(null)
  const [pdfBusy, setPdfBusy] = useState(false)

  useEffect(() => {
    let alive = true
    consoleGet(`/api/console/library/${encodeURIComponent(lesson.lesson_id)}/keywords`)
      .then(d => { if (alive) setKw((d.keywords || []).map(k => ({ ...k }))) })
      .catch(() => { if (alive) setKw([]) })
    consoleGet(`/api/console/library/${encodeURIComponent(lesson.lesson_id)}/pdf-info`)
      .then(d => { if (alive) setPages(Array.from({ length: d.pages }, (_, i) => i + 1)) })
      .catch(() => { if (alive) setPages([]) })
    return () => { alive = false }
  }, [lesson.lesson_id])

  async function previewPdf() {
    setPdfBusy(true)
    try {
      const blob = await consoleGetBlob(libraryPdfPath(lesson.lesson_id))
      const url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }))
      const a = document.createElement('a')
      a.href = url; a.target = '_blank'; a.rel = 'noopener'
      document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 60000)
    } finally { setPdfBusy(false) }
  }

  async function saveKeywords() {
    setBusy('kw'); setMsg(null)
    try {
      const r = await consolePost(`/api/console/library/${encodeURIComponent(lesson.lesson_id)}/keywords/update`,
        { keywords: kw.map(k => ({ word: k.word, ipa: k.ipa, pl: k.pl, example: k.example })) })
      setDirtyKw(false)
      setMsg({ ok: true, text: `Keywords saved — deck PDF re-rendered${r.youglish_queued ? ` · ${r.youglish_queued} new keyword(s) queued for YouGlish` : ''}.` })
    } catch (e) {
      setMsg({ ok: false, text: String(e.message || e) })
    } finally { setBusy('') }
  }

  async function savePages() {
    setBusy('pg'); setMsg(null)
    try {
      await consolePost(`/api/console/library/${encodeURIComponent(lesson.lesson_id)}/pdf-reorder`, { order: pages })
      setDirtyPg(false)
      setMsg({ ok: true, text: 'PDF pages reordered.' })
      setPages(Array.from({ length: pages.length }, (_, i) => i + 1))
    } catch (e) {
      setMsg({ ok: false, text: String(e.message || e) })
    } finally { setBusy('') }
  }

  const movePage = (idx, dir) => {
    setPages(p => {
      const n = [...p]
      const j = idx + dir
      if (j < 0 || j >= n.length) return p
      ;[n[idx], n[j]] = [n[j], n[idx]]
      return n
    })
    setDirtyPg(true)
  }

  return (
    <div className="space-y-3 px-3 pb-3">
      {lesson.topic && (
        <p className="text-xs" style={{ color: 'var(--sa-text-muted)', lineHeight: 1.6 }}>
          {String(lesson.topic).slice(0, 280)}{String(lesson.topic).length > 280 ? '…' : ''}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="sa-btn sa-btn-ghost" style={{ padding: '0.35rem 0.8rem' }} onClick={previewPdf}>
          <span className="material-symbols-outlined" style={{ fontSize: 15 }}>{pdfBusy ? 'hourglass_top' : 'picture_as_pdf'}</span>
          Preview PDF
        </button>
        {lesson.video_url && (
          <a href={lesson.video_url} target="_blank" rel="noopener" className="sa-btn sa-btn-ghost"
            style={{ padding: '0.35rem 0.8rem', textDecoration: 'none' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 15 }}>smart_display</span>
            Lesson video
          </a>
        )}
      </div>

      {msg && (
        <p className="text-xs font-semibold" style={{ color: msg.ok ? 'var(--sa-good)' : 'var(--sa-bad)' }}>{msg.text}</p>
      )}

      {/* ── PDF page order ── */}
      <div>
        <p className="sa-stat-label mb-1.5">
          PDF pages {dirtyPg && <span style={{ color: 'var(--sa-warm-ink)' }}>· unsaved order</span>}
        </p>
        {pages === null ? <ConsoleLoading /> : (
          <div className="flex flex-wrap items-center gap-1.5">
            {pages.map((orig, idx) => (
              <span key={idx} className="sa-chip" style={{ gap: 2, paddingLeft: 4, paddingRight: 4,
                ...(orig !== idx + 1 ? { borderColor: 'var(--sa-warm-ink)', background: 'var(--sa-warm-soft)' } : null) }}>
                <button type="button" onClick={() => movePage(idx, -1)} disabled={idx === 0} style={pgBtn}>
                  <span className="material-symbols-outlined" style={{ fontSize: 13 }}>chevron_left</span>
                </button>
                <span className="font-mono text-xs font-bold" style={{ color: 'var(--sa-text)' }} title={`original page ${orig}`}>
                  {orig}
                </span>
                <button type="button" onClick={() => movePage(idx, 1)} disabled={idx === pages.length - 1} style={pgBtn}>
                  <span className="material-symbols-outlined" style={{ fontSize: 13 }}>chevron_right</span>
                </button>
              </span>
            ))}
            {dirtyPg && (
              <button type="button" className="sa-btn sa-btn-primary" style={{ padding: '0.3rem 0.8rem' }}
                disabled={busy === 'pg'} onClick={savePages}>
                {busy === 'pg' ? 'Saving…' : 'Save page order'}
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Keyword editor ── */}
      <div>
        <p className="sa-stat-label mb-1.5">
          Keywords {dirtyKw && <span style={{ color: 'var(--sa-warm-ink)' }}>· unsaved changes</span>}
        </p>
        {kw === null ? <ConsoleLoading /> : (
          <div className="space-y-1.5">
            {kw.map((k, i) => (
              <div key={i} className="grid gap-1.5" style={{ gridTemplateColumns: '1.1fr 1fr 1fr 1.6fr auto' }}>
                <input className="sa-input" style={pad} value={k.word} placeholder="word / phrase"
                  onChange={e => { setKw(rows => rows.map((r, j) => j === i ? { ...r, word: e.target.value } : r)); setDirtyKw(true) }} />
                <input className="sa-input" style={pad} value={k.ipa || ''} placeholder="IPA"
                  onChange={e => { setKw(rows => rows.map((r, j) => j === i ? { ...r, ipa: e.target.value } : r)); setDirtyKw(true) }} />
                <input className="sa-input" style={pad} value={k.pl || ''} placeholder="Polski"
                  onChange={e => { setKw(rows => rows.map((r, j) => j === i ? { ...r, pl: e.target.value } : r)); setDirtyKw(true) }} />
                <input className="sa-input" style={pad} value={k.example || ''} placeholder="Example sentence"
                  onChange={e => { setKw(rows => rows.map((r, j) => j === i ? { ...r, example: e.target.value } : r)); setDirtyKw(true) }} />
                <button type="button" className="sa-btn sa-btn-ghost" style={{ padding: '0.25rem 0.5rem' }}
                  onClick={() => { setKw(rows => rows.filter((_, j) => j !== i)); setDirtyKw(true) }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>delete</span>
                </button>
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="sa-btn sa-btn-ghost" style={{ padding: '0.3rem 0.8rem' }}
                onClick={() => { setKw(rows => [...rows, { word: '', ipa: '', pl: '', example: '' }]); setDirtyKw(true) }}>
                <span className="material-symbols-outlined" style={{ fontSize: 15 }}>add</span>
                Add keyword
              </button>
              {dirtyKw && (
                <button type="button" className="sa-btn sa-btn-primary" style={{ padding: '0.3rem 0.8rem' }}
                  disabled={busy === 'kw'} onClick={saveKeywords}>
                  <span className="material-symbols-outlined" style={{ fontSize: 15 }}>save</span>
                  {busy === 'kw' ? 'Re-rendering deck…' : 'Save keywords (re-renders PDF)'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const pad = { padding: '0.4rem 0.6rem', fontSize: '0.78rem' }
const pgBtn = { background: 'none', border: 'none', color: 'var(--sa-text-muted)', cursor: 'pointer', display: 'inline-flex', padding: 0 }
