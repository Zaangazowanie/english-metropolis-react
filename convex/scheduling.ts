// Scheduling — Conversa calendar system (built 2026-06-02).
//
// Teacher availability (recurring weekly windows, Europe/Warsaw times) +
// lesson bookings with the 24-hour cancellation policy:
//   - cancel ≥ 24h before start  → status "cancelled"        (not billed)
//   - cancel  < 24h before start → status "cancelled_late"   (BILLED)
//
// Monthly billing figure = completed lessons (from the `lessons` table —
// the authoritative taught record written by the post-lesson pipeline)
// + billable late cancellations (from `lessonBookings`).

import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAdmin, requireAdminOrStudent, isSuperadmin } from "./authHelpers";

export const CANCELLATION_WINDOW_MS = 24 * 60 * 60 * 1000;

// ─── Europe/Warsaw time helpers ────────────────────────────────────────────
// Convex runs on V8 with full Intl support, so we derive Warsaw wall-clock
// parts from UTC timestamps (DST-correct) instead of hardcoding offsets.

function warsawParts(utcMs: number) {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Warsaw",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false, weekday: "short",
  });
  const parts: Record<string, string> = {};
  for (const p of fmt.formatToParts(new Date(utcMs))) parts[p.type] = p.value;
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour === "24" ? "00" : parts.hour}:${parts.minute}`,
    dayOfWeek: weekdayMap[parts.weekday] ?? 0,
  };
}

// Convert a Warsaw wall-clock date+time into a UTC timestamp.
// Iterative: guess with a fixed offset, then correct until the round-trip
// through warsawParts() lands on the requested wall-clock time.
function warsawToUtc(dateStr: string, timeStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = timeStr.split(":").map(Number);
  let guess = Date.UTC(y, m - 1, d, hh, mm) - 2 * 60 * 60 * 1000; // assume CEST first
  for (let i = 0; i < 4; i++) {
    const got = warsawParts(guess);
    if (got.date === dateStr && got.time === timeStr) return guess;
    // adjust by the wall-clock difference
    const [gh, gm] = got.time.split(":").map(Number);
    const wantMinutes = hh * 60 + mm;
    const gotMinutes = gh * 60 + gm;
    let diff = wantMinutes - gotMinutes;
    // handle date rollover
    if (got.date < dateStr) diff += 24 * 60;
    if (got.date > dateStr) diff -= 24 * 60;
    guess += diff * 60 * 1000;
  }
  return guess;
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60), m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// ─── Availability ──────────────────────────────────────────────────────────

export const getWeeklyAvailability = query({
  // sessionToken accepted-and-ignored (admin frontend auto-injects it)
  args: { organizationId: v.id("organizations"), sessionToken: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("teacherAvailability")
      .withIndex("by_organization", q => q.eq("organizationId", args.organizationId))
      .collect();
    return rows.filter(r => r.active).sort((a, b) => a.dayOfWeek - b.dayOfWeek);
  },
});

// Replace the full weekly availability set. Superadmin / org admin only.
export const setWeeklyAvailability = mutation({
  args: {
    sessionToken: v.string(),
    organizationId: v.optional(v.id("organizations")),
    windows: v.array(v.object({
      dayOfWeek: v.number(),
      startTime: v.string(),
      endTime: v.string(),
      slotMinutes: v.number(),
      gapMinutes: v.number(),
    })),
  },
  handler: async (ctx, args) => {
    const { user } = await requireAdmin(ctx, args.sessionToken);
    const organizationId = isSuperadmin(user.role)
      ? (args.organizationId ?? user.organizationId)
      : user.organizationId;
    if (!organizationId) throw new Error("No organization in scope");
    const existing = await ctx.db
      .query("teacherAvailability")
      .withIndex("by_organization", q => q.eq("organizationId", organizationId))
      .collect();
    const now = Date.now();
    for (const row of existing) await ctx.db.delete(row._id);
    for (const w of args.windows) {
      await ctx.db.insert("teacherAvailability", {
        organizationId,
        dayOfWeek: w.dayOfWeek,
        startTime: w.startTime,
        endTime: w.endTime,
        slotMinutes: w.slotMinutes,
        gapMinutes: w.gapMinutes,
        active: true,
        createdAt: now,
        updatedAt: now,
      });
    }
    return { count: args.windows.length };
  },
});

// ─── Open slots ─────────────────────────────────────────────────────────────
// Computes bookable slots between fromDate/toDate (Warsaw ISO dates,
// inclusive): availability windows minus existing scheduled bookings,
// minus anything in the past.

export const getOpenSlots = query({
  args: {
    organizationId: v.id("organizations"),
    fromDate: v.string(),   // "2026-06-02"
    toDate: v.string(),     // "2026-06-30"
    // accepted-and-ignored: admin frontend auto-injects its session token
    sessionToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const availability = await ctx.db
      .query("teacherAvailability")
      .withIndex("by_organization", q => q.eq("organizationId", args.organizationId))
      .collect();
    const active = availability.filter(a => a.active);
    if (!active.length) return [];

    const bookings = await ctx.db
      .query("lessonBookings")
      .withIndex("by_organization", q => q.eq("organizationId", args.organizationId))
      .collect();
    const taken = new Set(
      bookings
        .filter(b => b.status === "scheduled" || b.status === "completed")
        .map(b => b.startUtc)
    );

    const now = Date.now();
    const slots: Array<{ dateWarsaw: string; timeWarsaw: string; startUtc: number; endUtc: number; dayOfWeek: number }> = [];

    // iterate days from fromDate to toDate
    const start = new Date(`${args.fromDate}T00:00:00Z`);
    const end = new Date(`${args.toDate}T00:00:00Z`);
    for (let cursor = start.getTime(); cursor <= end.getTime(); cursor += 24 * 60 * 60 * 1000) {
      const dateStr = new Date(cursor).toISOString().slice(0, 10);
      // Determine the Warsaw weekday for this date (midday avoids DST edges)
      const noonUtc = warsawToUtc(dateStr, "12:00");
      const dow = warsawParts(noonUtc).dayOfWeek;

      for (const window of active) {
        if (window.dayOfWeek !== dow) continue;
        const startMin = timeToMinutes(window.startTime);
        const endMin = timeToMinutes(window.endTime);
        const stride = window.slotMinutes + window.gapMinutes;
        for (let m = startMin; m + window.slotMinutes <= endMin; m += stride) {
          const timeStr = minutesToTime(m);
          const startUtc = warsawToUtc(dateStr, timeStr);
          const endUtc = startUtc + window.slotMinutes * 60 * 1000;
          if (startUtc <= now) continue;            // past slots not bookable
          if (taken.has(startUtc)) continue;        // already booked
          slots.push({ dateWarsaw: dateStr, timeWarsaw: timeStr, startUtc, endUtc, dayOfWeek: dow });
        }
      }
    }
    return slots.sort((a, b) => a.startUtc - b.startUtc);
  },
});

// ─── Bookings ───────────────────────────────────────────────────────────────

export const listBookings = query({
  args: {
    sessionToken: v.optional(v.string()),
    organizationId: v.optional(v.id("organizations")),
    studentId: v.optional(v.id("students")),
  },
  handler: async (ctx, args) => {
    let bookings;
    if (args.studentId) {
      // Student calendar path — kept public for backwards compat.
      bookings = await ctx.db
        .query("lessonBookings")
        .withIndex("by_student", q => q.eq("studentId", args.studentId!))
        .collect();
    } else {
      // Org-wide listing requires an admin session.
      const { user } = await requireAdmin(ctx, args.sessionToken);
      const organizationId = isSuperadmin(user.role)
        ? (args.organizationId ?? user.organizationId)
        : user.organizationId;
      if (!organizationId) throw new Error("No organization in scope");
      bookings = await ctx.db
        .query("lessonBookings")
        .withIndex("by_organization", q => q.eq("organizationId", organizationId))
        .collect();
    }
    // attach student names for display
    const result = [];
    for (const b of bookings) {
      const student = await ctx.db.get(b.studentId);
      result.push({ ...b, studentName: student?.name ?? "Unknown", studentSlug: student?.slug ?? null });
    }
    return result.sort((a, b) => a.startUtc - b.startUtc);
  },
});

export const bookLesson = mutation({
  args: {
    sessionToken: v.optional(v.string()),
    organizationId: v.id("organizations"),
    studentId: v.id("students"),
    startUtc: v.number(),
    bookedBy: v.string(),                    // "student" | "school_admin" | "superadmin"
    bookedByName: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Authorization: if a token is supplied it must be a valid admin (any
    // student in their org) or the student themselves (their own bookings).
    // TODO Phase A2: require token — drop the no-token student-style path.
    if (args.sessionToken) {
      const auth = await requireAdminOrStudent(ctx, args.sessionToken);
      if (auth.kind === "student" && String(auth.student!._id) !== String(args.studentId)) {
        throw new Error("Unauthorized");
      }
    }
    const student = await ctx.db.get(args.studentId);
    if (!student) throw new Error("Student not found");
    if (student.organizationId !== args.organizationId) {
      throw new Error("Student does not belong to this organization");
    }

    const now = Date.now();
    if (args.startUtc <= now) throw new Error("Cannot book a lesson in the past");

    // Validate against availability: the requested start must be exactly one
    // of the generated slots for its Warsaw date.
    const availability = await ctx.db
      .query("teacherAvailability")
      .withIndex("by_organization", q => q.eq("organizationId", args.organizationId))
      .collect();
    const w = warsawParts(args.startUtc);
    const matching = availability.filter(a => a.active && a.dayOfWeek === w.dayOfWeek);
    let slotWindow = null;
    for (const window of matching) {
      const startMin = timeToMinutes(window.startTime);
      const endMin = timeToMinutes(window.endTime);
      const reqMin = timeToMinutes(w.time);
      const stride = window.slotMinutes + window.gapMinutes;
      if (reqMin >= startMin && reqMin + window.slotMinutes <= endMin && (reqMin - startMin) % stride === 0) {
        slotWindow = window;
        break;
      }
    }
    if (!slotWindow) throw new Error("Requested time is outside teacher availability");

    // Conflict check
    const existing = await ctx.db
      .query("lessonBookings")
      .withIndex("by_org_start", q => q.eq("organizationId", args.organizationId).eq("startUtc", args.startUtc))
      .collect();
    if (existing.some(b => b.status === "scheduled" || b.status === "completed")) {
      throw new Error("This slot is already booked");
    }

    const bookingId = await ctx.db.insert("lessonBookings", {
      organizationId: args.organizationId,
      studentId: args.studentId,
      startUtc: args.startUtc,
      endUtc: args.startUtc + slotWindow.slotMinutes * 60 * 1000,
      dateWarsaw: w.date,
      timeWarsaw: w.time,
      status: "scheduled",
      bookedBy: args.bookedBy,
      bookedByName: args.bookedByName,
      notes: args.notes,
      createdAt: now,
      updatedAt: now,
    });
    return { bookingId, dateWarsaw: w.date, timeWarsaw: w.time };
  },
});

export const cancelBooking = mutation({
  args: {
    sessionToken: v.optional(v.string()),
    bookingId: v.id("lessonBookings"),
    cancelledBy: v.string(),                 // "student" | "school_admin" | "superadmin"
    cancelledByName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const booking = await ctx.db.get(args.bookingId);
    if (!booking) throw new Error("Booking not found");
    // Authorization: admin (any booking in their org) or the owning student.
    // TODO Phase A2: require token — drop the no-token student-style path.
    if (args.sessionToken) {
      const auth = await requireAdminOrStudent(ctx, args.sessionToken);
      if (auth.kind === "student" && String(auth.student!._id) !== String(booking.studentId)) {
        throw new Error("Unauthorized");
      }
    }
    if (booking.status !== "scheduled") throw new Error("Only scheduled lessons can be cancelled");

    const now = Date.now();
    const isLate = booking.startUtc - now < CANCELLATION_WINDOW_MS;

    await ctx.db.patch(args.bookingId, {
      status: isLate ? "cancelled_late" : "cancelled",
      billable: isLate,
      cancelledBy: args.cancelledBy,
      cancelledByName: args.cancelledByName,
      cancelledAt: now,
      updatedAt: now,
    });
    return {
      status: isLate ? "cancelled_late" : "cancelled",
      billable: isLate,
      hoursBeforeStart: Math.max(0, Math.round((booking.startUtc - now) / 36e5 * 10) / 10),
    };
  },
});

// Hard-delete a booking (admin correction tool — e.g. booked the wrong
// student/slot by mistake). Distinct from cancellation: leaves no trace and
// never bills. Restricted to admin roles.
export const deleteBooking = mutation({
  args: {
    sessionToken: v.string(),
    bookingId: v.id("lessonBookings"),
  },
  handler: async (ctx, args) => {
    const { user } = await requireAdmin(ctx, args.sessionToken);
    const booking = await ctx.db.get(args.bookingId);
    if (!booking) throw new Error("Booking not found");
    if (!isSuperadmin(user.role) && booking.organizationId !== user.organizationId) {
      throw new Error("Unauthorized");
    }
    await ctx.db.delete(args.bookingId);
    return { deleted: true };
  },
});

// Mark past scheduled bookings as completed (called opportunistically from
// the UI; also safe to run repeatedly). A booking whose end time has passed
// and was never cancelled counts as a taught lesson.
export const reconcilePastBookings = mutation({
  args: { sessionToken: v.string(), organizationId: v.optional(v.id("organizations")) },
  handler: async (ctx, args) => {
    const { user } = await requireAdmin(ctx, args.sessionToken);
    const organizationId = isSuperadmin(user.role)
      ? (args.organizationId ?? user.organizationId)
      : user.organizationId;
    if (!organizationId) throw new Error("No organization in scope");
    const now = Date.now();
    const bookings = await ctx.db
      .query("lessonBookings")
      .withIndex("by_organization", q => q.eq("organizationId", organizationId))
      .collect();
    let updated = 0;
    for (const b of bookings) {
      if (b.status === "scheduled" && b.endUtc < now) {
        await ctx.db.patch(b._id, { status: "completed", billable: true, updatedAt: now });
        updated++;
      }
    }
    return { updated };
  },
});

// ─── Monthly stats (billing figure) ─────────────────────────────────────────
// Completed lessons come from the `lessons` table (taught record, written by
// the post-lesson pipeline). Billable late cancellations come from bookings.

export const getMonthlyLessonStats = query({
  args: { sessionToken: v.string(), organizationId: v.optional(v.id("organizations")) },
  handler: async (ctx, args) => {
    const { user } = await requireAdmin(ctx, args.sessionToken);
    const organizationId = isSuperadmin(user.role)
      ? (args.organizationId ?? user.organizationId)
      : user.organizationId;
    if (!organizationId) throw new Error("No organization in scope");
    const students = await ctx.db
      .query("students")
      .withIndex("by_organization", q => q.eq("organizationId", organizationId))
      .collect();

    type MonthRow = {
      month: string;                 // "2026-06"
      completedLessons: number;
      lateCancellations: number;
      cancellations: number;
      scheduled: number;
      billableTotal: number;
      perStudent: Record<string, { name: string; completed: number; lateCancellations: number }>;
    };
    const months: Record<string, MonthRow> = {};
    const ensureMonth = (key: string): MonthRow => {
      if (!months[key]) {
        months[key] = {
          month: key, completedLessons: 0, lateCancellations: 0, cancellations: 0,
          scheduled: 0, billableTotal: 0, perStudent: {},
        };
      }
      return months[key];
    };
    const ensureStudent = (row: MonthRow, id: string, name: string) => {
      if (!row.perStudent[id]) row.perStudent[id] = { name, completed: 0, lateCancellations: 0 };
      return row.perStudent[id];
    };

    // 1. taught lessons (lessons table)
    for (const student of students) {
      const lessons = await ctx.db
        .query("lessons")
        .withIndex("by_student", q => q.eq("studentId", student._id))
        .collect();
      for (const lesson of lessons) {
        if (lesson.status === "cancelled") continue;
        if (!lesson.date || lesson.date.length < 7) continue;
        // future "planned" rows don't count as completed
        if (lesson.status === "planned") continue;
        const monthKey = lesson.date.slice(0, 7);
        const row = ensureMonth(monthKey);
        row.completedLessons++;
        row.billableTotal++;
        ensureStudent(row, String(student._id), student.name).completed++;
      }
    }

    // 2. bookings (late cancellations bill; completed bookings only bill if
    //    the pipeline never produced a lessons row — avoid double counting by
    //    NOT counting completed bookings here; the lessons table is canonical)
    const bookings = await ctx.db
      .query("lessonBookings")
      .withIndex("by_organization", q => q.eq("organizationId", organizationId))
      .collect();
    const studentById: Record<string, string> = {};
    for (const s of students) studentById[String(s._id)] = s.name;

    for (const b of bookings) {
      const monthKey = b.dateWarsaw.slice(0, 7);
      const row = ensureMonth(monthKey);
      const name = studentById[String(b.studentId)] ?? "Unknown";
      if (b.status === "cancelled_late") {
        row.lateCancellations++;
        row.billableTotal++;
        ensureStudent(row, String(b.studentId), name).lateCancellations++;
      } else if (b.status === "cancelled") {
        row.cancellations++;
      } else if (b.status === "scheduled") {
        row.scheduled++;
      }
    }

    const sorted = Object.values(months).sort((a, b) => b.month.localeCompare(a.month));
    const nowWarsaw = warsawParts(Date.now());
    const currentMonthKey = nowWarsaw.date.slice(0, 7);
    return {
      currentMonth: months[currentMonthKey] ?? {
        month: currentMonthKey, completedLessons: 0, lateCancellations: 0, cancellations: 0,
        scheduled: 0, billableTotal: 0, perStudent: {},
      },
      months: sorted,
    };
  },
});
