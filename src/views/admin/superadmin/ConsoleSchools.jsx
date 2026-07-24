// ConsoleSchools — School → Schools.
//
// Organizations ARE the schools: Conversa, English Line, English Metropolis PVT.
// Everything else in this section (teachers, students, courses) is scoped by the
// row you pick here, so this screen is the root of the whole area.
//
// Counts are fetched per school rather than assumed, and a school whose count
// query fails shows "—" with the reason, never 0. A fabricated zero on a school
// that actually has 150 students is worse than an obvious gap.

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ConsoleErrorPanel, ConsoleSkeleton } from './ConsoleStates.jsx'
import { Field } from './CommsShared.jsx'
import { ConfirmWrite, useSchool } from './SchoolShared.jsx'
import { ORG_TYPES, createSchool, listStudents, listTeachers, slugify } from './schoolApi.js'

const BLANK = { name: '', slug: '', type: 'school' }

export default function ConsoleSchools() {
  const { schools, loading, error, reload, select, schoolId } = useSchool()
  const [counts, setCounts] = useState({})     // id -> {students, teachers, error}
  const [draft, setDraft] = useState(null)     // null = drawer closed
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState(null)

  // Counts are per-school queries; one failing school must not blank the others.
  useEffect(() => {
    if (!schools?.length) return undefined
    let alive = true
    schools.forEach(s => {
      Promise.allSettled([listStudents(s._id, true), listTeachers(s._id, false)])
        .then(([st, te]) => {
          if (!alive) return
          setCounts(prev => ({
            ...prev,
            [s._id]: {
              students: st.status === 'fulfilled' ? st.value.length : null,
              teachers: te.status === 'fulfilled' ? te.value.length : null,
              error: st.status === 'rejected' ? st.reason : te.status === 'rejected' ? te.reason : null,
            },
          }))
        })
    })
    return () => { alive = false }
  }, [schools])

  async function save() {
    setBusy(true)
    try {
      await createSchool(draft)
      setNote({ ok: true, text: `School "${draft.name}" created.` })
      setConfirm(false); setDraft(null); reload()
    } catch (e) {
      setNote({ ok: false, text: e.message })
      setConfirm(false)
    } finally { setBusy(false) }
  }

  const nameTaken = !!schools?.some(s =>
    s.name.trim().toLowerCase() === draft?.name.trim().toLowerCase())
  const slugTaken = !!schools?.some(s => s.slug === (draft?.slug || slugify(draft?.name || '')))
  const canSave = draft?.name.trim() && !nameTaken && !slugTaken

  return (
    <div className="sa-page">
      <div className="sa-page-header">
        <div>
          <h1 className="sa-page-title">Schools</h1>
          <p className="sa-page-sub">
            Every teacher, student and course belongs to one school. Pick one to make it
            the console&apos;s working school.
          </p>
        </div>
        <button type="button" className="sa-btn sa-btn-primary" onClick={() => { setNote(null); setDraft(BLANK) }}>
          <span className="material-symbols-outlined" aria-hidden="true">add_business</span>
          Add school
        </button>
      </div>

      {note && (
        <p className={note.ok ? 'sa-note is-ok' : 'sa-note is-bad'} role="status">{note.text}</p>
      )}

      {loading ? <ConsoleSkeleton rows={3} label="Loading schools…" />
        : error ? <ConsoleErrorPanel error={error} onRetry={reload} />
          : (
            <div className="sa-card-grid">
              {schools.map(s => {
                const c = counts[s._id]
                const active = s._id === schoolId
                return (
                  <article key={s._id} className={active ? 'sa-card is-active' : 'sa-card'}>
                    <header className="sa-card-header">
                      <h2 className="sa-card-title">{s.name}</h2>
                      <span className="sa-badge">{labelForType(s.type)}</span>
                    </header>
                    <p className="sa-card-meta"><code>{s.slug}</code></p>
                    <dl className="sa-card-stats">
                      <div><dt>Students</dt><dd className="sa-num">{num(c?.students)}</dd></div>
                      <div><dt>Teachers</dt><dd className="sa-num">{num(c?.teachers)}</dd></div>
                    </dl>
                    {c?.error && (
                      <p className="sa-card-warn">Counts unavailable: {c.error.message}</p>
                    )}
                    <footer className="sa-card-foot">
                      {active
                        ? <span className="sa-badge sa-badge-ok">Working school</span>
                        : <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm"
                                  onClick={() => select(s._id)}>Use this school</button>}
                      <Link className="sa-btn sa-btn-ghost sa-btn-sm"
                            to="/admin/superadmin/school/teachers"
                            onClick={() => select(s._id)}>Teachers →</Link>
                    </footer>
                  </article>
                )
              })}
            </div>
          )}

      {draft && (
        <div className="sa-drawer-host">
          <div className="sa-scrim" onClick={() => setDraft(null)} />
          <aside className="sa-drawer" role="dialog" aria-modal="true" aria-label="Add school">
            <header className="sa-drawer-header">
              <span>Add school</span>
              <button type="button" className="sa-icon-btn" onClick={() => setDraft(null)} aria-label="Close">
                <span className="material-symbols-outlined" aria-hidden="true">close</span>
              </button>
            </header>
            <div className="sa-drawer-body">
              <Field label="Name" htmlFor="school-name">
                <input id="school-name" className="sa-input" value={draft.name} autoFocus
                       onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} />
              </Field>
              {nameTaken && <p className="sa-note is-bad">A school with that name already exists.</p>}
              <Field label="Slug" htmlFor="school-slug"
                     hint="Used in URLs and the school subdomain. Generated from the name; override if you need to.">
                <input id="school-slug" className="sa-input"
                       value={draft.slug || slugify(draft.name)}
                       onChange={e => setDraft(d => ({ ...d, slug: slugify(e.target.value) }))} />
              </Field>
              {slugTaken && <p className="sa-note is-bad">That slug is already taken.</p>}
              <Field label="Type" htmlFor="school-type"
                     hint={ORG_TYPES.find(t => t.value === draft.type)?.hint}>
                <select id="school-type" className="sa-select" value={draft.type}
                        onChange={e => setDraft(d => ({ ...d, type: e.target.value }))}>
                  {ORG_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </Field>
            </div>
            <footer className="sa-drawer-footer">
              <button type="button" className="sa-btn sa-btn-ghost" onClick={() => setDraft(null)}>Cancel</button>
              <button type="button" className="sa-btn sa-btn-primary" disabled={!canSave}
                      onClick={() => setConfirm(true)}>Create school</button>
            </footer>
          </aside>
        </div>
      )}

      <ConfirmWrite
        open={confirm}
        title="Create school"
        verb="Create school"
        busy={busy}
        rows={[
          { label: 'Name', value: draft?.name },
          { label: 'Slug', value: draft?.slug || slugify(draft?.name || '') },
          { label: 'Type', value: labelForType(draft?.type) },
        ]}
        warning="There is no delete-school function deployed, so this cannot be undone from the console."
        onConfirm={save}
        onClose={() => setConfirm(false)}
      />
    </div>
  )
}

const labelForType = t => ORG_TYPES.find(x => x.value === t)?.label || t || '—'
const num = v => (typeof v === 'number' ? v.toLocaleString('en-GB') : '—')
