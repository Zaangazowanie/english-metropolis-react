#!/bin/bash
# Frontend-only slider image release; retain old assets for atomic rollback.
set -euo pipefail
umask 022
REPO=/root/englishmetro
WEB=/var/www/englishmetro
BASE=bb93e3fbeb747ddb861761040664a6981e23005a
STAMP=$(date -u +%Y%m%d-%H%M%S)
BACKUP=/root/backups/englishmetro-slider-photography-$STAMP
. "$(dirname "$0")/_guard.sh"
guard_clean_prod "$REPO"
cd "$REPO"
exec 9>/root/englishmetro-slider-photography-deploy.lock
flock -n 9
REV=$(git rev-parse HEAD)
git merge-base --is-ancestor "$BASE" HEAD
git diff --name-only "$BASE" HEAD | python3 -c '
import sys
allowed={"src/views/v3/GameHome.jsx","src/views/v3/CourseSlider.jsx","docs/slider-photography-2026-09-09.md","deploy/deploy-slider-photography-2026-09-09.sh"}
allowed.update("public/home/slider-20260909/"+s+".webp" for s in ("school","evening","lifelong","practice","courses/interviews","courses/exams","courses/relocation","courses/work","courses/groups","courses/plan"))
unexpected=[p for p in sys.stdin.read().splitlines() if p not in allowed]
assert not unexpected,unexpected
'
verify_motion() {
  printf '%s\n' '584f5c26b04105dfbcf19921b061d0f29720a14685fdc2ca08ac723c08ed1ce2  /var/www/englishmetro/assets/em-motion-20260825-v3.js' '9af01dd72594c0296c5a26ad4c4eaaea5db69c95cf36eea9f59fb06803bd5025  /var/www/englishmetro/assets/em-motion-20260825-v3.css' | sha256sum --check
}
verify_motion
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
rsync -a --backup --backup-dir="$BACKUP/replaced-assets" dist/assets/ "$WEB/assets/"
install -d -m 755 "$WEB/home/slider-20260909"
rsync -a --backup --backup-dir="$BACKUP/replaced-images" dist/home/slider-20260909/ "$WEB/home/slider-20260909/"
python3 - "$WEB" <<'PY'
import pathlib,re,sys,hashlib
web=pathlib.Path(sys.argv[1]);entry=pathlib.Path('dist/index.html').read_text()
paths=re.findall(r'(?:src|href)="(/assets/[^"?]+)',entry)
assert paths and all((web/p.lstrip('/')).is_file() for p in paths)
images=list(pathlib.Path('public/home/slider-20260909').rglob('*.webp'))
assert len(images)==10
for p in images:
    assert hashlib.sha256(p.read_bytes()).digest()==hashlib.sha256((web/p.relative_to('public')).read_bytes()).digest()
PY
verify_motion
install -m 644 dist/index.html "$WEB/.index-$STAMP.html"
mv "$WEB/.index-$STAMP.html" "$WEB/index.html"
curl --fail --silent --show-error --max-time 30 https://englishmetro.com/ > "$BACKUP/edge.html"
python3 - "$WEB/index.html" "$BACKUP/edge.html" <<'PY'
import pathlib,re,sys,urllib.request,hashlib
local,edge=(pathlib.Path(p).read_text() for p in sys.argv[1:])
pattern=r'src="(/assets/index-[^\"]+\.js)"'
expected,actual=re.search(pattern,local),re.search(pattern,edge)
assert expected and actual and expected[1]==actual[1], 'Public entry mismatch'
for p in pathlib.Path('public/home/slider-20260909').rglob('*.webp'):
    url='https://englishmetro.com/'+str(p.relative_to('public'))
    # The public edge rejects Python's default user agent; use an explicit
    # browser-compatible request while preserving HTTPS and full hash checks.
    request=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0'})
    with urllib.request.urlopen(request,timeout=30) as r:
        assert r.status==200 and 'image/webp' in r.headers.get('Content-Type','')
        assert hashlib.sha256(r.read()).digest()==hashlib.sha256(p.read_bytes()).digest(),url
print('Public entry and all ten image hashes verified',actual[1])
PY
verify_motion
trap - ERR
df --output=avail -B1 / > "$BACKUP/headroom.txt"
echo "Slider photography published at $REV. Evidence: $BACKUP"
