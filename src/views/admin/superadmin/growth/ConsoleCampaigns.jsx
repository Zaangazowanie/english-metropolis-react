// Growth → Campaigns. CRUD over the `campaigns` table in em-business.db
// (schema: /root/em-console-api/em_business.py, SCHEMA_GROWTH).
//
// The table ships empty and stays empty until an operator records a real
// campaign. There is no seed row, no demo row and no placeholder figure here.
// budget_minor is an INTEGER count of minor units and is never turned into a
// float — see growthApi's formatMinor/parseMinor.

import { useMemo, useState } from 'react'
import { ConsoleEmpty, ConsoleErrorPanel, ConsoleNotLive, ConsoleSkeleton } from '../ConsoleStates.jsx'
import {
  ENTITY, bizCreate, bizDelete, bizRestore, bizUpdate, entityPath,
  formatInt, formatMinor, minorToInput, nullIfBlank, parseMinor, CURRENCIES, DASH,
} from './growthApi.js'
import { ConfirmModal, Field, FormError, LoadMore, Modal, Pill, SortTh, useBizList, useDebounced } from './GrowthShared.jsx'

// Every value below is one of the table's CHECK constraints. Sending anything
// else is a 400 from SQLite, so the form only ever offers these.
const CHANNELS = ['seo', 'paid_search', 'paid_social', 'social', 'email', 'content',
  'events', 'referral', 'partner', 'outbound', 'other']
const STATUSES = ['draft', 'scheduled', 'active', 'paused', 'completed', 'cancelled']
const GOAL_METRICS = ['leads', 'signups', 'trials', 'revenue', 'impressions', 'clicks', 'other']

const STATUS_TONE = {
  draft: 'neutral', scheduled: 'brand', active: 'good',
  paused: 'warm', completed: 'neutral', cancelled: 'bad',
}

const label = v => String(v || '').replace(/_/g, ' ')

const EMPTY_FORM = {
  name: '', channel: 'paid_search', status: 'draft', goal: '', goal_metric: '',
  goal_target: '', budget: '', currency: 'PLN', country: 'PL', locale: 'pl',
  start_date: '', end_date: '', utm_source: '', utm_medium: '', utm_campaign: '', notes: '',
}

function toForm(row) {
  if (!row) return { ...EMPTY_FORM }
  return {
    name: row.name || '',
    channel: row.channel || 'paid_search',
    status: row.status || 'draft',
    goal: row.goal || '',
    goal_metric: row.goal_metric || '',
    goal_target: row.goal_target === null || row.goal_target === undefined ? '' : String(row.goal_target),
    budget: minorToInput(row.budget_minor),
    currency: row.currency || 'PLN',
    country: row.country || '',
    locale: row.locale || '',
    start_date: row.start_date || '',
    end_date: row.end_date || '',
    utm_source: row.utm_source || '',
    utm_medium: row.utm_medium || '',
    utm_campaign: row.utm_campaign || '',
    notes: row.notes || '',
  }
}

export default function ConsoleCampaigns() {
  const [search, setSearch] = useState('')
  const q = useDebounced(search)
  const [status, setStatus] = useState('')
  const [channel, setChannel] = useState('')
  const [sort, setSort] = useState('-created_at')
  const [includeDeleted, setIncludeDeleted] = useState(false)
  const [editing, setEditing] = useState(null)      // {} for new, row for edit
  const [confirming, setConfirming] = useState(null)
  const [rowBusy, setRowBusy] = useState(false)
  const [rowError, setRowError] = useState(null)

  const params = useMemo(() => ({
    q: q.trim() || undefined,
    status: status || undefined,
    channel: channel || undefined,
    sort,
    limit: 50,
    include_deleted: includeDeleted ? 1 : undefined,
  }), [q, status, channel, sort, includeDeleted])

  const list = useBizList(ENTITY.campaigns, params)
  const filtered = q || status || channel

  async function remove() {
    setRowBusy(true)
    setRowError(null)
    try {
      await bizDelete(ENTITY.campaigns, confirming.id)
      setConfirming(null)
      list.reload()
    } catch (e) { setRowError(e) } finally { setRowBusy(false) }
  }

  async function restore(row) {
    setRowError(null)
    try {
      await bizRestore(ENTITY.campaigns, row.id)
      list.reload()
    } catch (e) { setRowError(e) }
  }

  return (
    <>
      <div className="sa-page-header">
        <div>
          <h1>Campaigns</h1>
          <p>
            Acquisition campaigns with their channel, budget, run dates and goal. One row per
            campaign you actually run; spend that a provider reports lives in Growth → Adverts.
          </p>
        </div>
        <div className="sa-page-header-actions">
          <button type="button" className="sa-btn sa-btn-primary" onClick={() => setEditing({})}>
            <span className="material-symbols-outlined" aria-hidden="true">add</span>
            New campaign
          </button>
        </div>
      </div>

      <div className="sa-toolbar" role="search">
        <label className="sa-sr-only" htmlFor="camp-q">Search campaigns</label>
        <input
          id="camp-q" type="search" className="sa-input" placeholder="Search name, goal, utm_campaign…"
          value={search} onChange={e => setSearch(e.target.value)} style={{ minWidth: 240 }}
        />
        <label className="sa-sr-only" htmlFor="camp-status">Filter by status</label>
        <select id="camp-status" className="sa-select" value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{label(s)}</option>)}
        </select>
        <label className="sa-sr-only" htmlFor="camp-channel">Filter by channel</label>
        <select id="camp-channel" className="sa-select" value={channel} onChange={e => setChannel(e.target.value)}>
          <option value="">All channels</option>
          {CHANNELS.map(c => <option key={c} value={c}>{label(c)}</option>)}
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
        {list.status === 'loading' && <ConsoleSkeleton rows={8} label="Loading campaigns…" />}

        {list.status === 'error' && list.error?.notLive && <ConsoleNotLive endpoint={entityPath(ENTITY.campaigns)} />}
        {list.status === 'error' && !list.error?.notLive && (
          <ConsoleErrorPanel error={list.error} onRetry={list.reload} />
        )}

        {list.status === 'ready' && !list.rows.length && (
          filtered ? (
            <ConsoleEmpty
              icon="filter_alt_off"
              title="No campaigns match"
              hint={<p>Nothing matches this search and filter combination. Clear them to see every campaign.</p>}
              action={
                <button type="button" className="sa-btn sa-btn-ghost"
                  onClick={() => { setSearch(''); setStatus(''); setChannel('') }}>
                  Clear filters
                </button>
              }
            />
          ) : (
            <ConsoleEmpty
              icon="campaign"
              title="No campaigns recorded yet"
              hint={
                <>
                  <p>
                    This is the register of acquisition campaigns: the channel each one runs on, the
                    budget committed to it, the dates it runs between and the goal it is judged against.
                  </p>
                  <p style={{ marginTop: '0.5rem' }}>
                    Start with the campaign you are running now — name it, pick its channel, set the
                    budget in PLN and give it a goal. Ad-platform spend attaches to it later from
                    Growth → Adverts.
                  </p>
                </>
              }
              action={
                <button type="button" className="sa-btn sa-btn-primary" onClick={() => setEditing({})}>
                  <span className="material-symbols-outlined" aria-hidden="true">add</span>
                  New campaign
                </button>
              }
            />
          )
        )}

        {list.status === 'ready' && list.rows.length > 0 && (
          <div className="sa-table-wrap">
            <table className="sa-table">
              <caption className="sa-sr-only">Campaigns, sortable by column</caption>
              <thead>
                <tr>
                  <SortTh label="Campaign" col="name" sort={sort} onSort={setSort} />
                  <SortTh label="Channel" col="channel" sort={sort} onSort={setSort} />
                  <SortTh label="Status" col="status" sort={sort} onSort={setSort} />
                  <th scope="col">Goal</th>
                  <SortTh label="Budget" col="budget_minor" sort={sort} onSort={setSort} align="right" />
                  <SortTh label="Starts" col="start_date" sort={sort} onSort={setSort} />
                  <SortTh label="Ends" col="end_date" sort={sort} onSort={setSort} />
                  <th scope="col" style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {list.rows.map(row => (
                  <tr key={row.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                        <span style={{ fontWeight: 600 }}>{row.name}</span>
                        {row.deleted_at && <Pill label="Deleted" tone="bad" />}
                      </div>
                      {row.utm_campaign && (
                        <div style={{ fontSize: 'var(--sa-fs-micro)', color: 'var(--sa-text-muted)' }}>
                          utm: {row.utm_source || '?'} / {row.utm_medium || '?'} / {row.utm_campaign}
                        </div>
                      )}
                    </td>
                    <td><Pill label={label(row.channel)} tone="neutral" /></td>
                    <td><Pill label={label(row.status)} tone={STATUS_TONE[row.status] || 'neutral'} /></td>
                    <td>
                      {row.goal || <span style={{ color: 'var(--sa-text-muted)' }}>{DASH}</span>}
                      {row.goal_metric && (
                        <div style={{ fontSize: 'var(--sa-fs-micro)', color: 'var(--sa-text-muted)' }}>
                          {formatInt(row.goal_target)} {label(row.goal_metric)}
                        </div>
                      )}
                    </td>
                    <td className="sa-num">{formatMinor(row.budget_minor, row.currency)}</td>
                    <td className="sa-num">{row.start_date || DASH}</td>
                    <td className="sa-num">{row.end_date || DASH}</td>
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
        <CampaignForm
          row={editing.id ? editing : null}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); list.reload() }}
        />
      )}

      {confirming && (
        <ConfirmModal
          title="Delete campaign"
          body={`“${confirming.name}” will be soft-deleted: it disappears from this list but stays in the database and can be restored with “Show deleted”.`}
          busy={rowBusy}
          onConfirm={remove}
          onClose={() => setConfirming(null)}
        />
      )}
    </>
  )
}

function CampaignForm({ row, onClose, onSaved }) {
  const [form, setForm] = useState(() => toForm(row))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function submit(e) {
    e.preventDefault()
    setError(null)

    const budgetMinor = parseMinor(form.budget)
    if (Number.isNaN(budgetMinor)) {
      setError(new Error('Budget must be an amount like 1234,56 — digits and at most two decimals.'))
      return
    }
    if (budgetMinor !== null && budgetMinor < 0) {
      setError(new Error('Budget cannot be negative.'))
      return
    }
    if (form.start_date && form.end_date && form.end_date < form.start_date) {
      setError(new Error('The end date is before the start date.'))
      return
    }
    const goalTarget = form.goal_target.trim() === '' ? null : Number(form.goal_target)
    if (goalTarget !== null && !Number.isFinite(goalTarget)) {
      setError(new Error('Goal target must be a whole number.'))
      return
    }

    const payload = {
      name: form.name.trim(),
      channel: form.channel,
      status: form.status,
      goal: nullIfBlank(form.goal),
      goal_metric: nullIfBlank(form.goal_metric),
      goal_target: goalTarget === null ? null : Math.trunc(goalTarget),
      budget_minor: budgetMinor,
      currency: form.currency,
      country: nullIfBlank(form.country) ? form.country.trim().toUpperCase() : null,
      locale: nullIfBlank(form.locale),
      start_date: nullIfBlank(form.start_date),
      end_date: nullIfBlank(form.end_date),
      utm_source: nullIfBlank(form.utm_source),
      utm_medium: nullIfBlank(form.utm_medium),
      utm_campaign: nullIfBlank(form.utm_campaign),
      notes: nullIfBlank(form.notes),
    }

    setBusy(true)
    try {
      if (row) await bizUpdate(ENTITY.campaigns, row.id, payload)
      else await bizCreate(ENTITY.campaigns, payload)
      onSaved()
    } catch (e) { setError(e) } finally { setBusy(false) }
  }

  return (
    <Modal
      title={row ? `Edit campaign · ${row.name}` : 'New campaign'}
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className="sa-btn sa-btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" form="campaign-form" className="sa-btn sa-btn-primary" disabled={busy}>
            {busy ? 'Saving…' : row ? 'Save changes' : 'Create campaign'}
          </button>
        </>
      }
    >
      <form id="campaign-form" onSubmit={submit}>
        <FormError error={error} />

        <Field label="Name" htmlFor="cf-name" required>
          <input id="cf-name" className="sa-input" required value={form.name}
            onChange={e => set('name', e.target.value)} placeholder="Autumn B2B — Warsaw" />
        </Field>

        <Field label="Channel" htmlFor="cf-channel" required>
          <select id="cf-channel" className="sa-select" value={form.channel} onChange={e => set('channel', e.target.value)}>
            {CHANNELS.map(c => <option key={c} value={c}>{label(c)}</option>)}
          </select>
        </Field>

        <Field label="Status" htmlFor="cf-status" required>
          <select id="cf-status" className="sa-select" value={form.status} onChange={e => set('status', e.target.value)}>
            {STATUSES.map(s => <option key={s} value={s}>{label(s)}</option>)}
          </select>
        </Field>

        <Field label="Budget" htmlFor="cf-budget" hint="Stored as integer minor units (grosze). Leave blank for no committed budget.">
          <div style={{ display: 'flex', gap: 8 }}>
            <input id="cf-budget" className="sa-input" inputMode="decimal" value={form.budget}
              onChange={e => set('budget', e.target.value)} placeholder="0,00" />
            <label className="sa-sr-only" htmlFor="cf-currency">Currency</label>
            <select id="cf-currency" className="sa-select" value={form.currency}
              onChange={e => set('currency', e.target.value)} style={{ width: 96, flex: '0 0 auto' }}>
              {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </Field>

        <Field label="Runs" htmlFor="cf-start">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input id="cf-start" type="date" className="sa-input" value={form.start_date}
              onChange={e => set('start_date', e.target.value)} aria-label="Start date" />
            <span style={{ color: 'var(--sa-text-muted)' }}>to</span>
            <input type="date" className="sa-input" value={form.end_date}
              onChange={e => set('end_date', e.target.value)} aria-label="End date" />
          </div>
        </Field>

        <Field label="Goal" htmlFor="cf-goal">
          <input id="cf-goal" className="sa-input" value={form.goal}
            onChange={e => set('goal', e.target.value)} placeholder="30 corporate trial lessons booked" />
        </Field>

        <Field label="Goal metric" htmlFor="cf-goal-metric">
          <div style={{ display: 'flex', gap: 8 }}>
            <select id="cf-goal-metric" className="sa-select" value={form.goal_metric}
              onChange={e => set('goal_metric', e.target.value)}>
              <option value="">— none —</option>
              {GOAL_METRICS.map(m => <option key={m} value={m}>{label(m)}</option>)}
            </select>
            <label className="sa-sr-only" htmlFor="cf-goal-target">Goal target</label>
            <input id="cf-goal-target" className="sa-input" inputMode="numeric" value={form.goal_target}
              onChange={e => set('goal_target', e.target.value)} placeholder="target" style={{ width: 120, flex: '0 0 auto' }} />
          </div>
        </Field>

        <Field label="Market" htmlFor="cf-country" hint="Two-letter country code and content locale. Poland-first: PL / pl.">
          <div style={{ display: 'flex', gap: 8 }}>
            <input id="cf-country" className="sa-input" maxLength={2} value={form.country}
              onChange={e => set('country', e.target.value.toUpperCase())} placeholder="PL" style={{ width: 80, flex: '0 0 auto' }} />
            <label className="sa-sr-only" htmlFor="cf-locale">Locale</label>
            <input id="cf-locale" className="sa-input" value={form.locale}
              onChange={e => set('locale', e.target.value)} placeholder="pl" style={{ width: 96, flex: '0 0 auto' }} />
          </div>
        </Field>

        <Field label="UTM" htmlFor="cf-utm-source" hint="Matches the utm_source / utm_medium / utm_campaign on the landing URL.">
          <div style={{ display: 'flex', gap: 8 }}>
            <input id="cf-utm-source" className="sa-input" value={form.utm_source}
              onChange={e => set('utm_source', e.target.value)} placeholder="source" />
            <label className="sa-sr-only" htmlFor="cf-utm-medium">UTM medium</label>
            <input id="cf-utm-medium" className="sa-input" value={form.utm_medium}
              onChange={e => set('utm_medium', e.target.value)} placeholder="medium" />
            <label className="sa-sr-only" htmlFor="cf-utm-campaign">UTM campaign</label>
            <input id="cf-utm-campaign" className="sa-input" value={form.utm_campaign}
              onChange={e => set('utm_campaign', e.target.value)} placeholder="campaign" />
          </div>
        </Field>

        <Field label="Notes" htmlFor="cf-notes">
          <textarea id="cf-notes" className="sa-input sa-textarea" value={form.notes}
            onChange={e => set('notes', e.target.value)} />
        </Field>
      </form>
    </Modal>
  )
}
