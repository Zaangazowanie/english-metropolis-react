// LessonBooking — Conversa student self-scheduling (built 2026-06-02).
//
// Self-contained section rendered inside the v3 Calendar:
//   1. "Next lesson" reminder banner (in-app reminder system)
//   2. 24-hour cancellation policy notice (always visible)
//   3. Upcoming bookings with cancel flow (late-cancel = billed warning)
//   4. Open slots (teacher availability minus existing bookings) to book
//
// Hides itself entirely when: the student session has no _id/organizationId
// (legacy slug-only sessions) or the organization has no availability
// configured (non-Conversa students).

import { useEffect, useState, useCallback } from 'react'
import { FONT } from '../../design/v3/tokens.js'
import { useV3Theme } from '../../design/v3/ThemeProvider.jsx'
import { Glass, Btn, Pill } from '../../design/v3/primitives.jsx'
import { useStudentAuth, getStudentSessionToken } from '../../contexts/StudentAuthContext.jsx'
import { useI18n } from '../../i18n'
import { CONVEX_URL } from '../../data/studentConfig.js'

const DAY_MS = 24 * 60 * 60 * 1000

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

export default function LessonBooking() {
  const { T, isMobile } = useV3Theme()
  const { t } = useI18n()
  const { studentUser } = useStudentAuth()

  const studentId = studentUser?._id
  const organizationId = studentUser?.organizationId

  const [state, setState] = useState({ loading: true, bookings: [], slots: [], unavailable: false })
  const [pendingBook, setPendingBook] = useState(null)     // slot awaiting confirmation
  const [pendingCancel, setPendingCancel] = useState(null) // booking awaiting confirmation
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState(null)               // { kind: 'ok'|'warn'|'err', text }

  // ── date label helpers (reuse the app's month/weekday i18n keys) ──
  const dayLabel = useCallback((dateWarsaw) => {
    const [y, m, d] = dateWarsaw.split('-').map(Number)
    const dow = new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay()      // 0=Sun
    // weekday.short.* is Sunday-first indexed (0=Su … 6=Sa), same as getUTCDay()
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
      const [bookings, slots] = await Promise.all([
        convexCall('query', 'scheduling:listBookings', { organizationId, studentId }),
        convexCall('query', 'scheduling:getOpenSlots', { organizationId, fromDate: from, toDate: to }),
      ])
      // org without availability configured → hide the whole section
      const unavailable = !slots.length && !bookings.length
      setState({ loading: false, bookings, slots, unavailable })
    } catch {
      setState({ loading: false, bookings: [], slots: [], unavailable: true })
    }
  }, [studentId, organizationId])

  useEffect(() => { refresh() }, [refresh])

  if (state.loading || state.unavailable) return null

  const nowMs = Date.now()
  const upcoming = state.bookings
    .filter(b => b.status === 'scheduled' && b.startUtc > nowMs)
    .sort((a, b) => a.startUtc - b.startUtc)
  const nextLesson = upcoming[0] || null

  // group open slots by date, show first 3 dates expanded
  const slotsByDate = {}
  for (const s of state.slots) {
    if (!slotsByDate[s.dateWarsaw]) slotsByDate[s.dateWarsaw] = []
    slotsByDate[s.dateWarsaw].push(s)
  }
  const slotDates = Object.keys(slotsByDate).sort()

  // ── actions ──
  const doBook = async () => {
    if (!pendingBook || busy) return
    setBusy(true)
    setNotice(null)
    try {
      await convexCall('mutation', 'scheduling:bookLesson', {
        sessionToken: getStudentSessionToken() || undefined,
        organizationId,
        studentId,
        startUtc: pendingBook.startUtc,
        bookedBy: 'student',
        bookedByName: studentUser?.name,
      })
      setNotice({ kind: 'ok', text: t('booking.booked') })
      setPendingBook(null)
      await refresh()
    } catch {
      setNotice({ kind: 'err', text: t('booking.error') })
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

  const cancelIsLate = pendingCancel && (pendingCancel.startUtc - nowMs < DAY_MS)

  // ── styles ──
  const sectionLabel = {
    fontSize: 11, fontWeight: 700, letterSpacing: '0.28em',
    textTransform: 'uppercase', color: T.brandInk || T.brand, marginBottom: 10,
  }
  const heading = {
    fontFamily: FONT.display, fontWeight: 600, fontSize: isMobile ? 24 : 32,
    lineHeight: 1.05, letterSpacing: '-0.02em', margin: 0, color: T.text,
  }
  const policyBox = {
    marginTop: 16, padding: '12px 16px', borderRadius: 14,
    background: 'rgba(252,211,77,0.08)', border: `1px solid rgba(252,211,77,0.35)`,
    color: T.amber, fontSize: 13, lineHeight: 1.5, display: 'flex', gap: 10, alignItems: 'flex-start',
  }

  return (
    <div id="lesson-booking" style={{ marginBottom: 28 }}>
      {/* 1 ── Next-lesson reminder banner */}
      {nextLesson && (
        <Glass padding={isMobile ? 18 : 24} style={{
          marginBottom: 16,
          background: 'rgba(52,211,153,0.06)',
          borderColor: 'rgba(52,211,153,0.3)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 28, color: T.emerald }}>event_available</span>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: T.emerald }}>
                {t('booking.nextLesson')}
              </div>
              <div style={{ fontFamily: FONT.display, fontSize: isMobile ? 20 : 26, color: T.text, marginTop: 2 }}>
                {dayLabel(nextLesson.dateWarsaw)} · {nextLesson.timeWarsaw}
              </div>
            </div>
            <Btn variant="danger" size="sm" icon="event_busy" onClick={() => { setPendingCancel(nextLesson); setPendingBook(null) }}>
              {t('booking.cancel')}
            </Btn>
          </div>
        </Glass>
      )}

      {/* 2 ── Booking panel */}
      <Glass padding={isMobile ? 20 : 30}>
        <div style={sectionLabel}>{t('booking.kicker')}</div>
        <h2 style={heading}>{t('booking.title')}</h2>

        {/* 24h policy — always visible */}
        <div style={policyBox}>
          <span className="material-symbols-outlined" style={{ fontSize: 20, flexShrink: 0 }}>warning</span>
          <span>{t('booking.policy')}</span>
        </div>

        {/* status notice */}
        {notice && (
          <div style={{
            marginTop: 14, padding: '10px 16px', borderRadius: 12, fontSize: 13, fontWeight: 600,
            background: notice.kind === 'ok' ? 'rgba(52,211,153,0.1)' : notice.kind === 'warn' ? 'rgba(252,211,77,0.1)' : 'rgba(251,113,133,0.1)',
            border: `1px solid ${notice.kind === 'ok' ? 'rgba(52,211,153,0.4)' : notice.kind === 'warn' ? 'rgba(252,211,77,0.4)' : 'rgba(251,113,133,0.4)'}`,
            color: notice.kind === 'ok' ? T.emerald : notice.kind === 'warn' ? T.amber : T.rose,
          }}>
            {notice.text}
          </div>
        )}

        {/* upcoming bookings (beyond the banner one) */}
        {upcoming.length > 0 && (
          <div style={{ marginTop: 22 }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: T.textDim, marginBottom: 10 }}>
              {t('booking.upcoming')}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {upcoming.map(b => (
                <div key={b._id} style={{
                  display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                  padding: '12px 16px', borderRadius: 14,
                  background: T.surface, border: `1px solid ${T.border}`,
                }}>
                  <Pill tone="emerald" icon="event">{b.timeWarsaw}</Pill>
                  <span style={{ flex: 1, color: T.text, fontSize: 14, minWidth: 140 }}>{dayLabel(b.dateWarsaw)}</span>
                  <Btn variant="ghost" size="sm" icon="event_busy"
                    onClick={() => { setPendingCancel(b); setPendingBook(null) }}>
                    {t('booking.cancel')}
                  </Btn>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* open slots */}
        <div style={{ marginTop: 22 }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: T.textDim, marginBottom: 10 }}>
            {t('booking.openSlots')}
          </div>
          {slotDates.length === 0 && (
            <div style={{ color: T.textDim, fontSize: 14 }}>{t('booking.noSlots')}</div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {slotDates.map(date => (
              <div key={date}>
                <div style={{ fontSize: 13, color: T.textSoft, fontWeight: 600, marginBottom: 8 }}>
                  {dayLabel(date)}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {slotsByDate[date].map(slot => (
                    <Btn key={slot.startUtc} variant="secondary" size="sm" icon="add"
                      onClick={() => { setPendingBook(slot); setPendingCancel(null); setNotice(null) }}>
                      {slot.timeWarsaw}
                    </Btn>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── confirm booking panel ── */}
        {pendingBook && (
          <div style={{
            marginTop: 20, padding: isMobile ? 16 : 22, borderRadius: 16,
            background: 'rgba(217,70,239,0.06)', border: '1px solid rgba(217,70,239,0.35)',
          }}>
            <div style={{ fontFamily: FONT.display, fontSize: 20, color: T.text }}>
              {t('booking.confirmBookTitle')}
            </div>
            <p style={{ margin: '10px 0 4px', color: T.textSoft, fontSize: 14, lineHeight: 1.5 }}>
              {t('booking.confirmBookBody', { date: dayLabel(pendingBook.dateWarsaw), time: pendingBook.timeWarsaw })}
            </p>
            <p style={{ margin: '4px 0 16px', color: T.amber, fontSize: 13, lineHeight: 1.5 }}>
              {t('booking.policy')}
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Btn variant="primary" size="md" icon="check" onClick={doBook} disabled={busy}>
                {busy ? '…' : t('booking.confirmBookBtn')}
              </Btn>
              <Btn variant="ghost" size="md" onClick={() => setPendingBook(null)} disabled={busy}>
                {t('booking.back')}
              </Btn>
            </div>
          </div>
        )}

        {/* ── confirm cancellation panel ── */}
        {pendingCancel && (
          <div style={{
            marginTop: 20, padding: isMobile ? 16 : 22, borderRadius: 16,
            background: cancelIsLate ? 'rgba(251,113,133,0.08)' : T.surface,
            border: `1px solid ${cancelIsLate ? 'rgba(251,113,133,0.45)' : T.borderHi}`,
          }}>
            <div style={{ fontFamily: FONT.display, fontSize: 20, color: T.text }}>
              {t('booking.confirmCancelTitle')}
            </div>
            <p style={{ margin: '10px 0 4px', color: T.textSoft, fontSize: 14, lineHeight: 1.5 }}>
              {dayLabel(pendingCancel.dateWarsaw)} · {pendingCancel.timeWarsaw}
            </p>
            <p style={{
              margin: '8px 0 16px', fontSize: 13, lineHeight: 1.55, fontWeight: 600,
              color: cancelIsLate ? T.rose : T.emerald,
            }}>
              {cancelIsLate ? t('booking.lateWarning') : t('booking.safeCancel')}
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Btn variant="danger" size="md" icon="event_busy" onClick={doCancel} disabled={busy}>
                {busy ? '…' : t('booking.confirmCancelBtn')}
              </Btn>
              <Btn variant="secondary" size="md" onClick={() => setPendingCancel(null)} disabled={busy}>
                {t('booking.keep')}
              </Btn>
            </div>
          </div>
        )}
      </Glass>
    </div>
  )
}
