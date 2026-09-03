// crons.ts — scheduled background jobs.
//
// Authored 2026-05-02 by Ricky as part of the Phase 1.1 content-
// scheduler sprint (audit §4 #21). The only job today is the daily
// exposure-table TTL sweep; this file is the canonical home for any
// future scheduled work so we don't grow a second crons file later.
//
// The default Convex setup auto-registers this file at deploy time;
// no extra wiring needed. The `internal.exposure.pruneOldExposures`
// mutation is a `internalMutation` (not callable from the client) so
// only the cron scheduler can invoke it.

import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Daily exposure-table prune.
//
// Drops `practiceExposure` rows older than 30 days (the horizon defined
// in convex/exposure.ts). Runs at 03:30 UTC = 04:30/05:30 Warsaw so
// it's well off-peak for both Mike's local timezone and any EU-based
// students playing in the early evening.
crons.cron(
  "prune practice exposure ttl",
  "30 3 * * *",
  internal.exposure.pruneOldExposures,
);

// Keep operational exceptions and booking state visible even when no admin has
// opened the calendar. Both jobs are idempotent and intentionally frequent.
crons.interval(
  "reconcile superadmin operations alerts",
  { minutes: 15 },
  internal.operations.reconcileAlerts,
);

crons.interval(
  "reconcile past lesson bookings",
  { minutes: 10 },
  internal.scheduling.reconcileAllPastBookings,
);

// Instalment-plan reminders: 3 days before an instalment is due, then every 3
// days while it is unpaid. 07:00 UTC = 09:00 Warsaw, a time a student reads
// mail. The overdue ALERT lives in reconcileAlerts above and does not depend
// on this job succeeding.
crons.cron(
  "instalment plan reminders",
  "0 7 * * *",
  internal.instalmentPlans.sendReminders,
);

export default crons;
