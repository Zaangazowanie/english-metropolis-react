import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { mutateAdminConvex, queryAdminConvex } from '../../../contexts/AdminAuthContext.jsx'
import { ConsoleEmpty, ConsoleSkeleton } from './ConsoleStates.jsx'
import { consoleGet } from './consoleApi.js'

const ROOT = '/admin/superadmin'

function formatWhen(ms) {
  if (!ms) return 'Not recorded'
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  }).format(new Date(ms))
}

function ageLabel(ms) {
  if (!ms) return ''
  const hours = Math.max(0, Math.round((Date.now() - ms) / 36e5))
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

function AlertRow({ alert, onStatus, busy }) {
  const preview = alert.studentSlug
    ? `${ROOT}/school/preview?student=${encodeURIComponent(alert.studentSlug)}`
    : null
  const retryableDelivery = ['booking_notification_failed', 'booking_cancellation_notification_failed', 'order_notification_failed'].includes(alert.kind)
  return (
    <article className={`ops-alert ops-alert-${alert.severity}`}>
      <div className="ops-alert-icon" aria-hidden="true">
        <span className="material-symbols-outlined">
          {alert.kind === 'paid_no_booking' ? 'person_alert'
            : alert.kind === 'instalment_overdue' ? 'payments'
            : retryableDelivery ? 'mark_email_unread'
              : alert.kind === 'booking_missing_meet' ? 'videocam_off' : 'warning'}
        </span>
      </div>
      <div className="ops-alert-copy">
        <div className="ops-alert-meta">
          <span className={`ops-priority ops-priority-${alert.severity}`}>{alert.severity}</span>
          <span>{ageLabel(alert.firstSeenAt)}</span>
          {alert.status === 'acknowledged' && <span>Seen</span>}
        </div>
        <h3>{alert.title}</h3>
        <p>{alert.message}</p>
        {alert.studentEmail && <p className="ops-alert-contact">{alert.studentEmail}</p>}
      </div>
      <div className="ops-alert-actions">
        {preview && <Link className="sa-btn sa-btn-primary sa-btn-sm" to={preview}>Student view</Link>}
        {retryableDelivery && (alert.bookingId || alert.orderId) && (
          <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" disabled={busy}
            onClick={() => onStatus(alert, 'retry')}>Retry email</button>
        )}
        {alert.status === 'open' ? (
          <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" disabled={busy}
            onClick={() => onStatus(alert, 'acknowledged')}>Mark seen</button>
        ) : (
          <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" disabled={busy}
            onClick={() => onStatus(alert, 'open')}>Reopen</button>
        )}
      </div>
    </article>
  )
}

function HealthDot({ ok, label }) {
  return (
    <span className="ops-health-item">
      <span className={`ops-health-dot ${ok ? 'is-good' : 'is-bad'}`} aria-hidden="true" />
      {label}
    </span>
  )
}

export default function SuperadminDashboard() {
  const [data, setData] = useState(null)
  const [pipeline, setPipeline] = useState(null)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setRefreshing(true)
    const [opsResult, pipelineResult] = await Promise.allSettled([
      queryAdminConvex('operations:getCommandCenter', {}),
      consoleGet('/api/console/pipelines'),
    ])
    if (opsResult.status === 'fulfilled') {
      setData(opsResult.value)
      setError('')
    } else {
      setError(String(opsResult.reason?.message || opsResult.reason || 'Operations data is unavailable'))
    }
    setPipeline(pipelineResult.status === 'fulfilled' ? pipelineResult.value : null)
    setRefreshing(false)
  }, [])

  useEffect(() => {
    load()
    const timer = window.setInterval(() => load(true), 60000)
    return () => window.clearInterval(timer)
  }, [load])

  async function handleAlert(alert, action) {
    setBusyId(alert._id)
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
      await load(true)
    } catch (e) {
      setError(String(e?.message || e))
    } finally {
      setBusyId(null)
    }
  }

  if (!data && !error) return <ConsoleSkeleton rows={9} label="Checking operations" />

  const stats = data?.stats || {}
  const services = pipeline?.services || []
  const servicesDown = services.filter(service => service.status !== 'up')

  return (
    <div className="sa-page ops-home">
      <header className="ops-page-header">
        <div>
          <p className="ops-eyebrow">Command centre</p>
          <h1>Today</h1>
          <p>What needs attention across payments, bookings and lesson publishing.</p>
        </div>
        <div className="ops-header-actions">
          <span className="ops-updated">Updated {formatWhen(data?.generatedAt)}</span>
          <button type="button" className="sa-btn sa-btn-ghost" disabled={refreshing} onClick={() => load()}>
            <span className="material-symbols-outlined" aria-hidden="true">refresh</span>
            {refreshing ? 'Checking' : 'Refresh'}
          </button>
        </div>
      </header>

      {error && (
        <div className="ops-banner ops-banner-bad" role="alert">
          <span className="material-symbols-outlined" aria-hidden="true">error</span>
          <span>{error}</span>
        </div>
      )}

      <section className="ops-stat-grid" aria-label="Operations summary">
        <Link to={`${ROOT}/operations/bookings`} className="ops-stat ops-stat-attention">
          <span className="ops-stat-label">Needs attention</span>
          <strong>{stats.openAlerts ?? 0}</strong>
          <span>{stats.urgentAlerts ?? 0} high priority</span>
        </Link>
        <Link to={`${ROOT}/operations/bookings`} className="ops-stat">
          <span className="ops-stat-label">Paid, never booked</span>
          <strong>{stats.paidNeverBooked ?? 0}</strong>
          <span>buyers waiting to start</span>
        </Link>
        <Link to={`${ROOT}/operations/bookings`} className="ops-stat">
          <span className="ops-stat-label">Upcoming lessons</span>
          <strong>{stats.upcomingBookings ?? 0}</strong>
          <span>across all schools</span>
        </Link>
        <Link to={`${ROOT}/school/students`} className="ops-stat">
          <span className="ops-stat-label">Active students</span>
          <strong>{stats.activeStudents ?? 0}</strong>
          <span>live learner accounts</span>
        </Link>
      </section>

      <section className="ops-section">
        <div className="ops-section-head">
          <div>
            <h2>Needs attention</h2>
            <p>Automatically opened from live workflow checks.</p>
          </div>
          <Link className="sa-btn sa-btn-ghost sa-btn-sm" to={`${ROOT}/operations/bookings`}>View all bookings</Link>
        </div>
        {data?.actionItems?.length ? (
          <div className="ops-alert-list">
            {data.actionItems.slice(0, 8).map(alert => (
              <AlertRow key={alert._id} alert={alert} onStatus={handleAlert} busy={busyId === alert._id} />
            ))}
          </div>
        ) : (
          <ConsoleEmpty icon="task_alt" title="No open workflow alerts"
            hint="Payments, booking links, confirmations and lesson state are all clear." />
        )}
      </section>

      <div className="ops-two-column">
        <section className="ops-section">
          <div className="ops-section-head">
            <div><h2>Recent pack buyers</h2><p>Payment and first-booking status together.</p></div>
            <Link className="sa-chip" to={`${ROOT}/finance/revenue`}>Payments</Link>
          </div>
          <div className="ops-table-wrap">
            <table className="ops-table">
              <thead><tr><th>Student</th><th>Pack</th><th>Bought</th><th>Booking</th></tr></thead>
              <tbody>
                {(data?.recentPurchases || []).slice(0, 8).map(row => (
                  <tr key={row._id}>
                    <td>
                      <Link to={`${ROOT}/school/preview?student=${encodeURIComponent(row.studentSlug || '')}`}>{row.studentName}</Link>
                      <small>{row.studentEmail || 'No personal email'}</small>
                    </td>
                    <td><strong>{row.totalLessons}</strong><small>{row.name}</small></td>
                    <td>{formatWhen(row.purchasedAt)}</td>
                    <td>
                      {row.nextBooking
                        ? <span className="ops-status is-good">{row.nextBooking.dateWarsaw} {row.nextBooking.timeWarsaw}</span>
                        : row.hasEverBooked
                          ? <span className="ops-status is-neutral">No next lesson</span>
                          : <span className="ops-status is-bad">Never booked</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="ops-section">
          <div className="ops-section-head">
            <div><h2>Next lessons</h2><p>Meeting link and confirmation at a glance.</p></div>
            <Link className="sa-chip" to={`${ROOT}/operations/bookings`}>Bookings</Link>
          </div>
          <div className="ops-compact-list">
            {(data?.upcomingBookings || []).slice(0, 7).map(row => (
              <div className="ops-compact-row" key={row._id}>
                <div className="ops-date-block"><strong>{row.dateWarsaw.slice(8)}</strong><span>{row.timeWarsaw}</span></div>
                <div><strong>{row.studentName}</strong><small>{row.organizationName}</small></div>
                <div className="ops-row-health">
                  <HealthDot ok={Boolean(row.meetLink)} label="Video" />
                  <HealthDot ok={row.notificationStatus === 'sent' || !row.notificationStatus}
                    label={row.notificationStatus === 'failed' ? 'Email failed' : 'Email'} />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="ops-section">
        <div className="ops-section-head">
          <div><h2>Lesson publishing</h2><p>Recent cards, keywords, YouTube clips and analysis.</p></div>
          <Link className="sa-btn sa-btn-primary sa-btn-sm" to={`${ROOT}/operations/publishing`}>Open publishing</Link>
        </div>
        <div className="ops-publish-grid">
          {(data?.recentLessonHealth || []).slice(0, 8).map(lesson => (
            <Link key={lesson._id} className="ops-publish-card"
              to={`${ROOT}/operations/publishing?student=${encodeURIComponent(lesson.studentSlug || '')}&date=${lesson.date}`}>
              <span className="ops-publish-date">{lesson.date}</span>
              <strong>{lesson.studentName}</strong>
              <span>{lesson.title}</span>
              <div>
                <HealthDot ok={lesson.status === 'completed'} label="Card" />
                <HealthDot ok={lesson.keywordCount > 0} label={`${lesson.keywordCount} keywords`} />
                <HealthDot ok={lesson.keywordCount > 0 && lesson.youglishCount >= lesson.keywordCount - 1}
                  label={`${lesson.youglishCount} clips`} />
              </div>
            </Link>
          ))}
        </div>
      </section>

      <footer className="ops-system-strip">
        <span><strong>System health</strong></span>
        {pipeline ? (
          <>
            <HealthDot ok={servicesDown.length === 0} label={`${services.length - servicesDown.length}/${services.length} services`} />
            <HealthDot ok={(pipeline.ingestion?.failed_24h || 0) === 0} label="Ingestion" />
            <Link to={`${ROOT}/system/pipelines`}>Open diagnostics</Link>
          </>
        ) : <span>Pipeline diagnostics unavailable</span>}
      </footer>
    </div>
  )
}
