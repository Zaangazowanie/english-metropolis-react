import { query, mutation, internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { collocationsField } from "./validators.js";
import { requireAdminOrPipelineKey } from "./authHelpers";

// ─── Transcript Analysis ───────────────────────────────────

export const getAnalysis = query({
  args: { analysisId: v.id("transcriptAnalyses") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.analysisId);
  },
});

export const getAnalysisByLesson = query({
  args: { lessonId: v.id("lessons") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("transcriptAnalyses")
      .withIndex("by_lesson", q => q.eq("lessonId", args.lessonId))
      .unique();
  },
});

export const getStudentAnalyses = query({
  args: {
    studentId: v.id("students"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("transcriptAnalyses")
      .withIndex("by_student", q => q.eq("studentId", args.studentId))
      .order("desc")
      .take(args.limit || 50)
  },
});

export const updateAnalysis = mutation({
  args: {
    sessionToken: v.optional(v.string()),
    apiKey: v.optional(v.string()),
    analysisId: v.id("transcriptAnalyses"),
    lessonSummary: v.optional(v.string()),
    strengths: v.optional(v.array(v.string())),
    improvements: v.optional(v.array(v.string())),
    keyErrors: v.optional(v.array(v.object({
      error: v.string(),
      correction: v.string(),
      category: v.string(),
    }))),
    personalDetails: v.optional(v.array(v.string())),
    practiceAdvice: v.optional(v.array(v.string())),
    cefrBand: v.optional(v.string()),
    overallScore: v.optional(v.number()),
    vocabularyRange: v.optional(v.number()),
    grammaticalAccuracy: v.optional(v.number()),
    fluencyAndCoherence: v.optional(v.number()),
    pronunciation: v.optional(v.number()),
    communicativeEffectiveness: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAdminOrPipelineKey(ctx, args.sessionToken, args.apiKey);
    const { sessionToken, apiKey, analysisId, ...updates } = args;
    const cleanUpdates = Object.fromEntries(
      Object.entries(updates).filter(([_, val]) => val !== undefined)
    );
    await ctx.db.patch(analysisId, cleanUpdates);
  },
});

export const createAnalysis = mutation({
  args: {
    sessionToken: v.optional(v.string()),
    apiKey: v.optional(v.string()),
    studentId: v.id("students"),
    lessonId: v.id("lessons"),
    vocabularyRange: v.number(),
    grammaticalAccuracy: v.number(),
    fluencyAndCoherence: v.number(),
    pronunciation: v.number(),
    communicativeEffectiveness: v.number(),
    overallScore: v.number(),
    cefrBand: v.string(),
    lessonSummary: v.string(),
    strengths: v.array(v.string()),
    improvements: v.array(v.string()),
    keyErrors: v.array(v.object({
      error: v.string(),
      correction: v.string(),
      category: v.string(),
    })),
    personalDetails: v.array(v.string()),
    practiceAdvice: v.array(v.string()),
    previousAnalysisId: v.optional(v.id("transcriptAnalyses")),
  },
  handler: async (ctx, args) => {
    await requireAdminOrPipelineKey(ctx, args.sessionToken, args.apiKey);
    const { sessionToken, apiKey, ...rest } = args;
    return await ctx.db.insert("transcriptAnalyses", {
      ...rest,
      createdAt: Date.now(),
    });
  },
});

export const getProgressChart = query({
  args: { studentId: v.id("students") },
  handler: async (ctx, args) => {
    const analyses = await ctx.db
      .query("transcriptAnalyses")
      .withIndex("by_student_date", q => q.eq("studentId", args.studentId))
      .order("asc")
      .collect();

    const lessons = await ctx.db
      .query("lessons")
      .withIndex("by_student", q => q.eq("studentId", args.studentId))
      .collect();

    const lessonMap = new Map(lessons.map(l => [l._id, l]));

    return analyses.map(a => {
      const lesson = lessonMap.get(a.lessonId);
      return {
        date: lesson?.date || "unknown",
        title: lesson?.title || "Unknown Lesson",
        vocabularyRange: a.vocabularyRange,
        grammaticalAccuracy: a.grammaticalAccuracy,
        fluencyAndCoherence: a.fluencyAndCoherence,
        pronunciation: a.pronunciation,
        communicativeEffectiveness: a.communicativeEffectiveness,
        overallScore: a.overallScore,
        cefrBand: a.cefrBand,
      };
    });
  },
});

// ─── Quiz Results ──────────────────────────────────────────

export const getQuizHistory = query({
  args: {
    studentId: v.id("students"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("quizResults")
      .withIndex("by_student_date", q => q.eq("studentId", args.studentId))
      .order("desc")
      .take(args.limit || 50)
  },
});

export const getQuizResultsForLesson = query({
  args: { lessonId: v.id("lessons") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("quizResults")
      .withIndex("by_lesson", q => q.eq("lessonId", args.lessonId))
      .collect();
  },
});

export const saveQuizResult = mutation({
  args: {
    studentId: v.id("students"),
    lessonId: v.optional(v.id("lessons")),
    quizType: v.string(),
    totalQuestions: v.number(),
    correctAnswers: v.number(),
    accuracy: v.number(),
    timeSpent: v.optional(v.number()),
    keywordResults: v.array(v.object({
      keywordId: v.id("keywords"),
      word: v.string(),
      correct: v.boolean(),
    })),
  },
  handler: async (ctx, args) => {
    const resultId = await ctx.db.insert("quizResults", {
      ...args,
      completedAt: Date.now(),
    });

    // Update keyword mastery scores
    for (const kr of args.keywordResults) {
      const keyword = await ctx.db.get(kr.keywordId);
      if (keyword) {
        const newReviewCount = (keyword.reviewCount || 0) + 1;
        const scoreIncrement = kr.correct ? 100 : 0;
        const newMastery = Math.round(
          (keyword.mastery || 0) * 0.7 + scoreIncrement * 0.3
        );
        await ctx.db.patch(kr.keywordId, {
          mastery: newMastery,
          reviewCount: newReviewCount,
        });
      }
    }

    return resultId;
  },
});

// ─── YouGlish Cache ────────────────────────────────────────

export const getYouglishResults = query({
  args: { keyword: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("youglishIndex")
      .withIndex("by_keyword", q => q.eq("keyword", args.keyword))
      .first();
  },
});

export const bulkImportYouglish = mutation({
  args: {
    sessionToken: v.optional(v.string()),
    apiKey: v.optional(v.string()),
    entries: v.array(v.object({
      keyword: v.string(),
      results: v.array(v.object({
        videoId: v.string(),
        start: v.number(),
        caption: v.string(),
      })),
      scrapeStatus: v.string(),
    })),
  },
  handler: async (ctx, args) => {
    await requireAdminOrPipelineKey(ctx, args.sessionToken, args.apiKey);
    let imported = 0;
    for (const entry of args.entries) {
      const existing = await ctx.db
        .query("youglishIndex")
        .withIndex("by_keyword", q => q.eq("keyword", entry.keyword))
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, {
          results: entry.results,
          scrapeStatus: entry.scrapeStatus,
          lastScraped: Date.now(),
        });
      } else {
        await ctx.db.insert("youglishIndex", {
          keyword: entry.keyword,
          results: entry.results,
          lastScraped: Date.now(),
          scrapeStatus: entry.scrapeStatus,
        });
      }
      imported++;
    }
    return imported;
  },
});

// ─── Keyword Bank ──────────────────────────────────────────

export const listKeywordBank = query({
  args: {
    studentId: v.optional(v.id("students")),
    unusedOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    if (args.studentId) {
      const results = await ctx.db.query("keywordBank").withIndex("by_student", q => q.eq("studentId", args.studentId!)).collect();
      return args.unusedOnly ? results.filter(k => !k.used) : results;
    }
    if (args.unusedOnly) {
      return await ctx.db.query("keywordBank").withIndex("by_used", q => q.eq("used", false)).collect();
    }
    return await ctx.db.query("keywordBank").collect();
  },
});

export const addKeywordToBank = mutation({
  args: {
    sessionToken: v.optional(v.string()),
    apiKey: v.optional(v.string()),
    studentId: v.optional(v.id("students")),
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
    source: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdminOrPipelineKey(ctx, args.sessionToken, args.apiKey);
    const { sessionToken, apiKey, ...rest } = args;
    return await ctx.db.insert("keywordBank", {
      ...rest,
      used: false,
      createdAt: Date.now(),
    });
  },
});

export const markKeywordBankUsed = mutation({
  args: {
    sessionToken: v.optional(v.string()),
    apiKey: v.optional(v.string()),
    keywordBankId: v.id("keywordBank"),
  },
  handler: async (ctx, args) => {
    await requireAdminOrPipelineKey(ctx, args.sessionToken, args.apiKey);
    await ctx.db.patch(args.keywordBankId, { used: true });
  },
});

// ─── Per-student refinement pipeline ──────────────────────────
// Analyses created by commitIngestionJobFanout are baseline copies of
// the group-level staged analysis, flagged `needsRefinement=true`.
// A VPS-side streaming worker picks these up, builds a
// student-specific prompt, and overwrites the analysis via
// overwriteAnalysisForRefinement.

// Paginated counter — frontend/CLI calls this in a loop for a given
// bucket ("pending" = needsRefinement === true; "refined" = false)
// and sums `count` across pages until isDone. Uses the narrow
// `by_needs_refinement` index so each page stays well under the
// 16MB read limit even at 200k analyses.
export const refinementProgressPage = query({
  args: {
    bucket: v.union(v.literal("pending"), v.literal("refined")),
    cursor: v.union(v.string(), v.null()),
    numItems: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const value = args.bucket === "refined" ? false : true;
    const page = await ctx.db
      .query("transcriptAnalyses")
      .withIndex("by_needs_refinement", q => q.eq("needsRefinement", value))
      .paginate({ cursor: args.cursor, numItems: args.numItems ?? 500 });
    return {
      count: page.page.length,
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});

// Superadmin panel aggregator: fetches the first page of each bucket
// with a small numItems so we can display "~N pending, ~M refined"
// without bursting the read limit. For an exact total, the caller
// should loop refinementProgressPage.
export const refinementProgress = query({
  args: {},
  handler: async (ctx) => {
    // We can't paginate twice in one query, so we grab only the FIRST
    // page of each bucket (capped) — this gives a UI-friendly estimate
    // that is exact for the refined bucket (which is small early on)
    // and an "at-least-N" floor on the pending bucket. Client code
    // that needs exact totals should use refinementProgressPage.
    const MAX = 200;
    const pendingPage = await ctx.db
      .query("transcriptAnalyses")
      .withIndex("by_needs_refinement", q => q.eq("needsRefinement", true))
      .take(MAX);
    const refinedPage = await ctx.db
      .query("transcriptAnalyses")
      .withIndex("by_needs_refinement", q => q.eq("needsRefinement", false))
      .take(MAX);
    return {
      pending: pendingPage.length,
      pendingAtLeast: pendingPage.length === MAX,
      refined: refinedPage.length,
      refinedAtLeast: refinedPage.length === MAX,
    };
  },
});

// Internal: list analyses awaiting refinement with the context a VPS
// worker needs (student name, transcript storage id, date).
export const listPendingRefinements = internalQuery({
  args: {
    cursor: v.union(v.string(), v.null()),
    numItems: v.number(),
  },
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("transcriptAnalyses")
      .withIndex("by_needs_refinement", q => q.eq("needsRefinement", true))
      .paginate({ cursor: args.cursor, numItems: args.numItems });
    const enriched = await Promise.all(
      result.page.map(async (a) => {
        const student = await ctx.db.get(a.studentId);
        const lesson = await ctx.db.get(a.lessonId);
        const transcriptUrl = lesson?.transcriptStorageId
          ? await ctx.storage.getUrl(lesson.transcriptStorageId)
          : null;
        return {
          analysisId: a._id,
          studentId: a.studentId,
          studentName: student?.name ?? "Unknown",
          lessonId: a.lessonId,
          lessonDate: lesson?.date ?? "",
          transcriptUrl,
          currentCefrBand: a.cefrBand,
          currentOverallScore: a.overallScore,
        };
      }),
    );
    return {
      page: enriched,
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    };
  },
});

// Internal: overwrite an analysis with refined, student-specific data.
// Clears needsRefinement and stamps refinedAt/refinedBy.
export const overwriteAnalysisForRefinement = internalMutation({
  args: {
    analysisId: v.id("transcriptAnalyses"),
    refinedBy: v.string(),
    vocabularyRange: v.number(),
    grammaticalAccuracy: v.number(),
    fluencyAndCoherence: v.number(),
    pronunciation: v.number(),
    communicativeEffectiveness: v.number(),
    overallScore: v.number(),
    cefrBand: v.string(),
    lessonSummary: v.string(),
    strengths: v.array(v.string()),
    improvements: v.array(v.string()),
    keyErrors: v.array(v.object({
      error: v.string(),
      correction: v.string(),
      category: v.string(),
    })),
    personalDetails: v.array(v.string()),
    practiceAdvice: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const { analysisId, refinedBy, ...fields } = args;
    await ctx.db.patch(analysisId, {
      ...fields,
      needsRefinement: false,
      refinedAt: Date.now(),
      refinedBy,
    });
    return { ok: true };
  },
});
