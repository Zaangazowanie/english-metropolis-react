// practice.ts — backend for the 10 practice shells (Crossword,
// Wordsearch, GapFill, Hangman, Matching, Flashcards, DragDrop,
// GroupSort, TrueFalse, Anagram).
//
// Authored by Agent 3 in the unify-build (2026-04-30) to replace the
// localStorage-only stub at src/practice/lib/convex-stubs.ts.
//
// ───────────────────────────────────────────────────────────
// AUTH PATTERN — IMPORTANT
// ───────────────────────────────────────────────────────────
// Lexicon does NOT use ctx.auth.getUserIdentity(). All auth flows in
// this codebase pass an explicit identifier (studentSlug or
// actingUserId) as a mutation arg, then resolve it server-side. The
// student session lives in localStorage (em-student-session) and the
// frontend calls /api/mutation directly via fetch — see
// src/contexts/StudentAuthContext.jsx.
//
// So `getProgress` and `saveProgress` here take `studentSlug` as the
// owner identifier. The frontend hook (convex-progress.ts) reads the
// session from localStorage and threads the slug through.
//
// If `studentSlug` is missing (design canvas, not logged in) we still
// allow reads/writes but they're stored on the same logical row keyed
// by `studentSlug = "anon"` so design-canvas state-machine demos don't
// trample real students' rows. Real students are guaranteed a slug by
// StudentAuthContext.

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";

const ANON_SLUG = "__anon__";

// ─────────────────────────────────────────────────────────────
// CEFR helpers — used by the exercise + interference queries
// (Agent A4, exercises + interferencePatterns scope).
// ─────────────────────────────────────────────────────────────
const CEFR_LADDER = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;

/**
 * cefrWindow — given a student's level, return that level ± 1
 * (e.g. B1 → ['A2','B1','B2']). Falls back to a 3-level window
 * around B1 when the supplied level is unrecognised.
 */
function cefrWindow(level: string): string[] {
  const idx = CEFR_LADDER.indexOf(level as (typeof CEFR_LADDER)[number]);
  if (idx === -1) return ["A2", "B1", "B2"];
  const lo = Math.max(0, idx - 1);
  const hi = Math.min(CEFR_LADDER.length - 1, idx + 1);
  return CEFR_LADDER.slice(lo, hi + 1) as unknown as string[];
}

// ─────────────────────────────────────────────────────────────
// getProgress — return the row for (slug, shell, exerciseId).
// Returns null when no row exists yet (fresh shell first-load).
// ─────────────────────────────────────────────────────────────
export const getProgress = query({
  args: {
    studentSlug: v.optional(v.string()),
    shellId: v.string(),
    exerciseId: v.optional(v.string()),
  },
  handler: async (ctx, { studentSlug, shellId, exerciseId }): Promise<Doc<"practiceProgress"> | null> => {
    const slug = studentSlug ?? ANON_SLUG;

    // Use the most-specific index available (slug + shell + exerciseId)
    // when an exerciseId is supplied, otherwise fall back to (slug + shell).
    if (exerciseId !== undefined) {
      return await ctx.db
        .query("practiceProgress")
        .withIndex("by_slug_exercise", (q) =>
          q.eq("studentSlug", slug).eq("shellId", shellId).eq("exerciseId", exerciseId),
        )
        .first();
    }

    return await ctx.db
      .query("practiceProgress")
      .withIndex("by_slug_shell", (q) => q.eq("studentSlug", slug).eq("shellId", shellId))
      .filter((q) => q.eq(q.field("exerciseId"), undefined))
      .first();
  },
});

// ─────────────────────────────────────────────────────────────
// saveProgress — upsert. If a row exists for (slug, shell, exerciseId)
// we patch it with the supplied fields; otherwise we insert a new row.
// All fields except shellId are optional — callers send a partial update.
// ─────────────────────────────────────────────────────────────
export const saveProgress = mutation({
  args: {
    studentSlug: v.optional(v.string()),
    shellId: v.string(),
    exerciseId: v.optional(v.string()),
    progress: v.optional(v.number()),
    completed: v.optional(v.boolean()),
    hintsUsed: v.optional(v.number()),
    lastState: v.optional(v.string()),
    meta: v.optional(v.any()),
  },
  handler: async (ctx, args): Promise<Id<"practiceProgress">> => {
    const slug = args.studentSlug ?? ANON_SLUG;
    const now = Date.now();

    // Resolve the student row (and its organizationId) from the slug, when
    // we have a real (non-anon) student. We tolerate a missing student row
    // — the slug-only path still writes a valid progress row, which will
    // get picked up later if the student record is created with that slug.
    let studentId: Id<"students"> | undefined;
    let organizationId: Id<"organizations"> | undefined;
    if (slug !== ANON_SLUG) {
      const student = await ctx.db
        .query("students")
        .withIndex("by_slug", (q) => q.eq("slug", slug))
        .unique();
      if (student) {
        studentId = student._id;
        organizationId = student.organizationId;
      }
    }

    // Look up an existing row for this (slug, shell, exerciseId).
    let existing: Doc<"practiceProgress"> | null = null;
    if (args.exerciseId !== undefined) {
      existing = await ctx.db
        .query("practiceProgress")
        .withIndex("by_slug_exercise", (q) =>
          q.eq("studentSlug", slug).eq("shellId", args.shellId).eq("exerciseId", args.exerciseId),
        )
        .first();
    } else {
      existing = await ctx.db
        .query("practiceProgress")
        .withIndex("by_slug_shell", (q) => q.eq("studentSlug", slug).eq("shellId", args.shellId))
        .filter((q) => q.eq(q.field("exerciseId"), undefined))
        .first();
    }

    if (existing) {
      const patch: Partial<Doc<"practiceProgress">> = {
        updatedAt: now,
      };
      if (args.progress !== undefined) patch.progress = args.progress;
      if (args.completed !== undefined) patch.completed = args.completed;
      if (args.hintsUsed !== undefined) patch.hintsUsed = args.hintsUsed;
      if (args.lastState !== undefined) patch.lastState = args.lastState;
      if (args.meta !== undefined) patch.meta = args.meta;
      // Set completedAt only on the transition to completed.
      if (args.completed === true && !existing.completedAt) {
        patch.completedAt = now;
      }
      // Backfill studentId / organizationId if they weren't set previously
      // and we now have them (e.g. anon row carried over after login).
      if (!existing.studentId && studentId) patch.studentId = studentId;
      if (!existing.organizationId && organizationId) patch.organizationId = organizationId;
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }

    return await ctx.db.insert("practiceProgress", {
      studentId,
      studentSlug: slug,
      organizationId,
      shellId: args.shellId,
      exerciseId: args.exerciseId,
      progress: args.progress ?? 0,
      completed: args.completed ?? false,
      hintsUsed: args.hintsUsed ?? 0,
      lastState: args.lastState,
      meta: args.meta,
      startedAt: now,
      updatedAt: now,
      completedAt: args.completed ? now : undefined,
    });
  },
});

// ─────────────────────────────────────────────────────────────
// reset — delete the row for (slug, shell, exerciseId). No-op if
// the row doesn't exist.
// ─────────────────────────────────────────────────────────────
export const reset = mutation({
  args: {
    studentSlug: v.optional(v.string()),
    shellId: v.string(),
    exerciseId: v.optional(v.string()),
  },
  handler: async (ctx, { studentSlug, shellId, exerciseId }) => {
    const slug = studentSlug ?? ANON_SLUG;

    let existing: Doc<"practiceProgress"> | null = null;
    if (exerciseId !== undefined) {
      existing = await ctx.db
        .query("practiceProgress")
        .withIndex("by_slug_exercise", (q) =>
          q.eq("studentSlug", slug).eq("shellId", shellId).eq("exerciseId", exerciseId),
        )
        .first();
    } else {
      existing = await ctx.db
        .query("practiceProgress")
        .withIndex("by_slug_shell", (q) => q.eq("studentSlug", slug).eq("shellId", shellId))
        .filter((q) => q.eq(q.field("exerciseId"), undefined))
        .first();
    }

    if (existing) {
      await ctx.db.delete(existing._id);
      return { deleted: true };
    }
    return { deleted: false };
  },
});

// ─────────────────────────────────────────────────────────────
// listForStudent — return all progress rows for a student. Used by
// the dashboard / progress-tracking UI to show how far the student
// has gotten in each shell.
// ─────────────────────────────────────────────────────────────
export const listForStudent = query({
  args: {
    studentSlug: v.string(),
  },
  handler: async (ctx, { studentSlug }): Promise<Doc<"practiceProgress">[]> => {
    return await ctx.db
      .query("practiceProgress")
      .withIndex("by_slug_shell", (q) => q.eq("studentSlug", studentSlug))
      .collect();
  },
});

// ═══════════════════════════════════════════════════════════════
// PRACTICE SESSION — mid-shell snapshot + run-control state
// (Phase 1.8 of audit §4 #21, Mike's add-on, Ricky 2026-05-02).
//
// Backs SessionModal.tsx + useSessionState.ts on the frontend. See
// the schema header in convex/schema.ts for the data-model rationale.
//
// Auth pattern matches the rest of practice.ts: studentSlug comes in
// as an explicit arg. Anonymous (design-canvas) callers get null /
// no-op so the design surface doesn't pollute real student rows.
// ═══════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────
// getActiveSession — return the most-recent non-completed session
// row for (studentSlug, shellKey), or null when there isn't one.
// Anonymous callers: null.
// ─────────────────────────────────────────────────────────────
export const getActiveSession = query({
  args: {
    studentSlug: v.optional(v.string()),
    shellKey: v.string(),
  },
  handler: async (
    ctx,
    { studentSlug, shellKey },
  ): Promise<Doc<"practiceSession"> | null> => {
    if (!studentSlug || studentSlug === ANON_SLUG) return null;
    const rows = await ctx.db
      .query("practiceSession")
      .withIndex("by_student_shell", (q) =>
        q.eq("studentSlug", studentSlug).eq("shellKey", shellKey),
      )
      .collect();
    // Most recent non-completed row wins; collect+sort beats a separate
    // index because there's at most one (student, shell) row in practice.
    const live = rows.filter((r) => !r.isComplete);
    if (live.length === 0) return null;
    live.sort((a, b) => b.updatedAt - a.updatedAt);
    return live[0];
  },
});

// ─────────────────────────────────────────────────────────────
// saveSessionSnapshot — upsert. Patches the existing row for
// (studentSlug, shellKey) when one exists, otherwise inserts.
// Always sets isComplete=false (an in-flight snapshot is by
// definition incomplete). Anonymous: no-op, returns null.
// ─────────────────────────────────────────────────────────────
export const saveSessionSnapshot = mutation({
  args: {
    studentSlug: v.optional(v.string()),
    shellKey: v.string(),
    state: v.string(),
    questionIds: v.array(v.string()),
  },
  handler: async (
    ctx,
    { studentSlug, shellKey, state, questionIds },
  ): Promise<Id<"practiceSession"> | null> => {
    if (!studentSlug || studentSlug === ANON_SLUG) return null;
    const now = Date.now();
    const existing = await ctx.db
      .query("practiceSession")
      .withIndex("by_student_shell", (q) =>
        q.eq("studentSlug", studentSlug).eq("shellKey", shellKey),
      )
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        updatedAt: now,
        state,
        questionIds,
        isComplete: false,
      });
      return existing._id;
    }
    return await ctx.db.insert("practiceSession", {
      studentSlug,
      shellKey,
      startedAt: now,
      updatedAt: now,
      state,
      questionIds,
      isComplete: false,
    });
  },
});

// ─────────────────────────────────────────────────────────────
// markSessionComplete — flag the (studentSlug, shellKey) row as
// done. The row stays in the table (so we could surface "you
// recently completed this" stats later) but stops being returned
// by getActiveSession. No-op when no row exists.
// ─────────────────────────────────────────────────────────────
export const markSessionComplete = mutation({
  args: {
    studentSlug: v.optional(v.string()),
    shellKey: v.string(),
  },
  handler: async (ctx, { studentSlug, shellKey }) => {
    if (!studentSlug || studentSlug === ANON_SLUG) return { marked: false };
    const existing = await ctx.db
      .query("practiceSession")
      .withIndex("by_student_shell", (q) =>
        q.eq("studentSlug", studentSlug).eq("shellKey", shellKey),
      )
      .first();
    if (!existing) return { marked: false };
    await ctx.db.patch(existing._id, {
      isComplete: true,
      updatedAt: Date.now(),
    });
    return { marked: true };
  },
});

// ─────────────────────────────────────────────────────────────
// discardSession — explicit delete for the "Start fresh" branch.
// Hard-removes the row so the next visit prompts no resume modal.
// ─────────────────────────────────────────────────────────────
export const discardSession = mutation({
  args: {
    studentSlug: v.optional(v.string()),
    shellKey: v.string(),
  },
  handler: async (ctx, { studentSlug, shellKey }) => {
    if (!studentSlug || studentSlug === ANON_SLUG) return { deleted: false };
    const rows = await ctx.db
      .query("practiceSession")
      .withIndex("by_student_shell", (q) =>
        q.eq("studentSlug", studentSlug).eq("shellKey", shellKey),
      )
      .collect();
    for (const row of rows) {
      await ctx.db.delete(row._id);
    }
    return { deleted: rows.length > 0, count: rows.length };
  },
});

// ─────────────────────────────────────────────────────────────
// VOCABULARY FETCHERS (Phase B)
//
// The puzzle generators in src/practice/generators/* expect input
// of shape { word, word_pl, exampleEn, example_pl, topics, ... }.
// These queries normalise raw `keywords` rows into that shape so
// the client doesn't have to reshape per-call.
// ─────────────────────────────────────────────────────────────

interface VocabItem {
  keywordId: string;
  word: string;
  word_pl: string;
  exampleEn?: string;
  example_pl?: string;
  topics: string[];
  wordType?: string;
  difficulty?: string;
  ipa?: string;
  group?: string;
}

function toVocabItem(k: Doc<"keywords">): VocabItem {
  return {
    keywordId: k._id,
    word: k.word,
    word_pl: k.translation,
    exampleEn: k.exampleEn,
    example_pl: k.examplePl,
    topics: k.topics ?? [],
    wordType: k.wordType,
    difficulty: k.difficulty,
    ipa: k.ipa,
    group: (k.topics ?? [])[0],
  };
}

/**
 * getVocabSetForLesson — return all keywords for one lesson, normalised
 * to the shape the generators consume.
 */
export const getVocabSetForLesson = query({
  args: { lessonId: v.id("lessons") },
  handler: async (ctx, args): Promise<VocabItem[]> => {
    const rows = await ctx.db
      .query("keywords")
      .withIndex("by_lesson", (q) => q.eq("lessonId", args.lessonId))
      .collect();
    return rows.map(toVocabItem);
  },
});

/**
 * getKeywordsByLevel — recent N keywords for a student, optional CEFR
 * difficulty filter. Used when no specific lesson is selected.
 */
export const getKeywordsByLevel = query({
  args: {
    studentId: v.id("students"),
    difficulty: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<VocabItem[]> => {
    const limit = args.limit ?? 60;
    const all = await ctx.db
      .query("keywords")
      .withIndex("by_student", (q) => q.eq("studentId", args.studentId))
      .take(limit * 4);
    const filtered = args.difficulty
      ? all.filter((k) => !k.difficulty || k.difficulty === args.difficulty)
      : all;
    return filtered.slice(0, limit).map(toVocabItem);
  },
});

/**
 * getKeywordsByStudentSlug — same as getKeywordsByLevel but accepts a
 * slug (matches the practice.ts auth pattern).
 */
export const getKeywordsByStudentSlug = query({
  args: {
    studentSlug: v.string(),
    difficulty: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<VocabItem[]> => {
    const student = await ctx.db
      .query("students")
      .withIndex("by_slug", (q) => q.eq("slug", args.studentSlug))
      .unique();
    if (!student) return [];
    const limit = args.limit ?? 60;
    const all = await ctx.db
      .query("keywords")
      .withIndex("by_student", (q) => q.eq("studentId", student._id))
      .take(limit * 4);
    const filtered = args.difficulty
      ? all.filter((k) => !k.difficulty || k.difficulty === args.difficulty)
      : all;
    return filtered.slice(0, limit).map(toVocabItem);
  },
});

// ─────────────────────────────────────────────────────────────
// STUDENT-GAPS + RECOMMENDATIONS (Phase B)
// ─────────────────────────────────────────────────────────────

/**
 * getStudentGaps — return the latest transcript-analysis keyErrors so
 * the client-side selector can score shells. Includes cefrBand for
 * level-aware bias.
 */
export const getStudentGaps = query({
  args: { studentSlug: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const student = await ctx.db
      .query("students")
      .withIndex("by_slug", (q) => q.eq("slug", args.studentSlug))
      .unique();
    if (!student) return { studentLevel: "B1", analyses: [] };
    const limit = args.limit ?? 5;
    const analyses = await ctx.db
      .query("transcriptAnalyses")
      .withIndex("by_student_date", (q) => q.eq("studentId", student._id))
      .order("desc")
      .take(limit);
    return {
      studentLevel: student.level || "B1",
      analyses: analyses.map((a) => ({
        analysisId: a._id,
        lessonId: a.lessonId,
        cefrBand: a.cefrBand,
        keyErrors: a.keyErrors,
      })),
    };
  },
});

/**
 * getRecommendedShells — read cached recommendation for a student, or
 * null when none exists (the client falls back to running
 * pickShellsForStudent locally on the KB JSON).
 */
export const getRecommendedShells = query({
  args: { studentSlug: v.string() },
  handler: async (ctx, args) => {
    const student = await ctx.db
      .query("students")
      .withIndex("by_slug", (q) => q.eq("slug", args.studentSlug))
      .unique();
    if (!student) return null;
    return await ctx.db
      .query("practiceRecommendations")
      .withIndex("by_student", (q) => q.eq("studentId", student._id))
      .order("desc")
      .first();
  },
});

/**
 * saveRecommendedShells — persist a fresh recommendation. Newer rows
 * supersede older ones via createdAt (no in-place update — we keep
 * history for audit).
 */
export const saveRecommendedShells = mutation({
  args: {
    studentSlug: v.string(),
    studentLevel: v.string(),
    kbVersion: v.optional(v.string()),
    shells: v.array(
      v.object({
        shell: v.string(),
        weight: v.number(),
        reason: v.string(),
        topErrorIds: v.array(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const student = await ctx.db
      .query("students")
      .withIndex("by_slug", (q) => q.eq("slug", args.studentSlug))
      .unique();
    if (!student) throw new Error(`Unknown student slug: ${args.studentSlug}`);
    return await ctx.db.insert("practiceRecommendations", {
      studentId: student._id,
      organizationId: student.organizationId,
      studentLevel: args.studentLevel,
      kbVersion: args.kbVersion,
      shells: args.shells,
      createdAt: Date.now(),
    });
  },
});

// ═══════════════════════════════════════════════════════════════
// EXERCISES + INTERFERENCE PATTERNS
//
// Authored by Agent A4 in the 15-agent content-pipeline build
// (2026-04-30). These functions back the English Metropolis
// exercise bank (Layer 1 import) and the Polish-L1-on-English
// interference-pattern bridge (Layer 2 enrichment).
//
// Schema lives in convex/schema.ts (`exercises` and
// `interferencePatterns`). Indices used here:
//   exercises.by_exerciseId / by_cefr / by_cefr_category /
//   by_cefr_subCategory
//   interferencePatterns.by_patternId / by_cefr / by_strength
// ═══════════════════════════════════════════════════════════════

// Question shape — kept as a const so the same validator is used
// for ingest + (eventual) enrich-question paths.
const exerciseQuestionValidator = v.object({
  questionId: v.string(),
  type: v.string(),
  prompt: v.string(),
  answer: v.string(),
  options: v.optional(v.array(v.string())),
  instructionEN: v.string(),
  instructionPL: v.string(),
  hintPL: v.optional(v.string()),
  explanationPL: v.optional(v.string()),
  explanationENSimple: v.optional(v.string()),
});

// ─────────────────────────────────────────────────────────────
// ingestExerciseBatch — upsert exercises by exerciseId.
// Idempotent: existing rows get patched (preserving Layer-2
// enrichment fields), new rows get inserted.
// ─────────────────────────────────────────────────────────────
export const ingestExerciseBatch = mutation({
  args: {
    exercises: v.array(
      v.object({
        exerciseId: v.string(),
        category: v.string(),
        subCategory: v.string(),
        cefrLevel: v.string(),
        difficultyTier: v.number(),
        title: v.string(),
        description: v.string(),
        focusArea: v.string(),
        questions: v.array(exerciseQuestionValidator),
      }),
    ),
  },
  handler: async (ctx, { exercises }) => {
    let inserted = 0;
    let updated = 0;
    const now = Date.now();
    for (const ex of exercises) {
      const existing = await ctx.db
        .query("exercises")
        .withIndex("by_exerciseId", (q) => q.eq("exerciseId", ex.exerciseId))
        .unique();
      if (existing) {
        await ctx.db.patch(existing._id, { ...ex, importedAt: now });
        updated++;
      } else {
        await ctx.db.insert("exercises", { ...ex, importedAt: now });
        inserted++;
      }
    }
    return { inserted, updated };
  },
});

// ─────────────────────────────────────────────────────────────
// getExercisesForStudent — return exercises ranked for a student.
// Strategy:
//   1. Resolve student.level (the schema field) from the slug.
//   2. Build a CEFR window (±1) around the student's level so a
//      B1 student sees A2/B1/B2 exercises.
//   3. Use the most-specific composite index available for the
//      OWN-LEVEL fetch; then also fetch the neighbour levels for
//      breadth.
//   4. Score each candidate (own-level priority + polish-difficulty
//      + interference-tag presence) and return the top `limit`.
// ─────────────────────────────────────────────────────────────
export const getExercisesForStudent = query({
  args: {
    studentSlug: v.string(),
    category: v.optional(v.string()),
    subCategory: v.optional(v.string()),
    /**
     * Topic-grouping filter (sprint-2 Finding 2 fix, 2026-05-02). When
     * supplied, narrows the result to ONLY exercises tagged with this
     * groupId — i.e., when the student launched the shell from a topic
     * card, the puzzle pool is scoped to that topic. Falls back to the
     * existing CEFR-window behavior when omitted (ad-hoc 38-pill catalog
     * launches keep their broad pool).
     *
     * Index used: exercises.by_groupId (verified live in
     * wooden-manatee-881 schema 2026-05-02 — confirmed via
     * exerciseGroups:getExercisesForGroupAndShell which depends on it).
     */
    groupId: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (
    ctx,
    { studentSlug, category, subCategory, groupId, limit = 20 },
  ): Promise<Doc<"exercises">[]> => {
    // 1. Resolve student → level
    const student = await ctx.db
      .query("students")
      .withIndex("by_slug", (q) => q.eq("slug", studentSlug))
      .unique();
    const studentLevel = student?.level ?? "B1";

    // 2. CEFR window
    const levels = cefrWindow(studentLevel);

    // 3a. Topic-scoped path — when groupId is supplied, hit the by_groupId
    //     index directly and skip the CEFR-window scan. The grouping is
    //     already CEFR-bound (each group has a fixed cefrLevel), so the
    //     window filter would just no-op.
    if (groupId) {
      const rows = await ctx.db
        .query("exercises")
        .withIndex("by_groupId", (idx) => idx.eq("groupId", groupId))
        .collect();
      // Score by Polish-difficulty + interference signal — same scoring
      // applied to the broad path so ranking semantics stay consistent.
      const scored = rows
        .map((ex) => ({
          ex,
          score:
            (ex.polishDifficultyScore ?? 5) / 10 +
            (ex.interferenceTags && ex.interferenceTags.length > 0 ? 0.3 : 0),
        }))
        .sort((a, b) => b.score - a.score);
      return scored.slice(0, limit).map((s) => s.ex);
    }

    // 3b. Fetch from each level (using the best index for the
    //    category/subCategory filter), then merge.
    const collected: Doc<"exercises">[] = [];
    for (const lvl of levels) {
      let rows: Doc<"exercises">[];
      if (subCategory) {
        rows = await ctx.db
          .query("exercises")
          .withIndex("by_cefr_subCategory", (idx) =>
            idx.eq("cefrLevel", lvl).eq("subCategory", subCategory),
          )
          .collect();
        if (category) rows = rows.filter((r) => r.category === category);
      } else if (category) {
        rows = await ctx.db
          .query("exercises")
          .withIndex("by_cefr_category", (idx) =>
            idx.eq("cefrLevel", lvl).eq("category", category),
          )
          .collect();
      } else {
        rows = await ctx.db
          .query("exercises")
          .withIndex("by_cefr", (idx) => idx.eq("cefrLevel", lvl))
          .collect();
      }
      collected.push(...rows);
    }

    // 4. Score & sort
    const scored = collected
      .map((ex) => ({
        ex,
        score:
          (ex.cefrLevel === studentLevel ? 1 : 0.6) +
          (ex.polishDifficultyScore ?? 5) / 10 +
          (ex.interferenceTags && ex.interferenceTags.length > 0 ? 0.3 : 0),
      }))
      .sort((a, b) => b.score - a.score);

    return scored.slice(0, limit).map((s) => s.ex);
  },
});

// ─────────────────────────────────────────────────────────────
// getExercisesByInterference — return exercises at the student's
// own level whose interferenceTags overlap any of the supplied
// tags. Sorted by polishDifficultyScore desc.
// ─────────────────────────────────────────────────────────────
export const getExercisesByInterference = query({
  args: {
    studentSlug: v.string(),
    interferenceTags: v.array(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (
    ctx,
    { studentSlug, interferenceTags, limit = 20 },
  ): Promise<Doc<"exercises">[]> => {
    const student = await ctx.db
      .query("students")
      .withIndex("by_slug", (q) => q.eq("slug", studentSlug))
      .unique();
    const level = student?.level ?? "B1";
    const all = await ctx.db
      .query("exercises")
      .withIndex("by_cefr", (q) => q.eq("cefrLevel", level))
      .collect();
    const tagSet = new Set(interferenceTags);
    const tagged = all.filter((ex) =>
      ex.interferenceTags?.some((t) => tagSet.has(t)),
    );
    return tagged
      .sort(
        (a, b) =>
          (b.polishDifficultyScore ?? 0) - (a.polishDifficultyScore ?? 0),
      )
      .slice(0, limit);
  },
});

// ─────────────────────────────────────────────────────────────
// enrichExerciseBatch — Layer-2 patch in bulk. Far cheaper than
// enrichExercise per row: one mutation call → many patches.
// Each row in `enrichments` is keyed by exerciseId and applies the
// same fields enrichExercise accepts. Skips rows whose exerciseId
// isn't found (returns count). A15 added (2026-04-30).
// ─────────────────────────────────────────────────────────────
export const enrichExerciseBatch = mutation({
  args: {
    enrichments: v.array(
      v.object({
        exerciseId: v.string(),
        interferenceTags: v.array(v.string()),
        polishDifficultyScore: v.number(),
        highPriorityFor: v.optional(v.array(v.string())),
        decayRate: v.optional(v.number()),
      }),
    ),
  },
  handler: async (ctx, { enrichments }) => {
    let updated = 0;
    let skipped = 0;
    const now = Date.now();
    for (const e of enrichments) {
      const ex = await ctx.db
        .query("exercises")
        .withIndex("by_exerciseId", (q) => q.eq("exerciseId", e.exerciseId))
        .unique();
      if (!ex) {
        skipped++;
        continue;
      }
      const patch: Partial<Doc<"exercises">> = {
        interferenceTags: e.interferenceTags,
        polishDifficultyScore: e.polishDifficultyScore,
        enrichedAt: now,
      };
      if (e.highPriorityFor !== undefined) patch.highPriorityFor = e.highPriorityFor;
      if (e.decayRate !== undefined) patch.decayRate = e.decayRate;
      await ctx.db.patch(ex._id, patch);
      updated++;
    }
    return { updated, skipped };
  },
});

// ─────────────────────────────────────────────────────────────
// enrichExercise — Layer-2 patch: attach interferenceTags +
// polishDifficultyScore + (optional) highPriorityFor + decayRate.
// Sets enrichedAt. Throws if the exercise doesn't exist.
// ─────────────────────────────────────────────────────────────
export const enrichExercise = mutation({
  args: {
    exerciseId: v.string(),
    interferenceTags: v.array(v.string()),
    polishDifficultyScore: v.number(),
    highPriorityFor: v.optional(v.array(v.string())),
    decayRate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const ex = await ctx.db
      .query("exercises")
      .withIndex("by_exerciseId", (q) => q.eq("exerciseId", args.exerciseId))
      .unique();
    if (!ex) throw new Error(`Exercise ${args.exerciseId} not found`);
    const patch: Partial<Doc<"exercises">> = {
      interferenceTags: args.interferenceTags,
      polishDifficultyScore: args.polishDifficultyScore,
      enrichedAt: Date.now(),
    };
    if (args.highPriorityFor !== undefined)
      patch.highPriorityFor = args.highPriorityFor;
    if (args.decayRate !== undefined) patch.decayRate = args.decayRate;
    await ctx.db.patch(ex._id, patch);
    return { exerciseId: args.exerciseId, enriched: true };
  },
});

// ═══════════════════════════════════════════════════════════════
// INTERFERENCE PATTERNS
// ═══════════════════════════════════════════════════════════════

const interferencePatternValidator = v.object({
  patternId: v.string(),
  cefrLevel: v.string(),
  frequency: v.number(),
  polishCause: v.string(),
  polishCauseEn: v.string(),
  typicalErrors: v.array(v.string()),
  correctPatterns: v.array(v.string()),
  interferenceStrength: v.number(),
  decayRate: v.number(),
  spacedRepetitionWeight: v.number(),
  matchingSubCategories: v.array(v.string()),
  matchingErrorCategories: v.array(v.string()),
  sourceCount: v.number(),
});

// ─────────────────────────────────────────────────────────────
// ingestInterferenceBatch — upsert patterns by patternId.
// Idempotent. Sets builtAt on every write so callers can tell
// when a pattern was last refreshed.
// ─────────────────────────────────────────────────────────────
export const ingestInterferenceBatch = mutation({
  args: {
    patterns: v.array(interferencePatternValidator),
  },
  handler: async (ctx, { patterns }) => {
    let inserted = 0;
    let updated = 0;
    const now = Date.now();
    for (const p of patterns) {
      const existing = await ctx.db
        .query("interferencePatterns")
        .withIndex("by_patternId", (q) => q.eq("patternId", p.patternId))
        .unique();
      if (existing) {
        await ctx.db.patch(existing._id, { ...p, builtAt: now });
        updated++;
      } else {
        await ctx.db.insert("interferencePatterns", { ...p, builtAt: now });
        inserted++;
      }
    }
    return { inserted, updated };
  },
});

// ─────────────────────────────────────────────────────────────
// listInterferencePatterns — list patterns, optionally filtered
// by CEFR level and minimum interferenceStrength.
// ─────────────────────────────────────────────────────────────
export const listInterferencePatterns = query({
  args: {
    cefrLevel: v.optional(v.string()),
    minStrength: v.optional(v.number()),
  },
  handler: async (
    ctx,
    { cefrLevel, minStrength },
  ): Promise<Doc<"interferencePatterns">[]> => {
    const rows = cefrLevel
      ? await ctx.db
          .query("interferencePatterns")
          .withIndex("by_cefr", (q) => q.eq("cefrLevel", cefrLevel))
          .collect()
      : await ctx.db.query("interferencePatterns").collect();
    const filtered =
      minStrength !== undefined
        ? rows.filter((r) => r.interferenceStrength >= minStrength)
        : rows;
    return filtered.sort(
      (a, b) => b.interferenceStrength - a.interferenceStrength,
    );
  },
});

// ─────────────────────────────────────────────────────────────
// getInterferenceForExercise — given an exerciseId, return the
// full interference-pattern docs that match its interferenceTags.
// Returns [] when the exercise is unenriched.
// ─────────────────────────────────────────────────────────────
export const getInterferenceForExercise = query({
  args: { exerciseId: v.string() },
  handler: async (
    ctx,
    { exerciseId },
  ): Promise<Doc<"interferencePatterns">[]> => {
    const ex = await ctx.db
      .query("exercises")
      .withIndex("by_exerciseId", (q) => q.eq("exerciseId", exerciseId))
      .unique();
    if (!ex?.interferenceTags || ex.interferenceTags.length === 0) return [];
    const rows = await Promise.all(
      ex.interferenceTags.map((tag) =>
        ctx.db
          .query("interferencePatterns")
          .withIndex("by_patternId", (q) => q.eq("patternId", tag))
          .unique(),
      ),
    );
    // Filter out missing patterns (tags that don't yet have a pattern row).
    return rows.filter((r): r is Doc<"interferencePatterns"> => r !== null);
  },
});

// ─────────────────────────────────────────────────────────────
// bulkUpdateQuestionExplanations — D2 regex augmentation (CD spec, 2026-05-02).
//
// Wrapper for the explanationPL backfill / augmentation pass. Each row patches
// ONE question's explanationPL inside ONE exercise's questions[] array.
// Idempotent at the row level; safe to retry. Returns counts so the migrator
// can sanity-check.
//
// To revert: call again with the originals from the on-disk backup file.
// ─────────────────────────────────────────────────────────────
export const bulkUpdateQuestionExplanations = mutation({
  args: {
    updates: v.array(
      v.object({
        exerciseId: v.string(),
        questionId: v.string(),
        explanationPL: v.string(),
      }),
    ),
  },
  handler: async (ctx, { updates }) => {
    let updated = 0;
    let skippedExercise = 0;
    let skippedQuestion = 0;
    // Group by exerciseId to minimise DB lookups when many questions of the
    // same exercise are in the same batch.
    const byExercise = new Map<string, Array<{ questionId: string; explanationPL: string }>>();
    for (const u of updates) {
      const arr = byExercise.get(u.exerciseId) ?? [];
      arr.push({ questionId: u.questionId, explanationPL: u.explanationPL });
      byExercise.set(u.exerciseId, arr);
    }
    for (const [exerciseId, qs] of byExercise.entries()) {
      const ex = await ctx.db
        .query("exercises")
        .withIndex("by_exerciseId", (q) => q.eq("exerciseId", exerciseId))
        .unique();
      if (!ex) {
        skippedExercise += qs.length;
        continue;
      }
      const idx = new Map(qs.map((q) => [q.questionId, q.explanationPL]));
      let changed = false;
      const newQs = ex.questions.map((q) => {
        const newExp = idx.get(q.questionId);
        if (newExp === undefined) return q;
        if (q.explanationPL === newExp) return q; // no-op
        changed = true;
        return { ...q, explanationPL: newExp };
      });
      // Count actual matches found in this exercise's questions array
      const matchedHere = qs.filter((qd) =>
        ex.questions.some((q) => q.questionId === qd.questionId)
      ).length;
      skippedQuestion += qs.length - matchedHere;
      if (changed) {
        await ctx.db.patch(ex._id, { questions: newQs });
        updated += matchedHere;
      }
    }
    return { updated, skippedExercise, skippedQuestion };
  },
});

// ─────────────────────────────────────────────────────────────
// bulkRewriteQuestions — D-audit fix pass (Mike's directive 2026-05-02).
//
// Rewrites individual question objects in-place inside their parent
// exercise's questions[] array. Used by the Opus-4.7 fix-agent to repair
// broken/misteach questions surfaced by the 20-sonnet question audit.
//
// Each row patches ONE question (by exerciseId + questionId), with full
// new shape: prompt, answer, options, instructionEN, instructionPL,
// hintPL, explanationPL. Idempotent. Returns counts.
//
// NOTE: This is a DESTRUCTIVE mutation in the sense that it overwrites
// the editorial-team-authored content. Always snapshot originals to disk
// (the fix-agent does this) before calling, so a one-shot revert via
// re-call with originals is possible if needed.
// ─────────────────────────────────────────────────────────────
export const bulkRewriteQuestions = mutation({
  args: {
    rewrites: v.array(
      v.object({
        exerciseId: v.string(),
        questionId: v.string(),
        prompt: v.optional(v.string()),
        answer: v.optional(v.string()),
        options: v.optional(v.array(v.string())),
        instructionEN: v.optional(v.string()),
        instructionPL: v.optional(v.string()),
        hintPL: v.optional(v.string()),
        explanationPL: v.optional(v.string()),
        explanationENSimple: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, { rewrites }) => {
    let updated = 0;
    let skipped = 0;
    const byExercise = new Map<string, typeof rewrites>();
    for (const r of rewrites) {
      const arr = byExercise.get(r.exerciseId) ?? [];
      arr.push(r);
      byExercise.set(r.exerciseId, arr);
    }
    for (const [exerciseId, qs] of byExercise.entries()) {
      const ex = await ctx.db
        .query("exercises")
        .withIndex("by_exerciseId", (q) => q.eq("exerciseId", exerciseId))
        .unique();
      if (!ex) {
        skipped += qs.length;
        continue;
      }
      const idx = new Map(qs.map((q) => [q.questionId, q]));
      let changed = false;
      const newQs = ex.questions.map((q) => {
        const patch = idx.get(q.questionId);
        if (!patch) return q;
        changed = true;
        return {
          ...q,
          ...(patch.prompt !== undefined ? { prompt: patch.prompt } : {}),
          ...(patch.answer !== undefined ? { answer: patch.answer } : {}),
          ...(patch.options !== undefined ? { options: patch.options } : {}),
          ...(patch.instructionEN !== undefined ? { instructionEN: patch.instructionEN } : {}),
          ...(patch.instructionPL !== undefined ? { instructionPL: patch.instructionPL } : {}),
          ...(patch.hintPL !== undefined ? { hintPL: patch.hintPL } : {}),
          ...(patch.explanationPL !== undefined ? { explanationPL: patch.explanationPL } : {}),
          ...(patch.explanationENSimple !== undefined ? { explanationENSimple: patch.explanationENSimple } : {}),
        };
      });
      const matched = qs.filter((qd) =>
        ex.questions.some((q) => q.questionId === qd.questionId)
      ).length;
      skipped += qs.length - matched;
      if (changed) {
        await ctx.db.patch(ex._id, { questions: newQs });
        updated += matched;
      }
    }
    return { updated, skipped };
  },
});
