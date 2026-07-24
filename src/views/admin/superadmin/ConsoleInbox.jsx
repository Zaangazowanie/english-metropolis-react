// ConsoleInbox — real mail for the four @englishmetro.com mailboxes.
//
// Everything here is READ-ONLY and server-mediated: em-console-api opens IMAP,
// the browser never sees a credential, and no request marks anything seen.
// There is no send endpoint in this slice, so the reply affordance is present
// but visibly disabled with the real reason rather than faked.
//
// Threat model for the reading pane: message HTML is attacker-controlled.
//   1. The plain-text body is what renders by default.
//   2. The API sanitises HTML server-side and flags it html_is_untrusted.
//   3. This screen still treats it as hostile: it goes into an iframe with
//      sandbox="" (no allow-scripts, no allow-same-origin) plus a document CSP
//      that blocks every remote fetch, so tracking pixels do not phone home.
//   dangerouslySetInnerHTML is never used on mail, in any branch.
// Attachments are a manifest only — there is no download endpoint in this slice.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { consoleGet } from './consoleApi.js'
import {
  MAIL, normaliseAccounts, formatBytes, formatCount, formatMailDate, formatMailDateTime, PACING,
} from './commsApi.js'
import { ConsoleEmpty, ConsoleErrorPanel, ConsoleNotLive, ConsoleSkeleton } from './ConsoleStates.jsx'

const PAGE = 50           // never more than a screenful of rows in the DOM
const FOLDER = 'INBOX'    // the only folder this slice exposes

// Layout only. Tokens only. The three-pane grid needs a media query, which an
// inline style cannot express; everything else uses console.css primitives.
const LAYOUT_CSS = `
.em-inbox { display: grid; gap: 12px; grid-template-columns: 232px minmax(320px, 400px) minmax(340px, 1fr); align-items: start; }
.em-inbox > * { min-width: 0; }
@media (max-width: 1180px) { .em-inbox { grid-template-columns: 232px minmax(280px, 1fr); } .em-inbox .em-inbox-read { grid-column: 1 / -1; } }
@media (max-width: 760px) { .em-inbox { grid-template-columns: 1fr; } }
.em-mailbox { display: flex; width: 100%; align-items: center; gap: 8px; padding: 8px 10px; border: 0; border-radius: var(--sa-radius-control); background: none; color: var(--sa-text); font: inherit; text-align: left; cursor: pointer; }
.em-mailbox:hover { background: var(--sa-surface-soft); }
.em-mailbox[aria-pressed="true"] { background: var(--sa-violet-100); color: var(--sa-violet-600); font-weight: 600; }
.em-msg { display: block; width: 100%; padding: 8px 12px; border: 0; border-bottom: 1px solid var(--sa-border); background: none; color: var(--sa-text); font: inherit; text-align: left; cursor: pointer; }
.em-msg:hover { background: var(--sa-surface-soft); }
.em-msg[aria-current="true"] { background: var(--sa-violet-100); }
.em-msg-top { display: flex; align-items: baseline; gap: 8px; }
.em-msg-from { flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.em-msg-date { flex: 0 0 auto; font-size: var(--sa-fs-micro); color: var(--sa-text-muted); font-variant-numeric: tabular-nums; }
.em-msg-sub, .em-msg-snip { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.em-msg-snip { font-size: var(--sa-fs-micro); color: var(--sa-text-muted); }
.em-unread .em-msg-from, .em-unread .em-msg-sub { font-weight: 700; }
.em-mail-frame { width: 100%; height: 460px; border: 1px solid var(--sa-border); border-radius: var(--sa-radius-control); background: var(--sa-surface); }
`

export default function ConsoleInbox() {
  const [view, setView] = useState('mail')

  return (
    <>
      <style>{LAYOUT_CSS}</style>
      <div className="sa-page-header">
        <div>
          <h1>Inbox</h1>
          <p>
            The four @englishmetro.com mailboxes, read server-side over IMAP. Read-only: nothing here
            marks a message seen, and mail credentials never reach the browser.
          </p>
        </div>
      </div>

      <div className="sa-tabs" role="tablist" aria-label="Inbox views" style={{ marginBottom: 12 }}>
        <button type="button" role="tab" aria-selected={view === 'mail'}
          className={`sa-tab${view === 'mail' ? ' is-active' : ''}`} onClick={() => setView('mail')}>
          <span className="material-symbols-outlined" aria-hidden="true">inbox</span>
          Mail
        </button>
        <button type="button" role="tab" aria-selected={view === 'relay'}
          className={`sa-tab${view === 'relay' ? ' is-active' : ''}`} onClick={() => setView('relay')}>
          <span className="material-symbols-outlined" aria-hidden="true">alt_route</span>
          Relay
        </button>
      </div>

      {view === 'mail' ? <MailView /> : <RelayView />}
    </>
  )
}

/* ─────────────────────────────────────────────────────────── mail ───────── */

function MailView() {
  const [accountsToken, setAccountsToken] = useState(0)
  const [accountsResult, setAccountsResult] = useState(null)
  const [chosen, setChosen] = useState('')           // '' = first mailbox
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [offset, setOffset] = useState(0)
  const [listToken, setListToken] = useState(0)
  const [listResult, setListResult] = useState(null)
  const [selected, setSelected] = useState(null)     // { uid }
  const rowRefs = useRef([])

  useEffect(() => {
    let alive = true
    consoleGet(MAIL.accounts)
      .then(data => { if (alive) setAccountsResult({ token: accountsToken, rows: normaliseAccounts(data), error: null }) })
      .catch(err => { if (alive) setAccountsResult({ token: accountsToken, rows: [], error: err }) })
    return () => { alive = false }
  }, [accountsToken])

  const accountsCurrent = accountsResult?.token === accountsToken ? accountsResult : null
  const accounts = accountsCurrent ? accountsCurrent.rows : null
  const accountsError = accountsCurrent ? accountsCurrent.error : null
  const loadAccounts = useCallback(() => setAccountsToken(value => value + 1), [])

  // Which mailbox is open is derived, not stored: before the accounts land
  // there is nothing to select, and afterwards the first one is the default.
  const address = chosen || accounts?.[0]?.address || ''

  const listRequest = useMemo(
    () => ({ address, offset, search, token: listToken }),
    [address, offset, search, listToken],
  )

  useEffect(() => {
    if (!listRequest.address) return undefined
    let alive = true
    consoleGet(MAIL.messages, {
      address: listRequest.address, folder: FOLDER, limit: PAGE,
      offset: listRequest.offset, q: listRequest.search || undefined,
    })
      .then(data => { if (alive) setListResult({ request: listRequest, data, error: null }) })
      .catch(err => { if (alive) setListResult({ request: listRequest, data: null, error: err }) })
    return () => { alive = false }
  }, [listRequest])

  const listCurrent = listResult?.request === listRequest ? listResult : null
  const list = listCurrent ? listCurrent.data : null
  const listError = listCurrent ? listCurrent.error : null
  const loadList = useCallback(() => setListToken(value => value + 1), [])

  // Changing mailbox or search starts over at the newest page with nothing open.
  function openMailbox(next) {
    setChosen(next)
    setOffset(0)
    setSelected(null)
  }
  function runSearch(next) {
    setSearch(next)
    setOffset(0)
    setSelected(null)
  }

  const rows = list?.rows || []
  const total = typeof list?.total === 'number' ? list.total : null

  function onListKeyDown(event) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    const index = rowRefs.current.indexOf(document.activeElement)
    if (index < 0) return
    const next = index + (event.key === 'ArrowDown' ? 1 : -1)
    const target = rowRefs.current[next]
    if (!target) return
    event.preventDefault()
    target.focus()
  }

  if (accountsError) {
    return accountsError.notLive
      ? <ConsoleNotLive endpoint={MAIL.accounts} />
      : <ConsoleErrorPanel error={accountsError} onRetry={loadAccounts} />
  }
  if (accounts === null) return <ConsoleSkeleton rows={6} label="Loading mailboxes…" />
  if (!accounts.length) {
    return (
      <ConsoleEmpty
        icon="mail_off"
        title="No mailbox is exposed to the console"
        hint={
          <p>
            em-console-api allowlists the four @englishmetro.com addresses in code. If none are listed,
            the mail service is not reachable from the API host.
          </p>
        }
        action={<button type="button" className="sa-btn sa-btn-ghost" onClick={loadAccounts}>Retry</button>}
      />
    )
  }

  return (
    <div className="em-inbox">
      <MailboxRail accounts={accounts} address={address} onSelect={setAddress} onRefresh={loadAccounts} />

      <div className="sa-card" style={{ overflow: 'hidden' }}>
        <div className="sa-card-header" style={{ gap: 8 }}>
          <form
            style={{ flex: '1 1 auto', display: 'flex', gap: 6 }}
            onSubmit={event => { event.preventDefault(); setSearch(query.trim()) }}
          >
            <label className="sa-sr-only" htmlFor="em-mail-q">Search this mailbox</label>
            <input id="em-mail-q" type="search" className="sa-input" placeholder="Search sender, subject…"
              value={query} onChange={event => setQuery(event.target.value)} />
            <button type="submit" className="sa-btn sa-btn-ghost">Search</button>
          </form>
          <button type="button" className="sa-icon-btn" onClick={loadList} aria-label="Reload messages">
            <span className="material-symbols-outlined" aria-hidden="true">refresh</span>
          </button>
        </div>

        {listError ? (
          <div style={{ padding: 12 }}>
            {listError.notLive
              ? <ConsoleNotLive endpoint={MAIL.messages} />
              : <ConsoleErrorPanel error={listError} onRetry={loadList} />}
          </div>
        ) : list === null ? (
          <ConsoleSkeleton rows={8} label="Loading messages…" />
        ) : !rows.length ? (
          <ConsoleEmpty
            icon="mark_email_read"
            title={search ? 'No messages match that search' : 'This mailbox is empty'}
            hint={
              <p>
                {search
                  ? 'IMAP searched the whole folder, not just this page. Clear the search to go back to the newest mail.'
                  : `${FOLDER} on ${address} holds no messages.`}
              </p>
            }
          />
        ) : (
          <>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, maxHeight: '62vh', overflowY: 'auto' }}
              onKeyDown={onListKeyDown}>
              {rows.map((row, index) => (
                <li key={`${row.uid}-${index}`}>
                  <button
                    type="button"
                    ref={element => { rowRefs.current[index] = element }}
                    className={`em-msg${row.seen ? '' : ' em-unread'}`}
                    aria-current={selected?.uid === row.uid ? 'true' : undefined}
                    onClick={() => setSelected({ uid: row.uid })}
                  >
                    <span className="em-msg-top">
                      {!row.seen && (
                        <span aria-hidden="true" style={{
                          width: 6, height: 6, borderRadius: '50%', flex: '0 0 auto',
                          background: 'var(--sa-violet-600)',
                        }} />
                      )}
                      <span className="em-msg-from">
                        {row.from?.name || row.from?.email || '(no sender)'}
                        {!row.seen && <span className="sa-sr-only"> — unread</span>}
                      </span>
                      <span className="em-msg-date">{formatMailDate(row.date_iso)}</span>
                    </span>
                    <span className="em-msg-sub" style={{ display: 'block' }}>{row.subject || '(no subject)'}</span>
                    <span className="em-msg-snip" style={{ display: 'block' }}>{rowSnippet(row)}</span>
                  </button>
                </li>
              ))}
            </ul>
            <div className="sa-card-header" style={{ borderBottom: 0, borderTop: '1px solid var(--sa-border)' }}>
              <span className="sa-toolbar-count">
                {total === null
                  ? `${formatCount(rows.length)} shown`
                  : `${formatCount(offset + 1)}–${formatCount(offset + rows.length)} of ${formatCount(total)}`}
              </span>
              <span style={{ display: 'flex', gap: 6 }}>
                <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" disabled={offset === 0}
                  onClick={() => { setOffset(Math.max(0, offset - PAGE)); setSelected(null) }}>
                  Newer
                </button>
                <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm"
                  disabled={total !== null ? offset + rows.length >= total : rows.length < PAGE}
                  onClick={() => { setOffset(offset + PAGE); setSelected(null) }}>
                  Older
                </button>
              </span>
            </div>
          </>
        )}
      </div>

      <div className="em-inbox-read">
        <ReadingPane address={address} uid={selected?.uid} />
      </div>
    </div>
  )
}

// /mail/messages returns envelope headers; it carries no body preview. If the
// endpoint later adds one it is used, otherwise the recipient line stands in —
// nothing is invented to fill the slot.
function rowSnippet(row) {
  if (row.snippet || row.preview) return row.snippet || row.preview
  const to = (row.to || []).map(t => t.email).filter(Boolean)
  return to.length ? `to ${to.slice(0, 2).join(', ')}${to.length > 2 ? ` +${to.length - 2}` : ''}` : '—'
}

function MailboxRail({ accounts, address, onSelect, onRefresh }) {
  return (
    <div className="sa-card">
      <div className="sa-card-header">
        <h2>Mailboxes</h2>
        <button type="button" className="sa-icon-btn sa-icon-btn-sm" onClick={onRefresh} aria-label="Refresh unread counts">
          <span className="material-symbols-outlined" aria-hidden="true">refresh</span>
        </button>
      </div>
      <div style={{ padding: 6 }}>
        {accounts.map(account => (
          <button
            key={account.address}
            type="button"
            className="em-mailbox"
            aria-pressed={account.address === address}
            onClick={() => onSelect(account.address)}
          >
            <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 17 }}>
              {account.unread ? 'mark_email_unread' : 'mail'}
            </span>
            <span style={{ flex: '1 1 auto', minWidth: 0 }}>
              <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {account.address.split('@')[0]}
              </span>
              <span style={{ display: 'block', fontSize: 'var(--sa-fs-micro)', color: 'var(--sa-text-muted)', fontWeight: 400 }}>
                {account.error ? `unreachable (${account.error})` : `${formatCount(account.total)} total`}
              </span>
            </span>
            <span className="sa-badge sa-num" title="Unread">
              {formatCount(account.unread)}
              <span className="sa-sr-only"> unread</span>
            </span>
          </button>
        ))}
      </div>
      <div style={{ padding: '10px 14px', borderTop: '1px solid var(--sa-border)' }}>
        <p style={{ margin: 0, fontSize: 'var(--sa-fs-micro)', color: 'var(--sa-text-muted)', lineHeight: 1.55 }}>
          {FOLDER} only in this slice. All ten mailboxes on the host share one password, so the API
          allowlists these four addresses in code and never returns a credential.
        </p>
      </div>
    </div>
  )
}

/* ────────────────────────────────────────────────── reading pane ────────── */

function ReadingPane({ address, uid }) {
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)
  const [showHtml, setShowHtml] = useState(false)

  const load = useCallback(() => {
    if (!address || !uid) return
    setMessage(null)
    setError(null)
    consoleGet(MAIL.message, { address, folder: FOLDER, uid, html: 1 })
      .then(setMessage)
      .catch(setError)
  }, [address, uid])

  useEffect(load, [load])
  useEffect(() => { setShowHtml(false) }, [uid])

  if (!uid) {
    return (
      <div className="sa-card">
        <ConsoleEmpty
          icon="drafts"
          title="No message selected"
          hint={<p>Pick a message from the list. Arrow keys move through it; Enter opens the focused row.</p>}
        />
      </div>
    )
  }
  if (error) {
    return (
      <div className="sa-card" style={{ padding: 12 }}>
        {error.notLive ? <ConsoleNotLive endpoint={MAIL.message} /> : <ConsoleErrorPanel error={error} onRetry={load} />}
      </div>
    )
  }
  if (message === null) return <div className="sa-card"><ConsoleSkeleton rows={6} label="Loading message…" /></div>

  const attachments = message.attachments || []

  return (
    <div className="sa-card">
      <div className="sa-card-header" style={{ flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ whiteSpace: 'normal' }}>{message.subject || '(no subject)'}</h2>
          <p style={{ margin: '4px 0 0', fontSize: 'var(--sa-fs-small)', color: 'var(--sa-text-muted)' }}>
            {message.from?.name ? `${message.from.name} · ` : ''}{message.from?.email || 'unknown sender'}
          </p>
        </div>
        <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {!message.seen && <span className="sa-badge sa-badge-processing">Unread</span>}
          {message.flagged && <span className="sa-badge sa-badge-awaiting_review">Flagged</span>}
          {message.answered && <span className="sa-badge sa-badge-committed">Answered</span>}
        </span>
      </div>

      <div className="sa-card-body" style={{ display: 'grid', gap: 12 }}>
        <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2px 10px', margin: 0, fontSize: 'var(--sa-fs-small)' }}>
          <Meta label="To" value={addressLine(message.to)} />
          {(message.cc || []).length > 0 && <Meta label="Cc" value={addressLine(message.cc)} />}
          {(message.reply_to || []).length > 0 && <Meta label="Reply-to" value={addressLine(message.reply_to)} />}
          <Meta label="Date" value={formatMailDateTime(message.date_iso)} />
          <Meta label="Size" value={formatBytes(message.size)} />
        </dl>

        {(message.truncated || message.oversize) && (
          <p role="status" style={{
            margin: 0, padding: '7px 10px', borderRadius: 'var(--sa-radius-control)',
            background: 'var(--sa-warm-soft)', color: 'var(--sa-warm-ink)',
            fontSize: 'var(--sa-fs-small)', fontWeight: 600,
          }}>
            {message.oversize
              ? 'Over the fetch limit — headers only were pulled, the body was not loaded.'
              : 'Body truncated by the API at its character limit.'}
          </p>
        )}

        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className={`sa-btn sa-btn-sm ${showHtml ? 'sa-btn-ghost' : 'sa-btn-primary'}`}
            onClick={() => setShowHtml(false)} aria-pressed={!showHtml}>
            Plain text
          </button>
          <button type="button" className={`sa-btn sa-btn-sm ${showHtml ? 'sa-btn-primary' : 'sa-btn-ghost'}`}
            onClick={() => setShowHtml(true)} aria-pressed={showHtml} disabled={!message.has_html}>
            Original HTML
          </button>
          <span style={{ fontSize: 'var(--sa-fs-micro)', color: 'var(--sa-text-muted)' }}>
            {message.has_html
              ? 'HTML is sanitised server-side and still rendered sandboxed, with remote loads blocked.'
              : 'This message has no HTML part.'}
          </span>
        </div>

        {showHtml && message.has_html ? <HtmlBody html={message.html_untrusted} /> : <TextBody text={message.text} />}

        <Attachments attachments={attachments} />

        <div style={{ borderTop: '1px solid var(--sa-border)', paddingTop: 10 }}>
          <button type="button" className="sa-btn sa-btn-ghost" disabled aria-describedby="em-send-off">
            <span className="material-symbols-outlined" aria-hidden="true">reply</span>
            Reply
          </button>
          <p id="em-send-off" style={{ margin: '6px 0 0', fontSize: 'var(--sa-fs-micro)', color: 'var(--sa-text-muted)', lineHeight: 1.55 }}>
            Disabled because no send endpoint exists yet. When one ships, every send passes the outreach
            pacing guard first — max {PACING.dailyCap} per rolling 24h, at least {PACING.minGapMinutes} minutes
            apart — and bulk send stays off until Mike enables it explicitly.
          </p>
        </div>
      </div>
    </div>
  )
}

function Meta({ label, value }) {
  return (
    <>
      <dt style={{ color: 'var(--sa-text-muted)' }}>{label}</dt>
      <dd style={{ margin: 0, color: 'var(--sa-text)', wordBreak: 'break-word' }}>{value}</dd>
    </>
  )
}

function addressLine(list) {
  const items = (list || []).map(a => (a.name ? `${a.name} <${a.email}>` : a.email)).filter(Boolean)
  return items.length ? items.join(', ') : '—'
}

function TextBody({ text }) {
  if (!text) {
    return (
      <p style={{ margin: 0, fontSize: 'var(--sa-fs-small)', color: 'var(--sa-text-muted)' }}>
        This message has no plain-text part.
      </p>
    )
  }
  return (
    <pre style={{
      margin: 0, padding: 12, maxHeight: '46vh', overflow: 'auto',
      background: 'var(--sa-surface-soft)', border: '1px solid var(--sa-border)',
      borderRadius: 'var(--sa-radius-control)', color: 'var(--sa-text)',
      font: 'inherit', whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.6,
    }}>
      {text}
    </pre>
  )
}

// The second of the two controls the API docstring asks for. sandbox="" is the
// maximally restrictive value: no scripts, no same-origin, no forms, no
// navigation. The injected CSP additionally stops remote images, fonts and
// stylesheets, which is what a tracking pixel needs to work.
function HtmlBody({ html }) {
  const srcDoc = useMemo(() => {
    const body = typeof html === 'string' ? html : ''
    // The frame is its own document, so .sa-root's custom properties do not
    // cascade into it. The two values it needs are read back off the live token
    // block rather than restated as literals; if the lookup fails the frame just
    // uses the browser default instead of a hardcoded colour.
    const ink = readToken('--sa-text')
    const paper = readToken('--sa-surface')
    const colours = [ink && `color:${ink}`, paper && `background:${paper}`].filter(Boolean).join(';')
    return [
      '<!doctype html><html><head><meta charset="utf-8">',
      '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:; style-src \'unsafe-inline\'; font-src data:">',
      `<style>html,body{margin:0;padding:12px;font:13px/1.6 system-ui,sans-serif;${colours};word-break:break-word}img{max-width:100%}</style>`,
      '</head><body>', body, '</body></html>',
    ].join('')
  }, [html])

  if (!html) {
    return (
      <p role="status" style={{ margin: 0, fontSize: 'var(--sa-fs-small)', color: 'var(--sa-text-muted)' }}>
        The API reported an HTML part but returned no sanitised HTML for it. Nothing is rendered rather
        than guessing at the content.
      </p>
    )
  }
  return (
    <div>
      <iframe
        className="em-mail-frame"
        title="Original HTML message (untrusted, sandboxed)"
        sandbox=""
        referrerPolicy="no-referrer"
        srcDoc={srcDoc}
      />
      <p style={{ margin: '4px 0 0', fontSize: 'var(--sa-fs-micro)', color: 'var(--sa-text-muted)' }}>
        Scripts, remote images and links are all inert inside this frame.
      </p>
    </div>
  )
}

function readToken(name) {
  if (typeof document === 'undefined') return ''
  const scope = document.querySelector('.sa-root')
  if (!scope) return ''
  return getComputedStyle(scope).getPropertyValue(name).trim()
}

function Attachments({ attachments }) {
  if (!attachments.length) return null
  return (
    <div>
      <p className="sa-stat-label" style={{ marginBottom: 6 }}>
        Attachments ({attachments.length}) — manifest only, no download endpoint in this slice
      </p>
      <div className="sa-table-wrap">
        <table className="sa-table">
          <caption className="sa-sr-only">Attachment manifest</caption>
          <thead>
            <tr>
              <th scope="col">File</th>
              <th scope="col">Type</th>
              <th scope="col" style={{ textAlign: 'right' }}>Size</th>
            </tr>
          </thead>
          <tbody>
            {attachments.map((attachment, index) => (
              <tr key={`${attachment.filename}-${index}`}>
                <td style={{ wordBreak: 'break-all' }}>
                  {attachment.filename}
                  {attachment.inline && <span className="sa-badge" style={{ marginLeft: 6 }}>inline</span>}
                </td>
                <td style={{ color: 'var(--sa-text-muted)' }}>{attachment.content_type || '—'}</td>
                <td className="sa-num">{formatBytes(attachment.size)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ margin: '4px 0 0', fontSize: 'var(--sa-fs-micro)', color: 'var(--sa-text-muted)' }}>
        Sizes are estimated from the encoded payload, not decoded bytes.
      </p>
    </div>
  )
}

/* ──────────────────────────────────────────────────────── relay ─────────── */

function RelayView() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  const load = useCallback(() => {
    setData(null)
    setError(null)
    consoleGet(MAIL.directory).then(setData).catch(setError)
  }, [])

  useEffect(load, [load])

  if (error) {
    return error.notLive
      ? <ConsoleNotLive endpoint={MAIL.directory} />
      : <ConsoleErrorPanel error={error} onRetry={load} />
  }
  if (data === null) return <ConsoleSkeleton rows={6} label="Loading mail directory…" />

  const mailboxes = data.mailboxes || []
  const relays = data.gmail_relays || []
  const forwards = data.forwards || []
  const catchAll = data.catch_all

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="sa-card">
        <div className="sa-card-header">
          <h2>{data.domain || 'englishmetro.com'} mailboxes</h2>
          <span className="sa-toolbar-count">{formatCount(mailboxes.length)} accounts</span>
        </div>
        {mailboxes.length ? (
          <div className="sa-table-wrap">
            <table className="sa-table">
              <thead>
                <tr>
                  <th scope="col">Address</th>
                  <th scope="col">Name</th>
                  <th scope="col">Console</th>
                </tr>
              </thead>
              <tbody>
                {mailboxes.map(box => (
                  <tr key={box.email}>
                    <td>{box.email}</td>
                    <td style={{ color: 'var(--sa-text-muted)' }}>{box.name || '—'}</td>
                    <td>
                      {box.console_visible
                        ? <span className="sa-badge sa-badge-committed">readable</span>
                        : <span className="sa-badge">not allowlisted</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <ConsoleEmpty icon="mail_off" title="No active accounts on this domain"
            hint={<p>The mail directory lists no active englishmetro.com account.</p>} />
        )}
      </div>

      <div className="sa-card">
        <div className="sa-card-header">
          <h2>Fan-out to Gmail</h2>
          <span className="sa-toolbar-count">{formatCount(relays.length)} relays</span>
        </div>
        {relays.length ? (
          <div className="sa-table-wrap">
            <table className="sa-table">
              <thead>
                <tr>
                  <th scope="col">Source</th>
                  <th scope="col">Destinations</th>
                  <th scope="col">Local copy</th>
                </tr>
              </thead>
              <tbody>
                {relays.map(relay => (
                  <tr key={relay.source}>
                    <td>{relay.source}</td>
                    <td style={{ color: 'var(--sa-text-muted)', wordBreak: 'break-word' }}>
                      {(relay.destinations || []).join(', ') || '—'}
                    </td>
                    <td>
                      {relay.keeps_local_copy
                        ? <span className="sa-badge sa-badge-committed">kept</span>
                        : <span className="sa-badge sa-badge-awaiting_review">forward only</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <ConsoleEmpty icon="alt_route" title="No address relays to Gmail"
            hint={<p>No active alias on this domain forwards to {data.gmail_relay_target || 'the Gmail relay'}.</p>} />
        )}
        <div style={{ padding: '10px 16px', borderTop: '1px solid var(--sa-border)' }}>
          <p style={{ margin: 0, fontSize: 'var(--sa-fs-micro)', color: 'var(--sa-text-muted)' }}>
            Relay target: {data.gmail_relay_target || '—'}. An alias marked <em>forward only</em> leaves no copy on
            the server, so it will never appear in the Mail tab.
          </p>
        </div>
      </div>

      {forwards.length > 0 && (
        <div className="sa-card">
          <div className="sa-card-header">
            <h2>Other forwards</h2>
            <span className="sa-toolbar-count">{formatCount(forwards.length)} aliases</span>
          </div>
          <div className="sa-table-wrap">
            <table className="sa-table">
              <thead>
                <tr>
                  <th scope="col">Source</th>
                  <th scope="col">Destinations</th>
                </tr>
              </thead>
              <tbody>
                {forwards.map(forward => (
                  <tr key={forward.source}>
                    <td>{forward.source}</td>
                    <td style={{ color: 'var(--sa-text-muted)', wordBreak: 'break-word' }}>
                      {(forward.destinations || []).join(', ') || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="sa-card">
        <div className="sa-card-header"><h2>Catch-all</h2></div>
        <div className="sa-card-body">
          {catchAll ? (
            <p style={{ margin: 0 }}>
              <code>{catchAll.pattern}</code> → {(catchAll.destinations || []).join(', ') || '—'}
              <span style={{ display: 'block', marginTop: 4, fontSize: 'var(--sa-fs-small)', color: 'var(--sa-text-muted)' }}>
                Anything sent to an address that does not exist lands here.
              </span>
            </p>
          ) : (
            <p style={{ margin: 0, fontSize: 'var(--sa-fs-small)', color: 'var(--sa-text-muted)' }}>
              No catch-all is configured for this domain. Mail to an unknown address bounces.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
