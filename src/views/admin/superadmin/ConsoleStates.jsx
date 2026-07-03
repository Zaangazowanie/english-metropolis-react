// ConsoleStates — shared UI bits for the /api/console/* screens (Library,
// Assignments, Pipelines & Ops).
//
// The console endpoints roll out one by one on Ricky's em-console-api; until
// an endpoint is flipped live, nginx answers 404. That is an EXPECTED state
// of the system, not an error — so it gets a calm explainer, identical on
// every console screen, instead of red text (and never mock rows).

const TONES = {
  muted: { border: 'rgba(148, 163, 184, 0.2)', icon: 'rgba(148, 163, 184, 0.8)', title: '#e2e8f0' },
  error: { border: 'rgba(248, 113, 113, 0.35)', icon: '#fca5a5', title: '#fecaca' },
}

function Panel({ icon, tone = 'muted', title, children }) {
  const t = TONES[tone] || TONES.muted
  return (
    <div
      className="mx-auto my-8 flex max-w-xl flex-col items-center gap-3 rounded-2xl border px-8 py-10 text-center"
      style={{ borderColor: t.border, background: 'rgba(15, 23, 42, 0.45)' }}
    >
      <span className="material-symbols-outlined" style={{ fontSize: 34, color: t.icon }}>{icon}</span>
      <p className="text-sm font-bold uppercase tracking-[0.14em]" style={{ color: t.title }}>{title}</p>
      <div className="space-y-2 text-sm" style={{ color: 'rgba(203, 213, 225, 0.75)', lineHeight: 1.55 }}>
        {children}
      </div>
    </div>
  )
}

export function ConsoleLoading({ label = 'Loading…' }) {
  return <p className="p-6" style={{ color: 'rgba(203, 213, 225, 0.7)' }}>{label}</p>
}

export function ConsoleNotLive({ endpoint }) {
  return (
    <Panel icon="power_off" title="Backend not live yet">
      <p>
        <code style={{ color: '#a5f3fc', fontSize: '0.8rem' }}>{endpoint}</code> answered 404 — this
        endpoint has not been flipped live on em-console-api yet.
      </p>
      <p>
        This screen is wired against <code style={{ fontSize: '0.8rem' }}>docs/console/API-CONTRACT.md</code> and
        lights up with real data the moment the endpoint ships. No frontend changes needed, and no mock
        rows by design.
      </p>
    </Panel>
  )
}

export function ConsoleErrorPanel({ error, onRetry }) {
  return (
    <Panel icon="error" tone="error" title={error?.denied ? 'Access denied' : 'Request failed'}>
      <p>{error?.message || 'Unknown error'}</p>
      {onRetry && (
        <button type="button" className="sa-btn sa-btn-ghost mt-2" onClick={onRetry}>
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>refresh</span>
          Retry
        </button>
      )}
    </Panel>
  )
}

// CEFR level + basket chips, shared by the Library list and lesson detail.
const LEVEL_STYLES = {
  A2: { background: 'rgba(56, 189, 248, 0.16)', color: '#7dd3fc' },
  B1: { background: 'rgba(74, 222, 128, 0.16)', color: '#86efac' },
  B2: { background: 'rgba(251, 191, 36, 0.16)', color: '#fcd34d' },
  C1: { background: 'rgba(217, 70, 239, 0.16)', color: '#f0abfc' },
}

const BASKET_STYLES = {
  IDEAS: { background: 'rgba(139, 92, 246, 0.16)', color: '#c4b5fd' },
  PLACES: { background: 'rgba(56, 189, 248, 0.16)', color: '#7dd3fc' },
  SOCIETY: { background: 'rgba(74, 222, 128, 0.16)', color: '#86efac' },
  SPEC: { background: 'rgba(251, 191, 36, 0.16)', color: '#fcd34d' },
  SUM: { background: 'rgba(244, 114, 182, 0.16)', color: '#f9a8d4' },
}

const NEUTRAL_STYLE = { background: 'rgba(148, 163, 184, 0.18)', color: '#cbd5e1' }

export function LevelBadge({ level }) {
  if (!level) return null
  return <span className="sa-badge" style={LEVEL_STYLES[level] || NEUTRAL_STYLE}>{level}</span>
}

export function BasketBadge({ basket }) {
  if (!basket) return null
  return <span className="sa-badge" style={BASKET_STYLES[basket] || NEUTRAL_STYLE}>{basket}</span>
}
