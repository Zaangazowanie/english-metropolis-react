// useStudentVocab.ts
// ─────────────────────────────────────────────────────────────────────────────
// Fetches a student's recent keywords from Convex and returns them in the
// shape the practice generators consume.
//
// Mirrors convex-stubs.ts's queryConvex pattern (fetch /api/query, no
// ConvexReactClient). Returns { vocab, status, error } so callers can render
// a loading / error state.
//
// FIX-A (2026-04-30) — wired up by StudentPractice.tsx so when a student
// picks a shell, vocab is fetched, fed to the generator, adapted to the
// shell's internal shape, and rendered.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import { fetchWithTimeout } from './practice-cache';

export interface VocabItem {
  keywordId?: string;
  word: string;
  word_pl: string;
  exampleEn?: string;
  example_pl?: string;
  topics?: string[];
  wordType?: string;
  partOfSpeech?: string;
  difficulty?: string;
  ipa?: string;
  // Generator-specific extras (carried through if present on the keyword row).
  topic?: string;
  category?: string;
  clue?: string;
  falseFriends?: unknown[];
  commonMistakes?: unknown[];
  usageTip?: string;
}

export interface VocabFetchState {
  vocab: VocabItem[];
  status: 'idle' | 'loading' | 'ready' | 'error';
  error?: string;
}

async function queryConvex<T>(path: string, args: Record<string, unknown>): Promise<T> {
  // fetchWithTimeout aborts after 30s and surfaces the abort as a normal
  // "Request timed out" error rather than a console crash.
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

/**
 * useStudentVocab — hook fetching a student's keyword list. Re-runs whenever
 * the slug changes. Returns a small loading-state machine + the vocab array.
 *
 * When `slug` is undefined (no student session) the hook short-circuits to
 * an empty `ready` state so callers can fall back to the design-canvas demo.
 */
export function useStudentVocab(
  slug: string | undefined,
  opts?: { limit?: number; difficulty?: string },
): VocabFetchState {
  const [state, setState] = useState<VocabFetchState>({
    vocab: [],
    status: slug ? 'loading' : 'ready',
  });

  useEffect(() => {
    if (!slug) {
      setState({ vocab: [], status: 'ready' });
      return;
    }
    let cancelled = false;
    setState((prev) => ({ ...prev, status: 'loading' }));

    (async () => {
      try {
        const rows = await queryConvex<VocabItem[]>('practice:getKeywordsByStudentSlug', {
          studentSlug: slug,
          limit: opts?.limit ?? 60,
          difficulty: opts?.difficulty,
        });
        if (cancelled) return;
        // Defensive: row shape comes from Convex; ensure at least { word, word_pl }.
        const cleaned = (rows ?? []).filter((r) => r && typeof r.word === 'string' && typeof r.word_pl === 'string');
        // Map wordType → partOfSpeech for the generators that key off POS.
        const mapped = cleaned.map((r) => ({
          ...r,
          partOfSpeech: r.partOfSpeech ?? r.wordType,
          topic: r.topic ?? (r.topics ?? [])[0],
        }));
        setState({ vocab: mapped, status: 'ready' });
      } catch (err) {
        if (cancelled) return;
        setState({
          vocab: [],
          status: 'error',
          error: err instanceof Error ? err.message : 'unknown',
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [slug, opts?.limit, opts?.difficulty]);

  return state;
}
