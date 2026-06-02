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
import { action, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { Doc } from "./_generated/dataModel";

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

// ─── Public action — exchange Google ID token for our session ─
type GoogleSignInResult =
  | {
      success: true;
      kind: "student";
      student: {
        _id: string;
        name: string;
        slug: string;
        email: string | undefined;
        level: string | undefined;
        organizationId: string | undefined;
      };
    }
  | { success: true; kind: "superadmin"; email: string }
  | { success: true; kind: "conversa_admin"; email: string }
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
    if (student) {
      if (
        student.status === "archived" ||
        student.status === "graduated"
      ) {
        return { success: false, error: "Account inactive" };
      }
      return {
        success: true,
        kind: "student",
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
      return { success: true, kind: "superadmin", email };
    }

    // 3) Conversa admin?
    if (CONVERSA_ADMIN_EMAILS.has(email)) {
      return { success: true, kind: "conversa_admin", email };
    }

    return { success: false, error: "Email not authorized" };
  },
});
