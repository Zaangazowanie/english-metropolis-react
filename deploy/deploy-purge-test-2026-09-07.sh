#!/bin/bash
# Backend-only deploy: adds admin:purgeTestStudentRecords (superadmin, archived
# students only). No schema change, no handler edits, no frontend switch.
set -euo pipefail
umask 022
REPO=/root/englishmetro
STAMP=$(date -u +%Y%m%d-%H%M%S)
BACKUP=/root/backups/englishmetro-purge-test-$STAMP
. "$(dirname "$0")/_guard.sh"
guard_clean_prod "$REPO"
cd "$REPO"
install -d -m 700 "$BACKUP"
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
assert 'admin.js:purgeTestStudentRecords' in after, 'purge mutation missing from deployed spec'
print(f'Backend spec verified; {len(after)-len(before)} added, none removed.')
PY
echo "Deployed. Evidence: $BACKUP"
