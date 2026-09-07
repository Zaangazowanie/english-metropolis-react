#!/bin/bash
# Teacher/course assignment propagation. Convex first (additive: listTeachers
# gains allOrganizations, updateStudent re-points future bookings and syncs
# memberships), then the frontend that sends the new arg. Never the other way.
set -euo pipefail
umask 022
REPO=/root/englishmetro
WEB=/var/www/englishmetro
STAMP=$(date -u +%Y%m%d-%H%M%S)
BACKUP=/root/backups/englishmetro-row-dropdowns-$STAMP
. "$(dirname "$0")/_guard.sh"
guard_clean_prod "$REPO"
cd "$REPO"
install -d -m 700 "$BACKUP"
OXC_THREADS=2 RAYON_NUM_THREADS=2 npm run build > "$BACKUP/build.log" 2>&1
test -s dist/index.html
node_modules/.bin/convex function-spec --prod > "$BACKUP/spec-before.json"
script -qec 'node_modules/.bin/convex deploy --typecheck enable --codegen disable' /dev/null <<< 'y' > "$BACKUP/convex-deploy.log" 2>&1
node_modules/.bin/convex function-spec --prod > "$BACKUP/spec-after.json"
python3 - "$BACKUP/spec-before.json" "$BACKUP/spec-after.json" <<'PY'
import json, sys
def functions(path):
    data=json.load(open(path))
    return {x.get('identifier') or f"HTTP {x['method']} {x['path']}"
            for x in (data if isinstance(data,list) else data['functions'])}
before,after=map(functions,sys.argv[1:])
assert not before-after, f'Functions disappeared: {before-after}'
print(f'Backend spec verified; {len(after)-len(before)} added, none removed.')
PY
cp -a "$WEB/index.html" "$BACKUP/index.html"
rollback() { trap - ERR; cp -a "$BACKUP/index.html" "$WEB/index.html"; echo "Frontend entry restored. Evidence: $BACKUP"; exit 1; }
trap rollback ERR
cp dist/assets/index-*.js dist/assets/index-*.css "$WEB/assets/"
install -m 644 dist/index.html "$WEB/.index-$STAMP.html"
mv "$WEB/.index-$STAMP.html" "$WEB/index.html"
grep -o 'index-[^"]*\.js' "$WEB/index.html" | head -1
echo "Deployed. Evidence: $BACKUP"
