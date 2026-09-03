#!/bin/bash
# Ship the universal credit gate (no admin bypass) + Billing expiry controls (2026-09-03).
#
# What changes: every package path (P24 finalizePaid, manual confirmOrder) now
# writes lessonPackages.expiresAt; the student booking gate refuses expired
# packages with PACKAGE_EXPIRED; orders:getStudentAllocation returns validUntil;
# billing:backfillPackageExpiry (internal, dry-run by default) repairs the 4
# customer packages granted before this; the pricing page, cart, checkout and
# booking page show validity; the Regulamin gains the 48-lesson row and ranges.
#
# Order matters: Convex first (the SPA reads alloc.validUntil and the
# PACKAGE_EXPIRED code; old Convex simply omits them, so the site is safe
# either way, but never ship a site that calls functions prod does not have).
#
# Tested: 81/81 handler tests (section C rewritten: admin refused with 0 credits, school org exempt, expired refused, extension unblocks).
# clean, vite build clean, static terms diff limited to the intended lines.
#
# Run as root:  bash /root/englishmetro/deploy/deploy-gate-2026-09-03.sh
set -euo pipefail
TS=$(date -u +%Y%m%d-%H%M%S)
CX=/root/englishmetro
SPA=/root/englishmetro
WEB=/var/www/englishmetro
SPEC_DIR=/root/backups/em-convex
CONVEX="$CX/node_modules/.bin/convex"
mkdir -p "$SPEC_DIR"
# convex resolves its deployment from the CWD (.env.local + convex.json).
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
        'scheduling.js:retryBookingNotification', 'scheduling.js:sendSeriesConfirmation',
        'scheduling.js:sendSeriesCancellation', 'operations.js:getCommandCenter',
        'orders.js:getStudentAllocation', 'billing.js:backfillPackageExpiry', 'p24.js:finalizePaid'}
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

echo "== 1/7 the two convex trees must be identical (the SPA tree is what was typechecked and tested)"
# .pre-* are editor backups left by earlier sessions; Convex bundles only .ts/.js.
diff -rq "$CX/convex" "$SPA/convex" -x _generated -x '*.pre-*'

echo "== 2/7 prod function spec BEFORE"
"$CONVEX" function-spec --prod > "$SPEC_DIR/function-spec-before-gate-$TS.json"
echo "  saved $SPEC_DIR/function-spec-before-gate-$TS.json"

echo "== 3/7 convex deploy -> prod wooden-manatee-881"
git status --short convex/ || true
if [ -t 0 ]; then
  "$CONVEX" deploy
else
  echo "  (no tty, wrapping in script(1) and answering y)"
  script -qec "$CONVEX deploy" /dev/null <<< "y"
fi

echo "== 4/7 prod function spec AFTER + guard (nothing may be REMOVED)"
"$CONVEX" function-spec --prod > "$SPEC_DIR/function-spec-after-gate-$TS.json"
specguard "$SPEC_DIR/function-spec-before-gate-$TS.json" "$SPEC_DIR/function-spec-after-gate-$TS.json"

echo "== 5/7 SPA call sites vs the NEW prod spec"
cd "$SPA"
node scripts/check-convex-contract.mjs --self-test --spec "$SPEC_DIR/function-spec-after-gate-$TS.json"
node scripts/check-convex-contract.mjs --strict   --spec "$SPEC_DIR/function-spec-after-gate-$TS.json"

echo "== 6/7 site: additive rsync of the prebuilt dist/ with a backup dir"
test -f "$WEB/index.html" && test -d "$WEB/assets"
grep -lq "Extend validity by 6 months" "$SPA"/dist/assets/index-*.js
grep -q "3 września 2026" "$SPA/dist/terms/index.html"
rsync -a --backup --backup-dir="/var/www/.em-rollback-$TS" --exclude='lesson-pdfs.json' "$SPA/dist/" "$WEB/"

echo "== 7/7 verify at the edge"
echo -n "  webroot bundle: "; grep -o 'index-[^"]*\.js' "$WEB/index.html" | head -1
echo -n "  edge bundle:    "; curl -s https://englishmetro.com/ | grep -o 'index-[^"]*\.js' | head -1
echo -n "  terms date:     "; curl -s https://englishmetro.com/terms/ | grep -o "Obowiązuje od <strong>[^<]*" | head -1
echo -n "  terms 48 row:   "; curl -s https://englishmetro.com/terms/ | grep -c "w tym pakiet 48 lekcji"
echo -n "  pdf bytes:      "; curl -s -o /dev/null -w '%{size_download}\n' https://englishmetro.com/legal/regulamin-englishmetro.pdf
echo
echo "ROLLBACK"
echo "  site:   rsync -a /var/www/.em-rollback-$TS/ $WEB/     # only files this deploy replaced"
echo "  convex: redeploy the previous tree; BEFORE spec is $SPEC_DIR/function-spec-before-gate-$TS.json"
echo
echo "NEXT: backfill the 4 customer packages that predate expiresAt (dry run first, then --no-dry-run)"
echo "  cd $CX && $CONVEX run --prod billing:backfillPackageExpiry '{\"dryRun\":true}'"
echo "done $TS"
