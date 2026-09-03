# Working rules for this repository (VPS: /root/englishmetro; Bob: ~/projects/english-metropolis-react)

Written 2026-09-03 after the second-clone/worktree drift was cleaned up. Every agent (Ricky on the
VPS, Codex on Bob or on the VPS) follows these; they exist so a deploy is never surprised by what
is on disk.

- `prod` is the only long-lived branch. It is exactly what runs on englishmetro.com and on Convex
  prod (wooden-manatee-881). `master` is historical and frozen.
- The VPS checkout `/root/englishmetro` is the ONLY tree that deploys. `/root/em-ops-merged-20260826`
  is a compatibility symlink to it; `/root/em-deploy-clone.retired-20260903` is a dead copy.
- Deploy only via `deploy/*.sh` (Convex first, spec guard, contract check, rsync with backup dir).
  Every deploy script refuses to run on a dirty tree or off `prod`: commit first, deploy, push.
- Off-VPS work (Codex on Bob): `git fetch && git checkout prod && git reset --hard origin/prod`, then a
  `codex/<topic>` branch and a PR into `prod`. Never `convex deploy`, never rsync to /var/www from there.
- No editor backups beside files (`*.pre-*`, `*.bak*`); they are ignored, use git.
- Secrets never enter the repo. The tracked `.env*` files carry public `VITE_` values only.
- Handler tests: `bash tests/scheduling/run.sh` (81 cases) after touching convex/scheduling.ts,
  billing.ts or authHelpers.ts.
