// Billing — Phase A3 client/billing layer (2026-06-03).
//
// Three concerns:
//   1. Organization billing contact (for the consolidated monthly statement —
//      the statement numbers themselves come from scheduling.getMonthlyLessonStats).
//   2. Prepaid lesson packages: balance is COMPUTED on read, never stored —
//      billable units (completed lessons + late cancellations) after a package's
//      purchasedAt are allocated to that student's active packages oldest-first.
//   3. CEFR certificates with public verification by verificationId.

import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAdmin, isSuperadmin } from "./authHelpers";

const LOW_BALANCE_THRESHOLD = 2;

// Resolve the org the acting admin may operate on (same pattern as scheduling.ts).
async function resolveOrg(ctx: any, sessionToken: string, organizationId: any) {
  const { user } = await requireAdmin(ctx, sessionToken);
  const orgId = isSuperadmin(user.role)
    ? (organizationId ?? user.organizationId)
    : user.organizationId;
  if (!orgId) throw new Error("No organization in scope");
  return { user, organizationId: orgId };
}

// Billable units for one student, sorted oldest-first:
// completed lessons (taught record) + late-cancelled bookings.
export async function billableUnitsForStudent(ctx: any, studentId: any): Promise<number[]> {
  const units: number[] = [];
  const lessons = await ctx.db
    .query("lessons")
    .withIndex("by_student", (q: any) => q.eq("studentId", studentId))
    .collect();
  // Scheduled bookings consume allocation IMMEDIATELY (Mike, 2026-07-09):
  // a booked slot is a committed lesson. Completed + late-cancelled count too.
  // Taught `lessons` rows only count when no booking covers the same date
  // (avoids double-charging once a booking is taught and a lesson row lands).
  const bookings = await ctx.db
    .query("lessonBookings")
    .withIndex("by_student", (q: any) => q.eq("studentId", studentId))
    .collect();
  const bookedDates = new Set<string>();
  for (const b of bookings) {
    if (b.status === "scheduled" || b.status === "completed" || b.status === "cancelled_late") {
      units.push(b.startUtc);
      bookedDates.add(b.dateWarsaw);
    }
  }
  for (const lesson of lessons) {
    if (lesson.status === "cancelled" || lesson.status === "planned") continue;
    if (!lesson.date) continue;
    if (bookedDates.has(lesson.date)) continue;
    units.push(new Date(lesson.date + "T12:00:00Z").getTime());
  }
  return units.sort((a, b) => a - b);
}

// Allocate a student's billable units across their packages and return each
// package with { used, remaining, lowBalance, depleted }. Each unit (lesson /
// late cancellation, chronological order) consumes from the OLDEST package
// that was already purchased when the unit happened and still has capacity.
// Units that no package covers are simply unallocated (billed per-lesson).
export function allocateBalances(packages: any[], unitTimestamps: number[]) {
  const sorted = [...packages].sort((a, b) => a.purchasedAt - b.purchasedAt);
  const used = new Map<string, number>(sorted.map(p => [String(p._id), 0]));
  for (const t of unitTimestamps) {
    const target = sorted.find(
      p => p.purchasedAt <= t && used.get(String(p._id))! < p.totalLessons,
    );
    if (target) used.set(String(target._id), used.get(String(target._id))! + 1);
  }
  return sorted.map(pkg => {
    const u = used.get(String(pkg._id))!;
    const remaining = pkg.totalLessons - u;
    return {
      ...pkg,
      usedLessons: u,
      remainingLessons: remaining,
      depleted: remaining === 0,
      lowBalance: remaining > 0 && remaining <= LOW_BALANCE_THRESHOLD,
    };
  });
}

// ─── Organization / billing contact ────────────────────────────────────────

export const getOrganizationBilling = query({
  args: { sessionToken: v.string(), organizationId: v.optional(v.id("organizations")) },
  handler: async (ctx, args) => {
    const { organizationId } = await resolveOrg(ctx, args.sessionToken, args.organizationId);
    const org: any = await ctx.db.get(organizationId);
    if (!org) throw new Error("Organization not found");
    return {
      _id: org._id,
      name: org.name,
      slug: org.slug,
      type: org.type,
      status: org.status,
      address: org.address,
      city: org.city,
      country: org.country,
      billingContact: org.billingContact ?? null,
    };
  },
});

export const updateBillingContact = mutation({
  args: {
    sessionToken: v.string(),
    organizationId: v.optional(v.id("organizations")),
    billingContact: v.object({
      name: v.optional(v.string()),
      email: v.optional(v.string()),
      phone: v.optional(v.string()),
      address: v.optional(v.string()),
      taxId: v.optional(v.string()),
      notes: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    const { user, organizationId } = await resolveOrg(ctx, args.sessionToken, args.organizationId);
    const now = Date.now();
    await ctx.db.patch(organizationId, { billingContact: args.billingContact, updatedAt: now });
    await ctx.db.insert("auditLog", {
      organizationId,
      userId: user._id,
      action: "organization.billingContact.updated",
      targetType: "organization",
      targetId: String(organizationId),
      details: JSON.stringify(args.billingContact),
      timestamp: now,
    });
    return { ok: true };
  },
});

// ─── Prepaid lesson packages ────────────────────────────────────────────────

export const listPackages = query({
  args: { sessionToken: v.string(), organizationId: v.optional(v.id("organizations")) },
  handler: async (ctx, args) => {
    const { organizationId } = await resolveOrg(ctx, args.sessionToken, args.organizationId);
    const packages = await ctx.db
      .query("lessonPackages")
      .withIndex("by_organization", (q: any) => q.eq("organizationId", organizationId))
      .collect();

    // Group by student, compute balances per student
    const byStudent: Record<string, any[]> = {};
    for (const pkg of packages) {
      if (pkg.status === "cancelled") continue;
      const key = String(pkg.studentId);
      (byStudent[key] ??= []).push(pkg);
    }

    const out: any[] = [];
    for (const [studentKey, pkgs] of Object.entries(byStudent)) {
      const student: any = await ctx.db.get(pkgs[0].studentId);
      const units = await billableUnitsForStudent(ctx, pkgs[0].studentId);
      const withBalances = allocateBalances(pkgs, units);
      for (const pkg of withBalances) {
        out.push({ ...pkg, studentName: student?.name ?? "Unknown", studentSlug: student?.slug ?? null });
      }
    }
    // Cancelled packages still listed (greyed out in UI), without balance math
    for (const pkg of packages) {
      if (pkg.status !== "cancelled") continue;
      const student: any = await ctx.db.get(pkg.studentId);
      out.push({
        ...pkg,
        usedLessons: null, remainingLessons: null, depleted: false, lowBalance: false,
        studentName: student?.name ?? "Unknown", studentSlug: student?.slug ?? null,
      });
    }
    return out.sort((a, b) => b.purchasedAt - a.purchasedAt);
  },
});

export const createPackage = mutation({
  args: {
    sessionToken: v.string(),
    organizationId: v.optional(v.id("organizations")),
    studentId: v.id("students"),
    name: v.string(),
    totalLessons: v.number(),
    expiresAt: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user, organizationId } = await resolveOrg(ctx, args.sessionToken, args.organizationId);
    if (args.totalLessons <= 0 || !Number.isFinite(args.totalLessons)) {
      throw new Error("totalLessons must be a positive number");
    }
    const student = await ctx.db.get(args.studentId);
    if (!student || String(student.organizationId) !== String(organizationId)) {
      throw new Error("Student not found in this organization");
    }
    const now = Date.now();
    const packageId = await ctx.db.insert("lessonPackages", {
      organizationId,
      studentId: args.studentId,
      name: args.name.trim(),
      totalLessons: Math.floor(args.totalLessons),
      purchasedAt: now,
      expiresAt: args.expiresAt,
      notes: args.notes,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("auditLog", {
      organizationId,
      userId: user._id,
      action: "package.created",
      targetType: "lessonPackage",
      targetId: String(packageId),
      details: JSON.stringify({ studentId: args.studentId, name: args.name, totalLessons: args.totalLessons }),
      timestamp: now,
    });
    return packageId;
  },
});

export const cancelPackage = mutation({
  args: { sessionToken: v.string(), packageId: v.id("lessonPackages") },
  handler: async (ctx, args) => {
    const { user } = await requireAdmin(ctx, args.sessionToken);
    const pkg = await ctx.db.get(args.packageId);
    if (!pkg) throw new Error("Package not found");
    if (!isSuperadmin(user.role) && String(pkg.organizationId) !== String(user.organizationId)) {
      throw new Error("Unauthorized: package belongs to a different organization");
    }
    const now = Date.now();
    await ctx.db.patch(args.packageId, { status: "cancelled", updatedAt: now });
    await ctx.db.insert("auditLog", {
      organizationId: pkg.organizationId,
      userId: user._id,
      action: "package.cancelled",
      targetType: "lessonPackage",
      targetId: String(args.packageId),
      timestamp: now,
    });
    return { ok: true };
  },
});

// ─── CEFR certificates ──────────────────────────────────────────────────────

function makeVerificationId(orgSlug: string): string {
  const year = new Date().getFullYear();
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("").toUpperCase();
  return `${orgSlug.slice(0, 4).toUpperCase()}-${year}-${hex}`;
}

export const issueCertificate = mutation({
  args: {
    sessionToken: v.string(),
    organizationId: v.optional(v.id("organizations")),
    studentId: v.id("students"),
    cefrLevel: v.string(),
  },
  handler: async (ctx, args) => {
    const { user, organizationId } = await resolveOrg(ctx, args.sessionToken, args.organizationId);
    if (!/^[ABC][12]\+?$/.test(args.cefrLevel)) {
      throw new Error("cefrLevel must be a CEFR band like A1, B2, C1");
    }
    const student: any = await ctx.db.get(args.studentId);
    if (!student || String(student.organizationId) !== String(organizationId)) {
      throw new Error("Student not found in this organization");
    }
    const org: any = await ctx.db.get(organizationId);

    // Completed-lesson totals at issue time (taught record only)
    const lessons = await ctx.db
      .query("lessons")
      .withIndex("by_student", (q: any) => q.eq("studentId", args.studentId))
      .collect();
    let lessonsCompleted = 0;
    let minutes = 0;
    for (const lesson of lessons) {
      if (lesson.status === "cancelled" || lesson.status === "planned") continue;
      lessonsCompleted++;
      minutes += lesson.duration ?? 60;
    }

    const now = Date.now();
    const verificationId = makeVerificationId(org?.slug ?? "cert");
    const certificateId = await ctx.db.insert("certificates", {
      organizationId,
      studentId: args.studentId,
      studentName: student.name,
      cefrLevel: args.cefrLevel,
      lessonsCompleted,
      hoursCompleted: Math.round((minutes / 60) * 10) / 10,
      verificationId,
      issuedByName: user.name,
      issuedAt: now,
      status: "issued",
    });
    await ctx.db.insert("auditLog", {
      organizationId,
      userId: user._id,
      action: "certificate.issued",
      targetType: "certificate",
      targetId: String(certificateId),
      details: JSON.stringify({ studentId: args.studentId, cefrLevel: args.cefrLevel, verificationId }),
      timestamp: now,
    });
    const cert = await ctx.db.get(certificateId);
    return cert;
  },
});

export const listCertificates = query({
  args: { sessionToken: v.string(), organizationId: v.optional(v.id("organizations")) },
  handler: async (ctx, args) => {
    const { organizationId } = await resolveOrg(ctx, args.sessionToken, args.organizationId);
    const certs = await ctx.db
      .query("certificates")
      .withIndex("by_organization", (q: any) => q.eq("organizationId", organizationId))
      .collect();
    return certs.sort((a, b) => b.issuedAt - a.issuedAt);
  },
});

export const revokeCertificate = mutation({
  args: { sessionToken: v.string(), certificateId: v.id("certificates") },
  handler: async (ctx, args) => {
    const { user } = await requireAdmin(ctx, args.sessionToken);
    const cert = await ctx.db.get(args.certificateId);
    if (!cert) throw new Error("Certificate not found");
    if (!isSuperadmin(user.role) && String(cert.organizationId) !== String(user.organizationId)) {
      throw new Error("Unauthorized: certificate belongs to a different organization");
    }
    const now = Date.now();
    await ctx.db.patch(args.certificateId, { status: "revoked" });
    await ctx.db.insert("auditLog", {
      organizationId: cert.organizationId,
      userId: user._id,
      action: "certificate.revoked",
      targetType: "certificate",
      targetId: String(args.certificateId),
      timestamp: now,
    });
    return { ok: true };
  },
});

// PUBLIC verification lookup — anyone with a verification ID can confirm a
// certificate is genuine. No auth by design; returns only what's printed on
// the certificate itself. sessionToken accepted-and-ignored (the admin
// frontend auto-injects it into every call — Phase A1 gotcha).
export const verifyCertificate = query({
  args: { verificationId: v.string(), sessionToken: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const cert = await ctx.db
      .query("certificates")
      .withIndex("by_verificationId", (q: any) => q.eq("verificationId", args.verificationId.trim().toUpperCase()))
      .unique();
    if (!cert) return null;
    return {
      verificationId: cert.verificationId,
      studentName: cert.studentName,
      cefrLevel: cert.cefrLevel,
      lessonsCompleted: cert.lessonsCompleted,
      hoursCompleted: cert.hoursCompleted,
      issuedAt: cert.issuedAt,
      status: cert.status,
    };
  },
});
