// Student authentication — PBKDF2 password verification, mirroring admin auth.
// Students log in with their email address (must be set on the student row).
// A superadmin (or teacher with access) can set/reset a student's password via
// setStudentPassword. Students without a passwordHash cannot log in via this
// flow — they fall back to direct /app/<slug> link access.

import { action, mutation, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { hashPassword, verifyPassword, createStudentSession, requireAdmin } from "./authHelpers";

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

    const sessionToken = await createStudentSession(ctx, student._id);

    return {
      success: true,
      sessionToken,
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
// Self-service signup for brand-new students (2026-07-10). Creates the
// student in the English Metropolis PVT org with Michael Poncana pre-assigned
// as teacher; the student's PERSONAL email is both their login and the
// confirmation address (googleEmail). Returns a live session like studentLogin.
const SIGNUP_ORG = "js779cs2vjwb2c9yjc3a7t619n84zcp8" as any;      // English Metropolis PVT
const SIGNUP_TEACHER = "kd72y2mt9t78nkyes15rh7dhc5881pbv" as any;  // Michael Poncana

function slugify(name: string): string {
  return name.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/ł/g, "l")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "student";
}

export const studentSignup = mutation({
  args: {
    name: v.string(),
    email: v.string(),
    password: v.string(),
    phone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const name = args.name.trim();
    const email = args.email.trim().toLowerCase();
    if (name.length < 2) return { success: false, error: "Please enter your name" };
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { success: false, error: "Please enter a valid email" };
    if (args.password.length < 8) return { success: false, error: "Password must be at least 8 characters" };

    const clash = await ctx.db.query("students")
      .withIndex("by_email", q => q.eq("email", email)).first();
    if (clash) return { success: false, error: "An account with this email already exists — sign in instead" };

    let slug = slugify(name);
    for (let i = 0; i < 50; i++) {
      const taken = await ctx.db.query("students")
        .withIndex("by_slug", q => q.eq("slug", slug)).first();
      if (!taken) break;
      slug = `${slugify(name)}-${i + 2}`;
    }

    const now = Date.now();
    const studentId = await ctx.db.insert("students", {
      organizationId: SIGNUP_ORG,
      name, slug, email,
      googleEmail: email,
      phone: args.phone?.trim() || undefined,
      level: "",
      type: "individual",
      status: "active",
      primaryTeacherId: SIGNUP_TEACHER,
      passwordHash: await hashPassword(args.password),
      enrolledAt: now, createdAt: now, updatedAt: now,
    } as any);

    const sessionToken = await createStudentSession(ctx, studentId);
    return {
      success: true, sessionToken,
      student: { _id: studentId, name, slug, email, level: "", organizationId: SIGNUP_ORG },
    };
  },
});

// Signup, action-first (2026-07-10). PBKDF2 at 210k iterations occasionally
// blows the MUTATION execution budget ("timed out performing too many system
// operations") on a cold isolate — Mike hit it live. Actions get a far larger
// budget, so: hash here, then hand the cheap transactional work (dup check,
// slug, insert, session) to an internalMutation. The old studentSignup
// mutation stays for any cached bundles.
export const signupInsert = internalMutation({
  args: {
    name: v.string(),
    email: v.string(),
    passwordHash: v.string(),
    phone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { name, email } = args;
    const clash = await ctx.db.query("students")
      .withIndex("by_email", q => q.eq("email", email)).first();
    if (clash) return { success: false, error: "An account with this email already exists — sign in instead" };

    let slug = slugify(name);
    for (let i = 0; i < 50; i++) {
      const taken = await ctx.db.query("students")
        .withIndex("by_slug", q => q.eq("slug", slug)).first();
      if (!taken) break;
      slug = `${slugify(name)}-${i + 2}`;
    }

    const now = Date.now();
    const studentId = await ctx.db.insert("students", {
      organizationId: SIGNUP_ORG,
      name, slug, email,
      googleEmail: email,
      phone: args.phone,
      level: "",
      type: "individual",
      status: "active",
      primaryTeacherId: SIGNUP_TEACHER,
      passwordHash: args.passwordHash,
      enrolledAt: now, createdAt: now, updatedAt: now,
    } as any);

    const sessionToken = await createStudentSession(ctx, studentId);
    return {
      success: true, sessionToken,
      student: { _id: studentId, name, slug, email, level: "", organizationId: SIGNUP_ORG },
    };
  },
});

export const studentSignupAction = action({
  args: {
    name: v.string(),
    email: v.string(),
    password: v.string(),
    phone: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<any> => {
    const name = args.name.trim();
    const email = args.email.trim().toLowerCase();
    if (name.length < 2) return { success: false, error: "Please enter your name" };
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { success: false, error: "Please enter a valid email" };
    if (args.password.length < 8) return { success: false, error: "Password must be at least 8 characters" };
    const passwordHash = await hashPassword(args.password);
    return await ctx.runMutation(internal.studentAuth.signupInsert, {
      name, email, passwordHash, phone: args.phone?.trim() || undefined,
    });
  },
});

export const setStudentPassword = mutation({
  args: {
    sessionToken: v.string(),
    studentId: v.id("students"),
    newPassword: v.string(),
  },
  handler: async (ctx, args) => {
    // Verify the acting user has the right to set passwords
    const { user } = await requireAdmin(ctx, args.sessionToken);

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
