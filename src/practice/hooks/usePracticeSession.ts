// usePracticeSession.ts
// ─────────────────────────────────────────────────────────────────────────────
// Returns the 3 (or N) practice shells recommended for a logged-in student.
//
// Resolution order:
//   1. ASK CONVEX FIRST — `practice:getRecommendedShells` returns a cached row
//      from the `practiceRecommendations` table. If a fresh row exists we use
//      it directly; no KB fetch, no scoring, no extra round-trip.
//   2. FALL BACK TO CLIENT KB — when Convex has no cached row (new student,
//      KB just regenerated, etc.), fetch /knowledge-base/<slug>.json,
//      normalise it through `readKB`, and run `pickShellsForStudent` locally.
//      We then fire-and-forget `practice:saveRecommendedShells` so the next
//      visit hits the cache.
//   3. EMPTY FALLBACK — if we have neither a cache nor a KB, return a small
//      starter set so the dashboard still shows three shells.
//
// Why this split?
//   The KB lives as static JSON on the SPA host (rsynced under
//   /knowledge-base/<slug>.json). Some students have rich KBs, others have
//   none. We don't want every dashboard render to re-parse a 100kB JSON file
//   and re-score 30 errors — Convex caching pushes that work to once-per-day.
//
// Auth idiom mirrors src/contexts/StudentAuthContext.jsx — we POST to
// /api/query and /api/mutation directly because the codebase doesn't wire
// ConvexProvider at the app root.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState, useCallback } from 'react';
import { fetchKB, type NormalisedKB } from '../lib/kb-reader';
import { pickShellsForStudent, type PickedShell, type ShellKey } from '../lib/shell-selector';
import { fetchWithTimeout } from '../lib/practice-cache';

// ─── Types ────────────────────────────────────────────────────────────────
export interface PracticeSession {
  /** Recommended shells for this session, weight-sorted. */
  shells: PickedShell[];
  /** Where the recommendation came from — useful for cache-bust UX. */
  source: 'convex-cache' | 'client-kb' | 'fallback' | 'loading';
  /** Student CEFR level used to seed the picker (drives early-level bias). */
  studentLevel: string;
  /** Last error if anything went wrong during resolution. */
  error?: string;
}

// ─── Defaults ─────────────────────────────────────────────────────────────
//
// When we have nothing to go on (anonymous user on the design canvas, KB
// missing, Convex down) we still return a sensible 3-shell starter so the
// dashboard doesn't show an empty state. These match the "unknown" fallback
// in CATEGORY_TO_SHELLS — flashcards + matching + gapfill — which together
// cover recall, association, and form-correction.
const FALLBACK_SHELLS: PickedShell[] = [
  {
    shell: 'flashcards',
    weight: 1,
    reason: 'Starter shell — recall practice for new vocabulary.',
    topErrorIds: [],
  },
  {
    shell: 'matching',
    weight: 1,
    reason: 'Starter shell — connect words with their meanings.',
    topErrorIds: [],
  },
  {
    shell: 'gapfill',
    weight: 1,
    reason: 'Starter shell — produce target words in context.',
    topErrorIds: [],
  },
];

// ─── Convex HTTP helpers ──────────────────────────────────────────────────
// Same pattern as src/practice/lib/convex-stubs.ts — POST to /api/{query,
// mutation} via the nginx proxy. Errors are swallowed at the call site so
// the hook still resolves to FALLBACK_SHELLS rather than throwing.
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

// Convex cache freshness — recommendations older than this are recomputed
// from the KB. 24 hours is plenty for daily-rhythm practice.
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

// Cached row shape returned by practice:getRecommendedShells.
interface CachedRecommendation {
  _id: string;
  studentLevel: string;
  shells: PickedShell[];
  kbVersion?: string;
  createdAt: number;
}

// ─── usePracticeSession hook ──────────────────────────────────────────────
//
// Consumed by the Lexicon dashboard's "Today's practice" card.
//
// Example:
//   const { shells, source, studentLevel } = usePracticeSession('aleksandra-gorska');
//   if (source === 'loading') return <Spinner />;
//   return shells.map((s) => <PracticeShellTile key={s.shell} {...s} />);
//
// The optional `count` parameter lets the dashboard ask for a different
// number of shells (e.g. 5 for a long session, 1 for a "warm up" tile).
export function usePracticeSession(
  studentSlug: string | undefined,
  count: number = 3,
): PracticeSession & { refresh: () => void } {
  const [session, setSession] = useState<PracticeSession>({
    shells: FALLBACK_SHELLS.slice(0, count),
    source: 'loading',
    studentLevel: 'B1',
  });
  // Cache-bust nonce — bump this to force a re-resolution.
  const [nonce, setNonce] = useState(0);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;

    async function resolve() {
      // Anonymous / pre-login — just hand back the starter set.
      if (!studentSlug) {
        if (!cancelled) {
          setSession({
            shells: FALLBACK_SHELLS.slice(0, count),
            source: 'fallback',
            studentLevel: 'B1',
          });
        }
        return;
      }

      // 1. Try Convex cache.
      try {
        const cached = await queryConvex<CachedRecommendation | null>(
          'practice:getRecommendedShells',
          { studentSlug },
        );
        if (cached && cached.shells?.length > 0) {
          const fresh = Date.now() - cached.createdAt < CACHE_MAX_AGE_MS;
          if (fresh) {
            if (!cancelled) {
              setSession({
                shells: (cached.shells as PickedShell[]).slice(0, count),
                source: 'convex-cache',
                studentLevel: cached.studentLevel || 'B1',
              });
            }
            return;
          }
        }
      } catch {
        // Convex unavailable — fall through to client-side KB.
      }

      // 2. Fetch + normalise the KB JSON, run the picker locally.
      let kb: NormalisedKB | null = null;
      try {
        kb = await fetchKB(studentSlug);
      } catch {
        // KB doesn't exist for this student — fall through to the
        // empty-KB starter set further down.
      }

      if (cancelled) return;

      // Determine the student's level: prefer the KB's `student.currentLevel`
      // because the KB JSON was authored against the lesson record. Fall back
      // to "B1" (modal Lexicon student level) when missing.
      const studentLevel = kb?.student?.currentLevel || 'B1';

      if (kb && kb.errors.length > 0) {
        const picks = pickShellsForStudent(kb, studentLevel, count);
        if (!cancelled) {
          setSession({
            shells: picks,
            source: 'client-kb',
            studentLevel,
          });
        }

        // Fire-and-forget cache write so the next session visit hits Convex
        // directly. Errors here are non-fatal — the hook resolved fine.
        void mutateConvex('practice:saveRecommendedShells', {
          studentSlug,
          studentLevel,
          shells: picks,
          // We don't have a real version yet — use the day-stamp so the
          // ingestion pipeline can invalidate cleanly later.
          kbVersion: new Date().toISOString().slice(0, 10),
        }).catch(() => {
          // Swallow — see comment above.
        });
        return;
      }

      // 3. No cache, no KB — fallback starter set.
      if (!cancelled) {
        setSession({
          shells: FALLBACK_SHELLS.slice(0, count),
          source: 'fallback',
          studentLevel,
        });
      }
    }

    resolve();
    return () => {
      cancelled = true;
    };
  }, [studentSlug, count, nonce]);

  return { ...session, refresh };
}

// Re-export the shell key type for convenience so dashboard components
// don't have to dive into ./lib/shell-selector themselves.
export type { ShellKey, PickedShell };
