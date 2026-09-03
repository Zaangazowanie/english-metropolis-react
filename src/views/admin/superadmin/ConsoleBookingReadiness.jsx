import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ConsoleSkeleton, ConsoleEmpty } from './ConsoleStates.jsx'
import { consoleGet } from './consoleApi.js'

/**
 * Booking readiness — can each student actually book a lesson right now, and if
 * not, why.
 *
 * Built 2026-08-27, after a student paid 880 PLN, confirmed her email, asked
 * Bajla to book, and was told Bajla would ask Mike. Nothing on any screen showed
 * that she had paid and had no lesson, that the booking panel had been deleting
 * itself for every student for 29 hours, or that an escalation had been raised
 * at all. The escalation log had been written since May and read by nothing.
 *
 * The top row is deliberately "paid but never booked" — the shape of a customer
 * who has given us money and received nothing. If that number is not zero, it is
 * the most important thing on this screen.
 */

const BLOCKER_LABEL = {
  EMAIL_NOT_VERIFIED: 'Email not confirmed',
  NO_LESSONS_REMAINING: 'No lessons left',
  NO_PACKAGE: 'Never bought a package',
  NO_ORGANISATION: 'No organisation set',
  UNKNOWN: 'Could not read balance',
}

function Stat({ label, value, tone }) {
  return (
    <div className={`ops-stat ${tone || ''}`}>
      <div className="ops-stat-value">{value}</div>
      <div className="ops-stat-label">{label}</div>
    </div>
  )
}

function ago(hours) {
  if (hours == null) return ''
  if (hours < 1) return `${Math.round(hours * 60)}m ago`
  if (hours < 48) return `${Math.round(hours)}h ago`
  return `${Math.round(hours / 24)}d ago`
}

export default function ConsoleBookingReadiness() {
  const [data, setData] = useState(null)
  const [esc, setEsc] = useState(null)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [view, setView] = useState('all')

  const load = useCallback(async () => {
    // allSettled, not all: one dead seam must not blank the whole screen.
    // No synchronous setState before the await — that is what the
    // react-hooks/set-state-in-effect rule is for, and the effect below calls
    // this directly.
    const [r, e] = await Promise.allSettled([
      consoleGet('/api/console/booking-readiness'),
      consoleGet('/api/console/bajla-escalations'),
    ])
    if (r.status === 'fulfilled') { setData(r.value); setError('') }
    else setError(String(r.reason?.message || r.reason))
    if (e.status === 'fulfilled') setEsc(e.value)
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const t = window.setInterval(() => load(), 60000)
    return () => window.clearInterval(t)
  }, [load])

  if (!data && !error) return <ConsoleSkeleton />

  const totals = data?.totals || {}
  const rows = (data?.students || []).filter(r => {
    if (!q.trim()) return true
    const s = `${r.name || ''} ${r.slug || ''}`.toLowerCase()
    return s.includes(q.trim().toLowerCase())
  })

  const filtered = rows.filter(r => {
    if (view === 'paid') return !!r.paidButNeverBooked
    if (view === 'can') return !!r.canBook
    if (view === 'blocked') return !r.canBook
    return true
  })
  const chip = (key, label, n) => (
    <button type="button" key={key} className={`sa-chip ${view === key ? 'is-active' : ''}`} onClick={() => setView(key)}>
      {label}{n != null ? ` · ${n}` : ''}
    </button>
  )
  const preview = slug => `/admin/superadmin/school/preview?student=${encodeURIComponent(slug || '')}`
  const course = slug => `/admin/superadmin/academic/students?student=${encodeURIComponent(slug || '')}`

  return (
    <div className="ops-page sa-page">
      <header className="ops-page-header">
        <div>
          <p className="ops-eyebrow">Lessons</p>
          <h1>Booking readiness</h1>
          <p>Who can book a lesson right now, and what is stopping everyone else. Balances come from the same function the booking gate uses.</p>
        </div>
        <div className="ops-header-actions">
          <button type="button" className="sa-btn sa-btn-ghost" onClick={() => load()}>
            <span className="material-symbols-outlined" aria-hidden="true">refresh</span> Refresh
          </button>
        </div>
      </header>

      {error && <div className="ops-alert is-bad">{error}</div>}
      {data && data.ok === false && (
        <div className="ops-alert is-bad">
          Could not read student data: {data.error}. This screen shows nothing rather than
          a zero, because an empty roster and a broken query look identical.
        </div>
      )}

      <div className="ops-stat-grid ops-stat-grid-5">
        <Stat label="Active students" value={totals.active ?? '—'} />
        <Stat label="Can book now" value={totals.canBook ?? '—'} tone="is-good" />
        <Stat label="Blocked" value={totals.blocked ?? '—'} />
        <Stat
          label="Paid but never booked"
          value={totals.paidButNeverBooked ?? '—'}
          tone={totals.paidButNeverBooked ? 'is-bad' : 'is-good'}
        />
        <Stat label="Credits outstanding" value={totals.creditsOutstanding ?? '—'} />
      </div>

      {!!totals.paidButNeverBooked && (
        <div className="ops-alert is-bad">
          <strong>{totals.paidButNeverBooked} student(s) have paid for lessons and have never booked one.</strong>{' '}
          They gave us money and have received nothing. Each is listed first below.
        </div>
      )}

      {/* Bajla escalations — this log existed for months and nothing read it. */}
      <section className="ops-section">
        <div className="ops-section-head">
          <div>
            <h2>Bajla escalations · {esc?.escalations?.length || 0}</h2>
            <p>{esc?.note || 'Questions Bajla could not answer and handed to a human.'}</p>
          </div>
        </div>
        {esc?.escalations?.length ? (
          <div className="ops-table-wrap">
            <table className="ops-table ops-table-roomy">
              <thead>
                <tr><th>When</th><th>Student</th><th>Asked</th><th>Reason given</th><th /></tr>
              </thead>
              <tbody>
                {esc.escalations.map((e, i) => (
                  <tr key={i}>
                    <td>{ago(e.age_hours)}</td>
                    <td><strong>{e.student_name || e.student_slug}</strong><small>{e.student_slug}</small></td>
                    <td>{e.question}</td>
                    <td className="ops-dim">{e.reason}</td>
                    <td className="sa-td-right">
                      <div className="sa-row-actions">
                        <Link className="sa-btn sa-btn-primary sa-btn-sm" to={preview(e.student_slug)}>
                          <span className="material-symbols-outlined" aria-hidden="true">visibility</span>Student view
                        </Link>
                        <Link className="sa-btn sa-btn-ghost sa-btn-sm" to="/admin/superadmin/bajla">
                          <span className="material-symbols-outlined" aria-hidden="true">forum</span>Conversation
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <ConsoleEmpty icon="task_alt" title="No escalations" hint="Bajla has not asked for help." />
        )}
      </section>

      <section className="ops-section">
        <div className="ops-section-head">
          <div>
            <h2>Every active student · {filtered.length}</h2>
            <p>Paid-but-never-booked students are listed first.</p>
          </div>
          <div className="ops-filter-bar ops-filter-inline">
            <span className="material-symbols-outlined" aria-hidden="true">search</span>
            <input type="search" placeholder="Filter by name or slug…" aria-label="Filter students"
              value={q} onChange={ev => setQ(ev.target.value)} />
          </div>
        </div>
        <div className="ops-chips" style={{ padding: '0 18px 14px' }}>
          {chip('all', 'All', rows.length)}
          {chip('paid', 'Paid, never booked', rows.filter(r => r.paidButNeverBooked).length)}
          {chip('can', 'Can book', rows.filter(r => r.canBook).length)}
          {chip('blocked', 'Blocked', rows.filter(r => !r.canBook).length)}
        </div>
        {filtered.length ? (
          <div className="ops-table-wrap">
            <table className="ops-table ops-table-roomy">
              <thead>
                <tr>
                  <th>Student</th><th>Email</th><th>Lessons left</th>
                  <th>Next lesson</th><th>Status</th><th />
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.slug} className={r.paidButNeverBooked ? 'is-bad-row' : ''}>
                    <td>
                      <strong>{r.name || r.slug}</strong>
                      <small>{r.slug}</small>
                    </td>
                    <td>
                      <span className={`ops-status ${r.emailVerified ? 'is-good' : 'is-bad'}`}>
                        {r.emailVerified ? 'confirmed' : 'unconfirmed'}
                      </span>
                    </td>
                    <td>
                      <strong>{r.remaining == null ? '—' : r.remaining}</strong>
                      {r.allocated ? <small>of {r.allocated} allocated{r.used ? ` · ${r.used} used` : ''}</small> : null}
                    </td>
                    <td>
                      {r.nextLesson ? <strong>{r.nextLesson}</strong> : <span className="ops-dim">none booked</span>}
                      {r.nextLesson && !r.nextLessonHasMeet && (
                        <small><span className="ops-status is-bad" title="Booked but no meeting link">no link</span></small>
                      )}
                    </td>
                    <td>
                      {r.paidButNeverBooked ? (
                        <span className="ops-status is-bad">paid, never booked</span>
                      ) : r.canBook ? (
                        <span className="ops-status is-good">can book</span>
                      ) : (
                        <div className="ops-blockers">
                          {(r.blockers || []).map(b => (
                            <span className="ops-status is-neutral" key={b}>{BLOCKER_LABEL[b] || b}</span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="sa-td-right">
                      <div className="sa-row-actions">
                        <Link className="sa-btn sa-btn-primary sa-btn-sm" to={course(r.slug)}>
                          <span className="material-symbols-outlined" aria-hidden="true">school</span>Course
                        </Link>
                        <Link className="sa-btn sa-btn-ghost sa-btn-sm" to={preview(r.slug)}>
                          <span className="material-symbols-outlined" aria-hidden="true">visibility</span>Student view
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <ConsoleEmpty icon="group" title="No students match" hint="Change the filter or clear the search." />
        )}
      </section>
      {data?.generated_at && (
        <p className="ops-note">
          Read live from Convex {data.took_ms}ms ago. Balances come from the same
          function the booking gate uses, so this screen cannot drift from the rule.
        </p>
      )}
    </div>
  )
}
