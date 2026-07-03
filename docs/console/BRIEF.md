# EM Console — bring the EnglishMetro admin to PriceMate-Console level

**Repo:** `Zaangazowanie/english-metropolis-react` · **live branch:** `gold-deploy` · **live site:** englishmetro.com (React SPA + Convex `wooden-manatee-881` + VPS microservices).

## What ALREADY exists (do not rebuild — extend)

Three consoles live inside the app today:

1. **School-admin `/admin`** (`src/components/admin/AdminLayout.jsx`, guard `ProtectedRoute.jsx`): Dashboard, Calendar, Students (add/edit/archive/password/assign teacher+course via `AdminKit.jsx persistAssignment`), **StudentDetail** (`src/views/admin/StudentDetail.jsx`, 2141 ln — CEFR skill charts, progression, level history, lesson archive w/ PDF download, vocabulary view), Teachers (add/edit/remove/restore + magic sign-in link), Courses (groups CRUD), Billing (packages + certificates), Settings.
2. **Superadmin `/admin/superadmin`** (`SuperadminLayout.jsx`, `role === "super_admin"` only): Overview, **Ingest Lesson** (transcript → AI pipeline → staged review), Jobs queue (`ingestionJobs`), All Students + heatmap, Groups, Availability, Audit Log, Salary.
3. **Teacher portal `/teacher`** (`src/views/teacher/TeacherPortal.jsx`, 305 ln, magic-link auth via `convex/teacherAuth.ts`): availability windows + upcoming lessons. **Very thin — this is a major buildout lane.**

Convex model (30 tables, `convex/schema.ts`): organizations, groups(+memberships), users (roles: `super_admin, org_admin, teacher, assistant`), students, lessons (taught record, materials[]), keywords (rich per-student vocab + mastery), transcriptAnalyses (CEFR chain), curriculumItems (planned curriculum, `pdfUrl`, set via `PIPELINE_API_KEY` path), practice engine tables (practiceSession/Progress/Recommendations, exercises, zestawKeywords), ingestionJobs, teacherAvailability, lessonPackages, certificates, lessonBookings, auditLog.

## The GAPS this project closes (P1 → P3)

### P1 — Lesson Library in the superadmin console (the headline)
The **330-deck course library** (`em-course-library`: 12 GEN courses × 24 + SPEC/SUM tracks, each lesson = `manifest.json` + `deck.html` + `deck-web.pdf`) is COMPLETELY unwired — nothing in the app indexes, previews, or serves it.
Build a **Library** section in the superadmin console:
- Browse/filter all decks (level, basket/course, search over title/topics/keywords) — served by `GET /api/console/library` (see API-CONTRACT.md).
- **Preview** a deck in-console (iframe of `deck.html` render or embedded PDF viewer of `deck-web.pdf`).
- **Download** the PDF.
- **Assign to student or group** (with a date): `POST /api/console/assign` → backend copies the PDF into the student's materials + updates `lesson-pdfs.json` + writes `curriculumItems`. Include an Assignments view (who has what, unassign).

### P2 — Teacher portal buildout (`/teacher`)
Grow `TeacherPortal.jsx` from availability-only into a real teacher cockpit — **teacher-scoped** (their own students/groups ONLY; enforce via existing teacher session + server-side scoping):
- My Students (roster w/ links to a teacher-scoped student view: analyses read-only, keywords editable).
- My Schedule (upcoming lessons + calendar, existing `lessonBookings`/`lessons` data).
- My Courses/Groups.
- **Download lesson material** (assigned decks for their students — same library API, teacher-scoped).
- **Upload finished lesson** (PDF/transcript → `POST /api/console/teacher/upload` → creates lesson record/ingestion job).
- **Keyword editor**: add/edit/remove keywords on their students' lessons (server-side endpoints; UI = simple table editor consistent w/ the 9-col keyword shape).

### P3 — Pipelines & Ops page in superadmin
One screen showing the health of every EM data pipeline (backend aggregates; UI renders):
- VPS services: youglish :8790, correction :8802, sentence-freshness :8797, tts :8888, conversa :8800, em-report :8810, em-auth, bajla-router.
- Ingestion queue summary (`ingestionJobs`).
- Course-library freshness (last sync, deck count) + library gate status.
- Practice-engine analytics summary (sessions, progress — from existing Convex tables).
`GET /api/console/pipelines` returns it all; render Sentry/Grafana-calm, not toy-like.

## North star
Dense-but-calm operator cockpit, PriceMate-Console energy (Linear/Retool/Stripe—not purple-gradient hero cards). **Match the app's existing admin design language** (`AdminLayout`/`AdminKit` "Soft Modern") — this is an extension, not a redesign. Every feature browser-verified: click → save → reload → confirm live.

## Hard limits (non-negotiable)
- **NEVER touch:** `convex/**` (backend functions/schema — Ricky owns; deployed Convex ≠ source, casual deploys break auth), auth flows (`ProtectedRoute`, `teacherAuth` wiring, `em-auth`), billing internals, the game3d/arcade lanes (`src/practice/shells3d/`, `src/world/`, `public/games/`), `lessons.json`/`topic-scenes.json` generators.
- Frontend talks to **existing Convex queries/mutations that already exist** + the **`/api/console/*` contract** (API-CONTRACT.md). Need a new endpoint/shape? Open a GitHub issue labeled `console-backend-gap` — Ricky implements. **NEVER stub or fake data.**
- No new deps without a note in the PR (npm supply-chain caution is house policy).
- One focused PR per feature slice, base `gold-deploy`, label `console-built`. PRs are manually reviewed+merged by Ricky (console paths are outside the auto-merge allowlist — expected, not an error).
- No student PII in code, fixtures, or screenshots committed to the repo.
