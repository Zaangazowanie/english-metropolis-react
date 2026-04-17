import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { collocationsField } from "./validators.js";

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
  },
  handler: async (ctx, args) => {
    const { analysisId, ...updates } = args;
    const cleanUpdates = Object.fromEntries(
      Object.entries(updates).filter(([_, val]) => val !== undefined)
    );
    await ctx.db.patch(analysisId, cleanUpdates);
  },
});

export const createAnalysis = mutation({
  args: {
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
    return await ctx.db.insert("transcriptAnalyses", {
      ...args,
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
    return await ctx.db.insert("keywordBank", {
      ...args,
      used: false,
      createdAt: Date.now(),
    });
  },
});

export const markKeywordBankUsed = mutation({
  args: {
    keywordBankId: v.id("keywordBank"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.keywordBankId, { used: true });
  },
});
