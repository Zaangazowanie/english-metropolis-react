#!/bin/bash
# Offline tests for convex/scheduling.ts (single booking, batch, weekly series,
# series cancel, DST, credit gate, actor gating). No Convex, no mail, no network.
# Re-run after ANY edit to scheduling.ts, billing.ts or authHelpers.ts.
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
cp "$REPO/convex/scheduling.ts" "$REPO/convex/authHelpers.ts" "$REPO/convex/billing.ts" "$HERE/cx/"
# ./_generated/* resolves to inert stubs; they were never committed (cx/_generated
# is ignored), which left the suite failing on a fresh checkout until 2026-09-03.
mkdir -p "$HERE/cx/_generated"
for g in server api dataModel; do cp "$HERE/cx/genstub.js" "$HERE/cx/_generated/$g.js"; done
cd "$REPO"
./node_modules/.bin/esbuild "$HERE/cx/scheduling.ts" --bundle --format=esm --platform=node \
  --alias:convex/values="$HERE/cx/vstub.js" --outfile="$HERE/scheduling.bundle.mjs" --log-level=warning
echo "### handler harness"
node "$HERE/harness.mjs"
