// ConsoleSchoolStudents — School → Students.
//
// The management side of the roster: create a student, and wire them to the
// three things a student actually belongs to.
//
//   school   organizationId   moving a student re-scopes every org query about them
//   teacher  primaryTeacherId scheduling scopes availability per teacher, so a wrong
//                             id here is what made Aleksandra's calendar read stale
//                             slots on 2026-07-09 — it is not a cosmetic field
//   course   groupId          plus a groups:addGroupMember membership row
//
// groupId and the membership row are two different things: the field is the
// student's home course, the membership is what group screens read. Assigning a
// course here writes BOTH, because writing only one is the state that looks fine
// on this screen and wrong everywhere else.
//
// Academic → Roster stays the read-only browse view. This screen is the one that
// writes.

import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ConsoleEmpty, ConsoleErrorPanel, ConsoleSkeleton, LevelBadge } from './ConsoleStates.jsx'
import { Field } from './CommsShared.jsx'
function initialsOf(name) {
  return (name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

import { ConfirmWrite, useConvexList, useSchool } from './SchoolShared.jsx'
import {
  CEFR_LEVELS, STUDENT_TYPES, addStudentToCourse, archiveStudent, createStudent,
  assignCourseTrack, listCourseTracks, listCourses, listPackages, listStudents, listTeachers, slugify, updateStudent,
} from './schoolApi.js'

const BLANK = {
  name: '', email: '', phone: '', level: 'A1', targetLevel: '', type: 'individual',
  nativeLanguage: 'pl', primaryTeacherId: '', groupId: '', notes: '', slug: '',
}

export default function ConsoleSchoolStudents() {
  const { schoolId, school, schools, select } = useSchool()
  // No school picked = every school, read-only except where the row itself
  // names its school (edit selects that school first; move/archive carry the id).
  const allMode = !schoolId
  const schoolName = id => schools?.find(x => x._id === id)?.name || null
  const [activeOnly, setActiveOnly] = useState(true)
  const [q, setQ] = useState('')

  const students = useConvexList(() => listStudents(schoolId, activeOnly), [schoolId, activeOnly], true)
  const teachers = useConvexList(() => listTeachers(schoolId, false, true), [schoolId], !!schoolId)
  const courses = useConvexList(() => listCourses(schoolId), [schoolId], !!schoolId)
  const tracks = useConvexList(() => listCourseTracks(), [], true)
  const packages = useConvexList(() => listPackages(schoolId), [schoolId], !!schoolId)
  // A student who PAID for a Specialist pack may only be given a specialist
  // course: the dropdown narrows to SPEC-* tracks (and SPEC groups) for them.
  const specialistPack = s => (packages.rows || []).find(p => String(p.studentId) === String(s?._id)
    && p.status !== 'cancelled' && /^specialist/i.test(p.name || ''))
  const allowedTracks = s => (tracks.rows || []).filter(t => !specialistPack(s) || t.courseId.startsWith('SPEC-'))
  const allowedGroups = s => (courses.rows || []).filter(c => !specialistPack(s) || (c.courseId || '').startsWith('SPEC-'))
  const [rowBusy, setRowBusy] = useState(null)
  // Inline changes on a row save immediately; the server propagates (future
  // bookings, memberships, course plan) exactly as the drawer does.
  const setRowTeacher = async (s, v) => {
    setRowBusy(s._id); setNote(null)
    try { await updateStudent(s._id, { primaryTeacherId: v || null }); setNote({ ok: true, text: `${s.name}: teacher ${v ? 'set to ' + teacherName(v) : 'unassigned'}.` }); students.reload() }
    catch (e) { setNote({ ok: false, text: e.message }) } finally { setRowBusy(null) }
  }
  const setRowCourse = async (s, v) => {
    setRowBusy(s._id); setNote(null)
    try {
      if (isTrack(v)) { const r = await assignCourseTrack({ studentSlug: s.slug, courseId: v.slice(6) }); setNote({ ok: true, text: `${s.name}: course ${r?.group?.groupName || v.slice(6)} — ${r?.planned_slots ?? 0} lessons planned ahead.${r?.warning ? ' ' + r.warning : ''}` }) }
      else { await updateStudent(s._id, { groupId: v || null }); setNote({ ok: true, text: `${s.name}: course ${v ? 'set to ' + courseName(v) : 'cleared'}.` }) }
      students.reload()
    } catch (e) { setNote({ ok: false, text: e.message }) } finally { setRowBusy(null) }
  }

  const [draft, setDraft] = useState(null)
  const [pending, setPending] = useState(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState(null)

  const teacherName = id => teachers.rows?.find(t => t._id === id)?.name || null
  const courseName = id => courses.rows?.find(c => c._id === id)?.name || null
  // Dropdown value is either an existing group id or "track:<courseId>".
  const isTrack = v => typeof v === 'string' && v.startsWith('track:')
  const trackLabel = v => { const t = tracks.rows?.find(x => `track:${x.courseId}` === v); return t ? `${t.courseId} · ${t.level || '—'} · ${t.lessonCount} lessons` : v }

  const filtered = useMemo(() => {
    const rows = students.rows || []
    const needle = q.trim().toLowerCase()
    if (!needle) return rows
    return rows.filter(s => [s.name, s.email, s.slug, s.level]
      .some(v => String(v || '').toLowerCase().includes(needle)))
  }, [students.rows, q])

  const isEdit = !!draft?._id
  const slugValue = draft?.slug || slugify(draft?.name || '')
  const slugTaken = !isEdit && students.rows?.some(s => s.slug === slugValue)
  const canSave = draft?.name.trim() && slugValue && !slugTaken

  async function run() {
    setBusy(true)
    try {
      await pending.run()
      setNote({ ok: true, text: pending.done })
      setPending(null); setDraft(null)
      students.reload()
    } catch (e) {
      setNote({ ok: false, text: e.message }); setPending(null)
    } finally { setBusy(false) }
  }

  const askSave = () => setPending({
    title: isEdit ? 'Save student' : 'Add student',
    verb: isEdit ? 'Save changes' : 'Create student',
    rows: [
      { label: 'Name', value: draft.name },
      { label: 'Slug', value: slugValue },
      { label: 'Level', value: draft.level },
      { label: 'Type', value: draft.type },
      { label: 'Email', value: draft.email },
      { label: 'Teacher', value: teacherName(draft.primaryTeacherId) || 'none' },
      { label: 'Course', value: isTrack(draft.groupId) ? trackLabel(draft.groupId) : (courseName(draft.groupId) || 'none') },
    ],
    warning: draft.groupId
      ? 'The course is written both as the student’s groupId and as a group membership row, so the group screens and the student record agree.'
      : null,
    done: isEdit ? 'Student updated.' : `Student "${draft.name}" created.`,
    run: async () => {
      const fields = { ...draft, slug: slugValue, organizationId: schoolId }
      let studentId = draft._id
      if (isEdit) {
        await updateStudent(studentId, Object.assign(stripEmpty({
          name: fields.name, slug: fields.slug, level: fields.level, type: fields.type,
          email: fields.email, phone: fields.phone, notes: fields.notes,
          targetLevel: fields.targetLevel, nativeLanguage: fields.nativeLanguage,
          organizationId: fields.organizationId,
        }), {
          // Outside stripEmpty on purpose: "— unassigned —" / "— none —" must
          // reach the server as null so the teacher/course is actually cleared.
          primaryTeacherId: fields.primaryTeacherId || null,
          // A track goes through the console API below; a group id is written here.
          ...(isTrack(fields.groupId) ? {} : { groupId: fields.groupId || null }),
        }))
      } else {
        const created = await createStudent(fields)
        studentId = created?._id || created?.studentId || created
      }
      if (isTrack(fields.groupId) && studentId) {
        // Creates/links the personal course group and plans the untaught lessons.
        await assignCourseTrack({ studentSlug: fields.slug, courseId: fields.groupId.slice(6) })
      } else if (fields.groupId && studentId) {
        // Membership is a separate table; keep it in step with groupId.
        await addStudentToCourse({ groupId: fields.groupId, studentId }).catch(() => {})
      }
    },
  })

  const askArchive = s => setPending({
    title: 'Archive student', verb: 'Archive',
    rows: [{ label: 'Student', value: s.name }, { label: 'Email', value: s.email },
           { label: 'Level', value: s.level }],
    warning: 'Archiving hides the student from active lists. Their lessons, keywords and analyses are kept.',
    done: `${s.name} archived.`,
    run: () => archiveStudent(s._id),
  })

  const askMove = (s, organizationId) => setPending({
    title: 'Move student to another school', verb: 'Move student',
    rows: [{ label: 'Student', value: s.name },
           { label: 'From', value: schoolName(s.organizationId) || school?.name },
           { label: 'To', value: schools?.find(x => x._id === organizationId)?.name }],
    warning: 'Their teacher and course belong to the old school. Reassign both after moving, or this student will point at records the new school cannot see.',
    done: `${s.name} moved.`,
    run: () => updateStudent(s._id, { organizationId }),
  })

  return (
    <div className="sa-page">
      <div className="sa-page-header">
        <div>
          <h1 className="sa-page-title">Students</h1>
          <p className="sa-page-sub">
            {allMode
              ? <>Every student across <strong>all schools</strong>. Pick a school in the switcher to add one; editing a row switches to that student's school.</>
              : <>Students in <strong>{school?.name}</strong>. This is the screen that creates them and assigns their teacher and course.</>}
          </p>
        </div>
        <button type="button" className="sa-btn sa-btn-primary" disabled={allMode}
                title={allMode ? 'Pick a school first: a student is created inside one school' : undefined}
                onClick={() => { setNote(null); setDraft(BLANK) }}>
          <span className="material-symbols-outlined" aria-hidden="true">person_add</span>
          Add student
        </button>
      </div>

      {note && <p className={note.ok ? 'sa-note is-ok' : 'sa-note is-bad'} role="status">{note.text}</p>}

      <div className="sa-toolbar">
        <input className="sa-input" type="search" placeholder="Search name, email, slug…"
               value={q} onChange={e => setQ(e.target.value)} aria-label="Search students" />
        <label className="sa-checkbox">
          <input type="checkbox" checked={activeOnly} onChange={e => setActiveOnly(e.target.checked)} />
          Active only
        </label>
        <span className="sa-toolbar-spacer" />
        <span className="sa-muted">{students.rows ? `${filtered.length} of ${students.rows.length}` : ''}</span>
        <button type="button" className="sa-icon-btn" onClick={students.reload} aria-label="Reload">
          <span className="material-symbols-outlined" aria-hidden="true">refresh</span>
        </button>
      </div>

      {teachers.error && (
        <p className="sa-note is-bad">
          Teacher list unavailable ({teachers.error.message}) — the teacher dropdown will be empty.
        </p>
      )}

      {students.error ? <ConsoleErrorPanel error={students.error} onRetry={students.reload} />
        : students.rows === null ? <ConsoleSkeleton rows={6} label="Loading students…" />
          : !filtered.length ? (
            <ConsoleEmpty icon="groups" title={q ? 'No student matches that search' : allMode ? 'No students yet' : 'No students in this school yet'}
                          hint={q ? 'Clear the search to see everyone.' : 'Add one and assign their teacher and course.'} />
          ) : (
            <div className="sa3-list">
              {filtered.map(s => (
                <article className="sa3-row" key={s._id}>
                  <div className="sa3-avatar" aria-hidden="true">{initialsOf(s.name)}</div>
                  <div>
                    <h3 className="sa3-name">
                      <Link to={`/admin/superadmin/school/preview?student=${encodeURIComponent(s.slug)}`} style={{ color: 'inherit', textDecoration: 'none' }}>{s.name}</Link>
                    </h3>
                    <div className="sa3-sub">
                      {s.level ? <LevelBadge level={s.level} /> : <span className="sa-badge">no level yet</span>}
                      {s.email ? <code>{s.email}</code> : <span className="sa-muted">no email</span>}
                      {allMode && <span className="em-badge em-badge-area">{schoolName(s.organizationId) || 'no school'}</span>}
                    </div>
                  </div>
                  <div className="sa3-facts">
                    {allMode ? (
                      <>
                        <div><span>School </span><strong>{schoolName(s.organizationId) || 'none'}</strong></div>
                        <div><span>Status </span><strong>{s.status || 'active'}</strong></div>
                      </>
                    ) : (
                      <>
                        <label className="sa3-fact-select"><span>Teacher</span>
                          <select className="sa-select sa-select-sm" value={s.primaryTeacherId || ''} disabled={rowBusy === s._id}
                                  aria-label={`Teacher for ${s.name}`} onChange={e => setRowTeacher(s, e.target.value)}>
                            <option value="">— unassigned —</option>
                            {(teachers.rows || []).map(t => <option key={t._id} value={t._id}>{t.name}{t.organizationName && String(t.organizationId) !== String(schoolId) ? ` · ${t.organizationName}` : ''}</option>)}
                          </select>
                        </label>
                        <label className="sa3-fact-select"><span>Course</span>
                          <select className="sa-select sa-select-sm" value={s.groupId || ''} disabled={rowBusy === s._id}
                                  aria-label={`Course for ${s.name}`} onChange={e => setRowCourse(s, e.target.value)}
                                  title={specialistPack(s) ? `Paid ${specialistPack(s).name}: specialist tracks only` : undefined}>
                            <option value="">— none —</option>
                            {s.groupId && !(courses.rows || []).some(c => c._id === s.groupId) && <option value={s.groupId}>{courseName(s.groupId) || 'current course'}</option>}
                            <optgroup label={specialistPack(s) ? 'Specialist tracks (paid Specialist pack)' : 'Course library — assign a track'}>
                              {allowedTracks(s).map(t => <option key={t.courseId} value={`track:${t.courseId}`}>{t.courseId} · {t.level || '—'} · {t.lessonCount} lessons</option>)}
                            </optgroup>
                            <optgroup label="Existing course groups">
                              {allowedGroups(s).map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
                            </optgroup>
                          </select>
                        </label>
                      </>
                    )}
                  </div>
                  <div className="sa3-actions">
                    <Link className="sa-btn sa-btn-primary sa-btn-sm" to={s.status === 'active'
                      ? `/admin/student-view/${encodeURIComponent(s.slug)}/lessons`
                      : `/admin/superadmin/school/preview?student=${encodeURIComponent(s.slug)}`}>
                      <span className="material-symbols-outlined" aria-hidden="true">visibility</span>{s.status === 'active' ? 'Open student app' : 'View archive'}
                    </Link>
                    <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" onClick={() => { setNote(null); if (allMode && s.organizationId) select(s.organizationId); setDraft(toDraft(s)) }}>
                      <span className="material-symbols-outlined" aria-hidden="true">edit</span>Edit
                    </button>
                    <select className="sa-select" style={{ width: 'auto', minWidth: 150 }} value="" aria-label={`Move ${s.name} to another school`}
                            onChange={e => e.target.value && askMove(s, e.target.value)}>
                      <option value="">Move to school…</option>
                      {(schools || []).filter(x => x._id !== (schoolId || s.organizationId)).map(x => <option key={x._id} value={x._id}>{x.name}</option>)}
                    </select>
                    <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" onClick={() => askArchive(s)} title="Archive this student">
                      <span className="material-symbols-outlined" aria-hidden="true">archive</span>
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}

      {draft && (
        <div className="sa-drawer-host">
          <div className="sa-scrim" onClick={() => setDraft(null)} />
          <aside className="sa-drawer sa-drawer-wide" role="dialog" aria-modal="true"
                 aria-label={isEdit ? 'Edit student' : 'Add student'}>
            <header className="sa-drawer-header">
              <span>{isEdit ? `Edit ${draft.name}` : 'Add student'}</span>
              <button type="button" className="sa-icon-btn" onClick={() => setDraft(null)} aria-label="Close">
                <span className="material-symbols-outlined" aria-hidden="true">close</span>
              </button>
            </header>
            <div className="sa-drawer-body">
              <Field label="Full name" htmlFor="s-name">
                <input id="s-name" className="sa-input" value={draft.name} autoFocus
                       onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} />
              </Field>
              <Field label="Slug" htmlFor="s-slug" hint="Their dashboard lives at /app/<slug>/ — diacritics are stripped.">
                <input id="s-slug" className="sa-input" value={slugValue}
                       onChange={e => setDraft(d => ({ ...d, slug: slugify(e.target.value) }))} />
              </Field>
              {slugTaken && <p className="sa-note is-bad">That slug is already used in this school.</p>}

              <Field label="Level" htmlFor="s-level">
                <select id="s-level" className="sa-select" value={draft.level}
                        onChange={e => setDraft(d => ({ ...d, level: e.target.value }))}>
                  {CEFR_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </Field>
              <Field label="Target level" htmlFor="s-target">
                <select id="s-target" className="sa-select" value={draft.targetLevel}
                        onChange={e => setDraft(d => ({ ...d, targetLevel: e.target.value }))}>
                  <option value="">—</option>
                  {CEFR_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </Field>
              <Field label="Type" htmlFor="s-type">
                <select id="s-type" className="sa-select" value={draft.type}
                        onChange={e => setDraft(d => ({ ...d, type: e.target.value }))}>
                  {STUDENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </Field>

              <Field label="Primary teacher" htmlFor="s-teacher"
                     hint="Scheduling scopes open slots per teacher. Leaving this unset means their calendar has no teacher to draw availability from.">
                <select id="s-teacher" className="sa-select" value={draft.primaryTeacherId}
                        onChange={e => setDraft(d => ({ ...d, primaryTeacherId: e.target.value }))}>
                  <option value="">— unassigned —</option>
                  {(teachers.rows || []).map(t => <option key={t._id} value={t._id}>{t.name}{t.organizationName && String(t.organizationId) !== String(schoolId) ? ` · ${t.organizationName}` : ''}</option>)}
                </select>
              </Field>

              <Field label="Course" htmlFor="s-course"
                     hint="Pick a library track to give this student that course: their course group is created, and the untaught lessons are planned. Lessons already taught are never changed.">
                <select id="s-course" className="sa-select" value={draft.groupId}
                        onChange={e => setDraft(d => ({ ...d, groupId: e.target.value }))}>
                  <option value="">— none —</option>
                  <optgroup label={specialistPack(draft) ? 'Specialist tracks (paid Specialist pack)' : 'Course library — assign a track'}>
                    {allowedTracks(draft).map(t => <option key={t.courseId} value={`track:${t.courseId}`}>{t.courseId} · {t.level || '—'} · {t.lessonCount} lessons</option>)}
                  </optgroup>
                  <optgroup label="Existing course groups in this school">
                    {allowedGroups(draft).map(c => <option key={c._id} value={c._id}>{c.name}{c.courseId ? ` (${c.courseId})` : ''}</option>)}
                  </optgroup>
                </select>
              </Field>

              <Field label="Email" htmlFor="s-email">
                <input id="s-email" type="email" className="sa-input" value={draft.email}
                       onChange={e => setDraft(d => ({ ...d, email: e.target.value }))} />
              </Field>
              <Field label="Phone" htmlFor="s-phone">
                <input id="s-phone" className="sa-input" value={draft.phone}
                       onChange={e => setDraft(d => ({ ...d, phone: e.target.value }))} />
              </Field>

              <Field label="Notes" htmlFor="s-notes">
                <textarea id="s-notes" className="sa-textarea" rows={3} value={draft.notes}
                          onChange={e => setDraft(d => ({ ...d, notes: e.target.value }))} />
              </Field>
            </div>
            <footer className="sa-drawer-footer">
              <button type="button" className="sa-btn sa-btn-ghost" onClick={() => setDraft(null)}>Cancel</button>
              <button type="button" className="sa-btn sa-btn-primary" disabled={!canSave} onClick={askSave}>
                {isEdit ? 'Save changes' : 'Create student'}
              </button>
            </footer>
          </aside>
        </div>
      )}

      <ConfirmWrite
        open={!!pending}
        title={pending?.title || ''}
        verb={pending?.verb || 'Save'}
        school={school || { name: 'all schools' }}
        rows={pending?.rows}
        warning={pending?.warning}
        busy={busy}
        onConfirm={run}
        onClose={() => setPending(null)}
      />
    </div>
  )
}

function toDraft(s) {
  return {
    _id: s._id, name: s.name || '', email: s.email || '', phone: s.phone || '',
    level: s.level || 'A1', targetLevel: s.targetLevel || '', type: s.type || 'individual',
    nativeLanguage: s.nativeLanguage || 'pl', primaryTeacherId: s.primaryTeacherId || '',
    groupId: s.groupId || '', notes: s.notes || '', slug: s.slug || '',
  }
}

// Convex rejects a present-but-empty optional, so drop blanks entirely.
function stripEmpty(o) {
  const out = {}
  for (const [k, v] of Object.entries(o)) if (v !== '' && v != null) out[k] = v
  return out
}
