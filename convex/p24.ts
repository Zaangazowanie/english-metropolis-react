import { action, internalAction, internalMutation, internalQuery, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { requireStudent, requireAdmin, isSuperadmin } from "./authHelpers";

const CURRENCY = "PLN";
const TERMS_VERSION = "EM-LEGAL-03 (2026-07-29, revision 4)";
const WITHDRAWAL_PERIOD_MS = 14 * 24 * 60 * 60 * 1000;
// How long an unpaid transaction stays resumable, so a returning customer is
// sent back to the payment they already started instead of opening a second one.
const OPEN_PAYMENT_TTL_MS = 30 * 60 * 1000;

// This is the server-side price authority for payment registration. Never use
// names, lesson counts, or amounts sent by the browser to charge a customer.
const CATALOG: Record<string, { name: string; lessons: number; pricePLN: number }> = {
  single: { name: "One-off 1:1", lessons: 1, pricePLN: 135 },
  "private-core": { name: "Private Core", lessons: 4, pricePLN: 480 },
  momentum: { name: "Fluency Momentum", lessons: 8, pricePLN: 880 },
  "fluency-16": { name: "Fluency Builder", lessons: 16, pricePLN: 1600 },
  "fluency-24": { name: "Fluency Mastery", lessons: 24, pricePLN: 2160 },
  specialist: { name: "Specialist Sprint", lessons: 6, pricePLN: 900 },
  "specialist-12": { name: "Specialist Track", lessons: 12, pricePLN: 1560 },
  "specialist-24": { name: "Specialist Mastery", lessons: 24, pricePLN: 2640 },
  august: { name: "August Summer Course", lessons: 4, pricePLN: 200 },
  september: { name: "September Summer Course", lessons: 4, pricePLN: 200 },
  "two-month-bundle": { name: "August + September Bundle", lessons: 8, pricePLN: 400 },
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
  },
  handler: async (ctx, args) => {
    const { student } = await requireStudent(ctx, args.sessionToken);
    if (!args.consentTerms) throw new Error("Terms must be accepted");
    // The express request for immediate performance is deliberately NOT required.
    // § 5 of the published Regulamin treats it as a separate, optional statement and
    // provides for delivery after the 14-day period when it is not made, so making it
    // a condition of buying would both breach art. 15 ust. 3 u.p.k. and contradict our
    // own terms. Without it the package simply activates when the period expires.
    if (!args.items.length || args.items.length > 20) throw new Error("Cart is empty or too large");
    if (!args.billing.fullName.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(args.billing.email)) {
      throw new Error("Billing name and a valid e-mail are required");
    }

    const normalized = args.items.map(item => {
      const product = CATALOG[item.packageId];
      const qty = Math.trunc(item.qty);
      if (!product || qty < 1 || qty > 20) throw new Error("Invalid cart item");
      return { ...product, packageId: item.packageId, qty };
    });
    const amount = normalized.reduce((sum, item) => sum + item.pricePLN * item.qty * 100, 0);
    if (!Number.isSafeInteger(amount) || amount < 100 || amount > 5_000_000) {
      throw new Error("Invalid payment amount");
    }
    const itemsKey = normalized.map(item => `${item.packageId}x${item.qty}`).sort().join("|");
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
    if (resumable) return resumable;
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
      consentCapturedAt: now,
      termsVersion: TERMS_VERSION,
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
    for (const item of normalized) {
      const lineAmount = item.pricePLN * item.qty * 100;
      const orderId = await ctx.db.insert("lessonOrders", {
        organizationId: student.organizationId,
        studentId: student._id,
        packageId: item.packageId,
        packageName: item.qty > 1 ? `${item.name} ×${item.qty}` : item.name,
        lessons: item.lessons * item.qty,
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

export const createPayment = action({
  args: {
    sessionToken: v.string(),
    checkoutRef: v.string(),
    items: v.array(ITEM_SHAPE),
    billing: BILLING_SHAPE,
    lang: v.union(v.literal("pl"), v.literal("en")),
    consentTerms: v.boolean(),
    consentImmediate: v.boolean(),
    consentMarketing: v.boolean(),
  },
  handler: async (ctx, args): Promise<{ sessionId: string; redirectUrl: string }> => {
    const cfg = p24Config();
    const sessionId = `EM-${crypto.randomUUID()}`;
    const payment: any = await ctx.runMutation(internal.p24.preparePayment, {
      ...args,
      sessionId,
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
      sign,
    };

    try {
      const response = await fetch(`${cfg.apiBase}/api/v1/transaction/register`, {
        method: "POST",
        headers: {
          "Authorization": p24AuthHeader(cfg.posId, cfg.apiKey),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const responseBody: any = await response.json().catch(() => ({}));
      const token = responseBody?.data?.token;
      if (!response.ok || typeof token !== "string" || !token) {
        throw new Error(`P24 registration failed (${response.status}): ${JSON.stringify(responseBody).slice(0, 350)}`);
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
