import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { mutateAdminConvex, queryAdminConvex } from '../../../contexts/AdminAuthContext.jsx'
import { ConsoleEmpty, ConsoleSkeleton } from './ConsoleStates.jsx'

const ROOT = '/admin/superadmin'

function displayDate(ms) {
  if (!ms) return 'Not recorded'
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(ms))
}

function Delivery({ status, attempts }) {
  const tone = status === 'failed' || status === 'partial' ? 'is-bad' : status === 'sent' ? 'is-good' : 'is-neutral'
  const label = status === 'failed' ? 'Failed' : status === 'partial' ? 'Partly sent' : status === 'sent' ? 'Sent' : status === 'pending' ? 'Pending' : 'Legacy, not tracked'
  return <span className={`ops-status ${tone}`}>{label}{attempts ? ` · ${attempts} attempt${attempts === 1 ? '' : 's'}` : ''}</span>
}

export default function ConsoleBookingOperations() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(null)
  const [tab, setTab] = useState('attention')
  const [q, setQ] = useState('')

  const load = useCallback(async () => {
    try {
      setData(await queryAdminConvex('operations:getCommandCenter', {}))
      setError('')
    } catch (e) {
      setError(String(e?.message || e))
    }
  }, [])

  useEffect(() => { load() }, [load])

  const needle = q.trim().toLowerCase()
  const buyers = useMemo(() => (data?.recentPurchases || []).filter(row =>
    !needle || `${row.studentName} ${row.studentEmail} ${row.name}`.toLowerCase().includes(needle)), [data, needle])
  const upcoming = useMemo(() => (data?.upcomingBookings || []).filter(row =>
    !needle || `${row.studentName} ${row.studentEmail} ${row.organizationName}`.toLowerCase().includes(needle)), [data, needle])
  const bookingAlerts = useMemo(() => (data?.actionItems || []).filter(row =>
    ['paid_no_booking', 'booking_missing_meet', 'booking_notification_failed',
      'booking_cancellation_notification_failed', 'order_notification_failed',
      'order_package_missing', 'booking_stale_scheduled'].includes(row.kind)), [data])

  async function act(alert, action) {
    setBusy(alert._id)
    try {
      if (action === 'retry') {
        if (alert.kind === 'order_notification_failed') {
          await mutateAdminConvex('orders:retryOrderNotification', { orderId: alert.orderId })
        } else {
          await mutateAdminConvex('scheduling:retryBookingNotification', {
            bookingId: alert.bookingId,
            kind: alert.kind === 'booking_cancellation_notification_failed' ? 'cancellation' : undefined,
          })
        }
      } else {
        await mutateAdminConvex('operations:setAlertStatus', { alertId: alert._id, status: action })
      }
      await load()
    } catch (e) {
      setError(String(e?.message || e))
    } finally {
      setBusy(null)
    }
  }

  if (!data && !error) return <ConsoleSkeleton rows={9} label="Checking bookings" />

  return (
    <div className="sa-page">
      <header className="ops-page-header">
        <div>
          <p className="ops-eyebrow">Student operations</p>
          <h1>Bookings</h1>
          <p>Paid learners, first bookings, upcoming lessons, links and delivery receipts in one place.</p>
        </div>
        <div className="ops-header-actions">
          <Link className="sa-btn sa-btn-primary" to={`${ROOT}/academic/students`}>Schedule lessons</Link>
          <button type="button" className="sa-btn sa-btn-ghost" onClick={load}>
            <span className="material-symbols-outlined" aria-hidden="true">refresh</span>Refresh
          </button>
        </div>
      </header>

      {error && <div className="ops-banner ops-banner-bad" role="alert">{error}</div>}

      <section className="ops-stat-grid ops-stat-grid-3">
        <button type="button" className={`ops-stat ${tab === 'attention' ? 'is-selected' : ''}`} onClick={() => setTab('attention')}>
          <span className="ops-stat-label">Needs attention</span><strong>{bookingAlerts.length}</strong><span>workflow exceptions</span>
        </button>
        <button type="button" className={`ops-stat ${tab === 'buyers' ? 'is-selected' : ''}`} onClick={() => setTab('buyers')}>
          <span className="ops-stat-label">Recent buyers</span><strong>{data?.recentPurchases?.length || 0}</strong><span>{data?.stats?.paidNeverBooked || 0} never booked</span>
        </button>
        <button type="button" className={`ops-stat ${tab === 'schedule' ? 'is-selected' : ''}`} onClick={() => setTab('schedule')}>
          <span className="ops-stat-label">Upcoming</span><strong>{data?.stats?.upcomingBookings || 0}</strong><span>scheduled lessons</span>
        </button>
      </section>

      {tab !== 'attention' && (
        <div className="ops-filter-bar">
          <span className="material-symbols-outlined" aria-hidden="true">search</span>
          <input type="search" value={q} onChange={event => setQ(event.target.value)}
            placeholder="Search student, email or pack" aria-label="Search booking operations" />
        </div>
      )}

      {tab === 'attention' && (
        <section className="ops-section">
          <div className="ops-section-head"><div><h2>Action queue</h2><p>These remain open until the source record is repaired.</p></div></div>
          {bookingAlerts.length ? (
            <div className="ops-alert-list">
              {bookingAlerts.map(alert => (
                <article key={alert._id} className={`ops-alert ops-alert-${alert.severity}`}>
                  <div className="ops-alert-icon"><span className="material-symbols-outlined">{alert.kind === 'paid_no_booking' ? 'person_alert' : 'warning'}</span></div>
                  <div className="ops-alert-copy">
                    <div className="ops-alert-meta"><span className={`ops-priority ops-priority-${alert.severity}`}>{alert.severity}</span></div>
                    <h3>{alert.title}</h3><p>{alert.message}</p>
                    {alert.studentEmail && <p className="ops-alert-contact">{alert.studentEmail}</p>}
                  </div>
                  <div className="ops-alert-actions">
                    {alert.studentSlug && <Link className="sa-btn sa-btn-primary sa-btn-sm" to={`${ROOT}/school/preview?student=${encodeURIComponent(alert.studentSlug)}`}>Student view</Link>}
                    {['booking_notification_failed', 'booking_cancellation_notification_failed', 'order_notification_failed'].includes(alert.kind) && (
                      <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" disabled={busy === alert._id} onClick={() => act(alert, 'retry')}>Retry email</button>
                    )}
                    <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" disabled={busy === alert._id}
                      onClick={() => act(alert, alert.status === 'open' ? 'acknowledged' : 'open')}>
                      {alert.status === 'open' ? 'Mark seen' : 'Reopen'}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : <ConsoleEmpty icon="task_alt" title="Booking workflows are clear" hint="No paid learner, meeting-link or confirmation issue is open." />}
        </section>
      )}

      {tab === 'buyers' && (
        <section className="ops-section">
          <div className="ops-section-head"><div><h2>Pack buyers</h2><p>A payment is not complete operationally until the student can start.</p></div></div>
          <div className="ops-table-wrap">
            <table className="ops-table ops-table-roomy">
              <thead><tr><th>Student</th><th>Pack</th><th>Purchased</th><th>Booking state</th><th /></tr></thead>
              <tbody>{buyers.map(row => (
                <tr key={row._id}>
                  <td><strong>{row.studentName}</strong><small>{row.studentEmail || 'No personal email'}</small></td>
                  <td><strong>{row.totalLessons} lessons</strong><small>{row.name}</small></td>
                  <td>{displayDate(row.purchasedAt)}</td>
                  <td>{row.nextBooking
                    ? <span className="ops-status is-good">Next: {row.nextBooking.dateWarsaw} {row.nextBooking.timeWarsaw}</span>
                    : row.hasEverBooked ? <span className="ops-status is-neutral">No next lesson</span>
                      : <span className="ops-status is-bad">Never booked</span>}</td>
                  <td><Link className="sa-btn sa-btn-ghost sa-btn-sm" to={`${ROOT}/school/preview?student=${encodeURIComponent(row.studentSlug || '')}`}>Open</Link></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'schedule' && (
        <section className="ops-section">
          <div className="ops-section-head"><div><h2>Upcoming lessons</h2><p>Every new booking now records its confirmation delivery and retry count.</p></div></div>
          <div className="ops-table-wrap">
            <table className="ops-table ops-table-roomy">
              <thead><tr><th>When</th><th>Student</th><th>School</th><th>Series</th><th>Video</th><th>Confirmation</th></tr></thead>
              <tbody>{upcoming.map(row => (
                <tr key={row._id}>
                  <td><strong>{row.dateWarsaw}</strong><small>{row.timeWarsaw}</small></td>
                  <td><Link to={`${ROOT}/school/preview?student=${encodeURIComponent(row.studentSlug || '')}`}>{row.studentName}</Link><small>{row.studentEmail || 'No personal email'}</small></td>
                  <td>{row.organizationName}</td>
                  <td>{row.seriesId
                    ? <span className="ops-status is-neutral" title={`series ${row.seriesId}`}>{row.seriesKind === 'weekly' ? 'Weekly' : 'Together'}</span>
                    : <span className="ops-status is-neutral" style={{ opacity: 0.5 }}>Single</span>}</td>
                  <td>{/meet\.google\.com/.test(row.meetLink || '') ? <a href={row.meetLink} target="_blank" rel="noreferrer" className="ops-status is-good">Google Meet</a> : row.meetLink ? <a href={row.meetLink} target="_blank" rel="noreferrer" className="ops-status is-bad">Fallback room</a> : <span className="ops-status is-bad">Missing</span>}</td>
                  <td><Delivery status={row.notificationStatus} attempts={row.notificationAttempts} /></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
