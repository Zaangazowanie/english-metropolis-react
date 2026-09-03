// ConsoleTickets — one queue for everything a person raises and everything the
// system flags. Abuse strikes from Bajla (cold numbers and students alike) and
// her needs-a-human escalations arrive here by themselves; anything else is one
// click from a conversation, an email, or the button on this page.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { consoleGet, consolePost } from './consoleApi.js'
import { ConsoleEmpty, ConsoleErrorPanel, ConsoleNotLive, ConsoleSkeleton } from './ConsoleStates.jsx'

const API = '/api/console/tickets'
const ROOT = '/admin/superadmin'
const STATUSES = [['active', 'Open & in progress'], ['open', 'Open'], ['in_progress', 'In progress'], ['resolved', 'Resolved'], ['closed', 'Closed'], ['all', 'All']]
const KINDS = [['all', 'Every kind'], ['abuse', 'Abuse'], ['escalation', 'Escalations'], ['issue', 'Issues'], ['billing', 'Billing'], ['booking', 'Booking'], ['content', 'Content'], ['other', 'Other']]
const PRIORITIES = ['low', 'normal', 'high', 'urgent']
const STATE_FLOW = ['open', 'in_progress', 'resolved', 'closed']

function when(s) {
  if (!s) return '—'
  const d = new Date(s * 1000)
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}
function kindBadge(kind) {
  const cls = kind === 'abuse' ? 'em-badge-bad' : kind === 'escalation' ? 'em-badge-warn' : 'em-badge-area'
  return <span className={`em-badge ${cls}`}>{kind}</span>
}

function NewTicket({ onCreated }) {
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ subject: '', body: '', kind: 'issue', priority: 'normal', phone: '', name: '', student_slug: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  async function submit(e) {
    e.preventDefault(); setBusy(true); setErr(null)
    try { const t = await consolePost(API, { ...f, source: 'console' }); setOpen(false); setF({ subject: '', body: '', kind: 'issue', priority: 'normal', phone: '', name: '', student_slug: '' }); onCreated(t) }
    catch (x) { setErr(x) } finally { setBusy(false) }
  }
  if (!open) return <button type="button" className="sa-btn sa-btn-primary" onClick={() => setOpen(true)}><span className="material-symbols-outlined" aria-hidden="true">add</span>New ticket</button>
  return (
    <form onSubmit={submit} className="sa-card" style={{ padding: 14, display: 'grid', gap: 10, gridTemplateColumns: '1fr 1fr', marginBottom: 14 }}>
      <input className="sa-input" style={{ gridColumn: '1 / -1' }} placeholder="What is the issue? (subject)" required value={f.subject} onChange={e => setF({ ...f, subject: e.target.value })} />
      <textarea className="sa-input" style={{ gridColumn: '1 / -1' }} rows={3} placeholder="Details" value={f.body} onChange={e => setF({ ...f, body: e.target.value })} />
      <select className="sa-input" value={f.kind} onChange={e => setF({ ...f, kind: e.target.value })}>{KINDS.filter(([k]) => k !== 'all').map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      <select className="sa-input" value={f.priority} onChange={e => setF({ ...f, priority: e.target.value })}>{PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}</select>
      <input className="sa-input" placeholder="Name (optional)" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} />
      <input className="sa-input" placeholder="Phone digits or student slug (optional)" value={f.phone || f.student_slug} onChange={e => { const v = e.target.value.trim(); setF({ ...f, phone: /^\d+$/.test(v) ? v : '', student_slug: /^\d+$/.test(v) ? '' : v }) }} />
      {err && <div style={{ gridColumn: '1 / -1' }}><ConsoleErrorPanel error={err} /></div>}
      <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8 }}>
        <button type="submit" className="sa-btn sa-btn-primary" disabled={busy || !f.subject.trim()}>{busy ? 'Saving…' : 'Create'}</button>
        <button type="button" className="sa-btn sa-btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  )
}

function Detail({ id, onChanged }) {
  const [t, setT] = useState(null)
  const [err, setErr] = useState(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const load = useCallback(() => { consoleGet(`${API}/${id}`).then(x => { setT(x); setErr(null) }).catch(setErr) }, [id])
  useEffect(() => { setT(null); load() }, [load])
  async function upd(patch) { setBusy(true); try { setT(await consolePost(`${API}/${id}/update`, patch)); onChanged() } catch (x) { setErr(x) } finally { setBusy(false) } }
  async function addNote(e) { e.preventDefault(); if (!note.trim()) return; setBusy(true); try { setT(await consolePost(`${API}/${id}/note`, { text: note })); setNote('') } catch (x) { setErr(x) } finally { setBusy(false) } }
  if (err) return <div className="sa-card" style={{ padding: 12 }}><ConsoleErrorPanel error={err} onRetry={load} /></div>
  if (!t) return <div className="sa-card"><ConsoleSkeleton rows={6} label="Loading ticket…" /></div>
  const next = STATE_FLOW[STATE_FLOW.indexOf(t.status) + 1]
  return (
    <div className="sa-card" style={{ overflow: 'hidden' }}>
      <div className="sa-card-header" style={{ gap: 8, flexWrap: 'wrap' }}>
        <div style={{ marginRight: 'auto' }}>
          <h2 style={{ margin: 0 }}>#{t.id} · {t.subject}</h2>
          <small style={{ color: 'var(--sa-text-muted)' }}>{kindBadge(t.kind)} <span className="em-badge">{t.source}</span> opened {when(t.created_at)} by {t.created_by || 'system'}</small>
        </div>
        <select className="sa-input" value={t.priority} disabled={busy} onChange={e => upd({ priority: e.target.value })} aria-label="Priority">{PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}</select>
        <select className="sa-input" value={t.status} disabled={busy} onChange={e => upd({ status: e.target.value })} aria-label="Status">{STATE_FLOW.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}</select>
        {next && <button type="button" className="sa-btn sa-btn-primary sa-btn-sm" disabled={busy} onClick={() => upd({ status: next })}>
          <span className="material-symbols-outlined" aria-hidden="true">arrow_forward</span>{next.replace('_', ' ')}
        </button>}
      </div>
      <div style={{ padding: 12, display: 'grid', gap: 10, gridTemplateColumns: 'minmax(0,1fr) 220px' }}>
        <div>
          {t.body && <pre style={{ whiteSpace: 'pre-wrap', font: 'inherit', margin: '0 0 12px', padding: 10, background: 'var(--sa-surface-soft)', borderRadius: 10 }}>{t.body}</pre>}
          <h3 style={{ fontSize: 13, margin: '0 0 6px' }}>History</h3>
          {t.events.map(e => (
            <div className="em-tk-event" key={e.id}>
              <small>{when(e.ts)} · {e.actor || 'system'} · {e.kind}</small>
              {e.text}
            </div>
          ))}
          <form onSubmit={addNote} style={{ marginTop: 10, display: 'flex', gap: 8 }}>
            <input className="sa-input" style={{ flex: 1 }} placeholder="Add a note…" value={note} onChange={e => setNote(e.target.value)} />
            <button type="submit" className="sa-btn sa-btn-ghost" disabled={busy || !note.trim()}>Note</button>
          </form>
        </div>
        <aside style={{ fontSize: 13, display: 'grid', gap: 8, alignContent: 'start' }}>
          {t.name && <div><small style={{ color: 'var(--sa-text-muted)' }}>Who</small><br />{t.name} <span className="em-badge">{t.role || '—'}</span></div>}
          {t.phone && <div><small style={{ color: 'var(--sa-text-muted)' }}>Phone</small><br />+{t.phone} · <Link to={`${ROOT}/bajla?thread=${t.phone}`}>open conversation</Link></div>}
          {t.student_slug && <div><small style={{ color: 'var(--sa-text-muted)' }}>Student</small><br /><Link to={`${ROOT}/school/preview?student=${encodeURIComponent(t.student_slug)}`}>{t.student_slug}</Link></div>}
          <div><small style={{ color: 'var(--sa-text-muted)' }}>Assignee</small><br />
            <input className="sa-input" defaultValue={t.assignee || ''} placeholder="unassigned" onBlur={e => e.target.value !== (t.assignee || '') && upd({ assignee: e.target.value })} />
          </div>
          {t.resolved_at && <div><small style={{ color: 'var(--sa-text-muted)' }}>Resolved</small><br />{when(t.resolved_at)}</div>}
        </aside>
      </div>
    </div>
  )
}

export default function ConsoleTickets() {
  const [params, setParams] = useSearchParams()
  const [status, setStatus] = useState(params.get('status') || 'active')
  const [kind, setKind] = useState(params.get('kind') || 'all')
  const [q, setQ] = useState(params.get('q') || '')
  const phone = params.get('phone') || ''
  const [token, setToken] = useState(0)
  const [result, setResult] = useState(null)
  const [selected, setSelected] = useState(Number(params.get('id')) || null)
  const reload = useCallback(() => setToken(v => v + 1), [])

  useEffect(() => {
    let alive = true
    consoleGet(API, { status, kind, q, phone }).then(d => { if (alive) setResult({ d, e: null }) }).catch(e => { if (alive) setResult({ d: null, e }) })
    return () => { alive = false }
  }, [status, kind, q, phone, token])
  useEffect(() => { setParams(p => { const n = new URLSearchParams(p); n.set('status', status); n.set('kind', kind); q ? n.set('q', q) : n.delete('q'); selected ? n.set('id', String(selected)) : n.delete('id'); return n }, { replace: true }) }, [status, kind, q, selected, setParams])

  const d = result?.d; const e = result?.e
  const rows = d?.tickets || []
  const counts = d?.counts || {}
  const byKind = d?.open_by_kind || {}
  const chosen = useMemo(() => rows.find(t => t.id === selected) || null, [rows, selected])

  return (
    <>
      <div className="sa-page-header">
        <div>
          <h1>Tickets</h1>
          <p>One queue for issues, Bajla&rsquo;s escalations and every abuse strike, from cold numbers and students alike. Move a ticket forward with one click; everything is logged.</p>
        </div>
        <div className="sa-page-header-actions"><NewTicket onCreated={t => { reload(); setSelected(t.id) }} /></div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
        {STATUSES.map(([k, l]) => <button key={k} type="button" className="sa-chip" aria-current={status === k ? 'true' : undefined} onClick={() => setStatus(k)}>{l}{k in counts ? ` · ${counts[k]}` : ''}</button>)}
        <span style={{ width: 8 }} />
        {KINDS.map(([k, l]) => <button key={k} type="button" className="sa-chip" aria-current={kind === k ? 'true' : undefined} onClick={() => setKind(k)}>{l}{byKind[k] ? ` · ${byKind[k]}` : ''}</button>)}
        <input className="sa-input" style={{ marginLeft: 'auto', minWidth: 220 }} placeholder="Search…" value={q} onChange={x => setQ(x.target.value)} />
        {phone && <Link className="sa-chip" to={`${ROOT}/bajla/tickets`}>✕ only +{phone}</Link>}
      </div>

      {e ? (e.notLive ? <ConsoleNotLive endpoint={API} /> : <ConsoleErrorPanel error={e} onRetry={reload} />)
        : !d ? <ConsoleSkeleton rows={6} label="Loading tickets…" />
        : rows.length === 0 ? <ConsoleEmpty icon="confirmation_number" title="Nothing here" hint={<p>No tickets match these filters.</p>} />
        : (
          <div className="em-bj">
            <div className="sa-card" style={{ overflow: 'hidden' }}>
              {rows.map(t => (
                <div key={t.id} className="em-tk-row" aria-current={selected === t.id ? 'true' : undefined} onClick={() => setSelected(t.id)} role="button" tabIndex={0} onKeyDown={x => x.key === 'Enter' && setSelected(t.id)}>
                  <div><span className={`em-tk-pri ${t.priority}`} aria-hidden="true" />#{t.id}</div>
                  <div>
                    <div style={{ fontWeight: 600 }}>{t.subject}</div>
                    <small style={{ color: 'var(--sa-text-muted)' }}>{kindBadge(t.kind)} {t.name || (t.phone ? `+${t.phone}` : '')} · {when(t.updated_at)}</small>
                  </div>
                  <span className={`em-badge ${t.status === 'open' ? 'em-badge-warn' : t.status === 'in_progress' ? 'em-badge-area' : 'em-badge-good'}`}>{t.status.replace('_', ' ')}</span>
                </div>
              ))}
            </div>
            {chosen ? <Detail id={chosen.id} onChanged={reload} /> : <div className="sa-card" style={{ padding: 14 }}>Pick a ticket to see its history.</div>}
          </div>
        )}
    </>
  )
}
