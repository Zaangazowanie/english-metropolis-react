// Teachers — Conversa school-admin teacher management.
//
// What school admins do here:
//   • Add teachers (name + email) and copy a magic sign-in link to hand over.
//   • See every teacher: status, how many students they teach, and whether
//     they now manage their own availability or still need first-time setup.
//   • Expand a teacher to see the students assigned to them and assign more
//     (sets the student's primary teacher). Reassigning a student to a
//     different teacher moves them; from a student's own card you can change
//     their teacher too.
//   • Do the ONE-TIME initial availability setup. After saving it becomes the
//     teacher's responsibility and the admin can no longer edit it here.
//   • Soft-remove teachers (record retained) and restore them.

import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import { queryAdminConvex, mutateAdminConvex, useAdminAuth } from '../../contexts/AdminAuthContext.jsx'
import { Modal, CefrBadge } from '../../components/analytics/AnalyticsPrimitives.jsx'
import { Avatar } from '../../components/admin/AdminKit.jsx'

// Day-of-week values match the backend (0 = Sunday … 6 = Saturday), ordered
// Mon-first for the editor — mirrors Calendar.jsx.
const DOW_OPTIONS = [
  { v: 1, label: 'Monday' }, { v: 2, label: 'Tuesday' }, { v: 3, label: 'Wednesday' },
  { v: 4, label: 'Thursday' }, { v: 5, label: 'Friday' }, { v: 6, label: 'Saturday' },
  { v: 0, label: 'Sunday' },
]
const blankWindow = () => ({ dayOfWeek: 1, startTime: '17:00', endTime: '18:00', slotMinutes: 60, gapMinutes: 10 })
function timeToMin(t) { const [h, m] = String(t).split(':').map(Number); return h * 60 + m }

const inputCls = 'ca-field mt-2'

export default function AdminTeachers() {
  const { adminUser } = useAdminAuth()
  const organizationId = adminUser?.organizationId

  const [state, setState] = useState({ loading: true, error: '', teachers: [], students: [] })
  const [includeRemoved, setIncludeRemoved] = useState(false)
  const [notice, setNotice] = useState(null) // { kind: 'ok' | 'warn' | 'err', text }

  // Add / edit teacher modal — editingTeacher === null means "Add".
  const [formOpen, setFormOpen] = useState(false)
  const [editingTeacher, setEditingTeacher] = useState(null)
  const [form, setForm] = useState({ name: '', email: '', status: 'active' })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  // Remove confirmation
  const [removeTarget, setRemoveTarget] = useState(null)
  const [busyId, setBusyId] = useState(null)

  // Per-teacher student roster expansion + assign control
  const [expandedId, setExpandedId] = useState(null)
  const [addStudentId, setAddStudentId] = useState('')
  const [assignBusy, setAssignBusy] = useState(false)

  // Availability editor (one-time per teacher)
  const [availTeacher, setAvailTeacher] = useState(null)
  const [availDraft, setAvailDraft] = useState([])
  const [availBusy, setAvailBusy] = useState(false)
  const availRef = useRef(null)
  useEffect(() => { if (availTeacher) availRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }) }, [availTeacher])

  const load = useCallback(async () => {
    setState(s => ({ ...s, loading: true, error: '' }))
    try {
      const [teachers, students] = await Promise.all([
        queryAdminConvex('teachers:listTeachers', { organizationId, includeRemoved }),
        queryAdminConvex('students:listStudents', { organizationId }).catch(() => []),
      ])
      setState({ loading: false, error: '', teachers: teachers || [], students: students || [] })
    } catch (err) {
      setState({ loading: false, error: 'Failed to load teachers.', teachers: [], students: [] })
    }
  }, [organizationId, includeRemoved])

  useEffect(() => { load() }, [load])

  const visible = useMemo(() =>
    state.teachers.slice().sort((a, b) => {
      if (Boolean(a.removed) !== Boolean(b.removed)) return a.removed ? 1 : -1
      return (a.name || '').localeCompare(b.name || '')
    }),
    [state.teachers])

  // Students grouped by their primary teacher.
  const studentsByTeacher = useMemo(() => {
    const map = {}
    for (const s of state.students) {
      if (s.status === 'archived') continue
      const tid = s.primaryTeacherId ? String(s.primaryTeacherId) : ''
      if (!tid) continue
      ;(map[tid] = map[tid] || []).push(s)
    }
    for (const k of Object.keys(map)) map[k].sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    return map
  }, [state.students])

  const counts = useMemo(() => {
    const c = { total: 0, handedOff: 0, pending: 0 }
    for (const t of state.teachers) {
      if (t.removed) continue
      c.total++
      if (t.availabilityHandedOff) c.handedOff++; else c.pending++
    }
    return c
  }, [state.teachers])

  function openAdd() {
    setEditingTeacher(null)
    setForm({ name: '', email: '', status: 'active' })
    setFormError('')
    setFormOpen(true)
  }

  function openEdit(teacher) {
    setEditingTeacher(teacher)
    setForm({ name: teacher.name || '', email: teacher.email || '', status: teacher.status || 'active' })
    setFormError('')
    setFormOpen(true)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setFormError('')
    if (!form.name.trim()) { setFormError('Name is required.'); return }
    if (!form.email.trim()) { setFormError('Email is required.'); return }
    setSaving(true)
    try {
      if (editingTeacher) {
        await mutateAdminConvex('teachers:updateTeacher', {
          teacherId: editingTeacher._id,
          name: form.name.trim(),
          email: form.email.trim(),
          status: form.status,
        })
        setFormOpen(false)
        setNotice({ kind: 'ok', text: `${form.name.trim()} updated.` })
      } else {
        await mutateAdminConvex('teachers:createTeacher', { name: form.name.trim(), email: form.email.trim(), organizationId })
        setFormOpen(false)
        setNotice({ kind: 'ok', text: `${form.name.trim()} added. Use "Copy sign-in link" to give them access.` })
      }
      await load()
    } catch (err) {
      setFormError(String(err?.message || 'Could not save the teacher.').replace(/^.*Error: /, ''))
    } finally {
      setSaving(false)
    }
  }

  function toggleExpand(teacher) {
    setAddStudentId('')
    setExpandedId(id => id === teacher._id ? null : teacher._id)
  }

  async function assignStudent(teacher) {
    if (!addStudentId || assignBusy) return
    setAssignBusy(true); setNotice(null)
    try {
      await mutateAdminConvex('students:updateStudent', { studentId: addStudentId, primaryTeacherId: teacher._id })
      const moved = state.students.find(s => String(s._id) === String(addStudentId))
      setAddStudentId('')
      setNotice({ kind: 'ok', text: `${moved?.name || 'Student'} is now ${teacher.name}'s student.` })
      await load()
    } catch (err) {
      setNotice({ kind: 'err', text: String(err?.message || 'Could not assign the student.').replace(/^.*Error: /, '') })
    } finally {
      setAssignBusy(false)
    }
  }

  async function copyLink(teacher) {
    setBusyId(teacher._id); setNotice(null)
    try {
      const result = await mutateAdminConvex('teacherAuth:adminCreateTeacherLink', { teacherId: teacher._id })
      const link = result?.link
      if (!result?.ok || !link) throw new Error('No link returned.')
      let copied = false
      try {
        if (navigator?.clipboard?.writeText) { await navigator.clipboard.writeText(link); copied = true }
      } catch { /* clipboard blocked — fall through to manual */ }
      setNotice(copied
        ? { kind: 'ok', text: 'Sign-in link copied — send it to the teacher.' }
        : { kind: 'warn', text: `Copy failed — here is the link to send manually: ${link}` })
    } catch (err) {
      setNotice({ kind: 'err', text: String(err?.message || 'Could not create a sign-in link.').replace(/^.*Error: /, '') })
    } finally {
      setBusyId(null)
    }
  }

  function openAvail(teacher) {
    setAvailDraft([blankWindow()])
    setAvailTeacher(teacher)
    setNotice(null)
  }
  const updateWindow = (i, patch) => setAvailDraft(d => d.map((w, idx) => idx === i ? { ...w, ...patch } : w))
  const removeWindow = (i) => setAvailDraft(d => d.filter((_, idx) => idx !== i))
  const addWindow = () => setAvailDraft(d => [...d, blankWindow()])

  async function saveAvailability() {
    if (availBusy || !availTeacher) return
    if (availDraft.length === 0) { setNotice({ kind: 'err', text: 'Add at least one weekly window before saving.' }); return }
    for (const w of availDraft) {
      if (timeToMin(w.startTime) + Number(w.slotMinutes) > timeToMin(w.endTime)) {
        setNotice({ kind: 'err', text: 'Each window needs to fit at least one lesson — its end time must be at least one slot after the start.' })
        return
      }
    }
    setAvailBusy(true); setNotice(null)
    try {
      const windows = availDraft.map(w => ({
        dayOfWeek: Number(w.dayOfWeek), startTime: w.startTime, endTime: w.endTime,
        slotMinutes: Number(w.slotMinutes), gapMinutes: Number(w.gapMinutes),
      }))
      await mutateAdminConvex('scheduling:setWeeklyAvailability', { organizationId, teacherId: availTeacher._id, windows })
      setNotice({ kind: 'ok', text: `${availTeacher.name}'s availability is set. They now manage it themselves from here on.` })
      setAvailTeacher(null)
      await load()
    } catch (err) {
      setNotice({ kind: 'err', text: String(err?.message || 'Could not save availability.').replace(/^.*Error: /, '') })
    } finally {
      setAvailBusy(false)
    }
  }

  async function handleRemove() {
    if (!removeTarget) return
    setBusyId(removeTarget._id)
    try {
      await mutateAdminConvex('teachers:removeTeacher', { teacherId: removeTarget._id })
      setNotice({ kind: 'ok', text: `${removeTarget.name} removed. Their record and history are retained.` })
      setRemoveTarget(null)
      await load()
    } catch (err) {
      setRemoveTarget(null)
      setNotice({ kind: 'err', text: String(err?.message || 'Failed to remove teacher.').replace(/^.*Error: /, '') })
    } finally {
      setBusyId(null)
    }
  }

  async function handleRestore(teacher) {
    setBusyId(teacher._id)
    try {
      await mutateAdminConvex('teachers:restoreTeacher', { teacherId: teacher._id })
      setNotice({ kind: 'ok', text: `${teacher.name} restored.` })
      await load()
    } catch (err) {
      setNotice({ kind: 'err', text: String(err?.message || 'Failed to restore teacher.').replace(/^.*Error: /, '') })
    } finally {
      setBusyId(null)
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

  if (state.error && !state.teachers.length) {
    return (
      <div className="glass-panel border-rose-200 bg-rose-50/50 px-6 py-6 editorial-shadow">
        <span className="material-symbols-outlined text-3xl text-rose-400">error</span>
        <h2 className="mt-3 font-headline text-2xl text-rose-900">Unable to load teachers</h2>
        <p className="mt-2 text-sm text-rose-700">{state.error}</p>
        <button onClick={load} className="ca-btn ca-btn--ghost mt-4">Retry</button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* ── Hero ───────────────────────────────────────────────── */}
      <section className="glass-panel relative overflow-hidden px-6 py-8 sm:px-10 editorial-shadow">
        <div aria-hidden className="pointer-events-none absolute inset-0"
          style={{ background: `radial-gradient(ellipse 46% 70% at 96% -4%, rgba(47,107,255,0.12), transparent 60%), radial-gradient(ellipse 40% 55% at 4% 104%, rgba(139,124,246,0.10), transparent 58%)` }} />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="font-label text-[11px] uppercase tracking-[0.26em]" style={{ color: 'var(--ca-accent)' }}>Teaching staff</p>
            <h1 className="mt-2 font-headline text-4xl sm:text-5xl leading-[1.05]" style={{ color: 'var(--ca-ink)' }}>Teachers</h1>
            <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-slate-500">
              {counts.total} teacher{counts.total === 1 ? '' : 's'} — {counts.handedOff} self-managing availability, {counts.pending} awaiting setup. Expand a teacher to see and assign their students, copy a sign-in link, or set their first weekly availability.
            </p>
          </div>
          <button onClick={openAdd} className="ca-btn ca-btn--primary">
            <span className="material-symbols-outlined text-lg">person_add</span>
            Add teacher
          </button>
        </div>
      </section>

      {notice && (
        <div className={`flex items-start gap-3 rounded-[1.25rem] border px-5 py-4 text-sm font-semibold ${
          notice.kind === 'ok' ? 'border-emerald-200 bg-emerald-50/80 text-emerald-800'
          : notice.kind === 'warn' ? 'border-amber-300 bg-amber-50/90 text-amber-900'
          : 'border-rose-200 bg-rose-50/80 text-rose-800'}`}>
          <span className="material-symbols-outlined text-lg shrink-0">{notice.kind === 'ok' ? 'check_circle' : notice.kind === 'warn' ? 'warning' : 'error'}</span>
          <span className="break-all">{notice.text}</span>
        </div>
      )}

      {/* ── Teacher list ───────────────────────────────────────── */}
      <section className="glass-panel px-5 py-6 editorial-shadow sm:px-8">
        <div className="flex items-center justify-between gap-3">
          <p className="font-label text-[11px] uppercase tracking-[0.26em]" style={{ color: 'var(--ca-accent)' }}>Roster</p>
          <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-label uppercase tracking-[0.14em] text-slate-500">
            <input type="checkbox" checked={includeRemoved} onChange={e => setIncludeRemoved(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-200" />
            Show removed
          </label>
        </div>

        <div className="mt-5 space-y-3">
          {visible.length ? visible.map((teacher, idx) => {
            const isRemoved = Boolean(teacher.removed)
            const busy = busyId === teacher._id
            const roster = studentsByTeacher[String(teacher._id)] || []
            const isOpen = expandedId === teacher._id
            const assignable = state.students
              .filter(s => s.status !== 'archived' && String(s.primaryTeacherId || '') !== String(teacher._id))
              .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
            return (
              <div key={teacher._id} className={`ca-row group metric-card-enter p-4 sm:p-5 ${isRemoved ? 'opacity-70' : ''}`} style={{ animationDelay: `${Math.min(idx, 12) * 55}ms` }}>
                <div className="flex items-center gap-4">
                  <Avatar name={teacher.name} size={52} className={isRemoved ? 'grayscale' : ''} />
                  <div className="min-w-0 flex-1">
                    <p className="font-headline text-lg truncate" style={{ color: 'var(--ca-ink)' }}>{teacher.name}</p>
                    <p className="text-xs text-slate-400 truncate">{teacher.email || 'No email on file'}</p>
                  </div>
                  <div className="hidden md:flex items-center gap-2.5">
                    <AvailabilityBadge handedOff={teacher.availabilityHandedOff} />
                    <TeacherStatusPill status={teacher.status} removed={isRemoved} />
                  </div>
                </div>

                <div className="mt-3.5 flex items-center gap-2 flex-wrap">
                  <button type="button" onClick={() => toggleExpand(teacher)} className="ca-chip ca-chip--teacher" title="Show students">
                    <span className="ca-chip-dot" style={{ background: 'linear-gradient(135deg,#5b8cff,#6f6cf6)' }}>
                      <span className="material-symbols-outlined">school</span>
                    </span>
                    <span>{teacher.studentCount ?? roster.length} student{(teacher.studentCount ?? roster.length) === 1 ? '' : 's'}</span>
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{isOpen ? 'expand_less' : 'expand_more'}</span>
                  </button>
                  <div className="md:hidden flex items-center gap-2">
                    <AvailabilityBadge handedOff={teacher.availabilityHandedOff} />
                    <TeacherStatusPill status={teacher.status} removed={isRemoved} />
                  </div>

                  <div className="ml-auto flex items-center gap-1.5">
                    {isRemoved ? (
                      <button type="button" disabled={busy} onClick={() => handleRestore(teacher)} className="ca-btn ca-btn--ghost" style={{ padding: '0.5rem 0.95rem', fontSize: 13 }}>
                        <span className="material-symbols-outlined text-base">restore_from_trash</span>
                        Restore
                      </button>
                    ) : (
                      <>
                        <button type="button" disabled={busy} onClick={() => copyLink(teacher)} title="Copy sign-in link" className="ca-btn ca-btn--ghost" style={{ padding: '0.5rem 0.95rem', fontSize: 13 }}>
                          <span className="material-symbols-outlined text-base">{busy ? 'progress_activity' : 'link'}</span>
                          Sign-in link
                        </button>
                        {!teacher.availabilityHandedOff && (
                          <button type="button" onClick={() => openAvail(teacher)} title="Set initial availability" className="ca-btn ca-btn--soft" style={{ padding: '0.5rem 0.95rem', fontSize: 13 }}>
                            <span className="material-symbols-outlined text-base">schedule</span>
                            Availability
                          </button>
                        )}
                        <IconBtn icon="edit" label="Edit teacher" disabled={busy} onClick={() => openEdit(teacher)} />
                        <IconBtn icon="person_remove" label="Remove" danger disabled={busy} onClick={() => setRemoveTarget(teacher)} />
                      </>
                    )}
                  </div>
                </div>

                {/* Per-teacher student roster + assign */}
                {isOpen && !isRemoved && (
                  <div className="ca-slidedown mt-4 rounded-[1.25rem] border border-slate-100 bg-slate-50/60 px-4 py-4">
                    <p className="ca-label" style={{ color: 'var(--ca-accent)' }}>Students taught by {teacher.name}</p>
                    {roster.length ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {roster.map(s => (
                          <Link key={s._id} to={`/admin/student/${s.slug}`} className="ca-chip ca-chip--muted hover:!border-slate-300" title={`Open ${s.name}`}>
                            <Avatar name={s.name} size={22} />
                            <span>{s.name}</span>
                            {s.level && <span className="text-[10px] font-bold text-slate-400">{s.level}</span>}
                          </Link>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-slate-500">No students assigned yet — add one below.</p>
                    )}
                    <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
                      <select className="ca-field sm:flex-1" value={addStudentId} onChange={e => setAddStudentId(e.target.value)}>
                        <option value="">Assign a student to {teacher.name}…</option>
                        {assignable.map(s => (
                          <option key={s._id} value={s._id}>
                            {s.name}{s.primaryTeacherId ? ' (reassign)' : ''}{s.level ? ` · ${s.level}` : ''}
                          </option>
                        ))}
                      </select>
                      <button type="button" disabled={!addStudentId || assignBusy} onClick={() => assignStudent(teacher)} className="ca-btn ca-btn--primary">
                        <span className="material-symbols-outlined text-base">{assignBusy ? 'progress_activity' : 'person_add'}</span>
                        Assign
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          }) : (
            <div className="ca-row p-8 text-center">
              <span className="material-symbols-outlined text-3xl text-slate-300">person_off</span>
              <p className="mt-2 text-sm text-slate-500">No teachers yet. Add your first teacher above.</p>
            </div>
          )}
        </div>
      </section>

      {/* ── One-time availability editor ───────────────────────── */}
      {availTeacher && (
        <section ref={availRef} className="glass-panel border-sky-200 bg-sky-50/40 px-6 py-6 editorial-shadow">
          <p className="font-label text-[11px] uppercase tracking-[0.26em]" style={{ color: 'var(--ca-accent)' }}>Initial availability</p>
          <h3 className="mt-1 font-headline text-2xl" style={{ color: 'var(--ca-ink)' }}>Set up {availTeacher.name}</h3>

          <div className="mt-4 flex items-start gap-3 rounded-[1.25rem] border border-amber-300 bg-amber-50/90 px-4 py-3">
            <span className="material-symbols-outlined text-amber-600 text-xl shrink-0">warning</span>
            <p className="text-sm leading-relaxed text-amber-900">
              <span className="font-semibold">This is a one-time setup.</span> After you save, this teacher's availability becomes their own responsibility and you won't be able to edit it here.
            </p>
          </div>

          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-slate-600">
            Add a window for each day they teach. Each window is split into bookable slots — for a 60-minute lesson with a 10-minute gap, a 17:00–20:30 window opens 17:00, 18:10 and 19:20. Times are Europe/Warsaw.
          </p>

          <div className="mt-5 space-y-3">
            {availDraft.map((w, i) => (
              <div key={i} className="flex flex-wrap items-end gap-3 rounded-[1.25rem] border border-slate-100 bg-white px-4 py-3">
                <label className="flex flex-col gap-1">
                  <span className="ca-label">Day</span>
                  <select value={w.dayOfWeek} onChange={e => updateWindow(i, { dayOfWeek: Number(e.target.value) })} className="ca-field" style={{ padding: '0.5rem 2.4rem 0.5rem 0.8rem' }}>
                    {DOW_OPTIONS.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="ca-label">From</span>
                  <input type="time" value={w.startTime} onChange={e => updateWindow(i, { startTime: e.target.value })} className="ca-field" style={{ padding: '0.5rem 0.8rem' }} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="ca-label">To</span>
                  <input type="time" value={w.endTime} onChange={e => updateWindow(i, { endTime: e.target.value })} className="ca-field" style={{ padding: '0.5rem 0.8rem' }} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="ca-label">Lesson (min)</span>
                  <input type="number" min="15" step="5" value={w.slotMinutes} onChange={e => updateWindow(i, { slotMinutes: Number(e.target.value) })} className="ca-field w-24" style={{ padding: '0.5rem 0.8rem' }} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="ca-label">Gap (min)</span>
                  <input type="number" min="0" step="5" value={w.gapMinutes} onChange={e => updateWindow(i, { gapMinutes: Number(e.target.value) })} className="ca-field w-24" style={{ padding: '0.5rem 0.8rem' }} />
                </label>
                <button onClick={() => removeWindow(i)} title="Remove window" className="ca-icon-btn ca-icon-btn--danger ml-auto">
                  <span className="material-symbols-outlined text-lg">delete</span>
                </button>
              </div>
            ))}
          </div>

          <button onClick={addWindow} className="ca-btn ca-btn--ghost mt-3">
            <span className="material-symbols-outlined text-lg">add</span>
            Add a window
          </button>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button onClick={saveAvailability} disabled={availBusy} className="ca-btn ca-btn--primary">
              <span className="material-symbols-outlined text-lg">save</span>
              {availBusy ? 'Saving…' : 'Save & hand off'}
            </button>
            <button onClick={() => setAvailTeacher(null)} disabled={availBusy} className="ca-btn ca-btn--ghost">Cancel</button>
          </div>
        </section>
      )}

      {/* ── Add / edit teacher modal ───────────────────────────── */}
      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editingTeacher ? 'Edit teacher' : 'Add teacher'} widthClass="max-w-xl">
        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block">
            <span className="ca-label">Name *</span>
            <input className={inputCls} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Full name" autoFocus />
          </label>
          <label className="block">
            <span className="ca-label">Email *</span>
            <input type="email" className={inputCls} value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="teacher@example.com" />
          </label>
          {editingTeacher && (
            <label className="block">
              <span className="ca-label">Status</span>
              <select className={inputCls} value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
          )}
          <p className="text-xs text-slate-500">
            {editingTeacher
              ? 'The email is the teacher’s sign-in identity — changing it changes the account they log in with.'
              : <>After adding, use <span className="font-semibold text-slate-700">Sign-in link</span> on their card to give them access.</>}
          </p>
          {formError && <div className="rounded-[1rem] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{formError}</div>}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button type="button" onClick={() => setFormOpen(false)} className="ca-btn ca-btn--ghost">Cancel</button>
            <button type="submit" disabled={saving} className="ca-btn ca-btn--primary">
              <span className="material-symbols-outlined text-base">{saving ? 'progress_activity' : (editingTeacher ? 'save' : 'person_add')}</span>
              {saving ? 'Saving…' : (editingTeacher ? 'Save changes' : 'Add teacher')}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Remove confirm ─────────────────────────────────────── */}
      <Modal open={!!removeTarget} onClose={() => setRemoveTarget(null)} title="Remove teacher" widthClass="max-w-md">
        <p className="text-sm text-slate-600">
          Remove <span className="font-semibold" style={{ color: 'var(--ca-ink)' }}>{removeTarget?.name}</span>? They will be hidden from the active roster, but their record, lessons and availability history are retained — you can restore them at any time.
        </p>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button onClick={() => setRemoveTarget(null)} className="ca-btn ca-btn--ghost">Cancel</button>
          <button onClick={handleRemove} className="ca-btn ca-btn--danger">
            <span className="material-symbols-outlined text-base">person_remove</span>
            Remove
          </button>
        </div>
      </Modal>
    </div>
  )
}

function AvailabilityBadge({ handedOff }) {
  return handedOff ? (
    <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-label uppercase tracking-[0.1em] text-sky-700">
      <span className="material-symbols-outlined text-sm">verified_user</span>
      Teacher-managed
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-label uppercase tracking-[0.1em] text-amber-700">
      <span className="material-symbols-outlined text-sm">pending</span>
      Setup pending
    </span>
  )
}

function TeacherStatusPill({ status, removed }) {
  if (removed) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-label uppercase tracking-[0.1em] text-slate-500">
        <span className="block h-1.5 w-1.5 rounded-full bg-slate-400" />
        Removed
      </span>
    )
  }
  const map = {
    active: { cls: 'bg-emerald-50 border-emerald-200 text-emerald-700', dot: 'bg-emerald-500', label: 'Active' },
    paused: { cls: 'bg-amber-50 border-amber-200 text-amber-700', dot: 'bg-amber-500', label: 'Paused' },
    inactive: { cls: 'bg-slate-100 border-slate-200 text-slate-500', dot: 'bg-slate-400', label: 'Inactive' },
  }
  const s = map[status] || { cls: 'bg-emerald-50 border-emerald-200 text-emerald-700', dot: 'bg-emerald-500', label: status || 'Active' }
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-label uppercase tracking-[0.1em] ${s.cls}`}>
      <span className={`block h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  )
}

function IconBtn({ icon, label, onClick, danger, disabled }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={label} aria-label={label} className={`ca-icon-btn ${danger ? 'ca-icon-btn--danger' : ''}`} style={{ width: '2.2rem', height: '2.2rem' }}>
      <span className="material-symbols-outlined text-lg">{icon}</span>
    </button>
  )
}
