// growthApi — the Growth screens' half of the generic business REST surface.
//
// Backend: em-console-api mounts /api/console/biz/<entity> over the entity
// registry in /root/em-console-api/em_business.py:
//
//   GET    /api/console/biz/<entity>            list  → {rows,total,next_cursor,sort,limit}
//   GET    /api/console/biz/<entity>/<id>       get   → {row}|row
//   POST   /api/console/biz/<entity>            create
//   PATCH  /api/console/biz/<entity>/<id>       partial update
//   DELETE /api/console/biz/<entity>/<id>       soft delete
//   POST   /api/console/biz/<entity>/<id>/restore
//   POST   /api/console/biz/ad-metrics/upsert   {rows:[…]} → idempotent per (ad_campaign_id, date)
//
// List params are passed straight through to list_from_params(): `q` (free-text
// over the entity's search columns), `sort` ('-col' for DESC), `limit`,
// `cursor`, `include_deleted`, and any other key is a filter — `col` or
// `col__op` with op in eq/ne/gt/gte/lt/lte/like/in/null.
//
// Auth, the 404 → notLive convention and the 401/403 → denied convention are
// consoleApi's; GET/POST reuse it verbatim. PATCH and DELETE are implemented
// here because consoleApi only ships GET and POST, and this module must not
// edit a file three other console agents are also touching. Same conventions,
// no auto-retry on writes (replaying a half-applied write is worse than an
// error the operator can see and click).

import { getAdminSessionToken } from '../../../../contexts/AdminAuthContext.jsx'
import { consoleGet, consolePost } from '../consoleApi.js'

export const BIZ = '/api/console/biz'

// Entity slug = registry name with underscores as hyphens. ad_metrics_daily is
// mounted as `ad-metrics`, which is the slug the upsert route already uses.
export const ENTITY = {
  campaigns: 'campaigns',
  adAccounts: 'ad-accounts',
  adCampaigns: 'ad-campaigns',
  adMetrics: 'ad-metrics',
  seoPages: 'seo-pages',
}

export const entityPath = entity => `${BIZ}/${entity}`

function writeError(status, path) {
  const notLive = status === 404
  const denied = status === 401 || status === 403
  const message = notLive
    ? `${path} is not live on the backend yet (404)`
    : status === 401
      ? 'Admin session missing or expired — please sign in again'
      : status === 403
        ? 'This console requires the super_admin role'
        : status === 409
          ? 'Conflict — a row with these values already exists, or it is still referenced'
          : `${path} failed with ${status}`
  const err = new Error(message)
  err.status = status
  err.notLive = notLive
  err.denied = denied
  return err
}

async function bizWrite(method, path, body) {
  const headers = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const token = getAdminSessionToken()
  if (token) headers.Authorization = `Bearer ${token}`

  const response = await fetch(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!response.ok) {
    // The API answers JSON `{error: "..."}` for validation failures (a CHECK
    // constraint, an unknown field). Surfacing that beats "failed with 400".
    let detail = ''
    try {
      const data = await response.json()
      detail = data?.error || data?.message || ''
    } catch { /* body was not JSON — fall through to the status message */ }
    const err = writeError(response.status, path)
    if (detail) err.message = detail
    throw err
  }
  if (response.status === 204) return null
  const text = await response.text()
  return text ? JSON.parse(text) : null
}

export const bizList = (entity, params) => consoleGet(entityPath(entity), params)
export const bizCreate = (entity, body) => consolePost(entityPath(entity), body)
export const bizUpdate = (entity, id, body) =>
  bizWrite('PATCH', `${entityPath(entity)}/${encodeURIComponent(id)}`, body)
export const bizDelete = (entity, id) =>
  bizWrite('DELETE', `${entityPath(entity)}/${encodeURIComponent(id)}`)
export const bizRestore = (entity, id) =>
  consolePost(`${entityPath(entity)}/${encodeURIComponent(id)}/restore`, {})

// Idempotent per (ad_campaign_id, date) — re-entering a day corrects it rather
// than double counting. Rows carry source 'manual' or 'import'.
export const bizUpsertAdMetrics = rows => consolePost(`${BIZ}/ad-metrics/upsert`, { rows })

// ── money ────────────────────────────────────────────────────────────────────
// Every *_minor column is an INTEGER count of minor units. Nothing below turns
// one into a float: display splits it with integer division, input parses the
// digits as text. Poland-first, so the default is PLN and the separators are
// Polish (space groups, decimal comma).

// useGrouping:'always' overrides Polish CLDR's minimumGroupingDigits of 2, which
// would otherwise print 1234 ungrouped and 12 345 grouped in the same column.
const GROUPS = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 0, useGrouping: 'always' })

export const DASH = '—'

export function formatMinor(minor, currency = 'PLN') {
  if (minor === null || minor === undefined || minor === '') return DASH
  const n = Math.trunc(Number(minor))
  if (!Number.isFinite(n)) return DASH
  const abs = Math.abs(n)
  // abs/100 is exactly representable whenever the quotient is an integer, so
  // Math.floor here is exact for every value SQLite can hold below 2^53.
  const units = Math.floor(abs / 100)
  const cents = abs % 100
  return `${n < 0 ? '−' : ''}${GROUPS.format(units)},${String(cents).padStart(2, '0')} ${currency}`
}

// Minor units → the string an operator edits ("1234,56"). No thousands groups:
// the value goes straight back through parseMinor.
export function minorToInput(minor) {
  if (minor === null || minor === undefined || minor === '') return ''
  const n = Math.trunc(Number(minor))
  if (!Number.isFinite(n)) return ''
  const abs = Math.abs(n)
  return `${n < 0 ? '-' : ''}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`
}

// "1 234,56" → 123456. Returns null for blank, NaN for anything malformed, so
// callers can tell "left empty" apart from "typed nonsense".
export function parseMinor(text) {
  const raw = String(text ?? '').replace(/[\s ]/g, '').replace(',', '.')
  if (!raw) return null
  if (!/^-?\d+(\.\d{1,2})?$/.test(raw)) return NaN
  const negative = raw.startsWith('-')
  const [whole, frac = ''] = raw.replace('-', '').split('.')
  const minor = Number(whole) * 100 + Number((frac + '00').slice(0, 2))
  if (!Number.isSafeInteger(minor)) return NaN
  return negative ? -minor : minor
}

export const CURRENCIES = ['PLN', 'EUR', 'USD', 'GBP']

// ── numbers, ratios, dates ───────────────────────────────────────────────────

const INTS = new Intl.NumberFormat('pl-PL', { useGrouping: 'always' })

export function formatInt(n) {
  if (n === null || n === undefined || n === '') return DASH
  const v = Number(n)
  return Number.isFinite(v) ? INTS.format(Math.trunc(v)) : DASH
}

// Ratios are ratios, not money: float arithmetic is correct here.
export function formatRatioPct(numerator, denominator, digits = 2) {
  if (!denominator) return DASH
  return `${(100 * (numerator / denominator)).toFixed(digits).replace('.', ',')} %`
}

// Cost per click / per acquisition, rounded to the nearest minor unit — an
// average of integers is not itself an exact integer, and rounding once at the
// end is the only place a fraction is allowed near money.
export function perUnitMinor(spendMinor, units) {
  if (!units) return null
  return Math.round(spendMinor / units)
}

export function epochToDateInput(epoch) {
  if (!epoch) return ''
  const d = new Date(Number(epoch) * 1000)
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
}

export function dateInputToEpoch(value) {
  if (!value) return null
  const ms = Date.parse(`${value}T00:00:00Z`)
  return Number.isNaN(ms) ? null : Math.floor(ms / 1000)
}

export function formatEpoch(epoch) {
  if (!epoch) return DASH
  const d = new Date(Number(epoch) * 1000)
  return Number.isNaN(d.getTime()) ? DASH : d.toISOString().slice(0, 10)
}

export const DAY = 86400

export function daysSince(epoch, now = Math.floor(Date.now() / 1000)) {
  if (!epoch) return null
  return Math.floor((now - Number(epoch)) / DAY)
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

export function isoDaysAgo(days) {
  return new Date(Date.now() - days * DAY * 1000).toISOString().slice(0, 10)
}

// Blank strings must reach the API as SQL NULL, not as ''. A CHECK like
// length(country) = 2 rejects '' and the operator sees a constraint error for
// a field they simply left alone.
export function nullIfBlank(value) {
  if (value === undefined || value === null) return null
  const v = typeof value === 'string' ? value.trim() : value
  return v === '' ? null : v
}
