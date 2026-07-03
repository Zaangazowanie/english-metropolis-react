// consoleApi — the teacher-scoped client for the /api/console/* seam.
//
// Contract: docs/console/API-CONTRACT.md (P2 — Teacher). Every call sends the
// teacher's magic-link session token as `Authorization: Bearer <token>`; the
// backend (em-console-api on the VPS) verifies role=teacher and scopes every
// response to that teacher's own students/groups SERVER-side. The UI never
// relies on client-side filtering for scoping.
//
// Rollout reality (contract "Notes for the fleet"): endpoints flip live one by
// one. Until an endpoint exists it answers 404 (or the SPA/nginx answers with
// HTML) — both are surfaced here as kind='not-live' so views can render a calm
// "backend not live yet" panel. Rows are NEVER mocked (KICKOFF.md rule 4).

import { getTeacherSessionToken } from '../../contexts/TeacherAuthContext.jsx'

export class ConsoleApiError extends Error {
  constructor(kind, status, message) {
    super(message)
    this.name = 'ConsoleApiError'
    this.kind = kind // 'not-live' | 'auth' | 'http' | 'network' | 'bad-json'
    this.status = status // HTTP status code when one was received, else 0
  }
}

// Core fetch wrapper. `body` may be a plain object (sent as JSON) or a
// FormData (sent as multipart — the browser sets the boundary header itself).
export async function teacherConsoleFetch(path, { method = 'GET', body, headers } = {}) {
  const token = getTeacherSessionToken()
  if (!token) {
    throw new ConsoleApiError('auth', 0, 'No teacher session found — please sign in again via your magic link.')
  }

  const isForm = typeof FormData !== 'undefined' && body instanceof FormData
  let response
  try {
    response = await fetch(path, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body && !isForm ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      body: isForm ? body : body ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ConsoleApiError('network', 0, 'Network error — check your connection and try again.')
  }

  if (response.status === 404) {
    throw new ConsoleApiError('not-live', 404, `${path} is not live yet`)
  }
  if (response.status === 401) {
    throw new ConsoleApiError('auth', 401, 'Your session has expired — sign out and use a fresh magic link.')
  }
  if (response.status === 403) {
    throw new ConsoleApiError('auth', 403, 'This account is not allowed to view this data.')
  }
  if (!response.ok) {
    throw new ConsoleApiError('http', response.status, `The console backend answered ${response.status} — try again in a moment.`)
  }

  // A 200 that isn't JSON is the SPA fallback / a proxy page — i.e. the
  // console service isn't answering on this path yet. Treat as not-live.
  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) {
    throw new ConsoleApiError('not-live', response.status, `${path} did not return JSON — backend not live yet`)
  }

  try {
    return await response.json()
  } catch {
    throw new ConsoleApiError('bad-json', response.status, `${path} returned an unreadable response.`)
  }
}

// ── P2 contract endpoints ──────────────────────────────────────────────────

// GET /api/console/teacher/me
// → { teacher:{id,name,email}, students:[{slug,name,level,group}], groups:[...] }
export function getTeacherMe() {
  return teacherConsoleFetch('/api/console/teacher/me')
}

// GET /api/console/teacher/schedule?from=&to=
// → { lessons:[{date,time,student_slug|group_id,title,status}], bookings:[...] }
export function getTeacherSchedule({ from, to } = {}) {
  const qs = new URLSearchParams()
  if (from) qs.set('from', from)
  if (to) qs.set('to', to)
  const suffix = qs.toString() ? `?${qs.toString()}` : ''
  return teacherConsoleFetch(`/api/console/teacher/schedule${suffix}`)
}

// GET /api/console/teacher/materials?student_slug=
// → { rows:[{ lesson_id, title, student_slug, date, pdf_url, source:"library"|"published" }] }
// (assigned decks + published PDFs for THIS teacher's students only; row shape
// identical to the admin /assignments endpoint.)
export function getTeacherMaterials({ studentSlug } = {}) {
  const qs = new URLSearchParams()
  if (studentSlug) qs.set('student_slug', studentSlug)
  const suffix = qs.toString() ? `?${qs.toString()}` : ''
  return teacherConsoleFetch(`/api/console/teacher/materials${suffix}`)
}

// ── Keywords (teacher-scoped; 9-col shape + read-only mastery) ─────────────
// GET /api/console/teacher/keywords?student_slug=&lesson_id=
// → { rows:[{id, word, translation, ipa, definitionEn, definitionPl,
//            exampleEn, examplePl, wordType, difficulty, mastery}] }
export function getTeacherKeywords({ studentSlug, lessonId } = {}) {
  const qs = new URLSearchParams()
  if (studentSlug) qs.set('student_slug', studentSlug)
  if (lessonId) qs.set('lesson_id', lessonId)
  const suffix = qs.toString() ? `?${qs.toString()}` : ''
  return teacherConsoleFetch(`/api/console/teacher/keywords${suffix}`)
}

// POST /api/console/teacher/keywords/add — { student_slug, lesson_id?, word,
// translation?, ...optional fields } → { ok, id }. The backend enriches
// missing fields asynchronously via the existing enrichment pipeline.
export function addTeacherKeyword(payload) {
  return teacherConsoleFetch('/api/console/teacher/keywords/add', { method: 'POST', body: payload })
}

// POST /api/console/teacher/keywords/update — { id, ...changed fields } → { ok }
export function updateTeacherKeyword(payload) {
  return teacherConsoleFetch('/api/console/teacher/keywords/update', { method: 'POST', body: payload })
}

// POST /api/console/teacher/keywords/delete — { id } → { ok }
export function deleteTeacherKeyword(id) {
  return teacherConsoleFetch('/api/console/teacher/keywords/delete', { method: 'POST', body: { id } })
}

// POST /api/console/teacher/upload — multipart: file (pdf / txt / vtt), fields
// student_slug, date, title?, kind=finished_lesson|transcript.
// → { ok, lesson_id?, ingestion_job_id?, url }
// (The browser sets the multipart boundary itself — teacherConsoleFetch
// deliberately does NOT set Content-Type for FormData bodies.)
export function postTeacherUpload({ file, studentSlug, date, title, kind }) {
  const form = new FormData()
  form.append('file', file)
  form.append('student_slug', studentSlug)
  form.append('date', date)
  if (title) form.append('title', title)
  form.append('kind', kind)
  return teacherConsoleFetch('/api/console/teacher/upload', { method: 'POST', body: form })
}

// Fetch a binary resource (e.g. a deck PDF) with the teacher bearer header —
// a plain <a href> cannot carry Authorization. Returns a Blob. Same error
// mapping as teacherConsoleFetch, except non-HTML content types are accepted
// (PDFs arrive as application/pdf or octet-stream; HTML = SPA fallback = the
// endpoint isn't live).
export async function teacherConsoleFetchBlob(path) {
  const token = getTeacherSessionToken()
  if (!token) {
    throw new ConsoleApiError('auth', 0, 'No teacher session found — please sign in again via your magic link.')
  }
  let response
  try {
    response = await fetch(path, { headers: { Authorization: `Bearer ${token}` } })
  } catch {
    throw new ConsoleApiError('network', 0, 'Network error — check your connection and try again.')
  }
  if (response.status === 404) {
    throw new ConsoleApiError('not-live', 404, `${path} is not live yet`)
  }
  if (response.status === 401) {
    throw new ConsoleApiError('auth', 401, 'Your session has expired — sign out and use a fresh magic link.')
  }
  if (response.status === 403) {
    throw new ConsoleApiError('auth', 403, 'This account is not allowed to fetch this file.')
  }
  if (!response.ok) {
    throw new ConsoleApiError('http', response.status, `The console backend answered ${response.status} — try again in a moment.`)
  }
  const contentType = response.headers.get('content-type') || ''
  if (contentType.includes('text/html')) {
    throw new ConsoleApiError('not-live', response.status, `${path} did not return a file — backend not live yet`)
  }
  return response.blob()
}
