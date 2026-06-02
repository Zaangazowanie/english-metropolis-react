#!/usr/bin/env tsx
// Layer-2 enrichment: cross-reference Convex `exercises` with
// `interferencePatterns`, then write interferenceTags +
// polishDifficultyScore + highPriorityFor + decayRate back via the
// `practice:enrichExercise` mutation.
//
// Agent A11 (English Metropolis content-pipeline build).
//
// Inputs (Convex prod, populated by sibling agents):
//   - exercises (Agent A5, ingested via ingestExerciseBatch)
//   - interferencePatterns (Agent A10, ingested via ingestInterferenceBatch)
//   - enrichExercise mutation (Agent A4)
//
// Strategy:
//   1. Pull all interference patterns once (ConvexHttpClient.query).
//   2. Snapshot all exercises via `npx convex export --prod` (zip
//      with exercises/documents.jsonl) — fastest way to dump 1.4k+ rows
//      without running a custom listAll query.
//   3. Match each exercise to patterns using:
//        - subCategory ∈ pattern.matchingSubCategories  (primary)
//        - patternId-as-keyword in focusArea / title    (fallback)
//   4. polishDifficultyScore = max(matched.interferenceStrength)
//      decayRate              = min(matched.decayRate)
//      highPriorityFor        = unique pattern.cefrLevel set
//      Fallback when no matches: tier*1.5, decayRate=0.5,
//      highPriorityFor = [exercise.cefrLevel].
//   5. Call enrichExercise via SDK (HTTP) with bounded parallelism
//      (CONCURRENCY=8) — each call is tiny (5 args, ~2-300 bytes)
//      and Convex coalesces well. Tolerate per-row failures so a bad
//      doc doesn't kill the run.

import fs from 'fs';
import path from 'path';
import { execSync, spawnSync } from 'child_process';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../convex/_generated/api';

const PROJECT_DIR = '/root/.openclaw/workspace/lexicon-source';
const TMP_DIR = '/tmp/a11-enrich';
const EXPORT_ZIP = path.join(TMP_DIR, 'prod-snapshot.zip');
const EXPORT_DIR = path.join(TMP_DIR, 'prod-snapshot');
const PROGRESS_LOG = path.join(TMP_DIR, 'progress.jsonl');

const PROD_URL = process.env.CONVEX_URL ?? 'https://wooden-manatee-881.convex.cloud';
const CONCURRENCY = 8;

fs.mkdirSync(TMP_DIR, { recursive: true });

interface ConvexExercise {
  _id: string;
  exerciseId: string;
  category: string;
  subCategory: string;
  cefrLevel: string;
  difficultyTier: number;
  title: string;
  description: string;
  focusArea: string;
  interferenceTags?: string[];
  polishDifficultyScore?: number;
  highPriorityFor?: string[];
  decayRate?: number;
  importedAt: number;
  enrichedAt?: number;
}

interface InterferencePattern {
  patternId: string;
  cefrLevel: string;
  interferenceStrength: number;
  decayRate: number;
  matchingSubCategories: string[];
}

const client = new ConvexHttpClient(PROD_URL);

// ────────────────────────────────────────────────────────────
// Step 2 — snapshot the exercises table via `convex export`
// ────────────────────────────────────────────────────────────
function loadExercises(): ConvexExercise[] {
  // Re-use existing snapshot if fresh (<5 min old) to avoid re-export.
  const reuse =
    fs.existsSync(EXPORT_ZIP) &&
    Date.now() - fs.statSync(EXPORT_ZIP).mtimeMs < 5 * 60 * 1000;

  if (!reuse) {
    try { fs.rmSync(EXPORT_ZIP, { force: true }); } catch {}
    try { fs.rmSync(EXPORT_DIR, { recursive: true, force: true }); } catch {}
    console.log('[A11] Exporting prod snapshot via `convex export`…');
    const r = spawnSync(
      'npx',
      ['convex', 'export', '--prod', '--path', EXPORT_ZIP],
      { cwd: PROJECT_DIR, stdio: 'inherit' },
    );
    if (r.status !== 0) throw new Error(`convex export failed: ${r.status}`);
    fs.mkdirSync(EXPORT_DIR, { recursive: true });
    execSync(`unzip -oq ${EXPORT_ZIP} -d ${EXPORT_DIR}`);
  } else {
    console.log('[A11] Re-using existing prod-snapshot.zip (<5 min old).');
    if (!fs.existsSync(EXPORT_DIR)) {
      fs.mkdirSync(EXPORT_DIR, { recursive: true });
      execSync(`unzip -oq ${EXPORT_ZIP} -d ${EXPORT_DIR}`);
    }
  }

  let target: string | null = null;
  const walk = (dir: string) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (
        ent.isFile() &&
        ent.name === 'documents.jsonl' &&
        path.basename(path.dirname(p)) === 'exercises'
      ) {
        target = p;
      }
    }
  };
  walk(EXPORT_DIR);
  if (!target) throw new Error(`exercises/documents.jsonl not found under ${EXPORT_DIR}`);

  const lines = fs.readFileSync(target, 'utf8').split('\n').filter(Boolean);
  const rows: ConvexExercise[] = lines.map((l) => JSON.parse(l));
  console.log(`[A11] Loaded ${rows.length} exercises from snapshot.`);
  return rows;
}

// ────────────────────────────────────────────────────────────
// Step 3 — matching logic
// ────────────────────────────────────────────────────────────
function matchExerciseToPatterns(
  ex: ConvexExercise,
  patterns: InterferencePattern[],
): {
  interferenceTags: string[];
  polishDifficultyScore: number;
  highPriorityFor: string[];
  decayRate: number;
} {
  const focusLc = (ex.focusArea ?? '').toLowerCase();
  const titleLc = (ex.title ?? '').toLowerCase();

  const matches = patterns.filter((p) => {
    if (p.matchingSubCategories.includes(ex.subCategory)) return true;
    const kw = p.patternId.replace(/-/g, ' ').toLowerCase();
    if (kw.length < 3) return false;
    return focusLc.includes(kw) || titleLc.includes(kw);
  });

  if (matches.length === 0) {
    return {
      interferenceTags: [],
      polishDifficultyScore: ex.difficultyTier * 1.5,
      highPriorityFor: [ex.cefrLevel],
      decayRate: 0.5,
    };
  }

  return {
    interferenceTags: matches.map((p) => p.patternId),
    polishDifficultyScore: Math.max(...matches.map((p) => p.interferenceStrength)),
    highPriorityFor: Array.from(new Set(matches.map((p) => p.cefrLevel))),
    decayRate: Math.min(...matches.map((p) => p.decayRate)),
  };
}

// ────────────────────────────────────────────────────────────
// Bounded concurrency runner
// ────────────────────────────────────────────────────────────
async function pAll<T, R>(
  items: T[],
  worker: (item: T, idx: number) => Promise<R>,
  concurrency: number,
  onProgress?: (done: number, total: number) => void,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  let done = 0;
  const workers: Promise<void>[] = [];
  for (let w = 0; w < concurrency; w++) {
    workers.push(
      (async () => {
        while (true) {
          const idx = next++;
          if (idx >= items.length) return;
          try {
            results[idx] = await worker(items[idx], idx);
          } catch (e: any) {
            results[idx] = { __error: String(e?.message ?? e) } as any;
          }
          done++;
          if (onProgress && (done % 50 === 0 || done === items.length)) {
            onProgress(done, items.length);
          }
        }
      })(),
    );
  }
  await Promise.all(workers);
  return results;
}

// ────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────
async function main() {
  console.log(`[A11] enrich-exercises starting (prod=${PROD_URL}, concurrency=${CONCURRENCY})`);

  const patterns = (await client.query(api.practice.listInterferencePatterns, {})) as
    | InterferencePattern[]
    | null;
  if (!patterns || patterns.length === 0) {
    throw new Error('No interference patterns in prod — Agent A10 not done.');
  }
  console.log(`[A11] Loaded ${patterns.length} interference patterns.`);

  const exercises = loadExercises();
  if (exercises.length === 0) {
    throw new Error('No exercises in prod — Agent A5 not done.');
  }

  const histLabels = ['0–1', '1–2', '2–3', '3–4', '4–5', '5–6', '6–7', '7–8', '8–9', '9–10'];
  const hist: Record<string, number> = Object.fromEntries(histLabels.map((l) => [l, 0]));
  const tagCounts: Record<string, number> = {};
  let withTags = 0;

  // Pre-compute enrichments (synchronous, fast)
  const enriched = exercises.map((ex) => {
    const e = matchExerciseToPatterns(ex, patterns);
    if (e.interferenceTags.length > 0) {
      withTags++;
      for (const t of e.interferenceTags) tagCounts[t] = (tagCounts[t] ?? 0) + 1;
    }
    const s = e.polishDifficultyScore;
    const bIdx = s >= 10 ? 9 : Math.max(0, Math.min(9, Math.floor(s)));
    hist[histLabels[bIdx]]++;
    return { ex, enrichment: e };
  });

  fs.writeFileSync(PROGRESS_LOG, '');

  console.log('[A11] Calling enrichExercise mutation in parallel…');
  let errors = 0;
  const errorSamples: string[] = [];

  await pAll(
    enriched,
    async ({ ex, enrichment }) => {
      try {
        await client.mutation(api.practice.enrichExercise, {
          exerciseId: ex.exerciseId,
          interferenceTags: enrichment.interferenceTags,
          polishDifficultyScore: enrichment.polishDifficultyScore,
          highPriorityFor: enrichment.highPriorityFor,
          decayRate: enrichment.decayRate,
        });
        fs.appendFileSync(
          PROGRESS_LOG,
          JSON.stringify({
            exerciseId: ex.exerciseId,
            subCategory: ex.subCategory,
            category: ex.category,
            cefrLevel: ex.cefrLevel,
            tags: enrichment.interferenceTags,
            score: enrichment.polishDifficultyScore,
            ok: true,
          }) + '\n',
        );
      } catch (e: any) {
        errors++;
        const msg = String(e?.message ?? e).slice(0, 300);
        if (errorSamples.length < 5)
          errorSamples.push(`${ex.exerciseId}: ${msg}`);
        fs.appendFileSync(
          PROGRESS_LOG,
          JSON.stringify({ exerciseId: ex.exerciseId, ok: false, error: msg }) + '\n',
        );
      }
    },
    CONCURRENCY,
    (done, total) => console.log(`[A11] ${done}/${total} (errors=${errors})`),
  );

  // ──────────────────────────────────────────────────────────
  // Final report
  // ──────────────────────────────────────────────────────────
  console.log('\n=== A11 ENRICHMENT REPORT ===');
  console.log(`Total exercises processed: ${exercises.length}`);
  console.log(`Errors writing to Convex:  ${errors}`);
  console.log(
    `Coverage: ${withTags}/${exercises.length} (${((withTags / exercises.length) * 100).toFixed(1)}%) have non-empty interferenceTags`,
  );
  console.log('\npolishDifficultyScore histogram:');
  for (const lbl of histLabels) {
    const n = hist[lbl] ?? 0;
    if (n === 0) continue;
    const bar = '█'.repeat(Math.min(50, Math.round((n / exercises.length) * 200)));
    console.log(`  ${lbl.padStart(6)}: ${String(n).padStart(5)}  ${bar}`);
  }
  console.log('\nTop 5 most-tagged interference patterns:');
  const top5 = Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  for (const [tag, n] of top5) console.log(`  ${tag}: ${n}`);
  if (errorSamples.length) {
    console.log('\nFirst error samples:');
    for (const s of errorSamples) console.log(`  ${s}`);
  }
  console.log('\nProgress log: ' + PROGRESS_LOG);

  // Verification: pull a tagged exercise back via getExercisesByInterference
  const sampleTag = top5[0]?.[0];
  if (sampleTag) {
    console.log(`\nVerifying via getExercisesByInterference (tag=${sampleTag})…`);
    try {
      const sample = (await client.query(api.practice.getExercisesByInterference, {
        studentSlug: '__verify__',
        interferenceTags: [sampleTag],
        limit: 3,
      })) as any[];
      console.log(
        `  -> got ${sample.length} sample(s); first: ${sample[0]?.exerciseId} (score=${sample[0]?.polishDifficultyScore}, tags=${JSON.stringify(sample[0]?.interferenceTags)})`,
      );
    } catch (e: any) {
      console.log(`  verification failed: ${e?.message ?? e}`);
    }
  }

  console.log('\n— A11 done.');
}

main().catch((e) => {
  console.error('[A11] FATAL', e);
  process.exit(1);
});
