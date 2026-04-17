import { useEffect, useState, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { queryAdminConvex, mutateAdminConvex } from '../../../contexts/AdminAuthContext.jsx'

export default function SuperadminGroupDetail() {
  const { groupId } = useParams()
  const [group, setGroup] = useState(null)
  const [members, setMembers] = useState([])
  const [allStudents, setAllStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [adding, setAdding] = useState(false)
  const [selectedStudentId, setSelectedStudentId] = useState('')
  const [actionLoading, setActionLoading] = useState(false)

  const loadData = useCallback(async () => {
    try {
      const [g, m] = await Promise.all([
        queryAdminConvex('groups:getGroup', { groupId }),
        queryAdminConvex('groups:getGroupMembers', { groupId }),
      ])
      setGroup(g)
      setMembers(m)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [groupId])

  useEffect(() => { loadData() }, [loadData])

  const openAddMember = async () => {
    setAdding(true)
    try {
      const students = await queryAdminConvex('students:listStudents', {})
      setAllStudents(students)
    } catch (e) {
      setError(e.message)
    }
  }

  const handleAddMember = async () => {
    if (!selectedStudentId) return
    setActionLoading(true)
    try {
      await mutateAdminConvex('groups:addGroupMember', {
        groupId,
        studentId: selectedStudentId,
      })
      setAdding(false)
      setSelectedStudentId('')
      setLoading(true)
      await loadData()
    } catch (e) {
      setError(e.message)
    } finally {
      setActionLoading(false)
    }
  }

  const handleRemoveMember = async (studentId) => {
    if (!window.confirm('Remove this student from the group?')) return
    setActionLoading(true)
    try {
      await mutateAdminConvex('groups:removeGroupMember', {
        groupId,
        studentId,
      })
      setLoading(true)
      await loadData()
    } catch (e) {
      setError(e.message)
    } finally {
      setActionLoading(false)
    }
  }

  if (loading) {
    return <p style={{ color: 'rgba(203,213,225,0.7)', padding: '2rem' }}>Loading...</p>
  }
  if (error) {
    return <p style={{ color: '#fca5a5', padding: '2rem' }}>Error: {error}</p>
  }
  if (!group) {
    return <p style={{ color: '#fca5a5', padding: '2rem' }}>Group not found.</p>
  }

  const activeMembers = members.filter(m => m.membership.isActive)
  const inactiveMembers = members.filter(m => !m.membership.isActive)

  // Students already in the group (to exclude from the add dropdown)
  const memberStudentIds = new Set(members.map(m => m.membership.studentId))
  const availableStudents = allStudents.filter(s => !memberStudentIds.has(s._id))

  return (
    <div className="space-y-5">
      {/* Back link */}
      <Link
        to="/admin/superadmin/groups"
        className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-widest"
        style={{ color: '#a78bfa' }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>arrow_back</span>
        All Groups
      </Link>

      {/* Group info card */}
      <div className="sa-card">
        <div className="sa-card-header">
          <div>
            <h2 style={{ fontSize: '1rem', color: '#f8fafc', fontWeight: 800, textTransform: 'none', letterSpacing: '-0.01em' }}>
              {group.name}
            </h2>
            <p className="mt-1" style={{ color: 'rgba(148,163,184,0.7)', fontSize: '0.75rem' }}>
              {group.slug} {group.courseId ? ` / Course ${group.courseId}` : ''}
            </p>
          </div>
          <span className={`sa-badge sa-badge-${group.status === 'active' ? 'committed' : 'queued'}`}>
            {group.status || 'unknown'}
          </span>
        </div>
        <div className="sa-card-body">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <p className="sa-stat-label">Level</p>
              <p className="sa-stat-value" style={{ fontSize: '1.1rem' }}>{group.level || '---'}</p>
            </div>
            <div>
              <p className="sa-stat-label">Schedule</p>
              <p className="sa-stat-value" style={{ fontSize: '1.1rem' }}>{group.schedule || '---'}</p>
            </div>
            <div>
              <p className="sa-stat-label">Active Members</p>
              <p className="sa-stat-value" style={{ fontSize: '1.1rem' }}>{activeMembers.length}</p>
            </div>
            <div>
              <p className="sa-stat-label">Teachers</p>
              <p className="sa-stat-value" style={{ fontSize: '1.1rem' }}>
                {group.teachers && group.teachers.length > 0 ? group.teachers.join(', ') : '---'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Members card */}
      <div className="sa-card">
        <div className="sa-card-header">
          <h2>Members &middot; {activeMembers.length}</h2>
          <button
            type="button"
            className="sa-btn sa-btn-primary"
            onClick={openAddMember}
            disabled={adding}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>person_add</span>
            Add Member
          </button>
        </div>

        {/* Add member form */}
        {adding && (
          <div className="sa-card-body" style={{ borderBottom: '1px solid rgba(148,163,184,0.1)' }}>
            <div className="flex items-end gap-3 flex-wrap">
              <div style={{ flex: 1, minWidth: 200 }}>
                <label className="sa-stat-label block mb-1">Select Student</label>
                <select
                  className="sa-input"
                  value={selectedStudentId}
                  onChange={e => setSelectedStudentId(e.target.value)}
                >
                  <option value="">-- Choose a student --</option>
                  {availableStudents.map(s => (
                    <option key={s._id} value={s._id}>{s.name} ({s.slug}) - {s.level}</option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                className="sa-btn sa-btn-primary"
                onClick={handleAddMember}
                disabled={!selectedStudentId || actionLoading}
              >
                {actionLoading ? 'Adding...' : 'Add'}
              </button>
              <button
                type="button"
                className="sa-btn sa-btn-ghost"
                onClick={() => { setAdding(false); setSelectedStudentId('') }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="sa-card-body p-0">
          {activeMembers.length === 0 && (
            <p className="p-6" style={{ color: 'rgba(203,213,225,0.7)' }}>No active members.</p>
          )}
          {activeMembers.length > 0 && (
            <table className="w-full text-left text-sm">
              <thead>
                <tr style={{ color: 'rgba(148,163,184,0.7)' }}>
                  <th className="px-5 py-3 text-[10px] uppercase tracking-widest">Name</th>
                  <th className="px-5 py-3 text-[10px] uppercase tracking-widest">Slug</th>
                  <th className="px-5 py-3 text-[10px] uppercase tracking-widest">Level</th>
                  <th className="px-5 py-3 text-[10px] uppercase tracking-widest">Role</th>
                  <th className="px-5 py-3 text-[10px] uppercase tracking-widest">Joined</th>
                  <th className="px-5 py-3 text-[10px] uppercase tracking-widest"></th>
                </tr>
              </thead>
              <tbody>
                {activeMembers.map(({ membership, student }) => (
                  <tr key={membership._id} className="border-t" style={{ borderColor: 'rgba(148,163,184,0.08)' }}>
                    <td className="px-5 py-3 font-semibold" style={{ color: '#f1f5f9' }}>{student.name}</td>
                    <td className="px-5 py-3" style={{ color: 'rgba(148,163,184,0.8)' }}>{student.slug}</td>
                    <td className="px-5 py-3" style={{ color: '#a5f3fc' }}>{student.level}</td>
                    <td className="px-5 py-3" style={{ color: 'rgba(203,213,225,0.75)' }}>{membership.role || 'member'}</td>
                    <td className="px-5 py-3" style={{ color: 'rgba(203,213,225,0.75)' }}>
                      {membership.joinedAt ? new Date(membership.joinedAt).toLocaleDateString() : '---'}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <Link
                          to={`/admin/student/${student.slug}`}
                          className="text-[11px] font-bold uppercase tracking-widest"
                          style={{ color: '#a78bfa' }}
                        >
                          Profile
                        </Link>
                        <button
                          type="button"
                          onClick={() => handleRemoveMember(student._id)}
                          className="text-[11px] font-bold uppercase tracking-widest"
                          style={{ color: '#f87171', background: 'none', border: 'none', cursor: 'pointer' }}
                          disabled={actionLoading}
                        >
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Inactive / former members */}
      {inactiveMembers.length > 0 && (
        <div className="sa-card">
          <div className="sa-card-header">
            <h2>Former Members &middot; {inactiveMembers.length}</h2>
          </div>
          <div className="sa-card-body p-0">
            <table className="w-full text-left text-sm">
              <thead>
                <tr style={{ color: 'rgba(148,163,184,0.7)' }}>
                  <th className="px-5 py-3 text-[10px] uppercase tracking-widest">Name</th>
                  <th className="px-5 py-3 text-[10px] uppercase tracking-widest">Level</th>
                  <th className="px-5 py-3 text-[10px] uppercase tracking-widest">Left</th>
                  <th className="px-5 py-3 text-[10px] uppercase tracking-widest"></th>
                </tr>
              </thead>
              <tbody>
                {inactiveMembers.map(({ membership, student }) => (
                  <tr key={membership._id} className="border-t" style={{ borderColor: 'rgba(148,163,184,0.08)' }}>
                    <td className="px-5 py-3" style={{ color: 'rgba(203,213,225,0.6)' }}>{student.name}</td>
                    <td className="px-5 py-3" style={{ color: 'rgba(148,163,184,0.5)' }}>{student.level}</td>
                    <td className="px-5 py-3" style={{ color: 'rgba(148,163,184,0.5)' }}>
                      {membership.leftAt ? new Date(membership.leftAt).toLocaleDateString() : '---'}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Link
                        to={`/admin/student/${student.slug}`}
                        className="text-[11px] font-bold uppercase tracking-widest"
                        style={{ color: 'rgba(167,139,250,0.5)' }}
                      >
                        Profile
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
