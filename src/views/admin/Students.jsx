import { useEffect, useState, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { queryAdminConvex, mutateAdminConvex, useAdminAuth } from '../../contexts/AdminAuthContext.jsx'
import { CefrBadge, Modal } from '../../components/analytics/AnalyticsPrimitives.jsx'
import { Avatar, AssignFields, TeacherChip, CourseChip, persistAssignment } from '../../components/admin/AdminKit.jsx'

const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
const STUDENT_TYPES = [
  { value: 'individual', label: 'Individual' },
  { value: 'group', label: 'Group' },
  { value: 'corporate', label: 'Corporate' },
]

// Diacritic map matching the convex deriveSlug + spec (ą→a, ć→c, …).
function slugify(input) {
  return String(input || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[łŁ]/g, 'l')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-+)|(-+$)/g, '')
}

const STATUS_FILTERS = [
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'archived', label: 'Archived' },
  { value: 'all', label: 'All' },
]

const EMPTY_FORM = {
  name: '', email: '', phone: '', nativeLanguage: 'pl',
  level: 'B1', targetLevel: '', type: 'individual',
  groupId: '', primaryTeacherId: '', notes: '',
}

const inputCls = 'ca-field mt-2'

export default function AdminStudents() {
  const navigate = useNavigate()
  const { adminUser } = useAdminAuth()
  const [state, setState] = useState({ loading: true, error: '', students: [], groups: [], teachers: [] })
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('active')

  // Add / edit modal — editing === null means "Add", otherwise the student row.
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  // Quick assign modal (teacher + course in one save)
  const [assignTarget, setAssignTarget] = useState(null)
  const [assignDraft, setAssignDraft] = useState({ primaryTeacherId: '', groupId: '' })
  const [assignSaving, setAssignSaving] = useState(false)
  const [assignError, setAssignError] = useState('')

  // Per-row dialogs
  const [archiveTarget, setArchiveTarget] = useState(null)
  const [passwordTarget, setPasswordTarget] = useState(null)
  const [passwordValue, setPasswordValue] = useState('')
  const [passwordStatus, setPasswordStatus] = useState(null)

  const load = useCallback(async () => {
    setState(s => ({ ...s, loading: true, error: '' }))
    try {
      const [students, groups, teachers] = await Promise.all([
        queryAdminConvex('students:listStudents', { organizationId: adminUser?.organizationId }),
        queryAdminConvex('groups:listGroups', { organizationId: adminUser?.organizationId }),
        queryAdminConvex('teachers:listTeachers', { organizationId: adminUser?.organizationId }).catch(() => []),
      ])
      setState({ loading: false, error: '', students: students || [], groups: groups || [], teachers: teachers || [] })
    } catch (err) {
      setState({ loading: false, error: 'Failed to load students.', students: [], groups: [], teachers: [] })
    }
  }, [adminUser?.organizationId])

  useEffect(() => { load() }, [load])

  const groupNameById = useMemo(() => {
    const map = {}
    for (const g of state.groups) map[String(g._id)] = g.name
    return map
  }, [state.groups])

  const teacherNameById = useMemo(() => {
    const map = {}
    for (const t of state.teachers) map[String(t._id)] = t.name
    return map
  }, [state.teachers])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return state.students
      .filter(s => statusFilter === 'all' ? true : s.status === statusFilter)
      .filter(s => {
        if (!q) return true
        return [s.name, s.email, s.slug, s.level, ...(s.tags || [])].join(' ').toLowerCase().includes(q)
      })
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  }, [state.students, search, statusFilter])

  const counts = useMemo(() => {
    const c = { active: 0, paused: 0, archived: 0, total: state.students.length }
    for (const s of state.students) { if (c[s.status] !== undefined) c[s.status]++ }
    return c
  }, [state.students])

  function openAdd() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setFormError('')
    setFormOpen(true)
  }

  function openEdit(student) {
    setEditing(student)
    setForm({
      name: student.name || '',
      email: student.email || '',
      phone: student.phone || '',
      nativeLanguage: student.nativeLanguage || 'pl',
      level: student.level || 'B1',
      targetLevel: student.targetLevel || '',
      type: student.type || 'individual',
      groupId: student.groupId ? String(student.groupId) : '',
      primaryTeacherId: student.primaryTeacherId ? String(student.primaryTeacherId) : '',
      notes: student.notes || '',
    })
    setFormError('')
    setFormOpen(true)
  }

  function openAssign(student) {
    setAssignTarget(student)
    setAssignDraft({
      primaryTeacherId: student.primaryTeacherId ? String(student.primaryTeacherId) : '',
      groupId: student.groupId ? String(student.groupId) : '',
    })
    setAssignError('')
  }

  async function handleAssignSave() {
    if (!assignTarget) return
    setAssignSaving(true)
    setAssignError('')
    try {
      await persistAssignment(assignTarget, assignDraft)
      setAssignTarget(null)
      await load()
    } catch (err) {
      setAssignError('Could not save the assignment. Please try again.')
    } finally {
      setAssignSaving(false)
    }
  }

  // Generate a slug unique within the org by appending -2, -3 … on clash.
  async function uniqueSlug(name) {
    const base = slugify(name)
    if (!base) return base
    let candidate = base
    for (let n = 2; n < 100; n++) {
      const existing = await queryAdminConvex('students:getStudentBySlug', { slug: candidate })
      if (!existing) return candidate
      candidate = `${base}-${n}`
    }
    return candidate
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setFormError('')
    if (!form.name.trim()) { setFormError('Name is required.'); return }
    if (!form.level) { setFormError('CEFR level is required.'); return }
    setSaving(true)
    try {
      if (editing) {
        await mutateAdminConvex('students:updateStudent', {
          studentId: editing._id,
          name: form.name.trim(),
          email: form.email.trim() || undefined,
          phone: form.phone.trim() || undefined,
          nativeLanguage: form.nativeLanguage || undefined,
          level: form.level,
          targetLevel: form.targetLevel || undefined,
          type: form.type,
          notes: form.notes || undefined,
          groupId: form.groupId || undefined,
          primaryTeacherId: form.primaryTeacherId || undefined,
        })
        // Keep the membership table in step with the chosen course.
        if (form.groupId) await persistAssignment(editing, { groupId: form.groupId })
      } else {
        const slug = await uniqueSlug(form.name)
        const studentId = await mutateAdminConvex('students:createStudent', {
          name: form.name.trim(),
          slug,
          email: form.email.trim() || undefined,
          phone: form.phone.trim() || undefined,
          nativeLanguage: form.nativeLanguage || undefined,
          level: form.level,
          targetLevel: form.targetLevel || undefined,
          type: form.type,
          notes: form.notes || undefined,
          groupId: form.groupId || undefined,
          primaryTeacherId: form.primaryTeacherId || undefined,
        })
        if (form.groupId && studentId) {
          try { await mutateAdminConvex('groups:addGroupMember', { groupId: form.groupId, studentId }) } catch { /* best-effort */ }
        }
      }
      setFormOpen(false)
      await load()
    } catch (err) {
      setFormError('Could not save the student. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function handleArchive() {
    if (!archiveTarget) return
    try {
      await mutateAdminConvex('students:archiveStudent', { studentId: archiveTarget._id })
      setArchiveTarget(null)
      await load()
    } catch (err) {
      setArchiveTarget(null)
      setState(s => ({ ...s, error: 'Failed to archive student.' }))
    }
  }

  async function handleSetPassword(e) {
    e.preventDefault()
    setPasswordStatus(null)
    if (passwordValue.length < 6) {
      setPasswordStatus({ type: 'error', message: 'Password must be at least 6 characters.' })
      return
    }
    try {
      await mutateAdminConvex('studentAuth:setStudentPassword', {
        studentId: passwordTarget._id,
        newPassword: passwordValue,
      })
      setPasswordStatus({ type: 'info', message: 'Password set.' })
      setPasswordValue('')
      setTimeout(() => { setPasswordTarget(null); setPasswordStatus(null) }, 900)
    } catch (err) {
      setPasswordStatus({ type: 'error', message: 'Could not set the password.' })
    }
  }

  if (state.loading) {
    return (
      <div className="space-y-6">
        <div className="glass-panel px-6 py-6 editorial-shadow animate-pulse">
          <div className="h-4 w-32 rounded bg-slate-200" />
          <div className="mt-4 h-8 w-48 rounded bg-slate-200" />
        </div>
        <div className="glass-panel px-6 py-6 editorial-shadow">
          {[1, 2, 3, 4].map(i => <div key={i} className="mt-3 h-20 rounded-[1.5rem] bg-slate-100 animate-pulse" />)}
        </div>
      </div>
    )
  }

  if (state.error && !state.students.length) {
    return (
      <div className="glass-panel border-rose-200 bg-rose-50/50 px-6 py-6 editorial-shadow">
        <span className="material-symbols-outlined text-3xl text-rose-400">error</span>
        <h2 className="mt-3 font-headline text-2xl text-rose-900">Unable to load students</h2>
        <p className="mt-2 text-sm text-rose-700">{state.error}</p>
        <button onClick={load} className="ca-btn ca-btn--ghost mt-4">Retry</button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* ── Hero ───────────────────────────────────────────────── */}
      <section className="glass-panel relative overflow-hidden px-6 py-8 sm:px-10 editorial-shadow">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ background: `radial-gradient(ellipse 46% 70% at 96% -4%, rgba(47,107,255,0.12), transparent 60%), radial-gradient(ellipse 40% 55% at 4% 104%, rgba(45,212,191,0.10), transparent 58%)` }}
        />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="font-label text-[11px] uppercase tracking-[0.26em]" style={{ color: 'var(--ca-accent)' }}>Learners</p>
            <h1 className="mt-2 font-headline text-4xl sm:text-5xl leading-[1.05]" style={{ color: 'var(--ca-ink)' }}>
              Students
            </h1>
            <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-slate-500">
              {counts.total} learner{counts.total === 1 ? '' : 's'} — <b className="font-semibold text-emerald-600">{counts.active} active</b>, {counts.paused} paused, {counts.archived} archived. Tap a learner for their full record, or use <b className="font-semibold" style={{ color: 'var(--ca-accent)' }}>Assign</b> to set their teacher &amp; course in one step.
            </p>
          </div>
          <button onClick={openAdd} className="ca-btn ca-btn--primary">
            <span className="material-symbols-outlined text-lg">person_add</span>
            Add student
          </button>
        </div>
      </section>

      {/* ── Roster ─────────────────────────────────────────────── */}
      <section className="glass-panel px-5 py-6 editorial-shadow sm:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="ca-segment flex-wrap">
            {STATUS_FILTERS.map(f => (
              <button key={f.value} onClick={() => setStatusFilter(f.value)} className={`ca-segment-item ${statusFilter === f.value ? 'is-active' : ''}`}>
                {f.label}
              </button>
            ))}
          </div>
          <div className="ca-search">
            <span className="material-symbols-outlined text-slate-400 text-base">search</span>
            <input type="search" placeholder="Search by name or email…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>

        <div className="mt-6 space-y-3">
          {filtered.length ? filtered.map((student, idx) => {
            const teacherName = student.primaryTeacherId ? teacherNameById[String(student.primaryTeacherId)] : ''
            const courseName = student.groupId ? groupNameById[String(student.groupId)] : ''
            return (
              <div key={student._id} className="ca-row group metric-card-enter p-4 sm:p-5" style={{ animationDelay: `${Math.min(idx, 12) * 55}ms` }}>
                <div className="flex items-center gap-4">
                  <button type="button" onClick={() => navigate(`/admin/student/${student.slug}`)} className="flex items-center gap-4 min-w-0 flex-1 text-left cursor-pointer">
                    <Avatar name={student.name} size={52} />
                    <div className="min-w-0">
                      <p className="font-headline text-lg truncate" style={{ color: 'var(--ca-ink)' }}>{student.name}</p>
                      <p className="text-xs text-slate-400 truncate">{student.email || 'No email on file'}</p>
                    </div>
                  </button>
                  <div className="hidden sm:block"><StatusPill status={student.status} /></div>
                </div>

                <div className="mt-3.5 flex items-center gap-2 flex-wrap">
                  <CefrBadge band={student.level || 'N/A'} />
                  {student.targetLevel && (
                    <span className="ca-chip ca-chip--muted" style={{ paddingLeft: '0.7rem' }} title={`Target ${student.targetLevel}`}>
                      <span className="material-symbols-outlined" style={{ fontSize: 14 }}>flag</span>
                      <span>→ {student.targetLevel}</span>
                    </span>
                  )}
                  <TeacherChip name={teacherName} onClick={() => openAssign(student)} />
                  <CourseChip name={courseName} onClick={() => openAssign(student)} />

                  <div className="ml-auto flex items-center gap-1.5">
                    <button type="button" onClick={() => openAssign(student)} className="ca-btn ca-btn--soft" style={{ padding: '0.5rem 0.95rem', fontSize: 13 }}>
                      <span className="material-symbols-outlined text-base">swap_horiz</span>
                      Assign
                    </button>
                    <IconBtn icon="visibility" label="Open record" onClick={() => navigate(`/admin/student/${student.slug}`)} />
                    <IconBtn icon="edit" label="Edit" onClick={() => openEdit(student)} />
                    <IconBtn icon="key" label="Set password" onClick={() => { setPasswordTarget(student); setPasswordValue(''); setPasswordStatus(null) }} />
                    {student.status !== 'archived' && (
                      <IconBtn icon="archive" label="Archive" danger onClick={() => setArchiveTarget(student)} />
                    )}
                  </div>
                </div>
              </div>
            )
          }) : (
            <div className="ca-row p-8 text-center">
              <span className="material-symbols-outlined text-3xl text-slate-300">person_off</span>
              <p className="mt-2 text-sm text-slate-500">
                {search ? `No students match "${search}"` : `No ${statusFilter === 'all' ? '' : statusFilter + ' '}students yet.`}
              </p>
            </div>
          )}
        </div>
      </section>

      {/* ── Quick assign (teacher + course in one save) ────────── */}
      <Modal open={!!assignTarget} onClose={() => setAssignTarget(null)} title={`Assign · ${assignTarget?.name || ''}`} widthClass="max-w-xl">
        <div className="flex items-center gap-3 rounded-[1.25rem] border border-slate-100 bg-slate-50/70 px-4 py-3">
          <Avatar name={assignTarget?.name} size={42} />
          <div className="min-w-0">
            <p className="font-headline text-base" style={{ color: 'var(--ca-ink)' }}>{assignTarget?.name}</p>
            <p className="text-xs text-slate-400">Set this learner's teacher &amp; course, then save once.</p>
          </div>
        </div>
        <div className="mt-4">
          <AssignFields teachers={state.teachers} groups={state.groups} value={assignDraft} onChange={setAssignDraft} idPrefix="quick" />
        </div>
        {assignError && <div className="mt-4 rounded-[1rem] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{assignError}</div>}
        <div className="mt-5 flex items-center justify-end gap-2">
          <button type="button" onClick={() => setAssignTarget(null)} className="ca-btn ca-btn--ghost">Cancel</button>
          <button type="button" onClick={handleAssignSave} disabled={assignSaving} className="ca-btn ca-btn--primary">
            <span className="material-symbols-outlined text-base">{assignSaving ? 'progress_activity' : 'check'}</span>
            {assignSaving ? 'Saving…' : 'Save assignment'}
          </button>
        </div>
      </Modal>

      {/* ── Add / Edit form modal ──────────────────────────────── */}
      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editing ? 'Edit student' : 'Add student'} widthClass="max-w-2xl">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="ca-label">Name *</span>
              <input className={inputCls} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Full name" autoFocus />
            </label>
            <label className="block">
              <span className="ca-label">Email</span>
              <input type="email" className={inputCls} value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="student@example.com" />
            </label>
            <label className="block">
              <span className="ca-label">Phone</span>
              <input className={inputCls} value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+48 …" />
            </label>
            <label className="block">
              <span className="ca-label">Native language</span>
              <input className={inputCls} value={form.nativeLanguage} onChange={e => setForm(f => ({ ...f, nativeLanguage: e.target.value }))} placeholder="pl" />
            </label>
            <label className="block">
              <span className="ca-label">Type</span>
              <select className={inputCls} value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                {STUDENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="ca-label">CEFR level *</span>
              <select className={inputCls} value={form.level} onChange={e => setForm(f => ({ ...f, level: e.target.value }))}>
                {CEFR_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="ca-label">Target level</span>
              <select className={inputCls} value={form.targetLevel} onChange={e => setForm(f => ({ ...f, targetLevel: e.target.value }))}>
                <option value="">—</option>
                {CEFR_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </label>
          </div>

          <div className="rounded-[1.25rem] border border-slate-100 bg-slate-50/60 px-4 py-4">
            <p className="ca-label mb-1 flex items-center gap-1.5" style={{ color: 'var(--ca-accent)' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 15 }}>hub</span>
              Assignment
            </p>
            <AssignFields teachers={state.teachers} groups={state.groups} value={form} onChange={(next) => setForm(f => ({ ...f, ...next }))} idPrefix="form" />
          </div>

          <label className="block">
            <span className="ca-label">Notes</span>
            <textarea className={inputCls} rows={3} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Teacher notes" />
          </label>

          {formError && <div className="rounded-[1rem] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{formError}</div>}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button type="button" onClick={() => setFormOpen(false)} className="ca-btn ca-btn--ghost">Cancel</button>
            <button type="submit" disabled={saving} className="ca-btn ca-btn--primary">
              <span className="material-symbols-outlined text-base">{saving ? 'progress_activity' : 'save'}</span>
              {saving ? 'Saving…' : (editing ? 'Save changes' : 'Create student')}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Archive confirm ────────────────────────────────────── */}
      <Modal open={!!archiveTarget} onClose={() => setArchiveTarget(null)} title="Archive student" widthClass="max-w-md">
        <p className="text-sm text-slate-600">
          Archive <span className="font-semibold" style={{ color: 'var(--ca-ink)' }}>{archiveTarget?.name}</span>? They will be hidden from the active roster but their record is preserved.
        </p>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button onClick={() => setArchiveTarget(null)} className="ca-btn ca-btn--ghost">Cancel</button>
          <button onClick={handleArchive} className="ca-btn ca-btn--danger">
            <span className="material-symbols-outlined text-base">archive</span>
            Archive
          </button>
        </div>
      </Modal>

      {/* ── Set password ───────────────────────────────────────── */}
      <Modal open={!!passwordTarget} onClose={() => setPasswordTarget(null)} title="Set student password" widthClass="max-w-md">
        <form onSubmit={handleSetPassword} className="space-y-4">
          <p className="text-sm text-slate-600">
            Set a login password for <span className="font-semibold" style={{ color: 'var(--ca-ink)' }}>{passwordTarget?.name}</span>.
          </p>
          <label className="block">
            <span className="ca-label">New password</span>
            <input type="password" className={inputCls} value={passwordValue} onChange={e => setPasswordValue(e.target.value)} placeholder="At least 6 characters" autoFocus />
          </label>
          {passwordStatus && (
            <div className={`rounded-[1rem] border px-4 py-3 text-sm ${passwordStatus.type === 'error' ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-sky-200 bg-sky-50 text-sky-700'}`}>
              {passwordStatus.message}
            </div>
          )}
          <div className="flex items-center justify-end gap-2">
            <button type="button" onClick={() => setPasswordTarget(null)} className="ca-btn ca-btn--ghost">Cancel</button>
            <button type="submit" className="ca-btn ca-btn--primary">
              <span className="material-symbols-outlined text-base">key</span>
              Set password
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

function StatusPill({ status }) {
  const map = {
    active: { cls: 'bg-emerald-50 border-emerald-200 text-emerald-700', dot: 'bg-emerald-500', label: 'Active' },
    paused: { cls: 'bg-amber-50 border-amber-200 text-amber-700', dot: 'bg-amber-500', label: 'Paused' },
    archived: { cls: 'bg-slate-100 border-slate-200 text-slate-500', dot: 'bg-slate-400', label: 'Archived' },
    graduated: { cls: 'bg-sky-50 border-sky-200 text-sky-700', dot: 'bg-sky-500', label: 'Graduated' },
  }
  const s = map[status] || { cls: 'bg-slate-100 border-slate-200 text-slate-500', dot: 'bg-slate-400', label: status || '—' }
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-label uppercase tracking-[0.12em] ${s.cls}`}>
      <span className={`block h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  )
}

function IconBtn({ icon, label, onClick, danger }) {
  return (
    <button type="button" onClick={onClick} title={label} aria-label={label} className={`ca-icon-btn ${danger ? 'ca-icon-btn--danger' : ''}`} style={{ width: '2.2rem', height: '2.2rem' }}>
      <span className="material-symbols-outlined text-lg">{icon}</span>
    </button>
  )
}
