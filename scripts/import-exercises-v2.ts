#!/usr/bin/env tsx
// Bulk import exercises into Convex `exercises` table.
// V2 — uses spawnSync (no shell), so no ARG_MAX issues.
// Smaller batches (25) keep each run safe.

import fs from 'fs';
import { spawnSync } from 'child_process';

const SOURCE = '/root/.openclaw/workspace/english-metropolis-exercises-all.json';
const BATCH_SIZE = 25;
const PROJECT_DIR = '/root/.openclaw/workspace/lexicon-source';

interface RawExerciseSet {
  id: string;
  category: string;
  subCategory: string;
  cefrLevel: string;
  difficultyTier: number;
  title: string;
  description: string;
  focusArea: string;
  questions: Array<{
    id: string;
    type: string;
    prompt: string;
    answer: string;
    options?: string[];
    instructionEN: string;
    instructionPL: string;
    hintPL?: string;
    explanationPL?: string;
    explanationENSimple?: string;
  }>;
}

const data: RawExerciseSet[] = JSON.parse(fs.readFileSync(SOURCE, 'utf8'));
const totalQuestions = data.reduce((a, b) => a + b.questions.length, 0);
console.log(`Loaded ${data.length} exercise sets, ${totalQuestions} questions`);

const transformed = data.map((s) => ({
  exerciseId: s.id,
  category: s.category,
  subCategory: s.subCategory,
  cefrLevel: s.cefrLevel,
  difficultyTier: s.difficultyTier,
  title: s.title,
  description: s.description,
  focusArea: s.focusArea,
  questions: s.questions.map((q) => ({
    questionId: q.id,
    type: q.type,
    prompt: q.prompt,
    answer: q.answer,
    options: q.options,
    instructionEN: q.instructionEN,
    instructionPL: q.instructionPL,
    hintPL: q.hintPL,
    explanationPL: q.explanationPL,
    explanationENSimple: q.explanationENSimple,
  })),
}));

let totalInserted = 0;
let totalUpdated = 0;
let totalErrors = 0;
const errors: Array<{ batch: number; error: string }> = [];
const totalBatches = Math.ceil(transformed.length / BATCH_SIZE);

for (let i = 0; i < transformed.length; i += BATCH_SIZE) {
  const batchNum = Math.floor(i / BATCH_SIZE) + 1;
  const batch = transformed.slice(i, i + BATCH_SIZE);
  const argsJson = JSON.stringify({ exercises: batch });

  process.stdout.write(`Batch ${batchNum}/${totalBatches} (${batch.length} sets): `);

  const r = spawnSync(
    'npx',
    ['convex', 'run', '--prod', 'practice:ingestExerciseBatch', argsJson],
    {
      cwd: PROJECT_DIR,
      encoding: 'utf8',
      maxBuffer: 100 * 1024 * 1024,
    },
  );

  if (r.status !== 0) {
    totalErrors++;
    const msg = (r.stderr || r.stdout || 'unknown').toString().slice(0, 300);
    console.log(`FAIL`);
    errors.push({ batch: batchNum, error: msg });
    continue;
  }

  const out = r.stdout ?? '';
  const m = out.match(/"inserted"\s*:\s*(\d+)[\s\S]*?"updated"\s*:\s*(\d+)/);
  if (m) {
    const ins = parseInt(m[1], 10);
    const upd = parseInt(m[2], 10);
    totalInserted += ins;
    totalUpdated += upd;
    console.log(`inserted=${ins} updated=${upd}`);
  } else {
    console.log(`(unparsed): ${out.trim().slice(0, 100)}`);
  }
}

console.log('\n=== Import complete ===');
console.log(`Total batches: ${totalBatches}`);
console.log(`Total inserted: ${totalInserted}`);
console.log(`Total updated:  ${totalUpdated}`);
console.log(`Total errors:   ${totalErrors}`);
if (errors.length) {
  console.log('\n=== Errors ===');
  for (const e of errors.slice(0, 10)) {
    console.log(`Batch ${e.batch}: ${e.error.slice(0, 200)}`);
  }
}
