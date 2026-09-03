// ConsoleWhatsApp — Bajla's WhatsApp threads, and the one place a human replies
// as her.
//
// The data is bajla-router's own event log, read server-side over a read-only
// SQLite connection; the browser never sees the Meta token and the send goes
// through the router's loopback bridge, not through this app.
//
// THE 24-HOUR WINDOW IS THE WHOLE UX PROBLEM. Meta only accepts a free-form
// message inside the customer service window, which opens when the person
// writes to us and lasts 24 hours from THAT message. Outside it the only thing
// that can be delivered is an approved template, and this WhatsApp account has
// none. So a closed thread does not get a composer that fails at the Graph
// call — it gets a disabled composer that says the exact time the window shut.
//
// Two honesty notes that belong on the screen, not just in a commit message:
//   1. The window is computed from the last INBOUND row. Until the router logs
//      every inbound (including button and list taps) the clock can read older
//      than it really is, never newer — so the composer errs shut, not open.
//   2. Bajla's money guard polices the MODEL, not a person. Anything typed here
//      is delivered verbatim, including a price she would be forbidden to state.

import { useCallback, useEffect, useState } from 'react'
import { consoleGet, consolePost } from './consoleApi.js'
import { ConsoleEmpty, ConsoleErrorPanel, ConsoleNotLive, ConsoleSkeleton } from './ConsoleStates.jsx'

const WA = {
  threads: '/api/console/wa/threads',
  thread: key => `/api/console/wa/thread/${encodeURIComponent(key)}`,
  send: '/api/console/wa/send',
}

const MAX_TEXT = 4096   // Meta's text.body cap. Longer is rejected, not truncated.

// Layout only. The two-pane grid needs a media query, which an inline style
// cannot express; everything else uses console.css primitives.
const LAYOUT_CSS = `
.em-wa { display: grid; gap: 12px; grid-template-columns: minmax(280px, 360px) minmax(340px, 1fr); align-items: start; }
.em-wa > * { min-width: 0; }
@media (max-width: 900px) { .em-wa { grid-template-columns: 1fr; } }
.em-wa-thread { display: block; width: 100%; padding: 9px 12px; border: 0; border-bottom: 1px solid var(--sa-border); background: none; color: var(--sa-text); font: inherit; text-align: left; cursor: pointer; }
.em-wa-thread:hover { background: var(--sa-surface-soft); }
.em-wa-thread[aria-current="true"] { background: var(--sa-violet-100); }
.em-wa-top { display: flex; align-items: baseline; gap: 8px; }
.em-wa-who { flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
.em-wa-when { flex: 0 0 auto; font-size: var(--sa-fs-micro); color: var(--sa-text-muted); font-variant-numeric: tabular-nums; }
.em-wa-snip { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--sa-fs-micro); color: var(--sa-text-muted); }
.em-wa-log { display: flex; flex-direction: column; gap: 8px; padding: 12px; max-height: 58vh; overflow-y: auto; }
.em-wa-bubble { max-width: 78%; padding: 7px 11px; border-radius: 12px; white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.5; }
.em-wa-in  { align-self: flex-start; background: var(--sa-surface-soft); border: 1px solid var(--sa-border); }
.em-wa-out { align-self: flex-end; background: var(--sa-violet-100); }
.em-wa-meta { display: block; margin-top: 3px; font-size: var(--sa-fs-micro); color: var(--sa-text-muted); }
.em-wa-tool { align-self: center; font-size: var(--sa-fs-micro); color: var(--sa-text-muted); font-family: ui-monospace, monospace; }
`

function stamp(seconds) {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return '—'
  const d = new Date(seconds * 1000)
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function shortStamp(seconds) {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return '—'
  const d = new Date(seconds * 1000)
  if (Number.isNaN(d.getTime())) return '—'
  const today = new Date().toDateString() === d.toDateString()
  return today
    ? d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}

export default function ConsoleWhatsApp() {
  const [token, setToken] = useState(0)
  const [result, setResult] = useState(null)
  const [selected, setSelected] = useState('')

  useEffect(() => {
    let alive = true
    consoleGet(WA.threads)
      .then(data => { if (alive) setResult({ token, data, error: null }) })
      .catch(error => { if (alive) setResult({ token, data: null, error }) })
    return () => { alive = false }
  }, [token])

  const current = result?.token === token ? result : null
  const data = current ? current.data : null
  const error = current ? current.error : null
  const reload = useCallback(() => setToken(value => value + 1), [])
  const threads = data?.threads || []

  return (
    <>
      <style>{LAYOUT_CSS}</style>
      <div className="sa-page-header">
        <div>
          <h1>WhatsApp</h1>
          <p>
            Every message in and out of Bajla&rsquo;s number, and the one place to reply as her.
            Replies are only possible inside a contact&rsquo;s 24-hour window &mdash; outside it
            WhatsApp accepts nothing but an approved template, and this account has none yet.
          </p>
        </div>
        <button type="button" className="sa-icon-btn" onClick={reload} aria-label="Reload threads">
          <span className="material-symbols-outlined" aria-hidden="true">refresh</span>
        </button>
      </div>

      {error ? (
        error.notLive
          ? <ConsoleNotLive endpoint={WA.threads} />
          : <ConsoleErrorPanel error={error} onRetry={reload} />
      ) : data === null ? (
        <ConsoleSkeleton rows={6} label="Loading WhatsApp threads…" />
      ) : !threads.length ? (
        <ConsoleEmpty
          icon="forum"
          title="No WhatsApp threads yet"
          hint={
            <p>
              Bajla has never exchanged a message with anyone on this number, or the event log has
              been erased. A thread appears the moment somebody writes in.
            </p>
          }
          action={<button type="button" className="sa-btn sa-btn-ghost" onClick={reload}>Retry</button>}
        />
      ) : (
        <div className="em-wa">
          <ThreadList threads={threads} selected={selected} onSelect={setSelected} />
          <Conversation accountKey={selected || threads[0].account_key} onSent={reload} />
        </div>
      )}
    </>
  )
}

function WindowPill({ open, expiresAt }) {
  return open ? (
    <span className="sa-badge sa-badge-ok" title={`Window closes ${stamp(expiresAt)}`}>
      open until {stamp(expiresAt)}
    </span>
  ) : (
    <span className="sa-badge" title={expiresAt ? `Window closed ${stamp(expiresAt)}` : 'This contact has never written in'}>
      {expiresAt ? `closed ${stamp(expiresAt)}` : 'never opened'}
    </span>
  )
}

function ThreadList({ threads, selected, onSelect }) {
  const active = selected || threads[0].account_key
  return (
    <div className="sa-card" style={{ overflow: 'hidden' }}>
      <div className="sa-card-header">
        <h2>Threads</h2>
        <span className="sa-toolbar-count">{threads.length}</span>
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, maxHeight: '62vh', overflowY: 'auto' }}>
        {threads.map(thread => (
          <li key={thread.account_key}>
            <button
              type="button"
              className="em-wa-thread"
              aria-current={active === thread.account_key ? 'true' : undefined}
              onClick={() => onSelect(thread.account_key)}
            >
              <span className="em-wa-top">
                <span className="em-wa-who">{thread.name || thread.phone}</span>
                <span className="em-wa-when">{shortStamp(thread.last_ts)}</span>
              </span>
              <span className="em-wa-snip">
                {thread.last_direction === 'out' ? '↩ ' : ''}{thread.last_text || '—'}
              </span>
              <span style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                <span className="sa-badge">{thread.role}</span>
                <WindowPill open={thread.window_open} expiresAt={thread.window_expires_at} />
                {thread.needs_human && <span className="sa-badge sa-badge-awaiting_review">needs a human</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Conversation({ accountKey, onSent }) {
  const [token, setToken] = useState(0)
  const [result, setResult] = useState(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState(null)

  useEffect(() => {
    let alive = true
    setResult(null)
    setSendError(null)
    consoleGet(WA.thread(accountKey))
      .then(data => { if (alive) setResult({ key: accountKey, token, data, error: null }) })
      .catch(error => { if (alive) setResult({ key: accountKey, token, data: null, error }) })
    return () => { alive = false }
  }, [accountKey, token])

  const current = result?.key === accountKey && result?.token === token ? result : null
  const data = current ? current.data : null
  const error = current ? current.error : null
  const reload = useCallback(() => setToken(value => value + 1), [])

  async function send(event) {
    event.preventDefault()
    const text = draft.trim()
    if (!text || sending) return
    setSending(true)
    setSendError(null)
    try {
      await consolePost(WA.send, { account_key: accountKey, text })
      setDraft('')
      reload()
      onSent()
    } catch (err) {
      setSendError(err)
    } finally {
      setSending(false)
    }
  }

  if (error) {
    return (
      <div className="sa-card" style={{ padding: 12 }}>
        {error.notLive ? <ConsoleNotLive endpoint={WA.thread(accountKey)} /> : <ConsoleErrorPanel error={error} onRetry={reload} />}
      </div>
    )
  }
  if (data === null) return <div className="sa-card"><ConsoleSkeleton rows={8} label="Loading messages…" /></div>

  const open = Boolean(data.window_open)
  const remaining = MAX_TEXT - draft.length

  return (
    <div className="sa-card" style={{ overflow: 'hidden' }}>
      <div className="sa-card-header" style={{ gap: 8, flexWrap: 'wrap' }}>
        <h2 style={{ marginRight: 'auto' }}>{data.phone}</h2>
        <WindowPill open={open} expiresAt={data.window_expires_at} />
        <button type="button" className="sa-icon-btn sa-icon-btn-sm" onClick={reload} aria-label="Reload this thread">
          <span className="material-symbols-outlined" aria-hidden="true">refresh</span>
        </button>
      </div>

      {data.truncated && (
        <p className="sa-empty-hint" style={{ padding: '6px 12px', margin: 0 }}>
          Showing the most recent messages only &mdash; this thread is longer than one page.
        </p>
      )}

      <div className="em-wa-log">
        {data.messages.map(message => (
          message.kind === 'tool'
            ? <span className="em-wa-tool" key={message.id}>{message.tool_name} &middot; {stamp(message.ts)}</span>
            : (
              <span className={`em-wa-bubble ${message.direction === 'in' ? 'em-wa-in' : 'em-wa-out'}`} key={message.id}>
                {message.text || '(no text — media or an empty message)'}
                <span className="em-wa-meta">
                  {stamp(message.ts)}
                  {message.direction === 'out' && (message.sent_by ? ` · sent by ${message.sent_by}` : ' · Bajla')}
                  {message.send_kind && message.send_kind !== 'text' ? ` · ${message.send_kind}` : ''}
                </span>
              </span>
            )
        ))}
      </div>

      <form onSubmit={send} style={{ borderTop: '1px solid var(--sa-border)', padding: 12 }}>
        <label className="sa-sr-only" htmlFor="em-wa-draft">Reply as Bajla</label>
        <textarea
          id="em-wa-draft"
          className="sa-input"
          rows={3}
          style={{ width: '100%', resize: 'vertical' }}
          maxLength={MAX_TEXT}
          placeholder={open ? 'Reply as Bajla…' : 'The 24-hour window is closed'}
          value={draft}
          disabled={!open || sending}
          aria-describedby="em-wa-send-note"
          onChange={event => setDraft(event.target.value)}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
          <button type="submit" className="sa-btn" disabled={!open || sending || !draft.trim()}>
            <span className="material-symbols-outlined" aria-hidden="true">send</span>
            {sending ? 'Sending…' : 'Send as Bajla'}
          </button>
          <span className="sa-toolbar-count" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {remaining} left
          </span>
        </div>

        {sendError && (
          <div style={{ marginTop: 8 }}>
            <ConsoleErrorPanel error={sendError} />
          </div>
        )}

        <p id="em-wa-send-note" style={{ margin: '8px 0 0', fontSize: 'var(--sa-fs-micro)', color: 'var(--sa-text-muted)', lineHeight: 1.55 }}>
          {open ? (
            <>
              This conversation window closes at <strong>{stamp(data.window_expires_at)}</strong>. The
              message is delivered exactly as typed and logged against your console account. Bajla&rsquo;s
              price guard checks the model, not a person, so anything you quote here goes out unaltered.
            </>
          ) : (
            <>
              Disabled because this conversation window
              {data.window_expires_at ? <> closed at <strong>{stamp(data.window_expires_at)}</strong></> : <> never opened &mdash; this contact has not written in</>}.
              WhatsApp only allows an approved template outside the window, and this account has no
              approved templates yet. The window reopens for 24 hours the moment they message again.
            </>
          )}
        </p>
      </form>
    </div>
  )
}


