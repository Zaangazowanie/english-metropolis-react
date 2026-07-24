// ConsoleSequences — CRUD over em-business.db `sequences` + `sequence_steps`.
//
// Schema (SCHEMA_COMMS, /root/em-console-api/em_business.py):
//   sequences      key+locale unique while live, channel is email only,
//                  status draft|active|paused|archived, daily_cap 0..200,
//                  min_gap_min >= 0, stop_on_reply 0/1.
//   sequence_steps sequence_id, position (unique per sequence while live),
//                  template_id, delay_days, delay_hours 0..23, condition_json,
//                  active 0/1.
//
// The pacing guard is not a preference. em_mail.py enforces max 10 sends per
// rolling 24h and a 15-minute gap on EVERY send path, so a sequence asking for
// more is shown as such rather than quietly believed. Sending itself is inert
// until EM_MAIL_SEND_ENABLED is set, which is Mike's call, not this screen's.
//
// The tables ship EMPTY and that is correct. Nothing is ever seeded or mocked.

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  bizCreate, bizDelete, bizList, bizPath, bizRestore, bizUpdate,
  formatCount, formatDelay, formatStamp, PACING,
} from './commsApi.js'
import { ConsoleEmpty, ConsoleErrorPanel, ConsoleNotLive, ConsoleSkeleton } from './ConsoleStates.jsx'
import { ConfirmModal, Field, LocaleBadge, PolicyNote, SaDrawer, SortTh, WriteNote } from './CommsShared.jsx'

const ENTITY = 'sequences'
const STEPS = 'sequence_steps'
const TEMPLATES = 'email_templates'
const PAGE = 50

const STATUSES = ['draft', 'active', 'paused', 'archived']
const LOCALES = ['pl', 'en']
const STATUS_BADGE = {
  draft: 'sa-badge',
  active: 'sa-badge sa-badge-committed',
  paused: 'sa-badge sa-badge-awaiting_review',
  archived: 'sa-badge sa-badge-failed',
}

const BLANK = {
  key: '', name: '', locale: 'pl', status: 'draft', from_email: '', description: '',
  daily_cap: PACING.dailyCap, min_gap_min: PACING.minGapMinutes, stop_on_reply: 1,
}

export default function ConsoleSequences() {
  const [sort, setSort] = useState('name')
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [showDeleted, setShowDeleted] = useState(false)

  const [token, setToken] = useState(0)             // reload button
  const [result, setResult] = useState(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [stepCounts, setStepCounts] = useState(null)   // null = not known yet

  const [editing, setEditing] = useState(null)
  const [confirm, setConfirm] = useState(null)

  const params = useMemo(() => ({
    sort,
    limit: PAGE,
    q: search || undefined,
    status: status || undefined,
    include_deleted: showDeleted ? 1 : undefined,
  }), [sort, search, status, showDeleted])

  // See ConsoleTemplates: the request object identifies one fetch, so a late
  // response for an older filter can never be rendered.
  const request = useMemo(() => ({ params, token }), [params, token])

  useEffect(() => {
    let alive = true
    bizList(ENTITY, request.params)
      .then(data => {
        if (alive) setResult({
          request,
          rows: data.rows || [],
          total: typeof data.total === 'number' ? data.total : null,
          cursor: data.next_cursor || null,
          error: null,
        })
      })
      .catch(err => { if (alive) setResult({ request, rows: [], total: null, cursor: null, error: err }) })

    // One grouped read instead of a request per row. If it fails the column
    // shows "—" rather than a made-up zero.
    bizList(STEPS, { limit: 200, sort: 'position' })
      .then(data => {
        if (!alive) return
        const counts = {}
        ;(data.rows || []).forEach(step => {
          counts[step.sequence_id] = (counts[step.sequence_id] || 0) + 1
        })
        setStepCounts(counts)
      })
      .catch(() => { if (alive) setStepCounts(null) })

    return () => { alive = false }
  }, [request])

  const current = result?.request === request ? result : null
  const rows = current ? current.rows : null
  const total = current ? current.total : null
  const cursor = current ? current.cursor : null
  const error = current ? current.error : null
  const load = useCallback(() => setToken(value => value + 1), [])

  const patchResult = patch =>
    setResult(previous => (previous && previous.request === request ? { ...previous, ...patch(previous) } : previous))

  function loadMore() {
    if (!cursor) return
    setLoadingMore(true)
    bizList(ENTITY, { ...params, cursor })
      .then(data => patchResult(previous => ({
        rows: [...previous.rows, ...(data.rows || [])],
        cursor: data.next_cursor || null,
      })))
      .catch(err => patchResult(() => ({ error: err })))
      .finally(() => setLoadingMore(false))
  }

  async function removeSequence() {
    if (!confirm) return
    setConfirm({ ...confirm, busy: true })
    try {
      await bizDelete(ENTITY, confirm.id)
      setConfirm(null)
      load()
    } catch (err) {
      setConfirm({ ...confirm, busy: false, error: err.message })
    }
  }

  async function restore(row) {
    try {
      await bizRestore(ENTITY, row.id)
      load()
    } catch (err) {
      patchResult(() => ({ error: err }))
    }
  }

  return (
    <>
      <div className="sa-page-header">
        <div>
          <h1>Sequences</h1>
          <p>
            Multi-step outreach: an ordered list of templates, each with a delay. Steps are what the sender
            walks; the pacing guard is what decides whether it may walk them at all.
          </p>
        </div>
        <div className="sa-page-header-actions">
          <button type="button" className="sa-btn sa-btn-primary" onClick={() => setEditing({ ...BLANK })}>
            <span className="material-symbols-outlined" aria-hidden="true">add</span>
            New sequence
          </button>
        </div>
      </div>

      <PolicyNote icon="policy" title="Outreach pacing — enforced by the sender, not by this screen">
        Max <strong>{PACING.dailyCap} sends per rolling 24 hours</strong> and at least{' '}
        <strong>{PACING.minGapMinutes} minutes</strong> between any two, across every mailbox and every kind of
        send. A sequence may ask for less; asking for more changes nothing. Sending is inert until it is
        explicitly enabled, so a sequence saved here queues nothing today.
      </PolicyNote>

      <div className="sa-toolbar" style={{ marginTop: 12 }}>
        <form onSubmit={event => { event.preventDefault(); setSearch(query.trim()) }} style={{ display: 'flex', gap: 6 }}>
          <label className="sa-sr-only" htmlFor="seq-q">Search sequences</label>
          <input id="seq-q" type="search" className="sa-input" placeholder="Search name, key, description…"
            value={query} onChange={event => setQuery(event.target.value)} />
          <button type="submit" className="sa-btn sa-btn-ghost">Search</button>
        </form>

        <label className="sa-sr-only" htmlFor="seq-status">Status</label>
        <select id="seq-status" className="sa-select" value={status} onChange={event => setStatus(event.target.value)}>
          <option value="">All statuses</option>
          {STATUSES.map(name => <option key={name} value={name}>{name}</option>)}
        </select>

        <label className="sa-checkbox">
          <input type="checkbox" checked={showDeleted} onChange={event => setShowDeleted(event.target.checked)} />
          Show deleted
        </label>

        <span className="sa-toolbar-spacer" />
        <span className="sa-toolbar-count">
          {rows === null ? 'Loading…' : `${formatCount(rows.length)} shown${total === null ? '' : ` of ${formatCount(total)}`}`}
        </span>
        <button type="button" className="sa-icon-btn" onClick={load} aria-label="Reload sequences">
          <span className="material-symbols-outlined" aria-hidden="true">refresh</span>
        </button>
      </div>

      <div className="sa-card" style={{ marginTop: 12 }}>
        {error ? (
          <div style={{ padding: 12 }}>
            {error.notLive ? <ConsoleNotLive endpoint={bizPath(ENTITY)} /> : <ConsoleErrorPanel error={error} onRetry={load} />}
          </div>
        ) : rows === null ? (
          <ConsoleSkeleton rows={8} label="Loading sequences…" />
        ) : !rows.length ? (
          <ConsoleEmpty
            icon="forward_to_inbox"
            title={search || status ? 'No sequence matches these filters' : 'No sequences yet'}
            hint={
              search || status ? (
                <p>Clear the search and filters to see every sequence.</p>
              ) : (
                <>
                  <p>
                    A sequence is a named, ordered plan: step 1 goes out immediately, step 2 three days later
                    if nobody replied, and so on. It is how a corporate enquiry gets followed up without
                    anyone remembering to.
                  </p>
                  <p style={{ marginTop: '0.5rem' }}>
                    Write the templates first, then create a sequence here and attach one template per step.
                    Keep it to a handful of steps: the guard allows {PACING.dailyCap} sends a day in total.
                  </p>
                </>
              )
            }
            action={
              <button type="button" className="sa-btn sa-btn-primary" onClick={() => setEditing({ ...BLANK })}>
                <span className="material-symbols-outlined" aria-hidden="true">add</span>
                New sequence
              </button>
            }
          />
        ) : (
          <>
            <div className="sa-table-wrap">
              <table className="sa-table">
                <caption className="sa-sr-only">Outreach sequences</caption>
                <thead>
                  <tr>
                    <SortTh col="name" label="Name" sort={sort} onSort={setSort} />
                    <SortTh col="key" label="Key" sort={sort} onSort={setSort} />
                    <SortTh col="locale" label="Locale" sort={sort} onSort={setSort} />
                    <SortTh col="status" label="Status" sort={sort} onSort={setSort} />
                    <th scope="col" style={{ textAlign: 'right' }}>Steps</th>
                    <SortTh col="daily_cap" label="Daily cap" sort={sort} onSort={setSort} align="right" />
                    <SortTh col="min_gap_min" label="Min gap" sort={sort} onSort={setSort} align="right" />
                    <th scope="col">On reply</th>
                    <SortTh col="updated_at" label="Updated" sort={sort} onSort={setSort} align="right" />
                    <th scope="col"><span className="sa-sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(row => {
                    const overCap = Number(row.daily_cap) > PACING.dailyCap
                    const underGap = Number(row.min_gap_min) < PACING.minGapMinutes
                    return (
                      <tr key={row.id}>
                        <td style={{ fontWeight: 600 }}>{row.name}</td>
                        <td style={{ color: 'var(--sa-text-muted)' }}>{row.key}</td>
                        <td><LocaleBadge locale={row.locale} /></td>
                        <td>
                          {row.deleted_at
                            ? <span className="sa-badge sa-badge-failed">deleted</span>
                            : <span className={STATUS_BADGE[row.status] || 'sa-badge'}>{row.status}</span>}
                        </td>
                        <td className="sa-num">
                          {stepCounts === null ? '—' : formatCount(stepCounts[row.id] || 0)}
                        </td>
                        <td className="sa-num" style={overCap ? { color: 'var(--sa-warm-ink)', fontWeight: 700 } : undefined}
                          title={overCap ? `Above the platform guard of ${PACING.dailyCap}/day — the sender still caps at ${PACING.dailyCap}` : undefined}>
                          {formatCount(row.daily_cap)}
                        </td>
                        <td className="sa-num" style={underGap ? { color: 'var(--sa-warm-ink)', fontWeight: 700 } : undefined}
                          title={underGap ? `Below the platform guard of ${PACING.minGapMinutes} min — the sender still waits ${PACING.minGapMinutes} min` : undefined}>
                          {formatCount(row.min_gap_min)} min
                        </td>
                        <td style={{ color: 'var(--sa-text-muted)' }}>{row.stop_on_reply ? 'stop' : 'continue'}</td>
                        <td className="sa-num">{formatStamp(row.updated_at)}</td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {row.deleted_at ? (
                            <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" onClick={() => restore(row)}>
                              Restore
                            </button>
                          ) : (
                            <>
                              <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" onClick={() => setEditing(row)}>
                                Open
                              </button>
                              <button type="button" className="sa-icon-btn sa-icon-btn-sm" style={{ marginLeft: 4 }}
                                onClick={() => setConfirm(row)} aria-label={`Delete sequence ${row.name}`}>
                                <span className="material-symbols-outlined" aria-hidden="true">delete</span>
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {cursor && (
              <div style={{ padding: 10, borderTop: '1px solid var(--sa-border)', textAlign: 'center' }}>
                <button type="button" className="sa-btn sa-btn-ghost" onClick={loadMore} disabled={loadingMore}>
                  {loadingMore ? 'Loading…' : 'Load more'}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <SequenceEditor
        sequence={editing}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); load() }}
      />

      <ConfirmModal
        open={Boolean(confirm)}
        title="Delete sequence"
        confirmLabel="Delete"
        busy={confirm?.busy}
        onClose={() => setConfirm(null)}
        onConfirm={removeSequence}
        body={
          <>
            <p style={{ margin: 0 }}>
              <strong>{confirm?.name}</strong> ({confirm?.key}) will be soft-deleted. Its steps stay in the
              database and come back with it if you restore it from the &ldquo;Show deleted&rdquo; filter.
            </p>
            {confirm?.error && (
              <p style={{ margin: '8px 0 0', color: 'var(--sa-bad)', fontWeight: 600 }}>{confirm.error}</p>
            )}
          </>
        }
      />
    </>
  )
}

/* ───────────────────────────────────────────────── sequence editor ──────── */

function SequenceEditor({ sequence, onClose, onSaved }) {
  const [form, setForm] = useState(BLANK)
  const [note, setNote] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!sequence) return
    setForm({
      key: sequence.key || '', name: sequence.name || '', locale: sequence.locale || 'pl',
      status: sequence.status || 'draft', from_email: sequence.from_email || '',
      description: sequence.description || '',
      daily_cap: sequence.daily_cap ?? PACING.dailyCap,
      min_gap_min: sequence.min_gap_min ?? PACING.minGapMinutes,
      stop_on_reply: sequence.stop_on_reply === 0 ? 0 : 1,
    })
    setNote(null)
  }, [sequence])

  const set = (field, value) => setForm(current => ({ ...current, [field]: value }))
  const isNew = sequence && !sequence.id

  async function save() {
    if (!String(form.key).trim()) { setNote({ ok: false, text: 'Key is required.' }); return }
    if (!String(form.name).trim()) { setNote({ ok: false, text: 'Name is required.' }); return }
    setBusy(true)
    setNote(null)
    const payload = {
      key: String(form.key).trim(),
      name: String(form.name).trim(),
      locale: form.locale,
      status: form.status,
      from_email: String(form.from_email).trim() || null,
      description: String(form.description).trim() || null,
      daily_cap: Number(form.daily_cap) || 0,
      min_gap_min: Number(form.min_gap_min) || 0,
      stop_on_reply: form.stop_on_reply,
    }
    try {
      if (isNew) {
        // Steps need an id, so a brand-new sequence saves and closes back to the
        // list; open it again to add steps.
        await bizCreate(ENTITY, payload)
        onSaved()
      } else {
        await bizUpdate(ENTITY, sequence.id, payload)
        setNote({ ok: true, text: 'Saved.' })
      }
    } catch (err) {
      setNote({ ok: false, text: err.message || 'Save failed' })
    } finally {
      setBusy(false)
    }
  }

  const overCap = Number(form.daily_cap) > PACING.dailyCap
  const underGap = Number(form.min_gap_min) < PACING.minGapMinutes

  return (
    <SaDrawer
      open={Boolean(sequence)}
      title={isNew ? 'New sequence' : `Sequence · ${sequence?.name || ''}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="sa-btn sa-btn-ghost" onClick={onClose}>Close</button>
          <button type="button" className="sa-btn sa-btn-primary" onClick={save} disabled={busy}>
            {busy ? 'Saving…' : isNew ? 'Create sequence' : 'Save changes'}
          </button>
        </>
      }
    >
      <WriteNote note={note} />

      <Field label="Key" htmlFor="s-key" hint="Unique per locale while the sequence is live.">
        <input id="s-key" className="sa-input" value={form.key} onChange={event => set('key', event.target.value)}
          placeholder="corporate_enquiry_followup" />
      </Field>
      <Field label="Name" htmlFor="s-name">
        <input id="s-name" className="sa-input" value={form.name} onChange={event => set('name', event.target.value)} />
      </Field>
      <Field label="Locale" htmlFor="s-locale">
        <select id="s-locale" className="sa-select" value={form.locale} onChange={event => set('locale', event.target.value)}>
          {LOCALES.map(code => <option key={code} value={code}>{code.toUpperCase()}</option>)}
        </select>
      </Field>
      <Field label="Status" htmlFor="s-status">
        <select id="s-status" className="sa-select" value={form.status} onChange={event => set('status', event.target.value)}>
          {STATUSES.map(name => <option key={name} value={name}>{name}</option>)}
        </select>
      </Field>
      <Field label="From email" htmlFor="s-from">
        <input id="s-from" type="email" className="sa-input" value={form.from_email}
          onChange={event => set('from_email', event.target.value)} placeholder="hello@englishmetro.com" />
      </Field>
      <Field label="Description" htmlFor="s-desc">
        <textarea id="s-desc" className="sa-input sa-textarea" style={{ minHeight: 72 }} value={form.description}
          onChange={event => set('description', event.target.value)} />
      </Field>
      <Field label="Daily cap" htmlFor="s-cap"
        hint={overCap
          ? `Above the platform guard. The sender still stops at ${PACING.dailyCap} per 24h.`
          : `Sends per rolling 24h. The platform guard is ${PACING.dailyCap}.`}>
        <input id="s-cap" type="number" min="0" max="200" className="sa-input sa-num" value={form.daily_cap}
          onChange={event => set('daily_cap', event.target.value)} />
      </Field>
      <Field label="Minimum gap" htmlFor="s-gap"
        hint={underGap
          ? `Below the platform guard. The sender still waits ${PACING.minGapMinutes} minutes.`
          : `Minutes between two sends. The platform guard is ${PACING.minGapMinutes}.`}>
        <input id="s-gap" type="number" min="0" className="sa-input sa-num" value={form.min_gap_min}
          onChange={event => set('min_gap_min', event.target.value)} />
      </Field>
      <Field label="On reply" htmlFor="s-stop">
        <label className="sa-checkbox">
          <input id="s-stop" type="checkbox" checked={form.stop_on_reply === 1}
            onChange={event => set('stop_on_reply', event.target.checked ? 1 : 0)} />
          Stop the sequence as soon as the contact replies
        </label>
      </Field>

      <div style={{ borderTop: '1px solid var(--sa-border)', margin: '14px 0 0', paddingTop: 12 }}>
        {isNew ? (
          <p style={{ margin: 0, fontSize: 'var(--sa-fs-small)', color: 'var(--sa-text-muted)' }}>
            Steps attach to a saved sequence. Create this one first, then open it again to add them.
          </p>
        ) : (
          <StepsEditor sequenceId={sequence.id} />
        )}
      </div>
    </SaDrawer>
  )
}

/* ────────────────────────────────────────────────────── steps ───────────── */

function StepsEditor({ sequenceId }) {
  const [token, setToken] = useState(0)
  const [result, setResult] = useState(null)
  const [templates, setTemplates] = useState([])
  const [note, setNote] = useState(null)
  const [adding, setAdding] = useState(false)

  const request = useMemo(() => ({ sequenceId, token }), [sequenceId, token])

  useEffect(() => {
    let alive = true
    bizList(STEPS, { sequence_id: request.sequenceId, sort: 'position', limit: 100 })
      .then(data => { if (alive) setResult({ request, steps: data.rows || [], error: null }) })
      .catch(err => { if (alive) setResult({ request, steps: [], error: err }) })
    return () => { alive = false }
  }, [request])

  useEffect(() => {
    let alive = true
    bizList(TEMPLATES, { limit: 200, sort: 'name', active: 1 })
      .then(data => { if (alive) setTemplates(data.rows || []) })
      .catch(() => { if (alive) setTemplates([]) })
    return () => { alive = false }
  }, [])

  const current = result?.request === request ? result : null
  const steps = current ? current.steps : null
  const error = current ? current.error : null
  const load = useCallback(() => setToken(value => value + 1), [])

  const nextPosition = useMemo(
    () => (steps || []).reduce((max, step) => Math.max(max, Number(step.position) || 0), 0) + 1,
    [steps],
  )

  async function addStep(draft) {
    setNote(null)
    try {
      await bizCreate(STEPS, { ...draft, sequence_id: sequenceId, position: nextPosition })
      setAdding(false)
      load()
    } catch (err) {
      setNote({ ok: false, text: err.message || 'Could not add the step' })
    }
  }

  async function saveStep(id, patch) {
    setNote(null)
    try {
      await bizUpdate(STEPS, id, patch)
      load()
    } catch (err) {
      setNote({ ok: false, text: err.message || 'Could not save the step' })
    }
  }

  async function deleteStep(id) {
    setNote(null)
    try {
      await bizDelete(STEPS, id)
      load()
    } catch (err) {
      setNote({ ok: false, text: err.message || 'Could not delete the step' })
    }
  }

  const templateName = id => {
    const found = templates.find(template => template.id === id)
    return found ? `${found.name} (${String(found.locale || '').toUpperCase()})` : id ? `#${id}` : '—'
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <p className="sa-stat-label" style={{ margin: 0, flex: '1 1 auto' }}>Steps</p>
        <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" onClick={() => setAdding(true)} disabled={adding}>
          <span className="material-symbols-outlined" aria-hidden="true">add</span>
          Add step
        </button>
      </div>

      <WriteNote note={note} />

      {error ? (
        error.notLive ? <ConsoleNotLive endpoint={bizPath(STEPS)} /> : <ConsoleErrorPanel error={error} onRetry={load} />
      ) : steps === null ? (
        <ConsoleSkeleton rows={3} label="Loading steps…" />
      ) : !steps.length && !adding ? (
        <ConsoleEmpty
          icon="format_list_numbered"
          title="No steps yet"
          hint={<p>A sequence with no steps sends nothing. Add step 1 with no delay, then space the rest out in days.</p>}
          action={
            <button type="button" className="sa-btn sa-btn-primary sa-btn-sm" onClick={() => setAdding(true)}>Add step</button>
          }
        />
      ) : (
        <div className="sa-table-wrap">
          <table className="sa-table">
            <caption className="sa-sr-only">Sequence steps</caption>
            <thead>
              <tr>
                <th scope="col" style={{ width: 44, textAlign: 'right' }}>#</th>
                <th scope="col">Delay</th>
                <th scope="col">Template</th>
                <th scope="col">State</th>
                <th scope="col"><span className="sa-sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {steps.map(step => (
                <StepRow
                  key={step.id}
                  step={step}
                  templates={templates}
                  templateName={templateName}
                  onSave={patch => saveStep(step.id, patch)}
                  onDelete={() => deleteStep(step.id)}
                />
              ))}
              {adding && (
                <StepDraftRow
                  position={nextPosition}
                  templates={templates}
                  onCancel={() => setAdding(false)}
                  onAdd={addStep}
                />
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function StepRow({ step, templates, templateName, onSave, onDelete }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(null)

  function begin() {
    setDraft({
      delay_days: step.delay_days ?? 0,
      delay_hours: step.delay_hours ?? 0,
      template_id: step.template_id ?? '',
      active: step.active === 0 ? 0 : 1,
    })
    setEditing(true)
  }

  if (!editing) {
    return (
      <tr>
        <td className="sa-num">{step.position}</td>
        <td>{formatDelay(step.delay_days, step.delay_hours)}</td>
        <td style={{ color: step.template_id ? 'var(--sa-text)' : 'var(--sa-text-muted)' }}>
          {templateName(step.template_id)}
          {step.condition_json && (
            <span className="sa-badge" style={{ marginLeft: 6 }} title={step.condition_json}>condition</span>
          )}
        </td>
        <td>
          {step.active
            ? <span className="sa-badge sa-badge-committed">active</span>
            : <span className="sa-badge">off</span>}
        </td>
        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
          <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" onClick={begin}>Edit</button>
          <button type="button" className="sa-icon-btn sa-icon-btn-sm" style={{ marginLeft: 4 }}
            onClick={onDelete} aria-label={`Delete step ${step.position}`}>
            <span className="material-symbols-outlined" aria-hidden="true">delete</span>
          </button>
        </td>
      </tr>
    )
  }

  return (
    <tr>
      <td className="sa-num">{step.position}</td>
      <td>
        <DelayInputs draft={draft} setDraft={setDraft} idPrefix={`step-${step.id}`} />
      </td>
      <td>
        <label className="sa-sr-only" htmlFor={`step-${step.id}-tpl`}>Template</label>
        <select id={`step-${step.id}-tpl`} className="sa-select" value={draft.template_id}
          onChange={event => setDraft({ ...draft, template_id: event.target.value })}>
          <option value="">(none yet)</option>
          {templates.map(template => (
            <option key={template.id} value={template.id}>
              {template.name} ({String(template.locale || '').toUpperCase()})
            </option>
          ))}
        </select>
      </td>
      <td>
        <label className="sa-checkbox">
          <input type="checkbox" checked={draft.active === 1}
            onChange={event => setDraft({ ...draft, active: event.target.checked ? 1 : 0 })} />
          Active
        </label>
      </td>
      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
        <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" onClick={() => setEditing(false)}>Cancel</button>
        <button type="button" className="sa-btn sa-btn-primary sa-btn-sm" style={{ marginLeft: 4 }}
          onClick={() => { setEditing(false); onSave(toStepPayload(draft)) }}>
          Save
        </button>
      </td>
    </tr>
  )
}

function StepDraftRow({ position, templates, onCancel, onAdd }) {
  const [draft, setDraft] = useState({ delay_days: 0, delay_hours: 0, template_id: '', active: 1 })
  return (
    <tr>
      <td className="sa-num">{position}</td>
      <td><DelayInputs draft={draft} setDraft={setDraft} idPrefix="step-new" /></td>
      <td>
        <label className="sa-sr-only" htmlFor="step-new-tpl">Template</label>
        <select id="step-new-tpl" className="sa-select" value={draft.template_id}
          onChange={event => setDraft({ ...draft, template_id: event.target.value })}>
          <option value="">(none yet)</option>
          {templates.map(template => (
            <option key={template.id} value={template.id}>
              {template.name} ({String(template.locale || '').toUpperCase()})
            </option>
          ))}
        </select>
      </td>
      <td>
        <label className="sa-checkbox">
          <input type="checkbox" checked={draft.active === 1}
            onChange={event => setDraft({ ...draft, active: event.target.checked ? 1 : 0 })} />
          Active
        </label>
      </td>
      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
        <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" onClick={onCancel}>Cancel</button>
        <button type="button" className="sa-btn sa-btn-primary sa-btn-sm" style={{ marginLeft: 4 }}
          onClick={() => onAdd(toStepPayload(draft))}>
          Add
        </button>
      </td>
    </tr>
  )
}

function DelayInputs({ draft, setDraft, idPrefix }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <label className="sa-sr-only" htmlFor={`${idPrefix}-days`}>Delay days</label>
      <input id={`${idPrefix}-days`} type="number" min="0" className="sa-input sa-num" style={{ width: 64 }}
        value={draft.delay_days} onChange={event => setDraft({ ...draft, delay_days: event.target.value })} />
      <span style={{ color: 'var(--sa-text-muted)' }}>d</span>
      <label className="sa-sr-only" htmlFor={`${idPrefix}-hours`}>Delay hours</label>
      <input id={`${idPrefix}-hours`} type="number" min="0" max="23" className="sa-input sa-num" style={{ width: 64 }}
        value={draft.delay_hours} onChange={event => setDraft({ ...draft, delay_hours: event.target.value })} />
      <span style={{ color: 'var(--sa-text-muted)' }}>h</span>
    </span>
  )
}

function toStepPayload(draft) {
  return {
    delay_days: Number(draft.delay_days) || 0,
    delay_hours: Number(draft.delay_hours) || 0,
    template_id: draft.template_id === '' ? null : Number(draft.template_id),
    active: draft.active,
  }
}
