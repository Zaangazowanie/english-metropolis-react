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

export default crons;
