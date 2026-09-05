// exposure.ts — frontend wiring for the session-level exposure memory.
//
// Phase 1.1 of the §4-#21 (Mike CRITICAL) content-scheduler sprint.
// Authored 2026-05-02 by Ricky.
//
// This module is the thin bridge between the `practiceExposure` Convex
// table (see convex/exposure.ts) and the React shell-render flow. It
// exposes:
//
//   useStudentExposure()
//     — hook that returns { recordExposure, recordExposureBatch,
//         recentExposures } bound to the currently-logged-in student
//       (slug pulled from localStorage). Anonymous callers no-op,
//       matching the Convex side.
//
//   recordPuzzleExposure(shellKey, puzzle, exercises)
//     — pure helper that walks any of the 38 shell puzzles and
//       returns the Set of itemIds + itemKinds visible in it. The
//       hook then ships that set off to Convex in a single batch.
//
// Why a separate file (not in convex-stubs.ts):
//   convex-stubs.ts owns per-shell *progress* persistence. Exposure is
//   a different concern (read-mostly, pruned, doesn't drive the shell's
//   state machine). Keeping the two apart keeps each one short and
//   makes G2 / Leitner / modal agents easy to bolt on.
//
// What this file does NOT do:
//   - re-rank or filter generator output (G2's job)
//   - persist Leitner box state (G3's job)
//   - render the "Show me fresh stuff" modal (G4's job)
//   - touch the suitability filter, hint sanitiser, generators, or
//     shell components

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchWithTimeout } from './practice-cache';
import { readStudentSession, isStudentView } from '../../lib/student-session.js';
import {
  isEligibleByExposureBudget,
  leitnerEligibility,
  varietyPenalty,
  type ExposureBudgetOptions,
  type LeitnerOptions,
  type LeitnerStatus,
  type SessionShellHistory,
} from './scheduler';

// ─── Types ────────────────────────────────────────────────────────────

export type ExposureItemKind = 'exercise' | 'keyword';

export interface ExposureItem {
  itemId: string;
  itemKind: ExposureItemKind;
}

export interface ExposureRow {
  itemId: string;
  itemKind: ExposureItemKind;
  shellKey: string;
  exposedAt: number;
}

export interface UseStudentExposure {
  /** Fire-and-forget: record a single item exposure. */
  recordExposure: (item: ExposureItem, shellKey: string) => void;
  /** Fire-and-forget: record many items in one HTTP round-trip. */
  recordExposureBatch: (items: ExposureItem[], shellKey: string) => void;
  /**
   * Synchronously read the most-recently-fetched batch of recent
   * exposures (last 7d by default). Triggers a background refresh.
   * Useful for downstream consumers (G2 variety guard) — Phase 1.1
   * just exposes the read; the actual filtering is G2's call.
   */
  recentExposures: ExposureRow[];
  /** Force a re-fetch of recentExposures (after a recordExposureBatch). */
  refreshRecentExposures: () => void;
}

// ─── Local state ──────────────────────────────────────────────────────
const LEGACY_SLUG_KEY = 'studentSlug';

function readStudentSlug(): string | undefined {
  const student = readStudentSession();
  if (student?.slug) return student.slug;
  if (isStudentView()) return undefined;
  if (typeof window === 'undefined') return undefined;
  try {
    return window.localStorage.getItem(LEGACY_SLUG_KEY) || undefined;
  } catch {
    return undefined;
  }
}

// ─── Convex HTTP helpers (mirror convex-stubs.ts pattern) ────────────
async function mutateConvex<T>(path: string, args: Record<string, unknown>): Promise<T> {
  const response = await fetchWithTimeout('/api/mutation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, args }),
  });
  if (!response.ok) throw new Error(`${path} failed with ${response.status}`);
  const payload = await response.json();
  if (payload?.status !== 'success') {
    throw new Error(`${path} returned ${payload?.status || 'unknown status'}`);
  }
  return payload.value as T;
}

async function queryConvex<T>(path: string, args: Record<string, unknown>): Promise<T> {
  const response = await fetchWithTimeout('/api/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, args }),
  });
  if (!response.ok) throw new Error(`${path} failed with ${response.status}`);
  const payload = await response.json();
  if (payload?.status !== 'success') {
    throw new Error(`${path} returned ${payload?.status || 'unknown status'}`);
  }
  return payload.value as T;
}

// ─── Hook ────────────────────────────────────────────────────────────
/**
 * useStudentExposure — bind the recordExposure / recentExposures helpers
 * to the currently-logged-in student. Resolves the slug from
 * localStorage (em-student-session). Anonymous callers get no-op
 * record functions and an empty recentExposures array.
 *
 * The recent-exposures fetch happens once on mount + on demand via
 * `refreshRecentExposures()`. The hook deliberately does NOT subscribe
 * to a Convex live query — at this scale (≤500 rows / 7d) a one-shot
 * fetch + manual refresh is plenty, and avoids needing a ConvexProvider
 * at the app root (lexicon-source uses raw fetch — see convex-stubs.ts
 * header for rationale).
 */
export function useStudentExposure(): UseStudentExposure {
  const slug = readStudentSlug();
  const studentView = isStudentView();
  // De-dupe ring: avoid spamming the backend with the exact same
  // (itemId, shellKey) within a few seconds. Lots of shells re-render
  // during a single session and we don't want each render to re-log.
  // Map<key, lastSentAtMs>. Key = `${shellKey}::${itemId}`.
  const sentRecentlyRef = useRef<Map<string, number>>(new Map());
  const DEDUPE_WINDOW_MS = 60 * 1000; // 60s — recordings inside this window collapse

  const [recent, setRecent] = useState<ExposureRow[]>([]);
  const refreshLockRef = useRef(false);

  const refreshRecentExposures = useCallback(() => {
    if (!slug || refreshLockRef.current) return;
    refreshLockRef.current = true;
    void queryConvex<ExposureRow[]>('exposure:recentExposures', {
      studentSlug: slug,
      withinMs: 7 * 24 * 60 * 60 * 1000,
      limit: 500,
    })
      .then((rows) => setRecent(rows ?? []))
      .catch(() => {
        // Non-fatal. Variety guard will simply lack a hint this load.
      })
      .finally(() => {
        refreshLockRef.current = false;
      });
  }, [slug]);

  useEffect(() => {
    refreshRecentExposures();
  }, [refreshRecentExposures]);

  const recordExposure = useCallback(
    (item: ExposureItem, shellKey: string) => {
      if (!slug || studentView || isStudentView()) return;
      const k = `${shellKey}::${item.itemId}`;
      const now = Date.now();
      const last = sentRecentlyRef.current.get(k);
      if (last && now - last < DEDUPE_WINDOW_MS) return;
      sentRecentlyRef.current.set(k, now);
      void mutateConvex('exposure:recordExposure', {
        studentSlug: slug,
        itemId: item.itemId,
        itemKind: item.itemKind,
        shellKey,
      }).catch(() => {
        // Non-fatal — exposure tracking is observability, not business
        // logic. A failed write just means G2 has slightly worse
        // signal next time.
      });
    },
    [slug, studentView],
  );

  const recordExposureBatch = useCallback(
    (items: ExposureItem[], shellKey: string) => {
      if (!slug || studentView || isStudentView() || items.length === 0) return;
      const now = Date.now();
      // Filter out anything we logged for this shell in the last
      // DEDUPE_WINDOW_MS — the same puzzle re-mounting shouldn't
      // re-log the same 12 items.
      const fresh: ExposureItem[] = [];
      for (const it of items) {
        const k = `${shellKey}::${it.itemId}`;
        const last = sentRecentlyRef.current.get(k);
        if (last && now - last < DEDUPE_WINDOW_MS) continue;
        sentRecentlyRef.current.set(k, now);
        fresh.push(it);
      }
      if (fresh.length === 0) return;
      void mutateConvex('exposure:recordExposureBatch', {
        studentSlug: slug,
        shellKey,
        items: fresh,
      }).catch(() => {
        // Non-fatal.
      });
    },
    [slug, studentView],
  );

  return useMemo(
    () => ({
      recordExposure,
      recordExposureBatch,
      recentExposures: recent,
      refreshRecentExposures,
    }),
    [recordExposure, recordExposureBatch, recent, refreshRecentExposures],
  );
}

// ─── Pure helpers for extracting itemIds from a built puzzle ────────

/**
 * extractExerciseItemIdsFromExercises — pull the .exerciseId off each
 * row in a ConvexExercise[] array. Used when we already have the
 * exercise rows (i.e. exercise-derived puzzle path). This is the
 * highest-signal source — exerciseIds are stable across sessions.
 */
export function extractExerciseItemIds(
  exercises: ReadonlyArray<{ exerciseId?: string }> | null | undefined,
): ExposureItem[] {
  if (!exercises || exercises.length === 0) return [];
  const out: ExposureItem[] = [];
  const seen = new Set<string>();
  for (const ex of exercises) {
    if (!ex.exerciseId || seen.has(ex.exerciseId)) continue;
    seen.add(ex.exerciseId);
    out.push({ itemId: ex.exerciseId, itemKind: 'exercise' });
  }
  return out;
}

/**
 * extractKeywordItemIds — vocab fallback path. We don't have stable
 * keyword UUIDs in the VocabItem, so we use the lowercase word itself
 * as the itemId. That's enough to detect "saw 'resilience' five
 * shells in a row" — the variety guard doesn't need a Convex _id.
 */
export function extractKeywordItemIds(
  vocab: ReadonlyArray<{ word?: string }> | null | undefined,
): ExposureItem[] {
  if (!vocab || vocab.length === 0) return [];
  const out: ExposureItem[] = [];
  const seen = new Set<string>();
  for (const v of vocab) {
    const w = v.word?.trim().toLowerCase();
    if (!w || seen.has(w)) continue;
    seen.add(w);
    out.push({ itemId: `kw:${w}`, itemKind: 'keyword' });
  }
  return out;
}

// ─── Phase 1.2/1.3/1.5 hook wrappers (Ricky 2026-05-02) ──────────────
//
// Thin React adapters over the pure helpers in scheduler.ts. These are
// the public frontend surface the spec promises:
//
//   useExposureBudgetCheck(itemId) → boolean
//   useLeitnerEligibility(itemId)  → { eligible, nextDueAt, ... }
//   useVarietyPenalty(itemId, currentShell, sessionShells) → number
//
// Plus one helper Mike didn't enumerate but is needed to make the
// variety guard work end-to-end:
//
//   useSessionShellHistory(currentShell) → { sessionShells, pushShell }
//
// All four are pure-derived from the existing useStudentExposure() —
// no new fetches, no new Convex schema. They just slice the same
// `recentExposures` payload through the scheduler helpers.

/**
 * useExposureBudgetCheck — true iff the keyword may still be shown
 * under the rolling-window cap. Reads from the SAME recentExposures
 * payload the rest of the practice page uses. Failure-safe: returns
 * true when the exposure log is empty / unavailable.
 */
export function useExposureBudgetCheck(
  itemId: string | null | undefined,
  opts?: ExposureBudgetOptions,
): boolean {
  const { recentExposures } = useStudentExposure();
  return useMemo(
    () => (itemId ? isEligibleByExposureBudget(itemId, recentExposures, opts) : true),
    [itemId, recentExposures, opts],
  );
}

/**
 * useLeitnerEligibility — Leitner status for a single item. Returns
 * { eligible, nextDueAt, exposures, lastSeenDays }. nextDueAt is
 * a UTC epoch ms; null when the item is currently due.
 */
export function useLeitnerEligibility(
  itemId: string | null | undefined,
  opts?: LeitnerOptions,
): LeitnerStatus {
  const { recentExposures } = useStudentExposure();
  return useMemo(
    () =>
      itemId
        ? leitnerEligibility(itemId, recentExposures, opts)
        : { eligible: true, nextDueAt: null, exposures: 0, lastSeenDays: null },
    [itemId, recentExposures, opts],
  );
}

/**
 * useVarietyPenalty — multiplicative weight in [0, 1] for the given
 * itemId in the given shell, given the session-shell history. Pure
 * derivation — caller is responsible for passing in `sessionShells`
 * (use `useSessionShellHistory` to source it).
 */
export function useVarietyPenalty(
  itemId: string | null | undefined,
  currentShell: string,
  sessionShells: SessionShellHistory | null | undefined,
): number {
  return useMemo(
    () => (itemId ? varietyPenalty(itemId, currentShell, sessionShells) : 1.0),
    [itemId, currentShell, sessionShells],
  );
}

// ─── Session shell history (variety-guard backing store) ─────────────
//
// localStorage-backed list of shells visited THIS session, where each
// entry is an array of itemIds shown in that shell. A "session" rolls
// over after >1h of inactivity (matches the 24h budget window's
// session granularity — anything tighter would split a single tutoring
// hour into multiple "sessions" and lose the variety signal).

const SESSION_SHELLS_KEY_PREFIX = 'em.sessionShells:';
const SESSION_SHELLS_TS_KEY_PREFIX = 'em.sessionShells.ts:';
const SESSION_ROLLOVER_MS = 60 * 60 * 1000; // 1 hour

interface SessionShellsState {
  shells: string[][];
  lastTouchedAt: number;
}

function readSessionShells(slug: string): SessionShellsState {
  if (typeof window === 'undefined') return { shells: [], lastTouchedAt: 0 };
  try {
    const raw = window.localStorage.getItem(SESSION_SHELLS_KEY_PREFIX + slug);
    const tsRaw = window.localStorage.getItem(SESSION_SHELLS_TS_KEY_PREFIX + slug);
    const ts = tsRaw ? parseInt(tsRaw, 10) : 0;
    if (!raw) return { shells: [], lastTouchedAt: ts };
    const shells = JSON.parse(raw) as string[][];
    if (!Array.isArray(shells)) return { shells: [], lastTouchedAt: ts };
    return { shells, lastTouchedAt: ts };
  } catch {
    return { shells: [], lastTouchedAt: 0 };
  }
}

function writeSessionShells(slug: string, shells: string[][], now: number) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SESSION_SHELLS_KEY_PREFIX + slug, JSON.stringify(shells));
    window.localStorage.setItem(SESSION_SHELLS_TS_KEY_PREFIX + slug, String(now));
  } catch {
    /* quota exceeded — the variety guard just becomes a no-op for the rest of this session */
  }
}

export interface UseSessionShellHistory {
  /** All prior shells THIS session. Does NOT include the current shell
   *  until pushShell() is called (which we do on shell EXIT, not entry). */
  sessionShells: SessionShellHistory;
  /** Append the items just shown in `shellKey` to the session history. */
  pushShell: (shellKey: string, itemIds: string[]) => void;
  /** Wipe the session history (eg. when the student manually starts a
   *  fresh run from the run-control modal). */
  clearSession: () => void;
}

/**
 * useSessionShellHistory — hook-shaped accessor for the session-level
 * shell history backing the variety guard. Auto-rolls over after 1h
 * of inactivity. The buildShellPuzzle wiring should:
 *
 *   1. read `sessionShells` BEFORE filtering vocab for the new shell
 *   2. call `pushShell(currentShell, itemIdsShownInIt)` once the
 *      puzzle has been materialised, so the NEXT shell entry sees
 *      this shell as a "prior" one.
 */
export function useSessionShellHistory(): UseSessionShellHistory {
  const slug = readStudentSlug() ?? '__anon__';
  const studentView = isStudentView();
  const [state, setState] = useState<SessionShellsState>(() => {
    const stored = readSessionShells(slug);
    const now = Date.now();
    if (stored.lastTouchedAt && now - stored.lastTouchedAt > SESSION_ROLLOVER_MS) {
      return { shells: [], lastTouchedAt: now };
    }
    return stored;
  });

  const pushShell = useCallback(
    (shellKey: string, itemIds: string[]) => {
      // shellKey is accepted for parity with the variety-guard API + so
      // future per-shell weighting has the value at hand. We don't key
      // the array by it because the spec only cares about "which prior
      // shells contained item X", not "which shell was X in".
      void shellKey;
      if (!itemIds || itemIds.length === 0) return;
      setState((prev) => {
        const now = Date.now();
        // Re-check rollover at write time too — handles tabs left open.
        const rolled =
          prev.lastTouchedAt && now - prev.lastTouchedAt > SESSION_ROLLOVER_MS
            ? []
            : prev.shells;
        // De-dupe within the new shell's itemIds before persisting.
        const seen = new Set<string>();
        const fresh: string[] = [];
        for (const id of itemIds) {
          if (!id || seen.has(id)) continue;
          seen.add(id);
          fresh.push(id);
        }
        const next = [...rolled, fresh];
        // Cap session history to the last 10 shells — anything older
        // is rarely a useful "this session" signal and bloats storage.
        const capped = next.length > 10 ? next.slice(next.length - 10) : next;
        if (!studentView && !isStudentView()) writeSessionShells(slug, capped, now);
        return { shells: capped, lastTouchedAt: now };
      });
    },
    [slug, studentView],
  );

  const clearSession = useCallback(() => {
    if (!studentView && !isStudentView() && typeof window !== 'undefined') {
      try {
        window.localStorage.removeItem(SESSION_SHELLS_KEY_PREFIX + slug);
        window.localStorage.removeItem(SESSION_SHELLS_TS_KEY_PREFIX + slug);
      } catch {
        /* ignore */
      }
    }
    setState({ shells: [], lastTouchedAt: Date.now() });
  }, [slug, studentView]);

  return useMemo(
    () => ({
      sessionShells: state.shells,
      pushShell,
      clearSession,
    }),
    [state.shells, pushShell, clearSession],
  );
}
