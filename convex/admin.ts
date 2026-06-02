import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import {
  hashPassword,
  verifyPassword,
  isSuperadmin,
  createAdminSession,
  requireAdmin,
  requireSuperadmin,
  destroySession,
} from "./authHelpers";

// Admin login — accepts both PBKDF2-hashed and legacy plaintext rows
// so the existing michael@conversa.com seed account still works.
//
// Phase A1 (2026-06-02): now a MUTATION that issues a server-side session
// token. All protected admin functions require this token. The previous
// query-based login issued no token, leaving every admin function public.
export const login = mutation({
  args: { email: v.string(), password: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", q => q.eq("email", args.email))
      .unique();
    if (!user || !user.password) return { success: false, error: "Invalid credentials" };
    const ok = await verifyPassword(args.password, user.password);
    if (!ok) return { success: false, error: "Invalid credentials" };
    if (
      user.role !== "admin" &&
      user.role !== "org_admin" &&
      user.role !== "super_admin" &&
      user.role !== "teacher"
    ) {
      return { success: false, error: "Unauthorized" };
    }
    if (user.status !== "active") {
      return { success: false, error: "Account inactive" };
    }
    const sessionToken = await createAdminSession(ctx, user._id);
    await ctx.db.patch(user._id, { lastLoginAt: Date.now() });
    return {
      success: true,
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

// Restore a session on page load. Returns the user (minus password) or null.
export const getSession = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    try {
      const { user } = await requireAdmin(ctx, args.sessionToken);
      return {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        organizationId: user.organizationId,
      };
    } catch {
      return null;
    }
  },
});

// Logout — destroys the session server-side.
export const logout = mutation({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    await destroySession(ctx, args.sessionToken);
    return { success: true };
  },
});

// Set admin password (hashes with PBKDF2 before storing).
// Phase A1: requires a valid admin session. Admins can only change their OWN
// password; superadmins may pass targetUserId to reset someone else's.
export const setPassword = mutation({
  args: {
    sessionToken: v.string(),
    password: v.string(),
    targetUserId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const { user } = await requireAdmin(ctx, args.sessionToken);
    if (args.password.length < 8) {
      throw new Error("Password must be at least 8 characters");
    }
    let targetId = user._id;
    if (args.targetUserId && String(args.targetUserId) !== String(user._id)) {
      if (!isSuperadmin(user.role)) {
        throw new Error("Unauthorized: only superadmins can reset other users' passwords");
      }
      targetId = args.targetUserId;
    }
    const hashed = await hashPassword(args.password);
    await ctx.db.patch(targetId, {
      password: hashed,
      updatedAt: Date.now(),
    });
    return "ok";
  },
});

// ─────────────────────────────────────────────────────────────
// Superadmin bootstrap + guards
// ─────────────────────────────────────────────────────────────

// Idempotent seed: creates or upgrades a super_admin user. INTERNAL
// ONLY — callable exclusively via `npx convex run` from a trusted
// CLI session. If this were a public mutation, anyone who discovered
// the URL could self-elevate to super_admin through the nginx proxy.
export const seedSuperadmin = internalMutation({
  args: { email: v.string(), name: v.string(), password: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_email", q => q.eq("email", args.email))
      .unique();
    const hashed = await hashPassword(args.password);
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        name: args.name,
        role: "super_admin",
        password: hashed,
        status: "active",
        updatedAt: now,
      });
      return { userId: existing._id, created: false };
    }
    const userId = await ctx.db.insert("users", {
      email: args.email,
      name: args.name,
      role: "super_admin",
      password: hashed,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    return { userId, created: true };
  },
});

// Delete a test/stray user account. Also CLI-only.
export const deleteUserByEmail = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", q => q.eq("email", args.email))
      .unique();
    if (!user) return { deleted: false };
    await ctx.db.delete(user._id);
    return { deleted: true, userId: user._id };
  },
});

// Seed an organization if it doesn't already exist. CLI-only.
export const seedOrganization = internalMutation({
  args: {
    slug: v.string(),
    name: v.string(),
    type: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("organizations")
      .filter(q => q.eq(q.field("slug"), args.slug))
      .first();
    if (existing) return { orgId: existing._id, created: false };
    const now = Date.now();
    const orgId = await ctx.db.insert("organizations", {
      slug: args.slug,
      name: args.name,
      type: args.type,
      status: "active",
      settings: {
        defaultLanguage: "pl",
        cefrScaleEnabled: true,
        quizEnabled: true,
        youglishEnabled: true,
        ttsEnabled: true,
        transcriptAnalysisEnabled: true,
      },
      subscription: { plan: "free", maxStudents: 50, maxTeachers: 5 },
      createdAt: now,
      updatedAt: now,
    });
    return { orgId, created: true };
  },
});

// Seed a school-admin user tied to an organization. CLI-only.
export const seedSchoolAdmin = internalMutation({
  args: {
    email: v.string(),
    name: v.string(),
    password: v.string(),
    organizationSlug: v.string(),
  },
  handler: async (ctx, args) => {
    const org = await ctx.db
      .query("organizations")
      .filter(q => q.eq(q.field("slug"), args.organizationSlug))
      .first();
    if (!org) throw new Error(`Organization '${args.organizationSlug}' not found`);
    const existing = await ctx.db
      .query("users")
      .withIndex("by_email", q => q.eq("email", args.email))
      .unique();
    const hashed = await hashPassword(args.password);
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        name: args.name,
        role: "admin",
        password: hashed,
        organizationId: org._id,
        status: "active",
        updatedAt: now,
      });
      return { userId: existing._id, created: false };
    }
    const userId = await ctx.db.insert("users", {
      email: args.email,
      name: args.name,
      role: "admin",
      password: hashed,
      organizationId: org._id,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    return { userId, created: true };
  },
});

// Verify a superadmin session. Phase A1: takes the session token (the
// previous version took a raw userId, which anyone could supply).
export const getSuperadmin = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    try {
      const { user } = await requireSuperadmin(ctx, args.sessionToken);
      return {
        _id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        organizationId: user.organizationId,
      };
    } catch {
      return null;
    }
  },
});

// Wipe all data from all tables (for reimport). Phase A1: INTERNAL ONLY —
// this was a public mutation, meaning anyone on the internet could delete
// the entire database via POST /api/mutation.
export const wipeAll = internalMutation({
  args: {},
  handler: async (ctx) => {
    const tables = [
      "keywords",
      "lessons",
      "students",
      "transcriptAnalyses",
      "quizResults",
      "youglishIndex",
      "keywordBank",
      "ttsCache",
      "ingestionJobs",
    ] as const;

    let total = 0;
    for (const table of tables) {
      const docs = await ctx.db.query(table).collect();
      for (const doc of docs) {
        await ctx.db.delete(doc._id);
        total++;
      }
    }
    return { deleted: total };
  },
});
