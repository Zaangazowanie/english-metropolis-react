#!/bin/bash
# Course page heading: show the student's real course ("B2 Places Course") instead of
# the hardcoded "Pilot Course" label. Convex first (additive: curriculum:getCourseLabel),
# then the frontend that calls it. Never the other way — the new query must exist before
# the bundle that queries it goes live.
set -euo pipefail
umask 022
REPO=/root/englishmetro
WEB=/var/www/englishmetro
STAMP=$(date -u +%Y%m%d-%H%M%S)
BACKUP=/root/backups/englishmetro-course-name-$STAMP
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
assert any('getCourseLabel' in f for f in after), 'curriculum:getCourseLabel did not deploy'
print(f'Backend spec verified; {len(after)-len(before)} added, none removed.')
PY
cp -a "$WEB/index.html" "$BACKUP/index.html"
rollback() { trap - ERR; cp -a "$BACKUP/index.html" "$WEB/index.html"; echo "Frontend entry restored. Evidence: $BACKUP"; exit 1; }
trap rollback ERR

# Copy EVERY asset, not just index-*. A change that touches a lazily-loaded view or a
# shared chunk (an i18n dictionary, say) re-hashes those chunks too; shipping only
# index-* and then swapping index.html points the live entry at chunks that were never
# uploaded, and the app 404s on load. This is additive — existing hashed files stay put,
# so clients holding the previous index.html keep working.
new=0
for f in dist/assets/*; do
  b=$(basename "$f")
  [ -e "$WEB/assets/$b" ] || { install -m 644 "$f" "$WEB/assets/$b"; new=$((new+1)); }
done
echo "  uploaded $new new asset(s)"

# Verify BEFORE the swap: every asset the new entry references must already be on disk.
# Strip any ?v= cache-buster before the existence test — the hand-maintained
# em-motion-*.css/js are referenced that way and live on disk without the suffix.
missing=$(grep -oE '(src|href)="/assets/[^"]+"' dist/index.html \
          | sed -E 's|.*"/assets/([^"?]+).*"|\1|' | sort -u \
          | while read -r b; do [ -e "$WEB/assets/$b" ] || echo "$b"; done)
if [ -n "$missing" ]; then
  echo "!! new index.html references assets that are not on the server:"; echo "$missing"
  false
fi

install -m 644 dist/index.html "$WEB/.index-$STAMP.html"
mv "$WEB/.index-$STAMP.html" "$WEB/index.html"
grep -o 'index-[^"]*\.js' "$WEB/index.html" | head -1
echo "Deployed. Evidence: $BACKUP"
