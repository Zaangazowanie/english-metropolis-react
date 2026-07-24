import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { queryAdminConvex } from '../../../contexts/AdminAuthContext.jsx'
import { ConsoleEmpty, ConsoleSkeleton } from './ConsoleStates.jsx'

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
    let alive = true
    setLoading(true)
    const f = FILTERS.find(x => x.key === filter)
    queryAdminConvex('ingestion:listIngestionJobs', { limit: 100, status: f?.status })
      .then(d => { if (alive) setJobs(d) })
      .catch(e => { if (alive) setError(e.message) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [filter])

  return (
    <div className="space-y-5">
      <div className="sa-card">
        <div className="sa-card-header">
          <h2>Ingestion queue</h2>
          <Link to="/admin/superadmin/curriculum/ingest" className="sa-btn sa-btn-primary">
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
                className={`sa-chip${filter === f.key ? ' is-active' : ''}`}
                onClick={() => setFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>

          {loading && <ConsoleSkeleton rows={6} />}
          {error && <p style={{ color: 'var(--sa-bad)' }}>Error: {error}</p>}

          {!loading && jobs.length === 0 && (
            <ConsoleEmpty icon="inbox" title="No jobs in this bucket." />
          )}

          {jobs.length > 0 && (
            <div className="sa-table-wrap">
              <table className="sa-table">
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Student</th>
                    <th>Date</th>
                    <th>Title</th>
                    <th>Score</th>
                    <th>Source</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map(job => (
                    <tr key={job._id}>
                      <td>
                        <Link to={`/admin/superadmin/curriculum/ingest/${job._id}`}>
                          <span className={`sa-badge sa-badge-${job.status}`}>{job.status.replace('_', ' ')}</span>
                        </Link>
                      </td>
                      <td>{job.studentName ?? '—'}</td>
                      <td style={{ color: 'var(--sa-text-muted)' }}>{job.detectedDate ?? '—'}</td>
                      <td style={{ color: 'var(--sa-text-muted)', maxWidth: '20rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {job.detectedTitle ?? '—'}
                      </td>
                      <td>
                        {job.overallScore != null ? `${job.overallScore} · ${job.cefrBand}` : '—'}
                      </td>
                      <td style={{ color: 'var(--sa-text-muted)', fontSize: 'var(--sa-fs-small)' }}>
                        {job.sourceKind.replace('_', ' ')}
                      </td>
                      <td style={{ color: 'var(--sa-text-muted)', fontSize: 'var(--sa-fs-small)' }}>
                        {new Date(job.createdAt).toLocaleString()}
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
