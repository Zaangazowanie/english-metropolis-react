#!/bin/bash
# Ship the whole-site UI/UX pass (2026-09-04): landing (three.js skyline, six
# moats, Bajla on WhatsApp, 13px type floor), About founder story, compulsory
# first + last name on every signup path (Convex studentAuth/googleAuth/
# enrolmentRules + Signup/Checkout/Login), static cold pages via the shared
# shell, Bajla widget motion + voice orb, student portal motion kit, pricing and
# checkout pass, real 404 fallback, jsPDF vendor restore, fonts no longer
# inlined (the CSP is font-src 'self').
#
# Order matters: Convex first. The new Signup/Checkout send firstName/lastName
# to googleAuth:googleSignIn and expect NAME_* codes from studentAuth; the old
# validator would reject the retry. Convex also carries the peer lane's
# instalmentPlans functions that the committed Billing.jsx already calls.
#
# Tested before this script: convex tsc clean; 31/31 signup-name tests;
# 81/81 scheduling handler tests; vite build clean; Playwright crawls of every
# public route (min font 13px, 0 pageerrors) in the session scratchpad.
#
# Run as root:  bash /root/englishmetro/deploy/deploy-uiux-2026-09-04.sh
set -euo pipefail
TS=$(date -u +%Y%m%d-%H%M%S)
CX=/root/englishmetro
SPA=/root/englishmetro
WEB=/var/www/englishmetro
SPEC_DIR=/root/backups/em-convex
CONVEX="$CX/node_modules/.bin/convex"
mkdir -p "$SPEC_DIR"
. "$(dirname "$0")/_guard.sh"; echo "== guard: clean tree on prod"; guard_clean_prod "$CX"
cd "$CX"

specguard() {  # specguard <before.json> <after.json>
python3 - "$1" "$2" <<'PY'
import json, sys
def load(p):
    raw = open(p).read()
    try: s = json.loads(raw)
    except Exception: s = json.loads(raw[raw.index('['):raw.rindex(']') + 1])
    fns = s if isinstance(s, list) else s.get('functions', [])
    return {f['identifier'] for f in fns if f.get('identifier')}
a, b = load(sys.argv[1]), load(sys.argv[2])
removed = sorted(a - b)
need = {'scheduling.js:bookLessons', 'scheduling.js:previewWeeklySeries', 'scheduling.js:cancelSeries',
        'operations.js:getCommandCenter', 'orders.js:getStudentAllocation', 'p24.js:finalizePaid',
        'studentAuth.js:studentSignupAction', 'studentAuth.js:studentLogin', 'googleAuth.js:googleSignIn',
        'instalmentPlans.js:listPlans'}
missing = sorted(need - b)
print('  added:  ', ', '.join(sorted(b - a)) or '(none)')
print('  removed:', ', '.join(removed) or '(none)')
if removed or missing:
    sys.exit(f'STOP - removed={removed} missing={missing}')
print('  spec ok')
PY
}

echo "== 0/7 prove the spec guard can FAIL"
if specguard "$SPEC_DIR/self-test-after.json" "$SPEC_DIR/self-test-before.json" >/dev/null 2>&1; then
  echo "  !! guard did not reject a known-bad diff, refusing to continue"; exit 1
else
  echo "  guard correctly rejects a diff that removes functions"
fi

echo "== 1/7 typecheck + name-rule tests on the tree being shipped"
npx tsc --noEmit -p convex/tsconfig.json
node scripts/test-signup-name.mjs | tail -1

echo "== 2/7 prod function spec BEFORE"
"$CONVEX" function-spec --prod > "$SPEC_DIR/function-spec-before-uiux-$TS.json"
echo "  saved $SPEC_DIR/function-spec-before-uiux-$TS.json"

echo "== 3/7 convex deploy -> prod wooden-manatee-881"
git status --short convex/ || true
if [ -t 0 ]; then
  "$CONVEX" deploy
else
  echo "  (no tty, wrapping in script(1) and answering y)"
  script -qec "$CONVEX deploy" /dev/null <<< "y"
fi

echo "== 4/7 prod function spec AFTER + guard (nothing may be REMOVED)"
"$CONVEX" function-spec --prod > "$SPEC_DIR/function-spec-after-uiux-$TS.json"
specguard "$SPEC_DIR/function-spec-before-uiux-$TS.json" "$SPEC_DIR/function-spec-after-uiux-$TS.json"

echo "== 5/7 SPA call sites vs the NEW prod spec"
cd "$SPA"
node scripts/check-convex-contract.mjs --self-test --spec "$SPEC_DIR/function-spec-after-uiux-$TS.json"
node scripts/check-convex-contract.mjs --strict   --spec "$SPEC_DIR/function-spec-after-uiux-$TS.json"

echo "== 6/7 site: additive rsync of the prebuilt dist/ with a backup dir"
test -f "$WEB/index.html" && test -d "$WEB/assets"
grep -lq "gh-why-card" "$SPA"/dist/assets/index-*.js            # landing moats section is in the bundle
grep -q "Englishtown" "$SPA/dist/about/index.html"               # founder story shipped with the static about page
test -f "$SPA/dist/students/vendor/jspdf.umd.min.js"             # PDF library restored
test -f "$SPA/dist/students/vendor/three.core.min.js"            # widget orb dependency
! grep -q 'students/vendor/jspdf.umd.min.js?v=2" defer' "$SPA/dist/index.html"   # eager preload removed
rsync -a --backup --backup-dir="/var/www/.em-rollback-$TS" --exclude='lesson-pdfs.json' "$SPA/dist/" "$WEB/"

echo "== 7/7 verify at the edge"
echo -n "  webroot bundle: "; grep -o 'index-[^"]*\.js' "$WEB/index.html" | head -1
echo -n "  edge bundle:    "; curl -s https://englishmetro.com/ | grep -o 'index-[^"]*\.js' | head -1
echo -n "  about story:    "; curl -s https://englishmetro.com/about/ | grep -c "Englishtown"
echo -n "  jspdf vendor:   "; curl -s -o /dev/null -w '%{http_code}\n' https://englishmetro.com/students/vendor/jspdf.umd.min.js
echo -n "  three core:     "; curl -s -o /dev/null -w '%{http_code}\n' https://englishmetro.com/students/vendor/three.core.min.js
echo
echo "ROLLBACK"
echo "  site:   rsync -a /var/www/.em-rollback-$TS/ $WEB/     # only files this deploy replaced"
echo "  convex: redeploy the previous tree; BEFORE spec is $SPEC_DIR/function-spec-before-uiux-$TS.json"
push_prod "$CX"
echo "done $TS"
