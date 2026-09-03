import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { queryAdminConvex } from '../../../contexts/AdminAuthContext.jsx'
import { ConsoleEmpty, ConsoleSkeleton } from './ConsoleStates.jsx'
import { consoleGet, consolePost } from './consoleApi.js'

const STAGES = [
  ['lesson_card', 'Card'], ['transcript', 'Transcript'], ['analysis', 'Analysis'],
  ['push', 'Dashboard'], ['keywords', 'Keywords'], ['youglish', 'YouTube'],
  ['raw_notes', 'PDF'], ['refresh_model', 'Refresh'],
]

function runKey(row) {
  return `${row.studentSlug || row.slug}_${row.date}`
}

function stageTone(stage) {
  if (!stage) return 'is-neutral'
  if (stage.status === 'done') return 'is-good'
  if (stage.status === 'failed' || stage.status === 'deferred') return 'is-bad'
  return 'is-neutral'
}

function RunStages({ stages = {} }) {
  return (
    <div className="publish-stage-grid">
      {STAGES.map(([key, label]) => (
        <span className={`publish-stage ${stageTone(stages[key])}`} key={key} title={stages[key]?.detail?.reason || ''}>
          <span className="material-symbols-outlined" aria-hidden="true">
            {stages[key]?.status === 'done' ? 'check' : stages[key]?.status === 'failed' ? 'close' : 'remove'}
          </span>
          {label}
        </span>
      ))}
    </div>
  )
}


// ── The OneNote (Microsoft Graph) token the auto-publisher depends on ────────
// Mike, 2026-09-03: "that token sometimes needs a refresh but if so work it in so
// that when it needs a refresh it prompts me to do so." The server PROBES the real
// refresh (not just the file), so a dead refresh token shows as dead here. When it
// is, one click starts Microsoft's device-code sign-in: a code and a link appear,
// Mike signs in on any device, and the page notices by itself.
function GraphTokenCard() {
  const [st, setSt] = useState(null)
  const [login, setLogin] = useState(null)
  const [busy, setBusy] = useState(false)
  const load = useCallback(() => consoleGet('/api/console/publishing/token').then(setSt).catch(e => setSt({ ok: false, error: e.message || String(e) })), [])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (!login || login.status !== 'pending') return undefined
    const h = setInterval(() => consoleGet('/api/console/publishing/token/poll').then(r => { setLogin(r); if (r.status === 'done') load() }).catch(() => {}), 5000)
    return () => clearInterval(h)
  }, [login, load])
  async function start() { setBusy(true); try { setLogin(await consolePost('/api/console/publishing/token/login', {})) } catch (e) { setLogin({ status: 'failed', error: e.message || String(e) }) } finally { setBusy(false) } }
  const good = st && st.ok
  return (
    <section className="sa-card" style={{ padding: 14, marginBottom: 14 }}>
      <div className="em-token">
        <span className={`em-badge ${st === null ? '' : good ? 'em-badge-good' : 'em-badge-bad'}`}>
          {st === null ? 'checking OneNote access…' : good ? `OneNote connected · token good for ${st.expires_in_min} min, renews itself` : 'OneNote needs you to sign in'}
        </span>
        {st && !good && st.error && <span style={{ fontSize: 12, color: 'var(--sa-text-muted)' }}>{st.error}</span>}
        <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" onClick={load} disabled={busy}>Re-check</button>
        {(!good || (login && login.status === 'pending')) && (
          <button type="button" className="sa-btn sa-btn-primary sa-btn-sm" onClick={start} disabled={busy || (login && login.status === 'pending')}>
            <span className="material-symbols-outlined" aria-hidden="true">login</span>Sign in to OneNote
          </button>
        )}
      </div>
      {login && login.status === 'pending' && (
        <div style={{ marginTop: 12, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="em-code">{login.user_code}</span>
          <div style={{ fontSize: 13 }}>
            Open <a href={login.verification_uri} target="_blank" rel="noreferrer"><strong>{login.verification_uri}</strong></a> on any device, enter this code and sign in with the school&rsquo;s Microsoft account.
            <br /><small style={{ color: 'var(--sa-text-muted)' }}>This page will notice by itself. The code expires {new Date(login.expires_at * 1000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}.</small>
          </div>
        </div>
      )}
      {login && login.status === 'done' && <p style={{ margin: '10px 0 0', color: 'var(--sa-good)', fontSize: 13 }}>Signed in. The publisher can read OneNote again{login.has_refresh ? ' and will keep renewing itself' : ''}.</p>}
      {login && (login.status === 'failed' || login.status === 'expired') && <p style={{ margin: '10px 0 0', color: 'var(--sa-bad)', fontSize: 13 }}>{login.error}</p>}
      <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--sa-text-muted)' }}>
        The auto-publisher pulls each lesson&rsquo;s notes from OneNote through this connection every five minutes. A green badge means it can; nothing else on this page works without it.
      </p>
    </section>
  )
}

async function unpublishNotes(slug, date) {
  return consolePost('/api/console/lesson-notes/unpublish', { slug, date })
}

export default function ConsolePublishing() {
  const [params, setParams] = useSearchParams()
  const [ops, setOps] = useState(null)
  const [runs, setRuns] = useState([])
  const [service, setService] = useState(null)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(null)
  const [q, setQ] = useState('')
  const [manual, setManual] = useState({ student_slug: params.get('student') || '', date: params.get('date') || '' })

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setError('')
    const [opsResult, runsResult] = await Promise.allSettled([
      queryAdminConvex('operations:getCommandCenter', {}),
      consoleGet('/api/console/operations/publishing'),
    ])
    if (opsResult.status === 'fulfilled') setOps(opsResult.value)
    else setError(String(opsResult.reason?.message || opsResult.reason))
    if (runsResult.status === 'fulfilled') {
      setRuns(runsResult.value?.runs || [])
      setService(runsResult.value?.service || null)
    } else if (!runsResult.reason?.notLive) {
      setError(value => value || String(runsResult.reason?.message || runsResult.reason))
    }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (!runs.some(row => row.jobStatus === 'queued' || row.jobStatus === 'running')) return undefined
    const timer = window.setInterval(() => load(true), 5000)
    return () => window.clearInterval(timer)
  }, [runs, load])

  const runMap = useMemo(() => new Map(runs.map(row => [row.lessonKey || `${row.slug}_${row.date}`, row])), [runs])
  const lessonRows = useMemo(() => (ops?.recentLessonHealth || []).map(row => ({
    ...row,
    run: runMap.get(runKey(row)) || null,
  })).filter(row => {
    const needle = q.trim().toLowerCase()
    return !needle || `${row.studentName} ${row.studentSlug} ${row.title} ${row.date}`.toLowerCase().includes(needle)
  }), [ops, runMap, q])

  async function resume(studentSlug, date) {
    const key = `${studentSlug}_${date}`
    setBusy(key); setError(''); setNote('')
    try {
      const result = await consolePost('/api/console/operations/publish', {
        student_slug: studentSlug,
        date,
      })
      setNote(result.alreadyRunning ? 'That recovery is already running.' : 'Recovery queued. The live state will be checked before each step runs.')
      setParams({ student: studentSlug, date })
      await load(true)
    } catch (e) {
      setError(String(e?.message || e))
    } finally {
      setBusy(null)
    }
  }

  if (!ops && !error) return <ConsoleSkeleton rows={9} label="Checking publication history" />

  return (
    <div className="sa-page">
      <header className="ops-page-header">
        <div>
          <p className="ops-eyebrow">Notes &amp; publishing</p>
          <h1>Publishing</h1>
          <p>Publish a lesson's notes to the student with one click, re-run a stuck one, or take notes back down. Every step is checked from the outside, so green here means the student can open it.</p>
        </div>
        <button type="button" className="sa-btn sa-btn-ghost" onClick={() => load()}>
          <span className="material-symbols-outlined" aria-hidden="true">refresh</span>Refresh
        </button>
      </header>

      {error && <div className="ops-banner ops-banner-bad" role="alert">{error}</div>}
      {note && <div className="ops-banner ops-banner-good" role="status">{note}</div>}

      <GraphTokenCard />
      <section className="publish-explainer">
        <div>
          <span className="material-symbols-outlined" aria-hidden="true">verified_user</span>
          <div><strong>Safe recovery</strong><p>The worker reads live state first, skips completed work and resumes only missing or failed steps.</p></div>
        </div>
        <div><strong>{runs.filter(row => row.outcome === 'complete').length}</strong><span>complete runs</span></div>
        <div><strong>{runs.filter(row => ['failed', 'deferred', 'degraded'].includes(row.outcome)).length}</strong><span>need review</span></div>
        <div><strong>{service?.lockActive ? 'Busy' : 'Ready'}</strong><span>publisher worker</span></div>
      </section>

      <section className="ops-section publish-manual">
        <div className="ops-section-head">
          <div><h2>Publish a lesson after the fact</h2><p>Type the student's slug and the lesson date. The publisher does the rest: card, transcript, keywords, YouTube clips, PDF, and the student's email.</p></div>
        </div>
        <form onSubmit={event => { event.preventDefault(); resume(manual.student_slug.trim(), manual.date) }}>
          <label><span>Student slug</span><input className="sa-input" required value={manual.student_slug}
            onChange={event => setManual(value => ({ ...value, student_slug: event.target.value }))} placeholder="aleksandra-gorska" /></label>
          <label><span>Lesson date</span><input className="sa-input" required type="date" value={manual.date}
            onChange={event => setManual(value => ({ ...value, date: event.target.value }))} /></label>
          <button type="submit" className="sa-btn sa-btn-primary" disabled={!manual.student_slug || !manual.date || Boolean(busy)}>
            <span className="material-symbols-outlined" aria-hidden="true">play_arrow</span>
            Publish now
          </button>
        </form>
      </section>

      <section className="ops-section">
        <div className="ops-section-head">
          <div><h2>Recent lessons</h2><p>Dashboard card, keywords, YouTube clips, PDF and student notification.</p></div>
          <div className="ops-filter-bar ops-filter-inline">
            <span className="material-symbols-outlined">search</span>
            <input type="search" value={q} onChange={event => setQ(event.target.value)} placeholder="Search student or date" aria-label="Search recent lessons" />
          </div>
        </div>
        {lessonRows.length ? (
          <div className="publish-list">
            {lessonRows.map(row => {
              const key = runKey(row)
              const run = row.run
              const working = run?.jobStatus === 'running' || run?.jobStatus === 'queued' || busy === key
              return (
                <article className="publish-row" key={row._id}>
                  <div className="publish-row-title">
                    <span>{row.date}</span><strong>{row.studentName}</strong><p>{row.title}</p>
                  </div>
                  <RunStages stages={run?.stages || {}} />
                  <div className="publish-row-summary">
                    <span className={`ops-status ${run?.outcome === 'complete' ? 'is-good' : run ? 'is-bad' : 'is-neutral'}`}>
                      {working ? 'Running' : run?.outcome || 'No worker record'}
                    </span>
                    <small>{run?.studentEmailStatus === 'sent' ? 'Student emailed' : run?.studentEmailed ? 'Student notified' : 'Email not recorded'}</small>
                  </div>
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  <button type="button" className="sa-btn sa-btn-primary sa-btn-sm" disabled={working || !row.studentSlug}
                    onClick={() => resume(row.studentSlug, row.date)}>{working ? 'Running' : 'Publish / re-run'}</button>
                  <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" disabled={working || !row.studentSlug}
                    title="Removes this lesson's PDF from what the student can open. The file is kept and the registry is backed up first."
                    onClick={async () => {
                      if (!window.confirm(`Unpublish the notes for ${row.studentSlug} on ${row.date}? The student will no longer see the Raw notes button for this lesson.`)) return
                      try { const r = await unpublishNotes(row.studentSlug, row.date); window.alert(r.live && r.live.still_listed === false ? 'Unpublished. Confirmed gone from the live site.' : `Unpublished (live check: ${JSON.stringify(r.live)})`); load() }
                      catch (e) { window.alert(`Could not unpublish: ${e.message || e}`) }
                    }}>Unpublish</button>
                  </div>
                </article>
              )
            })}
          </div>
        ) : <ConsoleEmpty icon="publish" title="No recent lessons match" hint="Try a student slug and date in the recovery form above." />}
      </section>
    </div>
  )
}
