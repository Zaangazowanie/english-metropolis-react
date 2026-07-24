// ConsolePages — Website → Pages.
//
// CRUD over `pages` + `content_blocks`, with `page_revisions` as a real version
// history. Backed by the generic business REST surface (/api/console/biz/*),
// tables defined in /root/em-console-api/em_business.py.
//
// Save protocol, matching save_page_revision()'s own docstring ("call this
// BEFORE an edit so the previous state is always recoverable"):
//   1. POST /api/console/biz/pages/<id>/revisions   — snapshot what is there now
//   2. PATCH the page, then create/update/delete its blocks
// If the snapshot fails the edit is abandoned; a half-saved page with no way
// back is worse than a failed save. A brand-new page is snapshotted straight
// after creation instead, so revision 1 always exists.
//
// Restore posts to <page>/revisions/<revision>/restore, the REST shape of
// restore_page_revision(page_id, revision). That sub-route is the only path
// here not exercised by the plain entity CRUD; if it is not mounted yet the
// 404 surfaces as the standard "not live" explainer rather than silently.
//
// Blocks are an ordered list of typed values. value_json is edited as JSON,
// validated before save. Deliberately NOT a WYSIWYG and not a page-builder.
//
// The tables are empty today. That is correct and the empty states say so.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ConsoleEmpty, ConsoleErrorPanel, ConsoleNotLive, ConsoleSkeleton } from './ConsoleStates.jsx'
import {
  Field, SaveError, SortTh, bizCreate, bizDelete, bizList, bizPost,
  bizUpdate, fmtStamp, useBizList,
} from './bizRest.jsx'

const STATUSES = ['draft', 'review', 'published', 'archived']
const BLOCK_TYPES = ['text', 'richtext', 'html', 'markdown', 'image', 'list', 'cta', 'faq', 'json']
const LOCALES = ['pl', 'en']          // app_config locale.supported

const STATUS_BADGE = {
  draft: 'sa-badge-queued',
  review: 'sa-badge-awaiting_review',
  published: 'sa-badge-committed',
  archived: 'sa-badge-queued',
}

// A create/update answers the row; tolerate a {row:…} envelope either way.
const rowOf = res => (res && res.row ? res.row : res)

function StatusBadge({ status }) {
  return <span className={`sa-badge ${STATUS_BADGE[status] || 'sa-badge-queued'}`}>{status || '—'}</span>
}

export default function ConsolePages() {
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [locale, setLocale] = useState('')
  const [sort, setSort] = useState('path')
  const [open, setOpen] = useState(null)      // page id, or 'new'

  const { rows, total, error, reload } = useBizList('pages', { q, status, sort, limit: 500 })

  // Locale parity is computed over the full fetched set (the locale filter below
  // is applied client-side for exactly this reason), so "missing EN" is a fact
  // about the data, not about what happens to be on screen.
  const localesByPath = useMemo(() => {
    const map = new Map()
    for (const r of rows || []) {
      if (!map.has(r.path)) map.set(r.path, new Set())
      map.get(r.path).add(r.locale)
    }
    return map
  }, [rows])

  const visible = useMemo(
    () => (rows || []).filter(r => !locale || r.locale === locale),
    [rows, locale],
  )

  if (open) {
    return (
      <PageEditor
        pageId={open === 'new' ? null : open}
        onClose={() => setOpen(null)}
        onSaved={() => { reload() }}
      />
    )
  }

  return (
    <>
      <div className="sa-page-header">
        <div>
          <h1>Pages</h1>
          <p>Public pages and their content blocks, with a full revision history. PL and EN are tracked as separate rows on the same path.</p>
        </div>
        <div className="sa-page-header-actions">
          <button type="button" className="sa-btn sa-btn-primary" onClick={() => setOpen('new')}>
            <span className="material-symbols-outlined" aria-hidden="true">add</span>
            New page
          </button>
        </div>
      </div>

      <div className="sa-toolbar">
        <label className="sa-sr-only" htmlFor="pages-q">Search pages</label>
        <input
          id="pages-q" type="search" className="sa-input" value={q}
          placeholder="Search path, title, SEO title…"
          onChange={e => setQ(e.target.value)}
        />
        <label className="sa-sr-only" htmlFor="pages-status">Status</label>
        <select id="pages-status" className="sa-select" value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <label className="sa-sr-only" htmlFor="pages-locale">Locale</label>
        <select id="pages-locale" className="sa-select" value={locale} onChange={e => setLocale(e.target.value)}>
          <option value="">All locales</option>
          {LOCALES.map(l => <option key={l} value={l}>{l.toUpperCase()}</option>)}
        </select>
        <span className="sa-toolbar-spacer" />
        {rows && (
          <span className="sa-toolbar-count">
            {visible.length} shown{total !== null && total !== visible.length ? ` · ${total} total` : ''}
          </span>
        )}
        <button type="button" className="sa-icon-btn" onClick={reload} aria-label="Reload pages">
          <span className="material-symbols-outlined" aria-hidden="true">refresh</span>
        </button>
      </div>

      <div className="sa-card" style={{ marginTop: 12 }}>
        {error?.notLive && <ConsoleNotLive endpoint="/api/console/biz/pages" />}
        {error && !error.notLive && <ConsoleErrorPanel error={error} onRetry={reload} />}
        {!error && !rows && <ConsoleSkeleton label="Loading pages…" />}
        {!error && rows && !visible.length && (
          <ConsoleEmpty
            icon="web"
            title={rows.length ? 'No page matches these filters' : 'No pages yet'}
            hint={rows.length
              ? <p>Clear the search or the filters above to see the rest.</p>
              : (
                <>
                  <p>This is where the public englishmetro.com pages are managed: path, title, SEO metadata and an ordered list of content blocks.</p>
                  <p style={{ marginTop: '0.5rem' }}>Start with the page you edit most often — create it at its real path (<code>/kursy-biznesowe</code>) in <strong>pl</strong>, then add the <strong>en</strong> row on the same path so parity is visible.</p>
                </>
              )}
            action={!rows.length && (
              <button type="button" className="sa-btn sa-btn-primary" onClick={() => setOpen('new')}>
                <span className="material-symbols-outlined" aria-hidden="true">add</span>
                Create the first page
              </button>
            )}
          />
        )}
        {!error && rows && !!visible.length && (
          <div className="sa-table-wrap">
            <table className="sa-table">
              <thead>
                <tr>
                  <SortTh col="path" sort={sort} onSort={setSort}>Path</SortTh>
                  <SortTh col="title" sort={sort} onSort={setSort}>Title</SortTh>
                  <SortTh col="locale" sort={sort} onSort={setSort}>Locale</SortTh>
                  <th scope="col">Parity</th>
                  <SortTh col="status" sort={sort} onSort={setSort}>Status</SortTh>
                  <SortTh col="revision" sort={sort} onSort={setSort} align="right">Rev</SortTh>
                  <SortTh col="updated_at" sort={sort} onSort={setSort}>Updated</SortTh>
                  <th scope="col"><span className="sa-sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {visible.map(p => {
                  const have = localesByPath.get(p.path) || new Set()
                  return (
                    <tr key={p.id}>
                      <td style={{ fontFamily: 'ui-monospace, monospace' }}>{p.path}</td>
                      <td>{p.title}</td>
                      <td><span className="sa-badge sa-badge-processing">{String(p.locale || '').toUpperCase()}</span></td>
                      <td>
                        {LOCALES.map(l => (
                          <span
                            key={l}
                            className="sa-badge"
                            title={have.has(l) ? `${l.toUpperCase()} version exists` : `no ${l.toUpperCase()} version of ${p.path}`}
                            style={{
                              marginRight: 4,
                              background: have.has(l) ? 'var(--sa-good-soft)' : 'var(--sa-surface-soft)',
                              color: have.has(l) ? 'var(--sa-good)' : 'var(--sa-text-muted)',
                            }}
                          >
                            {l.toUpperCase()}
                          </span>
                        ))}
                      </td>
                      <td><StatusBadge status={p.status} /></td>
                      <td className="sa-num">{p.revision ?? 0}</td>
                      <td>{fmtStamp(p.updated_at)}</td>
                      <td className="sa-td-right">
                        <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" onClick={() => setOpen(p.id)}>
                          <span className="material-symbols-outlined" aria-hidden="true">edit</span>
                          Edit
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}

// ── editor ──────────────────────────────────────────────────────────────────

const EMPTY_PAGE = {
  path: '', locale: 'pl', title: '', status: 'draft', template: '',
  seo_title: '', seo_description: '', og_image: '', canonical_url: '', noindex: 0,
}

const PAGE_FIELDS = Object.keys(EMPTY_PAGE)

function PageEditor({ pageId, onClose, onSaved }) {
  const isNew = !pageId
  const [tab, setTab] = useState('content')
  const [page, setPage] = useState(isNew ? { ...EMPTY_PAGE } : null)
  const [blocks, setBlocks] = useState(isNew ? [] : null)
  const [revisions, setRevisions] = useState(isNew ? [] : null)
  const [loadError, setLoadError] = useState(null)
  const [saveError, setSaveError] = useState(null)
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState('')
  const [removed, setRemoved] = useState([])     // ids of blocks deleted in this edit

  const load = useCallback(() => {
    if (isNew) return
    setLoadError(null)
    Promise.all([
      bizList('pages', { id: pageId, limit: 1 }),
      bizList('content_blocks', { page_id: pageId, sort: 'position', limit: 500 }),
      bizList('page_revisions', { page_id: pageId, sort: '-revision', limit: 100 }),
    ])
      .then(([p, b, r]) => {
        const row = (p.rows || [])[0]
        if (!row) throw Object.assign(new Error(`page ${pageId} no longer exists`), { status: 404, notLive: false })
        setPage(row)
        setBlocks((b.rows || []).map(x => ({ ...x })))
        setRevisions(r.rows || [])
        setRemoved([])
      })
      .catch(setLoadError)
  }, [isNew, pageId])

  useEffect(() => { load() }, [load])

  const setField = (k, v) => setPage(p => ({ ...p, [k]: v }))

  const badBlock = useMemo(() => {
    for (const b of blocks || []) {
      if (!b.key.trim()) return 'Every block needs a key (for example hero.headline).'
      try { JSON.parse(b.value_json) } catch { return `Block “${b.key}” does not hold valid JSON.` }
    }
    return ''
  }, [blocks])

  async function save() {
    setSaveError(null)
    setNotice('')
    if (badBlock) { setSaveError(new Error(badBlock)); return }
    const fields = {}
    for (const k of PAGE_FIELDS) fields[k] = page[k] === '' ? null : page[k]
    fields.path = String(page.path || '').trim()
    fields.title = String(page.title || '').trim()
    if (!fields.path || !fields.title) {
      setSaveError(new Error('Path and title are both required.'))
      return
    }
    fields.noindex = page.noindex ? 1 : 0

    setBusy('save')
    try {
      if (isNew) {
        const created = rowOf(await bizCreate('pages', fields))
        for (const [i, b] of blocks.entries()) {
          await bizCreate('content_blocks', {
            page_id: created.id, key: b.key.trim(), block_type: b.block_type,
            value_json: b.value_json, position: i,
          })
        }
        // Nothing precedes a create, so the snapshot lands straight after it:
        // revision 1 is the page as first written.
        await bizPost(`/pages/${created.id}/revisions`, { note: 'created in console' })
        onSaved()
        onClose()
        return
      }

      // 1. snapshot the state being replaced — abort the whole save if it fails
      await bizPost(`/pages/${pageId}/revisions`, { note: 'before console edit' })
      // 2. the page itself
      await bizUpdate('pages', pageId, fields)
      // 3. blocks: deletes, updates, creates — position follows array order
      for (const id of removed) await bizDelete('content_blocks', id)
      for (const [i, b] of blocks.entries()) {
        const payload = { key: b.key.trim(), block_type: b.block_type, value_json: b.value_json, position: i }
        if (b.id) await bizUpdate('content_blocks', b.id, payload)
        else await bizCreate('content_blocks', { ...payload, page_id: pageId })
      }
      setNotice('Saved. The previous state is revision ' + (Number(page.revision || 0) + 1) + '.')
      onSaved()
      load()
    } catch (e) {
      setSaveError(e)
    } finally {
      setBusy('')
    }
  }

  async function restore(revision) {
    setSaveError(null)
    setNotice('')
    setBusy(`restore-${revision}`)
    try {
      await bizPost(`/pages/${pageId}/revisions/${revision}/restore`, {})
      setNotice(`Restored revision ${revision}. The state it replaced was snapshotted first.`)
      onSaved()
      load()
    } catch (e) {
      setSaveError(e)
    } finally {
      setBusy('')
    }
  }

  const moveBlock = (i, dir) => setBlocks(list => {
    const j = i + dir
    if (j < 0 || j >= list.length) return list
    const next = [...list]
    ;[next[i], next[j]] = [next[j], next[i]]
    return next
  })

  const dropBlock = i => setBlocks(list => {
    const b = list[i]
    if (b.id) setRemoved(r => [...r, b.id])
    return list.filter((_, k) => k !== i)
  })

  if (loadError) {
    return (
      <>
        <EditorHeader title="Page" onClose={onClose} />
        {loadError.notLive
          ? <ConsoleNotLive endpoint="/api/console/biz/pages" />
          : <ConsoleErrorPanel error={loadError} onRetry={load} />}
      </>
    )
  }
  if (!page || !blocks || !revisions) {
    return (
      <>
        <EditorHeader title="Page" onClose={onClose} />
        <div className="sa-card"><ConsoleSkeleton rows={4} label="Loading page…" /></div>
      </>
    )
  }

  return (
    <>
      <EditorHeader
        title={isNew ? 'New page' : page.path}
        subtitle={isNew ? 'Nothing is written until you save.' : `${page.title} · ${String(page.locale).toUpperCase()} · revision ${page.revision ?? 0}`}
        onClose={onClose}
        actions={
          <button type="button" className="sa-btn sa-btn-primary" onClick={save} disabled={busy === 'save'}>
            <span className="material-symbols-outlined" aria-hidden="true">save</span>
            {busy === 'save' ? 'Saving…' : isNew ? 'Create page' : 'Save (snapshots first)'}
          </button>
        }
      />

      <div className="sa-card">
        <div className="sa-card-header" style={{ padding: 0 }}>
          <div className="sa-tabs" role="tablist" aria-label="Page editor sections">
            {[['content', 'Content blocks', 'view_list'], ['settings', 'Settings & SEO', 'tune'], ['revisions', 'Revisions', 'history']].map(([id, label, icon]) => (
              <button
                key={id} type="button" role="tab" id={`page-tab-${id}`}
                aria-selected={tab === id} aria-controls={`page-panel-${id}`}
                className={`sa-tab${tab === id ? ' is-active' : ''}`}
                onClick={() => setTab(id)}
              >
                <span className="material-symbols-outlined" aria-hidden="true">{icon}</span>
                {label}
                {id === 'revisions' && !isNew && <span className="sa-badge sa-badge-queued">{revisions.length}</span>}
              </button>
            ))}
          </div>
        </div>

        <div className="sa-card-body" style={{ display: 'grid', gap: 12 }}>
          <SaveError error={saveError} />
          {notice && (
            <p role="status" style={{ margin: 0, fontSize: 'var(--sa-fs-small)', fontWeight: 600, color: 'var(--sa-good)' }}>{notice}</p>
          )}

          {tab === 'settings' && (
            <div role="tabpanel" id="page-panel-settings" aria-labelledby="page-tab-settings"
              style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
              <Field label="Path" hint="Leading slash, e.g. /kursy-biznesowe">
                <input className="sa-input" value={page.path} onChange={e => setField('path', e.target.value)} />
              </Field>
              <Field label="Locale">
                <select className="sa-select" value={page.locale} onChange={e => setField('locale', e.target.value)}>
                  {LOCALES.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </Field>
              <Field label="Title">
                <input className="sa-input" value={page.title} onChange={e => setField('title', e.target.value)} />
              </Field>
              <Field label="Status">
                <select className="sa-select" value={page.status} onChange={e => setField('status', e.target.value)}>
                  {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="Template" hint="Optional renderer hint">
                <input className="sa-input" value={page.template || ''} onChange={e => setField('template', e.target.value)} />
              </Field>
              <Field label="Canonical URL">
                <input className="sa-input" value={page.canonical_url || ''} onChange={e => setField('canonical_url', e.target.value)} />
              </Field>
              <Field label="SEO title">
                <input className="sa-input" value={page.seo_title || ''} onChange={e => setField('seo_title', e.target.value)} />
              </Field>
              <Field label="OG image">
                <input className="sa-input" value={page.og_image || ''} onChange={e => setField('og_image', e.target.value)} />
              </Field>
              <Field label="SEO description" span>
                <textarea className="sa-input sa-textarea" rows={3} value={page.seo_description || ''}
                  onChange={e => setField('seo_description', e.target.value)} />
              </Field>
              <label className="sa-checkbox">
                <input type="checkbox" checked={!!page.noindex} onChange={e => setField('noindex', e.target.checked ? 1 : 0)} />
                Ask search engines not to index this page
              </label>
            </div>
          )}

          {tab === 'content' && (
            <div role="tabpanel" id="page-panel-content" aria-labelledby="page-tab-content" style={{ display: 'grid', gap: 10 }}>
              {!blocks.length && (
                <ConsoleEmpty
                  icon="view_list"
                  title="No content blocks"
                  hint={<p>A page is an ordered list of typed blocks. Add one, give it a key such as <code>hero.headline</code>, and put its value in as JSON.</p>}
                  action={
                    <button type="button" className="sa-btn sa-btn-primary"
                      onClick={() => setBlocks([{ key: '', block_type: 'text', value_json: '{}', position: 0 }])}>
                      <span className="material-symbols-outlined" aria-hidden="true">add</span>
                      Add the first block
                    </button>
                  }
                />
              )}
              {blocks.map((b, i) => (
                <div key={b.id ?? `new-${i}`}
                  style={{ border: '1px solid var(--sa-border)', borderRadius: 'var(--sa-radius-control)', padding: 10, display: 'grid', gap: 8 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span className="sa-badge sa-badge-queued sa-num" style={{ minWidth: 34, justifyContent: 'center' }}>{i + 1}</span>
                    <label className="sa-sr-only" htmlFor={`block-key-${i}`}>Block key</label>
                    <input id={`block-key-${i}`} className="sa-input" style={{ flex: '1 1 200px' }} placeholder="hero.headline"
                      value={b.key} onChange={e => setBlocks(l => l.map((x, k) => k === i ? { ...x, key: e.target.value } : x))} />
                    <label className="sa-sr-only" htmlFor={`block-type-${i}`}>Block type</label>
                    <select id={`block-type-${i}`} className="sa-select" value={b.block_type}
                      onChange={e => setBlocks(l => l.map((x, k) => k === i ? { ...x, block_type: e.target.value } : x))}>
                      {BLOCK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <button type="button" className="sa-icon-btn sa-icon-btn-sm" onClick={() => moveBlock(i, -1)}
                      disabled={i === 0} aria-label={`Move block ${i + 1} up`}>
                      <span className="material-symbols-outlined" aria-hidden="true">arrow_upward</span>
                    </button>
                    <button type="button" className="sa-icon-btn sa-icon-btn-sm" onClick={() => moveBlock(i, 1)}
                      disabled={i === blocks.length - 1} aria-label={`Move block ${i + 1} down`}>
                      <span className="material-symbols-outlined" aria-hidden="true">arrow_downward</span>
                    </button>
                    <button type="button" className="sa-icon-btn sa-icon-btn-sm" onClick={() => dropBlock(i)}
                      aria-label={`Remove block ${i + 1}`}>
                      <span className="material-symbols-outlined" aria-hidden="true">delete</span>
                    </button>
                  </div>
                  <label className="sa-sr-only" htmlFor={`block-value-${i}`}>Block value, as JSON</label>
                  <textarea
                    id={`block-value-${i}`} className="sa-input sa-textarea" rows={3} spellCheck={false}
                    style={{ fontFamily: 'ui-monospace, monospace' }}
                    aria-invalid={isBadJson(b.value_json)}
                    value={b.value_json}
                    onChange={e => setBlocks(l => l.map((x, k) => k === i ? { ...x, value_json: e.target.value } : x))}
                  />
                </div>
              ))}
              {!!blocks.length && (
                <div>
                  <button type="button" className="sa-btn sa-btn-ghost"
                    onClick={() => setBlocks(l => [...l, { key: '', block_type: 'text', value_json: '{}', position: l.length }])}>
                    <span className="material-symbols-outlined" aria-hidden="true">add</span>
                    Add block
                  </button>
                </div>
              )}
              {badBlock && (
                <p style={{ margin: 0, fontSize: 'var(--sa-fs-small)', color: 'var(--sa-warm-ink)' }}>{badBlock}</p>
              )}
            </div>
          )}

          {tab === 'revisions' && (
            <div role="tabpanel" id="page-panel-revisions" aria-labelledby="page-tab-revisions">
              {isNew && <ConsoleEmpty icon="history" title="No revisions yet" hint={<p>The first revision is written the moment this page is created.</p>} />}
              {!isNew && !revisions.length && (
                <ConsoleEmpty
                  icon="history"
                  title="No revisions recorded"
                  hint={<p>Every save snapshots the page and its blocks first. This page has not been saved through the console yet.</p>}
                />
              )}
              {!!revisions.length && (
                <div className="sa-table-wrap">
                  <table className="sa-table">
                    <thead>
                      <tr>
                        <th scope="col" style={{ textAlign: 'right' }}>Rev</th>
                        <th scope="col">Taken</th>
                        <th scope="col">Author</th>
                        <th scope="col">Note</th>
                        <th scope="col"><span className="sa-sr-only">Actions</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {revisions.map(r => (
                        <tr key={r.id}>
                          <td className="sa-num">{r.revision}</td>
                          <td>{fmtStamp(r.created_at)}</td>
                          <td>{r.author_email || <span style={{ color: 'var(--sa-text-muted)' }}>unknown</span>}</td>
                          <td>{r.note || <span style={{ color: 'var(--sa-text-muted)' }}>—</span>}</td>
                          <td className="sa-td-right">
                            <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm"
                              disabled={busy === `restore-${r.revision}`}
                              onClick={() => restore(r.revision)}>
                              <span className="material-symbols-outlined" aria-hidden="true">restore</span>
                              {busy === `restore-${r.revision}` ? 'Restoring…' : 'Restore'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function isBadJson(text) {
  try { JSON.parse(text); return false } catch { return true }
}

function EditorHeader({ title, subtitle, onClose, actions }) {
  return (
    <div className="sa-page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      <div className="sa-page-header-actions">
        <button type="button" className="sa-btn sa-btn-ghost" onClick={onClose}>
          <span className="material-symbols-outlined" aria-hidden="true">arrow_back</span>
          Back to pages
        </button>
        {actions}
      </div>
    </div>
  )
}
