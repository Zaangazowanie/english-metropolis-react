// ConsoleIntegrations — System → Integrations.
//
// An honest status board. Every row is either the result of a live probe run
// when the screen loads, or a plainly-labelled statement of fact about
// something that is not connected. Nothing is asserted that was not checked,
// and nothing that is missing is dressed up as "coming soon".
//
// Probes, all of them real requests made from this screen:
//   Convex            admin:getSession through the admin proxy
//   Console API       GET /api/console/health
//   Business API      GET /api/console/biz/pages?limit=1
//   Mail              GET /api/console/mail/mailboxes
//   YouGlish / TTS    GET /api/console/pipelines -> services[]
//   Ad accounts       GET /api/console/biz/ad_accounts  (0 rows = not connected)
//
// Google Ads and Meta are NOT connected and there is no probe that could make
// them so; the row says what connecting would actually require.

import { useCallback, useEffect, useState } from 'react'
import { queryAdminConvex } from '../../../contexts/AdminAuthContext.jsx'
import { consoleGet } from './consoleApi.js'
import { ConsoleErrorPanel } from './ConsoleStates.jsx'
import { bizList, fmtMillis, fmtStamp } from './bizRest.jsx'

// Five states, and only five. "unknown" is what a failed probe gets — never a
// guess in either direction.
const STATE = {
  live: { label: 'Live', cls: 'sa-badge-committed' },
  read_only: { label: 'Read-only', cls: 'sa-badge-processing' },
  not_connected: { label: 'Not connected', cls: 'sa-badge-queued' },
  unconfigured: { label: 'Not live yet', cls: 'sa-badge-awaiting_review' },
  down: { label: 'Down', cls: 'sa-badge-failed' },
  unknown: { label: 'Unknown', cls: 'sa-badge-queued' },
}

const describeError = e =>
  e?.notLive ? 'endpoint answered 404 — not mounted on em-console-api yet'
    : e?.denied ? 'refused this admin session (401/403)'
      : e?.message || String(e)

async function probeConvex() {
  const base = {
    name: 'Convex — wooden-manatee-881',
    group: 'Teaching data',
    purpose: 'Students, lessons, groups, bookings, curriculum. The teaching side of the console reads and writes here.',
    requires: 'Already connected. Writes go through the admin proxy with the operator session; the deployment key never reaches the browser.',
  }
  try {
    // getSession answers the user row itself, or null for an invalid session.
    const user = await queryAdminConvex('admin:getSession', {})
    return {
      ...base,
      state: user ? 'live' : 'unknown',
      evidence: user
        ? `admin:getSession answered for ${user.email} (role ${user.role})`
        : 'admin:getSession answered, but this admin session is not valid',
    }
  } catch (e) {
    return { ...base, state: 'down', evidence: `admin:getSession failed — ${describeError(e)}` }
  }
}

async function probeConsoleApi() {
  const base = {
    name: 'em-console-api',
    group: 'Console backend',
    purpose: 'Course library, ingestion, pipelines and the business REST surface. Runs on :8811 behind nginx at /api/console/.',
    requires: 'Already connected. Auth is the same admin bearer token, verified against Convex.',
  }
  try {
    const health = await consoleGet('/api/console/health')
    return {
      ...base,
      state: health?.ok ? 'live' : 'down',
      evidence: `/api/console/health answered ok=${String(!!health?.ok)}${health?.decks ? `, ${health.decks} decks indexed` : ''}`,
    }
  } catch (e) {
    return { ...base, state: 'down', evidence: `/api/console/health failed — ${describeError(e)}` }
  }
}

async function probeBusinessApi() {
  const base = {
    name: 'Business store (em-business.db)',
    group: 'Console backend',
    purpose: 'CRM, growth, website, finance and people tables. Serves /api/console/biz/<entity>.',
    requires: 'Nothing external. The tables ship empty on purpose; operators fill them from the console screens.',
  }
  try {
    const res = await bizList('pages', { limit: 1 })
    return {
      ...base,
      state: 'live',
      evidence: `/api/console/biz/pages answered — ${res?.total ?? 0} page row(s) stored`,
    }
  } catch (e) {
    return {
      ...base,
      state: e?.notLive ? 'unconfigured' : 'down',
      evidence: `/api/console/biz/pages — ${describeError(e)}`,
    }
  }
}

async function probeMail() {
  const base = {
    name: 'EM mail (Postfix / Dovecot)',
    group: 'Comms',
    purpose: 'The four @englishmetro.com mailboxes: mike, support, hello, michael.poncana. Read server-side only.',
    requires: 'Reading is allowlisted in code. SENDING IS DISABLED and stays disabled until Mike enables it; all ten mailboxes on this box share one password across five unrelated businesses, so no credential ever reaches the browser.',
  }
  try {
    const res = await consoleGet('/api/console/mail/mailboxes')
    const n = (res?.mailboxes || res?.rows || []).length
    return {
      ...base,
      state: 'read_only',
      evidence: `/api/console/mail/mailboxes answered${n ? ` with ${n} mailbox(es)` : ''}; send path disabled`,
    }
  } catch (e) {
    return {
      ...base,
      state: e?.notLive ? 'unconfigured' : 'down',
      evidence: `/api/console/mail/mailboxes — ${describeError(e)}`,
    }
  }
}

// YouGlish and TTS are local services; /api/console/pipelines already reports
// them from systemctl + a listening-port check, so this reuses that truth
// rather than inventing a second definition of "up".
async function probeServices() {
  const meta = {
    youglish: {
      name: 'YouGlish index service',
      group: 'Curriculum',
      purpose: 'Builds the per-keyword pronunciation indexes the lesson decks link to. Port 8790, unit youglish-vps.',
      requires: 'Already connected. Keyword saves in the Course Studio queue new index builds automatically.',
    },
    tts: {
      name: 'Text to speech',
      group: 'Curriculum',
      purpose: 'Audio for vocabulary and practice shells. Port 8888, no systemd unit — status is a port check only.',
      requires: 'Already connected. There is no unit file, so a restart is manual.',
    },
  }
  try {
    const res = await consoleGet('/api/console/pipelines')
    const services = res?.services || []
    return Object.entries(meta).map(([key, base]) => {
      const svc = services.find(s => s.name === key)
      if (!svc) return { ...base, state: 'unknown', evidence: `/api/console/pipelines returned no "${key}" service` }
      return {
        ...base,
        state: svc.status === 'up' ? 'live' : svc.status === 'degraded' ? 'down' : 'down',
        evidence: `/api/console/pipelines reports ${svc.status}${svc.port ? ` on port ${svc.port}` : ''}${svc.unit ? ` (unit ${svc.unit})` : ''}`,
      }
    })
  } catch (e) {
    return Object.values(meta).map(base => ({
      ...base, state: 'unknown', evidence: `/api/console/pipelines — ${describeError(e)}`,
    }))
  }
}

async function probeAds() {
  const providers = [
    {
      key: 'google_ads',
      name: 'Google Ads',
      requires: 'A Google Ads manager account, an approved developer token, an OAuth client and a refresh token stored server-side, plus a nightly pull into ad_accounts / ad_campaigns / ad_metrics_daily. None of that exists yet.',
    },
    {
      key: 'meta',
      name: 'Meta Ads',
      requires: 'A Meta business account, an app with ads_read, a long-lived system-user token stored server-side, and the same nightly pull. None of that exists yet.',
    },
  ]
  try {
    const res = await bizList('ad_accounts', { limit: 500 })
    const rows = res?.rows || []
    return providers.map(p => {
      const mine = rows.filter(r => r.provider === p.key)
      const connected = mine.filter(r => r.status === 'active')
      return {
        name: p.name,
        group: 'Growth',
        purpose: 'Spend and campaign performance, reconciled against real orders.',
        requires: p.requires,
        state: connected.length ? 'live' : 'not_connected',
        evidence: connected.length
          ? `${connected.length} active account(s) stored, last synced ${connected[0].last_synced_at ? fmtStamp(connected[0].last_synced_at) : 'never'}`
          : `no ${p.key} account is stored in ad_accounts — nothing is being pulled`,
      }
    })
  } catch (e) {
    return providers.map(p => ({
      name: p.name,
      group: 'Growth',
      purpose: 'Spend and campaign performance, reconciled against real orders.',
      requires: p.requires,
      state: e?.notLive ? 'not_connected' : 'unknown',
      evidence: e?.notLive
        ? 'no ad_accounts table is being served yet, and no credentials exist for this provider either way'
        : `could not check ad_accounts — ${describeError(e)}`,
    }))
  }
}

async function probeAll() {
  const [convex, api, biz, mail, services, ads] = await Promise.all([
    probeConvex(), probeConsoleApi(), probeBusinessApi(), probeMail(), probeServices(), probeAds(),
  ])
  return { at: Date.now(), rows: [convex, api, biz, mail, ...services, ...ads] }
}

export default function ConsoleIntegrations() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  const run = useCallback(() => {
    setData(null)
    setError(null)
    probeAll().then(setData).catch(setError)
  }, [])

  useEffect(() => { run() }, [run])

  const counts = data
    ? data.rows.reduce((acc, r) => ({ ...acc, [r.state]: (acc[r.state] || 0) + 1 }), {})
    : {}

  return (
    <>
      <div className="sa-page-header">
        <div>
          <h1>Integrations</h1>
          <p>What is actually connected, what is read-only, and what is not connected at all. Every status below is a live probe, run when this screen loaded.</p>
        </div>
        <div className="sa-page-header-actions">
          <button type="button" className="sa-btn sa-btn-ghost" onClick={run} disabled={!data && !error}>
            <span className="material-symbols-outlined" aria-hidden="true">refresh</span>
            Re-run probes
          </button>
        </div>
      </div>

      {error && <ConsoleErrorPanel error={error} onRetry={run} />}

      {!error && !data && (
        <div className="sa-card">
          <p className="sa-empty-hint" style={{ padding: '1.25rem' }} role="status" aria-live="polite">
            Probing every integration…
          </p>
        </div>
      )}

      {!error && data && (
        <>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', marginBottom: 12 }}>
            {['live', 'read_only', 'not_connected', 'unconfigured', 'down'].map(s => (
              <div className="sa-kpi" key={s}>
                <span className="sa-kpi-label">{STATE[s].label}</span>
                <span className="sa-kpi-value">{counts[s] || 0}</span>
              </div>
            ))}
          </div>

          <div className="sa-card">
            <div className="sa-card-header">
              <h2>Services</h2>
              <span className="sa-toolbar-count">probed {fmtMillis(data.at)}</span>
            </div>
            <div className="sa-table-wrap">
              <table className="sa-table">
                <thead>
                  <tr>
                    <th scope="col">Service</th>
                    <th scope="col">Status</th>
                    <th scope="col">What was checked</th>
                    <th scope="col">What connecting it requires</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map(r => (
                    <tr key={r.name}>
                      <td style={{ minWidth: 200 }}>
                        <div style={{ fontWeight: 600 }}>{r.name}</div>
                        <div style={{ fontSize: 'var(--sa-fs-micro)', color: 'var(--sa-text-muted)' }}>{r.group}</div>
                      </td>
                      <td><span className={`sa-badge ${STATE[r.state].cls}`}>{STATE[r.state].label}</span></td>
                      <td style={{ maxWidth: 340, whiteSpace: 'normal', lineHeight: 1.5 }}>
                        <div>{r.purpose}</div>
                        <div style={{ fontSize: 'var(--sa-fs-micro)', color: 'var(--sa-text-muted)', fontFamily: 'ui-monospace, monospace', marginTop: 2 }}>
                          {r.evidence}
                        </div>
                      </td>
                      <td style={{ maxWidth: 380, whiteSpace: 'normal', lineHeight: 1.5, color: 'var(--sa-text-muted)' }}>
                        {r.requires}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  )
}
