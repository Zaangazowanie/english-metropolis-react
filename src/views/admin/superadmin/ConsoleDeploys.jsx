// ConsoleDeploys — Website → Deploys. Read-only, and only what is genuinely
// observable from the browser.
//
// The site is a Vite SPA deployed to /var/www/englishmetro and served by nginx
// from this same origin. So the honest source of truth reachable from here is
// the deployed index.html itself:
//
//   • the entry bundle name (its content hash IS the build identity)
//   • every /assets/* file that index.html references, with the Last-Modified
//     and Content-Length nginx reports — i.e. the real file mtime and size
//   • the mtime of index.html, which is when the deploy landed
//
// What is deliberately NOT here, because it cannot be obtained without a new
// backend endpoint: the deploy HISTORY, and the count of files actually on disk.
// A history does exist — deploy_em.py appends one line per release to
// /root/ricky-merge-gate/deploy-em.log — but it is a file on the VPS that no
// endpoint serves, so the screen names that gap instead of inventing releases.

import { useCallback, useEffect, useState } from 'react'
import { ConsoleEmpty, ConsoleErrorPanel, ConsoleSkeleton } from './ConsoleStates.jsx'
import { SortTh, fmtBytes, fmtMillis } from './bizRest.jsx'

// Vite emits the entry as /assets/index-<hash>.js; everything else under
// /assets/ is a chunk, a style sheet or a preloaded worker.
const ASSET_PREFIX = '/assets/'
const HASH = /-([A-Za-z0-9_-]{8,})\.[a-z]+$/

function kindOf(url) {
  if (url.endsWith('.css')) return 'css'
  if (url.endsWith('.js')) return 'js'
  const ext = url.split('.').pop()
  return ext && ext.length <= 5 ? ext : 'other'
}

// HEAD is enough for size and mtime and pulls no bytes. A 200 with no
// Last-Modified is reported as unknown rather than guessed.
async function head(url) {
  try {
    const res = await fetch(url, { method: 'HEAD', cache: 'no-store' })
    if (!res.ok) return { url, status: res.status, bytes: null, modified: null }
    const lm = res.headers.get('last-modified')
    const len = res.headers.get('content-length')
    return {
      url,
      status: res.status,
      bytes: len === null ? null : Number(len),
      modified: lm ? Date.parse(lm) : null,
    }
  } catch {
    return { url, status: 0, bytes: null, modified: null }
  }
}

async function probeDeploy() {
  const res = await fetch('/index.html', { cache: 'no-store' })
  if (!res.ok) {
    const err = new Error(`/index.html answered ${res.status}`)
    err.status = res.status
    throw err
  }
  const indexModified = res.headers.get('last-modified')
  const html = await res.text()
  const doc = new DOMParser().parseFromString(html, 'text/html')

  const urls = new Set()
  let entry = null
  doc.querySelectorAll('script[src]').forEach(el => {
    const src = el.getAttribute('src') || ''
    if (!src.startsWith(ASSET_PREFIX)) return
    urls.add(src)
    if (/^\/assets\/index-/.test(src)) entry = src
  })
  doc.querySelectorAll('link[href]').forEach(el => {
    const href = el.getAttribute('href') || ''
    if (href.startsWith(ASSET_PREFIX)) urls.add(href)
  })

  const assets = await Promise.all([...urls].map(head))
  return {
    entry,
    indexModified: indexModified ? Date.parse(indexModified) : null,
    assets,
    // Non-/assets/ scripts are third-party or hand-placed (Google GSI, the
    // jsPDF copy under /students/vendor); counted so the number is honest.
    externalScripts: [...doc.querySelectorAll('script[src]')]
      .map(el => el.getAttribute('src') || '')
      .filter(src => src && !src.startsWith(ASSET_PREFIX)).length,
    probedAt: Date.now(),
  }
}

export default function ConsoleDeploys() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [sort, setSort] = useState('-bytes')

  const load = useCallback(() => {
    setData(null)
    setError(null)
    probeDeploy().then(setData).catch(setError)
  }, [])

  useEffect(() => { load() }, [load])

  const sorted = data ? sortAssets(data.assets, sort) : []
  const totalBytes = data ? data.assets.reduce((n, a) => n + (a.bytes || 0), 0) : 0
  const newest = data ? data.assets.reduce((t, a) => Math.max(t, a.modified || 0), 0) : 0
  const entryHash = data?.entry ? (data.entry.match(HASH)?.[1] || '') : ''

  return (
    <>
      <div className="sa-page-header">
        <div>
          <h1>Deploys</h1>
          <p>What this origin is serving right now, read straight from the deployed <code>index.html</code>. Read-only.</p>
        </div>
        <div className="sa-page-header-actions">
          <button type="button" className="sa-btn sa-btn-ghost" onClick={load} disabled={!data && !error}>
            <span className="material-symbols-outlined" aria-hidden="true">refresh</span>
            Re-check
          </button>
        </div>
      </div>

      {error && <ConsoleErrorPanel error={error} onRetry={load} />}
      {!error && !data && <div className="sa-card"><ConsoleSkeleton rows={5} label="Reading the deployed index.html…" /></div>}

      {!error && data && !data.entry && (
        <div className="sa-card">
          <ConsoleEmpty
            icon="rocket_launch"
            title="This origin is not serving a built bundle"
            hint={
              <>
                <p><code>/index.html</code> references no <code>/assets/index-*.js</code>, which is what a Vite dev server serves: the source entry, unhashed.</p>
                <p style={{ marginTop: '0.5rem' }}>Open this screen on the deployed site (<code>/var/www/englishmetro</code> behind nginx) to see the real bundle.</p>
              </>
            }
          />
        </div>
      )}

      {!error && data && data.entry && (
        <>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', marginBottom: 12 }}>
            <div className="sa-kpi">
              <span className="sa-kpi-label">Entry bundle</span>
              <span className="sa-kpi-value" style={{ fontSize: 15, fontFamily: 'ui-monospace, monospace', wordBreak: 'break-all' }}>
                {data.entry.replace(ASSET_PREFIX, '')}
              </span>
              <span className="sa-kpi-delta">build {entryHash || 'hash unreadable'}</span>
            </div>
            <div className="sa-kpi">
              <span className="sa-kpi-label">Assets referenced</span>
              <span className="sa-kpi-value">{data.assets.length}</span>
              <span className="sa-kpi-delta">
                {data.assets.filter(a => a.status !== 200).length
                  ? `${data.assets.filter(a => a.status !== 200).length} did not answer 200`
                  : 'all answered 200'}
              </span>
            </div>
            <div className="sa-kpi">
              <span className="sa-kpi-label">Referenced bytes</span>
              <span className="sa-kpi-value">{fmtBytes(totalBytes)}</span>
              <span className="sa-kpi-delta">{data.externalScripts} script(s) loaded from outside /assets</span>
            </div>
            <div className="sa-kpi">
              <span className="sa-kpi-label">index.html modified</span>
              <span className="sa-kpi-value" style={{ fontSize: 15 }}>{fmtMillis(data.indexModified)}</span>
              <span className="sa-kpi-delta">newest asset {newest ? fmtMillis(newest) : 'unknown'}</span>
            </div>
          </div>

          <div className="sa-card">
            <div className="sa-card-header">
              <h2>Files referenced by the deployed index.html</h2>
              <span className="sa-toolbar-count">checked {fmtMillis(data.probedAt)}</span>
            </div>
            <div className="sa-table-wrap">
              <table className="sa-table">
                <caption>Size and modified time are the <code>Content-Length</code> and <code>Last-Modified</code> nginx reports for each file, i.e. the real file on disk. Files present in /var/www/englishmetro but not referenced here are not visible from the browser.</caption>
                <thead>
                  <tr>
                    <SortTh col="url" sort={sort} onSort={setSort}>File</SortTh>
                    <SortTh col="kind" sort={sort} onSort={setSort}>Kind</SortTh>
                    <SortTh col="bytes" sort={sort} onSort={setSort} align="right">Size</SortTh>
                    <SortTh col="modified" sort={sort} onSort={setSort}>Modified</SortTh>
                    <th scope="col">HTTP</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map(a => (
                    <tr key={a.url}>
                      <td style={{ fontFamily: 'ui-monospace, monospace' }}>{a.url.replace(ASSET_PREFIX, '')}</td>
                      <td><span className="sa-badge sa-badge-queued">{kindOf(a.url)}</span></td>
                      <td className="sa-num">{fmtBytes(a.bytes)}</td>
                      <td>{a.modified ? fmtMillis(a.modified) : <span style={{ color: 'var(--sa-text-muted)' }}>not reported</span>}</td>
                      <td>
                        <span className={`sa-badge ${a.status === 200 ? 'sa-badge-committed' : 'sa-badge-failed'}`}>
                          {a.status || 'no answer'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <div className="sa-card" style={{ marginTop: 12 }}>
        <div className="sa-card-header"><h2>Deploy history</h2></div>
        <ConsoleEmpty
          icon="history_toggle_off"
          title="A history exists, but not on any endpoint this screen can read"
          hint={
            <>
              <p>Releases to englishmetro.com are shipped by <code>/root/ricky-merge-gate/deploy_em.py</code>, which rsyncs a build into <code>/var/www/englishmetro</code> and appends one line per release to <code>/root/ricky-merge-gate/deploy-em.log</code> (<code>DEPLOYED &lt;sha&gt; bundle=&lt;file&gt; live_ok=…</code>). That log is a real deploy history with the commit behind each release.</p>
              <p style={{ marginTop: '0.5rem' }}>It is a file on the VPS, served by nothing. A browser cannot read it, so listing releases here needs a backend change, not a frontend one: an <code>/api/console/website/deploys</code> endpoint that tails that log. Until it exists this panel stays empty rather than showing a made-up history.</p>
            </>
          }
        />
      </div>
    </>
  )
}

function sortAssets(assets, sort) {
  const desc = sort.startsWith('-')
  const col = desc ? sort.slice(1) : sort
  const value = a => (col === 'kind' ? kindOf(a.url) : col === 'url' ? a.url : (a[col] ?? -1))
  return [...assets].sort((x, y) => {
    const a = value(x)
    const b = value(y)
    const cmp = typeof a === 'string' ? a.localeCompare(b) : a - b
    return desc ? -cmp : cmp
  })
}
