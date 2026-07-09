import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { queryAdminConvex } from '../../../contexts/AdminAuthContext.jsx'

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
          {loading && <p className="p-6" style={{ color: 'rgba(203,213,225,0.7)' }}>Loading...</p>}
          {error && <p className="p-6" style={{ color: '#fca5a5' }}>Error: {error}</p>}
          {!loading && !error && sorted.length === 0 && (
            <p className="p-6" style={{ color: 'rgba(203,213,225,0.7)' }}>No groups found.</p>
          )}
          {!loading && sorted.length > 0 && (
            <table className="w-full text-left text-sm">
              <thead>
                <tr style={{ color: 'rgba(148,163,184,0.7)' }}>
                  <th className="px-5 py-3 text-[10px] uppercase tracking-widest">Name</th>
                  <th className="px-5 py-3 text-[10px] uppercase tracking-widest">Slug</th>
                  <th className="px-5 py-3 text-[10px] uppercase tracking-widest">Level</th>
                  <th className="px-5 py-3 text-[10px] uppercase tracking-widest">Schedule</th>
                  <th className="px-5 py-3 text-[10px] uppercase tracking-widest">Members</th>
                  <th className="px-5 py-3 text-[10px] uppercase tracking-widest">Status</th>
                  <th className="px-5 py-3 text-[10px] uppercase tracking-widest"></th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(g => (
                  <tr key={g._id} className="border-t" style={{ borderColor: 'rgba(148,163,184,0.08)' }}>
                    <td className="px-5 py-3 font-semibold" style={{ color: '#f1f5f9' }}>{g.name}</td>
                    <td className="px-5 py-3" style={{ color: 'rgba(148,163,184,0.8)' }}>{g.slug}</td>
                    <td className="px-5 py-3" style={{ color: '#a5f3fc' }}>{g.level ?? '---'}</td>
                    <td className="px-5 py-3" style={{ color: 'rgba(203,213,225,0.75)' }}>{g.schedule ?? '---'}</td>
                    <td className="px-5 py-3">
                      <span style={{ color: '#c4b5fd', fontWeight: 700 }}>{g.activeCount}</span>
                      {g.memberCount !== g.activeCount && (
                        <span style={{ color: 'rgba(148,163,184,0.5)', marginLeft: 4 }}>/ {g.memberCount}</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`sa-badge sa-badge-${g.status === 'active' ? 'committed' : 'queued'}`}>
                        {g.status || 'unknown'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Link
                        to={`/admin/superadmin/groups/${g._id}`}
                        className="text-[11px] font-bold uppercase tracking-widest"
                        style={{ color: '#a78bfa' }}
                      >
                        Open &rarr;
                      </Link>
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
