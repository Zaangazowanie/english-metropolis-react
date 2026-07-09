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

import { query, mutation, internalQuery, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { requireAdmin, requireAdminOrStudent, isSuperadmin } from "./authHelpers";

export const CANCELLATION_WINDOW_MS = 24 * 60 * 60 * 1000;

// ─── Meet link generation ────────────────────────────────────────────────────
// Provider seam (Mike's call 2026-06-04): Jitsi now (free, scales across any
// number of teachers with NO per-teacher credential), 8x8 JaaS later for a
// branded JWT-secured room on one org-wide key. To switch to JaaS, change this
// one function to mint an 8x8 URL (the booking row + emails read meetLink as-is).
// The room id is derived from the booking's own Convex id — globally unique and
// effectively unguessable.
function generateMeetLink(bookingId: string): string {
  return `https://meet.jit.si/EnglishMetropolis-${bookingId}`;
}

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

// ─── Per-teacher scope helper (added 2026-06-04) ─────────────────────────────
// Picks the rows that belong to a teacher scope from a set already loaded for
// the organization. Behaviour:
//   - teacherId given: rows whose teacherId === arg. If that set is EMPTY,
//     fall back to legacy org-wide rows (teacherId unset). Returns a flag so
//     callers can scope bookings the same way.
//   - teacherId absent: all rows unchanged (legacy org-wide behaviour).
// `getTeacherId` reads the teacherId off a row (works for both
// teacherAvailability and lessonBookings since both use the same field).
function scopeByTeacher<T>(
  rows: T[],
  teacherId: string | undefined,
  getTeacherId: (r: T) => string | undefined,
): { rows: T[]; fellBackToLegacy: boolean } {
  if (!teacherId) return { rows, fellBackToLegacy: false };
  const own = rows.filter(r => String(getTeacherId(r) ?? "") === String(teacherId));
  if (own.length > 0) return { rows: own, fellBackToLegacy: false };
  // No per-teacher rows yet → fall back to legacy org-wide rows (teacherId unset).
  const legacy = rows.filter(r => getTeacherId(r) === undefined);
  return { rows: legacy, fellBackToLegacy: true };
}

// ─── Availability ──────────────────────────────────────────────────────────

export const getWeeklyAvailability = query({
  // sessionToken accepted-and-ignored (admin frontend auto-injects it)
  args: {
    organizationId: v.id("organizations"),
    teacherId: v.optional(v.id("users")),
    sessionToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("teacherAvailability")
      .withIndex("by_organization", q => q.eq("organizationId", args.organizationId))
      .collect();
    const active = rows.filter(r => r.active && !r.dateWarsaw);
    // No teacherId → all active org rows (unchanged legacy behaviour).
    // teacherId given → that teacher's rows, falling back to legacy org rows
    // (teacherId unset) when the teacher has none of their own yet.
    const { rows: scoped } = scopeByTeacher(active, args.teacherId, r => r.teacherId);
    return scoped.sort((a, b) => a.dayOfWeek - b.dayOfWeek);
  },
});

// Replace the full weekly availability set for a target teacher.
//
// Permission model (Mike's requirement, 2026-06-04):
//   - teacher: sets their OWN availability (target = self; passed teacherId
//     ignored).
//   - superadmin: may set any teacher's (target = args.teacherId), or the
//     legacy org-wide set when teacherId is absent (target = null).
//   - org_admin (school): ONE-TIME set per teacher — args.teacherId is
//     REQUIRED and the teacher must not have handed off yet
//     (availabilityHandedOff !== true). After a successful set we flip that
//     teacher's availabilityHandedOff = true so future edits belong to them.
export const setWeeklyAvailability = mutation({
  args: {
    sessionToken: v.string(),
    organizationId: v.optional(v.id("organizations")),
    teacherId: v.optional(v.id("users")),
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

    // Resolve the target teacher + the org_admin one-time-handoff rule.
    // target === null means the legacy org-wide set (teacherId unset rows).
    let target: string | null;
    let isSchoolHandoff = false;
    if (user.role === "teacher") {
      target = String(user._id);
    } else if (isSuperadmin(user.role)) {
      target = args.teacherId ? String(args.teacherId) : null;
    } else {
      // org_admin (or legacy "admin"): one-time per-teacher set.
      if (!args.teacherId) throw new Error("teacherId is required");
      const teacher = await ctx.db.get(args.teacherId);
      if (!teacher || teacher.organizationId !== organizationId) {
        throw new Error("Teacher not found in this organization");
      }
      if (teacher.availabilityHandedOff === true) {
        throw new Error("This teacher now manages their own availability.");
      }
      target = String(args.teacherId);
      isSchoolHandoff = true;
    }

    const now = Date.now();

    // Replace only the rows in this target's scope. For a teacher target we
    // delete rows whose teacherId === target; for the legacy org-wide target
    // (null) we delete only rows with teacherId unset — never touching another
    // teacher's per-teacher rows.
    const existing = await ctx.db
      .query("teacherAvailability")
      .withIndex("by_organization", q => q.eq("organizationId", organizationId))
      .collect();
    for (const row of existing) {
      const matchesTarget = target === null
        ? row.teacherId === undefined
        : String(row.teacherId ?? "") === target;
      const matches = matchesTarget && !row.dateWarsaw;
      if (matches) await ctx.db.delete(row._id);
    }

    for (const w of args.windows) {
      await ctx.db.insert("teacherAvailability", {
        organizationId,
        ...(target === null ? {} : { teacherId: target as any }),
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

    // School's one-time set hands control to the teacher from now on.
    if (isSchoolHandoff && args.teacherId) {
      await ctx.db.patch(args.teacherId, { availabilityHandedOff: true, updatedAt: now });
    }

    return { count: args.windows.length, teacherId: target ?? null };
  },
});

export const getOneOffAvailability = query({
  args: {
    organizationId: v.id("organizations"),
    teacherId: v.optional(v.id("users")),
    fromDate: v.optional(v.string()),
    toDate: v.optional(v.string()),
    sessionToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("teacherAvailability")
      .withIndex("by_organization", q => q.eq("organizationId", args.organizationId))
      .collect();
    const active = rows.filter(r => {
      if (!r.active || !r.dateWarsaw) return false;
      if (args.fromDate && r.dateWarsaw < args.fromDate) return false;
      if (args.toDate && r.dateWarsaw > args.toDate) return false;
      return true;
    });
    const { rows: scoped } = scopeByTeacher(active, args.teacherId, r => r.teacherId);
    return scoped.sort((a, b) => {
      const byDate = String(a.dateWarsaw).localeCompare(String(b.dateWarsaw));
      return byDate || a.startTime.localeCompare(b.startTime);
    });
  },
});

export const setOneOffAvailability = mutation({
  args: {
    sessionToken: v.string(),
    organizationId: v.optional(v.id("organizations")),
    teacherId: v.optional(v.id("users")),
    windows: v.array(v.object({
      dateWarsaw: v.string(),
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

    let target: string | null;
    if (user.role === "teacher") {
      target = String(user._id);
    } else if (isSuperadmin(user.role)) {
      target = args.teacherId ? String(args.teacherId) : null;
    } else {
      if (!args.teacherId) throw new Error("teacherId is required");
      const teacher = await ctx.db.get(args.teacherId);
      if (!teacher || teacher.organizationId !== organizationId) {
        throw new Error("Teacher not found in this organization");
      }
      target = String(args.teacherId);
    }

    const dates = new Set(args.windows.map(w => w.dateWarsaw));
    const now = Date.now();
    if (dates.size > 0) {
      const existing = await ctx.db
        .query("teacherAvailability")
        .withIndex("by_organization", q => q.eq("organizationId", organizationId))
        .collect();
      for (const row of existing) {
        const matchesTarget = target === null
          ? row.teacherId === undefined
          : String(row.teacherId ?? "") === target;
        if (matchesTarget && row.dateWarsaw && dates.has(row.dateWarsaw)) {
          await ctx.db.delete(row._id);
        }
      }
    }

    for (const w of args.windows) {
      await ctx.db.insert("teacherAvailability", {
        organizationId,
        ...(target === null ? {} : { teacherId: target as any }),
        dateWarsaw: w.dateWarsaw,
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

    return { count: args.windows.length, teacherId: target ?? null, dates: Array.from(dates).sort() };
  },
});

// ─── Open slots ─────────────────────────────────────────────────────────────
// Computes bookable slots between fromDate/toDate (Warsaw ISO dates,
// inclusive): availability windows minus existing scheduled bookings,
// minus anything in the past.

export const getOpenSlots = query({
  args: {
    organizationId: v.id("organizations"),
    teacherId: v.optional(v.id("users")),
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
    const activeAll = availability.filter(a => a.active);
    // Scope availability to the teacher (with legacy fallback). The fallback
    // flag tells us how to scope bookings so the "taken" set lines up.
    const { rows: active, fellBackToLegacy } =
      scopeByTeacher(activeAll, args.teacherId, a => a.teacherId);
    if (!active.length) return [];

    const bookings = await ctx.db
      .query("lessonBookings")
      .withIndex("by_organization", q => q.eq("organizationId", args.organizationId))
      .collect();
    // Bookings count against the same scope as the availability we used:
    //   - teacherId given & teacher has own availability → teacherId === arg
    //   - teacherId given but we fell back to legacy availability → legacy
    //     (teacherId unset) bookings
    //   - no teacherId → all bookings (legacy org-wide behaviour, unchanged)
    const scopedBookings = !args.teacherId
      ? bookings
      : fellBackToLegacy
        ? bookings.filter(b => b.teacherId === undefined)
        : bookings.filter(b => String(b.teacherId ?? "") === String(args.teacherId));
    const taken = new Set(
      scopedBookings
        .filter(b => b.status === "scheduled" || b.status === "completed")
        .map(b => b.startUtc)
    );
    const offered = new Set<number>();

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
        if (window.dateWarsaw) {
          if (window.dateWarsaw !== dateStr) continue;
        } else if (window.dayOfWeek !== dow) {
          continue;
        }
        const startMin = timeToMinutes(window.startTime);
        const endMin = timeToMinutes(window.endTime);
        const stride = window.slotMinutes + window.gapMinutes;
        for (let m = startMin; m + window.slotMinutes <= endMin; m += stride) {
          const timeStr = minutesToTime(m);
          const startUtc = warsawToUtc(dateStr, timeStr);
          const endUtc = startUtc + window.slotMinutes * 60 * 1000;
          if (startUtc <= now) continue;            // past slots not bookable
          if (taken.has(startUtc)) continue;        // already booked
          if (offered.has(startUtc)) continue;      // overlapping weekly + one-off window
          offered.add(startUtc);
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
    teacherId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    let bookings;
    if (args.studentId) {
      // Student calendar path — kept public for backwards compat.
      // (teacherId filter does not apply here.)
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
      // Optional per-teacher filter for the teacher portal (admin path only).
      if (args.teacherId) {
        bookings = bookings.filter(b => String(b.teacherId ?? "") === String(args.teacherId));
      }
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
    teacherId: v.optional(v.id("users")),
    startUtc: v.number(),
    bookedBy: v.string(),                    // "student" | "school_admin" | "superadmin"
    bookedByName: v.optional(v.string()),
    notes: v.optional(v.string()),
    // Superadmin-only: book OUTSIDE teacher availability. The only thing that
    // can refuse a forced booking is a genuine time clash with another
    // scheduled lesson (checked across ALL orgs — one human teacher).
    force: v.optional(v.boolean()),
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
    if (args.force) {
      const { user } = await requireAdmin(ctx, args.sessionToken ?? "");
      if (!isSuperadmin(user.role)) {
        throw new Error("Only a superadmin can book outside teacher availability");
      }
    }
    const student = await ctx.db.get(args.studentId);
    if (!student) throw new Error("Student not found");
    if (student.organizationId !== args.organizationId) {
      throw new Error("Student does not belong to this organization");
    }

    const now = Date.now();
    if (args.startUtc <= now) throw new Error("Cannot book a lesson in the past");

    // Resolve effective teacher: explicit arg → student's primary teacher →
    // undefined (legacy org-wide). undefined means the booking is validated
    // against, and recorded against, the legacy org-wide availability/scope.
    const effectiveTeacherId: string | undefined =
      (args.teacherId ? String(args.teacherId) : undefined) ??
      (student.primaryTeacherId ? String(student.primaryTeacherId) : undefined);

    // Validate against availability: the requested start must be exactly one
    // of the generated slots for its Warsaw date — within THAT teacher's
    // scope (per-teacher rows, falling back to legacy org-wide rows when the
    // teacher has none of their own yet; same rule as getOpenSlots).
    const availability = await ctx.db
      .query("teacherAvailability")
      .withIndex("by_organization", q => q.eq("organizationId", args.organizationId))
      .collect();
    const { rows: scopedAvailability } =
      scopeByTeacher(availability.filter(a => a.active), effectiveTeacherId, a => a.teacherId);
    const w = warsawParts(args.startUtc);
    const matching = scopedAvailability.filter(a =>
      a.dateWarsaw ? a.dateWarsaw === w.date : a.dayOfWeek === w.dayOfWeek
    );
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
    if (!slotWindow && !args.force) {
      throw new Error("Requested time is outside teacher availability");
    }
    // Forced bookings outside any window use the global 60-minute lesson.
    const lessonMinutes = slotWindow ? slotWindow.slotMinutes : 60;
    const newEndUtc = args.startUtc + lessonMinutes * 60 * 1000;

    // Conflict check (same org, exact start — the legacy fast path)
    const existing = await ctx.db
      .query("lessonBookings")
      .withIndex("by_org_start", q => q.eq("organizationId", args.organizationId).eq("startUtc", args.startUtc))
      .collect();
    if (existing.some(b => b.status === "scheduled" || b.status === "completed")) {
      throw new Error("This slot is already booked");
    }
    // Overlap check across ALL orgs — one human teacher, so a 17:30 lesson in
    // one org must block 17:05-18:05 in another. The bookings table is small.
    const allBookings = await ctx.db.query("lessonBookings").collect();
    const clash = allBookings.find(b =>
      (b.status === "scheduled" || b.status === "completed") &&
      b.startUtc < newEndUtc && b.endUtc > args.startUtc);
    if (clash) {
      throw new Error(`Time clash: another lesson is booked ${clash.dateWarsaw} ${clash.timeWarsaw}`);
    }

    const bookingId = await ctx.db.insert("lessonBookings", {
      organizationId: args.organizationId,
      ...(effectiveTeacherId === undefined ? {} : { teacherId: effectiveTeacherId as any }),
      studentId: args.studentId,
      startUtc: args.startUtc,
      endUtc: newEndUtc,
      dateWarsaw: w.date,
      timeWarsaw: w.time,
      status: "scheduled",
      bookedBy: args.bookedBy,
      bookedByName: args.bookedByName,
      notes: args.notes,
      createdAt: now,
      updatedAt: now,
    });

    // Generate this lesson's video room and store it on the booking, then fire
    // the confirmation email asynchronously (an action — mutations can't do
    // network I/O). Fires for EVERY booking path (student, admin, superadmin).
    const meetLink = generateMeetLink(bookingId);
    await ctx.db.patch(bookingId, { meetLink, updatedAt: now });
    await ctx.scheduler.runAfter(0, internal.scheduling.sendBookingConfirmation, { bookingId });

    return { bookingId, dateWarsaw: w.date, timeWarsaw: w.time, teacherId: effectiveTeacherId ?? null, meetLink };
  },
});

// ─── Booking confirmation email (Meet link) ──────────────────────────────────
// Internal read used by the confirmation action (resolves display names).
export const getBookingInternal = internalQuery({
  args: { bookingId: v.id("lessonBookings") },
  handler: async (ctx, args) => {
    const b = await ctx.db.get(args.bookingId);
    if (!b) return null;
    const student = await ctx.db.get(b.studentId);
    let teacherName: string | null = null;
    let teacherEmail: string | null = null;
    if (b.teacherId) {
      const teacher = await ctx.db.get(b.teacherId);
      teacherName = teacher?.name ?? null;
      teacherEmail = teacher?.email ?? null;
    }
    const durationMin = Math.round((b.endUtc - b.startUtc) / 60000);
    return {
      bookingId: String(b._id),
      dateWarsaw: b.dateWarsaw,
      timeWarsaw: b.timeWarsaw,
      durationMin,
      meetLink: b.meetLink ?? null,
      studentName: student?.name ?? "Student",
      // Students log in with their record email but their REAL personal
      // address lives in googleEmail — confirmations go there when present.
      studentEmail: (student as any)?.googleEmail ?? student?.email ?? null,
      teacherName,
      teacherEmail,
    };
  },
});

// Posts the booking to the em-report service (VPS), which emails the Meet link.
// In TEST mode em-report sends only to the configured test recipient. Never
// throws — a delivery failure must not affect the booking that already happened.
export const sendBookingConfirmation = internalAction({
  args: { bookingId: v.id("lessonBookings") },
  handler: async (ctx, args) => {
    const url = process.env.BOOKING_NOTIFY_URL;
    const key = process.env.BOOKING_NOTIFY_KEY;
    if (!url || !key) {
      console.warn("[scheduling] BOOKING_NOTIFY_URL/KEY unset — skipping confirmation email");
      return;
    }
    const info = await ctx.runQuery(internal.scheduling.getBookingInternal, { bookingId: args.bookingId });
    if (!info) return;
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-booking-key": key },
        body: JSON.stringify(info),
      });
      if (!resp.ok) {
        console.error("[scheduling] booking-confirm POST failed", resp.status, (await resp.text()).slice(0, 200));
      }
    } catch (e: any) {
      console.error("[scheduling] booking-confirm fetch error", e?.message);
    }
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
