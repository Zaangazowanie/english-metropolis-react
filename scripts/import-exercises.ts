#!/usr/bin/env tsx
// Bulk import the 8,017-exercise JSON into Convex `exercises` table.
// Uses `npx convex run` to call the ingestExerciseBatch mutation.
// Agent A5 (English Metropolis content pipeline build).

import fs from 'fs';
import { execSync } from 'child_process';

const SOURCE = '/root/.openclaw/workspace/english-metropolis-exercises-all.json';
const BATCH_SIZE = 50; // 50 sets per call — keeps mutation under Convex 1-MB arg limit
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

// Transform to Convex shape (rename id -> exerciseId, questions[].id -> questionId)
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

  // npx convex run does not have --args-file; pass JSON as positional arg.
  // Write to a tmpfile and substitute via $(cat ...) to avoid shell-arg-length limits.
  const tmpFile = `/tmp/em-batch-${i}.json`;
  fs.writeFileSync(tmpFile, argsJson);

  console.log(`Batch ${batchNum}/${totalBatches}: ${batch.length} sets (offset ${i})`);

  try {
    const out = execSync(
      `cd ${PROJECT_DIR} && npx convex run --prod practice:ingestExerciseBatch "$(cat ${tmpFile})"`,
      { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 },
    );
    // Parse {"inserted": N, "updated": N} (allow whitespace / newlines)
    const m = out.match(/"inserted"\s*:\s*(\d+)[\s\S]*?"updated"\s*:\s*(\d+)/);
    if (m) {
      const ins = parseInt(m[1], 10);
      const upd = parseInt(m[2], 10);
      totalInserted += ins;
      totalUpdated += upd;
      console.log(`  -> inserted=${ins} updated=${upd}`);
    } else {
      console.log(`  -> output: ${out.trim().slice(0, 200)}`);
    }
  } catch (e: any) {
    totalErrors++;
    const msg = e?.stderr?.toString?.() || e?.message || String(e);
    console.error(`  !! batch ${batchNum} FAILED: ${msg.slice(0, 500)}`);
    errors.push({ batch: batchNum, error: msg.slice(0, 500) });
  } finally {
    try {
      fs.unlinkSync(tmpFile);
    } catch {}
  }
}

console.log('\n=== Import complete ===');
console.log(`Total batches: ${totalBatches}`);
console.log(`Total inserted: ${totalInserted}`);
console.log(`Total updated:  ${totalUpdated}`);
console.log(`Total errors:   ${totalErrors}`);
if (errors.length) {
  console.log('\n=== Errors ===');
  for (const e of errors) {
    console.log(`Batch ${e.batch}: ${e.error}`);
  }
}
