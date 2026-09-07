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
import { bizCreate, bizList, bizUpdate } from './bizRest.jsx'

// Identity lives in Convex (users row: login email, work alias, phone);
// employment + payment details live in People → Team (team_members), linked by
// convex_user_id, so payroll and the teacher record are one person.
const BLANK = {
  name: '', email: '', workEmail: '', phone: '',
  employment_type: 'b2b', status: 'active', start_date: '', country: 'PL', currency: 'PLN', timezone: 'Europe/Warsaw',
  bank_name: '', account_holder: '', iban: '', swift_bic: '', tax_id: '', address: '',
  pay_rate: '', pay_unit: 'lesson', notes: '',
}
const HR_KEYS = ['employment_type', 'status', 'start_date', 'country', 'currency', 'timezone',
  'bank_name', 'account_holder', 'iban', 'swift_bic', 'tax_id', 'address', 'pay_rate', 'pay_unit', 'notes']
const EMPLOYMENT = [['b2b', 'B2B (invoice)'], ['uop', 'Umowa o pracę'], ['zlecenie', 'Umowa zlecenie'], ['dzielo', 'Umowa o dzieło'], ['contractor', 'Contractor'], ['intern', 'Intern'], ['volunteer', 'Volunteer']]
const PAY_UNITS = [['lesson', 'per lesson'], ['hour', 'per hour'], ['month', 'per month']]

// "Anna Kowalska-Nowak" → "anna.kowalska-nowak@englishmetro.com" (diacritics stripped).
function suggestWorkEmail(name) {
  const parts = String(name || '').trim().toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[łŁ]/g, 'l').split(/\s+/).filter(Boolean).map(p => p.replace(/[^a-z0-9-]/g, ''))
  if (!parts.length) return ''
  return `${parts.length > 1 ? `${parts[0]}.${parts[parts.length - 1]}` : parts[0]}@englishmetro.com`
}

async function loadTeamRecord(teacher) {
  // Match by Convex id first, then by login email (older rows were linked by email).
  const byId = await bizList('team_members', { convex_user_id: teacher._id, limit: 1 }).catch(() => null)
  const row = byId?.rows?.[0] || (await bizList('team_members', { q: teacher.email, limit: 5 }).catch(() => null))
    ?.rows?.find(r => (r.email || '').toLowerCase() === (teacher.email || '').toLowerCase())
  return row || null
}

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
  const workOk = !draft?.workEmail || /^[a-z0-9.-]+@englishmetro\.com$/.test(draft.workEmail.trim().toLowerCase())
  const canSave = draft?.name.trim() && /\S+@\S+\.\S+/.test(draft?.email || '') && !emailTaken && workOk
  const suggestion = suggestWorkEmail(draft?.name)

  // Edit: pull the People → Team record (employment + payment) for this teacher.
  const openEdit = async t => {
    setNote(null)
    const base = { ...BLANK, _id: t._id, name: t.name, email: t.email, workEmail: t.workEmail || '', phone: t.phone || '' }
    setDraft(base)
    const team = await loadTeamRecord(t)
    if (team) setDraft(d => (d && d._id === t._id) ? { ...d, _teamId: team.id, ...Object.fromEntries(HR_KEYS.map(k => [k, team[k] ?? d[k] ?? ''])) } : d)
  }

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
    rows: [{ label: 'Name', value: draft.name }, { label: 'Login email', value: draft.email },
           { label: 'Work email', value: draft.workEmail || '—' }, { label: 'Contract', value: draft.employment_type },
           { label: 'Rate', value: draft.pay_rate ? `${draft.pay_rate} ${draft.currency} ${draft.pay_unit}` : '—' }],
    warning: isEdit ? null
      : 'Creates the teacher account in this school (they sign in by magic link to the login email) and their People → Team record with the employment and payment details.',
    done: isEdit ? 'Teacher updated.' : `Teacher "${draft.name}" created.`,
    run: async () => {
      const identity = { name: draft.name.trim(), email: draft.email.trim().toLowerCase(),
        workEmail: draft.workEmail.trim().toLowerCase() || null, phone: draft.phone.trim() || null }
      let teacherId = draft._id
      if (isEdit) await updateTeacher(teacherId, identity)
      else teacherId = (await createTeacher({ ...identity, organizationId: schoolId }))?.teacherId
      // People → Team: one record per person, keyed by the Convex user id.
      const hr = Object.fromEntries(HR_KEYS.map(k => [k, draft[k] === '' ? null : draft[k]]))
      if (hr.pay_rate != null) hr.pay_rate = Number(hr.pay_rate)
      const team = { ...hr, email: identity.email, full_name: identity.name, work_email: identity.workEmail,
        phone: identity.phone, role: 'teacher', department: 'academic', convex_user_id: teacherId }
      const teamId = draft._teamId || (teacherId && (await loadTeamRecord({ _id: teacherId, email: identity.email }))?.id)
      if (teamId) await bizUpdate('team_members', teamId, team)
      else await bizCreate('team_members', team)
    },
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
                    <td><code>{t.email}</code>{t.workEmail && <div className="sa-cell-sub"><code>{t.workEmail}</code></div>}</td>
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
                                  onClick={() => { if (allMode) select(t._schoolId); openEdit(t) }}>
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
          <aside className="sa-drawer sa-drawer-wide" role="dialog" aria-modal="true"
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
              <Field label="Login email" htmlFor="t-email"
                     hint="The address they registered with (usually their Gmail). Magic-link sign-in goes here and the Team record is keyed by it.">
                <input id="t-email" type="email" className="sa-input" value={draft.email}
                       onChange={e => setDraft(d => ({ ...d, email: e.target.value }))} />
              </Field>
              {emailTaken && <p className="sa-note is-bad">A teacher in this school already uses that email.</p>}
              <Field label="Work email" htmlFor="t-work"
                     hint="Their @englishmetro.com address, shown to students. The mailbox itself still has to exist on the mail server.">
                <div style={{ display: 'flex', gap: 8 }}>
                  <input id="t-work" type="email" className="sa-input" value={draft.workEmail} placeholder={suggestion}
                         onChange={e => setDraft(d => ({ ...d, workEmail: e.target.value }))} />
                  {suggestion && draft.workEmail !== suggestion && (
                    <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" style={{ whiteSpace: 'nowrap' }}
                            onClick={() => setDraft(d => ({ ...d, workEmail: suggestion }))}>Use {suggestion}</button>
                  )}
                </div>
              </Field>
              {!workOk && <p className="sa-note is-bad">Work email must be an @englishmetro.com address.</p>}
              <Field label="Phone" htmlFor="t-phone">
                <input id="t-phone" className="sa-input" value={draft.phone}
                       onChange={e => setDraft(d => ({ ...d, phone: e.target.value }))} />
              </Field>

              <fieldset className="sa-fieldset"><legend>Employment</legend>
                <Field label="Contract" htmlFor="t-emp">
                  <select id="t-emp" className="sa-select" value={draft.employment_type}
                          onChange={e => setDraft(d => ({ ...d, employment_type: e.target.value }))}>
                    {EMPLOYMENT.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </Field>
                <Field label="Status" htmlFor="t-status">
                  <select id="t-status" className="sa-select" value={draft.status}
                          onChange={e => setDraft(d => ({ ...d, status: e.target.value }))}>
                    {['active', 'on_leave', 'offboarding', 'inactive'].map(v => <option key={v} value={v}>{v.replace('_', ' ')}</option>)}
                  </select>
                </Field>
                <Field label="Start date" htmlFor="t-start">
                  <input id="t-start" type="date" className="sa-input" value={draft.start_date || ''}
                         onChange={e => setDraft(d => ({ ...d, start_date: e.target.value }))} />
                </Field>
                <Field label="Country / currency" htmlFor="t-country">
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input id="t-country" className="sa-input" maxLength={2} placeholder="PL" value={draft.country || ''}
                           onChange={e => setDraft(d => ({ ...d, country: e.target.value.toUpperCase() }))} />
                    <input aria-label="Currency" className="sa-input" maxLength={3} placeholder="PLN" value={draft.currency || ''}
                           onChange={e => setDraft(d => ({ ...d, currency: e.target.value.toUpperCase() }))} />
                  </div>
                </Field>
                <Field label="Rate" htmlFor="t-rate" hint="Their agreed pay. Payroll runs read this from People → Team.">
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input id="t-rate" type="number" min="0" step="0.01" className="sa-input" value={draft.pay_rate}
                           onChange={e => setDraft(d => ({ ...d, pay_rate: e.target.value }))} />
                    <select aria-label="Pay unit" className="sa-select" value={draft.pay_unit}
                            onChange={e => setDraft(d => ({ ...d, pay_unit: e.target.value }))}>
                      {PAY_UNITS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                </Field>
              </fieldset>

              <fieldset className="sa-fieldset"><legend>Payment details</legend>
                <Field label="Account holder" htmlFor="t-holder">
                  <input id="t-holder" className="sa-input" value={draft.account_holder || ''}
                         onChange={e => setDraft(d => ({ ...d, account_holder: e.target.value }))} />
                </Field>
                <Field label="Bank" htmlFor="t-bank">
                  <input id="t-bank" className="sa-input" value={draft.bank_name || ''}
                         onChange={e => setDraft(d => ({ ...d, bank_name: e.target.value }))} />
                </Field>
                <Field label="IBAN" htmlFor="t-iban">
                  <input id="t-iban" className="sa-input" value={draft.iban || ''} placeholder="PL00 0000 …"
                         onChange={e => setDraft(d => ({ ...d, iban: e.target.value.toUpperCase() }))} />
                </Field>
                <Field label="SWIFT / BIC" htmlFor="t-swift">
                  <input id="t-swift" className="sa-input" value={draft.swift_bic || ''}
                         onChange={e => setDraft(d => ({ ...d, swift_bic: e.target.value.toUpperCase() }))} />
                </Field>
                <Field label="NIP / tax id" htmlFor="t-tax">
                  <input id="t-tax" className="sa-input" value={draft.tax_id || ''}
                         onChange={e => setDraft(d => ({ ...d, tax_id: e.target.value }))} />
                </Field>
                <Field label="Address" htmlFor="t-addr">
                  <textarea id="t-addr" className="sa-textarea" rows={2} value={draft.address || ''}
                            onChange={e => setDraft(d => ({ ...d, address: e.target.value }))} />
                </Field>
              </fieldset>

              <Field label="Notes" htmlFor="t-notes">
                <textarea id="t-notes" className="sa-textarea" rows={3} value={draft.notes || ''}
                          onChange={e => setDraft(d => ({ ...d, notes: e.target.value }))} />
              </Field>
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
