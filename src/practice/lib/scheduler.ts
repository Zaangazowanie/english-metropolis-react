// scheduler.ts — pure helpers for the §4-#21 Phase 1.2/1.3/1.5 content
// scheduler. Authored 2026-05-02 by Ricky.
//
// Three concerns, three helpers, all pure (no hooks, no I/O):
//
//   1. Per-keyword exposure budget (Phase 1.2)
//        isEligibleByExposureBudget(itemId, recent, opts?)
//        Caps any single keyword to N exposures per rolling window;
//        once at-or-over cap, the item is "muted" until enough rows
//        age out of the window. Default: 3 exposures per 24h.
//
//   2. Leitner spaced-rep intervals (Phase 1.3)
//        leitnerEligibility(itemId, recent, opts?)
//        Reads the rolling 30d exposure log for this item, counts
//        exposures and computes lastSeenDays. Returns
//        { eligible, nextDueAt, exposures, lastSeenDays }.
//        Schedule:
//          0 exposures   → show now
//          1 exposure    → 1 day  later
//          2 exposures   → 3 days later
//          3 exposures   → 7 days later
//          4+ exposures  → 14 days later
//
//   3. Cross-shell variety guard (Phase 1.5)
//        varietyPenalty(itemId, currentShell, sessionShells)
//        Returns a multiplicative weight in [0, 1]. 1.0 = no penalty;
//        0.5 = item appeared in a prior shell THIS SESSION; 0.25 = it
//        appeared in *multiple* prior shells this session (compounded).
//
// All three are designed to fail OPEN: when input data is empty/missing,
// the helper returns the maximally-permissive answer (eligible=true,
// weight=1). Practice never breaks because the exposure log is empty —
// it just lacks a hint.
//
// Wiring (StudentPractice.tsx → buildShellPuzzle):
//   const filtered = vocab
//     .filter(v => isEligibleByExposureBudget(`kw:${v.word.toLowerCase()}`, recent))
//     .filter(v => leitnerEligibility(`kw:${v.word.toLowerCase()}`, recent).eligible)
//     .map(v => ({
//       v,
//       weight: varietyPenalty(`kw:${v.word.toLowerCase()}`, shell, sessionShells),
//     }))
//     .sort((a, b) => b.weight - a.weight)
//     .map(x => x.v);
//
// Why pure (no React, no Convex)?
//   - Trivially unit-mindable (every branch is a one-line input → output).
//   - The hook wrappers in exposure.ts (useExposureBudgetCheck etc.) are
//     1-liner adapters over these. Keeps the testable surface flat.
//   - Lets G3 / G4 / future agents reuse the same logic from non-React
//     contexts (eg. background prefetch).

import type { ExposureRow } from './exposure';

// ─── Tunables (collected at top so the audit trail is in one place) ──

/** Default exposure-budget cap: any one keyword may appear at most this
 *  many times in the rolling window before being muted. */
export const DEFAULT_EXPOSURE_CAP = 3;

/** Default exposure-budget rolling window: 24 hours. */
export const DEFAULT_BUDGET_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Leitner schedule: index = exposure count, value = wait in days
 *  before the item is eligible again. Index ≥ 4 clamps to the last entry. */
export const LEITNER_INTERVAL_DAYS: readonly number[] = [0, 1, 3, 7, 14];

/** Leitner read window — only count exposures within the last 30 days. */
export const LEITNER_READ_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/** Variety guard: multiplicative penalty per prior shell this session.
 *  1 prior shell → 0.5; 2 prior shells → 0.25; 3+ → 0.125 (clamped). */
export const VARIETY_PENALTY_FACTOR = 0.5;

/** Variety guard: floor on the penalty so a wildly over-used keyword
 *  still has a non-zero chance of being picked when nothing else is
 *  eligible. Without this, a sufficiently noisy session would empty
 *  the pool. */
export const VARIETY_PENALTY_FLOOR = 0.125;

// ─── 1. Per-keyword exposure budget (Phase 1.2) ──────────────────────

export interface ExposureBudgetOptions {
  /** How many exposures within the window before muting. Default 3. */
  cap?: number;
  /** Rolling window in ms. Default 24h. */
  windowMs?: number;
  /** Now-clock injection for tests. Default Date.now(). */
  now?: number;
}

/**
 * isEligibleByExposureBudget — return false IFF this item has hit the
 * cap inside the rolling window. Empty exposures → always eligible.
 *
 * Counts ALL exposures for the itemId regardless of which shell they
 * came from — the budget is per-keyword, not per-keyword-per-shell.
 */
export function isEligibleByExposureBudget(
  itemId: string,
  recent: readonly ExposureRow[] | null | undefined,
  opts?: ExposureBudgetOptions,
): boolean {
  if (!itemId || !recent || recent.length === 0) return true;
  const cap = opts?.cap ?? DEFAULT_EXPOSURE_CAP;
  const windowMs = opts?.windowMs ?? DEFAULT_BUDGET_WINDOW_MS;
  const now = opts?.now ?? Date.now();
  const cutoff = now - windowMs;
  let count = 0;
  for (const row of recent) {
    if (row.itemId !== itemId) continue;
    if (row.exposedAt < cutoff) continue;
    count += 1;
    // Early exit — once we hit the cap there's no need to keep counting.
    if (count >= cap) return false;
  }
  return true;
}

// ─── 2. Leitner spaced-rep intervals (Phase 1.3) ─────────────────────

export interface LeitnerStatus {
  /** True if the item is due (or has never been seen). */
  eligible: boolean;
  /** When the item next becomes due (ms epoch). null if eligible NOW. */
  nextDueAt: number | null;
  /** Number of times this item has been exposed in the read window. */
  exposures: number;
  /** Days since most recent exposure. null if never seen. */
  lastSeenDays: number | null;
}

export interface LeitnerOptions {
  /** Rolling read window in ms. Default 30d. */
  windowMs?: number;
  /** Now-clock injection for tests. Default Date.now(). */
  now?: number;
  /** Override the schedule for tests / future tuning. */
  intervalDays?: readonly number[];
}

/**
 * leitnerEligibility — read all exposures for `itemId` in the rolling
 * window, return whether the item is currently due plus diagnostic
 * fields the UI / hint banner can surface.
 *
 * Phase 1 simplification per spec: ignores correctness signal (we
 * don't have it yet on `practiceExposure`). Treats every exposure as
 * a "seen" event and applies the strict spaced-rep schedule.
 */
export function leitnerEligibility(
  itemId: string,
  recent: readonly ExposureRow[] | null | undefined,
  opts?: LeitnerOptions,
): LeitnerStatus {
  if (!itemId) {
    return { eligible: true, nextDueAt: null, exposures: 0, lastSeenDays: null };
  }
  const windowMs = opts?.windowMs ?? LEITNER_READ_WINDOW_MS;
  const now = opts?.now ?? Date.now();
  const schedule = opts?.intervalDays ?? LEITNER_INTERVAL_DAYS;
  const cutoff = now - windowMs;

  let exposures = 0;
  let lastSeenAt: number | null = null;
  if (recent && recent.length > 0) {
    for (const row of recent) {
      if (row.itemId !== itemId) continue;
      if (row.exposedAt < cutoff) continue;
      exposures += 1;
      if (lastSeenAt === null || row.exposedAt > lastSeenAt) {
        lastSeenAt = row.exposedAt;
      }
    }
  }

  // Never seen → show now.
  if (exposures === 0 || lastSeenAt === null) {
    return { eligible: true, nextDueAt: null, exposures: 0, lastSeenDays: null };
  }

  // Schedule lookup, clamping to the last slot.
  const idx = Math.min(exposures, schedule.length - 1);
  const waitDays = schedule[idx] ?? schedule[schedule.length - 1];
  const dueAt = lastSeenAt + waitDays * 24 * 60 * 60 * 1000;
  const lastSeenDays = (now - lastSeenAt) / (24 * 60 * 60 * 1000);

  if (now >= dueAt) {
    return { eligible: true, nextDueAt: null, exposures, lastSeenDays };
  }
  return { eligible: false, nextDueAt: dueAt, exposures, lastSeenDays };
}

// ─── 3. Cross-shell variety guard (Phase 1.5) ────────────────────────

/**
 * SessionShellHistory — flat list of itemIds shown in each prior shell
 * this session. `sessionShells[i]` is the array of itemIds shown in
 * the i-th shell the student visited this session. The CURRENT shell
 * is NOT in this list (StudentPractice.tsx pushes onto it on shell
 * exit, not entry).
 *
 * Persistence: the consumer (a hook in exposure.ts) keeps this in
 * localStorage under `em.sessionShells` keyed by student slug, with
 * a session-rollover boundary (>1h gap clears it).
 */
export type SessionShellHistory = readonly (readonly string[])[];

/**
 * varietyPenalty — return a multiplicative weight in [floor, 1] for
 * the given itemId, demoting it once for every prior shell THIS
 * SESSION in which it appeared.
 *
 * No prior shells / item never seen → 1.0 (no penalty).
 * 1 prior shell → 0.5
 * 2 prior shells → 0.25
 * 3+ prior shells → 0.125 (floor, clamped)
 *
 * `currentShell` is accepted for API symmetry / future per-shell
 * tuning, but not used by the current calculation — the spec only
 * cares about whether the item appeared in any PRIOR shell in this
 * session, regardless of which shell we're currently building for.
 */
export function varietyPenalty(
  itemId: string,
  currentShell: string,
  sessionShells: SessionShellHistory | null | undefined,
): number {
  // currentShell is reserved for future per-shell weighting. Reference
  // it once so the linter doesn't strip the param + so future tuning
  // (eg. "demote harder for word-tile shells") has a stable hook.
  void currentShell;
  if (!itemId || !sessionShells || sessionShells.length === 0) return 1.0;
  let priorShellsContainingItem = 0;
  for (const shell of sessionShells) {
    if (!shell || shell.length === 0) continue;
    if (shell.includes(itemId)) priorShellsContainingItem += 1;
  }
  if (priorShellsContainingItem === 0) return 1.0;
  // Compound: 0.5 ^ priorCount, floored.
  const raw = Math.pow(VARIETY_PENALTY_FACTOR, priorShellsContainingItem);
  return Math.max(VARIETY_PENALTY_FLOOR, raw);
}

// ─── Compound helper used by buildShellPuzzle ───────────────────────

export interface ScheduledItem<T> {
  item: T;
  weight: number;
  /** Diagnostic fields — useful for dev logging / a future "why this
   *  keyword?" tooltip on the practice page. Never surfaced to learners. */
  diagnostics: {
    eligibleByBudget: boolean;
    leitner: LeitnerStatus;
    varietyWeight: number;
  };
}

export interface ScheduleVocabOptions {
  /** Item-id resolver. Defaults to `kw:<lowercased word>`. */
  itemIdOf?: (item: { word?: string }) => string;
  /** Inject for tests. */
  now?: number;
  /** Forwarded to the budget helper. */
  budget?: ExposureBudgetOptions;
  /** Forwarded to the Leitner helper. */
  leitner?: LeitnerOptions;
}

/**
 * scheduleVocab — combines all three Phase-1 helpers into a single
 * filter + reweight pass over a vocab list. Returns the survivors
 * sorted by weight desc. Items dropped by the budget OR the Leitner
 * filter never appear in the result; items penalised by the variety
 * guard appear at the bottom.
 *
 * Failure-safe: when `recent` is null/empty AND `sessionShells` is
 * null/empty, every item passes with weight 1, so the vocab list
 * comes back in its original order. (Non-mutating sort: stable on
 * V8 / SpiderMonkey for 2024+ runtimes.)
 */
export function scheduleVocab<T extends { word?: string }>(
  vocab: readonly T[] | null | undefined,
  recent: readonly ExposureRow[] | null | undefined,
  currentShell: string,
  sessionShells: SessionShellHistory | null | undefined,
  opts?: ScheduleVocabOptions,
): T[] {
  if (!vocab || vocab.length === 0) return [];
  const idOf =
    opts?.itemIdOf ?? ((v: { word?: string }) => `kw:${(v.word ?? '').trim().toLowerCase()}`);
  const out: ScheduledItem<T>[] = [];
  for (const v of vocab) {
    const id = idOf(v);
    if (!id || id === 'kw:') continue;
    const eligibleByBudget = isEligibleByExposureBudget(id, recent, opts?.budget);
    if (!eligibleByBudget) continue;
    const leitner = leitnerEligibility(id, recent, opts?.leitner);
    if (!leitner.eligible) continue;
    const varietyWeight = varietyPenalty(id, currentShell, sessionShells);
    out.push({
      item: v,
      weight: varietyWeight,
      diagnostics: { eligibleByBudget, leitner, varietyWeight },
    });
  }
  out.sort((a, b) => b.weight - a.weight);
  return out.map((x) => x.item);
}
