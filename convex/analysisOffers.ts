// AI lesson analysis — the self-serve upgrade offer and its quotes (2026-08-17).
//
// A student who never bought the add-on at checkout had no way to buy it
// afterwards. This is that way. Two products:
//
//   • one named lesson              — ANALYSIS_ADDON_PLN_PER_LESSON
//   • the whole account, permanently — the volume-priced upgrade
//
// Both are sold by creating a QUOTE here (priced entirely on the server) and
// redeeming it through the ordinary p24 chain. The browser never sees or sends
// an amount; it carries a quoteRef and nothing else.

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireStudent, requireSuperadmin } from "./authHelpers";
import { isGrandfathered } from "./enrolmentRules";
import { ANALYSIS_NOTICE_VERSION } from "./students";
import {
  ANALYSIS_ADDON_PLN_PER_LESSON,
  ANALYSIS_BULK_MAX_PLN,
  ANALYSIS_BULK_MIN_BILLABLE_LESSONS,
  priceBulkAnalysis,
} from "./analysisPricing";

// A quote is a price we have committed to, so it must not live forever: the
// tier a student earned at 30 lessons should not still be redeemable at 200.
const QUOTE_TTL_MS = 24 * 60 * 60 * 1000;

// ── Who may be offered the upgrade ───────────────────────────────────────────
//
// Deliberately narrower than "the gate says no". Three groups get NOTHING:
//
//   minor        — a child's account can never be analysed, at any price. The
//                  rule is restated here rather than inherited so this surface
//                  cannot become the way around it.
//   granted      — they already have it. Never sell it twice.
//   revoked      — they withdrew consent. That is a right they exercised;
//                  turning the withdrawal into a sales prompt is exactly the
//                  behaviour the consent rules exist to prevent.
//   grandfathered— the roster Mike taught before the platform existed gave
//                  WRITTEN consent years of lessons ago. `no_consent` for them
//                  means the database has no ROW, not that they refused
//                  (see em_analysis_consent_not_granted_by_grandfathering).
//                  Selling them something they already own would be wrong, so
//                  they are told nothing and the missing record is surfaced to
//                  an admin instead, via `pendingLegacyRecords` below.
export function upgradeOfferState(student: any): { offer: boolean; reason: string } {
  if (!student) return { offer: false, reason: "no_student" };
  if (student.isMinor) return { offer: false, reason: "minor" };
  const consent = student.lessonAnalysis;
  if (consent && !consent.revokedAt) return { offer: false, reason: "already_granted" };
  if (consent?.revokedAt) return { offer: false, reason: "revoked" };
  if (isGrandfathered(student)) return { offer: false, reason: "legacy_record_missing" };
  return { offer: true, reason: "no_consent" };
}

// The database-aware wrapper around the rule above. A student who only ever
// bought single lessons has no account-wide record to carry a `revokedAt`, so
// withdrawal shows up only on their entitlement rows — and the pure function
// above would read that as `no_consent` and start selling to them again, which
// is precisely the nagging the revoked branch exists to prevent.
async function offerStateFor(ctx: any, student: any): Promise<{ offer: boolean; reason: string }> {
  const state = upgradeOfferState(student);
  if (state.reason !== "no_consent") return state;
  const entitlements = await ctx.db
    .query("analysisEntitlements")
    .withIndex("by_student", (q: any) => q.eq("studentId", student._id))
    .collect();
  if (entitlements.some((e: any) => e.revokedAt)) return { offer: false, reason: "revoked" };
  return state;
}

async function countUnanalysedLessons(ctx: any, studentId: any): Promise<number> {
  const lessons = await ctx.db
    .query("lessons")
    .withIndex("by_student", (q: any) => q.eq("studentId", studentId))
    .collect();
  // Only lessons that were actually taught can carry an analysis, and one that
  // already has an analysis is not something the student is being sold.
  let count = 0;
  for (const lesson of lessons) {
    if ((lesson.status || "") === "planned" || (lesson.status || "") === "cancelled") continue;
    const existing = await ctx.db
      .query("transcriptAnalyses")
      .withIndex("by_lesson", (q: any) => q.eq("lessonId", lesson._id))
      .unique();
    if (!existing) count += 1;
  }
  return count;
}

async function lessonEntitlement(ctx: any, studentId: any, lessonId: any) {
  return await ctx.db
    .query("analysisEntitlements")
    .withIndex("by_student_lesson", (q: any) =>
      q.eq("studentId", studentId).eq("lessonId", lessonId))
    .unique();
}

// ── The CTA's only data source ───────────────────────────────────────────────
// Everything the upgrade prompt renders comes from here, prices included, so
// there is no number in the frontend that can drift from the one charged.
export const myOffer = query({
  args: {
    sessionToken: v.string(),
    lessonId: v.optional(v.id("lessons")),
  },
  handler: async (ctx, args) => {
    const { student } = await requireStudent(ctx, args.sessionToken);
    const state = await offerStateFor(ctx, student);
    if (!state.offer) {
      return { show: false, reason: state.reason, noticeVersion: ANALYSIS_NOTICE_VERSION };
    }

    // A lesson already paid for individually must not be sold again, and the
    // prompt must not appear on its card.
    let thisLessonPaid = false;
    if (args.lessonId) {
      const existing = await lessonEntitlement(ctx, student._id, args.lessonId);
      thisLessonPaid = !!existing && !existing.revokedAt;
    }

    const covered = await countUnanalysedLessons(ctx, student._id);
    const bulk = priceBulkAnalysis(covered);
    return {
      show: true,
      reason: state.reason,
      noticeVersion: ANALYSIS_NOTICE_VERSION,
      thisLessonPaid,
      single: {
        available: !!args.lessonId && !thisLessonPaid,
        pricePLN: ANALYSIS_ADDON_PLN_PER_LESSON,
      },
      bulk: {
        available: true,
        coveredLessons: bulk.coveredLessons,
        billableLessons: bulk.billableLessons,
        perLessonPLN: bulk.perLessonPLN,
        totalPLN: bulk.totalPLN,
        listTotalPLN: bulk.listTotalPLN,
        savingPLN: bulk.savingPLN,
        capped: bulk.capped,
        minBillableLessons: ANALYSIS_BULK_MIN_BILLABLE_LESSONS,
        maxPLN: ANALYSIS_BULK_MAX_PLN,
      },
    };
  },
});

// ── Creating the quote ───────────────────────────────────────────────────────
// The student picks a product; the server prices it, writes it down, and hands
// back a reference. Nothing about the price travels through the browser.
export const createQuote = mutation({
  args: {
    sessionToken: v.string(),
    scope: v.union(v.literal("lesson"), v.literal("account")),
    lessonId: v.optional(v.id("lessons")),
    lang: v.union(v.literal("pl"), v.literal("en")),
  },
  handler: async (ctx, args) => {
    const { student } = await requireStudent(ctx, args.sessionToken);
    const state = await offerStateFor(ctx, student);
    // Refused, not silently downgraded: if the browser asked for this and the
    // server disagrees, the student must see that rather than be charged.
    if (!state.offer) throw new Error(`ANALYSIS_UPGRADE_NOT_AVAILABLE:${state.reason}`);

    const now = Date.now();
    const isPL = args.lang === "pl";
    let amount: number;
    let listAmount: number;
    let label: string;
    let pricingBasis: string;
    let grantLessonId: any = undefined;

    if (args.scope === "lesson") {
      if (!args.lessonId) throw new Error("A lesson is required for a single-lesson quote");
      const lesson = await ctx.db.get(args.lessonId);
      // Ownership, not just existence — a lessonId is guessable and must never
      // let one student buy an analysis attached to another's lesson.
      if (!lesson || lesson.studentId !== student._id) throw new Error("Lesson not found");
      const existing = await lessonEntitlement(ctx, student._id, args.lessonId);
      if (existing && !existing.revokedAt) throw new Error("ANALYSIS_ALREADY_PAID_FOR_THIS_LESSON");
      amount = ANALYSIS_ADDON_PLN_PER_LESSON * 100;
      listAmount = amount;
      grantLessonId = args.lessonId;
      label = isPL
        ? `Analiza AI — lekcja ${lesson.date}`
        : `AI analysis — lesson of ${lesson.date}`;
      pricingBasis = `single lesson at list ${ANALYSIS_ADDON_PLN_PER_LESSON} PLN`;
    } else {
      const covered = await countUnanalysedLessons(ctx, student._id);
      const bulk = priceBulkAnalysis(covered);
      amount = bulk.totalPLN * 100;
      listAmount = bulk.listTotalPLN * 100;
      label = isPL
        ? `Analiza AI — wszystkie lekcje (${bulk.coveredLessons} zaległych + wszystkie przyszłe)`
        : `AI analysis — all lessons (${bulk.coveredLessons} outstanding + every future lesson)`;
      pricingBasis =
        `account-wide: ${bulk.coveredLessons} unanalysed lessons, billed on ` +
        `${bulk.billableLessons} (min ${ANALYSIS_BULK_MIN_BILLABLE_LESSONS}) at ` +
        `${bulk.perLessonPLN} PLN/lesson = ${bulk.totalPLN} PLN` +
        (bulk.capped ? ` (capped at ${ANALYSIS_BULK_MAX_PLN} PLN)` : "");
    }

    if (!Number.isSafeInteger(amount) || amount < 100 || amount > 5_000_000) {
      throw new Error("Invalid quote amount");
    }

    const quoteRef = `Q-${crypto.randomUUID()}`;
    await ctx.db.insert("priceQuotes", {
      quoteRef,
      organizationId: student.organizationId,
      studentId: student._id,
      kind: args.scope === "lesson" ? "analysis_lesson" : "analysis_account",
      label,
      amount,
      currency: "PLN",
      listAmount,
      pricingBasis,
      grantAnalysisScope: args.scope,
      grantLessonId,
      createdBySource: "self_serve",
      status: "open",
      expiresAt: now + QUOTE_TTL_MS,
      createdAt: now,
      updatedAt: now,
    });
    // The amount comes back only so the confirmation screen can show what is
    // about to be charged. It is re-read from this row at payment time.
    return { quoteRef, amount, currency: "PLN", label, pricingBasis };
  },
});

// ── The hand-negotiated price (the Szymon case) ──────────────────────────────
//
// 2026-08-17: a 2000 PLN negotiated package had to be registered against the
// P24 API from a throwaway script, because the CATALOG is the only price the
// app knew. No p24Payments row existed, so the webhook answered 404, verify was
// never called, the transaction sat unverified for hours and the lessons had to
// be allocated by hand. This is the replacement: the negotiated price becomes a
// quote, and the customer pays for it through the normal checkout.
export const createNegotiatedQuote = mutation({
  args: {
    sessionToken: v.string(),
    studentId: v.id("students"),
    totalPLN: v.number(),
    label: v.string(),
    reason: v.string(),                  // why this price — goes in the audit log
    lines: v.array(v.object({
      packageId: v.string(),
      name: v.string(),
      lessons: v.number(),
      qty: v.number(),
    })),
  },
  handler: async (ctx, args) => {
    const { user } = await requireSuperadmin(ctx, args.sessionToken);
    const student = await ctx.db.get(args.studentId);
    if (!student) throw new Error("Student not found");
    if (!args.reason.trim() || args.reason.trim().length < 10) {
      throw new Error("A reason for the negotiated price is required");
    }
    if (!args.lines.length) throw new Error("At least one line is required");

    const totalPLN = Math.trunc(args.totalPLN);
    const amount = totalPLN * 100;
    if (!Number.isSafeInteger(amount) || amount < 100 || amount > 5_000_000) {
      throw new Error("Invalid negotiated amount");
    }
    const totalLessons = args.lines.reduce((n, l) => n + l.lessons * l.qty, 0);
    if (totalLessons < 1) throw new Error("The lines grant no lessons");

    // Split the agreed total across the lines in proportion to their lesson
    // counts, so each lessonOrders row carries a truthful priceLabel and the
    // line amounts still sum to exactly what is charged. The remainder lands on
    // the last line rather than being rounded away.
    const now = Date.now();
    let allocated = 0;
    const packageLines = args.lines.map((line, index) => {
      const lineLessons = line.lessons * line.qty;
      const share = index === args.lines.length - 1
        ? amount - allocated
        : Math.round((amount * lineLessons) / totalLessons);
      allocated += share;
      return { ...line, amount: share };
    });

    const quoteRef = `Q-${crypto.randomUUID()}`;
    await ctx.db.insert("priceQuotes", {
      quoteRef,
      organizationId: student.organizationId,
      studentId: args.studentId,
      kind: "negotiated",
      label: args.label,
      amount,
      currency: "PLN",
      pricingBasis: `negotiated by ${user.email ?? user._id}: ${args.reason.trim()}`,
      packageLines,
      createdBySource: "admin",
      createdByUserId: user._id,
      status: "open",
      // A negotiated offer needs longer than a self-serve one: it is agreed in
      // a conversation and paid later.
      expiresAt: now + 14 * 24 * 60 * 60 * 1000,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("auditLog", {
      organizationId: student.organizationId,
      userId: user._id,
      action: "billing.negotiatedQuoteCreated",
      targetType: "student",
      targetId: args.studentId,
      details: JSON.stringify({ quoteRef, totalPLN, label: args.label, reason: args.reason, lines: args.lines }),
      timestamp: now,
    });
    return { quoteRef, amount, checkoutPath: `/checkout?quote=${quoteRef}` };
  },
});

// What the checkout shows for a quote it was handed. Student-scoped: a quote
// reference is only ever readable by the student it was written for.
export const getQuote = query({
  args: { sessionToken: v.string(), quoteRef: v.string() },
  handler: async (ctx, args) => {
    const { student } = await requireStudent(ctx, args.sessionToken);
    const quote = await ctx.db
      .query("priceQuotes")
      .withIndex("by_quote_ref", q => q.eq("quoteRef", args.quoteRef))
      .unique();
    if (!quote || quote.studentId !== student._id) return null;
    return {
      quoteRef: quote.quoteRef,
      kind: quote.kind,
      label: quote.label,
      amount: quote.amount,
      currency: quote.currency,
      listAmount: quote.listAmount ?? null,
      status: quote.status,
      expired: Date.now() > quote.expiresAt,
      expiresAt: quote.expiresAt,
      grantAnalysisScope: quote.grantAnalysisScope ?? null,
      // Instalment plans: lets the checkout say "rata 2/3, due 3 Oct" instead
      // of presenting a mid-plan payment as a fresh purchase.
      planRef: quote.planRef ?? null,
      instalmentNo: quote.instalmentNo ?? null,
      instalmentCount: quote.instalmentCount ?? null,
      dueAt: quote.dueAt ?? null,
    };
  },
});

// ── Records gap, not a sales lead ────────────────────────────────────────────
// Pre-platform students whose written consent has never been transcribed into
// the database. They are deliberately never shown the CTA; they show up here
// instead, for Mike to record with students:grantLegacyAnalysisConsent.
export const pendingLegacyRecords = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    await requireSuperadmin(ctx, args.sessionToken);
    const students = await ctx.db.query("students").collect();
    return students
      .filter(s => upgradeOfferState(s).reason === "legacy_record_missing")
      .map(s => ({ _id: s._id, name: s.name, slug: s.slug, createdAt: s.createdAt }));
  },
});
