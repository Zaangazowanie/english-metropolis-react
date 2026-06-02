// ─────────────────────────────────────────────────────────────────────
// Zestaw keywords — authoritative vocabulary sets scraped by Mike from
// the English-Line teacher panel (moje.english-line.pl/teacher/zestaw).
// These drive the "MUST INCLUDE" layer in the ingestion keyword prompt.
// ─────────────────────────────────────────────────────────────────────

import { v } from "convex/values";
import {
  query,
  internalMutation,
  internalQuery,
  mutation,
} from "./_generated/server";

// ─────────────────────────────────────────────────────────────────────
// Seed — called by /root/seed_zestaw.py for each page in the scraped
// JSON. Idempotent: wipes prior rows for the same sid before inserting.
// ─────────────────────────────────────────────────────────────────────

export const seedZestawKeywords = internalMutation({
  args: {
    apiToken: v.string(),
    sid: v.string(),
    courseId: v.string(),
    lessonTitle: v.string(),
    lessonDate: v.optional(v.string()),
    teacher: v.optional(v.string()),
    courseName: v.optional(v.string()),
    keywords: v.array(
      v.object({
        nr: v.optional(v.number()),
        word: v.string(),
        translation: v.string(),
        exampleEn: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const expected = process.env.INGEST_API_TOKEN;
    if (!expected || args.apiToken !== expected) {
      throw new Error("Unauthorized — bad INGEST_API_TOKEN");
    }

    // Wipe any existing rows for this sid so re-runs stay clean.
    const existing = await ctx.db
      .query("zestawKeywords")
      .withIndex("by_sid", q => q.eq("sid", args.sid))
      .collect();
    for (const row of existing) {
      await ctx.db.delete(row._id);
    }

    const now = Date.now();
    let inserted = 0;
    for (const kw of args.keywords) {
      const word = kw.word.trim();
      if (!word) continue;
      await ctx.db.insert("zestawKeywords", {
        sid: args.sid,
        courseId: args.courseId,
        lessonTitle: args.lessonTitle,
        lessonDate: args.lessonDate,
        nr: kw.nr,
        word,
        translation: kw.translation.trim(),
        exampleEn: kw.exampleEn?.trim() || undefined,
        teacher: args.teacher,
        courseName: args.courseName,
        createdAt: now,
      });
      inserted++;
    }
    return { sid: args.sid, inserted, replaced: existing.length };
  },
});

// Public variant used by the seed script over HTTP (via runMutation).
// The apiToken is validated inside the handler; no need for an
// acting-user check here.
export const seedZestawKeywordsPublic = mutation({
  args: {
    apiToken: v.string(),
    sid: v.string(),
    courseId: v.string(),
    lessonTitle: v.string(),
    lessonDate: v.optional(v.string()),
    teacher: v.optional(v.string()),
    courseName: v.optional(v.string()),
    keywords: v.array(
      v.object({
        nr: v.optional(v.number()),
        word: v.string(),
        translation: v.string(),
        exampleEn: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const expected = process.env.INGEST_API_TOKEN;
    if (!expected || args.apiToken !== expected) {
      throw new Error("Unauthorized — bad INGEST_API_TOKEN");
    }
    const existing = await ctx.db
      .query("zestawKeywords")
      .withIndex("by_sid", q => q.eq("sid", args.sid))
      .collect();
    for (const row of existing) {
      await ctx.db.delete(row._id);
    }
    const now = Date.now();
    let inserted = 0;
    for (const kw of args.keywords) {
      const word = kw.word.trim();
      if (!word) continue;
      await ctx.db.insert("zestawKeywords", {
        sid: args.sid,
        courseId: args.courseId,
        lessonTitle: args.lessonTitle,
        lessonDate: args.lessonDate,
        nr: kw.nr,
        word,
        translation: kw.translation.trim(),
        exampleEn: kw.exampleEn?.trim() || undefined,
        teacher: args.teacher,
        courseName: args.courseName,
        createdAt: now,
      });
      inserted++;
    }
    return { sid: args.sid, inserted, replaced: existing.length };
  },
});

// ─────────────────────────────────────────────────────────────────────
// Read helpers
// ─────────────────────────────────────────────────────────────────────

// Count of all zestaw rows (used to verify a successful seed).
export const countZestawKeywords = query({
  args: {},
  handler: async ctx => {
    const rows = await ctx.db.query("zestawKeywords").collect();
    return { total: rows.length };
  },
});

// Fetch all keywords for a given sid.
export const getBySid = query({
  args: { sid: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("zestawKeywords")
      .withIndex("by_sid", q => q.eq("sid", args.sid))
      .collect();
  },
});

// Resolve the zestaw keyword set for an ingestion job:
//   1. look up the student's group → group.courseId
//   2. find all zestawKeywords rows matching (courseId, lessonDate)
//      where lessonDate == job.detectedDate
//   3. if zero match and the date is close (within ±3 days), widen
//      the search to the nearest lesson in the same course
//
// Returns { sid, lessonTitle, keywords[] } or null if nothing matches.
export const resolveForJob = internalQuery({
  args: {
    studentId: v.optional(v.id("students")),
    detectedDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (!args.studentId || !args.detectedDate) return null;

    const student = await ctx.db.get(args.studentId);
    if (!student) return null;

    // A student may be in several groups via groupMemberships; pull
    // all active group courseIds and search each.
    const memberships = await ctx.db
      .query("groupMemberships")
      .withIndex("by_student", q => q.eq("studentId", args.studentId!))
      .collect();

    const groupIds = memberships
      .filter(m => m.isActive)
      .map(m => m.groupId);

    // Fall back to the student's primary groupId field.
    if (student.groupId) groupIds.push(student.groupId);

    const courseIds = new Set<string>();
    for (const gid of groupIds) {
      const g = await ctx.db.get(gid);
      if (g?.courseId) courseIds.add(g.courseId);
    }
    if (courseIds.size === 0) return null;

    // Try exact (courseId, detectedDate) match first.
    for (const courseId of courseIds) {
      const exact = await ctx.db
        .query("zestawKeywords")
        .withIndex("by_course_date", q =>
          q.eq("courseId", courseId).eq("lessonDate", args.detectedDate!),
        )
        .collect();
      if (exact.length > 0) {
        return buildJobZestawPayload(exact);
      }
    }

    // Nothing exact — widen to any lesson in the course within ±3
    // days of the detected date. Only useful if the transcript date
    // was slightly mis-detected.
    const target = args.detectedDate;
    const targetTs = Date.parse(target!);
    if (!Number.isFinite(targetTs)) return null;

    for (const courseId of courseIds) {
      const all = await ctx.db
        .query("zestawKeywords")
        .withIndex("by_course", q => q.eq("courseId", courseId))
        .collect();
      // Group by sid (each sid = one lesson).
      const bySid = new Map<string, typeof all>();
      for (const r of all) {
        const arr = bySid.get(r.sid) ?? [];
        arr.push(r);
        bySid.set(r.sid, arr);
      }
      let bestSid: string | null = null;
      let bestDelta = Infinity;
      for (const [sid, rows] of bySid.entries()) {
        const d = rows[0]?.lessonDate;
        if (!d) continue;
        const dTs = Date.parse(d);
        if (!Number.isFinite(dTs)) continue;
        const delta = Math.abs(dTs - targetTs) / (1000 * 60 * 60 * 24);
        if (delta < bestDelta && delta <= 3) {
          bestDelta = delta;
          bestSid = sid;
        }
      }
      if (bestSid) {
        const rows = bySid.get(bestSid)!;
        return buildJobZestawPayload(rows);
      }
    }
    return null;
  },
});

function buildJobZestawPayload(rows: any[]): {
  sid: string;
  lessonTitle: string;
  keywords: Array<{
    word: string;
    translation: string;
    exampleEn?: string;
    nr?: number;
  }>;
} {
  const first = rows[0];
  return {
    sid: first.sid,
    lessonTitle: first.lessonTitle,
    keywords: rows
      .slice()
      .sort((a, b) => (a.nr ?? 0) - (b.nr ?? 0))
      .map(r => ({
        word: r.word,
        translation: r.translation,
        exampleEn: r.exampleEn,
        nr: r.nr,
      })),
  };
}

// Attach zestaw context to a job (called from the processing action
// before invoking the LLM so the review UI can also surface it).
export const attachZestawToJob = internalMutation({
  args: {
    jobId: v.id("ingestionJobs"),
    zestawSid: v.string(),
    zestawLessonTitle: v.string(),
    zestawKeywords: v.array(
      v.object({
        word: v.string(),
        translation: v.string(),
        exampleEn: v.optional(v.string()),
        nr: v.optional(v.number()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.jobId, {
      zestawSid: args.zestawSid,
      zestawLessonTitle: args.zestawLessonTitle,
      zestawKeywords: args.zestawKeywords,
    });
  },
});

// Public listing for admin UI / debug: zestaws for a single course.
export const listByCourse = query({
  args: { courseId: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("zestawKeywords")
      .withIndex("by_course", q => q.eq("courseId", args.courseId))
      .collect();
    const bySid = new Map<
      string,
      { sid: string; lessonTitle: string; lessonDate?: string; count: number }
    >();
    for (const r of rows) {
      const e = bySid.get(r.sid);
      if (e) e.count++;
      else
        bySid.set(r.sid, {
          sid: r.sid,
          lessonTitle: r.lessonTitle,
          lessonDate: r.lessonDate,
          count: 1,
        });
    }
    return Array.from(bySid.values()).sort((a, b) =>
      (a.lessonDate ?? "").localeCompare(b.lessonDate ?? ""),
    );
  },
});

