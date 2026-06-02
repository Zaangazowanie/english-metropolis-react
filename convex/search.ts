import { query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";

// ═══════════════════════════════════════════════════════════
// GLOBAL STUDENT SEARCH
// ═══════════════════════════════════════════════════════════
//
// Unified search across a student's Lessons (+ CEFR analyses),
// Vocabulary (keywords), and Error Library (keyErrors nested in
// each transcriptAnalysis). Server-side filter + simple ranking,
// no LLM call. Returns top N of each bucket.
//
// The schema doesn't define `searchIndex`es today, so we scan by
// the `by_student` indexes and filter in JS. This is fine while a
// student has tens/hundreds of lessons and thousands of keywords.
// If the tables grow larger per-student, migrate to full-text
// searchIndexes (see guidelines §"Full text search guidelines").

const MAX_PER_BUCKET = 5;
const MAX_LESSONS_SCAN = 200;
const MAX_KEYWORDS_SCAN = 2000;
const MAX_ANALYSES_SCAN = 200;

const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
const ERROR_CATEGORIES = [
  "grammar",
  "vocabulary",
  "pronunciation",
  "fluency",
  "spelling",
] as const;

function tokenize(raw: string): string[] {
  return raw
    .toLowerCase()
    .split(/[^a-z0-9\u00c0-\u024f]+/i)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

function scoreText(haystack: string, tokens: string[]): number {
  if (!haystack) return 0;
  const h = haystack.toLowerCase();
  let score = 0;
  for (const t of tokens) {
    if (!t) continue;
    // Word-boundary match ranks higher than a substring hit
    const boundaryRegex = new RegExp(`\\b${escapeRegex(t)}\\b`);
    if (boundaryRegex.test(h)) score += 3;
    else if (h.includes(t)) score += 1;
  }
  return score;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractCefrFilter(tokens: string[]): string | null {
  for (const t of tokens) {
    const upper = t.toUpperCase();
    if ((CEFR_LEVELS as readonly string[]).includes(upper)) return upper;
  }
  return null;
}

function extractCategoryFilter(tokens: string[]): string | null {
  for (const t of tokens) {
    if ((ERROR_CATEGORIES as readonly string[]).includes(t)) return t;
  }
  return null;
}

export const studentSearch = query({
  args: {
    studentSlug: v.string(),
    q: v.string(),
  },
  handler: async (ctx, args) => {
    const q = args.q.trim();
    const tokens = tokenize(q);

    const student = await ctx.db
      .query("students")
      .withIndex("by_slug", (i) => i.eq("slug", args.studentSlug))
      .unique();

    if (!student) {
      return {
        studentSlug: args.studentSlug,
        q,
        tokens,
        cefrFilter: null,
        categoryFilter: null,
        lessons: [],
        keywords: [],
        errors: [],
        totalMatches: 0,
        studentFound: false,
      };
    }

    if (tokens.length === 0) {
      return {
        studentSlug: args.studentSlug,
        q,
        tokens,
        cefrFilter: null,
        categoryFilter: null,
        lessons: [],
        keywords: [],
        errors: [],
        totalMatches: 0,
        studentFound: true,
      };
    }

    const cefrFilter = extractCefrFilter(tokens);
    const categoryFilter = extractCategoryFilter(tokens);

    // Drop CEFR/category tokens from the text-match tokens — they're structural filters.
    const textTokens = tokens.filter(
      (t) =>
        !(CEFR_LEVELS as readonly string[]).includes(t.toUpperCase()) &&
        !(ERROR_CATEGORIES as readonly string[]).includes(t),
    );

    // ─── Lessons ───────────────────────────────────────────
    const lessons = await ctx.db
      .query("lessons")
      .withIndex("by_student", (i) => i.eq("studentId", student._id))
      .order("desc")
      .take(MAX_LESSONS_SCAN);

    // Pull analyses in parallel for CEFR band + summary text
    const analyses = await ctx.db
      .query("transcriptAnalyses")
      .withIndex("by_student", (i) => i.eq("studentId", student._id))
      .order("desc")
      .take(MAX_ANALYSES_SCAN);

    const analysisByLesson = new Map<Id<"lessons">, Doc<"transcriptAnalyses">>();
    for (const a of analyses) {
      if (!analysisByLesson.has(a.lessonId)) analysisByLesson.set(a.lessonId, a);
    }

    type LessonHit = {
      _id: Id<"lessons">;
      lessonId: Id<"lessons">;
      date: string;
      title: string;
      topics: string[];
      summary: string;
      cefrBand: string | null;
      overallScore: number | null;
      score: number;
    };

    const lessonHits: LessonHit[] = [];
    for (const lesson of lessons) {
      const analysis = analysisByLesson.get(lesson._id);
      if (cefrFilter && analysis?.cefrBand !== cefrFilter) continue;
      const haystack = [
        lesson.title,
        lesson.date,
        (lesson.topics || []).join(" "),
        lesson.summary || "",
        analysis?.lessonSummary || "",
        (analysis?.strengths || []).join(" "),
        (analysis?.improvements || []).join(" "),
      ].join(" \n ");
      const textScore =
        textTokens.length > 0 ? scoreText(haystack, textTokens) : 0;
      // If a CEFR filter is present and no text tokens, every lesson at that
      // band is a (low-)score hit; keep them with score 1.
      const score =
        textTokens.length === 0 && cefrFilter ? 1 : textScore;
      if (score > 0) {
        lessonHits.push({
          _id: lesson._id,
          lessonId: lesson._id,
          date: lesson.date,
          title: lesson.title,
          topics: lesson.topics || [],
          summary: lesson.summary || analysis?.lessonSummary || "",
          cefrBand: analysis?.cefrBand ?? null,
          overallScore: analysis?.overallScore ?? null,
          score,
        });
      }
    }
    lessonHits.sort((a, b) => b.score - a.score || b.date.localeCompare(a.date));

    // ─── Keywords (Vocabulary) ─────────────────────────────
    const keywords = await ctx.db
      .query("keywords")
      .withIndex("by_student", (i) => i.eq("studentId", student._id))
      .take(MAX_KEYWORDS_SCAN);

    type KeywordHit = {
      _id: Id<"keywords">;
      lessonId: Id<"lessons">;
      word: string;
      translation: string;
      definitionEn: string;
      definitionPl: string;
      ipa: string;
      difficulty: string | null;
      topics: string[];
      score: number;
    };

    const keywordHits: KeywordHit[] = [];
    for (const kw of keywords) {
      if (cefrFilter && kw.difficulty !== cefrFilter) continue;
      const haystack = [
        kw.word,
        kw.translation,
        kw.definitionEn,
        kw.definitionPl,
        kw.exampleEn,
        kw.examplePl,
        (kw.topics || []).join(" "),
      ].join(" \n ");
      const textScore =
        textTokens.length > 0 ? scoreText(haystack, textTokens) : 0;
      // Exact word match boost
      const exactBoost = textTokens.some(
        (t) => t.toLowerCase() === kw.word.toLowerCase(),
      )
        ? 5
        : 0;
      const score =
        textTokens.length === 0 && cefrFilter ? 1 : textScore + exactBoost;
      if (score > 0) {
        keywordHits.push({
          _id: kw._id,
          lessonId: kw.lessonId,
          word: kw.word,
          translation: kw.translation,
          definitionEn: kw.definitionEn,
          definitionPl: kw.definitionPl,
          ipa: kw.ipa,
          difficulty: kw.difficulty ?? null,
          topics: kw.topics || [],
          score,
        });
      }
    }
    keywordHits.sort(
      (a, b) => b.score - a.score || a.word.localeCompare(b.word),
    );

    // ─── Errors (flattened from transcriptAnalyses.keyErrors) ──
    type ErrorHit = {
      analysisId: Id<"transcriptAnalyses">;
      lessonId: Id<"lessons">;
      date: string;
      errorText: string;
      correction: string;
      category: string;
      score: number;
    };

    const errorHits: ErrorHit[] = [];
    for (const analysis of analyses) {
      for (const keyError of analysis.keyErrors || []) {
        if (
          categoryFilter &&
          keyError.category?.toLowerCase() !== categoryFilter
        ) {
          continue;
        }
        const haystack = [
          keyError.error,
          keyError.correction,
          keyError.category,
        ].join(" \n ");
        const textScore =
          textTokens.length > 0 ? scoreText(haystack, textTokens) : 0;
        const score =
          textTokens.length === 0 && (categoryFilter || cefrFilter) ? 1 : textScore;
        if (score > 0) {
          // Resolve the lesson date if we can
          const lesson = lessons.find((l) => l._id === analysis.lessonId);
          errorHits.push({
            analysisId: analysis._id,
            lessonId: analysis.lessonId,
            date: lesson?.date || "",
            errorText: keyError.error,
            correction: keyError.correction,
            category: keyError.category,
            score,
          });
        }
      }
    }
    errorHits.sort(
      (a, b) => b.score - a.score || b.date.localeCompare(a.date),
    );

    const lessonsOut = lessonHits.slice(0, MAX_PER_BUCKET);
    const keywordsOut = keywordHits.slice(0, MAX_PER_BUCKET);
    const errorsOut = errorHits.slice(0, MAX_PER_BUCKET);

    return {
      studentSlug: args.studentSlug,
      q,
      tokens,
      cefrFilter,
      categoryFilter,
      lessons: lessonsOut,
      keywords: keywordsOut,
      errors: errorsOut,
      totalMatches:
        lessonHits.length + keywordHits.length + errorHits.length,
      studentFound: true,
    };
  },
});
