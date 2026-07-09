import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { queryAdminConvex } from '../../../contexts/AdminAuthContext.jsx'

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
          {loading && <p className="p-6" style={{ color: 'rgba(203,213,225,0.7)' }}>Loading…</p>}
          {error && <p className="p-6" style={{ color: '#fca5a5' }}>Error: {error}</p>}
          {!loading && (
            <table className="w-full text-left text-sm">
              <thead>
                <tr style={{ color: 'rgba(148,163,184,0.7)' }}>
                  <th className="px-5 py-3 text-[10px] uppercase tracking-widest">Name</th>
                  <th className="px-5 py-3 text-[10px] uppercase tracking-widest">Slug</th>
                  <th className="px-5 py-3 text-[10px] uppercase tracking-widest">Level</th>
                  <th className="px-5 py-3 text-[10px] uppercase tracking-widest">Target</th>
                  <th className="px-5 py-3 text-[10px] uppercase tracking-widest">Status</th>
                  <th className="px-5 py-3 text-[10px] uppercase tracking-widest"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(s => (
                  <tr key={s._id} className="border-t" style={{ borderColor: 'rgba(148,163,184,0.08)' }}>
                    <td className="px-5 py-3 font-semibold" style={{ color: '#f1f5f9' }}>{s.name}</td>
                    <td className="px-5 py-3" style={{ color: 'rgba(148,163,184,0.8)' }}>{s.slug}</td>
                    <td className="px-5 py-3" style={{ color: '#a5f3fc' }}>{s.level}</td>
                    <td className="px-5 py-3" style={{ color: 'rgba(203,213,225,0.75)' }}>{s.targetLevel ?? '—'}</td>
                    <td className="px-5 py-3">
                      <span className={`sa-badge sa-badge-${s.status === 'active' ? 'committed' : 'queued'}`}>{s.status}</span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <Link
                          to={`/admin/superadmin/students/${s.slug}/heatmap`}
                          className="text-[11px] font-bold uppercase tracking-widest"
                          style={{ color: '#7dd3fc' }}
                        >
                          Heatmap
                        </Link>
                        <Link
                          to={`/admin/student/${s.slug}`}
                          className="text-[11px] font-bold uppercase tracking-widest"
                          style={{ color: '#a78bfa' }}
                        >
                          Open →
                        </Link>
                      </div>
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
