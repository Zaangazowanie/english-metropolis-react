import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAdmin, isSuperadmin } from "./authHelpers";

// Teacher CRUD. Removal is ALWAYS soft (deletedAt + status "disabled") —
// we never hard-delete a teacher row, nor their availability/bookings, so
// all historical scheduling and billing data is retained.

// Resolve the org in scope: superadmins may target any org (or fall back to
// their own); everyone else is locked to their own organization.
function resolveOrg(user: any, argOrgId: any) {
  const organizationId = isSuperadmin(user.role)
    ? (argOrgId ?? user.organizationId)
    : user.organizationId;
  if (!organizationId) throw new Error("No organization in scope");
  return organizationId;
}

// List teachers in the org. Soft-removed teachers are hidden unless
// includeRemoved is set. studentCount = students whose primaryTeacherId is
// this teacher.
export const listTeachers = query({
  args: {
    sessionToken: v.optional(v.string()),
    organizationId: v.optional(v.id("organizations")),
    includeRemoved: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { user } = await requireAdmin(ctx, args.sessionToken);
    const organizationId = resolveOrg(user, args.organizationId);

    const teachers = await ctx.db
      .query("users")
      .withIndex("by_org_role", q =>
        q.eq("organizationId", organizationId).eq("role", "teacher"),
      )
      .collect();

    const result = [];
    for (const u of teachers) {
      if (u.deletedAt && !args.includeRemoved) continue;
      const students = await ctx.db
        .query("students")
        .withIndex("by_teacher", q => q.eq("primaryTeacherId", u._id))
        .collect();
      result.push({
        _id: u._id,
        name: u.name,
        email: u.email,
        status: u.status,
        availabilityHandedOff: !!u.availabilityHandedOff,
        removed: !!u.deletedAt,
        studentCount: students.length,
      });
    }
    return result;
  },
});

// Create a teacher. Rejects a duplicate email.
export const createTeacher = mutation({
  args: {
    sessionToken: v.optional(v.string()),
    name: v.string(),
    email: v.string(),
    organizationId: v.optional(v.id("organizations")),
  },
  handler: async (ctx, args) => {
    const { user } = await requireAdmin(ctx, args.sessionToken);
    const organizationId = resolveOrg(user, args.organizationId);

    const existing = await ctx.db
      .query("users")
      .withIndex("by_email", q => q.eq("email", args.email))
      .unique();
    if (existing) throw new Error("A user with that email already exists");

    const now = Date.now();
    const teacherId = await ctx.db.insert("users", {
      email: args.email,
      name: args.name,
      role: "teacher",
      organizationId,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    return { teacherId };
  },
});

// Update a teacher's name/email/status. Same-org + role guards.
export const updateTeacher = mutation({
  args: {
    sessionToken: v.optional(v.string()),
    teacherId: v.id("users"),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await requireAdmin(ctx, args.sessionToken);
    const target = await ctx.db.get(args.teacherId);
    if (!target) throw new Error("Teacher not found");
    if (!isSuperadmin(user.role) && target.organizationId !== user.organizationId) {
      throw new Error("Unauthorized: teacher belongs to another organization");
    }
    if (target.role !== "teacher") throw new Error("Not a teacher");

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.name !== undefined) patch.name = args.name;
    if (args.email !== undefined) patch.email = args.email;
    if (args.status !== undefined) patch.status = args.status;
    await ctx.db.patch(args.teacherId, patch);
    return { ok: true };
  },
});

// Soft-delete a teacher. Retains the row and all availability/bookings.
export const removeTeacher = mutation({
  args: {
    sessionToken: v.optional(v.string()),
    teacherId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const { user } = await requireAdmin(ctx, args.sessionToken);
    const target = await ctx.db.get(args.teacherId);
    if (!target) throw new Error("Teacher not found");
    if (!isSuperadmin(user.role) && target.organizationId !== user.organizationId) {
      throw new Error("Unauthorized: teacher belongs to another organization");
    }
    if (target.role !== "teacher") throw new Error("Not a teacher");

    const now = Date.now();
    await ctx.db.patch(args.teacherId, {
      deletedAt: now,
      status: "disabled",
      updatedAt: now,
    });
    return { ok: true };
  },
});

// Restore a soft-deleted teacher.
export const restoreTeacher = mutation({
  args: {
    sessionToken: v.optional(v.string()),
    teacherId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const { user } = await requireAdmin(ctx, args.sessionToken);
    const target = await ctx.db.get(args.teacherId);
    if (!target) throw new Error("Teacher not found");
    if (!isSuperadmin(user.role) && target.organizationId !== user.organizationId) {
      throw new Error("Unauthorized: teacher belongs to another organization");
    }
    if (target.role !== "teacher") throw new Error("Not a teacher");

    await ctx.db.patch(args.teacherId, {
      deletedAt: undefined,
      status: "active",
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});
