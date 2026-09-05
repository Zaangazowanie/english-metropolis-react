import { mutation } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { generateToken, requireSuperadmin, sha256Hex } from "./authHelpers";

const STUDENT_VIEW_TTL_MS = 15 * 60 * 1000;

// A real student-kind session makes the existing student guards enforce the
// student's own permissions. userId records the superadmin who opened the view;
// it never turns this token into an admin session. No student credentials change.
export const start = mutation({
  args: { sessionToken: v.string(), studentId: v.id("students") },
  handler: async (ctx, args) => {
    const { user, session: adminSession } = await requireSuperadmin(ctx, args.sessionToken);
    const student = await ctx.db.get(args.studentId);
    if (!student || student.status !== "active") {
      throw new ConvexError("This student account is not active.");
    }

    const now = Date.now();
    const expiresAt = Math.min(now + STUDENT_VIEW_TTL_MS, adminSession.expiresAt);
    const sessionToken = generateToken();
    const viewSessionId = await ctx.db.insert("authSessions", {
      kind: "student",
      userId: user._id,
      studentId: student._id,
      tokenHash: await sha256Hex(sessionToken),
      createdAt: now,
      expiresAt,
    });
    await ctx.db.insert("auditLog", {
      organizationId: student.organizationId,
      userId: user._id,
      action: "student_view_started",
      targetType: "student",
      targetId: String(student._id),
      details: JSON.stringify({ viewSessionId, studentSlug: student.slug, expiresAt }),
      timestamp: now,
    });

    return {
      success: true,
      sessionToken,
      expiresAt,
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

export const end = mutation({
  args: { sessionToken: v.string(), studentSessionToken: v.string() },
  handler: async (ctx, args) => {
    const { user } = await requireSuperadmin(ctx, args.sessionToken);
    const tokenHash = await sha256Hex(args.studentSessionToken);
    const viewSession = await ctx.db.query("authSessions")
      .withIndex("by_tokenHash", q => q.eq("tokenHash", tokenHash))
      .unique();
    // A repeated close is harmless. Unlike student authentication, this lookup
    // also finds expired sessions so their owner can still remove them.
    if (!viewSession) return { success: true, ended: false };
    if (viewSession.kind !== "student" || !viewSession.studentId || viewSession.userId !== user._id) {
      throw new ConvexError("You can only close a student view you opened.");
    }
    const student = await ctx.db.get(viewSession.studentId);
    await ctx.db.delete(viewSession._id);
    await ctx.db.insert("auditLog", {
      organizationId: student?.organizationId,
      userId: user._id,
      action: "student_view_ended",
      targetType: "student",
      targetId: String(viewSession.studentId),
      details: JSON.stringify({ viewSessionId: viewSession._id, expiresAt: viewSession.expiresAt }),
      timestamp: Date.now(),
    });
    return { success: true, ended: true };
  },
});
