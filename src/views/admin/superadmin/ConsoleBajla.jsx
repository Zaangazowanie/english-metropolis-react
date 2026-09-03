// ConsoleBajla — every WhatsApp conversation Bajla has, live, with the two things
// an operator actually needs: to step in, and to make a ticket of it.
//
// Mike, 2026-09-03: "I should be able to monitor all messages that people are
// sending Bajla and intervene at any time."
//
// Data is bajla-router's own event log, read server-side over a read-only SQLite
// connection (em-console-api /api/console/wa/*). Nothing here talks to Meta.
//
// TAKE OVER: flips a per-phone flag the router honours (human_takeover_until).
// While it is on, Bajla logs what the person writes and stays silent, so the
// operator is not answered over the top. It expires by itself after 24 hours.
// The reply box still obeys Meta's 24-hour customer-service window: outside it
// nothing free-form can be delivered, so the composer is disabled and says when
// the window shut rather than failing at the Graph call.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { consoleGet, consolePost } from './consoleApi.js'
import { ConsoleEmpty, ConsoleErrorPanel, ConsoleNotLive, ConsoleSkeleton } from './ConsoleStates.jsx'

const WA = {
  threads: '/api/console/wa/threads',
  thread: key => `/api/console/wa/thread/${encodeURIComponent(key)}`,
  send: '/api/console/wa/send',
  takeover: '/api/console/wa/takeover',
}
const TICKETS = '/api/console/tickets'
const MAX_TEXT = 4096
const POLL_MS = 15000
const ROOT = '/admin/superadmin'

function stamp(s) {
  if (typeof s !== 'number' || !Number.isFinite(s)) return '—'
  const d = new Date(s * 1000)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}
function shortStamp(s) {
  if (typeof s !== 'number' || !Number.isFinite(s)) return '—'
  const d = new Date(s * 1000)
  if (Number.isNaN(d.getTime())) return '—'
  return new Date().toDateString() === d.toDateString()
    ? d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}
function roleLabel(role) {
  return { student: 'student', teacher: 'teacher', admin: 'admin', unknown: 'cold number', operator: 'you' }[role] || role || 'cold number'
}

const FILTERS = [
  ['all', 'All'], ['attention', 'Needs attention'], ['student', 'Students'], ['unknown', 'Cold numbers'], ['open', 'Window open'],
]

function ThreadBadges({ t }) {
  const now = Date.now() / 1000
  return (
    <span style={{ display: 'flex', gap: 5, marginTop: 5, flexWrap: 'wrap' }}>
      <span className="em-badge">{roleLabel(t.role)}</span>
      {t.window_open
        ? <span className="em-badge em-badge-good" title={`Open until ${stamp(t.window_expires_at)}`}>can reply</span>
        : <span className="em-badge" title={t.window_expires_at ? `Closed ${stamp(t.window_expires_at)}` : 'never wrote in'}>window closed</span>}
      {t.takeover_until > now && <span className="em-badge em-badge-area">you have it</span>}
      {t.strikes > 0 && <span className={`em-badge ${t.muted_until > now ? 'em-badge-bad' : 'em-badge-warn'}`}>
        {t.muted_until > now ? 'muted' : `${t.strikes} strike${t.strikes > 1 ? 's' : ''}`}
      </span>}
      {t.needs_human && <span className="em-badge em-badge-warn">asked for a human</span>}
    </span>
  )
}

function ThreadList({ threads, selected, onSelect, filter, setFilter, query, setQuery }) {
  return (
    <div className="sa-card" style={{ overflow: 'hidden' }}>
      <div className="sa-card-header">
        <h2>Conversations</h2>
        <span className="sa-toolbar-count">{threads.length}</span>
      </div>
      <div className="em-bj-filters">
        {FILTERS.map(([k, label]) => (
          <button key={k} type="button" className="sa-chip" aria-current={filter === k ? 'true' : undefined} onClick={() => setFilter(k)}>{label}</button>
        ))}
      </div>
      <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--sa-border)' }}>
        <input className="sa-input" style={{ width: '100%' }} placeholder="Search name, number or last message…" value={query} onChange={e => setQuery(e.target.value)} />
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, maxHeight: '58vh', overflowY: 'auto' }}>
        {threads.length === 0 && <li style={{ padding: 14, color: 'var(--sa-text-muted)', fontSize: 13 }}>Nothing matches.</li>}
        {threads.map(t => (
          <li key={t.account_key}>
            <button type="button" className="em-bj-thread" aria-current={selected === t.account_key ? 'true' : undefined} onClick={() => onSelect(t.account_key)}>
              <span className="em-bj-top">
                <span className="em-bj-who">{t.name || t.phone}</span>
                <span className="em-bj-when">{shortStamp(t.last_ts)}</span>
              </span>
              <span className="em-bj-snip">{t.last_direction === 'out' ? '↩ ' : ''}{t.last_text || '—'}</span>
              <ThreadBadges t={t} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function messageKind(m) {
  const txt = m.text || ''
  if (m.kind === 'tool') return 'tool'
  if (/^\[(abuse|takeover|study|pkg|unk|about|superseded)/.test(txt)) return 'sys'
  return m.direction
}

function Conversation({ accountKey, thread, onChanged }) {
  const [token, setToken] = useState(0)
  const [result, setResult] = useState(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState(null)
  const logRef = useRef(null)

  useEffect(() => {
    let alive = true
    setSendError(null)
    consoleGet(WA.thread(accountKey))
      .then(data => { if (alive) setResult({ key: accountKey, token, data, error: null }) })
      .catch(error => { if (alive) setResult({ key: accountKey, token, data: null, error }) })
    return () => { alive = false }
  }, [accountKey, token])
  useEffect(() => { const h = setInterval(() => setToken(v => v + 1), POLL_MS); return () => clearInterval(h) }, [])
  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight }, [result])

  const current = result?.key === accountKey ? result : null
  const data = current ? current.data : null
  const error = current ? current.error : null
  const reload = useCallback(() => setToken(v => v + 1), [])
  const now = Date.now() / 1000
  const taken = thread && thread.takeover_until > now

  async function send(e) {
    e.preventDefault()
    const text = draft.trim()
    if (!text || sending) return
    setSending(true); setSendError(null)
    try { await consolePost(WA.send, { account_key: accountKey, text }); setDraft(''); reload(); onChanged() }
    catch (err) { setSendError(err) } finally { setSending(false) }
  }
  async function toggleTakeover() {
    setBusy(true); setNotice(null)
    try {
      await consolePost(WA.takeover, { account_key: accountKey, on: !taken })
      setNotice(!taken ? 'You have this conversation. Bajla will stay quiet here for 24 hours or until you hand it back.' : 'Handed back to Bajla.')
      onChanged()
    } catch (err) { setNotice(`Could not change takeover: ${err.message || err}`) } finally { setBusy(false) }
  }
  async function makeTicket() {
    setBusy(true); setNotice(null)
    const last = (data?.messages || []).filter(m => m.direction === 'in' && m.text && !m.text.startsWith('[')).slice(-3)
    try {
      const t = await consolePost(TICKETS, {
        subject: `WhatsApp: ${thread?.name || thread?.phone || accountKey}`,
        body: last.map(m => `${stamp(m.ts)} · ${m.text}`).join('\n'),
        kind: thread?.strikes ? 'abuse' : 'issue', source: 'whatsapp', priority: thread?.strikes ? 'high' : 'normal',
        phone: accountKey, name: thread?.name || '', role: thread?.role || '', tags: ['whatsapp'],
      })
      setNotice(`Ticket #${t.id} created.`)
    } catch (err) { setNotice(`Could not create the ticket: ${err.message || err}`) } finally { setBusy(false) }
  }

  if (error) return <div className="sa-card" style={{ padding: 12 }}>{error.notLive ? <ConsoleNotLive endpoint={WA.thread(accountKey)} /> : <ConsoleErrorPanel error={error} onRetry={reload} />}</div>
  if (data === null) return <div className="sa-card"><ConsoleSkeleton rows={8} label="Loading messages…" /></div>

  const open = Boolean(data.window_open)
  const remaining = MAX_TEXT - draft.length

  return (
    <div className="sa-card" style={{ overflow: 'hidden' }}>
      <div className="sa-card-header" style={{ gap: 8, flexWrap: 'wrap' }}>
        <div style={{ marginRight: 'auto' }}>
          <h2 style={{ margin: 0 }}>{thread?.name || data.phone}</h2>
          <small style={{ color: 'var(--sa-text-muted)' }}>{data.phone} · {roleLabel(thread?.role)}{thread?.student_slug ? ` · ${thread.student_slug}` : ''}</small>
        </div>
        {thread && <ThreadBadges t={thread} />}
        <button type="button" className={`sa-btn sa-btn-sm ${taken ? 'sa-btn-primary' : 'sa-btn-ghost'}`} disabled={busy} onClick={toggleTakeover}
          title={taken ? 'Hand the conversation back to Bajla' : 'Bajla goes quiet on this thread so you can reply yourself'}>
          <span className="material-symbols-outlined" aria-hidden="true">{taken ? 'smart_toy' : 'front_hand'}</span>
          {taken ? 'Hand back to Bajla' : 'Take over'}
        </button>
        <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" disabled={busy} onClick={makeTicket}>
          <span className="material-symbols-outlined" aria-hidden="true">confirmation_number</span>Make a ticket
        </button>
        <Link className="sa-btn sa-btn-ghost sa-btn-sm" to={`${ROOT}/bajla/tickets?phone=${encodeURIComponent(accountKey)}`}>
          <span className="material-symbols-outlined" aria-hidden="true">list</span>Tickets
        </Link>
        <button type="button" className="sa-icon-btn sa-icon-btn-sm" onClick={reload} aria-label="Reload"><span className="material-symbols-outlined">refresh</span></button>
      </div>

      {notice && <p style={{ margin: 0, padding: '8px 12px', background: 'var(--area-soft)', fontSize: 13 }}>{notice}</p>}
      {taken && !notice && <p style={{ margin: 0, padding: '8px 12px', background: 'var(--area-soft)', fontSize: 13 }}>
        <strong>You have this conversation.</strong> Bajla is quiet here until {stamp(thread.takeover_until)} (taken by {thread.takeover_by || 'an operator'}).
      </p>}

      <div className="em-bj-log" ref={logRef}>
        {data.messages.map(m => {
          const k = messageKind(m)
          if (k === 'tool') return <span className="em-bj-sys" key={m.id}>⚙ {m.tool_name} · {stamp(m.ts)}</span>
          if (k === 'sys') return <span className="em-bj-sys" key={m.id}>{m.text} · {stamp(m.ts)}</span>
          return (
            <span className={`em-bj-bubble ${m.direction === 'in' ? 'em-bj-in' : 'em-bj-out'}`} key={m.id}>
              {m.text || '(no text — media or a tap)'}
              <span className="em-bj-meta">
                {stamp(m.ts)}{m.direction === 'out' && (m.sent_by ? ` · ${m.sent_by}` : ' · Bajla')}{m.send_kind && m.send_kind !== 'text' ? ` · ${m.send_kind}` : ''}
              </span>
            </span>
          )
        })}
      </div>

      <form onSubmit={send} style={{ borderTop: '1px solid var(--sa-border)', padding: 12 }}>
        <label className="sa-sr-only" htmlFor="em-bj-draft">Reply</label>
        <textarea id="em-bj-draft" className="sa-input" rows={3} style={{ width: '100%', resize: 'vertical' }} maxLength={MAX_TEXT}
          placeholder={open ? (taken ? 'Reply as yourself (sent from Bajla’s number)…' : 'Reply as Bajla…') : 'The 24-hour window is closed'}
          value={draft} disabled={!open || sending} onChange={e => setDraft(e.target.value)} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
          <button type="submit" className="sa-btn sa-btn-primary" disabled={!open || sending || !draft.trim()}>
            <span className="material-symbols-outlined" aria-hidden="true">send</span>{sending ? 'Sending…' : 'Send'}
          </button>
          <span className="sa-toolbar-count">{remaining} left</span>
          <span style={{ fontSize: 11, color: 'var(--sa-text-muted)', marginLeft: 'auto' }}>
            {open ? <>window closes {stamp(data.window_expires_at)}</> : (data.window_expires_at ? <>closed {stamp(data.window_expires_at)} · reopens when they write</> : <>they have never written in</>)}
          </span>
        </div>
        {sendError && <div style={{ marginTop: 8 }}><ConsoleErrorPanel error={sendError} /></div>}
      </form>
    </div>
  )
}

export default function ConsoleBajla() {
  const [token, setToken] = useState(0)
  const [result, setResult] = useState(null)
  const [selected, setSelected] = useState('')
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')

  useEffect(() => {
    let alive = true
    consoleGet(WA.threads)
      .then(data => { if (alive) setResult({ token, data, error: null }) })
      .catch(error => { if (alive) setResult({ token, data: null, error }) })
    return () => { alive = false }
  }, [token])
  useEffect(() => { const h = setInterval(() => setToken(v => v + 1), POLL_MS); return () => clearInterval(h) }, [])
  const reload = useCallback(() => setToken(v => v + 1), [])

  const data = result?.data || null
  const error = result?.error || null
  const all = data?.threads || []
  const now = Date.now() / 1000
  const threads = useMemo(() => {
    const q = query.trim().toLowerCase()
    return all.filter(t => {
      if (filter === 'attention' && !(t.strikes > 0 || t.needs_human || t.takeover_until > now || (t.window_open && t.last_direction === 'in'))) return false
      if (filter === 'student' && t.role !== 'student') return false
      if (filter === 'unknown' && t.role !== 'unknown') return false
      if (filter === 'open' && !t.window_open) return false
      if (q && !`${t.name || ''} ${t.phone || ''} ${t.last_text || ''}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [all, filter, query, now])
  const active = threads.find(t => t.account_key === selected) || threads[0] || null
  const attention = all.filter(t => t.strikes > 0 || t.needs_human || (t.window_open && t.last_direction === 'in')).length

  return (
    <>
      <div className="sa-page-header">
        <div>
          <h1>Bajla</h1>
          <p>Every conversation on Bajla&rsquo;s WhatsApp number, live. Take over any thread to reply yourself, or turn it into a ticket. Refreshes every 15 seconds.</p>
        </div>
        <div className="sa-page-header-actions">
          {attention > 0 && <span className="em-badge em-badge-warn">{attention} need{attention === 1 ? 's' : ''} attention</span>}
          <Link className="sa-btn sa-btn-ghost sa-btn-sm" to={`${ROOT}/bajla/tickets`}><span className="material-symbols-outlined" aria-hidden="true">confirmation_number</span>Tickets</Link>
          <button type="button" className="sa-icon-btn" onClick={reload} aria-label="Reload"><span className="material-symbols-outlined">refresh</span></button>
        </div>
      </div>
      {error ? (error.notLive ? <ConsoleNotLive endpoint={WA.threads} /> : <ConsoleErrorPanel error={error} onRetry={reload} />)
        : data === null ? <ConsoleSkeleton rows={6} label="Loading conversations…" />
        : all.length === 0 ? <ConsoleEmpty icon="forum" title="No conversations yet" hint={<p>A thread appears the moment somebody writes to Bajla.</p>} />
        : (
          <div className="em-bj">
            <ThreadList threads={threads} selected={active?.account_key} onSelect={setSelected} filter={filter} setFilter={setFilter} query={query} setQuery={setQuery} />
            {active ? <Conversation accountKey={active.account_key} thread={active} onChanged={reload} /> : <div className="sa-card" style={{ padding: 14 }}>Pick a conversation.</div>}
          </div>
        )}
    </>
  )
}
