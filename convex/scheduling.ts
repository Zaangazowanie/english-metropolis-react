// Scheduling — Conversa calendar system (built 2026-06-02).
//
// Teacher availability (recurring weekly windows, Europe/Warsaw times) +
// lesson bookings with the 12-hour cancellation policy:
//   - cancel ≥ 24h before start  → status "cancelled"        (not billed)
//   - cancel  < 24h before start → status "cancelled_late"   (BILLED)
//
// Monthly billing figure = completed lessons (from the `lessons` table —
// the authoritative taught record written by the post-lesson pipeline)
// + billable late cancellations and student no-shows (from `lessonBookings`).

import { query, mutation, internalQuery, internalAction, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { ConvexError, v } from "convex/values";
import { requireAdmin, requireAdminOrStudent, isSuperadmin } from "./authHelpers";

// Phase A2, closed 2026-08-27. bookLesson, cancelBooking and the studentId path
// of listBookings all wrapped their ENTIRE authorization in `if
// (args.sessionToken)`, so omitting the token skipped the check rather than
// failing it. Combined with two public reads that hand out a studentId from a
// guessable "firstname-lastname" slug, that was a complete unauthenticated
// chain from a name to spending someone's prepaid lessons — or late-cancelling
// one, which sets billable:true and destroys it outright.
//
// A token is now mandatory on all three. The caller must be the student
// themselves or an admin; there is no anonymous branch left.
async function requireStudentSelfOrAdmin(ctx: any, sessionToken: any, studentId: any) {
  const auth = await requireAdminOrStudent(ctx, sessionToken);
  if (auth.kind === "student" && String(auth.student!._id) !== String(studentId)) {
    throw new Error("Unauthorized");
  }
  return auth;
}
import { billableUnitsForStudent, allocateBalances } from "./billing";

export const CANCELLATION_WINDOW_MS = 24 * 60 * 60 * 1000;
// A student books at least this far ahead (Mike, 2026-08-10). Anything closer is
// the teacher's to give, not the student's to take: it lands in a day that is
// already planned. Enforced in bookLesson AND hidden from getOpenSlots, because
// offering a slot that will be refused on click is worse than not offering it.
export const STUDENT_MIN_LEAD_MS = 24 * 60 * 60 * 1000;
export const NO_SHOW_WAIT_MS = 20 * 60 * 1000;

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
// ONE slot engine for every reader and writer (2026-09-01). getOpenSlots (the
// student grid), previewWeeklySeries (the "repeat weekly" plan) and
// bookLessons (the write) derive slots from the same windows and classify them
// with the same rule. Before this, bookLesson re-implemented the window match
// on its own and skipped the filled-group rule, so the list a student saw and
// the write that followed could disagree.

type SlotCandidate = { dateWarsaw: string; timeWarsaw: string; startUtc: number; endUtc: number; dayOfWeek: number };
type SlotState = "open" | "past" | "too_soon" | "taken" | "closed";
// previewWeeklySeries adds "yours": the requesting student already holds that time.
type PreviewState = SlotState | "yours";
type SlotEngine = { active: any[]; blockingBookings: any[]; groupBlocked: Set<string> };

async function loadSlotEngine(ctx: any, organizationId: any, teacherId: any): Promise<SlotEngine> {
  const availability = await ctx.db
    .query("teacherAvailability")
    .withIndex("by_organization", (q: any) => q.eq("organizationId", organizationId))
    .collect();
  // Scope availability to the teacher, retaining legacy organization-wide
  // availability as a fallback for teachers who do not have their own rows.
  const { rows: active } = scopeByTeacher(
    availability.filter((a: any) => a.active), teacherId, (a: any) => a.teacherId);

  // Global overlap rule: one human teacher, so a lesson in ANY org blocks the
  // time in every org. Legacy availability can still produce teacher-stamped
  // bookings, so filtering by the availability fallback would advertise times
  // that are already occupied. The bookings table is small.
  const blockingBookings = (await ctx.db.query("lessonBookings").collect())
    .filter((b: any) => b.status === "scheduled" || b.status === "completed");

  // Weekly times owned by groups that have actually filled. A group short of
  // its minimum is still recruiting and must NOT hold slots hostage — the
  // teacher should keep selling those hours as 1:1 until the group is viable.
  const groupBlocked = new Set<string>();
  const orgGroups = await ctx.db
    .query("groups")
    .withIndex("by_organization", (q: any) => q.eq("organizationId", organizationId))
    .collect();
  for (const group of orgGroups) {
    if (!group.sessions?.length) continue;
    if (group.status && group.status !== "active") continue;
    const members = await ctx.db
      .query("groupMemberships")
      .withIndex("by_group", (q: any) => q.eq("groupId", group._id))
      .collect();
    const activeMembers = members.filter((m: any) => !m.leftAt).length;
    if (activeMembers < (group.minStudents ?? 3)) continue;
    for (const session of group.sessions) {
      groupBlocked.add(`${session.dayOfWeek}|${session.startTime}`);
    }
  }
  return { active, blockingBookings, groupBlocked };
}

// Warsaw weekday of a Warsaw date (noon avoids DST edges).
function warsawDayOfWeek(dateStr: string): number {
  return warsawParts(warsawToUtc(dateStr, "12:00")).dayOfWeek;
}

function addDays(dateStr: string, days: number): string {
  return new Date(new Date(`${dateStr}T00:00:00Z`).getTime() + days * 24 * 60 * 60 * 1000)
    .toISOString().slice(0, 10);
}

// Every grid time the windows generate on one Warsaw date, UNFILTERED.
// Weekly windows match by weekday, one-off windows by exact date; a time that
// both produce is offered once.
function slotsOnDate(active: any[], dateStr: string): SlotCandidate[] {
  const dow = warsawDayOfWeek(dateStr);
  const seen = new Set<number>();
  const out: SlotCandidate[] = [];
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
      if (seen.has(startUtc)) continue;
      seen.add(startUtc);
      out.push({
        dateWarsaw: dateStr, timeWarsaw: timeStr, startUtc,
        endUtc: startUtc + window.slotMinutes * 60 * 1000, dayOfWeek: dow,
      });
    }
  }
  return out.sort((a, b) => a.startUtc - b.startUtc);
}

// Why a grid slot cannot be booked right now, or "open". Order matters and is
// the order getOpenSlots always applied: past, lead time, occupied, group.
function blockingBookingFor(slot: SlotCandidate, engine: SlotEngine) {
  return engine.blockingBookings.find((b: any) => b.startUtc < slot.endUtc && b.endUtc > slot.startUtc) ?? null;
}

function classifySlot(slot: SlotCandidate, engine: SlotEngine, now: number, forStudent: boolean): SlotState {
  if (slot.startUtc <= now) return "past";
  if (forStudent && slot.startUtc - now < STUDENT_MIN_LEAD_MS) return "too_soon";
  if (blockingBookingFor(slot, engine)) return "taken";
  // A filled group owns its weekly times. One teacher cannot be in a group and
  // a 1:1 at once, so those slots leave the grid entirely.
  if (engine.groupBlocked.has(`${slot.dayOfWeek}|${slot.timeWarsaw}`)) return "closed";
  return "open";
}

// Computes bookable slots between fromDate/toDate (Warsaw ISO dates,
// inclusive): availability windows minus existing scheduled bookings,
// minus anything in the past.
export const getOpenSlots = query({
  args: {
    organizationId: v.id("organizations"),
    teacherId: v.optional(v.id("users")),
    fromDate: v.string(),   // "2026-06-02"
    toDate: v.string(),     // "2026-06-30"
    // The student app passes true so the list it shows is exactly the list it can
    // book. The console leaves it off: a teacher may still place a lesson tomorrow
    // morning, that restriction is only on self-service.
    forStudent: v.optional(v.boolean()),
    // accepted-and-ignored: admin frontend auto-injects its session token
    sessionToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const engine = await loadSlotEngine(ctx, args.organizationId, args.teacherId);
    if (!engine.active.length) return [];
    const now = Date.now();
    const slots: SlotCandidate[] = [];
    const start = new Date(`${args.fromDate}T00:00:00Z`).getTime();
    const end = new Date(`${args.toDate}T00:00:00Z`).getTime();
    for (let cursor = start; cursor <= end; cursor += 24 * 60 * 60 * 1000) {
      const dateStr = new Date(cursor).toISOString().slice(0, 10);
      for (const slot of slotsOnDate(engine.active, dateStr)) {
        if (classifySlot(slot, engine, now, !!args.forStudent) === "open") slots.push(slot);
      }
    }
    return slots.sort((a, b) => a.startUtc - b.startUtc);
  },
});

// The "repeat weekly" plan: the same weekday and Warsaw wall-clock time for
// `count` consecutive weeks starting on fromDate, each week classified so the
// student sees BEFORE confirming which weeks are open, taken (another lesson),
// closed (no window that day, or a filled group) or too soon (inside the
// 24-hour lead). Public like getOpenSlots: it reveals only what the open-slot
// grid already reveals. Wall-clock times survive the October DST change
// because every week is converted through warsawToUtc on its own date.
export const previewWeeklySeries = query({
  args: {
    organizationId: v.id("organizations"),
    teacherId: v.optional(v.id("users")),
    dayOfWeek: v.number(),      // 0=Sunday .. 6=Saturday, Warsaw
    timeWarsaw: v.string(),     // "15:00"
    fromDate: v.string(),       // first occurrence, a Warsaw date on that weekday
    count: v.number(),          // weeks, 1..52
    forStudent: v.optional(v.boolean()),
    // When given, a week the student already holds at that time reads "yours"
    // rather than "taken", so extending an existing pattern is not mistaken
    // for losing the slot to someone else.
    studentId: v.optional(v.id("students")),
    sessionToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const count = Math.max(1, Math.min(52, Math.floor(args.count)));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(args.fromDate) || !/^\d{2}:\d{2}$/.test(args.timeWarsaw)) {
      throw new ConvexError({ code: "BAD_ARGS", message: "fromDate must be YYYY-MM-DD and timeWarsaw HH:MM" });
    }
    if (warsawDayOfWeek(args.fromDate) !== args.dayOfWeek) {
      throw new ConvexError({ code: "BAD_START_DATE", message: `${args.fromDate} is not weekday ${args.dayOfWeek} in Warsaw` });
    }
    const engine = await loadSlotEngine(ctx, args.organizationId, args.teacherId);
    const now = Date.now();
    const weeks: Array<SlotCandidate & { status: PreviewState }> = [];
    for (let i = 0; i < count; i++) {
      const dateStr = addDays(args.fromDate, 7 * i);
      const slot = slotsOnDate(engine.active, dateStr).find(s => s.timeWarsaw === args.timeWarsaw);
      if (!slot) {
        const startUtc = warsawToUtc(dateStr, args.timeWarsaw);
        weeks.push({
          dateWarsaw: dateStr, timeWarsaw: args.timeWarsaw, startUtc,
          endUtc: startUtc + 60 * 60 * 1000, dayOfWeek: args.dayOfWeek, status: "closed",
        });
        continue;
      }
      let status: PreviewState = classifySlot(slot, engine, now, !!args.forStudent);
      if (status === "taken" && args.studentId) {
        const b = blockingBookingFor(slot, engine);
        if (b && String(b.studentId) === String(args.studentId)) status = "yours";
      }
      weeks.push({ ...slot, status });
    }
    return { weeks };
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
      // Student calendar path. This was "kept public for backwards compat" and
      // that was a live hole: a guessable firstname-lastname slug resolved to a
      // studentId, and this query then handed back that student's lessons —
      // including the private Google Meet URL and the bookingId that
      // cancelBooking consumes. Now it requires the student's own session, or
      // an admin session, exactly like the org-wide branch below.
      await requireStudentSelfOrAdmin(ctx, args.sessionToken, args.studentId);
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
      // A teacher's own schedule is ONE calendar across every client school:
      // Mike's teacher user lives in the Conversa org while most of his
      // students book in English Metropolis PVT, so an org-scoped read hid
      // those lessons from /teacher entirely (found 2026-09-01). The teacher
      // themself, or a superadmin, gets every org's rows for that teacherId.
      const ownSchedule = !!args.teacherId &&
        (String(user._id) === String(args.teacherId) || isSuperadmin(user.role));
      if (ownSchedule) {
        bookings = (await ctx.db.query("lessonBookings").collect())
          .filter(b => String(b.teacherId ?? "") === String(args.teacherId));
      } else {
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
    }
    // attach student names for display
    const result = [];
    for (const b of bookings) {
      const student = await ctx.db.get(b.studentId);
      const taughtRows = await ctx.db
        .query("lessons")
        .withIndex("by_student_date", q =>
          q.eq("studentId", b.studentId).eq("date", b.dateWarsaw)
        )
        .collect();
      const hasTaughtRecord = taughtRows.some(
        lesson => lesson.status !== "cancelled" && lesson.status !== "planned"
      );
      result.push({
        ...b,
        studentName: student?.name ?? "Unknown",
        studentSlug: student?.slug ?? null,
        hasTaughtRecord,
      });
    }
    return result.sort((a, b) => a.startUtc - b.startUtc);
  },
});

// Admin correction path for operational booking notes. This is intentionally
// separate from the student booking/cancellation flow: changing a note must not
// alter the slot, its billing status, or trigger another confirmation email.
export const updateBookingNotes = mutation({
  args: {
    sessionToken: v.string(),
    bookingId: v.id("lessonBookings"),
    notes: v.string(),
  },
  handler: async (ctx, args) => {
    const { user } = await requireAdmin(ctx, args.sessionToken);
    const booking = await ctx.db.get(args.bookingId);
    if (!booking) throw new Error("Booking not found");
    if (!isSuperadmin(user.role) && booking.organizationId !== user.organizationId) {
      throw new Error("Unauthorized");
    }
    const now = Date.now();
    const notes = args.notes.trim();
    await ctx.db.patch(args.bookingId, { notes, updatedAt: now });
    await ctx.db.insert("auditLog", {
      organizationId: booking.organizationId,
      userId: user._id,
      action: "booking.notes_updated",
      targetType: "lessonBooking",
      targetId: String(args.bookingId),
      details: JSON.stringify({ notes }),
      timestamp: now,
    });
    return { ok: true };
  },
});


// Where e-mail confirmation is enforced. "book" gates self-service booking only;
// "off" disables the gate entirely. Payment is never gated — see bookLessons.
// Typed as string, not a literal union: TS narrows a const literal and then
// reports the comparison below as unreachable whichever value is set here.
const REQUIRE_VERIFIED_TO: string = "book";   // "book" | "off"

// Never book more than this in one call: the largest package is 24 lessons and
// a weekly plan longer than a year is not a booking, it is a timetable.
const MAX_SLOTS_PER_CALL = 52;

// Refusals a student can act on are ConvexErrors: prod redacts a plain Error to
// "Server Error" over the HTTP API, so until 2026-09-01 NONE of the codes below
// (TOO_LATE_TO_BOOK, EMAIL_NOT_VERIFIED, "No lessons remaining") ever reached
// the browser — every refusal rendered as "Something went wrong". The `message`
// keeps the historical text because Bajla's classifiers match substrings of it.
function refuse(code: string, message: string, extra: Record<string, any> = {}): never {
  throw new ConvexError({ code, message, ...extra });
}

type SlotProblem = { startUtc: number; dateWarsaw: string; timeWarsaw: string; reason: string };

// The one write path. bookLesson (single) and bookLessons (batch / weekly
// series) both land here, so the guards cannot drift apart. Runs inside ONE
// Convex transaction: either every requested slot is booked or none is —
// a half-booked series is a support ticket, never a result.
async function bookLessonsCore(ctx: any, args: {
  sessionToken?: string; organizationId: any; studentId: any; teacherId?: any;
  startUtcs: number[]; bookedBy: string; bookedByName?: string; notes?: string;
  force?: boolean; seriesKind?: string; mode?: string;
}) {
  // Authorization: a valid admin (any student in their org) or the student
  // themselves (their own bookings). The token is REQUIRED; there is no
  // anonymous path. Booking spends a prepaid lesson, so this must fail closed.
  const auth = await requireStudentSelfOrAdmin(ctx, args.sessionToken, args.studentId);
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
  const bookingOrg: any = await ctx.db.get(args.organizationId);

  const startUtcs = Array.from(new Set(args.startUtcs.map(n => Math.floor(n)))).sort((a, b) => a - b);
  if (!startUtcs.length) refuse("NO_SLOTS", "Pick at least one time");
  if (startUtcs.length > MAX_SLOTS_PER_CALL) {
    refuse("TOO_MANY_SLOTS", `At most ${MAX_SLOTS_PER_CALL} lessons per booking`, { max: MAX_SLOTS_PER_CALL });
  }
  const now = Date.now();
  const single = startUtcs.length === 1 && !args.seriesKind;
  // "strict" (default): every requested time must be bookable or nothing is.
  // "skipRefused": book the times that pass and report the rest — the weekly
  // plan's mode, because a plan previewed minutes ago can lose one week to
  // another student, and losing one week must not lose the other eleven.
  const skipRefused = args.mode === "skipRefused" && !single;

  // The student gates apply to anyone acting AS a student: the caller's own
  // student session, or an admin/Bajla booking on the student's behalf with
  // bookedBy "student". Until 2026-09-01 only the caller-supplied string was
  // consulted, so a student session sending bookedBy:"superadmin" skipped the
  // verification, lead-time and credit gates.
  const studentActor = auth.kind === "student" || args.bookedBy === "student";

  if (studentActor) {
    // E-mail confirmation gate (2026-08-10, Mike): a student books only from
    // an address they have proved they control. Deliberately placed HERE and
    // not at checkout — taking the money must never depend on someone
    // leaving the payment page to find an e-mail. Move REQUIRE_VERIFIED_TO
    // if that decision changes; nothing else reads the flag.
    if (REQUIRE_VERIFIED_TO === "book" && !student.emailVerifiedAt) {
      refuse("EMAIL_NOT_VERIFIED", "EMAIL_NOT_VERIFIED");
    }
  }

  // Resolve effective teacher: explicit arg → student's primary teacher →
  // undefined (legacy org-wide). undefined means the booking is validated
  // against, and recorded against, the legacy org-wide availability/scope.
  const effectiveTeacherId: string | undefined =
    (args.teacherId ? String(args.teacherId) : undefined) ??
    (student.primaryTeacherId ? String(student.primaryTeacherId) : undefined);

  const engine = await loadSlotEngine(ctx, args.organizationId, effectiveTeacherId);

  // Classify every requested time against the grid, existing bookings and the
  // other times in this same request. Collect every problem, then refuse once
  // with all of them: the student fixes the whole plan in one go.
  const problems: SlotProblem[] = [];
  const accepted: Array<SlotCandidate & { minutes: number }> = [];
  for (const startUtc of startUtcs) {
    const w = warsawParts(startUtc);
    const gridSlot = slotsOnDate(engine.active, w.date).find(s => s.startUtc === startUtc);
    const minutes = gridSlot ? Math.round((gridSlot.endUtc - gridSlot.startUtc) / 60000) : 60;
    const slot: SlotCandidate = gridSlot ?? {
      dateWarsaw: w.date, timeWarsaw: w.time, startUtc,
      endUtc: startUtc + minutes * 60 * 1000, dayOfWeek: w.dayOfWeek,
    };
    let reason: string | null = null;
    if (startUtc <= now) reason = "past";
    else if (studentActor && startUtc - now < STUDENT_MIN_LEAD_MS) reason = "too_soon";
    else if (!gridSlot && !args.force) reason = "closed";
    else {
      const state = classifySlot(slot, engine, now, false);
      if (state === "taken") reason = "taken";
      else if (state === "closed" && !args.force) reason = "closed";
      else if (accepted.some(a => a.startUtc < slot.endUtc && a.endUtc > slot.startUtc)) reason = "overlap";
    }
    if (reason) problems.push({ startUtc, dateWarsaw: slot.dateWarsaw, timeWarsaw: slot.timeWarsaw, reason });
    else accepted.push({ ...slot, minutes });
  }
  if (problems.length && !skipRefused) {
    const p = problems[0];
    if (single) {
      // Historical single-slot messages, now readable by the browser.
      if (p.reason === "past") refuse("PAST", "Cannot book a lesson in the past", { slots: problems });
      if (p.reason === "too_soon") refuse("TOO_LATE_TO_BOOK", "TOO_LATE_TO_BOOK", { slots: problems });
      if (p.reason === "closed") refuse("OUTSIDE_AVAILABILITY", "Requested time is outside teacher availability", { slots: problems });
      refuse("SLOT_TAKEN", `Time clash: another lesson is booked ${p.dateWarsaw} ${p.timeWarsaw}`, { slots: problems });
    }
    refuse("SLOT_UNAVAILABLE",
      `${problems.length} of ${startUtcs.length} requested times cannot be booked (${problems.map(x => `${x.dateWarsaw} ${x.timeWarsaw}: ${x.reason}`).join(", ")})`,
      { slots: problems });
  }
  if (!accepted.length) {
    refuse("SLOT_UNAVAILABLE", "None of the requested times can be booked", { slots: problems });
  }

  // Credit gate. Students since 2026-07-10; EVERY actor since 2026-09-03 (Mike:
  // "nothing should bypass the scheduling", after Szymon's 2000 PLN sat unbooked
  // because a payment was handled outside the app). A scheduled booking consumes
  // a lesson immediately (billing.ts), so N slots need N unexpired lessons
  // whoever clicks. Schools (organizations.type "school": Conversa, English Line)
  // are invoiced per lesson and hold no packages, so they are exempt. There is
  // no override flag on purpose: to honour an extension, extend the package
  // (billing:updatePackageMetadata) and then book.
  // Counted AFTER slot classification so a skipped week is not charged for.
  const packageBilled = bookingOrg?.type !== "school";
  if (packageBilled) {
    const packages = (await ctx.db
      .query("lessonPackages")
      .withIndex("by_student", (q: any) => q.eq("studentId", args.studentId))
      .collect()).filter((p: any) =>
        p.status !== "cancelled" && (!p.availableFrom || p.availableFrom <= now)
      );
    const units = await billableUnitsForStudent(ctx, args.studentId);
    // Expired packages (Regulamin § 5 ust. 2) still absorb the lessons they
    // already paid for, but their unused remainder is not bookable. The refusal
    // names the expiry so the student can ask for the extension § 5 ust. 3 allows.
    const balances = allocateBalances(packages, units);
    const isExpired = (p: any) => typeof p.expiresAt === "number" && p.expiresAt <= now;
    const remaining = balances
      .filter((p: any) => !isExpired(p))
      .reduce((n: number, p: any) => n + (p.remainingLessons ?? 0), 0);
    if (remaining < accepted.length) {
      const expired = balances.filter((p: any) => isExpired(p) && (p.remainingLessons ?? 0) > 0);
      if (remaining <= 0 && expired.length) {
        const expiredAt = expired.reduce((m: number, p: any) => Math.max(m, p.expiresAt), 0);
        const trapped = expired.reduce((n: number, p: any) => n + (p.remainingLessons ?? 0), 0);
        refuse("PACKAGE_EXPIRED",
          studentActor
            ? `Your lesson package expired on ${new Date(expiredAt).toISOString().slice(0, 10)} with ${trapped} lesson${trapped === 1 ? "" : "s"} unused, ask us to extend it`
            : `This student's package expired on ${new Date(expiredAt).toISOString().slice(0, 10)} with ${trapped} lesson${trapped === 1 ? "" : "s"} unused. Extend it in Billing, then book`,
          { expiredAt, trapped, remaining, requested: accepted.length });
      }
      refuse("NO_LESSONS_REMAINING",
        remaining <= 0
          ? (studentActor
              ? "No lessons remaining — purchase a lesson package first"
              : "No lessons remaining on this student's packages. Allocate or extend a package in Billing, then book")
          : `Only ${remaining} lesson${remaining === 1 ? "" : "s"} remaining, ${accepted.length} requested`,
        { remaining, requested: accepted.length });
    }
  }

  const seriesKind = single ? undefined : (args.seriesKind || "batch");
  const bookings: Array<{ bookingId: any; dateWarsaw: string; timeWarsaw: string; startUtc: number; endUtc: number; meetLink: string }> = [];
  let seriesId: string | undefined;
  for (const slot of accepted) {
    const bookingId = await ctx.db.insert("lessonBookings", {
      organizationId: args.organizationId,
      ...(effectiveTeacherId === undefined ? {} : { teacherId: effectiveTeacherId as any }),
      studentId: args.studentId,
      startUtc: slot.startUtc,
      endUtc: slot.endUtc,
      dateWarsaw: slot.dateWarsaw,
      timeWarsaw: slot.timeWarsaw,
      status: "scheduled",
      bookedBy: args.bookedBy,
      bookedByName: args.bookedByName,
      notes: args.notes,
      notificationStatus: "pending",
      notificationAttempts: 0,
      notificationUpdatedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    // Every booking in one request shares the first booking's id as seriesId:
    // that is what "cancel the rest of the series" and the console badge key on.
    if (seriesKind && !seriesId) seriesId = String(bookingId);
    // Generate this lesson's video room and store it on the booking. em-report
    // upgrades it to a Google Meet when it sends the confirmation.
    const meetLink = generateMeetLink(String(bookingId));
    await ctx.db.patch(bookingId, {
      meetLink, updatedAt: now,
      ...(seriesKind ? { seriesId, seriesKind } : {}),
    });
    bookings.push({ bookingId, dateWarsaw: slot.dateWarsaw, timeWarsaw: slot.timeWarsaw, startUtc: slot.startUtc, endUtc: slot.endUtc, meetLink });
  }

  // Confirmation email asynchronously (an action — mutations can't do network
  // I/O). A single lesson keeps the per-booking path every existing caller
  // (Bajla's Meet handoff included) relies on; a series sends ONE email per
  // party listing every date, never one email per lesson.
  if (single) {
    await ctx.scheduler.runAfter(0, internal.scheduling.sendBookingConfirmation, { bookingId: bookings[0].bookingId, attempt: 1 });
  } else {
    await ctx.scheduler.runAfter(0, internal.scheduling.sendSeriesConfirmation, {
      bookingIds: bookings.map(b => b.bookingId), attempt: 1,
      skipped: problems.map(p => ({ dateWarsaw: p.dateWarsaw, timeWarsaw: p.timeWarsaw, reason: p.reason })),
    });
  }

  return {
    seriesId: seriesId ?? null, seriesKind: seriesKind ?? null, teacherId: effectiveTeacherId ?? null,
    bookings,
    // Only ever non-empty in "skipRefused" mode; the email names these too.
    skipped: problems,
  };
}

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
    const res = await bookLessonsCore(ctx, { ...args, startUtcs: [args.startUtc] });
    const b = res.bookings[0];
    return { bookingId: b.bookingId, dateWarsaw: b.dateWarsaw, timeWarsaw: b.timeWarsaw, teacherId: res.teacherId, meetLink: b.meetLink };
  },
});

// Several lessons in one confirmed action: a hand-picked set ("batch") or the
// open weeks of a "repeat weekly" plan. All or nothing.
export const bookLessons = mutation({
  args: {
    sessionToken: v.optional(v.string()),
    organizationId: v.id("organizations"),
    studentId: v.id("students"),
    teacherId: v.optional(v.id("users")),
    startUtcs: v.array(v.number()),
    bookedBy: v.string(),
    bookedByName: v.optional(v.string()),
    notes: v.optional(v.string()),
    force: v.optional(v.boolean()),
    seriesKind: v.optional(v.string()),      // "batch" | "weekly"
    mode: v.optional(v.string()),            // "strict" (default) | "skipRefused"
  },
  handler: async (ctx, args) => bookLessonsCore(ctx, args),
});

// ─── Booking confirmation email (Meet link) ──────────────────────────────────
// Internal read used by the confirmation action (resolves display names).
function cancelledByRole(cancelledBy: string | undefined): string {
  // em-report's cancellation template speaks about "your teacher" for
  // teacher-initiated cancels and "the school" for admin ones. Mike is both
  // the teacher and the superadmin, so a console cancel reads as the teacher.
  if (cancelledBy === "student") return "student";
  if (cancelledBy === "superadmin" || cancelledBy === "teacher") return "teacher";
  return "admin";
}

async function bookingInfo(ctx: any, b: any) {
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
    startUtc: b.startUtc,
    endUtc: b.endUtc,
    durationMin,
    meetLink: b.meetLink ?? null,
    status: b.status,
    seriesId: b.seriesId ?? null,
    seriesKind: b.seriesKind ?? null,
    cancelledByRole: cancelledByRole(b.cancelledBy),
    billableLate: b.status === "cancelled_late",
    studentName: student?.name ?? "Student",
    // Students log in with their record email but their REAL personal
    // address lives in googleEmail — confirmations go there when present.
    studentEmail: (student as any)?.googleEmail ?? student?.email ?? null,
    studentSlug: student?.slug ?? null,
    teacherName,
    teacherEmail,
  };
}

export const getBookingInternal = internalQuery({
  args: { bookingId: v.id("lessonBookings") },
  handler: async (ctx, args) => {
    const b = await ctx.db.get(args.bookingId);
    if (!b) return null;
    return bookingInfo(ctx, b);
  },
});

export const getSeriesInternal = internalQuery({
  args: { bookingIds: v.array(v.id("lessonBookings")) },
  handler: async (ctx, args) => {
    const rows = [];
    for (const id of args.bookingIds) {
      const b = await ctx.db.get(id);
      if (b) rows.push(await bookingInfo(ctx, b));
    }
    rows.sort((a, b) => a.startUtc - b.startUtc);
    return rows;
  },
});

// Delivery retries: 1, 5, 15, 60, 240 minutes. Three one-minute retries (the
// 08-26 design) gave up inside any real relay outage; this reaches ~5.4 h.
const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000, 240 * 60_000];
const MAX_ATTEMPTS = RETRY_DELAYS_MS.length;

// em-report answers 200 with { ok, sent:[roles], failed:[{role,error}] }. Every
// party reached → "sent"; some reached → "partial" (recorded, NOT retried, or
// the parties that worked would get the email twice — the console shows it
// and offers a manual retry); none reached → a failure that retries.
async function readDeliveryOutcome(resp: Response): Promise<{ failure: string | null; partial: string | null }> {
  const text = (await resp.text()).slice(0, 400);
  if (!resp.ok) return { failure: `HTTP ${resp.status}: ${text}`, partial: null };
  try {
    const j = JSON.parse(text);
    if (Array.isArray(j?.failed) && j.failed.length) {
      const failedRoles = j.failed.map((f: any) => `${f.role}: ${f.error}`).join("; ");
      if (!j.sent?.length) return { failure: `no party reached (${failedRoles})`, partial: null };
      return { failure: null, partial: failedRoles };
    }
  } catch { /* legacy body: a 200 was a delivery receipt */ }
  return { failure: null, partial: null };
}

// Posts the booking to the em-report service (VPS), which emails the Meet link.
// In TEST mode em-report sends only to the configured test recipient. Never
// throws — a delivery failure must not affect the booking that already happened.
export const sendBookingConfirmation = internalAction({
  args: { bookingId: v.id("lessonBookings"), attempt: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const attempt = Math.max(1, args.attempt || 1);
    const url = process.env.BOOKING_NOTIFY_URL;
    const key = process.env.BOOKING_NOTIFY_KEY;
    if (!url || !key) {
      await ctx.runMutation(internal.scheduling.recordBookingNotification, {
        bookingId: args.bookingId, kind: "confirmation", status: "failed", attempt,
        error: "BOOKING_NOTIFY_URL/KEY is not configured",
      });
      return;
    }
    const info = await ctx.runQuery(internal.scheduling.getBookingInternal, { bookingId: args.bookingId });
    if (!info) return;
    let failure: string | null = null;
    let partial: string | null = null;
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-booking-key": key },
        body: JSON.stringify(info),
      });
      ({ failure, partial } = await readDeliveryOutcome(resp));
    } catch (e: any) {
      failure = e?.message || "Network error";
    }
    if (!failure) {
      await ctx.runMutation(internal.scheduling.recordBookingNotification, {
        bookingId: args.bookingId, kind: "confirmation", status: partial ? "partial" : "sent", attempt,
        error: partial ?? undefined,
      });
      return;
    }
    const finalAttempt = attempt >= MAX_ATTEMPTS;
    await ctx.runMutation(internal.scheduling.recordBookingNotification, {
      bookingId: args.bookingId, kind: "confirmation",
      status: finalAttempt ? "failed" : "pending", attempt, error: failure,
    });
    if (!finalAttempt) {
      await ctx.scheduler.runAfter(RETRY_DELAYS_MS[attempt - 1], internal.scheduling.sendBookingConfirmation, {
        bookingId: args.bookingId, attempt: attempt + 1,
      });
    }
  },
});

export const recordBookingNotification = internalMutation({
  args: {
    bookingId: v.id("lessonBookings"),
    kind: v.union(v.literal("confirmation"), v.literal("cancellation")),
    status: v.string(), attempt: v.number(), error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const booking = await ctx.db.get(args.bookingId);
    if (!booking) return;
    const now = Date.now();
    if (args.kind === "confirmation") {
      await ctx.db.patch(args.bookingId, {
        notificationStatus: args.status, notificationAttempts: args.attempt,
        notificationLastError: args.error, notificationUpdatedAt: now, updatedAt: now,
      });
    } else {
      await ctx.db.patch(args.bookingId, {
        cancellationNotificationStatus: args.status, cancellationNotificationAttempts: args.attempt,
        cancellationNotificationLastError: args.error, cancellationNotificationUpdatedAt: now, updatedAt: now,
      });
    }
  },
});

export const sendBookingCancellation = internalAction({
  args: { bookingId: v.id("lessonBookings"), attempt: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const attempt = Math.max(1, args.attempt || 1);
    const base = process.env.BOOKING_NOTIFY_URL;
    const key = process.env.BOOKING_NOTIFY_KEY;
    const info = await ctx.runQuery(internal.scheduling.getBookingInternal, { bookingId: args.bookingId });
    if (!info) return;
    let failure: string | null = null;
    let partial: string | null = null;
    if (!base || !key) failure = "BOOKING_NOTIFY_URL/KEY is not configured";
    else {
      try {
        const resp = await fetch(base.replace("booking-confirm", "booking-cancel"), {
          method: "POST", headers: { "Content-Type": "application/json", "x-booking-key": key },
          body: JSON.stringify(info),
        });
        ({ failure, partial } = await readDeliveryOutcome(resp));
      } catch (e: any) { failure = e?.message || "Network error"; }
    }
    if (!failure) {
      await ctx.runMutation(internal.scheduling.recordBookingNotification, {
        bookingId: args.bookingId, kind: "cancellation", status: partial ? "partial" : "sent", attempt,
        error: partial ?? undefined,
      });
      return;
    }
    const finalAttempt = attempt >= MAX_ATTEMPTS;
    await ctx.runMutation(internal.scheduling.recordBookingNotification, {
      bookingId: args.bookingId, kind: "cancellation",
      status: finalAttempt ? "failed" : "pending", attempt, error: failure,
    });
    if (!finalAttempt) {
      await ctx.scheduler.runAfter(RETRY_DELAYS_MS[attempt - 1], internal.scheduling.sendBookingCancellation, {
        bookingId: args.bookingId, attempt: attempt + 1,
      });
    }
  },
});

export const retryBookingNotification = mutation({
  args: { sessionToken: v.string(), bookingId: v.id("lessonBookings"), kind: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { user } = await requireAdmin(ctx, args.sessionToken);
    if (!isSuperadmin(user.role)) throw new Error("Superadmin only");
    const booking = await ctx.db.get(args.bookingId);
    if (!booking) throw new Error("Booking not found");
    const now = Date.now();
    // A booking that was confirmed as part of a series is re-sent AS the
    // series: one email listing every lesson, never twelve single ones.
    if (booking.seriesId) {
      const siblings = (await ctx.db
        .query("lessonBookings")
        .withIndex("by_student", (q: any) => q.eq("studentId", booking.studentId))
        .collect())
        .filter((b: any) => b.seriesId === booking.seriesId &&
          (args.kind === "cancellation" ? b.status !== "scheduled" : b.status === "scheduled"))
        .sort((a: any, b: any) => a.startUtc - b.startUtc);
      const ids = siblings.map((b: any) => b._id);
      if (args.kind === "cancellation") {
        await ctx.runMutation(internal.scheduling.recordSeriesNotification, { bookingIds: ids, kind: "cancellation", status: "pending", attempt: 0 });
        await ctx.scheduler.runAfter(0, internal.scheduling.sendSeriesCancellation, { bookingIds: ids, attempt: 1 });
      } else {
        await ctx.runMutation(internal.scheduling.recordSeriesNotification, { bookingIds: ids, kind: "confirmation", status: "pending", attempt: 0 });
        await ctx.scheduler.runAfter(0, internal.scheduling.sendSeriesConfirmation, { bookingIds: ids, attempt: 1 });
      }
      return { queued: true, series: true, count: ids.length };
    }
    if (args.kind === "cancellation") {
      await ctx.db.patch(args.bookingId, {
        cancellationNotificationStatus: "pending", cancellationNotificationAttempts: 0,
        cancellationNotificationLastError: undefined, cancellationNotificationUpdatedAt: now, updatedAt: now,
      });
      await ctx.scheduler.runAfter(0, internal.scheduling.sendBookingCancellation, { bookingId: args.bookingId, attempt: 1 });
    } else {
      await ctx.db.patch(args.bookingId, {
        notificationStatus: "pending", notificationAttempts: 0,
        notificationLastError: undefined, notificationUpdatedAt: now, updatedAt: now,
      });
      await ctx.scheduler.runAfter(0, internal.scheduling.sendBookingConfirmation, { bookingId: args.bookingId, attempt: 1 });
    }
    return { queued: true };
  },
});


// One email per party for a whole series (batch or weekly). Retries like the
// single confirmation; the per-booking notification status is recorded on
// every row so the console sees the truth for each lesson.
const SKIPPED_SHAPE = v.array(v.object({ dateWarsaw: v.string(), timeWarsaw: v.string(), reason: v.string() }));

export const sendSeriesConfirmation = internalAction({
  args: { bookingIds: v.array(v.id("lessonBookings")), attempt: v.optional(v.number()), skipped: v.optional(SKIPPED_SHAPE) },
  handler: async (ctx, args) => {
    const attempt = Math.max(1, args.attempt || 1);
    const base = process.env.BOOKING_NOTIFY_URL;
    const key = process.env.BOOKING_NOTIFY_KEY;
    const rows = await ctx.runQuery(internal.scheduling.getSeriesInternal, { bookingIds: args.bookingIds });
    if (!rows.length) return;
    let failure: string | null = null;
    let partial: string | null = null;
    if (!base || !key) failure = "BOOKING_NOTIFY_URL/KEY is not configured";
    else {
      const first = rows[0];
      const payload = {
        series: { seriesId: first.seriesId, seriesKind: first.seriesKind, count: rows.length },
        bookings: rows,
        skipped: args.skipped ?? [],
        studentName: first.studentName, studentEmail: first.studentEmail, studentSlug: first.studentSlug,
        teacherName: first.teacherName, teacherEmail: first.teacherEmail,
      };
      try {
        const resp = await fetch(base.replace("booking-confirm", "booking-series-confirm"), {
          method: "POST", headers: { "Content-Type": "application/json", "x-booking-key": key },
          body: JSON.stringify(payload),
        });
        ({ failure, partial } = await readDeliveryOutcome(resp));
      } catch (e: any) { failure = e?.message || "Network error"; }
    }
    if (!failure) {
      await ctx.runMutation(internal.scheduling.recordSeriesNotification, {
        bookingIds: args.bookingIds, kind: "confirmation", status: partial ? "partial" : "sent", attempt,
        error: partial ?? undefined,
      });
      return;
    }
    const finalAttempt = attempt >= MAX_ATTEMPTS;
    await ctx.runMutation(internal.scheduling.recordSeriesNotification, {
      bookingIds: args.bookingIds, kind: "confirmation",
      status: finalAttempt ? "failed" : "pending", attempt, error: failure,
    });
    if (!finalAttempt) {
      await ctx.scheduler.runAfter(RETRY_DELAYS_MS[attempt - 1], internal.scheduling.sendSeriesConfirmation, {
        bookingIds: args.bookingIds, attempt: attempt + 1, skipped: args.skipped,
      });
    }
  },
});

export const sendSeriesCancellation = internalAction({
  args: { bookingIds: v.array(v.id("lessonBookings")), attempt: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const attempt = Math.max(1, args.attempt || 1);
    const base = process.env.BOOKING_NOTIFY_URL;
    const key = process.env.BOOKING_NOTIFY_KEY;
    const rows = await ctx.runQuery(internal.scheduling.getSeriesInternal, { bookingIds: args.bookingIds });
    if (!rows.length) return;
    let failure: string | null = null;
    let partial: string | null = null;
    if (!base || !key) failure = "BOOKING_NOTIFY_URL/KEY is not configured";
    else {
      const first = rows[0];
      const payload = {
        series: { seriesId: first.seriesId, seriesKind: first.seriesKind, count: rows.length },
        bookings: rows,
        cancelledByRole: first.cancelledByRole,
        billableCount: rows.filter((r: any) => r.billableLate).length,
        studentName: first.studentName, studentEmail: first.studentEmail, studentSlug: first.studentSlug,
        teacherName: first.teacherName, teacherEmail: first.teacherEmail,
      };
      try {
        const resp = await fetch(base.replace("booking-confirm", "booking-series-cancel"), {
          method: "POST", headers: { "Content-Type": "application/json", "x-booking-key": key },
          body: JSON.stringify(payload),
        });
        ({ failure, partial } = await readDeliveryOutcome(resp));
      } catch (e: any) { failure = e?.message || "Network error"; }
    }
    if (!failure) {
      await ctx.runMutation(internal.scheduling.recordSeriesNotification, {
        bookingIds: args.bookingIds, kind: "cancellation", status: partial ? "partial" : "sent", attempt,
        error: partial ?? undefined,
      });
      return;
    }
    const finalAttempt = attempt >= MAX_ATTEMPTS;
    await ctx.runMutation(internal.scheduling.recordSeriesNotification, {
      bookingIds: args.bookingIds, kind: "cancellation",
      status: finalAttempt ? "failed" : "pending", attempt, error: failure,
    });
    if (!finalAttempt) {
      await ctx.scheduler.runAfter(RETRY_DELAYS_MS[attempt - 1], internal.scheduling.sendSeriesCancellation, {
        bookingIds: args.bookingIds, attempt: attempt + 1,
      });
    }
  },
});

export const recordSeriesNotification = internalMutation({
  args: {
    bookingIds: v.array(v.id("lessonBookings")),
    kind: v.union(v.literal("confirmation"), v.literal("cancellation")),
    status: v.string(), attempt: v.number(), error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const bookingId of args.bookingIds) {
      const booking = await ctx.db.get(bookingId);
      if (!booking) continue;
      if (args.kind === "confirmation") {
        await ctx.db.patch(bookingId, {
          notificationStatus: args.status, notificationAttempts: args.attempt,
          notificationLastError: args.error, notificationUpdatedAt: now, updatedAt: now,
        });
      } else {
        await ctx.db.patch(bookingId, {
          cancellationNotificationStatus: args.status, cancellationNotificationAttempts: args.attempt,
          cancellationNotificationLastError: args.error, cancellationNotificationUpdatedAt: now, updatedAt: now,
        });
      }
    }
  },
});

// The 24-hour rule, applied to one booking. Shared by cancelBooking and
// cancelSeries so a series cancel can never be cheaper or dearer than
// cancelling the same lessons one by one.
//
// Who cancelled is derived from the SESSION, never trusted from the caller's
// string alone: a student session is always "student"; an admin session (the
// console, or Bajla's cached superadmin token acting for a student on
// WhatsApp) is what it says it is. A late cancel bills the student ONLY when
// the student cancelled — until 2026-09-01 `billable` was time-only, so a
// teacher cancelling inside 24 hours consumed one of the student's prepaid
// lessons, and the cancel email then told the student there was no charge.
function cancellationPatch(
  booking: any,
  auth: { kind: string; user: any },
  args: { cancelledBy: string; cancelledByName?: string },
  now: number,
) {
  const cancelledBy =
    auth.kind === "student" ? "student"
    : args.cancelledBy === "student" ? "student"
    : (isSuperadmin(auth.user?.role) || auth.user?.role === "teacher") ? "superadmin"
    : "school_admin";
  const isLate = booking.startUtc - now < CANCELLATION_WINDOW_MS;
  const billable = isLate && cancelledBy === "student";
  return {
    isLate,
    billable,
    cancelledBy,
    patch: {
      status: billable ? "cancelled_late" : "cancelled",
      billable,
      cancelledBy,
      cancelledByName: args.cancelledByName,
      cancelledAt: now,
      cancellationNotificationStatus: "pending",
      cancellationNotificationAttempts: 0,
      cancellationNotificationUpdatedAt: now,
      updatedAt: now,
    },
  };
}

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
    // Phase A2 — REQUIRED. A late cancel sets billable:true and destroys a paid
    // lesson, so an anonymous caller must never reach this.
    const auth = await requireStudentSelfOrAdmin(ctx, args.sessionToken, booking.studentId);
    if (booking.status !== "scheduled") throw new Error("Only scheduled lessons can be cancelled");

    const now = Date.now();
    const { isLate, billable, cancelledBy, patch } = cancellationPatch(booking, auth, args, now);
    await ctx.db.patch(args.bookingId, patch);
    await ctx.scheduler.runAfter(0, internal.scheduling.sendBookingCancellation, {
      bookingId: args.bookingId, attempt: 1,
    });
    return {
      status: patch.status,
      billable,
      // Inside 24h but not the student's doing: cancelled, not charged. The
      // console must not show the "treated as used and billed" copy for this.
      lateButFree: isLate && !billable,
      cancelledBy,
      hoursBeforeStart: Math.max(0, Math.round((booking.startUtc - now) / 36e5 * 10) / 10),
    };
  },
});

// Cancel every still-scheduled lesson of a series from `fromStartUtc` (default:
// now) onwards. Each lesson is judged by the same 24-hour rule as a single
// cancel, so at most the very next lesson can be billable; the result says
// which. ONE cancellation email per party listing every date.
export const cancelSeries = mutation({
  args: {
    sessionToken: v.optional(v.string()),
    seriesId: v.string(),
    fromStartUtc: v.optional(v.number()),
    cancelledBy: v.string(),
    cancelledByName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const first = await ctx.db.get(args.seriesId as any);
    if (!first || (first as any).seriesId !== args.seriesId) throw new Error("Series not found");
    const studentId = (first as any).studentId;
    const auth = await requireStudentSelfOrAdmin(ctx, args.sessionToken, studentId);

    const now = Date.now();
    const from = args.fromStartUtc ?? now;
    const rows = (await ctx.db
      .query("lessonBookings")
      .withIndex("by_student", (q: any) => q.eq("studentId", studentId))
      .collect())
      .filter((b: any) => b.seriesId === args.seriesId && b.status === "scheduled" && b.startUtc >= from)
      .sort((a: any, b: any) => a.startUtc - b.startUtc);
    if (!rows.length) refuse("NOTHING_TO_CANCEL", "No scheduled lessons left in this series");

    const cancelled: any[] = [];
    let late = 0, lateButFree = 0;
    for (const b of rows) {
      const { isLate, billable, patch } = cancellationPatch(b, auth, args, now);
      await ctx.db.patch(b._id, patch);
      if (billable) late++;
      else if (isLate) lateButFree++;
      cancelled.push({ bookingId: b._id, dateWarsaw: b.dateWarsaw, timeWarsaw: b.timeWarsaw, startUtc: b.startUtc, billable });
    }
    await ctx.scheduler.runAfter(0, internal.scheduling.sendSeriesCancellation, {
      bookingIds: rows.map((b: any) => b._id), attempt: 1,
    });
    return { cancelled: cancelled.length, cancelledLate: late, lateButFree, bookings: cancelled };
  },
});

// A teacher/admin may record a student no-show only after waiting 20 minutes
// from the scheduled start. It consumes one prepaid lesson because the teacher
// reserved the slot and remained available; it is deliberately not described
// or stored as a lesson taught. If the teaching pipeline has already produced
// a real lesson record for that student/date, the booking cannot be reclassified.
export const markStudentNoShow = mutation({
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
    if (user.role === "teacher") {
      const student = await ctx.db.get(booking.studentId);
      const effectiveTeacherId = booking.teacherId ?? student?.primaryTeacherId;
      if (!effectiveTeacherId || String(effectiveTeacherId) !== String(user._id)) {
        throw new Error("Unauthorized");
      }
    }
    if (!["scheduled", "completed"].includes(booking.status)) {
      throw new Error("Only an unreviewed scheduled lesson can be marked as a no-show");
    }

    const now = Date.now();
    if (now < booking.startUtc + NO_SHOW_WAIT_MS) {
      throw new Error("Wait at least 20 minutes after the scheduled start before marking a no-show");
    }

    const taughtRows = await ctx.db
      .query("lessons")
      .withIndex("by_student_date", q =>
        q.eq("studentId", booking.studentId).eq("date", booking.dateWarsaw)
      )
      .collect();
    if (taughtRows.some(lesson => lesson.status !== "cancelled" && lesson.status !== "planned")) {
      throw new Error("A taught lesson record already exists for this student and date");
    }

    await ctx.db.patch(args.bookingId, {
      status: "no_show",
      billable: true,
      noShowAt: now,
      noShowMarkedBy: user.name || user.email,
      updatedAt: now,
    });
    return { status: "no_show", billable: true, waitedMinutes: Math.floor((now - booking.startUtc) / 60000) };
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

export const reconcileAllPastBookings = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const bookings = await ctx.db.query("lessonBookings").collect();
    let updated = 0;
    for (const booking of bookings) {
      if (booking.status === "scheduled" && booking.endUtc < now) {
        await ctx.db.patch(booking._id, { status: "completed", billable: true, updatedAt: now });
        updated++;
      }
    }
    return { updated };
  },
});

// ─── Monthly stats (billing figure) ─────────────────────────────────────────
// Completed lessons come from the `lessons` table (taught record, written by
// the post-lesson pipeline). Billable late cancellations and no-shows come
// from bookings.

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
      noShows: number;
      cancellations: number;
      scheduled: number;
      billableTotal: number;
      perStudent: Record<string, { name: string; completed: number; lateCancellations: number; noShows: number }>;
    };
    const months: Record<string, MonthRow> = {};
    const ensureMonth = (key: string): MonthRow => {
      if (!months[key]) {
        months[key] = {
          month: key, completedLessons: 0, lateCancellations: 0, noShows: 0, cancellations: 0,
          scheduled: 0, billableTotal: 0, perStudent: {},
        };
      }
      return months[key];
    };
    const ensureStudent = (row: MonthRow, id: string, name: string) => {
      if (!row.perStudent[id]) row.perStudent[id] = { name, completed: 0, lateCancellations: 0, noShows: 0 };
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
      } else if (b.status === "no_show") {
        row.noShows++;
        row.billableTotal++;
        ensureStudent(row, String(b.studentId), name).noShows++;
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
        month: currentMonthKey, completedLessons: 0, lateCancellations: 0, noShows: 0, cancellations: 0,
        scheduled: 0, billableTotal: 0, perStudent: {},
      },
      months: sorted,
    };
  },
});
