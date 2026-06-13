// TeacherPortal — the teacher-facing scheduling dashboard (built 2026-06-04).
//
// A teacher reaches this page after following a magic link (verified by
// TeacherAuthContext, which stores the session under 'em-teacher-session').
// From here a teacher can:
//   • Set / edit their own weekly availability — the same windows-to-slots
//     editor school admins use on the admin Calendar, so it looks identical.
//   • See their upcoming scheduled lessons.
//
// Backend contract (see scheduling:* and teacherAuth:* Convex functions):
//   - getWeeklyAvailability { organizationId, teacherId } -> windows
//   - setWeeklyAvailability { organizationId, windows }    -> { count, teacherId }
//       (a TEACHER caller omits teacherId; the backend forces their own.)
//   - listBookings        { organizationId, teacherId }    -> bookings
//
// Auth helpers come from TeacherAuthContext: queryTeacherConvex /
// mutateTeacherConvex inject the teacher session token automatically.

import { useEffect, useState, useCallback } from 'react'
import { useTeacherAuth, queryTeacherConvex, mutateTeacherConvex } from '../../contexts/TeacherAuthContext.jsx'

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

// Day-of-week values match the backend (0 = Sunday … 6 = Saturday), ordered
// Mon-first for the editor. Identical to the admin Calendar editor.
const DOW_OPTIONS = [
  { v: 1, label: 'Monday' }, { v: 2, label: 'Tuesday' }, { v: 3, label: 'Wednesday' },
  { v: 4, label: 'Thursday' }, { v: 5, label: 'Friday' }, { v: 6, label: 'Saturday' },
  { v: 0, label: 'Sunday' },
]
const blankWindow = () => ({ dayOfWeek: 1, startTime: '17:00', endTime: '18:00', slotMinutes: 60, gapMinutes: 10 })
function timeToMin(t) { const [h, m] = String(t).split(':').map(Number); return h * 60 + m }

function prettyDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dow = new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay()
  const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  return `${names[dow]}, ${d} ${MONTH_NAMES[m - 1]} ${y}`
}

// Turn a single window into the list of lesson start times it opens, the same
// way the backend slices it — purely for the worked-example preview.
function previewSlots(w) {
  const start = timeToMin(w.startTime)
  const end = timeToMin(w.endTime)
  const slot = Number(w.slotMinutes)
  const gap = Number(w.gapMinutes)
  if (!slot || start + slot > end) return []
  const out = []
  for (let t = start; t + slot <= end && out.length < 24; t += slot + gap) {
    out.push(`${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`)
  }
  return out
}

export default function TeacherPortal() {
  const { teacher, logout } = useTeacherAuth()
  const organizationId = teacher?.organizationId
  const teacherId = teacher?._id

  const [state, setState] = useState({ loading: true, error: '', availability: [], bookings: [] })
  const [availDraft, setAvailDraft] = useState([])
  const [availBusy, setAvailBusy] = useState(false)
  const [notice, setNotice] = useState(null)   // { kind: 'ok' | 'err', text }

  const load = useCallback(async () => {
    if (!organizationId || !teacherId) return
    setState(s => ({ ...s, loading: true, error: '' }))
    try {
      const [availability, bookings] = await Promise.allSettled([
        queryTeacherConvex('scheduling:getWeeklyAvailability', { organizationId, teacherId }),
        queryTeacherConvex('scheduling:listBookings', { organizationId, teacherId }),
      ])
      const val = (r, fallback) => (r.status === 'fulfilled' ? r.value : fallback)
      const failedAll = availability.status === 'rejected' && bookings.status === 'rejected'
      const avail = val(availability, [])
      setState({
        loading: false,
        availability: avail,
        bookings: val(bookings, []),
        error: failedAll ? 'Failed to load your portal.' : '',
      })
      // Seed the editor draft from the saved availability.
      setAvailDraft((avail || []).map(w => ({
        dayOfWeek: w.dayOfWeek, startTime: w.startTime, endTime: w.endTime,
        slotMinutes: w.slotMinutes, gapMinutes: w.gapMinutes,
      })))
    } catch (e) {
      console.error('[TeacherPortal] load failed', e)
      setState(s => ({ ...s, loading: false, error: 'Failed to load your portal.' }))
    }
  }, [organizationId, teacherId])

  useEffect(() => { load() }, [load])

  // ── availability editor actions (mirror admin Calendar) ──
  const updateWindow = (i, patch) => setAvailDraft(d => d.map((w, idx) => idx === i ? { ...w, ...patch } : w))
  const removeWindow = (i) => setAvailDraft(d => d.filter((_, idx) => idx !== i))
  const addWindow = () => setAvailDraft(d => [...d, blankWindow()])

  const saveAvailability = async () => {
    if (availBusy) return
    for (const w of availDraft) {
      if (timeToMin(w.startTime) + Number(w.slotMinutes) > timeToMin(w.endTime)) {
        setNotice({ kind: 'err', text: 'Each window needs to fit at least one lesson — its end time must be at least one slot after the start.' })
        return
      }
    }
    setAvailBusy(true); setNotice(null)
    try {
      const windows = availDraft.map(w => ({
        dayOfWeek: Number(w.dayOfWeek),
        startTime: w.startTime,
        endTime: w.endTime,
        slotMinutes: Number(w.slotMinutes),
        gapMinutes: Number(w.gapMinutes),
      }))
      // Teacher omits teacherId — the backend forces their own.
      await mutateTeacherConvex('scheduling:setWeeklyAvailability', { organizationId, windows })
      setNotice({ kind: 'ok', text: `Availability saved — ${windows.length} weekly window${windows.length === 1 ? '' : 's'}. Your open slots are now bookable.` })
      await load()
    } catch (err) {
      setNotice({ kind: 'err', text: String(err?.message || 'Could not save availability.').replace(/^.*Error: /, '') })
    } finally { setAvailBusy(false) }
  }

  // ── derived: upcoming scheduled lessons ──
  const upcoming = (state.bookings || [])
    .filter(b => b.status === 'scheduled' && b.startUtc > Date.now())
    .sort((a, b) => a.startUtc - b.startUtc)

  // ── render ──
  if (state.loading) {
    return (
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
        <div className="glass-panel rounded-[2rem] border border-white/50 px-6 py-6 editorial-shadow animate-pulse">
          <div className="h-4 w-40 rounded bg-slate-200" />
          <div className="mt-4 h-8 w-64 rounded bg-slate-200" />
        </div>
        <div className="glass-panel h-72 rounded-[2rem] bg-slate-100 animate-pulse" />
      </div>
    )
  }

  if (state.error) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <div className="glass-panel rounded-[2rem] border border-rose-200 bg-rose-50/50 px-6 py-6 editorial-shadow">
          <span className="material-symbols-outlined text-3xl text-rose-400">error</span>
          <h2 className="mt-3 font-headline text-2xl text-rose-900">Unable to load your portal</h2>
          <p className="mt-2 text-sm text-rose-700">{state.error}</p>
          <button onClick={load} className="mt-4 rounded-full border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 transition cursor-pointer">
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">

      {/* ── Header ── */}
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
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-label text-xs font-bold uppercase tracking-[0.28em] text-sky-600">Teacher Portal</p>
            <h1 className="mt-3 font-headline text-4xl text-slate-900 leading-[1.05]">
              {teacher?.name || 'Teacher'}<span className="italic text-sky-600">.</span>
            </h1>
            {teacher?.email && <p className="mt-2 text-sm text-slate-500">{teacher.email}</p>}
          </div>
          <button
            onClick={() => logout?.()}
            className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white/80 px-5 py-2.5 text-sm font-semibold text-slate-600 hover:border-sky-300 hover:text-sky-700 transition cursor-pointer"
          >
            <span className="material-symbols-outlined text-lg">logout</span>
            Sign out
          </button>
        </div>
      </section>

      {/* status notice */}
      {notice && (
        <div className={`rounded-[1.25rem] border px-5 py-4 text-sm font-semibold ${
          notice.kind === 'ok' ? 'border-emerald-200 bg-emerald-50/80 text-emerald-800'
          : 'border-rose-200 bg-rose-50/80 text-rose-800'
        }`}>
          {notice.text}
        </div>
      )}

      {/* ── 1 · My weekly availability ── */}
      <section className="glass-panel rounded-[2rem] border border-sky-200 bg-sky-50/40 px-6 py-6 editorial-shadow">
        <p className="font-label text-xs font-bold uppercase tracking-[0.28em] text-sky-600">My Weekly Availability</p>
        <h2 className="mt-1 font-headline text-2xl text-slate-900">When can lessons be <span className="italic text-sky-600">booked</span>?</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
          Add a window for each day you teach. Each window is split into bookable slots — for a 60-minute
          lesson with a 10-minute gap, a 17:00–20:30 window opens 17:00, 18:10 and 19:20. The school can
          then book students into your open slots. Times are Europe/Warsaw.
        </p>

        <div className="mt-5 space-y-3">
          {availDraft.length === 0 && (
            <p className="rounded-[1rem] border border-dashed border-sky-300 bg-white/60 px-4 py-3 text-sm text-slate-500">
              No availability yet — add your first weekly window below.
            </p>
          )}
          {availDraft.map((w, i) => {
            const slots = previewSlots(w)
            return (
              <div key={i} className="rounded-[1.25rem] border border-white/70 bg-white/80 px-4 py-3">
                <div className="flex flex-wrap items-end gap-3">
                  <label className="flex flex-col gap-1">
                    <span className="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Day</span>
                    <select value={w.dayOfWeek} onChange={e => updateWindow(i, { dayOfWeek: Number(e.target.value) })}
                      className="rounded-[0.75rem] border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 focus:border-sky-400 focus:outline-none cursor-pointer">
                      {DOW_OPTIONS.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">From</span>
                    <input type="time" value={w.startTime} onChange={e => updateWindow(i, { startTime: e.target.value })}
                      className="rounded-[0.75rem] border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 focus:border-sky-400 focus:outline-none" />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">To</span>
                    <input type="time" value={w.endTime} onChange={e => updateWindow(i, { endTime: e.target.value })}
                      className="rounded-[0.75rem] border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 focus:border-sky-400 focus:outline-none" />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Lesson (min)</span>
                    <input type="number" min="15" step="5" value={w.slotMinutes} onChange={e => updateWindow(i, { slotMinutes: Number(e.target.value) })}
                      className="w-24 rounded-[0.75rem] border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 focus:border-sky-400 focus:outline-none" />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Gap (min)</span>
                    <input type="number" min="0" step="5" value={w.gapMinutes} onChange={e => updateWindow(i, { gapMinutes: Number(e.target.value) })}
                      className="w-24 rounded-[0.75rem] border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 focus:border-sky-400 focus:outline-none" />
                  </label>
                  <button onClick={() => removeWindow(i)} title="Remove window"
                    className="ml-auto flex h-9 w-9 items-center justify-center rounded-full border border-rose-200 bg-white text-rose-600 hover:bg-rose-50 transition cursor-pointer">
                    <span className="material-symbols-outlined text-lg">delete</span>
                  </button>
                </div>
                {/* worked example: the slots this window opens */}
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <span className="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Opens</span>
                  {slots.length ? slots.map(s => (
                    <span key={s} className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-xs font-semibold text-sky-700">{s}</span>
                  )) : (
                    <span className="text-xs text-rose-500">No slots — the window is too short for one lesson.</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        <button onClick={addWindow}
          className="mt-3 inline-flex items-center gap-2 rounded-full border border-sky-200 bg-white/80 px-4 py-2 text-sm font-semibold text-sky-700 hover:border-sky-300 hover:bg-sky-50 transition cursor-pointer">
          <span className="material-symbols-outlined text-lg">add</span>
          Add a window
        </button>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button onClick={saveAvailability} disabled={availBusy}
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-sky-600 to-blue-700 px-6 py-3 text-sm font-semibold text-white shadow-[0_16px_35px_-18px_rgba(2,132,199,0.9)] transition-all duration-300 enabled:hover:-translate-y-0.5 enabled:cursor-pointer disabled:opacity-40">
            <span className="material-symbols-outlined text-lg">save</span>
            {availBusy ? 'Saving…' : 'Save availability'}
          </button>
        </div>
      </section>

      {/* ── 2 · My upcoming lessons ── */}
      <section className="glass-panel rounded-[2rem] border border-white/50 px-5 py-6 editorial-shadow sm:px-8">
        <p className="font-label text-xs font-bold uppercase tracking-[0.28em] text-sky-600">Upcoming</p>
        <h2 className="mt-1 font-headline text-3xl text-slate-900">My Upcoming <span className="italic text-sky-600">Lessons</span></h2>
        <div className="mt-4 space-y-2">
          {upcoming.length ? upcoming.map(b => (
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
    </div>
  )
}
