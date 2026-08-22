import { action, internalAction, internalMutation, internalQuery, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { requireStudent, requireAdmin, isSuperadmin } from "./authHelpers";
import { ANALYSIS_NOTICE_VERSION } from "./students";
import { ANALYSIS_ADDON_PLN_PER_LESSON } from "./analysisPricing";

const CURRENCY = "PLN";
const TERMS_VERSION = "EM-LEGAL-03 (2026-07-29, revision 4)";
const WITHDRAWAL_PERIOD_MS = 14 * 24 * 60 * 60 * 1000;
// How long an unpaid transaction stays resumable, so a returning customer is
// sent back to the payment they already started instead of opening a second one.
const OPEN_PAYMENT_TTL_MS = 30 * 60 * 1000;

// This is the server-side price authority for payment registration. Never use
// names, lesson counts, or amounts sent by the browser to charge a customer.
// Optional AI lesson analysis, charged per lesson on top of the package. Priced
// server-side because the browser is never trusted with an amount. The number,
// and the volume discount for the self-serve upgrade, now live in
// ./analysisPricing so there is one file to edit.

const CATALOG: Record<string, { name: string; lessons: number; pricePLN: number }> = {
  single: { name: "One-off 1:1", lessons: 1, pricePLN: 135 },
  "private-core": { name: "Private Core", lessons: 4, pricePLN: 480 },
  momentum: { name: "Fluency Momentum", lessons: 8, pricePLN: 880 },
  "fluency-16": { name: "Fluency Builder", lessons: 16, pricePLN: 1600 },
  "fluency-24": { name: "Fluency Mastery", lessons: 24, pricePLN: 2160 },
  specialist: { name: "Specialist Sprint", lessons: 6, pricePLN: 900 },
  "specialist-12": { name: "Specialist Track", lessons: 12, pricePLN: 1560 },
  "specialist-24": { name: "Specialist Mastery", lessons: 24, pricePLN: 2640 },
  // Group courses. August and the two-month bundle were withdrawn on 2026-08-10
  // (Mike) — removed from the catalog so they cannot be bought, not merely hidden
  // in the UI. Orders already paid keep their own stored name and lesson count.
  // September now runs TWICE weekly over the month (8 lessons) at the same price.
  september: { name: "September Group Course", lessons: 8, pricePLN: 200 },
};

const ITEM_SHAPE = v.object({
  packageId: v.string(),
  qty: v.number(),
});

const BILLING_SHAPE = v.object({
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
});

function envInt(name: string): number {
  const value = Number(process.env[name]);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} is not configured`);
  return value;
}

export function p24Config() {
  const merchantId = envInt("P24_MERCHANT_ID");
  const posId = envInt("P24_POS_ID");
  const apiKey = process.env.P24_API_KEY || "";
  const crc = process.env.P24_CRC || "";
  if (!apiKey) throw new Error("P24_API_KEY is not configured");
  if (!crc) throw new Error("P24_CRC is not configured");
  const apiBase = (process.env.P24_API_BASE || "https://secure.przelewy24.pl").replace(/\/+$/, "");
  const redirectBase = (process.env.P24_REDIRECT_BASE || apiBase).replace(/\/+$/, "");
  const statusUrl = process.env.P24_STATUS_URL || "";
  const returnBase = process.env.P24_RETURN_URL || "https://englishmetro.com/payment/return";
  if (!statusUrl) throw new Error("P24_STATUS_URL is not configured");
  return { merchantId, posId, apiKey, crc, apiBase, redirectBase, statusUrl, returnBase };
}

export async function sha384(value: unknown): Promise<string> {
  const input = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-384", input);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
}

export function p24AuthHeader(posId: number, apiKey: string): string {
  return `Basic ${btoa(`${posId}:${apiKey}`)}`;
}

export async function p24NotificationSign(body: any, crc: string): Promise<string> {
  return sha384({
    merchantId: body.merchantId,
    posId: body.posId,
    sessionId: body.sessionId,
    amount: body.amount,
    originAmount: body.originAmount,
    currency: body.currency,
    orderId: body.orderId,
    methodId: body.methodId,
    statement: body.statement,
    crc,
  });
}

// Ask P24 what actually happened to a transaction. Used when verify fails, to
// tell "the payment did not go through" apart from "we already verified this and
// P24 will not verify it twice".
async function isSettledAtP24(cfg: ReturnType<typeof p24Config>, body: any): Promise<boolean> {
  try {
    const response = await fetch(
      `${cfg.apiBase}/api/v1/transaction/by/sessionId/${encodeURIComponent(body.sessionId)}`,
      { headers: { "Authorization": p24AuthHeader(cfg.posId, cfg.apiKey) } },
    );
    if (!response.ok) return false;
    const data: any = (await response.json())?.data;
    // P24 status: 0 nothing paid, 1 advance payment, 2 paid, 3 returned.
    return !!data && (data.status === 1 || data.status === 2) && data.amount === body.amount;
  } catch {
    return false;
  }
}

export async function verifyAtP24(body: any): Promise<void> {
  const cfg = p24Config();
  const sign = await sha384({
    sessionId: body.sessionId,
    orderId: body.orderId,
    amount: body.amount,
    currency: body.currency,
    crc: cfg.crc,
  });
  const response = await fetch(`${cfg.apiBase}/api/v1/transaction/verify`, {
    method: "PUT",
    headers: {
      "Authorization": p24AuthHeader(cfg.posId, cfg.apiKey),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      merchantId: cfg.merchantId,
      posId: cfg.posId,
      sessionId: body.sessionId,
      amount: body.amount,
      currency: body.currency,
      orderId: body.orderId,
      sign,
    }),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    // verify is not idempotent. If our first call succeeded but we never read the
    // reply, every P24 retry lands here and the customer would stay unallocated
    // with the money taken. Trust P24's own record of the transaction instead.
    if (await isSettledAtP24(cfg, body)) return;
    throw new Error(`P24 verification failed (${response.status}): ${detail}`);
  }
}

export const preparePayment = internalMutation({
  args: {
    sessionToken: v.string(),
    sessionId: v.string(),
    checkoutRef: v.string(),
    items: v.array(ITEM_SHAPE),
    billing: BILLING_SHAPE,
    lang: v.union(v.literal("pl"), v.literal("en")),
    consentTerms: v.boolean(),
    consentImmediate: v.boolean(),
    consentMarketing: v.boolean(),
    analysisAddon: v.optional(v.boolean()),
    forChild: v.optional(v.boolean()),
    requestedMethod: v.optional(v.number()),
    // A server-priced quote. When present it REPLACES the catalog: the amount
    // is read from the stored quote row, never computed from `items`.
    quoteRef: v.optional(v.string()),
    consentAnalysis: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { student } = await requireStudent(ctx, args.sessionToken);
    if (!args.consentTerms) throw new Error("Terms must be accepted");
    // The express request for immediate performance is deliberately NOT required.
    // § 5 of the published Regulamin treats it as a separate, optional statement and
    // provides for delivery after the 14-day period when it is not made, so making it
    // a condition of buying would both breach art. 15 ust. 3 u.p.k. and contradict our
    // own terms. Without it the package simply activates when the period expires.
    if (!args.billing.fullName.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(args.billing.email)) {
      throw new Error("Billing name and a valid e-mail are required");
    }

    // A quote and a cart are alternatives, never a mixture: allowing both would
    // put a client-chosen cart total next to a server-priced one and reopen the
    // exact hole the quote exists to close.
    const quote = args.quoteRef
      ? await ctx.db
          .query("priceQuotes")
          .withIndex("by_quote_ref", q => q.eq("quoteRef", args.quoteRef!))
          .unique()
      : null;
    if (args.quoteRef) {
      if (!quote) throw new Error("QUOTE_NOT_FOUND");
      if (quote.studentId !== student._id) throw new Error("QUOTE_NOT_FOUND");
      if (quote.status !== "open") throw new Error("QUOTE_ALREADY_USED");
      if (Date.now() > quote.expiresAt) throw new Error("QUOTE_EXPIRED");
      if (args.items.length) throw new Error("A quote cannot be combined with a cart");
      // Buying the analysis IS the consent, but it has to be given explicitly
      // and on its own — never carried in on the terms or marketing tickbox.
      if (quote.grantAnalysisScope && !args.consentAnalysis) {
        throw new Error("ANALYSIS_CONSENT_REQUIRED");
      }
    } else if (!args.items.length || args.items.length > 20) {
      throw new Error("Cart is empty or too large");
    }

    // Both paths end up here: one order line per row, priced in grosze by the
    // server. `lessons` is 0 for a line that grants no lesson package (the
    // analysis upgrade buys a service, not lessons).
    const lines: Array<{ packageId: string; packageName: string; lessons: number; lineAmount: number }> =
      quote
        ? (quote.packageLines?.length
            ? quote.packageLines.map(line => ({
                packageId: line.packageId,
                packageName: line.qty > 1 ? `${line.name} ×${line.qty}` : line.name,
                lessons: line.lessons * line.qty,
                lineAmount: line.amount,
              }))
            : [{
                packageId: `quote:${quote.kind}`,
                packageName: quote.label,
                lessons: 0,
                lineAmount: quote.amount,
              }])
        : args.items.map(item => {
            const product = CATALOG[item.packageId];
            const qty = Math.trunc(item.qty);
            if (!product || qty < 1 || qty > 20) throw new Error("Invalid cart item");
            return {
              packageId: item.packageId,
              packageName: qty > 1 ? `${product.name} ×${qty}` : product.name,
              lessons: product.lessons * qty,
              lineAmount: product.pricePLN * qty * 100,
            };
          });
    const buyerIsMinor = student.isMinor || !!args.forChild;

    // A child's account can never be analysed, so it can never be sold the
    // analysis either — restated on the quote path so a quote cannot become the
    // route around the checkout's own refusal below.
    if (quote?.grantAnalysisScope && buyerIsMinor) {
      throw new Error("ANALYSIS_NOT_AVAILABLE_FOR_MINORS");
    }

    // A child's account cannot buy this, at any price. Refused rather than
    // silently dropped: if the browser asked for it, something is wrong and the
    // buyer should see that rather than be charged an amount they did not expect.
    // Checked BEFORE the patch below: a mutation that throws is rolled back whole,
    // so writing the flag first would silently undo it on this path.
    if (args.analysisAddon && buyerIsMinor) {
      throw new Error("ANALYSIS_NOT_AVAILABLE_FOR_MINORS");
    }

    // Mark the account as a child's the moment the buying adult says so, not on
    // payment: the flag is protective and should bind even if they abandon the
    // payment. Deliberately one-way — a later order that leaves the box unticked
    // must never quietly turn a child's account back into an adult's.
    if (args.forChild && !student.isMinor) {
      await ctx.db.patch(student._id, { isMinor: true, updatedAt: Date.now() });
    }
    // The per-lesson add-on bought alongside a package. Not applicable to a
    // quote, which already carries its own analysis price.
    const analysisLessons = !quote && args.analysisAddon
      ? lines.reduce((n, line) => n + line.lessons, 0)
      : 0;
    const analysisAmount = analysisLessons * ANALYSIS_ADDON_PLN_PER_LESSON * 100;
    const linesTotal = lines.reduce((sum, line) => sum + line.lineAmount, 0);
    const amount = quote ? quote.amount : linesTotal + analysisAmount;
    // The line amounts must add up to what is charged, or an order row would
    // claim a price the customer never paid.
    if (quote && linesTotal !== quote.amount) throw new Error("Quote lines do not sum to the quote");
    if (!Number.isSafeInteger(amount) || amount < 100 || amount > 5_000_000) {
      throw new Error("Invalid payment amount");
    }
    // ⛔ The cart form is unchanged on purpose. A payment registered before this
    // deploy carries the old key, and rewriting the format would make every
    // in-flight retry look like an edited cart (CART_CHANGED) or fail to resume.
    const itemsKey = quote
      ? `quote:${quote.quoteRef}`
      : args.items.map(item => `${item.packageId}x${Math.trunc(item.qty)}`).sort().join("|")
        + (args.analysisAddon ? "|analysis" : "");
    const now = Date.now();

    const existing = await ctx.db
      .query("p24Payments")
      .withIndex("by_checkout_ref", q => q.eq("checkoutRef", args.checkoutRef))
      .unique();
    if (existing) {
      if (existing.studentId !== student._id) throw new Error("Checkout reference already used");
      // A retry can carry an edited cart: the customer's first attempt failed, they
      // changed a line, and clicked again with the same reference. Returning the
      // stored row would register the old amount, so the customer would be charged
      // a total they never saw. Only resume a payment for the identical cart.
      if (existing.itemsKey !== itemsKey || existing.amount !== amount) {
        throw new Error("CART_CHANGED");
      }
      return existing;
    }

    // One open transaction per customer per cart. A customer who paid but never saw
    // the confirmation (slow webhook, closed tab) comes back with a full cart and a
    // fresh checkoutRef; without this they would pay a second time for the same order.
    const openForStudent = await ctx.db
      .query("p24Payments")
      .withIndex("by_student", q => q.eq("studentId", student._id))
      .collect();
    // Only a "registered" payment is resumable: it has a P24 token, so the customer
    // was shown a payment page and may already have paid it. A "created" row never
    // reached P24, so nothing can have been paid against it and a fresh one is safe.
    const resumable = openForStudent.find(payment =>
      payment.status === "registered" &&
      payment.itemsKey === itemsKey &&
      payment.amount === amount &&
      now - payment.createdAt < OPEN_PAYMENT_TTL_MS);
    if (resumable) {
      // Same choice as before: resume, which is the guard against two live
      // transactions for one cart.
      if ((resumable.requestedMethod ?? null) === (args.requestedMethod ?? null)) return resumable;
      // Different choice. P24 pin a token to its method and their page offers no
      // way to switch, so returning this token would strand the customer on a
      // method they just rejected until the 30-minute window expired. The old
      // transaction is unpaid (a paid one is no longer "registered", the webhook
      // moves it), so it is superseded and a fresh one is registered. A late
      // webhook for it still finalises correctly: finalizePaid keys on sessionId.
      await ctx.db.patch(resumable._id, { status: "superseded" });
    }
    const paymentId = await ctx.db.insert("p24Payments", {
      checkoutRef: args.checkoutRef,
      sessionId: args.sessionId,
      organizationId: student.organizationId,
      studentId: student._id,
      orderIds: [],
      amount,
      itemsKey,
      currency: CURRENCY,
      email: args.billing.email.toLowerCase(),
      lang: args.lang,
      consentTerms: args.consentTerms,
      consentImmediate: args.consentImmediate,
      consentMarketing: args.consentMarketing,
      analysisAddon: args.analysisAddon ?? false,
      quoteRef: quote?.quoteRef,
      consentAnalysis: args.consentAnalysis ?? undefined,
      consentCapturedAt: now,
      termsVersion: TERMS_VERSION,
      requestedMethod: args.requestedMethod,
      status: "created",
      createdAt: now,
      updatedAt: now,
    });

    // Only record the express request when it was actually made. Writing this note
    // for every order would put a statement in the file the customer never gave.
    const consentNote = args.consentImmediate
      ? `[${args.checkoutRef}] ${TERMS_VERSION}: Klient wyraźnie zażądał rozpoczęcia świadczenia usług niezwłocznie po potwierdzeniu płatności, przed upływem 14 dni, w tym aktywacji pakietu oraz udostępnienia rezerwacji i realizacji lekcji, i przyjął do wiadomości obowiązek proporcjonalnej zapłaty za usługi spełnione do chwili odstąpienia oraz utratę prawa odstąpienia po pełnym wykonaniu usługi. Data żądania: ${new Date(now).toISOString()}.`
      : `[${args.checkoutRef}] ${TERMS_VERSION}: Klient nie złożył żądania rozpoczęcia świadczenia usług przed upływem 14-dniowego terminu na odstąpienie. Pakiet zostaje aktywowany po upływie tego terminu. Data zamówienia: ${new Date(now).toISOString()}.`;
    const billing = {
      ...args.billing,
      notes: [args.billing.notes?.trim(), consentNote].filter(Boolean).join("\n") || undefined,
    };
    const orderIds = [];
    for (const line of lines) {
      const lineAmount = line.lineAmount;
      const orderId = await ctx.db.insert("lessonOrders", {
        organizationId: student.organizationId,
        studentId: student._id,
        packageId: line.packageId,
        packageName: line.packageName,
        lessons: line.lessons,
        priceLabel: `${lineAmount / 100} PLN`,
        billing,
        status: "payment_pending",
        paymentId,
        paymentAmount: lineAmount,
        p24SessionId: args.sessionId,
        earlyPerformanceRequested: args.consentImmediate,
        earlyPerformanceRequestedAt: now,
        termsVersion: TERMS_VERSION,
        createdAt: now,
        updatedAt: now,
      });
      orderIds.push(orderId);
    }
    await ctx.db.patch(paymentId, { orderIds, updatedAt: Date.now() });
    return (await ctx.db.get(paymentId))!;
  },
});

export const markRegistered = internalMutation({
  args: {
    paymentId: v.id("p24Payments"),
    token: v.string(),
  },
  handler: async (ctx, args) => {
    const payment = await ctx.db.get(args.paymentId);
    if (!payment) throw new Error("Payment not found");
    await ctx.db.patch(args.paymentId, {
      status: "registered",
      token: args.token,
      error: undefined,
      registeredAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const markRegistrationFailed = internalMutation({
  args: {
    paymentId: v.id("p24Payments"),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    const payment = await ctx.db.get(args.paymentId);
    if (!payment || payment.status === "paid") return;
    await ctx.db.patch(args.paymentId, {
      status: "registration_failed",
      error: args.error.slice(0, 500),
      updatedAt: Date.now(),
    });
  },
});

export const getPaymentForWebhook = internalQuery({
  args: { sessionId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("p24Payments")
      .withIndex("by_session_id", q => q.eq("sessionId", args.sessionId))
      .unique();
  },
});

export const finalizePaid = internalMutation({
  args: {
    sessionId: v.string(),
    p24OrderId: v.number(),
    methodId: v.optional(v.number()),
    statement: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const payment = await ctx.db
      .query("p24Payments")
      .withIndex("by_session_id", q => q.eq("sessionId", args.sessionId))
      .unique();
    if (!payment) throw new Error("Payment not found");
    if (payment.status === "paid") return { ok: true, alreadyPaid: true };

    const now = Date.now();
    // The money is already captured by the time this runs. Throwing here would roll
    // the whole mutation back and answer P24 with a 502, so they retry forever and
    // the customer stays paid-but-unallocated. Record the anomaly and carry on.
    const allocationErrors: string[] = [];
    for (const orderId of payment.orderIds) {
      const order = await ctx.db.get(orderId);
      if (!order) { allocationErrors.push(`order ${String(orderId)} not found`); continue; }
      if (order.status === "confirmed") continue;
      if (order.status !== "payment_pending") {
        allocationErrors.push(`order ${String(orderId)} was ${order.status}, not payment_pending`);
        continue;
      }
      // A line that grants no lessons buys a service, not a package — the
      // analysis upgrade is the case. Inserting a 0-lesson package would put a
      // meaningless empty entitlement on the student's account.
      if (order.lessons < 1) {
        await ctx.db.patch(orderId, {
          status: "confirmed",
          confirmedBy: "Przelewy24",
          confirmedAt: now,
          p24OrderId: args.p24OrderId,
          updatedAt: now,
        });
        continue;
      }
      const packageRef = await ctx.db.insert("lessonPackages", {
        organizationId: order.organizationId,
        studentId: order.studentId,
        name: `${order.packageName} (P24)`,
        totalLessons: order.lessons,
        purchasedAt: now,
        availableFrom: order.earlyPerformanceRequested ? now : now + WITHDRAWAL_PERIOD_MS,
        earlyPerformanceRequested: order.earlyPerformanceRequested ?? false,
        earlyPerformanceRequestedAt: order.earlyPerformanceRequestedAt,
        termsVersion: order.termsVersion ?? TERMS_VERSION,
        notes: `P24 order ${args.p24OrderId} · ${order.priceLabel} · session ${args.sessionId}`,
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.patch(orderId, {
        status: "confirmed",
        confirmedBy: "Przelewy24",
        confirmedAt: now,
        packageRef,
        p24OrderId: args.p24OrderId,
        updatedAt: now,
      });
    }
    // The analysis consent is written only now, on verified payment. Granting it
    // at checkout would leave a live consent behind on an abandoned or failed
    // order. A minor's account is refused here too, not just at checkout, so a
    // later change to the flag can never retro-enable a paid add-on.
    if (payment.analysisAddon) {
      const student = await ctx.db.get(payment.studentId);
      if (student && !student.isMinor) {
        await ctx.db.patch(student._id, {
          lessonAnalysis: {
            grantedAt: now,
            noticeVersion: ANALYSIS_NOTICE_VERSION,
            paidOrderId: payment.orderIds[0],
          },
          updatedAt: now,
        });
      } else if (student?.isMinor) {
        allocationErrors.push("analysis add-on paid for a minor's account — consent NOT granted, refund the add-on");
      }
    }

    // ── Redeeming a server-priced quote ──────────────────────────────────────
    // Same rule as the add-on above: the entitlement is written only now, on
    // verified payment, so an abandoned quote leaves nothing behind. Errors are
    // recorded rather than thrown — the money is already captured, and throwing
    // would roll the whole mutation back and make P24 retry forever.
    if (payment.quoteRef) {
      const quote = await ctx.db
        .query("priceQuotes")
        .withIndex("by_quote_ref", q => q.eq("quoteRef", payment.quoteRef!))
        .unique();
      if (!quote) {
        allocationErrors.push(`quote ${payment.quoteRef} not found — entitlement NOT granted`);
      } else if (quote.status === "consumed") {
        // Already redeemed by an earlier delivery of this notification.
      } else {
        const student = await ctx.db.get(payment.studentId);
        if (quote.grantAnalysisScope && student?.isMinor) {
          allocationErrors.push("analysis quote paid on a minor's account — consent NOT granted, refund it");
        } else if (quote.grantAnalysisScope === "account" && student) {
          // The whole account, past and future. Never overwrite an existing
          // record: a consent already on file keeps its original date.
          if (!student.lessonAnalysis || student.lessonAnalysis.revokedAt) {
            await ctx.db.patch(student._id, {
              lessonAnalysis: {
                grantedAt: now,
                noticeVersion: ANALYSIS_NOTICE_VERSION,
                paidOrderId: payment.orderIds[0],
              },
              updatedAt: now,
            });
          }
        } else if (quote.grantAnalysisScope === "lesson" && quote.grantLessonId && student) {
          const already = await ctx.db
            .query("analysisEntitlements")
            .withIndex("by_student_lesson", q =>
              q.eq("studentId", payment.studentId).eq("lessonId", quote.grantLessonId!))
            .unique();
          if (!already) {
            await ctx.db.insert("analysisEntitlements", {
              organizationId: payment.organizationId,
              studentId: payment.studentId,
              lessonId: quote.grantLessonId,
              grantedAt: now,
              noticeVersion: ANALYSIS_NOTICE_VERSION,
              paymentId: payment._id,
              quoteRef: quote.quoteRef,
            });
          }
        }
        await ctx.db.patch(quote._id, {
          status: "consumed",
          paymentId: payment._id,
          consumedAt: now,
          updatedAt: now,
        });
      }
    }

    await ctx.db.patch(payment._id, {
      status: "paid",
      p24OrderId: args.p24OrderId,
      methodId: args.methodId,
      statement: args.statement,
      allocationErrors: allocationErrors.length ? allocationErrors : undefined,
      verifiedAt: now,
      updatedAt: now,
    });
    for (const orderId of payment.orderIds) {
      await ctx.scheduler.runAfter(0, internal.p24.notifyPaidOrder, { orderId });
    }
    if (allocationErrors.length) {
      console.error("P24 payment captured with unallocated lines:", payment.sessionId, allocationErrors.join("; "));
    }
    return { ok: true, alreadyPaid: false, allocationErrors };
  },
});

export const getPaidOrderForEmail = internalQuery({
  args: { orderId: v.id("lessonOrders") },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    if (!order || order.status !== "confirmed") return null;
    const student = await ctx.db.get(order.studentId);
    const lessonPackage = order.packageRef ? await ctx.db.get(order.packageRef) : null;
    return {
      orderId: String(order._id),
      packageName: order.packageName,
      lessons: order.lessons,
      priceLabel: order.priceLabel,
      billing: order.billing,
      studentName: student?.name ?? order.billing.fullName,
      studentSlug: student?.slug ?? "",
      studentEmail: (student as any)?.googleEmail ?? student?.email ?? order.billing.email,
      earlyPerformanceRequested: order.earlyPerformanceRequested ?? false,
      earlyPerformanceRequestedAt: order.earlyPerformanceRequestedAt,
      availableFrom: lessonPackage?.availableFrom ?? order.confirmedAt,
      termsVersion: order.termsVersion ?? TERMS_VERSION,
    };
  },
});

export const notifyPaidOrder = internalAction({
  args: { orderId: v.id("lessonOrders") },
  handler: async (ctx, args) => {
    const base = process.env.BOOKING_NOTIFY_URL;
    const key = process.env.BOOKING_NOTIFY_KEY;
    if (!base || !key) {
      console.warn("p24:notifyPaidOrder skipped — BOOKING_NOTIFY_URL/KEY unset");
      return;
    }
    const order = await ctx.runQuery(internal.p24.getPaidOrderForEmail, { orderId: args.orderId });
    if (!order) return;
    const url = base.replace("booking-confirm", "order-confirm");
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-booking-key": key },
        body: JSON.stringify(order),
      });
      if (!response.ok) {
        console.error("p24 order-confirm notify failed:", response.status, (await response.text()).slice(0, 200));
      }
    } catch (error: any) {
      console.error("p24 order-confirm notify error:", error?.message);
    }
  },
});

// ── Payment methods ────────────────────────────────────────────────────────
// P24 returns only the methods actually enabled on this shop, so an empty group
// is a group the customer must never be offered. That is the whole mechanism
// keeping a card button off the checkout until Przelewy24 enable cards: we do
// not maintain a local list that can disagree with their account state.
type MethodGroupKey = "blik" | "card" | "transfer";

function methodGroupOf(method: any): MethodGroupKey {
  const group = String(method?.group || "");
  if (group === "Blik") return "blik";
  // 145 is Karta płatnicza. The group string is matched too so the wallets and
  // card variants P24 may add later land here without another deploy.
  if (method?.id === 145 || /card|karta/i.test(group)) return "card";
  return "transfer";
}

async function fetchEnabledMethods(lang: "pl" | "en"): Promise<any[]> {
  const cfg = p24Config();
  const response = await fetch(`${cfg.apiBase}/api/v1/payment/methods/${lang}`, {
    headers: { "Authorization": p24AuthHeader(cfg.posId, cfg.apiKey) },
  });
  if (!response.ok) throw new Error(`P24 methods failed (${response.status})`);
  const body: any = await response.json().catch(() => ({}));
  const data = Array.isArray(body?.data) ? body.data : [];
  // status is P24's own per-shop enable flag. Anything not explicitly true is
  // treated as off rather than assumed on.
  return data.filter((m: any) => m?.status === true && Number.isSafeInteger(m?.id));
}

// Drives the checkout picker. Returns one entry per group we can actually
// offer, never a hard-coded list. Failure is not fatal to checkout: the browser
// falls back to a single button and Przelewy24 present their own method page.
export const listMethods = action({
  args: { lang: v.union(v.literal("pl"), v.literal("en")) },
  handler: async (_ctx, args): Promise<{
    groups: Array<{ key: MethodGroupKey; methodId: number | null; count: number }>;
  }> => {
    const methods = await fetchEnabledMethods(args.lang);
    const byGroup = new Map<MethodGroupKey, number[]>();
    for (const method of methods) {
      const key = methodGroupOf(method);
      byGroup.set(key, [...(byGroup.get(key) || []), method.id]);
    }
    const order: MethodGroupKey[] = ["blik", "card", "transfer"];
    return {
      groups: order.flatMap((key) => {
        const ids = byGroup.get(key);
        if (!ids || ids.length === 0) return [];
        // The count is shown to the customer as a number of banks, so the manual
        // transfer method (TraditionalTransfer, settles in days) is excluded from
        // it while staying available in the group.
        const count = key !== "transfer"
          ? ids.length
          : methods.filter(m => methodGroupOf(m) === "transfer" && m.group !== "TraditionalTransfer").length;
        // BLIK and card resolve to one id so the customer lands straight on that
        // screen. Transfers stay unpinned: the bank list is P24's job, and their
        // page already handles per-bank availability hours.
        return [{ key, methodId: key === "transfer" ? null : Math.min(...ids), count }];
      }),
    };
  },
});

export const createPayment = action({
  args: {
    sessionToken: v.string(),
    checkoutRef: v.string(),
    items: v.array(ITEM_SHAPE),
    billing: BILLING_SHAPE,
    lang: v.union(v.literal("pl"), v.literal("en")),
    // The method the customer picked on our page. Verified against the live
    // list below and dropped if it is not currently enabled, because sending a
    // customer to a method P24 will not honour is worse than showing their
    // full method page.
    method: v.optional(v.number()),
    consentTerms: v.boolean(),
    consentImmediate: v.boolean(),
    consentMarketing: v.boolean(),
    analysisAddon: v.optional(v.boolean()),
    forChild: v.optional(v.boolean()),
    // ⛔ Both of these must be listed here as well as on preparePayment: this
    // action is what the browser calls, and Convex rejects unknown arguments,
    // so adding them to the internal mutation alone gets an
    // ArgumentValidationError from the client (the 2026-08-10 trap).
    quoteRef: v.optional(v.string()),
    consentAnalysis: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<{ sessionId: string; redirectUrl: string }> => {
    const cfg = p24Config();
    const sessionId = `EM-${crypto.randomUUID()}`;

    // Resolved before the row is written, because whether we honour the choice
    // decides whether an earlier payment is resumable. Fail open: a method that
    // cannot be confirmed as enabled right now is dropped rather than sent, and
    // a methods outage never blocks a sale.
    let method: number | undefined;
    if (args.method !== undefined) {
      try {
        const enabled = await fetchEnabledMethods(args.lang);
        if (enabled.some((m: any) => m.id === args.method)) method = args.method;
      } catch (error: any) {
        console.error("p24 method check failed, continuing without it:", error?.message);
      }
    }

    // method is ours alone: preparePayment takes requestedMethod instead, and
    // Convex validators reject unknown fields, so it must not reach the spread.
    const { method: _clientMethod, ...prepareArgs } = args;
    const payment: any = await ctx.runMutation(internal.p24.preparePayment, {
      ...prepareArgs,
      sessionId,
      requestedMethod: method,
    });
    if (payment.status === "paid") {
      return {
        sessionId: payment.sessionId,
        redirectUrl: `${cfg.returnBase}?sessionId=${encodeURIComponent(payment.sessionId)}`,
      };
    }
    if (payment.token && payment.status === "registered") {
      return {
        sessionId: payment.sessionId,
        redirectUrl: `${cfg.redirectBase}/trnRequest/${encodeURIComponent(payment.token)}`,
      };
    }

    const sign = await sha384({
      sessionId: payment.sessionId,
      merchantId: cfg.merchantId,
      amount: payment.amount,
      currency: payment.currency,
      crc: cfg.crc,
    });
    const payload = {
      merchantId: cfg.merchantId,
      posId: cfg.posId,
      sessionId: payment.sessionId,
      amount: payment.amount,
      currency: payment.currency,
      description: `EnglishMetro ${payment.checkoutRef}`,
      email: payment.email,
      country: "PL",
      language: payment.lang,
      urlReturn: `${cfg.returnBase}?sessionId=${encodeURIComponent(payment.sessionId)}`,
      urlStatus: cfg.statusUrl,
      waitForResult: true,
      regulationAccept: false,
      ...(method === undefined ? {} : { method }),
      sign,
    };

    async function register(body: Record<string, unknown>) {
      const response = await fetch(`${cfg.apiBase}/api/v1/transaction/register`, {
        method: "POST",
        headers: {
          "Authorization": p24AuthHeader(cfg.posId, cfg.apiKey),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const responseBody: any = await response.json().catch(() => ({}));
      return { ok: response.ok, status: response.status, body: responseBody, token: responseBody?.data?.token };
    }

    try {
      let result = await register(payload);
      // A method the shop cannot honour must never cost us the sale. Retrying
      // without it puts the customer on Przelewy24's own method page, which is
      // exactly where they were before this shortcut existed. Only ever retried
      // when a method was pinned, so a genuine failure still surfaces.
      if (!result.token && method !== undefined) {
        console.error("p24 register rejected method", method, JSON.stringify(result.body).slice(0, 200));
        const { method: _dropped, ...withoutMethod } = payload as any;
        result = await register(withoutMethod);
      }
      const token = result.token;
      if (!result.ok && !token) {
        throw new Error(`P24 registration failed (${result.status}): ${JSON.stringify(result.body).slice(0, 350)}`);
      }
      if (typeof token !== "string" || !token) {
        throw new Error(`P24 registration returned no token (${result.status})`);
      }
      await ctx.runMutation(internal.p24.markRegistered, { paymentId: payment._id, token });
      return {
        sessionId: payment.sessionId,
        redirectUrl: `${cfg.redirectBase}/trnRequest/${encodeURIComponent(token)}`,
      };
    } catch (error: any) {
      await ctx.runMutation(internal.p24.markRegistrationFailed, {
        paymentId: payment._id,
        error: String(error?.message || error),
      });
      throw new Error("We could not start the secure payment. Please try again.");
    }
  },
});

// Admin reconciliation. Without this a payment that captured money but failed to
// allocate lessons is invisible to everyone, including the person who has to
// refund it. "needsAttention" is the only column that matters day to day.
export const listPayments = query({
  args: {
    sessionToken: v.string(),
    organizationId: v.optional(v.id("organizations")),
  },
  handler: async (ctx, args) => {
    const { user } = await requireAdmin(ctx, args.sessionToken);
    let rows;
    if (isSuperadmin(user.role) && !args.organizationId) {
      rows = await ctx.db.query("p24Payments").collect();
    } else {
      const org = args.organizationId ?? user.organizationId;
      if (!org) throw new Error("No organization in scope");
      rows = (await ctx.db.query("p24Payments").collect()).filter(p => p.organizationId === org);
    }
    const now = Date.now();
    const out = [];
    for (const payment of rows.sort((a, b) => b.createdAt - a.createdAt).slice(0, 200)) {
      const student: any = await ctx.db.get(payment.studentId);
      // Money taken but lessons not allocated, or a transaction that reached P24
      // and then went quiet — both mean a customer is owed something.
      const stranded = payment.status === "paid" && !!payment.allocationErrors?.length;
      const stale = payment.status === "registered" && now - payment.createdAt > 60 * 60 * 1000;
      out.push({
        _id: payment._id,
        organizationId: payment.organizationId,
        checkoutRef: payment.checkoutRef,
        sessionId: payment.sessionId,
        status: payment.status,
        amount: payment.amount,
        currency: payment.currency,
        email: payment.email,
        studentName: student?.name ?? "Unknown",
        studentSlug: student?.slug ?? null,
        p24OrderId: payment.p24OrderId,
        allocationErrors: payment.allocationErrors ?? [],
        error: payment.error,
        createdAt: payment.createdAt,
        verifiedAt: payment.verifiedAt,
        needsAttention: stranded || stale || payment.status === "registration_failed",
      });
    }
    return out;
  },
});

export const getStatus = query({
  args: {
    sessionToken: v.string(),
    sessionId: v.string(),
  },
  handler: async (ctx, args) => {
    const { student } = await requireStudent(ctx, args.sessionToken);
    const payment = await ctx.db
      .query("p24Payments")
      .withIndex("by_session_id", q => q.eq("sessionId", args.sessionId))
      .unique();
    if (!payment || payment.studentId !== student._id) throw new Error("Payment not found");
    return {
      status: payment.status,
      checkoutRef: payment.checkoutRef,
      amount: payment.amount,
      currency: payment.currency,
      verifiedAt: payment.verifiedAt,
    };
  },
});
