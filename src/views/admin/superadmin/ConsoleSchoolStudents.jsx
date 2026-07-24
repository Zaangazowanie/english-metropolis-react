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
import { ConfirmWrite, NeedSchool, useConvexList, useSchool } from './SchoolShared.jsx'
import {
  CEFR_LEVELS, STUDENT_TYPES, addStudentToCourse, archiveStudent, createStudent,
  listCourses, listStudents, listTeachers, slugify, updateStudent,
} from './schoolApi.js'

const BLANK = {
  name: '', email: '', phone: '', level: 'A1', targetLevel: '', type: 'individual',
  nativeLanguage: 'pl', primaryTeacherId: '', groupId: '', notes: '', slug: '',
}

export default function ConsoleSchoolStudents() {
  const { schoolId, school, schools } = useSchool()
  const [activeOnly, setActiveOnly] = useState(true)
  const [q, setQ] = useState('')

  const students = useConvexList(() => listStudents(schoolId, activeOnly), [schoolId, activeOnly], !!schoolId)
  const teachers = useConvexList(() => listTeachers(schoolId, false), [schoolId], !!schoolId)
  const courses = useConvexList(() => listCourses(schoolId), [schoolId], !!schoolId)

  const [draft, setDraft] = useState(null)
  const [pending, setPending] = useState(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState(null)

  const teacherName = id => teachers.rows?.find(t => t._id === id)?.name || null
  const courseName = id => courses.rows?.find(c => c._id === id)?.name || null

  const filtered = useMemo(() => {
    const rows = students.rows || []
    const needle = q.trim().toLowerCase()
    if (!needle) return rows
    return rows.filter(s => [s.name, s.email, s.slug, s.level]
      .some(v => String(v || '').toLowerCase().includes(needle)))
  }, [students.rows, q])

  if (!schoolId) {
    return (
      <div className="sa-page">
        <div className="sa-page-header"><h1 className="sa-page-title">Students</h1></div>
        <NeedSchool what="Students" />
      </div>
    )
  }

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
      { label: 'Course', value: courseName(draft.groupId) || 'none' },
    ],
    warning: draft.groupId
      ? 'The course is written both as the student’s groupId and as a group membership row, so the group screens and the student record agree.'
      : null,
    done: isEdit ? 'Student updated.' : `Student "${draft.name}" created.`,
    run: async () => {
      const fields = { ...draft, slug: slugValue, organizationId: schoolId }
      let studentId = draft._id
      if (isEdit) {
        await updateStudent(studentId, stripEmpty({
          name: fields.name, slug: fields.slug, level: fields.level, type: fields.type,
          email: fields.email, phone: fields.phone, notes: fields.notes,
          targetLevel: fields.targetLevel, nativeLanguage: fields.nativeLanguage,
          primaryTeacherId: fields.primaryTeacherId, groupId: fields.groupId,
          organizationId: fields.organizationId,
        }))
      } else {
        const created = await createStudent(fields)
        studentId = created?._id || created?.studentId || created
      }
      // Membership is a separate table; keep it in step with groupId.
      if (fields.groupId && studentId) {
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
           { label: 'From', value: school?.name },
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
            Students in <strong>{school?.name}</strong>. This is the screen that creates them and
            assigns their teacher and course.
          </p>
        </div>
        <button type="button" className="sa-btn sa-btn-primary"
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
            <ConsoleEmpty icon="groups" title={q ? 'No student matches that search' : 'No students in this school yet'}
                          hint={q ? 'Clear the search to see everyone.' : 'Add one and assign their teacher and course.'} />
          ) : (
            <table className="sa-table">
              <thead><tr>
                <th>Name</th><th>Level</th><th>Teacher</th><th>Course</th><th>Email</th><th aria-label="Actions" />
              </tr></thead>
              <tbody>
                {filtered.map(s => (
                  <tr key={s._id}>
                    <td>
                      <Link to={`/admin/superadmin/school/preview?student=${encodeURIComponent(s.slug)}`}>{s.name}</Link>
                      <div className="sa-cell-sub"><code>{s.slug}</code></div>
                    </td>
                    <td><LevelBadge level={s.level} /></td>
                    <td>{teacherName(s.primaryTeacherId) || <span className="sa-muted">unassigned</span>}</td>
                    <td>{courseName(s.groupId) || <span className="sa-muted">none</span>}</td>
                    <td>{s.email ? <code>{s.email}</code> : <span className="sa-muted">—</span>}</td>
                    <td className="sa-row-actions">
                      <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm"
                              onClick={() => { setNote(null); setDraft(toDraft(s)) }}>Edit</button>
                      <Link className="sa-btn sa-btn-ghost sa-btn-sm"
                            to={`/admin/superadmin/school/preview?student=${encodeURIComponent(s.slug)}`}>Preview</Link>
                      <select className="sa-select sa-select-sm" value="" aria-label={`Move ${s.name} to another school`}
                              onChange={e => e.target.value && askMove(s, e.target.value)}>
                        <option value="">Move to…</option>
                        {(schools || []).filter(x => x._id !== schoolId)
                          .map(x => <option key={x._id} value={x._id}>{x.name}</option>)}
                      </select>
                      <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm"
                              onClick={() => askArchive(s)}>Archive</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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

              <div className="sa-field-row">
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
              </div>

              <Field label="Primary teacher" htmlFor="s-teacher"
                     hint="Scheduling scopes open slots per teacher. Leaving this unset means their calendar has no teacher to draw availability from.">
                <select id="s-teacher" className="sa-select" value={draft.primaryTeacherId}
                        onChange={e => setDraft(d => ({ ...d, primaryTeacherId: e.target.value }))}>
                  <option value="">— unassigned —</option>
                  {(teachers.rows || []).map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
                </select>
              </Field>

              <Field label="Course" htmlFor="s-course"
                     hint="Writes the student's groupId and a group membership row together.">
                <select id="s-course" className="sa-select" value={draft.groupId}
                        onChange={e => setDraft(d => ({ ...d, groupId: e.target.value }))}>
                  <option value="">— none —</option>
                  {(courses.rows || []).map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
                </select>
              </Field>

              <div className="sa-field-row">
                <Field label="Email" htmlFor="s-email">
                  <input id="s-email" type="email" className="sa-input" value={draft.email}
                         onChange={e => setDraft(d => ({ ...d, email: e.target.value }))} />
                </Field>
                <Field label="Phone" htmlFor="s-phone">
                  <input id="s-phone" className="sa-input" value={draft.phone}
                         onChange={e => setDraft(d => ({ ...d, phone: e.target.value }))} />
                </Field>
              </div>

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
