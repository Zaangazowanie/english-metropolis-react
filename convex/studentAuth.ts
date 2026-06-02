// Student authentication — PBKDF2 password verification, mirroring admin auth.
// Students log in with their email address (must be set on the student row).
// A superadmin (or teacher with access) can set/reset a student's password via
// setStudentPassword. Students without a passwordHash cannot log in via this
// flow — they fall back to direct /app/<slug> link access.

import { mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { hashPassword, verifyPassword } from "./authHelpers";

// ─────────────────────────────────────────────────────────────
// studentLogin — public mutation (called from the Login page).
// Returns { success, student } or { success: false, error }.
// We use a mutation (not a query) so PBKDF2 can run in the V8
// runtime without a Node action hop — mutations have async support.
// ─────────────────────────────────────────────────────────────
export const studentLogin = mutation({
  args: {
    email: v.string(),
    password: v.string(),
  },
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();

    const student = await ctx.db
      .query("students")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();

    if (!student) {
      return { success: false, error: "Invalid credentials" };
    }

    if (!student.passwordHash) {
      return { success: false, error: "No password set — contact your teacher" };
    }

    if (student.status === "archived" || student.status === "graduated") {
      return { success: false, error: "Account inactive" };
    }

    const ok = await verifyPassword(args.password, student.passwordHash);
    if (!ok) {
      return { success: false, error: "Invalid credentials" };
    }

    return {
      success: true,
      student: {
        _id: student._id,
        name: student.name,
        slug: student.slug,
        email: student.email,
        level: student.level,
        organizationId: student.organizationId,
      },
    };
  },
});

// ─────────────────────────────────────────────────────────────
// setStudentPassword — public mutation for superadmin panel use.
// actingUserId must be a super_admin or org_admin/teacher.
// Called from the SuperadminStudents page to provision passwords.
// ─────────────────────────────────────────────────────────────
export const setStudentPassword = mutation({
  args: {
    actingUserId: v.id("users"),
    studentId: v.id("students"),
    newPassword: v.string(),
  },
  handler: async (ctx, args) => {
    // Verify the acting user has the right to set passwords
    const actor = await ctx.db.get(args.actingUserId);
    if (!actor) {
      throw new Error("Acting user not found");
    }
    const allowedRoles = ["super_admin", "org_admin", "teacher"];
    if (!allowedRoles.includes(actor.role)) {
      throw new Error("Insufficient permissions to set student passwords");
    }

    const student = await ctx.db.get(args.studentId);
    if (!student) {
      throw new Error("Student not found");
    }

    if (args.newPassword.length < 6) {
      throw new Error("Password must be at least 6 characters");
    }

    const hashed = await hashPassword(args.newPassword);
    await ctx.db.patch(args.studentId, {
      passwordHash: hashed,
      updatedAt: Date.now(),
    });

    return { success: true, studentSlug: student.slug };
  },
});

// ─────────────────────────────────────────────────────────────
// seedStudentPassword — internal mutation for CLI bootstrapping.
// Usage: npx convex run studentAuth:seedStudentPassword --prod \
//   '{"slug":"szymon-karpinski","password":"test1234"}'
// ─────────────────────────────────────────────────────────────
export const seedStudentPassword = internalMutation({
  args: {
    slug: v.string(),
    password: v.string(),
  },
  handler: async (ctx, args) => {
    const student = await ctx.db
      .query("students")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();

    if (!student) {
      throw new Error(`Student with slug "${args.slug}" not found`);
    }

    const hashed = await hashPassword(args.password);
    await ctx.db.patch(student._id, {
      passwordHash: hashed,
      updatedAt: Date.now(),
    });

    return { success: true, studentId: student._id, slug: student.slug };
  },
});
