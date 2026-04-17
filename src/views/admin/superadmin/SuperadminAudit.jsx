import { useEffect, useState } from 'react'
import { queryAdminConvex } from '../../../contexts/AdminAuthContext.jsx'

export default function SuperadminAudit() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    queryAdminConvex('ingestion:listAuditLog', { limit: 100 })
      .then(setEvents)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-5">
      <div className="sa-card">
        <div className="sa-card-header">
          <h2>Audit log</h2>
          <span className="text-[10px] uppercase tracking-widest" style={{ color: 'rgba(148,163,184,0.7)' }}>
            Last 100 events
          </span>
        </div>
        <div className="sa-card-body p-0">
          {loading && <p className="p-6" style={{ color: 'rgba(203,213,225,0.7)' }}>Loading…</p>}
          {error && <p className="p-6" style={{ color: '#fca5a5' }}>Error: {error}</p>}
          {!loading && events.length === 0 && (
            <p className="p-6" style={{ color: 'rgba(148,163,184,0.7)' }}>No audit events yet.</p>
          )}
          {events.length > 0 && (
            <table className="w-full text-left text-sm">
              <thead>
                <tr style={{ color: 'rgba(148,163,184,0.7)' }}>
                  <th className="px-5 py-3 text-[10px] uppercase tracking-widest">Time</th>
                  <th className="px-5 py-3 text-[10px] uppercase tracking-widest">Action</th>
                  <th className="px-5 py-3 text-[10px] uppercase tracking-widest">Target</th>
                  <th className="px-5 py-3 text-[10px] uppercase tracking-widest">Details</th>
                </tr>
              </thead>
              <tbody>
                {events.map(ev => (
                  <tr key={ev._id} className="border-t" style={{ borderColor: 'rgba(148,163,184,0.08)' }}>
                    <td className="px-5 py-3" style={{ color: 'rgba(148,163,184,0.7)', fontSize: '0.72rem' }}>
                      {new Date(ev.timestamp).toLocaleString()}
                    </td>
                    <td className="px-5 py-3" style={{ color: '#e2e8f0' }}>
                      <code style={{ fontFamily: 'ui-monospace, monospace' }}>{ev.action}</code>
                    </td>
                    <td className="px-5 py-3" style={{ color: 'rgba(203,213,225,0.75)' }}>
                      {ev.targetType}{ev.targetId ? ` · ${ev.targetId.slice(0, 12)}…` : ''}
                    </td>
                    <td className="px-5 py-3" style={{ color: 'rgba(148,163,184,0.7)', fontSize: '0.72rem', maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {ev.details ?? ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
