// practice-cache.ts
// ─────────────────────────────────────────────────────────────────────────────
// Network-resilience helpers shared across the non-shell SPA fetch paths.
//
// 1. fetchWithTimeout(url, init, timeoutMs=30000)
//    Wraps `fetch()` with an AbortController that fires after `timeoutMs`.
//    AbortError is rethrown as a friendlier `Error('Request timed out: …')`
//    so the call site can render a normal error state instead of a console
//    crash. Pass an external `signal` via `init.signal` to chain unmount
//    aborts (the helper installs an `abort` listener so the inner controller
//    is also aborted).
//
// 2. cachedJSON(key, loader, ttlMs=5*60_000)
//    In-memory `Map<string, { value, expiresAt }>` keyed by `key`. Concurrent
//    callers de-dupe through a parallel `Map<string, Promise<T>>` so a burst
//    of mounts only triggers one network round-trip. Used for the static
//    practice/KB JSON files that are re-fetched across renders + navigations.
//
//    Convex `useQuery` / `useMutation` already manages caching + lifecycle.
//    Only wrap raw `fetch()` calls.
//
// Authored 2026-05-02 for Kelly's Tier-3 network-resilience pass.
// ─────────────────────────────────────────────────────────────────────────────

export const DEFAULT_TIMEOUT_MS = 30_000;
export const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes

// One automatic retry on a 5xx response (covers Kelly's CC-3: nginx returns
// an occasional 502/503/504 when its convex.cloud upstream connect times out
// before nginx falls through to the next anycast IP). One retry with a
// jittered ~500ms backoff hides almost all of that flake from the user
// without amplifying load on a genuinely-down backend.
const RETRY_STATUS = new Set([502, 503, 504]);
const RETRY_BASE_DELAY_MS = 500;

const sleep = (ms: number) => new Promise<void>((res) => setTimeout(res, ms));

/**
 * fetch() with an AbortController-backed timeout + a single retry on 5xx
 * responses (502/503/504). Re-raises an AbortError as a clearer
 * `Error('Request timed out after Nms: <url>')` so consumers can surface a
 * friendly "request timed out" message rather than a raw AbortError stack
 * trace.
 *
 * If the caller passes their own AbortSignal via `init.signal`, the timeout
 * controller listens for it and aborts in step — so an unmount-driven
 * cancellation also cancels the inner timer.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  // Two attempts max: original + one retry-with-backoff on 5xx.
  let lastResponse: Response | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) {
      // External abort cancels the retry too.
      if (init.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      // 500ms ± 250ms jitter so concurrent callers don't all retry in lockstep.
      const jitter = Math.floor(Math.random() * 250) - 125;
      await sleep(RETRY_BASE_DELAY_MS + jitter);
    }
    const r = await fetchWithTimeoutOnce(url, init, timeoutMs);
    if (!RETRY_STATUS.has(r.status)) return r;
    lastResponse = r;
  }
  // Both attempts returned 5xx — hand the second response back; the consumer's
  // existing `!r.ok` branch will surface the error message normally.
  return lastResponse!;
}

async function fetchWithTimeoutOnce(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const ac = new AbortController();
  const timeoutId = setTimeout(() => ac.abort(), timeoutMs);

  // Chain caller's external signal (e.g. effect-cleanup AbortController) to
  // our internal one so external aborts also cancel the timer race.
  const externalSignal = init.signal;
  const onExternalAbort = () => ac.abort();
  if (externalSignal) {
    if (externalSignal.aborted) ac.abort();
    else externalSignal.addEventListener('abort', onExternalAbort);
  }

  try {
    const r = await fetch(url, { ...init, signal: ac.signal });
    return r;
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      // Distinguish caller-driven abort from timeout. If the external signal
      // fired, propagate the original AbortError so React's effect-cleanup
      // logic can recognize it. Otherwise it was our timer.
      if (externalSignal?.aborted) throw e;
      throw new Error(`Request timed out after ${timeoutMs}ms: ${url}`);
    }
    throw e;
  } finally {
    clearTimeout(timeoutId);
    if (externalSignal) externalSignal.removeEventListener('abort', onExternalAbort);
  }
}

// ─── In-memory JSON cache ─────────────────────────────────────────────────
// Keyed cache of resolved JSON values + their expiry. Stale entries are
// dropped on access; there's no background sweeper because the SPA tab
// itself rarely outlives the TTL. The promise map de-dupes concurrent
// requests for the same key.
interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}
const VALUE_CACHE: Map<string, CacheEntry<unknown>> = new Map();
const INFLIGHT: Map<string, Promise<unknown>> = new Map();

/**
 * cachedJSON — return a cached value for `key`, or run `loader()` and cache
 * its result for `ttlMs`. Concurrent calls for the same key share a single
 * in-flight promise so we don't fan-out N identical requests.
 *
 * The loader receives no args — close over whatever you need. Errors from
 * the loader are NOT cached (so a transient failure doesn't poison the
 * cache); the inflight promise is cleared on rejection.
 */
export async function cachedJSON<T>(
  key: string,
  loader: () => Promise<T>,
  ttlMs: number = DEFAULT_TTL_MS,
): Promise<T> {
  const now = Date.now();
  const cached = VALUE_CACHE.get(key) as CacheEntry<T> | undefined;
  if (cached && cached.expiresAt > now) return cached.value;

  const existing = INFLIGHT.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const p = (async () => {
    try {
      const value = await loader();
      VALUE_CACHE.set(key, { value, expiresAt: Date.now() + ttlMs });
      return value;
    } finally {
      INFLIGHT.delete(key);
    }
  })();
  INFLIGHT.set(key, p);
  return p;
}

/**
 * invalidateCache — drop a single key (or every key matching a prefix) from
 * the in-memory cache. Useful for "force refresh" UX or when an upstream
 * mutation invalidates a cached read. Pass no args to wipe everything.
 */
export function invalidateCache(prefixOrKey?: string): void {
  if (!prefixOrKey) {
    VALUE_CACHE.clear();
    return;
  }
  for (const k of Array.from(VALUE_CACHE.keys())) {
    if (k === prefixOrKey || k.startsWith(prefixOrKey)) VALUE_CACHE.delete(k);
  }
}

/**
 * fetchJSONCached — convenience: fetch a URL with a timeout AND cache the
 * parsed JSON for `ttlMs`. The cache key defaults to the URL but can be
 * overridden when query-string ordering or POST bodies need to participate.
 */
export async function fetchJSONCached<T = unknown>(
  url: string,
  opts: {
    init?: RequestInit;
    timeoutMs?: number;
    ttlMs?: number;
    cacheKey?: string;
  } = {},
): Promise<T> {
  const key = opts.cacheKey ?? url;
  return cachedJSON<T>(
    key,
    async () => {
      const r = await fetchWithTimeout(url, opts.init, opts.timeoutMs);
      if (!r.ok) throw new Error(`Fetch ${url} failed: ${r.status}`);
      return (await r.json()) as T;
    },
    opts.ttlMs,
  );
}
