// TeacherSchedule - teacher agenda and console schedule feed.

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

function compactDate(dateStr) {
  const str = String(dateStr || '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return { day: '', month: '', dow: '' }
  const [y, m, d] = str.split('-').map(Number)
  const dow = new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay()
  return { day: String(d).padStart(2, '0'), month: MONTH_NAMES[m - 1].slice(0, 3), dow: DAY_NAMES[dow].slice(0, 3) }
}

function isoDate(d) { return d.toISOString().slice(0, 10) }
function addDays(base, n) { const d = new Date(base); d.setDate(d.getDate() + n); return d }

const RANGE_PRESETS = [
  { key: 'next30', label: 'Next 30 days', range: () => ({ from: isoDate(new Date()), to: isoDate(addDays(new Date(), 30)) }) },
  { key: 'next7', label: 'Next 7 days', range: () => ({ from: isoDate(new Date()), to: isoDate(addDays(new Date(), 7)) }) },
  { key: 'past30', label: 'Past 30 days', range: () => ({ from: isoDate(addDays(new Date(), -30)), to: isoDate(new Date()) }) },
]

function StatTile({ icon, value, label, tone = 'violet' }) {
  const tones = {
    violet: 'border-violet-100 bg-violet-50 text-violet-700',
    emerald: 'border-emerald-100 bg-emerald-50 text-emerald-700',
    sky: 'border-sky-100 bg-sky-50 text-sky-700',
  }
  return (
    <div className="rounded-[1.35rem] border border-white/70 bg-white/78 px-4 py-3 shadow-[0_18px_42px_-34px_rgba(79,70,229,0.45)]">
      <div className="flex items-center gap-3">
        <span className={`material-symbols-outlined grid h-9 w-9 place-items-center rounded-2xl border text-[20px] ${tones[tone] || tones.violet}`}>{icon}</span>
        <div>
          <div className="font-mono text-xl font-black leading-none text-slate-950">{value}</div>
          <div className="mt-1 text-xs font-semibold text-slate-500">{label}</div>
        </div>
      </div>
    </div>
  )
}

function AgendaRow({ item, name, date, time, status, icon = 'event' }) {
  const d = compactDate(date)
  return (
    <div className="group grid gap-3 rounded-[1.45rem] border border-white/70 bg-white/82 p-3 shadow-[0_20px_50px_-42px_rgba(79,70,229,0.45)] transition hover:-translate-y-0.5 hover:border-violet-200 sm:grid-cols-[74px_minmax(0,1fr)_auto] sm:items-center">
      <div className="flex items-center gap-3 sm:block">
        <div className="grid h-[62px] w-[62px] place-items-center rounded-[1.2rem] border border-violet-100 bg-violet-50 text-center text-violet-800">
          <div>
            <div className="font-label text-[10px] font-black uppercase tracking-[0.14em]">{d.month || 'Date'}</div>
            <div className="font-mono text-2xl font-black leading-none">{d.day || '--'}</div>
          </div>
        </div>
        <div className="sm:hidden">
          <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">{d.dow}</div>
          <div className="font-mono text-sm font-black text-slate-900">{time}</div>
        </div>
      </div>

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-100 bg-white px-2.5 py-1 font-mono text-xs font-black text-violet-700">
            <span className="material-symbols-outlined text-sm">{icon}</span>
            {time}
          </span>
          <span className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">{d.dow}</span>
        </div>
        <div className="mt-2 truncate text-base font-black tracking-[-0.01em] text-slate-950">{name || 'Lesson'}</div>
        <div className="mt-1 text-sm text-slate-500">{prettyDate(date)}</div>
        {item?.title && <div className="mt-1 text-sm font-semibold text-slate-600">{item.title}</div>}
      </div>

      <div className="flex items-center justify-between gap-2 sm:justify-end">
        <StatusChip status={status} />
        <span className="material-symbols-outlined text-slate-300 transition group-hover:text-violet-400">chevron_right</span>
      </div>
    </div>
  )
}

export default function TeacherSchedule() {
  const { teacher, studentBySlug, groupById } = useOutletContext()
  const organizationId = teacher?.organizationId
  const teacherId = teacher?._id

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

  const whoFor = useCallback((row) => {
    if (row?.student_name) return row.student_name
    if (row?.student_slug) return studentBySlug?.[row.student_slug]?.name || row.student_slug
    if (row?.group_id !== undefined && row?.group_id !== null) {
      const group = groupById?.[String(row.group_id)]
      const name = group?.name || group?.title
      return name ? `${name} group` : `Group ${row.group_id}`
    }
    return null
  }, [studentBySlug, groupById])

  const lessons = useMemo(() => {
    const rows = Array.isArray(consoleState.data?.lessons) ? [...consoleState.data.lessons] : []
    return rows.sort((a, b) => {
      const au = Number(a?.startUtc)
      const bu = Number(b?.startUtc)
      if (Number.isFinite(au) && Number.isFinite(bu) && au !== bu) return au - bu
      return `${a?.date || ''} ${a?.time || ''}`.localeCompare(`${b?.date || ''} ${b?.time || ''}`)
    })
  }, [consoleState.data])

  const consoleBookings = Array.isArray(consoleState.data?.bookings) ? consoleState.data.bookings : []
  const next = upcoming[0] || null

  return (
    <>
      <section className="relative overflow-hidden rounded-[2.1rem] border border-white/60 bg-white/76 px-5 py-6 shadow-[0_30px_80px_-56px_rgba(124,58,237,0.45)] backdrop-blur-xl sm:px-8">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background: 'radial-gradient(circle at 100% 0%, rgba(168,85,247,0.14), transparent 32%), radial-gradient(circle at 0% 100%, rgba(14,165,233,0.10), transparent 34%)',
          }}
        />
        <div className="relative">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="font-label text-xs font-black uppercase tracking-[0.24em] text-violet-700">Schedule</p>
              <h2 className="mt-2 font-headline text-3xl font-black tracking-[-0.04em] text-slate-950 sm:text-4xl">
                Your teaching agenda
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600">
                A cleaner view of what is booked next, plus the wider console schedule when that backend feed is available.
              </p>
            </div>
            <div className="grid gap-2 sm:min-w-[420px] sm:grid-cols-3">
              <StatTile icon="event" value={upcoming.length} label="upcoming" tone="emerald" />
              <StatTile icon="history" value={lessons.length} label="lessons" tone="sky" />
              <StatTile icon="pending_actions" value={consoleBookings.length} label="bookings" />
            </div>
          </div>

          {next && (
            <div className="mt-6 rounded-[1.6rem] border border-emerald-200 bg-emerald-50/70 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined grid h-12 w-12 place-items-center rounded-[1rem] border border-emerald-200 bg-white text-emerald-700">play_circle</span>
                  <div>
                    <div className="font-label text-[11px] font-black uppercase tracking-[0.16em] text-emerald-700">Next lesson</div>
                    <div className="mt-1 text-lg font-black text-slate-950">{next.studentName || 'Student'} at {next.timeWarsaw}</div>
                    <div className="mt-0.5 text-sm font-semibold text-slate-600">{prettyDate(next.dateWarsaw)}</div>
                  </div>
                </div>
                <span className="rounded-full border border-emerald-200 bg-white px-4 py-2 font-mono text-sm font-black text-emerald-700">
                  Warsaw time
                </span>
              </div>
            </div>
          )}

          <div className="mt-5">
            {bookingsState.loading ? (
              <SectionLoading />
            ) : bookingsState.error ? (
              <SectionError error={{ kind: 'http', message: bookingsState.error }} onRetry={loadBookings} />
            ) : upcoming.length ? (
              <div className="grid gap-3">
                {upcoming.map(b => (
                  <AgendaRow
                    key={b._id}
                    item={b}
                    name={b.studentName}
                    date={b.dateWarsaw}
                    time={b.timeWarsaw}
                    status={b.status}
                    icon="event"
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-[1.45rem] border border-dashed border-violet-200 bg-violet-50/45 px-5 py-4 text-sm font-semibold text-slate-600">
                No upcoming lessons booked yet. Once a student books one of your open slots, it appears here.
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden rounded-[2.1rem] border border-white/60 bg-white/76 px-5 py-6 shadow-[0_30px_80px_-56px_rgba(124,58,237,0.35)] backdrop-blur-xl sm:px-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="font-label text-xs font-black uppercase tracking-[0.24em] text-violet-700">Console feed</p>
            <h2 className="mt-2 font-headline text-3xl font-black tracking-[-0.04em] text-slate-950">
              Lessons and bookings
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600">
              Range-based history and booking data, scoped to this teacher on the server.
            </p>
          </div>
          <button
            onClick={loadConsole}
            title="Refresh"
            className="inline-flex items-center justify-center gap-2 rounded-full border border-violet-200 bg-white/85 px-5 py-2.5 text-sm font-black text-violet-700 shadow-[0_16px_34px_-28px_rgba(124,58,237,0.75)] transition hover:-translate-y-0.5 hover:bg-violet-50"
          >
            <span className="material-symbols-outlined text-lg">refresh</span>
            Refresh
          </button>
        </div>

        <div className="mt-5 flex flex-wrap gap-2 rounded-full border border-violet-100 bg-violet-50/50 p-1.5">
          {RANGE_PRESETS.map(p => (
            <button
              key={p.key}
              onClick={() => setPresetKey(p.key)}
              className={`rounded-full px-4 py-2 text-xs font-black uppercase tracking-[0.12em] transition ${
                presetKey === p.key
                  ? 'bg-white text-violet-700 shadow-[0_12px_28px_-22px_rgba(124,58,237,0.8)]'
                  : 'text-slate-500 hover:bg-white/70 hover:text-violet-700'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="mt-5">
          {consoleState.loading ? (
            <SectionLoading />
          ) : consoleState.error?.kind === 'not-live' ? (
            <BackendNotLive endpoint="GET /api/console/teacher/schedule" />
          ) : consoleState.error ? (
            <SectionError error={consoleState.error} onRetry={loadConsole} />
          ) : (
            <>
              {lessons.length === 0 && consoleBookings.length === 0 && (
                <div className="rounded-[1.45rem] border border-dashed border-violet-200 bg-violet-50/45 px-5 py-4 text-sm font-semibold text-slate-600">
                  Nothing in this range. The console returned no lessons or bookings for these dates.
                </div>
              )}

              {lessons.length > 0 && (
                <div className="grid gap-3">
                  {lessons.map((l, i) => (
                    <AgendaRow
                      key={`${l?.date || ''}-${l?.time || ''}-${i}`}
                      item={l}
                      name={whoFor(l)}
                      date={l?.date}
                      time={l?.time}
                      status={l?.status}
                      icon="school"
                    />
                  ))}
                </div>
              )}

              {consoleBookings.length > 0 && (
                <div className={lessons.length > 0 ? 'mt-7' : ''}>
                  <p className="font-label text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Bookings in range: {consoleBookings.length}</p>
                  <div className="mt-3 grid gap-3">
                    {consoleBookings.map((b, i) => (
                      <AgendaRow
                        key={b?.id || b?._id || i}
                        item={b}
                        name={whoFor(b) || b?.studentName || 'Booking'}
                        date={b?.date || b?.dateWarsaw}
                        time={b?.time || b?.timeWarsaw}
                        status={b?.status}
                        icon="event"
                      />
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
