import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// ─── Shared Validators ─────────────────────────────────────
const collocationsField = v.optional(v.object({
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

// Per-keyword enrichment block written by the em-enrichment pipeline
// (/root/.openclaw/workspace/em-enrichment/, Kimi K2.5). All fields optional
// so existing rows stay valid. Presence of `enrichedAt` flags the keyword
// as already processed for idempotent backfill.
const synonymItem = v.object({
  synonym: v.string(),
  industry: v.optional(v.string()),
  nuance: v.optional(v.string()),
});
const learnerNotesField = v.optional(v.object({
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
}));

export default defineSchema({
  // ═══════════════════════════════════════════════════════════
  // MULTI-TENANT: Organizations, Schools, Companies
  // ═══════════════════════════════════════════════════════════

  organizations: defineTable({
    name: v.string(),                    // "Conversa", "British Council Warsaw"
    slug: v.string(),                    // "conversa", "bc-warsaw"
    type: v.string(),                    // "school", "company", "private_practice", "platform"
    status: v.string(),                  // "active", "trial", "suspended", "archived"
    logoUrl: v.optional(v.string()),
    address: v.optional(v.string()),
    city: v.optional(v.string()),
    country: v.optional(v.string()),
    timezone: v.optional(v.string()),    // "Europe/Warsaw"
    locale: v.optional(v.string()),      // "pl-PL"
    settings: v.optional(v.object({
      defaultLanguage: v.optional(v.string()),     // "pl" — student native language
      cefrScaleEnabled: v.optional(v.boolean()),
      quizEnabled: v.optional(v.boolean()),
      youglishEnabled: v.optional(v.boolean()),
      ttsEnabled: v.optional(v.boolean()),
      transcriptAnalysisEnabled: v.optional(v.boolean()),
      brandingPrimary: v.optional(v.string()),     // hex color
      brandingSecondary: v.optional(v.string()),
      customDomain: v.optional(v.string()),        // "english.conversa.pl"
    })),
    subscription: v.optional(v.object({
      plan: v.string(),                  // "free", "starter", "pro", "enterprise"
      maxStudents: v.number(),
      maxTeachers: v.number(),
      expiresAt: v.optional(v.number()),
    })),
    // Billing contact for client invoicing (Phase A3, 2026-06-03)
    billingContact: v.optional(v.object({
      name: v.optional(v.string()),
      email: v.optional(v.string()),
      phone: v.optional(v.string()),
      address: v.optional(v.string()),
      taxId: v.optional(v.string()),     // NIP
      notes: v.optional(v.string()),
    })),
    createdBy: v.optional(v.id("users")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_type", ["type"])
    .index("by_status", ["status"]),

  // Groups within an org (classes, company departments)
  groups: defineTable({
    name: v.string(),                    // "OP74-25 Październik 2025 - Czerwiec 2026"
    slug: v.string(),                    // "op74-25"
    organizationId: v.id("organizations"),
    courseId: v.optional(v.string()),     // "6571" from kurs/index
    level: v.optional(v.string()),       // "B2+/C1 Advanced"
    schedule: v.optional(v.string()),    // "Tuesdays / Thursdays 19:30"
    teachers: v.optional(v.array(v.string())),
    status: v.optional(v.string()),      // "active", "discontinued"
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_slug", ["slug"])
    .index("by_name", ["name"])
    .index("by_org_name", ["organizationId", "name"]),

  // Many-to-many: which students belong to which groups
  groupMemberships: defineTable({
    groupId: v.id("groups"),
    studentId: v.id("students"),
    role: v.optional(v.string()),        // "member", "observer"
    joinedAt: v.optional(v.number()),
    leftAt: v.optional(v.number()),
    isActive: v.boolean(),
  })
    .index("by_group", ["groupId"])
    .index("by_student", ["studentId"])
    .index("by_group_student", ["groupId", "studentId"]),

  // ═══════════════════════════════════════════════════════════
  // USERS (Teachers, Admins, Super Admins)
  // ═══════════════════════════════════════════════════════════

  users: defineTable({
    email: v.string(),
    name: v.string(),
    role: v.string(),                    // "super_admin", "org_admin", "teacher", "assistant"
    organizationId: v.optional(v.id("organizations")),
    password: v.optional(v.string()),     // Admin login (plaintext, staging only)
    avatarUrl: v.optional(v.string()),
    phone: v.optional(v.string()),
    timezone: v.optional(v.string()),
    locale: v.optional(v.string()),
    lastLoginAt: v.optional(v.number()),
    status: v.string(),                  // "active", "invited", "disabled"
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_email", ["email"])
    .index("by_organization", ["organizationId"])
    .index("by_role", ["role"]),

  // ═══════════════════════════════════════════════════════════
  // STUDENTS
  // ═══════════════════════════════════════════════════════════

  students: defineTable({
    organizationId: v.optional(v.id("organizations")),
    name: v.string(),                    // "Szymon Karpiński"
    slug: v.string(),                    // "szymon-karpinski"
    email: v.optional(v.string()),       // canonical login email (password flow)
    googleEmail: v.optional(v.string()), // separate Gmail used for Google sign-in
    phone: v.optional(v.string()),
    nativeLanguage: v.optional(v.string()),  // "pl"
    level: v.string(),                   // Current CEFR: "B2", "C1"
    targetLevel: v.optional(v.string()), // Goal CEFR
    type: v.string(),                    // "individual", "group", "corporate"
    status: v.string(),                  // "active", "paused", "graduated", "archived"
    enrolledAt: v.optional(v.number()),
    notes: v.optional(v.string()),       // Teacher notes
    avatarUrl: v.optional(v.string()),
    tags: v.optional(v.array(v.string())), // ["intensive", "exam-prep"]
    groupId: v.optional(v.id("groups")),
    primaryTeacherId: v.optional(v.id("users")),
    // PBKDF2 password auth — format: "pbkdf2$<iterations>$<saltB64>$<hashB64>"
    // Both fields optional; students without a password cannot log in via the
    // password flow (they can still use direct /app/<slug> link access).
    passwordHash: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_email", ["email"])
    .index("by_googleEmail", ["googleEmail"])
    .index("by_organization", ["organizationId"])
    .index("by_org_slug", ["organizationId", "slug"])
    .index("by_status", ["status"])
    .index("by_group", ["groupId"])
    .index("by_teacher", ["primaryTeacherId"]),

  // ═══════════════════════════════════════════════════════════
  // LESSONS
  // ═══════════════════════════════════════════════════════════

  lessons: defineTable({
    organizationId: v.optional(v.id("organizations")),
    studentId: v.id("students"),
    teacherId: v.optional(v.id("users")),
    groupId: v.optional(v.id("groups")),
    date: v.string(),                    // ISO: "2025-09-26"
    title: v.string(),                   // "Lesson - 26 Sept 2025"
    topics: v.array(v.string()),         // ["technology", "AI ethics"]
    summary: v.optional(v.string()),     // AI-generated summary
    transcriptFile: v.optional(v.string()),  // Original transcript filename
    transcriptStorageId: v.optional(v.id("_storage")), // Uploaded transcript
    duration: v.optional(v.number()),    // Minutes
    lessonType: v.optional(v.string()),  // "individual", "group", "conversation", "exam_prep"
    materials: v.optional(v.array(v.object({
      name: v.string(),
      storageId: v.optional(v.id("_storage")),
      url: v.optional(v.string()),
      type: v.optional(v.string()),      // "pdf", "image", "audio", "video"
    }))),
    order: v.number(),                   // Sequence for this student
    status: v.optional(v.string()),      // "planned", "completed", "cancelled"
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_student", ["studentId"])
    .index("by_student_date", ["studentId", "date"])
    .index("by_teacher", ["teacherId"])
    .index("by_organization", ["organizationId"])
    .index("by_group", ["groupId"])
    .index("by_date", ["date"]),

  // ═══════════════════════════════════════════════════════════
  // KEYWORDS (Vocabulary)
  // ═══════════════════════════════════════════════════════════

  keywords: defineTable({
    organizationId: v.optional(v.id("organizations")),
    lessonId: v.id("lessons"),
    studentId: v.id("students"),
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
    wordType: v.optional(v.string()),    // "noun", "verb", "phrase", "idiom"
    difficulty: v.optional(v.string()),  // "A1", "A2", "B1", "B2", "C1", "C2"
    collocations: collocationsField,
    // Per-keyword enrichment — populated by em-enrichment pipeline
    synonyms: v.optional(v.array(synonymItem)),
    learnerNotes: learnerNotesField,
    enrichedAt: v.optional(v.number()),         // ms timestamp of last enrich pass
    enrichmentVersion: v.optional(v.string()),  // e.g. "v1-2026-04-24"
    enrichmentModel: v.optional(v.string()),    // e.g. "kimi-k2p5"
    spellingVariant: v.optional(v.string()),  // e.g. "sceptical" for "skeptical"
    // YouGlish
    youglishVideoId: v.optional(v.string()),
    youglishStart: v.optional(v.number()),
    youglishCaption: v.optional(v.string()),
    // Mastery tracking
    mastery: v.optional(v.number()),     // 0-100
    reviewCount: v.optional(v.number()),
    lastReviewedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_lesson", ["lessonId"])
    .index("by_student", ["studentId"])
    .index("by_word", ["word"])
    .index("by_student_word", ["studentId", "word"])
    .index("by_organization", ["organizationId"]),

  // ═══════════════════════════════════════════════════════════
  // TRANSCRIPT ANALYSES (CEFR Assessment)
  // ═══════════════════════════════════════════════════════════

  transcriptAnalyses: defineTable({
    organizationId: v.optional(v.id("organizations")),
    studentId: v.id("students"),
    lessonId: v.id("lessons"),
    // CEFR Scores (0-100)
    vocabularyRange: v.number(),
    grammaticalAccuracy: v.number(),
    fluencyAndCoherence: v.number(),
    pronunciation: v.number(),
    communicativeEffectiveness: v.number(),
    overallScore: v.number(),
    cefrBand: v.string(),                // "B1", "B2", "C1", "C2"
    // Teacher-voice analysis
    lessonSummary: v.string(),
    // Student-voice greeting — 2nd-person encouraging summary that ties last
    // lesson to overall progress. Surfaced on the dashboard hero.
    studentGreeting: v.optional(v.string()),
    strengths: v.array(v.string()),
    improvements: v.array(v.string()),
    keyErrors: v.array(v.object({
      error: v.string(),
      correction: v.string(),
      category: v.string(),              // "grammar", "vocabulary", "pronunciation"
    })),
    personalDetails: v.array(v.string()),
    practiceAdvice: v.array(v.string()),
    // Progress chain
    previousAnalysisId: v.optional(v.id("transcriptAnalyses")),
    // Per-student refinement flag: when a group-level baseline is fanned
    // out to all members via commitIngestionJobFanout, each member's
    // analysis is initially a copy of the group analysis and is marked
    // needsRefinement=true so the async VPS worker can overwrite it
    // with a student-specific refinement.
    needsRefinement: v.optional(v.boolean()),
    refinedAt: v.optional(v.number()),
    refinedBy: v.optional(v.string()),   // provider name e.g. "GLM-5-turbo"
    createdAt: v.number(),
  })
    .index("by_student", ["studentId"])
    .index("by_lesson", ["lessonId"])
    .index("by_student_date", ["studentId", "createdAt"])
    .index("by_organization", ["organizationId"])
    .index("by_needs_refinement", ["needsRefinement"]),

  // ═══════════════════════════════════════════════════════════
  // QUIZ RESULTS
  // ═══════════════════════════════════════════════════════════

  quizResults: defineTable({
    organizationId: v.optional(v.id("organizations")),
    studentId: v.id("students"),
    lessonId: v.optional(v.id("lessons")),
    quizType: v.string(),                // "vocabulary", "collocation", "spelling", "mixed"
    totalQuestions: v.number(),
    correctAnswers: v.number(),
    accuracy: v.number(),                // 0-100
    timeSpent: v.optional(v.number()),   // Seconds
    keywordResults: v.array(v.object({
      keywordId: v.id("keywords"),
      word: v.string(),
      correct: v.boolean(),
      timeMs: v.optional(v.number()),
    })),
    completedAt: v.number(),
  })
    .index("by_student", ["studentId"])
    .index("by_student_date", ["studentId", "completedAt"])
    .index("by_lesson", ["lessonId"])
    .index("by_organization", ["organizationId"]),

  // ═══════════════════════════════════════════════════════════
  // YOUGLISH CACHE
  // ═══════════════════════════════════════════════════════════

  youglishIndex: defineTable({
    keyword: v.string(),
    results: v.array(v.object({
      videoId: v.string(),
      start: v.number(),
      caption: v.string(),
    })),
    lastScraped: v.number(),
    scrapeStatus: v.string(),            // "success", "no_results", "failed"
  })
    .index("by_keyword", ["keyword"]),

  // ═══════════════════════════════════════════════════════════
  // KEYWORD BANK (spare keywords for future lessons)
  // ═══════════════════════════════════════════════════════════

  keywordBank: defineTable({
    organizationId: v.optional(v.id("organizations")),
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
    used: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_student", ["studentId"])
    .index("by_used", ["used"])
    .index("by_word", ["word"])
    .index("by_organization", ["organizationId"]),

  // ═══════════════════════════════════════════════════════════
  // TTS CACHE
  // ═══════════════════════════════════════════════════════════

  ttsCache: defineTable({
    textHash: v.string(),
    text: v.string(),
    voice: v.string(),
    audioStorageId: v.optional(v.id("_storage")),
    duration: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_hash", ["textHash"]),

  // ═══════════════════════════════════════════════════════════
  // AUDIT LOG (track all changes for compliance)
  // ═══════════════════════════════════════════════════════════

  auditLog: defineTable({
    organizationId: v.optional(v.id("organizations")),
    userId: v.optional(v.id("users")),
    action: v.string(),                  // "student.created", "lesson.updated", "quiz.completed"
    targetType: v.string(),              // "student", "lesson", "keyword"
    targetId: v.optional(v.string()),    // ID of affected entity
    details: v.optional(v.string()),     // JSON string of changes
    timestamp: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_timestamp", ["timestamp"])
    .index("by_target", ["targetType", "targetId"]),

  // ═══════════════════════════════════════════════════════════
  // ZESTAW KEYWORDS — authoritative keyword lists from the
  // English-Line teacher panel (moje.english-line.pl/teacher/zestaw).
  // These are Mike's curated per-lesson vocabulary sets — the TRUE
  // keywords that must be included by the ingestion pipeline. Scraped
  // from 408 zestaw pages covering 15 courses; ~4,331 rows total.
  // Mapping to ingestionJobs is via (courseId, lessonDate) resolved
  // through the student's groupId → group.courseId.
  // ═══════════════════════════════════════════════════════════

  zestawKeywords: defineTable({
    sid: v.string(),                     // zestaw page id, e.g. "134623"
    courseId: v.string(),                // e.g. "6571" (matches groups.courseId)
    lessonTitle: v.string(),             // "Do we need to fail"
    lessonDate: v.optional(v.string()),  // "2025-10-07" ISO date from courses_full
    nr: v.optional(v.number()),          // 1-based position inside the zestaw
    word: v.string(),
    translation: v.string(),             // Polish gloss
    exampleEn: v.optional(v.string()),   // Example sentence in English
    teacher: v.optional(v.string()),     // Teacher credited for the lesson
    courseName: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_sid", ["sid"])
    .index("by_course", ["courseId"])
    .index("by_course_date", ["courseId", "lessonDate"])
    .index("by_word", ["word"]),

  // ═══════════════════════════════════════════════════════════
  // INGESTION JOBS — transcript / notes processing pipeline
  // ═══════════════════════════════════════════════════════════
  // Staging area for raw transcript + notes PDFs flowing in via
  // Tactiq → Google Drive, the local PDF folder watcher, or manual
  // uploads through the superadmin panel. Nothing writes to the
  // live lessons / transcriptAnalyses / keywords tables until a
  // superadmin commits the staged output.

  // ═══════════════════════════════════════════════════════════
  // PRACTICE PROGRESS — per-student per-shell game state
  // ═══════════════════════════════════════════════════════════
  // Powers the 10 practice shells (Crossword, Wordsearch, GapFill, …).
  // Replaces the localStorage-only stub that the shells used during the
  // visual-design phase. One row per (studentId, shellId, exerciseId)
  // tuple — when a student replays a shell with a different exerciseId
  // (e.g. a different vocab set or lesson), they get a fresh row.
  // Schema authored by Agent 3 in the 8-agent unify-build (2026-04-30).

  // ═══════════════════════════════════════════════════════════
  // PRACTICE EXPOSURE — session-level "what has the student
  // already seen recently" log. Phase 1.1 of the content
  // scheduler (audit §4 #21, Mike CRITICAL — Ricky 2026-05-02).
  //
  // Mike's complaint: same 5-6 sentences recycle across every
  // shell despite Aleksandra's 168+ keyword bank. This table is
  // the substrate for the variety guard (G2) + Leitner spaced-
  // rep (G3) + "show fresh stuff" modal (G4). It records every
  // exercise / keyword the student is shown, indexed for fast
  // "last N days" lookups.
  //
  // Each row is one exposure event. We DON'T overwrite an
  // existing row — multiple exposures of the same item ARE the
  // signal we want to track. Pruning is handled by:
  //   1. a daily cron in convex/crons.ts that drops rows
  //      older than 30 days
  //   2. the recordExposure mutation itself, which trims the
  //      per-(student, item) history to the most-recent 5 rows
  //
  // Indices:
  //   by_student              — listForStudent (debug)
  //   by_student_item         — per-item recency lookups
  //                             (used by the cap-to-N trim)
  //   by_student_exposed      — "last 7 days" range scan, used
  //                             by recentExposures
  //   by_exposed              — pruning cron (oldest-first scan)
  // ═══════════════════════════════════════════════════════════

  practiceExposure: defineTable({
    studentSlug: v.string(),                 // owner; "__anon__" for design canvas
    itemId: v.string(),                       // exercise.exerciseId | keyword id
    itemKind: v.union(
      v.literal("exercise"),
      v.literal("keyword"),
    ),
    shellKey: v.string(),                     // which shell rendered the item
    exposedAt: v.number(),                    // ms epoch
  })
    .index("by_student", ["studentSlug"])
    .index("by_student_item", ["studentSlug", "itemId"])
    .index("by_student_exposed", ["studentSlug", "exposedAt"])
    .index("by_exposed", ["exposedAt"]),

  // ═══════════════════════════════════════════════════════════
  // SENTENCE FRESHNESS CACHE — Phase 2 of audit §4 #21
  // (Mike CRITICAL — Ricky 2026-05-02).
  //
  // When a keyword has been seen by a student more than once recently
  // (per practiceExposure), the variety guard regenerates a fresh
  // example sentence via Qwen2.5-3B (well, qwen3.5:9b in practice on
  // Bob's VPS — Ollama at 127.0.0.1:11434, fronted by the Node service
  // at /api/sentence-freshness).
  //
  // Cache key = (keyword, cefr, topic). One row per key. We keep the
  // 5 most-recent generations as a `sentences` array so:
  //   1. The novelty constraint can list past sentences as "forbidden"
  //   2. We don't burn Qwen tokens on repeats — pick a sentence not yet
  //      shown to this student in the last 30d.
  //
  // Anonymous (no student) calls are allowed — the cache is global per
  // (keyword, cefr, topic), not per-student. Per-student exposure of
  // generated sentences is tracked in practiceExposure already.
  // ═══════════════════════════════════════════════════════════
  sentenceFreshnessCache: defineTable({
    keyword: v.string(),                     // lowercased lemma
    cefr: v.string(),                        // "A1".."C2"; "*" for any-level
    topic: v.string(),                       // lowercased topic; "*" for none
    sentences: v.array(v.object({
      text: v.string(),                      // the generated sentence
      generatedAt: v.number(),               // ms epoch
      model: v.optional(v.string()),         // "qwen3.5:9b"
    })),
    updatedAt: v.number(),
  })
    .index("by_key", ["keyword", "cefr", "topic"])
    .index("by_keyword", ["keyword"])
    .index("by_updated", ["updatedAt"]),

  // ═══════════════════════════════════════════════════════════
  // PRACTICE SESSION — mid-shell snapshot + run-control state
  // (Phase 1.8 of audit §4 #21, Mike's add-on, Ricky 2026-05-02).
  //
  // Purpose: persist the in-flight state of a shell so a tab refresh
  // (or a "leave and come back later") can prompt the student with
  // {Continue · Wznów / Start fresh · Zacznij od nowa}, and on Start
  // fresh follow up with {New questions · Nowe pytania / Repeat same
  // · Powtórz te same}.
  //
  // One row per (studentSlug, shellKey). The latest non-completed
  // row IS the pending session. We never keep > 1 active row per
  // (student, shell) — saveSessionSnapshot is an upsert against
  // the by_student_shell index, and discardSession deletes outright.
  //
  // `state` is a JSON-stringified, shell-specific blob. The schema
  // doesn't validate its inner shape so each shell can store
  // whatever it needs (puzzleIdx, found, guessed, entries, hintsUsed,
  // ...) without requiring a schema migration when a shell evolves.
  //
  // `questionIds` is the snapshot's question set, kept structured (not
  // inside `state`) so the "Repeat same" branch of Start fresh can hand
  // the same ids to the puzzle generator without re-parsing JSON.
  // ═══════════════════════════════════════════════════════════
  practiceSession: defineTable({
    studentSlug: v.string(),
    shellKey: v.string(),
    startedAt: v.number(),
    updatedAt: v.number(),
    state: v.string(),                       // JSON-stringified shell-specific state
    questionIds: v.array(v.string()),        // snapshot's question set (for "Repeat same")
    isComplete: v.boolean(),
  })
    .index("by_student_shell", ["studentSlug", "shellKey"]),

  practiceProgress: defineTable({
    // Owner. We use studentId (not a teacher userId) because shells are
    // played by students. Optional so the design canvas can still smoke-
    // test mutations without a logged-in student. studentSlug is denorm-
    // alised so the HTTP `/api/mutation` endpoint can resolve the row
    // without requiring the client to know the student's Convex _id.
    studentId: v.optional(v.id("students")),
    studentSlug: v.optional(v.string()),
    organizationId: v.optional(v.id("organizations")),

    shellId: v.string(),                       // "crossword" | "wordsearch" | …
    exerciseId: v.optional(v.string()),        // vocab-set id, lesson id, etc.

    progress: v.number(),                      // 0..1 fractional completion
    completed: v.boolean(),
    hintsUsed: v.number(),
    lastState: v.optional(v.string()),         // "empty"|"active"|"wrong"|"correct"|"complete"
    meta: v.optional(v.any()),                 // per-shell free-form payload

    startedAt: v.number(),
    updatedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_student", ["studentId"])
    .index("by_student_shell", ["studentId", "shellId"])
    .index("by_student_exercise", ["studentId", "shellId", "exerciseId"])
    .index("by_slug_shell", ["studentSlug", "shellId"])
    .index("by_slug_exercise", ["studentSlug", "shellId", "exerciseId"])
    .index("by_organization", ["organizationId"]),

  ingestionJobs: defineTable({
    organizationId: v.optional(v.id("organizations")),
    createdByUserId: v.optional(v.id("users")),
    status: v.string(),
      // "queued" | "processing" | "awaiting_review" | "committed" | "failed"
    sourceKind: v.string(),
      // "tactiq_drive" | "pdf_watcher" | "manual_upload" | "manual_paste"

    // ── Raw inputs ─────────────────────────────────────────
    transcriptStorageId: v.optional(v.id("_storage")),
    transcriptText: v.optional(v.string()),
    notesStorageId: v.optional(v.id("_storage")),
    notesText: v.optional(v.string()),
    sourceFilename: v.optional(v.string()),

    // ── Detected metadata from pre-analysis ────────────────
    detectedStudentId: v.optional(v.id("students")),
    detectedStudentSlug: v.optional(v.string()),
    detectedDate: v.optional(v.string()),
    detectedTitle: v.optional(v.string()),
    detectedTopics: v.optional(v.array(v.string())),
    detectedDuration: v.optional(v.number()),

    // ── Zestaw (authoritative panel-scraped keyword) linkage ──
    // Resolved at process-time from the student's group.courseId +
    // detectedDate. When present, the keyword prompt is prepended
    // with a MUST_INCLUDE block so the LLM emits these exact words.
    zestawSid: v.optional(v.string()),
    zestawLessonTitle: v.optional(v.string()),
    zestawKeywords: v.optional(v.array(v.object({
      word: v.string(),
      translation: v.string(),
      exampleEn: v.optional(v.string()),
      nr: v.optional(v.number()),
    }))),

    // ── Staged output (editable, pre-commit) ───────────────
    stagedAnalysis: v.optional(v.object({
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
    })),
    stagedKeywords: v.optional(v.array(v.object({
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
      collocations: collocationsField,
    }))),

    // ── Commit linkage (populated when committed) ──────────
    committedLessonId: v.optional(v.id("lessons")),
    committedAnalysisId: v.optional(v.id("transcriptAnalyses")),
    committedKeywordIds: v.optional(v.array(v.id("keywords"))),

    // ── Processing metadata ────────────────────────────────
    promptVersion: v.optional(v.string()),
    modelUsed: v.optional(v.string()),
    inputTokens: v.optional(v.number()),
    outputTokens: v.optional(v.number()),

    // ── Error handling ─────────────────────────────────────
    error: v.optional(v.string()),
    retryCount: v.optional(v.number()),

    createdAt: v.number(),
    processedAt: v.optional(v.number()),
    committedAt: v.optional(v.number()),
  })
    .index("by_organization", ["organizationId"])
    .index("by_status", ["status"])
    .index("by_org_status", ["organizationId", "status"])
    .index("by_created_by", ["createdByUserId"])
    .index("by_created", ["createdAt"]),

  // ═══════════════════════════════════════════════════════════
  // PRACTICE SHELL RECOMMENDATIONS — cached output of
  // pickShellsForStudent so we don't recompute on every page load.
  // ═══════════════════════════════════════════════════════════
  practiceRecommendations: defineTable({
    organizationId: v.optional(v.id("organizations")),
    studentId: v.id("students"),
    shells: v.array(v.object({
      shell: v.string(),
      weight: v.number(),
      reason: v.string(),
      topErrorIds: v.array(v.string()),
    })),
    studentLevel: v.string(),
    kbVersion: v.optional(v.string()),    // hash/etag of the KB used
    createdAt: v.number(),
  })
    .index("by_student", ["studentId"])
    .index("by_organization", ["organizationId"]),

  // ═══════════════════════════════════════════════════════════
  // EXERCISES — English Metropolis exercise bank (Layer 1 import).
  // Imported from /root/.openclaw/workspace/english-metropolis-exercises-all.json
  // by Agent A1. Layer 2 enrichment fields (interferenceTags,
  // polishDifficultyScore, highPriorityFor, decayRate) are populated
  // later by the interference-extraction pipeline.
  // ═══════════════════════════════════════════════════════════

  exercises: defineTable({
    exerciseId: v.string(),        // "em-0001"
    category: v.string(),          // "grammar" | "vocabulary" | "use-of-english" | "reading" | "listening" | "writing"
    subCategory: v.string(),       // "present-simple"
    cefrLevel: v.string(),         // "A1" | "A2" | "B1" | "B2" | "C1"
    difficultyTier: v.number(),    // 1-5
    title: v.string(),
    description: v.string(),
    focusArea: v.string(),
    questions: v.array(v.object({
      questionId: v.string(),
      type: v.string(),            // "fill-blank" | "multiple-choice"
      prompt: v.string(),
      answer: v.string(),
      options: v.optional(v.array(v.string())),
      instructionEN: v.string(),
      instructionPL: v.string(),
      hintPL: v.optional(v.string()),
      explanationPL: v.optional(v.string()),
      explanationENSimple: v.optional(v.string()),
    })),
    // Layer 2 enrichment fields (populated after interference extraction)
    interferenceTags: v.optional(v.array(v.string())),
    polishDifficultyScore: v.optional(v.number()),
    highPriorityFor: v.optional(v.array(v.string())),
    decayRate: v.optional(v.number()),
    // Sprint-2 grouping (Agent A, 2026-05-01)
    // FK to exerciseGroups.groupId — populated by the
    // cluster-exercises-into-groups auto-tagger.
    groupId: v.optional(v.string()),
    // Which of the 38 ShellKeys can render this exercise — derived
    // from question[].type by the same auto-tagger. Denormalised on
    // the row so the per-shell query can filter without re-deriving.
    compatibleShells: v.optional(v.array(v.string())),
    importedAt: v.number(),
    enrichedAt: v.optional(v.number()),
  })
    .index("by_exerciseId", ["exerciseId"])
    .index("by_cefr", ["cefrLevel"])
    .index("by_category", ["category"])
    .index("by_subCategory", ["subCategory"])
    .index("by_cefr_category", ["cefrLevel", "category"])
    .index("by_cefr_subCategory", ["cefrLevel", "subCategory"])
    .index("by_groupId", ["groupId"]),

  // ═══════════════════════════════════════════════════════════
  // EXERCISE GROUPS — test-english.com-style topic clustering
  // (Sprint-2, Agent A, 2026-05-01).
  //
  // Each group = one (cefrLevel, category, subCategory) cluster of
  // exercises, surfaced as a card on the student-facing /practice
  // landing page. Students pick a group → pick a compatible shell →
  // play the exercises through that shell. Auto-tagged by
  // scripts/cluster-exercises-into-groups.ts.
  // ═══════════════════════════════════════════════════════════

  exerciseGroups: defineTable({
    groupId: v.string(),                 // "modal-verbs-speculation-deduction-b2"
    topicEn: v.string(),                 // "Modal verbs: speculation and deduction"
    topicPl: v.string(),                 // "Czasowniki modalne: spekulacja i dedukcja"
    cefrLevel: v.string(),               // "A1" | "A2" | "B1" | "B2" | "C1"
    category: v.string(),                // "grammar" | "vocabulary" | "use-of-english" | …
    subCategory: v.optional(v.string()), // matches exercises.subCategory
    description: v.optional(v.string()),
    descriptionPl: v.optional(v.string()),
    illustrationUrl: v.optional(v.string()),     // CDN path or emoji-key
    errorCategories: v.array(v.string()),         // KB error categories this group addresses
    exerciseCount: v.optional(v.number()),        // denormalised for fast list rendering
    compatibleShells: v.optional(v.array(v.string())), // union of member exercises' shells
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_groupId", ["groupId"])
    .index("by_cefr", ["cefrLevel"])
    .index("by_cefr_category", ["cefrLevel", "category"])
    .index("by_subCategory", ["subCategory"]),

  // ═══════════════════════════════════════════════════════════
  // SCHEDULING — Teacher availability + lesson bookings
  // (Conversa calendar, built 2026-06-02. Bookings are separate
  // from `lessons` so the post-lesson pipeline stays untouched:
  // `lessons` = taught record, `lessonBookings` = calendar slots.)
  // ═══════════════════════════════════════════════════════════

  teacherAvailability: defineTable({
    organizationId: v.id("organizations"),
    dayOfWeek: v.number(),           // 0=Sunday ... 5=Friday, 6=Saturday
    startTime: v.string(),           // "17:10" (Europe/Warsaw)
    endTime: v.string(),             // "20:30" (Europe/Warsaw)
    slotMinutes: v.number(),         // lesson length, e.g. 60
    gapMinutes: v.number(),          // break between lessons, e.g. 10
    active: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization", ["organizationId"]),

  // ═══════════════════════════════════════════════════════════
  // BILLING — prepaid lesson packages + CEFR certificates
  // (Phase A3, 2026-06-03. Statement data itself comes from
  // `lessons` (taught) + `lessonBookings` (late cancellations) via
  // scheduling.getMonthlyLessonStats — no separate table needed.)
  // ═══════════════════════════════════════════════════════════

  lessonPackages: defineTable({
    organizationId: v.id("organizations"),
    studentId: v.id("students"),
    name: v.string(),                  // "10-lesson block"
    totalLessons: v.number(),          // prepaid lesson count
    purchasedAt: v.number(),           // epoch ms — consumption counts from here
    expiresAt: v.optional(v.number()),
    notes: v.optional(v.string()),
    status: v.string(),                // "active" | "cancelled"
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_student", ["studentId"]),

  certificates: defineTable({
    organizationId: v.id("organizations"),
    studentId: v.id("students"),
    studentName: v.string(),           // denormalised so public verification needs no joins
    cefrLevel: v.string(),             // "B2"
    lessonsCompleted: v.number(),      // at issue time
    hoursCompleted: v.number(),        // at issue time (sum of lesson durations)
    verificationId: v.string(),        // "CONV-2026-A1B2C3" — public lookup key
    issuedByName: v.string(),
    issuedAt: v.number(),
    status: v.string(),                // "issued" | "revoked"
  })
    .index("by_organization", ["organizationId"])
    .index("by_student", ["studentId"])
    .index("by_verificationId", ["verificationId"]),

  lessonBookings: defineTable({
    organizationId: v.id("organizations"),
    studentId: v.id("students"),
    startUtc: v.number(),            // epoch ms — slot start
    endUtc: v.number(),              // epoch ms — slot end
    dateWarsaw: v.string(),          // "2026-06-05" (Europe/Warsaw, for display/grouping)
    timeWarsaw: v.string(),          // "17:10" (Europe/Warsaw)
    status: v.string(),              // "scheduled" | "completed" | "cancelled" | "cancelled_late"
    bookedBy: v.string(),            // "student" | "school_admin" | "superadmin"
    bookedByName: v.optional(v.string()),
    cancelledBy: v.optional(v.string()),     // same actor vocabulary
    cancelledByName: v.optional(v.string()),
    cancelledAt: v.optional(v.number()),
    billable: v.optional(v.boolean()),       // true: completed OR cancelled within 24h
    notes: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_student", ["studentId"])
    .index("by_org_start", ["organizationId", "startUtc"]),

  // ═══════════════════════════════════════════════════════════
  // INTERFERENCE PATTERNS — Polish-L1-on-English error patterns
  // built from training samples. Bridge layer between KB error
  // categories and exercise subCategories. Populated by the
  // interference-extraction pipeline.
  // ═══════════════════════════════════════════════════════════

  // ═══════════════════════════════════════════════════════════
  // AUTH SESSIONS — server-side session tokens for admin + student
  // logins. The raw token is returned to the client once at login;
  // we store only its SHA-256 hash. Protected queries/mutations
  // require a valid, unexpired token (see authHelpers.requireAdmin /
  // requireStudent). Added 2026-06-02 (Phase A1 security hardening —
  // previously all admin functions were publicly callable).
  // ═══════════════════════════════════════════════════════════

  authSessions: defineTable({
    kind: v.string(),                          // "admin" | "student"
    userId: v.optional(v.id("users")),         // set for admin sessions
    studentId: v.optional(v.id("students")),   // set for student sessions
    tokenHash: v.string(),                     // SHA-256 hex of the raw token
    createdAt: v.number(),
    expiresAt: v.number(),
    lastUsedAt: v.optional(v.number()),
  })
    .index("by_tokenHash", ["tokenHash"])
    .index("by_user", ["userId"])
    .index("by_student", ["studentId"]),

  interferencePatterns: defineTable({
    patternId: v.string(),         // "article-omission", "third-person-s", etc.
    cefrLevel: v.string(),         // typical level this error appears
    frequency: v.number(),         // % of training samples with this pattern (0..1)
    polishCause: v.string(),       // L1 transfer explanation (Polish + English)
    polishCauseEn: v.string(),     // English-only version for Mode A non-PL students
    typicalErrors: v.array(v.string()),    // 3-5 example wrong productions
    correctPatterns: v.array(v.string()),  // the right forms
    interferenceStrength: v.number(),      // 1-10
    decayRate: v.number(),                  // 0..1
    spacedRepetitionWeight: v.number(),    // recommended review interval
    // Mapping to exercise subCategories (for the bridge layer)
    matchingSubCategories: v.array(v.string()),
    matchingErrorCategories: v.array(v.string()),  // matches KB error.category
    builtAt: v.number(),
    sourceCount: v.number(),       // how many training samples backed this
  })
    .index("by_patternId", ["patternId"])
    .index("by_cefr", ["cefrLevel"])
    .index("by_strength", ["interferenceStrength"]),
});
