#!/bin/bash
# Frontend-only correction: package-specific Przelewy24 calculator links.
# Existing Convex functions and the enabled Raty flag remain in place.
set -euo pipefail
umask 022
REPO=/root/englishmetro
WEB=/var/www/englishmetro
BASE=b8f59d9
STAMP=$(date -u +%Y%m%d-%H%M%S)
BACKUP=/root/backups/englishmetro-raty-calculator-$STAMP
. "$(dirname "$0")/_guard.sh"
guard_clean_prod "$REPO"
cd "$REPO"
exec 9>/root/englishmetro-raty-calculator-deploy.lock
flock -n 9
REV=$(git rev-parse HEAD)
git merge-base --is-ancestor "$BASE" HEAD
git diff --quiet "$BASE" HEAD -- convex package.json package-lock.json
git diff --name-only "$BASE" HEAD | python3 -c '
import sys
allowed={"deploy/deploy-raty-calculator-2026-09-14.sh", "src/views/public/RatyWidget.jsx"}
unexpected=[p for p in sys.stdin.read().splitlines() if p not in allowed]
assert not unexpected, f"Unexpected release paths: {unexpected}"
'
test "$(df --output=avail -B1 / | tail -1 | tr -d ' ')" -ge 21474836480
install -d -m 700 "$BACKUP"
git rev-parse HEAD > "$BACKUP/revision.txt"
cp -a "$WEB/index.html" "$BACKUP/index.html"
export CONVEX_DEPLOYMENT=prod:wooden-manatee-881
node_modules/.bin/convex function-spec --prod > "$BACKUP/function-spec.json"
node scripts/check-convex-contract.mjs --strict --spec "$BACKUP/function-spec.json" > "$BACKUP/contract.log" 2>&1
OXC_THREADS=2 RAYON_NUM_THREADS=2 npm run build > "$BACKUP/build.log" 2>&1
test -s dist/index.html
grep -q 'getCalculatorUrl' dist/assets/*.js
test "$(df --output=avail -B1 / | tail -1 | tr -d ' ')" -ge 21474836480
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
rsync -a --backup --backup-dir="$BACKUP/replaced-assets" dist/assets/ "$WEB/assets/"
python3 - "$WEB" <<'PY'
import pathlib,re,sys
web=pathlib.Path(sys.argv[1]);entry=pathlib.Path('dist/index.html').read_text()
paths=re.findall(r'(?:src|href)="(/assets/[^"?]+)',entry)
assert paths and all((web/p.lstrip('/')).is_file() for p in paths), 'Entry asset missing'
PY
install -m 644 dist/index.html "$WEB/.index-$STAMP.html"
mv "$WEB/.index-$STAMP.html" "$WEB/index.html"
curl --fail --silent --show-error --max-time 30 https://englishmetro.com/pricing > "$BACKUP/edge.html"
python3 - "$WEB/index.html" "$BACKUP/edge.html" <<'PY'
import pathlib,re,sys
local,edge=(pathlib.Path(p).read_text() for p in sys.argv[1:])
pattern=r'src="(/assets/index-[^\"]+\.js)"'
expected,actual=re.search(pattern,local),re.search(pattern,edge)
assert expected and actual and expected[1]==actual[1], 'Public entry does not match release'
print('Public entry verified:',actual[1])
PY
trap - ERR
push_prod "$REPO"
echo "Raty calculator release published at $REV. Evidence: $BACKUP"
