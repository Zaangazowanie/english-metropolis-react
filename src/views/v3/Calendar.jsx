// Calendar (v3) — lessons past + upcoming, re-skinned for the v3 visual
// language. Preserves DST-aware parsing, 30s tick, Meet URL extraction, and
// Monday-first month grid from the gold-deploy view. Past group lessons are
// hidden; past individual lessons link to the full analysis in Lessons.

import { useMemo, useState, useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { FONT, G } from '../../design/v3/tokens.js'
import { useV3Theme } from '../../design/v3/ThemeProvider.jsx'
import { Glass, Btn, Pill, Skeleton } from '../../design/v3/primitives.jsx'
import { useReveal } from '../../design/v3/motion/index.js'
import { useI18n } from '../../i18n'
import LessonBooking from './LessonBooking.jsx'
import Curriculum from './Curriculum.jsx'

function ymd(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// Parse "YYYY-MM-DD" + "HH:MM" into a Date in Europe/Warsaw (CEST = UTC+2 in
// April–October, CET = UTC+1 otherwise). Approximation for display — not
// perfect on DST edge cases but fine for lesson-scheduling granularity.
function parseLessonStart(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null
  const [y, m, d] = dateStr.split('-').map(Number)
  const [hh, mm] = timeStr.split(':').map(Number)
  const offsetHours = (m >= 4 && m <= 10) ? 2 : 1
  return new Date(Date.UTC(y, m - 1, d, hh - offsetHours, mm))
}

// All proximity strings (and the weekday/month names used elsewhere) are now
// resolved through `t()` so the calendar reads in Polish for PL students. The
// timezone abbreviation (CEST/CET) deliberately stays Latin — Mike's spec is
// to NOT translate it.
function describeProximity(t, startAt, now, durationMin = 60) {
  if (!startAt) return { label: '', urgency: 'none' }
  const diffMs = startAt.getTime() - now.getTime()
  const diffMin = Math.round(diffMs / 60000)
  const endAt = startAt.getTime() + durationMin * 60000
  if (now.getTime() >= startAt.getTime() && now.getTime() < endAt) {
    return { label: t('calendar.proximity.live'), urgency: 'live' }
  }
  if (diffMin < 0) {
    const ago = Math.abs(diffMin)
    if (ago < 60) return { label: t('calendar.proximity.endedMin', { n: ago }), urgency: 'past' }
    return { label: t('calendar.proximity.endedHr', { n: Math.round(ago / 60) }), urgency: 'past' }
  }
  if (diffMin <= 60) return { label: t('calendar.proximity.startsInMin', { n: diffMin }), urgency: 'imminent' }
  if (diffMin <= 60 * 24) {
    const h = Math.floor(diffMin / 60), mn = diffMin % 60
    return { label: t('calendar.proximity.startsInHrMin', { h, m: String(mn).padStart(2,'0') }), urgency: 'today' }
  }
  const days = Math.floor(diffMin / (60 * 24))
  if (days === 1) return { label: t('calendar.proximity.tomorrow'), urgency: 'soon' }
  if (days < 7) return { label: t('calendar.proximity.inDays', { n: days }), urgency: 'soon' }
  return { label: t('calendar.proximity.inDays', { n: days }), urgency: 'later' }
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

const PROXIMITY_TONE = {
  live:     { pill: 'emerald', icon: 'sensors' },
  imminent: { pill: 'amber',   icon: 'schedule' },
  today:    { pill: 'sky',     icon: 'today' },
  soon:     { pill: 'violet',  icon: 'event' },
  later:    { pill: 'neutral', icon: 'event' },
  past:     { pill: 'neutral', icon: 'history' },
  none:     { pill: 'neutral', icon: 'event' },
}

function UpcomingCard({ item, slug, earliestDate, now }) {
  const { T } = useV3Theme()
  const { t } = useI18n()
  const code = groupCodeFor(item.lesson, slug, earliestDate)
  const [y, mm, dd] = item.date.split('-')
  const monthLabel = t(`month.${parseInt(mm, 10)}`)
  const prox = describeProximity(t, item.startAt, now)
  const tone = PROXIMITY_TONE[prox.urgency] || PROXIMITY_TONE.none
  const isLive = prox.urgency === 'live'
  const isImminent = prox.urgency === 'imminent'
  const joinVariant = isLive ? 'primary' : isImminent ? 'ember' : 'secondary'
  const joinLabel = isLive ? t('calendar.join.now') : t('calendar.join.meet')
  return (
    <Glass padding={18} hover style={{
      position: 'relative',
      borderColor: isLive ? T.emerald : undefined,
      boxShadow: isLive ? `0 0 0 2px ${T.emerald}, 0 0 40px -8px ${T.emerald}` : undefined,
    }}>
      {isLive && (
        <span aria-hidden style={{
          position: 'absolute', top: 10, right: 10, width: 8, height: 8, borderRadius: '50%',
          background: T.emerald, animation: 'emPulse 1.4s ease infinite',
          boxShadow: `0 0 14px ${T.emerald}`,
        }}/>
      )}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
        <div style={{ fontFamily: FONT.display, fontSize: 40, fontWeight: 600,
          lineHeight: 1, letterSpacing: '-0.03em', color: T.text }}>
          {parseInt(dd, 10)}
        </div>
        <div style={{ fontSize: 13, color: T.textDim, fontFamily: FONT.mono }}>
          {monthLabel} {y}
        </div>
      </div>
      <div style={{ fontSize: 13, color: T.textSoft, fontFamily: FONT.mono, marginBottom: 10 }}>
        {item.startTime || '—'}{' '}
        <span style={{ color: T.textDim, fontSize: 13 }}>CEST</span>
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        <Pill tone="violet" size="sm">{code}</Pill>
        {prox.label && (
          <Pill tone={tone.pill} size="sm" icon={tone.icon}>{prox.label}</Pill>
        )}
      </div>
      <div style={{
        fontSize: 14, color: T.text, fontWeight: 500, lineHeight: 1.35,
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
        overflow: 'hidden', minHeight: 38, marginBottom: 14,
      }}>{item.title}</div>
      {item.meetingUrl ? (
        <a href={item.meetingUrl} target="_blank" rel="noopener noreferrer"
          style={{ textDecoration: 'none', display: 'block' }}>
          <Btn full size="sm" variant={joinVariant}
            icon={isLive ? 'radio_button_checked' : 'videocam'}>
            {joinLabel}
          </Btn>
        </a>
      ) : (
        <Btn full size="sm" variant="ghost" disabled icon="videocam">
          {t('calendar.meet.pending')}
        </Btn>
      )}
    </Glass>
  )
}

function MonthGrid({ cursor, setCursor, lessonItems, slug, earliestDate, todayStr }) {
  const { T, isMobile } = useV3Theme()
  const { t } = useI18n()
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
  while (cells.length % 7 !== 0) cells.push(null)

  const monthLabel = `${t(`month.${cursor.getMonth() + 1}`)} ${cursor.getFullYear()}`
  const goPrev = () => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))
  const goNext = () => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))
  const goToday = () => {
    const t = new Date()
    setCursor(new Date(t.getFullYear(), t.getMonth(), 1))
  }

  return (
    <Glass padding={isMobile ? 18 : 24}>
      <div style={{ display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
        <div style={{ fontFamily: FONT.display, fontSize: 22, fontWeight: 600,
          letterSpacing: '-0.02em', color: T.text }}>
          {monthLabel}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <Btn size="sm" variant="secondary" icon="chevron_left" onClick={goPrev}/>
          <Btn size="sm" variant="secondary" onClick={goToday}>{t('calendar.button.today')}</Btn>
          <Btn size="sm" variant="secondary" trailingIcon="chevron_right" onClick={goNext}/>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
        {/* Monday-first short weekday header — index maps to weekday.short.<idx>
            (1=Mon, …, 6=Sat, 0=Sun) so the strip stays Polish on PL. */}
        {[1,2,3,4,5,6,0].map(idx => (
          <div key={idx} style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.12em',
            textTransform: 'uppercase', color: T.textDim, padding: '4px 8px' }}>{t(`weekday.short.${idx}`)}</div>
        ))}
        {cells.map((c, i) => {
          if (!c) return <div key={`empty-${i}`}/>
          const isToday = c.date === todayStr
          return (
            <div key={c.date} style={{
              minHeight: isMobile ? 64 : 92,
              background: T.surface,
              border: `1px solid ${isToday ? (T.brandInk || T.brand) : T.border}`,
              borderRadius: 10, padding: 6,
              display: 'flex', flexDirection: 'column', gap: 3,
            }}>
              <div style={{ fontSize: 13, fontWeight: 600, fontFamily: FONT.mono,
                color: isToday ? (T.brandInk || T.brand) : T.textDim }}>{c.day}</div>
              {c.lessons.map(l => {
                const code = groupCodeFor(l.lesson, slug, earliestDate)
                const isUpcoming = !l.isPast
                const label = `${l.startTime || '—'} · ${code}`
                const cellStyle = {
                  padding: '2px 5px', borderRadius: 4,
                  background: isUpcoming ? 'rgba(139,92,246,0.18)' : 'rgba(255,255,255,0.06)',
                  color: isUpcoming ? T.violet : T.textDim,
                  border: `1px solid ${isUpcoming ? 'rgba(139,92,246,0.30)' : 'transparent'}`,
                  fontSize: 13, fontFamily: FONT.mono,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  textDecoration: 'none',
                }
                if (isUpcoming) {
                  return <div key={l._id} style={cellStyle} title={l.title}>{label}</div>
                }
                const path = `/app/${slug}/lessons?openLesson=${l._id}`
                return (
                  <Link key={l._id} to={path} title={l.title} className="em-focus"
                    style={{ ...cellStyle, cursor: 'pointer' }}>
                    {code}
                  </Link>
                )
              })}
            </div>
          )
        })}
      </div>
    </Glass>
  )
}

function LegendDot({ color, label, pulse }) {
  const { T } = useV3Theme()
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6,
      color: T.textDim }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: color,
        animation: pulse ? 'emPulse 1.4s ease infinite' : 'none',
        boxShadow: pulse ? `0 0 10px ${color}` : 'none' }}/>
      {label}
    </span>
  )
}

export default function Calendar({ data }) {
  const { T, isMobile } = useV3Theme()
  const { t } = useI18n()
  const params = useParams()
  const slug = params?.slug || data?.profile?.slug || 'aleksandra-gorska'
  const loading = !!data?.loading
  const lessons = Array.isArray(data?.lessons) ? data.lessons : []
  const analysesByLessonId = useMemo(() => {
    const m = new Map()
    for (const a of (data?.analyses || [])) if (a.lessonId) m.set(String(a.lessonId), a)
    return m
  }, [data?.analyses])

  // Live tick — drives the countdown + Join-button urgency transitions.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(id)
  }, [])
  const upcomingReveal = useReveal({ stagger: 50, cap: 4 })

  const lessonItems = useMemo(() => {
    const todayStr = ymd(now)
    return lessons.map(l => {
      const date = l.date || l.lessonDate || ''
      const status = l.status || ''
      const plannedFlag = status === 'planned'
      const dateInPast = date && date < todayStr
      const isPast = !plannedFlag && dateInPast
      const analysis = analysesByLessonId.get(String(l._id || l.lessonId || l.id))
      const startTime = (l.summary && l.summary.match(/Scheduled (\d\d:\d\d)/)?.[1]) || l.startTime
      const startAt = parseLessonStart(date, startTime)
      let trulyPast = isPast
      if (startAt && !plannedFlag) {
        const endMs = startAt.getTime() + 60 * 60000
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
  const todayStr = ymd(today)

  const container = {
    maxWidth: 1840, margin: '0 auto',
    padding: isMobile ? '22px 16px 80px' : '34px 28px 80px',
  }

  if (loading) {
    return (
      <div style={container}>
        <Skeleton h={180} style={{ marginBottom: 32 }}/>
        <div style={{ display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, 1fr)',
          gap: 14, marginBottom: 40 }}>
          {[0,1,2,3].map(i => <Skeleton key={i} h={220}/>)}
        </div>
        <Skeleton h={420}/>
      </div>
    )
  }

  if (!lessonItems.length) {
    return (
      <div style={container}>
        <Glass padding={isMobile ? 24 : 36} style={{
          background: `${G.brandSoft}, ${T.bg1}`,
          borderColor: 'rgba(217,70,239,0.25)',
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.14em',
            textTransform: 'uppercase', color: T.brandInk || T.brand, marginBottom: 10 }}>
            {t('calendar.hero.kicker')}
          </div>
          <h1 style={{ fontFamily: FONT.display, fontWeight: 600,
            fontSize: isMobile ? 30 : 44, lineHeight: 1.04, letterSpacing: '-0.03em',
            margin: 0, color: T.text }}>{t('calendar.empty.title')}</h1>
          <p style={{ marginTop: 14, fontSize: 15, color: T.textSoft,
            maxWidth: 560, lineHeight: 1.55 }}>
            {t('calendar.empty.body')}
          </p>
        </Glass>
        {/* Curriculum roadmap + Conversa self-scheduling — render even with no lesson history */}
        <div style={{ marginTop: 28 }}>
          <Curriculum />
          <LessonBooking />
        </div>
      </div>
    )
  }

  return (
    <div style={container} id="page-calendar">
      {/* Hero */}
      <Glass padding={isMobile ? 22 : 30} style={{
        marginBottom: 22,
        borderRadius: 28,
        background: `${G.brandSoft}, ${T.bg1}`,
        borderColor: 'rgba(217,70,239,0.24)',
        overflow: 'hidden',
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : 'minmax(0,1.25fr) minmax(280px,0.75fr)',
          gap: isMobile ? 20 : 26,
          alignItems: 'end',
        }}>
          <div>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '7px 10px',
              borderRadius: 999,
              background: T.surfaceLo,
              border: `1px solid ${T.borderHi}`,
              fontSize: 13,
              fontWeight: 800,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: T.brandInk || T.brand,
              marginBottom: 13,
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 15 }}>calendar_month</span>
              {t('calendar.hero.kicker')}
            </div>
            <h1 style={{
              fontFamily: FONT.display,
              fontWeight: 750,
              fontSize: isMobile ? 32 : 50,
              lineHeight: 1,
              letterSpacing: '-0.045em',
              margin: 0,
              color: T.text,
              maxWidth: 780,
            }}>
              {t('calendar.hero.title')}
            </h1>
            <p style={{
              marginTop: 14,
              fontSize: 15,
              color: T.textSoft,
              maxWidth: 660,
              lineHeight: 1.55,
            }}>
              {t('calendar.hero.body')}
            </p>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 10,
          }}>
            {[
              { n: pastCount, label: t('calendar.stat.past'), icon: 'history' },
              { n: upcomingCount, label: t('calendar.stat.upcoming'), icon: 'event_upcoming' },
            ].map(item => (
              <div key={item.label} style={{
                borderRadius: 22,
                background: T.surfaceLo,
                border: `1px solid ${T.borderHi}`,
                padding: 15,
                minHeight: 102,
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: 22, color: T.brandInk || T.brand }}>{item.icon}</span>
                <div style={{
                  marginTop: 10,
                  fontFamily: FONT.mono,
                  fontSize: 24,
                  fontWeight: 900,
                  color: T.text,
                  lineHeight: 1,
                }}>
                  {item.n}
                </div>
                <div style={{ marginTop: 6, color: T.textSoft, fontSize: 13, fontWeight: 650 }}>
                  {item.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Glass>

      {/* Curriculum roadmap (30-lesson plan) — hides itself when unseeded */}
      <Curriculum />

      {/* Lesson booking — Conversa self-scheduling (hides itself for
          students whose organization has no availability configured) */}
      <LessonBooking />

      {/* Upcoming strip */}
      {upcoming.length > 0 && (
        <>
          <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.14em',
            textTransform: 'uppercase', color: T.textDim, marginBottom: 14 }}>
            {t('calendar.upcoming.heading', { n: upcoming.length })}
          </div>
          <div {...upcomingReveal.container} style={{ display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, 1fr)',
            gap: 14, marginBottom: 36 }}>
            {upcoming.map((item, i) => (
              <div key={item._id} {...upcomingReveal.item(i)}>
                <UpcomingCard item={item} slug={slug}
                  earliestDate={earliestDate} now={now}/>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Month grid */}
      <MonthGrid cursor={cursor} setCursor={setCursor}
        lessonItems={lessonItems} slug={slug} earliestDate={earliestDate}
        todayStr={todayStr}/>

      {/* Legend */}
      <div style={{ marginTop: 16, display: 'flex', gap: 18,
        fontSize: 13, flexWrap: 'wrap', fontFamily: FONT.mono }}>
        <LegendDot color="rgba(255,255,255,0.25)" label={t('calendar.legend.past')}/>
        <LegendDot color={T.violet} label={t('calendar.legend.upcoming')}/>
        <LegendDot color={T.emerald} label={t('calendar.legend.live')} pulse/>
      </div>
    </div>
  )
}
