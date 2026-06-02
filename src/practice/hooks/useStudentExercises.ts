// useStudentExercises.ts
// ─────────────────────────────────────────────────────────────────────────────
// Adaptive-delivery hook for the practice exercise bank. Picks one of three
// modes based on what data we have on the student:
//
//   • COLD-START — no KB JSON file and no `practiceProgress` rows.
//     Fall back to `getExercisesForStudent(slug, category, subCategory)` and
//     order by interferenceStrength when available, else polishDifficultyScore.
//
//   • WARM — ≥20 progress rows but no KB.
//     Compute per-subCategory accuracy from progress rows (using the
//     `meta.subCategory` annotation that StudentPractice writes on each save,
//     or — defensively — the `exerciseId` prefix). Boost subCategories where
//     accuracy < 0.6 (struggling), demote subCategories where accuracy > 0.85
//     (mastered). Fetch a slice of exercises per boosted bucket.
//
//   • KB-ENHANCED — student has a KB JSON file under
//     /knowledge-base/<slug>.json. Map each KB error.category to one or more
//     exercise subCategories (KB_CATEGORY_TO_SUBCATEGORY), then apply Shadow's
//     60/40 formula:
//
//       combinedScore = (studentWeakness × 0.6) + (populationFrequency × 0.4)
//
//     where studentWeakness = errorFrequency × (fossilized ? 1.5 : 1) and
//     populationFrequency comes from the `interferencePatterns` table. The
//     resulting reasonString surfaces the dominant error so the UI can render
//     "Personalized for fossilized present-perfect (4 occurrences)".
//
// Wiring:
//   • Lexicon does NOT mount ConvexProvider — every fetch goes through the
//     /api/query and /api/mutation endpoints proxied to the deploy. This
//     mirrors the patterns in src/practice/lib/useStudentVocab.ts and
//     src/practice/hooks/usePracticeSession.ts.
//   • Cache results per (shellKey, studentSlug, category, subCategory, limit)
//     so hover-driven re-mounts of a shell tile don't re-fetch.
//
// Authored by Agent A7 in the 15-agent content-pipeline build (2026-04-30).
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import { fetchKB, type NormalisedKB, type KBError } from '../lib/kb-reader';
import type { ShellKey } from '../lib/shell-selector';
import type { ConvexExercise } from '../lib/exercise-adapters';
import { fetchWithTimeout } from '../lib/practice-cache';

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export interface UseStudentExercisesOptions {
  shellKey: ShellKey;
  studentSlug?: string;
  category?: string;
  subCategory?: string;
  /**
   * Sprint-2 Finding 2 fix (2026-05-02): when a shell is launched from a
   * topic-grouping card, this carries the groupId. The hook short-circuits
   * to a topic-scoped query that pulls ONLY exercises tagged with this
   * group, instead of the broad CEFR-window pool. Falls back to the
   * default flow when omitted (ad-hoc 38-pill catalog launches).
   */
  groupId?: string;
  limit?: number;
}

export type ExerciseDeliveryMode = 'cold-start' | 'warm' | 'kb-enhanced';

export interface UseStudentExercisesResult {
  exercises: ConvexExercise[] | null;
  status: 'idle' | 'loading' | 'ready' | 'error';
  error?: string;
  mode: ExerciseDeliveryMode;
  /** Human-readable explanation: e.g. "Personalized for fossilized present-perfect (4 occurrences)". */
  reasonString: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// KB → subCategory bridge
//
// Per the build spec: each KB error category maps to a set of exercise
// subCategories. The hook explodes a KB error into all of its candidate
// subCategories, scores each candidate with the 60/40 formula, then
// dedupes when fetching. Adding a new KB category is a one-line edit.
// ─────────────────────────────────────────────────────────────────────────────
const KB_CATEGORY_TO_SUBCATEGORY: Record<string, string[]> = {
  'grammar-tense':       ['present-simple', 'present-continuous', 'present-perfect', 'past-simple', 'past-continuous', 'future', 'modal-verbs'],
  'grammar-article':     ['articles-a-an', 'articles-the', 'no-article'],
  'grammar-preposition': ['prepositions-time', 'prepositions-place', 'prepositions-movement'],
  'grammar-agreement':   ['subject-verb-agreement', 'present-simple'],
  'word-order':          ['word-order', 'questions', 'inversions'],
  'vocabulary':          ['vocabulary'],
  'collocation':         ['vocabulary', 'phrasal-verbs', 'collocations'],
  'pronunciation':       ['vocabulary'],
  'misc':                ['use-of-english'],
};

// Threshold knobs — kept as constants near the top so they're easy to tune.
const WARM_MODE_MIN_PROGRESS_ROWS = 20;
const WARM_STRUGGLE_THRESHOLD = 0.6;
const WARM_MASTERY_THRESHOLD = 0.85;
const FOSSILIZED_BOOST = 1.5;
const STUDENT_WEIGHT = 0.6;
const POPULATION_WEIGHT = 0.4;

// ─────────────────────────────────────────────────────────────────────────────
// Convex HTTP helpers — same pattern as useStudentVocab.ts / usePracticeSession.ts.
// ─────────────────────────────────────────────────────────────────────────────
async function queryConvex<T>(path: string, args: Record<string, unknown>): Promise<T> {
  // 30s AbortController-backed timeout — see practice-cache.ts.
  const res = await fetchWithTimeout('/api/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, args }),
  });
  if (!res.ok) throw new Error(`${path} failed with ${res.status}`);
  const payload = await res.json();
  if (payload?.status !== 'success') {
    throw new Error(`${path} returned ${payload?.status || 'unknown status'}`);
  }
  return payload.value as T;
}

// ─────────────────────────────────────────────────────────────────────────────
// Result cache — keyed on (shellKey | slug | category | subCategory | limit).
// Lives at module scope so a tile that re-mounts (hover, route change, etc.)
// doesn't re-fetch. The cache is intentionally process-lifetime — there's no
// invalidation hook because results are also small (≤20 exercises per call).
// ─────────────────────────────────────────────────────────────────────────────
interface CacheEntry {
  exercises: ConvexExercise[];
  mode: ExerciseDeliveryMode;
  reasonString: string;
}
const RESULT_CACHE = new Map<string, CacheEntry>();

function cacheKey(opts: UseStudentExercisesOptions): string {
  return [
    opts.shellKey,
    opts.studentSlug ?? '__anon__',
    opts.category ?? '*',
    opts.subCategory ?? '*',
    opts.groupId ?? '*',
    opts.limit ?? 20,
  ].join('|');
}

// ─────────────────────────────────────────────────────────────────────────────
// Local types for Convex rows we touch.
// ─────────────────────────────────────────────────────────────────────────────
interface PracticeProgressRow {
  _id?: string;
  studentSlug?: string;
  shellId: string;
  exerciseId?: string;
  progress: number;
  completed: boolean;
  hintsUsed: number;
  meta?: Record<string, unknown>;
}

interface InterferencePattern {
  patternId: string;
  cefrLevel: string;
  frequency: number;
  interferenceStrength: number;
  matchingSubCategories: string[];
  matchingErrorCategories: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * deriveSubCategoryFromProgressRow — best-effort recovery of the exercise
 * subCategory from a progress row. We check `meta.subCategory` first (the
 * field StudentPractice is expected to populate going forward), then look at
 * the `exerciseId` prefix, which by convention encodes the subCategory for
 * imported English-Metropolis exercises (e.g. "em-pres-simple-001"). When
 * neither is available we return `null` so the row gets bucketed into the
 * `unknown` bin and effectively ignored by the warm-mode booster.
 */
function deriveSubCategoryFromProgressRow(row: PracticeProgressRow): string | null {
  const metaSub = row.meta && typeof row.meta.subCategory === 'string'
    ? (row.meta.subCategory as string)
    : null;
  if (metaSub) return metaSub;
  if (typeof row.exerciseId === 'string' && row.exerciseId.length > 0) {
    // Convention: "em-<subCategory-or-token>-<n>". Strip leading "em-" then
    // drop the trailing numeric segment.
    const stripped = row.exerciseId.replace(/^em-/, '');
    const trailingNum = stripped.replace(/-\d+$/, '');
    if (trailingNum && trailingNum !== stripped) return trailingNum;
  }
  return null;
}

/**
 * progressRowAccuracy — collapse a row to a single 0..1 accuracy proxy.
 * `progress` already sits in [0,1]; completion bumps to 1; heavy hint use
 * subtracts a small penalty so a "completed-with-many-hints" row doesn't
 * mask true mastery.
 */
function progressRowAccuracy(row: PracticeProgressRow): number {
  const base = row.completed ? 1 : Math.max(0, Math.min(1, row.progress));
  const penalty = Math.min(0.3, (row.hintsUsed ?? 0) * 0.05);
  return Math.max(0, base - penalty);
}

/**
 * uniqueOrdered — preserve order while dropping duplicate string entries.
 */
function uniqueOrdered(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const it of items) {
    if (!it || seen.has(it)) continue;
    seen.add(it);
    out.push(it);
  }
  return out;
}

/**
 * pickDominantError — choose the KB error with the highest weight (frequency
 * × fossilized-boost) and return a human reason string for it.
 */
function pickDominantError(kb: NormalisedKB): { error: KBError | null; reason: string } {
  if (!kb.errors || kb.errors.length === 0) {
    return { error: null, reason: 'KB loaded but contains no error patterns.' };
  }
  let best = kb.errors[0];
  let bestWeight = best.frequency * (best.fossilized ? FOSSILIZED_BOOST : 1);
  for (const err of kb.errors.slice(1)) {
    const w = err.frequency * (err.fossilized ? FOSSILIZED_BOOST : 1);
    if (w > bestWeight) {
      best = err;
      bestWeight = w;
    }
  }
  const fossilLabel = best.fossilized ? 'fossilized ' : '';
  const occurrenceLabel = best.frequency === 1 ? '1 occurrence' : `${best.frequency} occurrences`;
  const titleSnippet = best.title.length > 50 ? `${best.title.slice(0, 47)}…` : best.title;
  return {
    error: best,
    reason: `Personalized for ${fossilLabel}${titleSnippet} (${occurrenceLabel}).`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Mode A — COLD START
// ─────────────────────────────────────────────────────────────────────────────
async function fetchColdStart(
  opts: UseStudentExercisesOptions,
): Promise<{ exercises: ConvexExercise[]; reasonString: string }> {
  const limit = opts.limit ?? 20;
  // Use the supplied category/subCategory filter if any; otherwise hand
  // Convex an unfiltered request and let its CEFR-window scoring decide.
  const args: Record<string, unknown> = {
    studentSlug: opts.studentSlug ?? '',
    limit,
  };
  if (opts.category) args.category = opts.category;
  if (opts.subCategory) args.subCategory = opts.subCategory;
  // Topic-grouping filter — short-circuits server-side to a by_groupId
  // index lookup. When present, category/subCategory args are still
  // forwarded but the query ignores them in favor of the group scope.
  if (opts.groupId) args.groupId = opts.groupId;

  let exercises: ConvexExercise[] = [];
  try {
    exercises = (await queryConvex<ConvexExercise[]>(
      'practice:getExercisesForStudent',
      args,
    )) ?? [];
  } catch {
    exercises = [];
  }

  // Try to fetch interference patterns for the student's CEFR level so we
  // can re-rank by interferenceStrength when available. We don't know the
  // student's level here without an extra query, so we ask for ALL patterns
  // and intersect by tag — safe and small in practice (interferencePatterns
  // is a tiny table, on the order of dozens of rows).
  let patterns: InterferencePattern[] = [];
  try {
    patterns = (await queryConvex<InterferencePattern[]>(
      'practice:listInterferencePatterns',
      {},
    )) ?? [];
  } catch {
    patterns = [];
  }

  if (patterns.length > 0) {
    const strengthByTag = new Map<string, number>();
    for (const p of patterns) {
      const prev = strengthByTag.get(p.patternId) ?? 0;
      if (p.interferenceStrength > prev) strengthByTag.set(p.patternId, p.interferenceStrength);
    }
    const ranked = exercises.slice().sort((a, b) => {
      const aStrength = (a.interferenceTags ?? []).reduce(
        (max, t) => Math.max(max, strengthByTag.get(t) ?? 0),
        0,
      );
      const bStrength = (b.interferenceTags ?? []).reduce(
        (max, t) => Math.max(max, strengthByTag.get(t) ?? 0),
        0,
      );
      if (bStrength !== aStrength) return bStrength - aStrength;
      // Fallback secondary sort: polishDifficultyScore desc.
      return (b.polishDifficultyScore ?? 0) - (a.polishDifficultyScore ?? 0);
    });
    return {
      exercises: ranked.slice(0, limit),
      reasonString: 'Cold start — ranked by L1-interference strength for new students.',
    };
  }

  // No interference data available — sort by polishDifficultyScore desc.
  const ranked = exercises
    .slice()
    .sort((a, b) => (b.polishDifficultyScore ?? 0) - (a.polishDifficultyScore ?? 0));
  return {
    exercises: ranked.slice(0, limit),
    reasonString: 'Cold start — no history yet, ranked by exercise difficulty.',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Mode B — WARM
// ─────────────────────────────────────────────────────────────────────────────
async function fetchWarm(
  opts: UseStudentExercisesOptions,
  progressRows: PracticeProgressRow[],
): Promise<{ exercises: ConvexExercise[]; reasonString: string }> {
  const limit = opts.limit ?? 20;

  // Per-subCategory accuracy.
  const buckets = new Map<string, { acc: number[]; }>();
  for (const row of progressRows) {
    const sub = deriveSubCategoryFromProgressRow(row);
    if (!sub) continue;
    let bucket = buckets.get(sub);
    if (!bucket) {
      bucket = { acc: [] };
      buckets.set(sub, bucket);
    }
    bucket.acc.push(progressRowAccuracy(row));
  }

  // Boost (struggling) vs demote (mastered).
  const boosted: string[] = [];
  const demoted: string[] = [];
  let strugglingTop: { sub: string; acc: number; n: number } | null = null;
  for (const [sub, b] of buckets) {
    if (b.acc.length === 0) continue;
    const acc = b.acc.reduce((a, c) => a + c, 0) / b.acc.length;
    if (acc < WARM_STRUGGLE_THRESHOLD) {
      boosted.push(sub);
      if (!strugglingTop || acc < strugglingTop.acc) {
        strugglingTop = { sub, acc, n: b.acc.length };
      }
    } else if (acc > WARM_MASTERY_THRESHOLD) {
      demoted.push(sub);
    }
  }

  // If a category/subCategory filter was supplied by the caller, honour it
  // strictly — the warm-mode boost only narrows further within that filter.
  // Otherwise fan out across boosted subCategories and merge.
  const targetSubs = opts.subCategory
    ? [opts.subCategory]
    : boosted.length > 0
      ? boosted
      : []; // empty → call the unfiltered endpoint once

  let collected: ConvexExercise[] = [];
  if (targetSubs.length === 0) {
    try {
      collected = (await queryConvex<ConvexExercise[]>(
        'practice:getExercisesForStudent',
        {
          studentSlug: opts.studentSlug ?? '',
          ...(opts.category ? { category: opts.category } : {}),
          limit,
        },
      )) ?? [];
    } catch {
      collected = [];
    }
  } else {
    // Fan out — one query per boosted subCategory, then merge & dedupe.
    const perBucketLimit = Math.max(3, Math.ceil(limit / Math.max(1, targetSubs.length)));
    const seen = new Set<string>();
    for (const sub of targetSubs) {
      try {
        const rows = (await queryConvex<ConvexExercise[]>(
          'practice:getExercisesForStudent',
          {
            studentSlug: opts.studentSlug ?? '',
            ...(opts.category ? { category: opts.category } : {}),
            subCategory: sub,
            limit: perBucketLimit,
          },
        )) ?? [];
        for (const r of rows) {
          if (seen.has(r.exerciseId)) continue;
          seen.add(r.exerciseId);
          collected.push(r);
        }
      } catch {
        // ignore per-bucket failures and continue
      }
    }
  }

  // Demote mastered subCategories — push them to the back rather than
  // dropping them entirely (the student should still see the occasional
  // monitor-mode exercise).
  const demotedSet = new Set(demoted);
  collected.sort((a, b) => {
    const aDemoted = demotedSet.has(a.subCategory) ? 1 : 0;
    const bDemoted = demotedSet.has(b.subCategory) ? 1 : 0;
    if (aDemoted !== bDemoted) return aDemoted - bDemoted;
    return (b.polishDifficultyScore ?? 0) - (a.polishDifficultyScore ?? 0);
  });

  const reason = strugglingTop
    ? `Warm mode — boosting "${strugglingTop.sub}" (accuracy ${(strugglingTop.acc * 100).toFixed(0)}% over ${strugglingTop.n} attempts).`
    : `Warm mode — ${progressRows.length} attempts logged, no struggling area detected yet.`;

  return { exercises: collected.slice(0, limit), reasonString: reason };
}

// ─────────────────────────────────────────────────────────────────────────────
// Mode C — KB-ENHANCED
// ─────────────────────────────────────────────────────────────────────────────
async function fetchKBEnhanced(
  opts: UseStudentExercisesOptions,
  kb: NormalisedKB,
): Promise<{ exercises: ConvexExercise[]; reasonString: string }> {
  const limit = opts.limit ?? 20;

  // 1. Pick the dominant error for the reasonString.
  const { reason: dominantReason } = pickDominantError(kb);

  // 2. Compute per-subCategory studentWeakness from the KB.
  //    studentWeakness = sum over errors mapping to this subCategory of
  //    frequency × (fossilized ? 1.5 : 1).
  const weaknessBySub = new Map<string, number>();
  for (const err of kb.errors) {
    const subs = KB_CATEGORY_TO_SUBCATEGORY[err.category];
    if (!subs || subs.length === 0) continue;
    const w = err.frequency * (err.fossilized ? FOSSILIZED_BOOST : 1);
    for (const sub of subs) {
      weaknessBySub.set(sub, (weaknessBySub.get(sub) ?? 0) + w);
    }
  }

  // Normalise weakness to [0,1] so it composes cleanly with population freq.
  const maxWeakness = Math.max(0.0001, ...weaknessBySub.values());
  for (const [k, v] of weaknessBySub) {
    weaknessBySub.set(k, v / maxWeakness);
  }

  // 3. Fetch interference patterns to get population-frequency by subCategory.
  let populationBySub = new Map<string, number>();
  try {
    const patterns = (await queryConvex<InterferencePattern[]>(
      'practice:listInterferencePatterns',
      {},
    )) ?? [];
    for (const p of patterns) {
      for (const sub of p.matchingSubCategories ?? []) {
        const prev = populationBySub.get(sub) ?? 0;
        if (p.frequency > prev) populationBySub.set(sub, p.frequency);
      }
    }
  } catch {
    populationBySub = new Map();
  }

  // 4. Combined score per subCategory.
  const combinedBySub = new Map<string, number>();
  const allSubs = new Set<string>([...weaknessBySub.keys(), ...populationBySub.keys()]);
  for (const sub of allSubs) {
    const sw = weaknessBySub.get(sub) ?? 0;
    const pf = populationBySub.get(sub) ?? 0;
    combinedBySub.set(sub, sw * STUDENT_WEIGHT + pf * POPULATION_WEIGHT);
  }

  // 5. Prioritised list of subCategories — only the ones with positive score
  //    actually map to a KB error or interference pattern. Honour an explicit
  //    subCategory filter if the caller passed one.
  const rankedSubs = opts.subCategory
    ? [opts.subCategory]
    : uniqueOrdered(
        Array.from(combinedBySub.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([sub]) => sub),
      );

  if (rankedSubs.length === 0) {
    // KB present but no mappable errors — fall back to plain getExercisesForStudent.
    const args: Record<string, unknown> = {
      studentSlug: opts.studentSlug ?? '',
      limit,
    };
    if (opts.category) args.category = opts.category;
    let exercises: ConvexExercise[] = [];
    try {
      exercises = (await queryConvex<ConvexExercise[]>(
        'practice:getExercisesForStudent',
        args,
      )) ?? [];
    } catch {
      exercises = [];
    }
    return {
      exercises: exercises.slice(0, limit),
      reasonString: 'KB loaded but no error categories mapped to the exercise bank.',
    };
  }

  // 6. Fan-out fetch over the top-N subCategories. Cap N so we don't blast
  //    Convex with one round-trip per micro-bucket — 6 covers >95% of real KBs.
  const maxBuckets = Math.min(6, rankedSubs.length);
  const perBucketLimit = Math.max(3, Math.ceil(limit / maxBuckets));
  const collected: ConvexExercise[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < maxBuckets; i++) {
    const sub = rankedSubs[i];
    try {
      const rows = (await queryConvex<ConvexExercise[]>(
        'practice:getExercisesForStudent',
        {
          studentSlug: opts.studentSlug ?? '',
          ...(opts.category ? { category: opts.category } : {}),
          subCategory: sub,
          limit: perBucketLimit,
        },
      )) ?? [];
      for (const r of rows) {
        if (seen.has(r.exerciseId)) continue;
        seen.add(r.exerciseId);
        collected.push(r);
      }
    } catch {
      // ignore per-bucket failures
    }
  }

  // 7. Final per-exercise scoring: re-rank by combinedScore at the
  //    exercise's subCategory, breaking ties on polishDifficultyScore.
  collected.sort((a, b) => {
    const aScore = combinedBySub.get(a.subCategory) ?? 0;
    const bScore = combinedBySub.get(b.subCategory) ?? 0;
    if (bScore !== aScore) return bScore - aScore;
    return (b.polishDifficultyScore ?? 0) - (a.polishDifficultyScore ?? 0);
  });

  return {
    exercises: collected.slice(0, limit),
    reasonString: dominantReason,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook entry point
// ─────────────────────────────────────────────────────────────────────────────
export function useStudentExercises(opts: UseStudentExercisesOptions): UseStudentExercisesResult {
  const key = cacheKey(opts);
  const cached = RESULT_CACHE.get(key);

  const [state, setState] = useState<UseStudentExercisesResult>(() =>
    cached
      ? {
          exercises: cached.exercises,
          status: 'ready',
          mode: cached.mode,
          reasonString: cached.reasonString,
        }
      : {
          exercises: null,
          status: opts.studentSlug ? 'loading' : 'idle',
          mode: 'cold-start',
          reasonString: 'Resolving student exercises…',
        },
  );

  useEffect(() => {
    // No slug → we're on the design canvas / not logged in. Stay idle so
    // callers can render the demo puzzle.
    if (!opts.studentSlug) {
      setState({
        exercises: null,
        status: 'idle',
        mode: 'cold-start',
        reasonString: 'No student selected — design canvas mode.',
      });
      return;
    }

    // Cache hit — short-circuit.
    const hit = RESULT_CACHE.get(key);
    if (hit) {
      setState({
        exercises: hit.exercises,
        status: 'ready',
        mode: hit.mode,
        reasonString: hit.reasonString,
      });
      return;
    }

    let cancelled = false;
    setState((prev) => ({ ...prev, status: 'loading' }));

    (async () => {
      try {
        // Detect inputs in parallel.
        const [progressResult, kbResult] = await Promise.allSettled([
          queryConvex<PracticeProgressRow[]>('practice:listForStudent', {
            studentSlug: opts.studentSlug ?? '',
          }),
          fetchKB(opts.studentSlug as string),
        ]);

        if (cancelled) return;

        const progressRows: PracticeProgressRow[] =
          progressResult.status === 'fulfilled' ? progressResult.value ?? [] : [];
        const kb: NormalisedKB | null =
          kbResult.status === 'fulfilled' ? kbResult.value : null;

        // ── Mode selection ─────────────────────────────────────
        // Sprint-2 Finding 2 (2026-05-02): when launched from a topic
        // grouping, FORCE cold-start mode. The user's intent is "give me
        // exercises for THIS specific topic"; KB-driven personalization
        // (which would otherwise re-rank away from the topic) defeats
        // that intent. The cold-start path's groupId arg short-circuits
        // server-side to a by_groupId index lookup.
        let mode: ExerciseDeliveryMode;
        let result: { exercises: ConvexExercise[]; reasonString: string };

        if (opts.groupId) {
          mode = 'cold-start';
          result = await fetchColdStart(opts);
        } else if (kb && kb.errors && kb.errors.length > 0) {
          mode = 'kb-enhanced';
          result = await fetchKBEnhanced(opts, kb);
        } else if (progressRows.length >= WARM_MODE_MIN_PROGRESS_ROWS) {
          mode = 'warm';
          result = await fetchWarm(opts, progressRows);
        } else {
          mode = 'cold-start';
          result = await fetchColdStart(opts);
        }

        if (cancelled) return;

        RESULT_CACHE.set(key, {
          exercises: result.exercises,
          mode,
          reasonString: result.reasonString,
        });

        setState({
          exercises: result.exercises,
          status: 'ready',
          mode,
          reasonString: result.reasonString,
        });
      } catch (err) {
        if (cancelled) return;
        setState({
          exercises: null,
          status: 'error',
          mode: 'cold-start',
          reasonString: 'Failed to resolve student exercises.',
          error: err instanceof Error ? err.message : 'unknown',
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    key,
    opts.shellKey,
    opts.studentSlug,
    opts.category,
    opts.subCategory,
    opts.limit,
  ]);

  return state;
}

// ─── Test/debug exports — allow other modules (and unit tests) to import the
// internal helpers without re-implementing them. Not part of the consumer API.
export const __INTERNAL__ = {
  KB_CATEGORY_TO_SUBCATEGORY,
  WARM_MODE_MIN_PROGRESS_ROWS,
  WARM_STRUGGLE_THRESHOLD,
  WARM_MASTERY_THRESHOLD,
  FOSSILIZED_BOOST,
  STUDENT_WEIGHT,
  POPULATION_WEIGHT,
  pickDominantError,
  deriveSubCategoryFromProgressRow,
  progressRowAccuracy,
};
