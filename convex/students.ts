import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { collocationsField } from "./validators.js";
import { requireAdmin, requireSuperadmin, requireAdminOrPipelineKey, requireStudent, isSuperadmin } from "./authHelpers";
import { isGrandfathered } from "./enrolmentRules";

const lessonMaterialField = v.object({
  name: v.string(),
  storageId: v.optional(v.id("_storage")),
  url: v.optional(v.string()),
  type: v.optional(v.string()),
});

// One-shot sweep to strip garbage tokens that the pre-2026-04-17 naive
// capitalised-phrase extractor in ingestionProcess.deriveTopics wrote
// into lesson.topics. Keeps filtering logic in sync with deriveTopics.
const TOPIC_STOP = new Set([
  "The","This","That","These","Those","A","An","He","She","It","They",
  "We","I","His","Her","Their","Our","My","Your",
  "Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday",
  "January","February","March","April","May","June","July","August",
  "September","October","November","December",
  "Polish","English","Poland","England","Britain","British","American",
  "Russian","Ukrainian","Chinese","Japanese","German","French","Spanish",
  "Italian","European","Europe","Asia","Asian","Africa","African",
  "Mike","Michael","Michael Poncana",
  "General","Lesson","Lessons","Today","Yesterday","Tomorrow",
]);

export const backfillLessonTopics = internalMutation({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const cap = args.limit ?? 5000;

    // Build a dynamic stopset of student name tokens so topics like
    // "Lidia", "Szymon Zi", "Roland Diakowski" get dropped as
    // the pre-fix extractor leaked them from lessonSummary name-drops.
    const studentStop = new Set<string>();
    const stripDiacritics = (s: string) =>
      s.normalize("NFD").replace(/\p{Diacritic}/gu, "");
    const students = await ctx.db.query("students").collect();
    const nameTokens: string[] = [];
    for (const s of students) {
      const full = (s.name ?? "").trim();
      if (!full) continue;
      studentStop.add(full);
      for (const tok of full.split(/\s+/)) {
        if (tok.length >= 3) {
          studentStop.add(tok);
          nameTokens.push(tok);
          nameTokens.push(stripDiacritics(tok));
        }
        if (tok.length >= 5) studentStop.add(tok.slice(0, 2));
      }
    }
    // Prefix-match check: drop tokens that are a 4+ char prefix of
    // any student name (catches "Micha" ← "Michał", "Szym" ← "Szymon").
    const isStudentPrefix = (t: string) => {
      if (t.length < 4) return false;
      const bare = stripDiacritics(t);
      return nameTokens.some(
        (n) => n !== t && (n.startsWith(t) || n.startsWith(bare)),
      );
    };

    const lessons = await ctx.db.query("lessons").take(cap);
    let patched = 0;
    for (const l of lessons) {
      const original = l.topics ?? [];
      if (original.length === 0) continue;
      const filtered = original.filter((t) => {
        if (TOPIC_STOP.has(t)) return false;
        if (studentStop.has(t)) return false;
        const first = t.split(/\s+/)[0];
        if (TOPIC_STOP.has(first)) return false;
        if (studentStop.has(first)) return false;
        // Drop 2-token phrases where BOTH tokens are a student
        // name fragment ("Roland Diakowski", "Szymon Zi").
        const parts = t.split(/\s+/);
        if (parts.length > 1 && parts.every((p) => studentStop.has(p))) {
          return false;
        }
        if (!t.includes(" ") && t.length < 4) return false;
        // Drop single-token truncated-name matches.
        if (!t.includes(" ") && isStudentPrefix(t)) return false;
        return true;
      });
      const next = filtered.length > 0 ? filtered : ["General English"];
      const changed =
        next.length !== original.length ||
        next.some((x, i) => x !== original[i]);
      if (changed) {
        await ctx.db.patch(l._id, { topics: next, updatedAt: Date.now() });
        patched++;
      }
    }
    return { scanned: lessons.length, patched };
  },
});

// ═══════════════════════════════════════════════════════════
// ORGANIZATIONS
// ═══════════════════════════════════════════════════════════

export const createOrganization = mutation({
  args: {
    sessionToken: v.string(),
    name: v.string(),
    slug: v.string(),
    type: v.string(),                   // "school", "company", "private_practice", "platform"
  },
  handler: async (ctx, args) => {
    await requireSuperadmin(ctx, args.sessionToken);
    const { sessionToken, ...rest } = args;
    const now = Date.now();
    return await ctx.db.insert("organizations", {
      ...rest,
      status: "active",
      settings: {
        defaultLanguage: "pl",
        cefrScaleEnabled: true,
        quizEnabled: true,
        youglishEnabled: true,
        ttsEnabled: true,
        transcriptAnalysisEnabled: true,
      },
      subscription: { plan: "free", maxStudents: 10, maxTeachers: 2 },
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const getOrganization = query({
  // sessionToken accepted-and-ignored (admin frontend auto-injects it)
  args: { orgId: v.id("organizations"), sessionToken: v.optional(v.string()) },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.orgId);
  },
});

export const getOrganizationBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db.query("organizations").withIndex("by_slug", q => q.eq("slug", args.slug)).unique();
  },
});

export const listOrganizations = query({
  args: { sessionToken: v.string(), type: v.optional(v.string()), status: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args.sessionToken);
    if (args.status) {
      return await ctx.db.query("organizations").withIndex("by_status", q => q.eq("status", args.status!)).collect();
    }
    if (args.type) {
      return await ctx.db.query("organizations").withIndex("by_type", q => q.eq("type", args.type!)).collect();
    }
    return await ctx.db.query("organizations").collect();
  },
});

// ═══════════════════════════════════════════════════════════
// GROUPS (legacy wrappers — main group logic is in groups.ts)
// ═══════════════════════════════════════════════════════════

// Derive a URL slug from a free-text name: lowercase, diacritics stripped,
// non-alphanumerics collapsed to single hyphens.
function deriveSlug(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[łŁ]/g, "l")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+)|(-+$)/g, "");
}

export const createGroup = mutation({
  args: {
    sessionToken: v.string(),
    organizationId: v.optional(v.id("organizations")),
    name: v.string(),
    slug: v.optional(v.string()),
    level: v.optional(v.string()),
    schedule: v.optional(v.string()),
    status: v.optional(v.string()),
    courseId: v.optional(v.string()),
    teachers: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const { user } = await requireAdmin(ctx, args.sessionToken);
    const organizationId = isSuperadmin(user.role)
      ? (args.organizationId ?? user.organizationId)
      : user.organizationId;
    if (!organizationId) throw new Error("No organization in scope");
    const { sessionToken, organizationId: _ignored, slug: _slug, status: _status, ...rest } = args;
    const slug = (args.slug && args.slug.trim()) || deriveSlug(args.name);
    const now = Date.now();
    const groupId = await ctx.db.insert("groups", {
      ...rest,
      slug,
      organizationId,
      status: args.status ?? "active",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("auditLog", {
      organizationId,
      userId: user._id,
      action: "group.created",
      targetType: "group",
      targetId: groupId,
      timestamp: now,
    });
    return groupId;
  },
});

export const listGroups = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    return await ctx.db.query("groups").withIndex("by_organization", q => q.eq("organizationId", args.organizationId)).collect();
  },
});

// ═══════════════════════════════════════════════════════════
// USERS (Teachers, Admins)
// ═══════════════════════════════════════════════════════════

export const createUser = mutation({
  args: {
    sessionToken: v.string(),
    email: v.string(),
    name: v.string(),
    role: v.string(),                   // "super_admin", "org_admin", "teacher", "assistant"
    organizationId: v.optional(v.id("organizations")),
  },
  handler: async (ctx, args) => {
    await requireSuperadmin(ctx, args.sessionToken);
    const { sessionToken, ...rest } = args;
    const now = Date.now();
    return await ctx.db.insert("users", {
      ...rest,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const getUserByEmail = query({
  args: { sessionToken: v.string(), email: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args.sessionToken);
    return await ctx.db.query("users").withIndex("by_email", q => q.eq("email", args.email)).unique();
  },
});

export const listOrgUsers = query({
  args: { sessionToken: v.string(), organizationId: v.optional(v.id("organizations")) },
  handler: async (ctx, args) => {
    const { user } = await requireAdmin(ctx, args.sessionToken);
    const organizationId = isSuperadmin(user.role)
      ? (args.organizationId ?? user.organizationId)
      : user.organizationId;
    if (!organizationId) throw new Error("No organization in scope");
    return await ctx.db.query("users").withIndex("by_organization", q => q.eq("organizationId", organizationId)).collect();
  },
});

// ═══════════════════════════════════════════════════════════
// STUDENTS
// ═══════════════════════════════════════════════════════════

export const listStudents = query({
  args: {
    sessionToken: v.string(),
    organizationId: v.optional(v.id("organizations")),
    activeOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { user } = await requireAdmin(ctx, args.sessionToken);
    const organizationId = isSuperadmin(user.role)
      ? (args.organizationId ?? user.organizationId)
      : user.organizationId;
    if (organizationId) {
      const students = await ctx.db.query("students").withIndex("by_organization", q => q.eq("organizationId", organizationId)).collect();
      return args.activeOnly ? students.filter(s => s.status === "active") : students;
    }
    // Only reachable for a superadmin with no org in scope → all students.
    if (args.activeOnly) {
      return await ctx.db.query("students").withIndex("by_status", q => q.eq("status", "active")).collect();
    }
    return await ctx.db.query("students").collect();
  },
});

export const getStudentBySlug = query({
  // sessionToken accepted-and-ignored (admin frontend auto-injects it)
  args: { slug: v.string(), sessionToken: v.optional(v.string()) },
  handler: async (ctx, args) => {
    return await ctx.db.query("students").withIndex("by_slug", q => q.eq("slug", args.slug)).unique();
  },
});

export const getStudent = query({
  args: { studentId: v.id("students") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.studentId);
  },
});

export const createStudent = mutation({
  args: {
    sessionToken: v.string(),
    organizationId: v.optional(v.id("organizations")),
    name: v.string(),
    slug: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    nativeLanguage: v.optional(v.string()),
    level: v.string(),
    targetLevel: v.optional(v.string()),
    type: v.optional(v.string()),       // "individual", "group", "corporate"
    notes: v.optional(v.string()),
    groupId: v.optional(v.id("groups")),
    primaryTeacherId: v.optional(v.id("users")),
    tags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const { user } = await requireAdmin(ctx, args.sessionToken);
    const organizationId = isSuperadmin(user.role)
      ? (args.organizationId ?? user.organizationId)
      : user.organizationId;
    if (!organizationId) throw new Error("No organization in scope");
    const { sessionToken, organizationId: _ignored, ...rest } = args;
    const now = Date.now();
    const studentId = await ctx.db.insert("students", {
      ...rest,
      organizationId,
      type: args.type ?? "individual",
      status: "active",
      enrolledAt: now,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("auditLog", {
      organizationId,
      userId: user._id,
      action: "student.created",
      targetType: "student",
      targetId: studentId,
      timestamp: now,
    });
    return studentId;
  },
});

export const updateStudent = mutation({
  args: {
    sessionToken: v.string(),
    studentId: v.id("students"),
    name: v.optional(v.string()),
    slug: v.optional(v.string()),
    email: v.optional(v.string()),
    googleEmail: v.optional(v.string()),
    phone: v.optional(v.string()),
    nativeLanguage: v.optional(v.string()),
    level: v.optional(v.string()),
    targetLevel: v.optional(v.string()),
    type: v.optional(v.string()),
    status: v.optional(v.string()),
    notes: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    groupId: v.optional(v.id("groups")),
    primaryTeacherId: v.optional(v.id("users")),
    organizationId: v.optional(v.id("organizations")),
  },
  handler: async (ctx, args) => {
    const { user } = await requireAdmin(ctx, args.sessionToken);
    const target = await ctx.db.get(args.studentId);
    if (!target) throw new Error("Student not found");
    if (!isSuperadmin(user.role) && target.organizationId !== user.organizationId) {
      throw new Error("Unauthorized");
    }
    const { sessionToken, studentId, ...updates } = args;
    const cleanUpdates = Object.fromEntries(
      Object.entries(updates).filter(([_, val]) => val !== undefined)
    );
    // Non-superadmins may never move a student to a different org.
    if (!isSuperadmin(user.role)) {
      delete (cleanUpdates as Record<string, unknown>).organizationId;
    }
    const now = Date.now();
    // CEFR level-change history: record the from→to transition so the
    // student detail page can render a level-change timeline.
    if (
      cleanUpdates.level !== undefined &&
      cleanUpdates.level !== target.level
    ) {
      await ctx.db.insert("auditLog", {
        organizationId: target.organizationId,
        userId: user._id,
        action: "student.level_changed",
        targetType: "student",
        targetId: studentId,
        details: JSON.stringify({ from: target.level, to: cleanUpdates.level }),
        timestamp: now,
      });
    }
    await ctx.db.patch(studentId, { ...cleanUpdates, updatedAt: now });
  },
});

// Archive a student (soft-delete). Org-scoped for non-superadmins.
export const archiveStudent = mutation({
  args: {
    sessionToken: v.string(),
    studentId: v.id("students"),
  },
  handler: async (ctx, args) => {
    const { user } = await requireAdmin(ctx, args.sessionToken);
    const target = await ctx.db.get(args.studentId);
    if (!target) throw new Error("Student not found");
    if (!isSuperadmin(user.role) && target.organizationId !== user.organizationId) {
      throw new Error("Unauthorized");
    }
    const now = Date.now();
    await ctx.db.patch(args.studentId, { status: "archived", updatedAt: now });
    await ctx.db.insert("auditLog", {
      organizationId: target.organizationId,
      userId: user._id,
      action: "student.archived",
      targetType: "student",
      targetId: args.studentId,
      timestamp: now,
    });
  },
});

// CEFR level-change history for a student (newest first). Reads the
// auditLog rows with action "student.level_changed".
export const getStudentLevelHistory = query({
  args: {
    sessionToken: v.string(),
    studentId: v.id("students"),
  },
  handler: async (ctx, args) => {
    const { user } = await requireAdmin(ctx, args.sessionToken);
    const student = await ctx.db.get(args.studentId);
    if (!student) return [];
    if (!isSuperadmin(user.role) && student.organizationId !== user.organizationId) {
      throw new Error("Unauthorized");
    }
    const rows = await ctx.db
      .query("auditLog")
      .withIndex("by_target", q =>
        q.eq("targetType", "student").eq("targetId", String(args.studentId)),
      )
      .collect();
    return rows
      .filter(r => r.action === "student.level_changed")
      .map(r => {
        let from = null as string | null;
        let to = null as string | null;
        if (r.details) {
          try {
            const parsed = JSON.parse(r.details);
            from = parsed.from ?? null;
            to = parsed.to ?? null;
          } catch { /* malformed details — surface timestamp only */ }
        }
        return { _id: r._id, from, to, timestamp: r.timestamp };
      })
      .sort((a, b) => b.timestamp - a.timestamp);
  },
});

// ─────────────────────────────────────────────────────────────
// Schedule a lesson: creates a lessons row with status="planned".
// Called from the superadmin Calendar UI.
// ─────────────────────────────────────────────────────────────
export const scheduleLesson = mutation({
  args: {
    sessionToken: v.optional(v.string()),
    apiKey: v.optional(v.string()),
    studentId: v.id("students"),
    date: v.string(),          // ISO date e.g. "2026-04-20"
    startTime: v.string(),     // "16:00" CEST
    durationMinutes: v.optional(v.number()),
    title: v.optional(v.string()),
    lessonType: v.optional(v.string()),
    groupCode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdminOrPipelineKey(ctx, args.sessionToken, args.apiKey);
    const student = await ctx.db.get(args.studentId);
    if (!student) throw new Error("Student not found");

    const existingLessons = await ctx.db
      .query("lessons")
      .withIndex("by_student", q => q.eq("studentId", args.studentId))
      .collect();
    const maxOrder = existingLessons.reduce((m, l) => l.order > m ? l.order : m, 0);

    const title = args.title ?? `Upcoming lesson · ${args.date} ${args.startTime}`;
    const topics: string[] = args.groupCode ? [args.groupCode] : [];
    const now = Date.now();

    const lessonId = await ctx.db.insert("lessons", {
      organizationId: student.organizationId,
      studentId: args.studentId,
      date: args.date,
      title,
      topics,
      order: maxOrder + 1,
      lessonType: args.lessonType ?? "individual",
      duration: args.durationMinutes,
      status: "planned",
      summary: `Scheduled ${args.startTime} CEST`,
      createdAt: now,
      updatedAt: now,
    });
    return { lessonId };
  },
});

export const listUpcomingLessons = query({
  args: { studentId: v.optional(v.id("students")) },
  handler: async (ctx, args) => {
    const q = args.studentId
      ? ctx.db.query("lessons").withIndex("by_student", i => i.eq("studentId", args.studentId!))
      : ctx.db.query("lessons");
    const all = await q.collect();
    return all.filter(l => l.status === "planned").sort((a, b) => a.date.localeCompare(b.date));
  },
});

// ═══════════════════════════════════════════════════════════
// LESSONS
// ═══════════════════════════════════════════════════════════

export const listLessons = query({
  args: {
    sessionToken: v.optional(v.string()),
    studentId: v.optional(v.id("students")),
    organizationId: v.optional(v.id("organizations")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    if (args.studentId) {
      return await ctx.db
        .query("lessons")
        .withIndex("by_student", q => q.eq("studentId", args.studentId!))
        .order("desc")
        .take(args.limit || 100);
    }
    if (args.organizationId) {
      return await ctx.db
        .query("lessons")
        .withIndex("by_organization", q => q.eq("organizationId", args.organizationId!))
        .order("desc")
        .take(args.limit || 100);
    }
    return await ctx.db.query("lessons").order("desc").take(args.limit || 100);
  },
});

export const getLesson = query({
  args: { lessonId: v.id("lessons") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.lessonId);
  },
});

export const getLessonByDate = query({
  args: { studentId: v.id("students"), date: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("lessons")
      .withIndex("by_student_date", q => q.eq("studentId", args.studentId).eq("date", args.date))
      .unique();
  },
});

export const createLesson = mutation({
  args: {
    sessionToken: v.optional(v.string()),
    apiKey: v.optional(v.string()),
    organizationId: v.optional(v.id("organizations")),
    studentId: v.id("students"),
    teacherId: v.optional(v.id("users")),
    groupId: v.optional(v.id("groups")),
    date: v.string(),
    title: v.string(),
    topics: v.array(v.string()),
    summary: v.optional(v.string()),
    transcriptFile: v.optional(v.string()),
    duration: v.optional(v.number()),
    difficulty: v.optional(v.string()),
    materials: v.optional(v.array(lessonMaterialField)),
    order: v.number(),
  },
  handler: async (ctx, args) => {
    const actor = await requireAdminOrPipelineKey(ctx, args.sessionToken, args.apiKey);
    const { sessionToken, apiKey, ...rest } = args;
    const now = Date.now();
    const lessonId = await ctx.db.insert("lessons", { ...rest, createdAt: now, updatedAt: now });
    await ctx.db.insert("auditLog", {
      organizationId: rest.organizationId,
      userId: actor.kind === "admin" ? actor.user?._id : undefined,
      action: "lesson.created",
      targetType: "lesson",
      targetId: String(lessonId),
      details: JSON.stringify({ title: rest.title, studentId: String(rest.studentId), date: rest.date }),
      timestamp: now,
    });
    return lessonId;
  },
});

export const updateLesson = mutation({
  args: {
    sessionToken: v.optional(v.string()),
    apiKey: v.optional(v.string()),
    lessonId: v.id("lessons"),
    title: v.optional(v.string()),
    topics: v.optional(v.array(v.string())),
    summary: v.optional(v.string()),
    duration: v.optional(v.number()),
    difficulty: v.optional(v.string()),
    status: v.optional(v.string()),
    materials: v.optional(v.array(lessonMaterialField)),
  },
  handler: async (ctx, args) => {
    const actor = await requireAdminOrPipelineKey(ctx, args.sessionToken, args.apiKey);
    const { sessionToken, apiKey, lessonId, ...updates } = args;
    const lesson = await ctx.db.get(lessonId);
    if (!lesson) throw new Error("Lesson not found");
    const cleanUpdates = Object.fromEntries(
      Object.entries(updates).filter(([_, val]) => val !== undefined)
    );
    const now = Date.now();
    await ctx.db.patch(lessonId, { ...cleanUpdates, updatedAt: now });
    await ctx.db.insert("auditLog", {
      organizationId: lesson.organizationId,
      userId: actor.kind === "admin" ? actor.user?._id : undefined,
      action: cleanUpdates.materials !== undefined ? "lesson.materials_updated" : "lesson.updated",
      targetType: "lesson",
      targetId: String(lessonId),
      details: JSON.stringify({ fields: Object.keys(cleanUpdates), title: lesson.title, date: lesson.date }),
      timestamp: now,
    });
  },
});

export const getLessonsWithKeywordCount = query({
  args: { studentId: v.id("students") },
  handler: async (ctx, args) => {
    const lessons = await ctx.db
      .query("lessons")
      .withIndex("by_student", q => q.eq("studentId", args.studentId))
      .collect();

    const enriched = await Promise.all(
      lessons.map(async (lesson) => {
        const keywords = await ctx.db
          .query("keywords")
          .withIndex("by_lesson", q => q.eq("lessonId", lesson._id))
          .collect();
        return { ...lesson, keywordCount: keywords.length };
      })
    );

    return enriched.sort((a, b) => a.order - b.order);
  },
});

// ═══════════════════════════════════════════════════════════
// KEYWORDS
// ═══════════════════════════════════════════════════════════

export const listKeywords = query({
  args: {
    sessionToken: v.optional(v.string()),
    lessonId: v.optional(v.id("lessons")),
    studentId: v.optional(v.id("students")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    if (args.lessonId) {
      return await ctx.db
        .query("keywords")
        .withIndex("by_lesson", q => q.eq("lessonId", args.lessonId!))
        .collect();
    }
    if (args.studentId) {
      return await ctx.db
        .query("keywords")
        .withIndex("by_student", q => q.eq("studentId", args.studentId!))
        // 2026-05-22: default raised 500 → 5000. The old 500 silently truncated
        // students with many keywords (e.g. Aleksandra Górska, 650+), dropping
        // their newest vocab from the panel — this is the "500-row cap" incident.
        .take(args.limit || 5000);
    }
    return [];
  },
});

export const getKeyword = query({
  args: { keywordId: v.id("keywords") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.keywordId);
  },
});

// ═══════════════════════════════════════════════════════════
// KEYWORD COVERAGE — Phase 1.6 of audit §4 #21 (Mike CRITICAL)
// ═══════════════════════════════════════════════════════════
// Returns "you've practiced N of M keywords from your bank in the
// last K days". Powers the CoverageWidget on the practice landing
// page so the student can see which of Aleksandra's 168+ keywords
// they've actually been exposed to (vs the 5-6 sentences the
// pre-scheduler bundle kept recycling).
//
// Inputs:
//   studentSlug — owner; required (we no-op safely on unknown)
//   withinDays  — recency window in days, default 7
//
// Output (always non-null shape, even when student/keywords are
// missing — UI degrades gracefully on falsy fields):
//   {
//     bankSize:    number,   // total keywords in the student's bank
//     practiced:   number,   // bankSize ∩ recent exposure set
//     untouched:   number,   // bankSize − practiced
//     pct:         number,   // 0..100 (rounded), 0 when bank is empty
//     withinDays:  number,   // echoes the input (default 7)
//     hasExposureData: boolean,
//                            // true if ≥1 exposure row in window;
//                            // false means we showed bankSize but
//                            // couldn't compute practiced — UI may
//                            // hide or render skeleton.
//   }
//
// Implementation notes:
//   - Bank IDs are derived as `kw:<lowercase(word)>` to match the
//     itemIds the frontend writes via extractKeywordItemIds() →
//     practiceExposure (see src/practice/lib/exposure.ts).
//   - Falls back to practiceProgress.updatedAt if practiceExposure
//     yields zero rows in the window (G1's table may not be
//     populated for every student yet — gracefully degrade).
//   - Safe to call for anonymous / non-existent slugs; returns the
//     all-zero shape so the widget can render a degraded chip.
export const getCoverage = query({
  args: {
    sessionToken: v.string(),
    studentSlug: v.string(),
    withinDays: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { user } = await requireAdmin(ctx, args.sessionToken);
    const withinDays = Math.max(1, Math.min(args.withinDays ?? 7, 90));
    const empty = {
      bankSize: 0,
      practiced: 0,
      untouched: 0,
      pct: 0,
      withinDays,
      hasExposureData: false,
    };

    // No useful identifier — design canvas / anonymous caller.
    if (!args.studentSlug || args.studentSlug === "__anon__") return empty;

    const student = await ctx.db
      .query("students")
      .withIndex("by_slug", q => q.eq("slug", args.studentSlug))
      .unique();
    if (!student) return empty;
    if (!isSuperadmin(user.role) && student.organizationId !== user.organizationId) {
      throw new Error("Unauthorized");
    }

    // Pull the full keyword bank. Cap at 5000 — well above current
    // students (Aleksandra ~168, largest student ~600).
    const keywords = await ctx.db
      .query("keywords")
      .withIndex("by_student", q => q.eq("studentId", student._id))
      .take(5000);

    // Build the bank itemId set in the same `kw:<lowercase>` shape
    // the exposure recorder writes (extractKeywordItemIds in
    // src/practice/lib/exposure.ts).
    const bankIds = new Set<string>();
    for (const kw of keywords) {
      const w = kw.word?.trim().toLowerCase();
      if (w) bankIds.add(`kw:${w}`);
    }
    const bankSize = bankIds.size;
    if (bankSize === 0) return { ...empty, bankSize: 0 };

    // Window horizon — practiced "within last withinDays".
    const horizon = Date.now() - withinDays * 24 * 60 * 60 * 1000;

    // Primary path: practiceExposure (G1, deployed 2026-05-02).
    const exposures = await ctx.db
      .query("practiceExposure")
      .withIndex("by_student_exposed", q =>
        q.eq("studentSlug", args.studentSlug).gt("exposedAt", horizon),
      )
      .take(2000);

    const touched = new Set<string>();
    for (const row of exposures) {
      // Only count keyword exposures — exercise rows have different ids.
      if (row.itemKind !== "keyword") continue;
      if (bankIds.has(row.itemId)) touched.add(row.itemId);
    }
    let hasExposureData = exposures.length > 0;

    // Fallback: if no exposure rows exist for this student in the
    // window (G1 not yet populating, or new student), surface
    // SOMETHING so the widget isn't permanently zeroed out. We
    // count practiceProgress rows updated in the same window — this
    // doesn't tell us WHICH keywords were touched, but it lets the
    // widget show "n shells played this week" as a degraded signal.
    // We deliberately don't try to map progress → keywords here;
    // the widget handles the degraded state via hasExposureData.
    if (!hasExposureData) {
      const recentProgress = await ctx.db
        .query("practiceProgress")
        .withIndex("by_slug_shell", q => q.eq("studentSlug", args.studentSlug))
        .take(500);
      // touched stays empty; hasExposureData stays false. We just
      // confirm the student has SOME activity for the UI to render
      // a "no recent practice" message vs a real zero state.
      const recentCount = recentProgress.filter(p => p.updatedAt > horizon).length;
      if (recentCount > 0) {
        // Conservative estimate: each shell session probably
        // touched ~5 keywords. Cap at bankSize. This is intentionally
        // approximate — UI flags hasExposureData=false so callers
        // know to label this as "approximate / pre-scheduler".
        const approx = Math.min(bankSize, recentCount * 5);
        return {
          bankSize,
          practiced: approx,
          untouched: Math.max(0, bankSize - approx),
          pct: Math.round((approx / bankSize) * 100),
          withinDays,
          hasExposureData: false,
        };
      }
    }

    const practiced = touched.size;
    const untouched = Math.max(0, bankSize - practiced);
    const pct = bankSize > 0 ? Math.round((practiced / bankSize) * 100) : 0;
    return { bankSize, practiced, untouched, pct, withinDays, hasExposureData };
  },
});

export const createKeyword = mutation({
  args: {
    sessionToken: v.optional(v.string()),
    apiKey: v.optional(v.string()),
    lessonId: v.id("lessons"),
    studentId: v.id("students"),
    organizationId: v.optional(v.id("organizations")),
    word: v.string(),
    translation: v.string(),
    definitionEn: v.string(),
    definitionPl: v.string(),
    exampleEn: v.string(),
    examplePl: v.string(),
    ipa: v.string(),
    stressUK: v.string(),
    stressUS: v.string(),
    topics: v.array(v.string()),
    collocations: collocationsField,
    youglishVideoId: v.optional(v.string()),
    youglishStart: v.optional(v.number()),
    youglishCaption: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireAdminOrPipelineKey(ctx, args.sessionToken, args.apiKey);
    const { sessionToken, apiKey, ...rest } = args;
    const keywordId = await ctx.db.insert("keywords", {
      ...rest,
      mastery: 0,
      reviewCount: 0,
      createdAt: Date.now(),
    });
    await ctx.db.insert("auditLog", {
      organizationId: rest.organizationId,
      userId: actor.kind === "admin" ? actor.user?._id : undefined,
      action: "keyword.created",
      targetType: "keyword",
      targetId: String(keywordId),
      details: JSON.stringify({ word: rest.word, lessonId: String(rest.lessonId), studentId: String(rest.studentId) }),
      timestamp: Date.now(),
    });
    return keywordId;
  },
});

export const bulkCreateKeywords = mutation({
  args: {
    sessionToken: v.optional(v.string()),
    apiKey: v.optional(v.string()),
    keywords: v.array(v.object({
      lessonId: v.id("lessons"),
      studentId: v.id("students"),
      organizationId: v.optional(v.id("organizations")),
      word: v.string(),
      translation: v.string(),
      definitionEn: v.string(),
      definitionPl: v.string(),
      exampleEn: v.string(),
      examplePl: v.string(),
      ipa: v.string(),
      stressUK: v.string(),
      stressUS: v.string(),
      topics: v.array(v.string()),
      collocations: collocationsField,
      youglishVideoId: v.optional(v.string()),
      youglishStart: v.optional(v.number()),
      youglishCaption: v.optional(v.string()),
    })),
  },
  handler: async (ctx, args) => {
    await requireAdminOrPipelineKey(ctx, args.sessionToken, args.apiKey);
    const ids = [];
    for (const kw of args.keywords) {
      const id = await ctx.db.insert("keywords", {
        ...kw,
        mastery: 0,
        reviewCount: 0,
        createdAt: Date.now(),
      });
      ids.push(id);
    }
    return ids;
  },
});

export const searchKeywords = query({
  args: {
    studentId: v.optional(v.id("students")),
    search: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const allKeywords = args.studentId
      ? await ctx.db.query("keywords").withIndex("by_student", q => q.eq("studentId", args.studentId!)).collect()
      : await ctx.db.query("keywords").collect();

    const lowerSearch = args.search.toLowerCase();
    return allKeywords
      .filter(k => k.word.toLowerCase().includes(lowerSearch) || k.translation.toLowerCase().includes(lowerSearch))
      .slice(0, args.limit || 50);
  },
});

export const updateKeywordCollocations = mutation({
  args: {
    sessionToken: v.optional(v.string()),
    apiKey: v.optional(v.string()),
    keywordId: v.id("keywords"),
    collocations: collocationsField,
  },
  handler: async (ctx, args) => {
    await requireAdminOrPipelineKey(ctx, args.sessionToken, args.apiKey);
    await ctx.db.patch(args.keywordId, {
      collocations: args.collocations,
    });
  },
});

export const bulkUpdateCollocations = mutation({
  args: {
    sessionToken: v.optional(v.string()),
    apiKey: v.optional(v.string()),
    updates: v.array(v.object({
      keywordId: v.id("keywords"),
      collocations: collocationsField,
    })),
  },
  handler: async (ctx, args) => {
    await requireAdminOrPipelineKey(ctx, args.sessionToken, args.apiKey);
    for (const { keywordId, collocations } of args.updates) {
      await ctx.db.patch(keywordId, {
        collocations,
      });
    }
    return args.updates.length;
  },
});

export const updateKeywordMastery = mutation({
  args: {
    sessionToken: v.optional(v.string()),
    apiKey: v.optional(v.string()),
    keywordId: v.id("keywords"),
    correct: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requireAdminOrPipelineKey(ctx, args.sessionToken, args.apiKey);
    const keyword = await ctx.db.get(args.keywordId);
    if (!keyword) return;
    const newReviewCount = (keyword.reviewCount || 0) + 1;
    const score = args.correct ? 100 : 0;
    const newMastery = Math.round((keyword.mastery || 0) * 0.7 + score * 0.3);
    await ctx.db.patch(args.keywordId, {
      mastery: newMastery,
      reviewCount: newReviewCount,
      lastReviewedAt: Date.now(),
    });
  },
});

// ═══════════════════════════════════════════════════════════
// KEYWORD PATCH (generic field update)
// ═══════════════════════════════════════════════════════════

export const patchKeyword = mutation({
  args: {
    sessionToken: v.optional(v.string()),
    apiKey: v.optional(v.string()),
    keywordId: v.id("keywords"),
    spellingVariant: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdminOrPipelineKey(ctx, args.sessionToken, args.apiKey);
    const { sessionToken, apiKey, keywordId, ...fields } = args;
    const patch: Record<string, unknown> = {};
    if (fields.spellingVariant !== undefined) patch.spellingVariant = fields.spellingVariant;
    await ctx.db.patch(keywordId, patch);
  },
});

// ═══════════════════════════════════════════════════════════
// KEYWORD ENRICHMENT (em-enrichment pipeline write-target)
// ═══════════════════════════════════════════════════════════
// Used by /root/.openclaw/workspace/em-enrichment/process_lesson.py to
// patch Szymon-grade rich data onto an existing keywords row:
//   • collocations (3 sections × 3 items, varied examples)
//   • synonyms (with industry + nuance)
//   • learnerNotes (false friends, common mistakes, usage tip)
//   • enrichedAt / enrichmentVersion / enrichmentModel for idempotency
//
// Only the fields explicitly passed in are patched — translations / IPA /
// examples already on the row are preserved unless explicitly overridden.

export const patchKeywordEnrichment = mutation({
  args: {
    sessionToken: v.optional(v.string()),
    apiKey: v.optional(v.string()),
    keywordId: v.id("keywords"),
    collocations: v.optional(v.object({
      commonCollocations: v.optional(v.array(v.object({
        phrase: v.string(),
        example: v.string(),
      }))),
      contexts: v.optional(v.array(v.object({
        phrase: v.string(),
        example: v.string(),
      }))),
      usagePatterns: v.optional(v.array(v.object({
        phrase: v.string(),
        example: v.string(),
      }))),
    })),
    synonyms: v.optional(v.array(v.object({
      synonym: v.string(),
      industry: v.optional(v.string()),
      nuance: v.optional(v.string()),
    }))),
    learnerNotes: v.optional(v.object({
      falseFriends: v.optional(v.array(v.object({
        polish: v.string(),
        polishMeaning: v.optional(v.string()),
        confusion: v.optional(v.string()),
      }))),
      commonMistakes: v.optional(v.array(v.object({
        mistake: v.string(),
        correction: v.string(),
        reason: v.optional(v.string()),
      }))),
      usageTip: v.optional(v.string()),
    })),
    // Optional re-fills if the original ingestion left these thin / wrong.
    ipa: v.optional(v.string()),
    stressUK: v.optional(v.string()),
    stressUS: v.optional(v.string()),
    definitionPl: v.optional(v.string()),
    examplePl: v.optional(v.string()),
    enrichmentVersion: v.optional(v.string()),
    enrichmentModel: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdminOrPipelineKey(ctx, args.sessionToken, args.apiKey);
    const { sessionToken, apiKey, keywordId, ...rest } = args;
    const patch: Record<string, unknown> = {};
    for (const [k, v2] of Object.entries(rest)) {
      if (v2 !== undefined) patch[k] = v2;
    }
    if (Object.keys(patch).length === 0) return null;
    patch.enrichedAt = Date.now();
    await ctx.db.patch(keywordId, patch);
    return keywordId;
  },
});

// ═══════════════════════════════════════════════════════════
// TRANSCRIPT ANALYSIS PATCHES
// ═══════════════════════════════════════════════════════════
// Used by /root/.openclaw/workspace/em-enrichment/generate_greeting.py
// (and the daily ingestion pipeline) to write the 2nd-person student
// greeting paragraph onto an existing transcriptAnalyses row. This is
// what Dashboard.jsx renders under "Welcome back, {name}."

export const patchStudentGreeting = mutation({
  args: {
    sessionToken: v.optional(v.string()),
    apiKey: v.optional(v.string()),
    analysisId: v.id("transcriptAnalyses"),
    greeting: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAdminOrPipelineKey(ctx, args.sessionToken, args.apiKey);
    const trimmed = args.greeting.trim();
    if (!trimmed) return null;
    await ctx.db.patch(args.analysisId, { studentGreeting: trimmed });
    return args.analysisId;
  },
});

// Read helper for the enrichment pipeline. Returns the latest non-planned
// analysis row for a student (highest _creationTime on transcriptAnalyses).
// "non-planned" simply means an analysis row exists — planned/upcoming
// lessons that haven't run yet won't have a transcriptAnalyses entry.
export const getLatestAnalysisForStudent = query({
  args: { studentId: v.id("students") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("transcriptAnalyses")
      .withIndex("by_student", q => q.eq("studentId", args.studentId))
      .order("desc")
      .first();
  },
});

// ═══════════════════════════════════════════════════════════
// KEYWORD DELETION
// ═══════════════════════════════════════════════════════════

export const deleteKeyword = mutation({
  args: {
    sessionToken: v.optional(v.string()),
    apiKey: v.optional(v.string()),
    keywordId: v.id("keywords"),
  },
  handler: async (ctx, args) => {
    const actor = await requireAdminOrPipelineKey(ctx, args.sessionToken, args.apiKey);
    const keyword = await ctx.db.get(args.keywordId);
    await ctx.db.delete(args.keywordId);
    await ctx.db.insert("auditLog", {
      organizationId: keyword?.organizationId,
      userId: actor.kind === "admin" ? actor.user?._id : undefined,
      action: "keyword.deleted",
      targetType: "keyword",
      targetId: String(args.keywordId),
      details: JSON.stringify({ word: keyword?.word || "" }),
      timestamp: Date.now(),
    });
  },
});

export const bulkDeleteKeywords = mutation({
  args: {
    sessionToken: v.optional(v.string()),
    apiKey: v.optional(v.string()),
    keywordIds: v.array(v.id("keywords")),
  },
  handler: async (ctx, args) => {
    await requireAdminOrPipelineKey(ctx, args.sessionToken, args.apiKey);
    for (const id of args.keywordIds) {
      await ctx.db.delete(id);
    }
  },
});

// ═══════════════════════════════════════════════════════════
// DASHBOARDS
// ═══════════════════════════════════════════════════════════

// Student dashboard (what the student sees)
export const getStudentDashboard = query({
  args: { sessionToken: v.string(), studentSlug: v.string() },
  handler: async (ctx, args) => {
    const { user } = await requireAdmin(ctx, args.sessionToken);
    const student = await ctx.db
      .query("students")
      .withIndex("by_slug", q => q.eq("slug", args.studentSlug))
      .unique();

    if (!student) return null;
    if (!isSuperadmin(user.role) && student.organizationId !== user.organizationId) {
      throw new Error("Unauthorized");
    }

    const lessons = await ctx.db
      .query("lessons")
      .withIndex("by_student", q => q.eq("studentId", student._id))
      .collect();

    const lessonsWithCounts = await Promise.all(
      lessons.map(async (lesson) => {
        const keywords = await ctx.db
          .query("keywords")
          .withIndex("by_lesson", q => q.eq("lessonId", lesson._id))
          .collect();
        return { ...lesson, keywordCount: keywords.length, keywords };
      })
    );

    const latestAnalysis = await ctx.db
      .query("transcriptAnalyses")
      .withIndex("by_student", q => q.eq("studentId", student._id))
      .order("desc")
      .first();

    const allAnalyses = await ctx.db
      .query("transcriptAnalyses")
      .withIndex("by_student_date", q => q.eq("studentId", student._id))
      .order("desc")
      .collect();

    const recentQuizzes = await ctx.db
      .query("quizResults")
      .withIndex("by_student_date", q => q.eq("studentId", student._id))
      .order("desc")
      .take(10);

    const totalKeywords = lessonsWithCounts.reduce((sum, l) => sum + l.keywordCount, 0);

    const avgAccuracy = recentQuizzes.length > 0
      ? Math.round(recentQuizzes.reduce((sum, q) => sum + q.accuracy, 0) / recentQuizzes.length)
      : 0;

    return {
      student,
      lessons: lessonsWithCounts.sort((a, b) => a.order - b.order),
      totalKeywords,
      latestAnalysis,
      allAnalyses,
      recentQuizzes,
      avgAccuracy,
    };
  },
});

// School dashboard (teacher sees their students)
export const getSchoolDashboard = query({
  args: { sessionToken: v.string(), organizationId: v.optional(v.id("organizations")) },
  handler: async (ctx, args) => {
    const { user } = await requireAdmin(ctx, args.sessionToken);
    const organizationId = isSuperadmin(user.role)
      ? (args.organizationId ?? user.organizationId)
      : user.organizationId;
    if (!organizationId) throw new Error("No organization in scope");
    const org = await ctx.db.get(organizationId);
    if (!org) return null;

    const students = await ctx.db
      .query("students")
      .withIndex("by_organization", q => q.eq("organizationId", organizationId))
      .collect();

    const activeStudents = students.filter(s => s.status === "active");

    const studentSummaries = await Promise.all(
      activeStudents.map(async (student) => {
        const lessons = await ctx.db
          .query("lessons")
          .withIndex("by_student", q => q.eq("studentId", student._id))
          .collect();

        const keywordCount = await (async () => {
          let total = 0;
          for (const lesson of lessons) {
            const kws = await ctx.db
              .query("keywords")
              .withIndex("by_lesson", q => q.eq("lessonId", lesson._id))
              .collect();
            total += kws.length;
          }
          return total;
        })();

        const latestAnalysis = await ctx.db
          .query("transcriptAnalyses")
          .withIndex("by_student", q => q.eq("studentId", student._id))
          .order("desc")
          .first();

        return {
          student,
          lessonCount: lessons.length,
          keywordCount,
          latestAnalysis,
        };
      })
    );

    const groups = await ctx.db
      .query("groups")
      .withIndex("by_organization", q => q.eq("organizationId", organizationId))
      .collect();

    return {
      organization: org,
      totalStudents: students.length,
      activeStudents: activeStudents.length,
      groups,
      students: studentSummaries,
    };
  },
});

// Super admin dashboard (sees all orgs)
export const getAdminDashboard = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args.sessionToken);
    const orgs = await ctx.db.query("organizations").collect();
    const totalStudents = await ctx.db.query("students").collect();
    const totalLessons = await ctx.db.query("lessons").collect();
    const totalKeywords = await ctx.db.query("keywords").collect();

    const orgSummaries = await Promise.all(
      orgs.map(async (org) => {
        const students = await ctx.db
          .query("students")
          .withIndex("by_organization", q => q.eq("organizationId", org._id))
          .collect();
        return {
          organization: org,
          studentCount: students.length,
          activeCount: students.filter(s => s.status === "active").length,
        };
      })
    );

    return {
      totalOrganizations: orgs.length,
      totalStudents: totalStudents.length,
      totalLessons: totalLessons.length,
      totalKeywords: totalKeywords.length,
      organizations: orgSummaries,
    };
  },
});

// ═══════════════════════════════════════════════════════════
// ADMIN ANALYTICS QUERIES (P1)
// ═══════════════════════════════════════════════════════════

// At-risk students: no lesson in N+ days
export const getAtRiskStudents = query({
  args: {
    sessionToken: v.string(),
    organizationId: v.optional(v.id("organizations")),
    daysThreshold: v.optional(v.number()), // default 14
  },
  handler: async (ctx, args) => {
    const { user } = await requireAdmin(ctx, args.sessionToken);
    const organizationId = isSuperadmin(user.role)
      ? (args.organizationId ?? user.organizationId)
      : user.organizationId;
    if (!organizationId) throw new Error("No organization in scope");
    const threshold = args.daysThreshold || 14;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - threshold);
    const cutoffStr = cutoff.toISOString().split("T")[0]; // YYYY-MM-DD

    const students = await ctx.db
      .query("students")
      .withIndex("by_organization", q => q.eq("organizationId", organizationId))
      .collect();

    const activeStudents = students.filter(s => s.status === "active");

    const atRisk = await Promise.all(
      activeStudents.map(async (student) => {
        // Get most recent lesson by date string comparison
        const lessons = await ctx.db
          .query("lessons")
          .withIndex("by_student", q => q.eq("studentId", student._id))
          .order("desc")
          .take(1);

        const latestLesson = lessons[0];
        const latestDate = latestLesson?.date || null;
        const isAtRisk = !latestDate || latestDate < cutoffStr;

        // Count total lessons
        const allLessons = await ctx.db
          .query("lessons")
          .withIndex("by_student", q => q.eq("studentId", student._id))
          .collect();

        return {
          student,
          latestLessonDate: latestDate,
          daysSinceLastLesson: latestDate
            ? Math.floor((Date.now() - new Date(latestDate + "T12:00:00").getTime()) / 86400000)
            : null,
          totalLessons: allLessons.length,
          isAtRisk,
        };
      })
    );

    // Sort: most at-risk first (null date = never had lesson = highest risk)
    return atRisk
      .filter(s => s.isAtRisk)
      .sort((a, b) => {
        if (a.latestLessonDate === null) return -1;
        if (b.latestLessonDate === null) return 1;
        return a.latestLessonDate.localeCompare(b.latestLessonDate);
      });
  },
});

// Quiz completion rate per student (org-wide)
export const getQuizCompletionRates = query({
  args: {
    sessionToken: v.string(),
    organizationId: v.optional(v.id("organizations")),
  },
  handler: async (ctx, args) => {
    const { user } = await requireAdmin(ctx, args.sessionToken);
    const organizationId = isSuperadmin(user.role)
      ? (args.organizationId ?? user.organizationId)
      : user.organizationId;
    if (!organizationId) throw new Error("No organization in scope");
    const students = await ctx.db
      .query("students")
      .withIndex("by_organization", q => q.eq("organizationId", organizationId))
      .collect();

    const results = await Promise.all(
      students.map(async (student) => {
        const quizzes = await ctx.db
          .query("quizResults")
          .withIndex("by_student_date", q => q.eq("studentId", student._id))
          .collect();

        const lessons = await ctx.db
          .query("lessons")
          .withIndex("by_student", q => q.eq("studentId", student._id))
          .collect();

        const completedQuizzes = quizzes.length;
        const avgAccuracy = completedQuizzes > 0
          ? Math.round(quizzes.reduce((sum, q) => sum + q.accuracy, 0) / completedQuizzes)
          : 0;
        const bestAccuracy = completedQuizzes > 0
          ? Math.max(...quizzes.map(q => q.accuracy))
          : 0;
        const completionRate = lessons.length > 0
          ? Math.round((completedQuizzes / lessons.length) * 100)
          : 0;

        return {
          student,
          totalLessons: lessons.length,
          completedQuizzes,
          avgAccuracy,
          bestAccuracy,
          completionRate,
        };
      })
    );

    return results.sort((a, b) => a.completionRate - b.completionRate);
  },
});

// Lessons by date range (for calendar view)
export const getLessonsByDateRange = query({
  args: {
    sessionToken: v.string(),
    organizationId: v.optional(v.id("organizations")),
    startDate: v.string(), // YYYY-MM-DD
    endDate: v.string(),   // YYYY-MM-DD
  },
  handler: async (ctx, args) => {
    const { user } = await requireAdmin(ctx, args.sessionToken);
    const organizationId = isSuperadmin(user.role)
      ? (args.organizationId ?? user.organizationId)
      : user.organizationId;
    if (!organizationId) throw new Error("No organization in scope");
    const allLessons = await ctx.db
      .query("lessons")
      .withIndex("by_organization", q => q.eq("organizationId", organizationId))
      .collect();

    // Filter by date range
    const filtered = allLessons.filter(
      l => l.date >= args.startDate && l.date <= args.endDate
    );

    // Enrich with student info and analysis
    const enriched = await Promise.all(
      filtered.map(async (lesson) => {
        const student = await ctx.db.get(lesson.studentId);
        const analysis = await ctx.db
          .query("transcriptAnalyses")
          .withIndex("by_lesson", q => q.eq("lessonId", lesson._id))
          .unique();

        return {
          lesson,
          student: student ? {
            _id: student._id,
            name: student.name,
            slug: student.slug,
            level: student.level,
          } : null,
          analysis: analysis ? {
            overallScore: analysis.overallScore,
            cefrBand: analysis.cefrBand,
          } : null,
        };
      })
    );

    return enriched.sort((a, b) => a.lesson.date.localeCompare(b.lesson.date));
  },
});

// Enhanced school dashboard with at-risk and quiz data
export const getSchoolDashboardEnhanced = query({
  args: {
    sessionToken: v.string(),
    organizationId: v.optional(v.id("organizations")),
    atRiskDays: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { user } = await requireAdmin(ctx, args.sessionToken);
    const organizationId = isSuperadmin(user.role)
      ? (args.organizationId ?? user.organizationId)
      : user.organizationId;
    if (!organizationId) throw new Error("No organization in scope");
    const atRiskDays = args.atRiskDays || 14;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - atRiskDays);
    const cutoffStr = cutoff.toISOString().split("T")[0];

    const org = await ctx.db.get(organizationId);
    if (!org) return null;

    const students = await ctx.db
      .query("students")
      .withIndex("by_organization", q => q.eq("organizationId", organizationId))
      .collect();

    const activeStudents = students.filter(s => s.status === "active");

    const studentSummaries = await Promise.all(
      activeStudents.map(async (student) => {
        const lessons = await ctx.db
          .query("lessons")
          .withIndex("by_student", q => q.eq("studentId", student._id))
          .order("desc")
          .collect();

        const latestLessonDate = lessons[0]?.date || null;

        const keywordCount = await (async () => {
          let total = 0;
          for (const lesson of lessons) {
            const kws = await ctx.db
              .query("keywords")
              .withIndex("by_lesson", q => q.eq("lessonId", lesson._id))
              .collect();
            total += kws.length;
          }
          return total;
        })();

        const latestAnalysis = await ctx.db
          .query("transcriptAnalyses")
          .withIndex("by_student", q => q.eq("studentId", student._id))
          .order("desc")
          .first();

        const quizzes = await ctx.db
          .query("quizResults")
          .withIndex("by_student_date", q => q.eq("studentId", student._id))
          .collect();

        const avgAccuracy = quizzes.length > 0
          ? Math.round(quizzes.reduce((sum, q) => sum + q.accuracy, 0) / quizzes.length)
          : 0;

        const isAtRisk = !latestLessonDate || latestLessonDate < cutoffStr;

        return {
          student,
          lessonCount: lessons.length,
          keywordCount,
          latestAnalysis,
          latestLessonDate,
          isAtRisk,
          daysSinceLastLesson: latestLessonDate
            ? Math.floor((Date.now() - new Date(latestLessonDate + "T12:00:00").getTime()) / 86400000)
            : null,
          quizCount: quizzes.length,
          avgAccuracy,
        };
      })
    );

    const groups = await ctx.db
      .query("groups")
      .withIndex("by_organization", q => q.eq("organizationId", organizationId))
      .collect();

    // Lessons this week and this month
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay() + 1); // Monday
    const weekStartStr = weekStart.toISOString().split("T")[0];
    const monthStartStr = now.toISOString().slice(0, 8) + "01";

    const allOrgLessons = await ctx.db
      .query("lessons")
      .withIndex("by_organization", q => q.eq("organizationId", organizationId))
      .collect();

    const lessonsThisWeek = allOrgLessons.filter(l => l.date >= weekStartStr).length;
    const lessonsThisMonth = allOrgLessons.filter(l => l.date >= monthStartStr).length;

    return {
      organization: org,
      totalStudents: students.length,
      activeStudents: activeStudents.length,
      atRiskStudents: studentSummaries.filter(s => s.isAtRisk).length,
      groups,
      students: studentSummaries,
      lessonsThisWeek,
      lessonsThisMonth,
    };
  },
});

// Legacy stats (backward compatible)
export const getGlobalStats = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args.sessionToken);
    const students = await ctx.db.query("students").collect();
    const activeStudents = students.filter(s => s.status === "active").length;
    const allLessons = await ctx.db.query("lessons").collect();
    // Keywords are NOT collected here: enriched keyword docs are several KB
    // each, so a full-table collect() exceeds Convex's per-execution read
    // limit (the 2026-07-09 superadmin console outage). Clients sum
    // countKeywordsPage pages instead. keywordsPerStudent retired (unused).
    return {
      totalStudents: students.length,
      activeStudents,
      totalLessons: allLessons.length,
      totalKeywords: null,
      keywordsPerStudent: {},
    };
  },
});

// One page of the global keyword count. Enriched keyword docs are too fat to
// count in a single execution, so callers iterate cursors and sum the pages.
export const countKeywordsPage = query({
  args: {
    sessionToken: v.string(),
    cursor: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args.sessionToken);
    const page = await ctx.db
      .query("keywords")
      .paginate({ cursor: args.cursor ?? null, numItems: 400 });
    return { count: page.page.length, cursor: page.continueCursor, isDone: page.isDone };
  },
});

// ═══════════════════════════════════════════════════════════
// KEYWORD HEATMAP — Phase 3 of audit §4 #21 (Mike CRITICAL)
// ═══════════════════════════════════════════════════════════
// Per-student, per-keyword exposure summary for the teacher
// dashboard heatmap. Joins the keyword bank against
// practiceExposure (kw:* itemIds) + quizResults (correctness)
// and bucketises each keyword as untouched | fresh | familiar |
// stuck so the teacher can see at a glance which words the
// student has never been shown vs which are recycling vs which
// are stuck (>=3 exposures but recent errors / not retained).
//
// Inputs:
//   studentSlug — required. We safely return an empty shape
//                 for unknown / anonymous slugs so the UI
//                 degrades gracefully.
//
// Output shape (always present, even on empty data):
//   {
//     studentSlug: string,
//     bankSize:    number,
//     rows: Array<{
//       keyword:           string,
//       cefr:              string,                  // "A1".."C2" or ""
//       topic:             string,                  // first topic or ""
//       seenCount:         number,                  // exposure rows in 30d
//       lastSeenDaysAgo:   number | null,           // null = never seen
//       correctnessRate:   number | null,           // 0..1, null when no quizResults
//       bucket:            "untouched"|"fresh"|"familiar"|"stuck",
//     }>,
//   }
//
// Bucket logic (matches the spec in CD's audit doc):
//   untouched: never seen
//   fresh:     seen <3 times AND last 7 days
//   familiar:  seen 3+ times AND no recent errors
//   stuck:     seen 3+ times BUT recent errors OR not retained
//              (we treat "not retained" as last-seen >14 days ago
//              with seenCount>=3 — i.e. they hit it a lot but
//              haven't touched it in two weeks)
//
// Notes:
//   - Window for "seenCount" is 30d (matches PRUNE_HORIZON_MS in
//     exposure.ts so we surface every retained row).
//   - Window for "recent errors" is 14d (last two Leitner cycles).
//   - quizResults.keywordResults is keyed by keywordId — we map
//     keyword.word ↔ keyword._id once up front.
//   - Capped at 5000 keywords (Aleksandra ~168, max student ~600).
export const keywordHeatmap = query({
  args: {
    sessionToken: v.string(),
    studentSlug: v.string(),
  },
  handler: async (ctx, args) => {
    const { user } = await requireAdmin(ctx, args.sessionToken);
    const empty = {
      studentSlug: args.studentSlug,
      bankSize: 0,
      rows: [] as Array<{
        keyword: string;
        cefr: string;
        topic: string;
        seenCount: number;
        lastSeenDaysAgo: number | null;
        correctnessRate: number | null;
        bucket: "untouched" | "fresh" | "familiar" | "stuck";
      }>,
    };

    if (!args.studentSlug || args.studentSlug === "__anon__") return empty;

    const student = await ctx.db
      .query("students")
      .withIndex("by_slug", q => q.eq("slug", args.studentSlug))
      .unique();
    if (!student) return empty;
    if (!isSuperadmin(user.role) && student.organizationId !== user.organizationId) {
      throw new Error("Unauthorized");
    }

    // Pull the keyword bank.
    const keywords = await ctx.db
      .query("keywords")
      .withIndex("by_student", q => q.eq("studentId", student._id))
      .take(5000);

    if (keywords.length === 0) {
      return { ...empty, bankSize: 0 };
    }

    // Build itemId → keyword index. Match the `kw:<lower>` shape
    // the frontend writes (extractKeywordItemIds in
    // src/practice/lib/exposure.ts).
    type KwMeta = {
      word: string;
      cefr: string;
      topic: string;
      keywordId: string;
    };
    const byItemId = new Map<string, KwMeta>();
    const byKeywordId = new Map<string, KwMeta>();
    for (const kw of keywords) {
      const w = (kw.word ?? "").trim();
      if (!w) continue;
      const meta: KwMeta = {
        word: w,
        cefr: kw.difficulty ?? "",
        topic: (kw.topics?.[0] ?? "").trim(),
        keywordId: String(kw._id),
      };
      byItemId.set(`kw:${w.toLowerCase()}`, meta);
      byKeywordId.set(String(kw._id), meta);
    }

    const now = Date.now();
    const HORIZON_30D = now - 30 * 24 * 60 * 60 * 1000;
    const HORIZON_14D = now - 14 * 24 * 60 * 60 * 1000;
    const HORIZON_7D = now - 7 * 24 * 60 * 60 * 1000;

    // Pull exposure rows in the 30d window.
    const exposures = await ctx.db
      .query("practiceExposure")
      .withIndex("by_student_exposed", q =>
        q.eq("studentSlug", args.studentSlug).gt("exposedAt", HORIZON_30D),
      )
      .take(5000);

    // Aggregate per-keyword exposure: count + last-seen timestamp.
    const expoAgg = new Map<string, { count: number; lastSeen: number }>();
    for (const row of exposures) {
      if (row.itemKind !== "keyword") continue;
      const meta = byItemId.get(row.itemId);
      if (!meta) continue;
      const cur = expoAgg.get(meta.word);
      if (cur) {
        cur.count++;
        if (row.exposedAt > cur.lastSeen) cur.lastSeen = row.exposedAt;
      } else {
        expoAgg.set(meta.word, { count: 1, lastSeen: row.exposedAt });
      }
    }

    // Pull recent quizResults to compute per-keyword correctness.
    // Last 14d only — older results don't reflect current retention.
    const quizzes = await ctx.db
      .query("quizResults")
      .withIndex("by_student_date", q =>
        q.eq("studentId", student._id).gt("completedAt", HORIZON_14D),
      )
      .take(500);

    const correctAgg = new Map<string, { correct: number; total: number }>();
    for (const qr of quizzes) {
      for (const kr of qr.keywordResults ?? []) {
        const meta = byKeywordId.get(String(kr.keywordId));
        if (!meta) continue;
        const cur = correctAgg.get(meta.word) ?? { correct: 0, total: 0 };
        cur.total++;
        if (kr.correct) cur.correct++;
        correctAgg.set(meta.word, cur);
      }
    }

    // Build output rows.
    const rows = keywords
      .filter(kw => (kw.word ?? "").trim().length > 0)
      .map(kw => {
        const word = kw.word.trim();
        const expo = expoAgg.get(word);
        const corr = correctAgg.get(word);
        const seenCount = expo?.count ?? 0;
        const lastSeenDaysAgo =
          expo?.lastSeen != null
            ? Math.max(0, Math.floor((now - expo.lastSeen) / (24 * 60 * 60 * 1000)))
            : null;
        const correctnessRate =
          corr && corr.total > 0 ? corr.correct / corr.total : null;

        // Bucket logic — matches spec.
        let bucket: "untouched" | "fresh" | "familiar" | "stuck";
        if (seenCount === 0) {
          bucket = "untouched";
        } else if (seenCount < 3 && expo!.lastSeen >= HORIZON_7D) {
          bucket = "fresh";
        } else if (seenCount >= 3) {
          // Recent errors? → stuck.
          const recentErrors =
            correctnessRate != null && correctnessRate < 0.6;
          // Not retained = ≥3 exposures but lastSeen >14d ago.
          const notRetained = expo!.lastSeen < HORIZON_14D;
          if (recentErrors || notRetained) {
            bucket = "stuck";
          } else {
            bucket = "familiar";
          }
        } else {
          // seenCount in [1,2] but lastSeen >7d ago → degraded fresh →
          // treat as stuck-ish; surface as "stuck" so the teacher
          // notices it's slipping.
          bucket = "stuck";
        }

        return {
          keyword: word,
          cefr: kw.difficulty ?? "",
          topic: (kw.topics?.[0] ?? "").trim(),
          seenCount,
          lastSeenDaysAgo,
          correctnessRate,
          bucket,
        };
      });

    return {
      studentSlug: args.studentSlug,
      bankSize: rows.length,
      rows,
    };
  },
});

// ═══════════════════════════════════════════════════════════
// ACCOUNT-BY-PHONE (Workstream C: WhatsApp shared-number router)
// ═══════════════════════════════════════════════════════════
// Trusted server-side lookup used by the PriceMate WhatsApp relay to decide
// whether an inbound WhatsApp sender belongs to a Conversa/English Metropolis
// account (student or admin). Auth: admin session OR the pipeline API key.
//
// Phone matching is forgiving of +48-prefix / formatting variance: we strip
// all non-digits from BOTH the query and the stored value, then compare on the
// LAST 9 digits (a Polish national number is 9 digits; the 48 country code is
// the prefix). Tables are tiny (a few rows) so we collect() and scan in JS
// rather than adding a phone index.
export const findAccountByPhone = query({
  args: {
    phone: v.string(),
    apiKey: v.optional(v.string()),
    sessionToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdminOrPipelineKey(ctx, args.sessionToken, args.apiKey);

    const norm = (s: string | undefined | null) => (s || "").replace(/\D/g, "");
    const tail9 = (s: string | undefined | null) => {
      const d = norm(s);
      return d.length >= 9 ? d.slice(-9) : d;
    };
    const want = tail9(args.phone);
    if (!want) return null;

    // Students first (non-archived). Match on last 9 digits.
    const students = await ctx.db.query("students").collect();
    for (const s of students) {
      if (s.status === "archived") continue;
      if (!s.phone) continue;
      if (tail9(s.phone) === want) {
        return {
          kind: "student" as const,
          studentId: s._id,
          slug: s.slug,
          name: s.name,
          level: s.level,
          organizationId: s.organizationId ?? null,
        };
      }
    }

    // Then users. A teacher (role "teacher", active, not soft-deleted) is matched
    // BEFORE admins so the Bajla assistant can role-gate them correctly.
    const users = await ctx.db.query("users").collect();
    for (const u of users) {
      if (u.status !== "active") continue;
      if (!u.phone) continue;
      if (tail9(u.phone) !== want) continue;
      if (u.role === "teacher" && !u.deletedAt) {
        return {
          kind: "teacher" as const,
          teacherId: u._id,
          name: u.name,
          email: u.email,
          organizationId: u.organizationId ?? null,
        };
      }
      if (["admin", "org_admin", "super_admin"].includes(u.role)) {
        return {
          kind: "admin" as const,
          userId: u._id,
          email: u.email,
          name: u.name,
          role: u.role,
          organizationId: u.organizationId ?? null,
        };
      }
    }

    return null;
  },
});

// ═════════════════════════════════════════════════════════════
// AI LESSON ANALYSIS — eligibility and consent (2026-08-10)
//
// One gate. The transcription pipeline, the checkout, the Settings toggle and
// the student app all ask this and nothing else, so there is no second place
// where a lesson could be analysed under a different rule.
// ═════════════════════════════════════════════════════════════

// Bump when the notice changes materially; consents record the version they saw.
export const ANALYSIS_NOTICE_VERSION = "2026-08-10";

function analysisState(student: any): { allowed: boolean; reason: string } {
  // A child's account can never be analysed. Not "hidden", not "off by default":
  // there is no path that turns it on, because a parent cannot consent to this
  // on a child's behalf in a way we are willing to rely on, and lesson
  // recordings of children are the last thing that should sit in an LLM prompt.
  if (student.isMinor) return { allowed: false, reason: "minor" };
  const c = student.lessonAnalysis;
  if (!c || c.revokedAt) return { allowed: false, reason: c ? "revoked" : "no_consent" };
  return { allowed: true, reason: "ok" };
}

// Called by the transcription/analysis pipeline before it touches a lesson.
// Authenticated with the pipeline key, same contract as the other automation.
// `lessonId` is optional and additive. Without it the answer is exactly what it
// has always been (the account-wide consent), so the existing pipeline calls are
// unchanged. With it, a lesson bought on its own also passes — that is the whole
// point of the single-lesson product: 20 PLN must buy one analysis, not the
// account forever. The minor check still runs first and is not reachable past.
export const analysisEligibility = query({
  args: {
    studentId: v.id("students"),
    apiKey: v.string(),
    lessonId: v.optional(v.id("lessons")),
  },
  handler: async (ctx, args) => {
    if (!process.env.PIPELINE_API_KEY || args.apiKey !== process.env.PIPELINE_API_KEY) {
      return { allowed: false, reason: "unauthorized" };
    }
    const student = await ctx.db.get(args.studentId);
    if (!student) return { allowed: false, reason: "no_student" };
    const state = analysisState(student);
    if (state.allowed || student.isMinor || !args.lessonId) return state;
    const entitlement = await ctx.db
      .query("analysisEntitlements")
      .withIndex("by_student_lesson", q =>
        q.eq("studentId", args.studentId).eq("lessonId", args.lessonId!))
      .unique();
    if (entitlement && !entitlement.revokedAt) {
      return { allowed: true, reason: "lesson_entitlement" };
    }
    return state;
  },
});

// What the backfill worker asks for: lessons that have been paid for
// individually and still have no analysis. The account-wide product is served
// by `dueAccountBackfill` below.
export const dueLessonEntitlements = query({
  args: { apiKey: v.string() },
  handler: async (ctx, args) => {
    if (!process.env.PIPELINE_API_KEY || args.apiKey !== process.env.PIPELINE_API_KEY) {
      return [];
    }
    const rows = await ctx.db
      .query("analysisEntitlements")
      .withIndex("by_fulfilled", q => q.eq("fulfilledAt", undefined))
      .collect();
    const out = [];
    for (const row of rows) {
      if (row.revokedAt) continue;
      const student = await ctx.db.get(row.studentId);
      const lesson = await ctx.db.get(row.lessonId);
      if (!student || !lesson) continue;
      // Already analysed by some other route — nothing owed, just close it off.
      const existing = await ctx.db
        .query("transcriptAnalyses")
        .withIndex("by_lesson", q => q.eq("lessonId", row.lessonId))
        .unique();
      out.push({
        entitlementId: row._id,
        studentId: row.studentId,
        studentSlug: student.slug,
        lessonId: row.lessonId,
        date: lesson.date,
        alreadyAnalysed: !!existing,
      });
    }
    return out;
  },
});

// The retroactive half of the account-wide product. "All my lessons" is sold as
// covering the backlog as well as the future, so the backlog has to be worked
// through: every taught lesson with no analysis, for every student who holds a
// live account-wide consent. The ordinary post-lesson publisher covers the
// future and never sees these, because its discovery window is 12 hours wide.
//
// Bounded per student per sweep so a 40-lesson backlog does not monopolise the
// worker or the inference budget in one run.
export const dueAccountBackfill = query({
  args: { apiKey: v.string(), limitPerStudent: v.optional(v.number()) },
  handler: async (ctx, args) => {
    if (!process.env.PIPELINE_API_KEY || args.apiKey !== process.env.PIPELINE_API_KEY) {
      return [];
    }
    const limit = Math.min(Math.max(1, Math.trunc(args.limitPerStudent ?? 3)), 20);
    const students = await ctx.db.query("students").collect();
    const out = [];
    for (const student of students) {
      if (student.isMinor) continue;
      const consent = student.lessonAnalysis;
      if (!consent || consent.revokedAt) continue;
      const lessons = await ctx.db
        .query("lessons")
        .withIndex("by_student", q => q.eq("studentId", student._id))
        .collect();
      let taken = 0;
      // Newest first: the lesson a student just had is the one they care about.
      for (const lesson of lessons.sort((a, b) => (b.date > a.date ? 1 : -1))) {
        if (taken >= limit) break;
        const status = lesson.status || "";
        if (status === "planned" || status === "cancelled") continue;
        const existing = await ctx.db
          .query("transcriptAnalyses")
          .withIndex("by_lesson", q => q.eq("lessonId", lesson._id))
          .unique();
        if (existing) continue;
        out.push({
          studentId: student._id,
          studentSlug: student.slug,
          lessonId: lesson._id,
          date: lesson.date,
        });
        taken += 1;
      }
    }
    return out;
  },
});

// Closes an entitlement once the analysis exists, so the worker never
// regenerates one that has already been paid for and delivered.
export const markEntitlementFulfilled = mutation({
  args: { apiKey: v.string(), entitlementId: v.id("analysisEntitlements") },
  handler: async (ctx, args) => {
    if (!process.env.PIPELINE_API_KEY || args.apiKey !== process.env.PIPELINE_API_KEY) {
      throw new Error("unauthorized");
    }
    const row = await ctx.db.get(args.entitlementId);
    if (!row) return { ok: false, reason: "not_found" };
    if (row.fulfilledAt) return { ok: true, reason: "already" };
    await ctx.db.patch(args.entitlementId, { fulfilledAt: Date.now() });
    return { ok: true, reason: "marked" };
  },
});

// The signed-in student's own view of it, for Settings and the app.
export const myAnalysisSetting = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const { student } = await requireStudent(ctx, args.sessionToken);
    const state = analysisState(student);
    return {
      allowed: state.allowed,
      reason: state.reason,
      // A minor's account must not even be offered the choice.
      offerable: !student.isMinor,
      noticeVersion: ANALYSIS_NOTICE_VERSION,
      grantedAt: student.lessonAnalysis?.grantedAt ?? null,
    };
  },
});

// Withdrawal is always available and takes effect immediately. Granting is NOT
// done here: it is written by the payment flow once the add-on is actually paid
// for, so consent and purchase cannot drift apart.
export const revokeAnalysisConsent = mutation({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const { student } = await requireStudent(ctx, args.sessionToken);
    const now = Date.now();
    // ⛔ Withdrawal has to reach EVERY store that can make an analysis lawful,
    // or it is not a withdrawal. Since 2026-08-17 there are two: the
    // account-wide record here, and per-lesson entitlements bought one at a
    // time. A student who only ever bought single lessons has no account-wide
    // record at all, so patching that alone left them with no way to withdraw.
    const entitlements = await ctx.db
      .query("analysisEntitlements")
      .withIndex("by_student", q => q.eq("studentId", student._id))
      .collect();
    let revokedAny = false;
    for (const entitlement of entitlements) {
      if (entitlement.revokedAt) continue;
      await ctx.db.patch(entitlement._id, { revokedAt: now });
      revokedAny = true;
    }
    if (student.lessonAnalysis && !student.lessonAnalysis.revokedAt) {
      await ctx.db.patch(student._id, {
        lessonAnalysis: { ...student.lessonAnalysis, revokedAt: now },
        updatedAt: now,
      });
      revokedAny = true;
    }
    return { ok: true, revokedAny };
  },
});

// ─────────────────────────────────────────────────────────────
// BAJLA — same consent question, different bill (2026-08-10)
//
// Bajla normally switches on with the paid AI add-on, and that purchase is
// where her consent gets captured. Students enrolled before the rule shipped
// keep her for free (Mike: "only for new students"), which leaves them with no
// till at which to consent — so the popup asks them once, directly.
//
// Free is not the same as consent-free: we still process their phone number and
// what they say to her, so nothing is switched on until they tap.
// ─────────────────────────────────────────────────────────────

export function bajlaState(student: any): { allowed: boolean; reason: string } {
  // A child's account can never reach Bajla. This already falls out of the
  // paid path (a minor cannot buy the add-on) but it is restated here so the
  // free path cannot become the way around it.
  if (student.isMinor) return { allowed: false, reason: "minor" };
  const paid = analysisState(student);
  if (paid.allowed) return { allowed: true, reason: "paid" };
  // Everyone from 2026-08-10 onwards buys the add-on to get her.
  if (!isGrandfathered(student)) return { allowed: false, reason: "needs_purchase" };
  const c = student.bajlaConsent;
  if (!c || c.revokedAt) return { allowed: false, reason: c ? "revoked" : "needs_consent" };
  return { allowed: true, reason: "grandfathered" };
}

// ── Legacy written consent (2026-08-12) ──────────────────────────────────────
// The consent model above assumes consent is captured at checkout, because that
// is where a NEW student first meets us. It had no way to represent the roster
// Mike taught before any of this existed: those students signed a written
// consent to recording and analysis years of lessons ago, and the paid add-on
// was never meant to re-ask them. Without this, `analysisEligibility` reports
// `no_consent` for people who demonstrably did consent, and the pipeline
// refuses to analyse a lesson it is entitled to analyse.
//
// This records that pre-existing consent. It does NOT create consent — it
// transcribes a fact into the database — so it is superadmin-only and demands
// a written attestation naming the evidence, which is stored as the notice
// version so the basis travels with the record.
export const LEGACY_CONSENT_NOTICE = "legacy-written-consent-pre-platform";

export const grantLegacyAnalysisConsent = mutation({
  args: {
    sessionToken: v.string(),
    studentId: v.id("students"),
    attestation: v.string(), // what written consent is held, and where
  },
  handler: async (ctx, args) => {
    const { user } = await requireSuperadmin(ctx, args.sessionToken);
    const attestation = args.attestation.trim();
    if (attestation.length < 10) {
      return { ok: false, reason: "attestation_required" };
    }
    const student = await ctx.db.get(args.studentId);
    if (!student) return { ok: false, reason: "no_student" };

    // A child's account can never be analysed, by any route. Same rule as
    // analysisState — this must not become the back door around it.
    if (student.isMinor) return { ok: false, reason: "minor" };

    // Only the pre-platform roster. A student who signed up after the cutoff
    // was asked properly at checkout and must go through the paid flow.
    if (!isGrandfathered(student)) return { ok: false, reason: "not_legacy" };

    const existing = student.lessonAnalysis;
    // ⛔ Never resurrect a withdrawal. Someone who revoked has exercised a
    // right; a bulk legacy sweep must not quietly hand it back.
    if (existing?.revokedAt) return { ok: false, reason: "revoked" };
    // Already consented (paid or legacy) — leave the original record alone.
    if (existing) return { ok: true, reason: "already_granted", grantedAt: existing.grantedAt };

    const now = Date.now();
    await ctx.db.patch(student._id, {
      lessonAnalysis: { grantedAt: now, noticeVersion: LEGACY_CONSENT_NOTICE },
      updatedAt: now,
    });
    await ctx.db.insert("auditLog", {
      organizationId: student.organizationId,
      userId: user._id,
      action: "student.legacyAnalysisConsentRecorded",
      targetType: "student",
      targetId: student._id,
      details: JSON.stringify({ attestation, noticeVersion: LEGACY_CONSENT_NOTICE }),
      timestamp: now,
    });
    return { ok: true, reason: "recorded", grantedAt: now };
  },
});

// Granted by the student themselves, in the popup, and only where the free
// route actually applies — a post-cutoff account cannot consent its way past
// the paywall, and a minor's account cannot consent at all.
export const grantBajlaConsent = mutation({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const { student } = await requireStudent(ctx, args.sessionToken);
    if (student.isMinor) return { ok: false, reason: "minor" };
    if (!isGrandfathered(student)) return { ok: false, reason: "needs_purchase" };
    await ctx.db.patch(student._id, {
      bajlaConsent: { grantedAt: Date.now(), noticeVersion: ANALYSIS_NOTICE_VERSION },
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});

// Withdrawal, immediate, always available — the mirror of
// revokeAnalysisConsent. Neither has a Settings surface yet.
export const revokeBajlaConsent = mutation({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const { student } = await requireStudent(ctx, args.sessionToken);
    if (!student.bajlaConsent || student.bajlaConsent.revokedAt) return { ok: true };
    await ctx.db.patch(student._id, {
      bajlaConsent: { ...student.bajlaConsent, revokedAt: Date.now() },
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});

// ═════════════════════════════════════════════════════════════
// INTAKE — the two questions asked right after payment (2026-08-10)
// ═════════════════════════════════════════════════════════════
const STUDY_DURATIONS = ["none", "lt1", "1-2", "3-5", "5plus", "rusty"];
const SELF_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2", "unknown"];
// The three formats sold on the pricing page.
const LESSON_TYPES = ["one-to-one", "specialist", "group"];

export const myIntake = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const { student } = await requireStudent(ctx, args.sessionToken);
    return { submitted: !!student.intake, intake: student.intake ?? null };
  },
});

export const submitIntake = mutation({
  args: {
    sessionToken: v.string(),
    studyDuration: v.string(),
    selfLevel: v.string(),
    lessonType: v.string(),
  },
  handler: async (ctx, args) => {
    const { student } = await requireStudent(ctx, args.sessionToken);
    if (!STUDY_DURATIONS.includes(args.studyDuration)) return { ok: false, error: "Invalid duration" };
    if (!SELF_LEVELS.includes(args.selfLevel)) return { ok: false, error: "Invalid level" };
    if (!LESSON_TYPES.includes(args.lessonType)) return { ok: false, error: "Invalid lesson type" };

    const now = Date.now();
    const patch: any = {
      intake: {
        studyDuration: args.studyDuration,
        selfLevel: args.selfLevel,
        lessonType: args.lessonType,
        submittedAt: now,
      },
      updatedAt: now,
    };
    // `level` is the teacher's assessed band and drives lesson content, so a
    // self-report only fills it when it is still empty — a brand-new account.
    // It never overwrites an assessment, and "unknown" never writes at all:
    // the teacher sets it after the first lesson, which is what we promised.
    if (!student.level && args.selfLevel !== "unknown") patch.level = args.selfLevel;
    await ctx.db.patch(student._id, patch);
    return { ok: true };
  },
});
