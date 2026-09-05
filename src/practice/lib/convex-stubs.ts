// convex-stubs.ts
// ─────────────────────────────────────────────────────────────────────────────
// Per-shell progress persistence for the 10 practice shells. Backed by Convex
// (table `practiceProgress`, see convex/practice.ts).
//
// Authored by Agent 3 in the unify-build (2026-04-30). Replaces the
// localStorage-only stub used during the visual-design phase.
//
// HISTORY
//   v1 (design phase): localStorage shim, no backend.
//   v2 (this file):    real Convex persistence via /api/query + /api/mutation.
//                      Same `useShellProgress(shellId)` signature so no shell
//                      file had to change.
//
// IMPORTANT — why we don't use convex/react's useQuery/useMutation
// ─────────────────────────────────────────────────────────────────────────────
// Lexicon does NOT wire ConvexReactClient / ConvexProvider at the app root.
// All other Convex calls in this codebase go through fetch('/api/mutation') and
// fetch('/api/query'), proxied to Convex by nginx (see /api/* in nginx config).
// See src/contexts/StudentAuthContext.jsx and src/hooks/useStudentData.js for
// the canonical examples we mirror here.
//
// AUTH
// ─────────────────────────────────────────────────────────────────────────────
// The student session is stored in localStorage under em-student-session
// (set by StudentAuthContext.studentLogin). We read the slug from that blob
// and pass it to the backend as `studentSlug`. If no session is present
// (design canvas, dev preview), we still call the backend with no slug —
// the Convex mutation falls back to an `__anon__` row so we don't trample
// real students' state.
// ─────────────────────────────────────────────────────────────────────────────

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { ArcadeFeedbackContext } from './arcade-feedback';
import { fetchWithTimeout } from './practice-cache';
import { readStudentSession, isStudentView } from '../../lib/student-session.js';

// ─── Shared types — mirror the Convex schema ─────────────────────────────────
//
// `ShellState` is the union of every per-shell renderable state. Keep this in
// sync with the `state` prop accepted by each shell — it's the same set the
// design canvas's "force state" tweak emits.
export type ShellState = 'empty' | 'active' | 'wrong' | 'correct' | 'complete';

// Identifier for a shell instance. Convention: `${shellKey}` where shellKey is
// one of `crossword | wordsearch | gapfill | ...`. The Convex table keys
// (studentSlug, shellId, exerciseId) so the same student replaying the
// Crossword overwrites their own row, not somebody else's.
export type ShellId = string;

// `ShellProgress` is what `save()` accepts and what `useShellProgress` returns
// (minus the callback). 0 ≤ progress ≤ 1, integers ≥ 0 for the counters.
export interface ShellProgress {
  progress: number;
  completed: boolean;
  hintsUsed: number;
  /** Optional last-seen state from the shell's internal state machine. */
  lastState?: ShellState;
  /** Free-form per-shell payload — the Convex column is `v.any()`. */
  meta?: Record<string, unknown>;
}

// Row shape on the Convex side — one per (studentSlug, shellId, exerciseId).
export interface UserPracticeRecord extends ShellProgress {
  studentSlug: string;
  shellId: ShellId;
  exerciseId?: string;
  updatedAt: number;
}

// Return shape of `useShellProgress` — values + a save / reset callback.
export interface UseShellProgress extends ShellProgress {
  save: (next: Partial<ShellProgress> & { exerciseId?: string }) => void;
  reset: () => void;
}

// ─── Defaults ────────────────────────────────────────────────────────────────
const DEFAULT_PROGRESS: ShellProgress = {
  progress: 0,
  completed: false,
  hintsUsed: 0,
};

/** Built-in city demos keep their HUD progress in memory without touching a
 * student's lesson practice. Regular practice retains persistence by default. */
export const ShellProgressPersistenceContext = createContext(true);

// ─── Student-session helpers ─────────────────────────────────────────────────
const LEGACY_SLUG_KEY = 'studentSlug';

// Resolve the effective account, including a tab-scoped admin student view.
function readStudentSlug(): string | undefined {
  const student = readStudentSession();
  if (student?.slug) return student.slug;
  if (isStudentView()) return undefined;
  if (typeof window === 'undefined') return undefined;
  try {
    const legacy = window.localStorage.getItem(LEGACY_SLUG_KEY);
    return legacy || undefined;
  } catch {
    return undefined;
  }
}

// ─── Convex HTTP helpers ─────────────────────────────────────────────────────
// Mirror the pattern in src/contexts/StudentAuthContext.jsx and
// src/hooks/useStudentData.js — POST { path, args } to /api/{query,mutation}.
async function queryConvex<T>(path: string, args: Record<string, unknown>): Promise<T> {
  // 30s AbortController-backed timeout — see practice-cache.ts.
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

// Re-export for callers that want the raw async query helper.
export { queryConvex };

// ─── useQueryConvex ──────────────────────────────────────────────────────────
// Generic React hook for one-shot Convex queries. Used by Layer-4 dynamic
// scaffolding (e.g. InterferenceTip pulling practice:getInterferenceForExercise
// when a student gets a question wrong).
//
// Returns `undefined` until the query resolves, then either the value or null
// on error. Re-fetches when the args change by JSON-stringified key.
//
// This intentionally avoids ConvexProvider to stay consistent with the rest of
// the lexicon-source convex wiring (see file header).
export function useQueryConvex<T>(
  path: string | null,
  args: Record<string, unknown>,
): T | undefined {
  const [value, setValue] = useState<T | undefined>(undefined);
  // Stable key for the args object so callers can pass a fresh object every
  // render without thrashing. (Args here are tiny — JSON.stringify is fine.)
  const key = path ? `${path}::${JSON.stringify(args)}` : null;

  useEffect(() => {
    if (!path || !key) {
      setValue(undefined);
      return;
    }
    let cancelled = false;
    setValue(undefined);
    (async () => {
      try {
        const v = await queryConvex<T>(path, args);
        if (!cancelled) setValue(v);
      } catch {
        if (!cancelled) setValue(undefined);
      }
    })();
    return () => {
      cancelled = true;
    };
    // We deliberately depend on the JSON-stringified key, not the raw args.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return value;
}

async function mutateConvex<T>(path: string, args: Record<string, unknown>): Promise<T> {
  // 30s AbortController-backed timeout — see practice-cache.ts.
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

// ─── useShellProgress ────────────────────────────────────────────────────────
// Hook the shells call. Returns the current progress + a `save(partial)`
// merge-update + a `reset` callback. Identical signature to the v1
// localStorage stub so no shell file had to change.
//
// The hook keeps a local optimistic copy in React state for snappy UI, and
// fires the backend mutation in the background. If the mutation fails we
// silently swallow the error (the next call retries the merged state) —
// this is per-keystroke practice progress, not a critical write.
//
// Example:
//   const { progress, completed, hintsUsed, save } = useShellProgress('crossword');
//   const onCorrectAnswer = () => save({ progress: 0.5 });
//   const onComplete      = () => save({ progress: 1, completed: true });
//
// `exerciseId` is optional. If supplied (e.g. `useShellProgress('crossword', vocabSetId)`),
// progress is keyed per-exercise so swapping puzzles starts fresh.
export function useShellProgress(shellId: ShellId, exerciseId?: string): UseShellProgress {
  const reportArcadeProgress = useContext(ArcadeFeedbackContext);
  const persist = useContext(ShellProgressPersistenceContext);
  const studentView = isStudentView();
  const [state, setState] = useState<ShellProgress>(DEFAULT_PROGRESS);
  // Track whether we've hydrated from the backend yet. Until then we don't
  // want a save() call to collide with the in-flight read and reset values
  // back to defaults.
  const hydratedRef = useRef(false);
  // Keep the latest known state in a ref so the save callback can read
  // it without a stale-closure bug under React 19's strict mode.
  const stateRef = useRef<ShellProgress>(DEFAULT_PROGRESS);
  stateRef.current = state;

  const slug = persist ? readStudentSlug() : undefined;

  // Hydrate from Convex on mount / when shellId or exerciseId changes.
  useEffect(() => {
    let cancelled = false;
    hydratedRef.current = false;
    setState(DEFAULT_PROGRESS);

    if (!persist) {
      hydratedRef.current = true;
      return;
    }

    (async () => {
      try {
        const row = await queryConvex<{
          progress?: number;
          completed?: boolean;
          hintsUsed?: number;
          lastState?: ShellState;
          meta?: Record<string, unknown>;
        } | null>('practice:getProgress', {
          studentSlug: slug,
          shellId,
          exerciseId,
        });
        if (cancelled) return;
        if (row) {
          setState({
            progress: row.progress ?? 0,
            completed: row.completed ?? false,
            hintsUsed: row.hintsUsed ?? 0,
            lastState: row.lastState,
            meta: row.meta,
          });
        }
      } catch {
        // Network / backend error — fall through to defaults so the shell
        // is still playable. State is ephemeral until the next save().
      } finally {
        if (!cancelled) hydratedRef.current = true;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [shellId, exerciseId, slug, persist]);

  const save = useCallback(
    (next: Partial<ShellProgress> & { exerciseId?: string }) => {
      // Optimistic local merge — UI updates immediately.
      const { exerciseId: nextExerciseId, ...progressFields } = next;
      const merged: ShellProgress = { ...stateRef.current, ...progressFields };
      setState(merged);
      reportArcadeProgress?.(shellId, merged);

      if (!persist || studentView || isStudentView()) return;

      // Fire-and-forget backend write. We send the *delta* fields so the
      // mutation can patch atomically rather than over-write neighbouring
      // fields with stale values.
      void mutateConvex('practice:saveProgress', {
        studentSlug: slug,
        shellId,
        exerciseId: nextExerciseId ?? exerciseId,
        ...progressFields,
      }).catch(() => {
        // Non-fatal — see header comment.
      });
    },
    [shellId, exerciseId, slug, reportArcadeProgress, persist, studentView],
  );

  const reset = useCallback(() => {
    setState(DEFAULT_PROGRESS);
    reportArcadeProgress?.(shellId, DEFAULT_PROGRESS);
    if (!persist || studentView || isStudentView()) return;
    void mutateConvex('practice:reset', {
      studentSlug: slug,
      shellId,
      exerciseId,
    }).catch(() => {
      // Non-fatal.
    });
  }, [shellId, exerciseId, slug, reportArcadeProgress, persist, studentView]);

  return { ...state, save, reset };
}
