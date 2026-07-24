// ConsolePayroll — Finance → Payroll.
//
// This replaces SuperadminSalary, which computed pay from two static JSON files
// with the rates 60 / 70 / 90 PLN hardcoded in the source. Nothing here assumes
// a number. Pay comes from three real tables in em-business.db:
//
//   rate_cards     effective-dated money. A rate is never edited; a new row with
//                  a later effective_from supersedes it, so an old run can still
//                  show the rate that actually applied at the time.
//   payroll_runs   a period (period_start … period_end) in one currency.
//   payroll_lines  one line per team member per kind, carrying the rate_card_id
//                  it was computed from — the receipt for the arithmetic.
//
// If no rate card covers a member for the run period, this screen says exactly
// that and refuses to add the line. An invented rate is a wrong payslip.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ConsoleEmpty, ConsoleErrorPanel, ConsoleNotLive, ConsoleSkeleton } from './ConsoleStates.jsx'
import {
  Drawer, Field, Kpi, KPI_GRID, ListFooter, Modal, Notice, SortTh, StatusBadge,
} from './FinanceShared.jsx'
import {
  bizCreate, bizDelete, bizList, bizUpdate, divRound, formatMilli, formatMinor,
  formatMinorBare, isoWithin, parseMilli, parseMinor, todayIso,
} from './financeApi.js'

const PAGE = 50
const RUN_STATUSES = ['draft', 'review', 'approved', 'paid', 'cancelled']
const LESSON_TYPES = ['individual', 'pair', 'group', 'corporate', 'intensive', 'trial', 'admin', 'other']
const UNITS = ['lesson', 'hour', 'month', 'item']
const LINE_KINDS = ['lessons', 'bonus', 'adjustment', 'reimbursement', 'deduction']
const CURRENCIES = ['PLN', 'EUR', 'GBP', 'USD']

function pruned(payload) {
  const out = {}
  for (const [k, v] of Object.entries(payload)) {
    if (v === '' || v === undefined || v === null) continue
    out[k] = v
  }
  return out
}

// Which rate card applies to this member, for this work, over this period.
// Member-specific beats the default; among equals the latest effective_from
// wins, which is what "effective dated" means. Returns null when there is none —
// the caller must show that, not substitute a guess.
export function pickRateCard(cards, { memberId, lessonType, currency, periodStart, periodEnd }) {
  const eligible = (cards || []).filter(c =>
    c.active
    && !c.deleted_at
    && c.currency === currency
    && (c.team_member_id === memberId || c.team_member_id === null || c.team_member_id === undefined)
    && (!lessonType || c.lesson_type === lessonType)
    // the rate must be in force at some point inside the period
    && c.effective_from <= periodEnd
    && (!c.effective_to || c.effective_to >= periodStart))
  if (!eligible.length) return null
  return eligible.sort((a, b) => {
    const specific = Number(b.team_member_id === memberId) - Number(a.team_member_id === memberId)
    if (specific) return specific
    return String(b.effective_from).localeCompare(String(a.effective_from))
  })[0]
}

export default function ConsolePayroll() {
  const [tab, setTab] = useState('runs')
  return (
    <>
      <div className="sa-page-header">
        <div>
          <h1>Payroll</h1>
          <p>
            Pay computed from effective-dated rate cards, not from a constant in the source. Every
            line records the rate card it came from.
          </p>
        </div>
      </div>

      <div className="sa-tabs" style={{ marginBottom: 12 }}>
        <button type="button" className={`sa-tab${tab === 'runs' ? ' is-active' : ''}`}
          aria-current={tab === 'runs' ? 'page' : undefined} onClick={() => setTab('runs')}>
          <span className="material-symbols-outlined" aria-hidden="true">account_balance_wallet</span>
          Runs
        </button>
        <button type="button" className={`sa-tab${tab === 'rates' ? ' is-active' : ''}`}
          aria-current={tab === 'rates' ? 'page' : undefined} onClick={() => setTab('rates')}>
          <span className="material-symbols-outlined" aria-hidden="true">price_change</span>
          Rate cards
        </button>
      </div>

      {tab === 'runs' ? <RunsTab onGoToRates={() => setTab('rates')} /> : <RateCardsTab />}
    </>
  )
}

// ── shared reference data ────────────────────────────────────────────────────
// team_members, rate_cards and rate_card_roles are small, bounded lists; both
// tabs need them, so they load once per mount of the tab that uses them.
function useReference() {
  const [ref, setRef] = useState(null)
  const [error, setError] = useState(null)
  const [key, setKey] = useState(0)

  useEffect(() => {
    let alive = true
    setRef(null)
    setError(null)
    Promise.all([
      bizList('team_members', { limit: 200, sort: 'full_name' }),
      bizList('rate_cards', { limit: 500, sort: '-effective_from' }),
      bizList('rate_card_roles', { limit: 100, sort: 'position' }),
    ])
      .then(([members, cards, roles]) => {
        if (!alive) return
        setRef({
          members: members.rows || [],
          cards: cards.rows || [],
          roles: roles.rows || [],
        })
      })
      .catch(e => { if (alive) setError(e) })
    return () => { alive = false }
  }, [key])

  return { ref, error, reload: useCallback(() => setKey(k => k + 1), []) }
}

// ── runs ─────────────────────────────────────────────────────────────────────

function RunsTab({ onGoToRates }) {
  const [rows, setRows] = useState(null)
  const [total, setTotal] = useState(0)
  const [cursor, setCursor] = useState(null)
  const [error, setError] = useState(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [status, setStatus] = useState('')
  const [sort, setSort] = useState('-period_start')
  const [reloadKey, setReloadKey] = useState(0)
  const [openRun, setOpenRun] = useState(null)
  const [creating, setCreating] = useState(false)

  const { ref, error: refError, reload: reloadRef } = useReference()
  const reload = useCallback(() => setReloadKey(k => k + 1), [])

  const params = useMemo(() => ({
    status: status || undefined, sort, limit: PAGE,
  }), [status, sort])

  useEffect(() => {
    let alive = true
    setRows(null)
    setError(null)
    setCursor(null)
    bizList('payroll_runs', params)
      .then(d => {
        if (!alive) return
        setRows(d.rows || [])
        setTotal(d.total || 0)
        setCursor(d.next_cursor || null)
      })
      .catch(e => { if (alive) setError(e) })
    return () => { alive = false }
  }, [params, reloadKey])

  async function loadMore() {
    if (!cursor) return
    setLoadingMore(true)
    try {
      const d = await bizList('payroll_runs', { ...params, cursor })
      setRows(prev => [...(prev || []), ...(d.rows || [])])
      setCursor(d.next_cursor || null)
    } catch (e) {
      setError(e)
    } finally {
      setLoadingMore(false)
    }
  }

  const listError = error || refError
  if (listError?.notLive) return <ConsoleNotLive endpoint="/api/console/biz/payroll_runs" />
  if (listError) return <ConsoleErrorPanel error={listError} onRetry={() => { reload(); reloadRef() }} />

  const rateCardCount = ref?.cards?.length ?? 0
  const openTotals = (rows || []).filter(r => !['cancelled'].includes(r.status))

  return (
    <>
      {rows && rows.length > 0 && (
        <div style={{ ...KPI_GRID, marginBottom: 12 }}>
          <Kpi label="Runs" value={total} hint={`${rows.length} loaded`} />
          <Kpi
            label="Awaiting approval"
            value={openTotals.filter(r => ['draft', 'review'].includes(r.status)).length}
            hint="draft or in review"
          />
          <Kpi
            label="Rate cards configured"
            value={rateCardCount}
            hint={rateCardCount ? 'effective-dated' : 'none — pay cannot be computed'}
          />
        </div>
      )}

      <div className="sa-toolbar">
        <label className="sa-sr-only" htmlFor="run-status">Status</label>
        <select id="run-status" className="sa-select" value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {RUN_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <span className="sa-toolbar-spacer" />
        <span className="sa-toolbar-count">{rows ? `${rows.length} of ${total}` : 'loading…'}</span>
        <button type="button" className="sa-btn sa-btn-ghost" onClick={() => { reload(); reloadRef() }}>
          <span className="material-symbols-outlined" aria-hidden="true">refresh</span>
          Refresh
        </button>
        <button type="button" className="sa-btn sa-btn-primary" onClick={() => setCreating(true)}>
          <span className="material-symbols-outlined" aria-hidden="true">add</span>
          New run
        </button>
      </div>

      <div className="sa-card">
        {rows === null ? (
          <ConsoleSkeleton rows={6} label="Loading payroll runs…" />
        ) : rows.length === 0 ? (
          <ConsoleEmpty
            icon="account_balance_wallet"
            title={status ? 'No runs with that status' : 'No payroll runs yet'}
            hint={status ? (
              <p>Clear the status filter to see every run.</p>
            ) : (
              <>
                <p>
                  A payroll run picks a period and produces one line per team member, each priced
                  from the rate card that was in force during that period.
                </p>
                <p style={{ marginTop: '0.5rem' }}>
                  {rateCardCount
                    ? 'Rate cards are configured, so a run can be created now.'
                    : 'No rate cards exist yet, so there is no rate to apply. Configure the rates you actually pay first — this screen will never assume one.'}
                </p>
              </>
            )}
            action={
              rateCardCount ? (
                <button type="button" className="sa-btn sa-btn-primary" onClick={() => setCreating(true)}>
                  <span className="material-symbols-outlined" aria-hidden="true">add</span>
                  Create the first run
                </button>
              ) : (
                <button type="button" className="sa-btn sa-btn-primary" onClick={onGoToRates}>
                  <span className="material-symbols-outlined" aria-hidden="true">price_change</span>
                  Configure rate cards
                </button>
              )
            }
          />
        ) : (
          <>
            <div className="sa-table-wrap">
              <table className="sa-table">
                <caption className="sa-sr-only">Payroll runs</caption>
                <thead>
                  <tr>
                    <SortTh col="period_start" label="Period start" sort={sort} onSort={setSort} />
                    <SortTh col="period_end" label="Period end" sort={sort} onSort={setSort} />
                    <SortTh col="line_count" label="Lines" sort={sort} onSort={setSort} align="right" />
                    <SortTh col="total_gross_minor" label="Total gross" sort={sort} onSort={setSort} align="right" />
                    <th scope="col">Cur.</th>
                    <SortTh col="status" label="Status" sort={sort} onSort={setSort} />
                    <th scope="col">Note</th>
                    <th scope="col"><span className="sa-sr-only">Open</span></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(run => (
                    <tr key={run.id} className="is-clickable" onClick={() => setOpenRun(run)}>
                      <td className="sa-num" style={{ fontWeight: 600 }}>{run.period_start}</td>
                      <td className="sa-num">{run.period_end}</td>
                      <td className="sa-num">{run.line_count}</td>
                      <td className="sa-num" style={{ fontWeight: 600 }}>
                        {formatMinorBare(run.total_gross_minor, run.currency)}
                      </td>
                      <td className="sa-num">{run.currency}</td>
                      <td><StatusBadge status={run.status} /></td>
                      <td style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {run.note || '—'}
                      </td>
                      <td className="sa-td-right">
                        <button type="button" className="sa-icon-btn sa-icon-btn-sm"
                          aria-label={`Open run ${run.period_start} to ${run.period_end}`}
                          onClick={e => { e.stopPropagation(); setOpenRun(run) }}>
                          <span className="material-symbols-outlined" aria-hidden="true">chevron_right</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ListFooter shown={rows.length} total={total} hasMore={Boolean(cursor)}
              loading={loadingMore} onMore={loadMore} />
          </>
        )}
      </div>

      {openRun && ref && (
        <RunDrawer
          run={openRun}
          reference={ref}
          onClose={() => setOpenRun(null)}
          onChanged={reload}
          onGoToRates={() => { setOpenRun(null); onGoToRates() }}
        />
      )}

      {creating && (
        <NewRunModal onClose={() => setCreating(false)} onCreated={run => {
          setCreating(false)
          reload()
          setOpenRun(run)
        }} />
      )}
    </>
  )
}

function RunDrawer({ run, reference, onClose, onChanged, onGoToRates }) {
  const [lines, setLines] = useState(null)
  const [error, setError] = useState(null)
  const [actionError, setActionError] = useState(null)
  const [busy, setBusy] = useState('')
  const [version, setVersion] = useState(0)
  const [current, setCurrent] = useState(run)

  // add-line form
  const [memberId, setMemberId] = useState('')
  const [lessonType, setLessonType] = useState('individual')
  const [kind, setKind] = useState('lessons')
  const [units, setUnits] = useState('')
  const [note, setNote] = useState('')

  useEffect(() => {
    let alive = true
    setLines(null)
    setError(null)
    bizList('payroll_lines', { payroll_run_id: run.id, sort: 'id', limit: 500 })
      .then(d => { if (alive) setLines(d.rows || []) })
      .catch(e => { if (alive) setError(e) })
    return () => { alive = false }
  }, [run.id, version])

  const memberById = useMemo(
    () => Object.fromEntries((reference.members || []).map(m => [m.id, m])),
    [reference.members])
  const cardById = useMemo(
    () => Object.fromEntries((reference.cards || []).map(c => [c.id, c])),
    [reference.cards])

  const selectedMember = memberId ? memberById[Number(memberId)] : null
  const card = selectedMember ? pickRateCard(reference.cards, {
    memberId: selectedMember.id,
    lessonType: kind === 'lessons' ? lessonType : null,
    currency: current.currency,
    periodStart: current.period_start,
    periodEnd: current.period_end,
  }) : null

  const unitsMilli = parseMilli(units)
  const grossPreview = card && unitsMilli !== null
    ? divRound(unitsMilli * card.rate_minor, 1000)
    : null

  const totals = useMemo(() => (lines || []).reduce((acc, l) => ({
    gross: acc.gross + (l.gross_minor || 0),
    count: acc.count + 1,
  }), { gross: 0, count: 0 }), [lines])

  // The run header carries denormalised totals; keep them true after every write
  // rather than letting the list view drift from the lines.
  async function syncRunTotals(nextLines) {
    const gross = nextLines.reduce((n, l) => n + (l.gross_minor || 0), 0)
    const updated = await bizUpdate('payroll_runs', current.id, {
      total_gross_minor: gross, line_count: nextLines.length,
    })
    if (updated) setCurrent(updated)
    onChanged()
  }

  async function addLine(event) {
    event.preventDefault()
    if (!selectedMember || !card || unitsMilli === null || unitsMilli <= 0) return
    setBusy('add')
    setActionError(null)
    try {
      await bizCreate('payroll_lines', pruned({
        payroll_run_id: current.id,
        team_member_id: selectedMember.id,
        rate_card_id: card.id,
        lesson_type: kind === 'lessons' ? lessonType : '',
        unit: card.unit,
        units_milli: unitsMilli,
        rate_minor: card.rate_minor,
        gross_minor: divRound(unitsMilli * card.rate_minor, 1000),
        currency: current.currency,
        kind,
        note,
      }))
      const d = await bizList('payroll_lines', { payroll_run_id: current.id, sort: 'id', limit: 500 })
      setLines(d.rows || [])
      await syncRunTotals(d.rows || [])
      setUnits('')
      setNote('')
    } catch (e) {
      setActionError(e)
    } finally {
      setBusy('')
    }
  }

  async function removeLine(lineId) {
    setBusy(`del-${lineId}`)
    setActionError(null)
    try {
      await bizDelete('payroll_lines', lineId)
      const d = await bizList('payroll_lines', { payroll_run_id: current.id, sort: 'id', limit: 500 })
      setLines(d.rows || [])
      await syncRunTotals(d.rows || [])
    } catch (e) {
      setActionError(e)
    } finally {
      setBusy('')
    }
  }

  async function setStatus(status) {
    setBusy(status)
    setActionError(null)
    try {
      const extra = status === 'approved'
        ? { approved_at: Math.floor(Date.now() / 1000) }
        : status === 'paid' ? { paid_at: Math.floor(Date.now() / 1000) } : {}
      const updated = await bizUpdate('payroll_runs', current.id, { status, ...extra })
      if (updated) setCurrent(updated)
      onChanged()
    } catch (e) {
      setActionError(e)
    } finally {
      setBusy('')
    }
  }

  const editable = ['draft', 'review'].includes(current.status)
  const membersAvailable = (reference.members || []).filter(m => !m.deleted_at)

  return (
    <Drawer
      title={`Payroll ${current.period_start} → ${current.period_end}`}
      subtitle={`${current.currency} · ${current.status} · ${totals.count} line(s)`}
      onClose={onClose}
      footer={<button type="button" className="sa-btn sa-btn-ghost" onClick={onClose}>Close</button>}
    >
      <div style={{ display: 'grid', gap: 14 }}>
        {actionError && <Notice tone="bad" icon="error">{actionError.message}</Notice>}

        <section>
          <div style={{ ...KPI_GRID }}>
            <Kpi label="Lines" value={totals.count} hint="one per member and kind" />
            <Kpi label="Total gross" value={formatMinorBare(totals.gross, current.currency)}
              hint={current.currency} />
            <Kpi label="Status" value={<StatusBadge status={current.status} />} hint="" />
          </div>
        </section>

        <section>
          <p className="sa-stat-label">Lines</p>
          {error?.notLive ? (
            <ConsoleNotLive endpoint="/api/console/biz/payroll_lines" />
          ) : error ? (
            <ConsoleErrorPanel error={error} onRetry={() => setVersion(v => v + 1)} />
          ) : lines === null ? (
            <ConsoleSkeleton rows={3} label="Loading lines…" />
          ) : lines.length === 0 ? (
            <Notice tone="info" icon="info">
              This run has no lines yet. Add one per team member below; the rate is taken from the
              rate card in force for this period, never assumed.
            </Notice>
          ) : (
            <div className="sa-table-wrap">
              <table className="sa-table">
                <caption className="sa-sr-only">Payroll lines</caption>
                <thead>
                  <tr>
                    <th scope="col">Team member</th>
                    <th scope="col">Kind</th>
                    <th scope="col" className="sa-td-right">Units</th>
                    <th scope="col" className="sa-td-right">Rate</th>
                    <th scope="col">Rate card</th>
                    <th scope="col" className="sa-td-right">Gross</th>
                    {editable && <th scope="col"><span className="sa-sr-only">Remove</span></th>}
                  </tr>
                </thead>
                <tbody>
                  {lines.map(l => {
                    const source = cardById[l.rate_card_id]
                    return (
                      <tr key={l.id}>
                        <td style={{ fontWeight: 600 }}>
                          {memberById[l.team_member_id]?.full_name || `#${l.team_member_id}`}
                        </td>
                        <td>
                          {l.kind}
                          {l.lesson_type && (
                            <span className="sa-badge" style={{ marginLeft: 6 }}>{l.lesson_type}</span>
                          )}
                        </td>
                        <td className="sa-num">{formatMilli(l.units_milli)} {l.unit}</td>
                        <td className="sa-num">{formatMinorBare(l.rate_minor, l.currency)}</td>
                        <td style={{ fontSize: 'var(--sa-fs-small)', color: 'var(--sa-text-muted)' }}>
                          {source
                            ? <>#{source.id} · from {source.effective_from}{source.effective_to ? ` to ${source.effective_to}` : ''}</>
                            : l.rate_card_id
                              ? `#${l.rate_card_id}`
                              : 'manual — no rate card'}
                        </td>
                        <td className="sa-num" style={{ fontWeight: 600 }}>
                          {formatMinorBare(l.gross_minor, l.currency)}
                        </td>
                        {editable && (
                          <td className="sa-td-right">
                            <button type="button" className="sa-icon-btn sa-icon-btn-sm"
                              aria-label={`Remove line for ${memberById[l.team_member_id]?.full_name || l.team_member_id}`}
                              disabled={busy === `del-${l.id}`}
                              onClick={() => removeLine(l.id)}>
                              <span className="material-symbols-outlined" aria-hidden="true">delete</span>
                            </button>
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {editable && (
          <section>
            <p className="sa-stat-label">Add a line</p>
            {!membersAvailable.length ? (
              <Notice tone="warn" icon="group_off">
                No team members exist yet, so there is nobody to pay. Add them on People → Team
                first.
              </Notice>
            ) : (
              <form onSubmit={addLine} style={{ marginTop: 4 }}>
                <Field label="Team member" required>
                  <select className="sa-select" value={memberId} onChange={e => setMemberId(e.target.value)}>
                    <option value="">Select a member…</option>
                    {membersAvailable.map(m => (
                      <option key={m.id} value={m.id}>{m.full_name} — {m.role}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Kind">
                  <select className="sa-select" value={kind} onChange={e => setKind(e.target.value)}>
                    {LINE_KINDS.map(k => <option key={k} value={k}>{k}</option>)}
                  </select>
                </Field>
                {kind === 'lessons' && (
                  <Field label="Lesson type">
                    <select className="sa-select" value={lessonType} onChange={e => setLessonType(e.target.value)}>
                      {LESSON_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </Field>
                )}

                {selectedMember && !card && (
                  <div style={{ margin: '8px 0' }}>
                    <Notice tone="bad" icon="price_change">
                      No rate card covers {selectedMember.full_name}
                      {kind === 'lessons' ? ` for ${lessonType} lessons` : ''} in {current.currency}
                      {' '}between {current.period_start} and {current.period_end}. The old Salary
                      screen would have assumed 60, 70 or 90 PLN here; this one will not. Configure
                      the real rate first.
                      {' '}
                      <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm"
                        style={{ marginTop: 6 }} onClick={onGoToRates}>
                        Open rate cards
                      </button>
                    </Notice>
                  </div>
                )}
                {card && (
                  <div style={{ margin: '8px 0' }}>
                    <Notice tone="good" icon="check">
                      Rate applied: <strong className="sa-num">{formatMinor(card.rate_minor, card.currency)}</strong>
                      {' '}per {card.unit} — rate card #{card.id}, role {card.role}, effective from
                      {' '}{card.effective_from}{card.effective_to ? ` to ${card.effective_to}` : ' (open ended)'}
                      {card.team_member_id ? ', member-specific' : ', default rate'}.
                    </Notice>
                  </div>
                )}

                <Field label={`Units (${card?.unit || 'lesson'})`} required
                  hint="Thousandths are allowed: 12.5 hours is entered as 12.5.">
                  <input className="sa-input sa-num" value={units} inputMode="decimal"
                    aria-invalid={units !== '' && (unitsMilli === null || unitsMilli <= 0)}
                    onChange={e => setUnits(e.target.value)} placeholder="0" style={{ width: 140 }} />
                </Field>
                <Field label="Note">
                  <input className="sa-input" value={note} onChange={e => setNote(e.target.value)}
                    placeholder="What this covers" />
                </Field>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
                  <button type="submit" className="sa-btn sa-btn-primary"
                    disabled={!card || unitsMilli === null || unitsMilli <= 0 || busy === 'add'}>
                    <span className="material-symbols-outlined" aria-hidden="true">add</span>
                    {busy === 'add' ? 'Adding…' : 'Add line'}
                  </button>
                  {grossPreview !== null && (
                    <span className="sa-toolbar-count">
                      = {formatMinor(grossPreview, current.currency)}
                    </span>
                  )}
                </div>
              </form>
            )}
          </section>
        )}

        <section>
          <p className="sa-stat-label">Run status</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
            {current.status === 'draft' && (
              <button type="button" className="sa-btn sa-btn-ghost" disabled={Boolean(busy)}
                onClick={() => setStatus('review')}>Send to review</button>
            )}
            {current.status === 'review' && (
              <button type="button" className="sa-btn sa-btn-ghost" disabled={Boolean(busy)}
                onClick={() => setStatus('approved')}>Approve</button>
            )}
            {current.status === 'approved' && (
              <button type="button" className="sa-btn sa-btn-primary" disabled={Boolean(busy)}
                onClick={() => setStatus('paid')}>Mark paid</button>
            )}
            {!['paid', 'cancelled'].includes(current.status) && (
              <button type="button" className="sa-btn sa-btn-danger" disabled={Boolean(busy)}
                onClick={() => setStatus('cancelled')}>Cancel run</button>
            )}
          </div>
        </section>
      </div>
    </Drawer>
  )
}

function NewRunModal({ onClose, onCreated }) {
  const today = todayIso()
  const [periodStart, setPeriodStart] = useState(`${today.slice(0, 7)}-01`)
  const [periodEnd, setPeriodEnd] = useState(today)
  const [currency, setCurrency] = useState('PLN')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const valid = periodStart && periodEnd && periodEnd >= periodStart

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const run = await bizCreate('payroll_runs', pruned({
        period_start: periodStart, period_end: periodEnd, currency, status: 'draft', note,
      }))
      onCreated(run)
    } catch (e) {
      setError(e)
      setSaving(false)
    }
  }

  return (
    <Modal
      title="New payroll run"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="sa-btn sa-btn-ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="sa-btn sa-btn-primary" onClick={save} disabled={!valid || saving}>
            {saving ? 'Creating…' : 'Create run'}
          </button>
        </>
      }
    >
      <div style={{ display: 'grid', gap: 10 }}>
        {error && <Notice tone="bad" icon="error">{error.message}</Notice>}
        <Notice tone="info" icon="info">
          The run is created empty. Lines are added per team member, each priced from the rate card
          in force during the period — one period, one currency, no assumed rates.
        </Notice>
        <Field label="Period start" required>
          <input type="date" className="sa-input" value={periodStart}
            onChange={e => setPeriodStart(e.target.value)} />
        </Field>
        <Field label="Period end" required>
          <input type="date" className="sa-input" value={periodEnd}
            onChange={e => setPeriodEnd(e.target.value)} aria-invalid={Boolean(periodEnd) && periodEnd < periodStart} />
        </Field>
        <Field label="Currency">
          <select className="sa-select" value={currency} onChange={e => setCurrency(e.target.value)}>
            {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Note">
          <input className="sa-input" value={note} onChange={e => setNote(e.target.value)}
            placeholder="e.g. July 2026 teaching" />
        </Field>
        {!valid && <Notice tone="warn" icon="edit">The period must not run backwards.</Notice>}
      </div>
    </Modal>
  )
}

// ── rate cards ───────────────────────────────────────────────────────────────

function RateCardsTab() {
  const { ref, error, reload } = useReference()
  const [sort, setSort] = useState('-effective_from')
  const [creating, setCreating] = useState(false)
  const [showInactive, setShowInactive] = useState(false)
  const [actionError, setActionError] = useState(null)

  if (error?.notLive) return <ConsoleNotLive endpoint="/api/console/biz/rate_cards" />
  if (error) return <ConsoleErrorPanel error={error} onRetry={reload} />
  if (!ref) return <ConsoleSkeleton rows={6} label="Loading rate cards…" />

  const roleName = Object.fromEntries((ref.roles || []).map(r => [r.key, r.name]))
  const memberName = Object.fromEntries((ref.members || []).map(m => [m.id, m.full_name]))
  const today = todayIso()

  const rows = (ref.cards || [])
    .filter(c => showInactive || c.active)
    .sort((a, b) => {
      const desc = sort.startsWith('-')
      const col = desc ? sort.slice(1) : sort
      const x = a[col]
      const y = b[col]
      const cmp = typeof x === 'number' && typeof y === 'number'
        ? x - y
        : String(x ?? '').localeCompare(String(y ?? ''))
      return desc ? -cmp : cmp
    })

  return (
    <>
      <div className="sa-toolbar">
        <label className="sa-checkbox">
          <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
          Show superseded and inactive
        </label>
        <span className="sa-toolbar-spacer" />
        <span className="sa-toolbar-count">{rows.length} rate card(s)</span>
        <button type="button" className="sa-btn sa-btn-ghost" onClick={reload}>
          <span className="material-symbols-outlined" aria-hidden="true">refresh</span>
          Refresh
        </button>
        <button type="button" className="sa-btn sa-btn-primary" onClick={() => setCreating(true)}
          disabled={!ref.roles?.length}>
          <span className="material-symbols-outlined" aria-hidden="true">add</span>
          New rate card
        </button>
      </div>

      {actionError && (
        <div style={{ marginTop: 10 }}><Notice tone="bad" icon="error">{actionError.message}</Notice></div>
      )}

      <div className="sa-card">
        {rows.length === 0 ? (
          <ConsoleEmpty
            icon="price_change"
            title="No rate cards configured"
            hint={
              <>
                <p>
                  A rate card is the money: a role, a lesson type, a currency and the date the rate
                  takes effect. Payroll reads it; nothing here is hardcoded.
                </p>
                <p style={{ marginTop: '0.5rem' }}>
                  The screen this replaces assumed 60, 70 and 90 PLN in its source. Enter the rates
                  actually paid, with their effective dates, and old runs will keep showing the rate
                  that applied at the time.
                </p>
              </>
            }
            action={
              <button type="button" className="sa-btn sa-btn-primary" onClick={() => setCreating(true)}
                disabled={!ref.roles?.length}>
                <span className="material-symbols-outlined" aria-hidden="true">add</span>
                Add the first rate
              </button>
            }
          />
        ) : (
          <div className="sa-table-wrap">
            <table className="sa-table">
              <caption className="sa-sr-only">Rate cards</caption>
              <thead>
                <tr>
                  <SortTh col="role" label="Role" sort={sort} onSort={setSort} />
                  <SortTh col="lesson_type" label="Lesson type" sort={sort} onSort={setSort} />
                  <th scope="col">Applies to</th>
                  <SortTh col="rate_minor" label="Rate" sort={sort} onSort={setSort} align="right" />
                  <th scope="col">Unit</th>
                  <SortTh col="effective_from" label="From" sort={sort} onSort={setSort} />
                  <SortTh col="effective_to" label="To" sort={sort} onSort={setSort} />
                  <th scope="col">State</th>
                  <th scope="col"><span className="sa-sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(c => {
                  const inForce = c.active && isoWithin(today, c.effective_from, c.effective_to)
                  return (
                    <tr key={c.id}>
                      <td style={{ fontWeight: 600 }}>{roleName[c.role] || c.role}</td>
                      <td>{c.lesson_type}</td>
                      <td>{c.team_member_id ? (memberName[c.team_member_id] || `#${c.team_member_id}`) : 'Everyone (default)'}</td>
                      <td className="sa-num" style={{ fontWeight: 600 }}>
                        {formatMinorBare(c.rate_minor, c.currency)} {c.currency}
                      </td>
                      <td>{c.unit}</td>
                      <td className="sa-num">{c.effective_from}</td>
                      <td className="sa-num">{c.effective_to || '—'}</td>
                      <td>
                        <span className={`sa-badge ${inForce ? 'sa-badge-committed' : 'sa-badge-queued'}`}>
                          {inForce ? 'in force' : c.active ? 'scheduled or past' : 'inactive'}
                        </span>
                      </td>
                      <td className="sa-td-right">
                        <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm"
                          onClick={async () => {
                            setActionError(null)
                            try {
                              await bizUpdate('rate_cards', c.id, { active: c.active ? 0 : 1 })
                              reload()
                            } catch (e) { setActionError(e) }
                          }}>
                          {c.active ? 'Deactivate' : 'Reactivate'}
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

      <p style={{ marginTop: 8, fontSize: 'var(--sa-fs-micro)', color: 'var(--sa-text-muted)' }}>
        Rates are effective-dated on purpose: to change one, add a new card with a later start date
        rather than editing the old one, so an approved run can still be audited against the rate
        that was in force.
      </p>

      {creating && (
        <NewRateCardModal
          roles={ref.roles || []}
          members={ref.members || []}
          onClose={() => setCreating(false)}
          onCreated={() => { setCreating(false); reload() }}
        />
      )}
    </>
  )
}

function NewRateCardModal({ roles, members, onClose, onCreated }) {
  const [role, setRole] = useState(roles[0]?.key || '')
  const [lessonType, setLessonType] = useState('individual')
  const [memberId, setMemberId] = useState('')
  const [rate, setRate] = useState('')
  const [currency, setCurrency] = useState('PLN')
  const [unit, setUnit] = useState(roles[0]?.default_unit || 'lesson')
  const [effectiveFrom, setEffectiveFrom] = useState(todayIso())
  const [effectiveTo, setEffectiveTo] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const rateMinor = parseMinor(rate)
  const valid = role && rateMinor !== null && rateMinor >= 0 && effectiveFrom
    && (!effectiveTo || effectiveTo >= effectiveFrom)

  async function save() {
    setSaving(true)
    setError(null)
    try {
      await bizCreate('rate_cards', pruned({
        role,
        lesson_type: lessonType,
        team_member_id: memberId ? Number(memberId) : '',
        rate_minor: rateMinor,
        currency,
        unit,
        effective_from: effectiveFrom,
        effective_to: effectiveTo,
        active: 1,
        note,
      }))
      onCreated()
    } catch (e) {
      setError(e)
      setSaving(false)
    }
  }

  return (
    <Modal
      title="New rate card"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="sa-btn sa-btn-ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="sa-btn sa-btn-primary" onClick={save} disabled={!valid || saving}>
            {saving ? 'Saving…' : 'Save rate card'}
          </button>
        </>
      }
    >
      <div style={{ display: 'grid', gap: 10 }}>
        {error && <Notice tone="bad" icon="error">{error.message}</Notice>}
        <Field label="Role" required>
          <select className="sa-select" value={role} onChange={e => {
            setRole(e.target.value)
            const r = roles.find(x => x.key === e.target.value)
            if (r?.default_unit) setUnit(r.default_unit)
          }}>
            {roles.map(r => <option key={r.key} value={r.key}>{r.name}</option>)}
          </select>
        </Field>
        <Field label="Lesson type">
          <select className="sa-select" value={lessonType} onChange={e => setLessonType(e.target.value)}>
            {LESSON_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Applies to" hint="Leave on “everyone” for the default rate; pick a person to override it.">
          <select className="sa-select" value={memberId} onChange={e => setMemberId(e.target.value)}>
            <option value="">Everyone (default rate)</option>
            {members.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
          </select>
        </Field>
        <Field label="Rate" required hint="Per unit, e.g. 90,00 for ninety złoty a lesson. Stored as integer grosze.">
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="sa-input sa-num" value={rate} inputMode="decimal" placeholder="0,00"
              aria-invalid={rate !== '' && rateMinor === null}
              onChange={e => setRate(e.target.value)} style={{ width: 140 }} />
            <select className="sa-select" value={currency} onChange={e => setCurrency(e.target.value)}
              style={{ width: 100 }} aria-label="Currency">
              {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select className="sa-select" value={unit} onChange={e => setUnit(e.target.value)}
              style={{ width: 120 }} aria-label="Unit">
              {UNITS.map(u => <option key={u} value={u}>per {u}</option>)}
            </select>
          </div>
        </Field>
        <Field label="Effective from" required>
          <input type="date" className="sa-input" value={effectiveFrom}
            onChange={e => setEffectiveFrom(e.target.value)} />
        </Field>
        <Field label="Effective to" hint="Leave blank for open ended; a later card supersedes this one.">
          <input type="date" className="sa-input" value={effectiveTo}
            onChange={e => setEffectiveTo(e.target.value)}
            aria-invalid={Boolean(effectiveTo) && effectiveTo < effectiveFrom} />
        </Field>
        <Field label="Note">
          <input className="sa-input" value={note} onChange={e => setNote(e.target.value)}
            placeholder="Why this rate, agreed with whom" />
        </Field>
        {rateMinor !== null && (
          <Notice tone="info" icon="calculate">
            Stored as <strong className="sa-num">{rateMinor}</strong> minor units
            = {formatMinor(rateMinor, currency)} per {unit}.
          </Notice>
        )}
      </div>
    </Modal>
  )
}
