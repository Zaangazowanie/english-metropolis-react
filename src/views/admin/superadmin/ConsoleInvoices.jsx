// ConsoleInvoices — Finance → Invoices.
//
// CRUD over `invoices` + `invoice_lines` in em-business.db, through the generic
// /api/console/biz surface. Polish invoicing is first class here:
//
//   • the number is ALLOCATED BY THE SERVER. GET …/invoices/next-number is a
//     read-only preview; create_invoice() bumps the counter and inserts the row
//     in one transaction so the sequence stays gapless. This UI never composes
//     a number, and refuses to save if the allocator is unreachable.
//   • net + VAT + gross must reconcile. The schema enforces
//     gross = net + vat on both the header and every line; the form computes all
//     three in integer minor units and shows the reconciliation before you save.
//   • NIP, the VAT scheme (standard / reverse charge / OSS / exempt / zero) and
//     per-line GTU codes are shown wherever they are set.
//
// The table ships EMPTY, which is the correct state until the first invoice is
// issued. Nothing is mocked.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ConsoleEmpty, ConsoleErrorPanel, ConsoleNotLive, ConsoleSkeleton } from './ConsoleStates.jsx'
import {
  Drawer, Field, Kpi, KPI_GRID, ListFooter, Modal, Notice, SortTh, StatusBadge,
} from './FinanceShared.jsx'
import {
  addDaysIso, bizCreate, bizDelete, bizGet, bizList, bizRestore, bizUpdate,
  formatEpoch, formatMilli, formatMinor, formatMinorBare, lineTotals,
  parseMilli, parseMinor, peekInvoiceNumber, todayIso,
} from './financeApi.js'

const PAGE = 50

const STATUSES = ['draft', 'issued', 'sent', 'partially_paid', 'paid', 'overdue', 'cancelled']
const KINDS = ['invoice', 'proforma', 'correction', 'receipt']
const VAT_SCHEMES = [
  ['standard', 'Standard VAT'],
  ['reverse_charge', 'Reverse charge (odwrotne obciążenie)'],
  ['oss', 'OSS'],
  ['exempt', 'Exempt (zwolniona)'],
  ['zero', 'Zero-rated'],
]
const PAYMENT_METHODS = ['transfer', 'card', 'cash', 'p24', 'stripe', 'other']
const UNITS = ['lesson', 'hour', 'month', 'item', 'package', 'service']
const VAT_RATES = [[2300, '23%'], [800, '8%'], [500, '5%'], [0, '0%']]
const CURRENCIES = ['PLN', 'EUR', 'GBP', 'USD']

const SCHEME_LABEL = Object.fromEntries(VAT_SCHEMES)

// Empty strings must not reach SQLite: a '' would fail CHECK (…IN (…)) or store
// a blank where the column means "not set".
function pruned(payload) {
  const out = {}
  for (const [k, v] of Object.entries(payload)) {
    if (v === '' || v === undefined || v === null) continue
    out[k] = v
  }
  return out
}

const isOverdue = inv =>
  inv.due_date && inv.due_date < todayIso()
  && !['paid', 'cancelled'].includes(inv.status)

export default function ConsoleInvoices() {
  const [rows, setRows] = useState(null)
  const [total, setTotal] = useState(0)
  const [cursor, setCursor] = useState(null)
  const [error, setError] = useState(null)
  const [loadingMore, setLoadingMore] = useState(false)

  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [status, setStatus] = useState('')
  const [kind, setKind] = useState('')
  const [currency, setCurrency] = useState('')
  const [includeDeleted, setIncludeDeleted] = useState(false)
  const [sort, setSort] = useState('-issue_date')
  const [reloadKey, setReloadKey] = useState(0)

  const [openId, setOpenId] = useState(null)
  const [creating, setCreating] = useState(false)

  const reload = useCallback(() => setReloadKey(k => k + 1), [])

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 250)
    return () => clearTimeout(t)
  }, [q])

  const params = useMemo(() => ({
    q: debouncedQ || undefined,
    status: status || undefined,
    kind: kind || undefined,
    currency: currency || undefined,
    include_deleted: includeDeleted ? 1 : undefined,
    sort,
    limit: PAGE,
  }), [debouncedQ, status, kind, currency, includeDeleted, sort])

  useEffect(() => {
    let alive = true
    setRows(null)
    setError(null)
    setCursor(null)
    bizList('invoices', params)
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
      const d = await bizList('invoices', { ...params, cursor })
      setRows(prev => [...(prev || []), ...(d.rows || [])])
      setCursor(d.next_cursor || null)
      setTotal(d.total || 0)
    } catch (e) {
      setError(e)
    } finally {
      setLoadingMore(false)
    }
  }

  const totals = useMemo(() => {
    const acc = { gross: 0, paid: 0, outstanding: 0, overdue: 0, mixed: false, currency: null }
    for (const r of rows || []) {
      if (r.status === 'cancelled') continue
      if (acc.currency === null) acc.currency = r.currency
      else if (acc.currency !== r.currency) acc.mixed = true
      acc.gross += r.gross_minor || 0
      acc.paid += r.paid_minor || 0
      acc.outstanding += (r.gross_minor || 0) - (r.paid_minor || 0)
      if (isOverdue(r)) acc.overdue += (r.gross_minor || 0) - (r.paid_minor || 0)
    }
    return acc
  }, [rows])

  const filtered = Boolean(debouncedQ || status || kind || currency)

  return (
    <>
      <div className="sa-page-header">
        <div>
          <h1>Invoices</h1>
          <p>
            Issued documents and their settlement state. Numbers are allocated by the server on a
            gapless Polish sequence; amounts are stored as integer minor units.
          </p>
        </div>
        <div className="sa-page-header-actions">
          <button type="button" className="sa-btn sa-btn-ghost" onClick={reload}>
            <span className="material-symbols-outlined" aria-hidden="true">refresh</span>
            Refresh
          </button>
          <button type="button" className="sa-btn sa-btn-primary" onClick={() => setCreating(true)}>
            <span className="material-symbols-outlined" aria-hidden="true">add</span>
            New invoice
          </button>
        </div>
      </div>

      {error?.notLive ? (
        <ConsoleNotLive endpoint="/api/console/biz/invoices" />
      ) : error ? (
        <ConsoleErrorPanel error={error} onRetry={reload} />
      ) : (
        <>
          {rows && rows.length > 0 && (
            <div style={{ ...KPI_GRID, marginBottom: 12 }}>
              <Kpi label="Invoices in view" value={total} hint={`${rows.length} loaded`} />
              <Kpi
                label="Gross"
                value={totals.mixed ? 'mixed' : formatMinorBare(totals.gross, totals.currency)}
                hint={totals.mixed ? 'several currencies in view — filter to one' : totals.currency}
              />
              <Kpi
                label="Settled"
                value={totals.mixed ? 'mixed' : formatMinorBare(totals.paid, totals.currency)}
                hint={totals.mixed ? '' : `${formatMinorBare(totals.outstanding, totals.currency)} outstanding`}
              />
              <Kpi
                label="Past due"
                value={totals.mixed ? 'mixed' : formatMinorBare(totals.overdue, totals.currency)}
                hint="unpaid after the due date"
              />
            </div>
          )}

          <div className="sa-toolbar">
            <label className="sa-sr-only" htmlFor="inv-q">Search invoices</label>
            <input
              id="inv-q"
              type="search"
              className="sa-input"
              placeholder="Number, buyer, NIP…"
              value={q}
              onChange={e => setQ(e.target.value)}
              style={{ minWidth: 220 }}
            />
            <label className="sa-sr-only" htmlFor="inv-status">Status</label>
            <select id="inv-status" className="sa-select" value={status} onChange={e => setStatus(e.target.value)}>
              <option value="">All statuses</option>
              {STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
            </select>
            <label className="sa-sr-only" htmlFor="inv-kind">Kind</label>
            <select id="inv-kind" className="sa-select" value={kind} onChange={e => setKind(e.target.value)}>
              <option value="">All kinds</option>
              {KINDS.map(k => <option key={k} value={k}>{k}</option>)}
            </select>
            <label className="sa-sr-only" htmlFor="inv-currency">Currency</label>
            <select id="inv-currency" className="sa-select" value={currency} onChange={e => setCurrency(e.target.value)}
              style={{ minWidth: 120 }}>
              <option value="">Any currency</option>
              {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <label className="sa-checkbox">
              <input
                type="checkbox"
                checked={includeDeleted}
                onChange={e => setIncludeDeleted(e.target.checked)}
              />
              Show deleted
            </label>
            <span className="sa-toolbar-spacer" />
            <span className="sa-toolbar-count">{rows ? `${rows.length} of ${total}` : 'loading…'}</span>
          </div>

          <div className="sa-card">
            {rows === null ? (
              <ConsoleSkeleton rows={8} label="Loading invoices…" />
            ) : rows.length === 0 ? (
              <ConsoleEmpty
                icon="receipt_long"
                title={filtered ? 'No invoices match these filters' : 'No invoices issued yet'}
                hint={filtered ? (
                  <p>Clear the search and filters to see the whole book.</p>
                ) : (
                  <>
                    <p>
                      This is the sales ledger: every faktura, proforma, correction and receipt the
                      school issues, with net, VAT and gross reconciled and the buyer’s NIP frozen
                      at issue.
                    </p>
                    <p style={{ marginTop: '0.5rem' }}>
                      Start by issuing the first invoice. The number comes from the server’s gapless
                      counter — this screen never invents one, and nothing is pre-filled with
                      example data.
                    </p>
                  </>
                )}
                action={!filtered && (
                  <button type="button" className="sa-btn sa-btn-primary" onClick={() => setCreating(true)}>
                    <span className="material-symbols-outlined" aria-hidden="true">add</span>
                    Issue the first invoice
                  </button>
                )}
              />
            ) : (
              <>
                <div className="sa-table-wrap">
                  <table className="sa-table">
                    <caption className="sa-sr-only">Invoices</caption>
                    <thead>
                      <tr>
                        <SortTh col="number" label="Number" sort={sort} onSort={setSort} />
                        <SortTh col="issue_date" label="Issued" sort={sort} onSort={setSort} />
                        <SortTh col="due_date" label="Due" sort={sort} onSort={setSort} />
                        <SortTh col="buyer_name" label="Buyer" sort={sort} onSort={setSort} />
                        <th scope="col">NIP</th>
                        <SortTh col="net_minor" label="Net" sort={sort} onSort={setSort} align="right" />
                        <SortTh col="vat_minor" label="VAT" sort={sort} onSort={setSort} align="right" />
                        <SortTh col="gross_minor" label="Gross" sort={sort} onSort={setSort} align="right" />
                        <SortTh col="paid_minor" label="Paid" sort={sort} onSort={setSort} align="right" />
                        <th scope="col">Cur.</th>
                        <SortTh col="status" label="Status" sort={sort} onSort={setSort} />
                        <th scope="col"><span className="sa-sr-only">Open</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(inv => (
                        <tr
                          key={inv.id}
                          className="is-clickable"
                          onClick={() => setOpenId(inv.id)}
                          style={inv.deleted_at ? { opacity: 0.55 } : undefined}
                        >
                          <td className="sa-num" style={{ fontWeight: 600 }}>
                            {inv.number}
                            {inv.kind !== 'invoice' && (
                              <span className="sa-badge" style={{ marginLeft: 6 }}>{inv.kind}</span>
                            )}
                          </td>
                          <td className="sa-num">{inv.issue_date}</td>
                          <td className="sa-num" style={isOverdue(inv) ? { color: 'var(--sa-bad)', fontWeight: 600 } : undefined}>
                            {inv.due_date}
                          </td>
                          <td style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {inv.buyer_name}
                          </td>
                          <td className="sa-num">{inv.buyer_tax_id || '—'}</td>
                          <td className="sa-num">{formatMinorBare(inv.net_minor, inv.currency)}</td>
                          <td className="sa-num">{formatMinorBare(inv.vat_minor, inv.currency)}</td>
                          <td className="sa-num" style={{ fontWeight: 600 }}>
                            {formatMinorBare(inv.gross_minor, inv.currency)}
                          </td>
                          <td className="sa-num">{formatMinorBare(inv.paid_minor, inv.currency)}</td>
                          <td className="sa-num">{inv.currency}</td>
                          <td>
                            <StatusBadge status={inv.status} />
                            {isOverdue(inv) && inv.status !== 'overdue' && (
                              <span className="sa-badge sa-badge-failed" style={{ marginLeft: 4 }}>past due</span>
                            )}
                            {inv.deleted_at && (
                              <span className="sa-badge" style={{ marginLeft: 4 }}>deleted</span>
                            )}
                          </td>
                          <td className="sa-td-right">
                            <button
                              type="button"
                              className="sa-icon-btn sa-icon-btn-sm"
                              aria-label={`Open invoice ${inv.number}`}
                              onClick={e => { e.stopPropagation(); setOpenId(inv.id) }}
                            >
                              <span className="material-symbols-outlined" aria-hidden="true">chevron_right</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <ListFooter
                  shown={rows.length}
                  total={total}
                  hasMore={Boolean(cursor)}
                  loading={loadingMore}
                  onMore={loadMore}
                />
              </>
            )}
          </div>
        </>
      )}

      {openId !== null && (
        <InvoiceDrawer
          id={openId}
          onClose={() => setOpenId(null)}
          onChanged={reload}
        />
      )}

      {creating && (
        <NewInvoiceModal
          onClose={() => setCreating(false)}
          onCreated={id => { setCreating(false); reload(); setOpenId(id) }}
        />
      )}
    </>
  )
}

// ── detail ───────────────────────────────────────────────────────────────────

function InvoiceDrawer({ id, onClose, onChanged }) {
  const [invoice, setInvoice] = useState(null)
  const [lines, setLines] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState('')
  const [actionError, setActionError] = useState(null)
  const [payAmount, setPayAmount] = useState('')
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let alive = true
    setError(null)
    Promise.all([
      bizGet('invoices', id),
      bizList('invoice_lines', { invoice_id: id, sort: 'position', limit: 200 }),
    ])
      .then(([inv, lineData]) => {
        if (!alive) return
        setInvoice(inv)
        setLines(lineData.rows || [])
        setPayAmount('')
      })
      .catch(e => { if (alive) setError(e) })
    return () => { alive = false }
  }, [id, version])

  async function patch(body, label) {
    setBusy(label)
    setActionError(null)
    try {
      await bizUpdate('invoices', id, body)
      setVersion(v => v + 1)
      onChanged()
    } catch (e) {
      setActionError(e)
    } finally {
      setBusy('')
    }
  }

  const lineSums = useMemo(() => (lines || []).reduce((acc, l) => ({
    net: acc.net + (l.net_minor || 0),
    vat: acc.vat + (l.vat_minor || 0),
    gross: acc.gross + (l.gross_minor || 0),
  }), { net: 0, vat: 0, gross: 0 }), [lines])

  const title = invoice ? invoice.number : `Invoice #${id}`
  const cur = invoice?.currency || 'PLN'
  const headerBalances = invoice
    ? invoice.gross_minor === invoice.net_minor + invoice.vat_minor
    : true
  const linesMatch = invoice && lines
    ? lines.length === 0 || (lineSums.net === invoice.net_minor && lineSums.gross === invoice.gross_minor)
    : true

  return (
    <Drawer
      title={title}
      subtitle={invoice ? `${invoice.kind} · ${invoice.buyer_name}` : 'Loading…'}
      onClose={onClose}
      footer={
        <button type="button" className="sa-btn sa-btn-ghost" onClick={onClose}>Close</button>
      }
    >
      {error?.notLive ? (
        <ConsoleNotLive endpoint={`/api/console/biz/invoices/${id}`} />
      ) : error ? (
        <ConsoleErrorPanel error={error} onRetry={() => setVersion(v => v + 1)} />
      ) : !invoice ? (
        <ConsoleSkeleton rows={5} label="Loading invoice…" />
      ) : (
        <div style={{ display: 'grid', gap: 14 }}>
          {actionError && <Notice tone="bad" icon="error">{actionError.message}</Notice>}
          {invoice.deleted_at && (
            <Notice tone="warn" icon="delete">
              Soft-deleted {formatEpoch(invoice.deleted_at)}. The number stays consumed — a Polish
              sequence must never be re-used.
            </Notice>
          )}

          <section>
            <p className="sa-stat-label">Document</p>
            <DetailGrid
              items={[
                ['Number', <span className="sa-num" key="n">{invoice.number}</span>],
                ['Kind', invoice.kind],
                ['Status', <StatusBadge status={invoice.status} key="s" />],
                ['Issued', invoice.issue_date],
                ['Sale date', invoice.sale_date || '—'],
                ['Due', invoice.due_date],
                ['Payment', invoice.payment_method || '—'],
                ['Sent', formatEpoch(invoice.sent_at)],
                ['Paid at', formatEpoch(invoice.paid_at)],
              ]}
            />
          </section>

          <section>
            <p className="sa-stat-label">Buyer</p>
            <DetailGrid
              items={[
                ['Name', invoice.buyer_name],
                ['NIP', <span className="sa-num" key="nip">{invoice.buyer_tax_id || '—'}</span>],
                ['Address', invoice.buyer_address || '—'],
                ['Country', invoice.buyer_country],
                ['Seller NIP', <span className="sa-num" key="snip">{invoice.seller_tax_id || '—'}</span>],
              ]}
            />
          </section>

          <section>
            <p className="sa-stat-label">VAT</p>
            <DetailGrid
              items={[
                ['Scheme', SCHEME_LABEL[invoice.vat_scheme] || invoice.vat_scheme],
                ...(invoice.vat_exempt_reason ? [['Exemption', invoice.vat_exempt_reason]] : []),
                ...(invoice.currency !== invoice.base_currency ? [
                  ['FX', invoice.fx_rate_milli
                    ? `${formatMilli(invoice.fx_rate_milli)} ${invoice.base_currency}/${invoice.currency}`
                    : 'not set'],
                  ['FX date', invoice.fx_rate_date || '—'],
                ] : []),
              ]}
            />
            {invoice.vat_scheme !== 'standard' && invoice.vat_minor !== 0 && (
              <div style={{ marginTop: 8 }}>
                <Notice tone="warn" icon="warning">
                  Scheme is “{SCHEME_LABEL[invoice.vat_scheme] || invoice.vat_scheme}” but VAT is
                  not zero. Check the document before sending it.
                </Notice>
              </div>
            )}
          </section>

          <section>
            <p className="sa-stat-label">Lines</p>
            {lines === null ? (
              <ConsoleSkeleton rows={3} label="Loading lines…" />
            ) : lines.length === 0 ? (
              <Notice tone="warn" icon="info">
                This invoice has no lines. The header totals stand alone, which a Polish invoice
                should not do — add the items it bills for.
              </Notice>
            ) : (
              <div className="sa-table-wrap">
                <table className="sa-table">
                  <caption className="sa-sr-only">Invoice lines</caption>
                  <thead>
                    <tr>
                      <th scope="col">#</th>
                      <th scope="col">Description</th>
                      <th scope="col" className="sa-td-right">Qty</th>
                      <th scope="col" className="sa-td-right">Unit price</th>
                      <th scope="col" className="sa-td-right">VAT</th>
                      <th scope="col" className="sa-td-right">Net</th>
                      <th scope="col" className="sa-td-right">Gross</th>
                      <th scope="col">GTU</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map(l => (
                      <tr key={l.id}>
                        <td className="sa-num">{l.position}</td>
                        <td>{l.description}</td>
                        <td className="sa-num">{formatMilli(l.quantity_milli)} {l.unit}</td>
                        <td className="sa-num">{formatMinorBare(l.unit_price_minor, cur)}</td>
                        <td className="sa-num">{(l.vat_rate_bp / 100).toFixed(0)}%</td>
                        <td className="sa-num">{formatMinorBare(l.net_minor, cur)}</td>
                        <td className="sa-num">{formatMinorBare(l.gross_minor, cur)}</td>
                        <td className="sa-num">{l.gtu_code || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section>
            <p className="sa-stat-label">Reconciliation</p>
            <DetailGrid
              items={[
                ['Net', <span className="sa-num" key="n">{formatMinor(invoice.net_minor, cur)}</span>],
                ['VAT', <span className="sa-num" key="v">{formatMinor(invoice.vat_minor, cur)}</span>],
                ['Gross', <span className="sa-num" key="g" style={{ fontWeight: 700 }}>{formatMinor(invoice.gross_minor, cur)}</span>],
                ['Paid', <span className="sa-num" key="p">{formatMinor(invoice.paid_minor, cur)}</span>],
                ['Outstanding', <span className="sa-num" key="o">{formatMinor(invoice.gross_minor - invoice.paid_minor, cur)}</span>],
              ]}
            />
            <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
              <Notice tone={headerBalances ? 'good' : 'bad'} icon={headerBalances ? 'check' : 'error'}>
                {headerBalances
                  ? 'Header reconciles: gross = net + VAT.'
                  : 'Header does NOT reconcile: gross ≠ net + VAT.'}
              </Notice>
              {lines && lines.length > 0 && (
                <Notice tone={linesMatch ? 'good' : 'bad'} icon={linesMatch ? 'check' : 'error'}>
                  {linesMatch
                    ? 'Lines add up to the header totals.'
                    : `Lines total ${formatMinor(lineSums.gross, cur)} gross but the header says ${formatMinor(invoice.gross_minor, cur)}.`}
                </Notice>
              )}
            </div>
          </section>

          {!invoice.deleted_at && (
            <section>
              <p className="sa-stat-label">Actions</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
                {invoice.status === 'draft' && (
                  <button type="button" className="sa-btn sa-btn-ghost" disabled={Boolean(busy)}
                    onClick={() => patch({ status: 'issued' }, 'issue')}>
                    <span className="material-symbols-outlined" aria-hidden="true">verified</span>
                    {busy === 'issue' ? 'Working…' : 'Mark issued'}
                  </button>
                )}
                {['draft', 'issued'].includes(invoice.status) && (
                  <button type="button" className="sa-btn sa-btn-ghost" disabled={Boolean(busy)}
                    onClick={() => patch({ status: 'sent', sent_at: Math.floor(Date.now() / 1000) }, 'send')}>
                    <span className="material-symbols-outlined" aria-hidden="true">send</span>
                    {busy === 'send' ? 'Working…' : 'Mark sent'}
                  </button>
                )}
                {invoice.status !== 'cancelled' && (
                  <button type="button" className="sa-btn sa-btn-ghost" disabled={Boolean(busy)}
                    onClick={() => patch({
                      status: 'cancelled', cancelled_at: Math.floor(Date.now() / 1000),
                    }, 'cancel')}>
                    <span className="material-symbols-outlined" aria-hidden="true">block</span>
                    {busy === 'cancel' ? 'Working…' : 'Cancel'}
                  </button>
                )}
                <button type="button" className="sa-btn sa-btn-danger" disabled={Boolean(busy)}
                  onClick={async () => {
                    setBusy('delete'); setActionError(null)
                    try {
                      await bizDelete('invoices', id)
                      setVersion(v => v + 1)
                      onChanged()
                    } catch (e) { setActionError(e) } finally { setBusy('') }
                  }}>
                  <span className="material-symbols-outlined" aria-hidden="true">delete</span>
                  {busy === 'delete' ? 'Working…' : 'Delete'}
                </button>
              </div>

              {invoice.status !== 'cancelled' && (
                <form
                  style={{ display: 'flex', alignItems: 'flex-end', gap: 8, marginTop: 12, flexWrap: 'wrap' }}
                  onSubmit={e => {
                    e.preventDefault()
                    const minor = parseMinor(payAmount)
                    if (minor === null || minor < 0 || minor > invoice.gross_minor) {
                      setActionError(new Error(
                        `Payment must be between 0 and ${formatMinor(invoice.gross_minor, cur)}`))
                      return
                    }
                    patch({
                      paid_minor: minor,
                      status: minor === invoice.gross_minor ? 'paid' : minor > 0 ? 'partially_paid' : invoice.status,
                      ...(minor === invoice.gross_minor ? { paid_at: Math.floor(Date.now() / 1000) } : {}),
                    }, 'pay')
                  }}
                >
                  <div>
                    <label className="sa-stat-label" htmlFor="inv-pay" style={{ display: 'block', marginBottom: 3 }}>
                      Record payment ({cur})
                    </label>
                    <input
                      id="inv-pay"
                      className="sa-input"
                      inputMode="decimal"
                      placeholder={formatMinorBare(invoice.gross_minor, cur)}
                      value={payAmount}
                      onChange={e => setPayAmount(e.target.value)}
                      style={{ width: 160 }}
                    />
                  </div>
                  <button type="submit" className="sa-btn sa-btn-primary" disabled={Boolean(busy) || !payAmount}>
                    {busy === 'pay' ? 'Saving…' : 'Save payment'}
                  </button>
                  <button
                    type="button"
                    className="sa-btn sa-btn-ghost"
                    disabled={Boolean(busy)}
                    onClick={() => setPayAmount(formatMinorBare(invoice.gross_minor, cur))}
                  >
                    Paid in full
                  </button>
                </form>
              )}
            </section>
          )}

          {invoice.deleted_at && (
            <button type="button" className="sa-btn sa-btn-ghost" disabled={Boolean(busy)}
              onClick={async () => {
                setBusy('restore'); setActionError(null)
                try {
                  await bizRestore('invoices', id)
                  setVersion(v => v + 1)
                  onChanged()
                } catch (e) { setActionError(e) } finally { setBusy('') }
              }}>
              <span className="material-symbols-outlined" aria-hidden="true">restore_from_trash</span>
              {busy === 'restore' ? 'Working…' : 'Restore'}
            </button>
          )}
        </div>
      )}
    </Drawer>
  )
}

function DetailGrid({ items }) {
  return (
    <dl style={{
      display: 'grid', gridTemplateColumns: 'minmax(96px, 34%) 1fr', gap: '4px 12px',
      margin: '6px 0 0', fontSize: 'var(--sa-fs-body)',
    }}>
      {items.map(([label, value], i) => (
        <div key={`${label}-${i}`} style={{ display: 'contents' }}>
          <dt style={{ color: 'var(--sa-text-muted)' }}>{label}</dt>
          <dd style={{ margin: 0, minWidth: 0, wordBreak: 'break-word' }}>{value}</dd>
        </div>
      ))}
    </dl>
  )
}

// ── create ───────────────────────────────────────────────────────────────────

const emptyLine = () => ({
  description: '', quantity: '1', unit: 'lesson', price: '', vat_rate_bp: 2300, gtu_code: '',
})

function NewInvoiceModal({ onClose, onCreated }) {
  const [nextNumber, setNextNumber] = useState(null)
  const [numberError, setNumberError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)

  const [form, setForm] = useState({
    kind: 'invoice',
    buyer_name: '',
    buyer_tax_id: '',
    buyer_address: '',
    buyer_country: 'PL',
    seller_tax_id: '',
    issue_date: todayIso(),
    sale_date: '',
    due_date: addDaysIso(todayIso(), 14),
    payment_method: 'transfer',
    currency: 'PLN',
    vat_scheme: 'standard',
    vat_exempt_reason: '',
    notes: '',
  })
  const [lines, setLines] = useState([emptyLine()])

  const set = (key, value) => setForm(f => ({ ...f, [key]: value }))
  const setLine = (i, key, value) => setLines(ls => ls.map((l, j) => (j === i ? { ...l, [key]: value } : l)))

  useEffect(() => {
    let alive = true
    peekInvoiceNumber()
      .then(d => { if (alive) setNextNumber(d?.number ?? d?.next_number ?? null) })
      .catch(e => { if (alive) setNumberError(e) })
    return () => { alive = false }
  }, [])

  // Every line, in integer minor units. Invalid input yields null totals so the
  // form can refuse to save rather than post a rounded-down guess.
  const computed = useMemo(() => lines.map(l => {
    const quantity_milli = parseMilli(l.quantity)
    const unit_price_minor = parseMinor(l.price)
    if (quantity_milli === null || quantity_milli <= 0 || unit_price_minor === null || unit_price_minor < 0) {
      return null
    }
    const totals = lineTotals({ quantity_milli, unit_price_minor, vat_rate_bp: l.vat_rate_bp })
    return { quantity_milli, unit_price_minor, vat_rate_bp: l.vat_rate_bp, ...totals }
  }), [lines])

  const valid = computed.every(Boolean)
    && lines.every(l => l.description.trim())
    && form.buyer_name.trim()
    && form.issue_date && form.due_date
    && form.buyer_country.length === 2

  const totals = computed.reduce((acc, c) => c ? {
    net: acc.net + c.net_minor, vat: acc.vat + c.vat_minor, gross: acc.gross + c.gross_minor,
  } : acc, { net: 0, vat: 0, gross: 0 })

  const canSave = valid && Boolean(nextNumber) && !saving

  async function save() {
    setSaving(true)
    setSaveError(null)
    try {
      // No `number` in the payload: create_invoice() allocates it inside the
      // transaction that inserts this row. Sending one would be refused, and
      // rightly so.
      const invoice = await bizCreate('invoices', pruned({
        ...form,
        status: 'draft',
        net_minor: totals.net,
        vat_minor: totals.vat,
        gross_minor: totals.gross,
        vat_exempt_reason: form.vat_scheme === 'exempt' ? form.vat_exempt_reason : '',
      }))
      const id = invoice?.id
      if (!id) throw new Error('The server did not return the created invoice')

      const failures = []
      for (let i = 0; i < lines.length; i++) {
        const c = computed[i]
        try {
          await bizCreate('invoice_lines', pruned({
            invoice_id: id,
            position: i + 1,
            description: lines[i].description.trim(),
            quantity_milli: c.quantity_milli,
            unit: lines[i].unit,
            unit_price_minor: c.unit_price_minor,
            vat_rate_bp: c.vat_rate_bp,
            net_minor: c.net_minor,
            vat_minor: c.vat_minor,
            gross_minor: c.gross_minor,
            gtu_code: lines[i].gtu_code.trim(),
          }))
        } catch (e) {
          failures.push(`line ${i + 1}: ${e.message}`)
        }
      }
      if (failures.length) {
        setSaveError(new Error(
          `Invoice ${invoice.number} was created, but ${failures.length} line(s) failed — `
          + `open it and fix them: ${failures.join(' · ')}`))
        setSaving(false)
        return
      }
      onCreated(id)
    } catch (e) {
      setSaveError(e)
      setSaving(false)
    }
  }

  return (
    <Modal
      title="New invoice"
      width="820px"
      onClose={onClose}
      footer={
        <>
          <span className="sa-toolbar-count" style={{ marginRight: 'auto' }}>
            Net {formatMinorBare(totals.net, form.currency)} · VAT {formatMinorBare(totals.vat, form.currency)} ·
            {' '}<strong>Gross {formatMinor(totals.gross, form.currency)}</strong>
          </span>
          <button type="button" className="sa-btn sa-btn-ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="sa-btn sa-btn-primary" onClick={save} disabled={!canSave}>
            {saving ? 'Saving…' : 'Create invoice'}
          </button>
        </>
      }
    >
      <div style={{ display: 'grid', gap: 12 }}>
        {numberError?.notLive ? (
          <Notice tone="bad" icon="power_off">
            <code>/api/console/biz/invoices/next-number</code> answered 404. The number allocator is
            not live, and this screen will not mint a number of its own — a Polish sequence has to
            stay gapless. Saving is disabled until the endpoint ships.
          </Notice>
        ) : numberError ? (
          <Notice tone="bad" icon="error">
            Could not reach the number allocator: {numberError.message}. Saving is disabled — the UI
            never invents an invoice number.
          </Notice>
        ) : (
          <Notice tone="info" icon="tag">
            Next number: <strong className="sa-num">{nextNumber || 'allocating…'}</strong> — a
            preview. The server assigns the real number when the row is inserted, so two operators
            saving at once still get consecutive numbers.
          </Notice>
        )}
        {saveError && <Notice tone="bad" icon="error">{saveError.message}</Notice>}

        <section>
          <p className="sa-stat-label">Buyer</p>
          <Field label="Name" required>
            <input className="sa-input" value={form.buyer_name} required
              onChange={e => set('buyer_name', e.target.value)} placeholder="Company or person" />
          </Field>
          <Field label="NIP" hint="Polish tax identifier, frozen on the document at issue.">
            <input className="sa-input sa-num" value={form.buyer_tax_id}
              onChange={e => set('buyer_tax_id', e.target.value)} placeholder="1234567890" />
          </Field>
          <Field label="Address">
            <input className="sa-input" value={form.buyer_address}
              onChange={e => set('buyer_address', e.target.value)} placeholder="ul. …, 00-000 Warszawa" />
          </Field>
          <Field label="Country" required hint="Two-letter ISO code.">
            <input className="sa-input" value={form.buyer_country} maxLength={2}
              onChange={e => set('buyer_country', e.target.value.toUpperCase())} style={{ width: 90 }} />
          </Field>
          <Field label="Seller NIP">
            <input className="sa-input sa-num" value={form.seller_tax_id}
              onChange={e => set('seller_tax_id', e.target.value)} />
          </Field>
        </section>

        <section>
          <p className="sa-stat-label">Document</p>
          <Field label="Kind">
            <select className="sa-select" value={form.kind} onChange={e => set('kind', e.target.value)}>
              {KINDS.map(k => <option key={k} value={k}>{k}</option>)}
            </select>
          </Field>
          <Field label="Issue date" required>
            <input type="date" className="sa-input" value={form.issue_date}
              onChange={e => set('issue_date', e.target.value)} />
          </Field>
          <Field label="Sale date" hint="data sprzedaży — leave blank if it equals the issue date.">
            <input type="date" className="sa-input" value={form.sale_date}
              onChange={e => set('sale_date', e.target.value)} />
          </Field>
          <Field label="Due date" required>
            <input type="date" className="sa-input" value={form.due_date}
              onChange={e => set('due_date', e.target.value)} />
          </Field>
          <Field label="Payment method">
            <select className="sa-select" value={form.payment_method}
              onChange={e => set('payment_method', e.target.value)}>
              {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </Field>
          <Field label="Currency">
            <select className="sa-select" value={form.currency} onChange={e => set('currency', e.target.value)}>
              {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="VAT scheme">
            <select className="sa-select" value={form.vat_scheme} onChange={e => set('vat_scheme', e.target.value)}>
              {VAT_SCHEMES.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
            </select>
          </Field>
          {form.vat_scheme === 'exempt' && (
            <Field label="Exemption basis" hint="Required on a Polish invoice: the article the exemption rests on.">
              <input className="sa-input" value={form.vat_exempt_reason}
                onChange={e => set('vat_exempt_reason', e.target.value)}
                placeholder="art. 113 ust. 1 ustawy o VAT" />
            </Field>
          )}
          <Field label="Notes">
            <textarea className="sa-input sa-textarea" value={form.notes}
              onChange={e => set('notes', e.target.value)} />
          </Field>
        </section>

        <section>
          <p className="sa-stat-label">Lines</p>
          <div className="sa-table-wrap" style={{ marginTop: 6 }}>
            <table className="sa-table">
              <caption className="sa-sr-only">Invoice lines being drafted</caption>
              <thead>
                <tr>
                  <th scope="col" style={{ minWidth: 200 }}>Description</th>
                  <th scope="col" style={{ width: 90 }}>Qty</th>
                  <th scope="col" style={{ width: 110 }}>Unit</th>
                  <th scope="col" style={{ width: 120 }}>Unit price</th>
                  <th scope="col" style={{ width: 90 }}>VAT</th>
                  <th scope="col" style={{ width: 110 }}>GTU</th>
                  <th scope="col" className="sa-td-right" style={{ width: 120 }}>Gross</th>
                  <th scope="col" style={{ width: 40 }}><span className="sa-sr-only">Remove</span></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i}>
                    <td>
                      <input className="sa-input" value={l.description} aria-label={`Line ${i + 1} description`}
                        onChange={e => setLine(i, 'description', e.target.value)}
                        placeholder="Individual lessons, July 2026" />
                    </td>
                    <td>
                      <input className="sa-input sa-num" value={l.quantity} inputMode="decimal"
                        aria-label={`Line ${i + 1} quantity`}
                        aria-invalid={parseMilli(l.quantity) === null || parseMilli(l.quantity) <= 0}
                        onChange={e => setLine(i, 'quantity', e.target.value)} />
                    </td>
                    <td>
                      <select className="sa-select" value={l.unit} aria-label={`Line ${i + 1} unit`}
                        onChange={e => setLine(i, 'unit', e.target.value)}>
                        {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </td>
                    <td>
                      <input className="sa-input sa-num" value={l.price} inputMode="decimal"
                        aria-label={`Line ${i + 1} unit price`}
                        aria-invalid={parseMinor(l.price) === null}
                        onChange={e => setLine(i, 'price', e.target.value)} placeholder="0,00" />
                    </td>
                    <td>
                      <select className="sa-select" value={l.vat_rate_bp} aria-label={`Line ${i + 1} VAT rate`}
                        onChange={e => setLine(i, 'vat_rate_bp', Number(e.target.value))}>
                        {VAT_RATES.map(([bp, label]) => <option key={bp} value={bp}>{label}</option>)}
                      </select>
                    </td>
                    <td>
                      <input className="sa-input sa-num" value={l.gtu_code} aria-label={`Line ${i + 1} GTU code`}
                        onChange={e => setLine(i, 'gtu_code', e.target.value)} placeholder="GTU_12" />
                    </td>
                    <td className="sa-num">
                      {computed[i] ? formatMinorBare(computed[i].gross_minor, form.currency) : '—'}
                    </td>
                    <td>
                      <button type="button" className="sa-icon-btn sa-icon-btn-sm"
                        aria-label={`Remove line ${i + 1}`} disabled={lines.length === 1}
                        onClick={() => setLines(ls => ls.filter((_, j) => j !== i))}>
                        <span className="material-symbols-outlined" aria-hidden="true">delete</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" style={{ marginTop: 8 }}
            onClick={() => setLines(ls => [...ls, emptyLine()])}>
            <span className="material-symbols-outlined" aria-hidden="true">add</span>
            Add line
          </button>
        </section>

        <section>
          <p className="sa-stat-label">Totals</p>
          <DetailGrid
            items={[
              ['Net', <span className="sa-num" key="n">{formatMinor(totals.net, form.currency)}</span>],
              ['VAT', <span className="sa-num" key="v">{formatMinor(totals.vat, form.currency)}</span>],
              ['Gross', <span className="sa-num" key="g" style={{ fontWeight: 700 }}>{formatMinor(totals.gross, form.currency)}</span>],
            ]}
          />
          <div style={{ marginTop: 8 }}>
            <Notice tone={totals.gross === totals.net + totals.vat ? 'good' : 'bad'}
              icon={totals.gross === totals.net + totals.vat ? 'check' : 'error'}>
              {totals.gross === totals.net + totals.vat
                ? 'Reconciles: gross = net + VAT, computed in integer grosze.'
                : 'Does not reconcile — the server would reject this.'}
            </Notice>
          </div>
          {form.vat_scheme !== 'standard' && totals.vat !== 0 && (
            <div style={{ marginTop: 6 }}>
              <Notice tone="warn" icon="warning">
                Scheme “{SCHEME_LABEL[form.vat_scheme]}” normally carries 0% VAT on every line.
              </Notice>
            </div>
          )}
          {!valid && (
            <div style={{ marginTop: 6 }}>
              <Notice tone="warn" icon="edit">
                Fill in the buyer, both dates, and a description, quantity and price on every line.
              </Notice>
            </div>
          )}
        </section>
      </div>
    </Modal>
  )
}
