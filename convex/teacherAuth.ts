// Teacher magic-link authentication (teacher portal, 2026-06-04).
//
// Teachers never get a password. The em-report service mints a one-time,
// short-lived (20 min) token server-to-server and emails the teacher a link;
// clicking it exchanges the raw token for an admin-kind session. Only the
// SHA-256 hash of the token is stored in magicTokens (single-use via usedAt).

import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import {
  generateToken,
  sha256Hex,
  createAdminSession,
  requireTeacher,
  requireAdmin,
  isSuperadmin,
} from "./authHelpers";

const MAGIC_TOKEN_TTL_MS = 20 * 60 * 1000;       // 20 minutes (email-delivered links)
const ADMIN_LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days (admin-handed links — teacher may sign in later)

// ─────────────────────────────────────────────────────────────
// createMagicToken — SERVER-TO-SERVER ONLY (em-report service).
//
// Authenticated by a shared key in the Convex env var MAGIC_LINK_KEY.
// On any auth failure or unknown/inactive teacher we return { found: false }
// WITHOUT minting — never throwing details that could confirm an email or
// the key's validity. The RAW token is returned ONLY to this trusted caller;
// it is never exposed to browsers.
// ─────────────────────────────────────────────────────────────
export const createMagicToken = mutation({
  args: { email: v.string(), apiKey: v.string() },
  handler: async (ctx, args) => {
    const expected = process.env.MAGIC_LINK_KEY;
    if (!expected || args.apiKey !== expected) {
      return { found: false };
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .unique();

    if (!user || user.status !== "active" || user.role !== "teacher" || user.deletedAt) {
      return { found: false };
    }

    const now = Date.now();
    const token = generateToken();
    await ctx.db.insert("magicTokens", {
      tokenHash: await sha256Hex(token),
      userId: user._id,
      email: user.email,
      expiresAt: now + MAGIC_TOKEN_TTL_MS,
      createdAt: now,
    });

    return { found: true, token, name: user.name, email: user.email };
  },
});

// ─────────────────────────────────────────────────────────────
// verifyMagicToken — public mutation (called from the magic-link landing
// page). Exchanges a raw token for an admin session. Rejects on any of:
// no matching token, already used, expired, or the user is no longer a
// valid active teacher. Marks the token used and stamps lastLoginAt.
// ─────────────────────────────────────────────────────────────
export const verifyMagicToken = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const hash = await sha256Hex(args.token);
    const record = await ctx.db
      .query("magicTokens")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", hash))
      .unique();

    const now = Date.now();
    if (!record || record.usedAt || record.expiresAt < now) {
      return { ok: false };
    }

    const user = await ctx.db.get(record.userId);
    if (!user || user.status === "disabled" || user.deletedAt || user.role !== "teacher") {
      return { ok: false };
    }

    await ctx.db.patch(record._id, { usedAt: now });
    await ctx.db.patch(user._id, { lastLoginAt: now });

    const sessionToken = await createAdminSession(ctx, user._id);

    return {
      ok: true,
      sessionToken,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        organizationId: user.organizationId,
      },
    };
  },
});

// ─────────────────────────────────────────────────────────────
// adminCreateTeacherLink — an authenticated admin/superadmin mints a
// sign-in link for a teacher in their org and hands it over manually
// (the no-email path: works before any email sender is configured).
// Longer-lived than an emailed link since the admin delivers it.
// ─────────────────────────────────────────────────────────────
export const adminCreateTeacherLink = mutation({
  args: { sessionToken: v.string(), teacherId: v.id("users") },
  handler: async (ctx, args) => {
    const { user } = await requireAdmin(ctx, args.sessionToken);
    const teacher = await ctx.db.get(args.teacherId);
    if (!teacher || teacher.role !== "teacher" || teacher.deletedAt) {
      throw new Error("Teacher not found");
    }
    if (!isSuperadmin(user.role) && teacher.organizationId !== user.organizationId) {
      throw new Error("Unauthorized");
    }
    const now = Date.now();
    const token = generateToken();
    await ctx.db.insert("magicTokens", {
      tokenHash: await sha256Hex(token),
      userId: teacher._id,
      email: teacher.email,
      expiresAt: now + ADMIN_LINK_TTL_MS,
      createdAt: now,
    });
    return { ok: true, link: `https://englishmetro.com/teacher/verify?token=${token}` };
  },
});

// ─────────────────────────────────────────────────────────────
// teacherMe — restore a teacher session on page load. Returns the
// teacher (minus sensitive fields) or null if the session is invalid.
// ─────────────────────────────────────────────────────────────
export const teacherMe = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    try {
      const { user } = await requireTeacher(ctx, args.sessionToken);
      return {
        _id: user._id,
        name: user.name,
        email: user.email,
        organizationId: user.organizationId,
        availabilityHandedOff: user.availabilityHandedOff,
      };
    } catch {
      return null;
    }
  },
});
