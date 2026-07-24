import { useEffect, useState } from 'react'
import { queryAdminConvex } from '../../../contexts/AdminAuthContext.jsx'
import { ConsoleEmpty, ConsoleSkeleton } from './ConsoleStates.jsx'

export default function SuperadminAudit() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let alive = true
    queryAdminConvex('ingestion:listAuditLog', { limit: 100 })
      .then(d => { if (alive) setEvents(d) })
      .catch(e => { if (alive) setError(e.message) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  return (
    <div className="space-y-5">
      <div className="sa-card">
        <div className="sa-card-header">
          <h2>Audit log</h2>
          <span className="sa-toolbar-count">
            Last 100 events
          </span>
        </div>
        <div className="sa-card-body p-0">
          {loading && <ConsoleSkeleton rows={8} />}
          {error && <p className="p-6" style={{ color: 'var(--sa-bad)' }}>Error: {error}</p>}
          {!loading && events.length === 0 && (
            <ConsoleEmpty icon="history" title="No audit events yet." />
          )}
          {events.length > 0 && (
            <div className="sa-table-wrap">
              <table className="sa-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Action</th>
                    <th>Target</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map(ev => (
                    <tr key={ev._id}>
                      <td style={{ color: 'var(--sa-text-muted)', fontSize: 'var(--sa-fs-small)' }}>
                        {new Date(ev.timestamp).toLocaleString()}
                      </td>
                      <td>
                        <code style={{ fontFamily: 'ui-monospace, monospace' }}>{ev.action}</code>
                      </td>
                      <td style={{ color: 'var(--sa-text-muted)' }}>
                        {ev.targetType}{ev.targetId ? ` · ${ev.targetId.slice(0, 12)}…` : ''}
                      </td>
                      <td style={{ color: 'var(--sa-text-muted)', fontSize: 'var(--sa-fs-small)', maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {ev.details ?? ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
