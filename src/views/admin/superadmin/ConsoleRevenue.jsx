// ConsoleRevenue — Finance → Revenue.
//
// This screen reads REAL teaching data out of Convex through the admin proxy;
// it does not touch em-business.db. Three sources, all already in production:
//
//   scheduling:getMonthlyLessonStats  booked vs delivered, per month, per org
//   billing:listPackages              lesson allocation and what is left of it
//   orders:listOrders                 lesson-package orders and their status
//
// Deliberately NOT shown: a revenue figure in złoty. lessonOrders carries a
// display string (`priceLabel`, e.g. "880 PLN") and no minor-unit amount, so
// any total would be a guess dressed as accounting. The order value is printed
// exactly as the student saw it, and the money that IS accounted for lives on
// Finance → Invoices, which stores integer minor units.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { queryAdminConvex } from '../../../contexts/AdminAuthContext.jsx'
import { ConsoleEmpty, ConsoleErrorPanel, ConsoleSkeleton } from './ConsoleStates.jsx'
import { Kpi, KPI_GRID, ListFooter, Notice, SortTh, StatusBadge } from './FinanceShared.jsx'
import { formatEpoch } from './financeApi.js'

const TABS = [
  { key: 'months', label: 'Lessons by month', icon: 'calendar_month' },
  { key: 'orders', label: 'Orders', icon: 'receipt' },
  { key: 'payments', label: 'Payments', icon: 'credit_card' },
  { key: 'packages', label: 'Package allocation', icon: 'inventory_2' },
]

// Client-side sort: these three tables are already fully in memory (Convex
// returns them whole), so paging back to the server would be slower and lie
// about freshness.
function useSorted(rows, sort) {
  return useMemo(() => {
    const desc = sort.startsWith('-')
    const col = desc ? sort.slice(1) : sort
    return [...rows].sort((a, b) => {
      const x = a[col]
      const y = b[col]
      if (x === y) return 0
      if (x === null || x === undefined) return 1
      if (y === null || y === undefined) return -1
      const cmp = typeof x === 'number' && typeof y === 'number'
        ? x - y
        : String(x).localeCompare(String(y))
      return desc ? -cmp : cmp
    })
  }, [rows, sort])
}

export default function ConsoleRevenue() {
  const [orgs, setOrgs] = useState(null)
  const [orgId, setOrgId] = useState('all')
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [warnings, setWarnings] = useState([])
  const [reloadKey, setReloadKey] = useState(0)

  const [tab, setTab] = useState('months')
  const [q, setQ] = useState('')
  const [monthSort, setMonthSort] = useState('-month')
  const [orderSort, setOrderSort] = useState('-createdAt')
  const [paymentSort, setPaymentSort] = useState('-createdAt')
  const [packageSort, setPackageSort] = useState('studentName')
  const [visible, setVisible] = useState(50)

  const reload = useCallback(() => setReloadKey(k => k + 1), [])

  useEffect(() => {
    let alive = true
    setData(null)
    setError(null)
    setWarnings([])

    ;(async () => {
      try {
        const organizations = (await queryAdminConvex('students:listOrganizations', {})) || []
        if (!alive) return
        setOrgs(organizations)
        const scope = organizations.filter(o => orgId === 'all' || String(o._id) === orgId)
        if (!scope.length) {
          setData({ months: [], orders: [], packages: [] })
          return
        }

        const [ordersResult, paymentsResult, statsResults, packageResults] = await Promise.all([
          Promise.allSettled([queryAdminConvex('orders:listOrders', {})]),
          Promise.allSettled([queryAdminConvex('p24:listPayments', {})]),
          Promise.allSettled(scope.map(o =>
            queryAdminConvex('scheduling:getMonthlyLessonStats', { organizationId: o._id }))),
          Promise.allSettled(scope.map(o =>
            queryAdminConvex('billing:listPackages', { organizationId: o._id }))),
        ])
        if (!alive) return

        const notes = []
        const failed = (label, results) => {
          results.forEach((r, i) => {
            if (r.status === 'rejected') {
              notes.push(`${label}${results.length > 1 ? ` · ${scope[i]?.name || i}` : ''}: ${String(r.reason?.message || r.reason).slice(0, 120)}`)
            }
          })
        }
        failed('orders', ordersResult)
        failed('payments', paymentsResult)
        failed('monthly stats', statsResults)
        failed('packages', packageResults)

        // Merge the per-org month rows into one book.
        const months = new Map()
        statsResults.forEach(r => {
          if (r.status !== 'fulfilled') return
          for (const row of r.value?.months || []) {
            const acc = months.get(row.month) || {
              month: row.month, completedLessons: 0, lateCancellations: 0,
              cancellations: 0, scheduled: 0, billableTotal: 0,
            }
            acc.completedLessons += row.completedLessons || 0
            acc.lateCancellations += row.lateCancellations || 0
            acc.cancellations += row.cancellations || 0
            acc.scheduled += row.scheduled || 0
            acc.billableTotal += row.billableTotal || 0
            months.set(row.month, acc)
          }
        })

        const orgIds = new Set(scope.map(o => String(o._id)))
        const allOrders = ordersResult[0].status === 'fulfilled' ? (ordersResult[0].value || []) : []
        const orders = allOrders.filter(o => orgIds.has(String(o.organizationId)))

        const packages = packageResults.flatMap(r => (r.status === 'fulfilled' ? (r.value || []) : []))

        const allPayments = paymentsResult[0].status === 'fulfilled' ? (paymentsResult[0].value || []) : []
        const payments = allPayments.filter(p => orgIds.has(String(p.organizationId)))

        const currentMonth = new Date().toISOString().slice(0, 7)
        setWarnings(notes)
        setData({ months: [...months.values()], orders, payments, packages, currentMonth })
      } catch (e) {
        if (alive) setError(e)
      }
    })()

    return () => { alive = false }
  }, [orgId, reloadKey])

  useEffect(() => { setVisible(50) }, [tab, q, orgId])

  const needle = q.trim().toLowerCase()
  const orders = useMemo(() => (data?.orders || []).filter(o => !needle
    || `${o.studentName} ${o.packageName} ${o.billing?.company || ''} ${o.billing?.nip || ''}`
      .toLowerCase().includes(needle)), [data, needle])
  const payments = useMemo(() => (data?.payments || []).filter(p => !needle
    || `${p.studentName} ${p.email} ${p.checkoutRef} ${p.status}`.toLowerCase().includes(needle)),
  [data, needle])
  const packages = useMemo(() => (data?.packages || []).filter(p => !needle
    || `${p.studentName} ${p.name}`.toLowerCase().includes(needle)), [data, needle])

  const sortedMonths = useSorted(data?.months || [], monthSort)
  const sortedOrders = useSorted(orders, orderSort)
  const sortedPayments = useSorted(payments, paymentSort)
  const sortedPackages = useSorted(packages, packageSort)

  if (error) {
    return (
      <>
        <Header orgs={orgs} orgId={orgId} setOrgId={setOrgId} onReload={reload} />
        <ConsoleErrorPanel error={error} onRetry={reload} />
      </>
    )
  }
  if (!data) {
    return (
      <>
        <Header orgs={orgs} orgId={orgId} setOrgId={setOrgId} onReload={reload} />
        <ConsoleSkeleton rows={8} label="Loading revenue…" />
      </>
    )
  }

  const thisMonth = (data.months || []).find(m => m.month === data.currentMonth)
  const allocated = data.packages.reduce((n, p) => n + (p.totalLessons || 0), 0)
  const remaining = data.packages.reduce((n, p) => n + (p.remainingLessons ?? 0), 0)
  const pending = data.orders.filter(o => o.status === 'pending_invoice').length
  const nothingAtAll = !data.months.length && !data.orders.length && !data.packages.length

  const rowsFor = { months: sortedMonths, orders: sortedOrders, payments: sortedPayments, packages: sortedPackages }[tab]
  const page = rowsFor.slice(0, visible)

  return (
    <>
      <Header orgs={orgs} orgId={orgId} setOrgId={setOrgId} onReload={reload} />

      {warnings.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <Notice tone="warn" icon="warning">
            {warnings.length} source{warnings.length > 1 ? 's' : ''} failed to load and {warnings.length > 1 ? 'are' : 'is'} missing
            from the figures below: {warnings.join(' · ')}
          </Notice>
        </div>
      )}

      {nothingAtAll ? (
        <ConsoleEmpty
          icon="payments"
          title="No lessons, orders or packages in scope"
          hint={
            <>
              <p>
                Revenue reads the live teaching record: delivered and booked lessons, the lesson
                packages allocated against them, and the orders students placed.
              </p>
              <p style={{ marginTop: '0.5rem' }}>
                Nothing has been recorded for this organisation yet. Book a lesson or confirm an
                order and it appears here — this screen never fabricates a figure.
              </p>
            </>
          }
        />
      ) : (
        <>
          <div style={{ ...KPI_GRID, marginBottom: 12 }}>
            <Kpi
              label={`Delivered · ${data.currentMonth}`}
              value={thisMonth?.completedLessons ?? 0}
              hint="taught lessons on record"
            />
            <Kpi
              label={`Booked · ${data.currentMonth}`}
              value={thisMonth?.scheduled ?? 0}
              hint="scheduled, not yet taught"
            />
            <Kpi
              label={`Billable · ${data.currentMonth}`}
              value={thisMonth?.billableTotal ?? 0}
              hint={`incl. ${thisMonth?.lateCancellations ?? 0} late cancellation(s) + ${thisMonth?.noShows ?? 0} no-show(s)`}
            />
            <Kpi
              label="Lessons allocated"
              value={allocated}
              hint={`${remaining} remaining`}
            />
            <Kpi
              label="Orders awaiting payment"
              value={pending}
              hint={`${data.orders.length} order(s) total`}
            />
          </div>

          <div className="sa-toolbar" style={{ marginBottom: 12 }}>
            <div className="sa-tabs" style={{ border: 0, flex: '1 1 auto' }}>
              {TABS.map(t => (
                <button
                  key={t.key}
                  type="button"
                  className={`sa-tab${tab === t.key ? ' is-active' : ''}`}
                  aria-current={tab === t.key ? 'page' : undefined}
                  onClick={() => setTab(t.key)}
                >
                  <span className="material-symbols-outlined" aria-hidden="true">{t.icon}</span>
                  {t.label}
                </button>
              ))}
            </div>
            {tab !== 'months' && (
              <>
                <label className="sa-sr-only" htmlFor="revenue-search">Search {tab}</label>
                <input
                  id="revenue-search"
                  type="search"
                  className="sa-input"
                  placeholder={tab === 'orders'
                    ? 'Student, package, company, NIP…'
                    : tab === 'payments' ? 'Student, e-mail, reference, status…' : 'Student or package…'}
                  value={q}
                  onChange={e => setQ(e.target.value)}
                  style={{ minWidth: 240 }}
                />
              </>
            )}
          </div>

          <div className="sa-card">
            {tab === 'months' && (
              <MonthsTable rows={page} sort={monthSort} onSort={setMonthSort} current={data.currentMonth} />
            )}
            {tab === 'orders' && (
              <OrdersTable rows={page} sort={orderSort} onSort={setOrderSort} filtered={Boolean(needle)} />
            )}
            {tab === 'payments' && (
              <PaymentsTable rows={page} sort={paymentSort} onSort={setPaymentSort} filtered={Boolean(needle)} />
            )}
            {tab === 'packages' && (
              <PackagesTable rows={page} sort={packageSort} onSort={setPackageSort} filtered={Boolean(needle)} />
            )}
            {rowsFor.length > 0 && (
              <ListFooter
                shown={page.length}
                total={rowsFor.length}
                hasMore={page.length < rowsFor.length}
                onMore={() => setVisible(v => v + 50)}
              />
            )}
          </div>

          {tab === 'orders' && data.orders.length > 0 && (
            <p style={{ marginTop: 8, fontSize: 'var(--sa-fs-micro)', color: 'var(--sa-text-muted)' }}>
              Order value is the label the student was shown at checkout. It is not an accounted
              amount and is never summed here — the books live on Finance → Invoices.
            </p>
          )}
        </>
      )}
    </>
  )
}

function Header({ orgs, orgId, setOrgId, onReload }) {
  return (
    <div className="sa-page-header">
      <div>
        <h1>Revenue</h1>
        <p>
          Booked versus delivered lessons, package allocation and order status, straight from the
          live teaching record.
        </p>
      </div>
      <div className="sa-page-header-actions">
        <label className="sa-sr-only" htmlFor="revenue-org">Organisation</label>
        <select
          id="revenue-org"
          className="sa-select"
          value={orgId}
          onChange={e => setOrgId(e.target.value)}
          style={{ width: 'auto', minWidth: 180 }}
          disabled={!orgs}
        >
          <option value="all">All organisations</option>
          {(orgs || []).map(o => (
            <option key={o._id} value={String(o._id)}>{o.name}</option>
          ))}
        </select>
        <button type="button" className="sa-btn sa-btn-ghost" onClick={onReload}>
          <span className="material-symbols-outlined" aria-hidden="true">refresh</span>
          Refresh
        </button>
      </div>
    </div>
  )
}

function MonthsTable({ rows, sort, onSort, current }) {
  if (!rows.length) {
    return (
      <ConsoleEmpty
        icon="calendar_month"
        title="No lesson months on record"
        hint={<p>Once a lesson is taught or a booking is late-cancelled, the month it belongs to appears here.</p>}
      />
    )
  }
  return (
    <div className="sa-table-wrap">
      <table className="sa-table">
        <caption className="sa-sr-only">Lessons by month</caption>
        <thead>
          <tr>
            <SortTh col="month" label="Month" sort={sort} onSort={onSort} />
            <SortTh col="completedLessons" label="Delivered" sort={sort} onSort={onSort} align="right" />
            <SortTh col="scheduled" label="Booked" sort={sort} onSort={onSort} align="right" />
            <SortTh col="lateCancellations" label="Late cancel" sort={sort} onSort={onSort} align="right" />
            <SortTh col="cancellations" label="Cancelled" sort={sort} onSort={onSort} align="right" />
            <SortTh col="billableTotal" label="Billable" sort={sort} onSort={onSort} align="right" />
          </tr>
        </thead>
        <tbody>
          {rows.map(m => (
            <tr key={m.month}>
              <td>
                <span className="sa-num" style={{ fontWeight: 600 }}>{m.month}</span>
                {m.month === current && (
                  <span className="sa-badge sa-badge-processing" style={{ marginLeft: 6 }}>current</span>
                )}
              </td>
              <td className="sa-num">{m.completedLessons}</td>
              <td className="sa-num">{m.scheduled}</td>
              <td className="sa-num">{m.lateCancellations}</td>
              <td className="sa-num">{m.cancellations}</td>
              <td className="sa-num" style={{ fontWeight: 600 }}>{m.billableTotal}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function OrdersTable({ rows, sort, onSort, filtered }) {
  if (!rows.length) {
    return (
      <ConsoleEmpty
        icon="receipt"
        title={filtered ? 'No orders match' : 'No lesson orders yet'}
        hint={filtered
          ? <p>Clear the search to see every order again.</p>
          : (
            <>
              <p>Students order lesson packages from the pricing page; each order lands here as
                <strong> pending invoice</strong> until payment is confirmed.</p>
              <p style={{ marginTop: '0.5rem' }}>
                Confirming an order allocates its lessons. Issue the matching invoice on
                Finance → Invoices.
              </p>
            </>
          )}
      />
    )
  }
  return (
    <div className="sa-table-wrap">
      <table className="sa-table">
        <caption className="sa-sr-only">Lesson package orders</caption>
        <thead>
          <tr>
            <SortTh col="createdAt" label="Placed" sort={sort} onSort={onSort} />
            <SortTh col="studentName" label="Student" sort={sort} onSort={onSort} />
            <SortTh col="packageName" label="Package" sort={sort} onSort={onSort} />
            <SortTh col="lessons" label="Lessons" sort={sort} onSort={onSort} align="right" />
            <th scope="col" className="sa-td-right">Value (as shown)</th>
            <th scope="col">Buyer / NIP</th>
            <SortTh col="status" label="Status" sort={sort} onSort={onSort} />
          </tr>
        </thead>
        <tbody>
          {rows.map(o => (
            <tr key={o._id}>
              <td className="sa-num">{o.createdAt ? new Date(o.createdAt).toISOString().slice(0, 10) : '—'}</td>
              <td style={{ fontWeight: 600 }}>{o.studentName}</td>
              <td>{o.packageName}</td>
              <td className="sa-num">{o.lessons}</td>
              <td className="sa-num">{o.priceLabel || '—'}</td>
              <td>
                {o.billing?.company || o.billing?.fullName || '—'}
                {o.billing?.nip && (
                  <span className="sa-num" style={{ marginLeft: 6, color: 'var(--sa-text-muted)' }}>
                    NIP {o.billing.nip}
                  </span>
                )}
              </td>
              <td>
                <StatusBadge
                  status={o.status}
                  title={o.confirmedAt ? `Confirmed ${formatEpoch(Math.floor(o.confirmedAt / 1000))}` : undefined}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// Unlike lessonOrders, a p24Payment carries an integer amount in grosze, so the
// money here is exact rather than a label. "Needs attention" is the reason this
// table exists: a captured payment whose lessons did not allocate is otherwise
// invisible to everyone, including whoever has to refund it.
function PaymentsTable({ rows, sort, onSort, filtered }) {
  if (!rows.length) {
    return (
      <ConsoleEmpty
        icon="credit_card"
        title={filtered ? 'No payments match' : 'No Przelewy24 payments yet'}
        hint={filtered
          ? <p>Clear the search to see every payment again.</p>
          : (
            <p>Online payments taken through Przelewy24 appear here as soon as a customer starts
              one. Lessons are allocated only after Przelewy24 verifies the transaction.</p>
          )}
      />
    )
  }
  return (
    <div className="sa-table-wrap">
      <table className="sa-table">
        <caption className="sa-sr-only">Przelewy24 payments</caption>
        <thead>
          <tr>
            <SortTh col="createdAt" label="Started" sort={sort} onSort={onSort} />
            <SortTh col="studentName" label="Student" sort={sort} onSort={onSort} />
            <th scope="col">Reference</th>
            <SortTh col="amount" label="Amount" sort={sort} onSort={onSort} align="right" />
            <SortTh col="status" label="Status" sort={sort} onSort={onSort} />
            <th scope="col">Needs attention</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(p => (
            <tr key={p._id}>
              <td className="sa-num">{p.createdAt ? new Date(p.createdAt).toISOString().slice(0, 10) : '—'}</td>
              <td style={{ fontWeight: 600 }}>
                {p.studentName}
                <span style={{ display: 'block', color: 'var(--sa-text-muted)', fontSize: 'var(--sa-fs-micro)' }}>
                  {p.email}
                </span>
              </td>
              <td className="sa-num">{p.checkoutRef}</td>
              <td className="sa-num">{(p.amount / 100).toFixed(2)} {p.currency}</td>
              <td>
                <StatusBadge
                  status={p.status}
                  title={p.verifiedAt ? `Verified ${formatEpoch(Math.floor(p.verifiedAt / 1000))}` : undefined}
                />
              </td>
              <td>
                {p.needsAttention
                  ? (
                    <span style={{ color: 'var(--sa-danger, #b42318)', fontWeight: 600 }}>
                      {p.allocationErrors.length
                        ? `Paid, lessons NOT allocated: ${p.allocationErrors.join('; ')}`
                        : p.status === 'registration_failed'
                          ? (p.error || 'Could not start at Przelewy24')
                          : 'Sent to Przelewy24 over an hour ago and never confirmed'}
                    </span>
                  )
                  : <span style={{ color: 'var(--sa-text-muted)' }}>—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PackagesTable({ rows, sort, onSort, filtered }) {
  if (!rows.length) {
    return (
      <ConsoleEmpty
        icon="inventory_2"
        title={filtered ? 'No packages match' : 'No lesson packages allocated'}
        hint={filtered
          ? <p>Clear the search to see every package again.</p>
          : (
            <p>
              A package is created when an order is confirmed, or by hand from the student
              workspace. It is what a booked lesson is drawn against.
            </p>
          )}
      />
    )
  }
  return (
    <div className="sa-table-wrap">
      <table className="sa-table">
        <caption className="sa-sr-only">Lesson package allocation</caption>
        <thead>
          <tr>
            <SortTh col="studentName" label="Student" sort={sort} onSort={onSort} />
            <SortTh col="name" label="Package" sort={sort} onSort={onSort} />
            <SortTh col="purchasedAt" label="Purchased" sort={sort} onSort={onSort} />
            <SortTh col="totalLessons" label="Allocated" sort={sort} onSort={onSort} align="right" />
            <SortTh col="usedLessons" label="Used" sort={sort} onSort={onSort} align="right" />
            <SortTh col="remainingLessons" label="Remaining" sort={sort} onSort={onSort} align="right" />
            <SortTh col="status" label="Status" sort={sort} onSort={onSort} />
          </tr>
        </thead>
        <tbody>
          {rows.map(p => (
            <tr key={p._id}>
              <td style={{ fontWeight: 600 }}>{p.studentName}</td>
              <td>{p.name}</td>
              <td className="sa-num">
                {p.purchasedAt ? new Date(p.purchasedAt).toISOString().slice(0, 10) : '—'}
              </td>
              <td className="sa-num">{p.totalLessons ?? '—'}</td>
              <td className="sa-num">{p.usedLessons ?? '—'}</td>
              <td className="sa-num" style={{
                fontWeight: 600,
                color: p.remainingLessons === 0 ? 'var(--sa-bad)' : 'var(--sa-text)',
              }}>
                {p.remainingLessons ?? '—'}
              </td>
              <td>
                <StatusBadge status={p.status} />
                {p.lowBalance && (
                  <span className="sa-badge sa-badge-awaiting_review" style={{ marginLeft: 6 }}>low</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
