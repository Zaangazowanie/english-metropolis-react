// ─────────────────────────────────────────────────────────────────────
// Ingestion pipeline — transcript + notes → staged analysis + keywords
// ─────────────────────────────────────────────────────────────────────
// Flow:
//   1. createIngestionJob (mutation) — frontend or watcher writes raw
//      inputs into the ingestionJobs table with status=queued.
//   2. processIngestionJob (action) — scheduled by the mutation. Reads
//      the raw inputs, calls Claude twice (analysis + keywords), writes
//      the staged output and flips status to awaiting_review.
//   3. Review UI loads the job, the superadmin edits fields inline,
//      then calls commitIngestionJob to move staged data into the
//      live lessons / transcriptAnalyses / keywords tables.

import { v } from "convex/values";
import {
  mutation,
  query,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { PROMPT_VERSION, MODEL_ANALYSIS, MODEL_KEYWORDS } from "./ingestionPrompts";
import { requireSuperadmin } from "./authHelpers";

// ─────────────────────────────────────────────────────────────────────
// Validators (reused from the schema so query/mutation args line up)
// ─────────────────────────────────────────────────────────────────────

const stagedAnalysisValidator = v.object({
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
});

const collocationsValidator = v.optional(v.object({
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
}));

const stagedKeywordValidator = v.object({
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
  wordType: v.optional(v.string()),
  difficulty: v.optional(v.string()),
  collocations: collocationsValidator,
});

// ─────────────────────────────────────────────────────────────────────
// File upload helpers
// ─────────────────────────────────────────────────────────────────────

// Frontend calls this to get a one-time upload URL for a file. The
// returned URL accepts a PUT with the file bytes; Convex responds
// with a storageId which can then be stored on an ingestionJob row.
export const generateUploadUrl = mutation({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    await requireSuperadmin(ctx, args.sessionToken);
    return await ctx.storage.generateUploadUrl();
  },
});

// ─────────────────────────────────────────────────────────────────────
// Create a new ingestion job
// ─────────────────────────────────────────────────────────────────────

export const createIngestionJob = mutation({
  args: {
    sessionToken: v.string(),
    sourceKind: v.string(),
    organizationId: v.optional(v.id("organizations")),
    transcriptStorageId: v.optional(v.id("_storage")),
    transcriptText: v.optional(v.string()),
    notesStorageId: v.optional(v.id("_storage")),
    notesText: v.optional(v.string()),
    sourceFilename: v.optional(v.string()),
    detectedStudentId: v.optional(v.id("students")),
    detectedDate: v.optional(v.string()),
    detectedTitle: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await requireSuperadmin(ctx, args.sessionToken);

    // Resolve organization from detected student if not supplied.
    let organizationId = args.organizationId;
    if (!organizationId && args.detectedStudentId) {
      const student = await ctx.db.get(args.detectedStudentId);
      organizationId = student?.organizationId;
    }

    let detectedStudentSlug: string | undefined;
    if (args.detectedStudentId) {
      const student = await ctx.db.get(args.detectedStudentId);
      detectedStudentSlug = student?.slug;
    }

    const jobId = await ctx.db.insert("ingestionJobs", {
      organizationId,
      createdByUserId: user._id,
      status: "queued",
      sourceKind: args.sourceKind,
      transcriptStorageId: args.transcriptStorageId,
      transcriptText: args.transcriptText,
      notesStorageId: args.notesStorageId,
      notesText: args.notesText,
      sourceFilename: args.sourceFilename,
      detectedStudentId: args.detectedStudentId,
      detectedStudentSlug,
      detectedDate: args.detectedDate,
      detectedTitle: args.detectedTitle,
      promptVersion: PROMPT_VERSION,
      retryCount: 0,
      createdAt: Date.now(),
    });

    // Kick off processing in the background.
    await ctx.scheduler.runAfter(
      0,
      internal.ingestionProcess.processJobInternal,
      { jobId },
    );

    // Audit log.
    await ctx.db.insert("auditLog", {
      organizationId,
      userId: user._id,
      action: "ingestionJob.created",
      targetType: "ingestionJob",
      targetId: jobId,
      details: JSON.stringify({
        sourceKind: args.sourceKind,
        detectedStudentId: args.detectedStudentId,
        detectedDate: args.detectedDate,
      }),
      timestamp: Date.now(),
    });

    return { jobId };
  },
});

// ─────────────────────────────────────────────────────────────────────
// Internal helpers used by the processing action
// ─────────────────────────────────────────────────────────────────────

// System-initiated ingestion job (from the PDF watcher or the Tactiq
// Drive bridge). No acting user — the job is attributed to the
// automation pipeline and a superadmin must later commit it manually.
export const createSystemIngestionJob = internalMutation({
  args: {
    sourceKind: v.string(),
    organizationId: v.optional(v.id("organizations")),
    transcriptStorageId: v.optional(v.id("_storage")),
    transcriptText: v.optional(v.string()),
    notesStorageId: v.optional(v.id("_storage")),
    sourceFilename: v.optional(v.string()),
    detectedStudentId: v.optional(v.id("students")),
    detectedDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let detectedStudentSlug: string | undefined;
    if (args.detectedStudentId) {
      const s = await ctx.db.get(args.detectedStudentId);
      detectedStudentSlug = s?.slug;
    }

    const jobId = await ctx.db.insert("ingestionJobs", {
      organizationId: args.organizationId,
      createdByUserId: undefined,
      status: "queued",
      sourceKind: args.sourceKind,
      transcriptStorageId: args.transcriptStorageId,
      transcriptText: args.transcriptText,
      notesStorageId: args.notesStorageId,
      sourceFilename: args.sourceFilename,
      detectedStudentId: args.detectedStudentId,
      detectedStudentSlug,
      detectedDate: args.detectedDate,
      promptVersion: PROMPT_VERSION,
      retryCount: 0,
      createdAt: Date.now(),
    });

    // Only schedule processing if we have both transcript and (for
    // best results) a target student. Otherwise leave the job queued
    // until a superadmin assigns the missing pieces.
    const hasTranscript =
      !!args.transcriptText || !!args.transcriptStorageId;
    if (hasTranscript && args.detectedStudentId) {
      await ctx.scheduler.runAfter(
        0,
        internal.ingestionProcess.processJobInternal,
        { jobId },
      );
    }

    await ctx.db.insert("auditLog", {
      organizationId: args.organizationId,
      action: "ingestionJob.systemCreated",
      targetType: "ingestionJob",
      targetId: jobId,
      details: JSON.stringify({
        sourceKind: args.sourceKind,
        sourceFilename: args.sourceFilename,
        hasTranscript,
        hasNotes: !!args.notesStorageId,
      }),
      timestamp: Date.now(),
    });

    return { jobId };
  },
});

export const getOrgBySlugInternal = internalQuery({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("organizations")
      .withIndex("by_slug", q => q.eq("slug", args.slug))
      .unique();
  },
});

export const getStudentBySlugInternal = internalQuery({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("students")
      .withIndex("by_slug", q => q.eq("slug", args.slug))
      .unique();
  },
});

export const markProcessing = internalMutation({
  args: { jobId: v.id("ingestionJobs") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.jobId, {
      status: "processing",
      processedAt: Date.now(),
    });
  },
});

export const markFailed = internalMutation({
  args: { jobId: v.id("ingestionJobs"), error: v.string() },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) return;
    await ctx.db.patch(args.jobId, {
      status: "failed",
      error: args.error,
      retryCount: (job.retryCount ?? 0) + 1,
    });
  },
});

export const writeStagedOutput = internalMutation({
  args: {
    jobId: v.id("ingestionJobs"),
    stagedAnalysis: stagedAnalysisValidator,
    stagedKeywords: v.array(stagedKeywordValidator),
    detectedDate: v.optional(v.string()),
    detectedTitle: v.optional(v.string()),
    detectedTopics: v.optional(v.array(v.string())),
    inputTokens: v.optional(v.number()),
    outputTokens: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.jobId, {
      stagedAnalysis: args.stagedAnalysis,
      stagedKeywords: args.stagedKeywords,
      detectedDate: args.detectedDate,
      detectedTitle: args.detectedTitle,
      detectedTopics: args.detectedTopics,
      inputTokens: args.inputTokens,
      outputTokens: args.outputTokens,
      status: "awaiting_review",
      modelUsed: `${MODEL_ANALYSIS} + ${MODEL_KEYWORDS}`,
      processedAt: Date.now(),
    });
  },
});

export const loadJobForProcessing = internalQuery({
  args: { jobId: v.id("ingestionJobs") },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) return null;
    // Also resolve the transcript + notes storage URLs so the action
    // can fetch them without needing filesystem access.
    const transcriptUrl = job.transcriptStorageId
      ? await ctx.storage.getUrl(job.transcriptStorageId)
      : null;
    const notesUrl = job.notesStorageId
      ? await ctx.storage.getUrl(job.notesStorageId)
      : null;
    const student = job.detectedStudentId
      ? await ctx.db.get(job.detectedStudentId)
      : null;
    return {
      job,
      transcriptUrl,
      notesUrl,
      student,
    };
  },
});

// The actual Claude-calling action lives in ingestionProcess.ts which
// opts into the Node runtime via "use node"; — required for the
// @anthropic-ai/sdk dependency. See that file for processJobInternal.

// Public wrapper to retry a failed job from the UI.
export const retryIngestionJob = mutation({
  args: { sessionToken: v.string(), jobId: v.id("ingestionJobs") },
  handler: async (ctx, args) => {
    await requireSuperadmin(ctx, args.sessionToken);
    await ctx.db.patch(args.jobId, { status: "queued", error: undefined });
    await ctx.scheduler.runAfter(
      0,
      internal.ingestionProcess.processJobInternal,
      { jobId: args.jobId },
    );
    return { ok: true };
  },
});

// ─────────────────────────────────────────────────────────────────────
// Staged-output edits (used by the review UI for inline tweaks)
// ─────────────────────────────────────────────────────────────────────

export const updateStagedAnalysis = mutation({
  args: {
    sessionToken: v.string(),
    jobId: v.id("ingestionJobs"),
    stagedAnalysis: stagedAnalysisValidator,
  },
  handler: async (ctx, args) => {
    await requireSuperadmin(ctx, args.sessionToken);
    await ctx.db.patch(args.jobId, {
      stagedAnalysis: args.stagedAnalysis,
    });
    return { ok: true };
  },
});

export const updateStagedKeywords = mutation({
  args: {
    sessionToken: v.string(),
    jobId: v.id("ingestionJobs"),
    stagedKeywords: v.array(stagedKeywordValidator),
  },
  handler: async (ctx, args) => {
    await requireSuperadmin(ctx, args.sessionToken);
    await ctx.db.patch(args.jobId, {
      stagedKeywords: args.stagedKeywords,
    });
    return { ok: true };
  },
});

// Bulk replace a student's analyses with pre-computed rich analyses.
// For each input, upsert a lesson row by date, delete any existing analysis
// on that lesson, and insert the new analysis. Existing keywords are preserved
// (they can be re-generated separately).
export const bulkReplaceStudentAnalyses = mutation({
  args: {
    sessionToken: v.string(),
    studentId: v.id("students"),
    items: v.array(v.object({
      date: v.string(),
      title: v.optional(v.string()),
      topics: v.optional(v.array(v.string())),
      analysis: v.any(),
    })),
  },
  handler: async (ctx, args) => {
    await requireSuperadmin(ctx, args.sessionToken);
    const student = await ctx.db.get(args.studentId);
    if (!student) throw new Error("Student not found");

    const existingLessons = await ctx.db
      .query("lessons")
      .withIndex("by_student", q => q.eq("studentId", args.studentId))
      .collect();
    const byDate = new Map<string, any>();
    for (const l of existingLessons) byDate.set(l.date, l);
    let maxOrder = existingLessons.reduce((m, l) => l.order > m ? l.order : m, 0);

    const results: any[] = [];
    const now = Date.now();

    for (const item of args.items) {
      let lesson = byDate.get(item.date);
      if (!lesson) {
        maxOrder += 1;
        const lid = await ctx.db.insert("lessons", {
          organizationId: student.organizationId,
          studentId: args.studentId,
          date: item.date,
          title: item.title || `Lesson ${maxOrder}`,
          topics: item.topics ?? [],
          order: maxOrder,
          status: "completed",
          createdAt: now,
          updatedAt: now,
        });
        lesson = await ctx.db.get(lid);
        byDate.set(item.date, lesson);
      } else {
        // Optionally refresh title + topics
        await ctx.db.patch(lesson._id, {
          title: item.title || lesson.title,
          topics: item.topics ?? lesson.topics,
          status: "completed",
          updatedAt: now,
        });
      }
      // Delete old analyses for this lesson
      const prev = await ctx.db
        .query("transcriptAnalyses")
        .withIndex("by_student_date", q => q.eq("studentId", args.studentId))
        .collect();
      for (const p of prev) {
        if (p.lessonId === lesson._id) await ctx.db.delete(p._id);
      }
      // Insert new analysis
      const a = item.analysis;
      const aid = await ctx.db.insert("transcriptAnalyses", {
        organizationId: student.organizationId,
        studentId: args.studentId,
        lessonId: lesson._id,
        vocabularyRange: a.vocabularyRange,
        grammaticalAccuracy: a.grammaticalAccuracy,
        fluencyAndCoherence: a.fluencyAndCoherence,
        pronunciation: a.pronunciation,
        communicativeEffectiveness: a.communicativeEffectiveness,
        overallScore: a.overallScore,
        cefrBand: a.cefrBand,
        lessonSummary: a.lessonSummary,
        strengths: a.strengths,
        improvements: a.improvements,
        keyErrors: a.keyErrors,
        personalDetails: a.personalDetails,
        practiceAdvice: a.practiceAdvice,
        createdAt: now,
      });
      results.push({ date: item.date, lessonId: lesson._id, analysisId: aid });
    }
    return { replaced: results.length, results };
  },
});

export const forceAwaitingReview = mutation({
  args: { sessionToken: v.string(), jobId: v.id("ingestionJobs") },
  handler: async (ctx, args) => {
    await requireSuperadmin(ctx, args.sessionToken);
    const job = await ctx.db.get(args.jobId);
    if (!job) throw new Error("Job not found");
    if (!job.stagedAnalysis) throw new Error("stagedAnalysis missing — run processing first");
    await ctx.db.patch(args.jobId, { status: "awaiting_review", error: undefined });
    return { ok: true };
  },
});

export const updateJobMetadata = mutation({
  args: {
    sessionToken: v.string(),
    jobId: v.id("ingestionJobs"),
    detectedStudentId: v.optional(v.id("students")),
    detectedDate: v.optional(v.string()),
    detectedTitle: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireSuperadmin(ctx, args.sessionToken);
    const patch: any = {};
    if (args.detectedStudentId !== undefined) {
      patch.detectedStudentId = args.detectedStudentId;
      const student = await ctx.db.get(args.detectedStudentId);
      patch.detectedStudentSlug = student?.slug;
      patch.organizationId = student?.organizationId;
    }
    if (args.detectedDate !== undefined) patch.detectedDate = args.detectedDate;
    if (args.detectedTitle !== undefined) patch.detectedTitle = args.detectedTitle;
    await ctx.db.patch(args.jobId, patch);
    return { ok: true };
  },
});

// ─────────────────────────────────────────────────────────────────────
// Commit: copy staged data into the live lessons / analyses / keywords
// ─────────────────────────────────────────────────────────────────────

export const commitIngestionJob = mutation({
  args: {
    sessionToken: v.string(),
    jobId: v.id("ingestionJobs"),
  },
  handler: async (ctx, args) => {
    const { user } = await requireSuperadmin(ctx, args.sessionToken);
    const job = await ctx.db.get(args.jobId);
    if (!job) throw new Error("Job not found");
    if (job.status !== "awaiting_review") {
      throw new Error(`Cannot commit a job in status=${job.status}`);
    }
    if (!job.detectedStudentId) {
      throw new Error("detectedStudentId is required before commit");
    }
    if (!job.detectedDate) {
      throw new Error("detectedDate is required before commit");
    }
    if (!job.stagedAnalysis) {
      throw new Error("stagedAnalysis missing — cannot commit");
    }

    // Figure out the next lesson order for this student.
    const existingLessons = await ctx.db
      .query("lessons")
      .withIndex("by_student", q => q.eq("studentId", job.detectedStudentId!))
      .collect();
    const maxOrder = existingLessons.reduce(
      (m, l) => (l.order > m ? l.order : m),
      0,
    );

    // Create the lesson row.
    const lessonId = await ctx.db.insert("lessons", {
      organizationId: job.organizationId,
      studentId: job.detectedStudentId,
      date: job.detectedDate,
      title: job.detectedTitle || `Lesson ${maxOrder + 1}`,
      topics: job.detectedTopics ?? [],
      transcriptStorageId: job.transcriptStorageId,
      transcriptFile: job.sourceFilename,
      order: maxOrder + 1,
      status: "completed",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Find the student's previous analysis for the progress chain.
    const prevAnalysis = await ctx.db
      .query("transcriptAnalyses")
      .withIndex("by_student_date", q =>
        q.eq("studentId", job.detectedStudentId!),
      )
      .order("desc")
      .first();

    const analysisId = await ctx.db.insert("transcriptAnalyses", {
      organizationId: job.organizationId,
      studentId: job.detectedStudentId,
      lessonId,
      ...job.stagedAnalysis,
      previousAnalysisId: prevAnalysis?._id,
      createdAt: Date.now(),
    });

    // Insert keywords.
    const keywordIds: Id<"keywords">[] = [];
    const now = Date.now();
    for (const kw of job.stagedKeywords ?? []) {
      const id = await ctx.db.insert("keywords", {
        organizationId: job.organizationId,
        lessonId,
        studentId: job.detectedStudentId,
        word: kw.word,
        translation: kw.translation,
        definitionEn: kw.definitionEn,
        definitionPl: kw.definitionPl,
        exampleEn: kw.exampleEn,
        examplePl: kw.examplePl,
        ipa: kw.ipa,
        stressUK: kw.stressUK,
        stressUS: kw.stressUS,
        topics: kw.topics,
        wordType: kw.wordType,
        difficulty: kw.difficulty,
        collocations: kw.collocations,
        mastery: 0,
        reviewCount: 0,
        createdAt: now,
      });
      keywordIds.push(id);
    }

    await ctx.db.patch(args.jobId, {
      status: "committed",
      committedLessonId: lessonId,
      committedAnalysisId: analysisId,
      committedKeywordIds: keywordIds,
      committedAt: now,
    });

    await ctx.db.insert("auditLog", {
      organizationId: job.organizationId,
      userId: user._id,
      action: "ingestionJob.committed",
      targetType: "lesson",
      targetId: lessonId,
      details: JSON.stringify({
        jobId: args.jobId,
        studentId: job.detectedStudentId,
        keywordCount: keywordIds.length,
        overallScore: job.stagedAnalysis.overallScore,
      }),
      timestamp: now,
    });

    return { lessonId, analysisId, keywordIds };
  },
});

// Rollback a committed job: deletes the created lesson / analysis /
// keywords and moves the job back to awaiting_review.
export const rollbackCommittedJob = mutation({
  args: { sessionToken: v.string(), jobId: v.id("ingestionJobs") },
  handler: async (ctx, args) => {
    const { user } = await requireSuperadmin(ctx, args.sessionToken);
    const job = await ctx.db.get(args.jobId);
    if (!job || job.status !== "committed") {
      throw new Error("Only committed jobs can be rolled back");
    }
    if (job.committedAnalysisId) await ctx.db.delete(job.committedAnalysisId);
    if (job.committedLessonId) await ctx.db.delete(job.committedLessonId);
    for (const kid of job.committedKeywordIds ?? []) {
      await ctx.db.delete(kid);
    }
    await ctx.db.patch(args.jobId, {
      status: "awaiting_review",
      committedLessonId: undefined,
      committedAnalysisId: undefined,
      committedKeywordIds: undefined,
      committedAt: undefined,
    });
    await ctx.db.insert("auditLog", {
      organizationId: job.organizationId,
      userId: user._id,
      action: "ingestionJob.rolledback",
      targetType: "ingestionJob",
      targetId: args.jobId,
      timestamp: Date.now(),
    });
    return { ok: true };
  },
});

// ─────────────────────────────────────────────────────────────────────
// Queries for the superadmin UI
// ─────────────────────────────────────────────────────────────────────

export const getIngestionJob = query({
  args: { sessionToken: v.string(), jobId: v.id("ingestionJobs") },
  handler: async (ctx, args) => {
    await requireSuperadmin(ctx, args.sessionToken);
    const job = await ctx.db.get(args.jobId);
    if (!job) return null;
    const student = job.detectedStudentId
      ? await ctx.db.get(job.detectedStudentId)
      : null;
    const prevAnalysis = job.detectedStudentId
      ? await ctx.db
          .query("transcriptAnalyses")
          .withIndex("by_student_date", q =>
            q.eq("studentId", job.detectedStudentId!),
          )
          .order("desc")
          .first()
      : null;
    const transcriptUrl = job.transcriptStorageId
      ? await ctx.storage.getUrl(job.transcriptStorageId)
      : null;
    const notesUrl = job.notesStorageId
      ? await ctx.storage.getUrl(job.notesStorageId)
      : null;
    return { job, student, prevAnalysis, transcriptUrl, notesUrl };
  },
});

export const listIngestionJobs = query({
  args: {
    sessionToken: v.string(),
    status: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireSuperadmin(ctx, args.sessionToken);
    const limit = args.limit ?? 50;
    let q = args.status
      ? ctx.db
          .query("ingestionJobs")
          .withIndex("by_status", q2 => q2.eq("status", args.status!))
          .order("desc")
      : ctx.db.query("ingestionJobs").order("desc");
    const rows = await q.take(limit);
    return Promise.all(
      rows.map(async job => {
        const student = job.detectedStudentId
          ? await ctx.db.get(job.detectedStudentId)
          : null;
        return {
          _id: job._id,
          status: job.status,
          sourceKind: job.sourceKind,
          sourceFilename: job.sourceFilename,
          detectedDate: job.detectedDate,
          detectedTitle: job.detectedTitle,
          studentName: student?.name,
          studentSlug: student?.slug,
          overallScore: job.stagedAnalysis?.overallScore,
          cefrBand: job.stagedAnalysis?.cefrBand,
          error: job.error,
          retryCount: job.retryCount,
          createdAt: job.createdAt,
          processedAt: job.processedAt,
          committedAt: job.committedAt,
        };
      }),
    );
  },
});

// ─────────────────────────────────────────────────────────────────────
// Bulk backfill + group fan-out commits (used by the 278-job run)
// ─────────────────────────────────────────────────────────────────────

// Internal: set detectedDate on a job. Used by the backfill script that
// parses YYYY-MM-DD from sourceFilename.
export const setDetectedDate = internalMutation({
  args: { jobId: v.id("ingestionJobs"), date: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.jobId, { detectedDate: args.date });
    return { ok: true };
  },
});

// Internal: list awaiting_review jobs with just filename + detectedDate
// so the orchestrator can map them to a group. Paginated.
export const listAwaitingReviewForMapping = internalQuery({
  args: {
    cursor: v.union(v.string(), v.null()),
    numItems: v.number(),
  },
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("ingestionJobs")
      .withIndex("by_status", q => q.eq("status", "awaiting_review"))
      .paginate({ cursor: args.cursor, numItems: args.numItems });
    return {
      page: result.page.map(j => ({
        _id: j._id,
        sourceFilename: j.sourceFilename,
        detectedDate: j.detectedDate,
        organizationId: j.organizationId,
        hasStagedAnalysis: !!j.stagedAnalysis,
        hasStagedKeywords: !!(j.stagedKeywords && j.stagedKeywords.length),
      })),
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    };
  },
});

// Internal: look up a group by slug (used by the orchestrator to
// resolve filename-derived keys → groupId).
export const getGroupBySlugInternal = internalQuery({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("groups")
      .withIndex("by_slug", q => q.eq("slug", args.slug))
      .unique();
  },
});

// Internal: list all groups so the orchestrator can build a slug map
// client-side without having to pull every job's org.
export const listAllGroupsInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    const groups = await ctx.db.query("groups").collect();
    return groups.map(g => ({
      _id: g._id,
      name: g.name,
      slug: g.slug,
      organizationId: g.organizationId,
    }));
  },
});

// Commit a group-lesson job: fan out staged data to every active
// member of the group. Internal — trusts the caller. Idempotent: if a
// student already has a lesson on (groupId, detectedDate) it is
// skipped.
export const commitIngestionJobFanout = internalMutation({
  args: {
    jobId: v.id("ingestionJobs"),
    groupId: v.id("groups"),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) throw new Error("Job not found");
    if (job.status !== "awaiting_review") {
      throw new Error(`Cannot commit job in status=${job.status}`);
    }
    if (!job.detectedDate) {
      throw new Error("detectedDate is required before fan-out commit");
    }
    if (!job.stagedAnalysis) {
      throw new Error("stagedAnalysis missing — cannot commit");
    }
    const stagedKeywords = job.stagedKeywords ?? [];

    const group = await ctx.db.get(args.groupId);
    if (!group) throw new Error("Group not found");

    // Derive the organisation from the group (groups always have one).
    const organizationId = group.organizationId;

    // Title defaults to detectedTitle or "<GroupName> — <date>".
    const baseTitle = job.detectedTitle
      ? job.detectedTitle
      : `${group.name} — ${job.detectedDate}`;

    // Load every active membership of the group.
    const memberships = await ctx.db
      .query("groupMemberships")
      .withIndex("by_group", q => q.eq("groupId", args.groupId))
      .collect();
    const activeMemberships = memberships.filter(m => m.isActive);

    const now = Date.now();
    const perStudent: Array<{
      studentId: Id<"students">;
      lessonId: Id<"lessons">;
      analysisId: Id<"transcriptAnalyses">;
      keywordIds: Id<"keywords">[];
      skipped: boolean;
    }> = [];

    let createdLessons = 0;
    let skippedExisting = 0;

    for (const m of activeMemberships) {
      // Idempotency guard — if this student already has a lesson for
      // (groupId, detectedDate) we skip this member.
      const existingLesson = await ctx.db
        .query("lessons")
        .withIndex("by_student_date", q =>
          q.eq("studentId", m.studentId).eq("date", job.detectedDate!),
        )
        .first();
      if (existingLesson && existingLesson.groupId === args.groupId) {
        skippedExisting++;
        perStudent.push({
          studentId: m.studentId,
          lessonId: existingLesson._id,
          // Find the existing analysis if any
          analysisId: (await ctx.db
            .query("transcriptAnalyses")
            .withIndex("by_lesson", q => q.eq("lessonId", existingLesson._id))
            .unique())?._id as Id<"transcriptAnalyses">,
          keywordIds: [],
          skipped: true,
        });
        continue;
      }

      // Next order for this student
      const existingLessons = await ctx.db
        .query("lessons")
        .withIndex("by_student", q => q.eq("studentId", m.studentId))
        .collect();
      const maxOrder = existingLessons.reduce(
        (acc, l) => (l.order > acc ? l.order : acc),
        0,
      );

      const lessonId = await ctx.db.insert("lessons", {
        organizationId,
        studentId: m.studentId,
        groupId: args.groupId,
        date: job.detectedDate!,
        title: baseTitle,
        topics: job.detectedTopics ?? [],
        transcriptStorageId: job.transcriptStorageId,
        transcriptFile: job.sourceFilename,
        lessonType: "group",
        order: maxOrder + 1,
        status: "completed",
        createdAt: now,
        updatedAt: now,
      });

      // Previous analysis for progress chaining
      const prevAnalysis = await ctx.db
        .query("transcriptAnalyses")
        .withIndex("by_student_date", q => q.eq("studentId", m.studentId))
        .order("desc")
        .first();

      const analysisId = await ctx.db.insert("transcriptAnalyses", {
        organizationId,
        studentId: m.studentId,
        lessonId,
        ...job.stagedAnalysis!,
        previousAnalysisId: prevAnalysis?._id,
        needsRefinement: true, // baseline — async VPS worker will overwrite
        createdAt: now,
      });

      const keywordIds: Id<"keywords">[] = [];
      for (const kw of stagedKeywords) {
        const kid = await ctx.db.insert("keywords", {
          organizationId,
          lessonId,
          studentId: m.studentId,
          word: kw.word,
          translation: kw.translation,
          definitionEn: kw.definitionEn,
          definitionPl: kw.definitionPl,
          exampleEn: kw.exampleEn,
          examplePl: kw.examplePl,
          ipa: kw.ipa,
          stressUK: kw.stressUK,
          stressUS: kw.stressUS,
          topics: kw.topics,
          wordType: kw.wordType,
          difficulty: kw.difficulty,
          collocations: kw.collocations,
          mastery: 0,
          reviewCount: 0,
          createdAt: now,
        });
        keywordIds.push(kid);
      }

      createdLessons++;
      perStudent.push({
        studentId: m.studentId,
        lessonId,
        analysisId,
        keywordIds,
        skipped: false,
      });

      // Invariant: the freshly-created lesson MUST carry the same
      // transcriptStorageId as the originating job. If these ever drift
      // apart we have a data-corruption bug — abort the whole mutation
      // so the caller notices instead of silently writing bad data.
      const freshLesson = await ctx.db.get(lessonId);
      if (
        freshLesson &&
        freshLesson.transcriptStorageId !== job.transcriptStorageId
      ) {
        throw new Error(
          `transcript mismatch — aborting: lesson=${lessonId} ` +
            `has transcriptStorageId=${freshLesson.transcriptStorageId} ` +
            `but job=${args.jobId} has ${job.transcriptStorageId}`,
        );
      }
    }

    // Mark the job as committed. We track the first created lesson's
    // ids on the job for audit / rollback.
    const firstFresh = perStudent.find(p => !p.skipped);
    await ctx.db.patch(args.jobId, {
      status: "committed",
      organizationId,
      committedLessonId: firstFresh?.lessonId,
      committedAnalysisId: firstFresh?.analysisId,
      committedKeywordIds: firstFresh?.keywordIds ?? [],
      committedAt: now,
    });

    await ctx.db.insert("auditLog", {
      organizationId,
      action: "ingestionJob.committedFanout",
      targetType: "ingestionJob",
      targetId: args.jobId,
      details: JSON.stringify({
        groupId: args.groupId,
        groupName: group.name,
        memberCount: activeMemberships.length,
        lessonsCreated: createdLessons,
        skippedExisting,
        keywordsPerStudent: stagedKeywords.length,
      }),
      timestamp: now,
    });

    return {
      groupId: args.groupId,
      groupName: group.name,
      memberCount: activeMemberships.length,
      lessonsCreated: createdLessons,
      skippedExisting,
      keywordsPerStudent: stagedKeywords.length,
    };
  },
});

// Internal cleanup helper — delete a job by id. CLI-only.
export const deleteJobInternal = internalMutation({
  args: { jobId: v.id("ingestionJobs") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.jobId);
    return { ok: true };
  },
});

export const listAuditLog = query({
  args: { sessionToken: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireSuperadmin(ctx, args.sessionToken);
    const limit = args.limit ?? 100;
    return await ctx.db
      .query("auditLog")
      .withIndex("by_timestamp")
      .order("desc")
      .take(limit);
  },
});

export const getIngestionStats = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    await requireSuperadmin(ctx, args.sessionToken);
    const counts: Record<string, number> = {
      queued: 0,
      processing: 0,
      awaiting_review: 0,
      committed: 0,
      failed: 0,
    };
    const statuses = ["queued", "processing", "awaiting_review", "committed", "failed"] as const;
    for (const status of statuses) {
      const rows = await ctx.db
        .query("ingestionJobs")
        .withIndex("by_status", q => q.eq("status", status))
        .collect();
      counts[status] = rows.length;
    }
    return counts;
  },
});

// ─────────────────────────────────────────────────────────────────────
// Parsing / helper utilities
// ─────────────────────────────────────────────────────────────────────

function extractText(response: any): string {
  if (!response?.content || !Array.isArray(response.content)) return "";
  return response.content
    .filter((c: any) => c.type === "text")
    .map((c: any) => c.text)
    .join("\n");
}

function stripJsonFence(text: string): string {
  // Claude sometimes adds ```json … ``` even when asked not to.
  let t = text.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*/, "");
    t = t.replace(/```\s*$/, "");
  }
  return t.trim();
}

function parseAnalysis(text: string): any {
  const cleaned = stripJsonFence(text);
  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // Try to find the first { ... } block.
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Analysis response is not valid JSON");
    parsed = JSON.parse(match[0]);
  }
  // Coerce + validate the required shape. Any missing field => 0 score.
  const num = (k: string) => {
    const v = Number(parsed[k]);
    return Number.isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : 0;
  };
  return {
    vocabularyRange: num("vocabularyRange"),
    grammaticalAccuracy: num("grammaticalAccuracy"),
    fluencyAndCoherence: num("fluencyAndCoherence"),
    pronunciation: num("pronunciation"),
    communicativeEffectiveness: num("communicativeEffectiveness"),
    overallScore: num("overallScore"),
    cefrBand: String(parsed.cefrBand ?? "B1"),
    lessonSummary: String(parsed.lessonSummary ?? ""),
    strengths: toStringArray(parsed.strengths),
    improvements: toStringArray(parsed.improvements),
    keyErrors: toKeyErrorArray(parsed.keyErrors),
    personalDetails: toStringArray(parsed.personalDetails),
    practiceAdvice: toStringArray(parsed.practiceAdvice),
  };
}

function parseKeywords(text: string): any[] {
  const cleaned = stripJsonFence(text);
  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (!match) throw new Error("Keywords response is not a JSON array");
    parsed = JSON.parse(match[0]);
  }
  if (!Array.isArray(parsed)) {
    throw new Error("Keywords response is not an array");
  }
  return parsed
    .filter((k: any) => k && typeof k === "object" && k.word)
    .map((k: any) => ({
      word: String(k.word ?? "").trim(),
      translation: String(k.translation ?? "").trim(),
      definitionEn: String(k.definitionEn ?? "").trim(),
      definitionPl: String(k.definitionPl ?? "").trim(),
      exampleEn: String(k.exampleEn ?? "").trim(),
      examplePl: String(k.examplePl ?? "").trim(),
      ipa: String(k.ipa ?? "").trim(),
      stressUK: String(k.stressUK ?? "").trim(),
      stressUS: String(k.stressUS ?? k.stressUK ?? "").trim(),
      topics: toStringArray(k.topics),
      wordType: k.wordType ? String(k.wordType) : undefined,
      difficulty: k.difficulty ? String(k.difficulty) : undefined,
      collocations: normaliseCollocations(k.collocations),
    }));
}

function toStringArray(v: any): string[] {
  if (!Array.isArray(v)) return [];
  return v.map(x => String(x)).filter(Boolean);
}

function toKeyErrorArray(v: any): Array<{ error: string; correction: string; category: string }> {
  if (!Array.isArray(v)) return [];
  return v
    .filter(x => x && typeof x === "object")
    .map(x => ({
      error: String(x.error ?? ""),
      correction: String(x.correction ?? ""),
      category: String(x.category ?? "grammar"),
    }));
}

function normaliseCollocations(v: any): any {
  if (!v || typeof v !== "object") return undefined;
  const mkArr = (items: any) => {
    if (!Array.isArray(items)) return undefined;
    return items
      .filter((i: any) => i && typeof i === "object" && i.phrase)
      .map((i: any) => ({
        phrase: String(i.phrase),
        example: String(i.example ?? ""),
      }));
  };
  return {
    commonCollocations: mkArr(v.commonCollocations),
    contexts: mkArr(v.contexts),
    usagePatterns: mkArr(v.usagePatterns),
  };
}

function deriveTitleFromSummary(summary: string): string {
  const firstSentence = (summary || "").split(/[.!?]/)[0].trim();
  return firstSentence.slice(0, 70) || "Untitled lesson";
}

function deriveTopics(analysis: any): string[] {
  // Pull capitalised phrases from the summary as topic candidates.
  const text = String(analysis.lessonSummary || "");
  const matches = text.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b/g) || [];
  const uniq = [...new Set(matches)].slice(0, 5);
  return uniq.length > 0 ? uniq : ["General English"];
}

function bytesToBase64(bytes: Uint8Array): string {
  // Convex Node runtime has Buffer; use it where available.
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  // Fallback for V8 runtime.
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

// ─────────────────────────────────────────────────────────────────────
// Audit helpers — used by the PDF-notes mismatch audit script
// ─────────────────────────────────────────────────────────────────────

// Fetch all awaiting_review jobs (paginated via cursor) with only the
// fields needed for the audit: no stagedAnalysis/keywords (too large).
export const listJobsForAudit = internalQuery({
  args: {
    cursor: v.union(v.string(), v.null()),
    numItems: v.number(),
  },
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("ingestionJobs")
      .withIndex("by_status", q => q.eq("status", "awaiting_review"))
      .paginate({ cursor: args.cursor, numItems: args.numItems });
    return {
      page: result.page.map(j => ({
        _id: j._id,
        sourceFilename: j.sourceFilename,
        detectedDate: j.detectedDate,
        notesText: j.notesText,
        error: j.error,
      })),
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    };
  },
});

// Patch notesText and/or an audit error comment on a job in place.
// Called by the PDF-notes mismatch audit script to either install the
// correct notes or null them out with a "AUDIT: …" comment.
export const patchNotes = internalMutation({
  args: {
    jobId: v.id("ingestionJobs"),
    notesText: v.optional(v.string()),
    notesAudit: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const patch: Record<string, any> = {};
    // Explicit undefined means "leave field alone"; passing null-ish
    // string means "clear it".  We use the presence of the key in args.
    if (args.notesText !== undefined) {
      patch.notesText = args.notesText;
    }
    if (args.notesAudit !== undefined) {
      patch.error = args.notesAudit;
    }
    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(args.jobId, patch);
    }
    return { ok: true };
  },
});

// ─────────────────────────────────────────────────────────────────────
// Lesson transcript-mismatch audit + repair (CLI-only)
// ─────────────────────────────────────────────────────────────────────
// See /root/fix_lesson_transcripts.py. A prior bulk fan-out commit ended
// up with a handful of lessons.transcriptStorageId values that point at
// the wrong transcript blob. These helpers let the repair script
// enumerate committed jobs, pull every fanned-out lesson for each job's
// (groupId, detectedDate), and patch transcriptStorageId/transcriptFile
// in place. Does NOT touch transcriptAnalyses (those are mid-refresh).

export const listCommittedJobsForAudit = internalQuery({
  args: {
    cursor: v.union(v.string(), v.null()),
    numItems: v.number(),
  },
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("ingestionJobs")
      .withIndex("by_status", q => q.eq("status", "committed"))
      .paginate({ cursor: args.cursor, numItems: args.numItems });
    return {
      page: result.page.map(j => ({
        _id: j._id,
        sourceFilename: j.sourceFilename,
        detectedDate: j.detectedDate,
        transcriptStorageId: j.transcriptStorageId,
        organizationId: j.organizationId,
        committedLessonId: j.committedLessonId,
      })),
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    };
  },
});

// List every lesson on a given date that belongs to any active member
// of the given group. Returns only the fields the audit script needs.
export const listGroupLessonsOnDate = internalQuery({
  args: {
    groupId: v.id("groups"),
    date: v.string(),
  },
  handler: async (ctx, args) => {
    // Fan-out always sets groupId on the lesson; use by_group + filter
    // on date for a tight result set.
    const byGroup = await ctx.db
      .query("lessons")
      .withIndex("by_group", q => q.eq("groupId", args.groupId))
      .collect();
    return byGroup
      .filter(l => l.date === args.date)
      .map(l => ({
        _id: l._id,
        studentId: l.studentId,
        date: l.date,
        groupId: l.groupId,
        transcriptStorageId: l.transcriptStorageId,
        transcriptFile: l.transcriptFile,
      }));
  },
});

// Patch a single lesson's transcriptStorageId + transcriptFile. Nothing
// else is touched — specifically, transcriptAnalyses rows are left
// alone because background refinement workers are mid-flight.
export const patchLessonTranscript = internalMutation({
  args: {
    lessonId: v.id("lessons"),
    transcriptStorageId: v.optional(v.id("_storage")),
    transcriptFile: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const lesson = await ctx.db.get(args.lessonId);
    if (!lesson) throw new Error(`Lesson ${args.lessonId} not found`);
    await ctx.db.patch(args.lessonId, {
      transcriptStorageId: args.transcriptStorageId,
      transcriptFile: args.transcriptFile,
      updatedAt: Date.now(),
    });
    return { ok: true, lessonId: args.lessonId };
  },
});

// Bulk re-tag jobs to a new organization. CLI-only.
export const reclassifyJobsOrg = internalMutation({
  args: {
    jobIds: v.array(v.id("ingestionJobs")),
    organizationSlug: v.string(),
  },
  handler: async (ctx, args) => {
    const org = await ctx.db
      .query("organizations")
      .filter(q => q.eq(q.field("slug"), args.organizationSlug))
      .first();
    if (!org) throw new Error(`Org '${args.organizationSlug}' not found`);
    let count = 0;
    for (const id of args.jobIds) {
      const job = await ctx.db.get(id);
      if (!job) continue;
      await ctx.db.patch(id, { organizationId: org._id });
      count++;
    }
    return { updated: count, orgId: org._id };
  },
});
