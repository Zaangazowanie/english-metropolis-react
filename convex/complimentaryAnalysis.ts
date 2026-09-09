import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireSuperadmin } from "./authHelpers";
import { complimentaryPackageOverview, packageGrantsFor } from "./analysisAccess";

// Records the owner's attestation of EXISTING consent. This does not invent a
// payment, impersonate a student's checkout, or grant account-wide analysis.
export const grantPackage = mutation({
  args: {
    sessionToken: v.string(), studentId: v.id("students"),
    packageId: v.id("lessonPackages"), consentAttestation: v.string(),
    reason: v.string(), dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { user } = await requireSuperadmin(ctx, args.sessionToken);
    const student = await ctx.db.get(args.studentId);
    const pkg = await ctx.db.get(args.packageId);
    if (!student || !pkg || pkg.studentId !== student._id ||
        pkg.organizationId !== student.organizationId) throw new Error("Package/student mismatch");
    if (student.isMinor) throw new Error("A minor's account cannot receive analysis");
    if (pkg.status !== "active" || (pkg.expiresAt && pkg.expiresAt < Date.now())) {
      throw new Error("Package is not active");
    }
    if (!Number.isInteger(pkg.totalLessons) || pkg.totalLessons < 1) throw new Error("Invalid lesson limit");
    const consentAttestation = args.consentAttestation.trim();
    const reason = args.reason.trim();
    if (consentAttestation.length < 20 || reason.length < 10) throw new Error("Consent attestation and gift reason required");
    const grants = await packageGrantsFor(ctx, student._id);
    const entitlements = await ctx.db.query("analysisEntitlements")
      .withIndex("by_student", q => q.eq("studentId", student._id)).collect();
    if (student.lessonAnalysis?.revokedAt || grants.some((g: any) => g.revokedAt) ||
        entitlements.some(e => e.revokedAt)) throw new Error("Consent was revoked; a gift cannot restore it");
    const existing = grants.find((g: any) => g.packageId === pkg._id);
    if (existing) return { ok: true, reason: "already_granted", grantId: existing._id, totalLessons: existing.lessonLimit };
    if (student.lessonAnalysis) return { ok: true, reason: "account_already_covered" };
    if (args.dryRun) return { ok: true, dryRun: true, studentId: student._id,
      packageId: pkg._id, totalLessons: pkg.totalLessons, chargePLN: 0 };
    const now = Date.now();
    const grantId = await ctx.db.insert("analysisPackageGrants", {
      studentId: student._id, organizationId: student.organizationId,
      packageId: pkg._id, lessonLimit: pkg.totalLessons, grantedAt: now,
      grantedBy: user._id, consentAttestation, reason,
      noticeVersion: "owner-attested-complimentary-package-v1",
    });
    await ctx.db.insert("auditLog", { organizationId: student.organizationId, userId: user._id,
      action: "analysis.complimentary_package_granted", targetType: "student", targetId: student._id,
      details: JSON.stringify({ grantId, packageId: pkg._id, totalLessons: pkg.totalLessons,
        chargePLN: 0, consentAttestation, reason }), timestamp: now });
    return { ok: true, reason: "granted", grantId, totalLessons: pkg.totalLessons, chargePLN: 0 };
  },
});

export const getPackageGrants = query({
  args: { sessionToken: v.string(), studentId: v.id("students") },
  handler: async (ctx, args) => {
    await requireSuperadmin(ctx, args.sessionToken);
    const student = await ctx.db.get(args.studentId);
    return { grants: await packageGrantsFor(ctx, args.studentId),
      coverage: await complimentaryPackageOverview(ctx, student) };
  },
});
