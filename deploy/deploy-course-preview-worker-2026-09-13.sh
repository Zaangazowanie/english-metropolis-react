#!/bin/bash
# Frontend-only correction: emit the PDF worker as a same-origin JavaScript file.
set -euo pipefail
umask 022
REPO=/root/englishmetro
WEB=/var/www/englishmetro
BASE=8f910992dbc37ee84fd95a17b820d2819a31d1e5
STAMP=$(date -u +%Y%m%d-%H%M%S)
BACKUP=/root/backups/englishmetro-course-preview-worker-$STAMP
. "$(dirname "$0")/_guard.sh"
guard_clean_prod "$REPO"
cd "$REPO"
exec 9>/root/englishmetro-course-previews-deploy.lock
flock -n 9
REV=$(git rev-parse HEAD)
git merge-base --is-ancestor "$BASE" HEAD
git diff --name-only "$BASE" HEAD | python3 -c '
import sys
allowed={"src/views/v3/CoursePdfViewer.jsx", "deploy/deploy-course-preview-worker-2026-09-13.sh"}
unexpected=set(sys.stdin.read().splitlines())-allowed
assert not unexpected, f"Unexpected release paths: {unexpected}"
'
test "$(df --output=avail -B1 / | tail -1 | tr -d ' ')" -ge 21474836480
BUILD=${1:?Pass the locally built release directory}
test "$(cat "$BUILD/release-source-tree.txt")" = "$(git rev-parse HEAD^{tree})"
test -s "$BUILD/index.html"
WORKER=$(python3 - "$BUILD" <<'PY'
from pathlib import Path
import re,sys
root=Path(sys.argv[1])
viewer=list((root/'assets').glob('CoursePdfViewer-*.js'))
assert len(viewer)==1, 'Expected one viewer chunk'
code=viewer[0].read_text()
assert 'data:text/javascript;base64,' not in code, 'Inlined worker violates CSP'
paths=set(re.findall(r'/assets/pdf\.worker\.min-[A-Za-z0-9_-]+\.js',code))
assert len(paths)==1, 'Expected one same-origin JavaScript worker'
worker=paths.pop()
assert (root/worker.lstrip('/')).is_file()
print(worker)
PY
)
install -d -m 700 "$BACKUP"
git rev-parse HEAD > "$BACKUP/revision.txt"
export CONVEX_DEPLOYMENT=prod:wooden-manatee-881
node_modules/.bin/convex function-spec --prod > "$BACKUP/function-spec.json"
node scripts/check-convex-contract.mjs --strict --spec "$BACKUP/function-spec.json" > "$BACKUP/contract.log"
cp -a "$WEB/index.html" "$BACKUP/index.html"
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
rsync -a --backup --backup-dir="$BACKUP/replaced-assets" "$BUILD/assets/" "$WEB/assets/"
curl --fail --silent --show-error --max-time 30 -D "$BACKUP/worker-headers.txt" "https://englishmetro.com$WORKER" > "$BACKUP/worker.js"
cmp "$BUILD$WORKER" "$BACKUP/worker.js"
grep -Eiq '^content-type: (application|text)/javascript' "$BACKUP/worker-headers.txt"
install -m 644 "$BUILD/index.html" "$WEB/.index-$STAMP.html"
mv "$WEB/.index-$STAMP.html" "$WEB/index.html"
curl --fail --silent --show-error --max-time 30 https://englishmetro.com/ > "$BACKUP/edge.html"
python3 - "$WEB/index.html" "$BACKUP/edge.html" <<'PY'
from pathlib import Path
import re,sys
expected,actual=(re.search(r'src="(/assets/index-[^\"]+\.js)"',Path(p).read_text()) for p in sys.argv[1:])
assert expected and actual and expected[1]==actual[1], 'Public entry does not match release'
print('Public entry verified:',actual[1])
PY
test "$(df --output=avail -B1 / | tail -1 | tr -d ' ')" -ge 21474836480
trap - ERR
push_prod "$REPO"
echo "PDF worker correction deployed at $REV. Evidence: $BACKUP"
