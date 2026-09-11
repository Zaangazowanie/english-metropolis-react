#!/bin/bash
# Raty widget floor (2026-09-11, Mike): the pricing-page instalment badge covers
# every package (RATY_WIDGET_MIN_PLN 2000 -> 100, P24's documented minimum).
# Convex only: the browser reads minAmount from p24:installmentWidgetConfig, so
# no site build. Still dormant while P24_RATY_ZERO_CONFIRMED is unset.
# Run as root: bash /root/englishmetro/deploy/deploy-raty-floor-2026-09-11.sh
set -euo pipefail
TS=$(date -u +%Y%m%d-%H%M%S)
CX=/root/englishmetro; SPEC_DIR=/root/backups/em-convex
CONVEX="$CX/node_modules/.bin/convex"; mkdir -p "$SPEC_DIR"
. "$(dirname "$0")/_guard.sh"; echo "== guard"; guard_clean_prod "$CX"; cd "$CX"
specguard() { python3 - "$1" "$2" <<'PY'
import json, sys
def load(p):
    raw=open(p).read()
    try: s=json.loads(raw)
    except Exception: s=json.loads(raw[raw.index('['):raw.rindex(']')+1])
    fns = s if isinstance(s,list) else s.get('functions',[])
    return {f['identifier'] for f in fns if f.get('identifier')}
a,b=load(sys.argv[1]),load(sys.argv[2]); removed=sorted(a-b)
need={'p24.js:listMethods','p24.js:installmentWidgetConfig','p24.js:finalizePaid','instalmentPlans.js:listPlans','operations.js:getCommandCenter','scheduling.js:bookLessons'}
missing=sorted(need-b)
print('  added:  ', ', '.join(sorted(b-a)) or '(none)'); print('  removed:', ', '.join(removed) or '(none)')
if removed or missing: sys.exit(f'STOP - removed={removed} missing={missing}')
print('  spec ok')
PY
}
echo "== 1/5 typecheck + offline suites"; npx tsc --noEmit -p convex/tsconfig.json; bash tests/instalments/run.sh | tail -1; node tests/p24-pipeline.test.mjs | tail -1
echo "== 2/5 spec BEFORE"; "$CONVEX" function-spec --prod > "$SPEC_DIR/function-spec-before-ratyfloor-$TS.json"
echo "== 3/5 convex deploy"; if [ -t 0 ]; then "$CONVEX" deploy; else script -qec "$CONVEX deploy" /dev/null <<< "y"; fi
echo "== 4/5 spec AFTER + guard"; "$CONVEX" function-spec --prod > "$SPEC_DIR/function-spec-after-ratyfloor-$TS.json"; specguard "$SPEC_DIR/function-spec-before-ratyfloor-$TS.json" "$SPEC_DIR/function-spec-after-ratyfloor-$TS.json"
echo "== 5/5 contract check"; node scripts/check-convex-contract.mjs --strict --spec "$SPEC_DIR/function-spec-after-ratyfloor-$TS.json"
echo -n "  installmentWidgetConfig on prod (null while Raty hidden): "; "$CONVEX" run p24:installmentWidgetConfig '{}' --prod 2>/dev/null || true
echo "ROLLBACK: git revert HEAD && rerun; convex BEFORE spec $SPEC_DIR/function-spec-before-ratyfloor-$TS.json"
push_prod "$CX"; echo "done $TS"
