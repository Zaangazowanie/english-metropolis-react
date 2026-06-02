// exerciseGroups.ts — backend for the test-english.com-style topic
// grouping feature on englishmetro.com /practice.
//
// Authored by Agent A in the sprint-2 build (2026-05-01). Sister
// agents:
//   - Agent B → frontend pages for the groups UI
//   - Agent C → wiring 28 generators into buildShellPuzzle
//   - Agent D → cross-shell utility promotion
//
// ───────────────────────────────────────────────────────────
// AUTH PATTERN
// ───────────────────────────────────────────────────────────
// Same as convex/practice.ts — these queries do NOT use
// ctx.auth.getUserIdentity(). They take an optional studentSlug
// when student-specific filtering is needed; otherwise they're
// open reads (the data is non-PII catalogue content).
//
// ───────────────────────────────────────────────────────────
// TABLES
// ───────────────────────────────────────────────────────────
// `exerciseGroups` — one row per (cefrLevel, category, subCategory)
//                    cluster of exercises. Surfaced as a card on
//                    the /practice landing page.
// `exercises`      — gains `groupId` (FK to exerciseGroups.groupId)
//                    and `compatibleShells` (string[]) — both
//                    populated by cluster-exercises-into-groups.ts.

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { Doc } from "./_generated/dataModel";

// ─────────────────────────────────────────────────────────────
// listGroups — list groups, optionally filtered by cefrLevel
// and/or category. Sorted by exerciseCount desc so the densest
// (most useful) topics surface first.
// ─────────────────────────────────────────────────────────────
export const listGroups = query({
  args: {
    cefrLevel: v.optional(v.string()),
    category: v.optional(v.string()),
  },
  handler: async (
    ctx,
    { cefrLevel, category },
  ): Promise<Doc<"exerciseGroups">[]> => {
    let rows: Doc<"exerciseGroups">[];
    if (cefrLevel && category) {
      rows = await ctx.db
        .query("exerciseGroups")
        .withIndex("by_cefr_category", (q) =>
          q.eq("cefrLevel", cefrLevel).eq("category", category),
        )
        .collect();
    } else if (cefrLevel) {
      rows = await ctx.db
        .query("exerciseGroups")
        .withIndex("by_cefr", (q) => q.eq("cefrLevel", cefrLevel))
        .collect();
    } else {
      rows = await ctx.db.query("exerciseGroups").collect();
      if (category) rows = rows.filter((r) => r.category === category);
    }
    return rows.sort(
      (a, b) => (b.exerciseCount ?? 0) - (a.exerciseCount ?? 0),
    );
  },
});

// ─────────────────────────────────────────────────────────────
// getGroup — return one group by groupId, plus all its member
// exercises (denormalised so the detail page renders in one round
// trip). Returns null when the groupId is unknown.
// ─────────────────────────────────────────────────────────────
export const getGroup = query({
  args: { groupId: v.string() },
  handler: async (
    ctx,
    { groupId },
  ): Promise<{
    group: Doc<"exerciseGroups">;
    exercises: Doc<"exercises">[];
  } | null> => {
    const group = await ctx.db
      .query("exerciseGroups")
      .withIndex("by_groupId", (q) => q.eq("groupId", groupId))
      .unique();
    if (!group) return null;
    const exercises = await ctx.db
      .query("exercises")
      .withIndex("by_groupId", (q) => q.eq("groupId", groupId))
      .collect();
    return { group, exercises };
  },
});

// ─────────────────────────────────────────────────────────────
// getExercisesForGroupAndShell — return only the exercises in
// `groupId` that are renderable in `shellKey`. Used by the
// "play this group in shell X" flow.
// ─────────────────────────────────────────────────────────────
export const getExercisesForGroupAndShell = query({
  args: {
    groupId: v.string(),
    shellKey: v.string(),
  },
  handler: async (
    ctx,
    { groupId, shellKey },
  ): Promise<Doc<"exercises">[]> => {
    const exercises = await ctx.db
      .query("exercises")
      .withIndex("by_groupId", (q) => q.eq("groupId", groupId))
      .collect();
    return exercises.filter((ex) =>
      (ex.compatibleShells ?? []).includes(shellKey),
    );
  },
});

// ─────────────────────────────────────────────────────────────
// getCompatibleShellsForGroup — return the deduped list of shells
// that can render at least one exercise in `groupId`, with a
// per-shell exercise count. Used by the group-detail page to
// populate the "Pick a shell" picker.
// ─────────────────────────────────────────────────────────────
export const getCompatibleShellsForGroup = query({
  args: { groupId: v.string() },
  handler: async (
    ctx,
    { groupId },
  ): Promise<Array<{ shellKey: string; exerciseCount: number }>> => {
    const exercises = await ctx.db
      .query("exercises")
      .withIndex("by_groupId", (q) => q.eq("groupId", groupId))
      .collect();
    const counts: Record<string, number> = {};
    for (const ex of exercises) {
      for (const shell of ex.compatibleShells ?? []) {
        counts[shell] = (counts[shell] ?? 0) + 1;
      }
    }
    return Object.entries(counts)
      .map(([shellKey, exerciseCount]) => ({ shellKey, exerciseCount }))
      .sort((a, b) => b.exerciseCount - a.exerciseCount);
  },
});

// ─────────────────────────────────────────────────────────────
// bulkSetGroupAndCompatibility — mutation called by the
// auto-tagger (scripts/cluster-exercises-into-groups.ts). Upserts
// both the exerciseGroups rows AND the per-exercise group/shell
// metadata in a single round trip.
//
// SHAPE (callable from Agent B + C):
//   args: {
//     groups: Array<{
//       groupId: string,
//       topicEn: string,
//       topicPl: string,
//       cefrLevel: string,
//       category: string,
//       subCategory?: string,
//       description?: string,
//       descriptionPl?: string,
//       illustrationUrl?: string,
//       errorCategories: string[],
//       exerciseCount?: number,
//       compatibleShells?: string[],
//     }>,
//     exercises: Array<{
//       exerciseId: string,
//       groupId: string,
//       compatibleShells: string[],
//     }>,
//   }
//   returns: {
//     groupsInserted: number,
//     groupsUpdated: number,
//     exercisesUpdated: number,
//     exercisesSkipped: number,
//   }
// ─────────────────────────────────────────────────────────────
export const bulkSetGroupAndCompatibility = mutation({
  args: {
    groups: v.array(
      v.object({
        groupId: v.string(),
        topicEn: v.string(),
        topicPl: v.string(),
        cefrLevel: v.string(),
        category: v.string(),
        subCategory: v.optional(v.string()),
        description: v.optional(v.string()),
        descriptionPl: v.optional(v.string()),
        illustrationUrl: v.optional(v.string()),
        errorCategories: v.array(v.string()),
        exerciseCount: v.optional(v.number()),
        compatibleShells: v.optional(v.array(v.string())),
      }),
    ),
    exercises: v.array(
      v.object({
        exerciseId: v.string(),
        groupId: v.string(),
        compatibleShells: v.array(v.string()),
      }),
    ),
  },
  handler: async (ctx, { groups, exercises }) => {
    const now = Date.now();
    let groupsInserted = 0;
    let groupsUpdated = 0;
    let exercisesUpdated = 0;
    let exercisesSkipped = 0;

    // ── 1. Upsert groups ───────────────────────────────────
    for (const g of groups) {
      const existing = await ctx.db
        .query("exerciseGroups")
        .withIndex("by_groupId", (q) => q.eq("groupId", g.groupId))
        .unique();
      if (existing) {
        await ctx.db.patch(existing._id, { ...g, updatedAt: now });
        groupsUpdated++;
      } else {
        await ctx.db.insert("exerciseGroups", {
          ...g,
          createdAt: now,
          updatedAt: now,
        });
        groupsInserted++;
      }
    }

    // ── 2. Patch exercise rows with groupId + compatibleShells ──
    for (const ex of exercises) {
      const row = await ctx.db
        .query("exercises")
        .withIndex("by_exerciseId", (q) => q.eq("exerciseId", ex.exerciseId))
        .unique();
      if (!row) {
        exercisesSkipped++;
        continue;
      }
      await ctx.db.patch(row._id, {
        groupId: ex.groupId,
        compatibleShells: ex.compatibleShells,
      });
      exercisesUpdated++;
    }

    return {
      groupsInserted,
      groupsUpdated,
      exercisesUpdated,
      exercisesSkipped,
    };
  },
});

// ─────────────────────────────────────────────────────────────
// adminDeleteGroups — internal cleanup helper. Deletes a list of
// exerciseGroups rows by groupId AND nulls out exercises.groupId
// + exercises.compatibleShells for any exercise pointing at one
// of those groups.
//
// This exists so the auto-tagger debug rows (e.g. "g0-a1" through
// "g79-a1" inserted during sprint-2 development) can be swept
// without dropping the entire table. Safe to call repeatedly —
// missing rows are silently ignored.
// ─────────────────────────────────────────────────────────────
export const adminDeleteGroups = mutation({
  args: {
    groupIds: v.array(v.string()),
  },
  handler: async (ctx, { groupIds }) => {
    let groupsDeleted = 0;
    let exercisesUnlinked = 0;
    for (const gid of groupIds) {
      const row = await ctx.db
        .query("exerciseGroups")
        .withIndex("by_groupId", (q) => q.eq("groupId", gid))
        .unique();
      if (row) {
        await ctx.db.delete(row._id);
        groupsDeleted++;
      }
      const orphans = await ctx.db
        .query("exercises")
        .withIndex("by_groupId", (q) => q.eq("groupId", gid))
        .collect();
      for (const ex of orphans) {
        await ctx.db.patch(ex._id, {
          groupId: undefined,
          compatibleShells: undefined,
        });
        exercisesUnlinked++;
      }
    }
    return { groupsDeleted, exercisesUnlinked };
  },
});
