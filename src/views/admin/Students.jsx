import { useEffect, useState, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { queryAdminConvex, mutateAdminConvex, useAdminAuth } from '../../contexts/AdminAuthContext.jsx'
import { CefrBadge, Modal } from '../../components/analytics/AnalyticsPrimitives.jsx'

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
  level: 'B1', targetLevel: '', type: 'individual', groupId: '', notes: '',
}

function Label({ children }) {
  return <span className="font-label text-xs font-bold uppercase tracking-[0.18em] text-slate-500">{children}</span>
}

const inputCls = 'mt-2 w-full rounded-[1rem] border border-slate-200/70 bg-white/90 px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100'

export default function AdminStudents() {
  const navigate = useNavigate()
  const { adminUser } = useAdminAuth()
  const [state, setState] = useState({ loading: true, error: '', students: [], groups: [] })
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('active')

  // Form/modal state — editing === null means "Add", otherwise the student row.
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  // Per-row dialogs
  const [archiveTarget, setArchiveTarget] = useState(null)
  const [passwordTarget, setPasswordTarget] = useState(null)
  const [passwordValue, setPasswordValue] = useState('')
  const [passwordStatus, setPasswordStatus] = useState(null)

  const load = useCallback(async () => {
    setState(s => ({ ...s, loading: true, error: '' }))
    try {
      const [students, groups] = await Promise.all([
        queryAdminConvex('students:listStudents', { organizationId: adminUser?.organizationId }),
        queryAdminConvex('groups:listGroups', { organizationId: adminUser?.organizationId }),
      ])
      setState({ loading: false, error: '', students: students || [], groups: groups || [] })
    } catch (err) {
      setState({ loading: false, error: 'Failed to load students.', students: [], groups: [] })
    }
  }, [adminUser?.organizationId])

  useEffect(() => { load() }, [load])

  const groupNameById = useMemo(() => {
    const map = {}
    for (const g of state.groups) map[String(g._id)] = g.name
    return map
  }, [state.groups])

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
      notes: student.notes || '',
    })
    setFormError('')
    setFormOpen(true)
  }

  // Generate a slug unique within the org by appending -2, -3 … on clash.
  async function uniqueSlug(name) {
    const base = slugify(name)
    if (!base) return base
    // getStudentBySlug is global; treat any hit as a clash and append -N.
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
        })
      } else {
        const slug = await uniqueSlug(form.name)
        await mutateAdminConvex('students:createStudent', {
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
        })
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
        <div className="glass-panel rounded-[2rem] border border-white/50 px-6 py-6 editorial-shadow animate-pulse">
          <div className="h-4 w-32 rounded bg-slate-200" />
          <div className="mt-4 h-8 w-48 rounded bg-slate-200" />
        </div>
        <div className="glass-panel rounded-[2rem] border border-white/50 px-6 py-6 editorial-shadow">
          {[1, 2, 3, 4].map(i => <div key={i} className="mt-3 h-16 rounded-[1.25rem] bg-slate-100 animate-pulse" />)}
        </div>
      </div>
    )
  }

  if (state.error && !state.students.length) {
    return (
      <div className="glass-panel rounded-[2rem] border border-rose-200 bg-rose-50/50 px-6 py-6 editorial-shadow">
        <span className="material-symbols-outlined text-3xl text-rose-400">error</span>
        <h2 className="mt-3 font-headline text-2xl text-rose-900">Unable to load students</h2>
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
            <p className="font-label text-xs font-bold uppercase tracking-[0.28em] text-sky-600">Administration · Learners</p>
            <h1 className="mt-3 font-headline text-4xl sm:text-5xl text-slate-900 leading-[1.05]">
              Students<span className="italic text-sky-600">.</span>
            </h1>
            <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-slate-600">
              {counts.total} learner{counts.total === 1 ? '' : 's'} on the roster — {counts.active} active, {counts.paused} paused, {counts.archived} archived. Open any learner to review their full academic record.
            </p>
          </div>
          <button
            onClick={openAdd}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-sky-600 to-blue-700 px-5 py-3 text-sm font-semibold text-white shadow-[0_16px_35px_-18px_rgba(2,132,199,0.9)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_20px_40px_-18px_rgba(2,132,199,1)]"
          >
            <span className="material-symbols-outlined text-lg">person_add</span>
            Add Student
          </button>
        </div>
      </section>

      {/* ── Roster ─────────────────────────────────────────────── */}
      <section className="glass-panel rounded-[2rem] border border-white/50 px-5 py-6 editorial-shadow sm:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            {STATUS_FILTERS.map(f => (
              <button
                key={f.value}
                onClick={() => setStatusFilter(f.value)}
                className={statusFilter === f.value
                  ? 'rounded-full bg-gradient-to-r from-sky-600 to-blue-700 px-4 py-2 text-xs font-label font-bold uppercase tracking-[0.16em] text-white transition'
                  : 'rounded-full border border-slate-200/70 bg-white/80 px-4 py-2 text-xs font-label font-bold uppercase tracking-[0.16em] text-slate-500 hover:text-sky-700 transition cursor-pointer'}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 rounded-full border border-slate-200/70 bg-white/80 px-4 py-2.5 focus-within:border-sky-300 focus-within:ring-2 focus-within:ring-sky-100 transition">
            <span className="material-symbols-outlined text-slate-400 text-base">search</span>
            <input
              type="search"
              placeholder="Search by name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none w-48"
            />
          </div>
        </div>

        <div className="mt-6 space-y-3">
          {filtered.length ? filtered.map((student, idx) => {
            const initials = String(student.name || '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('') || '?'
            return (
              <div
                key={student._id}
                className="metric-card-enter group liquid-glass-card rounded-[1.5rem] border border-white/60 px-5 py-4 transition-all duration-300 hover:border-sky-200 hover:shadow-[0_28px_56px_-32px_rgba(2,132,199,0.45)]"
                style={{ animationDelay: `${Math.min(idx, 12) * 60}ms` }}
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                  <button
                    type="button"
                    onClick={() => navigate(`/admin/student/${student.slug}`)}
                    className="flex items-center gap-4 min-w-0 flex-1 text-left cursor-pointer"
                  >
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[1rem] bg-gradient-to-br from-sky-500 to-blue-700 shadow-[0_14px_30px_-16px_rgba(2,132,199,0.9)] transition-transform duration-300 group-hover:scale-105">
                      <span className="font-headline text-base text-white">{initials}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="font-headline text-lg text-slate-900 truncate">{student.name}</p>
                      <p className="text-xs text-slate-400 truncate">{student.email || 'No email on file'}</p>
                    </div>
                  </button>

                  <div className="flex items-center gap-4 sm:gap-5 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <CefrBadge band={student.level || 'N/A'} />
                      {student.targetLevel && <span className="text-[10px] font-label text-slate-400">→ {student.targetLevel}</span>}
                    </div>
                    <span className="hidden md:inline text-xs text-slate-500 capitalize">{student.type || 'individual'}</span>
                    {student.groupId && groupNameById[String(student.groupId)] && (
                      <span className="hidden lg:inline-flex items-center gap-1 rounded-full bg-sky-50 border border-sky-200 px-2.5 py-1 text-xs text-sky-700 max-w-[180px] truncate">
                        <span className="material-symbols-outlined text-sm">group</span>
                        {groupNameById[String(student.groupId)]}
                      </span>
                    )}
                    <StatusPill status={student.status} />
                    <div className="flex items-center gap-1">
                      <RowAction icon="edit" label="Edit" onClick={() => openEdit(student)} />
                      <RowAction icon="key" label="Set password" onClick={() => { setPasswordTarget(student); setPasswordValue(''); setPasswordStatus(null) }} />
                      {student.status !== 'archived' && (
                        <RowAction icon="archive" label="Archive" tone="rose" onClick={() => setArchiveTarget(student)} />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          }) : (
            <div className="liquid-glass-card rounded-[1.5rem] border border-white/60 px-4 py-8 text-center">
              <span className="material-symbols-outlined text-3xl text-slate-300">person_off</span>
              <p className="mt-2 text-sm text-slate-500">
                {search ? `No students match "${search}"` : `No ${statusFilter === 'all' ? '' : statusFilter + ' '}students yet.`}
              </p>
            </div>
          )}
        </div>
      </section>

      {/* ── Add / Edit form modal ──────────────────────────────── */}
      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editing ? 'Edit Student' : 'Add Student'} widthClass="max-w-2xl">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <Label>Name *</Label>
              <input className={inputCls} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Full name" autoFocus />
            </label>
            <label className="block">
              <Label>Email</Label>
              <input type="email" className={inputCls} value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="student@example.com" />
            </label>
            <label className="block">
              <Label>Phone</Label>
              <input className={inputCls} value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+48 …" />
            </label>
            <label className="block">
              <Label>Native Language</Label>
              <input className={inputCls} value={form.nativeLanguage} onChange={e => setForm(f => ({ ...f, nativeLanguage: e.target.value }))} placeholder="pl" />
            </label>
            <label className="block">
              <Label>Type</Label>
              <select className={inputCls + ' cursor-pointer'} value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                {STUDENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </label>
            <label className="block">
              <Label>CEFR Level *</Label>
              <select className={inputCls + ' cursor-pointer'} value={form.level} onChange={e => setForm(f => ({ ...f, level: e.target.value }))}>
                {CEFR_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </label>
            <label className="block">
              <Label>Target Level</Label>
              <select className={inputCls + ' cursor-pointer'} value={form.targetLevel} onChange={e => setForm(f => ({ ...f, targetLevel: e.target.value }))}>
                <option value="">—</option>
                {CEFR_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </label>
            <label className="block sm:col-span-2">
              <Label>Group</Label>
              <select className={inputCls + ' cursor-pointer'} value={form.groupId} onChange={e => setForm(f => ({ ...f, groupId: e.target.value }))}>
                <option value="">No group</option>
                {state.groups.map(g => <option key={g._id} value={g._id}>{g.name}</option>)}
              </select>
            </label>
            <label className="block sm:col-span-2">
              <Label>Notes</Label>
              <textarea className={inputCls} rows={3} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Teacher notes" />
            </label>
          </div>
          {formError && (
            <div className="rounded-[1rem] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{formError}</div>
          )}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button type="button" onClick={() => setFormOpen(false)} className="rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition cursor-pointer">Cancel</button>
            <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-sky-600 to-blue-700 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_16px_35px_-18px_rgba(2,132,199,0.9)] transition-all duration-300 hover:-translate-y-0.5 disabled:opacity-60">
              <span className="material-symbols-outlined text-base">{saving ? 'progress_activity' : 'save'}</span>
              {saving ? 'Saving…' : (editing ? 'Save Changes' : 'Create Student')}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Archive confirm ────────────────────────────────────── */}
      <Modal open={!!archiveTarget} onClose={() => setArchiveTarget(null)} title="Archive Student" widthClass="max-w-md">
        <p className="text-sm text-slate-600">
          Archive <span className="font-semibold text-slate-900">{archiveTarget?.name}</span>? They will be hidden from the active roster but their record is preserved.
        </p>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button onClick={() => setArchiveTarget(null)} className="rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition cursor-pointer">Cancel</button>
          <button onClick={handleArchive} className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-rose-500 to-rose-600 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_16px_35px_-18px_rgba(225,29,72,0.9)] hover:-translate-y-0.5 transition-all duration-300">
            <span className="material-symbols-outlined text-base">archive</span>
            Archive
          </button>
        </div>
      </Modal>

      {/* ── Set password ───────────────────────────────────────── */}
      <Modal open={!!passwordTarget} onClose={() => setPasswordTarget(null)} title="Set Student Password" widthClass="max-w-md">
        <form onSubmit={handleSetPassword} className="space-y-4">
          <p className="text-sm text-slate-600">
            Set a login password for <span className="font-semibold text-slate-900">{passwordTarget?.name}</span>.
          </p>
          <label className="block">
            <Label>New Password</Label>
            <input type="password" className={inputCls} value={passwordValue} onChange={e => setPasswordValue(e.target.value)} placeholder="At least 6 characters" autoFocus />
          </label>
          {passwordStatus && (
            <div className={`rounded-[1rem] border px-4 py-3 text-sm ${passwordStatus.type === 'error' ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-sky-200 bg-sky-50 text-sky-700'}`}>
              {passwordStatus.message}
            </div>
          )}
          <div className="flex items-center justify-end gap-2">
            <button type="button" onClick={() => setPasswordTarget(null)} className="rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition cursor-pointer">Cancel</button>
            <button type="submit" className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-sky-600 to-blue-700 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_16px_35px_-18px_rgba(2,132,199,0.9)] hover:-translate-y-0.5 transition-all duration-300">
              <span className="material-symbols-outlined text-base">key</span>
              Set Password
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
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-label font-bold uppercase tracking-[0.14em] ${s.cls}`}>
      <span className={`block h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  )
}

function RowAction({ icon, label, onClick, tone }) {
  const hover = tone === 'rose' ? 'hover:bg-rose-50 hover:text-rose-600' : 'hover:bg-sky-50 hover:text-sky-700'
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`flex h-9 w-9 items-center justify-center rounded-full border border-slate-200/70 bg-white/80 text-slate-500 transition cursor-pointer ${hover}`}
    >
      <span className="material-symbols-outlined text-lg">{icon}</span>
    </button>
  )
}
