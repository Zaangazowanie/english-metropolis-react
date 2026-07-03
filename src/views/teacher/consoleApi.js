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
