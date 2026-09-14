// CommsShared — the handful of bits the three COMMS screens both need.
// Everything visual here composes console.css primitives (.sa-drawer,
// .sa-modal, .sa-field-row, .sa-th-sortable); nothing new is invented.

import { usePresence, useDismiss } from '../../../design/v3/motion/index.js'
import { useRef } from 'react'

function useOverlay(open, onClose) {
  const ref = useRef(null)
  useDismiss(onClose, ref, open)
  return ref
}

export function SaDrawer({ open, title, onClose, footer, children }) {
  const motion = usePresence(open, 'drawer')
  const ref = useOverlay(open, onClose)
  if (!motion.mounted) return null
  return (
    <>
      <div className="sa-scrim em-motion-overlay" data-motion-state={motion.phase} onClick={motion.inert ? undefined : onClose} />
      <aside className={`sa-drawer em-motion-drawer-right ${motion.className}`} inert={motion.inert} role="dialog" aria-modal="true" aria-label={title} ref={ref} tabIndex={-1}>
        <header className="sa-drawer-header">
          <span>{title}</span>
          <button type="button" className="sa-icon-btn" onClick={onClose} aria-label="Close panel">
            <span className="material-symbols-outlined" aria-hidden="true">close</span>
          </button>
        </header>
        <div className="sa-drawer-body">{children}</div>
        {footer && <footer className="sa-drawer-footer">{footer}</footer>}
      </aside>
    </>
  )
}

export function ConfirmModal({ open, title, body, confirmLabel, busy, onConfirm, onClose }) {
  const motion = usePresence(open)
  const ref = useOverlay(open, onClose)
  if (!motion.mounted) return null
  return (
    <>
      <div className="sa-scrim em-motion-overlay" data-motion-state={motion.phase} onClick={motion.inert ? undefined : onClose} />
      <div className={`sa-modal t-modal ${motion.className}`} inert={motion.inert} role="alertdialog" aria-modal="true" aria-label={title} ref={ref} tabIndex={-1}>
        <header className="sa-modal-header">
          <span>{title}</span>
          <button type="button" className="sa-icon-btn" onClick={onClose} aria-label="Close dialog">
            <span className="material-symbols-outlined" aria-hidden="true">close</span>
          </button>
        </header>
        <div className="sa-modal-body">{body}</div>
        <footer className="sa-modal-footer">
          <button type="button" className="sa-btn sa-btn-ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="sa-btn sa-btn-danger" onClick={onConfirm} disabled={busy}>
            {busy ? 'Working…' : confirmLabel}
          </button>
        </footer>
      </div>
    </>
  )
}

export function Field({ label, htmlFor, hint, children }) {
  return (
    <div className="sa-field-row" style={{ alignItems: 'flex-start' }}>
      <label className="sa-field-label" htmlFor={htmlFor} style={{ paddingTop: 9 }}>{label}</label>
      <div>
        {children}
        {hint && <p className="sa-empty-hint" style={{ margin: '4px 0 0' }}>{hint}</p>}
      </div>
    </div>
  )
}

// A sortable column header. The th carries aria-sort; the button inside it is
// what makes the control keyboard-reachable (a bare th is not).
const TH_BUTTON = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: 0,
  border: 0,
  background: 'none',
  font: 'inherit',
  color: 'inherit',
  cursor: 'pointer',
}

export function SortTh({ col, label, sort, onSort, align }) {
  const desc = sort === `-${col}`
  const active = desc || sort === col
  return (
    <th
      scope="col"
      className="sa-th-sortable"
      aria-sort={active ? (desc ? 'descending' : 'ascending') : 'none'}
      style={align === 'right' ? { textAlign: 'right' } : undefined}
    >
      <button
        type="button"
        style={TH_BUTTON}
        onClick={() => onSort(active && !desc ? `-${col}` : col)}
        title={`Sort by ${label}`}
      >
        {label}
        <span
          className="material-symbols-outlined"
          aria-hidden="true"
          style={{ fontSize: 14, opacity: active ? 1 : 0.4 }}
        >
          {desc ? 'arrow_downward' : 'arrow_upward'}
        </span>
      </button>
    </th>
  )
}

// A short, always-visible statement of a rule the operator cannot override.
export function PolicyNote({ icon = 'gavel', title, children }) {
  return (
    <div
      className="sa-card"
      style={{ display: 'flex', gap: 10, padding: '10px 14px', alignItems: 'flex-start', boxShadow: 'none' }}
    >
      <span className="material-symbols-outlined" aria-hidden="true"
        style={{ fontSize: 18, color: 'var(--sa-violet-600)', flex: '0 0 auto', marginTop: 1 }}>
        {icon}
      </span>
      <div>
        <p style={{ margin: 0, fontSize: 'var(--sa-fs-body)', fontWeight: 600, color: 'var(--sa-text)' }}>{title}</p>
        <div style={{ marginTop: 2, fontSize: 'var(--sa-fs-small)', color: 'var(--sa-text-muted)', lineHeight: 1.55 }}>
          {children}
        </div>
      </div>
    </div>
  )
}

// Inline write feedback inside a drawer: never a toast that can be missed.
export function WriteNote({ note }) {
  if (!note) return null
  return (
    <p
      role={note.ok ? 'status' : 'alert'}
      style={{
        margin: '0 0 10px',
        padding: '7px 10px',
        borderRadius: 'var(--sa-radius-control)',
        fontSize: 'var(--sa-fs-small)',
        fontWeight: 600,
        background: note.ok ? 'var(--sa-good-soft)' : 'var(--sa-bad-soft)',
        color: note.ok ? 'var(--sa-good)' : 'var(--sa-bad)',
      }}
    >
      {note.text}
    </p>
  )
}

export function LocaleBadge({ locale }) {
  const pl = String(locale || '').toLowerCase() === 'pl'
  return (
    <span
      className="sa-badge"
      style={pl
        ? { background: 'var(--sa-violet-100)', color: 'var(--sa-violet-600)', textTransform: 'uppercase' }
        : { textTransform: 'uppercase' }}
    >
      {locale || '—'}
    </span>
  )
}
