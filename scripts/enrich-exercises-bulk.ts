#!/usr/bin/env tsx
// Bulk enrichment using practice:enrichExerciseBatch mutation.
// Reads exercise-interference-map.json + polish-interference-index.json,
// builds enrichment rows, sends in batches of 50.
//
// Strategy mirrors enrich-exercises.ts (A11) but condensed to a single
// mutation call per batch. Avoids 1409 npx-spawn invocations.

import fs from 'fs';
import { spawnSync } from 'child_process';

const MAP_PATH = '/root/.openclaw/workspace/polish-interference-engine/exercise-interference-map.json';
const PATTERNS_PATH = '/root/.openclaw/workspace/polish-interference-index.json';
const PROJECT_DIR = '/root/.openclaw/workspace/lexicon-source';
const BATCH_SIZE = 50;

interface RawTag { ic_id: string; confidence: number; match_source: string }
interface RawExerciseMap {
  exercise_id: string;
  category: string;
  subCategory: string;
  cefrLevel: string;
  difficultyTier: number;
  interference_tags: RawTag[];
}
interface MapFile {
  exercises: Record<string, RawExerciseMap>;
}
interface Pattern {
  patternId: string;
  cefrLevel: string;
  interferenceStrength: number;
  decayRate: number;
  matchingSubCategories: string[];
}

const map: MapFile = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'));
const patterns: Pattern[] = JSON.parse(fs.readFileSync(PATTERNS_PATH, 'utf8'));
console.log(`Loaded ${Object.keys(map.exercises).length} exercise maps + ${patterns.length} patterns`);

// Build indices: by patternId AND by subCategory (so we map IC-IDs from the
// engine output to our 20-pattern Convex ID set when they line up).
const patternByMatchingSub = new Map<string, Pattern[]>();
for (const p of patterns) {
  for (const s of p.matchingSubCategories ?? []) {
    if (!patternByMatchingSub.has(s)) patternByMatchingSub.set(s, []);
    patternByMatchingSub.get(s)!.push(p);
  }
}

const CEFR_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
function cefrAtOrAbove(level: string): string[] {
  const idx = CEFR_ORDER.indexOf(level);
  return idx < 0 ? [] : CEFR_ORDER.slice(idx);
}

interface EnrichRow {
  exerciseId: string;
  interferenceTags: string[];
  polishDifficultyScore: number;
  highPriorityFor?: string[];
  decayRate?: number;
}

const rows: EnrichRow[] = [];

// Index patterns by patternId for direct ic_id lookup
const patternById = new Map<string, Pattern>(patterns.map((p) => [p.patternId, p]));

for (const [exId, ex] of Object.entries(map.exercises)) {
  // Primary: use the engine's interference_tags directly (ic_id → patternId).
  // Engine assigned 1216/1409 with confidence-scored matches.
  const directMatched: Pattern[] = [];
  for (const t of ex.interference_tags ?? []) {
    const p = patternById.get(t.ic_id.toLowerCase());
    if (p) directMatched.push(p);
  }
  // Fallback: subCategory-based match against the 20 training-data patterns.
  const subMatched = patternByMatchingSub.get(ex.subCategory) ?? [];
  // Merge unique
  const seen = new Set<string>();
  const matched: Pattern[] = [];
  for (const p of [...directMatched, ...subMatched]) {
    if (seen.has(p.patternId)) continue;
    seen.add(p.patternId);
    matched.push(p);
  }

  if (matched.length === 0) {
    // baseline — unmapped exercise
    rows.push({
      exerciseId: exId,
      interferenceTags: [],
      polishDifficultyScore: 5.0,
      highPriorityFor: [ex.cefrLevel],
      decayRate: 0.5,
    });
    continue;
  }
  const tags = matched.map((p) => p.patternId);
  const maxStrength = Math.max(...matched.map((p) => p.interferenceStrength));
  const minDecay = Math.min(...matched.map((p) => p.decayRate));
  const strongest = matched.reduce((a, b) =>
    a.interferenceStrength > b.interferenceStrength ? a : b,
  );
  rows.push({
    exerciseId: exId,
    interferenceTags: tags,
    polishDifficultyScore: Number(maxStrength.toFixed(3)),
    highPriorityFor: cefrAtOrAbove(strongest.cefrLevel),
    decayRate: minDecay,
  });
}

const tagged = rows.filter((r) => r.interferenceTags.length > 0).length;
console.log(`Prepared ${rows.length} rows (${tagged} tagged, ${rows.length - tagged} baseline)`);

let totalUpdated = 0;
let totalSkipped = 0;
let totalErrors = 0;
const totalBatches = Math.ceil(rows.length / BATCH_SIZE);

for (let i = 0; i < rows.length; i += BATCH_SIZE) {
  const batchNum = Math.floor(i / BATCH_SIZE) + 1;
  const batch = rows.slice(i, i + BATCH_SIZE);
  const argsJson = JSON.stringify({ enrichments: batch });
  process.stdout.write(`Batch ${batchNum}/${totalBatches} (${batch.length}): `);
  const r = spawnSync(
    'npx',
    ['convex', 'run', '--prod', 'practice:enrichExerciseBatch', argsJson],
    { cwd: PROJECT_DIR, encoding: 'utf8', maxBuffer: 100 * 1024 * 1024 },
  );
  if (r.status !== 0) {
    totalErrors++;
    console.log(`FAIL: ${(r.stderr || r.stdout || '').toString().slice(0, 200)}`);
    continue;
  }
  const out = r.stdout ?? '';
  const m = out.match(/"updated"\s*:\s*(\d+)[\s\S]*?"skipped"\s*:\s*(\d+)/);
  if (m) {
    const u = parseInt(m[1], 10);
    const s = parseInt(m[2], 10);
    totalUpdated += u;
    totalSkipped += s;
    console.log(`updated=${u} skipped=${s}`);
  } else {
    console.log(`(unparsed): ${out.trim().slice(0, 100)}`);
  }
}

console.log(`\n=== Bulk enrichment complete ===`);
console.log(`Total batches: ${totalBatches}`);
console.log(`Total updated: ${totalUpdated}`);
console.log(`Total skipped: ${totalSkipped}`);
console.log(`Total errors:  ${totalErrors}`);
