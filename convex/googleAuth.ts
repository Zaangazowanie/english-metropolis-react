// Google Sign-In — additive auth path alongside the existing
// studentAuth:studentLogin email+password flow.
//
// Flow:
//   1. Frontend collects an ID token via Google Identity Services
//      (https://accounts.google.com/gsi/client) and POSTs it to this
//      action.
//   2. We verify the token by hitting Google's tokeninfo endpoint,
//      which checks signature + expiry + audience server-side.
//   3. We require email_verified === "true" (Google returns string).
//   4. We look up the email in three allowlists in this order:
//        a) students.email (existing student row → log in as student)
//        b) SUPERADMIN_EMAILS (return kind="superadmin")
//        c) CONVERSA_ADMIN_EMAILS (return kind="conversa_admin")
//      Otherwise we return { success:false, error:"Email not authorized" }.
//
// The student shape mirrors studentAuth:studentLogin so the frontend
// doesn't have to branch on shape.
//
// GOOGLE_CLIENT_ID env var must be set on the Convex deployment via
//   npx convex env set GOOGLE_CLIENT_ID <client-id> --prod
// (matches the JS-origins whitelist in Google Cloud Console).

import { v } from "convex/values";
import { action, internalQuery, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { Doc } from "./_generated/dataModel";
import { createStudentSession, createAdminSession } from "./authHelpers";

// ─── Allowlists ──────────────────────────────────────────────
const SUPERADMIN_EMAILS = new Set<string>([
  "mmponcana@gmail.com",
  "lekkercrew.agency@gmail.com",
  "carpeomnia.agency@gmail.com",
]);

const CONVERSA_ADMIN_EMAILS = new Set<string>([
  "aleksandra.trejda@conversa.edu.pl",
  "info@conversa.edu.pl",
]);

// ─── Internal query — student lookup by email ─────────────────
// Action can't read the DB directly, so we hop through this query.
// Looks up googleEmail (dedicated Google sign-in field) first, then falls
// back to canonical `email` for students whose only address IS their Gmail.
export const findStudentByEmail = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const byGoogle = await ctx.db
      .query("students")
      .withIndex("by_googleEmail", (q) => q.eq("googleEmail", args.email))
      .first();
    if (byGoogle) return byGoogle;
    const byEmail = await ctx.db
      .query("students")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();
    return byEmail ?? null;
  },
});

// ─── Internal mutations — session creation (actions can't touch db) ───
export const createSessionForStudent = internalMutation({
  args: { studentId: v.id("students") },
  handler: async (ctx, args) => {
    return await createStudentSession(ctx, args.studentId);
  },
});

export const createSessionForAdminEmail = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, args): Promise<string | null> => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .unique();
    if (
      !user ||
      user.status !== "active" ||
      !["admin", "org_admin", "super_admin"].includes(user.role)
    ) {
      return null;
    }
    return await createAdminSession(ctx, user._id);
  },
});

// ─── Public action — exchange Google ID token for our session ─
type GoogleSignInResult =
  | {
      success: true;
      kind: "student";
      sessionToken: string;
      student: {
        _id: string;
        name: string;
        slug: string;
        email: string | undefined;
        level: string | undefined;
        organizationId: string | undefined;
      };
    }
  | { success: true; kind: "superadmin"; email: string; sessionToken: string | undefined }
  | { success: true; kind: "conversa_admin"; email: string; sessionToken: string | undefined }
  | { success: false; error: string };

export const googleSignIn = action({
  args: { idToken: v.string() },
  handler: async (ctx, args): Promise<GoogleSignInResult> => {
    const expectedAud = process.env.GOOGLE_CLIENT_ID;
    if (!expectedAud) {
      return {
        success: false,
        error: "Server misconfigured: GOOGLE_CLIENT_ID not set",
      };
    }

    // Verify the ID token against Google's tokeninfo endpoint. This
    // validates signature, expiry, and issuer for us — we just need
    // to check `aud` and `email_verified` ourselves.
    let info: Record<string, string>;
    try {
      const url = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(
        args.idToken,
      )}`;
      const res = await fetch(url);
      if (!res.ok) {
        return { success: false, error: "Invalid Google ID token" };
      }
      info = await res.json();
    } catch (e) {
      return { success: false, error: "Token verification failed" };
    }

    if (info.aud !== expectedAud) {
      return { success: false, error: "Token audience mismatch" };
    }
    // Google returns email_verified as the string "true" / "false".
    if (info.email_verified !== "true") {
      return { success: false, error: "Email not verified by Google" };
    }
    const email = (info.email || "").trim().toLowerCase();
    if (!email) {
      return { success: false, error: "No email in token" };
    }

    // 1) Student row?
    const student: Doc<"students"> | null = await ctx.runQuery(
      internal.googleAuth.findStudentByEmail,
      { email },
    );
    // An archived/graduated student row must NOT block the admin allowlists
    // below (test/admin emails can own a retired student record) — remember
    // the inactive hit and only fail with it if nothing else matches.
    const studentInactive = !!student &&
      (student.status === "archived" || student.status === "graduated");
    if (student && !studentInactive) {
      const sessionToken: string = await ctx.runMutation(
        internal.googleAuth.createSessionForStudent,
        { studentId: student._id },
      );
      return {
        success: true,
        kind: "student",
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
    }

    // 2) Superadmin?
    if (SUPERADMIN_EMAILS.has(email)) {
      const token: string | null = await ctx.runMutation(
        internal.googleAuth.createSessionForAdminEmail,
        { email },
      );
      return { success: true, kind: "superadmin", email, sessionToken: token ?? undefined };
    }

    // 3) Conversa admin?
    if (CONVERSA_ADMIN_EMAILS.has(email)) {
      const token: string | null = await ctx.runMutation(
        internal.googleAuth.createSessionForAdminEmail,
        { email },
      );
      return { success: true, kind: "conversa_admin", email, sessionToken: token ?? undefined };
    }

    if (studentInactive) {
      return { success: false, error: "Account inactive" };
    }

    // 4) Brand-new student → self-service signup by Google (2026-07-10).
    const created: any = await ctx.runMutation(
      internal.googleAuth.createStudentFromGoogle,
      { email, name: (info.name || email.split("@")[0]).trim() },
    );
    return {
      success: true, kind: "student", sessionToken: created.sessionToken,
      student: created.student,
    };
  },
});

// Create a student account from a verified Google identity (signup path).
export const createStudentFromGoogle = internalMutation({
  args: { email: v.string(), name: v.string() },
  handler: async (ctx, args) => {
    const SIGNUP_ORG = "js779cs2vjwb2c9yjc3a7t619n84zcp8" as any;
    const SIGNUP_TEACHER = "kd72y2mt9t78nkyes15rh7dhc5881pbv" as any;
    const slugBase = args.name.toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ł/g, "l")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "student";
    let slug = slugBase;
    for (let i = 0; i < 50; i++) {
      const taken = await ctx.db.query("students")
        .withIndex("by_slug", q => q.eq("slug", slug)).first();
      if (!taken) break;
      slug = `${slugBase}-${i + 2}`;
    }
    const now = Date.now();
    const studentId = await ctx.db.insert("students", {
      organizationId: SIGNUP_ORG,
      name: args.name, slug, email: args.email,
      googleEmail: args.email,
      level: "", type: "individual", status: "active",
      primaryTeacherId: SIGNUP_TEACHER,
      enrolledAt: now, createdAt: now, updatedAt: now,
    } as any);
    const sessionToken = await createStudentSession(ctx, studentId);
    return { sessionToken,
      student: { _id: studentId, name: args.name, slug, email: args.email, level: "", organizationId: SIGNUP_ORG } };
  },
});
