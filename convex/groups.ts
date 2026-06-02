import {
  query,
  mutation,
  internalMutation,
  internalAction,
  internalQuery,
} from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { requireAdmin, isSuperadmin } from "./authHelpers";

// ═══════════════════════════════════════════════════════════
// GROUP QUERIES
// ═══════════════════════════════════════════════════════════

export const listGroups = query({
  args: { sessionToken: v.string(), organizationId: v.optional(v.id("organizations")) },
  handler: async (ctx, args) => {
    const { user } = await requireAdmin(ctx, args.sessionToken);
    const organizationId = isSuperadmin(user.role)
      ? (args.organizationId ?? user.organizationId)
      : user.organizationId;
    if (organizationId) {
      return await ctx.db
        .query("groups")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", organizationId)
        )
        .collect();
    }
    return await ctx.db.query("groups").collect();
  },
});

export const getGroup = query({
  args: { sessionToken: v.string(), groupId: v.id("groups") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args.sessionToken);
    return await ctx.db.get(args.groupId);
  },
});

// Join groupMemberships -> students for a given group
export const getGroupMembers = query({
  args: { sessionToken: v.string(), groupId: v.id("groups") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args.sessionToken);
    const memberships = await ctx.db
      .query("groupMemberships")
      .withIndex("by_group", (q) => q.eq("groupId", args.groupId))
      .collect();

    const members = await Promise.all(
      memberships.map(async (m) => {
        const student = await ctx.db.get(m.studentId);
        return { membership: m, student };
      })
    );

    // Filter out any memberships whose student was deleted
    return members.filter((m) => m.student !== null);
  },
});

// Join groupMemberships -> groups for a given student
export const getStudentGroups = query({
  args: { studentId: v.id("students") },
  handler: async (ctx, args) => {
    const memberships = await ctx.db
      .query("groupMemberships")
      .withIndex("by_student", (q) => q.eq("studentId", args.studentId))
      .collect();

    const groups = await Promise.all(
      memberships.map(async (m) => {
        const group = await ctx.db.get(m.groupId);
        return { membership: m, group };
      })
    );

    return groups.filter((g) => g.group !== null);
  },
});

// List all groups with member counts (for admin listing)
export const listGroupsWithCounts = query({
  args: { sessionToken: v.string(), organizationId: v.optional(v.id("organizations")) },
  handler: async (ctx, args) => {
    const { user } = await requireAdmin(ctx, args.sessionToken);
    const organizationId = isSuperadmin(user.role)
      ? (args.organizationId ?? user.organizationId)
      : user.organizationId;
    const groups = organizationId
      ? await ctx.db
          .query("groups")
          .withIndex("by_organization", (q) =>
            q.eq("organizationId", organizationId)
          )
          .collect()
      : await ctx.db.query("groups").collect();

    const enriched = await Promise.all(
      groups.map(async (group) => {
        const memberships = await ctx.db
          .query("groupMemberships")
          .withIndex("by_group", (q) => q.eq("groupId", group._id))
          .collect();
        const activeCount = memberships.filter((m) => m.isActive).length;
        return { ...group, memberCount: memberships.length, activeCount };
      })
    );

    return enriched;
  },
});

// ═══════════════════════════════════════════════════════════
// GROUP MUTATIONS
// ═══════════════════════════════════════════════════════════

// Internal: seed a group from CLI
export const seedGroup = internalMutation({
  args: {
    name: v.string(),
    slug: v.string(),
    organizationId: v.id("organizations"),
    courseId: v.optional(v.string()),
    level: v.optional(v.string()),
    schedule: v.optional(v.string()),
    teachers: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("groups")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
    if (existing) return { groupId: existing._id, created: false };
    const now = Date.now();
    const groupId = await ctx.db.insert("groups", {
      ...args,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    return { groupId, created: true };
  },
});

// Add a student to a group (superadmin only — no auth check here,
// callers should verify via the frontend guard)
export const addGroupMember = mutation({
  args: {
    sessionToken: v.string(),
    groupId: v.id("groups"),
    studentId: v.id("students"),
    role: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args.sessionToken);
    // Check for existing membership
    const existing = await ctx.db
      .query("groupMemberships")
      .withIndex("by_group_student", (q) =>
        q.eq("groupId", args.groupId).eq("studentId", args.studentId)
      )
      .first();

    if (existing) {
      // Re-activate if previously removed
      if (!existing.isActive) {
        await ctx.db.patch(existing._id, {
          isActive: true,
          leftAt: undefined,
          role: args.role || "member",
        });
      }
      return existing._id;
    }

    return await ctx.db.insert("groupMemberships", {
      groupId: args.groupId,
      studentId: args.studentId,
      role: args.role || "member",
      joinedAt: Date.now(),
      isActive: true,
    });
  },
});

// Remove a student from a group (soft-remove: sets isActive=false)
export const removeGroupMember = mutation({
  args: {
    sessionToken: v.string(),
    groupId: v.id("groups"),
    studentId: v.id("students"),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args.sessionToken);
    const membership = await ctx.db
      .query("groupMemberships")
      .withIndex("by_group_student", (q) =>
        q.eq("groupId", args.groupId).eq("studentId", args.studentId)
      )
      .first();

    if (!membership) return null;

    await ctx.db.patch(membership._id, {
      isActive: false,
      leftAt: Date.now(),
    });

    return membership._id;
  },
});

// Internal: audit cleanup for a confirmed-wrong (groupId, studentId) pairing.
// Hard-deletes the membership row (if any), plus every lesson row that
// matches both groupId and studentId, cascading to transcriptAnalyses
// + keywords rows that reference those lessons. Used by the one-off
// cross-group audit (see cross_group_audit_plan in scripts/).
export const _purgeWrongMembership = internalMutation({
  args: {
    groupId: v.id("groups"),
    studentId: v.id("students"),
  },
  handler: async (ctx, args) => {
    // 1. Hard-delete membership row (we want it gone entirely, not soft-
    //    removed, because the seed source was fundamentally wrong).
    const membership = await ctx.db
      .query("groupMemberships")
      .withIndex("by_group_student", (q) =>
        q.eq("groupId", args.groupId).eq("studentId", args.studentId)
      )
      .first();
    let membershipDeleted = false;
    if (membership) {
      await ctx.db.delete(membership._id);
      membershipDeleted = true;
    }

    // 2. Find lessons for this (student, group) pair. Use by_student
    //    index and filter in memory — a student has far fewer lessons
    //    than a group has lessons, so this is cheaper.
    const lessons = await ctx.db
      .query("lessons")
      .withIndex("by_student", (q) => q.eq("studentId", args.studentId))
      .collect();
    const wrongLessons = lessons.filter((l) => l.groupId === args.groupId);

    let analysesDeleted = 0;
    let keywordsDeleted = 0;
    let lessonsDeleted = 0;

    for (const lesson of wrongLessons) {
      // 3. Delete analyses that reference this lesson.
      const analyses = await ctx.db
        .query("transcriptAnalyses")
        .withIndex("by_lesson", (q) => q.eq("lessonId", lesson._id))
        .collect();
      for (const a of analyses) {
        await ctx.db.delete(a._id);
        analysesDeleted++;
      }

      // 4. Delete keywords that reference this lesson.
      const keywords = await ctx.db
        .query("keywords")
        .withIndex("by_lesson", (q) => q.eq("lessonId", lesson._id))
        .collect();
      for (const k of keywords) {
        await ctx.db.delete(k._id);
        keywordsDeleted++;
      }

      // 5. Delete the lesson itself.
      await ctx.db.delete(lesson._id);
      lessonsDeleted++;
    }

    return {
      membershipDeleted,
      lessonsDeleted,
      analysesDeleted,
      keywordsDeleted,
    };
  },
});

// Internal: add a student to a group (hard upsert, for the audit fix-up).
// Functionally identical to addGroupMember but callable from CLI via
// internal.groups._addMembership to keep it out of the public API.
export const _addMembership = internalMutation({
  args: {
    groupId: v.id("groups"),
    studentId: v.id("students"),
    role: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("groupMemberships")
      .withIndex("by_group_student", (q) =>
        q.eq("groupId", args.groupId).eq("studentId", args.studentId)
      )
      .first();
    if (existing) {
      if (!existing.isActive) {
        await ctx.db.patch(existing._id, {
          isActive: true,
          leftAt: undefined,
          role: args.role || "member",
        });
      }
      return { membershipId: existing._id, created: false };
    }
    const id = await ctx.db.insert("groupMemberships", {
      groupId: args.groupId,
      studentId: args.studentId,
      role: args.role || "member",
      joinedAt: Date.now(),
      isActive: true,
    });
    return { membershipId: id, created: true };
  },
});

// ═══════════════════════════════════════════════════════════
// AUTO-SEED GROUPS FROM INGESTION JOBS
// ═══════════════════════════════════════════════════════════
// Reads every ingestionJob row, clusters by the group-key derived
// from sourceFilename, fetches each transcript (first ~4KB) to pull
// the Tactiq-header participants list, then creates groups +
// students + memberships idempotently.
//
// Skips:
//   • 1-on-1 jobs (filename starts with "ind.", or detectedStudentId set)
//   • "Meeting Transcription" / "Conversa or individual (unmatched panel)"
//     (unclassified — leave for manual triage)
//   • jobs whose group would land in PVT (no matching org yet)

// ── Filename parsing helpers ───────────────────────────────

// Strip "YYYY-MM-DD_HHMM_<name>.txt" → name.
// Returns null for filenames that don't match the Tactiq pattern.
function extractRawGroupName(filename: string | undefined | null): string | null {
  if (!filename) return null;
  const m = filename.match(/^\d{4}-\d{2}-\d{2}_\d{4}_(.+)\.txt$/);
  if (!m) return null;
  return m[1].trim();
}

// Extract the date portion (YYYY-MM-DD) from the filename, if any.
function extractDateFromFilename(filename: string | undefined | null): string | null {
  if (!filename) return null;
  const m = filename.match(/^(\d{4}-\d{2}-\d{2})_(\d{2})(\d{2})_/);
  if (!m) return null;
  return m[1];
}

// Extract the HH:MM portion from the filename, if any.
function extractTimeFromFilename(filename: string | undefined | null): string | null {
  if (!filename) return null;
  const m = filename.match(/^\d{4}-\d{2}-\d{2}_(\d{2})(\d{2})_/);
  if (!m) return null;
  return `${m[1]}:${m[2]}`;
}

// Normalise a raw group name into a canonical group key.
// Strips trailing date-range suffixes so every cohort-year jobfile
// collapses into the same group (e.g. "OP78-25 Październik 2025 -
// Czerwiec 2026" → "OP78-25").
function normaliseGroupKey(raw: string): string {
  let name = raw.trim();
  // Polish academic-year date range suffix.
  name = name.replace(
    /\s+Pa(?:[źz])dziernik\s+\d{4}\s*-\s*Czerwiec\s+\d{4}\s*$/iu,
    "",
  );
  // Bare trailing year (e.g. "Sekretariat E-L 2025").
  name = name.replace(/\s+20\d{2}$/u, "");
  // Collapse whitespace.
  return name.replace(/\s+/g, " ").trim();
}

// Classify a group key into an organisation slug + student-type label.
// Returns null if the group should be skipped (1-on-1 / unclassified).
function classifyGroup(key: string): { orgSlug: string; level?: string } | null {
  const lower = key.toLowerCase();

  // ── Skip 1-on-1 / unclassified ────────────────────────────
  if (lower.startsWith("ind.")) return null;
  if (lower.startsWith("conversa or individual")) return null;
  if (lower === "meeting transcription") return null;
  if (lower.startsWith("pvt_")) return null;
  if (lower.startsWith("maciej") || lower.startsWith("natalia kiepsdorf")) {
    // Would be em_pvt but that org's student roster isn't wired yet.
    return null;
  }

  // ── English Line — public classes + corporate courses ─────
  // NB: `\b` doesn't match between a letter and a digit, so rely on
  // digit/dash lookaheads for OP* / OW* / OPT* codes.
  const englishLineFamilies = [
    /^op[a-z]*\d/i,      // OP26-25, OPT27-25 …
    /^ow\d/i,            // OW-… classes
    /^predom\b/i,
    /^sekretariat\b/i,
    /^fintiera\b/i,
    /^fingo[_\s]/i,    // "Fingo_ B2 upper 6-26"
    /^asseco\b/i,
    /^edra\b/i,
    /^grainforce\b/i,
    /^storteboom\b/i,
    /^business\s+analyst\b/i,
  ];
  for (const rx of englishLineFamilies) {
    if (rx.test(key)) {
      return { orgSlug: "englishline", level: extractLevelHint(key) };
    }
  }

  // Default bucket — treat as Conversa (everything else).
  return { orgSlug: "conversa", level: extractLevelHint(key) };
}

// Pull a CEFR-ish level token out of the raw group name.
function extractLevelHint(name: string): string | undefined {
  // Match B1, B2, B2+, C1, B2+/C1, A2 …
  const m = name.match(/\b([ABC][12](?:\+)?(?:\/[ABC][12])?)\b/);
  if (m) return m[1].toUpperCase();
  return undefined;
}

// Build a slug from the group key.
function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .replace(/[łŁ]/g, "l")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+)|(-+$)/g, "");
}

// Normalise a student name. Strips trailing annotations and collapses
// whitespace. Preserves Polish diacritics.
function normaliseStudentName(raw: string): string {
  let name = raw.trim();
  // Drop parenthetical comments, e.g. "(Emka)" or "(0_22)".
  name = name.replace(/\([^)]*\)/g, "").trim();
  // Drop trailing company tags, e.g. "- Oferteo" or "XTPL 3-25".
  name = name.replace(/\s+-\s+.*$/, "").trim();
  // Collapse whitespace.
  name = name.replace(/\s+/g, " ").trim();
  return name;
}

// Is this person a teacher rather than a student?
function isTeacherName(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    lower.includes("michael poncana") ||
    lower === "michael" ||
    lower === "mike" ||
    lower === "mike poncana" ||
    lower === "mikeponcana" ||
    lower.includes("tactiq") // Tactiq AI Extension footer artefacts
  );
}

// Parse the Tactiq participants line out of the first kilobytes of a
// transcript. Returns [] if the header isn't present.
function parseParticipants(transcriptHead: string): string[] {
  const m = transcriptHead.match(/^participants:\s*(.+)$/im);
  if (!m) return [];
  // Participants are comma-separated. Split on both "," and " & "
  // (Tactiq sometimes lumps couples as "Gosia & Michał K").
  const raw = m[1].trim();
  return raw
    .split(/,\s*/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

// ── Internal queries / mutations used by the seed action ────

// Read every ingestionJob row in bounded batches. Returns only the
// fields the seed action actually needs (filename + storage id + any
// inline transcript text + detected student linkage).
export const _listAllIngestionJobsForSeeding = internalQuery({
  args: {},
  handler: async (ctx) => {
    const jobs = await ctx.db.query("ingestionJobs").take(2000);
    return jobs.map((j) => ({
      jobId: j._id,
      status: j.status,
      sourceFilename: j.sourceFilename,
      transcriptStorageId: j.transcriptStorageId,
      transcriptText: j.transcriptText,
      detectedStudentId: j.detectedStudentId,
      organizationId: j.organizationId,
    }));
  },
});

export const _resolveStorageUrl = internalQuery({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    return await ctx.storage.getUrl(args.storageId);
  },
});

// Upsert a group + its student roster + memberships in one transaction.
// Idempotent: re-running leaves existing rows intact.
export const _upsertGroupAndMembers = internalMutation({
  args: {
    name: v.string(),
    slug: v.string(),
    organizationId: v.id("organizations"),
    level: v.optional(v.string()),
    schedule: v.optional(v.string()),
    studentNames: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    // ── 1. Find-or-create the group ──────────────────────────
    let group = await ctx.db
      .query("groups")
      .withIndex("by_org_name", (q) =>
        q.eq("organizationId", args.organizationId).eq("name", args.name),
      )
      .first();

    const now = Date.now();
    let groupId: Id<"groups">;
    let groupCreated = false;

    if (!group) {
      // Ensure the slug is unique.
      let slug = args.slug;
      const slugClash = await ctx.db
        .query("groups")
        .withIndex("by_slug", (q) => q.eq("slug", slug))
        .first();
      if (slugClash) {
        slug = `${slug}-${args.organizationId.slice(-4)}`;
      }
      groupId = await ctx.db.insert("groups", {
        name: args.name,
        slug,
        organizationId: args.organizationId,
        level: args.level,
        schedule: args.schedule,
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      groupCreated = true;
    } else {
      groupId = group._id;
      // Back-fill level / schedule if missing.
      const patch: Record<string, unknown> = {};
      if (!group.level && args.level) patch.level = args.level;
      if (!group.schedule && args.schedule) patch.schedule = args.schedule;
      if (Object.keys(patch).length > 0) {
        patch.updatedAt = now;
        await ctx.db.patch(groupId, patch);
      }
    }

    // ── 2. Upsert each student in the roster ────────────────
    let studentsCreated = 0;
    let membershipsCreated = 0;

    for (const rawName of args.studentNames) {
      const name = rawName.trim();
      if (!name) continue;
      const slug = slugify(name);
      if (!slug) continue;

      // Look for an existing student in this organization first by
      // slug, then (as a fallback) by name match.
      let student = await ctx.db
        .query("students")
        .withIndex("by_org_slug", (q) =>
          q.eq("organizationId", args.organizationId).eq("slug", slug),
        )
        .first();

      if (!student) {
        // Fallback: any org. Prevents duplicating a Conversa student
        // that's already linked to a different org.
        student = await ctx.db
          .query("students")
          .withIndex("by_slug", (q) => q.eq("slug", slug))
          .first();
      }

      let studentId: Id<"students">;
      if (!student) {
        studentId = await ctx.db.insert("students", {
          organizationId: args.organizationId,
          name,
          slug,
          level: args.level ?? "B1",
          type: "group",
          status: "active",
          enrolledAt: now,
          groupId,
          createdAt: now,
          updatedAt: now,
        });
        studentsCreated++;
      } else {
        studentId = student._id;
      }

      // Upsert the membership.
      const existingMembership = await ctx.db
        .query("groupMemberships")
        .withIndex("by_group_student", (q) =>
          q.eq("groupId", groupId).eq("studentId", studentId),
        )
        .first();
      if (!existingMembership) {
        await ctx.db.insert("groupMemberships", {
          groupId,
          studentId,
          role: "member",
          joinedAt: now,
          isActive: true,
        });
        membershipsCreated++;
      } else if (!existingMembership.isActive) {
        await ctx.db.patch(existingMembership._id, {
          isActive: true,
          leftAt: undefined,
        });
      }
    }

    return {
      groupId,
      groupCreated,
      studentsCreated,
      membershipsCreated,
    };
  },
});

// ── Set courseId on an existing group ─────────────────────────
// Used by the external map_groups_courses.py script to link
// Convex groups to English-Line course IDs from courses_full.json.
export const setGroupCourseId = internalMutation({
  args: {
    groupId: v.id("groups"),
    courseId: v.string(),
  },
  handler: async (ctx, args) => {
    const group = await ctx.db.get(args.groupId);
    if (!group) throw new Error(`Group ${args.groupId} not found`);
    await ctx.db.patch(args.groupId, {
      courseId: args.courseId,
      updatedAt: Date.now(),
    });
    return { groupId: args.groupId, courseId: args.courseId };
  },
});

// ── The main seed orchestrator ─────────────────────────────

export const seedGroupsFromJobs = internalAction({
  args: {
    // When true, only report what would be done without writing.
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const dryRun = args.dryRun ?? false;

    // ── 1. Load every job ──────────────────────────────────
    const jobs: Array<{
      jobId: Id<"ingestionJobs">;
      status: string;
      sourceFilename?: string;
      transcriptStorageId?: Id<"_storage">;
      transcriptText?: string;
      detectedStudentId?: Id<"students">;
      organizationId?: Id<"organizations">;
    }> = await ctx.runQuery(
      internal.groups._listAllIngestionJobsForSeeding,
      {},
    );

    // ── 2. Cluster jobs by (orgSlug, groupKey) ──────────────
    type Cluster = {
      orgSlug: string;
      groupKey: string;
      level?: string;
      jobs: typeof jobs;
      // day-of-week -> time HH:MM -> count, to derive a schedule string
      schedule: Map<string, Map<string, number>>;
    };
    const clusters = new Map<string, Cluster>();
    const skipped: Record<string, number> = {
      no_filename: 0,
      individual: 0,
      unclassified: 0,
      has_detected_student: 0,
    };

    for (const job of jobs) {
      const raw = extractRawGroupName(job.sourceFilename);
      if (!raw) {
        skipped.no_filename++;
        continue;
      }
      const key = normaliseGroupKey(raw);
      const classification = classifyGroup(key);
      if (!classification) {
        if (raw.toLowerCase().startsWith("ind.")) skipped.individual++;
        else skipped.unclassified++;
        continue;
      }
      // 1-on-1 jobs sometimes slip into a "group" filename pattern — the
      // detectedStudentId being set is the reliable tell. Skip them:
      // they already have a linked student and shouldn't pull roster
      // data into a class group.
      if (job.detectedStudentId) {
        skipped.has_detected_student++;
        continue;
      }

      const clusterKey = `${classification.orgSlug}::${key}`;
      let cluster = clusters.get(clusterKey);
      if (!cluster) {
        cluster = {
          orgSlug: classification.orgSlug,
          groupKey: key,
          level: classification.level,
          jobs: [],
          schedule: new Map(),
        };
        clusters.set(clusterKey, cluster);
      }
      cluster.jobs.push(job);

      // Track day-of-week × time so we can build a schedule string.
      const date = extractDateFromFilename(job.sourceFilename);
      const time = extractTimeFromFilename(job.sourceFilename);
      if (date && time) {
        const dow = new Date(`${date}T12:00:00Z`).getUTCDay(); // 0=Sun
        const dayName = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dow];
        const byTime = cluster.schedule.get(dayName) ?? new Map<string, number>();
        byTime.set(time, (byTime.get(time) ?? 0) + 1);
        cluster.schedule.set(dayName, byTime);
      }
    }

    // ── 3. Resolve org slug → id ────────────────────────────
    const orgSlugs = [...new Set([...clusters.values()].map((c) => c.orgSlug))];
    const orgIdBySlug = new Map<string, Id<"organizations">>();
    for (const slug of orgSlugs) {
      const org = await ctx.runQuery(internal.ingestion.getOrgBySlugInternal, {
        slug,
      });
      if (org) orgIdBySlug.set(slug, org._id);
    }

    // ── 4. For each cluster: fetch participants and upsert ──
    const report: Array<{
      group: string;
      orgSlug: string;
      level?: string;
      schedule?: string;
      jobs: number;
      students: number;
      membersCreated: number;
      studentsCreated: number;
      groupCreated: boolean;
    }> = [];
    const orphanedClusters: string[] = [];

    for (const [, cluster] of clusters) {
      const orgId = orgIdBySlug.get(cluster.orgSlug);
      if (!orgId) {
        orphanedClusters.push(`${cluster.orgSlug}::${cluster.groupKey}`);
        continue;
      }

      // Collect unique student names across the cluster's transcripts.
      const rosterSet = new Map<string, string>(); // slug -> canonical name
      for (const job of cluster.jobs) {
        const participants = await fetchParticipants(ctx, job);
        for (const raw of participants) {
          const name = normaliseStudentName(raw);
          if (!name) continue;
          if (isTeacherName(name)) continue;
          const slug = slugify(name);
          if (!slug) continue;
          if (!rosterSet.has(slug)) rosterSet.set(slug, name);
        }
      }
      const studentNames = [...rosterSet.values()];

      // Build a schedule string like "Mon/Wed 18:20".
      const schedule = formatSchedule(cluster.schedule);

      if (dryRun) {
        report.push({
          group: cluster.groupKey,
          orgSlug: cluster.orgSlug,
          level: cluster.level,
          schedule,
          jobs: cluster.jobs.length,
          students: studentNames.length,
          membersCreated: 0,
          studentsCreated: 0,
          groupCreated: false,
        });
        continue;
      }

      const result: {
        groupId: Id<"groups">;
        groupCreated: boolean;
        studentsCreated: number;
        membershipsCreated: number;
      } = await ctx.runMutation(internal.groups._upsertGroupAndMembers, {
        name: cluster.groupKey,
        slug: slugify(cluster.groupKey),
        organizationId: orgId,
        level: cluster.level,
        schedule,
        studentNames,
      });

      report.push({
        group: cluster.groupKey,
        orgSlug: cluster.orgSlug,
        level: cluster.level,
        schedule,
        jobs: cluster.jobs.length,
        students: studentNames.length,
        membersCreated: result.membershipsCreated,
        studentsCreated: result.studentsCreated,
        groupCreated: result.groupCreated,
      });
    }

    report.sort((a, b) => a.group.localeCompare(b.group));

    return {
      dryRun,
      totalJobs: jobs.length,
      clusters: clusters.size,
      groupsProcessed: report.length,
      skipped,
      orphanedClusters,
      report,
    };
  },
});

// Helper: fetch the first ~4 KB of a transcript so we can read the
// Tactiq `participants:` header without pulling a 100 KB file.
async function fetchParticipants(
  ctx: { runQuery: any },
  job: {
    transcriptText?: string;
    transcriptStorageId?: Id<"_storage">;
  },
): Promise<string[]> {
  try {
    if (job.transcriptText) {
      return parseParticipants(job.transcriptText.slice(0, 4096));
    }
    if (!job.transcriptStorageId) return [];
    const url: string | null = await ctx.runQuery(
      internal.groups._resolveStorageUrl,
      { storageId: job.transcriptStorageId },
    );
    if (!url) return [];
    // Range-request the first 8 KB so we don't stream an entire file.
    const res = await fetch(url, { headers: { Range: "bytes=0-8191" } });
    if (!res.ok && res.status !== 206) return [];
    const text = await res.text();
    return parseParticipants(text);
  } catch (err) {
    console.warn("fetchParticipants failed:", err);
    return [];
  }
}

function formatSchedule(
  schedule: Map<string, Map<string, number>>,
): string | undefined {
  if (schedule.size === 0) return undefined;
  // Find the most common time per day and keep days with >= 2 sessions.
  const dayOrder = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const days: Array<{ day: string; time: string; count: number }> = [];
  for (const [day, byTime] of schedule) {
    let bestTime = "";
    let bestCount = 0;
    for (const [time, count] of byTime) {
      if (count > bestCount) {
        bestCount = count;
        bestTime = time;
      }
    }
    days.push({ day, time: bestTime, count: bestCount });
  }
  // Drop days with fewer than 2 sessions (one-off slots aren't the schedule).
  const recurring = days.filter((d) => d.count >= 2);
  const picked = recurring.length > 0 ? recurring : days;
  picked.sort(
    (a, b) => dayOrder.indexOf(a.day) - dayOrder.indexOf(b.day),
  );
  // If every recurring day has the same time, collapse to "Mon/Wed 18:20".
  const uniqueTimes = [...new Set(picked.map((d) => d.time))];
  if (uniqueTimes.length === 1) {
    return `${picked.map((d) => d.day).join("/")} ${uniqueTimes[0]}`;
  }
  return picked.map((d) => `${d.day} ${d.time}`).join(", ");
}
