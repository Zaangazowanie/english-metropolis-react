import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { queryAdminConvex } from '../../../contexts/AdminAuthContext.jsx'
import { ConsoleEmpty, ConsoleSkeleton, LevelBadge } from './ConsoleStates.jsx'

export default function SuperadminGroups() {
  const [groups, setGroups] = useState([])
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let alive = true
    queryAdminConvex('groups:listGroupsWithCounts', {})
      .then(d => { if (alive) setGroups(d) })
      .catch(e => { if (alive) setError(e.message) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  // Archived groups (departed clients, test groups) stay out of the list.
  const visible = groups.filter(g => g.status !== 'archived')
  const needle = q.trim().toLowerCase()
  const filtered = needle
    ? visible.filter(g =>
        (g.name + ' ' + (g.slug || '') + ' ' + (g.level || '') + ' ' + (g.status || '')).toLowerCase().includes(needle)
      )
    : visible

  const activeGroups = filtered.filter(g => g.status === 'active')
  const otherGroups = filtered.filter(g => g.status !== 'active')
  const sorted = [...activeGroups, ...otherGroups]

  return (
    <div className="space-y-5">
      <div className="sa-card">
        <div className="sa-card-header">
          <h2>All Groups &middot; {filtered.length}</h2>
          <input
            type="search"
            className="sa-input"
            placeholder="Search name / slug / level..."
            value={q}
            onChange={e => setQ(e.target.value)}
            style={{ maxWidth: 320 }}
          />
        </div>
        <div className="sa-card-body p-0">
          {loading && <ConsoleSkeleton rows={8} />}
          {error && <p className="p-6" style={{ color: 'var(--sa-bad)' }}>Error: {error}</p>}
          {!loading && !error && sorted.length === 0 && (
            <ConsoleEmpty icon="groups" title="No groups found." />
          )}
          {!loading && sorted.length > 0 && (
            <div className="sa-table-wrap">
              <table className="sa-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Slug</th>
                    <th>Level</th>
                    <th>Schedule</th>
                    <th>Members</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map(g => (
                    <tr key={g._id}>
                      <td style={{ fontWeight: 600 }}>{g.name}</td>
                      <td style={{ color: 'var(--sa-text-muted)' }}>{g.slug}</td>
                      <td>{g.level ? <LevelBadge level={g.level} /> : '---'}</td>
                      <td style={{ color: 'var(--sa-text-muted)' }}>{g.schedule ?? '---'}</td>
                      <td>
                        <span style={{ color: 'var(--sa-violet-600)', fontWeight: 700 }}>{g.activeCount}</span>
                        {g.memberCount !== g.activeCount && (
                          <span style={{ color: 'var(--sa-text-muted)', marginLeft: 4 }}>/ {g.memberCount}</span>
                        )}
                      </td>
                      <td>
                        <span className={`sa-badge sa-badge-${g.status === 'active' ? 'committed' : 'queued'}`}>
                          {g.status || 'unknown'}
                        </span>
                      </td>
                      <td className="sa-td-right">
                        <Link
                          to={`/admin/superadmin/academic/groups/${g._id}`}
                          style={{ color: 'var(--sa-violet-600)', fontSize: 'var(--sa-fs-small)', fontWeight: 600 }}
                        >
                          Open &rarr;
                        </Link>
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
