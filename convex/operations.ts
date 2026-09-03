import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireSuperadmin } from "./authHelpers";
import { allocateBalances, billableUnitsForStudent } from "./billing";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const MANAGED_KINDS = new Set([
  "paid_no_booking",
  "order_package_missing",
  "order_notification_failed",
  "booking_missing_meet",
  "booking_notification_failed",
  "booking_cancellation_notification_failed",
  "booking_stale_scheduled",
]);

type Candidate = {
  fingerprint: string;
  kind: string;
  severity: "high" | "medium" | "low";
  title: string;
  message: string;
  studentId?: any;
  orderId?: any;
  packageId?: any;
  bookingId?: any;
  details?: string;
};

function isoDate(ms: number) {
  return new Date(ms).toISOString().slice(0, 10);
}

function contactEmail(student: any) {
  return student?.googleEmail || student?.email || null;
}

// Rebuild the durable action queue from source-of-truth records. The mutation
// is idempotent and also resolves alerts whose underlying condition disappeared.
export const reconcileAlerts = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const [students, packages, orders, bookings, existingAlerts] = await Promise.all([
      ctx.db.query("students").collect(),
      ctx.db.query("lessonPackages").collect(),
      ctx.db.query("lessonOrders").collect(),
      ctx.db.query("lessonBookings").collect(),
      ctx.db.query("operationsAlerts").collect(),
    ]);
    const studentsById = new Map(students.map((row: any) => [String(row._id), row]));
    const bookingsByStudent = new Map<string, any[]>();
    for (const booking of bookings) {
      const key = String(booking.studentId);
      if (!bookingsByStudent.has(key)) bookingsByStudent.set(key, []);
      bookingsByStudent.get(key)!.push(booking);
    }

    const candidates = new Map<string, Candidate>();
    const add = (candidate: Candidate) => candidates.set(candidate.fingerprint, candidate);

    // A paid learner who has never created a booking is the highest-value gap:
    // the sale succeeded but onboarding stopped before teaching started.
    for (const pack of packages) {
      if (pack.status === "cancelled" || now - pack.purchasedAt < 12 * HOUR_MS ||
          now - pack.purchasedAt > 45 * DAY_MS ||
          (pack.availableFrom && pack.availableFrom > now)) continue;
      const student = studentsById.get(String(pack.studentId));
      const studentBookings = bookingsByStudent.get(String(pack.studentId)) || [];
      const realBookings = studentBookings.filter((b: any) =>
        ["scheduled", "completed", "cancelled", "cancelled_late"].includes(b.status));
      if (realBookings.length === 0) {
        add({
          fingerprint: `paid-no-booking:${String(pack.studentId)}`,
          kind: "paid_no_booking",
          severity: "high",
          title: `${student?.name || "A student"} paid but has never booked`,
          message: `${pack.totalLessons} lessons were allocated on ${isoDate(pack.purchasedAt)}, but no booking exists.`,
          studentId: pack.studentId,
          packageId: pack._id,
          details: JSON.stringify({
            purchasedAt: pack.purchasedAt,
            packageName: pack.name,
            totalLessons: pack.totalLessons,
            email: contactEmail(student),
          }),
        });
      }
    }

    for (const order of orders) {
      if (order.notificationStatus === "failed") {
        const student = studentsById.get(String(order.studentId));
        add({
          fingerprint: `order-notify-failed:${String(order._id)}`,
          kind: "order_notification_failed",
          severity: "high",
          title: "Purchase confirmation could not be delivered",
          message: `${student?.name || "Student"}'s ${order.packageName} email failed after ${order.notificationAttempts || 1} attempt(s).`,
          studentId: order.studentId,
          orderId: order._id,
          details: JSON.stringify({ lastError: order.notificationLastError || "Unknown delivery error" }),
        });
      }
      if (order.status !== "confirmed") continue;
      const pack = order.packageRef ? await ctx.db.get(order.packageRef) : null;
      if (!order.packageRef || !pack) {
        const student = studentsById.get(String(order.studentId));
        add({
          fingerprint: `order-package-missing:${String(order._id)}`,
          kind: "order_package_missing",
          severity: "high",
          title: "Paid order has no usable lesson allocation",
          message: `${student?.name || "Student"}'s confirmed ${order.packageName} order is not linked to a live package.`,
          studentId: order.studentId,
          orderId: order._id,
          details: JSON.stringify({ orderStatus: order.status, confirmedAt: order.confirmedAt }),
        });
      }
    }

    for (const booking of bookings) {
      const student = studentsById.get(String(booking.studentId));
      // Every booking carries a Jitsi placeholder from the moment it is written
      // (scheduling.ts generateMeetLink); the Google Meet replaces it when the
      // confirmation is sent. So "no video link" means "still the placeholder",
      // not "empty" — the previous test (`!booking.meetLink`) could never fire.
      if (booking.status === "scheduled" && booking.startUtc > now + HOUR_MS &&
          !/meet\.google\.com/.test(String(booking.meetLink || ""))) {
        add({
          fingerprint: `booking-no-meet:${String(booking._id)}`,
          kind: "booking_missing_meet",
          severity: "high",
          title: "Upcoming lesson has no video link",
          message: `${student?.name || "Student"} is booked for ${booking.dateWarsaw} ${booking.timeWarsaw}.`,
          studentId: booking.studentId,
          bookingId: booking._id,
        });
      }
      if (booking.notificationStatus === "failed" || booking.notificationStatus === "partial") {
        add({
          fingerprint: `booking-notify-failed:${String(booking._id)}`,
          kind: "booking_notification_failed",
          severity: "high",
          title: "Booking confirmation could not be delivered",
          message: `${student?.name || "Student"}'s confirmation failed after ${booking.notificationAttempts || 1} attempt(s).`,
          studentId: booking.studentId,
          bookingId: booking._id,
          details: JSON.stringify({ lastError: booking.notificationLastError || "Unknown delivery error" }),
        });
      }
      if (booking.cancellationNotificationStatus === "failed" || booking.cancellationNotificationStatus === "partial") {
        add({
          fingerprint: `booking-cancel-notify-failed:${String(booking._id)}`,
          kind: "booking_cancellation_notification_failed",
          severity: "high",
          title: "Cancellation notice could not be delivered",
          message: `${student?.name || "Student"}'s cancellation notice failed after ${booking.cancellationNotificationAttempts || 1} attempt(s).`,
          studentId: booking.studentId,
          bookingId: booking._id,
          details: JSON.stringify({ lastError: booking.cancellationNotificationLastError || "Unknown delivery error" }),
        });
      }
      if (booking.status === "scheduled" && booking.endUtc < now - 2 * HOUR_MS) {
        add({
          fingerprint: `booking-stale:${String(booking._id)}`,
          kind: "booking_stale_scheduled",
          severity: "medium",
          title: "Past lesson is still marked scheduled",
          message: `${student?.name || "Student"}'s ${booking.dateWarsaw} lesson needs reconciliation.`,
          studentId: booking.studentId,
          bookingId: booking._id,
        });
      }
    }

    const existingByFingerprint = new Map(existingAlerts.map((row: any) => [row.fingerprint, row]));
    let opened = 0;
    let updated = 0;
    let resolved = 0;
    for (const candidate of candidates.values()) {
      const old: any = existingByFingerprint.get(candidate.fingerprint);
      if (!old) {
        await ctx.db.insert("operationsAlerts", {
          ...candidate,
          status: "open",
          firstSeenAt: now,
          lastSeenAt: now,
          updatedAt: now,
        });
        opened++;
      } else {
        await ctx.db.patch(old._id, {
          ...candidate,
          status: old.status === "resolved" ? "open" : old.status,
          lastSeenAt: now,
          resolvedAt: undefined,
          updatedAt: now,
        });
        updated++;
      }
    }
    for (const old of existingAlerts) {
      if (!MANAGED_KINDS.has(old.kind) || old.status === "resolved") continue;
      if (!candidates.has(old.fingerprint)) {
        await ctx.db.patch(old._id, { status: "resolved", resolvedAt: now, updatedAt: now });
        resolved++;
      }
    }
    return { candidates: candidates.size, opened, updated, resolved };
  },
});

export const getCommandCenter = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    await requireSuperadmin(ctx, args.sessionToken);
    const now = Date.now();
    const [students, orgs, packages, orders, bookings, alerts, lessons, youglishRows] = await Promise.all([
      ctx.db.query("students").collect(),
      ctx.db.query("organizations").collect(),
      ctx.db.query("lessonPackages").collect(),
      ctx.db.query("lessonOrders").collect(),
      ctx.db.query("lessonBookings").collect(),
      ctx.db.query("operationsAlerts").collect(),
      ctx.db.query("lessons").collect(),
      ctx.db.query("youglishIndex").collect(),
    ]);
    const wordsWithClips = new Set(youglishRows
      .filter((row: any) => (row.results || []).length > 0)
      .map((row: any) => row.keyword));
    const studentsById = new Map(students.map((row: any) => [String(row._id), row]));
    const orgsById = new Map(orgs.map((row: any) => [String(row._id), row]));
    const bookingsByStudent = new Map<string, any[]>();
    for (const booking of bookings) {
      const key = String(booking.studentId);
      if (!bookingsByStudent.has(key)) bookingsByStudent.set(key, []);
      bookingsByStudent.get(key)!.push(booking);
    }

    const actionItems = alerts
      .filter((row: any) => row.status !== "resolved")
      .sort((a: any, b: any) => {
        const rank: Record<string, number> = { high: 0, medium: 1, low: 2 };
        return (rank[a.severity] ?? 9) - (rank[b.severity] ?? 9) || b.firstSeenAt - a.firstSeenAt;
      })
      .map((row: any) => {
        const student: any = row.studentId ? studentsById.get(String(row.studentId)) : null;
        return {
          ...row,
          studentName: student?.name || null,
          studentSlug: student?.slug || null,
          studentEmail: contactEmail(student),
        };
      });

    const recentPurchases = packages
      .filter((row: any) => row.status !== "cancelled")
      .sort((a: any, b: any) => b.purchasedAt - a.purchasedAt)
      .slice(0, 24)
      .map((pack: any) => {
        const student: any = studentsById.get(String(pack.studentId));
        const studentBookings = bookingsByStudent.get(String(pack.studentId)) || [];
        const next = studentBookings
          .filter((b: any) => b.status === "scheduled" && b.startUtc > now)
          .sort((a: any, b: any) => a.startUtc - b.startUtc)[0];
        const linkedOrder: any = orders.find((o: any) => String(o.packageRef || "") === String(pack._id));
        return {
          ...pack,
          studentName: student?.name || "Unknown student",
          studentSlug: student?.slug || null,
          studentEmail: contactEmail(student),
          organizationName: orgsById.get(String(pack.organizationId))?.name || "Unknown school",
          hasEverBooked: studentBookings.length > 0,
          nextBooking: next ? { _id: next._id, startUtc: next.startUtc, dateWarsaw: next.dateWarsaw, timeWarsaw: next.timeWarsaw } : null,
          orderId: linkedOrder?._id || null,
          orderStatus: linkedOrder?.status || null,
        };
      });

    const upcomingBookings = bookings
      .filter((row: any) => row.status === "scheduled" && row.startUtc > now)
      .sort((a: any, b: any) => a.startUtc - b.startUtc)
      .slice(0, 20)
      .map((row: any) => {
        const student: any = studentsById.get(String(row.studentId));
        return {
          ...row,
          studentName: student?.name || "Unknown student",
          studentSlug: student?.slug || null,
          studentEmail: contactEmail(student),
          organizationName: orgsById.get(String(row.organizationId))?.name || "Unknown school",
        };
      });

    const recentLessonRows = lessons
      .filter((row: any) => row.date >= isoDate(now - 14 * DAY_MS))
      .sort((a: any, b: any) => b.date.localeCompare(a.date) || b.updatedAt - a.updatedAt)
      .slice(0, 16);
    const recentLessonHealth = [];
    for (const lesson of recentLessonRows) {
      const [keywords, analysis] = await Promise.all([
        ctx.db.query("keywords").withIndex("by_lesson", (q: any) => q.eq("lessonId", lesson._id)).collect(),
        ctx.db.query("transcriptAnalyses").withIndex("by_lesson", (q: any) => q.eq("lessonId", lesson._id)).first(),
      ]);
      const student: any = studentsById.get(String(lesson.studentId));
      recentLessonHealth.push({
        ...lesson,
        studentName: student?.name || "Unknown student",
        studentSlug: student?.slug || null,
        keywordCount: keywords.length,
        youglishCount: keywords.filter((k: any) => wordsWithClips.has(k.word)).length,
        hasAnalysis: Boolean(analysis),
      });
    }

    return {
      generatedAt: now,
      stats: {
        activeStudents: students.filter((row: any) => row.status === "active").length,
        openAlerts: actionItems.length,
        urgentAlerts: actionItems.filter((row: any) => row.severity === "high").length,
        upcomingBookings: bookings.filter((row: any) => row.status === "scheduled" && row.startUtc > now).length,
        paidNeverBooked: actionItems.filter((row: any) => row.kind === "paid_no_booking").length,
        failedNotifications: actionItems.filter((row: any) =>
          ["booking_notification_failed", "booking_cancellation_notification_failed", "order_notification_failed"]
            .includes(row.kind)).length,
      },
      actionItems,
      recentPurchases,
      upcomingBookings,
      recentLessonHealth,
    };
  },
});

export const getStudentPreview = query({
  args: { sessionToken: v.string(), studentId: v.id("students") },
  handler: async (ctx, args) => {
    await requireSuperadmin(ctx, args.sessionToken);
    const student = await ctx.db.get(args.studentId);
    if (!student) throw new Error("Student not found");
    const [bookings, packages, orders, lessons, keywords, alerts, units, youglishRows] = await Promise.all([
      ctx.db.query("lessonBookings").withIndex("by_student", q => q.eq("studentId", args.studentId)).collect(),
      ctx.db.query("lessonPackages").withIndex("by_student", q => q.eq("studentId", args.studentId)).collect(),
      ctx.db.query("lessonOrders").withIndex("by_student", q => q.eq("studentId", args.studentId)).collect(),
      ctx.db.query("lessons").withIndex("by_student", q => q.eq("studentId", args.studentId)).collect(),
      ctx.db.query("keywords").withIndex("by_student", q => q.eq("studentId", args.studentId)).collect(),
      ctx.db.query("operationsAlerts").withIndex("by_student", q => q.eq("studentId", args.studentId)).collect(),
      billableUnitsForStudent(ctx, args.studentId),
      ctx.db.query("youglishIndex").collect(),
    ]);
    const wordsWithClips = new Set(youglishRows
      .filter((row: any) => (row.results || []).length > 0)
      .map((row: any) => row.keyword));
    const activePackages = packages.filter((row: any) => row.status !== "cancelled");
    const balances = allocateBalances(activePackages, units);
    const allocated = activePackages.reduce((sum: number, row: any) => sum + row.totalLessons, 0);
    const remaining = balances.reduce((sum: number, row: any) => sum + (row.remainingLessons || 0), 0);
    return {
      generatedAt: Date.now(),
      student,
      allocation: { allocated, used: allocated - remaining, remaining },
      bookings: bookings.sort((a: any, b: any) => a.startUtc - b.startUtc),
      packages: balances,
      orders: orders.sort((a: any, b: any) => b.createdAt - a.createdAt),
      lessons: lessons.sort((a: any, b: any) => b.date.localeCompare(a.date)),
      keywordCount: keywords.length,
      youglishCount: keywords.filter((row: any) => wordsWithClips.has(row.word)).length,
      alerts: alerts.filter((row: any) => row.status !== "resolved"),
    };
  },
});

export const setAlertStatus = mutation({
  args: {
    sessionToken: v.string(),
    alertId: v.id("operationsAlerts"),
    status: v.union(v.literal("open"), v.literal("acknowledged"), v.literal("resolved")),
  },
  handler: async (ctx, args) => {
    const { user } = await requireSuperadmin(ctx, args.sessionToken);
    const alert = await ctx.db.get(args.alertId);
    if (!alert) throw new Error("Alert not found");
    const now = Date.now();
    await ctx.db.patch(args.alertId, {
      status: args.status,
      acknowledgedAt: args.status === "acknowledged" ? now : alert.acknowledgedAt,
      acknowledgedBy: args.status === "acknowledged" ? user.email : alert.acknowledgedBy,
      resolvedAt: args.status === "resolved" ? now : undefined,
      updatedAt: now,
    });
    return { ok: true };
  },
});
