// financeApi — the /api/console/biz/<entity> half of the console fetch seam,
// plus the integer-money helpers every Finance screen shares.
//
// Why a second module instead of growing consoleApi.js: consoleApi covers the
// P1 library/assign contract (GET + POST only). The business store is a generic
// REST surface that also needs PATCH and DELETE, and consoleApi.js is being
// touched by other screens in parallel. Same auth header, same 404 => notLive /
// 401,403 => denied convention, so ConsoleNotLive and ConsoleErrorPanel behave
// identically here.
//
// MONEY. Every amount in em-business.db is an INTEGER of minor units (grosze).
// Nothing in this file divides money by 100 in floating point: formatting slices
// the decimal string, parsing rebuilds it, and the only division is divRound(),
// which is integer arithmetic with half-up rounding. A rounded-in-a-float złoty
// is a wrong invoice, and the schema CHECK (gross = net + vat) will reject it.

import { getAdminSessionToken } from '../../../contexts/AdminAuthContext.jsx'
import { consoleGet } from './consoleApi.js'

const BIZ = '/api/console/biz'

function bizError(status, path) {
  const notLive = status === 404
  const denied = status === 401 || status === 403
  const message = notLive
    ? `${path} is not live on the backend yet (404)`
    : status === 401
      ? 'Admin session missing or expired — please sign in again'
      : status === 403
        ? 'This console requires the super_admin role'
        : status === 409
          ? `${path} was rejected as a conflict (409) — a unique value already exists, or a referenced row does not`
          : status === 400
            ? `${path} rejected the payload (400)`
            : `${path} failed with ${status}`
  const err = new Error(message)
  err.status = status
  err.notLive = notLive
  err.denied = denied
  return err
}

// Writes never auto-retry: replaying a POST that died mid-flight would allocate
// a second invoice number, and gapless numbering is a legal requirement here.
async function bizWrite(method, path, body) {
  const headers = {}
  const token = getAdminSessionToken()
  if (token) headers.Authorization = `Bearer ${token}`
  const init = { method, headers }
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(body)
  }
  const response = await fetch(path, init)
  if (!response.ok) {
    // The backend answers 4xx with {"error": "..."} — surface the real reason
    // (a CHECK constraint name is far more useful than "failed with 400").
    let detail = ''
    try {
      const payload = await response.clone().json()
      detail = payload?.error || payload?.message || ''
    } catch { /* non-JSON body — keep the generic message */ }
    const err = bizError(response.status, path)
    if (detail) err.message = `${err.message}: ${detail}`
    throw err
  }
  if (response.status === 204) return null
  const text = await response.text()
  return text ? JSON.parse(text) : null
}

const enc = value => encodeURIComponent(String(value))

// list → { rows, total, next_cursor, sort, limit }
export const bizList = (entity, params) => consoleGet(`${BIZ}/${enc(entity)}`, params)
export const bizGet = (entity, id) => consoleGet(`${BIZ}/${enc(entity)}/${enc(id)}`)
export const bizCreate = (entity, body) => bizWrite('POST', `${BIZ}/${enc(entity)}`, body)
export const bizUpdate = (entity, id, body) => bizWrite('PATCH', `${BIZ}/${enc(entity)}/${enc(id)}`, body)
export const bizDelete = (entity, id) => bizWrite('DELETE', `${BIZ}/${enc(entity)}/${enc(id)}`)
export const bizRestore = (entity, id) => bizWrite('POST', `${BIZ}/${enc(entity)}/${enc(id)}/restore`)

// The ONLY source of an invoice number. The server allocates it inside the same
// transaction that inserts the row, so this endpoint is a preview: the UI shows
// it, never stores it, and never composes a number of its own.
export const peekInvoiceNumber = params => consoleGet(`${BIZ}/invoices/next-number`, params)

// ── money ────────────────────────────────────────────────────────────────────

const GROUP = /\B(?=(\d{3})+(?!\d))/g
const NBSP = '\u00A0'   // groups must not wrap mid-number in a 40px row

// 123456 → "1 234,56 PLN". Pure string slicing; no float ever touches it.
export function formatMinor(minor, currency = 'PLN') {
  if (minor === null || minor === undefined || minor === '') return '—'
  const n = Number(minor)
  if (!Number.isFinite(n)) return '—'
  const digits = String(Math.abs(Math.trunc(n))).padStart(3, '0')
  const whole = digits.slice(0, -2).replace(GROUP, NBSP)
  const cents = digits.slice(-2)
  const decimal = currency === 'PLN' ? ',' : '.'
  return `${n < 0 ? '−' : ''}${whole}${decimal}${cents} ${currency || ''}`.trim()
}

// Same, without the currency suffix (for tables that carry one currency column).
export function formatMinorBare(minor, currency = 'PLN') {
  if (minor === null || minor === undefined || minor === '') return '—'
  const n = Number(minor)
  if (!Number.isFinite(n)) return '—'
  const digits = String(Math.abs(Math.trunc(n))).padStart(3, '0')
  const whole = digits.slice(0, -2).replace(GROUP, NBSP)
  return `${n < 0 ? '−' : ''}${whole}${currency === 'PLN' ? ',' : '.'}${digits.slice(-2)}`
}

// "1 234,56" | "1234.5" | "70" → 123456 | 123450 | 7000. null when unparseable,
// so a form can refuse to submit instead of posting a silent zero.
export function parseMinor(text) {
  const raw = String(text ?? '').replace(/\s/g, '').replace(',', '.')
  if (!raw) return null
  if (!/^-?\d*(\.\d{0,2})?$/.test(raw) || raw === '-' || raw === '.') return null
  const negative = raw.startsWith('-')
  const [whole = '0', frac = ''] = raw.replace('-', '').split('.')
  const minor = Number(`${whole || '0'}${frac.padEnd(2, '0')}`)
  if (!Number.isSafeInteger(minor)) return null
  return negative ? -minor : minor
}

// Quantities and payroll units are thousandths. "1,5" → 1500.
export function parseMilli(text) {
  const raw = String(text ?? '').replace(/\s/g, '').replace(',', '.')
  if (!raw) return null
  if (!/^\d*(\.\d{0,3})?$/.test(raw) || raw === '.') return null
  const [whole = '0', frac = ''] = raw.split('.')
  const milli = Number(`${whole || '0'}${frac.padEnd(3, '0')}`)
  return Number.isSafeInteger(milli) ? milli : null
}

// 1500 → "1.5", 1000 → "1"
export function formatMilli(milli) {
  if (milli === null || milli === undefined) return '—'
  const n = Number(milli)
  if (!Number.isFinite(n)) return '—'
  const digits = String(Math.abs(Math.trunc(n))).padStart(4, '0')
  const frac = digits.slice(-3).replace(/0+$/, '')
  return `${n < 0 ? '−' : ''}${digits.slice(0, -3)}${frac ? `.${frac}` : ''}`
}

// Integer division, half away from zero. Both arguments are integers and stay
// well inside Number.MAX_SAFE_INTEGER for any invoice this business will issue.
export function divRound(numerator, denominator) {
  const sign = numerator < 0 ? -1 : 1
  const n = Math.abs(numerator)
  return sign * Math.floor((n + Math.floor(denominator / 2)) / denominator)
}

// One invoice line, in minor units. quantity is milli, VAT rate is basis points
// (2300 = 23%). Matches the schema CHECK: gross = net + vat.
export function lineTotals(line) {
  const unit = Number(line.unit_price_minor) || 0
  const qty = Number(line.quantity_milli) || 0
  const rate = Number(line.vat_rate_bp) || 0
  const net = divRound(unit * qty, 1000)
  const vat = divRound(net * rate, 10000)
  return { net_minor: net, vat_minor: vat, gross_minor: net + vat }
}

// ── dates ────────────────────────────────────────────────────────────────────

export const todayIso = () => new Date().toISOString().slice(0, 10)

export function addDaysIso(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

// epoch seconds → "2026-07-24 18:39"
export function formatEpoch(seconds) {
  if (!seconds) return '—'
  const d = new Date(Number(seconds) * 1000)
  if (Number.isNaN(d.getTime())) return '—'
  return `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 16)}`
}

// Is an ISO date inside [start, end]? Plain lexicographic — ISO dates sort.
export const isoWithin = (date, start, end) =>
  (!start || date >= start) && (!end || date <= end)
