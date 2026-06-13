// Password hashing utilities — PBKDF2 via Web Crypto API so they
// run in the default Convex V8 runtime without a Node action hop.
//
// Format: "pbkdf2$<iterations>$<saltB64>$<hashB64>"
// Legacy plaintext passwords (staging seed accounts) still work via
// the isLegacyPlaintext() fallback — we never store a new one.

const ITERATIONS = 210000; // OWASP 2023 recommendation for PBKDF2-SHA256
const KEY_LENGTH_BYTES = 32;

function b64encode(bytes: Uint8Array): string {
  let s = "";
  for (const byte of bytes) s += String.fromCharCode(byte);
  return btoa(s);
}

function b64decode(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pbkdf2(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    keyMaterial,
    KEY_LENGTH_BYTES * 8,
  );
  return new Uint8Array(bits) as Uint8Array<ArrayBuffer>;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(16))) as Uint8Array<ArrayBuffer>;
  const hash = await pbkdf2(password, salt, ITERATIONS);
  return `pbkdf2$${ITERATIONS}$${b64encode(salt)}$${b64encode(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  // Legacy plaintext fallback for seed accounts from earlier sessions.
  if (!stored.startsWith("pbkdf2$")) {
    return stored === password;
  }
  const parts = stored.split("$");
  if (parts.length !== 4) return false;
  const iterations = Number(parts[1]);
  const salt = b64decode(parts[2]);
  const expected = b64decode(parts[3]);
  const actual = await pbkdf2(password, salt, iterations);
  if (actual.length !== expected.length) return false;
  // Constant-time comparison
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
  return diff === 0;
}

export function isSuperadmin(role: string | undefined | null): boolean {
  return role === "super_admin";
}

// ─────────────────────────────────────────────────────────────
// Session tokens (Phase A1 security hardening, 2026-06-02)
//
// Raw tokens are 32 random bytes (hex). We store only the SHA-256
// hash in `authSessions`; every protected function calls one of the
// require* guards below with the caller-supplied raw token.
// ─────────────────────────────────────────────────────────────

const ADMIN_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;    // 7 days
const STUDENT_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export function generateToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
}

// Insert a session row and return the raw token (call from a mutation/action ctx).
export async function createAdminSession(ctx: any, userId: any): Promise<string> {
  const token = generateToken();
  const now = Date.now();
  await ctx.db.insert("authSessions", {
    kind: "admin",
    userId,
    tokenHash: await sha256Hex(token),
    createdAt: now,
    expiresAt: now + ADMIN_SESSION_TTL_MS,
  });
  return token;
}

export async function createStudentSession(ctx: any, studentId: any): Promise<string> {
  const token = generateToken();
  const now = Date.now();
  await ctx.db.insert("authSessions", {
    kind: "student",
    studentId,
    tokenHash: await sha256Hex(token),
    createdAt: now,
    expiresAt: now + STUDENT_SESSION_TTL_MS,
  });
  return token;
}

async function lookupSession(ctx: any, sessionToken: string | undefined | null) {
  if (!sessionToken) return null;
  const hash = await sha256Hex(sessionToken);
  const session = await ctx.db
    .query("authSessions")
    .withIndex("by_tokenHash", (q: any) => q.eq("tokenHash", hash))
    .unique();
  if (!session) return null;
  if (session.expiresAt < Date.now()) return null;
  return session;
}

// Admin guard: valid session belonging to an active admin/org_admin/super_admin
// user. Returns { user, session }. Throws on failure.
export async function requireAdmin(ctx: any, sessionToken: string | undefined | null) {
  const session = await lookupSession(ctx, sessionToken);
  if (!session || session.kind !== "admin" || !session.userId) {
    throw new Error("Unauthorized: invalid or expired session");
  }
  const user = await ctx.db.get(session.userId);
  if (
    !user ||
    user.status !== "active" ||
    !["admin", "org_admin", "super_admin", "teacher"].includes(user.role)
  ) {
    throw new Error("Unauthorized: invalid or expired session");
  }
  return { user, session };
}

// Teacher guard: valid admin-kind session belonging to an active teacher user
// (not soft-deleted). Returns { user, session }. Throws on failure. Used by the
// teacher portal, which is restricted to role === "teacher" only.
export async function requireTeacher(ctx: any, sessionToken: string | undefined | null) {
  const session = await lookupSession(ctx, sessionToken);
  if (!session || session.kind !== "admin" || !session.userId) {
    throw new Error("Unauthorized: invalid or expired session");
  }
  const user = await ctx.db.get(session.userId);
  if (
    !user ||
    user.status !== "active" ||
    user.role !== "teacher" ||
    user.deletedAt
  ) {
    throw new Error("Unauthorized: invalid or expired session");
  }
  return { user, session };
}

// Superadmin-only guard.
export async function requireSuperadmin(ctx: any, sessionToken: string | undefined | null) {
  const { user, session } = await requireAdmin(ctx, sessionToken);
  if (!isSuperadmin(user.role)) {
    throw new Error("Unauthorized: superadmin only");
  }
  return { user, session };
}

// Student guard: valid session belonging to an active student.
// Returns { student, session }. Throws on failure.
export async function requireStudent(ctx: any, sessionToken: string | undefined | null) {
  const session = await lookupSession(ctx, sessionToken);
  if (!session || session.kind !== "student" || !session.studentId) {
    throw new Error("Unauthorized: invalid or expired session");
  }
  const student = await ctx.db.get(session.studentId);
  if (!student || student.status === "archived") {
    throw new Error("Unauthorized: invalid or expired session");
  }
  return { student, session };
}

// Admin-or-student guard (e.g. lesson booking is allowed for both). Returns
// { user } for admins or { student } for students.
export async function requireAdminOrStudent(ctx: any, sessionToken: string | undefined | null) {
  const session = await lookupSession(ctx, sessionToken);
  if (!session) throw new Error("Unauthorized: invalid or expired session");
  if (session.kind === "admin" && session.userId) {
    const user = await ctx.db.get(session.userId);
    if (
      user &&
      user.status === "active" &&
      ["admin", "org_admin", "super_admin", "teacher"].includes(user.role)
    ) {
      return { kind: "admin" as const, user, student: null, session };
    }
  }
  if (session.kind === "student" && session.studentId) {
    const student = await ctx.db.get(session.studentId);
    if (student && student.status !== "archived") {
      return { kind: "student" as const, user: null, student, session };
    }
  }
  throw new Error("Unauthorized: invalid or expired session");
}

// Pipeline guard: trusted server-side scripts (em-enrichment, post-lesson
// publish) authenticate with a shared key held in the Convex env var
// PIPELINE_API_KEY. Accepts EITHER a valid admin session token OR the key.
export async function requireAdminOrPipelineKey(
  ctx: any,
  sessionToken: string | undefined | null,
  apiKey: string | undefined | null,
) {
  const expected = process.env.PIPELINE_API_KEY;
  if (apiKey && expected && apiKey === expected) {
    return { kind: "pipeline" as const, user: null };
  }
  const { user } = await requireAdmin(ctx, sessionToken);
  return { kind: "admin" as const, user };
}

// Delete a session (logout).
export async function destroySession(ctx: any, sessionToken: string | undefined | null) {
  const session = await lookupSession(ctx, sessionToken);
  if (session) await ctx.db.delete(session._id);
}
