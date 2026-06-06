import { useEffect, useState, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { queryAdminConvex, mutateAdminConvex, useAdminAuth } from '../../contexts/AdminAuthContext.jsx'
import { CefrBadge, Modal } from '../../components/analytics/AnalyticsPrimitives.jsx'

const COURSE_STATUS = [
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
]

const EMPTY_FORM = { name: '', level: '', schedule: '', status: 'active' }

function Label({ children }) {
  return <span className="ca-label">{children}</span>
}

const inputCls = 'ca-field mt-2'

export default function AdminCourses() {
  const { adminUser } = useAdminAuth()
  const [state, setState] = useState({ loading: true, error: '', groups: [], students: [] })

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  // Expanded course detail (members) keyed by group id.
  const [expandedId, setExpandedId] = useState(null)
  const [members, setMembers] = useState([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [addStudentId, setAddStudentId] = useState('')

  const load = useCallback(async () => {
    setState(s => ({ ...s, loading: true, error: '' }))
    try {
      const [groups, students] = await Promise.all([
        queryAdminConvex('groups:listGroupsWithCounts', { organizationId: adminUser?.organizationId }),
        queryAdminConvex('students:listStudents', { organizationId: adminUser?.organizationId }),
      ])
      setState({ loading: false, error: '', groups: groups || [], students: students || [] })
    } catch (err) {
      setState({ loading: false, error: 'Failed to load courses.', groups: [], students: [] })
    }
  }, [adminUser?.organizationId])

  useEffect(() => { load() }, [load])

  const loadMembers = useCallback(async (groupId) => {
    setMembersLoading(true)
    try {
      const rows = await queryAdminConvex('groups:getGroupMembers', { groupId })
      setMembers(rows || [])
    } catch (err) {
      setMembers([])
    } finally {
      setMembersLoading(false)
    }
  }, [])

  function toggleExpand(group) {
    if (expandedId === group._id) {
      setExpandedId(null)
      setMembers([])
      return
    }
    setExpandedId(group._id)
    setAddStudentId('')
    loadMembers(group._id)
  }

  function openCreate() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setFormError('')
    setFormOpen(true)
  }

  function openEdit(group) {
    setEditing(group)
    setForm({
      name: group.name || '',
      level: group.level || '',
      schedule: group.schedule || '',
      status: group.status || 'active',
    })
    setFormError('')
    setFormOpen(true)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setFormError('')
    if (!form.name.trim()) { setFormError('Course name is required.'); return }
    setSaving(true)
    try {
      if (editing) {
        await mutateAdminConvex('groups:updateGroup', {
          groupId: editing._id,
          name: form.name.trim(),
          level: form.level || undefined,
          schedule: form.schedule || undefined,
          status: form.status,
        })
      } else {
        await mutateAdminConvex('students:createGroup', {
          name: form.name.trim(),
          level: form.level || undefined,
          schedule: form.schedule || undefined,
          status: form.status,
        })
      }
      setFormOpen(false)
      await load()
    } catch (err) {
      setFormError('Could not save the course. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function handleAddMember(groupId) {
    if (!addStudentId) return
    try {
      await mutateAdminConvex('groups:addGroupMember', { groupId, studentId: addStudentId })
      // Keep students.groupId in step with the join table so the learner's
      // course chip shows consistently on the Students roster + detail page.
      try { await mutateAdminConvex('students:updateStudent', { studentId: addStudentId, groupId }) } catch { /* best-effort */ }
      setAddStudentId('')
      await loadMembers(groupId)
      await load()
    } catch (err) {
      setState(s => ({ ...s, error: 'Failed to add student to course.' }))
    }
  }

  async function handleRemoveMember(groupId, studentId) {
    try {
      await mutateAdminConvex('groups:removeGroupMember', { groupId, studentId })
      await loadMembers(groupId)
      await load()
    } catch (err) {
      setState(s => ({ ...s, error: 'Failed to remove student from course.' }))
    }
  }

  // Students in the org not already active members of the expanded group.
  const addableStudents = useMemo(() => {
    const memberIds = new Set(members.filter(m => m.membership?.isActive).map(m => String(m.student?._id)))
    return state.students
      .filter(s => s.status !== 'archived')
      .filter(s => !memberIds.has(String(s._id)))
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  }, [members, state.students])

  if (state.loading) {
    return (
      <div className="space-y-6">
        <div className="glass-panel rounded-[2rem] border border-white/50 px-6 py-6 editorial-shadow animate-pulse">
          <div className="h-4 w-32 rounded bg-slate-200" />
          <div className="mt-4 h-8 w-48 rounded bg-slate-200" />
        </div>
        <div className="glass-panel rounded-[2rem] border border-white/50 px-6 py-6 editorial-shadow">
          {[1, 2, 3].map(i => <div key={i} className="mt-3 h-16 rounded-[1.25rem] bg-slate-100 animate-pulse" />)}
        </div>
      </div>
    )
  }

  if (state.error && !state.groups.length) {
    return (
      <div className="glass-panel rounded-[2rem] border border-rose-200 bg-rose-50/50 px-6 py-6 editorial-shadow">
        <span className="material-symbols-outlined text-3xl text-rose-400">error</span>
        <h2 className="mt-3 font-headline text-2xl text-rose-900">Unable to load courses</h2>
        <p className="mt-2 text-sm text-rose-700">{state.error}</p>
        <button onClick={load} className="mt-4 rounded-full border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 transition cursor-pointer">Retry</button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* ── Editorial hero ─────────────────────────────────────── */}
      <section className="glass-panel relative overflow-hidden rounded-[2rem] border border-white/50 px-6 py-8 sm:px-10 editorial-shadow">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background: `
              radial-gradient(ellipse 50% 70% at 95% 0%, rgba(14,165,233,0.10), transparent 60%),
              radial-gradient(ellipse 40% 50% at 5% 100%, rgba(37,99,235,0.07), transparent 55%)`,
          }}
        />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="font-label text-xs font-bold uppercase tracking-[0.28em] text-sky-600">Administration · Courses</p>
            <h1 className="mt-3 font-headline text-4xl sm:text-5xl text-slate-900 leading-[1.05]">
              Courses<span className="italic text-sky-600">.</span>
            </h1>
            <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-slate-600">
              {state.groups.length} course{state.groups.length === 1 ? '' : 's'} on the roster. Manage class groups, schedules and enrolment.
            </p>
          </div>
          <button onClick={openCreate} className="ca-btn ca-btn--primary">
            <span className="material-symbols-outlined text-lg">add</span>
            Create course
          </button>
        </div>
      </section>

      {/* ── Course list ────────────────────────────────────────── */}
      <section className="glass-panel rounded-[2rem] border border-white/50 px-5 py-6 editorial-shadow sm:px-8">
        <div className="space-y-3">
          {state.groups.length ? state.groups
            .slice()
            .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
            .map((group, idx) => {
              const isOpen = expandedId === group._id
              return (
                <div
                  key={group._id}
                  className="metric-card-enter liquid-glass-card rounded-[1.5rem] border border-white/60 transition-all duration-300 hover:border-sky-200"
                  style={{ animationDelay: `${Math.min(idx, 12) * 60}ms` }}
                >
                  <div className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <button type="button" onClick={() => toggleExpand(group)} className="flex items-center gap-4 min-w-0 flex-1 text-left cursor-pointer">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[1rem] bg-gradient-to-br from-sky-500 to-blue-700 shadow-[0_14px_30px_-16px_rgba(2,132,199,0.9)]">
                        <span className="material-symbols-outlined text-white">auto_stories</span>
                      </div>
                      <div className="min-w-0">
                        <p className="font-headline text-lg text-slate-900 truncate">{group.name}</p>
                        <p className="text-xs text-slate-400 truncate">{group.schedule || 'No schedule set'}</p>
                      </div>
                    </button>
                    <div className="flex items-center gap-4 flex-wrap">
                      {group.level && <CefrBadge band={group.level} />}
                      <div className="text-center">
                        <p className="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Members</p>
                        <p className="mt-0.5 ca-num text-xl text-slate-900">{group.activeCount ?? group.memberCount ?? 0}</p>
                      </div>
                      <CourseStatusPill status={group.status} />
                      <button type="button" onClick={() => openEdit(group)} title="Edit" aria-label="Edit course" className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200/70 bg-white/80 text-slate-500 hover:bg-sky-50 hover:text-sky-700 transition cursor-pointer">
                        <span className="material-symbols-outlined text-lg">edit</span>
                      </button>
                      <button type="button" onClick={() => toggleExpand(group)} title="Members" aria-label="Toggle members" className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200/70 bg-white/80 text-slate-500 hover:bg-sky-50 hover:text-sky-700 transition cursor-pointer">
                        <span className="material-symbols-outlined text-lg">{isOpen ? 'expand_less' : 'expand_more'}</span>
                      </button>
                    </div>
                  </div>

                  {isOpen && (
                    <div className="border-t border-slate-100 px-5 py-4">
                      <p className="font-label text-xs font-bold uppercase tracking-[0.2em] text-sky-600">Members</p>
                      {membersLoading ? (
                        <p className="mt-3 text-sm text-slate-400">Loading members…</p>
                      ) : (
                        <div className="mt-3 space-y-2">
                          {members.filter(m => m.membership?.isActive).length ? members.filter(m => m.membership?.isActive).map(m => (
                            <div key={m.membership._id} className="flex items-center justify-between gap-3 rounded-[1rem] border border-white/60 bg-white/70 px-4 py-2.5">
                              <div className="flex items-center gap-3 min-w-0">
                                <span className="material-symbols-outlined text-slate-400 text-base">person</span>
                                <span className="text-sm font-semibold text-slate-800 truncate">{m.student?.name}</span>
                                {m.student?.level && <CefrBadge band={m.student.level} />}
                              </div>
                              <button type="button" onClick={() => handleRemoveMember(group._id, m.student._id)} title="Remove" aria-label="Remove member" className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200/70 bg-white text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition cursor-pointer">
                                <span className="material-symbols-outlined text-base">close</span>
                              </button>
                            </div>
                          )) : (
                            <p className="text-sm text-slate-400">No members yet.</p>
                          )}
                        </div>
                      )}
                      <div className="mt-4 flex items-center gap-2">
                        <select value={addStudentId} onChange={e => setAddStudentId(e.target.value)} className="ca-field flex-1">
                          <option value="">Add a student…</option>
                          {addableStudents.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
                        </select>
                        <button type="button" disabled={!addStudentId} onClick={() => handleAddMember(group._id)} className="ca-btn ca-btn--primary">
                          <span className="material-symbols-outlined text-base">person_add</span>
                          Add
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            }) : (
            <div className="liquid-glass-card rounded-[1.5rem] border border-white/60 px-4 py-8 text-center">
              <span className="material-symbols-outlined text-3xl text-slate-300">auto_stories</span>
              <p className="mt-2 text-sm text-slate-500">No courses yet. Create your first course above.</p>
            </div>
          )}
        </div>
      </section>

      {/* ── Create / Edit modal ────────────────────────────────── */}
      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editing ? 'Edit Course' : 'Create Course'} widthClass="max-w-xl">
        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block">
            <Label>Course Name *</Label>
            <input className={inputCls} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. OP74-25 Advanced" autoFocus />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <Label>Level</Label>
              <input className={inputCls} value={form.level} onChange={e => setForm(f => ({ ...f, level: e.target.value }))} placeholder="e.g. B2 or B2+/C1" />
            </label>
            <label className="block">
              <Label>Schedule</Label>
              <input className={inputCls} value={form.schedule} onChange={e => setForm(f => ({ ...f, schedule: e.target.value }))} placeholder="e.g. Thu 18:00" />
            </label>
          </div>
          <label className="block">
            <Label>Status</Label>
            <select className={inputCls + ' cursor-pointer'} value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
              {COURSE_STATUS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </label>
          {formError && (
            <div className="rounded-[1rem] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{formError}</div>
          )}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button type="button" onClick={() => setFormOpen(false)} className="ca-btn ca-btn--ghost">Cancel</button>
            <button type="submit" disabled={saving} className="ca-btn ca-btn--primary">
              <span className="material-symbols-outlined text-base">{saving ? 'progress_activity' : 'save'}</span>
              {saving ? 'Saving…' : (editing ? 'Save changes' : 'Create course')}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

function CourseStatusPill({ status }) {
  const map = {
    active: { cls: 'bg-emerald-50 border-emerald-200 text-emerald-700', dot: 'bg-emerald-500', label: 'Active' },
    archived: { cls: 'bg-slate-100 border-slate-200 text-slate-500', dot: 'bg-slate-400', label: 'Archived' },
    discontinued: { cls: 'bg-slate-100 border-slate-200 text-slate-500', dot: 'bg-slate-400', label: 'Discontinued' },
  }
  const s = map[status] || { cls: 'bg-emerald-50 border-emerald-200 text-emerald-700', dot: 'bg-emerald-500', label: status || 'Active' }
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-label font-bold uppercase tracking-[0.14em] ${s.cls}`}>
      <span className={`block h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  )
}
