// ═══════════════════════════════════════════════════════════
// CONSOLE TEACHER — teacher-scoped reads + keyword editing for the
// /teacher portal (EM Console P2, docs/console/API-CONTRACT.md).
// ADDITIVE MODULE (2026-07-03): defines NEW functions only; touches no
// existing file. Every entry point re-derives the teacher's student set
// server-side — the frontend is never trusted for scoping.
// Admin sessions (org_admin / super_admin) may call everything too.
// ═══════════════════════════════════════════════════════════
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireTeacher, requireAdmin, isSuperadmin } from "./authHelpers";

// Resolve the caller: teacher OR admin. Returns { user, kind }.
async function requireTeacherOrAdmin(ctx: any, sessionToken: string | undefined | null) {
  try {
    const { user } = await requireTeacher(ctx, sessionToken);
    return { user, kind: "teacher" as const };
  } catch {
    const { user } = await requireAdmin(ctx, sessionToken);
    return { user, kind: "admin" as const };
  }
}

// The teacher's student set: primaryTeacherId students + members of groups
// that list the teacher. Admins see org-wide (superadmin: all).
async function studentSetFor(ctx: any, user: any, kind: "teacher" | "admin") {
  if (kind === "admin") {
    const all = await ctx.db.query("students").collect();
    return all.filter((s: any) =>
      isSuperadmin(user.role) || s.organizationId === user.organizationId);
  }
  const own = await ctx.db
    .query("students")
    .withIndex("by_teacher", (q: any) => q.eq("primaryTeacherId", user._id))
    .collect();
  const seen = new Set(own.map((s: any) => String(s._id)));
  const groups = (await ctx.db.query("groups").collect())
    .filter((g: any) => g.organizationId === user.organizationId &&
                        (g.teachers || []).some((t: any) => String(t) === String(user._id)));
  for (const g of groups) {
    const memberships = await ctx.db
      .query("groupMemberships")
      .withIndex("by_group_student", (q: any) => q.eq("groupId", g._id))
      .collect();
    for (const m of memberships) {
      if (seen.has(String(m.studentId))) continue;
      const s = await ctx.db.get(m.studentId);
      if (s && s.status !== "archived") {
        seen.add(String(s._id));
        own.push(s);
      }
    }
  }
  return own;
}

async function requireScopedStudent(ctx: any, user: any, kind: "teacher" | "admin", slug: string) {
  const student = await ctx.db
    .query("students")
    .withIndex("by_slug", (q: any) => q.eq("slug", slug))
    .unique();
  if (!student) throw new Error("Student not found");
  const set = await studentSetFor(ctx, user, kind);
  if (!set.some((s: any) => String(s._id) === String(student._id))) {
    throw new Error("Unauthorized: student is not in your scope");
  }
  return student;
}

const slim = (s: any) => ({
  _id: s._id, slug: s.slug, name: s.name, level: s.level,
  targetLevel: s.targetLevel, groupId: s.groupId ?? null, status: s.status,
});

// ── Reads ───────────────────────────────────────────────────

export const teacherStudents = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const { user, kind } = await requireTeacherOrAdmin(ctx, args.sessionToken);
    const students = await studentSetFor(ctx, user, kind);
    return students.filter((s: any) => s.status !== "archived").map(slim);
  },
});

export const teacherSchedule = query({
  args: {
    sessionToken: v.string(),
    fromUtc: v.optional(v.number()),
    toUtc: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { user, kind } = await requireTeacherOrAdmin(ctx, args.sessionToken);
    const from = args.fromUtc ?? Date.now() - 7 * 86400_000;
    const to = args.toUtc ?? Date.now() + 30 * 86400_000;
    const bookingsQ = kind === "teacher"
      ? ctx.db.query("lessonBookings")
          .withIndex("by_org_teacher", (q: any) =>
            q.eq("organizationId", user.organizationId).eq("teacherId", user._id))
      : ctx.db.query("lessonBookings")
          .withIndex("by_org_start", (q: any) => q.eq("organizationId", user.organizationId));
    let bookings = await bookingsQ.collect();
    bookings = bookings.filter((b: any) => b.startUtc >= from && b.startUtc <= to);
    const out = [];
    for (const b of bookings) {
      const s = await ctx.db.get(b.studentId);
      out.push({
        _id: b._id, date: b.dateWarsaw, time: b.timeWarsaw,
        startUtc: b.startUtc, endUtc: b.endUtc, status: b.status,
        meetLink: b.meetLink ?? null,
        student_slug: s?.slug ?? null, student_name: s?.name ?? null,
      });
    }
    return out.sort((a, b) => a.startUtc - b.startUtc);
  },
});

export const teacherStudentDetail = query({
  args: { sessionToken: v.string(), studentSlug: v.string() },
  handler: async (ctx, args) => {
    const { user, kind } = await requireTeacherOrAdmin(ctx, args.sessionToken);
    const student = await requireScopedStudent(ctx, user, kind, args.studentSlug);
    const analyses = await ctx.db
      .query("transcriptAnalyses")
      .withIndex("by_student", (q: any) => q.eq("studentId", student._id))
      .collect();
    const audit = await ctx.db
      .query("auditLog")
      .withIndex("by_target", (q: any) =>
        q.eq("targetType", "student").eq("targetId", String(student._id)))
      .collect();
    const level_history = audit
      .filter((r: any) => r.action === "student.level_changed")
      .map((r: any) => {
        let from: string | null = null, to: string | null = null;
        if (r.details) {
          try { const p = JSON.parse(r.details); from = p.from ?? null; to = p.to ?? null; } catch {}
        }
        return { _id: r._id, from, to, timestamp: r.timestamp };
      })
      .sort((a: any, b: any) => b.timestamp - a.timestamp);
    return { student: slim(student), analyses, level_history };
  },
});

export const teacherKeywords = query({
  args: {
    sessionToken: v.string(),
    studentSlug: v.string(),
    lessonId: v.optional(v.id("lessons")),
  },
  handler: async (ctx, args) => {
    const { user, kind } = await requireTeacherOrAdmin(ctx, args.sessionToken);
    const student = await requireScopedStudent(ctx, user, kind, args.studentSlug);
    let rows = await ctx.db
      .query("keywords")
      .withIndex("by_student", (q: any) => q.eq("studentId", student._id))
      .collect();
    if (args.lessonId) rows = rows.filter((k: any) => String(k.lessonId) === String(args.lessonId));
    return rows.map((k: any) => ({
      _id: k._id, lessonId: k.lessonId, word: k.word, translation: k.translation,
      ipa: k.ipa, definitionEn: k.definitionEn, definitionPl: k.definitionPl,
      exampleEn: k.exampleEn, examplePl: k.examplePl, wordType: k.wordType,
      difficulty: k.difficulty, mastery: k.mastery ?? null,
    }));
  },
});

// ── Keyword editing (teacher-scoped writes; audit-logged) ────

const EDITABLE = ["word", "translation", "definitionEn", "definitionPl",
                  "exampleEn", "examplePl", "ipa", "wordType", "difficulty"] as const;

export const addKeyword = mutation({
  args: {
    sessionToken: v.string(),
    studentSlug: v.string(),
    lessonId: v.id("lessons"),
    word: v.string(),
    translation: v.optional(v.string()),
    definitionEn: v.optional(v.string()),
    definitionPl: v.optional(v.string()),
    exampleEn: v.optional(v.string()),
    examplePl: v.optional(v.string()),
    ipa: v.optional(v.string()),
    wordType: v.optional(v.string()),
    difficulty: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user, kind } = await requireTeacherOrAdmin(ctx, args.sessionToken);
    const student = await requireScopedStudent(ctx, user, kind, args.studentSlug);
    const lesson = await ctx.db.get(args.lessonId);
    if (!lesson || String(lesson.studentId) !== String(student._id)) {
      throw new Error("Lesson does not belong to this student");
    }
    const id = await ctx.db.insert("keywords", {
      organizationId: student.organizationId,
      lessonId: args.lessonId, studentId: student._id,
      word: args.word.trim(),
      translation: args.translation ?? "",
      definitionEn: args.definitionEn ?? "", definitionPl: args.definitionPl ?? "",
      exampleEn: args.exampleEn ?? "", examplePl: args.examplePl ?? "",
      ipa: args.ipa ?? "", stressUK: "", stressUS: "",
      topics: [], createdAt: Date.now(),
      wordType: args.wordType ?? "", difficulty: args.difficulty ?? "",
    } as any);
    await ctx.db.insert("auditLog", {
      organizationId: user.organizationId, userId: user._id,
      timestamp: Date.now(), action: "keyword.added",
      targetType: "keyword", targetId: String(id),
      details: JSON.stringify({ studentSlug: args.studentSlug, word: args.word }),
    } as any);
    return { ok: true, id };
  },
});

export const updateKeyword = mutation({
  args: {
    sessionToken: v.string(),
    keywordId: v.id("keywords"),
    patch: v.object({
      word: v.optional(v.string()), translation: v.optional(v.string()),
      definitionEn: v.optional(v.string()), definitionPl: v.optional(v.string()),
      exampleEn: v.optional(v.string()), examplePl: v.optional(v.string()),
      ipa: v.optional(v.string()), wordType: v.optional(v.string()),
      difficulty: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    const { user, kind } = await requireTeacherOrAdmin(ctx, args.sessionToken);
    const kw = await ctx.db.get(args.keywordId);
    if (!kw) throw new Error("Keyword not found");
    const student = await ctx.db.get(kw.studentId);
    if (!student) throw new Error("Student not found");
    await requireScopedStudent(ctx, user, kind, student.slug);
    const patch: Record<string, string> = {};
    for (const f of EDITABLE) {
      const val = (args.patch as any)[f];
      if (val !== undefined) patch[f] = val;
    }
    if (Object.keys(patch).length === 0) return { ok: true };
    await ctx.db.patch(args.keywordId, patch);
    await ctx.db.insert("auditLog", {
      organizationId: user.organizationId, userId: user._id,
      timestamp: Date.now(), action: "keyword.updated",
      targetType: "keyword", targetId: String(args.keywordId),
      details: JSON.stringify({ fields: Object.keys(patch) }),
    } as any);
    return { ok: true };
  },
});

export const deleteKeyword = mutation({
  args: { sessionToken: v.string(), keywordId: v.id("keywords") },
  handler: async (ctx, args) => {
    const { user, kind } = await requireTeacherOrAdmin(ctx, args.sessionToken);
    const kw = await ctx.db.get(args.keywordId);
    if (!kw) return { ok: true };
    const student = await ctx.db.get(kw.studentId);
    if (!student) throw new Error("Student not found");
    await requireScopedStudent(ctx, user, kind, student.slug);
    await ctx.db.delete(args.keywordId);
    await ctx.db.insert("auditLog", {
      organizationId: user.organizationId, userId: user._id,
      timestamp: Date.now(), action: "keyword.deleted",
      targetType: "keyword", targetId: String(args.keywordId),
      details: JSON.stringify({ word: kw.word, studentSlug: student.slug }),
    } as any);
    return { ok: true };
  },
});
