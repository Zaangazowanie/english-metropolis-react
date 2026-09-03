// Instalment plans — a hand-agreed price paid in N parts (2026-09-03).
//
// Why: Mike hand-cut one-shot P24 links per instalment, next to a function
// (analysisOffers.createNegotiatedQuote) that already builds durable quote
// links and had zero callers. A one-shot link registered from a script leaves
// no p24Payments row, so the webhook 404s and nothing auto-credits (the
// 2026-08-17 Szymon case). And nothing in the estate could say "instalment 2
// was never paid": crons touched no money and reconcileAlerts never read
// priceQuotes.
//
// Shape: one plan = N `priceQuotes` rows (kind "negotiated") sharing a planRef.
// Each quote carries ITS share of the lessons, so paying instalment k releases
// lessons/N lessons and a missed instalment can only ever cost that share —
// nothing in this codebase can claw a lessonPackages row back, so 24-up-front
// would turn a missed payment into a 1 440 PLN loss instead of 720.
// Redemption is the ordinary chain: /checkout?quote=Q-… → p24:createPayment →
// preparePayment → webhook → finalizePaid (one lessonPackages row per paid
// instalment, named after the instalment).
//
// Rules that must survive every later edit (see the 3 Sep 2026 brief):
//   • NEVER add a plan fee, surcharge or rounding-up. The arrangement sits
//     outside consumer-credit law only because it costs the student nothing.
//   • After CCD2 (20 Nov 2026) the operative rule is "payments must never
//     outrun the lessons" — releasing lessons per instalment is what keeps the
//     continuing-services carve-out. Do not switch to 24-up-front.
//   • Missed instalment: notice, grace, then FUTURE lessons abate. Never
//     accelerate the remainder, never bill while suspending.

import { internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { requireSuperadmin } from "./authHelpers";

const DAY_MS = 24 * 60 * 60 * 1000;
// A plan link stays payable well past its due date: the alert, not the expiry,
// is what tells Mike it is late. Expiring the link on the due date would turn
// a two-day delay into a dead link and a support round-trip.
export const PLAN_GRACE_MS = 90 * DAY_MS;
// Reminder cadence: a nudge 3 days before dueAt, then every 3 days while
// overdue. remindersSentAt keeps the history so a retry never double-sends.
export const REMIND_BEFORE_MS = 3 * DAY_MS;
export const REMIND_EVERY_MS = 3 * DAY_MS;

export function splitEvenly(total: number, parts: number): number[] {
  // Remainder on the LAST part (same convention as createNegotiatedQuote), so
  // the shares always sum to exactly the total and nothing is rounded away.
  const base = Math.floor(total / parts);
  const out = Array.from({ length: parts }, () => base);
  out[parts - 1] += total - base * parts;
  return out;
}

export function planLabel(label: string, no: number, count: number) {
  return `${label} · rata ${no}/${count}`;
}

export const createInstalmentPlan = mutation({
  args: {
    sessionToken: v.string(),
    studentId: v.id("students"),
    totalPLN: v.number(),          // whole złoty, the agreed total — no fee on top, ever
    totalLessons: v.number(),
    instalments: v.number(),       // 2..12
    firstDueAt: v.number(),        // ms; instalment 1 due date
    intervalDays: v.optional(v.number()),   // default 30
    label: v.string(),             // what is being bought, in the student's language
    reason: v.string(),            // why this price/plan — audit log
  },
  handler: async (ctx, args) => {
    const { user } = await requireSuperadmin(ctx, args.sessionToken);
    const student = await ctx.db.get(args.studentId);
    if (!student) throw new Error("Student not found");
    if (!args.reason.trim() || args.reason.trim().length < 10) {
      throw new Error("A reason for the plan is required");
    }
    const count = Math.trunc(args.instalments);
    if (count < 2 || count > 12) throw new Error("A plan has 2 to 12 instalments");
    const totalPLN = Math.trunc(args.totalPLN);
    const amount = totalPLN * 100;
    if (!Number.isSafeInteger(amount) || amount < 100 * count || amount > 5_000_000) {
      throw new Error("Invalid plan amount");
    }
    const totalLessons = Math.trunc(args.totalLessons);
    if (totalLessons < count) throw new Error("Each instalment must release at least one lesson");
    const intervalDays = Math.trunc(args.intervalDays ?? 30);
    if (intervalDays < 7 || intervalDays > 92) throw new Error("Interval must be 7 to 92 days");
    const now = Date.now();
    if (!Number.isFinite(args.firstDueAt) || args.firstDueAt < now - DAY_MS) {
      throw new Error("The first due date cannot be in the past");
    }

    const amounts = splitEvenly(amount, count);
    const lessons = splitEvenly(totalLessons, count);
    const planRef = `PLAN-${crypto.randomUUID()}`;
    const quotes: Array<{ quoteRef: string; instalmentNo: number; amount: number; lessons: number; dueAt: number; checkoutPath: string }> = [];
    for (let i = 0; i < count; i++) {
      const no = i + 1;
      const dueAt = args.firstDueAt + i * intervalDays * DAY_MS;
      const quoteRef = `Q-${crypto.randomUUID()}`;
      await ctx.db.insert("priceQuotes", {
        quoteRef,
        organizationId: student.organizationId,
        studentId: args.studentId,
        kind: "negotiated",
        label: planLabel(args.label, no, count),
        amount: amounts[i],
        currency: "PLN",
        pricingBasis: `instalment ${no}/${count} of ${totalPLN} PLN agreed by ${user.email ?? user._id}: ${args.reason.trim()}`,
        packageLines: [{
          packageId: `plan:${planRef}`,
          name: planLabel(args.label, no, count),
          lessons: lessons[i],
          qty: 1,
          amount: amounts[i],
        }],
        createdBySource: "admin",
        createdByUserId: user._id,
        status: "open",
        expiresAt: dueAt + PLAN_GRACE_MS,
        planRef,
        instalmentNo: no,
        instalmentCount: count,
        dueAt,
        remindersSentAt: [],
        createdAt: now,
        updatedAt: now,
      });
      quotes.push({ quoteRef, instalmentNo: no, amount: amounts[i], lessons: lessons[i], dueAt, checkoutPath: `/checkout?quote=${quoteRef}` });
    }
    await ctx.db.insert("auditLog", {
      organizationId: student.organizationId,
      userId: user._id,
      action: "billing.instalmentPlanCreated",
      targetType: "student",
      targetId: args.studentId,
      details: JSON.stringify({ planRef, totalPLN, totalLessons, count, intervalDays, firstDueAt: args.firstDueAt, label: args.label, reason: args.reason }),
      timestamp: now,
    });
    return { planRef, quotes };
  },
});

// Cancel one unpaid instalment (a renegotiated or abandoned plan). A consumed
// quote is money already taken and cannot be cancelled here; refunds go
// through P24 and the bank, never by flipping a row.
export const cancelInstalment = mutation({
  args: { sessionToken: v.string(), quoteRef: v.string(), reason: v.string() },
  handler: async (ctx, args) => {
    const { user } = await requireSuperadmin(ctx, args.sessionToken);
    const quote = await ctx.db
      .query("priceQuotes")
      .withIndex("by_quote_ref", q => q.eq("quoteRef", args.quoteRef))
      .unique();
    if (!quote || !quote.planRef) throw new Error("Instalment not found");
    if (quote.status !== "open") throw new Error(`Instalment is ${quote.status}, not open`);
    if (!args.reason.trim()) throw new Error("A reason is required");
    const now = Date.now();
    await ctx.db.patch(quote._id, { status: "cancelled", updatedAt: now });
    await ctx.db.insert("auditLog", {
      organizationId: quote.organizationId,
      userId: user._id,
      action: "billing.instalmentCancelled",
      targetType: "student",
      targetId: quote.studentId,
      details: JSON.stringify({ planRef: quote.planRef, quoteRef: quote.quoteRef, instalmentNo: quote.instalmentNo, reason: args.reason }),
      timestamp: now,
    });
    return { ok: true };
  },
});

function instalmentView(q: any, now: number) {
  return {
    quoteRef: q.quoteRef,
    instalmentNo: q.instalmentNo,
    instalmentCount: q.instalmentCount,
    amount: q.amount,
    lessons: (q.packageLines || []).reduce((n: number, l: any) => n + l.lessons * l.qty, 0),
    dueAt: q.dueAt,
    status: q.status,
    consumedAt: q.consumedAt ?? null,
    overdue: q.status === "open" && typeof q.dueAt === "number" && q.dueAt < now,
    remindersSentAt: q.remindersSentAt ?? [],
    checkoutPath: `/checkout?quote=${q.quoteRef}`,
  };
}

// Every plan in the organisation, newest first, for the Billing page.
export const listPlans = query({
  args: { sessionToken: v.string(), organizationId: v.optional(v.id("organizations")) },
  handler: async (ctx, args) => {
    await requireSuperadmin(ctx, args.sessionToken);
    const quotes = (await ctx.db.query("priceQuotes").collect()).filter((q: any) => q.planRef);
    const now = Date.now();
    const byPlan = new Map<string, any[]>();
    for (const q of quotes) {
      if (args.organizationId && q.organizationId !== args.organizationId) continue;
      byPlan.set(q.planRef!, [...(byPlan.get(q.planRef!) || []), q]);
    }
    const plans = [];
    for (const [planRef, rows] of byPlan) {
      rows.sort((a, b) => (a.instalmentNo ?? 0) - (b.instalmentNo ?? 0));
      const student = await ctx.db.get(rows[0].studentId as Id<"students">);
      const instalments = rows.map(r => instalmentView(r, now));
      plans.push({
        planRef,
        studentId: rows[0].studentId,
        studentName: student?.name ?? "?",
        mailStatus: rows[0].planMailStatus ?? null,
        mailError: rows[0].planMailError ?? null,
        label: String(rows[0].label).replace(/ · rata \d+\/\d+$/, ""),
        createdAt: rows[0].createdAt,
        totalAmount: rows.reduce((n, r) => n + r.amount, 0),
        paidAmount: rows.filter(r => r.status === "consumed").reduce((n, r) => n + r.amount, 0),
        totalLessons: instalments.reduce((n, i) => n + i.lessons, 0),
        overdue: instalments.filter(i => i.overdue).length,
        instalments,
      });
    }
    plans.sort((a, b) => b.createdAt - a.createdAt);
    return plans;
  },
});

// ── Mail: the plan in one message, and reminders ──────────────────────────
//
// Both go through the same relay as order confirmations (BOOKING_NOTIFY_URL,
// em-report), which owns the templates, the test-mode routing and the copy to
// support@. This file only assembles facts.

export const getPlanForMail = internalQuery({
  args: { planRef: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("priceQuotes")
      .withIndex("by_plan", q => q.eq("planRef", args.planRef))
      .collect();
    if (!rows.length) return null;
    rows.sort((a, b) => (a.instalmentNo ?? 0) - (b.instalmentNo ?? 0));
    const student = await ctx.db.get(rows[0].studentId);
    if (!student) return null;
    const now = Date.now();
    return {
      planRef: args.planRef,
      studentName: student.name,
      studentEmail: (student as any).googleEmail ?? student.email ?? null,
      lang: "pl",   // students carry no language; the relay renders PL + EN like the order mail
      label: String(rows[0].label).replace(/ · rata \d+\/\d+$/, ""),
      totalAmount: rows.reduce((n, r) => n + r.amount, 0),
      totalLessons: rows.reduce((n, r) => n + (r.packageLines || []).reduce((m, l) => m + l.lessons * l.qty, 0), 0),
      instalments: rows.map(r => instalmentView(r, now)),
    };
  },
});

async function postToRelay(path: string, body: unknown): Promise<{ ok: boolean; status: number; text: string }> {
  const base = process.env.BOOKING_NOTIFY_URL;
  const key = process.env.BOOKING_NOTIFY_KEY;
  if (!base || !key) return { ok: false, status: 0, text: "BOOKING_NOTIFY_URL/KEY unset" };
  const url = base.replace(/booking-confirm$/, path);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-booking-key": key },
      body: JSON.stringify(body),
    });
    return { ok: response.ok, status: response.status, text: (await response.text()).slice(0, 300) };
  } catch (error: any) {
    return { ok: false, status: 0, text: String(error?.message || error) };
  }
}

// Send the whole plan (every link, every due date) to the student in ONE
// mail. The Billing page calls this mutation (the admin API exposes queries
// and mutations, not actions); it marks the plan "pending" and schedules the
// delivery, whose verdict lands back on the rows as planMailStatus. A plan
// that was created but never reached the student is exactly the silent
// failure this file exists to end, so "pending" that never becomes "sent" is
// visible on the page rather than swallowed.
export const requestPlanMail = mutation({
  args: { sessionToken: v.string(), planRef: v.string(), siteBase: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireSuperadmin(ctx, args.sessionToken);
    const rows = await ctx.db.query("priceQuotes").withIndex("by_plan", q => q.eq("planRef", args.planRef)).collect();
    if (!rows.length) throw new Error("Plan not found");
    const now = Date.now();
    for (const row of rows) await ctx.db.patch(row._id, { planMailStatus: "pending", planMailError: undefined, updatedAt: now });
    await ctx.scheduler.runAfter(0, internal.instalmentPlans.deliverPlanMail, { planRef: args.planRef, siteBase: args.siteBase });
    return { ok: true };
  },
});

export const deliverPlanMail = internalAction({
  args: { planRef: v.string(), siteBase: v.optional(v.string()) },
  handler: async (ctx, args): Promise<void> => {
    const plan = await ctx.runQuery(internal.instalmentPlans.getPlanForMail, { planRef: args.planRef });
    const fail = (text: string) =>
      ctx.runMutation(internal.instalmentPlans.markPlanMail, { planRef: args.planRef, status: "failed", error: text, at: Date.now() });
    if (!plan) { await fail("plan not found"); return; }
    if (!plan.studentEmail) { await fail("student has no e-mail address"); return; }
    const siteBase = (args.siteBase || "https://englishmetro.com").replace(/\/$/, "");
    const result = await postToRelay("instalment-plan", {
      ...plan,
      instalments: plan.instalments.map((i: any) => ({ ...i, url: `${siteBase}${i.checkoutPath}` })),
    });
    if (result.ok) {
      await ctx.runMutation(internal.instalmentPlans.markPlanMail, { planRef: args.planRef, status: "sent", at: Date.now() });
    } else {
      await fail(`relay ${result.status}: ${result.text}`);
    }
  },
});

export const markPlanMail = internalMutation({
  args: { planRef: v.string(), status: v.string(), error: v.optional(v.string()), at: v.number() },
  handler: async (ctx, args) => {
    const rows = await ctx.db.query("priceQuotes").withIndex("by_plan", q => q.eq("planRef", args.planRef)).collect();
    for (const row of rows) {
      await ctx.db.patch(row._id, {
        planMailStatus: args.status,
        planMailError: args.error,
        // The plan mail is the first reminder: the cadence counts from it.
        ...(args.status === "sent" ? { remindersSentAt: [...(row.remindersSentAt ?? []), args.at] } : {}),
        updatedAt: args.at,
      });
    }
  },
});

export const markReminded = internalMutation({
  args: { quoteRefs: v.array(v.string()), at: v.number() },
  handler: async (ctx, args) => {
    for (const quoteRef of args.quoteRefs) {
      const quote = await ctx.db
        .query("priceQuotes")
        .withIndex("by_quote_ref", q => q.eq("quoteRef", quoteRef))
        .unique();
      if (!quote) continue;
      await ctx.db.patch(quote._id, { remindersSentAt: [...(quote.remindersSentAt ?? []), args.at], updatedAt: args.at });
    }
  },
});

// Which open instalments need a nudge right now. Pure so the offline harness
// can test the cadence without a clock.
export function reminderDue(quote: { status: string; dueAt?: number; remindersSentAt?: number[]; planRef?: string }, now: number): boolean {
  if (!quote.planRef || quote.status !== "open" || typeof quote.dueAt !== "number") return false;
  if (quote.dueAt - now > REMIND_BEFORE_MS) return false;
  const last = Math.max(0, ...(quote.remindersSentAt ?? []));
  return now - last >= REMIND_EVERY_MS;
}

export const listReminderCandidates = internalQuery({
  args: { now: v.number() },
  handler: async (ctx, args) => {
    const rows = await ctx.db.query("priceQuotes").withIndex("by_status", q => q.eq("status", "open")).collect();
    const out = [];
    for (const q of rows) {
      if (!reminderDue(q as any, args.now)) continue;
      const student = await ctx.db.get(q.studentId);
      const email = (student as any)?.googleEmail ?? student?.email ?? null;
      if (!student || !email) continue;
      out.push({
        quoteRef: q.quoteRef,
        planRef: q.planRef!,
        studentName: student.name,
        studentEmail: email,
        lang: "pl",   // students carry no language; the relay renders PL + EN like the order mail
        label: q.label,
        amount: q.amount,
        instalmentNo: q.instalmentNo,
        instalmentCount: q.instalmentCount,
        dueAt: q.dueAt!,
        overdue: q.dueAt! < args.now,
        checkoutPath: `/checkout?quote=${q.quoteRef}`,
      });
    }
    return out;
  },
});

// Daily cron. A failure to send is logged and retried tomorrow; the overdue
// ALERT in operations.reconcileAlerts is independent of this and never waits
// on mail.
export const sendReminders = internalAction({
  args: {},
  handler: async (ctx): Promise<{ candidates: number; sent: number }> => {
    const now = Date.now();
    const due: any[] = await ctx.runQuery(internal.instalmentPlans.listReminderCandidates, { now });
    let sent = 0;
    for (const item of due) {
      const result = await postToRelay("instalment-reminder", { ...item, url: `https://englishmetro.com${item.checkoutPath}` });
      if (result.ok) {
        await ctx.runMutation(internal.instalmentPlans.markReminded, { quoteRefs: [item.quoteRef], at: now });
        sent++;
      } else {
        console.error("instalment reminder failed:", item.quoteRef, result.status, result.text);
      }
    }
    return { candidates: due.length, sent };
  },
});
