// LessonBooking - Conversa student self-scheduling.
//
// Self-contained section rendered inside the v3 Calendar:
//   1. next lesson reminder
//   2. cancellation policy
//   3. upcoming bookings with cancel flow
//   4. open slots grouped into modern day cards

import { useEffect, useState, useCallback, useMemo } from 'react'
import { FONT, G } from '../../design/v3/tokens.js'
import { useV3Theme } from '../../design/v3/ThemeProvider.jsx'
import { Glass, Btn, Pill } from '../../design/v3/primitives.jsx'
import { useStudentAuth, getStudentSessionToken } from '../../contexts/StudentAuthContext.jsx'
import { useI18n } from '../../i18n'
import { CONVEX_URL } from '../../data/studentConfig.js'

const DAY_MS = 24 * 60 * 60 * 1000
const CANCELLATION_WINDOW_MS = 12 * 60 * 60 * 1000

async function convexCall(kind, path, args) {
  const res = await fetch(`${CONVEX_URL}/api/${kind}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, args }),
  })
  if (!res.ok) throw new Error(`${path} failed with ${res.status}`)
  const payload = await res.json()
  if (payload?.status !== 'success') {
    throw new Error(payload?.errorMessage || `${path} returned ${payload?.status}`)
  }
  return payload.value
}

function timeToMinutes(time) {
  const [h, m] = String(time || '00:00').split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

function dateParts(dateWarsaw) {
  const [y, m, d] = String(dateWarsaw || '').split('-').map(Number)
  const dow = new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay()
  return { y, m, d, dow }
}

function Notice({ notice, T }) {
  if (!notice) return null
  const tone = notice.kind === 'ok'
    ? { bg: 'rgba(52,211,153,0.10)', border: 'rgba(52,211,153,0.38)', color: T.emerald, icon: 'check_circle' }
    : notice.kind === 'warn'
      ? { bg: 'rgba(252,211,77,0.10)', border: 'rgba(252,211,77,0.40)', color: T.amber, icon: 'warning' }
      : { bg: 'rgba(251,113,133,0.10)', border: 'rgba(251,113,133,0.38)', color: T.rose, icon: 'error' }
  return (
    <div style={{
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
    }}>
      <span className="material-symbols-outlined" style={{ fontSize: 19 }}>{tone.icon}</span>
      <span>{notice.text}</span>
    </div>
  )
}

function EmptySlots({ T, t }) {
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
        <div style={{ color: T.text, fontWeight: 700, marginBottom: 4 }}>{t('booking.noSlots')}</div>
        <div style={{ fontSize: 13, lineHeight: 1.5 }}>New availability will appear here as soon as it is opened.</div>
      </div>
    </div>
  )
}

function SlotDayCard({ date, slots, dayLabel, selectedStartUtc, onPick, T, isMobile }) {
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
            <div style={{
              fontSize: 14,
              fontWeight: 800,
              color: T.text,
              letterSpacing: '-0.01em',
            }}>
              {dayLabel(date)}
            </div>
            <div style={{
              marginTop: 5,
              fontFamily: FONT.mono,
              fontSize: 11,
              color: T.textDim,
            }}>
              {first}{last && last !== first ? ` to ${last}` : ''}
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
            const active = String(selectedStartUtc || '') === String(slot.startUtc)
            return (
              <button
                key={slot.startUtc}
                type="button"
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

export default function LessonBooking() {
  const { T, isMobile } = useV3Theme()
  const { t } = useI18n()
  const { studentUser } = useStudentAuth()

  const studentId = studentUser?._id
  const organizationId = studentUser?.organizationId
  const teacherId = studentUser?.primaryTeacherId || undefined

  const [state, setState] = useState({ loading: true, bookings: [], slots: [], unavailable: false })
  const [alloc, setAlloc] = useState(null)
  const [pendingBook, setPendingBook] = useState(null)
  const [pendingCancel, setPendingCancel] = useState(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState(null)

  const dayLabel = useCallback((dateWarsaw) => {
    const { m, d, dow } = dateParts(dateWarsaw)
    return `${t(`weekday.short.${dow}`)} ${d} ${t(`month.${m}`)}`
  }, [t])

  const refresh = useCallback(async () => {
    if (!studentId || !organizationId) {
      setState({ loading: false, bookings: [], slots: [], unavailable: true })
      return
    }
    try {
      const now = new Date()
      const from = now.toISOString().slice(0, 10)
      const to = new Date(now.getTime() + 28 * DAY_MS).toISOString().slice(0, 10)
      const slotArgs = { organizationId, fromDate: from, toDate: to }
      if (teacherId) slotArgs.teacherId = teacherId
      const [bookings, slots, allocation] = await Promise.all([
        convexCall('query', 'scheduling:listBookings', { organizationId, studentId }),
        convexCall('query', 'scheduling:getOpenSlots', slotArgs),
        convexCall('query', 'orders:getStudentAllocation', { studentId }),
      ])
      setAlloc(allocation)
      const unavailable = !slots.length && !bookings.length
      setState({ loading: false, bookings, slots, unavailable })
    } catch {
      setAlloc(null)
      setState({ loading: false, bookings: [], slots: [], unavailable: true })
    }
  }, [studentId, organizationId, teacherId])

  useEffect(() => { refresh() }, [refresh])

  const nowMs = Date.now()
  const upcoming = useMemo(() => (state.bookings || [])
    .filter(b => b.status === 'scheduled' && b.startUtc > nowMs)
    .sort((a, b) => a.startUtc - b.startUtc), [state.bookings, nowMs])
  const nextLesson = upcoming[0] || null

  const { slotDates, slotsByDate, firstSlot, totalSlots } = useMemo(() => {
    const byDate = {}
    for (const s of state.slots || []) {
      if (!byDate[s.dateWarsaw]) byDate[s.dateWarsaw] = []
      byDate[s.dateWarsaw].push(s)
    }
    for (const date of Object.keys(byDate)) byDate[date].sort((a, b) => timeToMinutes(a.timeWarsaw) - timeToMinutes(b.timeWarsaw))
    const dates = Object.keys(byDate).sort()
    return {
      slotDates: dates,
      slotsByDate: byDate,
      firstSlot: dates.length ? byDate[dates[0]][0] : null,
      totalSlots: (state.slots || []).length,
    }
  }, [state.slots])

  const doBook = async () => {
    if (!pendingBook || busy) return
    setBusy(true)
    setNotice(null)
    try {
      await convexCall('mutation', 'scheduling:bookLesson', {
        sessionToken: getStudentSessionToken() || undefined,
        organizationId,
        studentId,
        teacherId,
        startUtc: pendingBook.startUtc,
        bookedBy: 'student',
        bookedByName: studentUser?.name,
      })
      setNotice({ kind: 'ok', text: t('booking.booked') })
      setPendingBook(null)
      await refresh()
    } catch (e) {
      const msg = String(e?.message || '')
      setNotice({ kind: 'err', text: /No lessons remaining/i.test(msg) ? t('booking.noAllocation') : t('booking.error') })
    } finally {
      setBusy(false)
    }
  }

  const doCancel = async () => {
    if (!pendingCancel || busy) return
    setBusy(true)
    setNotice(null)
    try {
      const result = await convexCall('mutation', 'scheduling:cancelBooking', {
        sessionToken: getStudentSessionToken() || undefined,
        bookingId: pendingCancel._id,
        cancelledBy: 'student',
        cancelledByName: studentUser?.name,
      })
      setNotice(result.billable
        ? { kind: 'warn', text: t('booking.cancelledLate') }
        : { kind: 'ok', text: t('booking.cancelled') })
      setPendingCancel(null)
      await refresh()
    } catch {
      setNotice({ kind: 'err', text: t('booking.error') })
    } finally {
      setBusy(false)
    }
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

  if (state.unavailable && !pendingActivation) return null

  if (pendingActivation) {
    const availableDate = new Intl.DateTimeFormat(undefined, {
      dateStyle: 'long',
      timeStyle: 'short',
      timeZone: 'Europe/Warsaw',
    }).format(new Date(alloc.pendingUntil))
    return (
      <div id="lesson-booking" style={{ marginBottom: 32 }}>
        <Glass padding={isMobile ? 18 : 26} style={{ borderRadius: 28 }}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 28, color: T.brand }}>hourglass_top</span>
            <div>
              <h2 style={{ margin: 0, fontFamily: FONT.display, color: T.text, fontSize: 24 }}>
                {t('booking.pendingActivationTitle')}
              </h2>
              <p style={{ margin: '8px 0 0', color: T.textSoft, fontSize: 14, lineHeight: 1.6 }}>
                {t('booking.pendingActivationBody', { date: availableDate })}
              </p>
            </div>
          </div>
        </Glass>
      </div>
    )
  }

  const cancelIsLate = pendingCancel && (pendingCancel.startUtc - nowMs < CANCELLATION_WINDOW_MS)
  const panelGrid = isMobile ? '1fr' : 'minmax(0, 1.15fr) minmax(280px, 0.85fr)'

  return (
    <div id="lesson-booking" style={{ marginBottom: 32 }}>
      <Glass padding={isMobile ? 18 : 26} style={{
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 28,
      }}>
        <div aria-hidden style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background: 'radial-gradient(circle at 92% 8%, rgba(217,70,239,0.12), transparent 34%), radial-gradient(circle at 8% 100%, rgba(139,92,246,0.10), transparent 36%)',
        }}/>

        <div style={{ position: 'relative' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: panelGrid,
            gap: isMobile ? 18 : 24,
            alignItems: 'start',
          }}>
            <div>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '7px 10px',
                borderRadius: 999,
                background: 'rgba(217,70,239,0.10)',
                border: '1px solid rgba(217,70,239,0.22)',
                color: T.brandInk || T.brand,
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: 15 }}>calendar_add_on</span>
                {t('booking.kicker')}
              </div>
              <h2 style={{
                margin: '14px 0 0',
                fontFamily: FONT.display,
                fontWeight: 700,
                fontSize: isMobile ? 28 : 40,
                lineHeight: 1,
                letterSpacing: '-0.035em',
                color: T.text,
              }}>
                {t('booking.title')}
              </h2>
              <p style={{
                margin: '12px 0 0',
                maxWidth: 650,
                color: T.textDim,
                fontSize: 14,
                lineHeight: 1.6,
              }}>
                Pick a Warsaw time that fits your week. Confirmation happens before anything is booked.
              </p>
              {alloc && (
                <div style={{ marginTop: 12, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px',
                    borderRadius: 999, fontSize: 12, fontWeight: 700,
                    background: alloc.remaining > 0 ? 'rgba(52,211,153,0.12)' : 'rgba(252,211,77,0.12)',
                    color: alloc.remaining > 0 ? T.emerald : T.amber,
                    border: `1px solid ${alloc.remaining > 0 ? 'rgba(52,211,153,0.3)' : 'rgba(252,211,77,0.35)'}` }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>token</span>
                    {t('booking.lessonsLeft', { n: alloc.remaining })}
                  </span>
                  {alloc.remaining <= 0 && studentUser?.slug && (
                    <a href={`/app/${studentUser.slug}/buy`} style={{ display: 'inline-flex', alignItems: 'center',
                      gap: 6, padding: '7px 14px', borderRadius: 999, textDecoration: 'none',
                      background: 'linear-gradient(135deg, #8B5CF6, #D946EF)', color: '#fff',
                      fontSize: 12, fontWeight: 700, letterSpacing: '0.06em' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 15 }}>shopping_cart</span>
                      {t('booking.buyCta')}
                    </a>
                  )}
                </div>
              )}
            </div>

            <div style={{
              borderRadius: 24,
              background: T.surface,
              border: `1px solid ${T.border}`,
              padding: 16,
              display: 'grid',
              gap: 12,
            }}>
              {nextLesson ? (
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <div style={{
                    width: 44,
                    height: 44,
                    borderRadius: 16,
                    display: 'grid',
                    placeItems: 'center',
                    background: 'rgba(52,211,153,0.12)',
                    color: T.emerald,
                    border: '1px solid rgba(52,211,153,0.30)',
                    flexShrink: 0,
                  }}>
                    <span className="material-symbols-outlined">event_available</span>
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: T.emerald }}>
                      {t('booking.nextLesson')}
                    </div>
                    <div style={{ marginTop: 3, color: T.text, fontSize: 18, fontWeight: 750 }}>
                      {dayLabel(nextLesson.dateWarsaw)} at {nextLesson.timeWarsaw}
                    </div>
                  </div>
                  <Btn variant="danger" size="sm" icon="event_busy" onClick={() => { setPendingCancel(nextLesson); setPendingBook(null) }}>
                    {t('booking.cancel')}
                  </Btn>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <div style={{
                    width: 44,
                    height: 44,
                    borderRadius: 16,
                    display: 'grid',
                    placeItems: 'center',
                    background: 'rgba(217,70,239,0.12)',
                    color: T.brandInk || T.brand,
                    border: '1px solid rgba(217,70,239,0.28)',
                    flexShrink: 0,
                  }}>
                    <span className="material-symbols-outlined">event_upcoming</span>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: T.textDim }}>
                      Next available
                    </div>
                    <div style={{ marginTop: 3, color: T.text, fontSize: 18, fontWeight: 750 }}>
                      {firstSlot ? `${dayLabel(firstSlot.dateWarsaw)} at ${firstSlot.timeWarsaw}` : 'No open slot'}
                    </div>
                  </div>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 10 }}>
                  <div style={{ fontFamily: FONT.mono, color: T.text, fontSize: 18, fontWeight: 800 }}>{totalSlots}</div>
                  <div style={{ color: T.textDim, fontSize: 12 }}>open times</div>
                </div>
                <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 10 }}>
                  <div style={{ fontFamily: FONT.mono, color: T.text, fontSize: 18, fontWeight: 800 }}>{slotDates.length}</div>
                  <div style={{ color: T.textDim, fontSize: 12 }}>available days</div>
                </div>
              </div>
            </div>
          </div>

          <div style={{
            marginTop: 18,
            padding: '12px 14px',
            borderRadius: 18,
            background: 'rgba(252,211,77,0.08)',
            border: '1px solid rgba(252,211,77,0.34)',
            color: T.amber,
            fontSize: 13,
            lineHeight: 1.5,
            display: 'flex',
            gap: 10,
            alignItems: 'flex-start',
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20, flexShrink: 0 }}>warning</span>
            <span>{t('booking.policy')}</span>
          </div>

          <Notice notice={notice} T={T} />

          {upcoming.length > 1 && (
            <div style={{ marginTop: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: T.textDim, marginBottom: 10 }}>
                {t('booking.upcoming')}
              </div>
              <div style={{ display: 'grid', gap: 10 }}>
                {upcoming.slice(1).map(b => (
                  <div key={b._id} style={{
                    display: 'grid',
                    gridTemplateColumns: isMobile ? '1fr' : 'auto minmax(0, 1fr) auto',
                    alignItems: 'center',
                    gap: 12,
                    padding: 14,
                    borderRadius: 18,
                    background: T.surface,
                    border: `1px solid ${T.border}`,
                  }}>
                    <Pill tone="emerald" icon="event">{b.timeWarsaw}</Pill>
                    <span style={{ color: T.text, fontSize: 14, fontWeight: 650 }}>{dayLabel(b.dateWarsaw)}</span>
                    <Btn variant="ghost" size="sm" icon="event_busy" onClick={() => { setPendingCancel(b); setPendingBook(null) }}>
                      {t('booking.cancel')}
                    </Btn>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ marginTop: 24 }}>
            <div style={{
              display: 'flex',
              alignItems: 'end',
              justifyContent: 'space-between',
              gap: 14,
              marginBottom: 12,
              flexWrap: 'wrap',
            }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: T.textDim }}>
                  {t('booking.openSlots')}
                </div>
                <div style={{ marginTop: 4, color: T.textSoft, fontSize: 13 }}>
                  Times are shown in Warsaw CEST.
                </div>
              </div>
              {pendingBook && (
                <Pill tone="solid" icon="check">Selected {pendingBook.timeWarsaw}</Pill>
              )}
            </div>

            {slotDates.length === 0 ? (
              <EmptySlots T={T} t={t} />
            ) : (
              <div style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0, 1fr))',
                gap: 12,
              }}>
                {slotDates.map(date => (
                  <SlotDayCard
                    key={date}
                    date={date}
                    slots={slotsByDate[date]}
                    dayLabel={dayLabel}
                    selectedStartUtc={pendingBook?.startUtc}
                    onPick={slot => { setPendingBook(slot); setPendingCancel(null); setNotice(null) }}
                    T={T}
                    isMobile={isMobile}
                  />
                ))}
              </div>
            )}
          </div>

          {pendingBook && (
            <div style={{
              marginTop: 20,
              padding: isMobile ? 16 : 20,
              borderRadius: 22,
              background: 'rgba(217,70,239,0.08)',
              border: '1px solid rgba(217,70,239,0.32)',
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1fr) auto',
              gap: 16,
              alignItems: 'center',
            }}>
              <div>
                <div style={{ fontFamily: FONT.display, fontSize: 21, fontWeight: 700, color: T.text }}>
                  {t('booking.confirmBookTitle')}
                </div>
                <p style={{ margin: '8px 0 0', color: T.textSoft, fontSize: 14, lineHeight: 1.5 }}>
                  {t('booking.confirmBookBody', { date: dayLabel(pendingBook.dateWarsaw), time: pendingBook.timeWarsaw })}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: isMobile ? 'flex-start' : 'flex-end' }}>
                <Btn variant="primary" size="md" icon="check" onClick={doBook} disabled={busy}>
                  {busy ? '...' : t('booking.confirmBookBtn')}
                </Btn>
                <Btn variant="ghost" size="md" onClick={() => setPendingBook(null)} disabled={busy}>
                  {t('booking.back')}
                </Btn>
              </div>
            </div>
          )}

          {pendingCancel && (
            <div style={{
              marginTop: 20,
              padding: isMobile ? 16 : 20,
              borderRadius: 22,
              background: cancelIsLate ? 'rgba(251,113,133,0.08)' : T.surface,
              border: `1px solid ${cancelIsLate ? 'rgba(251,113,133,0.44)' : T.borderHi}`,
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1fr) auto',
              gap: 16,
              alignItems: 'center',
            }}>
              <div>
                <div style={{ fontFamily: FONT.display, fontSize: 21, fontWeight: 700, color: T.text }}>
                  {t('booking.confirmCancelTitle')}
                </div>
                <p style={{ margin: '8px 0 0', color: T.textSoft, fontSize: 14, lineHeight: 1.5 }}>
                  {dayLabel(pendingCancel.dateWarsaw)} at {pendingCancel.timeWarsaw}
                </p>
                <p style={{
                  margin: '8px 0 0',
                  fontSize: 13,
                  lineHeight: 1.55,
                  fontWeight: 650,
                  color: cancelIsLate ? T.rose : T.emerald,
                }}>
                  {cancelIsLate ? t('booking.lateWarning') : t('booking.safeCancel')}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: isMobile ? 'flex-start' : 'flex-end' }}>
                <Btn variant="danger" size="md" icon="event_busy" onClick={doCancel} disabled={busy}>
                  {busy ? '...' : t('booking.confirmCancelBtn')}
                </Btn>
                <Btn variant="secondary" size="md" onClick={() => setPendingCancel(null)} disabled={busy}>
                  {t('booking.keep')}
                </Btn>
              </div>
            </div>
          )}
        </div>
      </Glass>
    </div>
  )
}
