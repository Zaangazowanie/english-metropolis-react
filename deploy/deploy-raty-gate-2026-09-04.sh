#!/bin/bash
# Raty gate (2026-09-04, Mike): hide the Przelewy24 Raty tile until P24 answer the
# tenor-by-basket question; ship P24's own instalment widget on pricing cards
# behind the same RATY_OFFERED switch (renders nothing while false). CSP already
# admits apm.przelewy24.pl (em-security-headers.conf, reloaded 07:5x UTC).
# Run as root: bash /root/englishmetro/deploy/deploy-raty-gate-2026-09-04.sh
set -euo pipefail
TS=$(date -u +%Y%m%d-%H%M%S)
CX=/root/englishmetro; WEB=/var/www/englishmetro; SPEC_DIR=/root/backups/em-convex
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
echo "== 0/7 spec guard self-test"; specguard "$SPEC_DIR/self-test-after.json" "$SPEC_DIR/self-test-before.json" >/dev/null 2>&1 && { echo "!! guard accepted a bad diff"; exit 1; } || echo "  guard rejects a removing diff"
echo "== 1/7 typecheck + offline suites"; npx tsc --noEmit -p convex/tsconfig.json; bash tests/instalments/run.sh | tail -1; bash tests/scheduling/run.sh | tail -1
echo "== 2/7 spec BEFORE"; "$CONVEX" function-spec --prod > "$SPEC_DIR/function-spec-before-raty-$TS.json"
echo "== 3/7 convex deploy"; if [ -t 0 ]; then "$CONVEX" deploy; else script -qec "$CONVEX deploy" /dev/null <<< "y"; fi
echo "== 4/7 spec AFTER + guard"; "$CONVEX" function-spec --prod > "$SPEC_DIR/function-spec-after-raty-$TS.json"; specguard "$SPEC_DIR/function-spec-before-raty-$TS.json" "$SPEC_DIR/function-spec-after-raty-$TS.json"
echo "== 5/7 contract check"; node scripts/check-convex-contract.mjs --strict --spec "$SPEC_DIR/function-spec-after-raty-$TS.json"
echo "== 6/7 build + additive rsync"; npx vite build --logLevel warn; grep -lq "installmentWidgetConfig" dist/assets/*.js; test -f "$WEB/index.html"
rsync -a --backup --backup-dir="/var/www/.em-rollback-$TS" --exclude='lesson-pdfs.json' dist/ "$WEB/"
echo "== 7/7 edge"; echo -n "  webroot bundle: "; grep -o 'index-[^"]*\.js' "$WEB/index.html" | head -1; echo -n "  edge bundle:    "; curl -s https://englishmetro.com/ | grep -o 'index-[^"]*\.js' | head -1
echo -n "  Raty groups on prod: "; "$CONVEX" run p24:listMethods '{"lang":"pl"}' --prod 2>/dev/null | grep -c '"installments"' || true
echo "ROLLBACK site: rsync -a /var/www/.em-rollback-$TS/ $WEB/ ; convex BEFORE spec $SPEC_DIR/function-spec-before-raty-$TS.json"
push_prod "$CX"; echo "done $TS"
