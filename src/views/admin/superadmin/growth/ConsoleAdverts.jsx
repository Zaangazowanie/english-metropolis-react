// Growth → Adverts. Real tables, real emptiness.
//
// ad_accounts, ad_campaigns and ad_metrics_daily exist in em-business.db
// (schema: /root/em-console-api/em_business.py, SCHEMA_GROWTH). What does NOT
// exist on this box is a Google Ads or Meta credential, so no spend has ever
// been fetched and none can be until the founder connects an account. This
// screen therefore ships the whole dashboard — accounts, campaigns, a daily
// metrics table and a spend/impressions/clicks/conversions summary with CTR,
// CPC and CPA derived from the real columns — and shows nothing in it.
//
// Nothing here is seeded, mocked or "illustrative". There is no demo chart.
// The manual upsert path (POST /api/console/biz/ad-metrics/upsert) exists so
// numbers an operator reads off a provider's own dashboard can be recorded by
// hand, correctly, before any API integration is built. Every such row is
// stamped source='manual' (or 'import') and the summary says how many of the
// rows behind it were typed rather than synced.

import { useMemo, useState } from 'react'
import { ConsoleEmpty, ConsoleErrorPanel, ConsoleNotLive, ConsoleSkeleton } from '../ConsoleStates.jsx'
import {
  ENTITY, bizCreate, bizDelete, bizUpdate, bizUpsertAdMetrics, entityPath,
  CURRENCIES, DASH, formatEpoch, formatInt, formatMinor, formatRatioPct,
  isoDaysAgo, minorToInput, nullIfBlank, parseMinor, perUnitMinor, todayISO,
} from './growthApi.js'
import { ConfirmModal, Field, FormError, LoadMore, Modal, Pill, SortTh, useBizList, useIndex } from './GrowthShared.jsx'

const PROVIDERS = ['google_ads', 'meta', 'linkedin', 'tiktok', 'microsoft', 'x', 'other']
const ACCOUNT_STATUSES = ['active', 'paused', 'disconnected', 'error']
const AD_CAMPAIGN_STATUSES = ['active', 'paused', 'ended', 'removed', 'draft']
const METRIC_SOURCES = ['manual', 'import', 'api']

const ACCOUNT_TONE = { active: 'good', paused: 'warm', disconnected: 'neutral', error: 'bad' }
const AD_CAMPAIGN_TONE = { active: 'good', paused: 'warm', ended: 'neutral', removed: 'neutral', draft: 'neutral' }
const SOURCE_TONE = { api: 'brand', manual: 'neutral', import: 'neutral' }

// What connecting an account actually costs, per provider. Stated here because
// "connect your ad account" is not an instruction anyone can act on.
const CONNECTION_REQUIREMENTS = [
  ['Google Ads', 'An OAuth client id and secret, an approved developer token, and the ten-digit customer id of the account. The refresh token is held server-side by em-console-api.'],
  ['Meta (Facebook / Instagram)', 'A Business Manager system-user token with the ads_read permission, and the act_… ad account id.'],
]

const label = v => String(v || '').replace(/_/g, ' ')

export default function ConsoleAdverts() {
  const [tab, setTab] = useState('metrics')
  const [from, setFrom] = useState(isoDaysAgo(29))
  const [to, setTo] = useState(todayISO())
  const [campaignFilter, setCampaignFilter] = useState('')
  const [metricSort, setMetricSort] = useState('-date')
  const [accountForm, setAccountForm] = useState(null)
  const [adCampaignForm, setAdCampaignForm] = useState(null)
  const [metricsForm, setMetricsForm] = useState(null)
  const [confirming, setConfirming] = useState(null)   // {entity, id, title, body}
  const [rowBusy, setRowBusy] = useState(false)
  const [rowError, setRowError] = useState(null)

  const accounts = useBizList(ENTITY.adAccounts, useMemo(() => ({ sort: 'name', limit: 200 }), []))
  const adCampaigns = useBizList(ENTITY.adCampaigns, useMemo(() => ({ sort: 'name', limit: 200 }), []))
  const campaigns = useBizList(ENTITY.campaigns, useMemo(() => ({ sort: 'name', limit: 200 }), []))
  const metricParams = useMemo(() => ({
    sort: metricSort,
    limit: 500,
    date__gte: from || undefined,
    date__lte: to || undefined,
    ad_campaign_id: campaignFilter || undefined,
  }), [metricSort, from, to, campaignFilter])
  const metrics = useBizList(ENTITY.adMetrics, metricParams)

  const accountById = useIndex(accounts.rows)
  const adCampaignById = useIndex(adCampaigns.rows)
  const campaignById = useIndex(campaigns.rows)

  const notLive = [accounts, adCampaigns, metrics].some(l => l.error?.notLive)

  const summary = useMemo(() => {
    const byCurrency = new Map()
    let impressions = 0
    let clicks = 0
    let conversions = 0
    let handEntered = 0
    for (const r of metrics.rows) {
      impressions += Number(r.impressions) || 0
      clicks += Number(r.clicks) || 0
      conversions += Number(r.conversions) || 0
      if (r.source !== 'api') handEntered += 1
      const ccy = r.currency || 'PLN'
      const entry = byCurrency.get(ccy) || { spend: 0, value: 0 }
      entry.spend += Number(r.spend_minor) || 0
      entry.value += Number(r.conversion_value_minor) || 0
      byCurrency.set(ccy, entry)
    }
    const list = [...byCurrency.entries()]
    return {
      impressions, clicks, conversions, handEntered,
      days: metrics.rows.length,
      spend: list.map(([ccy, v]) => [ccy, v.spend]),
      value: list.map(([ccy, v]) => [ccy, v.value]),
      cpc: list.map(([ccy, v]) => [ccy, perUnitMinor(v.spend, clicks)]),
      cpa: list.map(([ccy, v]) => [ccy, perUnitMinor(v.spend, conversions)]),
    }
  }, [metrics.rows])

  const neverSynced = accounts.status === 'ready' && accounts.rows.length > 0
    && accounts.rows.every(a => !a.last_synced_at)

  async function destroy() {
    setRowBusy(true)
    setRowError(null)
    try {
      await bizDelete(confirming.entity, confirming.id)
      setConfirming(null)
      if (confirming.entity === ENTITY.adAccounts) { accounts.reload(); adCampaigns.reload() }
      else { adCampaigns.reload(); metrics.reload() }
    } catch (e) { setRowError(e) } finally { setRowBusy(false) }
  }

  const canEnterMetrics = adCampaigns.status === 'ready' && adCampaigns.rows.length > 0

  return (
    <>
      <div className="sa-page-header">
        <div>
          <h1>Adverts</h1>
          <p>
            Paid channels: the ad accounts, the campaigns inside them and one row per campaign per
            day. Spend, impressions, clicks and conversions are stored columns; CTR, CPC and CPA are
            computed from them. Nothing on this screen is estimated.
          </p>
        </div>
        <div className="sa-page-header-actions">
          <button type="button" className="sa-btn sa-btn-ghost" onClick={() => setAccountForm({})}>
            <span className="material-symbols-outlined" aria-hidden="true">account_balance</span>
            Record ad account
          </button>
          <button type="button" className="sa-btn sa-btn-primary" onClick={() => setMetricsForm({})}
            disabled={!canEnterMetrics}
            title={canEnterMetrics ? undefined : 'Record an ad account and an ad campaign first — a day row has to belong to a campaign.'}>
            <span className="material-symbols-outlined" aria-hidden="true">edit_note</span>
            Enter metrics
          </button>
        </div>
      </div>

      {notLive ? (
        <ConsoleNotLive endpoint={entityPath(ENTITY.adAccounts)} />
      ) : (
        <>
          {rowError && <div style={{ marginBottom: 12 }}><ConsoleErrorPanel error={rowError} onRetry={() => setRowError(null)} /></div>}

          {/* ── Connection reality ─────────────────────────────────────── */}
          {accounts.status === 'error' && !accounts.error?.notLive && (
            <ConsoleErrorPanel error={accounts.error} onRetry={accounts.reload} />
          )}
          {accounts.status === 'ready' && !accounts.rows.length && (
            <ConsoleEmpty
              icon="link_off"
              title="No ad account is connected"
              hint={
                <>
                  <p>
                    There is no Google Ads or Meta credential on this server, so no spend has been
                    fetched and none can be. That is why every figure below is empty: it is empty,
                    not hidden.
                  </p>
                  <div style={{ marginTop: '0.75rem', textAlign: 'left' }}>
                    {CONNECTION_REQUIREMENTS.map(([name, needs]) => (
                      <p key={name} style={{ marginTop: '0.4rem' }}>
                        <strong style={{ color: 'var(--sa-text)' }}>{name}</strong> — {needs}
                      </p>
                    ))}
                  </div>
                  <p style={{ marginTop: '0.75rem' }}>
                    Credentials are held server-side by em-console-api and never reach this browser.
                    Until one is connected, record the account below and enter the numbers by hand
                    from the provider's own dashboard — hand-entered rows are marked as such and are
                    corrected, not duplicated, when the same day is entered again.
                  </p>
                </>
              }
              action={
                <button type="button" className="sa-btn sa-btn-primary" onClick={() => setAccountForm({})}>
                  <span className="material-symbols-outlined" aria-hidden="true">add</span>
                  Record ad account
                </button>
              }
            />
          )}
          {neverSynced && (
            <p style={{ margin: '0 0 12px', color: 'var(--sa-warm-ink)', fontWeight: 600 }} role="status">
              No ad account has ever synced. Every figure on this screen was entered by hand.
            </p>
          )}

          {/* ── Summary ────────────────────────────────────────────────── */}
          <section aria-label="Spend summary">
            <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(148px, 1fr))' }}>
              <MoneyKpi label="Spend" entries={summary.spend} />
              <Kpi label="Impressions" value={summary.days ? formatInt(summary.impressions) : DASH} />
              <Kpi label="Clicks" value={summary.days ? formatInt(summary.clicks) : DASH} />
              <Kpi label="CTR" value={summary.impressions ? formatRatioPct(summary.clicks, summary.impressions) : DASH} />
              <MoneyKpi label="CPC" entries={summary.cpc} />
              <Kpi label="Conversions" value={summary.days ? formatInt(summary.conversions) : DASH} />
              <MoneyKpi label="CPA" entries={summary.cpa} />
              <MoneyKpi label="Conversion value" entries={summary.value} />
            </div>
            <p style={{ margin: '8px 0 0', fontSize: 'var(--sa-fs-small)', color: 'var(--sa-text-muted)' }}>
              {metrics.status === 'loading'
                ? 'Loading day rows…'
                : summary.days === 0
                  ? `No day rows between ${from || 'the beginning'} and ${to || 'today'}. CTR, CPC and CPA need spend rows to divide.`
                  : `From ${formatInt(summary.days)} day row(s) between ${from} and ${to}${campaignFilter ? ', one campaign' : ''}. ${formatInt(summary.handEntered)} entered by hand. CPC and CPA are spend ÷ clicks and spend ÷ conversions, rounded to the minor unit.`}
              {metrics.next && ' More rows match than were loaded — narrow the date range for a complete total.'}
            </p>
          </section>

          {/* ── Tabs ───────────────────────────────────────────────────── */}
          <div className="sa-tabs" role="tablist" aria-label="Adverts sections" style={{ marginTop: 16 }}>
            {[
              ['metrics', 'Daily metrics', metrics.status === 'ready' ? metrics.total : null],
              ['campaigns', 'Ad campaigns', adCampaigns.status === 'ready' ? adCampaigns.total : null],
              ['accounts', 'Ad accounts', accounts.status === 'ready' ? accounts.total : null],
            ].map(([id, text, count]) => (
              <button key={id} type="button" role="tab" id={`adv-tab-${id}`}
                aria-selected={tab === id} aria-controls={`adv-panel-${id}`}
                className={`sa-tab${tab === id ? ' is-active' : ''}`} onClick={() => setTab(id)}>
                {text}
                {count !== null && <span className="sa-badge">{formatInt(count)}</span>}
              </button>
            ))}
          </div>

          {tab === 'metrics' && (
            <div role="tabpanel" id="adv-panel-metrics" aria-labelledby="adv-tab-metrics">
              <div className="sa-toolbar" style={{ marginTop: 12 }}>
                <label htmlFor="adv-from" style={{ fontSize: 'var(--sa-fs-small)', color: 'var(--sa-text-muted)' }}>From</label>
                <input id="adv-from" type="date" className="sa-input" value={from} onChange={e => setFrom(e.target.value)} />
                <label htmlFor="adv-to" style={{ fontSize: 'var(--sa-fs-small)', color: 'var(--sa-text-muted)' }}>to</label>
                <input id="adv-to" type="date" className="sa-input" value={to} onChange={e => setTo(e.target.value)} />
                <label className="sa-sr-only" htmlFor="adv-camp">Filter by ad campaign</label>
                <select id="adv-camp" className="sa-select" value={campaignFilter} onChange={e => setCampaignFilter(e.target.value)}>
                  <option value="">All ad campaigns</option>
                  {adCampaigns.rows.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <span className="sa-toolbar-spacer" />
                <span className="sa-toolbar-count">
                  {metrics.status === 'ready' ? `${formatInt(metrics.rows.length)} of ${formatInt(metrics.total)}` : ' '}
                </span>
              </div>

              {metrics.status === 'loading' && <div style={{ marginTop: 12 }}><ConsoleSkeleton rows={6} label="Loading daily metrics…" /></div>}
              {metrics.status === 'error' && !metrics.error?.notLive && (
                <div style={{ marginTop: 12 }}><ConsoleErrorPanel error={metrics.error} onRetry={metrics.reload} /></div>
              )}
              {metrics.status === 'ready' && !metrics.rows.length && (
                <ConsoleEmpty
                  icon="table_rows"
                  title="No spend recorded for these dates"
                  hint={
                    <p>
                      One row per ad campaign per day, holding impressions, clicks, spend, conversions and
                      conversion value. Rows arrive from a provider sync that is not connected yet, or from
                      “Enter metrics”, which upserts on (campaign, date) so re-entering a day corrects it.
                    </p>
                  }
                  action={canEnterMetrics
                    ? <button type="button" className="sa-btn sa-btn-primary" onClick={() => setMetricsForm({})}>Enter metrics</button>
                    : undefined}
                />
              )}
              {metrics.status === 'ready' && metrics.rows.length > 0 && (
                <div className="sa-table-wrap" style={{ marginTop: 12 }}>
                  <table className="sa-table">
                    <caption className="sa-sr-only">Daily advert metrics, sortable by column</caption>
                    <thead>
                      <tr>
                        <SortTh label="Date" col="date" sort={metricSort} onSort={setMetricSort} />
                        <th scope="col">Ad campaign</th>
                        <SortTh label="Impressions" col="impressions" sort={metricSort} onSort={setMetricSort} align="right" />
                        <SortTh label="Clicks" col="clicks" sort={metricSort} onSort={setMetricSort} align="right" />
                        <th scope="col" style={{ textAlign: 'right' }}>CTR</th>
                        <SortTh label="Spend" col="spend_minor" sort={metricSort} onSort={setMetricSort} align="right" />
                        <th scope="col" style={{ textAlign: 'right' }}>CPC</th>
                        <SortTh label="Conv." col="conversions" sort={metricSort} onSort={setMetricSort} align="right" />
                        <th scope="col" style={{ textAlign: 'right' }}>CPA</th>
                        <th scope="col" style={{ textAlign: 'right' }}>Conv. value</th>
                        <th scope="col">Source</th>
                        <th scope="col" style={{ textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {metrics.rows.map(r => {
                        const ccy = r.currency || 'PLN'
                        const cpc = perUnitMinor(r.spend_minor, r.clicks)
                        const cpa = perUnitMinor(r.spend_minor, r.conversions)
                        return (
                          <tr key={r.id}>
                            <td className="sa-num">{r.date}</td>
                            <td>{adCampaignById.get(r.ad_campaign_id)?.name
                              || <span style={{ color: 'var(--sa-text-muted)' }}>#{r.ad_campaign_id}</span>}</td>
                            <td className="sa-num">{formatInt(r.impressions)}</td>
                            <td className="sa-num">{formatInt(r.clicks)}</td>
                            <td className="sa-num">{r.impressions ? formatRatioPct(r.clicks, r.impressions) : DASH}</td>
                            <td className="sa-num">{formatMinor(r.spend_minor, ccy)}</td>
                            <td className="sa-num">{cpc === null ? DASH : formatMinor(cpc, ccy)}</td>
                            <td className="sa-num">{formatInt(r.conversions)}</td>
                            <td className="sa-num">{cpa === null ? DASH : formatMinor(cpa, ccy)}</td>
                            <td className="sa-num">{formatMinor(r.conversion_value_minor, ccy)}</td>
                            <td><Pill label={label(r.source)} tone={SOURCE_TONE[r.source] || 'neutral'} /></td>
                            <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                              <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" onClick={() => setMetricsForm(r)}>
                                Edit
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  <LoadMore next={metrics.next} loading={metrics.loadingMore} onLoadMore={metrics.loadMore}
                    shown={metrics.rows.length} total={metrics.total} />
                </div>
              )}
            </div>
          )}

          {tab === 'campaigns' && (
            <div role="tabpanel" id="adv-panel-campaigns" aria-labelledby="adv-tab-campaigns">
              <div className="sa-toolbar" style={{ marginTop: 12 }}>
                <span className="sa-toolbar-count">
                  {adCampaigns.status === 'ready' ? `${formatInt(adCampaigns.total)} ad campaign(s)` : ' '}
                </span>
                <span className="sa-toolbar-spacer" />
                <button type="button" className="sa-btn sa-btn-ghost" onClick={() => setAdCampaignForm({})}
                  disabled={accounts.status !== 'ready' || !accounts.rows.length}
                  title={accounts.rows.length ? undefined : 'Record an ad account first — an ad campaign belongs to one.'}>
                  <span className="material-symbols-outlined" aria-hidden="true">add</span>
                  Add ad campaign
                </button>
              </div>
              {adCampaigns.status === 'loading' && <div style={{ marginTop: 12 }}><ConsoleSkeleton rows={4} label="Loading ad campaigns…" /></div>}
              {adCampaigns.status === 'error' && !adCampaigns.error?.notLive && (
                <div style={{ marginTop: 12 }}><ConsoleErrorPanel error={adCampaigns.error} onRetry={adCampaigns.reload} /></div>
              )}
              {adCampaigns.status === 'ready' && !adCampaigns.rows.length && (
                <ConsoleEmpty
                  icon="ad_units"
                  title="No ad campaigns yet"
                  hint={
                    <p>
                      An ad campaign is one campaign inside a provider account, identified by the provider's
                      own id. Link it to a Growth → Campaigns row and the money spent lines up with the plan
                      it was spent against.
                    </p>
                  }
                />
              )}
              {adCampaigns.status === 'ready' && adCampaigns.rows.length > 0 && (
                <div className="sa-table-wrap" style={{ marginTop: 12 }}>
                  <table className="sa-table">
                    <thead>
                      <tr>
                        <th scope="col">Ad campaign</th>
                        <th scope="col">Account</th>
                        <th scope="col">Linked campaign</th>
                        <th scope="col">Objective</th>
                        <th scope="col">Status</th>
                        <th scope="col" style={{ textAlign: 'right' }}>Daily budget</th>
                        <th scope="col">Runs</th>
                        <th scope="col" style={{ textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {adCampaigns.rows.map(r => (
                        <tr key={r.id}>
                          <td>
                            <span style={{ fontWeight: 600 }}>{r.name}</span>
                            <div style={{ fontSize: 'var(--sa-fs-micro)', color: 'var(--sa-text-muted)' }}>{r.external_id}</div>
                          </td>
                          <td>{accountById.get(r.ad_account_id)?.name || <span style={{ color: 'var(--sa-text-muted)' }}>#{r.ad_account_id}</span>}</td>
                          <td>{campaignById.get(r.campaign_id)?.name || <span style={{ color: 'var(--sa-text-muted)' }}>{DASH}</span>}</td>
                          <td>{r.objective || <span style={{ color: 'var(--sa-text-muted)' }}>{DASH}</span>}</td>
                          <td><Pill label={label(r.status)} tone={AD_CAMPAIGN_TONE[r.status] || 'neutral'} /></td>
                          <td className="sa-num">{formatMinor(r.daily_budget_minor, r.currency)}</td>
                          <td className="sa-num">{r.start_date || DASH} → {r.end_date || DASH}</td>
                          <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" onClick={() => setAdCampaignForm(r)}>Edit</button>
                            <button type="button" className="sa-btn sa-btn-danger sa-btn-sm" style={{ marginLeft: 6 }}
                              onClick={() => setConfirming({
                                entity: ENTITY.adCampaigns, id: r.id, title: 'Delete ad campaign',
                                body: `“${r.name}” will be soft-deleted. Its recorded day rows stay in the database.`,
                              })}>
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <LoadMore next={adCampaigns.next} loading={adCampaigns.loadingMore} onLoadMore={adCampaigns.loadMore}
                    shown={adCampaigns.rows.length} total={adCampaigns.total} />
                </div>
              )}
            </div>
          )}

          {tab === 'accounts' && (
            <div role="tabpanel" id="adv-panel-accounts" aria-labelledby="adv-tab-accounts">
              <div className="sa-toolbar" style={{ marginTop: 12 }}>
                <span className="sa-toolbar-count">
                  {accounts.status === 'ready' ? `${formatInt(accounts.total)} account(s)` : ' '}
                </span>
                <span className="sa-toolbar-spacer" />
                <button type="button" className="sa-btn sa-btn-ghost" onClick={() => setAccountForm({})}>
                  <span className="material-symbols-outlined" aria-hidden="true">add</span>
                  Record ad account
                </button>
              </div>
              {accounts.status === 'loading' && <div style={{ marginTop: 12 }}><ConsoleSkeleton rows={3} label="Loading ad accounts…" /></div>}
              {accounts.status === 'ready' && accounts.rows.length > 0 && (
                <div className="sa-table-wrap" style={{ marginTop: 12 }}>
                  <table className="sa-table">
                    <thead>
                      <tr>
                        <th scope="col">Account</th>
                        <th scope="col">Provider</th>
                        <th scope="col">External id</th>
                        <th scope="col">Currency</th>
                        <th scope="col">Status</th>
                        <th scope="col">Last synced</th>
                        <th scope="col" style={{ textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {accounts.rows.map(r => (
                        <tr key={r.id}>
                          <td style={{ fontWeight: 600 }}>{r.name}</td>
                          <td><Pill label={label(r.provider)} tone="neutral" /></td>
                          <td className="sa-num">{r.external_id}</td>
                          <td>{r.currency}{r.country ? ` · ${r.country}` : ''}</td>
                          <td>
                            <Pill label={label(r.status)} tone={ACCOUNT_TONE[r.status] || 'neutral'} />
                            {r.last_error && (
                              <div style={{ fontSize: 'var(--sa-fs-micro)', color: 'var(--sa-bad)' }}>{r.last_error}</div>
                            )}
                          </td>
                          <td className="sa-num">
                            {r.last_synced_at ? formatEpoch(r.last_synced_at)
                              : <span style={{ color: 'var(--sa-text-muted)' }}>never</span>}
                          </td>
                          <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" onClick={() => setAccountForm(r)}>Edit</button>
                            <button type="button" className="sa-btn sa-btn-danger sa-btn-sm" style={{ marginLeft: 6 }}
                              onClick={() => setConfirming({
                                entity: ENTITY.adAccounts, id: r.id, title: 'Delete ad account',
                                body: `“${r.name}” will be soft-deleted. Its ad campaigns and their day rows stay in the database.`,
                              })}>
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <LoadMore next={accounts.next} loading={accounts.loadingMore} onLoadMore={accounts.loadMore}
                    shown={accounts.rows.length} total={accounts.total} />
                </div>
              )}
            </div>
          )}
        </>
      )}

      {accountForm && (
        <AdAccountForm row={accountForm.id ? accountForm : null} onClose={() => setAccountForm(null)}
          onSaved={() => { setAccountForm(null); accounts.reload() }} />
      )}
      {adCampaignForm && (
        <AdCampaignForm row={adCampaignForm.id ? adCampaignForm : null} accounts={accounts.rows}
          campaigns={campaigns.rows} onClose={() => setAdCampaignForm(null)}
          onSaved={() => { setAdCampaignForm(null); adCampaigns.reload() }} />
      )}
      {metricsForm && (
        <MetricsForm row={metricsForm.id ? metricsForm : null} adCampaigns={adCampaigns.rows}
          onClose={() => setMetricsForm(null)} onSaved={() => { setMetricsForm(null); metrics.reload() }} />
      )}
      {confirming && (
        <ConfirmModal title={confirming.title} body={confirming.body} busy={rowBusy}
          onConfirm={destroy} onClose={() => setConfirming(null)} />
      )}
    </>
  )
}

// ── KPI tiles ────────────────────────────────────────────────────────────────

function Kpi({ label: text, value }) {
  return (
    <div className="sa-kpi">
      <span className="sa-kpi-label">{text}</span>
      <span className="sa-kpi-value">{value}</span>
    </div>
  )
}

// Money is never summed across currencies. Each currency present gets its own
// line; one currency is the normal case and reads as a plain figure.
function MoneyKpi({ label: text, entries }) {
  const real = (entries || []).filter(([, v]) => v !== null && v !== undefined)
  return (
    <div className="sa-kpi">
      <span className="sa-kpi-label">{text}</span>
      {!real.length && <span className="sa-kpi-value">{DASH}</span>}
      {real.map(([ccy, minor], i) => (
        i === 0
          ? <span key={ccy} className="sa-kpi-value">{formatMinor(minor, ccy)}</span>
          : <span key={ccy} className="sa-num" style={{ fontSize: 'var(--sa-fs-small)', color: 'var(--sa-text-muted)' }}>
            {formatMinor(minor, ccy)}
          </span>
      ))}
    </div>
  )
}

// ── forms ────────────────────────────────────────────────────────────────────

function AdAccountForm({ row, onClose, onSaved }) {
  const [form, setForm] = useState(() => ({
    provider: row?.provider || 'google_ads',
    external_id: row?.external_id || '',
    name: row?.name || '',
    currency: row?.currency || 'PLN',
    country: row?.country || 'PL',
    timezone: row?.timezone || 'Europe/Warsaw',
    status: row?.status || 'active',
  }))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function submit(e) {
    e.preventDefault()
    setError(null)
    const country = form.country.trim().toUpperCase()
    if (country && country.length !== 2) {
      setError(new Error('Country must be a two-letter code, for example PL.'))
      return
    }
    const payload = {
      provider: form.provider,
      external_id: form.external_id.trim(),
      name: form.name.trim(),
      currency: form.currency,
      country: country || null,
      timezone: nullIfBlank(form.timezone),
      status: form.status,
    }
    setBusy(true)
    try {
      if (row) await bizUpdate(ENTITY.adAccounts, row.id, payload)
      else await bizCreate(ENTITY.adAccounts, payload)
      onSaved()
    } catch (e) { setError(e) } finally { setBusy(false) }
  }

  return (
    <Modal
      title={row ? `Edit ad account · ${row.name}` : 'Record ad account'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="sa-btn sa-btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" form="ad-account-form" className="sa-btn sa-btn-primary" disabled={busy}>
            {busy ? 'Saving…' : row ? 'Save changes' : 'Record account'}
          </button>
        </>
      }
    >
      <form id="ad-account-form" onSubmit={submit}>
        <FormError error={error} />
        <p style={{ margin: '0 0 10px', color: 'var(--sa-text-muted)', lineHeight: 1.55 }}>
          This records that the account exists and what currency it bills in. It does not connect it:
          no credential is stored here and none reaches the browser.
        </p>
        <Field label="Provider" htmlFor="aa-provider" required>
          <select id="aa-provider" className="sa-select" value={form.provider} onChange={e => set('provider', e.target.value)}>
            {PROVIDERS.map(p => <option key={p} value={p}>{label(p)}</option>)}
          </select>
        </Field>
        <Field label="Account name" htmlFor="aa-name" required>
          <input id="aa-name" className="sa-input" required value={form.name} onChange={e => set('name', e.target.value)}
            placeholder="English Metro — Google Ads" />
        </Field>
        <Field label="External id" htmlFor="aa-ext" required hint="The provider's own id: a Google customer id like 123-456-7890, or a Meta act_… id.">
          <input id="aa-ext" className="sa-input" required value={form.external_id}
            onChange={e => set('external_id', e.target.value)} />
        </Field>
        <Field label="Billing currency" htmlFor="aa-ccy" required>
          <div style={{ display: 'flex', gap: 8 }}>
            <select id="aa-ccy" className="sa-select" value={form.currency} onChange={e => set('currency', e.target.value)}
              style={{ width: 110, flex: '0 0 auto' }}>
              {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <label className="sa-sr-only" htmlFor="aa-country">Country</label>
            <input id="aa-country" className="sa-input" maxLength={2} value={form.country}
              onChange={e => set('country', e.target.value.toUpperCase())} placeholder="PL"
              style={{ width: 80, flex: '0 0 auto' }} />
            <label className="sa-sr-only" htmlFor="aa-tz">Timezone</label>
            <input id="aa-tz" className="sa-input" value={form.timezone} onChange={e => set('timezone', e.target.value)}
              placeholder="Europe/Warsaw" />
          </div>
        </Field>
        <Field label="Status" htmlFor="aa-status" required>
          <select id="aa-status" className="sa-select" value={form.status} onChange={e => set('status', e.target.value)}>
            {ACCOUNT_STATUSES.map(s => <option key={s} value={s}>{label(s)}</option>)}
          </select>
        </Field>
      </form>
    </Modal>
  )
}

function AdCampaignForm({ row, accounts, campaigns, onClose, onSaved }) {
  const [form, setForm] = useState(() => ({
    ad_account_id: row?.ad_account_id ? String(row.ad_account_id) : (accounts[0]?.id ? String(accounts[0].id) : ''),
    external_id: row?.external_id || '',
    campaign_id: row?.campaign_id ? String(row.campaign_id) : '',
    name: row?.name || '',
    objective: row?.objective || '',
    status: row?.status || 'active',
    daily_budget: minorToInput(row?.daily_budget_minor),
    currency: row?.currency || accounts[0]?.currency || 'PLN',
    country: row?.country || 'PL',
    start_date: row?.start_date || '',
    end_date: row?.end_date || '',
  }))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function submit(e) {
    e.preventDefault()
    setError(null)
    if (!form.ad_account_id) {
      setError(new Error('Pick the ad account this campaign belongs to.'))
      return
    }
    const budget = parseMinor(form.daily_budget)
    if (Number.isNaN(budget)) {
      setError(new Error('Daily budget must be an amount like 120,00.'))
      return
    }
    if (form.start_date && form.end_date && form.end_date < form.start_date) {
      setError(new Error('The end date is before the start date.'))
      return
    }
    const country = form.country.trim().toUpperCase()
    const payload = {
      ad_account_id: Number(form.ad_account_id),
      external_id: form.external_id.trim(),
      campaign_id: form.campaign_id ? Number(form.campaign_id) : null,
      name: form.name.trim(),
      objective: nullIfBlank(form.objective),
      status: form.status,
      daily_budget_minor: budget,
      currency: form.currency,
      country: country.length === 2 ? country : null,
      start_date: nullIfBlank(form.start_date),
      end_date: nullIfBlank(form.end_date),
    }
    setBusy(true)
    try {
      if (row) await bizUpdate(ENTITY.adCampaigns, row.id, payload)
      else await bizCreate(ENTITY.adCampaigns, payload)
      onSaved()
    } catch (e) { setError(e) } finally { setBusy(false) }
  }

  return (
    <Modal
      title={row ? `Edit ad campaign · ${row.name}` : 'Add ad campaign'}
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className="sa-btn sa-btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" form="ad-campaign-form" className="sa-btn sa-btn-primary" disabled={busy}>
            {busy ? 'Saving…' : row ? 'Save changes' : 'Add ad campaign'}
          </button>
        </>
      }
    >
      <form id="ad-campaign-form" onSubmit={submit}>
        <FormError error={error} />
        <Field label="Ad account" htmlFor="ac-account" required>
          <select id="ac-account" className="sa-select" value={form.ad_account_id}
            onChange={e => set('ad_account_id', e.target.value)} required>
            <option value="">— pick an account —</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name} ({label(a.provider)})</option>)}
          </select>
        </Field>
        <Field label="Name" htmlFor="ac-name" required>
          <input id="ac-name" className="sa-input" required value={form.name} onChange={e => set('name', e.target.value)} />
        </Field>
        <Field label="External id" htmlFor="ac-ext" required hint="The provider's campaign id. Unique per account, and what a future sync matches on.">
          <input id="ac-ext" className="sa-input" required value={form.external_id}
            onChange={e => set('external_id', e.target.value)} />
        </Field>
        <Field label="Linked campaign" htmlFor="ac-camp" hint="Optional. Ties this ad campaign to a row in Growth → Campaigns.">
          <select id="ac-camp" className="sa-select" value={form.campaign_id} onChange={e => set('campaign_id', e.target.value)}>
            <option value="">— none —</option>
            {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Objective" htmlFor="ac-obj">
          <input id="ac-obj" className="sa-input" value={form.objective} onChange={e => set('objective', e.target.value)}
            placeholder="leads / traffic / conversions" />
        </Field>
        <Field label="Status" htmlFor="ac-status" required>
          <select id="ac-status" className="sa-select" value={form.status} onChange={e => set('status', e.target.value)}>
            {AD_CAMPAIGN_STATUSES.map(s => <option key={s} value={s}>{label(s)}</option>)}
          </select>
        </Field>
        <Field label="Daily budget" htmlFor="ac-budget" hint="Stored as integer minor units. Blank when the campaign has no daily cap.">
          <div style={{ display: 'flex', gap: 8 }}>
            <input id="ac-budget" className="sa-input" inputMode="decimal" value={form.daily_budget}
              onChange={e => set('daily_budget', e.target.value)} placeholder="0,00" />
            <label className="sa-sr-only" htmlFor="ac-ccy">Currency</label>
            <select id="ac-ccy" className="sa-select" value={form.currency} onChange={e => set('currency', e.target.value)}
              style={{ width: 96, flex: '0 0 auto' }}>
              {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <label className="sa-sr-only" htmlFor="ac-country">Country</label>
            <input id="ac-country" className="sa-input" maxLength={2} value={form.country}
              onChange={e => set('country', e.target.value.toUpperCase())} placeholder="PL"
              style={{ width: 80, flex: '0 0 auto' }} />
          </div>
        </Field>
        <Field label="Runs" htmlFor="ac-start">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input id="ac-start" type="date" className="sa-input" value={form.start_date}
              onChange={e => set('start_date', e.target.value)} aria-label="Start date" />
            <span style={{ color: 'var(--sa-text-muted)' }}>to</span>
            <input type="date" className="sa-input" value={form.end_date}
              onChange={e => set('end_date', e.target.value)} aria-label="End date" />
          </div>
        </Field>
      </form>
    </Modal>
  )
}

// Manual entry / paste import. Both paths end at the same idempotent upsert, so
// entering a day twice corrects it rather than doubling the spend.
const PASTE_COLUMNS = 'date, impressions, clicks, spend, conversions, conversion value'

function parsePasted(text, adCampaignId, currency) {
  const rows = []
  const errors = []
  const lines = String(text).split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  lines.forEach((line, i) => {
    if (i === 0 && /^date\b/i.test(line)) return                 // header line
    const cells = line.split(/[,;\t]/).map(c => c.trim())
    const [date, impressions, clicks, spend, conversions, value] = cells
    const lineNo = i + 1
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) {
      errors.push(`line ${lineNo}: “${cells[0] || ''}” is not a date in YYYY-MM-DD form`)
      return
    }
    const int = (v, name) => {
      if (v === undefined || v === '') return 0
      if (!/^\d+$/.test(v)) { errors.push(`line ${lineNo}: ${name} “${v}” is not a whole number`); return 0 }
      return Number(v)
    }
    const money = (v, name) => {
      if (v === undefined || v === '') return 0
      const m = parseMinor(v)
      if (m === null || Number.isNaN(m) || m < 0) { errors.push(`line ${lineNo}: ${name} “${v}” is not an amount`); return 0 }
      return m
    }
    rows.push({
      ad_campaign_id: adCampaignId,
      date,
      impressions: int(impressions, 'impressions'),
      clicks: int(clicks, 'clicks'),
      spend_minor: money(spend, 'spend'),
      currency,
      conversions: int(conversions, 'conversions'),
      conversion_value_minor: money(value, 'conversion value'),
      source: 'import',
    })
  })
  return { rows, errors }
}

function MetricsForm({ row, adCampaigns, onClose, onSaved }) {
  const [mode, setMode] = useState('single')
  const [form, setForm] = useState(() => ({
    ad_campaign_id: row?.ad_campaign_id ? String(row.ad_campaign_id) : (adCampaigns[0]?.id ? String(adCampaigns[0].id) : ''),
    date: row?.date || todayISO(),
    impressions: row ? String(row.impressions ?? 0) : '',
    clicks: row ? String(row.clicks ?? 0) : '',
    spend: minorToInput(row?.spend_minor),
    currency: row?.currency || adCampaigns[0]?.currency || 'PLN',
    conversions: row ? String(row.conversions ?? 0) : '',
    conversion_value: minorToInput(row?.conversion_value_minor),
    video_views: row?.video_views === null || row?.video_views === undefined ? '' : String(row.video_views),
    source: row?.source && row.source !== 'api' ? row.source : 'manual',
  }))
  const [pasted, setPasted] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const int = (text, name) => {
    const raw = String(text ?? '').trim()
    if (!raw) return 0
    if (!/^\d+$/.test(raw)) throw new Error(`${name} must be a whole number of 0 or more.`)
    return Number(raw)
  }

  async function submit(e) {
    e.preventDefault()
    setError(null)
    setResult(null)
    if (!form.ad_campaign_id) {
      setError(new Error('Pick the ad campaign these numbers belong to.'))
      return
    }
    let rows
    try {
      if (mode === 'paste') {
        const parsed = parsePasted(pasted, Number(form.ad_campaign_id), form.currency)
        if (parsed.errors.length) {
          setError(new Error(parsed.errors.slice(0, 6).join(' · ')))
          return
        }
        if (!parsed.rows.length) {
          setError(new Error('Nothing to import — paste one line per day.'))
          return
        }
        rows = parsed.rows
      } else {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) {
          setError(new Error('Pick the day these numbers cover.'))
          return
        }
        const spend = parseMinor(form.spend)
        const value = parseMinor(form.conversion_value)
        if (Number.isNaN(spend) || Number.isNaN(value)) {
          setError(new Error('Spend and conversion value must be amounts like 123,45.'))
          return
        }
        rows = [{
          ad_campaign_id: Number(form.ad_campaign_id),
          date: form.date,
          impressions: int(form.impressions, 'Impressions'),
          clicks: int(form.clicks, 'Clicks'),
          spend_minor: spend === null ? 0 : spend,
          currency: form.currency,
          conversions: int(form.conversions, 'Conversions'),
          conversion_value_minor: value === null ? 0 : value,
          video_views: form.video_views.trim() === '' ? null : int(form.video_views, 'Video views'),
          source: form.source,
        }]
      }
    } catch (e) { setError(e); return }

    setBusy(true)
    try {
      const written = await bizUpsertAdMetrics(rows)
      setResult(Number(written?.written ?? written?.rows ?? rows.length))
      onSaved()
    } catch (e) { setError(e) } finally { setBusy(false) }
  }

  return (
    <Modal
      title={row ? `Edit day · ${row.date}` : 'Enter advert metrics'}
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className="sa-btn sa-btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" form="metrics-form" className="sa-btn sa-btn-primary" disabled={busy}>
            {busy ? 'Saving…' : mode === 'paste' ? 'Import rows' : 'Save day'}
          </button>
        </>
      }
    >
      <form id="metrics-form" onSubmit={submit}>
        <FormError error={error} />
        {result !== null && (
          <p role="status" style={{ margin: '0 0 10px', color: 'var(--sa-good)', fontWeight: 600 }}>
            {formatInt(result)} day row(s) written.
          </p>
        )}
        <p style={{ margin: '0 0 10px', color: 'var(--sa-text-muted)', lineHeight: 1.55 }}>
          Read these off the provider's own dashboard. One row per campaign per day; entering the same
          day again corrects it instead of adding to it.
        </p>

        <Field label="Ad campaign" htmlFor="mf-camp" required>
          <select id="mf-camp" className="sa-select" value={form.ad_campaign_id}
            onChange={e => set('ad_campaign_id', e.target.value)} required disabled={Boolean(row)}>
            <option value="">— pick an ad campaign —</option>
            {adCampaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>

        {!row && (
          <Field label="Entry mode" htmlFor="mf-mode-single">
            <div style={{ display: 'flex', gap: 14 }}>
              <label className="sa-checkbox">
                <input id="mf-mode-single" type="radio" name="mf-mode" checked={mode === 'single'}
                  onChange={() => setMode('single')} />
                One day
              </label>
              <label className="sa-checkbox">
                <input type="radio" name="mf-mode" checked={mode === 'paste'} onChange={() => setMode('paste')} />
                Paste several days
              </label>
            </div>
          </Field>
        )}

        {mode === 'single' || row ? (
          <>
            <Field label="Day" htmlFor="mf-date" required>
              <input id="mf-date" type="date" className="sa-input" value={form.date} required
                onChange={e => set('date', e.target.value)} disabled={Boolean(row)} style={{ maxWidth: 200 }} />
            </Field>
            <Field label="Impressions" htmlFor="mf-impr">
              <input id="mf-impr" className="sa-input" inputMode="numeric" value={form.impressions}
                onChange={e => set('impressions', e.target.value)} placeholder="0" style={{ maxWidth: 200 }} />
            </Field>
            <Field label="Clicks" htmlFor="mf-clicks">
              <input id="mf-clicks" className="sa-input" inputMode="numeric" value={form.clicks}
                onChange={e => set('clicks', e.target.value)} placeholder="0" style={{ maxWidth: 200 }} />
            </Field>
            <Field label="Spend" htmlFor="mf-spend" hint="Stored as integer minor units in the currency the account bills in.">
              <div style={{ display: 'flex', gap: 8 }}>
                <input id="mf-spend" className="sa-input" inputMode="decimal" value={form.spend}
                  onChange={e => set('spend', e.target.value)} placeholder="0,00" style={{ maxWidth: 200 }} />
                <label className="sa-sr-only" htmlFor="mf-ccy">Currency</label>
                <select id="mf-ccy" className="sa-select" value={form.currency}
                  onChange={e => set('currency', e.target.value)} style={{ width: 96, flex: '0 0 auto' }}>
                  {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </Field>
            <Field label="Conversions" htmlFor="mf-conv">
              <input id="mf-conv" className="sa-input" inputMode="numeric" value={form.conversions}
                onChange={e => set('conversions', e.target.value)} placeholder="0" style={{ maxWidth: 200 }} />
            </Field>
            <Field label="Conversion value" htmlFor="mf-value">
              <input id="mf-value" className="sa-input" inputMode="decimal" value={form.conversion_value}
                onChange={e => set('conversion_value', e.target.value)} placeholder="0,00" style={{ maxWidth: 200 }} />
            </Field>
            <Field label="Video views" htmlFor="mf-views" hint="Leave blank when the channel has no video.">
              <input id="mf-views" className="sa-input" inputMode="numeric" value={form.video_views}
                onChange={e => set('video_views', e.target.value)} style={{ maxWidth: 200 }} />
            </Field>
            <Field label="Provenance" htmlFor="mf-source" required>
              <select id="mf-source" className="sa-select" value={form.source} onChange={e => set('source', e.target.value)}>
                {METRIC_SOURCES.map(s => (
                  <option key={s} value={s} disabled={s === 'api'}>
                    {s === 'api' ? 'api — written by a provider sync only' : s}
                  </option>
                ))}
              </select>
            </Field>
          </>
        ) : (
          <Field label="Rows" htmlFor="mf-paste" hint={`One line per day: ${PASTE_COLUMNS}. Comma, semicolon or tab separated. A first line starting with “date” is treated as a header. Amounts use the currency picked above.`}>
            <>
              <textarea id="mf-paste" className="sa-input sa-textarea" value={pasted}
                onChange={e => setPasted(e.target.value)} spellCheck={false}
                placeholder={'2026-07-01,1240,38,152,50,2,0\n2026-07-02,1310,41,168,00,3,0'} />
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <label className="sa-sr-only" htmlFor="mf-paste-ccy">Currency for pasted amounts</label>
                <select id="mf-paste-ccy" className="sa-select" value={form.currency}
                  onChange={e => set('currency', e.target.value)} style={{ width: 110 }}>
                  {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </>
          </Field>
        )}
      </form>
    </Modal>
  )
}
