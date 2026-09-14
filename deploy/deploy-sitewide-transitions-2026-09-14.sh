#!/bin/bash
# Frontend-only release, built on the PC to preserve VPS course headroom.
set -euo pipefail
umask 022
REPO=/root/englishmetro
WEB=/var/www/englishmetro
BASE=149a45935cab5bf97f831ccbbe86731b80b2b3e8
STAMP=$(date -u +%Y%m%d-%H%M%S)
BACKUP=/root/backups/englishmetro-transitions-$STAMP
. "$(dirname "$0")/_guard.sh"
guard_clean_prod "$REPO"
cd "$REPO"
exec 9>/root/englishmetro-frontend-deploy.lock
flock -n 9
REV=$(git rev-parse HEAD)
git merge-base --is-ancestor "$BASE" HEAD
# No backend, credentials, course manifests or service configuration in this release.
git diff --name-only "$BASE" HEAD | python3 -c '
import sys
allowed={
"index.html", "public/about/index.html", "public/cookies/index.html", "public/faq/index.html",
"public/kontakt/index.html", "public/legal/legal.css", "public/ochrona-dzieci/index.html",
"public/privacy/index.html", "public/students/conversa-widget-v5.js", "public/terms/index.html",
"scripts/build-legal-static.mjs", "src/components/BajlaConnectModal.jsx", "src/components/ConsentBanner.jsx",
"src/components/SettingsMenu.jsx", "src/components/VoiceSelector.jsx", "src/components/analytics/AnalyticsPrimitives.jsx",
"src/design/v3/Chrome.jsx", "src/design/v3/primitives.jsx", "src/index.css",
"src/practice/lib/usePrefersReducedMotion.ts", "src/views/admin/superadmin/CommsShared.jsx",
"src/views/public/CartUI.jsx", "src/views/public/Checkout.jsx", "src/views/public/cart-ui.css",
"src/views/public/checkout.css", "src/views/v3/GameHome.jsx", "src/views/v3/KnowledgeBase.jsx",
"src/views/v3/Lessons.jsx", "src/views/v3/NextCourseLesson.jsx", "src/views/v3/Signup.jsx",
"src/views/v3/Vocabulary.jsx", "src/views/v3/WordPreviewShowcase.jsx", "src/views/v3/course-slider.css",
"src/views/v3/game-home.css", "src/views/v3/next-course-lesson.css", "docs/motion.md",
"deploy/deploy-sitewide-transitions-2026-09-14.sh"}
unexpected=[p for p in sys.stdin.read().splitlines() if p not in allowed and not p.startswith(("src/design/v3/motion/","tests/motion/"))]
assert not unexpected, f"Unexpected release paths: {unexpected}"
'
headroom() { test "$(df --output=avail -B1 / | tail -1 | tr -d ' ')" -ge 21474836480; }
headroom
BUILD=$(realpath "${1:?Pass the locally built release directory}")
test "$(cat "$BUILD/release-source-tree.txt")" = "$(git rev-parse HEAD^{tree})"
FILES=(index.html student-preview.html legal/legal.css students/conversa-widget-v5.js
  about/index.html cookies/index.html faq/index.html kontakt/index.html
  ochrona-dzieci/index.html privacy/index.html terms/index.html)
for file in "${FILES[@]}"; do test -s "$BUILD/$file"; test -s "$WEB/$file"; done
# Only new compiled assets; never overwrite the separately maintained public motion assets.
python3 - "$BUILD" <<'PY'
from pathlib import Path
import re,sys
root=Path(sys.argv[1]); assets=root/'assets'
assert assets.is_dir() and list(assets.iterdir())
for file in assets.iterdir():
    assert file.is_file() and not file.is_symlink()
    assert re.search(r'-[A-Za-z0-9_-]{8,}\.[a-z0-9]+$',file.name), file.name
    assert not (Path('public/assets')/file.name).exists(), f'Public asset overwrite: {file.name}'
for entry in ('index.html','student-preview.html'):
    text=(root/entry).read_text()
    for url in re.findall(r'(?:src|href)="(/assets/[^"?]+)"',text):
        assert (root/url.lstrip('/')).is_file(), url
viewer=list(assets.glob('CoursePdfViewer-*.js'))
assert len(viewer)==1 and 'data:text/javascript;base64,' not in viewer[0].read_text()
workers=set(re.findall(r'/assets/pdf\.worker\.min-[A-Za-z0-9_-]+\.js',viewer[0].read_text()))
assert len(workers)==1 and (root/workers.pop().lstrip('/')).is_file()
PY
install -d -m 700 "$BACKUP" "$BACKUP/site"
printf '%s\n' "$REV" > "$BACKUP/revision.txt"
export CONVEX_DEPLOYMENT=prod:wooden-manatee-881
# The backend is unchanged. Verify its live contract rather than redeploy it.
node_modules/.bin/convex function-spec --prod > "$BACKUP/function-spec.json"
node scripts/check-convex-contract.mjs --strict --spec "$BACKUP/function-spec.json" > "$BACKUP/contract.log"
for file in "${FILES[@]}"; do (cd "$WEB" && cp -a --parents "$file" "$BACKUP/site/"); done
sha256sum "$WEB"/assets/em-motion-20260825-v3.{css,js} > "$BACKUP/preserved-motion.sha256"
guard_clean_prod "$REPO"
test "$(git rev-parse HEAD)" = "$REV"
rollback() {
  trap - ERR
  # The private backup root is 0700; never copy that mode onto the public root.
  rsync -a --checksum --no-perms --no-owner --no-group "$BACKUP/site/" "$WEB/"
  echo "Previous entries and static files restored; evidence: $BACKUP"
  exit 1
}
trap rollback ERR
rsync -a --chmod=D755,F644 --backup --backup-dir="$BACKUP/replaced-assets" "$BUILD/assets/" "$WEB/assets/"
for file in "${FILES[@]}"; do
  install -m 644 "$BUILD/$file" "$WEB/$file.release-$STAMP"
  mv "$WEB/$file.release-$STAMP" "$WEB/$file"
done
python3 - "$BUILD" "$BACKUP" <<'PY'
from pathlib import Path
import re,sys,subprocess,hashlib
root,backup=map(Path,sys.argv[1:])
urls=['/','/student-preview.html','/legal/legal.css?v=20260914-motion2','/students/conversa-widget-v5.js?v=20260914-motion2']
urls += [f'/{page}/' for page in ('about','cookies','faq','kontakt','ochrona-dzieci','privacy','terms')]
for entry in ('index.html','student-preview.html'):
    urls += re.findall(r'(?:src|href)="(/assets/[^"?]+)"',(root/entry).read_text())
urls += ['/assets/'+p.name for p in (root/'assets').glob('pdf.worker.min-*.js')]
records=[]
for url in dict.fromkeys(urls):
    print('Verifying public URL:',url,flush=True)
    target=backup/f'verified-{len(records)}.bin'
    result=subprocess.run(['curl','--fail','--silent','--show-error','--max-time','30',
        '--output',str(target),'--write-out','%{content_type}',
        'https://englishmetro.com'+url],check=True,capture_output=True,text=True)
    body=target.read_bytes(); mime=result.stdout.split(';')[0].strip()
    relative=url.split('?')[0].lstrip('/')
    if not relative or relative.endswith('/'): relative+='index.html'
    expected=root/relative
    assert expected.read_bytes()==body, f'Public file differs: {url}'
    if relative.endswith('.js'): assert mime in ('application/javascript','text/javascript'), mime
    if relative.endswith('.css'): assert mime=='text/css', mime
    records.append(f'{url}\t{mime}\t{hashlib.sha256(body).hexdigest()}')
(backup/'public-verification.tsv').write_text('\n'.join(records)+'\n')
print(f'Public release verified: {len(records)} URLs')
PY
sha256sum --check "$BACKUP/preserved-motion.sha256"
headroom
trap - ERR
push_prod "$REPO"
echo "Sitewide transitions deployed at $REV. Evidence: $BACKUP"
