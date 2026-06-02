// sentenceFreshness.ts — frontend wiring for the §4-#21 Phase 2 sprint.
// Authored by Ricky 2026-05-02, immediately after Phase 1.1 (exposure) shipped.
//
// Purpose
// ───────
// Keep the practice tab from recycling the same 5–6 example sentences
// across every shell in a session. When the variety guard (Phase 1.2 G2)
// detects that a keyword has been shown to this student multiple times
// recently, we transparently swap the static `exampleEn` field with a
// freshly-generated Qwen-2.5/3.5 sentence — caching the result so the
// next render hits the cache instead of the model.
//
// Where the LLM lives
// ───────────────────
// On Bob's VPS at 127.0.0.1:11434 (Ollama, model = qwen3.5:9b). Convex
// actions live in Convex's cloud and can NOT reach 127.0.0.1, so the
// architecture is:
//
//   browser
//     │
//     ├── /api/query   sentenceFreshness:get  (Convex cache lookup)
//     │     ↳ if hot+sentence available → DONE, return that text
//     │
//     ├── /api/sentence-freshness/generate  (nginx → :8797 → Ollama)
//     │     ↳ Python service prompts Qwen w/ forbidden list
//     │     ↳ returns one freshly-generated sentence
//     │
//     └── /api/mutation sentenceFreshness:put  (cross-session cache write)
//
// Latency profile
// ───────────────
// Ollama on CPU is ~1 token/s — a 60-token sentence is ~20s. We MUST
// cache aggressively. Strategy:
//   - Synchronous read from Convex cache. Cache hit → return immediately.
//   - On miss: kick off background generation, but the SYNCHRONOUS caller
//     gets undefined and falls back to the static `exampleEn`. The next
//     render (after the background job lands) will hit the cache and
//     show the fresh sentence.
//   - The high-level orchestrator (refreshStaleVocabExamples in
//     StudentPractice.tsx) decides WHICH keywords are stale enough to
//     warrant a refresh, so we don't burn ~20s on every word.
//
// What this file owns
// ───────────────────
// 1. fetchFreshSentenceFromCache(keyword, cefr, topic)
//      — single Convex query call, returns { sentences, hot }
// 2. generateFreshSentence(keyword, cefr, topic, forbidden)
//      — calls /api/sentence-freshness/generate, writes back via Convex put
// 3. useFreshSentence(keyword, cefr, topic)
//      — React hook for one-off shell-level use (rarely used; main
//        wiring goes through the StudentPractice orchestrator)
// 4. refreshSentencesForVocab(items, cefr)
//      — pure helper: given a vocab list, returns a Map<word, freshSentence>
//        for everything that's already cached. Used by the orchestrator to
//        do an N-keyword cache lookup in a single render-pass.
//
// What this file deliberately does NOT do
// ───────────────────────────────────────
// - Re-rank or filter generator output (G2's job, separate sprint).
// - Persist Leitner box state (G3's job).
// - Render any UI — purely a data layer.

import { useEffect, useState } from 'react';
import { fetchWithTimeout } from './practice-cache';

// ─── Types ───────────────────────────────────────────────────────────

export interface FreshSentence {
  text: string;
  generatedAt: number;
  model?: string;
}

export interface FreshnessCacheHit {
  sentences: FreshSentence[];
  hot: boolean;
  key: { keyword: string; cefr: string; topic: string };
}

// Per-call timeout when we DO go to the model. The audit doc explicitly
// mandates a 5s ceiling — beyond that we fall back to the static example.
// Note: Ollama on CPU usually takes ~20s, so this almost always falls
// back; the actual sentence appears on the *next* render once the
// background fetch completes and lands in cache.
export const GENERATION_TIMEOUT_MS = 5_000;

// In-memory mirror of the Convex cache so a second render in the same
// session doesn't re-hit /api/query for the same keyword. Keyed by the
// normalised cache tuple.
const memCache = new Map<string, FreshSentence[]>();
// In-flight generation requests; keyed identically. Prevents two parallel
// renders from kicking off duplicate Ollama jobs.
const inFlightGen = new Set<string>();

function memKey(keyword: string, cefr: string | undefined, topic: string | undefined): string {
  const k = (keyword ?? '').trim().toLowerCase();
  const c = (cefr ?? '').trim().toUpperCase() || '*';
  const t = (topic ?? '').trim().toLowerCase().replace(/\s+/g, ' ') || '*';
  return `${k}|${c}|${t}`;
}

// ─── Convex helpers (mirror exposure.ts pattern) ─────────────────────

async function queryConvex<T>(path: string, args: Record<string, unknown>): Promise<T | null> {
  try {
    const res = await fetchWithTimeout('/api/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, args }),
    });
    if (!res.ok) return null;
    const payload = await res.json();
    if (payload?.status !== 'success') return null;
    return payload.value as T;
  } catch {
    return null;
  }
}

async function mutateConvex<T>(path: string, args: Record<string, unknown>): Promise<T | null> {
  try {
    const res = await fetchWithTimeout('/api/mutation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, args }),
    });
    if (!res.ok) return null;
    const payload = await res.json();
    if (payload?.status !== 'success') return null;
    return payload.value as T;
  } catch {
    return null;
  }
}

// ─── Cache lookup ────────────────────────────────────────────────────

/**
 * fetchFreshSentenceFromCache — pull the cached sentences (if any) for
 * the given (keyword, cefr, topic). Returns up to KEEP_N_PER_KEY rows
 * sorted newest-first, or an empty array on miss / network error.
 */
export async function fetchFreshSentenceFromCache(
  keyword: string,
  cefr?: string,
  topic?: string,
): Promise<FreshnessCacheHit> {
  const key = memKey(keyword, cefr, topic);
  const cached = memCache.get(key);
  if (cached && cached.length > 0) {
    return {
      sentences: cached,
      hot: cached[0]?.generatedAt > Date.now() - 30 * 24 * 60 * 60 * 1000,
      key: { keyword: keyword.toLowerCase(), cefr: (cefr ?? '*').toUpperCase(), topic: (topic ?? '*').toLowerCase() },
    };
  }
  const result = await queryConvex<FreshnessCacheHit>('sentenceFreshness:get', {
    keyword,
    cefr,
    topic,
  });
  if (result?.sentences && result.sentences.length > 0) {
    memCache.set(key, result.sentences);
    return result;
  }
  return {
    sentences: [],
    hot: false,
    key: result?.key ?? { keyword: keyword.toLowerCase(), cefr: (cefr ?? '*').toUpperCase(), topic: (topic ?? '*').toLowerCase() },
  };
}

// ─── Generation (with persistence) ───────────────────────────────────

/**
 * generateFreshSentence — call the /api/sentence-freshness service, then
 * persist the result to the Convex cache. Returns the new sentence text
 * or null on failure / timeout.
 *
 * Caller should treat null as "fall back to the static example" — we
 * deliberately do NOT throw, because shell-render code can't recover
 * from an exception cleanly.
 */
export async function generateFreshSentence(
  keyword: string,
  cefr: string | undefined,
  topic: string | undefined,
  forbidden: string[],
): Promise<string | null> {
  const key = memKey(keyword, cefr, topic);
  if (inFlightGen.has(key)) return null;
  inFlightGen.add(key);
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GENERATION_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch('/api/sentence-freshness/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyword,
          cefr: cefr ?? 'B2',
          topic: topic ?? '',
          forbidden: forbidden.slice(0, 5),
          n: 1,
        }),
        signal: controller.signal,
      });
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) return null;
    const body = (await res.json()) as { sentences?: string[]; model?: string };
    const sentence = body.sentences?.[0]?.trim();
    if (!sentence) return null;

    // Persist to the Convex cache (fire-and-forget — don't block the
    // caller on the write; the in-mem cache is already updated below).
    const newRow: FreshSentence = {
      text: sentence,
      generatedAt: Date.now(),
      model: body.model,
    };
    const existing = memCache.get(key) ?? [];
    memCache.set(key, [newRow, ...existing.filter((s) => s.text !== sentence)].slice(0, 5));

    void mutateConvex('sentenceFreshness:put', {
      keyword,
      cefr,
      topic,
      sentence,
      model: body.model,
    });

    return sentence;
  } finally {
    inFlightGen.delete(key);
  }
}

// ─── Background warmer ───────────────────────────────────────────────

/**
 * warmFreshSentence — call this when you want a sentence to be available
 * NEXT render. Returns immediately. If the cache already has a hot entry,
 * does nothing. Otherwise kicks off a background Ollama call that lands
 * in cache by the time the user re-enters the shell.
 */
export function warmFreshSentence(
  keyword: string,
  cefr: string | undefined,
  topic: string | undefined,
  forbidden: string[],
): void {
  const key = memKey(keyword, cefr, topic);
  if (inFlightGen.has(key)) return;
  if (memCache.has(key) && (memCache.get(key)?.length ?? 0) > 0) return;
  // Fire-and-forget — generateFreshSentence handles its own errors.
  void generateFreshSentence(keyword, cefr, topic, forbidden);
}

// ─── React hook ──────────────────────────────────────────────────────

export interface UseFreshSentenceResult {
  sentence: string | null;
  isLoading: boolean;
  error: string | null;
  /** Force a regeneration via the Qwen service (slow — ~20s on CPU). */
  refresh: () => void;
}

/**
 * useFreshSentence — React hook for shell-level use. Reads the cache on
 * mount; if cold, optionally kicks off a background warm.
 *
 * NOTE: most code does NOT use this hook directly. The main wiring is
 * `refreshStaleVocabExamples` inside StudentPractice.tsx, which does a
 * single batched cache lookup for the whole vocab pool before
 * `buildShellPuzzle` runs. This hook exists for future per-shell uses
 * (e.g. a "✨ regenerate this sentence" button on individual cards).
 */
export function useFreshSentence(
  keyword: string,
  cefr?: string,
  topic?: string,
  forbidden: string[] = [],
): UseFreshSentenceResult {
  const [sentence, setSentence] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Re-fetch on key change.
  const cacheKey = memKey(keyword, cefr, topic);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    setSentence(null);
    (async () => {
      const hit = await fetchFreshSentenceFromCache(keyword, cefr, topic);
      if (cancelled) return;
      if (hit.sentences.length > 0) {
        setSentence(hit.sentences[0].text);
        setIsLoading(false);
        return;
      }
      // Cold — kick off generation; the user gets `null` until it lands.
      const fresh = await generateFreshSentence(keyword, cefr, topic, forbidden);
      if (cancelled) return;
      setIsLoading(false);
      if (fresh) {
        setSentence(fresh);
      } else {
        setError('generation timed out or model unavailable');
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey]);

  const refresh = () => {
    setIsLoading(true);
    setError(null);
    void (async () => {
      const fresh = await generateFreshSentence(keyword, cefr, topic, forbidden);
      setIsLoading(false);
      if (fresh) {
        setSentence(fresh);
      } else {
        setError('generation timed out or model unavailable');
      }
    })();
  };

  return { sentence, isLoading, error, refresh };
}

// ─── Batch helpers for the orchestrator ──────────────────────────────

/**
 * refreshSentencesForVocab — given a vocab list and a per-student
 * exposure map, return a Map<lowercased word, fresh sentence> for every
 * keyword that is BOTH (a) stale per the variety guard heuristic AND
 * (b) already in the Convex cache. Items not in cache get scheduled for
 * background warming via warmFreshSentence.
 *
 * Heuristic for "stale enough to refresh":
 *   - exposureCount >= 2 within the last 7d (the keyword is recycling)
 *   - OR no exposure at all but the static exampleEn appears in the
 *     audit doc's "recycled 5-6 sentences" set (we don't import that
 *     list here — left as a TODO for G2 to refine).
 *
 * Returns an empty map when run anonymously (no student session) — the
 * caller falls back to static examples in that case.
 */
export interface VocabWithExample {
  word: string;
  exampleEn?: string;
  topic?: string;
}

export interface ExposureCount {
  itemId: string;          // typically `kw:${word}`
  count: number;
}

export async function refreshSentencesForVocab(
  vocab: ReadonlyArray<VocabWithExample>,
  cefr: string | undefined,
  exposureCounts: ReadonlyArray<ExposureCount> = [],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (vocab.length === 0) return out;

  // Build a fast lookup: lowercased word → exposure count.
  const expoMap = new Map<string, number>();
  for (const e of exposureCounts) {
    const id = e.itemId.startsWith('kw:') ? e.itemId.slice(3) : e.itemId;
    expoMap.set(id.toLowerCase(), (expoMap.get(id.toLowerCase()) ?? 0) + e.count);
  }

  await Promise.all(
    vocab.map(async (v) => {
      const word = (v.word ?? '').trim();
      if (!word) return;
      const exposures = expoMap.get(word.toLowerCase()) ?? 0;
      const isStale = exposures >= 2;
      // Always at least PEEK at the cache so even non-stale keywords get
      // a fresh sentence if Phase 1.1 has already populated one (cheap
      // — single Convex query, cached in memory after first call).
      const hit = await fetchFreshSentenceFromCache(word, cefr, v.topic);
      if (hit.sentences.length > 0) {
        // Use the freshest cached entry whose text differs from the
        // current static example (so we don't no-op-replace).
        const candidate = hit.sentences.find(
          (s) => s.text.trim().toLowerCase() !== (v.exampleEn ?? '').trim().toLowerCase(),
        );
        if (candidate) out.set(word.toLowerCase(), candidate.text);
        return;
      }
      // Cache miss. If stale, kick off a background warm so a future
      // render gets a fresh sentence. Synchronous caller falls back to
      // the static example for now.
      if (isStale) {
        const forbidden = v.exampleEn ? [v.exampleEn] : [];
        warmFreshSentence(word, cefr, v.topic, forbidden);
      }
    }),
  );

  return out;
}
