// ConsoleStates — shared UI states for the superadmin console.
//
// The console endpoints roll out one by one on Ricky's em-console-api; until
// an endpoint is flipped live, nginx answers 404. That is an EXPECTED state
// of the system, not an error — so it gets a calm explainer, identical on
// every console screen, instead of red text (and never mock rows).
//
// Styling comes from console.css (.sa-empty / .sa-error / .sa-skeleton).

export function ConsoleLoading({ label = 'Loading…' }) {
  return (
    <p className="sa-empty-hint" style={{ padding: '1.25rem' }} role="status" aria-live="polite">
      {label}
    </p>
  )
}

export function ConsoleEmpty({ icon = 'inbox', title, hint, action }) {
  return (
    <div className="sa-empty">
      <span className="material-symbols-outlined" aria-hidden="true">{icon}</span>
      {title && <p className="sa-empty-title">{title}</p>}
      {hint && <div className="sa-empty-hint">{hint}</div>}
      {action && <div className="sa-empty-action">{action}</div>}
    </div>
  )
}

// Table-shaped shimmer. `rows` defaults to a screenful.
// The bars are decorative, so they stay aria-hidden — but silence is not a
// loading state, so the same polite status ConsoleLoading uses rides along.
export function ConsoleSkeleton({ rows = 6, label = 'Loading…' }) {
  const widths = ['38%', '62%', '48%', '70%', '55%', '44%', '66%', '52%']
  return (
    <>
      <p className="sa-sr-only" role="status" aria-live="polite">{label}</p>
      <div className="sa-table-wrap" aria-hidden="true">
        {Array.from({ length: rows }, (_, i) => (
          <div className="sa-skeleton-row" key={i}>
            <span className="sa-skeleton" style={{ flex: '0 0 88px' }} />
            <span className="sa-skeleton" style={{ flex: `0 0 ${widths[i % widths.length]}` }} />
            <span className="sa-skeleton" style={{ flex: '0 0 64px', marginLeft: 'auto' }} />
          </div>
        ))}
      </div>
    </>
  )
}

export function ConsoleNotLive({ endpoint }) {
  return (
    <ConsoleEmpty
      icon="power_off"
      title="Backend not live yet"
      hint={
        <>
          <p>
            <code>{endpoint}</code> answered 404 — this endpoint has not been flipped live on
            em-console-api yet.
          </p>
          <p style={{ marginTop: '0.5rem' }}>
            This screen is wired against <code>docs/console/API-CONTRACT.md</code> and lights up with
            real data the moment the endpoint ships. No frontend changes needed, and no mock rows by
            design.
          </p>
        </>
      }
    />
  )
}

export function ConsoleErrorPanel({ error, onRetry }) {
  return (
    <div className="sa-error" role="alert">
      <span className="material-symbols-outlined" aria-hidden="true">error</span>
      <p className="sa-error-title">{error?.denied ? 'Access denied' : 'Request failed'}</p>
      <div className="sa-error-body">{error?.message || 'Unknown error'}</div>
      {onRetry && (
        <button type="button" className="sa-btn sa-btn-ghost" style={{ marginTop: '0.5rem' }} onClick={onRetry}>
          <span className="material-symbols-outlined" aria-hidden="true">refresh</span>
          Retry
        </button>
      )}
    </div>
  )
}

// CEFR level + basket chips, shared by the Library list and lesson detail.
// Light palette: one violet family for brand-ish tags, semantics reserved for status.
const LEVEL_STYLES = {
  A2: { background: 'var(--sa-surface-soft)', color: 'var(--sa-text-muted)' },
  B1: { background: 'var(--sa-violet-100)', color: 'var(--sa-violet-600)' },
  B2: { background: 'var(--sa-warm-soft)', color: 'var(--sa-warm-ink)' },
  C1: { background: 'var(--sa-good-soft)', color: 'var(--sa-good)' },
}

const BASKET_STYLES = {
  IDEAS: { background: 'var(--sa-violet-100)', color: 'var(--sa-violet-600)' },
  PLACES: { background: 'var(--sa-surface-soft)', color: 'var(--sa-text-muted)' },
  SOCIETY: { background: 'var(--sa-good-soft)', color: 'var(--sa-good)' },
  SPEC: { background: 'var(--sa-warm-soft)', color: 'var(--sa-warm-ink)' },
  SUM: { background: 'var(--sa-bad-soft)', color: 'var(--sa-bad)' },
}

const NEUTRAL_STYLE = { background: 'var(--sa-surface-soft)', color: 'var(--sa-text-muted)' }

export function LevelBadge({ level }) {
  if (!level) return null
  return <span className="sa-badge" style={LEVEL_STYLES[level] || NEUTRAL_STYLE}>{level}</span>
}

export function BasketBadge({ basket }) {
  if (!basket) return null
  return <span className="sa-badge" style={BASKET_STYLES[basket] || NEUTRAL_STYLE}>{basket}</span>
}
