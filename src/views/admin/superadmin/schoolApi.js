// schoolApi — the Convex half of the console: schools, teachers, students, courses.
//
// Everything here maps 1:1 onto a function that is ACTUALLY DEPLOYED on
// wooden-manatee-881 (verified against `convex function-spec --prod`, 239 public
// functions, 2026-07-24). Nothing is invented and no slug is reshaped: the
// growth screens shipped broken because they assumed a naming convention the
// backend did not have, so the identifiers below are copied verbatim.
//
//   organizations = SCHOOLS      students:listOrganizations / createOrganization
//   users(role=teacher)          teachers:listTeachers / create / update / remove / restore
//   students                     students:listStudents / createStudent / updateStudent / archiveStudent
//   groups        = COURSES      students:listGroups, groups:addGroupMember
//
// ORG SCOPING IS NOT OPTIONAL. teachers:listTeachers calls resolveOrg(), which
// throws for a super_admin (organizationId: null) when no org is passed — that
// is the entire reason the Team screen showed "teachers:listTeachers failed".
// Every org-scoped call in this file therefore REQUIRES an explicit id and
// throws a readable error locally rather than sending a request that will come
// back as an opaque Convex "Server Error".

import { mutateAdminConvex, queryAdminConvex } from '../../../contexts/AdminAuthContext.jsx'

/* ─────────────────────────────────────────────────────── vocabularies ───── */
// Sampled from live data rather than guessed. Extend deliberately.

export const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
export const ORG_TYPES = [
  { value: 'school', label: 'School', hint: 'A partner school with its own students and teachers' },
  { value: 'private_practice', label: 'Private practice', hint: 'Direct one-to-one students' },
]
export const STUDENT_TYPES = [
  { value: 'individual', label: 'Individual', hint: 'One-to-one lessons' },
  { value: 'group', label: 'Group', hint: 'Learns as part of a course' },
]

/* ────────────────────────────────────────────────────────── helpers ─────── */

// Polish names carry diacritics; a slug must not. NFD strips them predictably.
export function slugify(name) {
  return String(name || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/ł/gi, 'l')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

function requireOrg(organizationId, what) {
  if (!organizationId) {
    throw new Error(`Pick a school first — ${what} is scoped per school.`)
  }
  return organizationId
}

/* ──────────────────────────────────────────────────────── schools ───────── */

export const listSchools = () => queryAdminConvex('students:listOrganizations', {})

export const createSchool = ({ name, slug, type }) =>
  mutateAdminConvex('students:createOrganization', {
    name: String(name).trim(),
    slug: slug || slugify(name),
    type: type || 'school',
  })

/* ──────────────────────────────────────────────────────── teachers ──────── */

export const listTeachers = (organizationId, includeRemoved = false) =>
  queryAdminConvex('teachers:listTeachers', {
    organizationId: requireOrg(organizationId, 'the teacher list'),
    includeRemoved,
  })

export const createTeacher = ({ name, email, organizationId }) =>
  mutateAdminConvex('teachers:createTeacher', {
    name: String(name).trim(),
    email: String(email).trim().toLowerCase(),
    organizationId: requireOrg(organizationId, 'a new teacher'),
  })

export const updateTeacher = (teacherId, patch) =>
  mutateAdminConvex('teachers:updateTeacher', { teacherId, ...patch })

export const removeTeacher = teacherId =>
  mutateAdminConvex('teachers:removeTeacher', { teacherId })

export const restoreTeacher = teacherId =>
  mutateAdminConvex('teachers:restoreTeacher', { teacherId })

/* ──────────────────────────────────────────────────────── students ──────── */

export const listStudents = (organizationId, activeOnly = true) =>
  queryAdminConvex('students:listStudents', {
    ...(organizationId ? { organizationId } : {}),
    activeOnly,
  })

export const getStudentBySlug = slug => queryAdminConvex('students:getStudentBySlug', { slug })

export const getStudentDashboard = studentSlug =>
  queryAdminConvex('students:getStudentDashboard', { studentSlug })

export const createStudent = fields => {
  const name = String(fields.name || '').trim()
  return mutateAdminConvex('students:createStudent', {
    name,
    slug: fields.slug || slugify(name),
    level: fields.level || 'A1',
    organizationId: requireOrg(fields.organizationId, 'a new student'),
    ...pick(fields, ['email', 'phone', 'nativeLanguage', 'notes', 'targetLevel',
                     'type', 'groupId', 'primaryTeacherId']),
  })
}

export const updateStudent = (studentId, patch) =>
  mutateAdminConvex('students:updateStudent', { studentId, ...patch })

export const archiveStudent = studentId =>
  mutateAdminConvex('students:archiveStudent', { studentId })

/* ───────────────────────────────────────────────── courses (groups) ─────── */
// students:listGroups takes NO sessionToken — it is org-scoped by argument
// alone, so the id is the only thing standing between one school and another's
// course list. Never call it with an org the operator has not selected.

export const listCourses = organizationId =>
  queryAdminConvex('students:listGroups', {
    organizationId: requireOrg(organizationId, 'the course list'),
  })

export const addStudentToCourse = ({ groupId, studentId, role }) =>
  mutateAdminConvex('groups:addGroupMember', { groupId, studentId, ...(role ? { role } : {}) })

/* ─────────────────────────────────────────────────────────── util ───────── */

// Undefined is not the same as null to Convex's validator: an optional field
// must be ABSENT, not present-and-undefined, or the arg check rejects it.
function pick(source, keys) {
  const out = {}
  for (const k of keys) {
    const v = source[k]
    if (v !== undefined && v !== null && v !== '') out[k] = v
  }
  return out
}

export { pick }
