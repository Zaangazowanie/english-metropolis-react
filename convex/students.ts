import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { collocationsField } from "./validators.js";

// ═══════════════════════════════════════════════════════════
// ORGANIZATIONS
// ═══════════════════════════════════════════════════════════

export const createOrganization = mutation({
  args: {
    name: v.string(),
    slug: v.string(),
    type: v.string(),                   // "school", "company", "private_practice", "platform"
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("organizations", {
      ...args,
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
  args: { orgId: v.id("organizations") },
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
  args: { type: v.optional(v.string()), status: v.optional(v.string()) },
  handler: async (ctx, args) => {
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
// GROUPS
// ═══════════════════════════════════════════════════════════

export const createGroup = mutation({
  args: {
    organizationId: v.id("organizations"),
    name: v.string(),
    slug: v.string(),
    type: v.string(),                   // "class", "department", "cohort", "private"
    level: v.optional(v.string()),
    teacherIds: v.array(v.id("users")),
    studentIds: v.array(v.id("students")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("groups", {
      ...args,
      description: undefined,
      schedule: undefined,
      status: "active",
      settings: undefined,
      createdAt: now,
      updatedAt: now,
    });
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
    email: v.string(),
    name: v.string(),
    password: v.optional(v.string()),
    role: v.string(),                   // "super_admin", "org_admin", "teacher", "assistant"
    organizationId: v.optional(v.id("organizations")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("users", {
      ...args,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const getUserByEmail = query({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db.query("users").withIndex("by_email", q => q.eq("email", args.email)).unique();
  },
});

export const listOrgUsers = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    return await ctx.db.query("users").withIndex("by_organization", q => q.eq("organizationId", args.organizationId)).collect();
  },
});

// ═══════════════════════════════════════════════════════════
// STUDENTS
// ═══════════════════════════════════════════════════════════

export const listStudents = query({
  args: {
    organizationId: v.optional(v.id("organizations")),
    activeOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    if (args.organizationId) {
      const students = await ctx.db.query("students").withIndex("by_organization", q => q.eq("organizationId", args.organizationId)).collect();
      return args.activeOnly ? students.filter(s => s.status === "active") : students;
    }
    if (args.activeOnly) {
      return await ctx.db.query("students").withIndex("by_status", q => q.eq("status", "active")).collect();
    }
    return await ctx.db.query("students").collect();
  },
});

export const getStudentBySlug = query({
  args: { slug: v.string() },
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
    organizationId: v.optional(v.id("organizations")),
    name: v.string(),
    slug: v.string(),
    email: v.optional(v.string()),
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
    const now = Date.now();
    return await ctx.db.insert("students", {
      ...args,
      status: "active",
      enrolledAt: now,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateStudent = mutation({
  args: {
    studentId: v.id("students"),
    name: v.optional(v.string()),
    slug: v.optional(v.string()),
    level: v.optional(v.string()),
    targetLevel: v.optional(v.string()),
    status: v.optional(v.string()),
    notes: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    groupId: v.optional(v.id("groups")),
    primaryTeacherId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const { studentId, ...updates } = args;
    const cleanUpdates = Object.fromEntries(
      Object.entries(updates).filter(([_, val]) => val !== undefined)
    );
    await ctx.db.patch(studentId, { ...cleanUpdates, updatedAt: Date.now() });
  },
});

// ═══════════════════════════════════════════════════════════
// LESSONS
// ═══════════════════════════════════════════════════════════

export const listLessons = query({
  args: {
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
    order: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("lessons", { ...args, createdAt: now, updatedAt: now });
  },
});

export const updateLesson = mutation({
  args: {
    lessonId: v.id("lessons"),
    title: v.optional(v.string()),
    topics: v.optional(v.array(v.string())),
    summary: v.optional(v.string()),
    duration: v.optional(v.number()),
    difficulty: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { lessonId, ...updates } = args;
    const cleanUpdates = Object.fromEntries(
      Object.entries(updates).filter(([_, val]) => val !== undefined)
    );
    await ctx.db.patch(lessonId, { ...cleanUpdates, updatedAt: Date.now() });
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
        .take(args.limit || 500);
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

export const createKeyword = mutation({
  args: {
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
    return await ctx.db.insert("keywords", {
      ...args,
      mastery: 0,
      reviewCount: 0,
      createdAt: Date.now(),
    });
  },
});

export const bulkCreateKeywords = mutation({
  args: {
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
    keywordId: v.id("keywords"),
    collocations: collocationsField,
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.keywordId, {
      collocations: args.collocations,
    });
  },
});

export const bulkUpdateCollocations = mutation({
  args: {
    updates: v.array(v.object({
      keywordId: v.id("keywords"),
      collocations: collocationsField,
    })),
  },
  handler: async (ctx, args) => {
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
    keywordId: v.id("keywords"),
    correct: v.boolean(),
  },
  handler: async (ctx, args) => {
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
    keywordId: v.id("keywords"),
    spellingVariant: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { keywordId, ...fields } = args;
    const patch: Record<string, unknown> = {};
    if (fields.spellingVariant !== undefined) patch.spellingVariant = fields.spellingVariant;
    await ctx.db.patch(keywordId, patch);
  },
});

// ═══════════════════════════════════════════════════════════
// KEYWORD DELETION
// ═══════════════════════════════════════════════════════════

export const deleteKeyword = mutation({
  args: { keywordId: v.id("keywords") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.keywordId);
  },
});

export const bulkDeleteKeywords = mutation({
  args: { keywordIds: v.array(v.id("keywords")) },
  handler: async (ctx, args) => {
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
  args: { studentSlug: v.string() },
  handler: async (ctx, args) => {
    const student = await ctx.db
      .query("students")
      .withIndex("by_slug", q => q.eq("slug", args.studentSlug))
      .unique();

    if (!student) return null;

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
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const org = await ctx.db.get(args.organizationId);
    if (!org) return null;

    const students = await ctx.db
      .query("students")
      .withIndex("by_organization", q => q.eq("organizationId", args.organizationId))
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
      .withIndex("by_organization", q => q.eq("organizationId", args.organizationId))
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
  args: {},
  handler: async (ctx) => {
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

// Legacy stats (backward compatible)
export const getGlobalStats = query({
  args: {},
  handler: async (ctx) => {
    const students = await ctx.db.query("students").collect();
    const activeStudents = students.filter(s => s.status === "active").length;
    const allLessons = await ctx.db.query("lessons").collect();
    const allKeywords = await ctx.db.query("keywords").collect();

    const keywordsPerStudent: Record<string, number> = {};
    for (const kw of allKeywords) {
      const student = students.find(s => s._id === kw.studentId);
      if (student) {
        keywordsPerStudent[student.slug] = (keywordsPerStudent[student.slug] || 0) + 1;
      }
    }

    return {
      totalStudents: students.length,
      activeStudents,
      totalLessons: allLessons.length,
      totalKeywords: allKeywords.length,
      keywordsPerStudent,
    };
  },
});
