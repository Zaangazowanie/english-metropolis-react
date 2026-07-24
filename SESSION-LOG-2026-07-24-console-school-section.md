# SESSION LOG 2026-07-24 — EM Console: business backend, School section, shared student design

Branch `console-revamp` → `origin/gold-deploy`. Everything below is LIVE on
englishmetro.com. Final head `c13c504`.

## What shipped, in order

| Commit | What |
|---|---|
| `f9a92af` | Light design system, grouped nav, 17 business screens, legacy redirects |
| `05ac065` | Fix Inbox crash + growth entity slugs |
| `4d45036` | Fix Sequences crash |
| `458592d` | Student preview must not print 0% accuracy for an unmeasured student |
| `1c30991` | School section: Schools / Teachers / Students / Student preview |
| `3de9092` | Fix empty course dropdown + People→Team cross-reference |
| `c13c504` | Student dashboard reads the console's shared design |

Backend (`/root/em-console-api`, systemd `em-console-api`, port 8811) is now its
own local git repo (`2c51317`, no remote): `server.py`, `em_business.py`,
`em_mail.py`. `em_business` (31 tables, 29 entities behind one generic registry)
and `em_mail` (read-only IMAP, 4-address allowlist, no send path) are mounted
under `/api/console/biz/*` and `/api/console/mail/*`, with `do_PATCH`/`do_DELETE`
added. Both imports are wrapped in try/except on purpose: that process also
serves the live course library, so a fault degrades one namespace to 503 rather
than stopping the service booting.

## Five real bugs, all found by DRIVING the deployed console, none by reading it

Every one of these passed `vite build`.

1. **Inbox rendered nothing.** `<MailboxRail onSelect={setAddress}>` but `address`
   is derived (`chosen || accounts[0].address`), so no `setAddress` binding
   existed → `ReferenceError` on every render → error boundary. `openMailbox`
   was already written for this and never wired up.
2. **Sequences crashed on load.** Editor mounted unconditionally with a null
   prop. `SaDrawer` returns null when closed, but React evaluates children
   first and one read `sequence.id`. `isNew = sequence && !sequence.id` is
   `null` (falsy) when sequence is null, so the else branch ran.
3. **Growth 400s.** `growthApi` assumed entity slugs were registry names with
   underscores → hyphens. They are not; the generic route looks the segment up
   in `em_business.ENTITIES` verbatim.
4. **Empty course dropdown.** `students:listGroups` does not declare
   `sessionToken`, and Convex rejects undeclared args. `queryAdminConvex`
   injects it unconditionally → opaque "Server Error".
5. **`0%` accuracy for a C1 student.** `avgAccuracy` is quiz-derived and Szymon
   has no quizzes, so it is genuinely `0.0` — but printing it reads as "got
   everything wrong". Falls back to the real CEFR analysis score.

## The two pre-existing issues Mike asked to fix

- **`teachers:listTeachers` "failed"** — it never was broken. It is org-scoped
  via `resolveOrg()`, which THROWS for a super_admin (`organizationId: null`).
  Passing an explicit school fixes it; no Convex deploy needed.
- **Bajla popup over the console** — mounts `aria-modal` with a click-swallowing
  scrim and auto-opened on a fresh admin session. `hideForRoute` now covers
  `/admin`; student routes untouched.

## Data model discovered

`organizations` **are the schools** (Conversa, English Line, English Metropolis
PVT). `groups` **are courses**. Students carry `organizationId`,
`primaryTeacherId` and `groupId`; the course also needs a `groups:addGroupMember`
membership row, and writing one without the other is the state that looks right
on one screen and wrong everywhere else.

## Shared student-dashboard design

Console publishes `student_dashboard.{accent,greeting,cards}` to `app_config`;
the student app reads them from unauthenticated
`GET /api/console/public/student-design` (filtered to that prefix — the same
table holds invoice/VAT/locale keys). Single source of truth is
`src/design/v3/studentDesign.js`, imported by BOTH `views/v3/Dashboard.jsx` and
the console preview. The first cut of the console invented five card names that
matched nothing on the real page; the real ids are
`upcoming | revise | latest | analytics`.

Fails safe: sync defaults, 2.5s abort, every failure → defaults, empty published
card list treated as "nothing published", accent must be 6-digit hex.

## Left open (parked by Mike)

Rendering the dashboard as a **signed-in student** was not done. Unauthenticated
hits redirect to `/login` so the component never mounts; `zz-console-test` exists
but is archived and password-less, and minting live student credentials was not
something to do uninvited. Fetch, parsing, fail-safe behaviour and deployed
wiring are all verified; "a signed-in student sees it" is inferred.

## Operational note

While driving ChatGPT for an adversarial review I raced the PriceMate
hero/studio/catalogue pipeline, which shares that one Chrome. My send submitted
their staged image. Take `/tmp/hero-drain.lock` first. See the gotcha page.
