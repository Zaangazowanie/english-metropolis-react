# Complimentary package analysis

An owner can grant analysis for an existing lesson package without creating a
payment or granting permanent account-wide access. `complimentaryAnalysis:grantPackage`
requires a superadmin session, a matching active package, a written attestation
of the student's existing consent, and a gift reason. `dryRun: true` previews the
grant. The operation is idempotent per package and refuses minors or revoked
consent. It records a separate grant and audit event; payment/order records and
package balances are unchanged.

Coverage uses billing's oldest-first allocation and the package's original
lesson limit. Earlier taught lessons allocated to that package are covered too.
No-shows and late cancellations consume package capacity but cannot be analysed.
The next package is not included. Gift-aware workers must pass `lessonId` to
`students:analysisEligibility`; a student-only query fails with `lesson_required`.
The analysis write rechecks the package boundary and is idempotent for recipients.

The student's analysis setting reports the gift. Covered lesson cards suppress
the purchase prompt, and a quote cannot sell an already-covered lesson. Existing
paid/legacy analysis routes remain in place. Consent withdrawal revokes package
grants immediately, including the backfill path.

Verification: `node --test tests/complimentary-analysis.test.mjs` exercises the
real handlers offline, including authorization, no-payment writes, exact package
allocation, lesson 25, prior and next packages, revocation, no-shows, ambiguous
bookings, the learner setting, and idempotent analysis writes.

Deploy from the clean VPS `prod` checkout using
`deploy/deploy-complimentary-analysis-2026-09-09.sh`. It checks types, tests, API
preservation and the client contract. No frontend deployment is required.
Rollback must preserve any grant data already recorded; never drop the grant
table after activation. Revert handler changes only in an additive schema release
and retain the audit trail. The backend has no billing or scheduled-payment side effects.
