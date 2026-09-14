#!/bin/bash
# Optional signup consent + self-service email preferences. No campaign sending.
set -euo pipefail
umask 022
REPO=/root/englishmetro
WEB=/var/www/englishmetro
BASE=1301766d76ff1827c06bfcaee8928c8f3c768693
STAMP=$(date -u +%Y%m%d-%H%M%S)
BACKUP=/root/backups/englishmetro-marketing-consent-$STAMP
. "$(dirname "$0")/_guard.sh"
guard_clean_prod "$REPO"
cd "$REPO"
exec 9>/root/englishmetro-marketing-consent-deploy.lock
flock -n 9
REV=$(git rev-parse HEAD)
git merge-base --is-ancestor "$BASE" HEAD
git diff --name-only "$BASE" HEAD | python3 -c '
import sys
allowed={"convex/schema.ts","convex/studentAuth.ts","convex/googleAuth.ts","convex/marketingConsent.ts","convex/emailPreferences.ts","shared/marketingNotice.ts","src/main.jsx","src/views/Settings.jsx","src/views/v3/Signup.jsx","src/views/v3/EmailPreferences.jsx","tests/marketing-consent.test.mjs","deploy/deploy-marketing-consent-2026-09-14.sh","docs/marketing-consent-2026-09-14.md"}
unexpected=[p for p in sys.stdin.read().splitlines() if p not in allowed]
assert not unexpected, f"Unexpected release paths: {unexpected}"
'
test "$(df --output=avail -B1 / | tail -1 | tr -d ' ')" -ge 21474836480
install -d -m 700 "$BACKUP"
git rev-parse HEAD > "$BACKUP/revision.txt"
cp -a "$WEB/index.html" "$BACKUP/index.html"
node --test tests/marketing-consent.test.mjs > "$BACKUP/tests.log" 2>&1
OXC_THREADS=2 RAYON_NUM_THREADS=2 npm run build > "$BACKUP/build.log" 2>&1
test -s dist/index.html
export CONVEX_DEPLOYMENT=prod:wooden-manatee-881
node_modules/.bin/convex function-spec --prod > "$BACKUP/spec-before.json"
script -qec 'node_modules/.bin/convex deploy --typecheck enable --codegen disable' /dev/null <<< 'y' > "$BACKUP/convex-deploy.log" 2>&1
node_modules/.bin/convex function-spec --prod > "$BACKUP/spec-after.json"
python3 - "$BACKUP/spec-before.json" "$BACKUP/spec-after.json" <<'PY'
import json,sys
def functions(p):
    d=json.load(open(p));return {x.get('identifier') or f"HTTP {x['method']} {x['path']}" for x in (d if isinstance(d,list) else d['functions'])}
before,after=map(functions,sys.argv[1:])
assert not before-after,f'Functions disappeared: {before-after}'
for name in ('mine','setMine','unsubscribe','prepareRecipient'):
    assert any(f'emailPreferences:{name}' in x or f'emailPreferences.js:{name}' in x for x in after),f'Missing {name}'
print('Consent functions present; no existing functions removed.')
PY
node scripts/check-convex-contract.mjs --strict --spec "$BACKUP/spec-after.json" > "$BACKUP/contract.log" 2>&1
test "$(df --output=avail -B1 / | tail -1 | tr -d ' ')" -ge 21474836480
guard_clean_prod "$REPO"
test "$(git rev-parse HEAD)" = "$REV"
rollback() {
  trap - ERR
  install -m 644 "$BACKUP/index.html" "$WEB/.rollback-$STAMP.html"
  mv "$WEB/.rollback-$STAMP.html" "$WEB/index.html"
  echo "Previous entry restored; additive consent backend retained. Evidence: $BACKUP"
  exit 1
}
trap rollback ERR
rsync -a --backup --backup-dir="$BACKUP/replaced-assets" dist/assets/ "$WEB/assets/"
python3 - "$WEB" <<'PY'
import pathlib,re,sys
web=pathlib.Path(sys.argv[1]);entry=pathlib.Path('dist/index.html').read_text()
paths=re.findall(r'(?:src|href)="(/assets/[^"?]+)',entry)
assert paths and all((web/p.lstrip('/')).is_file() for p in paths),'Entry asset missing'
PY
install -m 644 dist/index.html "$WEB/.index-$STAMP.html"
mv "$WEB/.index-$STAMP.html" "$WEB/index.html"
curl --fail --silent --show-error --max-time 30 https://englishmetro.com/signup > "$BACKUP/edge.html"
python3 - "$WEB/index.html" "$BACKUP/edge.html" <<'PY'
import pathlib,re,sys
local,edge=(pathlib.Path(p).read_text() for p in sys.argv[1:])
pattern=r'src="(/assets/index-[^\"]+\.js)"'
expected,actual=re.search(pattern,local),re.search(pattern,edge)
assert expected and actual and expected[1]==actual[1],'Public entry does not match release'
print('Public entry verified:',actual[1])
PY
trap - ERR
push_prod "$REPO"
echo "Marketing consent published at $REV. Evidence: $BACKUP"
