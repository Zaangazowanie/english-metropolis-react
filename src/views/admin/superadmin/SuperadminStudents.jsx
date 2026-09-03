import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { queryAdminConvex } from '../../../contexts/AdminAuthContext.jsx'
import { ConsoleSkeleton, LevelBadge } from './ConsoleStates.jsx'
function initialsOf(name) {
  return (name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase()
}


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
      <div className="sa-page-header">
        <div>
          <h1>Learning records</h1>
          <p>Every active learner with their level and target. Open a record for lessons, keywords and analysis; the heatmap shows what they have practised.</p>
        </div>
      </div>
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
            <div className="sa3-list" style={{ padding: 14 }}>
              {filtered.map(s => (
                <article className="sa3-row" key={s._id}>
                  <div className="sa3-avatar" aria-hidden="true">{initialsOf(s.name)}</div>
                  <div>
                    <h3 className="sa3-name">{s.name}</h3>
                    <div className="sa3-sub">
                      {s.level ? <LevelBadge level={s.level} /> : <span className="sa-badge">no level yet</span>}
                      {s.targetLevel && <span className="sa-badge">aiming for {s.targetLevel}</span>}
                      <span className={`sa-badge sa-badge-${s.status === 'active' ? 'committed' : 'queued'}`}>{s.status}</span>
                      <code>{s.slug}</code>
                    </div>
                  </div>
                  <div className="sa3-facts">
                    <div><span>Level </span><strong>{s.level || '—'}</strong>{s.targetLevel ? <span> → target <strong>{s.targetLevel}</strong></span> : null}</div>
                  </div>
                  <div className="sa3-actions">
                    <Link className="sa-btn sa-btn-primary sa-btn-sm" to={`/admin/student/${s.slug}`}>
                      <span className="material-symbols-outlined" aria-hidden="true">open_in_new</span>Open record
                    </Link>
                    <Link className="sa-btn sa-btn-ghost sa-btn-sm" to={`/admin/superadmin/academic/roster/${s.slug}/heatmap`}>
                      <span className="material-symbols-outlined" aria-hidden="true">grid_view</span>Heatmap
                    </Link>
                    <Link className="sa-btn sa-btn-ghost sa-btn-sm" to={`/admin/superadmin/school/preview?student=${encodeURIComponent(s.slug)}`}>
                      <span className="material-symbols-outlined" aria-hidden="true">visibility</span>Student view
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
