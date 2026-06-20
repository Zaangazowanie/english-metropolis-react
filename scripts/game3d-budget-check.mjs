#!/usr/bin/env node
// Fluent City 3D games — budget gate (docs/game3d/CONTRACT.md rules 1-4).
// Run after `npm run build`. Exits non-zero on any violation.
import { execSync } from 'node:child_process'
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { join } from 'node:path'

const LIMIT_GAME_KB        = 250
const LIMIT_VENDOR_KB      = 350
const LIMIT_ASSETS_MB      = 2.0
// CONTRACT Addendum A (approved 2026-06-20): English Metro WorldKit chunk and
// world assets live under separate, larger budgets than per-game shells.
const LIMIT_WORLD_KB       = 600
const LIMIT_WORLD_ASSETS_MB = 12.0

let failed = false
const fail = (msg) => { console.error(`FAIL  ${msg}`); failed = true }
const pass = (msg) => console.log(`PASS  ${msg}`)

// 1. No dependency changes vs the PR base (CI sets GAME3D_BASE; default origin/gold-deploy)
const base = process.env.GAME3D_BASE || 'origin/gold-deploy'
for (const f of ['package.json', 'package-lock.json']) {
  try {
    const diff = execSync(`git diff --name-only ${base} -- ${f}`).toString().trim()
    diff ? fail(`${f} changed vs ${base} — new/changed dependencies are forbidden`)
         : pass(`${f} unchanged`)
  } catch { console.warn(`WARN  could not diff ${f} vs ${base} (shallow clone?)`) }
}

// 2. No external runtime URLs in shells3d or world
try {
  const hits = execSync(
    `grep -rnE 'https?://' src/practice/shells3d src/world --include='*.ts' --include='*.tsx' | grep -vE '^\\s*//|\\*|@see|@license' || true`
  ).toString().trim()
  hits ? fail(`external URL(s) in shells3d/world:\n${hits}`) : pass('no external URLs in shells3d or world')
} catch { /* no shells3d/world yet */ }

// 3. Gzipped chunk budgets (game3d-*, vendor-three, world-*)
const dist = 'dist/assets'
if (existsSync(dist)) {
  for (const f of readdirSync(dist)) {
    if (!f.endsWith('.js')) continue
    const isGame   = f.startsWith('game3d-')
    const isVendor = f.startsWith('vendor-three')
    const isWorld  = f.startsWith('world-')
    if (!isGame && !isVendor && !isWorld) continue
    const kb    = gzipSync(readFileSync(join(dist, f))).length / 1024
    const limit = isVendor ? LIMIT_VENDOR_KB : isWorld ? LIMIT_WORLD_KB : LIMIT_GAME_KB
    kb > limit ? fail(`${f}: ${kb.toFixed(0)} KB gz > ${limit} KB`)
               : pass(`${f}: ${kb.toFixed(0)} KB gz (limit ${limit})`)
  }
} else fail('dist/assets missing — run npm run build first')

// 4. Per-game static asset budgets
const gamesDir = 'public/games'
if (existsSync(gamesDir)) {
  for (const key of readdirSync(gamesDir)) {
    let bytes = 0
    const walk = (d) => { for (const e of readdirSync(d)) {
      const p = join(d, e); const s = statSync(p)
      s.isDirectory() ? walk(p) : bytes += s.size } }
    walk(join(gamesDir, key))
    const mb = bytes / (1024 * 1024)
    mb > LIMIT_ASSETS_MB ? fail(`public/games/${key}: ${mb.toFixed(2)} MB > ${LIMIT_ASSETS_MB} MB`)
                         : pass(`public/games/${key}: ${mb.toFixed(2)} MB (limit ${LIMIT_ASSETS_MB})`)
  }
}

// 4b. World static asset budget (Addendum A: public/world/ ≤ 12 MB)
const worldDir = 'public/world'
if (existsSync(worldDir)) {
  let bytes = 0
  const walkWorld = (d) => { for (const e of readdirSync(d)) {
    const p = join(d, e); const s = statSync(p)
    s.isDirectory() ? walkWorld(p) : bytes += s.size } }
  walkWorld(worldDir)
  const mb = bytes / (1024 * 1024)
  mb > LIMIT_WORLD_ASSETS_MB
    ? fail(`public/world: ${mb.toFixed(2)} MB > ${LIMIT_WORLD_ASSETS_MB} MB`)
    : pass(`public/world: ${mb.toFixed(2)} MB (limit ${LIMIT_WORLD_ASSETS_MB})`)
}

console.log(failed ? '\ngame3d budget gate: FAILED' : '\ngame3d budget gate: all green')
process.exit(failed ? 1 : 0)
