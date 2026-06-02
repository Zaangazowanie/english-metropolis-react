// Calendar — Conversa school admin scheduling view (built 2026-06-02).
//
// What school admins can do here:
//   • See every lesson on a month calendar: taught (from the lessons table),
//     scheduled bookings, cancellations.
//   • Book a lesson for any student into the teacher's open availability.
//   • Cancel scheduled lessons — with the 24-hour billing policy enforced
//     and clearly warned about.
//   • Read the monthly billing summary: completed lessons + billable late
//     cancellations, with month-by-month history.

import { useEffect, useState, useMemo, useCallback } from 'react'
import { queryAdminConvex, mutateAdminConvex, useAdminAuth } from '../../contexts/AdminAuthContext.jsx'

const CONVERSA_ORG = 'js7cb568fpf7qhkqqe55a7jz5s83sadf'
const DAY_MS = 24 * 60 * 60 * 1000
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const POLICY_TEXT = 'Lessons cancelled within 24 hours of the scheduled start time are billed in full.'

function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function prettyDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dow = new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay()
  const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  return `${names[dow]}, ${d} ${MONTH_NAMES[m - 1]} ${y}`
}

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

// ── small building blocks ──────────────────────────────────────────────────

function StatCard({ label, value, accent = 'text-slate-900', sub, delay = 0 }) {
  return (
    <div
      className="liquid-glass-card metric-card-enter rounded-[1.5rem] px-5 py-4 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_24px_48px_-28px_rgba(2,132,199,0.5)]"
      style={{ animationDelay: `${delay}ms` }}
    >
      <p className="font-label text-xs font-bold uppercase tracking-[0.2em] text-slate-400">{label}</p>
      <p className={`mt-2 font-headline text-4xl ${accent}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
    </div>
  )
}

function PolicyNotice() {
  return (
    <div className="mt-4 flex items-start gap-3 rounded-[1.25rem] border border-amber-200 bg-amber-50/70 px-4 py-3">
      <span className="material-symbols-outlined text-amber-600 text-xl shrink-0">warning</span>
      <p className="text-sm leading-relaxed text-amber-800">
        <span className="font-semibold">Cancellation policy: </span>{POLICY_TEXT}
      </p>
    </div>
  )
}

// ── main view ───────────────────────────────────────────────────────────────

export default function AdminCalendar() {
  const { adminUser } = useAdminAuth()
  const organizationId = adminUser?.organizationId || CONVERSA_ORG

  const [cursor, setCursor] = useState(() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1) })
  const [data, setData] = useState({ loading: true, bookings: [], taughtLessons: [], slots: [], students: [], stats: null, error: '' })
  const [bookingPanel, setBookingPanel] = useState(false)
  const [bookStudent, setBookStudent] = useState('')
  const [bookSlot, setBookSlot] = useState(null)
  const [cancelTarget, setCancelTarget] = useState(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState(null)   // { kind: 'ok' | 'warn' | 'err', text }

  const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
  const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0)

  const load = useCallback(async () => {
    setData(d => ({ ...d, loading: true, error: '' }))
    try {
      // Opportunistically mark past scheduled bookings as completed first,
      // so counts below are correct.
      await mutateAdminConvex('scheduling:reconcilePastBookings', { organizationId }).catch(() => {})

      const today = new Date()
      const slotsFrom = ymd(today)
      const slotsTo = ymd(new Date(today.getTime() + 28 * DAY_MS))
      const [bookings, taught, slots, students, stats] = await Promise.all([
        queryAdminConvex('scheduling:listBookings', { organizationId }),
        queryAdminConvex('students:getLessonsByDateRange', {
          organizationId, startDate: ymd(monthStart), endDate: ymd(monthEnd),
        }),
        queryAdminConvex('scheduling:getOpenSlots', { organizationId, fromDate: slotsFrom, toDate: slotsTo }),
        queryAdminConvex('students:listStudents', { organizationId, activeOnly: true }),
        queryAdminConvex('scheduling:getMonthlyLessonStats', { organizationId }),
      ])
      setData({ loading: false, bookings, taughtLessons: taught, slots, students, stats, error: '' })
    } catch {
      setData(d => ({ ...d, loading: false, error: 'Failed to load calendar data.' }))
    }
  }, [organizationId, cursor]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  // ── derived ──
  const bookingsByDate = useMemo(() => {
    const m = {}
    for (const b of data.bookings) {
      if (!m[b.dateWarsaw]) m[b.dateWarsaw] = []
      m[b.dateWarsaw].push(b)
    }
    return m
  }, [data.bookings])

  const taughtByDate = useMemo(() => {
    const m = {}
    for (const item of data.taughtLessons) {
      const d = item.lesson?.date
      if (!d) continue
      if (!m[d]) m[d] = []
      m[d].push(item)
    }
    return m
  }, [data.taughtLessons])

  const slotsByDate = useMemo(() => {
    const m = {}
    for (const s of data.slots) {
      if (!m[s.dateWarsaw]) m[s.dateWarsaw] = []
      m[s.dateWarsaw].push(s)
    }
    return m
  }, [data.slots])

  const upcoming = useMemo(() =>
    data.bookings
      .filter(b => b.status === 'scheduled' && b.startUtc > Date.now())
      .sort((a, b) => a.startUtc - b.startUtc),
    [data.bookings])

  const stats = data.stats
  const currentMonthStats = stats?.currentMonth
  const cursorMonthStats = stats?.months?.find(m => m.month === monthKey(cursor)) || null

  // month grid cells (Monday-first)
  const gridCells = useMemo(() => {
    const firstDow = (monthStart.getDay() + 6) % 7
    const daysInMonth = monthEnd.getDate()
    const cells = []
    for (let i = 0; i < firstDow; i++) cells.push(null)
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push(ymd(new Date(cursor.getFullYear(), cursor.getMonth(), d)))
    }
    return cells
  }, [cursor]) // eslint-disable-line react-hooks/exhaustive-deps

  const todayStr = ymd(new Date())

  // ── actions ──
  const doBook = async () => {
    if (!bookStudent || !bookSlot || busy) return
    setBusy(true); setNotice(null)
    try {
      await mutateAdminConvex('scheduling:bookLesson', {
        organizationId,
        studentId: bookStudent,
        startUtc: bookSlot.startUtc,
        bookedBy: 'school_admin',
        bookedByName: adminUser?.name || 'School Admin',
      })
      const student = data.students.find(s => s._id === bookStudent)
      setNotice({ kind: 'ok', text: `Lesson booked for ${student?.name || 'student'} — ${prettyDate(bookSlot.dateWarsaw)} at ${bookSlot.timeWarsaw}.` })
      setBookingPanel(false); setBookSlot(null); setBookStudent('')
      await load()
    } catch (err) {
      setNotice({ kind: 'err', text: String(err?.message || 'Booking failed.').replace(/^.*Error: /, '') })
    } finally { setBusy(false) }
  }

  const doCancel = async () => {
    if (!cancelTarget || busy) return
    setBusy(true); setNotice(null)
    try {
      const result = await mutateAdminConvex('scheduling:cancelBooking', {
        bookingId: cancelTarget._id,
        cancelledBy: 'school_admin',
        cancelledByName: adminUser?.name || 'School Admin',
      })
      setNotice(result.billable
        ? { kind: 'warn', text: `Lesson cancelled. Because this was within 24 hours of the start time, this lesson WILL BE BILLED.` }
        : { kind: 'ok', text: 'Lesson cancelled — no charge (more than 24 hours ahead).' })
      setCancelTarget(null)
      await load()
    } catch (err) {
      setNotice({ kind: 'err', text: String(err?.message || 'Cancellation failed.').replace(/^.*Error: /, '') })
    } finally { setBusy(false) }
  }

  const cancelIsLate = cancelTarget && (cancelTarget.startUtc - Date.now() < DAY_MS)

  // ── render ──
  if (data.loading && !data.stats) {
    return (
      <div className="space-y-6">
        <div className="glass-panel rounded-[2rem] border border-white/50 px-6 py-6 editorial-shadow animate-pulse">
          <div className="h-4 w-40 rounded bg-slate-200" />
          <div className="mt-4 h-8 w-64 rounded bg-slate-200" />
          <div className="mt-6 grid gap-3 md:grid-cols-4">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-24 rounded-[1.25rem] bg-slate-100" />)}
          </div>
        </div>
        <div className="glass-panel h-96 rounded-[2rem] bg-slate-100 animate-pulse" />
      </div>
    )
  }

  if (data.error) {
    return (
      <div className="glass-panel rounded-[2rem] border border-rose-200 bg-rose-50/50 px-6 py-6 editorial-shadow">
        <span className="material-symbols-outlined text-3xl text-rose-400">error</span>
        <h2 className="mt-3 font-headline text-2xl text-rose-900">Unable to load the calendar</h2>
        <p className="mt-2 text-sm text-rose-700">{data.error}</p>
        <button onClick={load} className="mt-4 rounded-full border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 transition cursor-pointer">
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">

      {/* ── Page heading ── */}
      <section className="glass-panel relative overflow-hidden rounded-[2rem] border border-white/50 px-6 py-8 sm:px-10 editorial-shadow">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background: `
              radial-gradient(ellipse 50% 70% at 95% 0%, rgba(14,165,233,0.10), transparent 60%),
              radial-gradient(ellipse 40% 50% at 5% 100%, rgba(37,99,235,0.07), transparent 55%)`,
          }}
        />
        <div className="relative">
          <p className="font-label text-xs font-bold uppercase tracking-[0.28em] text-sky-600">
            Lesson Planning · {MONTH_NAMES[new Date().getMonth()]} {new Date().getFullYear()}
          </p>
          <h1 className="mt-3 font-headline text-4xl text-slate-900 leading-[1.05]">
            Calendar &amp; <span className="italic text-sky-600">Scheduling</span>
          </h1>
        </div>
      </section>

      {/* ── Monthly billing summary ── */}
      <section className="glass-panel relative overflow-hidden rounded-[2rem] border border-sky-200/70 px-6 py-7 sm:px-8 editorial-shadow">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-br from-sky-50/80 via-white/40 to-blue-50/60" />
        <div className="relative">
          <p className="font-label text-xs font-bold uppercase tracking-[0.28em] text-sky-600">
            Billing Period · {MONTH_NAMES[new Date().getMonth()]} {new Date().getFullYear()}
          </p>
          <h2 className="mt-1 font-headline text-3xl text-slate-900">
            Lessons This <span className="italic text-sky-600">Month</span>
          </h2>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Completed Lessons" value={currentMonthStats?.completedLessons ?? 0} delay={0} />
            <StatCard label="Late Cancellations" value={currentMonthStats?.lateCancellations ?? 0}
              accent={currentMonthStats?.lateCancellations ? 'text-rose-600' : 'text-slate-900'}
              sub="Cancelled < 24h before start — billed" delay={90} />
            <StatCard label="Total Billable" value={currentMonthStats?.billableTotal ?? 0}
              accent="text-sky-700" sub="Completed + late cancellations" delay={180} />
            <StatCard label="Scheduled Ahead" value={upcoming.length} sub="Upcoming booked lessons" delay={270} />
          </div>
          <PolicyNotice />
        </div>
      </section>

      {/* status notice */}
      {notice && (
        <div className={`rounded-[1.25rem] border px-5 py-4 text-sm font-semibold ${
          notice.kind === 'ok' ? 'border-emerald-200 bg-emerald-50/80 text-emerald-800'
          : notice.kind === 'warn' ? 'border-amber-300 bg-amber-50/90 text-amber-900'
          : 'border-rose-200 bg-rose-50/80 text-rose-800'
        }`}>
          {notice.text}
        </div>
      )}

      {/* ── Month calendar ── */}
      <section className="glass-panel rounded-[2rem] border border-white/50 px-5 py-5 editorial-shadow sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white/80 text-slate-600 hover:border-sky-300 hover:text-sky-700 transition cursor-pointer">
              <span className="material-symbols-outlined text-lg">chevron_left</span>
            </button>
            <h3 className="font-headline text-2xl text-slate-900 min-w-[200px] text-center">
              {MONTH_NAMES[cursor.getMonth()]} {cursor.getFullYear()}
            </h3>
            <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white/80 text-slate-600 hover:border-sky-300 hover:text-sky-700 transition cursor-pointer">
              <span className="material-symbols-outlined text-lg">chevron_right</span>
            </button>
          </div>
          <div className="flex items-center gap-3">
            {cursorMonthStats && (
              <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-label font-bold uppercase tracking-[0.14em] text-sky-700">
                {cursorMonthStats.completedLessons} completed · {cursorMonthStats.lateCancellations} late cancel
              </span>
            )}
            <button onClick={() => { setBookingPanel(p => !p); setNotice(null); setCancelTarget(null) }}
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-sky-600 to-blue-700 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_16px_35px_-18px_rgba(2,132,199,0.9)] hover:-translate-y-0.5 hover:shadow-[0_20px_40px_-18px_rgba(2,132,199,1)] transition-all duration-300 cursor-pointer">
              <span className="material-symbols-outlined text-lg">add</span>
              Book a lesson
            </button>
          </div>
        </div>

        {/* legend */}
        <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-sky-500" /> Taught lesson</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Scheduled</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-rose-500" /> Late cancellation (billed)</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-slate-300" /> Cancelled</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full border-2 border-dashed border-sky-400 bg-transparent" /> Open slot</span>
        </div>

        {/* grid */}
        <div className="mt-4 grid grid-cols-7 gap-1.5">
          {WEEKDAYS.map(d => (
            <div key={d} className="px-1 py-1 text-center font-label text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">{d}</div>
          ))}
          {gridCells.map((dateStr, i) => {
            if (!dateStr) return <div key={`pad-${i}`} />
            const dayNum = Number(dateStr.split('-')[2])
            const isToday = dateStr === todayStr
            const taught = taughtByDate[dateStr] || []
            const bookings = bookingsByDate[dateStr] || []
            const open = slotsByDate[dateStr] || []
            const hasLessons = taught.length > 0 || bookings.length > 0
            return (
              <div key={dateStr} className={`min-h-[84px] rounded-[1rem] border px-1.5 py-1.5 text-left align-top transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_18px_38px_-30px_rgba(2,132,199,0.6)] ${
                isToday
                  ? 'border-transparent bg-white ring-2 ring-sky-500/70 shadow-[0_16px_35px_-22px_rgba(2,132,199,0.7)]'
                  : hasLessons
                    ? 'border-sky-200/70 bg-sky-50/50'
                    : 'border-slate-200/70 bg-white/60'
              }`}>
                <div className={`flex items-center justify-between text-xs font-semibold ${isToday ? 'text-sky-700' : 'text-slate-500'}`}>
                  {isToday ? (
                    <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-gradient-to-r from-sky-600 to-blue-700 px-1.5 text-white">{dayNum}</span>
                  ) : (
                    <span>{dayNum}</span>
                  )}
                </div>
                <div className="mt-1 space-y-1">
                  {taught.map((item, idx) => (
                    <div key={`t-${idx}`} title={`${item.student?.name || ''} — ${item.lesson?.title || 'Lesson'}`}
                      className="truncate rounded-md bg-sky-100 border border-sky-200 px-1.5 py-0.5 text-[10px] font-semibold text-sky-800">
                      ✓ {item.student?.name?.split(' ')[0] || 'Lesson'}
                    </div>
                  ))}
                  {bookings.map(b => {
                    const isLate = b.status === 'cancelled_late'
                    const isCancelled = b.status === 'cancelled'
                    const isScheduled = b.status === 'scheduled'
                    const isCompleted = b.status === 'completed'
                    return (
                      <button key={b._id} type="button"
                        onClick={() => { if (isScheduled) { setCancelTarget(b); setBookingPanel(false); setNotice(null) } }}
                        title={`${b.studentName} ${b.timeWarsaw} — ${b.status}`}
                        className={`block w-full truncate rounded-md border px-1.5 py-0.5 text-left text-[10px] font-semibold ${
                          isScheduled ? 'bg-emerald-100 border-emerald-300 text-emerald-800 cursor-pointer hover:bg-emerald-200'
                          : isCompleted ? 'bg-sky-100 border-sky-200 text-sky-800'
                          : isLate ? 'bg-rose-100 border-rose-300 text-rose-700 line-through'
                          : 'bg-slate-100 border-slate-200 text-slate-400 line-through'
                        }`}>
                        {b.timeWarsaw} {b.studentName?.split(' ')[0]}{isLate ? ' (billed)' : ''}
                      </button>
                    )
                  })}
                  {open.length > 0 && (
                    <button type="button"
                      onClick={() => { setBookingPanel(true); setBookSlot(open[0]); setNotice(null); setCancelTarget(null) }}
                      className="block w-full truncate rounded-md border-2 border-dashed border-sky-300 px-1.5 py-0.5 text-left text-[10px] font-semibold text-sky-600 hover:bg-sky-50 cursor-pointer">
                      + {open.length} open
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* ── Booking panel ── */}
      {bookingPanel && (
        <section className="glass-panel rounded-[2rem] border border-sky-200 bg-sky-50/40 px-6 py-6 editorial-shadow">
          <p className="font-label text-xs font-bold uppercase tracking-[0.28em] text-sky-600">New Booking</p>
          <h3 className="mt-1 font-headline text-2xl text-slate-900">Book a <span className="italic text-sky-600">lesson</span></h3>

          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            {/* student picker */}
            <div>
              <p className="font-label text-xs font-bold uppercase tracking-[0.2em] text-slate-500 mb-2">1 · Choose a student</p>
              <div className="space-y-2">
                {data.students.map(s => (
                  <button key={s._id} type="button" onClick={() => setBookStudent(s._id)}
                    className={`flex w-full items-center gap-3 rounded-[1rem] border px-4 py-3 text-left transition cursor-pointer ${
                      bookStudent === s._id ? 'border-sky-400 bg-sky-100/80 ring-1 ring-sky-300' : 'border-slate-200 bg-white/80 hover:border-sky-300'
                    }`}>
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.75rem] bg-gradient-to-br from-blue-600 to-indigo-700">
                      <span className="font-headline text-sm text-white">
                        {String(s.name || '').split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase()).join('')}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">{s.name}</p>
                      <p className="text-xs text-slate-500">{s.level || ''}</p>
                    </div>
                    {bookStudent === s._id && <span className="material-symbols-outlined ml-auto text-sky-600">check_circle</span>}
                  </button>
                ))}
              </div>
            </div>

            {/* slot picker */}
            <div>
              <p className="font-label text-xs font-bold uppercase tracking-[0.2em] text-slate-500 mb-2">2 · Choose a time (next 4 weeks)</p>
              <div className="max-h-80 space-y-3 overflow-y-auto pr-1">
                {Object.entries(slotsByDate).sort(([a], [b]) => a.localeCompare(b)).map(([date, slots]) => (
                  <div key={date}>
                    <p className="text-xs font-semibold text-slate-600 mb-1.5">{prettyDate(date)}</p>
                    <div className="flex flex-wrap gap-2">
                      {slots.map(slot => (
                        <button key={slot.startUtc} type="button" onClick={() => setBookSlot(slot)}
                          className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition cursor-pointer ${
                            bookSlot?.startUtc === slot.startUtc
                              ? 'border-sky-500 bg-sky-600 text-white shadow-md'
                              : 'border-slate-200 bg-white/90 text-slate-700 hover:border-sky-300 hover:text-sky-700'
                          }`}>
                          {slot.timeWarsaw}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                {!Object.keys(slotsByDate).length && (
                  <p className="text-sm text-slate-500">No open slots in the next four weeks.</p>
                )}
              </div>
            </div>
          </div>

          <PolicyNotice />

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button onClick={doBook} disabled={!bookStudent || !bookSlot || busy}
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-sky-600 to-blue-700 px-6 py-3 text-sm font-semibold text-white shadow-[0_16px_35px_-18px_rgba(2,132,199,0.9)] transition-all duration-300 enabled:hover:-translate-y-0.5 enabled:hover:shadow-[0_20px_40px_-18px_rgba(2,132,199,1)] enabled:cursor-pointer disabled:opacity-40">
              <span className="material-symbols-outlined text-lg">event_available</span>
              {busy ? 'Booking…' : 'Confirm booking'}
            </button>
            {bookSlot && bookStudent && (
              <p className="text-sm text-slate-600">
                {data.students.find(s => s._id === bookStudent)?.name} · {prettyDate(bookSlot.dateWarsaw)} at <span className="font-semibold">{bookSlot.timeWarsaw}</span>
              </p>
            )}
            <button onClick={() => { setBookingPanel(false); setBookSlot(null); setBookStudent('') }} disabled={busy}
              className="rounded-full border border-sky-200 bg-white/80 px-5 py-3 text-sm font-semibold text-sky-700 hover:bg-sky-50 transition cursor-pointer">
              Close
            </button>
          </div>
        </section>
      )}

      {/* ── Cancel confirmation ── */}
      {cancelTarget && (
        <section className={`glass-panel rounded-[2rem] border px-6 py-6 editorial-shadow ${
          cancelIsLate ? 'border-rose-300 bg-rose-50/60' : 'border-slate-200 bg-white/70'
        }`}>
          <p className={`font-label text-xs font-bold uppercase tracking-[0.28em] ${cancelIsLate ? 'text-rose-600' : 'text-slate-500'}`}>
            Cancel Lesson
          </p>
          <h3 className="mt-1 font-headline text-2xl text-slate-900">
            {cancelTarget.studentName} — {prettyDate(cancelTarget.dateWarsaw)} at {cancelTarget.timeWarsaw}
          </h3>
          <p className={`mt-3 text-sm font-semibold leading-relaxed ${cancelIsLate ? 'text-rose-700' : 'text-emerald-700'}`}>
            {cancelIsLate
              ? '⚠ This lesson starts in less than 24 hours. Cancelling now means the lesson WILL STILL BE BILLED in full.'
              : 'This cancellation is more than 24 hours before the start time — no charge.'}
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <button onClick={doCancel} disabled={busy}
              className={`inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-white shadow-md transition enabled:hover:shadow-lg enabled:cursor-pointer disabled:opacity-40 ${
                cancelIsLate ? 'bg-gradient-to-r from-rose-600 to-red-700' : 'bg-gradient-to-r from-slate-600 to-slate-700'
              }`}>
              <span className="material-symbols-outlined text-lg">event_busy</span>
              {busy ? 'Cancelling…' : (cancelIsLate ? 'Cancel anyway (billed)' : 'Confirm cancellation')}
            </button>
            <button onClick={() => setCancelTarget(null)} disabled={busy}
              className="rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-600 hover:border-slate-300 transition cursor-pointer">
              Keep the lesson
            </button>
          </div>
        </section>
      )}

      {/* ── Upcoming bookings list ── */}
      <section className="glass-panel rounded-[2rem] border border-white/50 px-5 py-6 editorial-shadow sm:px-8">
        <p className="font-label text-xs font-bold uppercase tracking-[0.28em] text-sky-600">Upcoming</p>
        <h3 className="mt-1 font-headline text-3xl text-slate-900">Scheduled <span className="italic text-sky-600">Lessons</span></h3>
        <div className="mt-4 space-y-2">
          {upcoming.length ? upcoming.map(b => (
            <div key={b._id} className="flex flex-wrap items-center gap-3 rounded-[1.25rem] border border-white/60 bg-white/70 px-4 py-3 transition-all duration-300 hover:-translate-y-0.5 hover:border-sky-200 hover:shadow-[0_18px_38px_-30px_rgba(2,132,199,0.55)]">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-xs font-label font-bold uppercase tracking-[0.14em] text-emerald-700">
                <span className="material-symbols-outlined text-sm">event</span>
                {b.timeWarsaw}
              </span>
              <span className="text-sm font-semibold text-slate-900">{b.studentName}</span>
              <span className="text-sm text-slate-500">{prettyDate(b.dateWarsaw)}</span>
              <span className="text-xs text-slate-400">booked by {b.bookedByName || b.bookedBy}</span>
              <button onClick={() => { setCancelTarget(b); setBookingPanel(false); setNotice(null) }}
                className="ml-auto rounded-full border border-rose-200 bg-white px-4 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 transition cursor-pointer">
                Cancel
              </button>
            </div>
          )) : (
            <p className="text-sm text-slate-500 py-2">No upcoming lessons booked yet. Use "Book a lesson" above to schedule one.</p>
          )}
        </div>
      </section>

      {/* ── Month-by-month history ── */}
      {stats?.months?.length > 0 && (
        <section className="glass-panel rounded-[2rem] border border-white/50 px-5 py-6 editorial-shadow sm:px-8">
          <p className="font-label text-xs font-bold uppercase tracking-[0.28em] text-sky-600">History</p>
          <h3 className="mt-1 font-headline text-3xl text-slate-900">Monthly Lesson <span className="italic text-sky-600">Totals</span></h3>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="py-2 pr-4 font-label text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Month</th>
                  <th className="py-2 pr-4 font-label text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Completed</th>
                  <th className="py-2 pr-4 font-label text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Late Cancellations</th>
                  <th className="py-2 pr-4 font-label text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Total Billable</th>
                </tr>
              </thead>
              <tbody>
                {stats.months.map(m => {
                  const [y, mo] = m.month.split('-').map(Number)
                  return (
                    <tr key={m.month} className="border-b border-slate-100 transition-colors hover:bg-sky-50/50">
                      <td className="py-2.5 pr-4 font-semibold text-slate-800">{MONTH_NAMES[mo - 1]} {y}</td>
                      <td className="py-2.5 pr-4">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">{m.completedLessons}</span>
                      </td>
                      <td className="py-2.5 pr-4">
                        {m.lateCancellations
                          ? <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 border border-rose-200 px-2.5 py-0.5 text-xs font-semibold text-rose-700">{m.lateCancellations}</span>
                          : <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 border border-slate-200 px-2.5 py-0.5 text-xs font-semibold text-slate-500">0</span>}
                      </td>
                      <td className="py-2.5 pr-4 font-headline text-lg bg-gradient-to-r from-sky-600 to-blue-700 bg-clip-text text-transparent">{m.billableTotal}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
