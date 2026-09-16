#!/bin/bash
# Szymon Z. fixes (frontend only): flashcard frame, clip tail, audible TTS fallback.
#   phase frontend — publish the dist/ built from HEAD (after local verification)
set -euo pipefail
umask 022
REPO=/root/englishmetro
WEB=/var/www/englishmetro
BASE=f9122c2
PHASE=${1:?phase: convex | frontend}
STAMP=$(date -u +%Y%m%d-%H%M%S)
BACKUP=/root/backups/englishmetro-szymon-fixes-$PHASE-$STAMP
. "$(dirname "$0")/_guard.sh"
guard_clean_prod "$REPO"
cd "$REPO"
git diff --name-only "$BASE" HEAD | python3 -c '
import sys
allowed={"src/views/v3/Vocabulary.jsx","src/components/media/KeywordVideoPlayer.jsx",
         "deploy/deploy-szymon-fixes-2026-09-16.sh"}
bad=[p for p in sys.stdin.read().splitlines() if p not in allowed]
assert not bad,bad
'
test "$(df --output=avail -B1 / | tail -1 | tr -d ' ')" -ge 21474836480
install -d -m 700 "$BACKUP"
git rev-parse HEAD > "$BACKUP/revision.txt"
export CONVEX_DEPLOYMENT=prod:wooden-manatee-881

if [ "$PHASE" = convex ]; then
  node_modules/.bin/convex function-spec --prod > "$BACKUP/spec-before.json"
  script -qec 'node_modules/.bin/convex deploy --typecheck enable --codegen disable' /dev/null <<< 'y' > "$BACKUP/deploy.log" 2>&1
  node_modules/.bin/convex function-spec --prod > "$BACKUP/spec-after.json"
  python3 - "$BACKUP/spec-before.json" "$BACKUP/spec-after.json" <<'PY'
import json,sys
def names(p):
 d=json.load(open(p));return {x.get('identifier') or f"HTTP {x['method']} {x['path']}" for x in (d if isinstance(d,list) else d['functions'])}
a,b=map(names,sys.argv[1:]);assert not a-b,a-b
assert any('sentenceFreshness.js:getMany' in x for x in b)
print(f'spec ok: {len(b)-len(a)} added, none removed')
PY
  node scripts/check-convex-contract.mjs --strict --spec "$BACKUP/spec-after.json" > "$BACKUP/contract.log" 2>&1
  echo "Convex deployed. Evidence: $BACKUP"
  exit 0
fi

# ── frontend ──
test -s dist/index.html
grep -q 'v3-flashcard-face-front{position:relative' dist/assets/*.js
grep -q 'TTS unavailable, using browser speech' dist/assets/*.js
node_modules/.bin/convex function-spec --prod > "$BACKUP/function-spec.json"
true
cp -a "$WEB/index.html" "$BACKUP/index.html"
rollback() { trap - ERR; cp -a "$BACKUP/index.html" "$WEB/index.html"; echo "Frontend entry restored. Evidence: $BACKUP"; exit 1; }
trap rollback ERR
# Additive: new hashed chunks only; the hand-maintained public motion assets are never touched.
rsync -a --chmod=D755,F644 --ignore-existing "dist/assets/" "$WEB/assets/"
install -m 644 dist/index.html "$WEB/.index-$STAMP.html"
mv "$WEB/.index-$STAMP.html" "$WEB/index.html"
ENTRY=$(grep -o 'index-[^"]*\.js' "$WEB/index.html" | head -1)
curl --fail --silent --max-time 30 -A 'Mozilla/5.0 Chrome' "https://englishmetro.com/assets/$ENTRY" -o "$BACKUP/entry.js"
cmp "$BACKUP/entry.js" "dist/assets/$ENTRY"
curl --fail --silent --max-time 30 -A 'Mozilla/5.0 Chrome' 'https://englishmetro.com/login' | grep -q "$ENTRY"
push_prod "$REPO"
echo "Frontend deployed: $ENTRY. Evidence: $BACKUP"
