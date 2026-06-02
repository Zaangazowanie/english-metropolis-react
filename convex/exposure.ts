// exposure.ts — session-level exposure memory for the content scheduler.
// Phase 1.1 of the §4-#21 (Mike CRITICAL) sprint, authored by Ricky
// 2026-05-02 in response to CD's audit finding that the same 5-6
// sentences keep recycling across shells despite Aleksandra's 168+
// keyword bank.
//
// What this file owns:
//   - recordExposure mutation        — log one item shown to a student
//   - recordExposureBatch mutation   — log many in one round-trip
//   - recentExposures query          — last-N-ms exposures for a student
//   - listExposureCounts query       — per-item occurrence counts
//   - pruneOldExposures internal     — TTL sweep, called from crons.ts
//
// What this file deliberately does NOT do:
//   - Filtering / re-ranking — that's the variety guard (G2 / Leitner /
//     modal) job. This file only tracks data; consumers decide what to
//     do with it. See audit §4 #21 phase 1.2 onward.
//   - Touching the suitability filter, hint sanitiser, generators or
//     shells. This is a pure additive instrumentation layer.
//
// Auth pattern matches practice.ts: every entry point takes
// `studentSlug` as an explicit arg. Anonymous (design-canvas) callers
// pass nothing → we silently no-op so design demos don't pollute the
// table.

import { mutation, query, internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";

const ANON_SLUG = "__anon__";

// Trim per-(student, item) history to this many rows on every record.
// Rationale: the variety guard only ever asks "did the student see X
// recently?" — older repeats add no signal but cost storage. 5 rows is
// enough for "5 different shells in the same session" before the rolling
// window kicks in.
const PER_ITEM_KEEP_N = 5;

// TTL sweep horizon: drop exposure rows older than 30 days. 30d > the
// longest Leitner box interval (~14d) by design — once an item is so
// stale it can't influence spaced-rep scheduling, the row is overhead.
const PRUNE_HORIZON_MS = 30 * 24 * 60 * 60 * 1000;

// Hard cap on rows scanned per pruneOldExposures invocation. Keeps the
// daily cron well under Convex's transaction time budget even on a
// pathological day; if we hit the cap, the next day's run picks up the
// rest. 5000 = ~5x current daily volume budget.
const PRUNE_BATCH_LIMIT = 5000;

const ITEM_KIND = v.union(
  v.literal("exercise"),
  v.literal("keyword"),
);

// ─────────────────────────────────────────────────────────────
// recordExposure — log a single item shown to the student. Trims the
// per-item history to PER_ITEM_KEEP_N as a side-effect (oldest first).
// Anonymous callers (no slug) are a silent no-op.
// ─────────────────────────────────────────────────────────────
export const recordExposure = mutation({
  args: {
    studentSlug: v.optional(v.string()),
    itemId: v.string(),
    itemKind: ITEM_KIND,
    shellKey: v.string(),
  },
  handler: async (ctx, args) => {
    const slug = args.studentSlug;
    // Anon design-canvas calls don't write — keeps the table clean and
    // avoids a single shared "__anon__" row hot-spotting the index.
    if (!slug || slug === ANON_SLUG) return null;

    const now = Date.now();
    const id = await ctx.db.insert("practiceExposure", {
      studentSlug: slug,
      itemId: args.itemId,
      itemKind: args.itemKind,
      shellKey: args.shellKey,
      exposedAt: now,
    });

    // Trim per-(student, item) history to the most recent N rows.
    // Oldest rows are dropped — the recency signal is what matters.
    await trimPerItemHistory(ctx, slug, args.itemId);
    return id;
  },
});

// ─────────────────────────────────────────────────────────────
// recordExposureBatch — same as recordExposure but accepts an array.
// Used by the frontend after a puzzle is built (typically 5-12 items
// per shell entry) to avoid N HTTP round-trips.
// ─────────────────────────────────────────────────────────────
export const recordExposureBatch = mutation({
  args: {
    studentSlug: v.optional(v.string()),
    shellKey: v.string(),
    items: v.array(v.object({
      itemId: v.string(),
      itemKind: ITEM_KIND,
    })),
  },
  handler: async (ctx, args) => {
    const slug = args.studentSlug;
    if (!slug || slug === ANON_SLUG) return { inserted: 0 };
    if (args.items.length === 0) return { inserted: 0 };

    const now = Date.now();
    let inserted = 0;
    // De-dupe within the same call so we don't write 12 identical rows
    // when the same itemId surfaces multiple times in one puzzle (e.g.
    // crossword + bank-distractors). Per-call dedupe is enough; we
    // intentionally allow the same item to be re-recorded on a later
    // call — that's the "exposed twice in this session" signal.
    const seen = new Set<string>();
    for (const it of args.items) {
      if (seen.has(it.itemId)) continue;
      seen.add(it.itemId);
      await ctx.db.insert("practiceExposure", {
        studentSlug: slug,
        itemId: it.itemId,
        itemKind: it.itemKind,
        shellKey: args.shellKey,
        exposedAt: now,
      });
      inserted++;
    }
    // Trim each touched item's history. Done after all inserts so the
    // newest row from this call is preserved.
    for (const itemId of seen) {
      await trimPerItemHistory(ctx, slug, itemId);
    }
    return { inserted };
  },
});

// ─────────────────────────────────────────────────────────────
// recentExposures — return all exposure rows for a student within the
// last `withinMs` (default 7 days). Sorted newest-first so consumers
// can early-exit. Empty array on anonymous / unknown slug.
//
// Consumer side (G2 variety guard, NOT this file's job): build a
// Map<itemId, { count, lastExposedAt, shells: Set<string> }> from the
// returned array and de-prioritise items whose count > N or whose
// lastExposedAt is too recent.
// ─────────────────────────────────────────────────────────────
export const recentExposures = query({
  args: {
    studentSlug: v.optional(v.string()),
    withinMs: v.optional(v.number()),         // default 7d
    limit: v.optional(v.number()),            // safety cap, default 500
  },
  handler: async (ctx, args) => {
    const slug = args.studentSlug;
    if (!slug || slug === ANON_SLUG) return [];

    const horizon = Date.now() - (args.withinMs ?? 7 * 24 * 60 * 60 * 1000);
    const cap = Math.min(args.limit ?? 500, 2000);

    const rows = await ctx.db
      .query("practiceExposure")
      .withIndex("by_student_exposed", (q) =>
        q.eq("studentSlug", slug).gt("exposedAt", horizon),
      )
      .order("desc")
      .take(cap);

    return rows.map((r: Doc<"practiceExposure">) => ({
      itemId: r.itemId,
      itemKind: r.itemKind,
      shellKey: r.shellKey,
      exposedAt: r.exposedAt,
    }));
  },
});

// ─────────────────────────────────────────────────────────────
// listExposureCounts — collapse recentExposures() into a per-item
// summary. Convenience for the future variety-guard consumer.
// ─────────────────────────────────────────────────────────────
export const listExposureCounts = query({
  args: {
    studentSlug: v.optional(v.string()),
    withinMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const slug = args.studentSlug;
    if (!slug || slug === ANON_SLUG) return [];

    const horizon = Date.now() - (args.withinMs ?? 7 * 24 * 60 * 60 * 1000);
    const rows = await ctx.db
      .query("practiceExposure")
      .withIndex("by_student_exposed", (q) =>
        q.eq("studentSlug", slug).gt("exposedAt", horizon),
      )
      .take(2000);

    const byItem = new Map<string, {
      itemId: string;
      itemKind: "exercise" | "keyword";
      count: number;
      lastExposedAt: number;
      shells: string[];
    }>();
    for (const r of rows) {
      const existing = byItem.get(r.itemId);
      if (existing) {
        existing.count++;
        if (r.exposedAt > existing.lastExposedAt) existing.lastExposedAt = r.exposedAt;
        if (!existing.shells.includes(r.shellKey)) existing.shells.push(r.shellKey);
      } else {
        byItem.set(r.itemId, {
          itemId: r.itemId,
          itemKind: r.itemKind,
          count: 1,
          lastExposedAt: r.exposedAt,
          shells: [r.shellKey],
        });
      }
    }
    return Array.from(byItem.values());
  },
});

// ─────────────────────────────────────────────────────────────
// pruneOldExposures — internal mutation invoked daily by
// convex/crons.ts. Drops rows older than PRUNE_HORIZON_MS, capped at
// PRUNE_BATCH_LIMIT per call so we never blow the transaction budget.
// ─────────────────────────────────────────────────────────────
export const pruneOldExposures = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - PRUNE_HORIZON_MS;
    const stale = await ctx.db
      .query("practiceExposure")
      .withIndex("by_exposed", (q) => q.lt("exposedAt", cutoff))
      .take(PRUNE_BATCH_LIMIT);
    for (const row of stale) {
      await ctx.db.delete(row._id);
    }
    return { deleted: stale.length, hitCap: stale.length === PRUNE_BATCH_LIMIT };
  },
});

// ─────────────────────────────────────────────────────────────
// Internal helper — trim per-(student, item) history to PER_ITEM_KEEP_N
// rows. Reads via the by_student_item index, sorts newest-first, drops
// the tail. Called from recordExposure and recordExposureBatch.
// ─────────────────────────────────────────────────────────────
async function trimPerItemHistory(
  ctx: MutationCtx,
  studentSlug: string,
  itemId: string,
): Promise<void> {
  const rows: Doc<"practiceExposure">[] = await ctx.db
    .query("practiceExposure")
    .withIndex("by_student_item", (q) =>
      q.eq("studentSlug", studentSlug).eq("itemId", itemId),
    )
    .collect();
  if (rows.length <= PER_ITEM_KEEP_N) return;
  rows.sort((a, b) => b.exposedAt - a.exposedAt);
  const toDelete = rows.slice(PER_ITEM_KEEP_N);
  for (const row of toDelete) {
    await ctx.db.delete(row._id);
  }
}
