#!/bin/bash
# Ship the multi-lesson + weekly-series booking change (2026-09-02).
#
# WHY A SCRIPT: the order matters. The SPA calls scheduling:bookLessons,
# previewWeeklySeries and cancelSeries. If the site ships before Convex, EVERY
# booking breaks (bookLessons backs the single-slot path too) — that is the
# 2026-08-26 outage with the opposite cause. Convex first, always.
#
# Tested before this script existed: 72/72 handler tests (/root/em-scheduling-tests/run.sh),
# 27/27 email renders, 18/18 real-click e2e on dev:upbeat-goat-960.
#
# Run as root, interactively (convex deploy asks to confirm):
#   bash /root/englishmetro/deploy/deploy-series-2026-09-02.sh
#
# Rollback is printed at the end. Nothing here deletes anything.
set -euo pipefail
TS=$(date -u +%Y%m%d-%H%M%S)
CX=/root/englishmetro
SPA=/root/englishmetro
WEB=/var/www/englishmetro
SPEC_DIR=/root/backups/em-convex
CONVEX="$CX/node_modules/.bin/convex"
mkdir -p "$SPEC_DIR"
# The convex CLI resolves its deployment from the CWD (.env.local + convex.json),
# so every convex call in this script must run from $CX, not from wherever the
# script was invoked. Found the hard way: step 1 failed with "No CONVEX_DEPLOYMENT
# set" when the script was started from /root.
cd "$CX"

# The guard used in step 3, kept in one place so step 0 can prove it FAILS on a
# bad diff. A check you have never seen return a positive is not evidence.
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
        'scheduling.js:sendSeriesCancellation', 'operations.js:getCommandCenter'}
missing = sorted(need - b)
print('  added:  ', ', '.join(sorted(b - a)) or '(none)')
print('  removed:', ', '.join(removed) or '(none)')
if removed or missing:
    sys.exit(f'STOP — removed={removed} missing={missing}')
print('  spec ok')
PY
}

echo "== 0/6 prove the spec guard can FAIL (it must reject a deploy that drops functions)"
if specguard "$SPEC_DIR/self-test-after.json" "$SPEC_DIR/self-test-before.json" >/dev/null 2>&1; then
  echo "  !! guard did not reject a known-bad diff — refusing to continue"; exit 1
else
  echo "  guard correctly rejects a diff that removes functions"
fi

echo "== 1/6 prod function spec BEFORE"
"$CONVEX" function-spec --prod > "$SPEC_DIR/function-spec-before-series-$TS.json"
echo "  saved $SPEC_DIR/function-spec-before-series-$TS.json"

echo "== 2/6 convex deploy -> prod wooden-manatee-881 (pushes the whole convex/ tree)"
cd "$CX"
git status --short convex/ || true
# convex deploy refuses a non-interactive terminal and has no -y flag, so give
# it a pty when there isn't one (e.g. run over ssh with no tty, or from cron).
if [ -t 0 ]; then
  "$CONVEX" deploy
else
  echo "  (no tty — wrapping in script(1) and answering y)"
  script -qec "$CONVEX deploy" /dev/null <<< "y"
fi

echo "== 3/6 prod function spec AFTER + guard (nothing may be REMOVED)"
"$CONVEX" function-spec --prod > "$SPEC_DIR/function-spec-after-series-$TS.json"
specguard "$SPEC_DIR/function-spec-before-series-$TS.json" "$SPEC_DIR/function-spec-after-series-$TS.json"

echo "== 4/6 SPA call sites vs the NEW prod spec (self-test first, then strict)"
cd "$SPA"
node scripts/check-convex-contract.mjs --self-test --spec "$SPEC_DIR/function-spec-after-series-$TS.json"
node scripts/check-convex-contract.mjs --strict   --spec "$SPEC_DIR/function-spec-after-series-$TS.json"

echo "== 5/6 site: additive rsync of the prebuilt dist/ with a backup dir"
test -f "$WEB/index.html" && test -d "$WEB/assets"
ls "$SPA"/dist/assets/index-*.js
grep -lq "previewWeeklySeries" "$SPA"/dist/assets/index-*.js
# --backup keeps every replaced file in the backup dir; no --delete, because the
# webroot holds prod-only files (students/, cal/, lesson-pdfs.json).
rsync -a --backup --backup-dir="/var/www/.em-rollback-$TS" --exclude='lesson-pdfs.json' "$SPA/dist/" "$WEB/"

echo "== 6/6 verify"
echo -n "  webroot bundle: "; grep -o 'index-[^"]*\.js' "$WEB/index.html" | head -1
echo -n "  edge bundle:    "; curl -s https://englishmetro.com/ | grep -o 'index-[^"]*\.js' | head -1
echo -n "  booking page:   "; curl -s -o /dev/null -w '%{http_code}\n' https://englishmetro.com/
echo
echo "ROLLBACK"
echo "  site:   cp -a /var/www/.em-rollback-$TS/index.html $WEB/index.html   # old assets are never deleted"
echo "  site (full): rsync -a /root/em-rollback-20260902-044157/ $WEB/"
echo "  convex: there is no server-side undo — redeploy the previous tree; BEFORE spec is"
echo "          $SPEC_DIR/function-spec-before-series-$TS.json"
echo
echo "AFTER THE DEPLOY, CHECK (both were broken before this change):"
echo "  1. operationsAlerts cron is alive:  $CONVEX data operationsAlerts --prod   # max lastSeenAt must advance within 15 min"
echo "  2. first real booking email carries a calendar file: journalctl -u em-report -n 30"
echo "done $TS"
