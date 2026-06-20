#!/usr/bin/env node
// game3d-capture — ADVISORY gameplay GIF capture for English Metro, run in CI.
//
// Why this exists: the build sandbox can't reach its own dev server, so it can
// never screenshot real gameplay. A GitHub Actions runner CAN reach its own
// localhost — so we capture INSIDE CI. This script:
//   1. starts `vite preview` (serves the just-built dist/)
//   2. drives headless Chromium (Playwright, installed at WORKFLOW level via
//      `npm install --no-save --no-package-lock playwright` — NEVER a repo dep)
//   3. runs the demo flow: home → "Enter the City" → "Begin" → hold W (Wren
//      walks) for ~4s, recording a webm
//   4. converts the webm to an optimised GIF (<=2MB) via ffmpeg (preinstalled
//      on ubuntu runners)
//   5. writes .capture-out/<shellKey>.gif + .capture-out/meta.json for the
//      workflow's commit+comment step to publish.
//
// CONTRACT: advisory only. ANY failure → warn + process.exit(0). It must NEVER
// red-gate a build+budget-green PR. No repo dependency is added (package.json /
// package-lock.json stay byte-identical).
//
// Hostname note: the app only mounts GameHome at "/" when the hostname matches
// /englishmetro\.com/i. The workflow maps `127.0.0.1 local.englishmetro.com`
// into /etc/hosts and we navigate there, so IS_ENGLISHMETRO is true in CI.

import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, existsSync, readdirSync, statSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import http from 'node:http'

const HOST       = process.env.EM_CAPTURE_HOST || 'local.englishmetro.com'
const PORT       = Number(process.env.EM_CAPTURE_PORT || 4173)
const BASE       = `http://${HOST}:${PORT}`
const OUT_DIR    = '.capture-out'
const VIDEO_DIR  = join(OUT_DIR, 'video')
const SHELL_KEY  = process.env.EM_CAPTURE_SHELLKEY || 'world-englishmetro'
const RECORD_MS  = 4500
const READY_MS   = 60_000

const warn = (m) => console.warn(`[capture] ${m}`)
const log  = (m) => console.log(`[capture] ${m}`)

/** Resolve when BASE responds, or reject after READY_MS. */
function waitForServer(deadline) {
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(BASE, (res) => { res.resume(); resolve() })
      req.on('error', () => {
        if (Date.now() > deadline) reject(new Error('preview never became ready'))
        else setTimeout(tick, 600)
      })
    }
    tick()
  })
}

/** Run ffmpeg; return true on success. */
function ff(args) {
  const r = spawnSync('ffmpeg', args, { stdio: 'ignore' })
  return r.status === 0
}

/** webm → optimised gif (<=2MB). Steps down resolution/fps until it fits. */
function toGif(webm, gifPath) {
  const palette = join(OUT_DIR, 'palette.png')
  const variants = [
    { fps: 12, scale: 640 },
    { fps: 10, scale: 520 },
    { fps: 9,  scale: 420 },
  ]
  for (const v of variants) {
    const vf = `fps=${v.fps},scale=${v.scale}:-1:flags=lanczos`
    if (!ff(['-y', '-i', webm, '-vf', `${vf},palettegen=stats_mode=diff`, palette])) continue
    if (!ff(['-y', '-i', webm, '-i', palette, '-lavfi', `${vf}[x];[x][1:v]paletteuse=dither=bayer`, gifPath])) continue
    if (existsSync(gifPath) && statSync(gifPath).size <= 2 * 1024 * 1024) return true
  }
  // Keep whatever we produced even if slightly over — it's advisory.
  return existsSync(gifPath)
}

async function main() {
  // Fresh output dir
  if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true, force: true })
  mkdirSync(VIDEO_DIR, { recursive: true })

  // 1. Start vite preview (binds all interfaces so the hosts alias resolves).
  log(`starting vite preview on :${PORT}`)
  const preview = spawn(
    'npx',
    ['vite', 'preview', '--host', '0.0.0.0', '--port', String(PORT), '--strictPort'],
    { stdio: 'ignore' },
  )

  let browser
  try {
    await waitForServer(Date.now() + READY_MS)
    log('preview ready')

    // 2. Playwright (installed at workflow level; import resolves from node_modules)
    const { chromium } = await import('playwright')
    browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] })
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      deviceScaleFactor: 1,
      recordVideo: { dir: VIDEO_DIR, size: { width: 1280, height: 720 } },
    })
    const page = await context.newPage()

    // 3. Demo flow
    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30_000 })

    // Home → "Enter the City". Absent on branches without the world stack —
    // that's expected pre-merge, so we no-op gracefully.
    const enter = page.getByText('Enter the City', { exact: false }).first()
    try {
      await enter.waitFor({ state: 'visible', timeout: 15_000 })
    } catch {
      warn('"Enter the City" not found (world not on this branch yet) — skipping capture')
      await context.close()
      return
    }
    await enter.click()

    // "Begin the journey"
    const begin = page.getByText('Begin the journey', { exact: false }).first()
    await begin.waitFor({ state: 'visible', timeout: 15_000 })
    await begin.click()

    // Let the scene settle, then walk Wren (hold W) while recording.
    await page.waitForTimeout(900)
    await page.keyboard.down('w')
    await page.waitForTimeout(RECORD_MS - 1200)
    await page.keyboard.down('d')        // a gentle arc
    await page.waitForTimeout(300)
    await page.keyboard.up('d')
    await page.keyboard.up('w')
    await page.waitForTimeout(400)

    await context.close()                // finalises the webm
    await browser.close()
    browser = undefined

    // 4. Find the recorded webm
    const webms = readdirSync(VIDEO_DIR).filter((f) => f.endsWith('.webm'))
    if (webms.length === 0) { warn('no webm recorded'); return }
    const webm = join(VIDEO_DIR, webms[0])

    // 5. Convert → gif
    const gifPath = join(OUT_DIR, `${SHELL_KEY}.gif`)
    if (!toGif(webm, gifPath)) { warn('ffmpeg conversion failed'); return }
    const kb = (statSync(gifPath).size / 1024).toFixed(0)
    writeFileSync(join(OUT_DIR, 'meta.json'), JSON.stringify({ shellKey: SHELL_KEY, gif: gifPath }, null, 2))
    log(`gif ready: ${gifPath} (${kb} KB)`)
  } catch (err) {
    warn(`capture error (advisory, ignored): ${err && err.message ? err.message : err}`)
  } finally {
    try { if (browser) await browser.close() } catch { /* noop */ }
    try { preview.kill('SIGTERM') } catch { /* noop */ }
  }
}

// Advisory: always exit 0 so a capture problem never red-gates a green PR.
main().then(() => process.exit(0)).catch((e) => { warn(String(e)); process.exit(0) })
