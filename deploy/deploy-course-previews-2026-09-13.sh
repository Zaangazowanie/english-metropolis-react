#!/bin/bash
# Student-only next-course-lesson keywords/PDFs; additive backend, no course writes.
set -euo pipefail
umask 022
REPO=/root/englishmetro
WEB=/var/www/englishmetro
STAMP=$(date -u +%Y%m%d-%H%M%S)
BACKUP=/root/backups/englishmetro-course-previews-$STAMP
. "$(dirname "$0")/_guard.sh"
guard_clean_prod "$REPO"
cd "$REPO"
exec 9>/root/englishmetro-course-previews-deploy.lock
flock -n 9
REV=$(git rev-parse HEAD)
test "$(df --output=avail -B1 / | tail -1 | tr -d ' ')" -ge 21474836480
install -d -m 700 "$BACKUP"
npm ci --ignore-scripts > "$BACKUP/npm-ci.log" 2>&1
git rev-parse HEAD > "$BACKUP/revision.txt"
BUILD=${1:-$REPO/dist}
if [ "$#" -gt 0 ]; then
  test "$(cat "$BUILD/release-source-tree.txt")" = "$(git rev-parse HEAD^{tree})"
else
  OXC_THREADS=2 RAYON_NUM_THREADS=2 npm run build > "$BACKUP/build.log" 2>&1
fi
test -s "$BUILD/index.html"
node --test tests/course-preview-auth.test.mjs tests/student-data-refresh.test.mjs tests/student-view-session.test.mjs > "$BACKUP/tests.log"
python3 tests/test_student_previews.py > "$BACKUP/python-tests.log" 2>&1
export CONVEX_DEPLOYMENT=prod:wooden-manatee-881
node_modules/.bin/convex function-spec --prod > "$BACKUP/spec-before.json"
script -qec 'node_modules/.bin/convex deploy --typecheck enable --codegen disable' /dev/null <<< 'y' > "$BACKUP/convex-deploy.log" 2>&1
node_modules/.bin/convex function-spec --prod > "$BACKUP/spec-after.json"
python3 - "$BACKUP/spec-before.json" "$BACKUP/spec-after.json" <<'PY'
import json,sys
def names(path):
    data=json.load(open(path))
    return {x.get('identifier') or f"HTTP {x['method']} {x['path']}" for x in (data if isinstance(data,list) else data['functions'])}
before,after=map(names,sys.argv[1:])
assert not before-after, f'Functions disappeared: {before-after}'
assert 'coursePreviews.js:context' in after
print('Backend contract preserved; student preview context added.')
PY
node scripts/check-convex-contract.mjs --strict --spec "$BACKUP/spec-after.json" > "$BACKUP/contract.log"
cp -a "$WEB/index.html" "$BACKUP/index.html"
rollback() {
  trap - ERR
  if [ -f "$BACKUP/console-server.py" ]; then
    cp -a "$BACKUP/console-server.py" /root/em-console-api/server.py
    systemctl restart em-console-api
  fi
  cp -a "$BACKUP/index.html" "$WEB/index.html"
  echo "Frontend/API restored. Additive Convex query is harmless. Evidence: $BACKUP"
  exit 1
}
trap rollback ERR
python3 ops/em-console-api/install-student-previews.py "$BACKUP"
python3 -m py_compile /root/em-console-api/server.py /root/em-console-api/student_previews.py
systemctl restart em-console-api
for i in {1..20}; do
  CODE=$(curl -s -o "$BACKUP/auth-denied.json" -w '%{http_code}' http://127.0.0.1:8811/api/console/student/next-lesson || true)
  [ "$CODE" = 401 ] && break
  sleep 1
done
test "$CODE" = 401
guard_clean_prod "$REPO"
test "$(git rev-parse HEAD)" = "$REV"
rsync -a --backup --backup-dir="$BACKUP/replaced-assets" "$BUILD/assets/" "$WEB/assets/"
install -m 644 "$BUILD/index.html" "$WEB/.index-$STAMP.html"
mv "$WEB/.index-$STAMP.html" "$WEB/index.html"
curl --fail --silent --show-error --max-time 30 https://englishmetro.com/ > "$BACKUP/edge.html"
python3 - "$WEB/index.html" "$BACKUP/edge.html" <<'PY'
import pathlib,re,sys
expected,actual=(re.search(r'src="(/assets/index-[^\"]+\.js)"',pathlib.Path(p).read_text()) for p in sys.argv[1:])
assert expected and actual and expected[1] == actual[1], 'Public entry does not match release'
print('Public entry verified:',actual[1])
PY
test "$(df --output=avail -B1 / | tail -1 | tr -d ' ')" -ge 21474836480
trap - ERR
push_prod "$REPO"
echo "Course previews deployed at $REV. Rollback and evidence: $BACKUP"
