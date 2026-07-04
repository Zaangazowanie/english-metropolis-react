// TeacherSchedule — "My Schedule", the teacher portal's index tab (P2, 2026-07-03).
//
// Two data sources, deliberately kept side by side:
//   1. "Upcoming lessons" — Convex scheduling:listBookings, the same rows the
//      original single-page portal showed. Works today.
//   2. "Lessons & bookings" — GET /api/console/teacher/schedule?from=&to=
//      (docs/console/API-CONTRACT.md, P2): the backend's merged, teacher-scoped
//      view of taught lessons + bookings in a date range. Until Ricky flips
//      the endpoint live it 404s and we render a calm "backend not live yet"
//      panel — never mocked rows (KICKOFF.md rule 4).
//
// Student slugs / group ids in console rows are resolved to display names via
// the /me lookup maps shared by the shell (best effort — raw slug/id fallback).
// LIVE shape note (2026-07-04): console lesson rows arrive as {date, time,
// startUtc, status, student_slug, student_name} — the server-sent
// student_name wins over lookup resolution, and startUtc (ms epoch) is the
// preferred sort key; title/group_id stay optional and render only if sent.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { queryTeacherConvex } from '../../contexts/TeacherAuthContext.jsx'
import { getTeacherSchedule } from './consoleApi.js'
import { BackendNotLive, SectionError, SectionLoading, StatusChip } from './TeacherPanels.jsx'

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function prettyDate(dateStr) {
  const str = String(dateStr || '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return str
  const [y, m, d] = str.split('-').map(Number)
  const dow = new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay()
  return `${DAY_NAMES[dow]}, ${d} ${MONTH_NAMES[m - 1]} ${y}`
}

function isoDate(d) { return d.toISOString().slice(0, 10) }
function addDays(base, n) { const d = new Date(base); d.setDate(d.getDate() + n); return d }

const RANGE_PRESETS = [
  { key: 'next30', label: 'Next 30 days', range: () => ({ from: isoDate(new Date()), to: isoDate(addDays(new Date(), 30)) }) },
  { key: 'next7', label: 'Next 7 days', range: () => ({ from: isoDate(new Date()), to: isoDate(addDays(new Date(), 7)) }) },
  { key: 'past30', label: 'Past 30 days', range: () => ({ from: isoDate(addDays(new Date(), -30)), to: isoDate(new Date()) }) },
]

export default function TeacherSchedule() {
  const { teacher, studentBySlug, groupById } = useOutletContext()
  const organizationId = teacher?.organizationId
  const teacherId = teacher?._id

  // ── 1 · Upcoming bookings (existing Convex data — live today) ──
  const [bookingsState, setBookingsState] = useState({ loading: true, error: '', rows: [] })
  const loadBookings = useCallback(async () => {
    if (!organizationId || !teacherId) return
    setBookingsState(s => ({ ...s, loading: true, error: '' }))
    try {
      const rows = await queryTeacherConvex('scheduling:listBookings', { organizationId, teacherId })
      setBookingsState({ loading: false, error: '', rows: Array.isArray(rows) ? rows : [] })
    } catch (err) {
      console.error('[TeacherSchedule] bookings load failed', err)
      setBookingsState({ loading: false, error: 'Could not load your upcoming lessons.', rows: [] })
    }
  }, [organizationId, teacherId])
  useEffect(() => { loadBookings() }, [loadBookings])

  const upcoming = useMemo(
    () => (bookingsState.rows || [])
      .filter(b => b.status === 'scheduled' && b.startUtc > Date.now())
      .sort((a, b) => a.startUtc - b.startUtc),
    [bookingsState.rows],
  )

  // ── 2 · Console schedule feed (contract endpoint; calm panel until live) ──
  const [presetKey, setPresetKey] = useState('next30')
  const [consoleState, setConsoleState] = useState({ loading: true, error: null, data: null })
  const loadConsole = useCallback(async () => {
    const preset = RANGE_PRESETS.find(p => p.key === presetKey) || RANGE_PRESETS[0]
    setConsoleState(s => ({ ...s, loading: true, error: null }))
    try {
      const data = await getTeacherSchedule(preset.range())
      setConsoleState({ loading: false, error: null, data })
    } catch (err) {
      setConsoleState({ loading: false, error: err, data: null })
    }
  }, [presetKey])
  useEffect(() => { loadConsole() }, [loadConsole])

  // Resolve a console row's student/group to a display name. The live backend
  // sends student_name on schedule rows — trust it first, then fall back to
  // the /me lookup, then the raw slug/id.
  const whoFor = useCallback((row) => {
    if (row?.student_name) return row.student_name
    if (row?.student_slug) return studentBySlug?.[row.student_slug]?.name || row.student_slug
    if (row?.group_id !== undefined && row?.group_id !== null) {
      const group = groupById?.[String(row.group_id)]
      const name = group?.name || group?.title
      return name ? `${name} (group)` : `Group ${row.group_id}`
    }
    return null
  }, [studentBySlug, groupById])

  const lessons = useMemo(() => {
    const rows = Array.isArray(consoleState.data?.lessons) ? [...consoleState.data.lessons] : []
    return rows.sort((a, b) => {
      // Prefer the precise epoch the live backend sends; fall back to date+time strings.
      const au = Number(a?.startUtc)
      const bu = Number(b?.startUtc)
      if (Number.isFinite(au) && Number.isFinite(bu) && au !== bu) return au - bu
      return `${a?.date || ''} ${a?.time || ''}`.localeCompare(`${b?.date || ''} ${b?.time || ''}`)
    })
  }, [consoleState.data])

  const consoleBookings = Array.isArray(consoleState.data?.bookings) ? consoleState.data.bookings : []

  return (
    <>
      {/* ── Upcoming lessons (Convex bookings — live today) ── */}
      <section className="glass-panel rounded-[2rem] border border-white/50 px-5 py-6 editorial-shadow sm:px-8">
        <p className="font-label text-xs font-bold uppercase tracking-[0.28em] text-sky-600">Upcoming</p>
        <h2 className="mt-1 font-headline text-3xl text-slate-900">My Upcoming <span className="italic text-sky-600">Lessons</span></h2>
        <div className="mt-4 space-y-2">
          {bookingsState.loading ? (
            <SectionLoading />
          ) : bookingsState.error ? (
            <SectionError error={{ kind: 'http', message: bookingsState.error }} onRetry={loadBookings} />
          ) : upcoming.length ? upcoming.map(b => (
            <div key={b._id} className="flex flex-wrap items-center gap-3 rounded-[1.25rem] border border-white/60 bg-white/70 px-4 py-3 transition-all duration-300 hover:-translate-y-0.5 hover:border-sky-200 hover:shadow-[0_18px_38px_-30px_rgba(2,132,199,0.55)]">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-xs font-label font-bold uppercase tracking-[0.14em] text-emerald-700">
                <span className="material-symbols-outlined text-sm">event</span>
                {b.timeWarsaw}
              </span>
              <span className="text-sm font-semibold text-slate-900">{b.studentName}</span>
              <span className="text-sm text-slate-500">{prettyDate(b.dateWarsaw)}</span>
            </div>
          )) : (
            <p className="text-sm text-slate-500 py-2">No upcoming lessons booked yet. Once the school books a student into one of your open slots, it will appear here.</p>
          )}
        </div>
      </section>

      {/* ── Console schedule (contract feed — lessons + bookings in range) ── */}
      <section className="glass-panel rounded-[2rem] border border-white/50 px-5 py-6 editorial-shadow sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-label text-xs font-bold uppercase tracking-[0.28em] text-sky-600">Schedule</p>
            <h2 className="mt-1 font-headline text-3xl text-slate-900">Lessons <span className="italic text-sky-600">&amp;</span> Bookings</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
              The console&apos;s merged view of your taught lessons and bookings — scoped to you on the server.
            </p>
          </div>
          <button
            onClick={loadConsole}
            title="Refresh"
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-600 hover:border-sky-300 hover:text-sky-700 transition cursor-pointer"
          >
            <span className="material-symbols-outlined text-lg">refresh</span>
            Refresh
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {RANGE_PRESETS.map(p => (
            <button
              key={p.key}
              onClick={() => setPresetKey(p.key)}
              className={`rounded-full border px-4 py-1.5 text-xs font-bold uppercase tracking-[0.14em] transition cursor-pointer ${
                presetKey === p.key
                  ? 'border-sky-300 bg-sky-50 text-sky-700'
                  : 'border-slate-200 bg-white/70 text-slate-500 hover:border-sky-200 hover:text-sky-600'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="mt-4">
          {consoleState.loading ? (
            <SectionLoading />
          ) : consoleState.error?.kind === 'not-live' ? (
            <BackendNotLive endpoint="GET /api/console/teacher/schedule" />
          ) : consoleState.error ? (
            <SectionError error={consoleState.error} onRetry={loadConsole} />
          ) : (
            <>
              {lessons.length === 0 && consoleBookings.length === 0 && (
                <p className="text-sm text-slate-500 py-2">Nothing in this range — the console returned no lessons or bookings for these dates.</p>
              )}
              {lessons.length > 0 && (
                <div className="space-y-2">
                  {lessons.map((l, i) => (
                    <div key={`${l?.date || ''}-${l?.time || ''}-${i}`} className="flex flex-wrap items-center gap-3 rounded-[1.25rem] border border-white/60 bg-white/70 px-4 py-3">
                      {l?.time && (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 border border-sky-200 px-2.5 py-1 text-xs font-label font-bold uppercase tracking-[0.14em] text-sky-700">
                          <span className="material-symbols-outlined text-sm">schedule</span>
                          {l.time}
                        </span>
                      )}
                      <span className="text-sm font-semibold text-slate-900">{whoFor(l) || '—'}</span>
                      {l?.title && <span className="text-sm text-slate-600">{l.title}</span>}
                      <span className="text-sm text-slate-500">{prettyDate(l?.date)}</span>
                      <span className="ml-auto"><StatusChip status={l?.status} /></span>
                    </div>
                  ))}
                </div>
              )}
              {consoleBookings.length > 0 && (
                <div className={lessons.length > 0 ? 'mt-6' : ''}>
                  <p className="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Bookings in range · {consoleBookings.length}</p>
                  <div className="mt-2 space-y-2">
                    {consoleBookings.map((b, i) => (
                      <div key={b?.id || b?._id || i} className="flex flex-wrap items-center gap-3 rounded-[1.25rem] border border-white/60 bg-white/70 px-4 py-3">
                        {(b?.time || b?.timeWarsaw) && (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-xs font-label font-bold uppercase tracking-[0.14em] text-emerald-700">
                            <span className="material-symbols-outlined text-sm">event</span>
                            {b.time || b.timeWarsaw}
                          </span>
                        )}
                        <span className="text-sm font-semibold text-slate-900">{whoFor(b) || b?.studentName || 'Booking'}</span>
                        {(b?.date || b?.dateWarsaw) && <span className="text-sm text-slate-500">{prettyDate(b.date || b.dateWarsaw)}</span>}
                        <span className="ml-auto"><StatusChip status={b?.status} /></span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </section>
    </>
  )
}
