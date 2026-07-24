import { useEffect, useState, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { queryAdminConvex, mutateAdminConvex } from '../../../contexts/AdminAuthContext.jsx'
import { ConsoleEmpty, ConsoleSkeleton, LevelBadge } from './ConsoleStates.jsx'

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
    return <ConsoleSkeleton rows={8} />
  }
  if (error) {
    return <p style={{ color: 'var(--sa-bad)', padding: '2rem' }}>Error: {error}</p>
  }
  if (!group) {
    return <ConsoleEmpty icon="group_off" title="Group not found." />
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
        to="/admin/superadmin/academic/groups"
        className="inline-flex items-center gap-1"
        style={{ color: 'var(--sa-violet-600)', fontSize: 'var(--sa-fs-small)', fontWeight: 600 }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>arrow_back</span>
        All Groups
      </Link>

      {/* Group info card */}
      <div className="sa-card">
        <div className="sa-card-header">
          <div>
            <h2 style={{ fontSize: '1rem', color: 'var(--sa-text)', fontWeight: 700, textTransform: 'none', letterSpacing: '-0.01em' }}>
              {group.name}
            </h2>
            <p className="mt-1" style={{ color: 'var(--sa-text-muted)', fontSize: 'var(--sa-fs-small)' }}>
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
          <div className="sa-card-body" style={{ borderBottom: '1px solid var(--sa-border)' }}>
            <div className="flex items-end gap-3 flex-wrap">
              <div style={{ flex: 1, minWidth: 200 }}>
                <label className="sa-stat-label block mb-1">Select Student</label>
                <select
                  className="sa-select"
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
            <ConsoleEmpty icon="person_off" title="No active members." />
          )}
          {activeMembers.length > 0 && (
            <div className="sa-table-wrap">
              <table className="sa-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Slug</th>
                    <th>Level</th>
                    <th>Role</th>
                    <th>Joined</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {activeMembers.map(({ membership, student }) => (
                    <tr key={membership._id}>
                      <td style={{ fontWeight: 600 }}>{student.name}</td>
                      <td style={{ color: 'var(--sa-text-muted)' }}>{student.slug}</td>
                      <td>{student.level ? <LevelBadge level={student.level} /> : null}</td>
                      <td style={{ color: 'var(--sa-text-muted)' }}>{membership.role || 'member'}</td>
                      <td style={{ color: 'var(--sa-text-muted)' }}>
                        {membership.joinedAt ? new Date(membership.joinedAt).toLocaleDateString() : '---'}
                      </td>
                      <td className="sa-td-right">
                        <div className="flex items-center justify-end gap-3">
                          <Link
                            to={`/admin/student/${student.slug}`}
                            style={{ color: 'var(--sa-violet-600)', fontSize: 'var(--sa-fs-small)', fontWeight: 600 }}
                          >
                            Profile
                          </Link>
                          <button
                            type="button"
                            onClick={() => handleRemoveMember(student._id)}
                            style={{ color: 'var(--sa-bad)', fontSize: 'var(--sa-fs-small)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer' }}
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
            </div>
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
            <div className="sa-table-wrap">
              <table className="sa-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Level</th>
                    <th>Left</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {inactiveMembers.map(({ membership, student }) => (
                    <tr key={membership._id}>
                      <td style={{ color: 'var(--sa-text-muted)' }}>{student.name}</td>
                      <td style={{ color: 'var(--sa-text-muted)' }}>{student.level}</td>
                      <td style={{ color: 'var(--sa-text-muted)' }}>
                        {membership.leftAt ? new Date(membership.leftAt).toLocaleDateString() : '---'}
                      </td>
                      <td className="sa-td-right">
                        <Link
                          to={`/admin/student/${student.slug}`}
                          style={{ color: 'var(--sa-violet-600)', fontSize: 'var(--sa-fs-small)', fontWeight: 600 }}
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
        </div>
      )}
    </div>
  )
}
