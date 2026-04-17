import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { queryAdminConvex } from '../../../contexts/AdminAuthContext.jsx'

const FILTERS = [
  { key: 'all', label: 'All', status: undefined },
  { key: 'queued', label: 'Queued', status: 'queued' },
  { key: 'processing', label: 'Processing', status: 'processing' },
  { key: 'awaiting_review', label: 'Awaiting review', status: 'awaiting_review' },
  { key: 'committed', label: 'Committed', status: 'committed' },
  { key: 'failed', label: 'Failed', status: 'failed' },
]

export default function SuperadminJobs() {
  const [filter, setFilter] = useState('all')
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    setLoading(true)
    const f = FILTERS.find(x => x.key === filter)
    queryAdminConvex('ingestion:listIngestionJobs', { limit: 100, status: f?.status })
      .then(setJobs)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [filter])

  return (
    <div className="space-y-5">
      <div className="sa-card">
        <div className="sa-card-header">
          <h2>Ingestion queue</h2>
          <Link to="/admin/superadmin/ingest" className="sa-btn sa-btn-primary">
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>upload_file</span>
            New ingestion
          </Link>
        </div>
        <div className="sa-card-body">
          <div className="mb-4 flex flex-wrap gap-2">
            {FILTERS.map(f => (
              <button
                key={f.key}
                type="button"
                className={`sa-btn ${filter === f.key ? 'sa-btn-primary' : 'sa-btn-ghost'}`}
                onClick={() => setFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>

          {loading && <p style={{ color: 'rgba(203,213,225,0.7)' }}>Loading…</p>}
          {error && <p style={{ color: '#fca5a5' }}>Error: {error}</p>}

          {!loading && jobs.length === 0 && (
            <p style={{ color: 'rgba(148,163,184,0.7)' }}>No jobs in this bucket.</p>
          )}

          {jobs.length > 0 && (
            <table className="w-full text-left text-sm">
              <thead>
                <tr style={{ color: 'rgba(148,163,184,0.7)' }}>
                  <th className="px-3 py-3 text-[10px] uppercase tracking-widest">Status</th>
                  <th className="px-3 py-3 text-[10px] uppercase tracking-widest">Student</th>
                  <th className="px-3 py-3 text-[10px] uppercase tracking-widest">Date</th>
                  <th className="px-3 py-3 text-[10px] uppercase tracking-widest">Title</th>
                  <th className="px-3 py-3 text-[10px] uppercase tracking-widest">Score</th>
                  <th className="px-3 py-3 text-[10px] uppercase tracking-widest">Source</th>
                  <th className="px-3 py-3 text-[10px] uppercase tracking-widest">Created</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map(job => (
                  <tr key={job._id} className="border-t" style={{ borderColor: 'rgba(148,163,184,0.08)' }}>
                    <td className="px-3 py-3">
                      <Link to={`/admin/superadmin/ingest/${job._id}`}>
                        <span className={`sa-badge sa-badge-${job.status}`}>{job.status.replace('_', ' ')}</span>
                      </Link>
                    </td>
                    <td className="px-3 py-3" style={{ color: '#e2e8f0' }}>{job.studentName ?? '—'}</td>
                    <td className="px-3 py-3" style={{ color: 'rgba(203,213,225,0.75)' }}>{job.detectedDate ?? '—'}</td>
                    <td className="px-3 py-3" style={{ color: 'rgba(203,213,225,0.75)', maxWidth: '20rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {job.detectedTitle ?? '—'}
                    </td>
                    <td className="px-3 py-3" style={{ color: '#cbd5e1' }}>
                      {job.overallScore != null ? `${job.overallScore} · ${job.cefrBand}` : '—'}
                    </td>
                    <td className="px-3 py-3" style={{ color: 'rgba(148,163,184,0.7)', fontSize: '0.72rem' }}>
                      {job.sourceKind.replace('_', ' ')}
                    </td>
                    <td className="px-3 py-3" style={{ color: 'rgba(148,163,184,0.6)', fontSize: '0.72rem' }}>
                      {new Date(job.createdAt).toLocaleString()}
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
