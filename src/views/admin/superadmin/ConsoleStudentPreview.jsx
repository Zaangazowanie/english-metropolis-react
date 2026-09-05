// ConsoleStudentPreview — School → Student preview.
//
// Left: what the student actually sees, rendered from the SAME payload their
// dashboard reads (students:getStudentDashboard). Right: two tabs of controls.
//
//   This student   → students:updateStudent. Affects ONE student.
//   Shared design  → /api/console/biz/config. Affects EVERY student.
//
// The two are deliberately separated and labelled, because "change the greeting"
// means very different things depending on which panel you are in, and an admin
// who confuses them changes 150 dashboards by accident.
//
// This is a PREVIEW, not an impersonation: it never mints a student session. It
// renders the admin-readable dashboard payload through the shared design so you
// can see the effect of a design change before publishing it. Anything that
// depends on a student's own login (their password, their private settings) is
// not shown, and the panel says so rather than faking it.

import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ConsoleEmpty, ConsoleErrorPanel, ConsoleSkeleton, LevelBadge } from './ConsoleStates.jsx'
import { Field } from './CommsShared.jsx'
import { consoleGet, consolePost } from './consoleApi.js'
import ConsoleLessonNotes from './ConsoleLessonNotes.jsx'
import { ConfirmWrite, NeedSchool, useConvexList, useSchool } from './SchoolShared.jsx'
import {
  CEFR_LEVELS, getStudentDashboard, listCourses, listStudents, listTeachers, updateStudent,
} from './schoolApi.js'
import { DEFAULT_STUDENT_DESIGN, STUDENT_CARDS } from '../../../design/v3/studentDesign.js'
import { queryAdminConvex } from '../../../contexts/AdminAuthContext.jsx'

/* ── shared design ───────────────────────────────────────────────────────── */
// The card ids and defaults come from design/v3/studentDesign.js, which is what
// the STUDENT DASHBOARD itself reads. One definition, imported by both, so the
// console cannot offer a toggle the dashboard does not honour — the first cut of
// this screen invented five card names that matched nothing on the real page.

const DESIGN_KEYS = {
  accent: 'student_dashboard.accent',
  greeting: 'student_dashboard.greeting',
  cards: 'student_dashboard.cards',
}

export default function ConsoleStudentPreview() {
  const { schoolId, school, select: selectSchool } = useSchool()
  const [params, setParams] = useSearchParams()
  const slug = params.get('student') || ''
  const [tab, setTab] = useState('student')
  const [previewTab, setPreviewTab] = useState('home')

  const students = useConvexList(() => listStudents(schoolId, true), [schoolId], !!schoolId)
  const teachers = useConvexList(() => listTeachers(schoolId, false), [schoolId], !!schoolId)
  const courses = useConvexList(() => listCourses(schoolId), [schoolId], !!schoolId)

  const [dash, setDash] = useState({ data: null, error: null, loading: false })
  const [design, setDesign] = useState(DEFAULT_STUDENT_DESIGN)
  const [savedDesign, setSavedDesign] = useState(DEFAULT_STUDENT_DESIGN)
  const [draft, setDraft] = useState(null)
  const [pending, setPending] = useState(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState(null)

  // Shared design lives in the business config store, not Convex — there is no
  // deployed mutation for dashboard theming, so the console owns it.
  useEffect(() => {
    let alive = true
    consoleGet('/api/console/biz/config')
      .then(res => {
        if (!alive) return
        const cfg = res?.config || {}
        const loaded = {
          accent: cfg[DESIGN_KEYS.accent] ?? DEFAULT_STUDENT_DESIGN.accent,
          greeting: cfg[DESIGN_KEYS.greeting] ?? DEFAULT_STUDENT_DESIGN.greeting,
          cards: asArray(cfg[DESIGN_KEYS.cards]) ?? DEFAULT_STUDENT_DESIGN.cards,
        }
        setDesign(loaded); setSavedDesign(loaded)
      })
      .catch(() => { /* defaults stand; the panel shows the unsaved marker */ })
    return () => { alive = false }
  }, [])

  const loadDash = useCallback(() => {
    if (!slug) { setDash({ data: null, error: null, loading: false }); return }
    setDash({ data: null, error: null, loading: true })
    getStudentDashboard(slug)
      .then(data => setDash({ data, error: null, loading: false }))
      .catch(error => setDash({ data: null, error, loading: false }))
  }, [slug])
  useEffect(loadDash, [loadDash])

  const student = dash.data?.student || null
  // Links from the action queue carry only a student slug. Resolve the school
  // from that student's live record so preview works in one click even when the
  // operator was previously looking at "All schools".
  useEffect(() => {
    if (student?.organizationId && student.organizationId !== schoolId) {
      selectSchool(student.organizationId)
    }
  }, [student?.organizationId, schoolId, selectSchool])
  useEffect(() => { setDraft(student ? toDraft(student) : null) }, [student?._id]) // eslint-disable-line
  const [opsPreview, setOpsPreview] = useState(null)
  useEffect(() => {
    let alive = true
    if (!student?._id) { setOpsPreview(null); return undefined }
    queryAdminConvex('operations:getStudentPreview', { studentId: student._id })
      .then(data => { if (alive) setOpsPreview(data) })
      .catch(() => { if (alive) setOpsPreview(null) })
    return () => { alive = false }
  }, [student?._id])

  const teacherName = id => teachers.rows?.find(t => t._id === id)?.name || null
  const designDirty = JSON.stringify(design) !== JSON.stringify(savedDesign)

  if (!schoolId && !slug) {
    return (
      <div className="sa-page">
        <div className="sa-page-header"><h1 className="sa-page-title">Student preview</h1></div>
        <NeedSchool what="Students" />
      </div>
    )
  }

  async function run() {
    setBusy(true)
    try {
      await pending.run()
      setNote({ ok: true, text: pending.done })
      setPending(null)
      pending.after?.()
    } catch (e) {
      setNote({ ok: false, text: e.message }); setPending(null)
    } finally { setBusy(false) }
  }

  const askSaveStudent = () => setPending({
    title: 'Save this student', verb: 'Save changes',
    rows: [
      { label: 'Student', value: draft.name },
      { label: 'Level', value: draft.level },
      { label: 'Target level', value: draft.targetLevel || '—' },
      { label: 'Teacher', value: teacherName(draft.primaryTeacherId) || 'unassigned' },
      { label: 'Email', value: draft.email || '—' },
    ],
    warning: 'Affects this student only.',
    done: 'Student updated.',
    run: () => updateStudent(student._id, stripEmpty({
      name: draft.name, level: draft.level, targetLevel: draft.targetLevel,
      email: draft.email, phone: draft.phone, notes: draft.notes,
      primaryTeacherId: draft.primaryTeacherId, groupId: draft.groupId,
    })),
    after: loadDash,
  })

  const askPublishDesign = () => setPending({
    title: 'Publish shared design', verb: 'Publish to all students',
    rows: [
      { label: 'Accent', value: design.accent },
      { label: 'Greeting', value: design.greeting },
      { label: 'Cards', value: design.cards.join(', ') || 'none' },
    ],
    warning: `This is the shared dashboard design. It applies to EVERY student, not just ${student?.name || 'this one'}.`,
    done: 'Shared design published.',
    run: async () => {
      await consolePost('/api/console/biz/config', {
        values: {
          [DESIGN_KEYS.accent]: design.accent,
          [DESIGN_KEYS.greeting]: design.greeting,
          [DESIGN_KEYS.cards]: design.cards,
        },
      })
      setSavedDesign(design)
    },
  })

  return (
    <div className="sa-page sa-preview-page">
      <div className="sa-page-header">
        <div>
          <h1 className="sa-page-title">Student preview</h1>
          <p className="sa-page-sub">
            What a student sees in <strong>{school?.name || 'their school'}</strong>, and the two places you can change it.
          </p>
        </div>
        <label className="sa-inline-field">
          <span className="sa-sr-only">Preview as student</span>
          <select className="sa-select" value={slug}
                  onChange={e => setParams(e.target.value ? { student: e.target.value } : {})}>
            <option value="">Choose a student…</option>
            {student && !(students.rows || []).some(s => s.slug === student.slug) && (
              <option value={student.slug}>{student.name}</option>
            )}
            {(students.rows || []).map(s => <option key={s._id} value={s.slug}>{s.name}</option>)}
          </select>
        </label>
      </div>

      {note && <p className={note.ok ? 'sa-note is-ok' : 'sa-note is-bad'} role="status">{note.text}</p>}

      {student?.status === 'active' && (
        <p><Link className="sa-btn sa-btn-primary" to={`/admin/student-view/${encodeURIComponent(student.slug)}/lessons`}>
          Open student app
        </Link></p>
      )}

      {!slug ? (
        <ConsoleEmpty icon="visibility" title="Pick a student to preview"
                      hint="You will see their real dashboard data rendered through the shared design, plus the controls to change either." />
      ) : (
        <div className="sa-preview-split">
          {/* ───────────── left: the student's view ───────────── */}
          <section className="sa-preview-stage" aria-label="Student dashboard preview">
            <div className="sa-preview-chrome">
              <span className="material-symbols-outlined" aria-hidden="true">smartphone</span>
              englishmetro.com/app/{slug}
              <span className="sa-badge">preview</span>
            </div>
            {dash.loading ? <ConsoleSkeleton rows={5} label="Loading dashboard…" />
              : dash.error ? <ConsoleErrorPanel error={dash.error} onRetry={loadDash} />
                : dash.data ? <DashboardPreview data={dash.data} design={design} ops={opsPreview}
                    tab={previewTab} onTab={setPreviewTab} />
                  : null}
          </section>

          {/* ───────────── right: the two edit surfaces ───────────── */}
          <aside className="sa-preview-panel">
            <div className="sa-tabs" role="tablist">
              <button type="button" role="tab" aria-selected={tab === 'student'}
                      className={tab === 'student' ? 'sa-tab is-active' : 'sa-tab'}
                      onClick={() => setTab('student')}>
                <span className="material-symbols-outlined" aria-hidden="true">person</span>
                This student
              </button>
              <button type="button" role="tab" aria-selected={tab === 'design'}
                      className={tab === 'design' ? 'sa-tab is-active' : 'sa-tab'}
                      onClick={() => setTab('design')}>
                <span className="material-symbols-outlined" aria-hidden="true">palette</span>
                Shared design
                {designDirty && <span className="sa-badge sa-badge-queued">unsaved</span>}
              </button>
            </div>

            {tab === 'student' ? (
              !draft ? <ConsoleSkeleton rows={4} label="Loading student…" /> : (
                <div className="sa-panel-body">
                  <p className="sa-scope-note is-single">
                    Changes here affect <strong>{draft.name}</strong> only.
                  </p>
                  <Field label="Name" htmlFor="p-name">
                    <input id="p-name" className="sa-input" value={draft.name}
                           onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} />
                  </Field>
                  <div className="sa-field-row">
                    <Field label="Level" htmlFor="p-level">
                      <select id="p-level" className="sa-select" value={draft.level}
                              onChange={e => setDraft(d => ({ ...d, level: e.target.value }))}>
                        {CEFR_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                      </select>
                    </Field>
                    <Field label="Target" htmlFor="p-target">
                      <select id="p-target" className="sa-select" value={draft.targetLevel}
                              onChange={e => setDraft(d => ({ ...d, targetLevel: e.target.value }))}>
                        <option value="">—</option>
                        {CEFR_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                      </select>
                    </Field>
                  </div>
                  <Field label="Primary teacher" htmlFor="p-teacher">
                    <select id="p-teacher" className="sa-select" value={draft.primaryTeacherId}
                            onChange={e => setDraft(d => ({ ...d, primaryTeacherId: e.target.value }))}>
                      <option value="">— unassigned —</option>
                      {(teachers.rows || []).map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
                    </select>
                  </Field>
                  <Field label="Course" htmlFor="p-course">
                    <select id="p-course" className="sa-select" value={draft.groupId}
                            onChange={e => setDraft(d => ({ ...d, groupId: e.target.value }))}>
                      <option value="">— none —</option>
                      {(courses.rows || []).map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
                    </select>
                  </Field>
                  <Field label="Email" htmlFor="p-email">
                    <input id="p-email" type="email" className="sa-input" value={draft.email}
                           onChange={e => setDraft(d => ({ ...d, email: e.target.value }))} />
                  </Field>
                  <Field label="Notes" htmlFor="p-notes">
                    <textarea id="p-notes" className="sa-textarea" rows={3} value={draft.notes}
                              onChange={e => setDraft(d => ({ ...d, notes: e.target.value }))} />
                  </Field>
                  <p className="sa-muted">
                    Their password and private account settings are not shown here — this is a
                    preview, not a sign-in as the student.
                  </p>
                  <button type="button" className="sa-btn sa-btn-primary" onClick={askSaveStudent}>
                    Save this student
                  </button>
                </div>
              )
            ) : (
              <div className="sa-panel-body">
                <p className="sa-scope-note is-shared">
                  Changes here affect <strong>every student</strong> in every school. The preview on
                  the left updates as you type; nothing is live until you publish.
                </p>
                <Field label="Accent colour" htmlFor="d-accent">
                  <span className="sa-color-field">
                    <input id="d-accent" type="color" value={design.accent}
                           onChange={e => setDesign(d => ({ ...d, accent: e.target.value }))} />
                    <input className="sa-input" value={design.accent} aria-label="Accent hex"
                           onChange={e => setDesign(d => ({ ...d, accent: e.target.value }))} />
                  </span>
                </Field>
                <Field label="Greeting" htmlFor="d-greeting" hint="{name} is replaced with the student's first name.">
                  <input id="d-greeting" className="sa-input" value={design.greeting}
                         onChange={e => setDesign(d => ({ ...d, greeting: e.target.value }))} />
                </Field>
                <fieldset className="sa-fieldset">
                  <legend>Cards shown</legend>
                  {STUDENT_CARDS.map(c => (
                    <label key={c.id} className="sa-checkbox">
                      <input type="checkbox" checked={design.cards.includes(c.id)}
                             onChange={e => setDesign(d => ({
                               ...d,
                               cards: e.target.checked
                                 ? [...d.cards, c.id]
                                 : d.cards.filter(x => x !== c.id),
                             }))} />
                      {c.label}
                    </label>
                  ))}
                </fieldset>
                <div className="sa-panel-actions">
                  <button type="button" className="sa-btn sa-btn-ghost" disabled={!designDirty}
                          onClick={() => setDesign(savedDesign)}>Discard</button>
                  <button type="button" className="sa-btn sa-btn-primary" disabled={!designDirty}
                          onClick={askPublishDesign}>Publish to all students</button>
                </div>
                <p className="sa-muted">
                  Published settings are stored in the console and read by the student app. Cards the
                  student has no data for stay hidden regardless of this setting.
                </p>
              </div>
            )}
          </aside>
        </div>
      )}

      <ConfirmWrite
        open={!!pending}
        title={pending?.title || ''}
        verb={pending?.verb || 'Save'}
        school={school}
        rows={pending?.rows}
        warning={pending?.warning}
        busy={busy}
        onConfirm={run}
        onClose={() => setPending(null)}
      />
    </div>
  )
}

/* ──────────────────────────────────────────── the preview itself ───────── */

function DashboardPreview({ data, design, ops, tab, onTab }) {
  const s = data.student || {}
  const first = String(s.name || '').trim().split(/\s+/)[0] || ''
  const custom = design.greeting ? design.greeting.replace(/\{name\}/g, first) : null
  const lessons = [...(data.lessons || [])].sort((a, b) => (b.order || 0) - (a.order || 0))
  const last = lessons[0]
  const show = id => design.cards.includes(id)
  const accent = design.accent || 'var(--sa-violet-600)'
  const now = ops?.generatedAt || 0
  const nextBooking = (ops?.bookings || [])
    .filter(booking => booking.status === 'scheduled' && booking.startUtc > now)
    .sort((a, b) => a.startUtc - b.startUtc)[0]
  const recentOpsLessons = ops?.lessons || lessons

  return (
    <div className="sa-preview-app" style={{ '--preview-accent': accent }}>
      <nav className="student-preview-nav" aria-label="Student panel pages">
        {[['home', 'Home', 'home'], ['lessons', 'Lessons', 'menu_book'], ['vocabulary', 'Vocabulary', 'spellcheck'], ['calendar', 'Calendar', 'calendar_month'], ['notes', 'Notes', 'picture_as_pdf']].map(([key, label, icon]) => (
          <button key={key} type="button" className={tab === key ? 'is-active' : ''} onClick={() => onTab(key)}>
            <span className="material-symbols-outlined" aria-hidden="true">{icon}</span>{label}
          </button>
        ))}
        <span className="student-preview-readonly">
          {tab === 'notes' ? 'Live check · can replace notes' : 'Read only'}
        </span>
      </nav>

      <header className="sa-preview-hero">
        {/* Matches the real dashboard: a published greeting replaces the whole
            translated welcome line, otherwise the translated one stands. */}
        <h2>{custom || `Welcome back, ${first}.`}</h2>
        <p>
          <LevelBadge level={s.level} />
          {s.targetLevel && <span className="sa-muted"> → {s.targetLevel}</span>}
          <span className="sa-muted"> · {lessons.length} lessons</span>
        </p>
      </header>

      {tab === 'home' && <>
      <div className="sa-preview-cards">
        {show('upcoming') && (
          <article className="sa-preview-card">
            <h3>Next lesson</h3>
            <p className="sa-preview-big">{nextBooking ? `${nextBooking.dateWarsaw} ${nextBooking.timeWarsaw}` : 'None booked'}</p>
            <p className="sa-muted">{nextBooking?.meetLink ? 'Video link ready' : nextBooking ? 'Video link pending' : 'Choose a time in Calendar'}</p>
          </article>
        )}
        {show('revise') && (
          <article className="sa-preview-card">
            <h3>Revise last lesson</h3>
            <p className="sa-preview-big">{last?.keywordCount ?? 0}</p>
            <p className="sa-muted">keywords to revise</p>
          </article>
        )}
        {show('latest') && (
          <article className="sa-preview-card">
            <h3>Latest lesson</h3>
            <p className="sa-preview-big">{last?.date || 'No lesson yet'}</p>
            {typeof data.latestAnalysis?.overallScore === 'number' && (
              <p className="sa-muted">analysis score {Math.round(data.latestAnalysis.overallScore)}</p>
            )}
          </article>
        )}
      </div>

      {show('analytics') && (
        <section className="sa-preview-list">
          <h3>Progress breakdown</h3>
          {/* avgAccuracy is quiz-derived: 0.0 with no quizzes means "not
              measured", not "scored zero". Show the CEFR analysis instead. */}
          <ul>
            {ANALYSIS_AXES.map(([key, label]) => {
              const v = data.latestAnalysis?.[key]
              return (
                <li key={key}>
                  <span>{label}</span>
                  <span className="sa-muted">{typeof v === 'number' ? Math.round(v) : 'Not measured'}</span>
                </li>
              )
            })}
            <li>
              <span>Keywords learned</span>
              <span className="sa-muted">{ops?.keywordCount ?? data.totalKeywords ?? 0}</span>
            </li>
          </ul>
        </section>
      )}
      </>}

      {tab === 'lessons' && (
        <section className="student-preview-page">
          <div className="student-preview-page-head"><h3>My lessons</h3><span>{recentOpsLessons.length} total</span></div>
          <div className="student-preview-lesson-list">
            {recentOpsLessons.slice(0, 8).map(lesson => (
              <article key={lesson._id || lesson.id}>
                <span>{lesson.date}</span><strong>{lesson.title}</strong>
                <small>{(lesson.topics || []).slice(0, 3).join(' · ') || 'Lesson notes'}</small>
              </article>
            ))}
            {!recentOpsLessons.length && <p className="sa-muted">No published lessons yet.</p>}
          </div>
        </section>
      )}

      {tab === 'vocabulary' && (
        <section className="student-preview-page">
          <div className="student-preview-page-head"><h3>Vocabulary</h3><span>Live learner bank</span></div>
          <div className="student-preview-vocab-stats">
            <article><strong>{ops?.keywordCount ?? data.totalKeywords ?? 0}</strong><span>keywords</span></article>
            <article><strong>{ops?.youglishCount ?? 0}</strong><span>YouTube examples</span></article>
            <article><strong>{ops?.allocation?.remaining ?? 0}</strong><span>lessons remaining</span></article>
          </div>
          <p className="sa-muted">The full student panel shows searchable keyword cards with definitions, examples and pronunciation links.</p>
        </section>
      )}

      {tab === 'calendar' && (
        <section className="student-preview-page">
          <div className="student-preview-page-head"><h3>Calendar</h3><span>{ops?.allocation?.remaining ?? 0} lessons remaining</span></div>
          <div className="student-preview-lesson-list">
            {(ops?.bookings || []).filter(booking => booking.startUtc > now && booking.status === 'scheduled').slice(0, 8).map(booking => (
              <article key={booking._id}>
                <span>{booking.dateWarsaw} · {booking.timeWarsaw}</span><strong>English lesson</strong>
                <small>{booking.meetLink ? 'Video link ready' : 'Video link pending'}</small>
              </article>
            ))}
            {!(ops?.bookings || []).some(booking => booking.startUtc > now && booking.status === 'scheduled') && (
              <p className="sa-muted">No upcoming lesson is booked.</p>
            )}
          </div>
        </section>
      )}

      {/* Not a rendering of her page — a live report on what the public
          internet returns for her notes, plus the replace control. */}
      {tab === 'notes' && (
        <section className="student-preview-page">
          <ConsoleLessonNotes slug={s.slug} />
        </section>
      )}
    </div>
  )
}

const ANALYSIS_AXES = [
  ['overallScore', 'Overall'],
  ['grammaticalAccuracy', 'Grammar'],
  ['fluencyAndCoherence', 'Fluency'],
  ['vocabularyRange', 'Vocabulary'],
  ['pronunciation', 'Pronunciation'],
]

/* ───────────────────────────────────────────────────────────── util ────── */

function toDraft(s) {
  return {
    name: s.name || '', level: s.level || 'A1', targetLevel: s.targetLevel || '',
    email: s.email || '', phone: s.phone || '', notes: s.notes || '',
    primaryTeacherId: s.primaryTeacherId || '', groupId: s.groupId || '',
  }
}

function stripEmpty(o) {
  const out = {}
  for (const [k, v] of Object.entries(o)) if (v !== '' && v != null) out[k] = v
  return out
}

// app_config stores JSON, but a hand-edited value could arrive as a string.
function asArray(v) {
  if (Array.isArray(v)) return v
  if (typeof v === 'string') { try { const p = JSON.parse(v); return Array.isArray(p) ? p : null } catch { return null } }
  return null
}
