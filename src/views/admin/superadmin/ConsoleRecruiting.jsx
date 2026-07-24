// ConsoleRecruiting — People → Recruiting.
//
// `applicants` moving through `recruiting_stages`. The seven stages (applied,
// screening, interview, demo lesson, offer, hired, rejected) are seeded
// reference data, not content: they exist even though no applicant does.
//
// Stage moves are keyboard-first, the same pattern the CRM pipeline uses: every
// card is a focusable group that answers ArrowLeft / ArrowRight, and carries the
// same two moves as real buttons so the affordance is visible and reachable by
// tab. Each move is announced in a polite live region.
//
// A move is a PATCH of applicants.stage_id and nothing else. It is applied to
// local state only after the server confirms — an optimistic board that lies
// about where a candidate is would be worse than a slow one.

import { useMemo, useState } from 'react'
import { ConsoleEmpty, ConsoleErrorPanel, ConsoleNotLive, ConsoleSkeleton } from './ConsoleStates.jsx'
import {
  Drawer, Field, SaveError, bizCreate, bizDelete, bizUpdate, fmtDate, useBizList,
} from './bizRest.jsx'

const APPLICANT_STATUS = ['active', 'hired', 'rejected', 'withdrawn', 'on_hold']
const STATUS_BADGE = {
  active: 'sa-badge-processing',
  hired: 'sa-badge-committed',
  rejected: 'sa-badge-failed',
  withdrawn: 'sa-badge-queued',
  on_hold: 'sa-badge-awaiting_review',
}

const EMPTY = {
  full_name: '', email: '', phone: '', role_applied: '', stage_id: '',
  status: 'active', source: '', country: 'PL', locale: 'pl', cv_path: '',
  rating: '', rejected_reason: '', owner_id: '', applied_date: '', notes: '',
}
const FIELDS = Object.keys(EMPTY)

export default function ConsoleRecruiting() {
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('active')
  const [edit, setEdit] = useState(null)
  const [move, setMove] = useState({ busy: null, error: null, said: '' })

  const stages = useBizList('recruiting_stages', { active: 1, sort: 'position', limit: 100 })
  const applicants = useBizList('applicants', { q, status, sort: '-created_at', limit: 500 })
  const owners = useBizList('team_members', { status: 'active', sort: 'full_name', limit: 500 })

  // Local overlay of confirmed stage moves, so the board updates without a full
  // reload but never shows a move the server did not accept.
  const [moved, setMoved] = useState({})
  const rows = useMemo(
    () => (applicants.rows || []).map(a => (moved[a.id] ? { ...a, stage_id: moved[a.id] } : a)),
    [applicants.rows, moved],
  )

  const ordered = stages.rows || []
  const byStage = useMemo(() => {
    const map = new Map()
    for (const s of ordered) map.set(s.id, [])
    map.set(null, [])
    for (const a of rows) {
      const bucket = map.has(a.stage_id) ? a.stage_id : null
      map.get(bucket).push(a)
    }
    return map
  }, [ordered, rows])

  async function moveTo(applicant, dir) {
    const idx = ordered.findIndex(s => s.id === applicant.stage_id)
    const next = ordered[(idx < 0 ? (dir > 0 ? -1 : ordered.length) : idx) + dir]
    if (!next) return
    setMove({ busy: applicant.id, error: null, said: '' })
    try {
      await bizUpdate('applicants', applicant.id, { stage_id: next.id })
      setMoved(m => ({ ...m, [applicant.id]: next.id }))
      setMove({ busy: null, error: null, said: `${applicant.full_name} moved to ${next.name}` })
    } catch (e) {
      setMove({ busy: null, error: e, said: '' })
    }
  }

  const loadError = stages.error || applicants.error
  const loading = (!stages.rows && !stages.error) || (!applicants.rows && !applicants.error)

  function reloadAll() {
    setMoved({})
    stages.reload()
    applicants.reload()
  }

  return (
    <>
      <div className="sa-page-header">
        <div>
          <h1>Recruiting</h1>
          <p>Applicants moving through the seven hiring stages. Arrow keys move a focused card between stages.</p>
        </div>
        <div className="sa-page-header-actions">
          <button type="button" className="sa-btn sa-btn-primary" onClick={() => setEdit({ ...EMPTY })}>
            <span className="material-symbols-outlined" aria-hidden="true">person_add</span>
            Add applicant
          </button>
        </div>
      </div>

      <div className="sa-toolbar">
        <label className="sa-sr-only" htmlFor="rec-q">Search applicants</label>
        <input id="rec-q" type="search" className="sa-input" value={q} placeholder="Search name, email, role, source…"
          onChange={e => setQ(e.target.value)} />
        <label className="sa-sr-only" htmlFor="rec-status">Status</label>
        <select id="rec-status" className="sa-select" value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {APPLICANT_STATUS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <span className="sa-toolbar-spacer" />
        {applicants.rows && <span className="sa-toolbar-count">{rows.length} applicant{rows.length === 1 ? '' : 's'}</span>}
        <button type="button" className="sa-icon-btn" onClick={reloadAll} aria-label="Reload recruiting board">
          <span className="material-symbols-outlined" aria-hidden="true">refresh</span>
        </button>
      </div>

      <p className="sa-sr-only" role="status" aria-live="polite">{move.said}</p>

      {loadError?.notLive && (
        <div className="sa-card" style={{ marginTop: 12 }}>
          <ConsoleNotLive endpoint="/api/console/biz/applicants" />
        </div>
      )}
      {loadError && !loadError.notLive && (
        <div style={{ marginTop: 12 }}><ConsoleErrorPanel error={loadError} onRetry={reloadAll} /></div>
      )}
      {!loadError && loading && (
        <div className="sa-card" style={{ marginTop: 12 }}><ConsoleSkeleton label="Loading recruiting board…" /></div>
      )}

      {!loadError && !loading && !ordered.length && (
        <div className="sa-card" style={{ marginTop: 12 }}>
          <ConsoleEmpty
            icon="conveyor_belt"
            title="No recruiting stages are configured"
            hint={<p>The seven stages are seeded reference data. An empty stage list means <code>seed_reference_data()</code> has not run against this database yet — the board cannot be drawn without it.</p>}
          />
        </div>
      )}

      {!loadError && !loading && !!ordered.length && (
        <>
          {move.error && <div style={{ marginTop: 12 }}><SaveError error={move.error} /></div>}
          {!rows.length && (
            <div className="sa-card" style={{ marginTop: 12 }}>
              <ConsoleEmpty
                icon="person_search"
                title={q || status !== 'active' ? 'No applicant matches these filters' : 'No applicants yet'}
                hint={q || status !== 'active'
                  ? <p>Clear the search or the status filter above.</p>
                  : (
                    <>
                      <p>This board tracks candidates for teaching and staff roles from first contact to hire, through {ordered.length} stages: {ordered.map(s => s.name).join(' → ')}.</p>
                      <p style={{ marginTop: '0.5rem' }}>Add the first applicant when someone answers a job post. Hiring one links them to a team member record on the Team screen.</p>
                    </>
                  )}
                action={
                  <button type="button" className="sa-btn sa-btn-primary" onClick={() => setEdit({ ...EMPTY })}>
                    <span className="material-symbols-outlined" aria-hidden="true">person_add</span>
                    Add the first applicant
                  </button>
                }
              />
            </div>
          )}

          <div style={{ marginTop: 12, display: 'grid', gap: 10, gridTemplateColumns: `repeat(${ordered.length}, minmax(190px, 1fr))`, overflowX: 'auto' }}>
            {ordered.map(stage => {
              const cards = byStage.get(stage.id) || []
              return (
                <section key={stage.id} className="sa-card" style={{ display: 'flex', flexDirection: 'column', minWidth: 190 }}
                  aria-label={`${stage.name}, ${cards.length} applicant${cards.length === 1 ? '' : 's'}`}>
                  <div className="sa-card-header" style={{ padding: '8px 10px' }}>
                    <h2 style={{ fontSize: 'var(--sa-fs-small)' }}>
                      {stage.name}
                      {!!stage.is_terminal && (
                        <span className="sa-badge sa-badge-queued" style={{ marginLeft: 6 }} title="Terminal stage">final</span>
                      )}
                    </h2>
                    <span className="sa-toolbar-count">{cards.length}</span>
                  </div>
                  <div style={{ display: 'grid', gap: 6, padding: 8 }}>
                    {!cards.length && (
                      <p style={{ margin: 0, fontSize: 'var(--sa-fs-small)', color: 'var(--sa-text-muted)' }}>—</p>
                    )}
                    {cards.map(a => (
                      <ApplicantCard
                        key={a.id} applicant={a} stages={ordered} busy={move.busy === a.id}
                        onMove={dir => moveTo(a, dir)} onEdit={() => setEdit(a)}
                      />
                    ))}
                  </div>
                </section>
              )
            })}
          </div>

          {!!(byStage.get(null) || []).length && (
            <div className="sa-card" style={{ marginTop: 12 }}>
              <div className="sa-card-header">
                <h2>Not in any stage</h2>
                <span className="sa-toolbar-count">{byStage.get(null).length}</span>
              </div>
              <div style={{ display: 'grid', gap: 6, padding: 8, gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
                {byStage.get(null).map(a => (
                  <ApplicantCard key={a.id} applicant={a} stages={ordered} busy={move.busy === a.id}
                    onMove={dir => moveTo(a, dir)} onEdit={() => setEdit(a)} />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {edit && (
        <ApplicantDrawer
          applicant={edit}
          stages={ordered}
          owners={owners.rows || []}
          onClose={() => setEdit(null)}
          onSaved={() => { setEdit(null); reloadAll() }}
        />
      )}
    </>
  )
}

function ApplicantCard({ applicant, stages, busy, onMove, onEdit }) {
  const idx = stages.findIndex(s => s.id === applicant.stage_id)
  const stageName = idx >= 0 ? stages[idx].name : 'no stage'
  const canBack = idx > 0
  const canForward = idx >= 0 ? idx < stages.length - 1 : stages.length > 0

  function onKeyDown(e) {
    if (e.key === 'ArrowLeft' && canBack) { e.preventDefault(); onMove(-1) }
    if (e.key === 'ArrowRight' && canForward) { e.preventDefault(); onMove(1) }
  }

  return (
    <div
      role="group"
      tabIndex={0}
      onKeyDown={onKeyDown}
      aria-label={`${applicant.full_name}, ${applicant.role_applied || 'no role'}, stage ${stageName}. Use left and right arrow keys to move stage.`}
      style={{
        border: '1px solid var(--sa-border)',
        borderRadius: 'var(--sa-radius-control)',
        background: 'var(--sa-surface)',
        padding: 8,
        display: 'grid',
        gap: 6,
        opacity: busy ? 0.6 : 1,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 'var(--sa-fs-body)' }}>{applicant.full_name}</strong>
        <span className={`sa-badge ${STATUS_BADGE[applicant.status] || 'sa-badge-queued'}`}>{applicant.status}</span>
      </div>
      <span style={{ fontSize: 'var(--sa-fs-small)', color: 'var(--sa-text-muted)' }}>
        {applicant.role_applied}
        {applicant.source ? ` · ${applicant.source}` : ''}
      </span>
      {applicant.rating ? (
        <span className="sa-num" style={{ fontSize: 'var(--sa-fs-small)', color: 'var(--sa-text-muted)' }}>
          rating {applicant.rating}/5
        </span>
      ) : null}
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <button type="button" className="sa-icon-btn sa-icon-btn-sm" disabled={!canBack || busy}
          onClick={() => onMove(-1)} aria-label={`Move ${applicant.full_name} to the previous stage`}>
          <span className="material-symbols-outlined" aria-hidden="true">chevron_left</span>
        </button>
        <button type="button" className="sa-icon-btn sa-icon-btn-sm" disabled={!canForward || busy}
          onClick={() => onMove(1)} aria-label={`Move ${applicant.full_name} to the next stage`}>
          <span className="material-symbols-outlined" aria-hidden="true">chevron_right</span>
        </button>
        <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" style={{ marginLeft: 'auto' }} onClick={onEdit}>
          Open
        </button>
      </div>
    </div>
  )
}

function ApplicantDrawer({ applicant, stages, owners, onClose, onSaved }) {
  const isNew = !applicant.id
  const [form, setForm] = useState(() => {
    const f = {}
    for (const k of FIELDS) f[k] = applicant[k] ?? EMPTY[k]
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
    payload.role_applied = String(form.role_applied || '').trim()
    if (!payload.full_name || !payload.role_applied) {
      setError(new Error('Full name and the role applied for are both required.'))
      return
    }
    for (const k of ['stage_id', 'owner_id', 'rating']) {
      if (payload[k] !== null) payload[k] = Number(payload[k])
    }
    setBusy('save')
    try {
      if (isNew) await bizCreate('applicants', payload)
      else await bizUpdate('applicants', applicant.id, payload)
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
      await bizDelete('applicants', applicant.id)
      onSaved()
    } catch (err) {
      setError(err)
    } finally {
      setBusy('')
    }
  }

  return (
    <Drawer
      title={isNew ? 'Add applicant' : form.full_name || 'Applicant'}
      onClose={onClose}
      footer={
        <>
          {!isNew && (
            <button type="button" className="sa-btn sa-btn-danger" onClick={archive}
              disabled={busy === 'archive'} style={{ marginRight: 'auto' }}>
              <span className="material-symbols-outlined" aria-hidden="true">archive</span>
              Archive
            </button>
          )}
          <button type="button" className="sa-btn sa-btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" form="applicant-form" className="sa-btn sa-btn-primary" disabled={busy === 'save'}>
            <span className="material-symbols-outlined" aria-hidden="true">save</span>
            {busy === 'save' ? 'Saving…' : isNew ? 'Create' : 'Save'}
          </button>
        </>
      }
    >
      <form id="applicant-form" onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
        <SaveError error={error} />
        <Field label="Full name">
          <input className="sa-input" value={form.full_name} onChange={e => set('full_name', e.target.value)} required />
        </Field>
        <Field label="Role applied for">
          <input className="sa-input" value={form.role_applied} onChange={e => set('role_applied', e.target.value)}
            placeholder="Teacher — business English" required />
        </Field>
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
          <Field label="Stage">
            <select className="sa-select" value={form.stage_id || ''} onChange={e => set('stage_id', e.target.value)}>
              <option value="">—</option>
              {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Status">
            <select className="sa-select" value={form.status} onChange={e => set('status', e.target.value)}>
              {APPLICANT_STATUS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Email">
            <input className="sa-input" type="email" value={form.email || ''} onChange={e => set('email', e.target.value)} />
          </Field>
          <Field label="Phone">
            <input className="sa-input" value={form.phone || ''} onChange={e => set('phone', e.target.value)} />
          </Field>
          <Field label="Source">
            <input className="sa-input" value={form.source || ''} onChange={e => set('source', e.target.value)} placeholder="OLX, referral, website" />
          </Field>
          <Field label="Applied on">
            <input className="sa-input" type="date" value={form.applied_date || ''} onChange={e => set('applied_date', e.target.value)} />
          </Field>
          <Field label="Country" hint="Two-letter code">
            <input className="sa-input" maxLength={2} value={form.country || ''} onChange={e => set('country', e.target.value.toUpperCase())} />
          </Field>
          <Field label="Locale">
            <input className="sa-input" value={form.locale || ''} onChange={e => set('locale', e.target.value)} placeholder="pl" />
          </Field>
          <Field label="Rating" hint="1 to 5">
            <input className="sa-input" type="number" min={1} max={5} value={form.rating || ''}
              onChange={e => set('rating', e.target.value)} />
          </Field>
          <Field label="Owner">
            <select className="sa-select" value={form.owner_id || ''} onChange={e => set('owner_id', e.target.value)}>
              <option value="">—</option>
              {owners.map(o => <option key={o.id} value={o.id}>{o.full_name}</option>)}
            </select>
          </Field>
        </div>
        <Field label="CV path" hint="Where the CV was filed on the server">
          <input className="sa-input" value={form.cv_path || ''} onChange={e => set('cv_path', e.target.value)} />
        </Field>
        {form.status === 'rejected' && (
          <Field label="Rejection reason">
            <input className="sa-input" value={form.rejected_reason || ''} onChange={e => set('rejected_reason', e.target.value)} />
          </Field>
        )}
        <Field label="Notes">
          <textarea className="sa-input sa-textarea" rows={3} value={form.notes || ''} onChange={e => set('notes', e.target.value)} />
        </Field>
        {!isNew && (
          <p style={{ margin: 0, fontSize: 'var(--sa-fs-micro)', color: 'var(--sa-text-muted)' }}>
            Added {fmtDate(applicant.created_at)}
          </p>
        )}
      </form>
    </Drawer>
  )
}
