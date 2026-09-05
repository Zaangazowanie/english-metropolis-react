// LessonBooking - EnglishMetro student self-scheduling.
//
// Self-contained section rendered inside the v3 Calendar:
//   1. next lesson reminder
//   2. cancellation policy
//   3. upcoming bookings, grouped by series, with cancel flows
//   4. two ways to book: pick any number of times, or repeat weekly
//
// 2026-09-01 (Szymon Zięba's request): book several lessons in one go and a
// "repeat each week" plan. Both go through ONE server call (scheduling:bookLessons)
// so a half-booked plan cannot exist, and one confirmation email lists every date.
//
// ⛔ Failure is visible. Until 2026-09-01 any query failure set `unavailable`
// and the panel returned null — the 08-26 outage rendered as an ABSENCE for 29
// hours. Now a failed load renders an error card with the reason and a retry.

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { FONT, G } from '../../design/v3/tokens.js'
import { useV3Theme } from '../../design/v3/ThemeProvider.jsx'
import { ThreeSlot } from '../../design/v3/three/ThreeSlot.jsx'
import { Glass, Btn, Pill } from '../../design/v3/primitives.jsx'
import { useStudentAuth, getStudentSessionToken } from '../../contexts/StudentAuthContext.jsx'
import { useI18n } from '../../i18n'
import { isStudentView } from '../../lib/student-session.js'
import { CONVEX_URL } from '../../data/studentConfig.js'

const DAY_MS = 24 * 60 * 60 * 1000
// ⛔ 2026-08-23: this was 12h while convex/scheduling.ts and the admin Calendar
// both use 24h. Between 12 and 24 hours before a lesson the student was told the
// cancellation was free and the server then marked it cancelled_late and BILLED the
// credit — a silent charge, in the only place the policy is shown to the person
// paying. The server is authoritative; this must track it.
const CANCELLATION_WINDOW_MS = 24 * 60 * 60 * 1000
const HORIZON_STEPS = [28, 56, 84]
const MAX_WEEKS = 52

// Convex HTTP API. A ConvexError (the refusals a student can act on) arrives as
// `errorData` — prod redacts every plain Error message to "Server Error", which
// is why the old regexes on the message never matched in production.
async function convexCall(kind, path, args) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 30000)
  try {
    const res = await fetch(`${CONVEX_URL}/api/${kind}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, args }),
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`${path} failed with ${res.status}`)
    const payload = await res.json()
    if (payload?.status !== 'success') {
      const err = new Error(payload?.errorMessage || `${path} returned ${payload?.status}`)
      err.data = payload?.errorData ?? null
      throw err
    }
    return payload.value
  } finally {
    clearTimeout(timer)
  }
}

function errorCode(e) {
  const d = e?.data
  if (d && typeof d === 'object' && d.code) return d.code
  if (typeof d === 'string') return d
  const msg = String(e?.message || '')
  for (const c of ['TOO_LATE_TO_BOOK', 'EMAIL_NOT_VERIFIED', 'PACKAGE_EXPIRED', 'NO_LESSONS_REMAINING', 'SLOT_UNAVAILABLE', 'SLOT_TAKEN']) {
    if (msg.includes(c)) return c
  }
  if (/No lessons remaining/i.test(msg)) return 'NO_LESSONS_REMAINING'
  return null
}

function timeToMinutes(time) {
  const [h, m] = String(time || '00:00').split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

function minutesToTime(mins) {
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
}

function dateParts(dateWarsaw) {
  const [y, m, d] = String(dateWarsaw || '').split('-').map(Number)
  const dow = new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay()
  return { y, m, d, dow }
}

function addDays(dateWarsaw, days) {
  return new Date(new Date(`${dateWarsaw}T00:00:00Z`).getTime() + days * DAY_MS).toISOString().slice(0, 10)
}

// Today's date on the Warsaw wall clock (the grid is Warsaw time, not the browser's).
function warsawToday() {
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit' })
  const p = {}
  for (const x of f.formatToParts(new Date())) p[x.type] = x.value
  return `${p.year}-${p.month}-${p.day}`
}

function warsawTzLabel() {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Warsaw', timeZoneName: 'short' }).formatToParts(new Date())
    return parts.find(p => p.type === 'timeZoneName')?.value || 'CET'
  } catch { return 'CET' }
}

// Polish counts: 1 lekcja, 2-4 lekcje (not 12-14), otherwise lekcji. EN forms
// are simply singular|plural|plural. Forms come from i18n so both stay together.
function pluralForm(n, forms) {
  const [one, few, many] = String(forms || '').split('|')
  if (n === 1) return one
  const m10 = n % 10, m100 = n % 100
  if (m10 >= 2 && m10 <= 4 && !(m100 >= 12 && m100 <= 14)) return few || many
  return many || few || one
}

function Notice({ notice, T, onResend, resendLabel }) {
  if (!notice) return null
  const tone = notice.kind === 'ok'
    ? { bg: 'rgba(52,211,153,0.10)', border: 'rgba(52,211,153,0.38)', color: T.emerald, icon: 'check_circle' }
    : notice.kind === 'warn'
      ? { bg: 'rgba(252,211,77,0.10)', border: 'rgba(252,211,77,0.40)', color: T.amber, icon: 'warning' }
      : { bg: 'rgba(251,113,133,0.10)', border: 'rgba(251,113,133,0.38)', color: T.rose, icon: 'error' }
  return (
    <div role="status" style={{
      marginTop: 16,
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '12px 14px',
      borderRadius: 16,
      background: tone.bg,
      border: `1px solid ${tone.border}`,
      color: tone.color,
      fontSize: 13,
      fontWeight: 650,
      flexWrap: 'wrap',
    }}>
      <span className="material-symbols-outlined" style={{ fontSize: 19 }}>{tone.icon}</span>
      <span style={{ flex: 1, minWidth: 200 }}>{notice.text}</span>
      {notice.resend && onResend && (
        <button type="button" onClick={onResend}
          style={{ marginLeft: 'auto', border: `1px solid ${tone.border}`, background: 'transparent',
            color: tone.color, borderRadius: 999, padding: '6px 14px', fontSize: 13,
            fontWeight: 700, cursor: 'pointer', font: 'inherit' }}>
          {resendLabel}
        </button>
      )}
    </div>
  )
}

function EmptySlots({ T, t, weeks }) {
  return (
    <div style={{
      border: `1px dashed ${T.borderHi}`,
      background: T.surface,
      borderRadius: 20,
      padding: 22,
      color: T.textDim,
      display: 'flex',
      gap: 14,
      alignItems: 'flex-start',
    }}>
      <span className="material-symbols-outlined" style={{ color: T.brand, fontSize: 26 }}>event_busy</span>
      <div>
        <div style={{ color: T.text, fontWeight: 700, marginBottom: 4 }}>{t('booking.noSlots', { weeks })}</div>
        <div style={{ fontSize: 13, lineHeight: 1.5 }}>{t('booking.emptyHint')}</div>
      </div>
    </div>
  )
}

function SlotDayCard({ date, slots, dayLabel, selected, onPick, T, isMobile }) {
  const first = slots[0]?.timeWarsaw || ''
  const last = slots[slots.length - 1]?.timeWarsaw || ''
  const compact = slots.length <= 3
  return (
    <div style={{
      position: 'relative',
      overflow: 'hidden',
      borderRadius: 22,
      background: T.surfaceHi,
      border: `1px solid ${T.border}`,
      padding: isMobile ? 14 : 16,
      boxShadow: '0 18px 46px -36px rgba(124,58,237,0.35)',
    }}>
      <div aria-hidden style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        background: 'linear-gradient(135deg, rgba(217,70,239,0.08), transparent 42%)',
      }}/>
      <div style={{ position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: T.text, letterSpacing: '-0.01em' }}>
              {dayLabel(date)}
            </div>
            <div style={{ marginTop: 5, fontFamily: FONT.mono, fontSize: 13, color: T.textDim }}>
              {first}{last && last !== first ? ` – ${last}` : ''}
            </div>
          </div>
          <Pill tone="brand" size="sm" icon="schedule">{slots.length}</Pill>
        </div>

        <div style={{
          marginTop: 14,
          display: 'grid',
          gridTemplateColumns: compact ? 'repeat(auto-fit, minmax(86px, 1fr))' : 'repeat(auto-fit, minmax(78px, 1fr))',
          gap: 8,
        }}>
          {slots.map(slot => {
            const active = selected.has(slot.startUtc)
            return (
              <button
                key={slot.startUtc}
                type="button"
                aria-pressed={active}
                data-slot={slot.startUtc}
                onClick={() => onPick(slot)}
                style={{
                  minHeight: 42,
                  borderRadius: 999,
                  border: active ? '1px solid transparent' : `1px solid ${T.borderHi}`,
                  background: active ? G.brand : T.surface,
                  color: active ? '#fff' : T.text,
                  boxShadow: active ? '0 14px 32px -18px rgba(217,70,239,0.8)' : 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 7,
                  fontFamily: FONT.body,
                  fontSize: 13,
                  fontWeight: 750,
                  cursor: 'pointer',
                  transition: 'transform 180ms cubic-bezier(0.16,1,0.3,1), border-color 180ms ease, background 180ms ease',
                }}
                onMouseDown={e => { e.currentTarget.style.transform = 'translateY(1px) scale(0.99)' }}
                onMouseUp={e => { e.currentTarget.style.transform = 'translateY(0)' }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)' }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{active ? 'check' : 'add'}</span>
                {slot.timeWarsaw}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// The confirm button's surface: a shader plane over the button that ripples
// from the pointer while hovering, breathes while the request is in flight and
// settles to emerald when the booking succeeds. Pointer events stay on the
// button; the canvas only listens through hostRef. Falls back to the plain
// button (its own sheen) without WebGL or under reduced motion.
function RippleConfirm({ hostRef, busy, settled, children }) {
  return (
    <span ref={hostRef} style={{ position: 'relative', display: 'inline-flex', borderRadius: 999, isolation: 'isolate' }}>
      {children}
      <ThreeSlot id="booking-ripple" load={() => import('../../design/v3/three/RippleButton.jsx')}
        busy={busy} settled={settled} host={hostRef}
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none', borderRadius: 999, overflow: 'hidden', zIndex: 2 }}
        fallback={null}/>
    </span>
  )
}

function Chip({ children, active, onClick, T, disabled, dataAttr }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-pressed={active} {...(dataAttr || {})}
      style={{
        minHeight: 38, padding: '0 14px', borderRadius: 999,
        border: active ? '1px solid transparent' : `1px solid ${T.borderHi}`,
        background: active ? G.brand : T.surface,
        color: active ? '#fff' : (disabled ? T.textMute || T.textDim : T.text),
        fontFamily: FONT.body, fontSize: 13, fontWeight: 750, cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.55 : 1,
      }}>
      {children}
    </button>
  )
}

const STATUS_TONE = { open: 'emerald', yours: 'sky', taken: 'rose', closed: 'neutral', too_soon: 'amber', past: 'neutral' }

export default function LessonBooking() {
  const { T, isMobile } = useV3Theme()
  const { t, lang } = useI18n()
  const fmtDay = (ms) => new Date(ms).toLocaleDateString(lang === 'pl' ? 'pl-PL' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  const { studentUser } = useStudentAuth()

  const studentId = studentUser?._id
  const organizationId = studentUser?.organizationId
  const teacherId = studentUser?.primaryTeacherId || undefined

  const [state, setState] = useState({ loading: true, bookings: [], slots: [], windows: [], error: null })
  const [horizonDays, setHorizonDays] = useState(HORIZON_STEPS[0])
  const [alloc, setAlloc] = useState(null)
  const [mode, setMode] = useState('pick')
  const [selected, setSelected] = useState(() => new Map())
  const [weekly, setWeekly] = useState({ dayOfWeek: null, timeWarsaw: null, count: 0, fromDate: null })
  const [preview, setPreview] = useState({ loading: false, weeks: [], error: null })
  const [pendingCancel, setPendingCancel] = useState(null)
  const [pendingSeriesCancel, setPendingSeriesCancel] = useState(null)
  const [confirming, setConfirming] = useState(false)
  const [booked, setBooked] = useState(false)
  const [busy, setBusy] = useState(false)
  const rippleHostRef = useRef(null)
  // Success: let the confirm surface settle to emerald for a beat before the
  // block collapses, so the student sees the booking land where they pressed.
  const settleConfirm = async () => {
    setBooked(true)
    await new Promise(r => setTimeout(r, 700))
    setConfirming(false)
    setBooked(false)
  }
  const [notice, setNotice] = useState(null)
  const [tick, setTick] = useState(Date.now())
  const lateArmedRef = useRef(null)

  const lessons = useCallback((n) => pluralForm(n, t('booking.lessonForms')), [t])
  const dayLabel = useCallback((dateWarsaw) => {
    const { m, d, dow } = dateParts(dateWarsaw)
    return `${t(`weekday.short.${dow}`)} ${d} ${t(`month.${m}`)}`
  }, [t])
  const whenLabel = useCallback((b) => `${dayLabel(b.dateWarsaw)} ${t('booking.at')} ${b.timeWarsaw}`, [dayLabel, t])

  // The 24-hour boundary moves while the panel is open; keep the cancel copy honest.
  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), 30000)
    return () => clearInterval(id)
  }, [])

  // Deep links (e.g. the dashboard's "Change or cancel" button) land on
  // #lesson-booking — scroll to the block once it has actually rendered,
  // otherwise the section sits below the curriculum roadmap and is never seen.
  useEffect(() => {
    if (state.loading) return
    if (typeof window === 'undefined' || !window.location.hash.startsWith('#lesson-booking')) return
    const el = document.getElementById('lesson-booking')
    if (el) setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60)
    if (/mode=weekly/.test(window.location.hash)) setMode('weekly')
  }, [state.loading])

  const refresh = useCallback(async () => {
    if (!studentId || !organizationId) {
      setState(s => ({ ...s, loading: false, error: 'no-student' }))
      return
    }
    try {
      const from = warsawToday()
      const to = addDays(from, horizonDays)
      // forStudent: the server hides anything inside the 24-hour lead time, so
      // this list is exactly what can actually be booked.
      const slotArgs = { organizationId, fromDate: from, toDate: to, forStudent: true }
      const availArgs = { organizationId }
      if (teacherId) { slotArgs.teacherId = teacherId; availArgs.teacherId = teacherId }
      const sessionToken = getStudentSessionToken()
      if (!sessionToken) throw new Error('Student session required')
      const [bookings, slots, allocation, windows] = await Promise.all([
        convexCall('query', 'scheduling:listBookings', { sessionToken, organizationId, studentId }),
        convexCall('query', 'scheduling:getOpenSlots', slotArgs),
        convexCall('query', 'orders:getStudentAllocation', { sessionToken, studentId }),
        convexCall('query', 'scheduling:getWeeklyAvailability', availArgs),
      ])
      setAlloc(allocation)
      setState({ loading: false, bookings, slots, windows, error: null })
    } catch (e) {
      // Keep whatever we already had on screen; say what failed; offer a retry.
      setState(s => ({ ...s, loading: false, error: String(e?.message || e) }))
    }
  }, [studentId, organizationId, teacherId, horizonDays])

  useEffect(() => { refresh() }, [refresh])

  const nowMs = tick
  const upcoming = useMemo(() => (state.bookings || [])
    .filter(b => b.status === 'scheduled' && b.startUtc > nowMs)
    .sort((a, b) => a.startUtc - b.startUtc), [state.bookings, nowMs])
  const nextLesson = upcoming[0] || null

  // Upcoming lessons grouped by series (a series shares one seriesId).
  const groups = useMemo(() => {
    const out = []
    const bySeries = new Map()
    for (const b of upcoming) {
      if (!b.seriesId) { out.push({ key: b._id, rows: [b], series: null }); continue }
      if (!bySeries.has(b.seriesId)) { const g = { key: b.seriesId, rows: [], series: b.seriesKind || 'batch' }; bySeries.set(b.seriesId, g); out.push(g) }
      bySeries.get(b.seriesId).rows.push(b)
    }
    return out.sort((a, b) => a.rows[0].startUtc - b.rows[0].startUtc)
  }, [upcoming])

  const { slotDates, slotsByDate, firstSlot } = useMemo(() => {
    const byDate = {}
    for (const s of state.slots || []) {
      if (!byDate[s.dateWarsaw]) byDate[s.dateWarsaw] = []
      byDate[s.dateWarsaw].push(s)
    }
    for (const date of Object.keys(byDate)) byDate[date].sort((a, b) => timeToMinutes(a.timeWarsaw) - timeToMinutes(b.timeWarsaw))
    const dates = Object.keys(byDate).sort()
    return { slotDates: dates, slotsByDate: byDate, firstSlot: dates.length ? byDate[dates[0]][0] : null }
  }, [state.slots])

  // The weekly grid: weekday → times, from the teacher's recurring windows.
  const weeklyGrid = useMemo(() => {
    const grid = new Map()
    for (const w of state.windows || []) {
      if (w.dateWarsaw) continue
      const startMin = timeToMinutes(w.startTime), endMin = timeToMinutes(w.endTime)
      const stride = (w.slotMinutes || 60) + (w.gapMinutes || 0)
      for (let m = startMin; m + (w.slotMinutes || 60) <= endMin; m += stride) {
        if (!grid.has(w.dayOfWeek)) grid.set(w.dayOfWeek, new Set())
        grid.get(w.dayOfWeek).add(minutesToTime(m))
      }
    }
    const days = [...grid.keys()].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))   // Monday first
    return { days, times: (d) => [...(grid.get(d) || [])].sort((a, b) => timeToMinutes(a) - timeToMinutes(b)) }
  }, [state.windows])

  const remaining = alloc?.remaining ?? null
  const selectedList = useMemo(() => [...selected.values()].sort((a, b) => a.startUtc - b.startUtc), [selected])
  const excess = remaining !== null ? Math.max(0, selectedList.length - remaining) : 0

  // First occurrence of a weekday, at least a day out (the server enforces 24h; the
  // preview marks a too-soon first week and it is simply skipped).
  const firstDateFor = useCallback((dow) => {
    let d = addDays(warsawToday(), 1)
    for (let i = 0; i < 8; i++) { if (dateParts(d).dow === dow) return d; d = addDays(d, 1) }
    return d
  }, [])

  const defaultCount = useCallback(() => Math.max(1, Math.min(remaining ?? 12, 12)), [remaining])

  const pickWeeklyDay = (dow) => {
    const times = weeklyGrid.times(dow)
    const timeWarsaw = times.includes(weekly.timeWarsaw) ? weekly.timeWarsaw : (times[0] || null)
    setWeekly(w => ({ dayOfWeek: dow, timeWarsaw, fromDate: firstDateFor(dow), count: w.count || defaultCount() }))
    setNotice(null)
  }

  // Preview the weekly plan whenever its parameters change.
  useEffect(() => {
    if (mode !== 'weekly' || weekly.dayOfWeek === null || !weekly.timeWarsaw || !weekly.fromDate || !weekly.count) return
    let cancelled = false
    setPreview(p => ({ ...p, loading: true, error: null }))
    const args = {
      organizationId, dayOfWeek: weekly.dayOfWeek, timeWarsaw: weekly.timeWarsaw,
      fromDate: weekly.fromDate, count: weekly.count, forStudent: true, studentId,
    }
    if (teacherId) args.teacherId = teacherId
    convexCall('query', 'scheduling:previewWeeklySeries', args)
      .then(r => { if (!cancelled) setPreview({ loading: false, weeks: r?.weeks || [], error: null }) })
      .catch(e => { if (!cancelled) setPreview({ loading: false, weeks: [], error: String(e?.message || e) }) })
    return () => { cancelled = true }
  }, [mode, weekly.dayOfWeek, weekly.timeWarsaw, weekly.fromDate, weekly.count, organizationId, teacherId, studentId])

  const openWeeks = useMemo(() => preview.weeks.filter(w => w.status === 'open'), [preview.weeks])
  const weeklyExcess = remaining !== null ? Math.max(0, openWeeks.length - remaining) : 0

  const describeRefusal = (e) => {
    const code = errorCode(e)
    const d = (e?.data && typeof e.data === 'object') ? e.data : {}
    if (code === 'TOO_LATE_TO_BOOK') return { kind: 'err', text: t('booking.tooLate') }
    if (code === 'EMAIL_NOT_VERIFIED') return { kind: 'err', text: t('booking.verifyEmail'), resend: true }
    if (code === 'PACKAGE_EXPIRED') {
      const n = Number(d.trapped ?? 0)
      return { kind: 'err', text: t('booking.packageExpired', { date: d.expiredAt ? fmtDay(d.expiredAt) : '', n, lessons: lessons(n) }) }
    }
    if (code === 'NO_LESSONS_REMAINING') {
      const rem = Number(d.remaining ?? 0), req = Number(d.requested ?? 1)
      return { kind: 'err', text: rem > 0 ? t('booking.tooManySelected', { remaining: rem, lessons: lessons(rem), excess: req - rem }) : t('booking.noAllocation') }
    }
    if (code === 'SLOT_UNAVAILABLE' || code === 'SLOT_TAKEN' || code === 'OUTSIDE_AVAILABILITY' || code === 'PAST') {
      const slots = Array.isArray(d.slots) ? d.slots : []
      return { kind: 'err', text: t('booking.slotsTaken', { list: slots.map(s => `${dayLabel(s.dateWarsaw)} ${s.timeWarsaw}`).join(', ') || '…' }), slots }
    }
    return { kind: 'err', text: t('booking.error') }
  }

  const doBookSelected = async () => {
    if (!selectedList.length || busy || excess > 0) return
    setBusy(true)
    setNotice(null)
    try {
      const token = getStudentSessionToken()
      if (!token) throw new Error('Student session required')
      const bookArgs = {
        organizationId, studentId, teacherId,
        startUtcs: selectedList.map(s => s.startUtc),
        bookedBy: 'student', bookedByName: studentUser?.name,
        seriesKind: selectedList.length > 1 ? 'batch' : undefined,
      }
      const r = await convexCall('mutation', 'scheduling:bookLessons', { ...bookArgs, sessionToken: token })
      const n = r?.bookings?.length || selectedList.length
      setNotice({ kind: 'ok', text: n === 1 ? t('booking.booked') : t('booking.bookedMany', { n, lessons: lessons(n) }) })
      setSelected(new Map())
      await settleConfirm()
      await refresh()
    } catch (e) {
      const n = describeRefusal(e)
      // The server names the times it refused; drop exactly those and keep the rest selected.
      if (n.slots?.length) {
        setSelected(prev => { const next = new Map(prev); for (const s of n.slots) next.delete(s.startUtc); return next })
        refresh()
      }
      setNotice(n)
    } finally {
      setBusy(false)
    }
  }

  const doBookWeekly = async () => {
    if (!openWeeks.length || busy || weeklyExcess > 0) return
    setBusy(true)
    setNotice(null)
    try {
      const token = getStudentSessionToken()
      if (!token) throw new Error('Student session required')
      const r = await convexCall('mutation', 'scheduling:bookLessons', {
        sessionToken: token, organizationId, studentId, teacherId,
        startUtcs: openWeeks.map(w => w.startUtc),
        bookedBy: 'student', bookedByName: studentUser?.name,
        seriesKind: 'weekly', mode: 'skipRefused',
      })
      const n = r?.bookings?.length || 0
      const skipped = [...preview.weeks.filter(w => w.status !== 'open' && w.status !== 'yours'), ...(r?.skipped || [])]
      let text = n === 1 ? t('booking.booked') : t('booking.bookedMany', { n, lessons: lessons(n) })
      if (skipped.length) text += ' ' + t('booking.skippedWeeks', { list: skipped.map(s => `${dayLabel(s.dateWarsaw)} (${t(`booking.status.${s.reason || s.status}`)})`).join(', ') })
      setNotice({ kind: 'ok', text })
      await settleConfirm()
      setWeekly(w => ({ ...w, count: 0 }))
      setMode('pick')
      await refresh()
    } catch (e) {
      setNotice(describeRefusal(e))
      // The plan may have changed under us: re-preview so the list is honest.
      setWeekly(w => ({ ...w }))
    } finally {
      setBusy(false)
    }
  }

  const doResendVerification = async () => {
    if (busy) return
    setBusy(true)
    try {
      const r = await convexCall('action', 'studentAuth:resendVerification', {
        sessionToken: getStudentSessionToken() || undefined,
      })
      setNotice(r?.alreadyVerified
        ? { kind: 'ok', text: t('booking.verifyAlready') }
        : { kind: 'ok', text: t('booking.verifySent') })
    } catch {
      setNotice({ kind: 'err', text: t('booking.error') })
    } finally {
      setBusy(false)
    }
  }

  const doCancel = async () => {
    if (!pendingCancel || busy) return
    // The card said "no charge" when it opened; if the 24-hour boundary has
    // passed since, say so and ask for a second tap instead of charging silently.
    const lateNow = pendingCancel.startUtc - Date.now() < CANCELLATION_WINDOW_MS
    if (lateNow && !pendingCancel.wasLate && lateArmedRef.current !== pendingCancel._id) {
      lateArmedRef.current = pendingCancel._id
      setTick(Date.now())
      setNotice({ kind: 'warn', text: t('booking.lateFlip') })
      return
    }
    setBusy(true)
    setNotice(null)
    try {
      const token = getStudentSessionToken()
      if (!token) throw new Error('Student session required')
      const result = await convexCall('mutation', 'scheduling:cancelBooking', {
        sessionToken: token, bookingId: pendingCancel._id, cancelledBy: 'student', cancelledByName: studentUser?.name,
      })
      setNotice(result.billable
        ? { kind: 'warn', text: t('booking.cancelledLate') }
        : { kind: 'ok', text: t('booking.cancelled') })
      setPendingCancel(null)
      lateArmedRef.current = null
      await refresh()
    } catch {
      setNotice({ kind: 'err', text: t('booking.error') })
    } finally {
      setBusy(false)
    }
  }

  const doCancelSeries = async (fromStartUtc) => {
    if (!pendingSeriesCancel || busy) return
    setBusy(true)
    setNotice(null)
    try {
      const token = getStudentSessionToken()
      if (!token) throw new Error('Student session required')
      const result = await convexCall('mutation', 'scheduling:cancelSeries', {
        sessionToken: token, seriesId: pendingSeriesCancel.seriesId, fromStartUtc,
        cancelledBy: 'student', cancelledByName: studentUser?.name,
      })
      const n = result?.cancelled || 0
      setNotice(result?.cancelledLate
        ? { kind: 'warn', text: t('booking.seriesCancelledLate', { n, lessons: lessons(n), late: result.cancelledLate }) }
        : { kind: 'ok', text: t('booking.seriesCancelled', { n, lessons: lessons(n) }) })
      setPendingSeriesCancel(null)
      await refresh()
    } catch {
      setNotice({ kind: 'err', text: t('booking.error') })
    } finally {
      setBusy(false)
    }
  }

  const openSeriesCancel = (group, fromRow) => {
    const rows = group.rows.filter(r => !fromRow || r.startUtc >= fromRow.startUtc)
    setPendingSeriesCancel({ seriesId: group.key, rows, fromStartUtc: fromRow ? fromRow.startUtc : undefined })
    setPendingCancel(null)
    setConfirming(false)
    setNotice(null)
  }

  if (state.loading) {
    return (
      <div id="lesson-booking" style={{ marginBottom: 28 }}>
        <Glass padding={isMobile ? 20 : 28}>
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ height: 18, width: 160, borderRadius: 999, background: T.surface }}/>
            <div style={{ height: 38, width: isMobile ? '86%' : 420, borderRadius: 12, background: T.surface }}/>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 12 }}>
              {[0, 1, 2].map(i => <div key={i} style={{ height: 118, borderRadius: 22, background: T.surface }}/>)}
            </div>
          </div>
        </Glass>
      </div>
    )
  }

  const pendingActivation = alloc?.pendingUntil && alloc.pendingUntil > nowMs
  const canBook = !pendingActivation
  const cancelIsLate = pendingCancel && (pendingCancel.startUtc - nowMs < CANCELLATION_WINDOW_MS)
  const seriesFirstLate = pendingSeriesCancel && pendingSeriesCancel.rows.length && (pendingSeriesCancel.rows[0].startUtc - nowMs < CANCELLATION_WINDOW_MS)
  const panelGrid = isMobile ? '1fr' : 'minmax(0, 1.15fr) minmax(280px, 0.85fr)'
  const tz = warsawTzLabel()
  const sectionLabel = { fontSize: 13, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: T.textDim }
  const cardBox = (tone) => ({
    marginTop: 20,
    padding: isMobile ? 16 : 20,
    borderRadius: 22,
    background: tone === 'rose' ? 'rgba(251,113,133,0.08)' : tone === 'brand' ? 'rgba(217,70,239,0.08)' : T.surface,
    border: `1px solid ${tone === 'rose' ? 'rgba(251,113,133,0.44)' : tone === 'brand' ? 'rgba(217,70,239,0.32)' : T.borderHi}`,
  })

  return (
    <div id="lesson-booking" style={{ marginBottom: 32 }}>
      <Glass padding={isMobile ? 18 : 26} style={{ position: 'relative', overflow: 'hidden', borderRadius: 28 }}>
        <div aria-hidden style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background: 'radial-gradient(circle at 92% 8%, rgba(217,70,239,0.12), transparent 34%), radial-gradient(circle at 8% 100%, rgba(139,92,246,0.10), transparent 36%)',
        }}/>

        <div style={{ position: 'relative' }}>
          <div style={{ display: 'grid', gridTemplateColumns: panelGrid, gap: isMobile ? 18 : 24, alignItems: 'start' }}>
            <div>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 999,
                background: 'rgba(217,70,239,0.10)', border: '1px solid rgba(217,70,239,0.22)',
                color: T.brandInk || T.brand, fontSize: 13, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase',
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: 15 }}>calendar_add_on</span>
                {t('booking.kicker')}
              </div>
              <h2 style={{
                margin: '14px 0 0', fontFamily: FONT.display, fontWeight: 700,
                fontSize: isMobile ? 28 : 40, lineHeight: 1, letterSpacing: '-0.035em', color: T.text,
              }}>
                {t('booking.title')}
              </h2>
              <p style={{ margin: '12px 0 0', maxWidth: 650, color: T.textDim, fontSize: 14, lineHeight: 1.6 }}>
                {t('booking.intro')}
              </p>
              {alloc && (
                <div style={{ marginTop: 12, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span data-testid="credits-pill" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px',
                    borderRadius: 999, fontSize: 13, fontWeight: 700,
                    background: alloc.remaining > 0 ? 'rgba(52,211,153,0.12)' : 'rgba(252,211,77,0.12)',
                    color: alloc.remaining > 0 ? T.emerald : T.amber,
                    border: `1px solid ${alloc.remaining > 0 ? 'rgba(52,211,153,0.3)' : 'rgba(252,211,77,0.35)'}` }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>token</span>
                    {t('booking.lessonsLeft', { n: alloc.remaining, lessons: lessons(alloc.remaining) })}
                    {alloc.remaining > 0 && alloc.validUntil ? ` · ${t('booking.validUntil', { date: fmtDay(alloc.validUntil) })}` : ''}
                  </span>
                  {alloc.remaining <= 0 && alloc.expiredUnused > 0 && alloc.expiredAt && (
                    <span data-testid="package-expired" style={{ fontSize: 13, color: T.amber, maxWidth: 520, lineHeight: 1.5 }}>
                      {t('booking.packageExpired', { date: fmtDay(alloc.expiredAt), n: alloc.expiredUnused, lessons: lessons(alloc.expiredUnused) })}
                    </span>
                  )}
                  {alloc.remaining <= 0 && studentUser?.slug && (
                    <a href={`${isStudentView() ? '/admin/student-view' : '/app'}/${studentUser.slug}/buy`} style={{ display: 'inline-flex', alignItems: 'center',
                      gap: 6, padding: '7px 14px', borderRadius: 999, textDecoration: 'none',
                      background: 'linear-gradient(135deg, #8B5CF6, #D946EF)', color: '#fff',
                      fontSize: 13, fontWeight: 700, letterSpacing: '0.06em' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 15 }}>shopping_cart</span>
                      {t('booking.buyCta')}
                    </a>
                  )}
                </div>
              )}
            </div>

            <div style={{ borderRadius: 24, background: T.surface, border: `1px solid ${T.border}`, padding: 16, display: 'grid', gap: 12 }}>
              {nextLesson ? (
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: 16, display: 'grid', placeItems: 'center',
                    background: 'rgba(52,211,153,0.12)', color: T.emerald, border: '1px solid rgba(52,211,153,0.30)', flexShrink: 0,
                  }}>
                    <span className="material-symbols-outlined">event_available</span>
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: T.emerald }}>
                      {t('booking.nextLesson')}
                    </div>
                    <div style={{ marginTop: 3, color: T.text, fontSize: 18, fontWeight: 750 }}>
                      {whenLabel(nextLesson)}
                    </div>
                  </div>
                  <Btn variant="danger" size="sm" icon="event_busy" onClick={() => { setPendingCancel({ ...nextLesson, wasLate: nextLesson.startUtc - Date.now() < CANCELLATION_WINDOW_MS }); setPendingSeriesCancel(null); setConfirming(false); setNotice(null) }}>
                    {t('booking.cancel')}
                  </Btn>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: 16, display: 'grid', placeItems: 'center',
                    background: 'rgba(217,70,239,0.12)', color: T.brandInk || T.brand, border: '1px solid rgba(217,70,239,0.28)', flexShrink: 0,
                  }}>
                    <span className="material-symbols-outlined">event_upcoming</span>
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: T.textDim }}>
                      {t('booking.nextAvailable')}
                    </div>
                    <div style={{ marginTop: 3, color: T.text, fontSize: 18, fontWeight: 750 }}>
                      {firstSlot ? whenLabel(firstSlot) : t('booking.noOpenSlot')}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {state.error && (
            <div role="alert" data-testid="booking-error" style={{
              marginTop: 18, padding: '14px 16px', borderRadius: 18,
              background: 'rgba(251,113,133,0.08)', border: '1px solid rgba(251,113,133,0.44)', color: T.rose,
              fontSize: 13, lineHeight: 1.5, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap',
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 20, flexShrink: 0 }}>error</span>
              <span style={{ flex: 1, minWidth: 200 }}>{t('booking.loadError', { reason: state.error })}</span>
              <Btn variant="secondary" size="sm" icon="refresh" onClick={() => { setState(s => ({ ...s, loading: true })); refresh() }}>{t('booking.retry')}</Btn>
            </div>
          )}

          {pendingActivation && (
            <div style={{
              marginTop: 18, padding: '12px 14px', borderRadius: 18,
              background: 'rgba(217,70,239,0.08)', border: '1px solid rgba(217,70,239,0.32)', color: T.text,
              fontSize: 13, lineHeight: 1.5, display: 'flex', gap: 10, alignItems: 'flex-start',
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 20, flexShrink: 0, color: T.brand }}>hourglass_top</span>
              <span>
                <b>{t('booking.pendingActivationTitle')}.</b>{' '}
                {t('booking.pendingActivationBody', { date: new Intl.DateTimeFormat(undefined, { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Warsaw' }).format(new Date(alloc.pendingUntil)) })}
              </span>
            </div>
          )}

          <div style={{
            marginTop: 18, padding: '12px 14px', borderRadius: 18,
            background: 'rgba(252,211,77,0.08)', border: '1px solid rgba(252,211,77,0.34)', color: T.amber,
            fontSize: 13, lineHeight: 1.5, display: 'flex', gap: 10, alignItems: 'flex-start',
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20, flexShrink: 0 }}>warning</span>
            <span>{t('booking.policy')}</span>
          </div>

          <Notice notice={notice} T={T} onResend={doResendVerification} resendLabel={t('booking.verifyResend')} />

          {upcoming.length > 0 && (
            <div style={{ marginTop: 20 }} data-testid="upcoming-list">
              <div style={{ ...sectionLabel, marginBottom: 10 }}>{t('booking.upcoming')}</div>
              <div style={{ display: 'grid', gap: 10 }}>
                {groups.map(g => {
                  if (!g.series) {
                    const b = g.rows[0]
                    return (
                      <div key={g.key} style={{
                        display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'auto minmax(0, 1fr) auto',
                        alignItems: 'center', gap: 12, padding: 14, borderRadius: 18, background: T.surface, border: `1px solid ${T.border}`,
                      }}>
                        <Pill tone="emerald" icon="event">{b.timeWarsaw}</Pill>
                        <span style={{ color: T.text, fontSize: 14, fontWeight: 650 }}>{dayLabel(b.dateWarsaw)}</span>
                        <Btn variant="ghost" size="sm" icon="event_busy" onClick={() => { setPendingCancel({ ...b, wasLate: b.startUtc - Date.now() < CANCELLATION_WINDOW_MS }); setPendingSeriesCancel(null); setConfirming(false); setNotice(null) }}>
                          {t('booking.cancel')}
                        </Btn>
                      </div>
                    )
                  }
                  const first = g.rows[0]
                  const sameDay = g.rows.every(r => dateParts(r.dateWarsaw).dow === dateParts(first.dateWarsaw).dow && r.timeWarsaw === first.timeWarsaw)
                  const title = g.series === 'weekly' && sameDay
                    ? t('booking.seriesWeekly', { day: t(`booking.weekdays.${dateParts(first.dateWarsaw).dow}`), time: first.timeWarsaw })
                    : t('booking.seriesBatch')
                  return (
                    <div key={g.key} data-testid="series-group" style={{ padding: 14, borderRadius: 18, background: T.surface, border: `1px solid ${T.borderHi}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <Pill tone="violet" icon={g.series === 'weekly' ? 'repeat' : 'stacks'}>{title}</Pill>
                        <span style={{ color: T.textDim, fontSize: 13, fontWeight: 650 }}>{t('booking.seriesRemaining', { n: g.rows.length, lessons: lessons(g.rows.length) })}</span>
                        {g.rows.length > 1 && (
                          <Btn variant="ghost" size="sm" icon="event_busy" style={{ marginLeft: 'auto' }} onClick={() => openSeriesCancel(g, null)}>
                            {t('booking.cancelRest')}
                          </Btn>
                        )}
                      </div>
                      <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                        {g.rows.map((b, i) => (
                          <div key={b._id} style={{
                            display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'auto minmax(0, 1fr) auto auto',
                            alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 14, background: T.surfaceHi, border: `1px solid ${T.border}`,
                          }}>
                            <Pill tone="emerald" icon="event" size="sm">{b.timeWarsaw}</Pill>
                            <span style={{ color: T.text, fontSize: 14, fontWeight: 650 }}>{dayLabel(b.dateWarsaw)}</span>
                            <Btn variant="ghost" size="sm" icon="event_busy" onClick={() => { setPendingCancel({ ...b, wasLate: b.startUtc - Date.now() < CANCELLATION_WINDOW_MS }); setPendingSeriesCancel(null); setConfirming(false); setNotice(null) }}>
                              {t('booking.cancel')}
                            </Btn>
                            {i < g.rows.length - 1 ? (
                              <Btn variant="ghost" size="sm" icon="playlist_remove" onClick={() => openSeriesCancel(g, b)}>{t('booking.cancelFromHere')}</Btn>
                            ) : <span />}
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {canBook && (
            <div style={{ marginTop: 24 }}>
              <div style={{ display: 'flex', alignItems: 'end', justifyContent: 'space-between', gap: 14, marginBottom: 12, flexWrap: 'wrap' }}>
                <div>
                  <div style={sectionLabel}>{t('booking.openSlots')}</div>
                  <div style={{ marginTop: 4, color: T.textSoft, fontSize: 13 }}>{t('booking.timezoneNote', { tz })}</div>
                </div>
                <div style={{ display: 'flex', gap: 8 }} role="tablist">
                  <Chip T={T} active={mode === 'pick'} onClick={() => { setMode('pick'); setConfirming(false); setNotice(null) }} dataAttr={{ 'data-testid': 'tab-pick', role: 'tab' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 16, verticalAlign: '-3px', marginRight: 6 }}>touch_app</span>{t('booking.tabPick')}
                  </Chip>
                  <Chip T={T} active={mode === 'weekly'} onClick={() => { setMode('weekly'); setConfirming(false); setNotice(null); if (weekly.dayOfWeek === null && weeklyGrid.days.length) pickWeeklyDay(weeklyGrid.days[0]) }} dataAttr={{ 'data-testid': 'tab-weekly', role: 'tab' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 16, verticalAlign: '-3px', marginRight: 6 }}>repeat</span>{t('booking.tabWeekly')}
                  </Chip>
                </div>
              </div>

              {mode === 'pick' && (
                <>
                  {slotDates.length === 0 ? (
                    <EmptySlots T={T} t={t} weeks={Math.round(horizonDays / 7)} />
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
                      {slotDates.map(date => (
                        <SlotDayCard
                          key={date}
                          date={date}
                          slots={slotsByDate[date]}
                          dayLabel={dayLabel}
                          selected={selected}
                          onPick={slot => {
                            setSelected(prev => { const next = new Map(prev); if (next.has(slot.startUtc)) next.delete(slot.startUtc); else next.set(slot.startUtc, slot); return next })
                            setPendingCancel(null); setPendingSeriesCancel(null); setNotice(null)
                          }}
                          T={T}
                          isMobile={isMobile}
                        />
                      ))}
                    </div>
                  )}
                  {horizonDays < HORIZON_STEPS[HORIZON_STEPS.length - 1] && (
                    <div style={{ marginTop: 12, display: 'flex', justifyContent: 'center' }}>
                      <Btn variant="ghost" size="sm" icon="expand_more" onClick={() => setHorizonDays(h => HORIZON_STEPS[Math.min(HORIZON_STEPS.indexOf(h) + 1, HORIZON_STEPS.length - 1)])}>
                        {t('booking.showMoreWeeks')}
                      </Btn>
                    </div>
                  )}

                  {selectedList.length > 0 && (
                    <div style={cardBox('brand')} data-testid="selection-bar">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <Pill tone="solid" icon="check">{t('booking.selectedCount', { n: selectedList.length })}</Pill>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: 1 }}>
                          {selectedList.map(s => (
                            <button key={s.startUtc} type="button" onClick={() => setSelected(prev => { const next = new Map(prev); next.delete(s.startUtc); return next })}
                              title={t('booking.cancel')}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 999, border: `1px solid ${T.borderHi}`,
                                background: T.surface, color: T.text, font: 'inherit', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                              {dayLabel(s.dateWarsaw)} {s.timeWarsaw}
                              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>close</span>
                            </button>
                          ))}
                        </div>
                        <Btn variant="ghost" size="sm" onClick={() => { setSelected(new Map()); setConfirming(false) }}>{t('booking.clearSelection')}</Btn>
                      </div>
                      {excess > 0 && (
                        <p style={{ margin: '12px 0 0', color: T.amber, fontSize: 13, fontWeight: 650, lineHeight: 1.5 }}>
                          {t('booking.tooManySelected', { remaining, lessons: lessons(remaining), excess })}
                        </p>
                      )}
                      {!confirming ? (
                        <div style={{ marginTop: 14, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                          <Btn variant="primary" size="md" icon="check" disabled={busy || excess > 0} onClick={() => setConfirming(true)}>
                            {t('booking.confirmMultiBtn', { n: selectedList.length, lessons: lessons(selectedList.length) })}
                          </Btn>
                        </div>
                      ) : (
                        <div style={{ marginTop: 14 }}>
                          <div style={{ fontFamily: FONT.display, fontSize: 21, fontWeight: 700, color: T.text }}>
                            {selectedList.length === 1 ? t('booking.confirmBookTitle') : t('booking.confirmMultiTitle', { n: selectedList.length, lessons: lessons(selectedList.length) })}
                          </div>
                          <p style={{ margin: '8px 0 0', color: T.textSoft, fontSize: 14, lineHeight: 1.5 }}>
                            {selectedList.length === 1
                              ? t('booking.confirmBookBody', { date: dayLabel(selectedList[0].dateWarsaw), time: selectedList[0].timeWarsaw })
                              : t('booking.confirmMultiBody')}
                          </p>
                          <div style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                            <RippleConfirm hostRef={rippleHostRef} busy={busy} settled={booked}>
                              <Btn variant="primary" size="md" icon={booked ? 'task_alt' : 'check'} onClick={doBookSelected} disabled={busy || excess > 0} data-testid="confirm-book">
                                {busy ? '…' : (selectedList.length === 1 ? t('booking.confirmBookBtn') : t('booking.confirmMultiBtn', { n: selectedList.length, lessons: lessons(selectedList.length) }))}
                              </Btn>
                            </RippleConfirm>
                            <Btn variant="ghost" size="md" onClick={() => setConfirming(false)} disabled={busy}>{t('booking.back')}</Btn>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              {mode === 'weekly' && (
                <div style={cardBox('neutral')} data-testid="weekly-panel">
                  <p style={{ margin: 0, color: T.textSoft, fontSize: 13, lineHeight: 1.5 }}>{t('booking.weeklyHint')}</p>
                  <div style={{ marginTop: 14 }}>
                    <div style={sectionLabel}>{t('booking.weeklyDay')}</div>
                    <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {weeklyGrid.days.map(d => (
                        <Chip key={d} T={T} active={weekly.dayOfWeek === d} onClick={() => pickWeeklyDay(d)} dataAttr={{ 'data-weekday': d }}>{t(`booking.weekdays.${d}`)}</Chip>
                      ))}
                    </div>
                  </div>
                  {weekly.dayOfWeek !== null && (
                    <div style={{ marginTop: 14 }}>
                      <div style={sectionLabel}>{t('booking.weeklyTime')}</div>
                      <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {weeklyGrid.times(weekly.dayOfWeek).map(tm => (
                          <Chip key={tm} T={T} active={weekly.timeWarsaw === tm} onClick={() => { setWeekly(w => ({ ...w, timeWarsaw: tm })); setNotice(null) }} dataAttr={{ 'data-time': tm }}>{tm}</Chip>
                        ))}
                      </div>
                    </div>
                  )}
                  {weekly.dayOfWeek !== null && weekly.timeWarsaw && (
                    <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'auto auto', gap: 14, alignItems: 'end' }}>
                      <div>
                        <div style={sectionLabel}>{t('booking.weeklyCount')}</div>
                        <div style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 6, border: `1px solid ${T.borderHi}`, borderRadius: 999, padding: 4, background: T.surface }}>
                          <Btn variant="ghost" size="sm" icon="remove" disabled={weekly.count <= 1} onClick={() => setWeekly(w => ({ ...w, count: Math.max(1, w.count - 1) }))} />
                          <input type="number" min={1} max={MAX_WEEKS} value={weekly.count} data-testid="weekly-count"
                            onChange={e => setWeekly(w => ({ ...w, count: Math.max(1, Math.min(MAX_WEEKS, Number(e.target.value) || 1)) }))}
                            style={{ width: 56, textAlign: 'center', font: 'inherit', fontSize: 16, fontWeight: 800, color: T.text, background: 'transparent', border: 'none', outline: 'none' }} />
                          <Btn variant="ghost" size="sm" icon="add" disabled={weekly.count >= MAX_WEEKS} onClick={() => setWeekly(w => ({ ...w, count: Math.min(MAX_WEEKS, w.count + 1) }))} />
                        </div>
                      </div>
                      <div>
                        <div style={sectionLabel}>{t('booking.weeklyFrom')}</div>
                        <div style={{ marginTop: 8, color: T.text, fontSize: 14, fontWeight: 700 }}>{weekly.fromDate ? `${dayLabel(weekly.fromDate)} ${t('booking.at')} ${weekly.timeWarsaw}` : '—'}</div>
                      </div>
                    </div>
                  )}

                  {weekly.dayOfWeek !== null && weekly.timeWarsaw && (
                    <div style={{ marginTop: 16 }} data-testid="weekly-preview">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <div style={sectionLabel}>{t('booking.weeklyPreview')}</div>
                        {!preview.loading && preview.weeks.length > 0 && (
                          <Pill tone={openWeeks.length ? 'emerald' : 'amber'} size="sm">{t('booking.weeklySummary', { open: openWeeks.length, count: preview.weeks.length })}</Pill>
                        )}
                        {preview.loading && <span style={{ color: T.textDim, fontSize: 13 }}>…</span>}
                      </div>
                      {preview.error && <p style={{ margin: '8px 0 0', color: T.rose, fontSize: 13 }}>{t('booking.loadError', { reason: preview.error })}</p>}
                      <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: 6 }}>
                        {preview.weeks.map(w => (
                          <div key={w.startUtc} data-week-status={w.status} style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                            padding: '8px 12px', borderRadius: 12, background: T.surface, border: `1px solid ${T.border}`,
                            opacity: w.status === 'open' || w.status === 'yours' ? 1 : 0.7,
                          }}>
                            <span style={{ color: T.text, fontSize: 13, fontWeight: 650 }}>{dayLabel(w.dateWarsaw)} · {w.timeWarsaw}</span>
                            <Pill tone={STATUS_TONE[w.status] || 'neutral'} size="sm">{t(`booking.status.${w.status}`)}</Pill>
                          </div>
                        ))}
                      </div>
                      {weeklyExcess > 0 && (
                        <p style={{ margin: '12px 0 0', color: T.amber, fontSize: 13, fontWeight: 650, lineHeight: 1.5 }}>
                          {t('booking.tooManySelected', { remaining, lessons: lessons(remaining), excess: weeklyExcess })}
                        </p>
                      )}
                      {openWeeks.length > 0 && (
                        <div style={{ marginTop: 14, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                          {!confirming ? (
                            <Btn variant="primary" size="md" icon="repeat" disabled={busy || weeklyExcess > 0 || preview.loading} onClick={() => setConfirming(true)}>
                              {t('booking.confirmWeeklyBtn', { n: openWeeks.length, lessons: lessons(openWeeks.length) })}
                            </Btn>
                          ) : (
                            <>
                              <span style={{ color: T.textSoft, fontSize: 14 }}>{t('booking.confirmMultiBody')}</span>
                              <RippleConfirm hostRef={rippleHostRef} busy={busy} settled={booked}>
                                <Btn variant="primary" size="md" icon={booked ? 'task_alt' : 'check'} disabled={busy || weeklyExcess > 0} onClick={doBookWeekly} data-testid="confirm-weekly">
                                  {busy ? '…' : t('booking.confirmWeeklyBtn', { n: openWeeks.length, lessons: lessons(openWeeks.length) })}
                                </Btn>
                              </RippleConfirm>
                              <Btn variant="ghost" size="md" onClick={() => setConfirming(false)} disabled={busy}>{t('booking.back')}</Btn>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {pendingCancel && (
            <div style={cardBox(cancelIsLate ? 'rose' : 'neutral')} data-testid="cancel-card">
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1fr) auto', gap: 16, alignItems: 'center' }}>
                <div>
                  <div style={{ fontFamily: FONT.display, fontSize: 21, fontWeight: 700, color: T.text }}>{t('booking.confirmCancelTitle')}</div>
                  <p style={{ margin: '8px 0 0', color: T.textSoft, fontSize: 14, lineHeight: 1.5 }}>{whenLabel(pendingCancel)}</p>
                  <p style={{ margin: '8px 0 0', fontSize: 13, lineHeight: 1.55, fontWeight: 650, color: cancelIsLate ? T.rose : T.emerald }}>
                    {cancelIsLate ? t('booking.lateWarning') : t('booking.safeCancel')}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: isMobile ? 'flex-start' : 'flex-end' }}>
                  <Btn variant="danger" size="md" icon="event_busy" onClick={doCancel} disabled={busy}>{busy ? '…' : t('booking.confirmCancelBtn')}</Btn>
                  <Btn variant="secondary" size="md" onClick={() => { setPendingCancel(null); lateArmedRef.current = null }} disabled={busy}>{t('booking.keep')}</Btn>
                </div>
              </div>
            </div>
          )}

          {pendingSeriesCancel && (
            <div style={cardBox(seriesFirstLate ? 'rose' : 'neutral')} data-testid="series-cancel-card">
              <div style={{ fontFamily: FONT.display, fontSize: 21, fontWeight: 700, color: T.text }}>
                {t('booking.confirmSeriesCancelTitle', { n: pendingSeriesCancel.rows.length, lessons: lessons(pendingSeriesCancel.rows.length) })}
              </div>
              <p style={{ margin: '8px 0 0', color: T.textSoft, fontSize: 14, lineHeight: 1.5 }}>{t('booking.seriesCancelList')}</p>
              <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {pendingSeriesCancel.rows.map(r => <Pill key={r._id} tone="neutral" size="sm">{dayLabel(r.dateWarsaw)} {r.timeWarsaw}</Pill>)}
              </div>
              {seriesFirstLate ? (
                <>
                  <p style={{ margin: '12px 0 0', fontSize: 13, lineHeight: 1.55, fontWeight: 650, color: T.rose }}>
                    {t('booking.seriesCancelFirstLate', { when: whenLabel(pendingSeriesCancel.rows[0]) })}
                  </p>
                  <div style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {pendingSeriesCancel.rows.length > 1 && (
                      <Btn variant="primary" size="md" icon="skip_next" disabled={busy} onClick={() => doCancelSeries(pendingSeriesCancel.rows[1].startUtc)}>
                        {t('booking.keepFirstCancelRest')}
                      </Btn>
                    )}
                    <Btn variant="danger" size="md" icon="event_busy" disabled={busy} onClick={() => doCancelSeries(pendingSeriesCancel.fromStartUtc)}>
                      {busy ? '…' : t('booking.cancelAllIncluding', { n: pendingSeriesCancel.rows.length })}
                    </Btn>
                    <Btn variant="secondary" size="md" onClick={() => setPendingSeriesCancel(null)} disabled={busy}>{t('booking.keep')}</Btn>
                  </div>
                </>
              ) : (
                <>
                  <p style={{ margin: '12px 0 0', fontSize: 13, lineHeight: 1.55, fontWeight: 650, color: T.emerald }}>{t('booking.safeCancel')}</p>
                  <div style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <Btn variant="danger" size="md" icon="event_busy" disabled={busy} onClick={() => doCancelSeries(pendingSeriesCancel.fromStartUtc)}>
                      {busy ? '…' : t('booking.cancelAllIncluding', { n: pendingSeriesCancel.rows.length })}
                    </Btn>
                    <Btn variant="secondary" size="md" onClick={() => setPendingSeriesCancel(null)} disabled={busy}>{t('booking.keep')}</Btn>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </Glass>
    </div>
  )
}
