# `/api/console/*` contract — the seam between fleet (frontend) and Ricky (backend)

The fleet codes the React app **against this contract**. Ricky implements it on the VPS (new `em-console-api`
service, nginx `location /api/console/` → `127.0.0.1:8811`). Treat shapes as contracts: fields may be **added**,
never renamed. Endpoint missing or shape wrong for your feature? Open a GitHub issue labeled
`console-backend-gap` with the exact request/response you need — do NOT guess, stub, or fake data.

## Auth
- Admin/superadmin endpoints: `Authorization: Bearer <admin session token>` — the same token the app's admin
  session already holds (Convex `authSessions`). Backend verifies token + role (`super_admin`/`org_admin`)
  server-side. 401 = not signed in, 403 = wrong role.
- Teacher endpoints (`/api/console/teacher/*`): `Authorization: Bearer <teacher session token>` (existing
  magic-link session). Backend verifies role=teacher and **scopes every response to that teacher's own
  students/groups**. The UI must not rely on client-side filtering for scoping.
- All writes are audit-logged server-side.

## P1 — Library
### ✅ LIVE `GET /api/console/library`
Query: `q=` (search title/topics/keywords) · `level=A2|B1|B2|C1` · `course=` (e.g. GEN-B1-IDEAS) ·
`basket=IDEAS|PLACES|SOCIETY|SPEC|SUM` · `per=` (default 50, max 200) · `offset=`
→ `{ total, courses:[{course_id, title, level, count}], rows:[{ lesson_id, course_id, lesson_number, title,
level, basket, topic, keywords:[...], video_url, pdf_url, html_url, assigned_count }] }`
- `pdf_url` = `/api/console/library/{lesson_id}/pdf` · `html_url` = `/api/console/library/{lesson_id}/html`.

### ✅ LIVE `GET /api/console/library/{lesson_id}/pdf` → the deck PDF (inline; `?download=1` = attachment).
### ✅ LIVE `GET /api/console/library/{lesson_id}/html` → the deck HTML (for iframe preview; images remote-loaded).
### ✅ LIVE `GET /api/console/library/{lesson_id}` → `{ manifest:{...full manifest.json...}, registry:{topics, questions_count}, assignments:[{student_slug, group_id?, date, assigned_at}] }`

## P1 — Assignment
### ✅ LIVE (student AND group fan-out) `POST /api/console/assign`
Body: `{ lesson_id, student_slug?, group_id?, date? }` (exactly one of student_slug/group_id; date = lesson date,
default today). Backend: copies `deck-web.pdf` → `/students/<Name>/pdfs/`, updates `lesson-pdfs.json`, writes a
`curriculumItems` row (via the pipeline-key path), audit-logs.
→ `{ ok, assigned:[{student_slug, pdf_url}], curriculum_item_ids:[...] }`
### ✅ LIVE `POST /api/console/unassign` — `{ lesson_id, student_slug }` → `{ ok }` (removes pdf entry + curriculum link; file kept on disk, audit-logged).
### ✅ LIVE `GET /api/console/assignments?student_slug=&course=` → `{ rows:[{ lesson_id, title, student_slug, date, pdf_url, source:"library"|"published" }] }`
(`published` = legacy per-student lesson PDFs already in `lesson-pdfs.json` that didn't come from the library.)

## P2 — Teacher (ALL ✅ LIVE 2026-07-04; convex consoleTeacher deployed)
### ✅ LIVE `GET /api/console/teacher/me` → `{ teacher:{id,name,email}, students:[{slug,name,level,group}], groups:[...] }`
### ✅ LIVE `GET /api/console/teacher/schedule?from=&to=` → `{ lessons:[{date,time,student_slug|group_id,title,status}], bookings:[...] }`
### ✅ LIVE `GET /api/console/teacher/materials?student_slug=` → assigned decks + published PDFs for THEIR students only, same row shape as `assignments`.
### ✅ LIVE (stores file + audits; transcript auto-ingestion stays superadmin-side — Convex guard) `POST /api/console/teacher/upload` — multipart: `file` (pdf/txt/vtt transcript), fields `student_slug, date, title?, kind=finished_lesson|transcript`.
Backend stores the file, creates/updates the `lessons` record (materials[]), and for transcripts creates an
`ingestionJob`. → `{ ok, lesson_id?, ingestion_job_id?, url }`
### Keywords — ✅ LIVE (add requires lesson_id; write round-trip verified on prod):
- `GET /api/console/teacher/keywords?student_slug=&lesson_id=` → `{ rows:[{id, word, translation, ipa, definitionEn, definitionPl, exampleEn, examplePl, wordType, difficulty, mastery}] }`
- `POST /api/console/teacher/keywords/add` — `{ student_slug, lesson_id?, word, translation?, ...optional fields }` → `{ ok, id }` (backend enriches missing fields async via the existing enrichment pipeline).
- `POST /api/console/teacher/keywords/update` — `{ id, ...changed fields }` → `{ ok }`
- `POST /api/console/teacher/keywords/delete` — `{ id }` → `{ ok }`

## P3 — Pipelines & Ops
### ✅ LIVE (services+library+ingestion+publishes_7d real; practice pending a new Convex read) `GET /api/console/pipelines`
→ `{ services:[{name, port?, unit, status:"up"|"down"|"degraded", latency_ms?, last_error?}],
ingestion:{queued, running, failed_24h, done_24h}, library:{deck_count, last_sync, gate_last_cycle, open_prs},
practice:{sessions_7d, active_students_7d}, publishes_7d:[{student_slug, date, title}] }`

## Notes for the fleet
- Everything student/teacher/analysis-related that the admin already renders comes from **existing Convex
  queries** — keep using them; this API only adds what Convex doesn't have (library files, service health,
  cross-system writes).
- Backend base URL is same-origin (`/api/console/...`) — no CORS work.
- Until Ricky flips an endpoint LIVE (tracked in this file via ✅ markers on merge), build the UI against the
  documented shape and surface a clean "backend not yet live" state on 404 — never mock rows into the grid.
