#!/bin/bash
# Frontend-only: three distinct landmark videos with cached captioned excerpts.
set -Eeuo pipefail
umask 022
REPO=/root/englishmetro
WEB=/var/www/englishmetro
BASE=1ffec826309e0a8c97ead840ec5d627aaef1a87b
STAMP=$(date -u +%Y%m%d-%H%M%S)
BACKUP=/root/backups/englishmetro-landmark-examples-$STAMP
MEDIA=media/keyword-cache-20260909
. "$(dirname "$0")/_guard.sh"
guard_clean_prod "$REPO"
cd "$REPO"
exec 9>/root/englishmetro-homepage-previews-deploy.lock
flock -n 9
REV=$(git rev-parse HEAD)
git merge-base --is-ancestor "$BASE" HEAD
git diff --name-only "$BASE" HEAD | python3 -c '
import sys
allowed={"deploy/deploy-landmark-examples-2026-09-09.sh","src/components/media/prepared-keywords.mjs","src/components/media/keyword-media.mjs","tests/keyword-media.test.mjs","tests/pronunciation-cache.test.mjs","public/media/keyword-cache-20260909/manifest.json","public/media/keyword-cache-20260909/SOURCES.md"}
allowed.update("public/media/keyword-cache-20260909/"+key+"."+ext for key in ("fFGs9kaBy-8-407","2NLQZkT8SHo-292") for ext in ("mp4","jpg","vtt"))
unexpected=[p for p in sys.stdin.read().splitlines() if p not in allowed]
assert not unexpected, f"Unexpected release paths: {unexpected}"
'
space() { test "$(df --output=avail -B1 / | tail -1 | tr -d ' ')" -ge 21474836480; }
space
install -d -m 700 "$BACKUP"
printf '%s\n' "$REV" > "$BACKUP/revision.txt"
for entry in index student-preview; do cp -a "$WEB/$entry.html" "$BACKUP/$entry.html"; done
cp -a "$WEB/$MEDIA/manifest.json" "$BACKUP/manifest.json"
export CONVEX_DEPLOYMENT=prod:wooden-manatee-881
node_modules/.bin/convex function-spec --prod > "$BACKUP/function-spec.json"
node scripts/check-convex-contract.mjs --strict --spec "$BACKUP/function-spec.json" > "$BACKUP/contract.log" 2>&1
mapfile -t TESTS < <(find tests -maxdepth 1 -name '*.test.mjs' ! -name 'overlap.test.mjs' | sort)
node --test "${TESTS[@]}" > "$BACKUP/tests.log" 2>&1
OXC_THREADS=2 RAYON_NUM_THREADS=2 npm run build > "$BACKUP/build.log" 2>&1
guard_clean_prod "$REPO"
test "$(git rev-parse HEAD)" = "$REV"
space
rollback() {
  trap - ERR
  for entry in index student-preview; do
    install -m 644 "$BACKUP/$entry.html" "$WEB/.rollback-$entry-$STAMP.html"
    mv "$WEB/.rollback-$entry-$STAMP.html" "$WEB/$entry.html"
  done
  install -m 644 "$BACKUP/manifest.json" "$WEB/$MEDIA/manifest.json"
  echo "Previous entries and catalogue restored; evidence: $BACKUP"
  exit 1
}
trap rollback ERR
rsync -a --backup --backup-dir="$BACKUP/replaced-assets" dist/assets/ "$WEB/assets/"
for key in fFGs9kaBy-8-407 2NLQZkT8SHo-292; do
  for ext in mp4 jpg vtt; do install -m 644 "public/$MEDIA/$key.$ext" "$WEB/$MEDIA/$key.$ext"; done
done
install -m 644 "public/$MEDIA/manifest.json" "$WEB/$MEDIA/.manifest-$STAMP.json"
mv "$WEB/$MEDIA/.manifest-$STAMP.json" "$WEB/$MEDIA/manifest.json"
for entry in student-preview index; do
  install -m 644 "dist/$entry.html" "$WEB/.$entry-$STAMP.html"
  mv "$WEB/.$entry-$STAMP.html" "$WEB/$entry.html"
done
python3 - "$BACKUP" "$MEDIA" <<'PY'
import hashlib,json,pathlib,re,sys,urllib.request
backup=pathlib.Path(sys.argv[1]);media=sys.argv[2]
opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
def get(path):
    req=urllib.request.Request('https://englishmetro.com/'+path,headers={'User-Agent':'Mozilla/5.0'})
    with opener.open(req,timeout=30) as r:return r.read(),{k.lower():v for k,v in r.headers.items()}
for entry in ['index','student-preview']:
    raw,headers=get(entry+'.html')
    pattern=r'src="(/assets/[^\"]+\.js)"'
    assert re.search(pattern,raw.decode())[1]==re.search(pattern,pathlib.Path('dist',entry+'.html').read_text())[1]
    assert 'https://www.youtube.com' in headers.get('content-security-policy','')
    print('Public entry verified:',entry)
raw,_=get(media+'/manifest.json?v=landmark-3')
manifest=json.loads(raw)
proof=[]
for key in ['qV_CJbh_rD0-286','fFGs9kaBy-8-407','2NLQZkT8SHo-292']:
    assert any(w['word'].lower().strip('.,')=='landmark' for w in manifest['clips'][key]['words'])
    for ext in ['mp4','jpg','vtt']:
        path=media+'/'+key+'.'+ext;raw,headers=get(path)
        assert hashlib.sha256(raw).digest()==hashlib.sha256(pathlib.Path('public',path).read_bytes()).digest()
        if ext=='mp4':assert 'video/mp4' in headers.get('content-type','')
    proof.append(key)
(backup/'verified-videos.json').write_text(json.dumps(proof))
print('Verified three distinct public landmark videos:',proof)
PY
space
df --output=avail -B1 / > "$BACKUP/headroom.txt"
guard_clean_prod "$REPO"
echo "Published $REV; rollback receipt: $BACKUP"
