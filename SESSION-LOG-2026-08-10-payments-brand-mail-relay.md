# Session log — 2026-08-10 · payments enforced, brand marks, student mail, Relay

Ricky. Logged 2026-08-12 on Mike's "save and log everything".
Brain pages: `concepts/projects/em-online-payments-enforced-2026-08-10`,
`concepts/projects/em-brand-marks-2026-08-10`,
`concepts/incidents/em-mail-routing-and-credential-drift-2026-08-10`,
`concepts/projects/relay-webmail-2026-08-10`,
`concepts/incidents/relay-adversarial-review-2026-08-10`.

## 1. Online payment enforced site-wide (commits `2a9926c`, `7dc0f70`)

`/app/<slug>/buy` still ran the pre-gateway invoice wizard while Przelewy24 had been live since
08-07. It now clears the cart, adds the chosen package and hands over to `/checkout`. Legacy
lexicon domain keeps the wizard (no `/checkout` route there), gated on the same hostname test
`main.jsx` uses.

Adversarial review (3 agents) found and I fixed before ship:
- cart **appended** → stale item or back-and-choose-again inflated the charged total;
- legacy slug-only sessions would have been offered a **new account** at checkout → lessons
  allocated to the wrong student record; now sent to `/login?next=`;
- `/checkout` hard-coded Polish → EN students consented in PL; now seeds from `em.lang.v2`.

Faktura fields rebuilt on **art. 106e** + **KSeF mandatory 2026-04-01**: optional as a whole, but
once any field is filled it must complete (street+number, postal `00-000`, city, country); company
⇒ checksum-valid NIP normalised to digits. `BILLING_SHAPE` already accepted the shape — frontend
only. 20/20 local real-click assertions, 7/7 live, `p24-status.sh` → `{"data":true}`.

**The 20-minute no-show ToS clause Mike asked for was ALREADY live** in `/terms` PL+EN (shipped
08-06 after Weronika's 08-04 confirmation). Verified, nothing to add.

## 2. Brand marks (commits `9147847`, `693646e`)

Sources on Bob: `EnglishMetro Square.png` (plate) and **`engligh metro final logo.png`** (2033×774,
the final wordmark — NOT the 2172×724 variant).

⛔ Both are **opaque RGB, no alpha** → dark surfaces only; they cannot go in the light public nav
until a transparent export exists.

- Plate → favicon/192/512/apple-touch/maskable, tutor widget FAB + panel avatar, connect-popup
  mascot, and the 104px transactional-email header. Generated from a **3.5% inset crop**.
- Skyline mark → the email signature lockup (Mike: replace Bajla in the footer with the skyline).
  Light variant refilled with the brand gradient, because the artwork's spire fades to near-white
  and would vanish on the cream plate.
- Wordmark → `og:image`/`twitter:image`, which **did not exist at all** before.

⛔ Cache traps, all real: icon URLs `?v=3`→`?v=4`; widget script query bumped; the **SVG favicon
link removed** (browsers prefer SVG and kept the retired "M."); email lockups shipped as **`-v2`
filenames** because Gmail's image proxy caches by URL.

⛔ **`/em-logo.png` 404** — never on the webroot, and Cloudflare had cached that 404 against `?v=2`,
so every order confirmation to every customer showed a broken image. Fixed both halves: file placed
AND query string bumped to `?v=3`. Verified by rendering a delivered message (3/3 images load).

X account details delivered separately (handle `@englishmetro_`, Business/Education, PL bio 137/160,
avatar 400×400). No CEO/Director title.

## 3. Student mail routing + the rotation trap

All student mail → `michael.poncana@englishmetro.com`. Real students still get their statutory copy
with Mike **envelope-BCC'd**; placeholder `@englishmetro.com` addresses divert to him; school/owner
copies consolidated and **deduplicated per event**. ⛔ Branches are live-mode only.

⛔ The 08-07 rotation updated only the secrets file; the portal `.env` and Dovecot both rejected it.
Restored, annotated, bad value kept aside. A real rotation must change Dovecot/Postfix, the portal
`.env` (+restart) and the secrets file in one pass.

⛔⛔ **Correction:** I claimed every student e-mail failed for 3 days. `journalctl -u em-report`
shows **zero send attempts** in the window and exactly one failure (my own probe). Nothing is known
lost and nothing proven due — **there is no send ledger**, which is the actual finding.

## 4. Relay layout, compose, identities (`e874c37`, `2926f35`, `49fcda3`, `c16f797`)

One pane at a time; folder nav in the left pane (Inbox/Unread/Starred/Sent/Drafts/Archive/Trash, no
Purchases/Social/Promotions); back visible on desktop; tighter reader chrome; identities grouped by
**website**.

⛔ **Paint trap:** atmosphere layers are `position:fixed`, so any **static** content in `.deck` is
painted over while still measuring and hit-testing. Content needs `position:relative;z-index:2`.
Identify it by: correct geometry + opacity 1 + nothing covering it + `elementFromPoint` returns the
element + an injected `background:#ff0000 !important` still does not render.

⛔ **Compose cursor:** the focus effect had `win.to` in its deps, so the first character typed made
it truthy and threw the cursor into the body. Every new message's recipient was truncated to one
character. Fixed once-per-window, then tightened again (minimise/restore re-armed it).

⛔ `dev = false` → `npx next build` + `systemctl restart mail-portal` for every change.

## 5. Adversarial review of Relay (3 agents) — `c16f797`, pushed

Reproduced then fixed: Archive/Drafts/Trash rows rendered a **different message** (folder coerced to
INBOX; UIDs are per-mailbox) and a reply would go to the wrong person; a sync event **blanked the
list** on every message open; `1:*` in a UID path = folder-wide move/expunge; `noSendAs` ignored on
the wire; `/copy` would re-send arbitrary stored mail anywhere under our DKIM; iframe CSP (tracking
pixels) + `allow-popups` (links were dead); failed mailboxes now surface instead of reading as
empty; mobile folder strip restored.

⛔ **`/var/vmail` had NO backup.** Now `/usr/local/bin/mail-offsite-backup.sh`, 04:10 UTC, AES-256 →
Bob, sha256-verified, 7 kept, also covering `maildb.db`/`accounts.json`/`.env`. **Restore proven:
1032 messages, matching live exactly.**

⛔ **No probe covered mail sending.** Added `/usr/local/bin/mail-send-probe.sh` (sends no mail;
checks credential validity AND file-vs-.env sha256 agreement) + a backup-freshness probe, both in
`/var/lib/brain/goals.yaml`.

**Still open:** threading merges unrelated senders in shared mailboxes; portal password == IMAP/SMTP
password for all 29 mailboxes; optimistic archive/delete swallow HTTP 500; services run as root; no
`List-Unsubscribe` for the day outreach uses this path.

## Housekeeping

Four probe e-mails moved INBOX→Archive (not deleted). `/var/lib/brain/goals.yaml` backed up to
`goals.yaml.bak-20260810-mailprobe` before editing.

⛔ `em-deploy-clone` carries uncommitted work from other sessions (Convex auth/scheduling, checkout
age-gate, AI add-on). **My commits are `2a9926c`, `7dc0f70`, `9147847`, `693646e` only — I did not
commit or push anyone else's tree.**
