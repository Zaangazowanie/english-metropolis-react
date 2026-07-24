# English Metro Console — full revamp spec (2026-07-24)

Authoritative brief for the superadmin rebuild. Supersedes the "extension, not a
redesign" line in BRIEF.md; the north star (dense-but-calm operator cockpit,
Linear/Retool/Stripe energy, **not** purple-gradient hero cards) still stands and
is now actually enforced.

Branch `console-revamp`, base `gold-deploy`. Worktree `/root/em-console-revamp`.

---

## 1. Architecture decision: where new data lives

**Teaching data stays in Convex. New business data goes in a new SQLite store
served by `em-console-api`.**

Why not Convex:
- `docs/console/BRIEF.md` hard limit: never touch `convex/**` (schema drift is
  real here, the deployed deployment is older than source).
- Schema changes there risk the live teaching pipeline for zero benefit to CRM.

So:

| Domain | Store | Served by |
|---|---|---|
| students, lessons, keywords, groups, bookings, ingestion, curriculum | Convex `wooden-manatee-881` | `/api/query`, `/api/mutation` |
| course library (330 decks) | git repo `/root/em-course-library` | `/api/console/library/*` |
| **CRM, growth, adverts, website, finance, people** | **new SQLite `/root/em-console-api/em-business.db`** | **`/api/console/<dept>/*`** |
| mail | Postfix/Dovecot Maildir via portal `:3007` | `/api/console/mail/*` (server-side only) |

The business DB is additive. It touches no existing table, file or endpoint.

**Non-negotiable:** never stub or fake rows. New tables ship empty; empty is
honest, invented data is not. Every list view needs a real empty state that says
what to do next.

## 2. Backend rules

- `em-console-api` is Python **stdlib only** (no FastAPI/Flask) — house style, keep it.
- Auth: existing `Bearer` token → Convex `admin:getSession`, role `super_admin`.
  Reuse the existing helper; do not invent a second auth path.
- All new endpoints namespaced `/api/console/<dept>/…` so nothing collides with
  the P1–P3 contract already in `API-CONTRACT.md`.
- Writes append to the existing `audit.jsonl` via the existing `audit()` helper.
- SQLite: WAL mode, one connection per request, parameterised queries only.

### Mail — the one place with a real credential risk
All ten mailboxes on this box share ONE password, across five unrelated
businesses. Therefore:
- The browser never sees mail credentials. Ever.
- `em-console-api` reads mail **server-side** and exposes only the four
  `@englishmetro.com` addresses via an explicit allowlist.
- Sending goes through the existing portal API (`:3007`), as `em-report` already does.
- Outreach sends get a pacing guard **before** the first send is possible:
  max 10/day, min 15 min gap, mirroring `pricemate-comms-bridge`. The EM sender
  currently has none. Bulk send stays disabled until Mike explicitly enables it.

## 3. Information architecture

Twelve flat pills become a grouped sidebar. Labels say what the thing is; the
current panel has a Students tab that routes to `/courses` and a Roster tab that
routes to `/students`, which is fixed here.

```
Overview                     /admin/superadmin

ACADEMIC
  Students                   /academic/students      (the per-student workspace)
  Roster                     /academic/roster
  Groups                     /academic/groups
  Schedule                   /academic/schedule      (availability + bookings)
  Assignments                /academic/assignments

CURRICULUM
  Library                    /curriculum/library     (330 decks: browse/preview/edit)
  Ingest                     /curriculum/ingest
  Queue                      /curriculum/queue       (+ /queue/:jobId review)

COMMS
  Inbox                      /comms/inbox            (real IMAP, 4 EM mailboxes)
  Templates                  /comms/templates
  Sequences                  /comms/sequences        (outreach, pacing-guarded)

CRM
  Contacts                   /crm/contacts
  Companies                  /crm/companies          (B2B corporate ESL)
  Pipeline                   /crm/pipeline           (leads → deals, kanban)

GROWTH
  Campaigns                  /growth/campaigns
  Adverts                    /growth/adverts         (channels + spend)
  SEO                        /growth/seo

WEBSITE
  Pages                      /website/pages
  Deploys                    /website/deploys

FINANCE
  Revenue                    /finance/revenue        (orders, packages)
  Invoices                   /finance/invoices
  Payroll                    /finance/payroll        (replaces the fake Salary screen)

PEOPLE
  Team                       /people/team            (teachers)
  Recruiting                 /people/recruiting

SYSTEM
  Pipelines                  /system/pipelines
  Audit                      /system/audit
  Integrations               /system/integrations
```

Old routes redirect to their new homes so bookmarks survive.

## 4. Design system — light operator cockpit

Replaces the dark `sa-*` `<style>` block that currently lives inside
`SuperadminLayout.jsx`. New home: `src/views/admin/superadmin/console.css`,
imported once by the layout. Class prefix stays `sa-` so view churn is bounded.

Tokens are the light EM palette already shipped on the landing 2026-07-24
(`src/views/v3/hero-practice-preview.css`), re-scoped to `.sa-root`:

```css
--sa-page:#F6F2FB; --sa-surface:#FFFFFF; --sa-surface-soft:#F0EAF7;
--sa-border:#DDD3E8; --sa-border-strong:#C7B8D8;
--sa-text:#20152F; --sa-text-muted:#6E6478;
--sa-violet-100:#EEE7FF; --sa-violet-300:#C4B0FF;
--sa-violet-500:#8B5CF6; --sa-violet-600:#7442E8;
--sa-warm:#FFB84D; --sa-good:#167A4D; --sa-bad:#B52B47;
```

Usage ratio, enforced: **68% white / 20% lavender structure / 8% violet /
3% warm / 1% semantic.** Violet is pigment, not light.

Hard bans, all of which the current panel does:
- gradient-clipped text (`.sa-stat-value` today) — numbers are ink, not decoration
- `backdrop-filter` glass and glow/bloom shadows
- uppercase letter-spaced micro-labels as the default text style
- the brand gradient on borders, chips and headings; it is for the active nav
  indicator, the primary action and progress fill only

Density (this is an operator tool, not a landing page):
- table row height 40px, 13px text, tabular numerals for all figures
- card radius 16px, button radius 10px, input height 34px
- shadows: `0 1px 2px rgba(42,27,61,.06), 0 4px 12px rgba(42,27,61,.04)`. No bloom.
- one sans family (Plus Jakarta Sans, already self-hosted)

Every screen gets: a real loading skeleton, a real empty state, and a visible
error state. Reuse `ConsoleStates.jsx`, restyled.

Accessibility is not optional: 4.5:1 body contrast, visible focus rings, full
keyboard reachability, `prefers-reduced-motion` respected.

## 5. Known debt this revamp must fix

- `SuperadminSalary.jsx` computes pay from two static JSON files with hardcoded
  PLN rates and a comment admitting it should be a real query. Replaced by
  Finance → Payroll backed by real bookings + a real rate table.
- ~285 hardcoded hex values across the superadmin views, ~100 of them dark-theme
  text colours. All migrate to tokens.
- `SuperadminIngest.jsx` hardcodes the Convex origin. Route it through the proxy.
- `SchedulePlanner.jsx` hardcodes two org IDs.
- `ProtectedRoute.jsx` is a pass-through no-op; the real gate is in the layout.
  Leave the server-side gate as the source of truth, but stop pretending the
  component does anything.

## 6. Definition of done

- `npx vite build` green.
- Every new endpoint returns real data or a real empty set, verified with curl.
- Screens verified in a real browser: click through, not just a data check.
- No secret ever reaches the client bundle.
- One PR per slice, base `gold-deploy`, label `console-built`.
