#!/bin/bash
# Deploy from clean canonical prod. The optional prebuilt directory must carry
# this exact git tree hash; it lets Bob build without adding load to the VPS.
set -euo pipefail
umask 022
REPO=/root/englishmetro
WEB=/var/www/englishmetro
STAMP=$(date -u +%Y%m%d-%H%M%S)
BACKUP=/root/backups/englishmetro-student-access-$STAMP
. "$(dirname "$0")/_guard.sh"
guard_clean_prod "$REPO"
cd "$REPO"
install -d -m 700 "$BACKUP"
BUILD=${1:-$REPO/dist}
if [ "$#" -gt 0 ]; then
  test "$(cat "$BUILD/release-source-tree.txt")" = "$(git rev-parse HEAD^{tree})"
else
  OXC_THREADS=2 RAYON_NUM_THREADS=2 npm run build > "$BACKUP/build.log" 2>&1
fi
test -s "$BUILD/index.html"
node --test tests/admin-student-view.test.mjs tests/student-data-refresh.test.mjs tests/student-view-session.test.mjs tests/student-view-practice.test.mjs tests/arcade-demo-progress.test.mjs > "$BACKUP/tests.log"
node_modules/.bin/convex function-spec --prod > "$BACKUP/spec-before.json"
if [ "${STUDENT_ACCESS_FRONTEND_ONLY:-0}" = 1 ]; then
  # This baseline completed the backend deploy and live access/revocation checks.
  # Reuse it only when every backend file and dependency remains identical.
  BASE=21737dd171502475c6b6542f951ae75b478e4a94
  git merge-base --is-ancestor "$BASE" HEAD
  git diff --quiet "$BASE" HEAD -- convex package.json package-lock.json yarn.lock pnpm-lock.yaml
  echo "Reusing verified backend from $BASE" > "$BACKUP/convex-deploy.log"
else
  # Additive backend: no existing handler or schema changes in this release.
  script -qec 'node_modules/.bin/convex deploy --typecheck enable --codegen disable' /dev/null <<< 'y' > "$BACKUP/convex-deploy.log" 2>&1
fi
node_modules/.bin/convex function-spec --prod > "$BACKUP/spec-after.json"
python3 - "$BACKUP/spec-before.json" "$BACKUP/spec-after.json" <<'PY'
import json, sys
def functions(path):
    data=json.load(open(path))
    # HTTP routes have no identifier; include their method/path in the guard.
    return {x.get('identifier') or f"HTTP {x['method']} {x['path']}"
            for x in (data if isinstance(data,list) else data['functions'])}
before,after=map(functions,sys.argv[1:])
assert not before-after, f'Functions disappeared: {before-after}'
assert {'adminStudentView.js:start','adminStudentView.js:end'} <= after
print('Backend spec verified; no functions removed.')
PY
node scripts/check-convex-contract.mjs --self-test --spec "$BACKUP/spec-after.json" > "$BACKUP/contract-selftest.log"
node scripts/check-convex-contract.mjs --strict --spec "$BACKUP/spec-after.json" > "$BACKUP/contract.log"
cp -a "$WEB/index.html" "$BACKUP/index.html"
rollback() {
  trap - ERR
  cp -a "$BACKUP/index.html" "$WEB/index.html"
  echo "Frontend entry restored. Evidence: $BACKUP"
  exit 1
}
trap rollback ERR
# Keep all existing hashed chunks and learner PDFs. Index is switched last.
rsync -a --backup --backup-dir="$BACKUP/replaced" --exclude='index.html' --exclude='lesson-pdfs.json' --exclude='release-source-tree.txt' --exclude='/play/' --exclude='students/*/pdfs/' "$BUILD/" "$WEB/"
install -m 644 "$BUILD/index.html" "$WEB/.index-$STAMP.html"
mv "$WEB/.index-$STAMP.html" "$WEB/index.html"
curl --fail --silent --show-error --max-time 45 https://englishmetro.com/ > "$BACKUP/edge.html"
python3 - "$WEB/index.html" "$BACKUP/edge.html" <<'PY'
import pathlib,re,sys
pattern=r'src="(/assets/index-[^\"]+\.js)"'
local,edge=(re.search(pattern,pathlib.Path(p).read_text()) for p in sys.argv[1:])
assert local and edge and local[1]==edge[1], 'Public entry does not match deployed bundle'
print('Public entry verified:',edge[1])
PY
trap - ERR
echo "Student access deployed; checks and rollback: $BACKUP"
