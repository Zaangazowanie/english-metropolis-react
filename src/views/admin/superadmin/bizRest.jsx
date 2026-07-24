// bizRest — the frontend half of the generic business REST surface.
//
//   GET    /api/console/biz/<entity>            list  (filters, q, sort, limit, cursor)
//   GET    /api/console/biz/<entity>/<id>       get
//   POST   /api/console/biz/<entity>            create
//   PATCH  /api/console/biz/<entity>/<id>       update
//   DELETE /api/console/biz/<entity>/<id>       soft delete
//   POST   /api/console/biz/<entity>/<id>/restore
//
// Entities and columns are the tables in /root/em-console-api/em_business.py.
// A list answers { rows, total, next_cursor, sort, limit }.
//
// Error convention is the same one consoleApi.js documents, repeated here rather
// than imported because consoleApi.js is shared by every console screen and this
// module needs PATCH/DELETE, which that module deliberately does not expose:
//   404     -> error.notLive  (endpoint not flipped live yet — calm explainer)
//   401/403 -> error.denied   (session missing/expired, or wrong role)
// Writes never auto-retry; a replayed create would duplicate a row.
//
// NOTE ON THE TABLES BEING EMPTY: they are, and that is correct. Nothing in this
// module or its callers ever invents a row to fill a screen.

import { useCallback, useEffect, useState } from 'react'
import { getAdminSessionToken } from '../../../contexts/AdminAuthContext.jsx'

const BASE = '/api/console/biz'

export function bizError(status, path) {
  const notLive = status === 404
  const denied = status === 401 || status === 403
  const message = notLive
    ? `${path} is not live on the backend yet (404)`
    : status === 401
      ? 'Admin session missing or expired — please sign in again'
      : status === 403
        ? 'This console requires the super_admin role'
        : `${path} failed with ${status}`
  const err = new Error(message)
  err.status = status
  err.notLive = notLive
  err.denied = denied
  return err
}

function buildQuery(params) {
  const search = new URLSearchParams()
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    search.set(key, String(value))
  })
  const qs = search.toString()
  return qs ? `?${qs}` : ''
}

async function request(method, path, body) {
  const headers = {}
  const token = getAdminSessionToken()
  if (token) headers.Authorization = `Bearer ${token}`
  const init = { method, headers }
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(body)
  }
  const response = await fetch(path, init)
  if (!response.ok) throw bizError(response.status, path)
  const text = await response.text()
  return text ? JSON.parse(text) : null
}

const entPath = entity => `${BASE}/${encodeURIComponent(entity)}`
const rowPath = (entity, id) => `${entPath(entity)}/${encodeURIComponent(id)}`

export const bizList = (entity, params) => request('GET', `${entPath(entity)}${buildQuery(params)}`)
export const bizGet = (entity, id) => request('GET', rowPath(entity, id))
export const bizCreate = (entity, data) => request('POST', entPath(entity), data)
export const bizUpdate = (entity, id, data) => request('PATCH', rowPath(entity, id), data)
export const bizDelete = (entity, id) => request('DELETE', rowPath(entity, id))
export const bizRestore = (entity, id) => request('POST', `${rowPath(entity, id)}/restore`, {})

// Sub-resources that are not plain rows (page revisions: snapshot and restore).
export const bizPost = (path, body) => request('POST', `${BASE}${path}`, body || {})

// ── the one shared loading hook ─────────────────────────────────────────────
// Every list screen needs the same three states and the same reload. `params`
// is stringified into the dependency list so a caller can pass a literal.
export function useBizList(entity, params) {
  const key = JSON.stringify(params || {})
  const [tick, setTick] = useState(0)
  // The signature the state belongs to. A result from the previous filters is
  // not "loaded" for the current ones, so staleness is derived rather than
  // cleared with a setState in the effect body (which cascades a render).
  const sig = `${entity}|${key}|${tick}`
  const [state, setState] = useState({ sig: null, data: null, error: null })

  useEffect(() => {
    let alive = true
    bizList(entity, JSON.parse(key))
      .then(data => { if (alive) setState({ sig, data, error: null }) })
      .catch(error => { if (alive) setState({ sig, data: null, error }) })
    return () => { alive = false }
    // `sig` is these three joined; listing it too would be the same dependency twice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity, key, tick])

  const fresh = state.sig === sig
  const reload = useCallback(() => setTick(t => t + 1), [])
  return {
    rows: fresh ? state.data?.rows || null : null,
    total: fresh ? state.data?.total ?? null : null,
    error: fresh ? state.error : null,
    loading: !fresh || (!state.data && !state.error),
    reload,
  }
}

// ── formatting ──────────────────────────────────────────────────────────────
// Poland-first: pl-PL grouping and a comma decimal separator.

const DT = new Intl.DateTimeFormat('pl-PL', {
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
})
const D = new Intl.DateTimeFormat('pl-PL', { year: 'numeric', month: '2-digit', day: '2-digit' })

// Business rows carry unix SECONDS; HTTP Last-Modified parses to milliseconds.
export function fmtStamp(unixSeconds) {
  if (!unixSeconds && unixSeconds !== 0) return '—'
  return DT.format(new Date(Number(unixSeconds) * 1000))
}
export function fmtDate(value) {
  if (!value) return '—'
  const d = typeof value === 'number' ? new Date(value * 1000) : new Date(value)
  return Number.isNaN(d.getTime()) ? String(value) : D.format(d)
}
export function fmtMillis(ms) {
  if (!ms && ms !== 0) return '—'
  return DT.format(new Date(ms))
}

// Money is stored as INTEGER minor units. Integer arithmetic only — the whole
// part and the minor part are split with truncation and joined as text, so no
// value ever passes through a float.
export function fmtMoney(minor, currency = 'PLN') {
  if (minor === null || minor === undefined || minor === '') return '—'
  const n = Number(minor)
  if (!Number.isFinite(n)) return '—'
  const abs = Math.abs(Math.trunc(n))
  const whole = new Intl.NumberFormat('pl-PL').format(Math.trunc(abs / 100))
  const rest = String(abs % 100).padStart(2, '0')
  return `${n < 0 ? '−' : ''}${whole},${rest} ${currency}`
}

export function fmtBytes(bytes) {
  if (bytes === null || bytes === undefined) return '—'
  const n = Number(bytes)
  if (!Number.isFinite(n)) return '—'
  if (n < 1024) return `${n} B`
  const kb = n / 1024
  if (kb < 1024) return `${kb.toFixed(1)} kB`
  return `${(kb / 1024).toFixed(2)} MB`
}

// ── tiny shared bits of table chrome ────────────────────────────────────────

// A sortable <th>. `sort` is the current value in em_business form ('-updated_at'),
// so the button both reads and writes the exact string the API takes.
export function SortTh({ col, sort, onSort, children, align }) {
  const active = sort === col || sort === `-${col}`
  const desc = sort === `-${col}`
  const next = active && !desc ? `-${col}` : col
  return (
    <th
      scope="col"
      className="sa-th-sortable"
      aria-sort={active ? (desc ? 'descending' : 'ascending') : 'none'}
      style={align === 'right' ? { textAlign: 'right' } : undefined}
    >
      <button
        type="button"
        onClick={() => onSort(next)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 2, background: 'none',
          border: 0, padding: 0, font: 'inherit', color: 'inherit', cursor: 'pointer',
        }}
      >
        {children}
        <span
          className="material-symbols-outlined"
          aria-hidden="true"
          style={{ fontSize: 14, opacity: active ? 1 : 0.35 }}
        >
          {desc ? 'arrow_downward' : 'arrow_upward'}
        </span>
      </button>
    </th>
  )
}

// Labelled control for the edit forms. Keeps every form field on one pattern.
export function Field({ label, hint, children, span }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, gridColumn: span ? '1 / -1' : undefined }}>
      <span style={{ fontSize: 'var(--sa-fs-small)', fontWeight: 600, color: 'var(--sa-text-muted)' }}>{label}</span>
      {children}
      {hint && <span style={{ fontSize: 'var(--sa-fs-micro)', color: 'var(--sa-text-muted)' }}>{hint}</span>}
    </label>
  )
}

// Right-hand drawer + scrim. Escape closes; focus lands inside on open.
export function Drawer({ title, onClose, children, footer, width }) {
  const [node, setNode] = useState(null)
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  useEffect(() => {
    if (!node) return
    const target = node.querySelector('input, select, textarea, button')
    if (target) target.focus()
  }, [node])

  return (
    <>
      <div className="sa-scrim" onClick={onClose} aria-hidden="true" />
      <div
        className="sa-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={setNode}
        style={width ? { width } : undefined}
      >
        <div className="sa-drawer-header">
          <span>{title}</span>
          <button type="button" className="sa-icon-btn" onClick={onClose} aria-label="Close">
            <span className="material-symbols-outlined" aria-hidden="true">close</span>
          </button>
        </div>
        <div className="sa-drawer-body">{children}</div>
        {footer && <div className="sa-drawer-footer">{footer}</div>}
      </div>
    </>
  )
}

// Inline write-failure notice. Distinct from ConsoleErrorPanel, which owns the
// whole screen when a LOAD fails; a failed save must not blank the form.
export function SaveError({ error }) {
  if (!error) return null
  return (
    <p
      role="alert"
      style={{
        margin: 0, padding: '8px 10px', borderRadius: 'var(--sa-radius-control)',
        background: 'var(--sa-bad-soft)', color: 'var(--sa-bad)',
        fontSize: 'var(--sa-fs-small)', fontWeight: 600,
      }}
    >
      {error.message || String(error)}
    </p>
  )
}
