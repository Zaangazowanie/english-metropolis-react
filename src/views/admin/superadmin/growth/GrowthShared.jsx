// GrowthShared — the pieces the three Growth screens (Campaigns, Adverts, SEO)
// all need: the list hook over /api/console/biz/<entity>, a sortable table
// header, a dialog built on the .sa-modal primitive, and status pills built the
// way ConsoleStates' LevelBadge builds them (the .sa-badge primitive plus a
// token pair, so no new colour enters the palette).
//
// Nothing here fabricates a row. An empty list is an empty list.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { bizList } from './growthApi.js'

// ── list hook ────────────────────────────────────────────────────────────────
// status: 'loading' | 'ready' | 'error'. `params` is re-serialised into a
// dependency key so a caller can pass a fresh object literal every render.

export function useBizList(entity, params, enabled = true) {
  const key = JSON.stringify(params || {})
  const [nonce, setNonce] = useState(0)
  const [state, setState] = useState({ status: 'loading', rows: [], total: 0, next: null, error: null })
  const [loadingMore, setLoadingMore] = useState(false)

  useEffect(() => {
    if (!enabled) {
      setState({ status: 'ready', rows: [], total: 0, next: null, error: null })
      return undefined
    }
    let alive = true
    setState(s => ({ ...s, status: 'loading', error: null }))
    bizList(entity, JSON.parse(key))
      .then(d => {
        if (!alive) return
        const rows = Array.isArray(d?.rows) ? d.rows : []
        setState({ status: 'ready', rows, total: Number(d?.total ?? rows.length), next: d?.next_cursor || null, error: null })
      })
      .catch(error => { if (alive) setState({ status: 'error', rows: [], total: 0, next: null, error }) })
    return () => { alive = false }
  }, [entity, key, nonce, enabled])

  const reload = useCallback(() => setNonce(n => n + 1), [])

  const loadMore = useCallback(async () => {
    setLoadingMore(true)
    try {
      const d = await bizList(entity, { ...JSON.parse(key), cursor: state.next })
      const rows = Array.isArray(d?.rows) ? d.rows : []
      setState(s => ({ ...s, rows: [...s.rows, ...rows], next: d?.next_cursor || null }))
    } catch (error) {
      setState(s => ({ ...s, error }))
    } finally {
      setLoadingMore(false)
    }
  }, [entity, key, state.next])

  return { ...state, reload, loadMore, loadingMore }
}

// Typing must not fire a request per keystroke; 250ms is below the threshold
// where a search box feels laggy and above one request per character.
export function useDebounced(value, delay = 250) {
  const [out, setOut] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setOut(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return out
}

// Rows keyed by id — used to name an ad campaign or an account in another table
// without a join the API does not do.
export function useIndex(rows, field = 'id') {
  return useMemo(() => {
    const map = new Map()
    for (const r of rows || []) map.set(r[field], r)
    return map
  }, [rows, field])
}

// ── sortable header ──────────────────────────────────────────────────────────
// The header cell carries aria-sort; the button inside is what the keyboard
// reaches, so sorting never depends on a mouse.

const SORT_BTN = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 3,
  padding: 0,
  border: 0,
  background: 'none',
  font: 'inherit',
  color: 'inherit',
  cursor: 'pointer',
}

export function SortTh({ label, col, sort, onSort, align = 'left', width }) {
  const active = sort === col || sort === `-${col}`
  const desc = sort === `-${col}`
  return (
    <th
      className="sa-th-sortable"
      scope="col"
      style={{ textAlign: align, width }}
      aria-sort={active ? (desc ? 'descending' : 'ascending') : 'none'}
    >
      <button type="button" style={SORT_BTN} onClick={() => onSort(active && !desc ? `-${col}` : col)}>
        {label}
        <span
          className="material-symbols-outlined"
          aria-hidden="true"
          style={{ fontSize: 14, color: active ? 'var(--sa-violet-600)' : 'var(--sa-border-control)' }}
        >
          {active && desc ? 'arrow_downward' : 'arrow_upward'}
        </span>
        {active && <span className="sa-sr-only">{desc ? '(sorted descending)' : '(sorted ascending)'}</span>}
      </button>
    </th>
  )
}

// ── status pill ──────────────────────────────────────────────────────────────

const TONES = {
  neutral: { background: 'var(--sa-surface-soft)', color: 'var(--sa-text-muted)' },
  brand: { background: 'var(--sa-violet-100)', color: 'var(--sa-violet-600)' },
  good: { background: 'var(--sa-good-soft)', color: 'var(--sa-good)' },
  warm: { background: 'var(--sa-warm-soft)', color: 'var(--sa-warm-ink)' },
  bad: { background: 'var(--sa-bad-soft)', color: 'var(--sa-bad)' },
}

export function Pill({ label, tone = 'neutral', icon, title }) {
  if (label === null || label === undefined || label === '') return <span style={{ color: 'var(--sa-text-muted)' }}>—</span>
  return (
    <span className="sa-badge" style={TONES[tone] || TONES.neutral} title={title}>
      {icon && <span className="material-symbols-outlined" aria-hidden="true">{icon}</span>}
      {label}
    </span>
  )
}

// ── dialog ───────────────────────────────────────────────────────────────────
// Rendered inside .sa-root (no portal), so the scoped token block applies.
// Escape closes, focus moves in on open and back to the opener on close, and
// Tab cycles inside — a modal you cannot leave by keyboard is not keyboard
// support.

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

export function Modal({ title, onClose, children, footer, wide = false }) {
  const ref = useRef(null)
  const openerRef = useRef(null)
  const titleId = useRef(`sa-modal-${Math.random().toString(36).slice(2, 9)}`).current

  useEffect(() => {
    openerRef.current = document.activeElement
    const node = ref.current
    const first = node?.querySelector(FOCUSABLE)
    ;(first || node)?.focus()
    return () => {
      const opener = openerRef.current
      if (opener && typeof opener.focus === 'function') opener.focus()
    }
  }, [])

  const onKeyDown = e => {
    if (e.key === 'Escape') { e.stopPropagation(); onClose(); return }
    if (e.key !== 'Tab') return
    const items = [...(ref.current?.querySelectorAll(FOCUSABLE) || [])]
    if (!items.length) return
    const first = items[0]
    const last = items[items.length - 1]
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  }

  return (
    <>
      <div className="sa-scrim" onClick={onClose} />
      <div
        className="sa-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        ref={ref}
        onKeyDown={onKeyDown}
        style={wide ? { width: 'min(760px, calc(100vw - 32px))' } : undefined}
      >
        <div className="sa-modal-header">
          <span id={titleId}>{title}</span>
          <button type="button" className="sa-icon-btn" onClick={onClose} aria-label="Close dialog">
            <span className="material-symbols-outlined" aria-hidden="true">close</span>
          </button>
        </div>
        <div className="sa-modal-body">{children}</div>
        {footer && <div className="sa-modal-footer">{footer}</div>}
      </div>
    </>
  )
}

export function ConfirmModal({ title, body, confirmLabel = 'Delete', busy, onConfirm, onClose }) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="sa-btn sa-btn-ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="sa-btn sa-btn-danger" onClick={onConfirm} disabled={busy}>
            {busy ? 'Working…' : confirmLabel}
          </button>
        </>
      }
    >
      <p style={{ margin: 0, lineHeight: 1.55 }}>{body}</p>
    </Modal>
  )
}

// ── form bits ────────────────────────────────────────────────────────────────

export function Field({ label, htmlFor, hint, required, children }) {
  return (
    <div className="sa-field-row">
      <label htmlFor={htmlFor}>
        {label}
        {required && <span aria-hidden="true" style={{ color: 'var(--sa-bad)' }}> *</span>}
      </label>
      <div>
        {children}
        {hint && <p style={{ margin: '3px 0 0', fontSize: 'var(--sa-fs-micro)', color: 'var(--sa-text-muted)' }}>{hint}</p>}
      </div>
    </div>
  )
}

export function FormError({ error }) {
  if (!error) return null
  return (
    <p role="alert" style={{ margin: '0 0 10px', color: 'var(--sa-bad)', fontWeight: 600, lineHeight: 1.5 }}>
      {error.message || String(error)}
    </p>
  )
}

// ── pagination ───────────────────────────────────────────────────────────────

export function LoadMore({ next, loading, onLoadMore, shown, total }) {
  if (!next) return null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderTop: '1px solid var(--sa-border)' }}>
      <button type="button" className="sa-btn sa-btn-ghost" onClick={onLoadMore} disabled={loading}>
        {loading ? 'Loading…' : 'Load more'}
      </button>
      <span className="sa-toolbar-count">Showing {shown} of {total}</span>
    </div>
  )
}
