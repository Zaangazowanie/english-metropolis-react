// TeacherAvailability - weekly windows editor for the teacher portal.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { mutateTeacherConvex, queryTeacherConvex } from '../../contexts/TeacherAuthContext.jsx'
import { SectionError, SectionLoading } from './TeacherPanels.jsx'

const DOW_OPTIONS = [
  { v: 1, short: 'Mon', label: 'Monday' },
  { v: 2, short: 'Tue', label: 'Tuesday' },
  { v: 3, short: 'Wed', label: 'Wednesday' },
  { v: 4, short: 'Thu', label: 'Thursday' },
  { v: 5, short: 'Fri', label: 'Friday' },
  { v: 6, short: 'Sat', label: 'Saturday' },
  { v: 0, short: 'Sun', label: 'Sunday' },
]

const blankWindow = () => ({ dayOfWeek: 1, startTime: '17:00', endTime: '18:00', slotMinutes: 50, gapMinutes: 10 })

function timeToMin(t) {
  const [h, m] = String(t).split(':').map(Number)
  return h * 60 + m
}

function minToTime(mins) {
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
}

function previewSlots(w) {
  const start = timeToMin(w.startTime)
  const end = timeToMin(w.endTime)
  const slot = Number(w.slotMinutes)
  const gap = Number(w.gapMinutes)
  if (!slot || start + slot > end) return []
  const out = []
  for (let t = start; t + slot <= end && out.length < 24; t += slot + gap) out.push(minToTime(t))
  return out
}

function dayMeta(dayOfWeek) {
  return DOW_OPTIONS.find(d => Number(d.v) === Number(dayOfWeek)) || DOW_OPTIONS[0]
}

function SummaryMetric({ icon, value, label }) {
  return (
    <div className="rounded-[1.35rem] border border-white/70 bg-white/75 px-4 py-3 shadow-[0_18px_42px_-34px_rgba(79,70,229,0.45)]">
      <div className="flex items-center gap-3">
        <span className="material-symbols-outlined grid h-9 w-9 place-items-center rounded-2xl border border-violet-100 bg-violet-50 text-[20px] text-violet-700">{icon}</span>
        <div>
          <div className="font-mono text-xl font-black leading-none text-slate-950">{value}</div>
          <div className="mt-1 text-xs font-semibold text-slate-500">{label}</div>
        </div>
      </div>
    </div>
  )
}

function FieldLabel({ children }) {
  return <span className="font-label text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">{children}</span>
}

function FieldShell({ label, children }) {
  return (
    <label className="flex min-w-[118px] flex-col gap-1.5">
      <FieldLabel>{label}</FieldLabel>
      {children}
    </label>
  )
}

export default function TeacherAvailability() {
  const { teacher } = useOutletContext()
  const organizationId = teacher?.organizationId
  const teacherId = teacher?._id

  const [loadState, setLoadState] = useState({ loading: true, error: '' })
  const [availDraft, setAvailDraft] = useState([])
  const [availBusy, setAvailBusy] = useState(false)
  const [notice, setNotice] = useState(null)

  const load = useCallback(async () => {
    if (!organizationId || !teacherId) return
    setLoadState({ loading: true, error: '' })
    try {
      const availability = await queryTeacherConvex('scheduling:getWeeklyAvailability', { organizationId, teacherId })
      setAvailDraft((availability || []).map(w => ({
        dayOfWeek: w.dayOfWeek,
        startTime: w.startTime,
        endTime: w.endTime,
        slotMinutes: w.slotMinutes,
        gapMinutes: w.gapMinutes,
      })))
      setLoadState({ loading: false, error: '' })
    } catch (err) {
      console.error('[TeacherAvailability] load failed', err)
      setLoadState({ loading: false, error: 'Could not load your availability.' })
    }
  }, [organizationId, teacherId])

  useEffect(() => { load() }, [load])

  const updateWindow = (i, patch) => setAvailDraft(d => d.map((w, idx) => idx === i ? { ...w, ...patch } : w))
  const removeWindow = (i) => setAvailDraft(d => d.filter((_, idx) => idx !== i))
  const addWindow = (dayOfWeek = 1) => setAvailDraft(d => [...d, { ...blankWindow(), dayOfWeek }])

  const summary = useMemo(() => {
    const slots = availDraft.flatMap(previewSlots)
    const activeDays = new Set(availDraft.map(w => Number(w.dayOfWeek))).size
    const minutes = availDraft.reduce((sum, w) => sum + Math.max(0, timeToMin(w.endTime) - timeToMin(w.startTime)), 0)
    const grouped = DOW_OPTIONS.map(day => ({
      ...day,
      windows: availDraft.filter(w => Number(w.dayOfWeek) === Number(day.v)),
    }))
    return { totalSlots: slots.length, activeDays, hours: Math.round((minutes / 60) * 10) / 10, grouped }
  }, [availDraft])

  const saveAvailability = async () => {
    if (availBusy) return
    for (const w of availDraft) {
      if (timeToMin(w.startTime) + Number(w.slotMinutes) > timeToMin(w.endTime)) {
        setNotice({ kind: 'err', text: 'Each window needs to fit at least one lesson. Make the window longer or shorten the lesson length.' })
        return
      }
    }
    setAvailBusy(true)
    setNotice(null)
    try {
      const windows = availDraft.map(w => ({
        dayOfWeek: Number(w.dayOfWeek),
        startTime: w.startTime,
        endTime: w.endTime,
        slotMinutes: Number(w.slotMinutes),
        gapMinutes: Number(w.gapMinutes),
      }))
      await mutateTeacherConvex('scheduling:setWeeklyAvailability', { organizationId, windows })
      setNotice({ kind: 'ok', text: `Availability saved. ${summary.totalSlots} bookable start time${summary.totalSlots === 1 ? '' : 's'} are now open.` })
      await load()
    } catch (err) {
      setNotice({ kind: 'err', text: String(err?.message || 'Could not save availability.').replace(/^.*Error: /, '') })
    } finally {
      setAvailBusy(false)
    }
  }

  return (
    <>
      {notice && (
        <div className={`rounded-[1.35rem] border px-5 py-4 text-sm font-bold shadow-[0_18px_46px_-34px_rgba(15,23,42,0.35)] ${
          notice.kind === 'ok' ? 'border-emerald-200 bg-emerald-50/90 text-emerald-800'
          : 'border-rose-200 bg-rose-50/90 text-rose-800'
        }`}>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-xl">{notice.kind === 'ok' ? 'check_circle' : 'error'}</span>
            {notice.text}
          </div>
        </div>
      )}

      <section className="relative overflow-hidden rounded-[2.1rem] border border-white/60 bg-white/72 px-5 py-6 shadow-[0_30px_80px_-56px_rgba(124,58,237,0.45)] backdrop-blur-xl sm:px-8">
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
              <p className="font-label text-xs font-black uppercase tracking-[0.24em] text-violet-700">Weekly availability</p>
              <h2 className="mt-2 font-headline text-3xl font-black tracking-[-0.04em] text-slate-950 sm:text-4xl">
                Shape your bookable week
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600">
                Add windows for the times students can book. The preview shows the actual start times opened by each window.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:min-w-[420px]">
              <SummaryMetric icon="event_available" value={summary.totalSlots} label="start times" />
              <SummaryMetric icon="calendar_view_week" value={summary.activeDays} label="days" />
              <SummaryMetric icon="timer" value={`${summary.hours}h`} label="open" />
            </div>
          </div>

          <div className="mt-6 grid gap-2 rounded-[1.5rem] border border-violet-100 bg-violet-50/45 p-2 sm:grid-cols-7">
            {summary.grouped.map(day => {
              const open = day.windows.length > 0
              const starts = day.windows.flatMap(previewSlots)
              return (
                <button
                  key={day.v}
                  type="button"
                  onClick={() => addWindow(day.v)}
                  className={`min-h-[86px] rounded-[1.15rem] border px-3 py-3 text-left transition hover:-translate-y-0.5 ${
                    open
                      ? 'border-violet-200 bg-white text-slate-950 shadow-[0_16px_34px_-28px_rgba(124,58,237,0.65)]'
                      : 'border-transparent bg-white/45 text-slate-500 hover:border-violet-100 hover:bg-white/80'
                  }`}
                  title={`Add ${day.label} window`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-label text-[11px] font-black uppercase tracking-[0.14em]">{day.short}</span>
                    <span className={`material-symbols-outlined text-[17px] ${open ? 'text-violet-700' : 'text-slate-400'}`}>add</span>
                  </div>
                  <div className="mt-2 font-mono text-lg font-black">{starts.length}</div>
                  <div className="mt-1 text-[11px] font-semibold leading-tight">{open ? 'bookable starts' : 'closed'}</div>
                </button>
              )
            })}
          </div>

          {loadState.loading ? (
            <div className="mt-6"><SectionLoading /></div>
          ) : loadState.error ? (
            <div className="mt-6"><SectionError error={{ kind: 'http', message: loadState.error }} onRetry={load} /></div>
          ) : (
            <>
              <div className="mt-6 space-y-3">
                {availDraft.length === 0 && (
                  <div className="rounded-[1.35rem] border border-dashed border-violet-200 bg-white/70 px-5 py-4 text-sm font-semibold text-slate-500">
                    No weekly availability yet. Pick a day above or add a window below.
                  </div>
                )}

                {availDraft.map((w, i) => {
                  const slots = previewSlots(w)
                  const meta = dayMeta(w.dayOfWeek)
                  return (
                    <div key={i} className="rounded-[1.55rem] border border-white/70 bg-white/86 p-4 shadow-[0_22px_54px_-46px_rgba(79,70,229,0.55)]">
                      <div className="grid gap-3 xl:grid-cols-[1.1fr_0.9fr_auto] xl:items-end">
                        <div className="grid gap-3 sm:grid-cols-[1.1fr_1fr_1fr]">
                          <FieldShell label="Day">
                            <select
                              value={w.dayOfWeek}
                              onChange={e => updateWindow(i, { dayOfWeek: Number(e.target.value) })}
                              className="h-11 rounded-[0.9rem] border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
                            >
                              {DOW_OPTIONS.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
                            </select>
                          </FieldShell>
                          <FieldShell label="From">
                            <input
                              type="time"
                              value={w.startTime}
                              onChange={e => updateWindow(i, { startTime: e.target.value })}
                              className="h-11 rounded-[0.9rem] border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
                            />
                          </FieldShell>
                          <FieldShell label="To">
                            <input
                              type="time"
                              value={w.endTime}
                              onChange={e => updateWindow(i, { endTime: e.target.value })}
                              className="h-11 rounded-[0.9rem] border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
                            />
                          </FieldShell>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                          <FieldShell label="Lesson">
                            <input
                              type="number"
                              min="15"
                              step="5"
                              value={w.slotMinutes}
                              onChange={e => updateWindow(i, { slotMinutes: Number(e.target.value) })}
                              className="h-11 rounded-[0.9rem] border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
                            />
                          </FieldShell>
                          <FieldShell label="Gap">
                            <input
                              type="number"
                              min="0"
                              step="5"
                              value={w.gapMinutes}
                              onChange={e => updateWindow(i, { gapMinutes: Number(e.target.value) })}
                              className="h-11 rounded-[0.9rem] border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
                            />
                          </FieldShell>
                        </div>

                        <button
                          onClick={() => removeWindow(i)}
                          title={`Remove ${meta.label} window`}
                          className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-rose-200 bg-white px-4 text-sm font-bold text-rose-600 transition hover:bg-rose-50 xl:w-11 xl:px-0"
                        >
                          <span className="material-symbols-outlined text-lg">delete</span>
                          <span className="xl:hidden">Remove</span>
                        </button>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        <FieldLabel>Opens</FieldLabel>
                        {slots.length ? slots.map(s => (
                          <span key={s} className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-black text-violet-700">{s}</span>
                        )) : (
                          <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-bold text-rose-600">Window too short for one lesson</span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                <button
                  onClick={() => addWindow()}
                  className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-white/85 px-5 py-3 text-sm font-black text-violet-700 shadow-[0_16px_34px_-28px_rgba(124,58,237,0.75)] transition hover:-translate-y-0.5 hover:border-violet-300 hover:bg-violet-50"
                >
                  <span className="material-symbols-outlined text-lg">add</span>
                  Add window
                </button>

                <button
                  onClick={saveAvailability}
                  disabled={availBusy}
                  className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-violet-700 via-fuchsia-600 to-pink-500 px-6 py-3 text-sm font-black text-white shadow-[0_22px_46px_-24px_rgba(192,38,211,0.95)] transition enabled:hover:-translate-y-0.5 disabled:opacity-45"
                >
                  <span className="material-symbols-outlined text-lg">save</span>
                  {availBusy ? 'Saving...' : 'Save availability'}
                </button>
              </div>
            </>
          )}
        </div>
      </section>
    </>
  )
}
