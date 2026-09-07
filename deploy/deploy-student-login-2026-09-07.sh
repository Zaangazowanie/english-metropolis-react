#!/bin/bash
# Student login persistence: save the session before navigation.
set -euo pipefail
umask 022
REPO=/root/englishmetro
WEB=/var/www/englishmetro
BASE=6788dc98b91ec2e834c8c161a6ea1109f42613f7
STAMP=$(date -u +%Y%m%d-%H%M%S)
BACKUP=/root/backups/englishmetro-student-login-$STAMP
. "$(dirname "$0")/_guard.sh"
guard_clean_prod "$REPO"
cd "$REPO"
exec 9>/root/englishmetro-student-login-deploy.lock
flock -n 9
REV=$(git rev-parse HEAD)
git merge-base --is-ancestor "$BASE" HEAD
git diff --quiet "$BASE" HEAD -- convex package.json package-lock.json
# Refuse to bundle unrelated changes into this bounded frontend release.
git diff --name-only "$BASE" HEAD | python3 -c '
import sys
allowed={"src/contexts/StudentAuthContext.jsx", "src/lib/student-session.js", "src/views/v3/Login.jsx", "tests/student-login-persistence.test.mjs", "deploy/deploy-student-login-2026-09-07.sh"}
unexpected=[p for p in sys.stdin.read().splitlines() if p not in allowed]
assert not unexpected, f"Unexpected release paths: {unexpected}"
'
install -d -m 700 "$BACKUP"
git rev-parse HEAD > "$BACKUP/revision.txt"
cp -a "$WEB/index.html" "$BACKUP/index.html"
# No backend changes: validate against its live spec instead of redeploying it.
node_modules/.bin/convex function-spec --prod > "$BACKUP/function-spec.json"
node scripts/check-convex-contract.mjs --self-test --spec "$BACKUP/function-spec.json" > "$BACKUP/contract-self-test.log" 2>&1
node scripts/check-convex-contract.mjs --strict --spec "$BACKUP/function-spec.json" > "$BACKUP/contract.log" 2>&1
# overlap.test.mjs is a separate browser harness requiring its own preview server.
mapfile -t TESTS < <(find tests -maxdepth 1 -name '*.test.mjs' ! -name 'overlap.test.mjs' | sort)
node --test "${TESTS[@]}" > "$BACKUP/tests.log" 2>&1
OXC_THREADS=2 RAYON_NUM_THREADS=2 npm run build > "$BACKUP/build.log" 2>&1
test -s dist/index.html
guard_clean_prod "$REPO"
test "$(git rev-parse HEAD)" = "$REV"
rollback() {
  trap - ERR
  install -m 644 "$BACKUP/index.html" "$WEB/.rollback-$STAMP.html"
  mv "$WEB/.rollback-$STAMP.html" "$WEB/index.html"
  echo "Previous entry restored; evidence: $BACKUP"
  exit 1
}
trap rollback ERR
# Only new build chunks and course artwork; do not overwrite other public data.
rsync -a --backup --backup-dir="$BACKUP/replaced-assets" dist/assets/ "$WEB/assets/"
install -m 644 dist/index.html "$WEB/.index-$STAMP.html"
mv "$WEB/.index-$STAMP.html" "$WEB/index.html"
curl --fail --silent --show-error --max-time 30 https://englishmetro.com/ > "$BACKUP/edge.html"
python3 - "$WEB/index.html" "$BACKUP/edge.html" <<'PY'
import pathlib,re,sys
local,edge=(pathlib.Path(p).read_text() for p in sys.argv[1:])
pattern=r'src="(/assets/index-[^\"]+\.js)"'
expected,actual=re.search(pattern,local),re.search(pattern,edge)
assert expected and actual and expected[1]==actual[1], 'Public entry does not match release'
print('Public entry verified:',actual[1])
PY
trap - ERR
echo "Student login published at $REV. Rollback and verification evidence: $BACKUP"
