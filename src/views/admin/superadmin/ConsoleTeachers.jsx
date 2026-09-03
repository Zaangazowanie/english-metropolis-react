// ConsoleTeachers — School → Teachers.
//
// teachers:listTeachers is org-scoped through resolveOrg(), which THROWS for a
// super_admin because their organizationId is null. That is why the People →
// Team screen reported "teachers:listTeachers failed": it called the query with
// no org. Every call here passes the selected school explicitly.
//
// A teacher is a users row with role "teacher", so "remove" is a soft delete
// (deletedAt) and restore exists. Neither destroys the teacher's students.

import { useState } from 'react'
import { ConsoleEmpty, ConsoleErrorPanel, ConsoleSkeleton } from './ConsoleStates.jsx'
import { Field } from './CommsShared.jsx'
import { ConfirmWrite, useConvexList, useSchool } from './SchoolShared.jsx'
import { createTeacher, listTeachers, removeTeacher, restoreTeacher, updateTeacher } from './schoolApi.js'

const BLANK = { name: '', email: '' }

export default function ConsoleTeachers() {
  const { schoolId, school, schools, select } = useSchool()
  const [showRemoved, setShowRemoved] = useState(false)
  // No school picked = every school: one read per school, each row tagged with
  // its school so the list can say where a teacher belongs. Writes still need a
  // school (the API requires an organisation), so Edit/Remove select it first.
  const allMode = !schoolId
  const { rows, error, reload } = useConvexList(
    () => allMode
      ? Promise.all((schools || []).map(sc => listTeachers(sc._id, showRemoved)
          .then(list => (list || []).map(t => ({ ...t, _schoolId: sc._id, _school: sc.name })))))
          .then(lists => lists.flat())
      : listTeachers(schoolId, showRemoved),
    [schoolId, showRemoved, allMode ? (schools || []).length : 0], allMode ? !!schools : true)

  const [draft, setDraft] = useState(null)      // {name,email} = create, {…,_id} = edit
  const [pending, setPending] = useState(null)  // {kind, payload, rows, title, verb, warning}
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState(null)

  const isEdit = !!draft?._id
  const emailTaken = !isEdit && rows?.some(
    t => (t.email || '').toLowerCase() === draft?.email.trim().toLowerCase())
  const canSave = draft?.name.trim() && /\S+@\S+\.\S+/.test(draft?.email || '') && !emailTaken

  async function run() {
    setBusy(true)
    try {
      await pending.run()
      setNote({ ok: true, text: pending.done })
      setPending(null); setDraft(null); reload()
    } catch (e) {
      setNote({ ok: false, text: e.message }); setPending(null)
    } finally { setBusy(false) }
  }

  const askSave = () => setPending({
    title: isEdit ? 'Save teacher' : 'Add teacher',
    verb: isEdit ? 'Save changes' : 'Create teacher',
    rows: [{ label: 'Name', value: draft.name }, { label: 'Email', value: draft.email }],
    warning: isEdit ? null
      : 'Creates a users row with role "teacher" in this school. The account has no password yet — set one from the student/teacher auth flow.',
    done: isEdit ? 'Teacher updated.' : `Teacher "${draft.name}" created.`,
    run: () => (isEdit
      ? updateTeacher(draft._id, { name: draft.name.trim(), email: draft.email.trim().toLowerCase() })
      : createTeacher({ ...draft, organizationId: schoolId })),
  })

  const askRemove = t => setPending({
    title: 'Remove teacher',
    verb: 'Remove teacher',
    rows: [{ label: 'Teacher', value: t.name }, { label: 'Email', value: t.email },
           { label: 'Assigned students', value: t.studentCount }],
    warning: t.studentCount
      ? `${t.studentCount} student(s) still list this teacher as their primary teacher. Removing does not reassign them — do that on the Students screen first, or their calendars will scope to a removed teacher.`
      : 'Soft delete. The teacher can be restored from this screen.',
    done: `${t.name} removed.`,
    run: () => removeTeacher(t._id),
  })

  const askRestore = t => setPending({
    title: 'Restore teacher', verb: 'Restore',
    rows: [{ label: 'Teacher', value: t.name }],
    done: `${t.name} restored.`,
    run: () => restoreTeacher(t._id),
  })

  return (
    <div className="sa-page">
      <div className="sa-page-header">
        <div>
          <h1 className="sa-page-title">Teachers</h1>
          <p className="sa-page-sub">
            {allMode
              ? <>Teaching staff across <strong>all schools</strong>, with how many students name each of them as primary teacher. Pick a school in the switcher to add one.</>
              : <>Teaching staff in <strong>{school?.name}</strong>, with how many students name each of them as primary teacher.</>}
          </p>
        </div>
        <button type="button" className="sa-btn sa-btn-primary" disabled={allMode}
                title={allMode ? 'Pick a school first: a teacher is created inside one school' : undefined}
                onClick={() => { setNote(null); setDraft(BLANK) }}>
          <span className="material-symbols-outlined" aria-hidden="true">person_add</span>
          Add teacher
        </button>
      </div>

      {note && <p className={note.ok ? 'sa-note is-ok' : 'sa-note is-bad'} role="status">{note.text}</p>}

      <div className="sa-toolbar">
        <label className="sa-checkbox">
          <input type="checkbox" checked={showRemoved} onChange={e => setShowRemoved(e.target.checked)} />
          Show removed
        </label>
        <span className="sa-toolbar-spacer" />
        <span className="sa-muted">{rows ? `${rows.length} shown` : ''}</span>
        <button type="button" className="sa-icon-btn" onClick={reload} aria-label="Reload">
          <span className="material-symbols-outlined" aria-hidden="true">refresh</span>
        </button>
      </div>

      {error ? <ConsoleErrorPanel error={error} onRetry={reload} />
        : rows === null ? <ConsoleSkeleton rows={4} label="Loading teachers…" />
          : !rows.length ? (
            <ConsoleEmpty icon="school" title={allMode ? 'No teachers yet' : 'No teachers in this school yet'}
                          hint="Add the people who actually teach here. Students can then name one as their primary teacher." />
          ) : (
            <table className="sa-table">
              <thead><tr>
                <th>Name</th>{allMode && <th>School</th>}<th>Email</th><th>Status</th>
                <th className="sa-num-col">Students</th><th aria-label="Actions" />
              </tr></thead>
              <tbody>
                {rows.map(t => (
                  <tr key={t._id} className={t.removed ? 'is-muted' : undefined}>
                    <td>{t.name}</td>
                    {allMode && <td><span className="em-badge em-badge-area">{t._school}</span></td>}
                    <td><code>{t.email}</code></td>
                    <td>
                      {t.removed
                        ? <span className="sa-badge">Removed</span>
                        : <span className="sa-badge sa-badge-ok">{t.status || 'active'}</span>}
                      {t.availabilityHandedOff && <span className="sa-badge">Availability handed off</span>}
                    </td>
                    <td className="sa-num">{t.studentCount ?? '—'}</td>
                    <td className="sa-row-actions">
                      {t.removed ? (
                        <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm"
                                onClick={() => { if (allMode) select(t._schoolId); askRestore(t) }}>Restore</button>
                      ) : (
                        <>
                          <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm"
                                  onClick={() => { setNote(null); if (allMode) select(t._schoolId); setDraft({ _id: t._id, name: t.name, email: t.email }) }}>
                            Edit
                          </button>
                          <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm"
                                  onClick={() => { if (allMode) select(t._schoolId); askRemove(t) }}>Remove</button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

      {draft && (
        <div className="sa-drawer-host">
          <div className="sa-scrim" onClick={() => setDraft(null)} />
          <aside className="sa-drawer" role="dialog" aria-modal="true"
                 aria-label={isEdit ? 'Edit teacher' : 'Add teacher'}>
            <header className="sa-drawer-header">
              <span>{isEdit ? 'Edit teacher' : 'Add teacher'}</span>
              <button type="button" className="sa-icon-btn" onClick={() => setDraft(null)} aria-label="Close">
                <span className="material-symbols-outlined" aria-hidden="true">close</span>
              </button>
            </header>
            <div className="sa-drawer-body">
              <Field label="Full name" htmlFor="t-name">
                <input id="t-name" className="sa-input" value={draft.name} autoFocus
                       onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} />
              </Field>
              <Field label="Email" htmlFor="t-email"
                     hint="Must match the address they sign in with; the Team screen links employment records by email.">
                <input id="t-email" type="email" className="sa-input" value={draft.email}
                       onChange={e => setDraft(d => ({ ...d, email: e.target.value }))} />
              </Field>
              {emailTaken && <p className="sa-note is-bad">A teacher in this school already uses that email.</p>}
            </div>
            <footer className="sa-drawer-footer">
              <button type="button" className="sa-btn sa-btn-ghost" onClick={() => setDraft(null)}>Cancel</button>
              <button type="button" className="sa-btn sa-btn-primary" disabled={!canSave} onClick={askSave}>
                {isEdit ? 'Save changes' : 'Create teacher'}
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
