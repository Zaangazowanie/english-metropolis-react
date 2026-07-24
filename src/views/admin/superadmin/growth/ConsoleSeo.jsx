// Growth → SEO. CRUD over the `seo_pages` table in em-business.db
// (schema: /root/em-console-api/em_business.py, SCHEMA_GROWTH).
//
// One row per (url, target_keyword, search_engine, country) — the table's own
// unique key. Positions are entered by an operator or written by a rank checker
// that does not exist yet; nothing on this screen invents one. A row whose
// last_checked_at is old is shown as stale rather than quietly presented as
// current, because a six-month-old rank is not a rank.

import { useMemo, useState } from 'react'
import { ConsoleEmpty, ConsoleErrorPanel, ConsoleNotLive, ConsoleSkeleton } from '../ConsoleStates.jsx'
import {
  ENTITY, bizCreate, bizDelete, bizRestore, bizUpdate, entityPath,
  DASH, dateInputToEpoch, daysSince, epochToDateInput, formatInt, nullIfBlank, todayISO,
} from './growthApi.js'
import { ConfirmModal, Field, FormError, LoadMore, Modal, Pill, SortTh, useBizList, useDebounced } from './GrowthShared.jsx'

const ENGINES = ['google', 'bing', 'other']
const STATUSES = ['tracked', 'paused', 'archived']
const STATUS_TONE = { tracked: 'good', paused: 'warm', archived: 'neutral' }

// A rank older than this is reported as stale. 30 days is the interval a manual
// check realistically holds for; it is a display threshold, nothing is deleted.
const STALE_DAYS = 30

const EMPTY_FORM = {
  url: '', title: '', meta_description: '', target_keyword: '', locale: 'pl', country: 'PL',
  search_engine: 'google', current_position: '', best_position: '', previous_position: '',
  search_volume: '', last_checked: '', status: 'tracked', notes: '',
}

function toForm(row) {
  if (!row) return { ...EMPTY_FORM }
  const num = v => (v === null || v === undefined ? '' : String(v))
  return {
    url: row.url || '',
    title: row.title || '',
    meta_description: row.meta_description || '',
    target_keyword: row.target_keyword || '',
    locale: row.locale || 'pl',
    country: row.country || 'PL',
    search_engine: row.search_engine || 'google',
    current_position: num(row.current_position),
    best_position: num(row.best_position),
    previous_position: num(row.previous_position),
    search_volume: num(row.search_volume),
    last_checked: epochToDateInput(row.last_checked_at),
    status: row.status || 'tracked',
    notes: row.notes || '',
  }
}

function intOrNull(text, { min } = {}) {
  const raw = String(text ?? '').trim()
  if (!raw) return null
  if (!/^\d+$/.test(raw)) return NaN
  const n = Number(raw)
  if (min !== undefined && n < min) return NaN
  return n
}

function StaleCell({ epoch }) {
  const days = daysSince(epoch)
  if (days === null) return <Pill label="Never checked" tone="warm" icon="schedule" />
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span className="sa-num">{epochToDateInput(epoch)}</span>
      {days >= STALE_DAYS
        ? <Pill label={`${formatInt(days)} d`} tone="warm" title={`Last checked ${days} days ago`} />
        : <span style={{ fontSize: 'var(--sa-fs-micro)', color: 'var(--sa-text-muted)' }}>{days} d ago</span>}
    </span>
  )
}

function PositionCell({ row }) {
  if (row.current_position === null || row.current_position === undefined) {
    return <span style={{ color: 'var(--sa-text-muted)' }}>{DASH}</span>
  }
  const prev = row.previous_position
  // A smaller position number is a better rank, so an improvement is a fall.
  const moved = prev === null || prev === undefined ? 0 : prev - row.current_position
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
      <strong className="sa-num">{row.current_position}</strong>
      {moved !== 0 && (
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 2,
          fontSize: 'var(--sa-fs-micro)', fontWeight: 600,
          color: moved > 0 ? 'var(--sa-good)' : 'var(--sa-bad)',
        }}>
          <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 13 }}>
            {moved > 0 ? 'arrow_upward' : 'arrow_downward'}
          </span>
          {Math.abs(moved)}
          <span className="sa-sr-only">{moved > 0 ? 'places gained' : 'places lost'} since the previous check</span>
        </span>
      )}
    </span>
  )
}

export default function ConsoleSeo() {
  const [search, setSearch] = useState('')
  const q = useDebounced(search)
  const [status, setStatus] = useState('')
  const [engine, setEngine] = useState('')
  const [freshness, setFreshness] = useState('')
  const [sort, setSort] = useState('current_position')
  const [includeDeleted, setIncludeDeleted] = useState(false)
  const [editing, setEditing] = useState(null)
  const [checking, setChecking] = useState(null)
  const [confirming, setConfirming] = useState(null)
  const [rowBusy, setRowBusy] = useState(false)
  const [rowError, setRowError] = useState(null)

  // Staleness is a server-side filter, not a client-side pass over the loaded
  // page, so the count in the toolbar is the real count.
  const params = useMemo(() => {
    const cutoff = Math.floor(Date.now() / 1000) - STALE_DAYS * 86400
    const p = {
      q: q.trim() || undefined,
      status: status || undefined,
      search_engine: engine || undefined,
      sort,
      limit: 50,
      include_deleted: includeDeleted ? 1 : undefined,
    }
    if (freshness === 'never') p.last_checked_at__null = 1
    if (freshness === 'stale') p.last_checked_at__lt = cutoff
    if (freshness === 'fresh') p.last_checked_at__gte = cutoff
    return p
  }, [q, status, engine, freshness, sort, includeDeleted])

  const list = useBizList(ENTITY.seoPages, params)
  const filtered = Boolean(q || status || engine || freshness)

  async function remove() {
    setRowBusy(true)
    setRowError(null)
    try {
      await bizDelete(ENTITY.seoPages, confirming.id)
      setConfirming(null)
      list.reload()
    } catch (e) { setRowError(e) } finally { setRowBusy(false) }
  }

  async function restore(row) {
    setRowError(null)
    try {
      await bizRestore(ENTITY.seoPages, row.id)
      list.reload()
    } catch (e) { setRowError(e) }
  }

  return (
    <>
      <div className="sa-page-header">
        <div>
          <h1>SEO</h1>
          <p>
            Tracked pages on englishmetro.com: the keyword each one targets, where it ranks, and when
            that rank was last verified. Positions are entered by hand — there is no rank-tracking
            API wired to this box, so nothing here updates itself.
          </p>
        </div>
        <div className="sa-page-header-actions">
          <button type="button" className="sa-btn sa-btn-primary" onClick={() => setEditing({})}>
            <span className="material-symbols-outlined" aria-hidden="true">add</span>
            Track a page
          </button>
        </div>
      </div>

      <div className="sa-toolbar" role="search">
        <label className="sa-sr-only" htmlFor="seo-q">Search tracked pages</label>
        <input id="seo-q" type="search" className="sa-input" placeholder="Search URL, title, keyword…"
          value={search} onChange={e => setSearch(e.target.value)} style={{ minWidth: 240 }} />
        <label className="sa-sr-only" htmlFor="seo-status">Filter by status</label>
        <select id="seo-status" className="sa-select" value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <label className="sa-sr-only" htmlFor="seo-engine">Filter by search engine</label>
        <select id="seo-engine" className="sa-select" value={engine} onChange={e => setEngine(e.target.value)}>
          <option value="">All engines</option>
          {ENGINES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <label className="sa-sr-only" htmlFor="seo-fresh">Filter by last check</label>
        <select id="seo-fresh" className="sa-select" value={freshness} onChange={e => setFreshness(e.target.value)}>
          <option value="">Any last check</option>
          <option value="fresh">Checked in the last {STALE_DAYS} days</option>
          <option value="stale">Stale — over {STALE_DAYS} days</option>
          <option value="never">Never checked</option>
        </select>
        <label className="sa-checkbox">
          <input type="checkbox" checked={includeDeleted} onChange={e => setIncludeDeleted(e.target.checked)} />
          Show deleted
        </label>
        <span className="sa-toolbar-spacer" />
        <span className="sa-toolbar-count">
          {list.status === 'ready' ? `${formatInt(list.rows.length)} of ${formatInt(list.total)}` : ' '}
        </span>
      </div>

      {rowError && <div style={{ marginTop: 12 }}><ConsoleErrorPanel error={rowError} onRetry={() => setRowError(null)} /></div>}

      <div style={{ marginTop: 12 }}>
        {list.status === 'loading' && <ConsoleSkeleton rows={8} label="Loading tracked pages…" />}

        {list.status === 'error' && list.error?.notLive && <ConsoleNotLive endpoint={entityPath(ENTITY.seoPages)} />}
        {list.status === 'error' && !list.error?.notLive && <ConsoleErrorPanel error={list.error} onRetry={list.reload} />}

        {list.status === 'ready' && !list.rows.length && (
          filtered ? (
            <ConsoleEmpty
              icon="filter_alt_off"
              title="No tracked pages match"
              hint={<p>Nothing matches this search and filter combination.</p>}
              action={
                <button type="button" className="sa-btn sa-btn-ghost"
                  onClick={() => { setSearch(''); setStatus(''); setEngine(''); setFreshness('') }}>
                  Clear filters
                </button>
              }
            />
          ) : (
            <ConsoleEmpty
              icon="travel_explore"
              title="No pages are being tracked yet"
              hint={
                <>
                  <p>
                    Each row pairs one URL with one target keyword on one search engine in one country,
                    and records where it ranked the last time somebody looked.
                  </p>
                  <p style={{ marginTop: '0.5rem' }}>
                    Add the pages you actually care about ranking — the pricing page, the business-English
                    landing page, the city pages — with the Polish keyword each one is written for.
                    Then use “Record position” after each check so the trend is real.
                  </p>
                </>
              }
              action={
                <button type="button" className="sa-btn sa-btn-primary" onClick={() => setEditing({})}>
                  <span className="material-symbols-outlined" aria-hidden="true">add</span>
                  Track a page
                </button>
              }
            />
          )
        )}

        {list.status === 'ready' && list.rows.length > 0 && (
          <div className="sa-table-wrap">
            <table className="sa-table">
              <caption className="sa-sr-only">Tracked SEO pages, sortable by column</caption>
              <thead>
                <tr>
                  <SortTh label="Page" col="url" sort={sort} onSort={setSort} />
                  <SortTh label="Target keyword" col="target_keyword" sort={sort} onSort={setSort} />
                  <th scope="col">Engine</th>
                  <SortTh label="Position" col="current_position" sort={sort} onSort={setSort} align="right" />
                  <SortTh label="Best" col="best_position" sort={sort} onSort={setSort} align="right" />
                  <SortTh label="Volume" col="search_volume" sort={sort} onSort={setSort} align="right" />
                  <SortTh label="Last checked" col="last_checked_at" sort={sort} onSort={setSort} />
                  <SortTh label="Status" col="status" sort={sort} onSort={setSort} />
                  <th scope="col" style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {list.rows.map(row => (
                  <tr key={row.id}>
                    <td style={{ maxWidth: 320 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <a href={row.url} target="_blank" rel="noopener noreferrer"
                          style={{ color: 'var(--sa-violet-600)', fontWeight: 600, textDecoration: 'none',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {row.url}
                        </a>
                        {row.deleted_at && <Pill label="Deleted" tone="bad" />}
                      </div>
                      {row.title && (
                        <div style={{ fontSize: 'var(--sa-fs-micro)', color: 'var(--sa-text-muted)',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {row.title}
                        </div>
                      )}
                    </td>
                    <td>{row.target_keyword || <span style={{ color: 'var(--sa-text-muted)' }}>{DASH}</span>}</td>
                    <td>
                      <span style={{ color: 'var(--sa-text-muted)' }}>
                        {row.search_engine} · {row.country} · {row.locale}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}><PositionCell row={row} /></td>
                    <td className="sa-num">{row.best_position ?? DASH}</td>
                    <td className="sa-num">{row.search_volume === null || row.search_volume === undefined ? DASH : formatInt(row.search_volume)}</td>
                    <td><StaleCell epoch={row.last_checked_at} /></td>
                    <td><Pill label={row.status} tone={STATUS_TONE[row.status] || 'neutral'} /></td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {row.deleted_at ? (
                        <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" onClick={() => restore(row)}>
                          Restore
                        </button>
                      ) : (
                        <>
                          <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" onClick={() => setChecking(row)}>
                            Record position
                          </button>
                          <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" style={{ marginLeft: 6 }}
                            onClick={() => setEditing(row)}>
                            Edit
                          </button>
                          <button type="button" className="sa-btn sa-btn-danger sa-btn-sm" style={{ marginLeft: 6 }}
                            onClick={() => setConfirming(row)}>
                            Delete
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <LoadMore next={list.next} loading={list.loadingMore} onLoadMore={list.loadMore}
              shown={list.rows.length} total={list.total} />
          </div>
        )}
      </div>

      {editing && (
        <SeoForm row={editing.id ? editing : null} onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); list.reload() }} />
      )}

      {checking && (
        <RecordPosition row={checking} onClose={() => setChecking(null)}
          onSaved={() => { setChecking(null); list.reload() }} />
      )}

      {confirming && (
        <ConfirmModal
          title="Stop tracking this page"
          body={`“${confirming.url}” will be soft-deleted: it leaves this list but stays in the database, and “Show deleted” brings it back.`}
          confirmLabel="Stop tracking"
          busy={rowBusy}
          onConfirm={remove}
          onClose={() => setConfirming(null)}
        />
      )}
    </>
  )
}

// A check is an event: today's position becomes current, yesterday's becomes
// previous, and the best is only ever improved. That keeps the trend arrow in
// the table honest without a second table.
function RecordPosition({ row, onClose, onSaved }) {
  const [position, setPosition] = useState(row.current_position ? String(row.current_position) : '')
  const [date, setDate] = useState(todayISO())
  const [notFound, setNotFound] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function submit(e) {
    e.preventDefault()
    setError(null)
    const pos = notFound ? null : intOrNull(position, { min: 1 })
    if (!notFound && (pos === null || Number.isNaN(pos))) {
      setError(new Error('Enter the position as a whole number of 1 or more, or tick “not in the results”.'))
      return
    }
    const checkedAt = dateInputToEpoch(date)
    if (!checkedAt) {
      setError(new Error('Pick the date the check was made.'))
      return
    }
    const payload = {
      previous_position: row.current_position ?? null,
      current_position: pos,
      last_checked_at: checkedAt,
    }
    if (pos !== null && (row.best_position === null || row.best_position === undefined || pos < row.best_position)) {
      payload.best_position = pos
    }
    setBusy(true)
    try {
      await bizUpdate(ENTITY.seoPages, row.id, payload)
      onSaved()
    } catch (e) { setError(e) } finally { setBusy(false) }
  }

  return (
    <Modal
      title="Record position"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="sa-btn sa-btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" form="seo-check-form" className="sa-btn sa-btn-primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save check'}
          </button>
        </>
      }
    >
      <form id="seo-check-form" onSubmit={submit}>
        <FormError error={error} />
        <p style={{ margin: '0 0 10px', color: 'var(--sa-text-muted)', lineHeight: 1.55 }}>
          {row.url}<br />
          {row.target_keyword ? <>Keyword <strong>{row.target_keyword}</strong> on {row.search_engine} · {row.country}</> : 'No target keyword set'}
        </p>
        <Field label="Position today" htmlFor="sc-pos" hint="1 is the top organic result. The current value moves to “previous”, so the trend arrow stays real.">
          <input id="sc-pos" className="sa-input" inputMode="numeric" value={position} disabled={notFound}
            onChange={e => setPosition(e.target.value)} placeholder="e.g. 7" />
        </Field>
        <Field label="Not ranking" htmlFor="sc-none">
          <label className="sa-checkbox">
            <input id="sc-none" type="checkbox" checked={notFound} onChange={e => setNotFound(e.target.checked)} />
            Not in the results at all — clear the position
          </label>
        </Field>
        <Field label="Checked on" htmlFor="sc-date" required>
          <input id="sc-date" type="date" className="sa-input" value={date} onChange={e => setDate(e.target.value)} required />
        </Field>
      </form>
    </Modal>
  )
}

function SeoForm({ row, onClose, onSaved }) {
  const [form, setForm] = useState(() => toForm(row))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function submit(e) {
    e.preventDefault()
    setError(null)

    const current = intOrNull(form.current_position, { min: 1 })
    const best = intOrNull(form.best_position, { min: 1 })
    const previous = intOrNull(form.previous_position, { min: 1 })
    const volume = intOrNull(form.search_volume)
    if ([current, best, previous, volume].some(Number.isNaN)) {
      setError(new Error('Positions must be whole numbers of 1 or more; search volume must be a whole number.'))
      return
    }
    if (!/^https?:\/\//i.test(form.url.trim())) {
      setError(new Error('The URL must be a full address starting with http:// or https://.'))
      return
    }
    const country = form.country.trim().toUpperCase()
    if (country.length !== 2) {
      setError(new Error('Country must be a two-letter code, for example PL.'))
      return
    }

    const payload = {
      url: form.url.trim(),
      title: nullIfBlank(form.title),
      meta_description: nullIfBlank(form.meta_description),
      target_keyword: nullIfBlank(form.target_keyword),
      locale: form.locale.trim() || 'pl',
      country,
      search_engine: form.search_engine,
      current_position: current,
      best_position: best,
      previous_position: previous,
      search_volume: volume,
      last_checked_at: dateInputToEpoch(form.last_checked),
      status: form.status,
      notes: nullIfBlank(form.notes),
    }

    setBusy(true)
    try {
      if (row) await bizUpdate(ENTITY.seoPages, row.id, payload)
      else await bizCreate(ENTITY.seoPages, payload)
      onSaved()
    } catch (e) { setError(e) } finally { setBusy(false) }
  }

  return (
    <Modal
      title={row ? 'Edit tracked page' : 'Track a page'}
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className="sa-btn sa-btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" form="seo-form" className="sa-btn sa-btn-primary" disabled={busy}>
            {busy ? 'Saving…' : row ? 'Save changes' : 'Track page'}
          </button>
        </>
      }
    >
      <form id="seo-form" onSubmit={submit}>
        <FormError error={error} />

        <Field label="URL" htmlFor="sf-url" required>
          <input id="sf-url" className="sa-input" required value={form.url} onChange={e => set('url', e.target.value)}
            placeholder="https://englishmetro.com/kursy-biznesowe" />
        </Field>

        <Field label="Target keyword" htmlFor="sf-kw" hint="One keyword per row. The same URL can be tracked for several keywords.">
          <input id="sf-kw" className="sa-input" value={form.target_keyword}
            onChange={e => set('target_keyword', e.target.value)} placeholder="angielski biznesowy warszawa" />
        </Field>

        <Field label="Page title" htmlFor="sf-title">
          <input id="sf-title" className="sa-input" value={form.title} onChange={e => set('title', e.target.value)} />
        </Field>

        <Field label="Meta description" htmlFor="sf-meta">
          <textarea id="sf-meta" className="sa-input sa-textarea" style={{ minHeight: 72 }}
            value={form.meta_description} onChange={e => set('meta_description', e.target.value)} />
        </Field>

        <Field label="Engine / market" htmlFor="sf-engine">
          <div style={{ display: 'flex', gap: 8 }}>
            <select id="sf-engine" className="sa-select" value={form.search_engine}
              onChange={e => set('search_engine', e.target.value)} style={{ width: 120, flex: '0 0 auto' }}>
              {ENGINES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <label className="sa-sr-only" htmlFor="sf-country">Country</label>
            <input id="sf-country" className="sa-input" maxLength={2} value={form.country}
              onChange={e => set('country', e.target.value.toUpperCase())} placeholder="PL"
              style={{ width: 80, flex: '0 0 auto' }} />
            <label className="sa-sr-only" htmlFor="sf-locale">Locale</label>
            <input id="sf-locale" className="sa-input" value={form.locale} onChange={e => set('locale', e.target.value)}
              placeholder="pl" style={{ width: 96, flex: '0 0 auto' }} />
          </div>
        </Field>

        <Field label="Positions" htmlFor="sf-current" hint="Current, previous and best. Leave blank when unknown — a blank is honest, a zero is not.">
          <div style={{ display: 'flex', gap: 8 }}>
            <input id="sf-current" className="sa-input" inputMode="numeric" value={form.current_position}
              onChange={e => set('current_position', e.target.value)} placeholder="current" />
            <label className="sa-sr-only" htmlFor="sf-prev">Previous position</label>
            <input id="sf-prev" className="sa-input" inputMode="numeric" value={form.previous_position}
              onChange={e => set('previous_position', e.target.value)} placeholder="previous" />
            <label className="sa-sr-only" htmlFor="sf-best">Best position</label>
            <input id="sf-best" className="sa-input" inputMode="numeric" value={form.best_position}
              onChange={e => set('best_position', e.target.value)} placeholder="best" />
          </div>
        </Field>

        <Field label="Search volume" htmlFor="sf-vol" hint="Monthly searches, if you have a figure you trust. Blank otherwise.">
          <input id="sf-vol" className="sa-input" inputMode="numeric" value={form.search_volume}
            onChange={e => set('search_volume', e.target.value)} style={{ maxWidth: 160 }} />
        </Field>

        <Field label="Last checked" htmlFor="sf-checked">
          <input id="sf-checked" type="date" className="sa-input" value={form.last_checked}
            onChange={e => set('last_checked', e.target.value)} style={{ maxWidth: 200 }} />
        </Field>

        <Field label="Status" htmlFor="sf-status" required>
          <select id="sf-status" className="sa-select" value={form.status} onChange={e => set('status', e.target.value)}>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>

        <Field label="Notes" htmlFor="sf-notes">
          <textarea id="sf-notes" className="sa-input sa-textarea" value={form.notes}
            onChange={e => set('notes', e.target.value)} />
        </Field>
      </form>
    </Modal>
  )
}
