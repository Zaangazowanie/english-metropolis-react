// CRM → Pipeline. Deals on a board, one column per pipeline stage.
//
// Three things this screen refuses to get wrong:
//
//  1. Money. value_minor is an INTEGER of minor units (grosze). Every sum and
//     every probability weighting is integer arithmetic; the only division by
//     100 happens inside formatMoney, at the display boundary. Currencies are
//     never added together — a board holding PLN and EUR shows both totals.
//  2. Stage moves without a mouse. Drag works, but a card is a button: focus it
//     and ← / → move it a stage, with the result announced politely. The same
//     move is available as a plain select inside the deal drawer.
//  3. Won and lost are states with consequences. Moving into the Won stage
//     stamps won_at, moving into Lost demands a reason before the write, and
//     moving back out clears both — the schema's CHECK constraints require
//     exactly that pairing.

import { useMemo, useRef, useState } from 'react'
import {
  ActivityPanel, ConfirmDialog, CrmDrawer, Field, FormSection, ListState,
  SelectField, TextAreaField, TextField, WriteError,
  nz, useBizList, useDebounced, useRefList,
} from './CrmShared.jsx'
import { ConsoleEmpty } from './ConsoleStates.jsx'
import {
  bizCreate, bizDelete, bizUpdate, daysUntil, formatDay, formatMoney,
  minorToInput, nowEpoch, parseMoneyToMinor,
} from './crmApi.js'

const ENDPOINT = '/api/console/biz/deals'

// The seeded board. A second pipeline would need a picker; there is exactly one
// today (em_business.py seeds seven 'sales' stages), so this stays a constant
// rather than a speculative selector.
const PIPELINE = 'sales'

const BILLING_PERIODS = [
  { value: 'one_off', label: 'One-off' },
  { value: 'monthly', label: 'Per month' },
  { value: 'quarterly', label: 'Per quarter' },
  { value: 'yearly', label: 'Per year' },
]

const PERIOD_SUFFIX = { one_off: '', monthly: '/mo', quarterly: '/qtr', yearly: '/yr' }

const STATUS_FILTERS = [
  { value: '', label: 'All deals' },
  { value: 'open', label: 'Open only' },
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost' },
]

// Integer sums, kept apart by currency.
function sumByCurrency(deals, weightFn) {
  const out = new Map()
  for (const d of deals) {
    const currency = d.currency || 'PLN'
    const minor = Number(d.value_minor || 0)
    out.set(currency, (out.get(currency) || 0) + (weightFn ? weightFn(d, minor) : minor))
  }
  return out
}

function MoneyTotal({ totals, muted }) {
  const entries = [...totals.entries()].filter(([, v]) => v !== 0)
  if (!entries.length) return <span className="sa-num" style={{ color: 'var(--sa-text-muted)' }}>—</span>
  return (
    <span className="sa-num" style={muted ? { color: 'var(--sa-text-muted)' } : undefined}>
      {entries.map(([cur, minor]) => formatMoney(minor, cur)).join('  +  ')}
    </span>
  )
}

export default function ConsolePipeline() {
  const [qInput, setQInput] = useState('')
  const q = useDebounced(qInput)
  const [status, setStatus] = useState('')
  const [editing, setEditing] = useState(null)          // deal | 'new' | null
  const [patched, setPatched] = useState({})            // id -> server row after a move
  const [movingId, setMovingId] = useState(null)
  const [moveError, setMoveError] = useState('')
  const [announce, setAnnounce] = useState('')
  const [lostPrompt, setLostPrompt] = useState(null)    // {deal, stage}
  const [lostReason, setLostReason] = useState('')
  const dragId = useRef(null)

  const stageList = useBizList('pipeline_stages', { pipeline: PIPELINE, active: 1, sort: 'position', limit: 50 })
  const dealList = useBizList('deals', {
    pipeline: PIPELINE,
    ...(status ? { status } : {}),
    ...(q ? { q } : {}),
    sort: '-value_minor',
    limit: 200,
  })
  const companies = useRefList('companies', { sort: 'name', limit: 200 })
  const contacts = useRefList('contacts', { sort: 'last_name', limit: 200 })
  const team = useRefList('team_members', { sort: 'full_name', limit: 200 })

  const stages = useMemo(
    () => (stageList.status === 'ready' ? stageList.rows : []),
    [stageList.status, stageList.rows],
  )
  const deals = useMemo(
    () => (dealList.status === 'ready' ? dealList.rows.map(d => patched[d.id] || d) : []),
    [dealList.status, dealList.rows, patched],
  )
  const stageById = useMemo(() => new Map(stages.map(s => [s.id, s])), [stages])
  const companyName = id => companies.find(c => c.id === id)?.name || ''
  const contactName = id => {
    const c = contacts.find(x => x.id === id)
    return c ? [c.first_name, c.last_name].filter(Boolean).join(' ') : ''
  }

  const byStage = useMemo(() => {
    const map = new Map(stages.map(s => [s.id, []]))
    for (const d of deals) {
      if (!map.has(d.stage_id)) map.set(d.stage_id, [])
      map.get(d.stage_id).push(d)
    }
    return map
  }, [stages, deals])

  const weightOf = (deal, minor) => {
    const p = deal.probability ?? stageById.get(deal.stage_id)?.probability ?? 0
    return Math.round(minor * Number(p) / 100)
  }

  const openDeals = deals.filter(d => d.status === 'open')
  const wonDeals = deals.filter(d => d.status === 'won')
  const filtersActive = Boolean(q || status)

  async function applyMove(deal, stage, reason) {
    setMovingId(deal.id)
    setMoveError('')
    const patch = { stage_id: stage.id }
    if (stage.is_won) {
      patch.status = 'won'
      patch.won_at = nowEpoch()
      patch.lost_at = null
      patch.lost_reason = null
    } else if (stage.is_lost) {
      patch.status = 'lost'
      patch.lost_at = nowEpoch()
      patch.won_at = null
      patch.lost_reason = nz(reason)
    } else {
      patch.status = 'open'
      patch.won_at = null
      patch.lost_at = null
      patch.lost_reason = null
    }
    try {
      const saved = await bizUpdate('deals', deal.id, patch)
      setPatched(p => ({ ...p, [deal.id]: saved || { ...deal, ...patch } }))
      setAnnounce(`${deal.title} moved to ${stage.name}.`)
    } catch (e) {
      setMoveError(e.message || 'Could not move this deal')
      setAnnounce(`${deal.title} could not be moved.`)
    } finally {
      setMovingId(null)
    }
  }

  function requestMove(deal, stage) {
    if (!stage || stage.id === deal.stage_id || movingId) return
    if (stage.is_lost) {
      setLostReason(deal.lost_reason || '')
      setLostPrompt({ deal, stage })
      return
    }
    applyMove(deal, stage)
  }

  function moveByOffset(deal, offset) {
    const i = stages.findIndex(s => s.id === deal.stage_id)
    if (i < 0) return
    requestMove(deal, stages[i + offset])
  }

  const boardReady = stageList.status === 'ready' && dealList.status === 'ready'

  return (
    <>
      <div className="sa-page-header">
        <div>
          <h1>Pipeline</h1>
          <p>
            Every open opportunity by stage, with the weighted forecast beside the raw value. Focus a
            card and use the left and right arrow keys to move it, or drag it. Won and lost are
            recorded with their date, and lost with its reason.
          </p>
        </div>
        <div className="sa-page-header-actions">
          <button
            type="button"
            className="sa-btn sa-btn-primary"
            onClick={() => setEditing('new')}
            disabled={!stages.length}
          >
            <span className="material-symbols-outlined" aria-hidden="true">add</span>
            New deal
          </button>
        </div>
      </div>

      {boardReady && deals.length > 0 && (
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', marginBottom: 12 }}>
          <div className="sa-kpi">
            <span className="sa-kpi-label">Open deals</span>
            <span className="sa-kpi-value">{openDeals.length}</span>
          </div>
          <div className="sa-kpi">
            <span className="sa-kpi-label">Open value</span>
            <span className="sa-kpi-value" style={{ fontSize: 18 }}>
              <MoneyTotal totals={sumByCurrency(openDeals)} />
            </span>
          </div>
          <div className="sa-kpi">
            <span className="sa-kpi-label">Weighted forecast</span>
            <span className="sa-kpi-value" style={{ fontSize: 18, color: 'var(--sa-violet-600)' }}>
              <MoneyTotal totals={sumByCurrency(openDeals, weightOf)} />
            </span>
          </div>
          <div className="sa-kpi">
            <span className="sa-kpi-label">Won</span>
            <span className="sa-kpi-value" style={{ fontSize: 18, color: 'var(--sa-good)' }}>
              <MoneyTotal totals={sumByCurrency(wonDeals)} />
            </span>
          </div>
        </div>
      )}

      <div className="sa-toolbar">
        <label className="sa-sr-only" htmlFor="deals-search">Search deals</label>
        <input
          id="deals-search"
          type="search"
          className="sa-input"
          placeholder="Search deal title, notes, source…"
          value={qInput}
          onChange={e => setQInput(e.target.value)}
          style={{ minWidth: 240 }}
        />
        <label className="sa-sr-only" htmlFor="deals-status">Status</label>
        <select id="deals-status" className="sa-select" value={status} onChange={e => setStatus(e.target.value)}>
          {STATUS_FILTERS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        {filtersActive && (
          <button type="button" className="sa-btn sa-btn-ghost" onClick={() => { setQInput(''); setStatus('') }}>
            <span className="material-symbols-outlined" aria-hidden="true">filter_alt_off</span>
            Clear filters
          </button>
        )}
        <span className="sa-toolbar-spacer" />
        {boardReady && (
          <span className="sa-toolbar-count">
            {deals.length === dealList.total
              ? `${deals.length} deals`
              : `showing ${deals.length} of ${dealList.total} deals`}
          </span>
        )}
      </div>

      <p className="sa-sr-only" role="status" aria-live="polite">{announce}</p>
      {moveError && <WriteError error={moveError} />}

      <div style={{ marginTop: 12 }}>
        <ListState
          status={stageList.status === 'ready' ? dealList.status : stageList.status}
          error={stageList.error || dealList.error}
          endpoint={stageList.status === 'error' ? '/api/console/biz/pipeline_stages' : ENDPOINT}
          onRetry={() => { stageList.reload(); dealList.reload() }}
        />

        {stageList.status === 'ready' && !stages.length && (
          <ConsoleEmpty
            icon="view_kanban"
            title="No pipeline stages"
            hint={
              <p>
                The board is drawn from <code>pipeline_stages</code>, which ships with seven seeded
                stages (New → Qualified → Discovery → Proposal → Negotiation → Won / Lost). None came
                back, so the reference data has not been seeded on this deployment yet.
              </p>
            }
          />
        )}

        {boardReady && stages.length > 0 && !deals.length && (
          filtersActive ? (
            <ConsoleEmpty
              icon="search_off"
              title="No deals match these filters"
              hint="Nothing on the board matches the current search and status filter."
              action={
                <button type="button" className="sa-btn sa-btn-ghost" onClick={() => { setQInput(''); setStatus('') }}>
                  Clear filters
                </button>
              }
            />
          ) : (
            <ConsoleEmpty
              icon="view_kanban"
              title="No deals yet"
              hint={
                <>
                  <p>
                    A deal is one opportunity worth money: a corporate programme, a group course, a
                    block of individual lessons. It carries a value, a currency, an expected close date
                    and the stage it has reached.
                  </p>
                  <p style={{ marginTop: '0.5rem' }}>
                    Create the first one against a company or a contact, and the board fills the moment
                    it is saved.
                  </p>
                </>
              }
              action={
                <button type="button" className="sa-btn sa-btn-primary" onClick={() => setEditing('new')}>
                  Create the first deal
                </button>
              }
            />
          )
        )}

        {boardReady && stages.length > 0 && deals.length > 0 && (
          <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 6, alignItems: 'flex-start' }}>
            {stages.map(stage => {
              const rows = byStage.get(stage.id) || []
              return (
                <section
                  key={stage.id}
                  onDragOver={e => { e.preventDefault() }}
                  onDrop={e => {
                    e.preventDefault()
                    const deal = deals.find(d => d.id === dragId.current)
                    dragId.current = null
                    if (deal) requestMove(deal, stage)
                  }}
                  style={{
                    flex: '0 0 268px',
                    background: 'var(--sa-surface)',
                    border: '1px solid var(--sa-border)',
                    borderRadius: 'var(--sa-radius-card)',
                    boxShadow: 'var(--sa-shadow)',
                    display: 'flex',
                    flexDirection: 'column',
                    maxHeight: '70vh',
                  }}
                  aria-label={`${stage.name}, ${rows.length} deals`}
                >
                  <header style={{
                    padding: '10px 12px',
                    borderBottom: '1px solid var(--sa-border)',
                    background: 'var(--sa-surface-soft)',
                    borderRadius: 'var(--sa-radius-card) var(--sa-radius-card) 0 0',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontWeight: 700 }}>{stage.name}</span>
                      <span className="sa-badge">{rows.length}</span>
                      <span style={{ marginLeft: 'auto', fontSize: 'var(--sa-fs-micro)', color: 'var(--sa-text-muted)' }}>
                        {stage.is_won ? 'won' : stage.is_lost ? 'lost' : `${stage.probability}%`}
                      </span>
                    </div>
                    <div style={{ marginTop: 4, fontSize: 'var(--sa-fs-small)' }}>
                      <MoneyTotal totals={sumByCurrency(rows)} />
                    </div>
                    {!stage.is_won && !stage.is_lost && (
                      <div style={{ fontSize: 'var(--sa-fs-micro)', color: 'var(--sa-text-muted)' }}>
                        weighted <MoneyTotal totals={sumByCurrency(rows, weightOf)} muted />
                      </div>
                    )}
                  </header>

                  <div style={{ padding: 8, display: 'grid', gap: 8, overflowY: 'auto' }}>
                    {!rows.length && (
                      <p style={{ margin: 0, padding: '10px 4px', fontSize: 'var(--sa-fs-small)', color: 'var(--sa-text-muted)' }}>
                        No deals in this stage.
                      </p>
                    )}
                    {rows.map(deal => (
                      <DealCard
                        key={deal.id}
                        deal={deal}
                        stage={stage}
                        stages={stages}
                        busy={movingId === deal.id}
                        company={companyName(deal.company_id)}
                        contact={contactName(deal.contact_id)}
                        onOpen={() => setEditing(deal)}
                        onMove={offset => moveByOffset(deal, offset)}
                        onDragStart={() => { dragId.current = deal.id }}
                      />
                    ))}
                  </div>
                </section>
              )
            })}
          </div>
        )}

        {boardReady && dealList.cursor && (
          <div style={{ marginTop: 10 }}>
            <button type="button" className="sa-btn sa-btn-ghost" onClick={dealList.loadMore} disabled={dealList.moreBusy}>
              {dealList.moreBusy ? 'Loading…' : `Load more deals (${dealList.total - deals.length} left)`}
            </button>
            {dealList.moreError && <WriteError error={dealList.moreError} />}
          </div>
        )}
      </div>

      {editing && (
        <DealDrawer
          key={editing === 'new' ? 'new' : editing.id}
          row={editing === 'new' ? null : editing}
          stages={stages}
          companies={companies}
          contacts={contacts}
          team={team}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            setPatched({})
            dealList.reload()
          }}
        />
      )}

      {lostPrompt && (
        <ConfirmDialog
          title={`Mark “${lostPrompt.deal.title}” as lost?`}
          confirmLabel="Mark lost"
          danger
          busy={movingId === lostPrompt.deal.id}
          body={
            <>
              <p style={{ marginBottom: 10 }}>
                A lost deal keeps its value and its history; the reason is what makes the loss useful
                later, so it is asked for now rather than left blank.
              </p>
              <label className="sa-field-label" htmlFor="lost-reason">Reason</label>
              <input
                id="lost-reason"
                className="sa-input"
                value={lostReason}
                onChange={e => setLostReason(e.target.value)}
                placeholder="Price, timing, went in-house, no budget…"
              />
            </>
          }
          onConfirm={async () => {
            const { deal, stage } = lostPrompt
            await applyMove(deal, stage, lostReason)
            setLostPrompt(null)
            setLostReason('')
          }}
          onCancel={() => { setLostPrompt(null); setLostReason('') }}
        />
      )}
    </>
  )
}

/* ──────────────────────────────── the card ─────────────────────────────── */

function DealCard({ deal, stage, stages, busy, company, contact, onOpen, onMove, onDragStart }) {
  const index = stages.findIndex(s => s.id === stage.id)
  const days = deal.status === 'open' ? daysUntil(deal.expected_close_date) : null
  const overdue = days !== null && days < 0
  const soon = days !== null && days >= 0 && days <= 7
  const probability = deal.probability ?? stage.probability

  return (
    <button
      type="button"
      draggable
      onDragStart={onDragStart}
      onClick={onOpen}
      onKeyDown={e => {
        if (e.key === 'ArrowRight') { e.preventDefault(); onMove(1) }
        if (e.key === 'ArrowLeft') { e.preventDefault(); onMove(-1) }
      }}
      aria-label={
        `${deal.title}, ${formatMoney(deal.value_minor, deal.currency)}, stage ${stage.name}`
        + `${index >= 0 ? `, ${index + 1} of ${stages.length}` : ''}`
        + '. Enter to open, left and right arrow keys to change stage.'
      }
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        padding: '9px 10px',
        borderRadius: 12,
        border: '1px solid var(--sa-border)',
        background: 'var(--sa-surface)',
        color: 'var(--sa-text)',
        font: 'inherit',
        cursor: busy ? 'progress' : 'pointer',
        opacity: busy ? 0.6 : 1,
        boxShadow: overdue ? 'inset 3px 0 0 var(--sa-bad)' : soon ? 'inset 3px 0 0 var(--sa-warm)' : undefined,
      }}
    >
      <span style={{ display: 'block', fontWeight: 600, lineHeight: 1.35 }}>{deal.title}</span>
      {(company || contact) && (
        <span style={{ display: 'block', marginTop: 2, fontSize: 'var(--sa-fs-micro)', color: 'var(--sa-text-muted)' }}>
          {[company, contact].filter(Boolean).join(' · ')}
        </span>
      )}
      <span style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 6 }}>
        <span className="sa-num" style={{ fontWeight: 700 }}>
          {formatMoney(deal.value_minor, deal.currency)}{PERIOD_SUFFIX[deal.billing_period] || ''}
        </span>
        <span className="sa-num" style={{ fontSize: 'var(--sa-fs-micro)', color: 'var(--sa-text-muted)' }}>
          {probability}%
        </span>
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
        {deal.status === 'won' && (
          <span className="sa-badge" style={{ background: 'var(--sa-good-soft)', color: 'var(--sa-good)' }}>won</span>
        )}
        {deal.status === 'lost' && (
          <span className="sa-badge" style={{ background: 'var(--sa-bad-soft)', color: 'var(--sa-bad)' }}>
            lost{deal.lost_reason ? ` · ${deal.lost_reason}` : ''}
          </span>
        )}
        {deal.expected_close_date && deal.status === 'open' && (
          <span
            className="sa-badge sa-num"
            style={
              overdue
                ? { background: 'var(--sa-bad-soft)', color: 'var(--sa-bad)' }
                : soon
                  ? { background: 'var(--sa-warm-soft)', color: 'var(--sa-warm-ink)' }
                  : undefined
            }
          >
            {formatDay(deal.expected_close_date)}
            {overdue ? ` · ${Math.abs(days)}d late` : ''}
          </span>
        )}
      </span>
    </button>
  )
}

/* ─────────────────────────────── the drawer ────────────────────────────── */

function blank(stages) {
  return {
    title: '',
    stage_id: stages[0] ? String(stages[0].id) : '',
    company_id: '', contact_id: '',
    value: '0.00', currency: 'PLN', billing_period: 'one_off',
    probability: '', expected_close_date: '',
    owner_id: '', source: '', notes: '', lost_reason: '',
  }
}

function toForm(row, stages) {
  if (!row) return blank(stages)
  return {
    title: row.title || '',
    stage_id: String(row.stage_id ?? ''),
    company_id: row.company_id != null ? String(row.company_id) : '',
    contact_id: row.contact_id != null ? String(row.contact_id) : '',
    value: minorToInput(row.value_minor),
    currency: row.currency || 'PLN',
    billing_period: row.billing_period || 'one_off',
    probability: row.probability != null ? String(row.probability) : '',
    expected_close_date: formatDay(row.expected_close_date),
    owner_id: row.owner_id != null ? String(row.owner_id) : '',
    source: row.source || '',
    notes: row.notes || '',
    lost_reason: row.lost_reason || '',
  }
}

function DealDrawer({ row, stages, companies, contacts, team, onClose, onSaved }) {
  const [form, setForm] = useState(() => toForm(row, stages))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [touched, setTouched] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setTouched(true) }

  const money = parseMoneyToMinor(form.value)
  const stage = stages.find(s => String(s.id) === String(form.stage_id))
  const probabilityInvalid = form.probability !== ''
    && (!/^\d{1,3}$/.test(form.probability) || Number(form.probability) > 100)
  const titleInvalid = touched && !form.title.trim()
  const canSave = form.title.trim() && form.stage_id && !money.error && !probabilityInvalid && !busy

  const effectiveProbability = form.probability !== '' ? Number(form.probability) : (stage?.probability ?? 0)
  const weighted = money.minor === null ? null : Math.round(money.minor * effectiveProbability / 100)

  async function save() {
    if (!canSave) { setTouched(true); return }
    setBusy(true)
    setError('')
    const payload = {
      title: form.title.trim(),
      pipeline: PIPELINE,
      stage_id: Number(form.stage_id),
      company_id: form.company_id ? Number(form.company_id) : null,
      contact_id: form.contact_id ? Number(form.contact_id) : null,
      value_minor: money.minor,
      currency: (form.currency || 'PLN').toUpperCase(),
      billing_period: form.billing_period || 'one_off',
      probability: form.probability === '' ? null : Number(form.probability),
      expected_close_date: nz(form.expected_close_date),
      owner_id: form.owner_id ? Number(form.owner_id) : null,
      source: nz(form.source),
      notes: nz(form.notes),
    }
    // status/won_at/lost_at are a set the CHECK constraints police together, so
    // the stage decides all three rather than letting them drift apart.
    if (stage?.is_won) {
      payload.status = 'won'
      payload.won_at = row?.won_at || nowEpoch()
      payload.lost_at = null
      payload.lost_reason = null
    } else if (stage?.is_lost) {
      payload.status = 'lost'
      payload.lost_at = row?.lost_at || nowEpoch()
      payload.won_at = null
      payload.lost_reason = nz(form.lost_reason)
    } else {
      payload.status = 'open'
      payload.won_at = null
      payload.lost_at = null
      payload.lost_reason = null
    }
    try {
      if (row) await bizUpdate('deals', row.id, payload)
      else await bizCreate('deals', payload)
      onSaved()
    } catch (e) {
      setError(e.message || 'Could not save this deal')
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    setBusy(true)
    setError('')
    try {
      await bizDelete('deals', row.id)
      onSaved()
    } catch (e) {
      setError(e.message || 'Could not delete this deal')
      setConfirmDelete(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <CrmDrawer
        title={row ? row.title : 'New deal'}
        subtitle={row ? `Deal #${row.id} · ${row.status}` : 'Nothing is stored until you save.'}
        onClose={onClose}
        footer={
          <>
            {row && (
              <button
                type="button"
                className="sa-btn sa-btn-danger"
                style={{ marginRight: 'auto' }}
                onClick={() => setConfirmDelete(true)}
              >
                Delete
              </button>
            )}
            <button type="button" className="sa-btn sa-btn-ghost" onClick={onClose}>Cancel</button>
            <button type="button" className="sa-btn sa-btn-primary" onClick={save} disabled={busy}>
              {busy ? 'Saving…' : row ? 'Save changes' : 'Create deal'}
            </button>
          </>
        }
      >
        <FormSection title="Opportunity">
          <TextField label="Title" required value={form.title} onChange={v => set('title', v)}
            error={titleInvalid ? 'A title is required.' : ''} />
          <SelectField
            label="Stage"
            value={form.stage_id}
            onChange={v => set('stage_id', v)}
            options={stages.map(s => ({
              value: String(s.id),
              label: `${s.name}${s.is_won ? ' (won)' : s.is_lost ? ' (lost)' : ` · ${s.probability}%`}`,
            }))}
            placeholder="Pick a stage"
          />
          <SelectField
            label="Company"
            value={form.company_id}
            onChange={v => set('company_id', v)}
            options={companies.map(c => ({ value: String(c.id), label: c.name }))}
            placeholder={companies.length ? 'No company' : 'No companies yet'}
          />
          <SelectField
            label="Contact"
            value={form.contact_id}
            onChange={v => set('contact_id', v)}
            options={contacts.map(c => ({
              value: String(c.id),
              label: [c.first_name, c.last_name].filter(Boolean).join(' ') || c.email || `Contact #${c.id}`,
            }))}
            placeholder={contacts.length ? 'No contact' : 'No contacts yet'}
          />
          <SelectField
            label="Owner"
            value={form.owner_id}
            onChange={v => set('owner_id', v)}
            options={team.map(t => ({ value: String(t.id), label: t.full_name }))}
            placeholder={team.length ? 'Unassigned' : 'No team members yet'}
          />
          <TextField label="Source" value={form.source} onChange={v => set('source', v)} />
        </FormSection>

        <FormSection
          title="Value"
          note="Stored as integer minor units — 12 000,00 PLN is 1 200 000 grosze. Enter major units; the conversion is exact."
        >
          <TextField label="Amount" value={form.value} onChange={v => set('value', v)}
            error={money.error} inputMode="decimal" />
          <TextField label="Currency" value={form.currency} onChange={v => set('currency', v.toUpperCase())}
            maxLength={3} />
          <SelectField label="Billing" value={form.billing_period} onChange={v => set('billing_period', v)}
            options={BILLING_PERIODS} placeholder="One-off" />
          <TextField
            label="Probability"
            value={form.probability}
            onChange={v => set('probability', v.replace(/\D/g, '').slice(0, 3))}
            error={probabilityInvalid ? '0 to 100.' : ''}
            hint={form.probability === '' && stage ? `Empty means the stage default, ${stage.probability}%.` : ''}
            inputMode="numeric"
          />
          <TextField label="Expected close" type="date" value={form.expected_close_date}
            onChange={v => set('expected_close_date', v)} />
          <Field label="Weighted value">
            <span className="sa-num" style={{ fontWeight: 700, color: 'var(--sa-violet-600)' }}>
              {weighted === null ? '—' : formatMoney(weighted, (form.currency || 'PLN').toUpperCase())}
            </span>
          </Field>
        </FormSection>

        {stage?.is_lost && (
          <FormSection title="Loss">
            <TextField label="Lost reason" value={form.lost_reason} onChange={v => set('lost_reason', v)} />
          </FormSection>
        )}

        <FormSection title="Notes">
          <TextAreaField label="Notes" value={form.notes} onChange={v => set('notes', v)} rows={3} />
        </FormSection>

        <WriteError error={error} />

        {row && <ActivityPanel entityType="deal" entityId={row.id} />}
      </CrmDrawer>

      {confirmDelete && (
        <ConfirmDialog
          title="Delete this deal?"
          danger
          busy={busy}
          confirmLabel="Delete deal"
          body={<p><strong>{row.title}</strong> will be soft-deleted and leaves the board.</p>}
          onConfirm={remove}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </>
  )
}
