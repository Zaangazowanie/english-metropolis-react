// AdminKit — shared building blocks for the Conversa admin "Soft Modern" UI.
//
//   • Avatar           — friendly, deterministic colored squircle (initials).
//   • AssignFields     — the teacher + course selectors reused by the Students
//                        form, the quick Assign modal, and the Student detail
//                        panel. The single source of truth for what "assign a
//                        teacher / course to a student" looks like.
//   • persistAssignment — writes an assignment to BOTH representations
//                        (students.groupId + the groupMemberships join table)
//                        so a learner shows up consistently in every view.
//
// All visuals lean on the .ca-* classes defined under .conversa-admin in
// index.css, so they inherit the soft palette + rounded type automatically.

import { mutateAdminConvex } from '../../contexts/AdminAuthContext.jsx'

// The forthcoming universal course library (2026-06-04 master plan). Not built
// yet, so these appear greyed/disabled in the course picker — visible as a
// catalogue but not assignable until they exist.
const PACK_COURSES = [
  'A1 · Beginner', 'A2 · Elementary', 'B1 · Intermediate', 'B2 · Upper-Intermediate',
  'C1 · Advanced', 'C2 · Proficiency', 'Business English', 'Legal English',
]

// Sync a student's assignment across both course representations. Only sets
// values — clearing to "none" isn't offered (every learner keeps a teacher +
// course), because updateStudent ignores undefined fields server-side.
export async function persistAssignment(student, next) {
  const oldGroup = student.groupId ? String(student.groupId) : ''
  const newGroup = next.groupId || ''
  const newTeacher = next.primaryTeacherId || ''

  const updates = { studentId: student._id }
  if (newTeacher) updates.primaryTeacherId = newTeacher
  if (newGroup) updates.groupId = newGroup
  if (updates.primaryTeacherId || updates.groupId) {
    await mutateAdminConvex('students:updateStudent', updates)
  }
  if (newGroup && newGroup !== oldGroup) {
    if (oldGroup) {
      try { await mutateAdminConvex('groups:removeGroupMember', { groupId: oldGroup, studentId: student._id }) } catch { /* best-effort */ }
    }
    await mutateAdminConvex('groups:addGroupMember', { groupId: newGroup, studentId: student._id })
  }
}

export function initials(name) {
  return String(name || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() || '')
    .join('') || '?'
}

// Eight gentle, school-friendly gradients. A stable hash of the name picks one
// so the same person always gets the same colour across every view.
const AVATAR_GRADIENTS = [
  ['#5b8cff', '#6f6cf6'],
  ['#34c3a8', '#2f9bd8'],
  ['#f7836b', '#f25f9a'],
  ['#f6a64b', '#f2748b'],
  ['#8b7cf6', '#c06ef0'],
  ['#2dbb9b', '#4fae5a'],
  ['#ff9d6c', '#f06595'],
  ['#54b3f0', '#5f7bf0'],
]

export function avatarGradient(name) {
  const s = String(name || '')
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return AVATAR_GRADIENTS[h % AVATAR_GRADIENTS.length]
}

export function Avatar({ name, size = 48, ring = false, className = '' }) {
  const [from, to] = avatarGradient(name)
  return (
    <span
      className={`ca-avatar ${ring ? 'ca-avatar-ring' : ''} ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.36),
        backgroundImage: `linear-gradient(135deg, ${from}, ${to})`,
      }}
      aria-hidden
    >
      {initials(name)}
    </span>
  )
}

// A compact chip showing the assigned teacher (or "Unassigned" affordance).
export function TeacherChip({ name, onClick, title }) {
  if (!name) {
    return (
      <button type="button" onClick={onClick} title={title || 'Assign a teacher'} className="ca-chip ca-chip--muted">
        <span className="ca-chip-dot" style={{ background: '#cbd5e1' }}>
          <span className="material-symbols-outlined">person_add</span>
        </span>
        <span>Assign teacher</span>
      </button>
    )
  }
  const El = onClick ? 'button' : 'span'
  const [from, to] = avatarGradient(name)
  return (
    <El type={onClick ? 'button' : undefined} onClick={onClick} title={title || `Teacher: ${name}`} className="ca-chip ca-chip--teacher">
      <span className="ca-chip-dot" style={{ backgroundImage: `linear-gradient(135deg, ${from}, ${to})` }}>
        <span className="material-symbols-outlined">co_present</span>
      </span>
      <span>{name}</span>
    </El>
  )
}

export function CourseChip({ name, onClick, title }) {
  if (!name) {
    return (
      <button type="button" onClick={onClick} title={title || 'Assign a course'} className="ca-chip ca-chip--muted">
        <span className="ca-chip-dot" style={{ background: '#cbd5e1' }}>
          <span className="material-symbols-outlined">add</span>
        </span>
        <span>Assign course</span>
      </button>
    )
  }
  const El = onClick ? 'button' : 'span'
  return (
    <El type={onClick ? 'button' : undefined} onClick={onClick} title={title || `Course: ${name}`} className="ca-chip ca-chip--course">
      <span className="ca-chip-dot" style={{ background: 'linear-gradient(135deg,#34c3a8,#2f9bd8)' }}>
        <span className="material-symbols-outlined">auto_stories</span>
      </span>
      <span>{name}</span>
    </El>
  )
}

// The reusable teacher + course assignment fields. `value` = { primaryTeacherId,
// groupId }; `onChange(next)` is called with the merged object. Empty string
// means "leave as-is / none" — callers decide how to persist.
export function AssignFields({ teachers = [], groups = [], value, onChange, idPrefix = 'assign' }) {
  const activeTeachers = teachers.filter(t => !t.removed)
  const activeGroups = groups.filter(g => (g.status || 'active') !== 'archived')
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="block" htmlFor={`${idPrefix}-teacher`}>
        <span className="ca-label flex items-center gap-1.5">
          <span className="material-symbols-outlined" style={{ fontSize: 15 }}>co_present</span>
          Primary teacher
        </span>
        <select
          id={`${idPrefix}-teacher`}
          className="ca-field mt-2"
          value={value?.primaryTeacherId || ''}
          onChange={e => onChange({ ...value, primaryTeacherId: e.target.value })}
        >
          <option value="">— No teacher —</option>
          {activeTeachers.map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
        </select>
      </label>
      <label className="block" htmlFor={`${idPrefix}-course`}>
        <span className="ca-label flex items-center gap-1.5">
          <span className="material-symbols-outlined" style={{ fontSize: 15 }}>auto_stories</span>
          Course
        </span>
        <select
          id={`${idPrefix}-course`}
          className="ca-field mt-2"
          value={value?.groupId || ''}
          onChange={e => onChange({ ...value, groupId: e.target.value })}
        >
          <option value="">— No course —</option>
          {activeGroups.map(g => <option key={g._id} value={g._id}>{g.name}{g.level ? ` · ${g.level}` : ''}</option>)}
          {/* The full course library — not built yet, shown greyed/disabled so the
              catalogue is visible but only the live (pilot) course is assignable. */}
          <optgroup label="Coming soon">
            {PACK_COURSES.map(name => (
              <option key={name} value="" disabled>{name} — coming soon</option>
            ))}
          </optgroup>
        </select>
      </label>
    </div>
  )
}
