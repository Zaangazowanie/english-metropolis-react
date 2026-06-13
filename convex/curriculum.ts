// Curriculum — the ordered per-student "30-lesson pack" (built 2026-06-04).
//
//   listCurriculum  — public read (student page renders its roadmap)
//   setCurriculum   — replace a student's whole plan (admin session OR pipeline key)
//   setItemPdf      — attach a generated lesson PDF to one slot (admin/pipeline)
//
// The `lessons` table stays the authoritative TAUGHT record; curriculumItems is
// the forward plan. A "taught" slot may backlink to its lessons row via lessonId.

import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAdminOrPipelineKey, isSuperadmin } from "./authHelpers";

const itemValidator = v.object({
  position: v.number(),
  title: v.string(),
  theme: v.optional(v.string()),
  topics: v.array(v.string()),
  languageFocus: v.optional(v.string()),
  targetCefr: v.optional(v.string()),
  keywords: v.optional(v.array(v.string())),
  aim: v.optional(v.string()),
  status: v.string(),                       // "taught" | "planned"
  lessonId: v.optional(v.id("lessons")),
  pdfUrl: v.optional(v.string()),
});

// Public: the student's ordered plan (no PII; topics/titles only).
export const listCurriculum = query({
  args: { studentId: v.id("students") },
  handler: async (ctx, args) => {
    const items = await ctx.db
      .query("curriculumItems")
      .withIndex("by_student_position", q => q.eq("studentId", args.studentId))
      .collect();
    return items.sort((a, b) => a.position - b.position);
  },
});

// Replace a student's entire curriculum. Auth: a valid admin session (org-scoped)
// OR the PIPELINE_API_KEY (for seeding scripts) — same guard the publish pipeline uses.
export const setCurriculum = mutation({
  args: {
    sessionToken: v.optional(v.string()),
    apiKey: v.optional(v.string()),
    studentId: v.id("students"),
    items: v.array(itemValidator),
  },
  handler: async (ctx, args) => {
    const auth = await requireAdminOrPipelineKey(ctx, args.sessionToken, args.apiKey);
    const student = await ctx.db.get(args.studentId);
    if (!student) throw new Error("Student not found");
    // org scoping for non-superadmin admins; pipeline key is trusted server-side.
    if (auth.kind === "admin" && !isSuperadmin(auth.user.role) &&
        student.organizationId !== auth.user.organizationId) {
      throw new Error("Unauthorized: student is in another organization");
    }

    const now = Date.now();
    const existing = await ctx.db
      .query("curriculumItems")
      .withIndex("by_student", q => q.eq("studentId", args.studentId))
      .collect();
    for (const row of existing) await ctx.db.delete(row._id);

    for (const it of args.items) {
      await ctx.db.insert("curriculumItems", {
        organizationId: student.organizationId,
        studentId: args.studentId,
        position: it.position,
        title: it.title,
        theme: it.theme,
        topics: it.topics,
        languageFocus: it.languageFocus,
        targetCefr: it.targetCefr,
        keywords: it.keywords,
        aim: it.aim,
        status: it.status,
        ...(it.lessonId ? { lessonId: it.lessonId } : {}),
        ...(it.pdfUrl ? { pdfUrl: it.pdfUrl } : {}),
        createdAt: now,
        updatedAt: now,
      });
    }
    return { count: args.items.length };
  },
});

// Attach a generated lesson PDF to one curriculum slot (used by the lesson-PDF pipeline).
export const setItemPdf = mutation({
  args: {
    sessionToken: v.optional(v.string()),
    apiKey: v.optional(v.string()),
    studentId: v.id("students"),
    position: v.number(),
    pdfUrl: v.string(),
  },
  handler: async (ctx, args) => {
    const auth = await requireAdminOrPipelineKey(ctx, args.sessionToken, args.apiKey);
    const item = await ctx.db
      .query("curriculumItems")
      .withIndex("by_student_position", q =>
        q.eq("studentId", args.studentId).eq("position", args.position))
      .unique();
    if (!item) throw new Error("Curriculum item not found");
    if (auth.kind === "admin" && !isSuperadmin(auth.user.role) &&
        item.organizationId !== auth.user.organizationId) {
      throw new Error("Unauthorized: item is in another organization");
    }
    await ctx.db.patch(item._id, { pdfUrl: args.pdfUrl, updatedAt: Date.now() });
    return { ok: true };
  },
});
