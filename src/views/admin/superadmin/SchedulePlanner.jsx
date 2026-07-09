// SchedulePlanner — the scheduling half of the Students workspace (2026-07-09).
// A real embedded month calendar that layers, per day:
//   · the teacher's SET AVAILABILITY (purple underline)
//   · lessons TAUGHT (grey dot) and UPCOMING (green dot) — across all orgs
//   · the PROJECTED plan being built (fuchsia ring), weekly or flexible
// Clicking a day drives the plan. Times are dropdowns (hour + minutes).
// Booking volume is hard-tied to the student's lesson allocation
// (billing:lessonPackages) — shown up front, enforced on booking.

import { useEffect, useMemo, useState } from 'react'
import { mutateAdminConvex, queryAdminConvex } from '../../../contexts/AdminAuthContext.jsx'

const ORG_SCOPES = ['js7cb568fpf7qhkqqe55a7jz5s83sadf', 'js779cs2vjwb2c9yjc3a7t619n84zcp8']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']
const DOW = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
const HOURS = Array.from({ length: 16 }, (_, i) => String(i + 6).padStart(2, '0'))   // 06..21
const MINUTES = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55']

const ymd = (y, m, d) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
const todayStr = () => { const t = new Date(); return ymd(t.getFullYear(), t.getMonth(), t.getDate()) }

// Warsaw wall-clock → UTC ms (DST-correct via Intl).
function warsawToUtcMs(dateStr, timeStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const [hh, mm] = timeStr.split(':').map(Number)
  const guess = Date.UTC(y, m - 1, d, hh, mm)
  for (const off of [2, 1, 0, 3]) {
    const t = guess - off * 3600000
    const w = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Warsaw', year: 'numeric',
      month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
      .formatToParts(new Date(t)).reduce((a, p) => (a[p.type] = p.value, a), {})
    if (Number(w.year) === y && Number(w.month) === m && Number(w.day) === d &&
        Number(w.hour) === hh && Number(w.minute) === mm) return t
  }
  return guess - 2 * 3600000
}

function TimeSelect({ value, onChange }) {
  const [h, m] = (value || '17:00').split(':')
  return (
    <span className="inline-flex items-center gap-1">
      <select className="sa-input" style={{ width: '4.4rem', padding: '0.45rem 0.5rem' }} value={h}
        onChange={e => onChange(`${e.target.value}:${m}`)}>
        {HOURS.map(x => <option key={x} value={x}>{x}</option>)}
      </select>
      <span style={{ color: '#8A83AE' }}>:</span>
      <select className="sa-input" style={{ width: '4.4rem', padding: '0.45rem 0.5rem' }} value={m}
        onChange={e => onChange(`${h}:${e.target.value}`)}>
        {MINUTES.map(x => <option key={x} value={x}>{x}</option>)}
      </select>
    </span>
  )
}

export default function SchedulePlanner({ student, allocVersion = 0, onBooked = null }) {
  const now = new Date()
  const [view, setView] = useState({ y: now.getFullYear(), m: now.getMonth() })
  const [mode, setMode] = useState('weekly')
  const [weekly, setWeekly] = useState({ start: '', time: '17:00', count: 4 })
  const [flex, setFlex] = useState([])                       // [{date, time}]
  const [avail, setAvail] = useState({ weekdays: new Set(), oneOff: new Set() })
  const [bookings, setBookings] = useState([])
  const [packages, setPackages] = useState(null)
  const [allocOpen, setAllocOpen] = useState(false)
  const [allocN, setAllocN] = useState(10)
  const [booking, setBooking] = useState(null)

  // Teacher availability (the student's org mirrors the global schedule).
  useEffect(() => {
    if (!student?.organizationId) return
    let alive = true
    Promise.allSettled([
      queryAdminConvex('scheduling:getWeeklyAvailability', { organizationId: student.organizationId }),
      queryAdminConvex('scheduling:getOneOffAvailability', { organizationId: student.organizationId, fromDate: '2020-01-01' }),
    ]).then(([w, o]) => {
      if (!alive) return
      const weekdays = new Set((w.status === 'fulfilled' ? w.value || [] : [])
        .filter(r => r.active && !r.dateWarsaw).map(r => r.dayOfWeek))
      const oneOff = new Set((o.status === 'fulfilled' ? o.value || [] : [])
        .filter(r => r.active && r.dateWarsaw).map(r => r.dateWarsaw))
      setAvail({ weekdays, oneOff })
    })
    return () => { alive = false }
  }, [student?.organizationId])

  // All bookings across the teaching orgs (taught + upcoming, any student).
  const reloadBookings = () => {
    Promise.allSettled(ORG_SCOPES.map(o => queryAdminConvex('scheduling:listBookings', { organizationId: o })))
      .then(rs => setBookings(rs.flatMap(r => (r.status === 'fulfilled' ? r.value || [] : []))
        .filter(b => b.status === 'scheduled' || b.status === 'completed')))
  }
  useEffect(reloadBookings, [student?._id])

  // Allocation — packages for this student.
  const reloadPackages = () => {
    if (!student?.organizationId) return
    queryAdminConvex('billing:listPackages', { organizationId: student.organizationId })
      .then(rows => setPackages((rows || []).filter(p => p.studentSlug === student.slug && p.status !== 'cancelled')))
      .catch(() => setPackages([]))
  }
  useEffect(reloadPackages, [student?._id, allocVersion])

  const allocated = (packages || []).reduce((n, p) => n + (p.totalLessons || 0), 0)
  const remaining = (packages || []).reduce((n, p) => n + (p.remainingLessons ?? 0), 0)
  const used = allocated - remaining

  // The weekly lesson count is HARD-LINKED to the allocation: never more
  // options than lessons remaining, and the value clamps when it changes.
  useEffect(() => {
    if (packages === null) return
    setWeekly(w => ({ ...w, count: Math.max(remaining > 0 ? 1 : 0, Math.min(Number(w.count) || 1, remaining)) }))
  }, [remaining, packages === null])

  // Projected plan dates.
  const plan = useMemo(() => {
    if (mode === 'weekly') {
      if (!weekly.start) return []
      const out = []
      for (let i = 0; i < Math.min(Number(weekly.count) || 1, 48); i++) {
        const d = new Date(`${weekly.start}T12:00:00Z`)
        d.setUTCDate(d.getUTCDate() + 7 * i)
        out.push({ date: d.toISOString().slice(0, 10), time: weekly.time })
      }
      return out
    }
    return flex
  }, [mode, weekly, flex])
  const planDates = useMemo(() => new Set(plan.map(p => p.date)), [plan])
  const overBudget = packages !== null && plan.length > remaining

  // Per-day marks for the visible month.
  const nowMs = Date.now()
  const marks = useMemo(() => {
    const m = {}
    for (const b of bookings) {
      const k = b.dateWarsaw
      if (!m[k]) m[k] = { taught: 0, upcoming: 0 }
      if (b.endUtc < nowMs) m[k].taught++
      else m[k].upcoming++
    }
    return m
  }, [bookings])

  const first = new Date(view.y, view.m, 1)
  const startPad = (first.getDay() + 6) % 7
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate()
  const cells = [...Array(startPad).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]
  const nav = dir => setView(v => { const m = v.m + dir; return { y: v.y + Math.floor(m / 12), m: ((m % 12) + 12) % 12 } })

  const clickDay = (dateStr) => {
    if (dateStr < todayStr()) return
    if (mode === 'weekly') setWeekly(w => ({ ...w, start: dateStr }))
    else setFlex(f => f.some(x => x.date === dateStr)
      ? f.filter(x => x.date !== dateStr)
      : [...f, { date: dateStr, time: '17:00' }].sort((a, b) => a.date.localeCompare(b.date)))
  }

  async function confirmBook() {
    if (!plan.length || overBudget || !student) return
    setBooking({ done: 0, total: plan.length, log: [], finished: false })
    const fmt = ms => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Warsaw',
      weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(ms))
    for (const p of plan) {
      const startUtc = warsawToUtcMs(p.date, p.time)
      try {
        await mutateAdminConvex('scheduling:bookLesson', {
          organizationId: student.organizationId, studentId: student._id,
          startUtc, bookedBy: 'superadmin', bookedByName: 'Superadmin console', force: true,
        })
        setBooking(b => ({ ...b, done: b.done + 1, log: [...b.log, { ok: true, when: fmt(startUtc) }] }))
      } catch (e) {
        setBooking(b => ({ ...b, done: b.done + 1,
          log: [...b.log, { ok: false, when: fmt(startUtc), err: String(e.message || e).replace(/^.*Error: /, '') }] }))
      }
    }
    setBooking(b => ({ ...b, finished: true }))
    setFlex([]); setWeekly(w => ({ ...w, start: '' }))
    reloadBookings(); reloadPackages()
    if (onBooked) onBooked()
  }

  async function allocate() {
    const n = Math.max(1, Math.min(Number(allocN) || 0, 200))
    await mutateAdminConvex('billing:createPackage', {
      organizationId: student.organizationId, studentId: student._id,
      name: `${n}-lesson allocation (superadmin)`, totalLessons: n,
    })
    setAllocOpen(false)
    reloadPackages()
  }

  if (!student) return null

  return (
    <div className="mt-2 rounded-2xl border p-4" style={{ borderColor: 'rgba(96,165,250,0.25)', background: 'rgba(96,165,250,0.04)' }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <span className="flex h-6 w-6 items-center justify-center rounded-full"
            style={{ background: 'linear-gradient(135deg, #60A5FA, #3B82F6)', color: '#fff' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>calendar_add_on</span>
          </span>
          <span className="text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: '#F4F0FF' }}>
            Schedule lessons for {student.name.split(' ')[0]}
          </span>
        </div>
        <div className="flex gap-1 rounded-full border p-0.5" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
          {['weekly', 'flexible'].map(m => (
            <button key={m} type="button" onClick={() => setMode(m)}
              className="rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em]"
              style={{ cursor: 'pointer', border: 'none',
                background: mode === m ? 'linear-gradient(135deg, #60A5FA, #3B82F6)' : 'transparent',
                color: mode === m ? '#fff' : '#8A83AE' }}>{m}</button>
          ))}
        </div>
      </div>

      {/* ── Allocation — the hard budget every plan is tied to ── */}
      <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border px-3 py-2"
        style={{ borderColor: remaining > 0 ? 'rgba(52,211,153,0.3)' : 'rgba(251,113,133,0.4)',
          background: 'rgba(8,4,20,0.4)' }}>
        <span className="material-symbols-outlined" style={{ fontSize: 16, color: remaining > 0 ? '#34D399' : '#FB7185' }}>token</span>
        {packages === null ? (
          <span className="text-xs" style={{ color: '#8A83AE' }}>Loading allocation…</span>
        ) : (
          <span className="text-xs" style={{ color: '#CEC8E8' }}>
            <strong style={{ color: '#F4F0FF' }}>{allocated}</strong> allocated ·{' '}
            <strong style={{ color: '#F4F0FF' }}>{used}</strong> used ·{' '}
            <strong style={{ color: remaining > 0 ? '#34D399' : '#FB7185' }}>{remaining} remaining</strong>
          </span>
        )}
        <span className="ml-auto" style={{ position: 'relative' }}>
          <button type="button" className="sa-btn sa-btn-ghost" style={{ padding: '0.25rem 0.7rem' }}
            onClick={() => setAllocOpen(o => !o)}>
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>add</span>
            Allocate
          </button>
          {allocOpen && (
            <span className="absolute right-0 top-full z-40 mt-1 flex items-center gap-2 rounded-xl border p-2"
              style={{ background: 'rgba(10,6,24,0.97)', borderColor: 'rgba(255,255,255,0.12)' }}>
              <input type="number" min="1" max="200" className="sa-input" style={{ width: '4.5rem', padding: '0.35rem 0.5rem' }}
                value={allocN} onChange={e => setAllocN(e.target.value)} />
              <button type="button" className="sa-btn sa-btn-primary" style={{ padding: '0.3rem 0.7rem' }} onClick={allocate}>
                Add
              </button>
            </span>
          )}
        </span>
      </div>

      <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(340px,1fr)_1fr]">
        {/* ── The calendar — availability + taught + upcoming + plan ── */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <button type="button" onClick={() => nav(-1)} className="sa-btn sa-btn-ghost" style={{ padding: '0.2rem 0.5rem' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>chevron_left</span>
            </button>
            <span className="text-sm font-bold" style={{ color: '#F4F0FF' }}>{MONTHS[view.m]} {view.y}</span>
            <button type="button" onClick={() => nav(1)} className="sa-btn sa-btn-ghost" style={{ padding: '0.2rem 0.5rem' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>chevron_right</span>
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
            {DOW.map(d => <span key={d} className="text-center text-[9px] font-bold uppercase" style={{ color: '#5E567C', letterSpacing: '0.1em' }}>{d}</span>)}
            {cells.map((d, i) => {
              if (d === null) return <span key={`p${i}`} />
              const dateStr = ymd(view.y, view.m, d)
              const jsDow = new Date(view.y, view.m, d).getDay()   // Sun=0 (Convex convention)
              const hasAvail = avail.weekdays.has(jsDow) || avail.oneOff.has(dateStr)
              const mk = marks[dateStr]
              const inPlan = planDates.has(dateStr)
              const isPast = dateStr < todayStr()
              const isWeeklyStart = mode === 'weekly' && weekly.start === dateStr
              return (
                <button key={dateStr} type="button" onClick={() => clickDay(dateStr)} disabled={isPast}
                  title={`${dateStr}${hasAvail ? ' · availability set' : ''}${mk ? ` · ${mk.taught} taught, ${mk.upcoming} upcoming` : ''}`}
                  style={{
                    position: 'relative', minHeight: 46, borderRadius: 10, padding: '4px 2px 12px',
                    cursor: isPast ? 'default' : 'pointer',
                    border: inPlan ? '2px solid #D946EF' : hasAvail ? '1px solid rgba(168,85,247,0.35)' : '1px solid rgba(255,255,255,0.05)',
                    background: isWeeklyStart || inPlan ? 'rgba(217,70,239,0.12)' : hasAvail ? 'rgba(168,85,247,0.05)' : 'transparent',
                    color: isPast ? '#3F3958' : '#F4F0FF', fontSize: 12, fontWeight: 600,
                  }}>
                  {d}
                  <span style={{ position: 'absolute', bottom: 3, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 2 }}>
                    {mk?.taught ? <span style={dot('#8A83AE')} title={`${mk.taught} taught`} /> : null}
                    {mk?.upcoming ? <span style={dot('#34D399')} title={`${mk.upcoming} upcoming`} /> : null}
                    {inPlan ? <span style={dot('#D946EF')} /> : null}
                  </span>
                  {hasAvail && !isPast && (
                    <span style={{ position: 'absolute', top: 2, right: 4, width: 4, height: 4, borderRadius: '50%',
                      background: '#A855F7' }} />
                  )}
                </button>
              )
            })}
          </div>
          <div className="mt-2 flex flex-wrap gap-3 text-[10px]" style={{ color: '#8A83AE' }}>
            <span><span style={{ ...dotInline('#A855F7') }} /> availability set</span>
            <span><span style={{ ...dotInline('#8A83AE') }} /> taught</span>
            <span><span style={{ ...dotInline('#34D399') }} /> upcoming</span>
            <span><span style={{ ...dotInline('#D946EF') }} /> this plan</span>
          </div>
        </div>

        {/* ── Plan controls ── */}
        <div className="space-y-3">
          {mode === 'weekly' ? (
            <>
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex flex-col gap-1">
                  <span className="sa-stat-label">First lesson</span>
                  <span className="sa-input" style={{ minWidth: '9rem', padding: '0.5rem 0.8rem' }}>
                    {weekly.start || <span style={{ color: '#5E567C' }}>click a day ←</span>}
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="sa-stat-label">Time</span>
                  <TimeSelect value={weekly.time} onChange={t => setWeekly(w => ({ ...w, time: t }))} />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="sa-stat-label">Lessons <span style={{ color: '#5E567C' }}>(of {remaining} left)</span></span>
                  {remaining > 0 ? (
                    <select className="sa-input" style={{ width: '7rem' }} value={weekly.count}
                      onChange={e => setWeekly(w => ({ ...w, count: Number(e.target.value) }))}>
                      {Array.from({ length: Math.min(remaining, 24) }, (_, i) => i + 1)
                        .map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  ) : (
                    <span className="sa-input" style={{ width: 'auto', padding: '0.5rem 0.8rem', color: '#FB7185' }}>
                      allocate first ↑
                    </span>
                  )}
                </div>
              </div>
              <p className="text-xs" style={{ color: '#8A83AE' }}>Same weekday &amp; time every week — the fuchsia days on the calendar are this plan.</p>
            </>
          ) : (
            <>
              <p className="text-xs" style={{ color: '#8A83AE' }}>Click days on the calendar to add or remove them, then set each lesson's time:</p>
              <div className="space-y-1.5" style={{ maxHeight: 200, overflowY: 'auto' }}>
                {flex.length === 0 && <p className="text-xs" style={{ color: '#5E567C' }}>No days picked yet.</p>}
                {flex.map((p, i) => (
                  <div key={p.date} className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold" style={{ color: '#F4F0FF', width: 88 }}>{p.date}</span>
                    <TimeSelect value={p.time} onChange={t => setFlex(f => f.map((x, j) => j === i ? { ...x, time: t } : x))} />
                    <button type="button" className="sa-btn sa-btn-ghost" style={{ padding: '0.2rem 0.5rem' }}
                      onClick={() => setFlex(f => f.filter((_, j) => j !== i))}>
                      <span className="material-symbols-outlined" style={{ fontSize: 14 }}>close</span>
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}

          {plan.length > 0 && (
            <div className="rounded-xl border p-2.5" style={{ borderColor: 'rgba(217,70,239,0.25)', background: 'rgba(8,4,20,0.4)' }}>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: '#8A83AE' }}>
                This plan · {plan.length} lesson{plan.length === 1 ? '' : 's'}
              </p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {plan.slice(0, 12).map(p => (
                  <span key={p.date + p.time} className="sa-badge sa-badge-processing">{p.date} · {p.time}</span>
                ))}
                {plan.length > 12 && <span className="text-xs" style={{ color: '#8A83AE' }}>+{plan.length - 12} more</span>}
              </div>
            </div>
          )}

          {overBudget && (
            <p className="text-xs font-semibold" style={{ color: '#FB7185' }}>
              This plan needs {plan.length} lessons but only {remaining} remain allocated — reduce the plan or allocate more.
            </p>
          )}

          <div className="flex items-center justify-end">
            <button type="button" className="sa-btn sa-btn-primary" onClick={confirmBook}
              disabled={!plan.length || overBudget || (booking && !booking.finished)}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>event_available</span>
              {booking && !booking.finished ? `Booking ${booking.done}/${booking.total}…` : `Confirm & book${plan.length ? ` ${plan.length}` : ''}`}
            </button>
          </div>

          {booking && (
            <div className="space-y-1">
              {booking.log.map((r, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="material-symbols-outlined" style={{ fontSize: 14, color: r.ok ? '#34D399' : '#FB7185' }}>
                    {r.ok ? 'event_available' : 'error'}
                  </span>
                  <span style={{ color: '#F4F0FF', fontWeight: 600 }}>{r.when}</span>
                  {r.ok ? <span style={{ color: '#34D399' }}>booked · confirmations sent</span>
                    : <span style={{ color: '#FB7185' }}>{r.err}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const dot = c => ({ width: 5, height: 5, borderRadius: '50%', background: c, display: 'inline-block' })
const dotInline = c => ({ ...dot(c), marginRight: 4, verticalAlign: 'middle' })
