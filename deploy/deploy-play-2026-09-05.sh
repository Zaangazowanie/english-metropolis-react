#!/bin/bash
# Ship the /play open-world revamp (wave 1, 2026-09-05): daylight + toon v2 +
# shadows + composite v2 + camera (render lane), facade/street/flora/landmark kit +
# streaming (city lane), first-click scoring + overlay stack + ranks/stamps +
# progress store + bank lint + mobile HUD (game lane). Static files only: the
# game is no-build ES modules under public/play, copied verbatim into dist/ by
# vite, so this ships public/play straight to the webroot AND refreshes dist/play
# so the hourly whole-site rsync from the PR pipeline cannot revert it with a
# stale dist. Convex (worldProgress) is NOT deployed by this script.
#
# Before running: the three lane branches merged into prod, tour-play.mjs run at
# TIER=high, potato and --mobile against the prod tree with screenshots reviewed.
#
# Run as root:  bash /root/englishmetro/deploy/deploy-play-2026-09-05.sh
set -euo pipefail
TS=$(date -u +%Y%m%d-%H%M%S)
REPO=/root/englishmetro
WEB=/var/www/englishmetro
SRC="$REPO/public/play"
PROBE=/root/ricky-estate-2026-09-01/em-play-revamp/tour-play.mjs
. "$(dirname "$0")/_guard.sh"; echo "== guard: clean tree on prod"; guard_clean_prod "$REPO"
cd "$REPO"

echo "== 1/6 the tree being shipped must load headless with zero page errors"
test -f "$SRC/index.html" && test -f "$SRC/src/main.js" && test -d "$SRC/public/vendor/three"
node --check "$SRC/src/main.js"
for f in "$SRC"/src/*.js; do node --check "$f" >/dev/null || { echo "!! syntax: $f"; exit 1; }; done
if ss -ltn | grep -q ':4175 '; then
  ( cd /tmp/claude-0 2>/dev/null || cd /tmp
    SMOKE_DIR=$(mktemp -d); cp "$PROBE" "$SMOKE_DIR/tour.mjs"; ln -sfn /root/node_modules "$SMOKE_DIR/node_modules"
    cd "$SMOKE_DIR" && TIER=high timeout 1500 /root/ricky-estate-2026-09-01/em-play-revamp/probe-run.sh --quota 200 -- node tour.mjs http://127.0.0.1:4175/play/ smoke > smoke.log 2>&1 || { tail -20 smoke.log; echo "!! headless smoke failed (exit 75 = host CPU steal > 40%, retry later)"; exit 1; }
    if grep -q "pageerror" smoke.log; then grep pageerror smoke.log; echo "!! page errors in smoke"; exit 1; fi
    echo "  smoke ok: $(grep -o 'loaded in [0-9]* ms' smoke.log)" )
else
  echo "  !! no local server on 4175 (cd $REPO/public && python3 -m http.server 4175 --bind 127.0.0.1 &) — refusing to ship unsmoked"; exit 1
fi

echo "== 2/6 webroot sanity"
test -f "$WEB/index.html" && test -d "$WEB/play" && test -f "$WEB/play/index.html"
echo "  live main.js: $(curl -s -o /dev/null -w '%{http_code} %{size_download}B' https://englishmetro.com/play/src/main.js)"

echo "== 3/6 additive rsync of public/play with a backup dir"
rsync -a --backup --backup-dir="/var/www/.em-rollback-play-$TS" "$SRC/" "$WEB/play/"
echo "  backup of replaced files: /var/www/.em-rollback-play-$TS"

echo "== 4/6 refresh dist/play so the PR pipeline's whole-site rsync cannot revert this"
if [ -d "$REPO/dist" ]; then rsync -a --delete "$SRC/" "$REPO/dist/play/"; echo "  dist/play refreshed"; else echo "  (no dist/ present)"; fi

echo "== 5/6 verify at the edge (Cloudflare caches /play/src 4h toward browsers — origin says no-cache)"
for p in /play/ /play/src/main.js /play/src/materials.js /play/public/assets/models/station_mass.glb; do
  printf "  %-48s %s\n" "$p" "$(curl -s -o /dev/null -w '%{http_code} %{size_download}B' "https://englishmetro.com$p")"
done
echo -n "  origin main.js matches repo: "; cmp -s <(curl -s -H 'Host: englishmetro.com' http://127.0.0.1/play/src/main.js) "$SRC/src/main.js" && echo yes || echo "NO (check nginx root)"

echo "== 6/6 push"
push_prod "$REPO"
echo
echo "ROLLBACK: rsync -a /var/www/.em-rollback-play-$TS/ $WEB/play/   # only files this deploy replaced"
echo "done $TS"
