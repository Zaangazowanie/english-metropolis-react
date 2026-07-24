// crmApi — client for the generic business REST surface.
//
//   GET    /api/console/biz/<entity>            list  (filters, q, sort, limit, cursor)
//   GET    /api/console/biz/<entity>/<id>       get
//   POST   /api/console/biz/<entity>            create
//   PATCH  /api/console/biz/<entity>/<id>       partial update
//   DELETE /api/console/biz/<entity>/<id>       soft delete
//   POST   /api/console/biz/<entity>/<id>/restore
//
// Entities and column names come from em-console-api/em_business.py (ENTITIES
// registry + SCHEMA_CRM); nothing here invents a field.
//
// Why this module exists next to consoleApi.js rather than inside it:
// consoleApi only speaks GET and POST, and it is being edited by several agents
// in this same pass. The write verbs the business surface needs (PATCH, DELETE)
// live here, on the same error convention — `notLive` for 404 so screens can
// render ConsoleNotLive, `denied` for 401/403 — so screens keep one story.
//
// Reads go through consoleGet, which already carries auth + the bounded
// 429/503 retry. Writes never auto-retry: replaying a create would duplicate
// a contact, and duplicates in a CRM are worse than a visible error.

import { consoleGet } from './consoleApi.js'
import { getAdminSessionToken } from '../../../contexts/AdminAuthContext.jsx'

const BIZ = '/api/console/biz'

function bizError(status, path, detail) {
  const notLive = status === 404
  const denied = status === 401 || status === 403
  const message = detail
    || (notLive
      ? `${path} is not live on the backend yet (404)`
      : status === 401
        ? 'Admin session missing or expired — please sign in again'
        : status === 403
          ? 'This console requires the super_admin role'
          : `${path} failed with ${status}`)
  const err = new Error(message)
  err.status = status
  err.notLive = notLive
  err.denied = denied
  return err
}

async function send(method, path, body) {
  const headers = {}
  const token = getAdminSessionToken()
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const response = await fetch(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!response.ok) {
    // em_business raises BusinessError/ConflictError with a human message
    // ("already exists (contacts.email)"). Surface it verbatim when present —
    // "409" alone tells an operator nothing about which field collided.
    let detail = ''
    try {
      const payload = await response.json()
      detail = payload?.error || payload?.message || ''
    } catch {
      detail = ''
    }
    throw bizError(response.status, path, response.status === 404 ? '' : detail)
  }
  if (response.status === 204) return null
  try {
    return await response.json()
  } catch {
    return null
  }
}

// Single-row responses may be the row itself or {row: …}; both are accepted so
// the screens do not care which the backend settled on.
function unwrapRow(payload) {
  if (payload && typeof payload === 'object' && !Array.isArray(payload) && 'row' in payload) {
    return payload.row
  }
  return payload
}

export async function bizList(entity, params) {
  const data = await consoleGet(`${BIZ}/${encodeURIComponent(entity)}`, params)
  const rows = Array.isArray(data) ? data : (data?.rows || [])
  return {
    rows,
    total: typeof data?.total === 'number' ? data.total : rows.length,
    nextCursor: data?.next_cursor || null,
    sort: data?.sort || params?.sort || '',
  }
}

export const bizGet = (entity, id) =>
  consoleGet(`${BIZ}/${encodeURIComponent(entity)}/${encodeURIComponent(id)}`).then(unwrapRow)

export const bizCreate = (entity, body) =>
  send('POST', `${BIZ}/${encodeURIComponent(entity)}`, body).then(unwrapRow)

export const bizUpdate = (entity, id, body) =>
  send('PATCH', `${BIZ}/${encodeURIComponent(entity)}/${encodeURIComponent(id)}`, body).then(unwrapRow)

export const bizDelete = (entity, id) =>
  send('DELETE', `${BIZ}/${encodeURIComponent(entity)}/${encodeURIComponent(id)}`)

export const bizRestore = (entity, id) =>
  send('POST', `${BIZ}/${encodeURIComponent(entity)}/${encodeURIComponent(id)}/restore`).then(unwrapRow)

/* ───────────────────────────────── money ─────────────────────────────────
   Everything is stored and summed as INTEGER minor units (grosze for PLN).
   Sums and the probability weighting stay in integers; the single division by
   100 happens at the display boundary, where Intl rounds to exactly two
   decimals. No business figure is ever produced by float arithmetic.        */

const MONEY_FORMATTERS = new Map()

function moneyFormatter(currency, locale) {
  const key = `${locale}|${currency}`
  let f = MONEY_FORMATTERS.get(key)
  if (!f) {
    try {
      f = new Intl.NumberFormat(locale, {
        style: 'currency',
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    } catch {
      // Unknown ISO code — fall back to a plain number plus the code.
      f = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    }
    MONEY_FORMATTERS.set(key, f)
  }
  return f
}

export function formatMoney(minor, currency = 'PLN', locale = 'pl-PL') {
  const n = Number.isFinite(Number(minor)) ? Number(minor) : 0
  const text = moneyFormatter(currency, locale).format(n / 100)
  return text.includes(currency) || /[^\d\s.,-]/.test(text) ? text : `${text} ${currency}`
}

// "1 234,50" / "1234.5" / "1234" → 123450. Parsed as digit strings, never
// through parseFloat, so no cent is ever lost to binary rounding.
export function parseMoneyToMinor(input) {
  // Strip ordinary, non-breaking and narrow-no-break spaces: pl-PL groups
  // thousands with U+00A0, so a pasted "1 200 000,00" still parses.
  const raw = String(input ?? '').replace(/[\s\u00A0\u202F]/g, '').replace(',', '.')
  if (raw === '') return { minor: 0, error: '' }
  if (!/^\d+(\.\d{0,2})?$/.test(raw)) {
    return { minor: null, error: 'Use digits only, up to two decimals (e.g. 12000 or 12000.50).' }
  }
  const [whole, frac = ''] = raw.split('.')
  const cents = (frac + '00').slice(0, 2)
  const minor = Number(whole) * 100 + Number(cents)
  if (!Number.isSafeInteger(minor)) return { minor: null, error: 'Value is too large.' }
  return { minor, error: '' }
}

// Minor units back into the editable major-unit string. Integer split.
export function minorToInput(minor) {
  const n = Number(minor || 0)
  const whole = Math.trunc(Math.abs(n) / 100)
  const cents = Math.abs(n) % 100
  return `${n < 0 ? '-' : ''}${whole}.${String(cents).padStart(2, '0')}`
}

/* ───────────────────────────────── NIP ─────────────────────────────────── */

// Polish NIP: 10 digits, weighted checksum mod 11 (weights below, remainder 10
// is invalid by construction). Shape validation only — this says the number
// could exist, not that it is registered in the white list.
const NIP_WEIGHTS = [6, 5, 7, 2, 3, 4, 5, 6, 7]

export const nipDigits = value => String(value ?? '').replace(/\D/g, '')

export function isValidNip(value) {
  const d = nipDigits(value)
  if (d.length !== 10) return false
  const sum = NIP_WEIGHTS.reduce((acc, w, i) => acc + w * Number(d[i]), 0)
  const check = sum % 11
  return check !== 10 && check === Number(d[9])
}

export function formatNip(value) {
  const d = nipDigits(value)
  if (d.length !== 10) return String(value ?? '')
  return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6, 8)}-${d.slice(8)}`
}

/* ───────────────────────────────── dates ───────────────────────────────── */

export const nowEpoch = () => Math.floor(Date.now() / 1000)

export function formatEpoch(seconds, withTime = false) {
  if (!seconds) return ''
  const d = new Date(Number(seconds) * 1000)
  if (Number.isNaN(d.getTime())) return ''
  const date = d.toISOString().slice(0, 10)
  return withTime ? `${date} ${d.toTimeString().slice(0, 5)}` : date
}

// A stored TEXT date ('2026-09-01') rendered as-is; no timezone maths on a
// date that was never a timestamp.
export const formatDay = value => (value ? String(value).slice(0, 10) : '')

export function daysUntil(dayString) {
  if (!dayString) return null
  const target = Date.parse(`${String(dayString).slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(target)) return null
  const today = Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`)
  return Math.round((target - today) / 86400000)
}
