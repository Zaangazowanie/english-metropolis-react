// ConsoleTeam — People → Team.
//
// CRUD over `team_members` (business SQLite, /api/console/biz/team_members),
// cross-referenced against the teaching side: teachers:listTeachers in Convex
// is matched to team members BY EMAIL, which is exactly how the schema says the
// link is meant to work (team_members.convex_user_id, "link to the Convex user,
// by email"). The match gives each row its live student count, and surfaces the
// two mismatches that matter: a team member with no Convex user, and a Convex
// teacher with no team record.
//
// The Convex read is deliberately independent of the team list: if Convex is
// unreachable the roster still renders, with the cross-reference column saying
// so rather than the whole screen failing.
//
// team_members is empty today. That is correct — the empty state says what the
// section is for and what to do first, and no row is ever invented.

import { useEffect, useMemo, useState } from 'react'
import { queryAdminConvex } from '../../../contexts/AdminAuthContext.jsx'
import { ConsoleEmpty, ConsoleErrorPanel, ConsoleNotLive, ConsoleSkeleton } from './ConsoleStates.jsx'
import {
  Drawer, Field, SaveError, SortTh, bizCreate, bizDelete, bizRestore, bizUpdate,
  fmtDate, useBizList,
} from './bizRest.jsx'

const ROLES = ['teacher', 'admin', 'super_admin', 'marketing', 'sales', 'finance', 'support', 'engineering', 'other']
const DEPARTMENTS = ['academic', 'curriculum', 'comms', 'crm', 'growth', 'website', 'finance', 'people', 'system']
const EMPLOYMENT = ['b2b', 'uop', 'zlecenie', 'dzielo', 'contractor', 'intern', 'volunteer']
const MEMBER_STATUS = ['active', 'on_leave', 'offboarding', 'inactive']

const STATUS_BADGE = {
  active: 'sa-badge-committed',
  on_leave: 'sa-badge-awaiting_review',
  offboarding: 'sa-badge-awaiting_review',
  inactive: 'sa-badge-queued',
}

const EMPTY = {
  full_name: '', email: '', role: 'teacher', department: 'academic',
  employment_type: 'b2b', status: 'active', country: 'PL', locale: 'pl',
  timezone: 'Europe/Warsaw', currency: 'PLN', phone: '', start_date: '',
  end_date: '', notes: '',
}
const FIELDS = Object.keys(EMPTY)
const key = email => String(email || '').trim().toLowerCase()

export default function ConsoleTeam() {
  const [q, setQ] = useState('')
  const [role, setRole] = useState('')
  const [status, setStatus] = useState('')
  const [sort, setSort] = useState('full_name')
  const [archived, setArchived] = useState(false)
  const [edit, setEdit] = useState(null)        // row object, or {} for a new member

  const params = { q, role, status, sort, limit: 500 }
  if (archived) params.include_deleted = 1
  const { rows, total, error, reload } = useBizList('team_members', params)

  // Convex side, loaded once.
  const [teachers, setTeachers] = useState(null)
  const [teachersError, setTeachersError] = useState(null)
  useEffect(() => {
    let alive = true
    queryAdminConvex('teachers:listTeachers', { includeRemoved: false })
      .then(list => { if (alive) setTeachers(list || []) })
      .catch(e => { if (alive) setTeachersError(e) })
    return () => { alive = false }
  }, [])

  const byEmail = useMemo(() => {
    const map = new Map()
    for (const t of teachers || []) map.set(key(t.email), t)
    return map
  }, [teachers])

  // Convex teachers with no team record — a real gap worth acting on.
  const unlinked = useMemo(() => {
    if (!teachers || !rows) return []
    const known = new Set((rows || []).map(r => key(r.email)))
    return teachers.filter(t => t.email && !known.has(key(t.email)))
  }, [teachers, rows])

  const visible = rows || []

  return (
    <>
      <div className="sa-page-header">
        <div>
          <h1>Team</h1>
          <p>Teachers and staff, their contract type and their live teaching load. Matched to Convex users by email address.</p>
        </div>
        <div className="sa-page-header-actions">
          <button type="button" className="sa-btn sa-btn-primary" onClick={() => setEdit({ ...EMPTY })}>
            <span className="material-symbols-outlined" aria-hidden="true">person_add</span>
            Add team member
          </button>
        </div>
      </div>

      <div className="sa-toolbar">
        <label className="sa-sr-only" htmlFor="team-q">Search team</label>
        <input id="team-q" type="search" className="sa-input" value={q} placeholder="Search name, email, role, department…"
          onChange={e => setQ(e.target.value)} />
        <label className="sa-sr-only" htmlFor="team-role">Role</label>
        <select id="team-role" className="sa-select" value={role} onChange={e => setRole(e.target.value)}>
          <option value="">All roles</option>
          {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <label className="sa-sr-only" htmlFor="team-status">Status</label>
        <select id="team-status" className="sa-select" value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {MEMBER_STATUS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <label className="sa-checkbox">
          <input type="checkbox" checked={archived} onChange={e => setArchived(e.target.checked)} />
          Show archived
        </label>
        <span className="sa-toolbar-spacer" />
        {rows && <span className="sa-toolbar-count">{visible.length} shown{total !== null && total !== visible.length ? ` · ${total} total` : ''}</span>}
        <button type="button" className="sa-icon-btn" onClick={reload} aria-label="Reload team">
          <span className="material-symbols-outlined" aria-hidden="true">refresh</span>
        </button>
      </div>

      <div className="sa-card" style={{ marginTop: 12 }}>
        {error?.notLive && <ConsoleNotLive endpoint="/api/console/biz/team_members" />}
        {error && !error.notLive && <ConsoleErrorPanel error={error} onRetry={reload} />}
        {!error && !rows && <ConsoleSkeleton label="Loading team…" />}
        {!error && rows && !visible.length && (
          <ConsoleEmpty
            icon="badge"
            title={q || role || status ? 'No team member matches these filters' : 'No team records yet'}
            hint={q || role || status
              ? <p>Clear the search or the filters above.</p>
              : (
                <>
                  <p>This is the employment side of the roster: contract type, department, start date and status. The teaching side already lives in Convex; this table is what Convex does not hold.</p>
                  <p style={{ marginTop: '0.5rem' }}>
                    Start with the people who already teach.{' '}
                    {teachers
                      ? `Convex currently lists ${teachers.length} teacher${teachers.length === 1 ? '' : 's'}; adding each with the same email links the two sides automatically.`
                      : 'Add each person with the same email address they use in Convex and the two sides link automatically.'}
                  </p>
                </>
              )}
            action={
              <button type="button" className="sa-btn sa-btn-primary" onClick={() => setEdit({ ...EMPTY })}>
                <span className="material-symbols-outlined" aria-hidden="true">person_add</span>
                Add the first team member
              </button>
            }
          />
        )}
        {!error && rows && !!visible.length && (
          <div className="sa-table-wrap">
            <table className="sa-table">
              <thead>
                <tr>
                  <SortTh col="full_name" sort={sort} onSort={setSort}>Name</SortTh>
                  <SortTh col="email" sort={sort} onSort={setSort}>Email</SortTh>
                  <SortTh col="role" sort={sort} onSort={setSort}>Role</SortTh>
                  <SortTh col="department" sort={sort} onSort={setSort}>Department</SortTh>
                  <SortTh col="employment_type" sort={sort} onSort={setSort}>Contract</SortTh>
                  <SortTh col="status" sort={sort} onSort={setSort}>Status</SortTh>
                  <th scope="col">Convex user</th>
                  <th scope="col" style={{ textAlign: 'right' }}>Students</th>
                  <SortTh col="start_date" sort={sort} onSort={setSort}>Started</SortTh>
                  <th scope="col"><span className="sa-sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {visible.map(m => {
                  const t = byEmail.get(key(m.email))
                  return (
                    <tr key={m.id} style={m.deleted_at ? { opacity: 0.6 } : undefined}>
                      <td>
                        {m.full_name}
                        {m.deleted_at && <span className="sa-badge sa-badge-queued" style={{ marginLeft: 6 }}>archived</span>}
                      </td>
                      <td style={{ fontFamily: 'ui-monospace, monospace' }}>{m.email}</td>
                      <td>{m.role}</td>
                      <td>{m.department || <span style={{ color: 'var(--sa-text-muted)' }}>—</span>}</td>
                      <td><span className="sa-badge sa-badge-queued">{m.employment_type}</span></td>
                      <td><span className={`sa-badge ${STATUS_BADGE[m.status] || 'sa-badge-queued'}`}>{m.status}</span></td>
                      <td>
                        {teachersError
                          ? <span style={{ color: 'var(--sa-text-muted)' }}>Convex unavailable</span>
                          : !teachers
                            ? <span style={{ color: 'var(--sa-text-muted)' }}>checking…</span>
                            : t
                              ? <span className="sa-badge sa-badge-committed" title={t._id}>{t.name || 'matched'}</span>
                              : <span className="sa-badge sa-badge-queued">no match</span>}
                      </td>
                      <td className="sa-num">{t ? t.studentCount : <span style={{ color: 'var(--sa-text-muted)' }}>—</span>}</td>
                      <td>{m.start_date ? fmtDate(m.start_date) : <span style={{ color: 'var(--sa-text-muted)' }}>—</span>}</td>
                      <td className="sa-td-right">
                        <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" onClick={() => setEdit(m)}>
                          <span className="material-symbols-outlined" aria-hidden="true">edit</span>
                          Edit
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {teachersError && (
        <div className="sa-card" style={{ marginTop: 12 }}>
          <div className="sa-card-header"><h2>Convex cross-reference</h2></div>
          <div className="sa-card-body">
            <p style={{ margin: 0, color: 'var(--sa-text-muted)' }}>
              <code>teachers:listTeachers</code> failed ({teachersError.message}). The team list above is unaffected; the
              Convex user and student columns cannot be filled until that query answers.
            </p>
          </div>
        </div>
      )}

      {!teachersError && !!unlinked.length && (
        <div className="sa-card" style={{ marginTop: 12 }}>
          <div className="sa-card-header">
            <h2>Teaching in Convex, no team record</h2>
            <span className="sa-toolbar-count">{unlinked.length}</span>
          </div>
          <div className="sa-table-wrap">
            <table className="sa-table">
              <caption>These users have the teacher role in Convex but no row here, so they have no contract type, department or start date on record.</caption>
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Email</th>
                  <th scope="col" style={{ textAlign: 'right' }}>Students</th>
                  <th scope="col"><span className="sa-sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {unlinked.map(t => (
                  <tr key={t._id}>
                    <td>{t.name || <span style={{ color: 'var(--sa-text-muted)' }}>unnamed</span>}</td>
                    <td style={{ fontFamily: 'ui-monospace, monospace' }}>{t.email}</td>
                    <td className="sa-num">{t.studentCount}</td>
                    <td className="sa-td-right">
                      <button
                        type="button" className="sa-btn sa-btn-ghost sa-btn-sm"
                        onClick={() => setEdit({ ...EMPTY, full_name: t.name || '', email: t.email, role: 'teacher' })}
                      >
                        <span className="material-symbols-outlined" aria-hidden="true">person_add</span>
                        Add to team
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {edit && (
        <MemberDrawer
          member={edit}
          onClose={() => setEdit(null)}
          onSaved={() => { setEdit(null); reload() }}
        />
      )}
    </>
  )
}

function MemberDrawer({ member, onClose, onSaved }) {
  const isNew = !member.id
  const [form, setForm] = useState(() => {
    const f = {}
    for (const k of FIELDS) f[k] = member[k] ?? EMPTY[k]
    return f
  })
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function submit(e) {
    e.preventDefault()
    setError(null)
    const payload = {}
    for (const k of FIELDS) payload[k] = form[k] === '' ? null : form[k]
    payload.full_name = String(form.full_name || '').trim()
    payload.email = String(form.email || '').trim()
    if (!payload.full_name || !payload.email) {
      setError(new Error('Full name and email are both required.'))
      return
    }
    setBusy('save')
    try {
      if (isNew) await bizCreate('team_members', payload)
      else await bizUpdate('team_members', member.id, payload)
      onSaved()
    } catch (err) {
      setError(err)
    } finally {
      setBusy('')
    }
  }

  async function archive() {
    setError(null)
    setBusy('archive')
    try {
      if (member.deleted_at) await bizRestore('team_members', member.id)
      else await bizDelete('team_members', member.id)
      onSaved()
    } catch (err) {
      setError(err)
    } finally {
      setBusy('')
    }
  }

  return (
    <Drawer
      title={isNew ? 'Add team member' : form.full_name || 'Team member'}
      onClose={onClose}
      footer={
        <>
          {!isNew && (
            <button type="button" className={`sa-btn ${member.deleted_at ? 'sa-btn-ghost' : 'sa-btn-danger'}`}
              onClick={archive} disabled={busy === 'archive'} style={{ marginRight: 'auto' }}>
              <span className="material-symbols-outlined" aria-hidden="true">{member.deleted_at ? 'restore_from_trash' : 'archive'}</span>
              {member.deleted_at ? 'Restore' : 'Archive'}
            </button>
          )}
          <button type="button" className="sa-btn sa-btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" form="team-member-form" className="sa-btn sa-btn-primary" disabled={busy === 'save'}>
            <span className="material-symbols-outlined" aria-hidden="true">save</span>
            {busy === 'save' ? 'Saving…' : isNew ? 'Create' : 'Save'}
          </button>
        </>
      }
    >
      <form id="team-member-form" onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
        <SaveError error={error} />
        <Field label="Full name">
          <input className="sa-input" value={form.full_name} onChange={e => set('full_name', e.target.value)} required />
        </Field>
        <Field label="Email" hint="Must match the Convex user's email for the two sides to link.">
          <input className="sa-input" type="email" value={form.email} onChange={e => set('email', e.target.value)} required />
        </Field>
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
          <Field label="Role">
            <select className="sa-select" value={form.role} onChange={e => set('role', e.target.value)}>
              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </Field>
          <Field label="Department">
            <select className="sa-select" value={form.department || ''} onChange={e => set('department', e.target.value)}>
              <option value="">—</option>
              {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </Field>
          <Field label="Contract type">
            <select className="sa-select" value={form.employment_type} onChange={e => set('employment_type', e.target.value)}>
              {EMPLOYMENT.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Status">
            <select className="sa-select" value={form.status} onChange={e => set('status', e.target.value)}>
              {MEMBER_STATUS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Start date">
            <input className="sa-input" type="date" value={form.start_date || ''} onChange={e => set('start_date', e.target.value)} />
          </Field>
          <Field label="End date">
            <input className="sa-input" type="date" value={form.end_date || ''} onChange={e => set('end_date', e.target.value)} />
          </Field>
          <Field label="Country" hint="Two-letter code">
            <input className="sa-input" maxLength={2} value={form.country || ''} onChange={e => set('country', e.target.value.toUpperCase())} />
          </Field>
          <Field label="Currency" hint="Three-letter code">
            <input className="sa-input" maxLength={3} value={form.currency || ''} onChange={e => set('currency', e.target.value.toUpperCase())} />
          </Field>
          <Field label="Locale">
            <input className="sa-input" value={form.locale || ''} onChange={e => set('locale', e.target.value)} placeholder="pl" />
          </Field>
          <Field label="Time zone">
            <input className="sa-input" value={form.timezone || ''} onChange={e => set('timezone', e.target.value)} placeholder="Europe/Warsaw" />
          </Field>
        </div>
        <Field label="Phone">
          <input className="sa-input" value={form.phone || ''} onChange={e => set('phone', e.target.value)} />
        </Field>
        <Field label="Notes">
          <textarea className="sa-input sa-textarea" rows={3} value={form.notes || ''} onChange={e => set('notes', e.target.value)} />
        </Field>
      </form>
    </Drawer>
  )
}
