// Complimentary analysis follows the SAME oldest-first package allocation as
// lesson billing. Consent is separate from payment and never implies a charge.
import { allocateBalances, billableUnitsForStudent } from "./billing";

export function accountAnalysisState(student: any): { allowed: boolean; reason: string } {
  if (!student) return { allowed: false, reason: "no_student" };
  if (student.isMinor) return { allowed: false, reason: "minor" };
  const consent = student.lessonAnalysis;
  if (!consent || consent.revokedAt) {
    return { allowed: false, reason: consent ? "revoked" : "no_consent" };
  }
  return { allowed: true, reason: "ok" };
}

export async function packageGrantsFor(ctx: any, studentId: any) {
  return ctx.db.query("analysisPackageGrants")
    .withIndex("by_student", (q: any) => q.eq("studentId", studentId)).collect();
}

export async function complimentaryPackageOverview(ctx: any, student: any) {
  if (!student || student.isMinor) return [];
  const grants = await packageGrantsFor(ctx, student._id);
  const packages = (await ctx.db.query("lessonPackages")
    .withIndex("by_student", (q: any) => q.eq("studentId", student._id)).collect())
    .filter((p: any) => p.status !== "cancelled");
  const balances = allocateBalances(packages, await billableUnitsForStudent(ctx, student._id));
  return grants.flatMap((grant: any) => {
    const pkg = balances.find((p: any) => p._id === grant.packageId);
    if (grant.revokedAt || !pkg || pkg.studentId !== student._id) return [];
    return [{ packageId: pkg._id, name: pkg.name, totalLessons: grant.lessonLimit,
      remainingLessons: Math.min(pkg.remainingLessons, grant.lessonLimit),
      grantedAt: grant.grantedAt, expiresAt: pkg.expiresAt ?? null }];
  });
}

export async function lessonAnalysisAccess(ctx: any, student: any, lessonId?: any) {
  const account = accountAnalysisState(student);
  if (!student || student.isMinor) return account;
  // Supplying another learner's lesson must never inherit this account's access.
  const lesson = lessonId ? await ctx.db.get(lessonId) : null;
  if (lessonId && (!lesson || lesson.studentId !== student._id)) {
    return { allowed: false, reason: "lesson_mismatch" };
  }
  if (account.allowed) return account;
  if (lessonId) {
    const entitlement = await ctx.db.query("analysisEntitlements")
      .withIndex("by_student_lesson", (q: any) =>
        q.eq("studentId", student._id).eq("lessonId", lessonId)).unique();
    if (entitlement && !entitlement.revokedAt) {
      return { allowed: true, reason: "lesson_entitlement" };
    }
  }
  const grants = (await packageGrantsFor(ctx, student._id))
    .filter((g: any) => !g.revokedAt);
  if (!grants.length) return account;
  if (!lesson) return { allowed: false, reason: "lesson_required" };
  if (["planned", "cancelled", "no_show", "cancelled_late"].includes(lesson.status)) {
    return { allowed: false, reason: "lesson_not_taught" };
  }
  const bookings = (await ctx.db.query("lessonBookings")
    .withIndex("by_student", (q: any) => q.eq("studentId", student._id)).collect())
    .filter((b: any) => b.dateWarsaw === lesson.date &&
      ["scheduled", "completed", "cancelled_late", "no_show"].includes(b.status));
  if (bookings.length > 1) return { allowed: false, reason: "ambiguous_booking" };
  if (bookings.some((b: any) => ["cancelled_late", "no_show"].includes(b.status))) {
    return { allowed: false, reason: "lesson_not_taught" };
  }
  const timestamp = bookings[0]?.startUtc ?? Date.parse(lesson.date + "T12:00:00Z");
  if (!Number.isFinite(timestamp) || timestamp > Date.now()) {
    return { allowed: false, reason: "lesson_not_taught" };
  }
  const packages = (await ctx.db.query("lessonPackages")
    .withIndex("by_student", (q: any) => q.eq("studentId", student._id)).collect())
    .filter((p: any) => p.status !== "cancelled");
  const units = await billableUnitsForStudent(ctx, student._id);
  if (units.filter((t: number) => t === timestamp).length !== 1) {
    return { allowed: false, reason: "ambiguous_allocation" };
  }
  // Ask billing which package the addition of THIS unit consumes. This avoids
  // inventing a second allocation rule or granting the student's next package.
  const before = allocateBalances(packages, units.filter((t: number) => t < timestamp));
  const after = allocateBalances(packages, units.filter((t: number) => t <= timestamp));
  const target = after.find((p: any) => p.usedLessons >
    (before.find((b: any) => b._id === p._id)?.usedLessons ?? 0));
  const grant = target && grants.find((g: any) => g.packageId === target._id);
  if (!grant || target.usedLessons > grant.lessonLimit ||
      (target.expiresAt && timestamp > target.expiresAt)) {
    return { allowed: false, reason: "outside_complimentary_package" };
  }
  return { allowed: true, reason: "complimentary_package", packageId: target._id };
}
