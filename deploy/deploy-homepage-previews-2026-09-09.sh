#!/bin/bash
# Frontend-only: public word clips, sharper Bajla media and a sample lesson report.
set -euo pipefail
umask 022
REPO=/root/englishmetro
WEB=/var/www/englishmetro
BASE=3947e0ed42f1ffd36a6d06b4e0e32c3a6961209e
STAMP=$(date -u +%Y%m%d-%H%M%S)
BACKUP=/root/backups/englishmetro-homepage-previews-$STAMP
MEDIA=media/word-previews-20260909
. "$(dirname "$0")/_guard.sh"
guard_clean_prod "$REPO"
cd "$REPO"
exec 9>/root/englishmetro-homepage-previews-deploy.lock
flock -n 9
REV=$(git rev-parse HEAD)
git merge-base --is-ancestor "$BASE" HEAD
# No backend or shared button/animation changes are part of this release.
git diff --quiet "$BASE" HEAD -- convex package.json package-lock.json index.html public/assets src/design src/components src/views/v3/game-home.css src/views/v3/bajla-tour.mjs
git diff --name-only "$BASE" HEAD | python3 -c '
import sys
allowed={"deploy/deploy-homepage-previews-2026-09-09.sh", "src/views/v3/GameHome.jsx", "src/views/v3/BajlaWalkthrough.jsx", "src/views/v3/WordPreviewShowcase.jsx", "src/views/v3/AnalysisPreviewShowcase.jsx", "src/views/v3/NativeWordClip.jsx", "src/views/v3/preview-clips.mjs", "src/views/v3/analysis-preview-data.mjs", "src/views/v3/feature-previews.css", "src/views/v3/native-word-clip.css"}
allowed.update("public/media/word-previews-20260909/"+w+"."+ext for w in ("mural","berth","pescatarian") for ext in ("mp4","jpg","vtt"))
allowed.add("public/media/word-previews-20260909/SOURCES.md")
allowed.update(("tests/homepage-previews-qa.html", "tests/homepage-previews-qa.jsx"))
unexpected=[p for p in sys.stdin.read().splitlines() if p not in allowed]
assert not unexpected, f"Unexpected release paths: {unexpected}"
'
verify_liquid() {
  printf '%s\n' \
    '584f5c26b04105dfbcf19921b061d0f29720a14685fdc2ca08ac723c08ed1ce2  /var/www/englishmetro/assets/em-motion-20260825-v3.js' \
    '9af01dd72594c0296c5a26ad4c4eaaea5db69c95cf36eea9f59fb06803bd5025  /var/www/englishmetro/assets/em-motion-20260825-v3.css' | sha256sum --check
}
verify_liquid
test "$(df --output=avail -B1 / | tail -1 | tr -d ' ')" -ge 21474836480
install -d -m 700 "$BACKUP"
git rev-parse HEAD > "$BACKUP/revision.txt"
cp -a "$WEB/index.html" "$BACKUP/index.html"
export CONVEX_DEPLOYMENT=prod:wooden-manatee-881
node_modules/.bin/convex function-spec --prod > "$BACKUP/function-spec.json"
node scripts/check-convex-contract.mjs --self-test --spec "$BACKUP/function-spec.json" > "$BACKUP/contract-self-test.log" 2>&1
node scripts/check-convex-contract.mjs --strict --spec "$BACKUP/function-spec.json" > "$BACKUP/contract.log" 2>&1
mapfile -t TESTS < <(find tests -maxdepth 1 -name '*.test.mjs' ! -name 'overlap.test.mjs' | sort)
node --test "${TESTS[@]}" > "$BACKUP/tests.log" 2>&1
OXC_THREADS=2 RAYON_NUM_THREADS=2 npm run build > "$BACKUP/build.log" 2>&1
test -s dist/index.html
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
# Publish only build assets and the new, versioned media directory. Do not sync
# all of public/: it also contains separately managed student and motion files.
rsync -a --backup --backup-dir="$BACKUP/replaced-assets" dist/assets/ "$WEB/assets/"
install -d -m 755 "$WEB/$MEDIA"
rsync -a --backup --backup-dir="$BACKUP/replaced-media" "public/$MEDIA/" "$WEB/$MEDIA/"
python3 - "$WEB" "$MEDIA" <<'PY'
import pathlib,re,sys
web=pathlib.Path(sys.argv[1]);entry=pathlib.Path('dist/index.html').read_text()
paths=re.findall(r'(?:src|href)="(/assets/[^"?]+)',entry)
assert paths and all((web/p.lstrip('/')).is_file() for p in paths), 'Entry asset missing'
for word in ('mural','berth','pescatarian'):
    for ext in ('mp4','jpg','vtt'):
        p=web/sys.argv[2]/f'{word}.{ext}'
        assert p.is_file() and p.stat().st_size>20, p
PY
verify_liquid
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
for word in mural berth pescatarian; do
  curl --fail --silent --show-error --max-time 30 -H 'Range: bytes=0-1023' "https://englishmetro.com/$MEDIA/$word.mp4" -D "$BACKUP/$word-headers.txt" -o "$BACKUP/$word-first-bytes.bin"
  test "$(stat -c %s "$BACKUP/$word-first-bytes.bin")" -eq 1024
  grep -q '206' "$BACKUP/$word-headers.txt"
done
verify_liquid
trap - ERR
df --output=avail -B1 / > "$BACKUP/headroom.txt"
echo "Homepage previews published at $REV. Evidence: $BACKUP"
