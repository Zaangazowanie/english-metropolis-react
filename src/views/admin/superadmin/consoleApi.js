// consoleApi — the frontend half of the /api/console/* seam.
//
// Contract: docs/console/API-CONTRACT.md. Ricky implements the backend on the
// VPS (em-console-api behind nginx `location /api/console/`); console screens
// fetch ONLY through this module so auth, retries and the "backend not live
// yet" convention live in one place.
//
//   • Auth    — the same admin session token the Convex proxy calls already
//               hold (sessionStorage blob), sent as `Authorization: Bearer …`.
//   • 404     — endpoint not flipped live yet → error.notLive = true, so
//               screens render the calm ConsoleNotLive state. Contract rule:
//               build against the documented shape, NEVER mock rows.
//   • 401/403 — session missing/expired or wrong role → error.denied = true.
//   • 429/503 — nginx limit_req over-bursts are generated locally before the
//               request reaches any upstream (same rationale as postAdminApi
//               in AdminAuthContext), so a bounded retry is safe for GETs.
//   • Writes  — consolePost sends JSON with the same auth/error conventions
//               but never auto-retries: replaying an assign that 503'd
//               mid-flight could duplicate curriculumItems rows, so screens
//               surface the error and keep retry as an explicit user click.
//   • Blobs   — deck HTML/PDF previews render in <iframe>s and <a download>
//               can't carry an Authorization header, so consoleGetBlob fetches
//               the bytes WITH the header and hands back a Blob; screens turn
//               it into an object URL (and revoke it when done).

import { getAdminSessionToken } from '../../../contexts/AdminAuthContext.jsx'

function consoleError(status, path) {
  const notLive = status === 404
  const denied = status === 401 || status === 403
  const message = notLive
    ? `${path} is not live on the backend yet (404)`
    : status === 401
      ? 'Admin session missing or expired — please sign in again'
      : status === 403
        ? 'This console requires the super_admin role'
        : `${path} failed with ${status}`
  const err = new Error(message)
  err.status = status
  err.notLive = notLive
  err.denied = denied
  return err
}

function buildQuery(params) {
  const search = new URLSearchParams()
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    search.set(key, String(value))
  })
  const qs = search.toString()
  return qs ? `?${qs}` : ''
}

const RETRY_STATUSES = new Set([429, 503])
const MAX_TRIES = 3

async function consoleFetch(path, params) {
  const headers = {}
  const token = getAdminSessionToken()
  if (token) headers.Authorization = `Bearer ${token}`

  let response
  for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
    response = await fetch(`${path}${buildQuery(params)}`, { headers })
    if (!RETRY_STATUSES.has(response.status) || attempt === MAX_TRIES) break
    await new Promise(resolve => setTimeout(resolve, 150 * attempt))
  }
  if (!response.ok) throw consoleError(response.status, path)
  return response
}

// GET a JSON endpoint, e.g. consoleGet('/api/console/library', { level: 'B1' }).
export async function consoleGet(path, params) {
  const response = await consoleFetch(path, params)
  return response.json()
}

// GET a document endpoint (deck HTML / deck PDF) as a Blob.
export async function consoleGetBlob(path, params) {
  const response = await consoleFetch(path, params)
  return response.blob()
}

// POST a JSON console endpoint (assign / unassign — the P1 writes).
// Deliberately no auto-retry — see the Writes note in the header comment.
export async function consolePost(path, body) {
  const headers = { 'Content-Type': 'application/json' }
  const token = getAdminSessionToken()
  if (token) headers.Authorization = `Bearer ${token}`
  const response = await fetch(path, {
    method: 'POST',
    headers,
    body: JSON.stringify(body || {}),
  })
  if (!response.ok) throw consoleError(response.status, path)
  return response.json()
}

// Contract URL builders. Browse rows carry pdf_url/html_url and callers should
// prefer those when present; the detail response does not repeat them, and the
// patterns are literal in API-CONTRACT.md, so they are built here once.
export const libraryPdfPath = lessonId => `/api/console/library/${encodeURIComponent(lessonId)}/pdf`
export const libraryHtmlPath = lessonId => `/api/console/library/${encodeURIComponent(lessonId)}/html`

// Save an authenticated Blob as a file download. The contract's `?download=1`
// variant exists for direct navigation; from the app we already hold the bytes,
// so a client-side anchor keeps the Authorization story in one place.
export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30000)
}
