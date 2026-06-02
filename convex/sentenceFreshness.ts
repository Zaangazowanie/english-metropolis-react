// sentenceFreshness.ts — Phase 2 of the §4-#21 (Mike CRITICAL) sprint.
// Authored by Ricky 2026-05-02.
//
// This module owns the persisted (cross-session) cache of LLM-generated
// fresh example sentences for a (keyword × cefr × topic) tuple. The
// actual Qwen2.5-3B / qwen3.5:9b generation happens in a Node-side
// proxy service on Bob's VPS (see /root/.openclaw/services/sentence-
// freshness/server.py + the /api/sentence-freshness nginx route),
// because Convex actions run in the Convex cloud and cannot reach
// 127.0.0.1:11434 on Bob's box.
//
// The flow at runtime:
//   1. Frontend calls sentenceFreshness:get with (keyword, cefr, topic).
//      → returns { sentences: [...], hot: true }   if cache hit
//      → returns { sentences: [], hot: false }     if miss
//   2. Frontend (on miss OR on stale hit) calls /api/sentence-freshness
//      → Node service prompts Ollama with past sentences as forbidden
//      → Node service returns the new sentence text + ms latency
//   3. Frontend calls sentenceFreshness:put to persist the new sentence
//      back into the cache (we keep up to 5 recent generations per key).
//
// Why not `internalAction` calling Ollama directly?
//   Convex internal actions run in Convex's cloud — Ollama is on
//   127.0.0.1:11434 of Bob's VPS, no public reachability. We deliberately
//   keep the cache + the generation as separate hops so the cache is
//   the durable layer (Convex) and the generator can be swapped without
//   schema migration.
//
// Anonymous callers are fine — the cache is keyed by (keyword, cefr,
// topic), not by student. Per-student exposure of these generated
// sentences is tracked separately in practiceExposure.

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";

// Keep up to N recent generations per cache key. >N becomes stale and
// gets dropped on the next `put`. 5 is enough to drive the "forbidden
// examples" novelty constraint without bloating storage.
const KEEP_N_PER_KEY = 5;

// A cache entry counts as "hot" if its newest sentence was generated
// within this window. Older entries are still served (better than the
// static example) but the frontend background-refreshes them.
const HOT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // 30d (matches Mike's "no repeat within 30d" constraint)

// Normalise the parts of the cache key. Lowercase + trim + collapse
// internal whitespace; substitute "*" for empty values so we always
// have a valid index probe.
function normKey(keyword: string, cefr: string | undefined, topic: string | undefined) {
  const k = (keyword ?? "").trim().toLowerCase();
  const c = (cefr ?? "").trim().toUpperCase() || "*";
  const t = (topic ?? "").trim().toLowerCase().replace(/\s+/g, " ") || "*";
  return { keyword: k, cefr: c, topic: t };
}

// ─────────────────────────────────────────────────────────────
// get — read the cache. Always returns a result; the `hot` flag tells
// the frontend whether to background-refresh.
// ─────────────────────────────────────────────────────────────
export const get = query({
  args: {
    keyword: v.string(),
    cefr: v.optional(v.string()),
    topic: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const k = normKey(args.keyword, args.cefr, args.topic);
    if (!k.keyword) return { sentences: [], hot: false, key: k };

    // Look up the exact tuple first.
    const exact = await ctx.db
      .query("sentenceFreshnessCache")
      .withIndex("by_key", (q) =>
        q.eq("keyword", k.keyword).eq("cefr", k.cefr).eq("topic", k.topic),
      )
      .first();

    if (exact) {
      const newest = exact.sentences.reduce(
        (acc: number, s) => (s.generatedAt > acc ? s.generatedAt : acc),
        0,
      );
      const hot = newest > 0 && Date.now() - newest < HOT_WINDOW_MS;
      return {
        sentences: exact.sentences.slice().sort((a, b) => b.generatedAt - a.generatedAt),
        hot,
        key: k,
      };
    }

    // Loose fallback — same keyword + cefr, any topic. Lets the frontend
    // still get *some* fresh sentence if a student is on a niche topic
    // we've never generated for. We don't fall back across cefr because
    // a B2 sentence is meaningfully different from an A1 one.
    if (k.topic !== "*") {
      const looseHits = await ctx.db
        .query("sentenceFreshnessCache")
        .withIndex("by_keyword", (q) => q.eq("keyword", k.keyword))
        .take(20);
      const sameLevel = looseHits.filter((r) => r.cefr === k.cefr);
      if (sameLevel.length > 0) {
        // Flatten + dedupe by text + sort newest-first
        const flat = sameLevel.flatMap((r) => r.sentences);
        const seen = new Set<string>();
        const merged = [];
        for (const s of flat.sort((a, b) => b.generatedAt - a.generatedAt)) {
          if (seen.has(s.text)) continue;
          seen.add(s.text);
          merged.push(s);
          if (merged.length >= KEEP_N_PER_KEY) break;
        }
        const newest = merged[0]?.generatedAt ?? 0;
        const hot = newest > 0 && Date.now() - newest < HOT_WINDOW_MS;
        return { sentences: merged, hot, key: k };
      }
    }

    return { sentences: [], hot: false, key: k };
  },
});

// ─────────────────────────────────────────────────────────────
// put — append a freshly-generated sentence to the cache. Upserts the
// row; trims to KEEP_N_PER_KEY by recency.
// ─────────────────────────────────────────────────────────────
export const put = mutation({
  args: {
    keyword: v.string(),
    cefr: v.optional(v.string()),
    topic: v.optional(v.string()),
    sentence: v.string(),
    model: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const k = normKey(args.keyword, args.cefr, args.topic);
    const text = (args.sentence ?? "").trim();
    if (!k.keyword || !text) return null;

    const now = Date.now();
    const newEntry = { text, generatedAt: now, model: args.model };

    const existing = await ctx.db
      .query("sentenceFreshnessCache")
      .withIndex("by_key", (q) =>
        q.eq("keyword", k.keyword).eq("cefr", k.cefr).eq("topic", k.topic),
      )
      .first();

    if (!existing) {
      const id = await ctx.db.insert("sentenceFreshnessCache", {
        keyword: k.keyword,
        cefr: k.cefr,
        topic: k.topic,
        sentences: [newEntry],
        updatedAt: now,
      });
      return id;
    }

    // De-dupe by exact text — if Qwen happened to regenerate the same
    // sentence we already have, bump its timestamp instead of doubling.
    const lower = text.toLowerCase();
    let merged = existing.sentences.filter(
      (s) => s.text.trim().toLowerCase() !== lower,
    );
    merged = [newEntry, ...merged].slice(0, KEEP_N_PER_KEY);

    await ctx.db.patch(existing._id, {
      sentences: merged,
      updatedAt: now,
    });
    return existing._id;
  },
});

// ─────────────────────────────────────────────────────────────
// listForKeyword — debug / admin helper. Returns every cached entry
// (across cefr + topic) for a given keyword.
// ─────────────────────────────────────────────────────────────
export const listForKeyword = query({
  args: { keyword: v.string() },
  handler: async (ctx, args) => {
    const k = (args.keyword ?? "").trim().toLowerCase();
    if (!k) return [];
    const rows = await ctx.db
      .query("sentenceFreshnessCache")
      .withIndex("by_keyword", (q) => q.eq("keyword", k))
      .take(50);
    return rows.map((r: Doc<"sentenceFreshnessCache">) => ({
      keyword: r.keyword,
      cefr: r.cefr,
      topic: r.topic,
      sentences: r.sentences,
      updatedAt: r.updatedAt,
    }));
  },
});
