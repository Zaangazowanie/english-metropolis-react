# SESSION LOG 2026-07-15 — Aleksandra Górska booking incident: root cause, fix, 8 lessons booked

## Trigger
Aleksandra Górska (PVT, EnglishMetro) requested a 24-lesson package starting 2026-07-29, evenings
after 19:00, on: 29 Jul, 4/6/12/17/19/25/27 Aug. Ricky went to book her and could not find her
student/org records on the live Convex deployment — read initial diagnosis (wrong deployment,
detailed below) escalated this to a suspected full data-loss incident and a Convex backup restore
was nearly initiated.

## What actually happened (per Codex's live investigation + fix)
No data loss. Two separate things were true at once:

1. **Ricky's diagnostic error**: queried the `em-deploy-clone` CLI, whose `convex.json`/env
   resolved to `upbeat-goat-960` (a stale/empty deployment), not `wooden-manatee-881` (real prod,
   confirmed as the deployment the live englishmetro.com bundle actually calls). Every "PVT org
   missing / Aleksandra missing / all scheduler tables empty" finding in that session was read
   from the wrong deployment. Direct HTTP query against `wooden-manatee-881.convex.cloud` proved
   Aleksandra's full record, 47 lessons, and prior bookings were intact throughout.
2. **Real bug Codex found and fixed**: on 2026-07-09 a bulk migration
   (`admin:assignStudentTeacherAndBackfillBookings`) set `primaryTeacherId` to Michael Poncana
   (`kd72y2mt9t78nkyes15rh7dhc5881pbv`) for every non-archived student, including Aleksandra. Her
   *booking* records still carried the older teacher id `kd79mdefzszw7tvma4f2a2n1g584x17x`. Because
   `bookLesson`/`getOpenSlots` scope availability per-teacher, this id mismatch made her calendar
   read stale/legacy org-wide availability instead of her actual assigned-teacher slots — the
   scoping bug, not a wipe. Codex traced the exact 2026-07-09 17:06:57 UTC mutation that caused it.

**Lesson for next time**: verify the *actual* deployment a Convex CLI/session targets via
`convex function-spec` (or a direct HTTPS call to the deployment's public URL) before treating an
empty read as data loss — `.env.local` comments/stamps can be stale. See auto-memory
`em_deployment_misdiagnosis_2026-07-15.md`.

## Fix + booking (Codex, commit `91e07f2fdcb34a05335e98634eb3dd2776cd9baa`)
- Deployed the teacher-scope fix.
- Booked all 8 requested lessons for Aleksandra as `school_admin` (bookedByName "Michael
  Poncana"), each note: *"Booked from Aleksandra schedule request on 15 July 2026; 24-lesson
  package invoice pending."* All landed on the nearest generated slot to her "after 19:00" ask:

  | Date (Warsaw) | Day | Time booked | Meet link |
  |---|---|---|---|
  | 2026-07-29 | Wed | 19:30 | meet.google.com/uea-rcnq-srp |
  | 2026-08-04 | Tue | 19:35 | meet.google.com/dmy-jcht-rik |
  | 2026-08-06 | Thu | 19:30 | meet.google.com/rgm-pime-fna |
  | 2026-08-12 | Wed | 19:30 | meet.google.com/cjz-mbqe-pkp |
  | 2026-08-17 | Mon | 19:35 | meet.google.com/whf-isdw-oqo |
  | 2026-08-19 | Wed | 19:30 | meet.google.com/err-uuqz-yfg |
  | 2026-08-25 | Tue | 19:35 | meet.google.com/ipb-nxng-nxv |
  | 2026-08-27 | Thu | 19:30 | meet.google.com/bmy-vbpd-hja |

  `requestedSlotsStillOpen: 0` — all 8 succeeded. All now carry `teacherId:
  kd72y2mt9t78nkyes15rh7dhc5881pbv` (matches her `primaryTeacherId`, confirming the scope fix).
  `allocation.remaining: 0` — the 24-lesson package has not been purchased/allocated yet
  (invoice pending, consistent with Aleksandra's message).

Proof artifacts (Codex): `/root/backups/em-bookings/aleksandra-20260715-before-20260715T074046Z.json`,
`aleksandra-20260715-final-after-20260715T083826Z.json`.

## Status
- 8/8 lessons booked. 16 of 24 remain for her to self-book off the panel (or via Mike) once she
  confirms September availability.
- Invoice for the 24-lesson package still needs sending (Mike said "later today").
- No Convex restore was performed — correctly avoided; a restore over healthy prod data would
  have been the actual incident.
