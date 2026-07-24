// Superadmin › Pipelines & Ops — the health of every EM data pipeline on one
// calm screen (Sentry/Grafana energy, not toy-like).
//
// Data: GET /api/console/pipelines (docs/console/API-CONTRACT.md, P3).
// The endpoint is ✅ LIVE but PARTIAL as of gold-deploy b92ba63: `services` and
// `library` carry real data; `ingestion`, `practice` and `publishes_7d` are
// null until Ricky's next backend slice. Null sections therefore render a
// quiet per-section "not wired yet" note — NOT the full ConsoleNotLive panel
// (the endpoint itself answers), and never mocked numbers, per contract rule.
//
// The screen polls every 30s while visible (skipped when the tab is hidden),
// keeps the last good snapshot on background-refresh failures, and offers a
// manual refresh.

import { useCallback, useEffect, useRef, useState } from 'react'
import { consoleGet } from './consoleApi.js'
import { ConsoleEmpty, ConsoleSkeleton, ConsoleNotLive, ConsoleErrorPanel } from './ConsoleStates.jsx'

const POLL_MS = 30000

const STATUS_STYLES = {
  up: { background: 'var(--sa-good-soft)', color: 'var(--sa-good)' },
  degraded: { background: 'var(--sa-warm-soft)', color: 'var(--sa-warm-ink)' },
  down: { background: 'var(--sa-bad-soft)', color: 'var(--sa-bad)' },
}
const STATUS_FALLBACK = { background: 'var(--sa-surface-soft)', color: 'var(--sa-text-muted)' }

function StatusBadge({ status }) {
  return (
    <span className="sa-badge" style={STATUS_STYLES[status] || STATUS_FALLBACK}>
      {status || 'unknown'}
    </span>
  )
}

function Stat({ label, value }) {
  return (
    <div className="sa-kpi">
      <p className="sa-kpi-label">{label}</p>
      <p className="sa-kpi-value">{value ?? '—'}</p>
    </div>
  )
}

// A section the backend ships as null until its slice lands — quiet note,
// no red, no fake zeros.
function NotWiredNote() {
  return (
    <p className="text-sm" style={{ color: 'var(--sa-text-muted)', lineHeight: 1.55 }}>
      Not wired on em-console-api yet — this section arrives with the next backend slice.
      The field is null by contract, so nothing is rendered rather than mocked.
    </p>
  )
}

export default function SuperadminPipelines() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true) // first load only
  const [error, setError] = useState(null) // first-load error → full panels
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState(null) // background failure → subtle banner, keep last data
  const [lastUpdated, setLastUpdated] = useState(null)
  const aliveRef = useRef(true)

  const load = useCallback(async (initial) => {
    if (initial) {
      setLoading(true)
      setError(null)
    } else {
      setRefreshing(true)
    }
    try {
      const d = await consoleGet('/api/console/pipelines')
      if (!aliveRef.current) return
      setData(d)
      setLastUpdated(new Date())
      setRefreshError(null)
      setError(null)
    } catch (e) {
      if (!aliveRef.current) return
      if (initial || !data) setError(e)
      else setRefreshError(e)
    } finally {
      if (aliveRef.current) {
        setLoading(false)
        setRefreshing(false)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  useEffect(() => {
    aliveRef.current = true
    load(true)
    const timer = setInterval(() => {
      if (document.hidden) return // don't hammer the VPS from background tabs
      load(false)
    }, POLL_MS)
    return () => {
      aliveRef.current = false
      clearInterval(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const services = Array.isArray(data?.services) ? data.services : []
  const upCount = services.filter(s => s.status === 'up').length
  const degradedCount = services.filter(s => s.status === 'degraded').length
  const downCount = services.filter(s => s.status === 'down').length
  const library = data?.library || null
  const ingestion = data?.ingestion || null
  const practice = data?.practice || null
  const publishes = Array.isArray(data?.publishes_7d) ? data.publishes_7d : null

  return (
    <div className="space-y-5">
      <div className="sa-card">
        <div className="sa-card-header">
          <h2>
            Pipelines &amp; Ops
            {services.length > 0 &&
              ` · ${upCount} up${degradedCount ? ` · ${degradedCount} degraded` : ''}${downCount ? ` · ${downCount} down` : ''}`}
          </h2>
          <div className="flex items-center gap-3">
            {lastUpdated && (
              <span className="sa-toolbar-count">
                updated {lastUpdated.toLocaleTimeString()}
              </span>
            )}
            <button
              type="button"
              className="sa-btn sa-btn-ghost"
              onClick={() => load(false)}
              disabled={loading || refreshing}
              style={loading || refreshing ? { opacity: 0.5, cursor: 'wait' } : undefined}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>refresh</span>
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>
        <div className="sa-card-body p-0">
          {refreshError && (
            <p className="p-4 text-xs" style={{ color: 'var(--sa-warm-ink)' }}>
              Last refresh failed ({refreshError.message}) — showing the snapshot from{' '}
              {lastUpdated ? lastUpdated.toLocaleTimeString() : 'the previous load'}.
            </p>
          )}

          {loading && <ConsoleSkeleton rows={8} />}
          {!loading && error && error.notLive && <ConsoleNotLive endpoint="GET /api/console/pipelines" />}
          {!loading && error && !error.notLive && (
            <ConsoleErrorPanel error={error} onRetry={() => load(true)} />
          )}

          {!loading && !error && services.length === 0 && (
            <ConsoleEmpty
              icon="lan"
              hint="The backend answered without any services — check em-console-api's service probe config."
            />
          )}

          {!loading && !error && services.length > 0 && (
            <div className="sa-table-wrap">
              <table className="sa-table">
                <thead>
                  <tr>
                    <th>Service</th>
                    <th>Unit</th>
                    <th>Port</th>
                    <th>Status</th>
                    <th>Latency</th>
                    <th>Last error</th>
                  </tr>
                </thead>
                <tbody>
                  {services.map((s, i) => (
                    <tr key={`${s.name || s.unit || 'svc'}-${i}`}>
                      <td className="font-semibold whitespace-nowrap" style={{ color: 'var(--sa-text)' }}>
                        {s.name || '—'}
                      </td>
                      <td
                        className="font-mono whitespace-nowrap"
                        style={{ color: 'var(--sa-text-muted)', fontSize: 'var(--sa-fs-micro)' }}
                      >
                        {s.unit || '—'}
                      </td>
                      <td className="whitespace-nowrap" style={{ color: 'var(--sa-text-muted)' }}>
                        {s.port ?? '—'}
                      </td>
                      <td><StatusBadge status={s.status} /></td>
                      <td className="whitespace-nowrap" style={{ color: 'var(--sa-text-muted)' }}>
                        {s.latency_ms != null ? `${s.latency_ms} ms` : '—'}
                      </td>
                      <td style={{ color: s.last_error ? 'var(--sa-bad)' : 'var(--sa-text-muted)', maxWidth: '22rem' }}>
                        {s.last_error ? (
                          <span className="text-xs" style={{ lineHeight: 1.5 }}>{s.last_error}</span>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {!loading && !error && data && (
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="sa-card">
            <div className="sa-card-header"><h2>Course library</h2></div>
            <div className="sa-card-body">
              {library ? (
                <div className="grid grid-cols-2 gap-4">
                  <Stat label="Decks" value={library.deck_count} />
                  <Stat label="Open PRs" value={library.open_prs} />
                  <div className="sa-kpi col-span-2">
                    <p className="sa-kpi-label">Last sync</p>
                    <p className="mt-1 text-sm" style={{ color: 'var(--sa-text)' }}>{library.last_sync ?? '—'}</p>
                  </div>
                  <div className="sa-kpi col-span-2">
                    <p className="sa-kpi-label">Gate · last cycle</p>
                    <p className="mt-1 text-sm" style={{ color: 'var(--sa-text)' }}>{library.gate_last_cycle ?? '—'}</p>
                  </div>
                </div>
              ) : (
                <NotWiredNote />
              )}
            </div>
          </div>

          <div className="sa-card">
            <div className="sa-card-header"><h2>Ingestion queue</h2></div>
            <div className="sa-card-body">
              {ingestion ? (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <Stat label="Queued" value={ingestion.queued} />
                  <Stat label="Running" value={ingestion.running} />
                  <Stat label="Failed · 24h" value={ingestion.failed_24h} />
                  <Stat label="Done · 24h" value={ingestion.done_24h} />
                </div>
              ) : (
                <NotWiredNote />
              )}
            </div>
          </div>

          <div className="sa-card">
            <div className="sa-card-header"><h2>Practice engine · 7d</h2></div>
            <div className="sa-card-body">
              {practice ? (
                <div className="grid grid-cols-2 gap-4">
                  <Stat label="Sessions" value={practice.sessions_7d} />
                  <Stat label="Active students" value={practice.active_students_7d} />
                </div>
              ) : (
                <NotWiredNote />
              )}
            </div>
          </div>

          <div className="sa-card">
            <div className="sa-card-header"><h2>Publishes · 7d{publishes ? ` · ${publishes.length}` : ''}</h2></div>
            <div className="sa-card-body">
              {publishes === null ? (
                <NotWiredNote />
              ) : publishes.length === 0 ? (
                <ConsoleEmpty icon="upload_file" title="No publishes in the last 7 days." />
              ) : (
                <ul className="space-y-2">
                  {publishes.map((p, i) => (
                    <li
                      key={`${p.student_slug || 'row'}-${p.date || ''}-${i}`}
                      className="flex flex-wrap items-center gap-2 text-sm"
                      style={{ color: 'var(--sa-text)' }}
                    >
                      <span className="font-semibold">{p.student_slug || '—'}</span>
                      {p.date && <span className="sa-chip">{p.date}</span>}
                      {p.title && <span style={{ color: 'var(--sa-text-muted)' }}>{p.title}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
