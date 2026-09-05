// worldProgress.ts — server-side save + leaderboard for the open-world game at
// /play (English Metropolis, "Metro Pass").
//
// ─────────────────────────────────────────────────────────────
// AUTH PATTERN
// ─────────────────────────────────────────────────────────────
// The game is static files behind a signup wall; the only identity it holds is
// the student session token in localStorage (em-student-session), which the
// wall already sends to studentAuth:myVerification. Every function here takes
// that token and resolves it with requireStudent — there is NO anonymous read
// or write, and a client-supplied id is never trusted (the 2026-09-04 audit
// found anonymous Convex reads of student data elsewhere; this module must not
// add another). The game calls these through the nginx /api/query and
// /api/mutation proxies (rate-limited there).
//
// Merge policy: the client merges on load (max laps, union of done sets, max
// XP) and sends the merged result; the server only refuses regressions — XP
// can never go down, and a save carrying an older stateVersion than the row is
// ignored, so a stale tab cannot overwrite a newer device.

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireStudent } from "./authHelpers";

const STATE_CAP = 64 * 1024;       // bytes of JSON one row may hold
const BOARD_MAX = 50;

// ISO-8601 week key, e.g. "2026-W36". Weekly XP resets when this rolls over.
export function isoWeekKey(ts: number): string {
  const d = new Date(ts);
  const day = (d.getUTCDay() + 6) % 7;                 // Monday = 0
  d.setUTCDate(d.getUTCDate() - day + 3);              // Thursday of this week
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((d.getTime() - firstThursday.getTime()) / 86400000
    - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

// "Aleksandra Górska" → "Aleksandra G." — the leaderboard shows other students,
// so never the surname, never the email, never an id.
function publicName(name: string): string {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "Traveller";
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

// ─────────────────────────────────────────────────────────────
// load — the caller's own row, or null when they have never saved.
// Throws only on a bad session, which the client treats as "offline".
// ─────────────────────────────────────────────────────────────
export const load = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }) => {
    const { student } = await requireStudent(ctx, sessionToken);
    const row = await ctx.db
      .query("worldProgress")
      .withIndex("by_student", (q) => q.eq("studentId", student._id))
      .unique();
    if (!row) return null;
    const week = isoWeekKey(Date.now());
    return {
      xp: row.xp,
      rank: row.rank,
      stamps: row.stamps,
      weekXp: row.weekKey === week ? row.weekXp : 0,
      state: row.state,
      stateVersion: row.stateVersion,
      updatedAt: row.updatedAt,
    };
  },
});

// ─────────────────────────────────────────────────────────────
// save — write-through from the client (debounced there). xpDelta is the XP
// earned since the previous successful save and feeds the weekly board; xp is
// the lifetime total the client believes in. Returns what the row now holds so
// the client can reconcile.
// ─────────────────────────────────────────────────────────────
export const save = mutation({
  args: {
    sessionToken: v.string(),
    xp: v.number(),
    xpDelta: v.number(),
    rank: v.string(),
    stamps: v.number(),
    state: v.string(),
    stateVersion: v.number(),
  },
  handler: async (ctx, args) => {
    const { student } = await requireStudent(ctx, args.sessionToken);
    if (args.state.length > STATE_CAP) {
      throw new Error(`state too large (${args.state.length} > ${STATE_CAP})`);
    }
    if (!Number.isFinite(args.xp) || args.xp < 0 || !Number.isFinite(args.xpDelta) || args.xpDelta < 0) {
      throw new Error("xp must be a non-negative number");
    }
    const now = Date.now();
    const week = isoWeekKey(now);
    const existing = await ctx.db
      .query("worldProgress")
      .withIndex("by_student", (q) => q.eq("studentId", student._id))
      .unique();

    if (!existing) {
      const id = await ctx.db.insert("worldProgress", {
        studentId: student._id,
        xp: args.xp,
        rank: args.rank,
        stamps: args.stamps,
        weekKey: week,
        weekXp: Math.min(args.xpDelta, args.xp),
        state: args.state,
        stateVersion: args.stateVersion,
        updatedAt: now,
      });
      const row = await ctx.db.get(id);
      return { accepted: true, xp: row!.xp, stateVersion: row!.stateVersion, weekXp: row!.weekXp };
    }

    // A stale tab (older version than the row) must not clobber a newer device.
    // Tell the client so it reloads and re-merges instead of retrying blindly.
    if (args.stateVersion < existing.stateVersion) {
      return { accepted: false, xp: existing.xp, stateVersion: existing.stateVersion, weekXp: existing.weekKey === week ? existing.weekXp : 0 };
    }

    const weekXp = (existing.weekKey === week ? existing.weekXp : 0) + args.xpDelta;
    await ctx.db.patch(existing._id, {
      xp: Math.max(existing.xp, args.xp),            // lifetime XP never regresses
      rank: args.rank,
      stamps: Math.max(existing.stamps, args.stamps),
      weekKey: week,
      weekXp,
      state: args.state,
      stateVersion: args.stateVersion,
      updatedAt: now,
    });
    return { accepted: true, xp: Math.max(existing.xp, args.xp), stateVersion: args.stateVersion, weekXp };
  },
});

// ─────────────────────────────────────────────────────────────
// leaderboard — top rows by lifetime XP ("all") or this ISO week ("week"), plus
// the caller's own position. Public fields only: first name + initial, xp,
// rank, stamps. Requires a live student session like everything else here.
// ─────────────────────────────────────────────────────────────
export const leaderboard = query({
  args: {
    sessionToken: v.string(),
    scope: v.union(v.literal("all"), v.literal("week")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { sessionToken, scope, limit }) => {
    const { student } = await requireStudent(ctx, sessionToken);
    const n = Math.max(1, Math.min(BOARD_MAX, Math.floor(limit ?? 20)));
    const week = isoWeekKey(Date.now());

    const rows = scope === "week"
      ? await ctx.db.query("worldProgress")
          .withIndex("by_week", (q) => q.eq("weekKey", week))
          .order("desc")
          .take(n)
      : await ctx.db.query("worldProgress")
          .withIndex("by_xp")
          .order("desc")
          .take(n);

    const board = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const s = await ctx.db.get(r.studentId);
      board.push({
        position: i + 1,
        name: publicName(s?.name ?? ""),
        xp: scope === "week" ? r.weekXp : r.xp,
        rank: r.rank,
        stamps: r.stamps,
        isYou: r.studentId === student._id,
      });
    }

    // The caller's own position when they are not in the top n. Rows are few
    // enough (one per student) that a count above their score is cheap.
    let you: { position: number; xp: number } | null = null;
    const mine = await ctx.db.query("worldProgress")
      .withIndex("by_student", (q) => q.eq("studentId", student._id))
      .unique();
    if (mine) {
      const myScore = scope === "week" ? (mine.weekKey === week ? mine.weekXp : 0) : mine.xp;
      const above = scope === "week"
        ? await ctx.db.query("worldProgress")
            .withIndex("by_week", (q) => q.eq("weekKey", week).gt("weekXp", myScore))
            .collect()
        : await ctx.db.query("worldProgress")
            .withIndex("by_xp", (q) => q.gt("xp", myScore))
            .collect();
      you = { position: above.length + 1, xp: myScore };
    }

    return { scope, week, board, you, total: board.length };
  },
});
