import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { queryAdminConvex } from '../../../contexts/AdminAuthContext.jsx'
import { ConsoleSkeleton, LevelBadge } from './ConsoleStates.jsx'

export default function SuperadminStudents() {
  const [students, setStudents] = useState([])
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let alive = true
    queryAdminConvex('students:listStudents', {})
      .then(d => { if (alive) setStudents(d) })
      .catch(e => { if (alive) setError(e.message) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  // Archived students (departed clients, test records) stay out of the
  // roster entirely — the active roster is Conversa + Mike's PVT students.
  const roster = students.filter(s => s.status !== 'archived')
  const needle = q.trim().toLowerCase()
  const filtered = needle
    ? roster.filter(s => (s.name + ' ' + (s.slug || '') + ' ' + (s.level || '')).toLowerCase().includes(needle))
    : roster

  return (
    <div className="space-y-5">
      <div className="sa-card">
        <div className="sa-card-header">
          <h2>All students · {filtered.length}</h2>
          <input
            type="search"
            className="sa-input"
            placeholder="Search name / slug / level…"
            value={q}
            onChange={e => setQ(e.target.value)}
            style={{ maxWidth: 320 }}
          />
        </div>
        <div className="sa-card-body p-0">
          {loading && <ConsoleSkeleton rows={8} />}
          {error && <p className="p-6" style={{ color: 'var(--sa-bad)' }}>Error: {error}</p>}
          {!loading && (
            <div className="sa-table-wrap">
              <table className="sa-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Slug</th>
                    <th>Level</th>
                    <th>Target</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(s => (
                    <tr key={s._id}>
                      <td style={{ fontWeight: 600 }}>{s.name}</td>
                      <td style={{ color: 'var(--sa-text-muted)' }}>{s.slug}</td>
                      <td>{s.level ? <LevelBadge level={s.level} /> : null}</td>
                      <td style={{ color: 'var(--sa-text-muted)' }}>{s.targetLevel ?? '—'}</td>
                      <td>
                        <span className={`sa-badge sa-badge-${s.status === 'active' ? 'committed' : 'queued'}`}>{s.status}</span>
                      </td>
                      <td className="sa-td-right">
                        <div className="flex items-center justify-end gap-3">
                          <Link
                            to={`/admin/superadmin/academic/roster/${s.slug}/heatmap`}
                            style={{ color: 'var(--sa-text-muted)', fontSize: 'var(--sa-fs-small)', fontWeight: 600 }}
                          >
                            Heatmap
                          </Link>
                          <Link
                            to={`/admin/student/${s.slug}`}
                            style={{ color: 'var(--sa-violet-600)', fontSize: 'var(--sa-fs-small)', fontWeight: 600 }}
                          >
                            Open →
                          </Link>
                        </div>
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
