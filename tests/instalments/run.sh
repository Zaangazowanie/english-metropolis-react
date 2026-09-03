#!/bin/bash
# Offline tests for convex/instalmentPlans.ts and the instalment_overdue branch
# of convex/operations.ts (plan creation, money and lesson splits, the overdue
# boundary, reminder cadence, plan mail status, method grouping incl. Raty).
# No Convex, no mail, no network. Re-run after ANY edit to those files.
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
mkdir -p "$HERE/cx"
cp "$REPO/convex/instalmentPlans.ts" "$REPO/convex/operations.ts" "$REPO/convex/authHelpers.ts" "$REPO/convex/billing.ts" "$HERE/cx/"
cp "$REPO/tests/scheduling/cx/vstub.js" "$HERE/cx/"
# ./_generated/* resolves to inert stubs (esbuild aliases cannot be relative).
mkdir -p "$HERE/cx/_generated"
for g in server api dataModel; do cp "$HERE/cx/genstub.js" "$HERE/cx/_generated/$g.js"; done
# p24.ts pulls in fetch-time config; only methodGroupOf is under test here, so
# it is sliced out rather than bundled with the whole payment file.
awk '/^type MethodGroupKey/,/^}$/' "$REPO/convex/p24.ts" | sed 's/^const PAYPO_METHOD_ID.*//' > "$HERE/cx/methodGroup.ts"
grep -q "methodGroupOf" "$HERE/cx/methodGroup.ts" || { echo "could not slice methodGroupOf out of p24.ts"; exit 1; }
printf 'const PAYPO_METHOD_ID = %s;\n' "$(grep -oE 'PAYPO_METHOD_ID = [0-9]+' "$REPO/convex/p24.ts" | grep -oE '[0-9]+')" | cat - "$HERE/cx/methodGroup.ts" > "$HERE/cx/methodGroup.tmp" && mv "$HERE/cx/methodGroup.tmp" "$HERE/cx/methodGroup.ts"
cat > "$HERE/cx/entry.ts" <<'EOF'
export * as plans from "./instalmentPlans";
export * as ops from "./operations";
export * from "./methodGroup";
EOF
cd "$REPO"
./node_modules/.bin/esbuild "$HERE/cx/entry.ts" --bundle --format=esm --platform=node \
  --alias:convex/values="$HERE/cx/vstub.js" \
  --outfile="$HERE/instalments.bundle.mjs" --log-level=warning
echo "### instalments harness"
node "$HERE/harness.mjs"
