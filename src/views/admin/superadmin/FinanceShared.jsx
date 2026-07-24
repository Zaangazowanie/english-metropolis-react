// FinanceShared — the handful of primitives the three Finance screens share.
// Everything visual here is a thin wrapper over the sa-* classes in console.css;
// nothing hand-rolls a table, badge, button or overlay of its own.

import { useEffect, useRef } from 'react'

// ── status badges ────────────────────────────────────────────────────────────
// console.css ships five badge tones. Every status the finance schema allows is
// mapped onto one of them, so an unmapped value can never fall through to an
// unstyled chip (and if the schema grows one, it renders neutral, not broken).
const BADGE_TONE = {
  // invoices
  draft: 'queued',
  issued: 'processing',
  sent: 'processing',
  partially_paid: 'awaiting_review',
  paid: 'committed',
  overdue: 'failed',
  cancelled: 'failed',
  // payroll runs
  review: 'awaiting_review',
  approved: 'processing',
  // orders (Convex lessonOrders)
  pending_invoice: 'awaiting_review',
  confirmed: 'committed',
  // packages
  active: 'committed',
}

export function StatusBadge({ status, title }) {
  if (!status) return <span className="sa-badge">—</span>
  const tone = BADGE_TONE[status] || 'queued'
  return (
    <span className={`sa-badge sa-badge-${tone}`} title={title || undefined}>
      {String(status).replace(/_/g, ' ')}
    </span>
  )
}

// ── sortable column header ───────────────────────────────────────────────────
// The <th> carries aria-sort; the click target is a real <button> so the column
// is reachable by keyboard, which a th with onClick is not.
export function SortTh({ col, label, sort, onSort, align = 'left', width }) {
  const active = sort === col || sort === `-${col}`
  const desc = sort === `-${col}`
  return (
    <th
      scope="col"
      className="sa-th-sortable"
      style={{ textAlign: align, width }}
      aria-sort={active ? (desc ? 'descending' : 'ascending') : 'none'}
    >
      <button
        type="button"
        onClick={() => onSort(active && !desc ? `-${col}` : col)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 3, padding: 0, border: 0,
          background: 'none', font: 'inherit', color: 'inherit', cursor: 'pointer',
          flexDirection: align === 'right' ? 'row-reverse' : 'row',
        }}
      >
        {label}
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

// ── overlays ─────────────────────────────────────────────────────────────────
// One implementation for the drawer and the modal: Escape closes, focus moves in
// on open and back to the opener on close, Tab is trapped inside. Rendered in
// the .sa-root subtree (position:fixed, so no portal is needed) which keeps the
// tokens cascading and the DOM order sane for screen readers.
function useOverlay(onClose) {
  const ref = useRef(null)
  const openerRef = useRef(null)

  useEffect(() => {
    openerRef.current = document.activeElement
    const node = ref.current
    const focusables = () => Array.from(node?.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    ) || [])
    const first = focusables()[0]
    ;(first || node)?.focus()

    function onKeyDown(event) {
      if (event.key === 'Escape') { event.stopPropagation(); onClose(); return }
      if (event.key !== 'Tab') return
      const items = focusables()
      if (!items.length) return
      const firstItem = items[0]
      const lastItem = items[items.length - 1]
      if (event.shiftKey && document.activeElement === firstItem) {
        event.preventDefault(); lastItem.focus()
      } else if (!event.shiftKey && document.activeElement === lastItem) {
        event.preventDefault(); firstItem.focus()
      }
    }
    node?.addEventListener('keydown', onKeyDown)
    return () => {
      node?.removeEventListener('keydown', onKeyDown)
      const opener = openerRef.current
      if (opener && typeof opener.focus === 'function') opener.focus()
    }
  }, [onClose])

  return ref
}

export function Drawer({ title, subtitle, onClose, footer, children }) {
  const ref = useOverlay(onClose)
  return (
    <>
      <div className="sa-scrim" onClick={onClose} aria-hidden="true" />
      <aside className="sa-drawer" role="dialog" aria-modal="true" aria-label={title} ref={ref} tabIndex={-1}>
        <header className="sa-drawer-header">
          <div style={{ minWidth: 0 }}>
            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
            {subtitle && (
              <div style={{ fontSize: 'var(--sa-fs-small)', fontWeight: 500, color: 'var(--sa-text-muted)' }}>
                {subtitle}
              </div>
            )}
          </div>
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

export function Modal({ title, onClose, footer, children, width }) {
  const ref = useOverlay(onClose)
  return (
    <>
      <div className="sa-scrim" onClick={onClose} aria-hidden="true" />
      <div
        className="sa-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={ref}
        tabIndex={-1}
        style={width ? { width: `min(${width}, calc(100vw - 32px))` } : undefined}
      >
        <header className="sa-modal-header">
          <span>{title}</span>
          <button type="button" className="sa-icon-btn" onClick={onClose} aria-label="Close dialog">
            <span className="material-symbols-outlined" aria-hidden="true">close</span>
          </button>
        </header>
        <div className="sa-modal-body">{children}</div>
        {footer && <footer className="sa-modal-footer">{footer}</footer>}
      </div>
    </>
  )
}

// ── small layout helpers ─────────────────────────────────────────────────────

export function Kpi({ label, value, hint }) {
  return (
    <div className="sa-kpi">
      <span className="sa-kpi-label">{label}</span>
      <span className="sa-kpi-value">{value}</span>
      {hint && <span className="sa-kpi-delta">{hint}</span>}
    </div>
  )
}

export const KPI_GRID = {
  display: 'grid',
  gap: 10,
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
}

export function Field({ label, hint, children, required }) {
  return (
    <label className="sa-field-row" style={{ alignItems: 'flex-start' }}>
      <span className="sa-field-label" style={{ paddingTop: 8 }}>
        {label}{required && <span aria-hidden="true"> *</span>}
      </span>
      <span style={{ display: 'block' }}>
        {children}
        {hint && (
          <span style={{ display: 'block', marginTop: 3, fontSize: 'var(--sa-fs-micro)', color: 'var(--sa-text-muted)' }}>
            {hint}
          </span>
        )}
      </span>
    </label>
  )
}

// Inline notice. `tone` is 'warn' | 'bad' | 'good' | 'info'.
export function Notice({ tone = 'info', icon, children }) {
  const palette = {
    warn: { bg: 'var(--sa-warm-soft)', fg: 'var(--sa-warm-ink)', bd: 'var(--sa-warm-ink)' },
    bad: { bg: 'var(--sa-bad-soft)', fg: 'var(--sa-bad)', bd: 'var(--sa-bad)' },
    good: { bg: 'var(--sa-good-soft)', fg: 'var(--sa-good)', bd: 'var(--sa-good)' },
    info: { bg: 'var(--sa-violet-100)', fg: 'var(--sa-violet-600)', bd: 'var(--sa-violet-500)' },
  }[tone]
  return (
    <p
      role={tone === 'bad' ? 'alert' : undefined}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 6, margin: 0, padding: '8px 10px',
        background: palette.bg, color: palette.fg, border: `1px solid ${palette.bd}`,
        borderRadius: 'var(--sa-radius-control)', fontSize: 'var(--sa-fs-small)', lineHeight: 1.5,
      }}
    >
      {icon && <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 16 }}>{icon}</span>}
      <span>{children}</span>
    </p>
  )
}

// "Showing 24 of 118" + Load more, for the keyset-paginated biz lists.
export function ListFooter({ shown, total, hasMore, loading, onMore }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
      borderTop: '1px solid var(--sa-border)' }}>
      <span className="sa-toolbar-count">
        Showing {shown} of {total}
      </span>
      {hasMore && (
        <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" onClick={onMore} disabled={loading}>
          {loading ? 'Loading…' : 'Load more'}
        </button>
      )}
    </div>
  )
}
