// correction.ts — frontend wiring for the v4 ESL correction adapter.
// Authored by Ricky 2026-05-02 — Mike-approved sprint to wire the v4
// fine-tune (Bob's llama-server at 100.79.106.74:8766 over Tailscale,
// fronted by /api/correction on :8802) into the D1 "Why this happens"
// dialog so wrong-answer overlays show a fresh model-derived
// Polish-transfer pattern explanation.
//
// Architecture
// ────────────
//   InterferenceTip (mounted on wrong answer)
//     ↓ useCorrection(wrong, correct, context, exerciseId)
//     ↓
//   POST /api/correction  →  nginx → 127.0.0.1:8802 (Python adapter)
//                                 ↓
//                          Bob:8766 (qwen-esl-v4) for the correction line
//                                 +
//                          Local pattern lookup for the "Why:" blurb
//
// Why a hook (not just an effect inside InterferenceTip)
// ──────────────────────────────────────────────────────
// Future ergonomics: a "?" button anywhere in the practice flow can call
// the same hook to get a JIT explanation. Keeps the tip component pure
// presentation.
//
// Cache strategy
// ──────────────
// Per-process (= per-tab) Map keyed by `${exerciseId}|${wrong}`. The
// adapter is fast enough (~150-600ms typical) that cross-session caching
// would add complexity for little gain. If Mike asks for it later, the
// adapter can write to a Convex `correctionCache` table — analogous to
// `sentenceFreshnessCache` — without touching this hook.
//
// Failure mode
// ────────────
// 5s timeout. On timeout / 5xx / network error, the hook returns
// {correction:null, why:null, isLoading:false, error:'...'}. The caller
// (InterferenceTip) is responsible for hiding the v4-derived section
// gracefully — the static `explanationPL` stays visible regardless.

import { useEffect, useState } from 'react';

// 5s ceiling matches the existing sentence-freshness pattern. Beyond that
// the dialog is already showing the static explanation and the user has
// likely stopped looking.
export const CORRECTION_TIMEOUT_MS = 5_000;

// In-memory cache. Keyed by the request's content fingerprint so two
// different exercises with the same wrong-answer string are still
// independent cache entries.
const memCache = new Map<string, CorrectionResponse>();

// Tracks in-flight requests so a quick re-mount of InterferenceTip (e.g.
// the user dismisses then triggers another wrong answer on the same
// question) doesn't double-fire.
const inFlight = new Map<string, Promise<CorrectionResponse | null>>();

function cacheKey(exerciseId: string | undefined, wrong: string): string {
  return `${exerciseId ?? '*'}|${(wrong ?? '').trim().toLowerCase()}`;
}

// ─── Types ────────────────────────────────────────────────────────────

export interface CorrectionRequest {
  wrong: string;
  correct: string;
  language?: 'en';
  context?: string;
  exerciseId?: string;
}

export interface CorrectionResponse {
  /** v4's cleaned correction (or `correct` verbatim when v4 misbehaves). */
  correction: string;
  /** Polish-transfer pattern explanation, English. Null if no pattern matched. */
  why: string | null;
  /** Same explanation in Polish. */
  whyPL: string | null;
  /** Short practice tip for the student. */
  howToFix: string | null;
  /** Diagnostic tag (mirrors interferencePatterns.patternId). */
  patternId: string | null;
  /** 'model' = v4 produced the correction; 'fallback' = we used `correct`. */
  source: 'model' | 'fallback';
  /** Adapter end-to-end latency, ms. */
  ms: number;
  /** Adapter / v4 error message if v4 was unusable (still 200 OK). */
  v4Error?: string | null;
}

export interface UseCorrectionResult {
  /** Full response payload, or null while loading / on error. */
  data: CorrectionResponse | null;
  isLoading: boolean;
  error: string | null;
}

// ─── Fetch ────────────────────────────────────────────────────────────

async function postCorrection(
  req: CorrectionRequest,
  signal: AbortSignal,
): Promise<CorrectionResponse | null> {
  const res = await fetch('/api/correction', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      wrong: req.wrong,
      correct: req.correct,
      language: req.language ?? 'en',
      context: req.context ?? '',
    }),
    signal,
  });
  if (!res.ok) return null;
  const body = (await res.json()) as CorrectionResponse;
  if (!body || typeof body.correction !== 'string') return null;
  return body;
}

// ─── React hook ───────────────────────────────────────────────────────

/**
 * useCorrection — fires a single POST /api/correction the first time a
 * (wrongAnswer, correctAnswer, exerciseId) triple is seen in this tab.
 * Subsequent renders with the same triple return the cached payload
 * synchronously.
 *
 * Pass `enabled=false` to defer the fetch (e.g. while the dialog is
 * closed). The hook is a no-op until enabled flips true.
 */
export function useCorrection(
  wrongAnswer: string,
  correctAnswer: string,
  context?: string,
  exerciseId?: string,
  enabled: boolean = true,
): UseCorrectionResult {
  const key = cacheKey(exerciseId, wrongAnswer);
  const seeded = enabled ? memCache.get(key) ?? null : null;
  const [data, setData] = useState<CorrectionResponse | null>(seeded);
  const [isLoading, setIsLoading] = useState<boolean>(
    !!enabled && !seeded && !!wrongAnswer && !!correctAnswer,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (!wrongAnswer || !correctAnswer) {
      setIsLoading(false);
      return;
    }

    // Cache hit — synchronous resolve.
    const cached = memCache.get(key);
    if (cached) {
      setData(cached);
      setIsLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CORRECTION_TIMEOUT_MS);
    setIsLoading(true);
    setError(null);

    // Coalesce concurrent in-flight requests on the same key.
    let promise = inFlight.get(key);
    if (!promise) {
      promise = postCorrection(
        { wrong: wrongAnswer, correct: correctAnswer, context, exerciseId },
        controller.signal,
      )
        .catch(() => null)
        .finally(() => {
          inFlight.delete(key);
        });
      inFlight.set(key, promise);
    }

    promise.then((payload) => {
      clearTimeout(timer);
      if (cancelled) return;
      setIsLoading(false);
      if (payload) {
        memCache.set(key, payload);
        setData(payload);
      } else {
        setError('correction unavailable');
      }
    });

    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);

  return { data, isLoading, error };
}

// ─── One-shot helper (non-hook) ───────────────────────────────────────

/**
 * fetchCorrectionOnce — useful for non-React call sites (e.g. an analytics
 * pre-warm on shell open). Returns null on any failure.
 */
export async function fetchCorrectionOnce(
  req: CorrectionRequest,
): Promise<CorrectionResponse | null> {
  const key = cacheKey(req.exerciseId, req.wrong);
  const cached = memCache.get(key);
  if (cached) return cached;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CORRECTION_TIMEOUT_MS);
  try {
    const payload = await postCorrection(req, controller.signal);
    if (payload) memCache.set(key, payload);
    return payload;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
