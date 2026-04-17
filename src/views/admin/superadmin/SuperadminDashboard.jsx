import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { queryAdminConvex } from '../../../contexts/AdminAuthContext.jsx'

export default function SuperadminDashboard() {
  const [stats, setStats] = useState(null)
  const [recentJobs, setRecentJobs] = useState([])
  const [orgs, setOrgs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [ingestionStats, jobs, organizations] = await Promise.all([
          queryAdminConvex('ingestion:getIngestionStats', {}),
          queryAdminConvex('ingestion:listIngestionJobs', { limit: 10 }),
          queryAdminConvex('students:listOrganizations', {}),
        ])
        if (cancelled) return
        setStats(ingestionStats)
        setRecentJobs(jobs)
        setOrgs(organizations)
        setLoading(false)
      } catch (e) {
        if (!cancelled) {
          setError(e.message || String(e))
          setLoading(false)
        }
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  if (loading) return <p style={{ color: 'rgba(203,213,225,0.7)' }}>Loading dashboard…</p>
  if (error) return <p style={{ color: '#fca5a5' }}>Error: {error}</p>

  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-3 text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: 'rgba(203,213,225,0.75)' }}>
          Ingestion pipeline
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            { key: 'queued', label: 'Queued', tone: '#cbd5e1' },
            { key: 'processing', label: 'Processing', tone: '#7dd3fc' },
            { key: 'awaiting_review', label: 'Awaiting review', tone: '#fcd34d' },
            { key: 'committed', label: 'Committed', tone: '#86efac' },
            { key: 'failed', label: 'Failed', tone: '#fca5a5' },
          ].map(row => (
            <div key={row.key} className="sa-card">
              <div className="sa-card-body">
                <p className="sa-stat-label" style={{ color: row.tone }}>{row.label}</p>
                <p className="sa-stat-value">{stats?.[row.key] ?? 0}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <div className="sa-card lg:col-span-2">
          <div className="sa-card-header">
            <h2>Recent ingestion jobs</h2>
            <Link to="/admin/superadmin/jobs" className="text-xs uppercase tracking-widest font-bold" style={{ color: '#a5f3fc' }}>
              See all →
            </Link>
          </div>
          <div className="sa-card-body p-0">
            {recentJobs.length === 0 ? (
              <p style={{ padding: '2rem', textAlign: 'center', color: 'rgba(148,163,184,0.7)' }}>
                No ingestion jobs yet. Try <Link to="/admin/superadmin/ingest" style={{ color: '#a78bfa', textDecoration: 'underline' }}>ingesting a lesson</Link>.
              </p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr style={{ color: 'rgba(148,163,184,0.7)' }}>
                    <th className="px-5 py-3 text-[10px] uppercase tracking-widest">Status</th>
                    <th className="px-5 py-3 text-[10px] uppercase tracking-widest">Student</th>
                    <th className="px-5 py-3 text-[10px] uppercase tracking-widest">Date</th>
                    <th className="px-5 py-3 text-[10px] uppercase tracking-widest">Score</th>
                    <th className="px-5 py-3 text-[10px] uppercase tracking-widest">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {recentJobs.map(job => (
                    <tr key={job._id} className="border-t" style={{ borderColor: 'rgba(148,163,184,0.08)' }}>
                      <td className="px-5 py-3">
                        <Link to={`/admin/superadmin/ingest/${job._id}`}>
                          <span className={`sa-badge sa-badge-${job.status}`}>{job.status.replace('_', ' ')}</span>
                        </Link>
                      </td>
                      <td className="px-5 py-3" style={{ color: '#e2e8f0' }}>
                        {job.studentName ?? <span style={{ color: 'rgba(148,163,184,0.6)' }}>—</span>}
                      </td>
                      <td className="px-5 py-3" style={{ color: 'rgba(203,213,225,0.75)' }}>
                        {job.detectedDate ?? '—'}
                      </td>
                      <td className="px-5 py-3" style={{ color: '#cbd5e1' }}>
                        {job.overallScore != null ? `${job.overallScore}/100 · ${job.cefrBand}` : '—'}
                      </td>
                      <td className="px-5 py-3" style={{ color: 'rgba(148,163,184,0.7)', fontSize: '0.75rem' }}>
                        {job.sourceKind.replace('_', ' ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="sa-card">
          <div className="sa-card-header">
            <h2>Organizations</h2>
          </div>
          <div className="sa-card-body">
            {orgs.length === 0 ? (
              <p style={{ color: 'rgba(148,163,184,0.7)' }}>No organizations yet.</p>
            ) : (
              <ul className="space-y-3">
                {orgs.map(o => (
                  <li key={o._id} className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold" style={{ color: '#f1f5f9' }}>{o.name}</p>
                      <p className="text-[11px]" style={{ color: 'rgba(148,163,184,0.7)' }}>
                        {o.type} · {o.status}
                      </p>
                    </div>
                    <span className="sa-badge sa-badge-committed">{o.slug}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      <section className="sa-card">
        <div className="sa-card-body">
          <h2 className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: 'rgba(203,213,225,0.75)' }}>
            Quick actions
          </h2>
          <div className="flex flex-wrap gap-3">
            <Link to="/admin/superadmin/ingest" className="sa-btn sa-btn-primary">
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>upload_file</span>
              Ingest new lesson
            </Link>
            <Link to="/admin/superadmin/students" className="sa-btn sa-btn-ghost">
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>groups</span>
              Browse all students
            </Link>
            <Link to="/admin/superadmin/audit" className="sa-btn sa-btn-ghost">
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>history</span>
              Audit log
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
