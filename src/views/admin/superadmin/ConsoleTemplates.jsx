// ConsoleTemplates — CRUD over em-business.db `email_templates`.
//
// Fields and constraints are taken verbatim from SCHEMA_COMMS in
// /root/em-console-api/em_business.py:
//   key + locale is the unique pair (partial index, live rows only), so the PL
//   and EN version of one template share a key and a send can pick the
//   recipient's locale. category is a CHECK-constrained enum. active is 0/1.
//   A row must carry body_text or body_html — the table refuses both empty.
//
// The market is Poland, so locale parity is a first-class column here, not a
// filter: a key that exists only in EN is a hole in the send path.
//
// The table ships EMPTY and that is correct. Nothing is ever seeded or mocked.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { bizCreate, bizDelete, bizList, bizPath, bizRestore, bizUpdate, formatCount, formatStamp } from './commsApi.js'
import { ConsoleEmpty, ConsoleErrorPanel, ConsoleNotLive, ConsoleSkeleton } from './ConsoleStates.jsx'
import { ConfirmModal, Field, LocaleBadge, SaDrawer, SortTh, WriteNote } from './CommsShared.jsx'

const ENTITY = 'email_templates'
const PAGE = 50

// CHECK (category IN (...)) — em_business.py:506
const CATEGORIES = ['outreach', 'nurture', 'transactional', 'onboarding', 'invoice', 'recruiting', 'internal', 'other']
// config locale.supported — em_business.py:_CONFIG
const LOCALES = ['pl', 'en']

const BLANK = {
  key: '', locale: 'pl', name: '', subject: '', preheader: '', category: '',
  from_name: '', from_email: '', reply_to: '', body_text: '', body_html: '', active: 1,
}

export default function ConsoleTemplates() {
  const [sort, setSort] = useState('name')
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [locale, setLocale] = useState('')
  const [category, setCategory] = useState('')
  const [showDeleted, setShowDeleted] = useState(false)

  const [token, setToken] = useState(0)             // reload button
  const [result, setResult] = useState(null)
  const [loadingMore, setLoadingMore] = useState(false)

  const [editing, setEditing] = useState(null)     // row | BLANK-with-no-id
  const [confirm, setConfirm] = useState(null)     // row pending delete

  const params = useMemo(() => ({
    sort,
    limit: PAGE,
    q: search || undefined,
    locale: locale || undefined,
    category: category || undefined,
    include_deleted: showDeleted ? 1 : undefined,
  }), [sort, search, locale, category, showDeleted])

  // The request object is the identity of one fetch. A result that does not
  // belong to the current request reads as "still loading" — which is what it
  // is — so a slow response for the previous filter can never land in the grid.
  const request = useMemo(() => ({ params, token }), [params, token])

  useEffect(() => {
    let alive = true
    bizList(ENTITY, request.params)
      .then(data => {
        if (alive) setResult({
          request,
          rows: data.rows || [],
          total: typeof data.total === 'number' ? data.total : null,
          cursor: data.next_cursor || null,
          error: null,
        })
      })
      .catch(err => { if (alive) setResult({ request, rows: [], total: null, cursor: null, error: err }) })
    return () => { alive = false }
  }, [request])

  const current = result?.request === request ? result : null
  const rows = current ? current.rows : null
  const total = current ? current.total : null
  const cursor = current ? current.cursor : null
  const error = current ? current.error : null
  const load = useCallback(() => setToken(value => value + 1), [])

  const patchResult = patch =>
    setResult(previous => (previous && previous.request === request ? { ...previous, ...patch(previous) } : previous))

  function loadMore() {
    if (!cursor) return
    setLoadingMore(true)
    bizList(ENTITY, { ...params, cursor })
      .then(data => patchResult(previous => ({
        rows: [...previous.rows, ...(data.rows || [])],
        cursor: data.next_cursor || null,
      })))
      .catch(err => patchResult(() => ({ error: err })))
      .finally(() => setLoadingMore(false))
  }

  async function removeTemplate() {
    if (!confirm) return
    setConfirm({ ...confirm, busy: true })
    try {
      await bizDelete(ENTITY, confirm.id)
      setConfirm(null)
      load()
    } catch (err) {
      setConfirm({ ...confirm, busy: false, error: err.message })
    }
  }

  async function restore(row) {
    try {
      await bizRestore(ENTITY, row.id)
      load()
    } catch (err) {
      patchResult(() => ({ error: err }))
    }
  }

  const parity = useMemo(() => localeParity(rows || []), [rows])

  return (
    <>
      <div className="sa-page-header">
        <div>
          <h1>Templates</h1>
          <p>
            The reusable email bodies behind enrolment, reminders, invoices and outreach. Poland first:
            every key should exist in <strong>pl</strong> and <strong>en</strong> so a send can pick the
            recipient&rsquo;s locale and fall back deterministically.
          </p>
        </div>
        <div className="sa-page-header-actions">
          <button type="button" className="sa-btn sa-btn-primary" onClick={() => setEditing({ ...BLANK })}>
            <span className="material-symbols-outlined" aria-hidden="true">add</span>
            New template
          </button>
        </div>
      </div>

      <div className="sa-toolbar">
        <form onSubmit={event => { event.preventDefault(); setSearch(query.trim()) }} style={{ display: 'flex', gap: 6 }}>
          <label className="sa-sr-only" htmlFor="tpl-q">Search templates</label>
          <input id="tpl-q" type="search" className="sa-input" placeholder="Search name, key, subject…"
            value={query} onChange={event => setQuery(event.target.value)} />
          <button type="submit" className="sa-btn sa-btn-ghost">Search</button>
        </form>

        <label className="sa-sr-only" htmlFor="tpl-locale">Locale</label>
        <select id="tpl-locale" className="sa-select" value={locale} onChange={event => setLocale(event.target.value)}>
          <option value="">All locales</option>
          {LOCALES.map(code => <option key={code} value={code}>{code.toUpperCase()}</option>)}
        </select>

        <label className="sa-sr-only" htmlFor="tpl-cat">Category</label>
        <select id="tpl-cat" className="sa-select" value={category} onChange={event => setCategory(event.target.value)}>
          <option value="">All categories</option>
          {CATEGORIES.map(name => <option key={name} value={name}>{name}</option>)}
        </select>

        <label className="sa-checkbox">
          <input type="checkbox" checked={showDeleted} onChange={event => setShowDeleted(event.target.checked)} />
          Show deleted
        </label>

        <span className="sa-toolbar-spacer" />
        <span className="sa-toolbar-count">
          {rows === null ? 'Loading…' : `${formatCount(rows.length)} shown${total === null ? '' : ` of ${formatCount(total)}`}`}
        </span>
        <button type="button" className="sa-icon-btn" onClick={load} aria-label="Reload templates">
          <span className="material-symbols-outlined" aria-hidden="true">refresh</span>
        </button>
      </div>

      {parity.gaps.length > 0 && (
        <div className="sa-card" style={{ marginTop: 12, padding: '10px 14px', boxShadow: 'none' }}>
          <p style={{ margin: 0, fontSize: 'var(--sa-fs-small)', color: 'var(--sa-text)' }}>
            <span className="material-symbols-outlined" aria-hidden="true"
              style={{ fontSize: 16, verticalAlign: -3, color: 'var(--sa-warm-ink)', marginRight: 6 }}>
              translate
            </span>
            Locale parity across the {formatCount(parity.keys)} keys loaded here:{' '}
            {parity.gaps.map(gap => `${gap.key} (no ${gap.missing.join(' / ').toUpperCase()})`).join(', ')}.
          </p>
        </div>
      )}

      <div className="sa-card" style={{ marginTop: 12 }}>
        {error ? (
          <div style={{ padding: 12 }}>
            {error.notLive ? <ConsoleNotLive endpoint={bizPath(ENTITY)} /> : <ConsoleErrorPanel error={error} onRetry={load} />}
          </div>
        ) : rows === null ? (
          <ConsoleSkeleton rows={8} label="Loading templates…" />
        ) : !rows.length ? (
          <ConsoleEmpty
            icon="article"
            title={search || locale || category ? 'No template matches these filters' : 'No email templates yet'}
            hint={
              search || locale || category ? (
                <p>Clear the search and filters to see every template.</p>
              ) : (
                <>
                  <p>
                    A template is one reusable subject and body — the enrolment confirmation, the lesson
                    reminder, the invoice mail, the first outreach touch — stored once and merged at send time.
                  </p>
                  <p style={{ marginTop: '0.5rem' }}>
                    Start with the mail you already retype most often. Give it a key such as{' '}
                    <code>enrolment_confirmed</code>, write the <strong>pl</strong> version first because that
                    is the market, then add the matching <strong>en</strong> row under the same key.
                  </p>
                </>
              )
            }
            action={
              <button type="button" className="sa-btn sa-btn-primary" onClick={() => setEditing({ ...BLANK })}>
                <span className="material-symbols-outlined" aria-hidden="true">add</span>
                New template
              </button>
            }
          />
        ) : (
          <>
            <div className="sa-table-wrap">
              <table className="sa-table">
                <caption className="sa-sr-only">Email templates</caption>
                <thead>
                  <tr>
                    <SortTh col="name" label="Name" sort={sort} onSort={setSort} />
                    <SortTh col="key" label="Key" sort={sort} onSort={setSort} />
                    <SortTh col="locale" label="Locale" sort={sort} onSort={setSort} />
                    <th scope="col">Subject</th>
                    <SortTh col="category" label="Category" sort={sort} onSort={setSort} />
                    <SortTh col="active" label="State" sort={sort} onSort={setSort} />
                    <SortTh col="updated_at" label="Updated" sort={sort} onSort={setSort} align="right" />
                    <th scope="col"><span className="sa-sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(row => (
                    <tr key={row.id}>
                      <td style={{ fontWeight: 600 }}>{row.name}</td>
                      <td style={{ color: 'var(--sa-text-muted)' }}>{row.key}</td>
                      <td><LocaleBadge locale={row.locale} /></td>
                      <td style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        title={row.subject}>
                        {row.subject}
                      </td>
                      <td style={{ color: 'var(--sa-text-muted)' }}>{row.category || '—'}</td>
                      <td>
                        {row.deleted_at
                          ? <span className="sa-badge sa-badge-failed">deleted</span>
                          : row.active
                            ? <span className="sa-badge sa-badge-committed">active</span>
                            : <span className="sa-badge">paused</span>}
                      </td>
                      <td className="sa-num">{formatStamp(row.updated_at)}</td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {row.deleted_at ? (
                          <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" onClick={() => restore(row)}>
                            Restore
                          </button>
                        ) : (
                          <>
                            <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" onClick={() => setEditing(row)}>
                              Edit
                            </button>
                            <button type="button" className="sa-icon-btn sa-icon-btn-sm" style={{ marginLeft: 4 }}
                              onClick={() => setConfirm(row)} aria-label={`Delete template ${row.name}`}>
                              <span className="material-symbols-outlined" aria-hidden="true">delete</span>
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {cursor && (
              <div style={{ padding: 10, borderTop: '1px solid var(--sa-border)', textAlign: 'center' }}>
                <button type="button" className="sa-btn sa-btn-ghost" onClick={loadMore} disabled={loadingMore}>
                  {loadingMore ? 'Loading…' : 'Load more'}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <TemplateEditor
        template={editing}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); load() }}
      />

      <ConfirmModal
        open={Boolean(confirm)}
        title="Delete template"
        confirmLabel="Delete"
        busy={confirm?.busy}
        onClose={() => setConfirm(null)}
        onConfirm={removeTemplate}
        body={
          <>
            <p style={{ margin: 0 }}>
              <strong>{confirm?.name}</strong> ({confirm?.key} · {String(confirm?.locale || '').toUpperCase()}) will be
              soft-deleted: the row stays in the database, releases its key+locale slot, and can be restored from the
              &ldquo;Show deleted&rdquo; filter.
            </p>
            {confirm?.error && (
              <p style={{ margin: '8px 0 0', color: 'var(--sa-bad)', fontWeight: 600 }}>{confirm.error}</p>
            )}
          </>
        }
      />
    </>
  )
}

// Parity is computed over the rows actually loaded, and the copy says so — the
// list is paginated, so this is a hint, not a claim about the whole table.
function localeParity(rows) {
  const byKey = new Map()
  rows.filter(row => !row.deleted_at).forEach(row => {
    if (!byKey.has(row.key)) byKey.set(row.key, new Set())
    byKey.get(row.key).add(String(row.locale || '').toLowerCase())
  })
  const gaps = []
  byKey.forEach((locales, key) => {
    const missing = LOCALES.filter(code => !locales.has(code))
    if (missing.length && missing.length < LOCALES.length) gaps.push({ key, missing })
  })
  return { keys: byKey.size, gaps }
}

function TemplateEditor({ template, onClose, onSaved }) {
  const [form, setForm] = useState(BLANK)
  const [note, setNote] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!template) return
    setForm({
      key: template.key || '', locale: template.locale || 'pl', name: template.name || '',
      subject: template.subject || '', preheader: template.preheader || '',
      category: template.category || '', from_name: template.from_name || '',
      from_email: template.from_email || '', reply_to: template.reply_to || '',
      body_text: template.body_text || '', body_html: template.body_html || '',
      active: template.active === 0 ? 0 : 1,
    })
    setNote(null)
  }, [template])

  const set = (field, value) => setForm(current => ({ ...current, [field]: value }))
  const isNew = template && !template.id

  async function save() {
    const problem = validate(form)
    if (problem) { setNote({ ok: false, text: problem }); return }
    setBusy(true)
    setNote(null)
    // Empty strings go as null so the table's "text or html" CHECK sees the
    // truth, and optional columns stay genuinely empty rather than holding ''.
    const payload = {}
    Object.entries(form).forEach(([field, value]) => {
      payload[field] = typeof value === 'string' && value.trim() === '' ? null : value
    })
    payload.key = String(form.key).trim()
    payload.name = String(form.name).trim()
    payload.subject = String(form.subject).trim()
    try {
      if (isNew) await bizCreate(ENTITY, payload)
      else await bizUpdate(ENTITY, template.id, payload)
      onSaved()
    } catch (err) {
      setNote({ ok: false, text: err.message || 'Save failed' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <SaDrawer
      open={Boolean(template)}
      title={isNew ? 'New template' : `Edit · ${template?.name || ''}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="sa-btn sa-btn-ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="sa-btn sa-btn-primary" onClick={save} disabled={busy}>
            {busy ? 'Saving…' : isNew ? 'Create template' : 'Save changes'}
          </button>
        </>
      }
    >
      <WriteNote note={note} />

      <Field label="Key" htmlFor="f-key" hint="Shared by the PL and EN version. Unique per locale while the row is live.">
        <input id="f-key" className="sa-input" value={form.key} onChange={event => set('key', event.target.value)}
          placeholder="enrolment_confirmed" />
      </Field>
      <Field label="Locale" htmlFor="f-locale">
        <select id="f-locale" className="sa-select" value={form.locale} onChange={event => set('locale', event.target.value)}>
          {LOCALES.map(code => <option key={code} value={code}>{code.toUpperCase()}</option>)}
        </select>
      </Field>
      <Field label="Name" htmlFor="f-name" hint="What an operator calls it in this list.">
        <input id="f-name" className="sa-input" value={form.name} onChange={event => set('name', event.target.value)} />
      </Field>
      <Field label="Subject" htmlFor="f-subject">
        <input id="f-subject" className="sa-input" value={form.subject} onChange={event => set('subject', event.target.value)} />
      </Field>
      <Field label="Preheader" htmlFor="f-preheader" hint="The preview line most clients show after the subject.">
        <input id="f-preheader" className="sa-input" value={form.preheader} onChange={event => set('preheader', event.target.value)} />
      </Field>
      <Field label="Category" htmlFor="f-category">
        <select id="f-category" className="sa-select" value={form.category} onChange={event => set('category', event.target.value)}>
          <option value="">(none)</option>
          {CATEGORIES.map(name => <option key={name} value={name}>{name}</option>)}
        </select>
      </Field>
      <Field label="From name" htmlFor="f-from-name">
        <input id="f-from-name" className="sa-input" value={form.from_name} onChange={event => set('from_name', event.target.value)} />
      </Field>
      <Field label="From email" htmlFor="f-from-email">
        <input id="f-from-email" type="email" className="sa-input" value={form.from_email}
          onChange={event => set('from_email', event.target.value)} placeholder="hello@englishmetro.com" />
      </Field>
      <Field label="Reply-to" htmlFor="f-reply-to">
        <input id="f-reply-to" type="email" className="sa-input" value={form.reply_to}
          onChange={event => set('reply_to', event.target.value)} />
      </Field>
      <Field label="Plain-text body" htmlFor="f-text" hint="A row needs a text body, an HTML body, or both.">
        <textarea id="f-text" className="sa-input sa-textarea" value={form.body_text}
          onChange={event => set('body_text', event.target.value)} />
      </Field>
      <Field label="HTML body" htmlFor="f-html" hint="Stored as written and sent as written; it is never rendered in this console.">
        <textarea id="f-html" className="sa-input sa-textarea" value={form.body_html}
          onChange={event => set('body_html', event.target.value)} spellCheck={false} />
      </Field>
      <Field label="State" htmlFor="f-active">
        <label className="sa-checkbox">
          <input id="f-active" type="checkbox" checked={form.active === 1}
            onChange={event => set('active', event.target.checked ? 1 : 0)} />
          Active — available to sends and sequences
        </label>
      </Field>
    </SaDrawer>
  )
}

function validate(form) {
  if (!String(form.key).trim()) return 'Key is required — it is what pairs the PL and EN versions.'
  if (!String(form.name).trim()) return 'Name is required.'
  if (!String(form.subject).trim()) return 'Subject is required.'
  if (!String(form.body_text).trim() && !String(form.body_html).trim()) {
    return 'Give a plain-text body, an HTML body, or both — the table refuses a row with neither.'
  }
  return null
}
