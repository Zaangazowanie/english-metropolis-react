#!/bin/bash
# Offline tests for convex/scheduling.ts (single booking, batch, weekly series,
# series cancel, DST, credit gate, actor gating). No Convex, no mail, no network.
# Re-run after ANY edit to scheduling.ts, billing.ts or authHelpers.ts.
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
cp "$REPO/convex/scheduling.ts" "$REPO/convex/authHelpers.ts" "$REPO/convex/billing.ts" "$HERE/cx/"
cd "$REPO"
./node_modules/.bin/esbuild "$HERE/cx/scheduling.ts" --bundle --format=esm --platform=node \
  --alias:convex/values="$HERE/cx/vstub.js" --outfile="$HERE/scheduling.bundle.mjs" --log-level=warning
echo "### handler harness"
node "$HERE/harness.mjs"
