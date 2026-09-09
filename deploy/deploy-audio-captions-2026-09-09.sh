#!/bin/bash
# Saved Kokoro examples and shared student caption playback; frontend only.
set -euo pipefail
umask 022
REPO=/root/englishmetro
WEB=/var/www/englishmetro
BASE=471dc4e030d2011df29cde20f2aa9dd6f7b597b3
STAMP=$(date -u +%Y%m%d-%H%M%S)
BACKUP=/root/backups/englishmetro-audio-captions-$STAMP
MEDIA=media/kokoro-demo-20260909
. "$(dirname "$0")/_guard.sh"
guard_clean_prod "$REPO"
cd "$REPO"
exec 9>/root/englishmetro-homepage-previews-deploy.lock
flock -n 9
REV=$(git rev-parse HEAD)
git merge-base --is-ancestor "$BASE" HEAD
git diff --quiet "$BASE" HEAD -- convex package.json package-lock.json index.html public/assets src/design src/views/v3/game-home.css
git diff --name-only "$BASE" HEAD | python3 -c '
import sys
allowed={
"deploy/deploy-audio-captions-2026-09-09.sh",
"src/assets/production-script-10.js",
"src/components/media/KeywordPronunciationButton.jsx","src/components/media/KeywordVideoPlayer.jsx",
"src/components/media/keyword-media.mjs","src/components/media/pronunciation.mjs","src/components/media/prepared-keywords.mjs",
"src/i18n/en.json","src/i18n/pl.json","src/previews/student-demo-data.mjs",
"src/views/Lessons.jsx","src/views/Vocabulary.jsx",
"src/views/admin/superadmin/ConsoleIntegrations.jsx","src/views/admin/superadmin/ConsoleLessonNotes.jsx",
"src/views/admin/superadmin/CoursePublisher.jsx","src/views/admin/superadmin/SuperadminLibrary.jsx",
"src/views/v3/BajlaWalkthrough.jsx","src/views/v3/Lessons.jsx","src/views/v3/NativeWordClip.jsx",
"src/views/v3/Vocabulary.jsx","src/views/v3/WordPreviewShowcase.jsx","src/views/v3/preview-clips.mjs",
"tests/homepage-previews-qa.jsx","tests/audio-captions-qa.html","tests/audio-captions-qa.jsx","tests/pronunciation-cache.test.mjs"}
unexpected=[p for p in sys.stdin.read().splitlines() if p not in allowed and not p.startswith("public/media/kokoro-demo-20260909/")]
assert not unexpected, f"Unexpected release paths: {unexpected}"
'
space() { test "$(df --output=avail -B1 / | tail -1 | tr -d ' ')" -ge 21474836480; }
liquid() {
  printf '%s\n' \
    '584f5c26b04105dfbcf19921b061d0f29720a14685fdc2ca08ac723c08ed1ce2  /var/www/englishmetro/assets/em-motion-20260825-v3.js' \
    '9af01dd72594c0296c5a26ad4c4eaaea5db69c95cf36eea9f59fb06803bd5025  /var/www/englishmetro/assets/em-motion-20260825-v3.css' | sha256sum --check
}
verify_audio() {
python3 - "$1" <<'PY'
import hashlib,json,pathlib,re,sys,wave
root=pathlib.Path(sys.argv[1]);manifest=json.loads((root/'manifest.json').read_text())
assert manifest['revision']=='f3ff3571791e39611d31c381e3a41a3af07b4987'
assert len(manifest['files'])==168
assert len({r['file'] for r in manifest['files']})==168
assert len({r['voice'] for r in manifest['files']})==28
for row in manifest['files']:
    assert re.fullmatch(r'[ab][fm]_[a-z]+-(landmark|berth|pescatarian)(-example)?\.wav',row['file'])
    path=root/row['file'];assert not path.is_symlink()
    assert path.stat().st_size==row['bytes']
    assert hashlib.sha256(path.read_bytes()).hexdigest()==row['sha256']
    with wave.open(str(path)) as audio:
        assert audio.getframerate()==24000 and audio.getnchannels()==1 and audio.getsampwidth()==2 and audio.getnframes()>2400
print('Verified 168 complete, pinned Kokoro WAVs')
PY
}
space
liquid
verify_audio "public/$MEDIA"
install -d -m 700 "$BACKUP"
git rev-parse HEAD > "$BACKUP/revision.txt"
cp -a "$WEB/index.html" "$BACKUP/index.html"
cp -a "$WEB/student-preview.html" "$BACKUP/student-preview.html"
export CONVEX_DEPLOYMENT=prod:wooden-manatee-881
node_modules/.bin/convex function-spec --prod > "$BACKUP/function-spec.json"
node scripts/check-convex-contract.mjs --self-test --spec "$BACKUP/function-spec.json" > "$BACKUP/contract-self-test.log" 2>&1
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
  echo "Previous public entries restored; evidence: $BACKUP"
  exit 1
}
trap rollback ERR
rsync -a --backup --backup-dir="$BACKUP/replaced-assets" dist/assets/ "$WEB/assets/"
install -d -m 755 "$WEB/$MEDIA"
rsync -a --backup --backup-dir="$BACKUP/replaced-audio" "public/$MEDIA/" "$WEB/$MEDIA/"
verify_audio "$WEB/$MEDIA"
python3 - "$WEB" <<'PY'
import pathlib,re,sys
web=pathlib.Path(sys.argv[1])
for name in ['index','student-preview']:
    entry=pathlib.Path('dist',name+'.html').read_text()
    paths=re.findall(r'(?:src|href)="(/assets/[^"?]+)',entry)
    assert paths and all((web/p.lstrip('/')).is_file() for p in paths)
PY
liquid
for entry in student-preview index; do
  install -m 644 "dist/$entry.html" "$WEB/.$entry-$STAMP.html"
  mv "$WEB/.$entry-$STAMP.html" "$WEB/$entry.html"
done
python3 - "$BACKUP" "$MEDIA" <<'PY'
import hashlib,json,pathlib,re,sys,time,urllib.request
backup=pathlib.Path(sys.argv[1]);opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
def get(path):
    before=time.monotonic()
    req=urllib.request.Request('https://englishmetro.com/'+path,headers={'User-Agent':'Mozilla/5.0'})
    with opener.open(req,timeout=20) as response: return response.read(),dict(response.headers),round(time.monotonic()-before,3)
for name in ['index','student-preview']:
    raw,headers,_=get(name+'.html');edge=raw.decode();local=pathlib.Path('dist',name+'.html').read_text()
    pattern=r'src="(/assets/[^\"]+\.js)"'
    assert re.search(pattern,local)[1]==re.search(pattern,edge)[1], 'Public entry mismatch'
    assert "https://www.youtube.com" in headers.get('Content-Security-Policy','')
    (backup/(name+'-public.html')).write_text(edge)
    print('Public entry verified:',re.search(pattern,edge)[1])
manifest=json.loads(pathlib.Path('public',sys.argv[2],'manifest.json').read_text())
proof=[]
for row in manifest['files']:
    if row['voice']!='af_heart':continue
    raw,headers,elapsed=get(sys.argv[2]+'/'+row['file'])
    assert hashlib.sha256(raw).hexdigest()==row['sha256']
    assert 'audio/' in headers.get('Content-Type','')
    proof.append({'file':row['file'],'seconds':elapsed,'bytes':len(raw),'contentType':headers.get('Content-Type'),'cacheControl':headers.get('Cache-Control')})
(backup/'public-audio.json').write_text(json.dumps(proof,indent=2))
print(json.dumps(proof))
PY
space
liquid
df --output=avail -B1 / > "$BACKUP/headroom.txt"
guard_clean_prod "$REPO"
echo "Published $REV; rollback receipt: $BACKUP"
