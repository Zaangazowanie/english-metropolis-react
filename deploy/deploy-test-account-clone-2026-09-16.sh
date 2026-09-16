#!/bin/bash
# Backend-only: admin:cloneStudentForTesting (internal, CLI-run) so a tester can
# be given a copy of a real student's content under their own login.
set -euo pipefail
REPO=/root/englishmetro
BASE=d4c73c4e71f5420d5d8ca505127b717264fcd567
BACKUP=/root/backups/englishmetro-test-account-clone-$(date -u +%Y%m%d-%H%M%S)
. "$(dirname "$0")/_guard.sh"
guard_clean_prod "$REPO"
cd "$REPO"
git diff --name-only "$BASE" HEAD | python3 -c '
import sys
allowed={"convex/admin.ts","deploy/deploy-test-account-clone-2026-09-16.sh"}
bad=[p for p in sys.stdin.read().splitlines() if p not in allowed]
assert not bad,bad
'
test "$(df --output=avail -B1 / | tail -1 | tr -d ' ')" -ge 21474836480
install -d -m 700 "$BACKUP"
git rev-parse HEAD > "$BACKUP/revision.txt"
export CONVEX_DEPLOYMENT=prod:wooden-manatee-881
node_modules/.bin/convex function-spec --prod > "$BACKUP/spec-before.json"
script -qec 'node_modules/.bin/convex deploy --typecheck enable --codegen disable' /dev/null <<< 'y' > "$BACKUP/deploy.log" 2>&1
node_modules/.bin/convex function-spec --prod > "$BACKUP/spec-after.json"
python3 - "$BACKUP/spec-before.json" "$BACKUP/spec-after.json" <<'PY'
import json,sys
def names(p):
 d=json.load(open(p));return {x.get('identifier') or f"HTTP {x['method']} {x['path']}" for x in (d if isinstance(d,list) else d['functions'])}
a,b=map(names,sys.argv[1:]);assert not a-b,a-b
assert any('cloneStudentForTesting' in x for x in b)
print(f'spec ok: {len(b)-len(a)} added, none removed')
PY
node scripts/check-convex-contract.mjs --strict --spec "$BACKUP/spec-after.json" > "$BACKUP/contract.log" 2>&1
guard_clean_prod "$REPO"
push_prod "$REPO"
echo "cloneStudentForTesting deployed. Evidence: $BACKUP"
