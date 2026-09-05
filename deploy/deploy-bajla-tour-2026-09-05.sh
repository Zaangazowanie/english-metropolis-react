#!/bin/bash
# Publish the Bajla autoplay tour and landing copy from the canonical clean prod tree.
# Backend and dependency trees must match the already deployed baseline; read its
# live Convex spec and validate the frontend contract before publishing static files.
set -euo pipefail
umask 022
REPO=/root/englishmetro
WEB=/var/www/englishmetro
BASE=164ae1c406aa34c97bfcf7f5c8014251aac512c8
STAMP=$(date -u +%Y%m%d-%H%M%S)
BACKUP=/root/backups/englishmetro-bajla-tour-$STAMP
. "$(dirname "$0")/_guard.sh"
guard_clean_prod "$REPO"
cd "$REPO"
git diff --quiet "$BASE" HEAD -- convex package.json package-lock.json
install -d -m 700 "$BACKUP"
node_modules/.bin/convex function-spec --prod > "$BACKUP/function-spec.json"
node scripts/check-convex-contract.mjs --self-test --spec "$BACKUP/function-spec.json"
node scripts/check-convex-contract.mjs --strict --spec "$BACKUP/function-spec.json"
node --test tests/bajla-tour.test.mjs
OXC_THREADS=2 RAYON_NUM_THREADS=2 npm run build > "$BACKUP/build.log" 2>&1
test -s dist/index.html
test -d "$WEB/assets"
cp -a "$WEB/index.html" "$BACKUP/index.html"
rollback() {
  trap - ERR
  cp -a "$BACKUP/index.html" "$WEB/index.html"
  echo "Previous landing entry restored; deployment failed. Evidence: $BACKUP"
  exit 1
}
trap rollback ERR
# Keep existing hashed chunks for open tabs. Upload dependencies before the HTML entry.
rsync -a --backup --backup-dir="$BACKUP/replaced" --exclude='index.html' --exclude='lesson-pdfs.json' dist/ "$WEB/"
install -m 644 dist/index.html "$WEB/.index-$STAMP.html"
mv "$WEB/.index-$STAMP.html" "$WEB/index.html"
curl --fail --silent --show-error --max-time 30 https://englishmetro.com/ > "$BACKUP/edge.html"
python3 - "$WEB/index.html" "$BACKUP/edge.html" <<'PY'
import pathlib, re, sys
local, edge = (pathlib.Path(path).read_text() for path in sys.argv[1:])
pattern = r'src="(/assets/index-[^\"]+\.js)"'
expected, actual = re.search(pattern, local), re.search(pattern, edge)
if not expected or not actual or expected[1] != actual[1]:
    raise SystemExit('Public HTML does not reference the newly published entry bundle.')
print('Public entry verified:', actual[1])
PY
trap - ERR
echo "Bajla tour published. Build, contract and rollback evidence: $BACKUP"
