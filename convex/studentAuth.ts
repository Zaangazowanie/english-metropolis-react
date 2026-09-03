// Student authentication — PBKDF2 password verification, mirroring admin auth.
// Students log in with their email address (must be set on the student row).
// A superadmin (or teacher with access) can set/reset a student's password via
// setStudentPassword. Students without a passwordHash cannot log in via this
// flow — they fall back to direct /app/<slug> link access.

import { action, query, mutation, internalMutation, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import {
  hashPassword, verifyPassword, createStudentSession, requireAdmin, requireStudent,
  generateToken, sha256Hex,
} from "./authHelpers";
import { signupDobProblem } from "./enrolmentRules";
import { bajlaState } from "./students";

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

// Only adults may open an account (Mike, 2026-08-10). A parent buys for a child
// instead and declares it at checkout — see students.isMinor. These are the
// fallbacks; the signup pages localise off `code`, because the site's default
// language is Polish and an English-only refusal is the wrong place to be terse.
const DOB_MESSAGES: Record<string, string> = {
  DOB_REQUIRED: "Please enter your date of birth",
  DOB_INVALID: "Please enter a valid date of birth",
  DOB_UNDERAGE: "You must be 18 or over to create an account. A parent or guardian can create one and buy lessons for you.",
};

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
    dateOfBirth: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const name = args.name.trim();
    const email = args.email.trim().toLowerCase();
    if (name.length < 2) return { success: false, error: "Please enter your name" };
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { success: false, error: "Please enter a valid email" };
    if (args.password.length < 8) return { success: false, error: "Password must be at least 8 characters" };
    const dobProblem = signupDobProblem(args.dateOfBirth);
    if (dobProblem) return { success: false, code: dobProblem, error: DOB_MESSAGES[dobProblem] };

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
    dateOfBirth: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Re-checked here, not only in the action that called it. This mutation is
    // the last thing between a request and a student row, and the age rule is
    // the sort that must not depend on one caller having remembered it.
    const dobProblem = signupDobProblem(args.dateOfBirth);
    if (dobProblem) return { success: false, code: dobProblem, error: DOB_MESSAGES[dobProblem] };
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
      dateOfBirth: args.dateOfBirth?.trim() || undefined,
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
    dateOfBirth: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<any> => {
    const name = args.name.trim();
    const email = args.email.trim().toLowerCase();
    if (name.length < 2) return { success: false, error: "Please enter your name" };
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { success: false, error: "Please enter a valid email" };
    if (args.password.length < 8) return { success: false, error: "Password must be at least 8 characters" };
    // Checked before the expensive hash, so an underage attempt costs nothing.
    const dobProblem = signupDobProblem(args.dateOfBirth);
    if (dobProblem) return { success: false, code: dobProblem, error: DOB_MESSAGES[dobProblem] };
    const passwordHash = await hashPassword(args.password);
    const result: any = await ctx.runMutation(internal.studentAuth.signupInsert, {
      name, email, passwordHash, phone: args.phone?.trim() || undefined,
      dateOfBirth: args.dateOfBirth?.trim() || undefined,
    });
    // Confirmation goes out the moment the account exists, so for a checkout
    // signup it is already waiting by the time they come back from Przelewy24.
    // Deliberately not awaited into the result: a mail-bridge outage must never
    // fail a signup that is one step away from a payment.
    if (result?.success) {
      await ctx.scheduler.runAfter(0, internal.studentAuth.sendVerificationEmail, { email });
    }
    return result;
  },
});

// Asks the em-report bridge to mint + send. The bridge owns MAGIC_LINK_KEY and
// the mail transport; Convex only knows the address to nudge.
export const sendVerificationEmail = internalAction({
  args: { email: v.string() },
  handler: async (_ctx, args) => {
    const base = process.env.BOOKING_NOTIFY_URL;
    const key = process.env.BOOKING_NOTIFY_KEY;
    if (!base || !key) {
      console.warn("studentAuth:sendVerificationEmail skipped — BOOKING_NOTIFY_URL/KEY unset");
      return;
    }
    const url = base.replace("booking-confirm", "student/verify-request");
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-booking-key": key },
        body: JSON.stringify({ email: args.email }),
      });
      if (!res.ok) console.error("verify-request failed:", res.status);
    } catch (e: any) {
      console.error("verify-request error:", e?.message);
    }
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
// clearStudentPassword — admin-only revert for setStudentPassword.
// Restores a student to their prior state (no passwordHash = direct
// /app/<slug> link access only). Added 2026-08-19 to revert an
// unapproved temp-password set on Ines Smolkowska.
// ─────────────────────────────────────────────────────────────
export const clearStudentPassword = mutation({
  args: {
    sessionToken: v.string(),
    studentId: v.id("students"),
  },
  handler: async (ctx, args) => {
    // Verify the acting user has the right to clear passwords
    const { user } = await requireAdmin(ctx, args.sessionToken);

    const student = await ctx.db.get(args.studentId);
    if (!student) {
      throw new Error("Student not found");
    }

    await ctx.db.patch(args.studentId, {
      passwordHash: undefined,
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

// ═════════════════════════════════════════════════════════════
// E-MAIL CONFIRMATION + PASSWORD RESET (2026-08-10)
//
// Mirrors the teacher magic-link design in teacherAuth.ts: the em-report
// service holds MAGIC_LINK_KEY, mints server-to-server, and e-mails the raw
// token. Only its SHA-256 hash is stored, single-use via usedAt. A browser can
// never mint — it can only redeem.
// ═════════════════════════════════════════════════════════════

const VERIFY_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days — a confirmation may sit unread over a weekend
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;           // 1 hour — a reset link is a live key to the account

// ─────────────────────────────────────────────────────────────
// createStudentToken — SERVER-TO-SERVER ONLY (em-report service).
//
// Returns { found: false } for a bad key, an unknown address, an archived
// student, and — for "reset" — a student who has no password to reset. All of
// those look identical to the caller so the endpoint cannot be used to test
// whether an address has an account here.
// ─────────────────────────────────────────────────────────────
export const createStudentToken = mutation({
  args: { email: v.string(), kind: v.string(), apiKey: v.string() },
  handler: async (ctx, args) => {
    const expected = process.env.MAGIC_LINK_KEY;
    if (!expected || args.apiKey !== expected) return { found: false };
    if (args.kind !== "verify" && args.kind !== "reset") return { found: false };

    const email = args.email.trim().toLowerCase();
    const student =
      (await ctx.db.query("students").withIndex("by_email", (q) => q.eq("email", email)).first()) ??
      (await ctx.db.query("students").withIndex("by_googleEmail", (q) => q.eq("googleEmail", email)).first());

    if (!student || student.status === "archived") return { found: false };
    // Nothing to reset: teacher-created rows have no passwordHash, and sending
    // a "reset your password" link to someone who never had one is a dead end.
    if (args.kind === "reset" && !student.passwordHash) return { found: false };
    // Already confirmed — do not re-send, and do not reveal that either.
    if (args.kind === "verify" && student.emailVerifiedAt) return { found: false };

    const now = Date.now();
    const ttl = args.kind === "reset" ? RESET_TOKEN_TTL_MS : VERIFY_TOKEN_TTL_MS;

    // Supersede any live token of the same kind. Without this, an old link kept
    // working after a new one was requested — so a reset mail forwarded or
    // leaked weeks ago stays usable for its full hour even after the student
    // asks for a fresh one.
    const previous = await ctx.db
      .query("studentTokens")
      .withIndex("by_student_kind", (q) => q.eq("studentId", student._id).eq("kind", args.kind))
      .collect();
    for (const row of previous) {
      if (!row.usedAt && row.expiresAt > now) await ctx.db.patch(row._id, { usedAt: now });
    }

    const token = generateToken();
    await ctx.db.insert("studentTokens", {
      kind: args.kind,
      tokenHash: await sha256Hex(token),
      studentId: student._id,
      email,
      expiresAt: now + ttl,
      createdAt: now,
    });

    return { found: true, token, name: student.name, email };
  },
});

// ─────────────────────────────────────────────────────────────
// verifyEmailToken — public mutation (the /verify landing page).
// Idempotent on the happy path: a student who clicks the same link twice, or
// whose mail client pre-fetches it, sees "confirmed" rather than an error.
// ─────────────────────────────────────────────────────────────
export const verifyEmailToken = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const hash = await sha256Hex(args.token);
    const record = await ctx.db
      .query("studentTokens")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", hash))
      .unique();

    if (!record || record.kind !== "verify") return { ok: false, reason: "invalid" };

    const student = await ctx.db.get(record.studentId);
    if (!student || student.status === "archived") return { ok: false, reason: "invalid" };
    if (student.emailVerifiedAt) return { ok: true, alreadyVerified: true, name: student.name };

    const now = Date.now();
    if (record.expiresAt < now) return { ok: false, reason: "expired" };
    if (record.usedAt) return { ok: false, reason: "expired" };

    await ctx.db.patch(record._id, { usedAt: now });
    await ctx.db.patch(student._id, { emailVerifiedAt: now, updatedAt: now });
    return { ok: true, alreadyVerified: false, name: student.name };
  },
});

// ─────────────────────────────────────────────────────────────
// checkResetToken — public query. Lets the reset page tell an expired link
// apart from a working one BEFORE asking someone to type a new password twice.
// Returns the masked address only, never the account's real details.
// ─────────────────────────────────────────────────────────────
export const checkResetToken = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const hash = await sha256Hex(args.token);
    const record = await ctx.db
      .query("studentTokens")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", hash))
      .unique();
    if (!record || record.kind !== "reset" || record.usedAt || record.expiresAt < Date.now()) {
      return { ok: false };
    }
    const [local, domain] = record.email.split("@");
    const masked = `${local.slice(0, 2)}${"•".repeat(Math.max(1, local.length - 2))}@${domain}`;
    return { ok: true, maskedEmail: masked };
  },
});

// ─────────────────────────────────────────────────────────────
// resetPasswordWithToken — action + internalMutation, for the same reason
// studentSignupAction exists: PBKDF2 at 210k iterations blows the mutation
// execution budget on a cold isolate. Hash in the action, commit in the
// mutation, and re-check the token INSIDE the mutation so the hashing window
// cannot be used to redeem one token twice.
// ─────────────────────────────────────────────────────────────
export const applyPasswordReset = internalMutation({
  args: { token: v.string(), passwordHash: v.string() },
  handler: async (ctx, args) => {
    const hash = await sha256Hex(args.token);
    const record = await ctx.db
      .query("studentTokens")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", hash))
      .unique();

    const now = Date.now();
    if (!record || record.kind !== "reset" || record.usedAt || record.expiresAt < now) {
      return { success: false, error: "This link has expired. Request a new one." };
    }
    const student = await ctx.db.get(record.studentId);
    if (!student || student.status === "archived") {
      return { success: false, error: "This link has expired. Request a new one." };
    }

    await ctx.db.patch(record._id, { usedAt: now });
    await ctx.db.patch(student._id, {
      passwordHash: args.passwordHash,
      // Completing a reset proves control of the mailbox just as well as the
      // confirmation link does, so it satisfies verification too.
      emailVerifiedAt: student.emailVerifiedAt ?? now,
      updatedAt: now,
    });

    // Every other session is now suspect: if someone else knew the old
    // password, a reset must end their access, not run alongside it.
    const sessions = await ctx.db
      .query("authSessions")
      .withIndex("by_student", (q) => q.eq("studentId", student._id))
      .collect();
    for (const session of sessions) await ctx.db.delete(session._id);

    const sessionToken = await createStudentSession(ctx, student._id);
    return {
      success: true,
      sessionToken,
      student: {
        _id: student._id, name: student.name, slug: student.slug,
        email: student.email, level: student.level,
        organizationId: student.organizationId,
      },
    };
  },
});

export const resetPasswordWithToken = action({
  args: { token: v.string(), newPassword: v.string() },
  handler: async (ctx, args): Promise<any> => {
    if (args.newPassword.length < 8) {
      return { success: false, error: "Password must be at least 8 characters" };
    }
    const passwordHash = await hashPassword(args.newPassword);
    return await ctx.runMutation(internal.studentAuth.applyPasswordReset, {
      token: args.token, passwordHash,
    });
  },
});

// ─────────────────────────────────────────────────────────────
// backfillVerifiedAt — one-off internal migration. Every student that existed
// before confirmation was introduced is grandfathered: they were created by a
// teacher or bought a package, and must not be locked out of lessons they
// already paid for by a rule added after the fact.
//   npx convex run studentAuth:backfillVerifiedAt --prod '{}'
// ─────────────────────────────────────────────────────────────
export const backfillVerifiedAt = internalMutation({
  args: { dryRun: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const students = await ctx.db.query("students").collect();
    const pending = students.filter((s) => !s.emailVerifiedAt);
    if (args.dryRun) return { total: students.length, wouldStamp: pending.length };
    const now = Date.now();
    for (const s of pending) await ctx.db.patch(s._id, { emailVerifiedAt: s.createdAt ?? now });
    return { total: students.length, stamped: pending.length };
  },
});

// ─────────────────────────────────────────────────────────────
// resendVerification — the signed-in student asks for another confirmation
// mail (the first one bounced into spam, or the 7 days ran out). Authenticated
// by their own session, so this cannot be pointed at anyone else's address.
// ─────────────────────────────────────────────────────────────
export const verificationTarget = internalMutation({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const { student } = await requireStudent(ctx, args.sessionToken);
    if (student.emailVerifiedAt) return { send: false, alreadyVerified: true };
    const email = student.email || student.googleEmail;
    if (!email) return { send: false, alreadyVerified: false };
    return { send: true, email, alreadyVerified: false };
  },
});

export const resendVerification = action({
  args: { sessionToken: v.string() },
  handler: async (ctx, args): Promise<any> => {
    const target: any = await ctx.runMutation(internal.studentAuth.verificationTarget, {
      sessionToken: args.sessionToken,
    });
    if (!target.send) return { ok: true, alreadyVerified: !!target.alreadyVerified };
    await ctx.runAction(internal.studentAuth.sendVerificationEmail, { email: target.email });
    return { ok: true, alreadyVerified: false };
  },
});

// ─────────────────────────────────────────────────────────────
// myVerification — public query for the signed-in student's own confirmation
// state. The single source both gated surfaces read (the buy page and the
// Bajla popup), so they can never disagree about who is confirmed.
// Returns verified: true for anyone who is not a student (admins, teachers)
// so an admin previewing the app is never gated.
// ─────────────────────────────────────────────────────────────
export const myVerification = query({
  args: { sessionToken: v.optional(v.string()) },
  handler: async (ctx, args) => {
    if (!args.sessionToken) {
      return { known: false, verified: false, email: null, analysisAllowed: false, bajlaAllowed: false, bajlaReason: "signed_out" };
    }
    try {
      const { student } = await requireStudent(ctx, args.sessionToken);
      // Bajla rides on the same paid consent as the lesson analysis, so both
      // facts come back from one query — two round trips could disagree with
      // each other for a moment and flash the wrong state.
      const analysis = student.lessonAnalysis;
      // …except for the roster that predates the paywall, who get her free once
      // they have consented. bajlaState owns that rule; the popup must not
      // re-derive it from analysisAllowed or the grandfathered students go dark.
      const bajla = bajlaState(student);
      return {
        known: true,
        verified: !!student.emailVerifiedAt,
        email: student.email || student.googleEmail || null,
        analysisAllowed: !student.isMinor && !!analysis && !analysis.revokedAt,
        bajlaAllowed: bajla.allowed,
        // "needs_consent" (free, one tap away) vs "needs_purchase" (buy the
        // add-on) is the difference between the two panels the popup shows.
        bajlaReason: bajla.reason,
      };
    } catch {
      // Not a student session (admin/teacher) or an expired one. Neither is a
      // student who needs confirming, and a dead session is the login page's
      // problem, not this gate's.
      // Not a student (admin/teacher) or an expired session. Neither is gated:
              // a teacher must never be locked out of Bajla by a student rule.
              return { known: false, verified: true, email: null, analysisAllowed: true, bajlaAllowed: true, bajlaReason: "not_a_student" };
    }
  },
});

// ─────────────────────────────────────────────────────────────
// resolveStudentSession — the ONE query a trusted server-side surface (Bajla's
// web backend on :8800) uses to turn a student's own session token into a
// verified identity.
//
// It exists because the Bajla widget had NO authentication whatsoever: a slug
// string in the POST body was the entire identity claim, so naming someone
// loaded their full learner profile. Before that surface can BOOK a lesson —
// which spends money the student paid — it has to know who is actually asking.
//
// Deliberately NOT myVerification: that query answers "is my email confirmed"
// for the caller's own session and returns { verified: true } for a non-student
// session, so it cannot distinguish a real student from an admin or an expired
// token. This one returns null for anything that is not a live student session,
// which is the only answer a caller can safely act on.
//
// Returns only what a booking flow needs. No passwordHash, no dateOfBirth.
// ─────────────────────────────────────────────────────────────
export const resolveStudentSession = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    let student;
    try {
      ({ student } = await requireStudent(ctx, args.sessionToken));
    } catch {
      return null;                       // expired, admin, or forged — all "no"
    }
    return {
      _id: student._id,
      slug: student.slug,
      name: student.name,
      level: student.level ?? null,
      organizationId: student.organizationId ?? null,
      primaryTeacherId: student.primaryTeacherId ?? null,
      emailVerified: !!student.emailVerifiedAt,
      status: student.status,
    };
  },
});
