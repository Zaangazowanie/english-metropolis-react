#!/usr/bin/env node
// Content gate for src/gamedata/grammar_bank.{json,js}.
//
// The bank is what students are graded on, so every item has to survive these
// rules or it does not ship. The 2026-09-04 review found inverted answer keys,
// raw lesson-transcript fragments (with real first names), pipeline
// meta-commentary in the teaching text, the same sentence filed under five
// concepts, coin-flip two-option items and machine-padded distractors — all of
// which had passed the miner's own gates. This script REJECTS them.
//
//   node public/play/tools/lint-grammar-bank.mjs            # report only, exit 1 on offenders
//   node public/play/tools/lint-grammar-bank.mjs --fix      # apply grammar-bank-repairs.json,
//                                                           # delete what still fails, rewrite
//                                                           # grammar_bank.json + .js, print report
//   node public/play/tools/lint-grammar-bank.mjs --json out.json
//
// Repairs live in grammar-bank-repairs.json next to this file: hand-authored
// patches (unambiguous fixes only), deletions, and a few authored top-up items
// for the thinnest concepts. Anything the repairs do not cover and that still
// fails a rule is deleted by --fix, never silently kept.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.resolve(HERE, '../src/gamedata');
const JSON_PATH = path.join(DATA, 'grammar_bank.json');
const JS_PATH = path.join(DATA, 'grammar_bank.js');
const REPAIRS_PATH = path.join(HERE, 'grammar-bank-repairs.json');

const argv = process.argv.slice(2);
const FIX = argv.includes('--fix');
const jsonOutIdx = argv.indexOf('--json');
const JSON_OUT = jsonOutIdx >= 0 ? argv[jsonOutIdx + 1] : null;

// ---------------------------------------------------------------- rules
const MAX_OPTION_CHARS = 70;
const MIN_OPTIONS = 3;
const PAD_WORDS = new Set(['here', 'there', 'it', 'all', 'now', 'yes', 'okay', 'finally', 'always']);
// disfluency / transcript noise that never belongs in an authored sentence
const DISFLUENCY = /\b(mmm+|okay|oh yes|oh no|oh yeah|yes\. yes|you know|lly)\b|\bI, I\b|\.\s*\.\s|,\s*,|\bto, to\b/i;
// pipeline commentary leaking into the teaching text
const META_EXPLAIN = /\b(this entry|the entry|original correction|suggested correction|correct error identified|WHY this error|incorrectly identifies|appears erroneous|is actually correct|actually CORRECT|often correct|is CORRECT here|not strictly wrong|technically exists|natural but imprecise)\b/i;
// proper nouns allowed mid-sentence (places, days, months, languages, brands
// that a grammar sentence legitimately uses). Everything else capitalised
// mid-sentence is treated as a leaked name.
const PROPER_OK = new Set([
  'I', "I'm", "I've", "I'd", "I'll", 'London', 'Warsaw', 'Kraków', 'Krakow', 'Poland', 'Polish',
  'Spain', 'Spanish', 'Europe', 'Netherlands', 'English', 'British', 'American', 'France',
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
  'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September',
  'October', 'November', 'December', 'TV', 'OK', 'Christmas', 'Easter', 'Rome', 'Paris',
  'Berlin', 'Gdańsk', 'Wrocław', 'Poznań', 'Vistula',
]);
const REAL_FIRST_NAMES = /\b(Kinga|Patricia|Britney|Truskovsky|Kelly|Mike|Michael|Ania|Kasia|Tomek|Marek|Piotr|Agnieszka|Magda)\b/;

const norm = (s) => s.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();
const tokens = (s) => norm(s).split(' ').filter(Boolean);

function lintItem(ex, ctx) {
  const problems = [];
  const P = (rule, detail) => problems.push({ rule, detail });
  const opts = ex.options || [];
  const ans = opts[ex.answerIndex];

  if (!Array.isArray(opts) || opts.length < MIN_OPTIONS) P('two-option', `${opts.length} options`);
  if (typeof ex.answerIndex !== 'number' || ans === undefined) P('bad-answer-index', String(ex.answerIndex));
  if (new Set(opts.map(norm)).size !== opts.length) P('duplicate-options', 'two options normalise to the same text');
  if (!ex.explain || ex.explain.trim().length < 12) P('placeholder-explain', 'missing or too short');
  if (ex.explain && META_EXPLAIN.test(ex.explain)) P('meta-explain', ex.explain.slice(0, 80));
  if (ex.explain && ctx.hints.has(norm(ex.explain))) P('placeholder-explain', 'explain equals the concept hint');
  if (ex.explain && /^'?[A-Z][a-z]+' is (actually )?correct/i.test(ex.explain)) P('inverted-key', 'explain crowns a different sentence');
  // explain quotes another option as the correct one
  if (ex.explain && ans) {
    for (const o of opts) {
      if (o === ans) continue;
      const q = o.replace(/[.!?]$/, '');
      if (q.length > 8 && new RegExp(`['‘"]${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['’"]\\s+(is|=)\\s+(actually\\s+|also\\s+|often\\s+)?(correct|fine|right|idiomatic)`, 'i').test(ex.explain)) {
        P('inverted-key', `explain says "${o}" is correct`);
      }
    }
  }

  opts.forEach((o, i) => {
    const tag = i === ex.answerIndex ? 'answer' : 'distractor';
    if (o.length > MAX_OPTION_CHARS) P('transcript-length', `${tag} ${o.length} chars`);
    if (DISFLUENCY.test(o)) P('transcript-disfluency', `${tag}: ${o.slice(0, 60)}`);
    if (/^[a-z]/.test(o)) P('transcript-fragment', `${tag} starts lowercase: ${o.slice(0, 50)}`);
    if (REAL_FIRST_NAMES.test(o)) P('transcript-name', `${tag}: ${o.slice(0, 60)}`);
    // capitalised words mid-sentence that are not whitelisted
    const words = o.split(/\s+/);
    for (let w = 1; w < words.length; w++) {
      const raw = words[w].replace(/^[("'‘“]+|[)"'’”.,!?;:]+$/g, '');
      if (!raw || !/^[A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż'-]+$/.test(raw)) continue;
      // sentence-initial after a terminator is fine
      if (/[.!?]$/.test(words[w - 1])) continue;
      if (PROPER_OK.has(raw)) continue;
      P('proper-noun', `${tag}: "${raw}" in ${o.slice(0, 50)}`);
    }
    if (tag === 'distractor' && ans) {
      const dt = tokens(o), at = tokens(ans);
      const last = dt[dt.length - 1];
      if (PAD_WORDS.has(last) && dt.length > at.length && !at.includes(last)) {
        P('template-padding', `distractor ends in "${last}": ${o}`);
      }
      // a distractor that shares almost nothing with the answer is a recycled
      // sentence from another item, not a parallel option
      const overlap = dt.filter((t) => at.includes(t)).length / Math.max(1, Math.min(dt.length, at.length));
      if (overlap < 0.4 && dt.length >= 2) P('unparallel-distractor', `${o}  ⟂  ${ans}`);
    }
  });
  return problems;
}

function lintBank(bank) {
  const hints = new Set(bank.concepts.map((c) => norm(c.hint || '')));
  const ctx = { hints };
  const byId = new Map();
  const report = { items: {}, duplicates: [], importantCap: [] };
  for (const ex of bank.exercises) {
    const probs = lintItem(ex, ctx);
    if (probs.length) report.items[ex.id] = probs;
    byId.set(ex.id, ex);
  }
  // duplicate normalised answers across items (any concept)
  const homes = new Map();
  for (const ex of bank.exercises) {
    const a = ex.options?.[ex.answerIndex];
    if (a === undefined) continue;
    const key = norm(a);
    if (!homes.has(key)) homes.set(key, []);
    homes.get(key).push(ex.id);
  }
  for (const [key, ids] of homes) {
    if (ids.length > 1) {
      report.duplicates.push({ answer: key, ids });
      for (const id of ids.slice(1)) {
        (report.items[id] ||= []).push({ rule: 'duplicate-answer', detail: `same correct sentence as ${ids[0]}: "${key}"` });
      }
    }
  }
  // 'important to/for' is one contested teacher's rule; at most 2 items, both
  // under prepositions, where the contrast is unambiguous
  const imp = bank.exercises.filter((ex) => ex.options.some((o) => /\bimportant (to|for)\b/i.test(o)));
  imp.forEach((ex, i) => {
    if (ex.concept !== 'prepositions') (report.items[ex.id] ||= []).push({ rule: 'important-to-for', detail: `filed under ${ex.concept}, cap is 2 under prepositions` });
    else if (i >= 2) (report.items[ex.id] ||= []).push({ rule: 'important-to-for', detail: 'over the cap of 2' });
    report.importantCap.push(ex.id);
  });
  return report;
}

// ---------------------------------------------------------------- repairs
function applyRepairs(bank, repairs) {
  const del = new Set(repairs.delete || []);
  const patched = [];
  const log = { deleted: [], patched: [], added: [] };
  for (const ex of bank.exercises) {
    if (del.has(ex.id)) { log.deleted.push(ex.id); continue; }
    const p = repairs.patch?.[ex.id];
    if (p) { patched.push({ ...ex, ...p }); log.patched.push(ex.id); }
    else patched.push(ex);
  }
  for (const add of repairs.add || []) { patched.push(add); log.added.push(add.id); }
  return { bank: { ...bank, exercises: patched }, log };
}

function recount(bank) {
  const counts = {};
  for (const ex of bank.exercises) counts[ex.concept] = (counts[ex.concept] || 0) + 1;
  return { ...bank, concepts: bank.concepts.map((c) => ({ ...c, count: counts[c.id] || 0 })) };
}

function summary(bank) {
  const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'];
  const rows = [];
  for (const c of bank.concepts) {
    const items = bank.exercises.filter((e) => e.concept === c.id);
    const byLevel = Object.fromEntries(LEVELS.map((l) => [l, items.filter((e) => e.level === l).length]));
    rows.push({ concept: c.id, total: items.length, ...byLevel });
  }
  const opt = {};
  for (const e of bank.exercises) opt[e.options.length] = (opt[e.options.length] || 0) + 1;
  return { rows, total: bank.exercises.length, optionCounts: opt };
}

function printSummary(s) {
  console.log(`\nBank: ${s.total} items · option counts ${JSON.stringify(s.optionCounts)}`);
  console.log('concept'.padEnd(20) + 'total  A1  A2  B1  B2  C1');
  for (const r of s.rows) {
    console.log(r.concept.padEnd(20) + String(r.total).padStart(5) + ['A1', 'A2', 'B1', 'B2', 'C1'].map((l) => String(r[l]).padStart(4)).join(''));
  }
}

function printReport(report, label) {
  const ids = Object.keys(report.items);
  console.log(`\n== ${label}: ${ids.length} offending item(s) ==`);
  const byRule = {};
  for (const id of ids) for (const p of report.items[id]) (byRule[p.rule] ||= new Set()).add(id);
  for (const [rule, set] of Object.entries(byRule).sort((a, b) => b[1].size - a[1].size)) {
    console.log(`  ${rule.padEnd(24)} ${set.size}`);
  }
  if (process.env.VERBOSE) for (const id of ids) console.log(`  - ${id}: ${report.items[id].map((p) => `${p.rule} (${p.detail})`).join('; ')}`);
}

// ---------------------------------------------------------------- main
const original = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
const before = lintBank(original);
printReport(before, 'before repairs');

if (!FIX) {
  if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify({ report: before, summary: summary(original) }, null, 2));
  printSummary(summary(original));
  process.exit(Object.keys(before.items).length ? 1 : 0);
}

const repairs = fs.existsSync(REPAIRS_PATH) ? JSON.parse(fs.readFileSync(REPAIRS_PATH, 'utf8')) : {};
let { bank, log } = applyRepairs(original, repairs);
let after = lintBank(bank);
// whatever still fails after the hand repairs is deleted — a broken item on a
// public URL is worse than a thinner concept, and buildSession tops up from
// the neighbouring concept and says so
const stillBad = Object.keys(after.items);
if (stillBad.length) {
  console.log(`\n${stillBad.length} item(s) still fail after repairs and are removed:`);
  for (const id of stillBad) console.log(`  - ${id}: ${after.items[id].map((p) => p.rule).join(', ')}`);
  bank = { ...bank, exercises: bank.exercises.filter((e) => !after.items[e.id]) };
  after = lintBank(bank);
}
bank = recount(bank);
fs.writeFileSync(JSON_PATH, JSON.stringify(bank, null, 1) + '\n');
fs.writeFileSync(JS_PATH, `// generated by public/play/tools/lint-grammar-bank.mjs --fix — do not edit\nexport default ${JSON.stringify(bank)};\n`);
console.log(`\nrepairs: patched ${log.patched.length}, deleted ${log.deleted.length}, added ${log.added.length}, auto-removed ${stillBad.length}`);
printReport(after, 'after repairs');
const s = summary(bank);
printSummary(s);
if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify({ before: before, after, log, autoRemoved: stillBad, summary: s }, null, 2));
process.exit(Object.keys(after.items).length ? 1 : 0);
