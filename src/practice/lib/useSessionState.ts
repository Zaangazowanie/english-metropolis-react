// useSessionState.ts — frontend hook for the mid-shell snapshot +
// run-control modal (audit §4 #21 Phase 1.8, Mike's add-on, Ricky 2026-05-02).
//
// Bridges the `practiceSession` Convex table (see convex/practice.ts) to
// the React shell flow. Exposes:
//
//   useSessionState(shellKey)
//     → {
//         pendingSession,          // { state, questionIds, updatedAt } | null
//         continueSession(),       // returns the saved blob for hydration
//         startFresh({ newQuestions }),
//                                  // discards old row; returns { state: null,
//                                  //   reuseQuestionIds: string[] | null }
//         discardSession(),        // explicit "throw away" — used on completion
//         markComplete(),          // flag the row done (don't prompt again)
//         snapshot(state, questionIds),
//                                  // debounced (10s) save; safe to spam.
//       }
//
// Anonymous (no logged-in student) callers get a no-op hook so the design
// canvas can mount the modal without polluting real student rows.
//
// What this file does NOT do:
//   - Render any UI (that's SessionModal.tsx)
//   - Reach into shell-specific state shapes — `state` is a free-form blob
//     the shell knows how to JSON.stringify / JSON.parse itself
//   - Attempt to "freshen" question selection — the caller passes a flag
//     to its puzzle generator; the hook just relays it

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchWithTimeout } from './practice-cache';
import { readStudentSession, isStudentView } from '../../lib/student-session.js';

// ─── Types ─────────────────────────────────────────────────────────

/** Public shape of a pending (resume-able) session. */
export interface PendingSession {
  /** Parsed shell-specific state blob. The shell knows the schema. */
  state: unknown;
  /** Question ids captured at snapshot time (used by Repeat same). */
  questionIds: string[];
  /** ms epoch of the last snapshot write — used for "X minutes ago" copy. */
  updatedAt: number;
  /** ms epoch of the row's first insert — surfaced in modal copy. */
  startedAt: number;
}

export interface StartFreshOptions {
  /** When false, caller will reuse the prior questionIds. */
  newQuestions: boolean;
}

export interface StartFreshResult {
  state: null;
  /** When non-null, the puzzle generator should use these question ids. */
  reuseQuestionIds: string[] | null;
}

export interface UseSessionState {
  /**
   * Most recent non-completed snapshot for (student, shell), or null when:
   *  - the student isn't logged in
   *  - the snapshot is too fresh (< STALE_MIN_MS) — looks like an active
   *    session in another tab, not a real "I left and came back"
   *  - the snapshot is too old (> STALE_MAX_MS) — treat as expired
   *  - we haven't finished hydrating yet
   *
   * Modal should auto-pass through (render nothing) when null.
   */
  pendingSession: PendingSession | null;
  /** True while the initial getActiveSession round-trip is in flight. */
  isLoading: boolean;
  /** Returns the saved state blob for the shell to hydrate. */
  continueSession: () => unknown;
  /** Discards old row; returns reuse hint for the puzzle generator. */
  startFresh: (opts: StartFreshOptions) => Promise<StartFreshResult>;
  /** Hard-delete the row (used after onSessionComplete, defensive). */
  discardSession: () => Promise<void>;
  /** Mark the session done — stops getActiveSession from returning it. */
  markComplete: () => Promise<void>;
  /**
   * Debounced snapshot. Safe to call on every shell state change — the
   * hook coalesces calls into one Convex write per SNAPSHOT_DEBOUNCE_MS.
   * The most recent (state, questionIds) wins.
   */
  snapshot: (state: unknown, questionIds: string[]) => void;
}

// ─── Local state ───────────────────────────────────────────────────
const LEGACY_SLUG_KEY = 'studentSlug';

/**
 * STALE_MIN_MS — snapshots newer than this are assumed to belong to a
 * still-open tab, NOT a "left and came back" scenario. Per spec, the
 * modal only surfaces sessions whose `updatedAt < now-10min`.
 */
const STALE_MIN_MS = 10 * 60 * 1000; // 10 minutes
/**
 * STALE_MAX_MS — snapshots older than this are treated as expired and
 * silently dropped (no modal). Keeps stale week-old rows from prompting
 * a user who has clearly moved on.
 */
const STALE_MAX_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
/**
 * SNAPSHOT_DEBOUNCE_MS — every-10s mid-shell save cadence (Mike's spec).
 * Coalesces a flurry of in-shell state changes into one Convex write.
 */
const SNAPSHOT_DEBOUNCE_MS = 10 * 1000;

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

// ─── Convex HTTP helpers (mirror exposure.ts pattern) ──────────────
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

// Raw shape returned by practice:getActiveSession.
interface ActiveSessionRow {
  _id: string;
  studentSlug: string;
  shellKey: string;
  startedAt: number;
  updatedAt: number;
  state: string;          // JSON string
  questionIds: string[];
  isComplete: boolean;
}

// ─── Hook ──────────────────────────────────────────────────────────
export function useSessionState(shellKey: string | null): UseSessionState {
  const slug = readStudentSlug();
  const studentView = isStudentView();
  const [pendingSession, setPendingSession] = useState<PendingSession | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  // questionIds carried over from the prior snapshot — used by startFresh
  // when newQuestions=false. Held in a ref so reads inside startFresh see
  // the latest value without a stale-closure capture.
  const lastQuestionIdsRef = useRef<string[]>([]);
  const lastStateRef = useRef<unknown>(null);

  // Snapshot debounce machinery. The latest (state, questionIds) waiting
  // to be written, plus a timer that flushes after SNAPSHOT_DEBOUNCE_MS.
  const pendingWriteRef = useRef<{ state: unknown; questionIds: string[] } | null>(null);
  const snapshotTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hydrate on mount + when shellKey/slug changes.
  useEffect(() => {
    if (!slug || !shellKey) {
      setPendingSession(null);
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    (async () => {
      try {
        const row = await queryConvex<ActiveSessionRow | null>(
          'practice:getActiveSession',
          { studentSlug: slug, shellKey },
        );
        if (cancelled) return;
        if (!row) {
          setPendingSession(null);
          return;
        }
        const age = Date.now() - row.updatedAt;
        // Spec: only expose as pendingSession when updatedAt < now-10min.
        // Snapshots fresher than that are assumed to be a sibling tab still
        // playing and shouldn't trigger a Resume modal.
        if (age < STALE_MIN_MS) {
          setPendingSession(null);
          return;
        }
        if (age > STALE_MAX_MS) {
          // Stale rows linger in the DB until pruned; just don't surface them.
          setPendingSession(null);
          return;
        }
        let parsed: unknown = null;
        try {
          parsed = JSON.parse(row.state);
        } catch {
          // Corrupted blob — treat as "no usable session" and discard so the
          // student isn't stuck in a loop of un-resumable prompts.
          if (!studentView && !isStudentView()) {
            void mutateConvex('practice:discardSession', {
              studentSlug: slug,
              shellKey,
            }).catch(() => { /* non-fatal */ });
          }
          setPendingSession(null);
          return;
        }
        lastStateRef.current = parsed;
        lastQuestionIdsRef.current = row.questionIds ?? [];
        setPendingSession({
          state: parsed,
          questionIds: row.questionIds ?? [],
          updatedAt: row.updatedAt,
          startedAt: row.startedAt,
        });
      } catch {
        // Network/backend error — fall through to no-pending. The student
        // gets a fresh shell, which is strictly better than a broken modal.
        setPendingSession(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, shellKey, studentView]);

  // Flush any pending snapshot write on unmount or when shellKey changes —
  // we don't want the timer to fire after the student has already left.
  useEffect(() => {
    return () => {
      if (snapshotTimerRef.current !== null) {
        clearTimeout(snapshotTimerRef.current);
        snapshotTimerRef.current = null;
      }
      // Best-effort flush of the last queued write. Fire-and-forget.
      const queued = pendingWriteRef.current;
      pendingWriteRef.current = null;
      if (queued && slug && shellKey && !studentView && !isStudentView()) {
        void mutateConvex('practice:saveSessionSnapshot', {
          studentSlug: slug,
          shellKey,
          state: JSON.stringify(queued.state ?? null),
          questionIds: queued.questionIds ?? [],
        }).catch(() => { /* non-fatal */ });
      }
    };
  }, [slug, shellKey, studentView]);

  const continueSession = useCallback((): unknown => {
    // The caller (the shell) hydrates from this. Clear the pending flag so
    // the modal doesn't re-mount on a re-render after the user clicks
    // Continue.
    const next = pendingSession?.state ?? null;
    setPendingSession(null);
    return next;
  }, [pendingSession]);

  const startFresh = useCallback(
    async ({ newQuestions }: StartFreshOptions): Promise<StartFreshResult> => {
      const reuseQuestionIds = newQuestions ? null : lastQuestionIdsRef.current.slice();
      // Discard the existing row regardless — we want a clean slate. The
      // shell will re-snapshot on its first state change after this.
      if (slug && shellKey && !studentView && !isStudentView()) {
        try {
          await mutateConvex('practice:discardSession', {
            studentSlug: slug,
            shellKey,
          });
        } catch {
          // Non-fatal: even if the discard fails, we'll overwrite on the
          // next snapshot via the upsert path. The user sees a fresh shell
          // either way.
        }
      }
      lastStateRef.current = null;
      // Intentionally keep lastQuestionIdsRef in case the caller wants to
      // peek at it again — startFresh just consumed it via reuseQuestionIds.
      setPendingSession(null);
      return { state: null, reuseQuestionIds };
    },
    [slug, shellKey, studentView],
  );

  const discardSession = useCallback(async (): Promise<void> => {
    if (!slug || !shellKey || studentView || isStudentView()) {
      setPendingSession(null);
      return;
    }
    try {
      await mutateConvex('practice:discardSession', {
        studentSlug: slug,
        shellKey,
      });
    } catch {
      /* non-fatal */
    }
    lastStateRef.current = null;
    lastQuestionIdsRef.current = [];
    setPendingSession(null);
  }, [slug, shellKey, studentView]);

  const markComplete = useCallback(async (): Promise<void> => {
    if (!slug || !shellKey || studentView || isStudentView()) return;
    // Cancel any pending debounced snapshot — completing a shell supersedes
    // an in-flight mid-shell save.
    if (snapshotTimerRef.current !== null) {
      clearTimeout(snapshotTimerRef.current);
      snapshotTimerRef.current = null;
    }
    pendingWriteRef.current = null;
    try {
      await mutateConvex('practice:markSessionComplete', {
        studentSlug: slug,
        shellKey,
      });
    } catch {
      /* non-fatal */
    }
    setPendingSession(null);
  }, [slug, shellKey, studentView]);

  const snapshot = useCallback(
    (state: unknown, questionIds: string[]) => {
      if (!slug || !shellKey || studentView || isStudentView()) return;
      // Always hold the most recent value — the timer will write it.
      pendingWriteRef.current = { state, questionIds };
      lastStateRef.current = state;
      lastQuestionIdsRef.current = questionIds;
      if (snapshotTimerRef.current !== null) return; // already scheduled
      snapshotTimerRef.current = setTimeout(() => {
        snapshotTimerRef.current = null;
        const queued = pendingWriteRef.current;
        pendingWriteRef.current = null;
        if (!queued || studentView || isStudentView()) return;
        void mutateConvex('practice:saveSessionSnapshot', {
          studentSlug: slug,
          shellKey,
          state: JSON.stringify(queued.state ?? null),
          questionIds: queued.questionIds ?? [],
        }).catch(() => {
          /* non-fatal — the next snapshot will retry the latest state */
        });
      }, SNAPSHOT_DEBOUNCE_MS);
    },
    [slug, shellKey, studentView],
  );

  return useMemo(
    () => ({
      pendingSession,
      isLoading,
      continueSession,
      startFresh,
      discardSession,
      markComplete,
      snapshot,
    }),
    [pendingSession, isLoading, continueSession, startFresh, discardSession, markComplete, snapshot],
  );
}
