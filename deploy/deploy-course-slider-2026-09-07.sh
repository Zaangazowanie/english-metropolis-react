#!/bin/bash
# Static homepage release: preserve the deployed backend and all existing chunks.
set -euo pipefail
umask 022
REPO=/root/englishmetro
WEB=/var/www/englishmetro
BASE=88f8aa203eec0e3ee42acc3d87d913abeedc6e0e
STAMP=$(date -u +%Y%m%d-%H%M%S)
BACKUP=/root/backups/englishmetro-course-slider-$STAMP
. "$(dirname "$0")/_guard.sh"
guard_clean_prod "$REPO"
cd "$REPO"
exec 9>/root/englishmetro-course-slider-deploy.lock
flock -n 9
REV=$(git rev-parse HEAD)
git merge-base --is-ancestor "$BASE" HEAD
git diff --quiet "$BASE" HEAD -- convex package.json package-lock.json
# Refuse to bundle unrelated changes into this bounded frontend release.
git diff --name-only "$BASE" HEAD | python3 -c '
import sys
allowed={"src/views/v3/GameHome.jsx", "src/views/v3/CourseSlider.jsx",
"src/views/v3/course-slider.css", "src/views/v3/course-slides.js",
"src/views/public/LessonPricingSignup.jsx", "deploy/deploy-course-slider-2026-09-07.sh"}
unexpected=[p for p in sys.stdin.read().splitlines() if p not in allowed and not p.startswith("public/home/courses/")]
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
for scene in interviews exams relocation work groups plan; do
  test -s "dist/home/courses/$scene.webp"
done
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
install -d "$WEB/home/courses"
rsync -a --backup --backup-dir="$BACKUP/replaced-courses" dist/home/courses/ "$WEB/home/courses/"
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
for scene in interviews exams relocation work groups plan; do
  curl --fail --silent --show-error --max-time 30 "https://englishmetro.com/home/courses/$scene.webp" > "$BACKUP/$scene.webp"
  cmp "dist/home/courses/$scene.webp" "$BACKUP/$scene.webp"
done
trap - ERR
echo "Course slider published at $REV. Rollback and verification evidence: $BACKUP"
