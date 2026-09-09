#!/bin/bash
# Backend-only release: an audited, package-bounded gift of lesson analysis.
set -euo pipefail
umask 022
REPO=/root/englishmetro
BASE=1bafaa0
STAMP=$(date -u +%Y%m%d-%H%M%S)
BACKUP=/root/backups/englishmetro-complimentary-analysis-$STAMP
. "$(dirname "$0")/_guard.sh"
guard_clean_prod "$REPO"
cd "$REPO"
exec 9>/root/englishmetro-homepage-previews-deploy.lock
flock -n 9
REV=$(git rev-parse HEAD)
git merge-base --is-ancestor "$BASE" HEAD
git diff --name-only "$BASE" HEAD | python3 -c '
import sys
allowed={"convex/analysisAccess.ts","convex/complimentaryAnalysis.ts","convex/schema.ts","convex/students.ts","convex/analytics.ts","convex/analysisOffers.ts","tests/complimentary-analysis.test.mjs","deploy/deploy-complimentary-analysis-2026-09-09.sh","docs/complimentary-analysis-2026-09-09.md"}
unexpected=[p for p in sys.stdin.read().splitlines() if p not in allowed]
assert not unexpected, f"Unexpected release paths: {unexpected}"
'
test "$(df --output=avail -B1 / | tail -1 | tr -d ' ')" -ge 21474836480
install -d -m 700 "$BACKUP"
printf '%s\n' "$REV" > "$BACKUP/revision.txt"
sha256sum /var/www/englishmetro/index.html > "$BACKUP/frontend.sha256"
export CONVEX_DEPLOYMENT=prod:wooden-manatee-881
node_modules/.bin/convex function-spec --prod > "$BACKUP/spec-before.json"
node --test tests/complimentary-analysis.test.mjs > "$BACKUP/tests.log" 2>&1
node_modules/.bin/tsc --noEmit -p convex/tsconfig.json > "$BACKUP/typecheck.log" 2>&1
guard_clean_prod "$REPO"
test "$(git rev-parse HEAD)" = "$REV"
script -qec 'node_modules/.bin/convex deploy --typecheck enable --codegen disable' /dev/null <<< 'y' > "$BACKUP/deploy.log" 2>&1
node_modules/.bin/convex function-spec --prod > "$BACKUP/spec-after.json"
python3 - "$BACKUP/spec-before.json" "$BACKUP/spec-after.json" <<'PY'
import json,sys
def names(p):
 d=json.load(open(p));return {f.get('identifier') or f"HTTP {f['method']} {f['path']}" for f in (d if isinstance(d,list) else d['functions'])}
before,after=map(names,sys.argv[1:]);assert before<=after, before-after
added=after-before
assert len(added)==2 and all(n.startswith('complimentaryAnalysis:') or n.startswith('complimentaryAnalysis.js:') for n in added),added
print('Existing API preserved; added',sorted(added))
PY
node scripts/check-convex-contract.mjs --self-test --spec "$BACKUP/spec-after.json" > "$BACKUP/contract-self-test.log" 2>&1
node scripts/check-convex-contract.mjs --strict --spec "$BACKUP/spec-after.json" > "$BACKUP/contract.log" 2>&1
sha256sum --check "$BACKUP/frontend.sha256"
guard_clean_prod "$REPO"
echo "Complimentary analysis backend deployed: $REV; evidence: $BACKUP"
