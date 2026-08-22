# Session log — 2026-08-07 — Przelewy24 go-live + checkout payment picker

Agent: Ricky. Repo: `/root/em-deploy-clone`, branch `legal/p24-contact-services`, commit `d9b0917`.
Deployed to production the same session (Convex `wooden-manatee-881` + `/var/www/englishmetro`).

---

## 1. Przelewy24 went live

Blocked since 2026-08-06 on a 401 from every REST call. The cause was never the key: the P24 panel
had `Adresy IP: brak` under **Moje konto → Konfiguracja API → USTAWIENIA**, and `brak` means nothing
is allowed rather than unrestricted, so a correct key, a garbage key and no credentials all returned
a byte-identical 401.

Mike entered `187.77.71.153` (the VPS egress IP, reached through the nginx proxy built on 08-06) and
clicked the **`+`** to commit it to the list. Typing it into the box is not enough — the row above
must stop reading `brak`.

Verified immediately, three ways:

| Check | Result |
|---|---|
| `scripts/p24-status.sh` (`testAccess`) | HTTP 200 `{"data":true}` |
| `transaction/register`, 1 PLN, never paid | HTTP 200, token issued |
| Customer payment page | HTTP 200 |

**Incidental:** Mike had also pasted a personal PayPal (`ayankhumz@yahoo.com`) into `Konto PayPal`,
believing the form required it. It did not. That field is where PayPal payments taken through P24
would settle, so customer money would have bypassed the Foundation entirely. Removed the same day.
Nothing had routed there because PayPal was never an enabled method.

## 2. Cards requested from Przelewy24

The live method list for POS 410151 returns 23 methods: `FastTransfers` (17), `eTransfer` (3),
`Blik` (2 — ids 154 and 338), `TraditionalTransfer` (1). **methodId 145 Karta płatnicza is absent**,
so cards are a switch on P24's side, not something code can enable.

Request sent 2026-08-07 15:44 UTC into ticket `[Ticket#2026073001006447]` addressed to
`wsparcieklienta@przelewy24.pl`, threaded with the original `In-Reply-To`/`References` headers.
Accepted `250 2.6.0`, no bounce. Relay is now Microsoft/Outlook, not nazwa.pl as in July.
It asks for Visa/Mastercard, required documents, whether an annex and what commission applies,
Google/Apple Pay, and expected timing. Sender script kept in the session scratchpad.

## 3. Checkout payment picker

`convex/p24.ts` gained `fetchEnabledMethods()`, `methodGroupOf()` and a public `listMethods` action;
`createPayment` gained an optional `method`, validated against the live list and dropped if it cannot
be confirmed. New `src/views/public/PaymentMethods.jsx`, `PaymentMarks.jsx`, `payment-method-copy.js`.

The design principle: the page never keeps its own list of methods. A group with no enabled methods
is simply not rendered, which is what makes it impossible to advertise something the account cannot
take, and what makes cards appear automatically the day P24 enable them.

Both BLIK ids (154 and 338) are accepted by `register`, so the `Math.min` tie-break is safe.

## 4. Two adversarial reviews, 14 findings

### Fixed

1. **Resume trap (high).** P24 pin a registered transaction to its method. Proven in a real browser:
   registering with `method:154` lands straight on the BLIK code entry screen — no method list, only
   Continue/Cancel. Combined with the existing 30-minute resume guard, a customer who failed BLIK and
   returned choosing card would have been handed the old token and stranded. Fixed with a new
   `p24Payments.requestedMethod`; a resume with a different choice supersedes the old row.
2. **One rejected method would have downed every checkout (high),** because BLIK is preselected for
   everyone. `register` now retries once without the method.
3. **Three surfaces still advertised cards (medium):** `CartUI.jsx`, `BuyLessons.jsx` (both languages)
   and `cartOrderEmail` in `/root/em-report/server.cjs`. All corrected; em-report restarted.
4. **Transfer count included `Przekaz tradycyjny`,** which is neither a bank nor fast. Excluded from
   the count only, so live now reads "Do wyboru 20 banków" rather than 21.
5. **Polish plurals were hard-coded** — "Do wyboru 1 banków", "22 banków". Correct forms now; today's
   count of 21 happened to be the one form that was right, which is why it was invisible.
6. **The hover lift never ran.** A finished `fill-mode: both` animation on `transform` outranked the
   `:hover` rule, so the only motion affordance on the picker had never played. Entrance moved to the
   independent `translate` property.
7. **Focus ring depended on `:has()`** — no indicator at all on Firefox ESR and Safari < 15.4, since
   the radio is 1px and transparent. Now `:focus-within`, matching `.lp-package`.
8. Unknown group keys filtered; redundant `role="radiogroup"` removed (a `fieldset`/`legend` already
   groups the radios); failure state given `role="status"`; check-mark exit animated.

### Knowingly not fixed

- `listMethods` is public, unauthenticated and uncached. Both paths fail open, so the impact is
  throttling, not money.
- `scripts/p24-golive.sh` step 3 curls without `-L`. `secure.przelewy24.pl/trnRequest/<token>` now
  302s to `go.przelewy24.pl`, so it reports a false failure on a healthy account.

## 5. Verification

- 16 browser assertions pass with cards off and with cards on, including a real click hit-tested with
  `elementFromPoint`, keyboard arrows, 44px targets, and the exact methodId reaching `createPayment`.
- Bank-count plurals verified at 1, 21 and 22; unknown keys dropped.
- `npx convex run p24:listMethods --prod` returns real P24 data, which proves the Convex action →
  nginx egress proxy → P24 path works from Convex's own AWS infrastructure. This closes the
  "false green" trap identified on 08-06.
- Live production checkout renders BLIK + "Do wyboru 20 banków", no card option, honest summary copy.

**Not runtime-verified:** the resume/supersede path. Reaching a `registered` state needs real P24
credentials on a non-prod deployment, and the live key was deliberately not copied to dev. Testable
on prod in two minutes: start BLIK, abandon, return within 30 minutes and pick transfer.

## 6. Deploy recipe (two traps)

- ⛔ **`scripts/deploy.sh production` is stale** — it writes to `/var/www/em-react-dev`, but nginx
  serves englishmetro.com from `/var/www/englishmetro`. It would look like a silent no-op.
- ⛔ **Never rsync `lesson-pdfs.json`.** `publish-em-lesson` writes lesson PDFs straight to prod, so
  live is ahead of any build. This deploy would have deleted Aleksandra Górska's 06 Aug entry.
  Excluded, verified all four entries still serve, and back-ported the live file into `public/`.
- Working command, no `--delete` so prod-only extras survive, with rollback copies of all 592
  replaced files:
  `rsync -a --backup --backup-dir=/var/www/.em-rollback-<ts> --exclude='lesson-pdfs.json' dist/ /var/www/englishmetro/`
- `npx convex deploy` refuses non-interactive terminals and has no `--yes`. Wrap it:
  `script -qec "npx convex deploy" /dev/null <<< "y"`.

## 7. Design pass

Applied the Claude design skill's craft inside the existing `lp-*` system rather than taking its
advice to depart aesthetically — a checkout is where trust converts, and the brief was consistency
with the other pages. Payment marks drawn inline (the CSP is `img-src 'self' data:`, so P24's own
logos would have failed silently), money in tabular figures with a gradient total, a step rail that
fills left to right, two-part shadows, fine grain on the panels, a receipt notch, and a slow sheen on
the submit button. All new motion is neutralised under `prefers-reduced-motion`.

## Open

- Cards: entirely on P24 now. Nothing else blocks them.
- Pricing page and cart drawer were left alone beyond their false card copy.
- Production remains ahead of `origin/gold-deploy`; auto-deploy stays disarmed.
