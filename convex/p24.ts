import { action, internalMutation, internalQuery, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { requireStudent } from "./authHelpers";

const CURRENCY = "PLN";
const TERMS_VERSION = "EM-LEGAL-03 (2026-07-29)";

// This is the server-side price authority for payment registration. Never use
// names, lesson counts, or amounts sent by the browser to charge a customer.
const CATALOG: Record<string, { name: string; lessons: number; pricePLN: number }> = {
  single: { name: "One-off 1:1", lessons: 1, pricePLN: 135 },
  "private-core": { name: "Private Core", lessons: 4, pricePLN: 480 },
  momentum: { name: "Fluency Momentum", lessons: 8, pricePLN: 880 },
  "fluency-16": { name: "Fluency Builder", lessons: 16, pricePLN: 1600 },
  "fluency-24": { name: "Fluency Mastery", lessons: 24, pricePLN: 2160 },
  "fluency-48": { name: "Fluency Complete", lessons: 48, pricePLN: 3840 },
  specialist: { name: "Specialist Sprint", lessons: 6, pricePLN: 900 },
  "specialist-12": { name: "Specialist Track", lessons: 12, pricePLN: 1560 },
  "specialist-24": { name: "Specialist Mastery", lessons: 24, pricePLN: 2640 },
  // Company courses are prepared as enquiries and invoiced after schedule confirmation.
  // August and the two-month bundle were withdrawn on 2026-08-10.
  september: { name: "September Group Course", lessons: 8, pricePLN: 400 },
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
    if (!args.items.length || args.items.length > 20) throw new Error("Cart is empty or too large");
    if (!args.billing.fullName.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(args.billing.email)) {
      throw new Error("Billing name and a valid e-mail are required");
    }

    const existing = await ctx.db
      .query("p24Payments")
      .withIndex("by_checkout_ref", q => q.eq("checkoutRef", args.checkoutRef))
      .unique();
    if (existing) {
      if (existing.studentId !== student._id) throw new Error("Checkout reference already used");
      return existing;
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

    const now = Date.now();
    const paymentId = await ctx.db.insert("p24Payments", {
      checkoutRef: args.checkoutRef,
      sessionId: args.sessionId,
      organizationId: student.organizationId,
      studentId: student._id,
      orderIds: [],
      amount,
      currency: CURRENCY,
      email: args.billing.email.toLowerCase(),
      lang: args.lang,
      status: "created",
      createdAt: now,
      updatedAt: now,
    });

    const consentNote = `[${args.checkoutRef}] Zgody: regulamin ${TERMS_VERSION} TAK; niezwłoczna realizacja ${args.consentImmediate ? "TAK" : "NIE"}; marketing ${args.consentMarketing ? "TAK" : "NIE"}.`;
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
    for (const orderId of payment.orderIds) {
      const order = await ctx.db.get(orderId);
      if (!order) throw new Error(`Order ${String(orderId)} not found`);
      if (order.status === "confirmed") continue;
      if (order.status !== "payment_pending") throw new Error(`Order ${String(orderId)} cannot be confirmed`);
      const packageRef = await ctx.db.insert("lessonPackages", {
        organizationId: order.organizationId,
        studentId: order.studentId,
        name: `${order.packageName} (P24)`,
        totalLessons: order.lessons,
        purchasedAt: now,
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
      verifiedAt: now,
      updatedAt: now,
    });
    return { ok: true, alreadyPaid: false };
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
