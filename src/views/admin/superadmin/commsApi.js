// commsApi — the COMMS slice's thin layer over the console seam.
//
// consoleApi.js owns auth, the retry policy and the notLive/denied error
// convention, and it is the only place a token is read. It exposes GET and
// POST. The business REST surface (/api/console/biz/<entity>) also needs PATCH
// and DELETE, so those two verbs live here and mirror consoleApi's conventions
// exactly — same Bearer header source, same error shape — rather than forking a
// second auth path. Reads and creates still go through consoleApi untouched.
//
// Backend shapes come from /root/em-console-api/em_business.py:
//   list   → { rows, total, next_cursor, sort, limit }   (keyset pagination)
//   get    → the row object
//   create → the created row      (POST   /biz/<entity>)
//   update → the fresh row        (PATCH  /biz/<entity>/<id>)
//   delete → soft delete          (DELETE /biz/<entity>/<id>)
//   restore                       (POST   /biz/<entity>/<id>/restore)
// Writes are never auto-retried, for the same reason consolePost is not.

import { getAdminSessionToken } from '../../../contexts/AdminAuthContext.jsx'
import { consoleGet, consolePost } from './consoleApi.js'

export const BIZ_ROOT = '/api/console/biz'

export function bizPath(entity, id) {
  return id === undefined || id === null
    ? `${BIZ_ROOT}/${entity}`
    : `${BIZ_ROOT}/${entity}/${encodeURIComponent(id)}`
}

// Identical to consoleApi's private consoleError — kept in sync deliberately so
// screens can branch on error.notLive / error.denied wherever the call came from.
function commsError(status, path) {
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

async function write(method, path, body) {
  const headers = {}
  const token = getAdminSessionToken()
  if (token) headers.Authorization = `Bearer ${token}`
  const init = { method, headers }
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(body)
  }
  const response = await fetch(path, init)
  if (!response.ok) throw commsError(response.status, path)
  // A soft delete has nothing useful to say; 204 / empty body is a success.
  if (response.status === 204) return { ok: true }
  const text = await response.text()
  if (!text) return { ok: true }
  try {
    return JSON.parse(text)
  } catch {
    return { ok: true }
  }
}

export const bizList = (entity, params) => consoleGet(bizPath(entity), params)
export const bizGet = (entity, id) => consoleGet(bizPath(entity, id))
export const bizCreate = (entity, body) => consolePost(bizPath(entity), body)
export const bizUpdate = (entity, id, body) => write('PATCH', bizPath(entity, id), body)
export const bizDelete = (entity, id) => write('DELETE', bizPath(entity, id))
export const bizRestore = (entity, id) => consolePost(`${bizPath(entity, id)}/restore`)

// ── Mail (server-side read path; credentials never reach the browser) ────────
export const MAIL = {
  accounts: '/api/console/mail/accounts',
  directory: '/api/console/mail/directory',
  messages: '/api/console/mail/messages',
  message: '/api/console/mail/message',
}

// /mail/accounts wraps em_mail.list_mailboxes() + unread_counts(). Counts may
// ride on each account row or arrive as a sibling map keyed by address; both are
// read here. A missing count stays null and renders as "—" — never as 0.
export function normaliseAccounts(payload) {
  const raw = Array.isArray(payload)
    ? payload
    : (payload?.accounts || payload?.mailboxes || payload?.rows || [])
  const counts = payload?.counts || payload?.unread_counts || {}
  return raw
    .map(a => {
      const address = String(a.address || a.email || '').toLowerCase()
      const c = counts[address] || {}
      return {
        address,
        name: a.name || '',
        unread: numberOrNull(a.unread ?? c.unread),
        total: numberOrNull(a.total ?? c.total),
        error: a.error || c.error || null,
      }
    })
    .filter(a => a.address)
}

function numberOrNull(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

// ── Formatting ──────────────────────────────────────────────────────────────
// Figures are tabular via .sa-num / .sa-table td (console.css); these only
// decide the string.

const D_SHORT = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short' })
const D_FULL = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
const T_HM = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })

export function formatMailDate(iso) {
  const d = iso ? new Date(iso) : null
  if (!d || Number.isNaN(d.getTime())) return '—'
  const now = new Date()
  if (d.toDateString() === now.toDateString()) return T_HM.format(d)
  return d.getFullYear() === now.getFullYear() ? D_SHORT.format(d) : D_FULL.format(d)
}

export function formatMailDateTime(iso) {
  const d = iso ? new Date(iso) : null
  if (!d || Number.isNaN(d.getTime())) return '—'
  return `${D_FULL.format(d)} ${T_HM.format(d)}`
}

// em_business timestamps are unix SECONDS (INTEGER), not milliseconds.
export function formatStamp(seconds) {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return '—'
  const d = new Date(seconds * 1000)
  return Number.isNaN(d.getTime()) ? '—' : D_FULL.format(d)
}

export function formatBytes(n) {
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} kB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export function formatCount(n) {
  return typeof n === 'number' && Number.isFinite(n) ? n.toLocaleString('en-GB') : '—'
}

export function formatDelay(days, hours) {
  const d = Number(days) || 0
  const h = Number(hours) || 0
  if (!d && !h) return 'immediately'
  return [d ? `${d}d` : null, h ? `${h}h` : null].filter(Boolean).join(' ')
}

// The outreach pacing guard, as it exists in em_mail.py (MAX_OUTREACH_DAY,
// MIN_GAP_SECONDS). Mirrored from pricemate-comms-bridge. The sender enforces
// it regardless of what a sequence row asks for, so the screens show both.
export const PACING = { dailyCap: 10, minGapMinutes: 15 }
