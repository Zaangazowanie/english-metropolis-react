# Email marketing consent — 14 September 2026

The owner requested optional email offers consent when new students create an account, an email draft about Raty 0%, and unsubscribe controls. Promotional email sending remains unapproved pending review of that draft.

## Current email operation

The server-side SQLite CRM has zero non-deleted contacts, email campaigns and email-send records. `/root/em-console-api/em_mail.py` has no send transport (`_transport` deliberately raises `NotImplementedError`), and its default send flag is disabled. Account verification, booking, payment and instalment-due reminders are separate transactional paths. A campaign register is not an operational newsletter service.

Checkout already records its optional `consentMarketing` flag on individual `p24Payments` records. Historical checkout choices are not automatically imported by this change. That requires a separate consent-evidence and suppression reconciliation before any campaign uses those records. No existing student is subscribed by this release.

## This release

- Email/password signup, the legacy signup mutation and Google account creation accept optional marketing consent. The English/Polish checkbox is unticked by default and never required for signup. Existing Google sign-ins leave consent alone.
- A separate `marketingPreferences` record holds the current choice for the canonical account email. `marketingConsentEvents` keeps the timestamp, source, notice version, exact wording and language for each explicit choice. Cached clients omitting the argument remain unsubscribed and produce no fabricated consent event.
- `/email-preferences` permits authenticated students to change their choice. Student Settings links to it. Reading state never changes it. Essential service mail is unaffected.
- A personal unsubscribe link contains a random 256-bit bearer token in the URL fragment, so the token is absent from HTTP access logs and referrers. Only its SHA-256 hash is stored. The link reveals no email address, requires no login and can only withdraw consent after the recipient clicks the confirmation button. Opening the email/link alone has no side effect. Repeat withdrawals are safe; old links remain usable after resubscription.
- `emailPreferences:prepareRecipient` is internal only. It returns a recipient and link only for an active account with a verified address and explicit current consent. No SMTP transport, send queue or schedule is connected. A future sender must recheck consent immediately before every send, honor bounce suppression and reconcile the legacy CRM/checkout evidence. A generated recipient preview is not permission to send later without rechecking.

## Validation and deployment

`node --test tests/marketing-consent.test.mjs` executes the real handlers with synthetic data: all signup paths, omitted/unchecked/checked consent, authentication boundaries, verified-address eligibility, immutable service state, valid/invalid bearer tokens and repeat unsubscribes. No account or email is created in production by these tests.

`deploy/deploy-marketing-consent-2026-09-14.sh` runs from the clean canonical VPS `prod` checkout. It requires at least 20 GiB free, restricts release paths, runs tests/build, deploys additive Convex changes before the frontend, checks the live function contract and preserves the previous frontend entry and replaced assets in a timestamped backup.

For a frontend rollback, restore the receipt's `index.html` atomically; retain the additive backend and consent records. Do not revert the schema after consent records have been collected. Sending remains absent throughout.
