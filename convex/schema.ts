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
      brandingPrimary: v.optional(v.string()),     // hex color — drives --org-primary
      brandingSecondary: v.optional(v.string()),   // drives --org-accent
      brandingDark: v.optional(v.string()),        // optional darker shade for gradients
      logoUrl: v.optional(v.string()),             // per-school admin logo
      subdomain: v.optional(v.string()),           // "conversa" -> conversa.englishmetro.com
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
    schedule: v.optional(v.string()),    // "Tuesdays / Thursdays 19:30" (display copy)
    // Machine-readable timetable (2026-08-10). A group runs on FIXED times —
    // students never self-book one — and once it fills, those times must come
    // off the 1:1 grid so the teacher is not double-booked. Mon-Thu only, and
    // the times must sit on the lesson grid (14:00/15:15/16:30/17:45/19:00).
    sessions: v.optional(v.array(v.object({
      dayOfWeek: v.number(),             // 1=Mon .. 4=Thu
      startTime: v.string(),             // "19:00" Europe/Warsaw
    }))),
    // A group only blocks 1:1 availability once it is actually viable.
    minStudents: v.optional(v.number()), // default 3
    maxStudents: v.optional(v.number()), // default 4
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
    // Per-teacher scheduling (2026-06-04): once a school admin sets a teacher's
    // availability the one time, this flips true and the school view locks to
    // read-only — the teacher then owns their own availability.
    availabilityHandedOff: v.optional(v.boolean()),
    deletedAt: v.optional(v.number()),   // soft-delete (teacher removal retains all data)
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_email", ["email"])
    .index("by_organization", ["organizationId"])
    .index("by_role", ["role"])
    .index("by_org_role", ["organizationId", "role"]),

  // Magic-link login tokens (teacher portal, 2026-06-04). Only the SHA-256 hash
  // of the token is stored; single-use (usedAt) and short-lived (expiresAt).
  magicTokens: defineTable({
    tokenHash: v.string(),
    userId: v.id("users"),
    email: v.string(),
    expiresAt: v.number(),
    usedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_tokenHash", ["tokenHash"])
    .index("by_userId", ["userId"]),

  // Student e-mail confirmation and password reset (2026-08-10). Same shape and
  // same rules as magicTokens: only the SHA-256 hash is stored, single-use via
  // usedAt, and the raw token exists only in the e-mail we send. Separate table
  // because magicTokens.userId points at `users` (teachers), not `students`.
  studentTokens: defineTable({
    kind: v.string(),                  // "verify" | "reset"
    tokenHash: v.string(),
    studentId: v.id("students"),
    email: v.string(),                 // address the link was sent to
    expiresAt: v.number(),
    usedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_tokenHash", ["tokenHash"])
    .index("by_student_kind", ["studentId", "kind"]),

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
    // When the student proved they control `email` by clicking the confirmation
    // link. Absent = unconfirmed. Students who signed in with Google are stamped
    // at creation (Google has already verified the address), and the roster that
    // predates this field is grandfathered — see students:backfillVerifiedAt.
    emailVerifiedAt: v.optional(v.number()),
    // What the student told us about themselves right after paying, so the first
    // lesson does not start from zero. Kept separate from `level`, which stays the
    // teacher's assessed value — see students:submitIntake.
    intake: v.optional(v.object({
      studyDuration: v.string(),   // none | lt1 | 1-2 | 3-5 | 5plus | rusty
      selfLevel: v.string(),       // A1..C2, or "unknown"
      lessonType: v.optional(v.string()),  // one-to-one | specialist | group
      submittedAt: v.number(),
    })),
    // Bought as a child's account. Set at checkout by the buying adult and never
    // by the learner. AI lesson analysis is unavailable for these accounts —
    // permanently and server-side, not merely hidden. Mike, 2026-08-10.
    isMinor: v.optional(v.boolean()),
    // YYYY-MM-DD, declared at self-signup. Compulsory from 2026-08-10 because
    // only adults may hold an account (a parent buys for a child instead, which
    // is what isMinor above records). Absent on the roster that predates the
    // rule and on students a teacher created — see convex/enrolmentRules.ts.
    // Never re-derived from anything: it is what the account holder told us.
    dateOfBirth: v.optional(v.string()),
    // Bajla normally switches on with the paid AI add-on, which is also where
    // her consent is captured. Students enrolled before 2026-08-10 keep her for
    // free (Mike), so they have nowhere to give that consent at a till — this
    // records the one-tap consent the popup asks them for instead.
    bajlaConsent: v.optional(v.object({
      grantedAt: v.number(),
      noticeVersion: v.string(),
      revokedAt: v.optional(v.number()),
    })),
    // Optional paid AI lesson analysis. Absent = never opted in; a value with
    // revokedAt set = opted in and later withdrawn. Recording and analysis only
    // ever run while this is granted and the account is not a minor's.
    lessonAnalysis: v.optional(v.object({
      grantedAt: v.number(),
      noticeVersion: v.string(),   // which notice they were shown when consenting
      revokedAt: v.optional(v.number()),
      paidOrderId: v.optional(v.id("lessonOrders")),
    })),
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
    teacherId: v.optional(v.id("users")),  // per-teacher availability (added 2026-06-04);
                                           // legacy rows (org-wide) leave this unset.
    dateWarsaw: v.optional(v.string()),    // one-off availability date; absent means recurring weekly.
    dayOfWeek: v.number(),           // 0=Sunday ... 5=Friday, 6=Saturday
    startTime: v.string(),           // "17:10" (Europe/Warsaw)
    endTime: v.string(),             // "20:30" (Europe/Warsaw)
    slotMinutes: v.number(),         // lesson length, e.g. 60
    gapMinutes: v.number(),          // break between lessons, e.g. 10
    active: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_org_teacher", ["organizationId", "teacherId"]),

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
    availableFrom: v.optional(v.number()), // booking gate when early performance was not requested
    earlyPerformanceRequested: v.optional(v.boolean()),
    earlyPerformanceRequestedAt: v.optional(v.number()),
    termsVersion: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
    notes: v.optional(v.string()),
    status: v.string(),                // "active" | "cancelled"
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_student", ["studentId"]),

  // Student-submitted lesson package orders (pre-payment-gateway flow,
  // 2026-07-10): student picks a live package + billing details → Mike
  // invoices manually → superadmin confirms payment → lessonPackage created.
  lessonOrders: defineTable({
    organizationId: v.id("organizations"),
    studentId: v.id("students"),
    packageId: v.string(),             // catalog id, e.g. "momentum"
    packageName: v.string(),           // "Fluency Momentum"
    lessons: v.number(),               // lessons granted when confirmed
    priceLabel: v.string(),            // "880 PLN" (display; invoicing is manual)
    billing: v.object({
      fullName: v.string(),
      email: v.string(),
      phone: v.optional(v.string()),
      addressLine: v.optional(v.string()),
      city: v.optional(v.string()),
      postalCode: v.optional(v.string()),
      country: v.optional(v.string()),
      company: v.optional(v.string()),
      nip: v.optional(v.string()),
      notes: v.optional(v.string()),
    }),
    status: v.string(),                // "pending_invoice" | "payment_pending" | "confirmed" | "cancelled"
    paymentId: v.optional(v.id("p24Payments")),
    paymentAmount: v.optional(v.number()), // gross amount in grosze
    p24SessionId: v.optional(v.string()),
    p24OrderId: v.optional(v.number()),
    earlyPerformanceRequested: v.optional(v.boolean()),
    earlyPerformanceRequestedAt: v.optional(v.number()),
    termsVersion: v.optional(v.string()),
    confirmedBy: v.optional(v.string()),
    confirmedAt: v.optional(v.number()),
    packageRef: v.optional(v.id("lessonPackages")),   // created on confirm
    notificationStatus: v.optional(v.string()),      // "pending" | "sent" | "failed"
    notificationAttempts: v.optional(v.number()),
    notificationLastError: v.optional(v.string()),
    notificationUpdatedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_student", ["studentId"])
    .index("by_organization", ["organizationId"])
    .index("by_status", ["status"]),

  // One P24 transaction may pay for several lesson-package order lines.
  // The webhook resolves the transaction by the random sessionId and allocates
  // packages idempotently only after transaction/verify succeeds.
  p24Payments: defineTable({
    checkoutRef: v.string(),
    sessionId: v.string(),
    organizationId: v.id("organizations"),
    studentId: v.id("students"),
    orderIds: v.array(v.id("lessonOrders")),
    amount: v.number(),                 // grosze
    itemsKey: v.optional(v.string()),   // "packageId×qty|…" sorted — a retry with an
                                        // edited cart must not resume this payment
    currency: v.string(),
    email: v.string(),
    lang: v.string(),
    consentTerms: v.optional(v.boolean()),
    consentImmediate: v.optional(v.boolean()),
    consentMarketing: v.optional(v.boolean()),
    // The optional paid AI lesson analysis. Recorded on the payment, not on the
    // student, until the money actually clears — see p24:markPaid.
    analysisAddon: v.optional(v.boolean()),
    // Set when this payment redeems a server-priced quote instead of the
    // CATALOG. The quote, not the browser, supplied the amount.
    quoteRef: v.optional(v.string()),
    // The separate, explicit consent to the AI lesson analysis, given when the
    // analysis is what is being bought. Kept apart from consentTerms and
    // consentMarketing on purpose — it must never be bundled into either.
    consentAnalysis: v.optional(v.boolean()),
    consentCapturedAt: v.optional(v.number()),
    termsVersion: v.optional(v.string()),
    status: v.string(),                 // created | registered | registration_failed | paid | superseded
    token: v.optional(v.string()),
    p24OrderId: v.optional(v.number()),
    methodId: v.optional(v.number()),   // what P24 report was actually used
    // What the customer picked on our checkout. Przelewy24 pin a registered
    // transaction to this method and offer no way to change it on their page,
    // so a resumed payment with a different choice would strand the customer.
    requestedMethod: v.optional(v.number()),
    statement: v.optional(v.string()),
    error: v.optional(v.string()),
    allocationErrors: v.optional(v.array(v.string())), // captured but not allocated — needs a human
    registeredAt: v.optional(v.number()),
    verifiedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_checkout_ref", ["checkoutRef"])
    .index("by_session_id", ["sessionId"])
    .index("by_student", ["studentId"])
    .index("by_status", ["status"]),

  // ═══════════════════════════════════════════════════════════
  // PRICE QUOTES (2026-08-17)
  //
  // The one way an amount other than the CATALOG list price can reach
  // Przelewy24. Before this existed, a negotiated price had no home in the
  // app at all: on 2026-08-17 a 2000 PLN package had to be registered against
  // the P24 API from a throwaway script, which meant no p24Payments row, so
  // the /p24/status webhook answered 404, verify was never called and nothing
  // auto-credited. A quote is created and priced SERVER-SIDE, the browser only
  // ever carries its reference, and it is redeemed through the same
  // createPayment → preparePayment → webhook → finalizePaid chain as any other
  // order. There is deliberately no client-supplied amount anywhere.
  // ═══════════════════════════════════════════════════════════
  priceQuotes: defineTable({
    quoteRef: v.string(),                 // "Q-<uuid>" — the only thing the browser holds
    organizationId: v.optional(v.id("organizations")),   // students.organizationId is optional
    studentId: v.id("students"),
    // "analysis_lesson"  — AI analysis for one named lesson
    // "analysis_account" — AI analysis for the whole account, past and future
    // "negotiated"       — a hand-agreed package price, created by a superadmin
    kind: v.string(),
    label: v.string(),                    // what the customer is buying, in their language
    amount: v.number(),                   // grosze, computed here and nowhere else
    currency: v.string(),
    listAmount: v.optional(v.number()),   // grosze at list, for the saving line and the audit
    pricingBasis: v.string(),             // how `amount` was derived, in words, for the audit
    // What paying redeems. Package lines are allocated by the normal
    // lessonOrders → lessonPackages loop in p24:finalizePaid.
    grantAnalysisScope: v.optional(v.string()),   // "lesson" | "account"
    grantLessonId: v.optional(v.id("lessons")),
    packageLines: v.optional(v.array(v.object({
      packageId: v.string(),
      name: v.string(),
      lessons: v.number(),
      qty: v.number(),
      amount: v.number(),                 // grosze for this line
    }))),
    createdBySource: v.string(),          // "self_serve" | "admin"
    createdByUserId: v.optional(v.id("users")),
    status: v.string(),                   // "open" | "consumed" | "cancelled"
    paymentId: v.optional(v.id("p24Payments")),
    consumedAt: v.optional(v.number()),
    expiresAt: v.number(),
    // ── Instalment plans (2026-09-03) ──────────────────────────────────────
    // A hand-agreed price paid in N parts is N negotiated quotes sharing one
    // planRef. Each quote carries its own share of the lessons, so a missed
    // instalment can only ever cost that instalment's lessons, never the whole
    // package. dueAt is what reconcileAlerts watches: an open quote past its
    // dueAt is an `instalment_overdue` alert in the command centre. Nothing
    // else in the system had a due date, so a link emailed and never opened
    // was invisible forever.
    planRef: v.optional(v.string()),          // "PLAN-<uuid>", shared by the plan's quotes
    instalmentNo: v.optional(v.number()),     // 1-based
    instalmentCount: v.optional(v.number()),
    dueAt: v.optional(v.number()),
    remindersSentAt: v.optional(v.array(v.number())),
    planMailStatus: v.optional(v.string()),   // "pending" | "sent" | "failed" — the one mail with every link
    planMailError: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_quote_ref", ["quoteRef"])
    .index("by_student", ["studentId"])
    .index("by_status", ["status"])
    .index("by_plan", ["planRef"]),

  // Per-lesson AI analysis entitlement.
  //
  // The account-wide consent still lives on `students.lessonAnalysis` and is
  // unchanged. This table exists so a student can buy the analysis for ONE
  // lesson without being handed the whole account forever for 20 PLN — which
  // is what would otherwise happen, because the only entitlement the system
  // had was account-wide and permanent.
  analysisEntitlements: defineTable({
    organizationId: v.optional(v.id("organizations")),
    studentId: v.id("students"),
    lessonId: v.id("lessons"),
    grantedAt: v.number(),
    noticeVersion: v.string(),
    paymentId: v.optional(v.id("p24Payments")),
    quoteRef: v.optional(v.string()),
    revokedAt: v.optional(v.number()),
    // Set once the analysis for this lesson actually exists, so the backfill
    // worker knows what it still owes and never re-generates a paid analysis.
    fulfilledAt: v.optional(v.number()),
  })
    .index("by_student", ["studentId"])
    .index("by_lesson", ["lessonId"])
    .index("by_student_lesson", ["studentId", "lessonId"])
    .index("by_fulfilled", ["fulfilledAt"]),

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
    teacherId: v.optional(v.id("users")),  // teacher whose slot this is (added 2026-06-04)
    studentId: v.id("students"),
    startUtc: v.number(),            // epoch ms — slot start
    endUtc: v.number(),              // epoch ms — slot end
    dateWarsaw: v.string(),          // "2026-06-05" (Europe/Warsaw, for display/grouping)
    timeWarsaw: v.string(),          // "17:10" (Europe/Warsaw)
    status: v.string(),              // "scheduled" | "completed" | "cancelled" | "cancelled_late" | "no_show"
    meetLink: v.optional(v.string()),// video room for this lesson (Jitsi now; 8x8 JaaS later)
    bookedBy: v.string(),            // "student" | "school_admin" | "superadmin"
    bookedByName: v.optional(v.string()),
    cancelledBy: v.optional(v.string()),     // same actor vocabulary
    cancelledByName: v.optional(v.string()),
    cancelledAt: v.optional(v.number()),
    noShowAt: v.optional(v.number()),
    noShowMarkedBy: v.optional(v.string()),
    billable: v.optional(v.boolean()),       // true: completed, no-show, or cancelled within 24h
    notes: v.optional(v.string()),
    // A booking made together with others (a hand-picked batch or a "repeat
    // weekly" plan, 2026-09-01). seriesId = the first booking's id in that
    // request; "cancel the rest of the series" and the console badge key on it.
    seriesId: v.optional(v.string()),
    seriesKind: v.optional(v.string()),      // "batch" | "weekly"
    notificationStatus: v.optional(v.string()),
    notificationAttempts: v.optional(v.number()),
    notificationLastError: v.optional(v.string()),
    notificationUpdatedAt: v.optional(v.number()),
    cancellationNotificationStatus: v.optional(v.string()),
    cancellationNotificationAttempts: v.optional(v.number()),
    cancellationNotificationLastError: v.optional(v.string()),
    cancellationNotificationUpdatedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_student", ["studentId"])
    .index("by_org_start", ["organizationId", "startUtc"])
    .index("by_org_teacher", ["organizationId", "teacherId"]),

  operationsAlerts: defineTable({
    fingerprint: v.string(),
    kind: v.string(),
    severity: v.string(),
    title: v.string(),
    message: v.string(),
    status: v.string(),
    studentId: v.optional(v.id("students")),
    orderId: v.optional(v.id("lessonOrders")),
    packageId: v.optional(v.id("lessonPackages")),
    bookingId: v.optional(v.id("lessonBookings")),
    quoteRef: v.optional(v.string()),        // instalment_overdue: the unpaid quote
    details: v.optional(v.string()),
    firstSeenAt: v.number(),
    lastSeenAt: v.number(),
    acknowledgedAt: v.optional(v.number()),
    acknowledgedBy: v.optional(v.string()),
    resolvedAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_fingerprint", ["fingerprint"])
    .index("by_status", ["status"])
    .index("by_student", ["studentId"])
    .index("by_kind", ["kind"]),

  // ═══════════════════════════════════════════════════════════
  // CURRICULUM — ordered per-student lesson plan (the "30-lesson
  // pack"). Additive (2026-06-04). `lessons` stays the taught record;
  // curriculumItems is the FORWARD plan. A taught slot backlinks to its
  // delivered lessons row via lessonId. pdfUrl carries the pre-made
  // lesson PDF once generated.
  // ═══════════════════════════════════════════════════════════

  curriculumItems: defineTable({
    organizationId: v.optional(v.id("organizations")),
    studentId: v.id("students"),
    position: v.number(),                 // 1..30 ordered slot
    title: v.string(),
    theme: v.optional(v.string()),
    topics: v.array(v.string()),
    languageFocus: v.optional(v.string()),
    targetCefr: v.optional(v.string()),
    keywords: v.optional(v.array(v.string())),
    aim: v.optional(v.string()),
    status: v.string(),                   // "taught" | "planned"
    lessonId: v.optional(v.id("lessons")), // set when delivered → links plan slot to taught lesson
    pdfUrl: v.optional(v.string()),       // pre-made lesson PDF (Kelly questions + keyword table)
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_student", ["studentId"])
    .index("by_student_position", ["studentId", "position"])
    .index("by_organization", ["organizationId"]),

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

  // ═══════════════════════════════════════════════════════════
  // WORLD PROGRESS — the open-world game at /play ("Metro Pass").
  // One row per student. Until 2026-09-05 every number the game showed
  // lived in the browser's localStorage, so a cleared cache or a second
  // device reset a learner to zero and no ranking was possible. The
  // client keeps localStorage as an offline cache and merges on load;
  // this row is the truth that survives the browser. `state` is the
  // game's own JSON (per-district rounds, mastery, street items, stamps,
  // badges, streak) kept opaque here so the game can evolve it without a
  // schema change; the columns beside it are what the leaderboard sorts on.
  // ═══════════════════════════════════════════════════════════
  worldProgress: defineTable({
    studentId: v.id("students"),
    xp: v.number(),                          // lifetime XP, monotonic (server keeps the max)
    rank: v.string(),                        // rank name at last save, for the leaderboard row
    stamps: v.number(),                      // districts stamped, secondary sort
    weekKey: v.string(),                     // ISO week "2026-W36" the weekXp belongs to
    weekXp: v.number(),                      // XP earned this ISO week (resets when weekKey rolls)
    state: v.string(),                       // JSON, capped at 64 KB by the mutation
    stateVersion: v.number(),                // client bumps on every save; stale writes are refused
    updatedAt: v.number(),
  })
    .index("by_student", ["studentId"])
    .index("by_xp", ["xp"])
    .index("by_week", ["weekKey", "weekXp"]),
});

