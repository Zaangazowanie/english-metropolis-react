// CrmShared — the pieces Contacts, Companies and Pipeline all need.
//
// Everything visual here is an sa-* primitive from console.css; this file adds
// behaviour (focus trap, sort state, list paging, activity timeline), not a
// second design system. Zero raw hex: colour only ever arrives as var(--sa-*).

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { bizCreate, bizDelete, bizList, bizUpdate, formatEpoch, nowEpoch } from './crmApi.js'
import { ConsoleErrorPanel, ConsoleNotLive, ConsoleSkeleton } from './ConsoleStates.jsx'

/* ────────────────────────────── data hooks ─────────────────────────────── */

// One list, paged by the backend's keyset cursor. `params` is compared by
// value, so screens can build it inline without memoising.
export function useBizList(entity, params) {
  const key = JSON.stringify(params || {})
  const [state, setState] = useState({ status: 'loading', rows: [], total: 0, cursor: null, error: null })
  const [moreBusy, setMoreBusy] = useState(false)
  const [moreError, setMoreError] = useState('')
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let alive = true
    setState(s => ({ ...s, status: 'loading' }))
    setMoreError('')
    bizList(entity, JSON.parse(key))
      .then(d => {
        if (alive) setState({ status: 'ready', rows: d.rows, total: d.total, cursor: d.nextCursor, error: null })
      })
      .catch(e => {
        if (alive) setState({ status: 'error', rows: [], total: 0, cursor: null, error: e })
      })
    return () => { alive = false }
  }, [entity, key, nonce])

  const reload = useCallback(() => setNonce(n => n + 1), [])

  const loadMore = useCallback(async () => {
    if (!state.cursor || moreBusy) return
    setMoreBusy(true)
    setMoreError('')
    try {
      const d = await bizList(entity, { ...JSON.parse(key), cursor: state.cursor })
      setState(s => ({ ...s, rows: [...s.rows, ...d.rows], total: d.total, cursor: d.nextCursor }))
    } catch (e) {
      setMoreError(e.message || 'Could not load more rows')
    } finally {
      setMoreBusy(false)
    }
  }, [entity, key, state.cursor, moreBusy])

  return { ...state, reload, loadMore, moreBusy, moreError }
}

// Reference lists behind selects (companies, contacts, team members, stages).
// A reference list that is empty or not live yet must not blank the screen it
// decorates, so failures resolve to [] and the screen's own error path owns
// the loud reporting.
export function useRefList(entity, params) {
  const key = JSON.stringify(params || {})
  const [rows, setRows] = useState([])
  useEffect(() => {
    let alive = true
    bizList(entity, JSON.parse(key))
      .then(d => { if (alive) setRows(d.rows) })
      .catch(() => { if (alive) setRows([]) })
    return () => { alive = false }
  }, [entity, key])
  return rows
}

// Debounced text, so typing in the search box does not fire a request a keystroke.
export function useDebounced(value, delay = 250) {
  const [out, setOut] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setOut(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return out
}

/* ─────────────────────────────── list states ───────────────────────────── */

// The three states every list screen owes the operator, in one place:
// real skeleton, real 404/notLive explainer, real error with retry.
export function ListState({ status, error, endpoint, onRetry, skeletonRows = 8 }) {
  if (status === 'loading') return <ConsoleSkeleton rows={skeletonRows} />
  if (status === 'error') {
    if (error?.notLive) return <ConsoleNotLive endpoint={endpoint} />
    return <ConsoleErrorPanel error={error} onRetry={onRetry} />
  }
  return null
}

/* ──────────────────────────────── sorting ──────────────────────────────── */

// `sort` is the backend's own spec: "name" ascending, "-created_at" descending.
export function SortTh({ column, label, sort, onSort, align, width }) {
  const active = sort === column || sort === `-${column}`
  const desc = sort === `-${column}`
  return (
    <th
      className="sa-th-sortable"
      aria-sort={active ? (desc ? 'descending' : 'ascending') : 'none'}
      style={{ textAlign: align || 'left', width }}
    >
      <button
        type="button"
        onClick={() => onSort(active && !desc ? `-${column}` : column)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 3, padding: 0,
          background: 'none', border: 0, font: 'inherit', letterSpacing: 'inherit',
          color: active ? 'var(--sa-text)' : 'inherit', cursor: 'pointer',
        }}
      >
        {label}
        <span
          className="material-symbols-outlined"
          aria-hidden="true"
          style={{ fontSize: 14, opacity: active ? 1 : 0.35 }}
        >
          {active && desc ? 'arrow_downward' : 'arrow_upward'}
        </span>
      </button>
    </th>
  )
}

/* ──────────────────────────────── drawer ───────────────────────────────── */

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

// Right-hand drawer used for every create/edit in CRM. Esc closes, Tab is
// trapped inside, focus returns to whatever opened it.
export function CrmDrawer({ title, subtitle, onClose, children, footer, width = 560 }) {
  const panel = useRef(null)
  const returnTo = useRef(null)
  const labelId = useId()

  useEffect(() => {
    returnTo.current = document.activeElement
    const first = panel.current?.querySelector(FOCUSABLE)
    if (first) first.focus()
    else panel.current?.focus()
    return () => {
      const el = returnTo.current
      if (el && typeof el.focus === 'function' && document.contains(el)) el.focus()
    }
  }, [])

  const onKeyDown = e => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      onClose()
      return
    }
    if (e.key !== 'Tab') return
    const items = [...(panel.current?.querySelectorAll(FOCUSABLE) || [])].filter(n => n.offsetParent !== null)
    if (!items.length) return
    const first = items[0]
    const last = items[items.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  return (
    <>
      <div className="sa-scrim" onClick={onClose} aria-hidden="true" />
      <aside
        className="sa-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelId}
        ref={panel}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        style={{ width: `min(${width}px, 100vw)` }}
      >
        <header className="sa-drawer-header">
          <div style={{ minWidth: 0 }}>
            <p id={labelId} style={{ margin: 0, fontWeight: 600 }}>{title}</p>
            {subtitle && (
              <p style={{ margin: '2px 0 0', fontSize: 'var(--sa-fs-small)', color: 'var(--sa-text-muted)', fontWeight: 400 }}>
                {subtitle}
              </p>
            )}
          </div>
          <button type="button" className="sa-icon-btn" onClick={onClose} aria-label="Close">
            <span className="material-symbols-outlined" aria-hidden="true">close</span>
          </button>
        </header>
        <div className="sa-drawer-body">{children}</div>
        {footer && <div className="sa-drawer-footer">{footer}</div>}
      </aside>
    </>
  )
}

/* ──────────────────────────────── fields ───────────────────────────────── */

export function Field({ label, hint, error, required, children }) {
  const id = useId()
  const child = typeof children === 'function' ? children(id) : children
  return (
    <div style={{ marginBottom: 2 }}>
      <div className="sa-field-row">
        <label className="sa-field-label" htmlFor={id}>
          {label}{required && <span style={{ color: 'var(--sa-bad)' }} aria-hidden="true"> *</span>}
        </label>
        {child}
      </div>
      {(hint || error) && (
        <p style={{
          margin: '-4px 0 6px', paddingLeft: 170, fontSize: 'var(--sa-fs-micro)',
          color: error ? 'var(--sa-bad)' : 'var(--sa-text-muted)',
        }}>
          {error || hint}
        </p>
      )}
    </div>
  )
}

export function TextField({ label, value, onChange, hint, error, required, type = 'text', placeholder, ...rest }) {
  return (
    <Field label={label} hint={hint} error={error} required={required}>
      {id => (
        <input
          id={id}
          className="sa-input"
          type={type}
          value={value ?? ''}
          placeholder={placeholder}
          aria-invalid={error ? 'true' : undefined}
          onChange={e => onChange(e.target.value)}
          {...rest}
        />
      )}
    </Field>
  )
}

export function SelectField({ label, value, onChange, options, hint, error, required, placeholder = '—' }) {
  return (
    <Field label={label} hint={hint} error={error} required={required}>
      {id => (
        <select
          id={id}
          className="sa-select"
          value={value ?? ''}
          aria-invalid={error ? 'true' : undefined}
          onChange={e => onChange(e.target.value)}
        >
          <option value="">{placeholder}</option>
          {options.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      )}
    </Field>
  )
}

export function TextAreaField({ label, value, onChange, hint, rows }) {
  return (
    <Field label={label} hint={hint}>
      {id => (
        <textarea
          id={id}
          className="sa-input sa-textarea"
          rows={rows}
          value={value ?? ''}
          onChange={e => onChange(e.target.value)}
        />
      )}
    </Field>
  )
}

export function FormSection({ title, children, note }) {
  return (
    <section style={{ marginTop: 18 }}>
      <h3 style={{
        margin: '0 0 6px', fontSize: 'var(--sa-fs-small)', fontWeight: 700,
        color: 'var(--sa-text)',
      }}>
        {title}
      </h3>
      {note && (
        <p style={{ margin: '0 0 8px', fontSize: 'var(--sa-fs-micro)', color: 'var(--sa-text-muted)', lineHeight: 1.5 }}>
          {note}
        </p>
      )}
      {children}
    </section>
  )
}

// One inline, non-blocking place for a failed write to land.
export function WriteError({ error }) {
  if (!error) return null
  return (
    <p role="alert" style={{
      margin: '10px 0 0', padding: '8px 10px', borderRadius: 10,
      background: 'var(--sa-bad-soft)', color: 'var(--sa-bad)',
      fontSize: 'var(--sa-fs-small)', fontWeight: 600,
    }}>
      {error}
    </p>
  )
}

/* ─────────────────────────────── activities ────────────────────────────── */

const ACTIVITY_KINDS = [
  { value: 'call', label: 'Call', icon: 'call' },
  { value: 'email', label: 'Email', icon: 'mail' },
  { value: 'meeting', label: 'Meeting', icon: 'groups' },
  { value: 'note', label: 'Note', icon: 'sticky_note_2' },
  { value: 'task', label: 'Task', icon: 'task_alt' },
  { value: 'demo_lesson', label: 'Demo lesson', icon: 'school' },
]

const KIND_ICON = Object.fromEntries(ACTIVITY_KINDS.map(k => [k.value, k.icon]))

// Timeline for one CRM row. `entityType` is the schema's own vocabulary:
// contact | company | deal | lead | applicant.
export function ActivityPanel({ entityType, entityId }) {
  const list = useBizList('activities', {
    entity_type: entityType,
    entity_id: entityId,
    sort: '-created_at',
    limit: 25,
  })
  const [kind, setKind] = useState('note')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [direction, setDirection] = useState('outbound')
  const [dueAt, setDueAt] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const isTask = kind === 'task'
  const hasDirection = kind === 'call' || kind === 'email'

  async function log(e) {
    e.preventDefault()
    if (!subject.trim() || busy) return
    setBusy(true)
    setError('')
    try {
      await bizCreate('activities', {
        kind,
        subject: subject.trim(),
        body: body.trim() || null,
        entity_type: entityType,
        entity_id: entityId,
        direction: hasDirection ? direction : null,
        due_at: isTask && dueAt ? Math.floor(Date.parse(`${dueAt}T09:00:00`) / 1000) : null,
        completed_at: isTask ? null : nowEpoch(),
      })
      setSubject('')
      setBody('')
      setDueAt('')
      list.reload()
    } catch (err) {
      setError(err.message || 'Could not log this activity')
    } finally {
      setBusy(false)
    }
  }

  async function complete(row) {
    try {
      await bizUpdate('activities', row.id, { completed_at: nowEpoch() })
      list.reload()
    } catch (err) {
      setError(err.message || 'Could not update this activity')
    }
  }

  async function remove(row) {
    try {
      await bizDelete('activities', row.id)
      list.reload()
    } catch (err) {
      setError(err.message || 'Could not delete this activity')
    }
  }

  return (
    <FormSection title={`Activity${list.status === 'ready' && list.total ? ` · ${list.total}` : ''}`}>
      <form onSubmit={log} style={{ display: 'grid', gap: 6 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <select
            className="sa-select"
            value={kind}
            onChange={e => setKind(e.target.value)}
            aria-label="Activity kind"
            style={{ width: 'auto', minWidth: 130 }}
          >
            {ACTIVITY_KINDS.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
          </select>
          {hasDirection && (
            <select
              className="sa-select"
              value={direction}
              onChange={e => setDirection(e.target.value)}
              aria-label="Direction"
              style={{ width: 'auto', minWidth: 110 }}
            >
              <option value="outbound">Outbound</option>
              <option value="inbound">Inbound</option>
            </select>
          )}
          {isTask && (
            <input
              className="sa-input"
              type="date"
              value={dueAt}
              onChange={e => setDueAt(e.target.value)}
              aria-label="Due date"
              style={{ width: 'auto' }}
            />
          )}
          <input
            className="sa-input"
            value={subject}
            onChange={e => setSubject(e.target.value)}
            placeholder="What happened?"
            aria-label="Activity subject"
            style={{ flex: '1 1 180px', minWidth: 0 }}
          />
          <button type="submit" className="sa-btn sa-btn-primary" disabled={!subject.trim() || busy}>
            {busy ? 'Saving…' : 'Log'}
          </button>
        </div>
        <textarea
          className="sa-input sa-textarea"
          style={{ minHeight: 56 }}
          rows={2}
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder="Detail (optional)"
          aria-label="Activity detail"
        />
      </form>

      <WriteError error={error || list.moreError} />

      <div style={{ marginTop: 10 }}>
        {list.status === 'loading' && <ConsoleSkeleton rows={2} label="Loading activity…" />}
        {list.status === 'error' && !list.error?.notLive && (
          <ConsoleErrorPanel error={list.error} onRetry={list.reload} />
        )}
        {list.status === 'ready' && !list.rows.length && (
          <p style={{ margin: 0, fontSize: 'var(--sa-fs-small)', color: 'var(--sa-text-muted)' }}>
            Nothing logged yet. Calls, emails, meetings and notes recorded here become the history
            behind this record.
          </p>
        )}
        {list.status === 'ready' && list.rows.map(a => (
          <div
            key={a.id}
            style={{
              display: 'flex', gap: 8, alignItems: 'flex-start',
              padding: '8px 0', borderTop: '1px solid var(--sa-border)',
            }}
          >
            <span
              className="material-symbols-outlined"
              aria-hidden="true"
              style={{ fontSize: 16, color: 'var(--sa-text-muted)', marginTop: 1 }}
            >
              {KIND_ICON[a.kind] || 'circle'}
            </span>
            <div style={{ minWidth: 0, flex: '1 1 auto' }}>
              <p style={{ margin: 0, fontWeight: 600 }}>{a.subject}</p>
              {a.body && (
                <p style={{ margin: '2px 0 0', color: 'var(--sa-text-muted)', lineHeight: 1.5 }}>{a.body}</p>
              )}
              <p style={{ margin: '2px 0 0', fontSize: 'var(--sa-fs-micro)', color: 'var(--sa-text-muted)' }}>
                <span className="sa-num">{formatEpoch(a.completed_at || a.created_at, true)}</span>
                {a.direction ? ` · ${a.direction}` : ''}
                {a.kind === 'task' && !a.completed_at
                  ? ` · open${a.due_at ? `, due ${formatEpoch(a.due_at)}` : ''}`
                  : ''}
              </p>
            </div>
            {a.kind === 'task' && !a.completed_at && (
              <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" onClick={() => complete(a)}>
                Done
              </button>
            )}
            <button
              type="button"
              className="sa-icon-btn sa-icon-btn-sm"
              onClick={() => remove(a)}
              aria-label={`Delete activity: ${a.subject}`}
            >
              <span className="material-symbols-outlined" aria-hidden="true">delete</span>
            </button>
          </div>
        ))}
        {list.status === 'ready' && list.cursor && (
          <button
            type="button"
            className="sa-btn sa-btn-ghost sa-btn-sm"
            style={{ marginTop: 8 }}
            onClick={list.loadMore}
            disabled={list.moreBusy}
          >
            {list.moreBusy ? 'Loading…' : 'Older activity'}
          </button>
        )}
      </div>
    </FormSection>
  )
}

/* ────────────────────────────── small helpers ──────────────────────────── */

export function RelatedList({ title, rows, render, emptyHint }) {
  return (
    <FormSection title={title}>
      {!rows.length
        ? <p style={{ margin: 0, fontSize: 'var(--sa-fs-small)', color: 'var(--sa-text-muted)' }}>{emptyHint}</p>
        : (
          <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
            {rows.map(r => (
              <li key={r.id} style={{ padding: '6px 0', borderTop: '1px solid var(--sa-border)' }}>{render(r)}</li>
            ))}
          </ul>
        )}
    </FormSection>
  )
}

// "showing 25 of 1 284" — the count line every list toolbar carries.
export function CountNote({ shown, total, noun }) {
  return (
    <span className="sa-toolbar-count">
      {shown === total ? `${total} ${noun}` : `showing ${shown} of ${total} ${noun}`}
    </span>
  )
}

// A count the backend computed, not one inferred from the loaded page: the
// list endpoint returns `total` for the filter set, so limit=1 is enough.
export function useBizCount(entity, filters) {
  const key = JSON.stringify(filters || {})
  const [total, setTotal] = useState(null)
  useEffect(() => {
    let alive = true
    bizList(entity, { ...JSON.parse(key), limit: 1 })
      .then(d => { if (alive) setTotal(d.total) })
      .catch(() => { if (alive) setTotal(null) })
    return () => { alive = false }
  }, [entity, key])
  return total
}

// Confirm / prompt dialog built on the .sa-modal primitive. Used for deletes
// and for the one field a stage move can require (a lost reason).
export function ConfirmDialog({ title, body, confirmLabel = 'Confirm', danger, busy, onConfirm, onCancel }) {
  const panel = useRef(null)
  const labelId = useId()

  useEffect(() => {
    const first = panel.current?.querySelector(FOCUSABLE)
    if (first) first.focus()
    else panel.current?.focus()
  }, [])

  const onKeyDown = e => {
    if (e.key === 'Escape') { e.stopPropagation(); onCancel() }
    if (e.key !== 'Tab') return
    const items = [...(panel.current?.querySelectorAll(FOCUSABLE) || [])].filter(n => n.offsetParent !== null)
    if (!items.length) return
    const first = items[0]
    const last = items[items.length - 1]
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  }

  return (
    <>
      <div className="sa-scrim" onClick={onCancel} aria-hidden="true" style={{ zIndex: 70 }} />
      <div
        className="sa-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelId}
        ref={panel}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        style={{ zIndex: 71 }}
      >
        <div className="sa-modal-header"><span id={labelId}>{title}</span></div>
        <div className="sa-modal-body">{body}</div>
        <div className="sa-modal-footer">
          <button type="button" className="sa-btn sa-btn-ghost" onClick={onCancel}>Cancel</button>
          <button
            type="button"
            className={danger ? 'sa-btn sa-btn-danger' : 'sa-btn sa-btn-primary'}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </>
  )
}

// '' → null so a CHECK-constrained TEXT column never receives an empty string.
export const nz = v => {
  const s = typeof v === 'string' ? v.trim() : v
  return s === '' || s === undefined ? null : s
}

// A date input ('2026-09-01') into the epoch seconds the schema stores. Noon
// local, so a timezone shift can never move the record to the previous day.
export const dayToEpoch = day =>
  (day ? Math.floor(Date.parse(`${day}T12:00:00`) / 1000) : null)
