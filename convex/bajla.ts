// Bajla · English Metro WhatsApp assistant — Convex helpers.
//
// Additive module (2026-06-06). Lets the off-Convex Bajla router attach a
// WhatsApp number to a teacher/admin user so role-by-phone resolution works.
// (students.updateStudent already covers the student case.) Pipeline-gated.

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireAdminOrPipelineKey, requireAdminOrStudent } from "./authHelpers";

// Patch a booking's video-room link. Used to replace the Jitsi placeholder with
// a real Google Meet once the VPS (em-report / Bajla router) has minted one.
export const setBookingMeetLink = mutation({
  args: {
    apiKey: v.optional(v.string()),
    sessionToken: v.optional(v.string()),
    bookingId: v.id("lessonBookings"),
    meetLink: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAdminOrPipelineKey(ctx, args.sessionToken, args.apiKey);
    const b = await ctx.db.get(args.bookingId);
    if (!b) throw new Error("Booking not found");
    await ctx.db.patch(args.bookingId, { meetLink: args.meetLink, updatedAt: Date.now() });
    return { ok: true };
  },
});

export const setUserPhone = mutation({
  args: {
    apiKey: v.optional(v.string()),
    sessionToken: v.optional(v.string()),
    userId: v.id("users"),
    phone: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAdminOrPipelineKey(ctx, args.sessionToken, args.apiKey);
    const u = await ctx.db.get(args.userId);
    if (!u) throw new Error("User not found");
    await ctx.db.patch(args.userId, { phone: args.phone, updatedAt: Date.now() });
    return { ok: true, userId: args.userId };
  },
});

// ─────────────────────────────────────────────────────────────
// Self-serve phone — lets a *logged-in* student/teacher/admin read and save
// their OWN WhatsApp number from the Bajla connect popup, authenticating with
// their own session (the older setUserPhone/updateStudent both require an
// admin/pipeline key, which a student or teacher session does not have).
// Bajla matches accounts by the last 9 digits, so we just keep digits (+ a
// leading "+" if present) and require at least 9 of them.
// ─────────────────────────────────────────────────────────────

export const getMyPhone = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const who = await requireAdminOrStudent(ctx, args.sessionToken);
    const acct = who.kind === "student" ? who.student : who.user;
    return { phone: acct?.phone || null, name: acct?.name || null, kind: who.kind };
  },
});

export const setMyPhone = mutation({
  args: { sessionToken: v.string(), phone: v.string() },
  handler: async (ctx, args) => {
    const who = await requireAdminOrStudent(ctx, args.sessionToken);
    const clean = args.phone.trim().replace(/[^\d+]/g, "");
    if (clean.replace(/\D/g, "").length < 9) {
      throw new Error("Phone number must have at least 9 digits");
    }
    const now = Date.now();
    if (who.kind === "student") {
      await ctx.db.patch(who.student._id, { phone: clean, updatedAt: now });
    } else {
      await ctx.db.patch(who.user._id, { phone: clean, updatedAt: now });
    }
    return { ok: true, phone: clean };
  },
});
