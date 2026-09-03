#!/usr/bin/env node
/**
 * check-convex-contract — does the frontend call Convex the way Convex is deployed?
 *
 * WHY THIS EXISTS
 * ---------------
 * On 2026-08-26 12:31 UTC a build shipped that called
 *   orders:getStudentAllocation({ sessionToken, studentId })
 * while prod's validator accepted { studentId } only. Convex rejected the extra
 * argument, the Promise.all in LessonBooking.jsx rejected with it, the catch set
 * `unavailable: true`, and `if (state.unavailable) return null` deleted the whole
 * "Book your next lesson" panel from the DOM.
 *
 * Nobody could self-book on englishmetro.com for the next 29 hours. It emitted no
 * error, no alarm and no log line — it rendered as an ABSENCE, which is
 * indistinguishable from an empty calendar. It was found by hand, by A/B-ing one
 * curl, only because a paying student complained.
 *
 * A component that cannot say "I failed" is the defect, ahead of whatever it
 * failed at. This is that component.
 *
 * WHAT IT CHECKS
 *   1. every Convex path the source calls actually EXISTS on the deployment
 *   2. every argument key the source passes is ACCEPTED by that function's validator
 *   3. every REQUIRED argument of that function is actually passed
 *
 * Usage:
 *   node scripts/check-convex-contract.mjs                 # advisory, exit 0
 *   node scripts/check-convex-contract.mjs --strict        # exit 1 on any mismatch
 *   node scripts/check-convex-contract.mjs --spec spec.json
 *
 * ⛔ A CHECK THAT RETURNS NOTHING IS NOT EVIDENCE UNTIL YOU PROVE IT CAN RETURN A
 * POSITIVE. --self-test injects a known-bad call and asserts this script catches
 * it. Run it after any edit to the parser.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, statSync, existsSync, openSync, closeSync, unlinkSync } from 'node:fs'
import { join, extname } from 'node:path'
import { tmpdir } from 'node:os'

const ROOT = new URL('..', import.meta.url).pathname
const SRC = join(ROOT, 'src')
const argv = process.argv.slice(2)
const STRICT = argv.includes('--strict')
const SELFTEST = argv.includes('--self-test')
const specArg = argv.indexOf('--spec') >= 0 ? argv[argv.indexOf('--spec') + 1] : null

// ── 1. what the deployment actually exposes ────────────────────────
function loadSpec() {
  if (specArg) return JSON.parse(readFileSync(specArg, 'utf8'))
  const bin = join(ROOT, 'node_modules/.bin/convex')
  if (!existsSync(bin)) throw new Error('convex CLI not found; pass --spec <file>')
  // ⛔ Never capture the spec through a stdout pipe: the CLI exits before the
  // ~300 KB document has flushed and the JSON arrives truncated in 2 of 3 runs
  // (measured 2026-09-01), which made the deploy.sh hook fail — and `|| true`
  // then hid that. A file descriptor is drained before exit; a pipe is not.
  const specFile = join(tmpdir(), `em-convex-spec-${process.pid}.json`)
  const fd = openSync(specFile, 'w')
  try {
    execFileSync(bin, ['function-spec', '--prod'], { cwd: ROOT, stdio: ['ignore', fd, 'inherit'] })
  } finally { closeSync(fd) }
  const raw = readFileSync(specFile, 'utf8')
  try { unlinkSync(specFile) } catch { /* leave it */ }
  // The CLI may print a human banner around the JSON. Try the whole stream
  // first (the common case), then the largest balanced object, then array.
  // Slicing from the FIRST '{' is wrong when the document is an array — that
  // lands inside the first element and truncates it.
  for (const cand of [raw,
                      raw.slice(raw.indexOf('['), raw.lastIndexOf(']') + 1),
                      raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)]) {
    try { if (cand && cand.trim()) return JSON.parse(cand) } catch { /* next */ }
  }
  throw new Error('could not parse function-spec output as JSON')
}

function indexSpec(spec) {
  const fns = Array.isArray(spec) ? spec : (spec.functions || [])
  const out = new Map()
  for (const f of fns) {
    if (!f.identifier) continue                     // http routes have no identifier
    const [mod, name] = f.identifier.split(':')
    const path = `${mod.replace(/\.js$/, '')}:${name}`
    const val = (f.args && f.args.value) || {}
    out.set(path, {
      type: f.functionType,
      args: new Map(Object.entries(val).map(([k, v]) => [k, !!v.optional])),
    })
  }
  return out
}

// ── 2. what the source calls ───────────────────────────────────────
// Matches the three shapes this codebase uses:
//   convexCall('query', 'orders:getStudentAllocation', { a, b })
//   queryAdminConvex('students:listStudents', { a })
//   JSON.stringify({ path: 'orders:getStudentAllocation', args: { a } })
const CALL_RES = [
  /\b(?:convexCall|callConvex)\(\s*['"`](?:query|mutation|action)['"`]\s*,\s*['"`]([\w]+:[\w]+)['"`]\s*,\s*\{/g,
  /\b(?:queryAdminConvex|mutateAdminConvex|queryConvexUnscoped|queryConvex|mutateConvex|queryTeacherConvex)\(\s*['"`]([\w]+:[\w]+)['"`]\s*,\s*\{/g,
  /path:\s*['"`]([\w]+:[\w]+)['"`]\s*,\s*args:\s*\{/g,
]

/** Read the balanced {...} starting at `open`, then take its TOP-LEVEL keys only.
 *  Nested object literals (windows: [{dayOfWeek…}]) are NOT arguments and must
 *  not be reported — an earlier draft flagged three false positives that way. */
function topLevelKeys(src, open) {
  let depth = 0, i = open, end = -1
  const stack = []
  for (; i < src.length && i < open + 4000; i++) {
    const c = src[i]
    if (c === '{' || c === '[' || c === '(') { depth++; stack.push(c) }
    else if (c === '}' || c === ']' || c === ')') { depth--; stack.pop(); if (depth === 0) { end = i; break } }
  }
  if (end < 0) return null
  const body = src.slice(open, end + 1)
  const keys = new Set()
  let spread = false
  // ONE pass, tracking real depth per character, skipping strings and comments.
  // Depth 1 means "directly inside the argument object". Anything deeper is a
  // nested literal like items: [{ packageId, qty }] — those are NOT arguments,
  // and an earlier draft that used a per-line approximation reported three of
  // them as rejected args. A checker that cries wolf gets switched off.
  let d = 0, str = null
  i = 0
  while (i < body.length) {
    const c = body[i], n = body[i + 1]
    if (str) {
      if (c === '\\') { i += 2; continue }
      if (c === str) str = null
      i++; continue
    }
    if (c === '"' || c === "'" || c === '`') { str = c; i++; continue }
    if (c === '/' && n === '/') { const j = body.indexOf('\n', i); i = j < 0 ? body.length : j; continue }
    if (c === '/' && n === '*') { const j = body.indexOf('*/', i); i = j < 0 ? body.length : j + 2; continue }
    if ('{[('.includes(c)) { d++; i++; continue }
    if ('}])'.includes(c)) { d--; i++; continue }
    if (d === 1) {
      if (c === '.' && body.slice(i, i + 3) === '...') { spread = true; i += 3; continue }
      const rest = body.slice(i)
      const m = /^([A-Za-z_$][\w$]*)\s*:/.exec(rest)
      if (m && (i === 0 || /[{,\s]/.test(body[i - 1]))) {
        keys.add(m[1])
        // ⛔ SKIP THE VALUE. Resuming the character scan inside it made the
        // shorthand rule below read `{ slug: urlSlug }` as sending a key called
        // "urlSlug" — 58 false positives, every one of them a variable name.
        i += m[0].length
        let vd = 0, vstr = null
        while (i < body.length) {
          const vc = body[i]
          if (vstr) { if (vc === '\\') { i += 2; continue } if (vc === vstr) vstr = null; i++; continue }
          if (vc === '"' || vc === "'" || vc === '`') { vstr = vc; i++; continue }
          if ('{[('.includes(vc)) { vd++; i++; continue }
          if ('}])'.includes(vc)) { if (vd === 0) break; vd--; i++; continue }
          if (vc === ',' && vd === 0) { i++; break }
          i++
        }
        continue
      }
      // Object SHORTHAND — { sessionToken, studentId }. No colon, so an earlier
      // draft could not see these at all and reported 124 required args as
      // "not passed". A checker that cries wolf gets switched off.
      const sh = /^([A-Za-z_$][\w$]*)\s*(?=[,}])/.exec(rest)
      if (sh && (i === 0 || /[{,\s]/.test(body[i - 1]))) { keys.add(sh[1]); i += sh[0].length; continue }
    }
    i++
  }
  return { keys, spread }
}

function walk(dir, acc = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    const st = statSync(p)
    if (st.isDirectory()) { if (e !== 'node_modules') walk(p, acc) }
    else if (['.js', '.jsx', '.ts', '.tsx', '.mjs'].includes(extname(e))) acc.push(p)
  }
  return acc
}

function collectCalls(extraSource = null) {
  const calls = []
  const files = walk(SRC)
  for (const file of files) {
    const src = readFileSync(file, 'utf8')
    for (const re of CALL_RES) {
      re.lastIndex = 0
      let m
      while ((m = re.exec(src))) {
        const open = src.indexOf('{', m.index + m[0].length - 1)
        const parsed = topLevelKeys(src, open)
        const keys = parsed ? parsed.keys : new Set()
        // queryAdminConvex / mutateAdminConvex / queryTeacherConvex merge the
        // caller's session token in themselves, so it never appears in the
        // literal. Credit it, or every admin call reads as missing an arg.
        if (/AdminConvex|TeacherConvex/.test(m[0])) keys.add('sessionToken')
        calls.push({
          path: m[1], file: file.replace(ROOT, ''),
          line: src.slice(0, m.index).split('\n').length,
          keys,
          spread: parsed ? parsed.spread : true,
        })
      }
    }
  }
  if (extraSource) calls.push(extraSource)
  return calls
}

// ── 3. compare ─────────────────────────────────────────────────────
function check(deployed, calls) {
  const problems = []
  for (const c of calls) {
    const fn = deployed.get(c.path)
    if (!fn) { problems.push({ ...c, kind: 'NOT DEPLOYED', detail: 'no such function on the deployment' }); continue }
    const extra = [...c.keys].filter(k => !fn.args.has(k))
    if (extra.length) {
      problems.push({ ...c, kind: 'ARG REJECTED', detail: `sends ${extra.join(', ')} — validator accepts ${[...fn.args.keys()].join(', ') || '(none)'}` })
    }
    if (!c.spread) {
      const missing = [...fn.args.entries()].filter(([k, opt]) => !opt && !c.keys.has(k)).map(([k]) => k)
      if (missing.length) problems.push({ ...c, kind: 'ARG MISSING', detail: `required but not passed: ${missing.join(', ')}` })
    }
  }
  return problems
}

// ── run ────────────────────────────────────────────────────────────
const deployed = indexSpec(loadSpec())
let calls = collectCalls()

if (SELFTEST) {
  // Prove the check can return a POSITIVE before trusting a clean run.
  calls = calls.concat([
    { path: 'orders:getStudentAllocation', file: '(self-test)', line: 0, keys: new Set(['studentId', 'thisArgDoesNotExist']), spread: false },
    { path: 'operations:definitelyNotDeployed', file: '(self-test)', line: 0, keys: new Set(), spread: true },
  ])
}

const problems = check(deployed, calls)
const paths = new Set(calls.map(c => c.path))
console.log(`convex contract: ${calls.length} call sites across ${paths.size} functions vs ${deployed.size} deployed`)

if (SELFTEST) {
  const caughtArg = problems.some(p => p.file === '(self-test)' && p.kind === 'ARG REJECTED')
  const caughtFn = problems.some(p => p.file === '(self-test)' && p.kind === 'NOT DEPLOYED')
  console.log(`self-test: bad-arg caught=${caughtArg}  undeployed-fn caught=${caughtFn}`)
  if (!caughtArg || !caughtFn) { console.error('SELF-TEST FAILED — this checker cannot detect the outage it exists for'); process.exit(2) }
}

if (!problems.length) { console.log('OK — every call matches the deployment'); process.exit(0) }

const byKind = {}
for (const p of problems) (byKind[p.kind] ||= []).push(p)
for (const [kind, list] of Object.entries(byKind)) {
  console.log(`\n${kind} (${list.length}):`)
  for (const p of list) console.log(`  ${p.path}\n    ${p.file}:${p.line}\n    ${p.detail}`)
}
console.log(`\n${problems.length} mismatch(es).`)
process.exit(STRICT ? 1 : 0)
