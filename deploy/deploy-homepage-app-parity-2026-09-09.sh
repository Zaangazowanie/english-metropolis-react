#!/bin/bash
# Frontend-only: the public previews render the production student components.
set -euo pipefail
umask 022
REPO=/root/englishmetro
WEB=/var/www/englishmetro
# Replace the full lesson frame with an analysis-only playback preview.
# Preserve the compact vocabulary, flashcard fix and shared design assets.
BASE=c7c36def6d550832f6f222059b919e51b1f9baf4
STAMP=$(date -u +%Y%m%d-%H%M%S)
BACKUP=/root/backups/englishmetro-app-parity-$STAMP
MEDIA=media/keyword-cache-20260909
HEADERS=/etc/nginx/snippets/em-security-headers.conf
. "$(dirname "$0")/_guard.sh"
guard_clean_prod "$REPO"
cd "$REPO"
exec 9>/root/englishmetro-homepage-previews-deploy.lock
flock -n 9
REV=$(git rev-parse HEAD)
git merge-base --is-ancestor "$BASE" HEAD
git diff --quiet "$BASE" HEAD -- convex package.json package-lock.json index.html public/assets src/design src/views/v3/game-home.css src/views/v3/BajlaWalkthrough.jsx src/views/v3/bajla-tour.mjs
git diff --name-only "$BASE" HEAD | python3 -c '
import sys
allowed={"deploy/deploy-homepage-app-parity-2026-09-09.sh","src/views/v3/AnalysisPreviewShowcase.jsx","src/views/v3/Lessons.jsx","src/previews/AnalysisFilm.jsx","src/previews/analysis-film.css","src/previews/analysis-film.mjs","tests/analysis-film.test.mjs"}
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
cp -a "$HEADERS" "$BACKUP/security-headers.conf"
if test -f "$WEB/student-preview.html"; then cp -a "$WEB/student-preview.html" "$BACKUP/student-preview.html"; fi
# The backend is unchanged. Verify its live API before any publication.
export CONVEX_DEPLOYMENT=prod:wooden-manatee-881
node_modules/.bin/convex function-spec --prod > "$BACKUP/function-spec.json"
node scripts/check-convex-contract.mjs --self-test --spec "$BACKUP/function-spec.json" > "$BACKUP/contract-self-test.log" 2>&1
node scripts/check-convex-contract.mjs --strict --spec "$BACKUP/function-spec.json" > "$BACKUP/contract.log" 2>&1
mapfile -t TESTS < <(find tests -maxdepth 1 -name '*.test.mjs' ! -name 'overlap.test.mjs' | sort)
node --test "${TESTS[@]}" > "$BACKUP/tests.log" 2>&1
OXC_THREADS=2 RAYON_NUM_THREADS=2 npm run build > "$BACKUP/build.log" 2>&1
test -s dist/index.html
test -s dist/student-preview.html
test "$(df --output=avail -B1 / | tail -1 | tr -d ' ')" -ge 21474836480
guard_clean_prod "$REPO"
test "$(git rev-parse HEAD)" = "$REV"
rollback() {
  trap - ERR
  install -m 644 "$BACKUP/index.html" "$WEB/.rollback-$STAMP.html"
  mv "$WEB/.rollback-$STAMP.html" "$WEB/index.html"
  if test -f "$BACKUP/student-preview.html"; then
    install -m 644 "$BACKUP/student-preview.html" "$WEB/.preview-rollback-$STAMP.html"
    mv "$WEB/.preview-rollback-$STAMP.html" "$WEB/student-preview.html"
  else
    rm -f "$WEB/student-preview.html"
  fi
  cp -a "$BACKUP/security-headers.conf" "$HEADERS"
  nginx -t && systemctl reload nginx
  echo "Previous entries and CSP restored; evidence: $BACKUP"
  exit 1
}
trap rollback ERR
# Enable same-site app frames and the official YouTube player API. All other
# directives remain byte-for-byte unchanged. Refuse unrelated policy drift.
python3 - "$HEADERS" <<'PY'
import hashlib,pathlib,sys
p=pathlib.Path(sys.argv[1]);old=p.read_text()
before="20db9c65f3facb525030b449549d43a00f972580a5bc5950d9d2162b6aeb1294"
base=old.replace("frame-src 'self' https://www.youtube.com", "frame-src https://www.youtube.com")
base=base.replace("script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.youtube.com https://s.ytimg.com", "script-src 'self' 'unsafe-inline' 'unsafe-eval'")
assert hashlib.sha256(base.encode()).hexdigest()==before, "Unexpected CSP changes"
new=base.replace("frame-src https://www.youtube.com", "frame-src 'self' https://www.youtube.com")
new=new.replace("script-src 'self' 'unsafe-inline' 'unsafe-eval'", "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.youtube.com https://s.ytimg.com")
p.write_text(new)
PY
nginx -t > "$BACKUP/nginx-test.log" 2>&1
cp -a "$HEADERS" "$BACKUP/security-headers-published.conf"
systemctl reload nginx
# Reload returns before the replacement workers necessarily serve requests.
# Keep the previous HTML public until the required CSP is visible at the edge.
python3 - "$BACKUP" "$STAMP" <<'PY'
import pathlib,subprocess,sys,time
backup=pathlib.Path(sys.argv[1])
required=("frame-src 'self' https://www.youtube.com",
          "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.youtube.com https://s.ytimg.com")
for attempt in range(1,31):
    headers=backup/f"csp-ready-{attempt:02d}.txt"
    result=subprocess.run(["curl","--fail","--silent","--show-error","--max-time","10",
                           "-D",str(headers),"-o","/dev/null",
                           f"https://englishmetro.com/?csp-ready={sys.argv[2]}-{attempt}"],
                          capture_output=True,text=True)
    policy=headers.read_text() if headers.exists() else ""
    if result.returncode==0 and all(value in policy for value in required):
        print(f"Public CSP ready on attempt {attempt}",flush=True)
        break
    print(f"Waiting for public CSP: attempt {attempt}/30",flush=True)
    time.sleep(1)
else:
    raise SystemExit("Public CSP did not become ready; refusing to publish HTML")
PY
# Publish only build assets and the versioned keyword cache.
rsync -a --backup --backup-dir="$BACKUP/replaced-assets" dist/assets/ "$WEB/assets/"
install -d -m 755 "$WEB/$MEDIA"
rsync -a --backup --backup-dir="$BACKUP/replaced-media" "public/$MEDIA/" "$WEB/$MEDIA/"
python3 - "$WEB" "$MEDIA" <<'PY'
import json,pathlib,re,sys
web=pathlib.Path(sys.argv[1])
for name in ("index.html","student-preview.html"):
    entry=pathlib.Path("dist",name).read_text()
    paths=re.findall(r'(?:src|href)="(/assets/[^"?]+)',entry)
    assert paths and all((web/p.lstrip('/')).is_file() for p in paths), "Entry asset missing"
manifest=json.loads((web/sys.argv[2]/"manifest.json").read_text())
assert len(manifest["clips"])==30
for key in manifest["clips"]:
    for ext in ("mp4","jpg","vtt"):
        p=web/sys.argv[2]/f"{key}.{ext}"
        assert p.is_file() and p.stat().st_size>20, p
PY
verify_liquid
for entry in student-preview index; do
  install -m 644 "dist/$entry.html" "$WEB/.$entry-$STAMP.html"
  mv "$WEB/.$entry-$STAMP.html" "$WEB/$entry.html"
done
for entry in index student-preview; do
  curl --fail --silent --show-error --max-time 30 "https://englishmetro.com/$entry.html" -D "$BACKUP/$entry-headers.txt" > "$BACKUP/$entry-edge.html"
done
python3 - "$WEB" "$BACKUP" <<'PY'
import pathlib,re,sys
web,backup=map(pathlib.Path,sys.argv[1:])
for name in ("index","student-preview"):
    local=(web/f"{name}.html").read_text();edge=(backup/f"{name}-edge.html").read_text()
    pattern=r'src="(/assets/[^\"]+\.js)"'
    expected,actual=re.search(pattern,local),re.search(pattern,edge)
    assert expected and actual and expected[1]==actual[1], "Public entry mismatch"
    headers=(backup/f"{name}-headers.txt").read_text()
    assert "frame-src 'self' https://www.youtube.com" in headers
    assert "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.youtube.com https://s.ytimg.com" in headers
    print("Public entry verified:",actual[1])
PY
for key in sNFh9bL5yzg-949 H0zeipr-cVc-530 6d-LMzIlr5I-3119; do
  curl --fail --silent --show-error --max-time 30 -H 'Range: bytes=0-1023' "https://englishmetro.com/$MEDIA/$key.mp4" -D "$BACKUP/$key-headers.txt" -o "$BACKUP/$key-first-bytes.bin"
  test "$(stat -c %s "$BACKUP/$key-first-bytes.bin")" -eq 1024
  grep -q '206' "$BACKUP/$key-headers.txt"
done
verify_liquid
test "$(df --output=avail -B1 / | tail -1 | tr -d ' ')" -ge 21474836480
trap - ERR
df --output=avail -B1 / > "$BACKUP/headroom.txt"
echo "Student app previews published at $REV. Evidence: $BACKUP"
