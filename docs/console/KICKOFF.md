# EM Console — kickoff & working rules

Read `docs/console/BRIEF.md` (what exists / gaps / hard limits) and `docs/console/API-CONTRACT.md` (the backend
seam) FIRST. They inspire, they don't cage — but the **hard limits cage**.

## Roster & lanes
- **METRO-BUILD** → **superadmin console lane** (branches `console/*`): P1 Library (browse/filter/search,
  preview, download, assign/unassign UI + Assignments view) then P3 Pipelines & Ops page. Home:
  `src/views/admin/superadmin/` — add nav entries in `SuperadminLayout.jsx`, follow existing screen patterns.
- **METRO-BUILD-2** → **teacher portal lane** (branches `teacher/*`): P2 buildout of `src/views/teacher/`
  (My Students, My Schedule, My Courses, Materials download, Upload finished lesson, Keyword editor).
  Match the existing app look; teacher-scoped everything.
- **Ricky (VPS)** → backend `/api/console/*` implementation, Convex changes, gate/merge/deploy, nginx.
- Browser QA: each PR must include your own verification notes (what you clicked, what you saw). Ricky
  re-verifies in a real browser before deploy.

## Working rules
1. One focused PR per feature slice, base `gold-deploy`, label `console-built`. Small > big.
2. PR body: what built, screens touched, contract endpoints consumed, how you verified, any
   `console-backend-gap` issues opened.
3. Console paths are OUTSIDE the auto-merge allowlist — Ricky manually reviews/merges/deploys. A held PR is
   normal, not an error. Don't self-merge, don't re-label.
4. Missing backend? Issue labeled `console-backend-gap` with exact request/response. Build the UI against the
   contract shape with a clean empty/error state. NEVER mock data into grids.
5. Respect every hard limit in BRIEF.md (`convex/**`, auth, billing, arcade lanes are off-limits).
6. Reuse the app's components/styles (`AdminLayout`, `AdminKit`, existing cards/tables). No new UI framework,
   no new deps without a PR note.
7. Lesson decks are 1920×1080 HTML/PDF — preview via `<iframe>` (html_url) or PDF embed (pdf_url per contract).
8. If the sandbox can't run the build, say so in the PR and rely on tight diffs — CI + Ricky's gate build-verify
   before deploy.
