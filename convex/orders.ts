// Lesson package orders — the pre-payment-gateway purchase flow (2026-07-10).
//
// Students pick a live package + enter billing details in the student panel.
// The order lands here as "pending_invoice"; Mike invoices manually (Tpay
// integration pending), and once paid he confirms in the superadmin console —
// which creates the lessonPackage that actually allocates the lessons.

import { query, mutation, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { requireAdmin, isSuperadmin } from "./authHelpers";
import { billableUnitsForStudent, allocateBalances } from "./billing";

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

// Student-facing: place an order. Public-with-studentId, matching the
// booking/curriculum pattern (TODO Phase A2: require the student session).
export const createOrder = mutation({
  args: {
    studentId: v.id("students"),
    packageId: v.string(),
    packageName: v.string(),
    lessons: v.number(),
    priceLabel: v.string(),
    billing: BILLING_SHAPE,
  },
  handler: async (ctx, args) => {
    const student = await ctx.db.get(args.studentId);
    if (!student) throw new Error("Student not found");
    if (!student.organizationId) throw new Error("Student has no organization");
    if (args.lessons < 1 || args.lessons > 50) throw new Error("Invalid lesson count");
    if (!args.billing.fullName.trim() || !/@/.test(args.billing.email)) {
      throw new Error("Billing name and a valid email are required");
    }
    const now = Date.now();
    const orderId = await ctx.db.insert("lessonOrders", {
      organizationId: student.organizationId,
      studentId: args.studentId,
      packageId: args.packageId,
      packageName: args.packageName,
      lessons: args.lessons,
      priceLabel: args.priceLabel,
      billing: args.billing,
      status: "pending_invoice",
      createdAt: now,
      updatedAt: now,
    });
    // Emails: school inbox + owner copy + confirmation to the student.
    await ctx.scheduler.runAfter(0, internal.orders.notifyOrderPlaced, {
      orderId,
      packageName: args.packageName,
      lessons: args.lessons,
      priceLabel: args.priceLabel,
      billing: args.billing,
      studentName: student.name,
      studentSlug: student.slug,
      studentEmail: student.googleEmail || student.email || "",
    });
    return { orderId, status: "pending_invoice" };
  },
});

// Fire the order emails via em-report (same relay as booking confirmations,
// order-confirm endpoint). Fire-and-forget: a mail hiccup must never lose the
// order itself, which is already committed by the time this runs.
export const notifyOrderPlaced = internalAction({
  args: {
    orderId: v.id("lessonOrders"),
    packageName: v.string(),
    lessons: v.number(),
    priceLabel: v.string(),
    billing: BILLING_SHAPE,
    studentName: v.string(),
    studentSlug: v.string(),
    studentEmail: v.string(),
  },
  handler: async (_ctx, args) => {
    const base = process.env.BOOKING_NOTIFY_URL;
    const key = process.env.BOOKING_NOTIFY_KEY;
    if (!base || !key) {
      console.warn("orders:notifyOrderPlaced skipped — BOOKING_NOTIFY_URL/KEY unset");
      return;
    }
    const url = base.replace("booking-confirm", "order-confirm");
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-booking-key": key },
        body: JSON.stringify(args),
      });
      if (!res.ok) console.error("order-confirm notify failed:", res.status);
    } catch (e: any) {
      console.error("order-confirm notify error:", e?.message);
    }
  },
});

// Student-facing: my orders (public-with-studentId, same pattern).
export const listMyOrders = query({
  args: { studentId: v.id("students") },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("lessonOrders")
      .withIndex("by_student", q => q.eq("studentId", args.studentId))
      .collect();
    return rows
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(o => ({
        _id: o._id, packageId: o.packageId, packageName: o.packageName,
        lessons: o.lessons, priceLabel: o.priceLabel, status: o.status,
        createdAt: o.createdAt,
      }));
  },
});

// Student-facing allocation summary — powers "N lessons remaining" in the
// panel and the booking gate UI. Public-with-studentId.
export const getStudentAllocation = query({
  args: { studentId: v.id("students") },
  handler: async (ctx, args) => {
    const now = Date.now();
    const allPackages = (await ctx.db
      .query("lessonPackages")
      .withIndex("by_student", q => q.eq("studentId", args.studentId))
      .collect()).filter(p => p.status !== "cancelled");
    const packages = allPackages.filter(p => !p.availableFrom || p.availableFrom <= now);
    const units = await billableUnitsForStudent(ctx, args.studentId);
    const withBalances = allocateBalances(packages, units);
    const allocated = packages.reduce((n: number, p: any) => n + (p.totalLessons || 0), 0);
    const remaining = withBalances.reduce((n: number, p: any) => n + (p.remainingLessons ?? 0), 0);
    const pendingUntil = allPackages
      .filter(p => p.availableFrom && p.availableFrom > now)
      .reduce((earliest: number | null, p: any) =>
        earliest === null || p.availableFrom < earliest ? p.availableFrom : earliest, null);
    return { allocated, remaining, used: allocated - remaining, pendingUntil };
  },
});

// Admin: list orders (superadmin = all orgs unless one is given).
export const listOrders = query({
  args: {
    sessionToken: v.string(),
    organizationId: v.optional(v.id("organizations")),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await requireAdmin(ctx, args.sessionToken);
    let rows;
    if (isSuperadmin(user.role) && !args.organizationId) {
      rows = await ctx.db.query("lessonOrders").collect();
    } else {
      const org = args.organizationId ?? user.organizationId;
      if (!org) throw new Error("No organization in scope");
      rows = await ctx.db
        .query("lessonOrders")
        .withIndex("by_organization", q => q.eq("organizationId", org))
        .collect();
    }
    if (args.status) rows = rows.filter(o => o.status === args.status);
    const out = [];
    for (const o of rows.sort((a, b) => b.createdAt - a.createdAt)) {
      const student: any = await ctx.db.get(o.studentId);
      out.push({ ...o, studentName: student?.name ?? "Unknown", studentSlug: student?.slug ?? null });
    }
    return out;
  },
});

// Superadmin: confirm an order was PAID → allocate its lessons.
export const confirmOrder = mutation({
  args: { sessionToken: v.string(), orderId: v.id("lessonOrders") },
  handler: async (ctx, args) => {
    const { user } = await requireAdmin(ctx, args.sessionToken);
    if (!isSuperadmin(user.role)) throw new Error("Superadmin only");
    const order = await ctx.db.get(args.orderId);
    if (!order) throw new Error("Order not found");
    if (order.status !== "pending_invoice") throw new Error(`Order is already ${order.status}`);
    const now = Date.now();
    const packageRef = await ctx.db.insert("lessonPackages", {
      organizationId: order.organizationId,
      studentId: order.studentId,
      name: `${order.packageName} (order)`,
      totalLessons: order.lessons,
      purchasedAt: now,
      notes: `Order ${String(args.orderId)} · ${order.priceLabel} · confirmed by ${user.email}`,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(args.orderId, {
      status: "confirmed", confirmedBy: user.email ?? user.name,
      confirmedAt: now, packageRef, updatedAt: now,
    });
    return { ok: true, packageRef, lessons: order.lessons };
  },
});

// Admin: cancel a pending order (mistake / student changed their mind).
export const cancelOrder = mutation({
  args: { sessionToken: v.string(), orderId: v.id("lessonOrders") },
  handler: async (ctx, args) => {
    const { user } = await requireAdmin(ctx, args.sessionToken);
    const order = await ctx.db.get(args.orderId);
    if (!order) throw new Error("Order not found");
    // "payment_pending" is the P24 checkout state. A customer who abandons the
    // payment page leaves one behind forever, so it has to be cancellable — but
    // only once we are sure Przelewy24 never took the money for it.
    if (order.status !== "pending_invoice" && order.status !== "payment_pending") {
      throw new Error(`Order is already ${order.status}`);
    }
    if (order.status === "payment_pending") {
      const payment = order.paymentId ? await ctx.db.get(order.paymentId) : null;
      if (payment?.status === "paid") {
        throw new Error("This order was paid through Przelewy24 and cannot be cancelled here");
      }
    }
    await ctx.db.patch(args.orderId, { status: "cancelled", updatedAt: Date.now(), confirmedBy: user.email });
    return { ok: true };
  },
});
