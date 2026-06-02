// Calendar — lessons past + upcoming, styled for production gold-deploy UI.
// Group lessons are hidden from past pills (PVT-forward view); individual
// lessons show a synthesised IND-<initials>-<startDate> code. Meet URLs are
// extracted from the lesson.summary and render as a Join button on upcoming
// cards. Past pills link to the full analysis in the Lessons view.

import { useMemo, useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../i18n'

const MONTH_NAMES = ['January','February','March','April','May','June',
  'July','August','September','October','November','December']

function ymd(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// Parse "YYYY-MM-DD" + "HH:MM" into a Date in Europe/Warsaw (CEST = UTC+2
// in April–October, CET = UTC+1 otherwise). Approximation for display — not
// perfect on DST edge cases but fine for lesson-scheduling granularity.
function parseLessonStart(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null
  const [y, m, d] = dateStr.split('-').map(Number)
  const [hh, mm] = timeStr.split(':').map(Number)
  // Construct UTC for CEST (UTC+2) and CET (UTC+1). Poland uses CEST late
  // March → late October; CET otherwise. Approximation: March–October = CEST.
  const offsetHours = (m >= 4 && m <= 10) ? 2 : 1
  // Date.UTC(y, m-1, d, hh-offsetHours, mm) gives the UTC instant
  return new Date(Date.UTC(y, m - 1, d, hh - offsetHours, mm))
}

// Returns a live countdown / status string + urgency tier.
function describeProximity(startAt, now, durationMin = 60) {
  if (!startAt) return { label: '', urgency: 'none' }
  const diffMs = startAt.getTime() - now.getTime()
  const diffMin = Math.round(diffMs / 60000)
  const endAt = startAt.getTime() + durationMin * 60000
  if (now.getTime() >= startAt.getTime() && now.getTime() < endAt) {
    return { label: 'In session · join now', urgency: 'live' }
  }
  if (diffMin < 0) {
    const ago = Math.abs(diffMin)
    if (ago < 60) return { label: `Ended ${ago} min ago`, urgency: 'past' }
    return { label: `Ended ${Math.round(ago / 60)}h ago`, urgency: 'past' }
  }
  if (diffMin <= 60) return { label: `Starts in ${diffMin} min`, urgency: 'imminent' }
  if (diffMin <= 60 * 24) {
    const h = Math.floor(diffMin / 60), mn = diffMin % 60
    return { label: `Starts in ${h}h ${String(mn).padStart(2,'0')}m`, urgency: 'today' }
  }
  const days = Math.floor(diffMin / (60 * 24))
  if (days === 1) return { label: 'Tomorrow', urgency: 'soon' }
  if (days < 7) return { label: `In ${days} days`, urgency: 'soon' }
  return { label: `In ${days} days`, urgency: 'later' }
}

function indGroupCode(slug, startDate) {
  const initials = slug.split('-').map(s => (s[0] || '').toUpperCase()).join('')
  if (!startDate) return `IND-${initials}`
  const [y, m, d] = startDate.split('-')
  return `IND-${initials}-${d}${m}${y}`
}

function groupCodeFor(lesson, studentSlug, earliestDate) {
  if (Array.isArray(lesson?.topics)) {
    for (const t of lesson.topics) {
      if (typeof t === 'string' && /^(OP|OLS|OPT|IND|BA|PREDOM|FIN|GRAIN|ASSECO|EDRA|FINGO|FINTIERA|SEK)/i.test(t)) {
        return t
      }
    }
  }
  return indGroupCode(studentSlug, earliestDate)
}

function isIndividualLesson(lesson) {
  if (!Array.isArray(lesson?.topics)) return true
  for (const t of lesson.topics) {
    if (typeof t !== 'string') continue
    if (/^IND[-_]/i.test(t)) return true
    if (/^(OP|OLS|OPT|BA|PREDOM|FIN|GRAIN|ASSECO|EDRA|FINGO|FINTIERA|SEK)/i.test(t)) return false
  }
  return true
}

export default function Calendar({ data }) {
  const { t } = useI18n()
  const slug = data?.profile?.slug || 'aleksandra-gorska'
  const lessons = Array.isArray(data?.lessons) ? data.lessons : []
  const analysesByLessonId = useMemo(() => {
    const m = new Map()
    for (const a of (data?.analyses || [])) if (a.lessonId) m.set(String(a.lessonId), a)
    return m
  }, [data?.analyses])

  // Live tick — drives the countdown + Join-button urgency transitions.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000) // 30s
    return () => clearInterval(id)
  }, [])

  const lessonItems = useMemo(() => {
    const todayStr = ymd(now)
    return lessons.map(l => {
      const date = l.date || l.lessonDate || ''
      const status = l.status || ''
      // A lesson is "upcoming" if status is 'planned' OR (no status AND date is
      // strictly in the future). Today's lesson counts as upcoming until the
      // session's end time passes (handled downstream by proximity logic).
      const plannedFlag = status === 'planned'
      const dateInPast = date && date < todayStr
      const isPast = !plannedFlag && dateInPast
      const analysis = analysesByLessonId.get(String(l._id || l.lessonId || l.id))
      const startTime = (l.summary && l.summary.match(/Scheduled (\d\d:\d\d)/)?.[1]) || l.startTime
      const startAt = parseLessonStart(date, startTime)
      // Refine isPast using actual start+duration when we have a parsed time.
      let trulyPast = isPast
      if (startAt && !plannedFlag) {
        const endMs = startAt.getTime() + 60 * 60000  // +60 min default lesson length
        trulyPast = now.getTime() > endMs
      }
      return {
        _id: String(l._id || l.lessonId || l.id || `${date}-${Math.random()}`),
        date,
        title: l.title || l.lessonTitle || 'Lesson',
        status: l.status || (trulyPast ? 'completed' : 'planned'),
        topics: l.topics || [],
        lesson: l,
        analysis,
        startTime,
        startAt,
        meetingUrl: l.meetingUrl || (l.summary && l.summary.match(/https?:\/\/meet\.google\.com\/[a-z-]+/i)?.[0]) || null,
        isPast: trulyPast,
      }
    })
    .filter(x => x.date)
    .filter(x => !x.isPast || isIndividualLesson(x.lesson))
    .sort((a, b) => {
      // Upcoming first (by startAt), then past (most recent first)
      if (a.isPast !== b.isPast) return a.isPast ? 1 : -1
      if (a.isPast) return b.date.localeCompare(a.date)
      return a.date.localeCompare(b.date)
    })
  }, [lessons, analysesByLessonId, now])

  const earliestDate = useMemo(() => {
    const dates = lessonItems.map(x => x.date).filter(Boolean).sort()
    return dates[0] || ''
  }, [lessonItems])

  const today = new Date()
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1))
  const pastCount = lessonItems.filter(x => x.isPast).length
  const upcomingCount = lessonItems.filter(x => !x.isPast).length
  const upcoming = lessonItems.filter(x => !x.isPast).slice(0, 8)

  // Month grid
  const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
  const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0)
  const firstDow = (monthStart.getDay() + 6) % 7
  const daysInMonth = monthEnd.getDate()
  const cells = []
  for (let i = 0; i < firstDow; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) {
    const date = ymd(new Date(cursor.getFullYear(), cursor.getMonth(), d))
    const dayLessons = lessonItems.filter(x => x.date === date)
    cells.push({ date, day: d, lessons: dayLessons })
  }
  const todayStr = ymd(today)

  return (
    <section className="space-y-4" id="page-calendar">
      <div className="rounded-[1.75rem] bg-gradient-to-br from-white via-sky-50/40 to-violet-50/40 border border-white/70 editorial-shadow px-5 py-5 sm:px-6">
        <p className="font-label text-[11px] font-bold uppercase tracking-[0.24em] text-sky-700">
          Lesson Calendar
        </p>
        <h1 className="mt-1.5 font-headline text-2xl sm:text-3xl text-slate-900">
          Your lessons, past and upcoming
        </h1>
        <p className="mt-1.5 text-sm text-slate-600 max-w-2xl">
          {pastCount} past · {upcomingCount} upcoming. Click a past lesson to open its full analysis; upcoming lessons show the scheduled time and Google Meet link.
        </p>
      </div>

      {/* Upcoming strip */}
      {upcoming.length > 0 && (
        <div>
          <p className="font-label text-[10px] font-bold uppercase tracking-[0.3em] text-sky-700 mb-3">
            Upcoming · {upcoming.length}
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {upcoming.map(l => {
              const code = groupCodeFor(l.lesson, slug, earliestDate)
              const [y, mm, dd] = l.date.split('-')
              const monthLabel = MONTH_NAMES[parseInt(mm, 10) - 1]
              const prox = describeProximity(l.startAt, now)
              const urgencyStyle = {
                live:     'border-emerald-400 ring-4 ring-emerald-100 bg-gradient-to-br from-emerald-50 to-white',
                imminent: 'border-amber-400 ring-4 ring-amber-100 bg-gradient-to-br from-amber-50 to-white',
                today:    'border-sky-400 ring-2 ring-sky-100 bg-gradient-to-br from-sky-50 to-white',
                soon:     'border-sky-100 bg-white/90',
                later:    'border-sky-100 bg-white/90',
                past:     'border-slate-200 bg-slate-50',
                none:     'border-sky-100 bg-white/90',
              }[prox.urgency] || 'border-sky-100 bg-white/90'
              const btnColor = prox.urgency === 'live' ? 'bg-emerald-600 hover:bg-emerald-700 animate-pulse'
                : prox.urgency === 'imminent' ? 'bg-amber-600 hover:bg-amber-700'
                : 'bg-sky-600 hover:bg-sky-700'
              return (
                <div key={l._id} className={`rounded-[1.25rem] border-2 p-4 editorial-shadow ${urgencyStyle} transition-all`}>
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-headline text-3xl text-slate-900 leading-none">{parseInt(dd, 10)}</p>
                      <p className="font-label text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500 mt-1">
                        {monthLabel} {y}
                      </p>
                    </div>
                    {l.startTime && (
                      <p className="font-mono text-sm font-bold text-sky-700">{l.startTime} CEST</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-block font-label text-[9px] font-bold uppercase tracking-[0.2em] text-violet-700 border border-violet-200 rounded-full px-2 py-0.5 bg-violet-50">
                      {code}
                    </span>
                    {prox.label && (
                      <span className={`inline-flex items-center gap-1 font-label text-[9px] font-bold uppercase tracking-[0.16em] rounded-full px-2 py-0.5 ${
                        prox.urgency === 'live' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                        : prox.urgency === 'imminent' ? 'bg-amber-100 text-amber-800 border border-amber-300'
                        : prox.urgency === 'today' ? 'bg-sky-100 text-sky-800 border border-sky-300'
                        : 'bg-slate-100 text-slate-600 border border-slate-200'
                      }`}>
                        {prox.urgency === 'live' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"/>}
                        {prox.label}
                      </span>
                    )}
                  </div>
                  <p className="text-[13px] text-slate-700 leading-snug mt-3 line-clamp-2">
                    {l.title}
                  </p>
                  {l.meetingUrl && (
                    <a href={l.meetingUrl} target="_blank" rel="noopener noreferrer"
                      className={`mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-white text-[11px] font-label font-bold uppercase tracking-[0.14em] transition ${btnColor}`}>
                      <span className="material-symbols-outlined text-sm">videocam</span>
                      {prox.urgency === 'live' ? 'Join Now — In Session' : 'Join Google Meet'}
                    </a>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Month navigator */}
      <div className="flex items-center justify-between mt-4">
        <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
          className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-label font-bold uppercase tracking-[0.14em] text-slate-600 hover:border-sky-300 hover:text-sky-700 transition">
          <span className="material-symbols-outlined text-sm">chevron_left</span>Previous
        </button>
        <h2 className="font-headline text-xl text-slate-900">
          {MONTH_NAMES[cursor.getMonth()]} {cursor.getFullYear()}
        </h2>
        <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
          className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-label font-bold uppercase tracking-[0.14em] text-slate-600 hover:border-sky-300 hover:text-sky-700 transition">
          Next<span className="material-symbols-outlined text-sm">chevron_right</span>
        </button>
      </div>

      {/* Month grid */}
      <div className="rounded-[1.5rem] overflow-hidden border-2 border-slate-200 bg-slate-100">
        <div className="grid grid-cols-7 gap-px bg-slate-200">
          {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => (
            <div key={d} className="bg-slate-50 px-2 py-2 text-center">
              <p className="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">{d}</p>
            </div>
          ))}
          {cells.map((c, i) => {
            if (!c) return <div key={i} className="bg-slate-50 min-h-[90px]" />
            const isToday = c.date === todayStr
            return (
              <div key={c.date} className={`bg-white min-h-[90px] p-1.5 ${isToday ? 'border-t-2 border-sky-500' : ''}`}>
                <p className={`font-mono text-xs ${isToday ? 'text-sky-700 font-bold' : 'text-slate-400'}`}>{c.day}</p>
                {c.lessons.map(l => {
                  const code = groupCodeFor(l.lesson, slug, earliestDate)
                  const isPlanned = !l.isPast
                  const path = `/app/${slug}/lessons?openLesson=${l._id}`
                  return isPlanned ? (
                    <div key={l._id} className="mt-1 rounded-md bg-violet-50 border border-violet-300 px-1.5 py-0.5"
                      title={`${l.startTime || ''} · ${l.title}`}>
                      <p className="font-label text-[9px] font-bold uppercase tracking-[0.1em] text-violet-700 truncate">
                        {l.startTime || '—'} · {code}
                      </p>
                    </div>
                  ) : (
                    <Link key={l._id} to={path} title={l.title}
                      className="mt-1 block rounded-md bg-slate-100 border border-slate-200 px-1.5 py-0.5 hover:border-sky-400 hover:bg-sky-50 transition">
                      <p className="font-label text-[9px] font-bold uppercase tracking-[0.1em] text-slate-600 truncate">
                        {code}
                      </p>
                    </Link>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>

      <div className="flex gap-6 text-[11px] text-slate-500 font-label tracking-[0.12em] uppercase">
        <span className="inline-flex items-center gap-2">
          <span className="inline-block w-3 h-3 bg-violet-50 border border-violet-300 rounded-sm" />
          Upcoming
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="inline-block w-3 h-3 bg-slate-100 border border-slate-200 rounded-sm" />
          Past — click for analysis
        </span>
      </div>
    </section>
  )
}
