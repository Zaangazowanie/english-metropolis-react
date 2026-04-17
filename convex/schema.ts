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
    createdBy: v.optional(v.id("users")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_type", ["type"])
    .index("by_status", ["status"]),

  // Groups within an org (classes, company departments)
  groups: defineTable({
    organizationId: v.id("organizations"),
    name: v.string(),                    // "B2 Evening Class", "IT Department"
    slug: v.string(),                    // "b2-evening", "it-dept"
    type: v.string(),                    // "class", "department", "cohort", "private"
    description: v.optional(v.string()),
    schedule: v.optional(v.string()),    // "Mon/Wed 18:00"
    level: v.optional(v.string()),       // "B2", "C1"
    status: v.string(),                  // "active", "archived"
    teacherIds: v.array(v.id("users")),
    studentIds: v.array(v.id("students")),
    settings: v.optional(v.any()),       // Group-specific overrides
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_org_type", ["organizationId", "type"])
    ,  // Note: array field index

  // ═══════════════════════════════════════════════════════════
  // USERS (Teachers, Admins, Super Admins)
  // ═══════════════════════════════════════════════════════════

  users: defineTable({
    email: v.string(),
    name: v.string(),
    password: v.optional(v.string()),
    role: v.string(),                    // "super_admin", "org_admin", "teacher", "assistant"
    organizationId: v.optional(v.id("organizations")),
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
    email: v.optional(v.string()),
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
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
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
    createdAt: v.number(),
  })
    .index("by_student", ["studentId"])
    .index("by_lesson", ["lessonId"])
    .index("by_student_date", ["studentId", "createdAt"])
    .index("by_organization", ["organizationId"]),

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
});
