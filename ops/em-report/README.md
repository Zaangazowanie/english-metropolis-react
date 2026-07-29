# Online withdrawal production integration

`withdrawal.cjs` implements the public, no-login withdrawal acknowledgement
path used by `POST /api/withdrawal-request`.

Production integration on `srv1369762`:

- `/root/em-report/server.cjs` imports `submitWithdrawal` from
  `/root/em-report/withdrawal.cjs`.
- The server route parses JSON, passes the actual forwarded IP, and returns the
  module's JSON status. It does not pass `testMode`.
- `/etc/nginx/sites-available/englishmetro.com` proxies the exact
  `/api/withdrawal-request` path to `127.0.0.1:8810` with the `api_heavy`
  rate limit and a 64 KiB body limit.
- The customer email is sent first. The endpoint returns success only after
  the EnglishMetro mail relay accepts the durable-medium acknowledgement.
- The acknowledgement contains the submitted statement, its receipt reference,
  and its Warsaw date and time. Internal copies then go to EnglishMetro.
- `BOOKING_EMAIL_MODE` never reroutes live withdrawal acknowledgements.
  `testMode` is available only to direct internal module calls.

Deployment backups created on 2026-07-29:

- `/root/em-report/server.cjs.backup-20260729-withdrawal`
- `/etc/nginx/sites-available/englishmetro.com.backup-20260729-withdrawal`
- `/root/em-report/regulamin-englishmetro.pdf.backup-20260729-legal`

Isolated mail test receipt: `EM-WD-20260729-2C24A3` (explicitly marked as not
a real withdrawal).
