import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { hashPassword, verifyPassword, isSuperadmin } from "./authHelpers";

// Admin login — accepts both PBKDF2-hashed and legacy plaintext rows
// so the existing michael@conversa.com seed account still works.
export const login = query({
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
    return {
      success: true,
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

// Set admin password (hashes with PBKDF2 before storing)
export const setPassword = mutation({
  args: { userId: v.id("users"), password: v.string() },
  handler: async (ctx, args) => {
    const hashed = await hashPassword(args.password);
    await ctx.db.patch(args.userId, {
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

// Verify a superadmin session. Callers (frontend) pass the userId
// they cached in localStorage after login; we look it up and
// confirm the user still has super_admin role. Returns the user
// row minus the password field.
export const getSuperadmin = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user || !isSuperadmin(user.role) || user.status !== "active") {
      return null;
    }
    return {
      _id: user._id,
      email: user.email,
      name: user.name,
      role: user.role,
      organizationId: user.organizationId,
    };
  },
});

// Wipe all data from all tables (for reimport). Use with caution!
export const wipeAll = mutation({
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
