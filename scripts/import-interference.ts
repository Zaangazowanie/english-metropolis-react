#!/usr/bin/env tsx
// Bulk-import the polish-interference-index.json into the Convex
// `interferencePatterns` table via the practice:ingestInterferenceBatch
// mutation. Idempotent — re-runs upsert by patternId.
// Agent A10 (English Metropolis content pipeline build).

import fs from 'fs';
import { execSync } from 'child_process';

const SOURCE = '/root/.openclaw/workspace/polish-interference-index.json';
const PROJECT_DIR = '/root/.openclaw/workspace/lexicon-source';

interface InterferencePattern {
  patternId: string;
  cefrLevel: string;
  frequency: number;
  polishCause: string;
  polishCauseEn: string;
  typicalErrors: string[];
  correctPatterns: string[];
  interferenceStrength: number;
  decayRate: number;
  spacedRepetitionWeight: number;
  matchingSubCategories: string[];
  matchingErrorCategories: string[];
  sourceCount: number;
}

const REQUIRED_FIELDS: Array<keyof InterferencePattern> = [
  'patternId',
  'cefrLevel',
  'frequency',
  'polishCause',
  'polishCauseEn',
  'typicalErrors',
  'correctPatterns',
  'interferenceStrength',
  'decayRate',
  'spacedRepetitionWeight',
  'matchingSubCategories',
  'matchingErrorCategories',
  'sourceCount',
];

const raw = JSON.parse(fs.readFileSync(SOURCE, 'utf8'));
// Accept either a top-level array or { patterns: [...] }
const items: InterferencePattern[] = Array.isArray(raw)
  ? raw
  : Array.isArray(raw?.patterns)
    ? raw.patterns
    : (() => {
        throw new Error(
          'polish-interference-index.json: expected top-level array or { patterns: [] }',
        );
      })();

console.log(`Loaded ${items.length} interference patterns from ${SOURCE}`);

// Validate required fields
const validationErrors: string[] = [];
items.forEach((p, idx) => {
  for (const f of REQUIRED_FIELDS) {
    const v = (p as any)[f];
    if (v === undefined || v === null) {
      validationErrors.push(
        `[#${idx} ${p.patternId ?? '<no-id>'}] missing field: ${f}`,
      );
    }
  }
  // Type sanity-checks for arrays so the Convex validator won't reject the batch
  if (!Array.isArray(p.typicalErrors))
    validationErrors.push(`[#${idx}] typicalErrors not array`);
  if (!Array.isArray(p.correctPatterns))
    validationErrors.push(`[#${idx}] correctPatterns not array`);
  if (!Array.isArray(p.matchingSubCategories))
    validationErrors.push(`[#${idx}] matchingSubCategories not array`);
  if (!Array.isArray(p.matchingErrorCategories))
    validationErrors.push(`[#${idx}] matchingErrorCategories not array`);
});

if (validationErrors.length) {
  console.error(`Validation failed (${validationErrors.length} issues):`);
  for (const e of validationErrors.slice(0, 25)) console.error(`  - ${e}`);
  if (validationErrors.length > 25)
    console.error(`  ... and ${validationErrors.length - 25} more`);
  process.exit(1);
}

console.log('Validation OK — all required fields present.');

// Strip any extra fields that aren't in the validator, then prepare batch.
const patterns = items.map((p) => ({
  patternId: p.patternId,
  cefrLevel: p.cefrLevel,
  frequency: p.frequency,
  polishCause: p.polishCause,
  polishCauseEn: p.polishCauseEn,
  typicalErrors: p.typicalErrors,
  correctPatterns: p.correctPatterns,
  interferenceStrength: p.interferenceStrength,
  decayRate: p.decayRate,
  spacedRepetitionWeight: p.spacedRepetitionWeight,
  matchingSubCategories: p.matchingSubCategories,
  matchingErrorCategories: p.matchingErrorCategories,
  sourceCount: p.sourceCount,
  // builtAt is set server-side by the mutation handler (now = Date.now()).
}));

const args = { patterns };
const tmp = '/tmp/interference-batch.json';
fs.writeFileSync(tmp, JSON.stringify(args));
console.log(`Wrote args to ${tmp} (${(fs.statSync(tmp).size / 1024).toFixed(1)} KB)`);

// `npx convex run` expects the JSON args as a positional argument, not
// --args-file. Pass via $(cat tmp) to avoid shell-arg-length limits and
// keep parity with scripts/import-exercises.ts.
const cmd = `cd ${PROJECT_DIR} && npx convex run --prod practice:ingestInterferenceBatch "$(cat ${tmp})"`;
console.log(`Running: npx convex run --prod practice:ingestInterferenceBatch <args>`);

try {
  const out = execSync(cmd, {
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
  });
  console.log(out);
} finally {
  try {
    fs.unlinkSync(tmp);
  } catch {}
}
