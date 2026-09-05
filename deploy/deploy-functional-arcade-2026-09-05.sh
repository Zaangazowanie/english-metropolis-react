#!/bin/bash
# Publish the 38 functional Three.js arcade games from the canonical prod tree.
# Frontend-only: the backend and installed dependencies must match the deployed
# Bajla-tour baseline. Do not install packages, redeploy Convex or alter nginx.
# Run as root: bash /root/englishmetro/deploy/deploy-functional-arcade-2026-09-05.sh
set -euo pipefail
umask 022

REPO=/root/englishmetro
WEB=/var/www/englishmetro
BASE=756668fbb6c9bf9f27b9334c7d72e4d74d92d540
STAMP=$(date -u +%Y%m%d-%H%M%S)
BACKUP=/root/backups/englishmetro-functional-arcade-$STAMP
. "$(dirname "$0")/_guard.sh"

echo '== 1/6 verify the clean production commit and frontend-only scope'
guard_clean_prod "$REPO"
cd "$REPO"
test "$(pwd -P)" = /root/englishmetro
git merge-base --is-ancestor "$BASE" HEAD
git diff --quiet "$BASE" HEAD -- convex package.json package-lock.json yarn.lock pnpm-lock.yaml
test -s "$WEB/index.html"
test -d "$WEB/assets"
install -d -m 700 "$BACKUP"
printf 'base=%s\nrelease=%s\ntime=%s\n' "$BASE" "$(git rev-parse HEAD)" "$STAMP" > "$BACKUP/release.txt"
echo "  release evidence: $BACKUP"

echo '== 2/6 validate frontend calls against the existing public API'
node_modules/.bin/convex function-spec --prod > "$BACKUP/function-spec.json"
node scripts/check-convex-contract.mjs --self-test --spec "$BACKUP/function-spec.json"
node scripts/check-convex-contract.mjs --strict --spec "$BACKUP/function-spec.json"

echo '== 3/6 run mechanics and regression tests on the commit being shipped'
# The suites import the same TypeScript mechanics used by the game controllers.
# The production Node runtime must support type stripping, as in local QA.
node --test \
  tests/arcade-run.test.mjs \
  tests/arcade-entry.test.mjs \
  tests/arcade-demo-progress.test.mjs \
  tests/action-arcade-logic.test.mjs \
  tests/challenge-arcade.test.mjs \
  tests/challenge-machine.test.mjs \
  src/practice/shells/word-arcade-mechanics.test.mjs \
  src/practice/shells/word-arcade-crossword.test.mjs \
  src/practice/shells3d/word-kit/mechanics.test.mjs \
  src/practice/shells3d/word-kit/demo-layout.test.mjs \
  tests/lesson-metro-scene.test.mjs \
  tests/bajla-tour.test.mjs > "$BACKUP/tests.log" 2>&1
tail -10 "$BACKUP/tests.log"

echo '== 4/6 build once, then enforce game budgets and lazy chunk boundaries'
OXC_THREADS=2 RAYON_NUM_THREADS=2 npm run build -- --manifest > "$BACKUP/build.log" 2>&1
test -s dist/index.html
test -s dist/.vite/manifest.json
node --input-type=module - "$BACKUP/chunk-budget.json" <<'JS'
import fs from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

const manifest = JSON.parse(fs.readFileSync('dist/.vite/manifest.json', 'utf8'));
const files = fs.readdirSync('dist/assets').filter(file => file.endsWith('.js'));
const chunks = files.filter(file => /^(game3d-|vendor-three|world-)/.test(file)).map(file => {
  const bytes = gzipSync(fs.readFileSync(path.join('dist/assets', file))).length;
  const limit = (file.startsWith('vendor-three') ? 350 : file.startsWith('world-') ? 600 : 250) * 1024;
  return { file, gzipBytes: bytes, limitBytes: limit };
});
const games = chunks.filter(chunk => chunk.file.startsWith('game3d-'));
const vendors = chunks.filter(chunk => chunk.file.startsWith('vendor-three'));
const violations = chunks.filter(chunk => chunk.gzipBytes > chunk.limitBytes);
// Every current game needs its own lazy scene; the extra city hub may also be
// emitted. Superseded game implementations have been removed.
if (games.length < 38 || vendors.length === 0) throw new Error('Expected at least 38 game scenes and a shared Three runtime.');
if (vendors.reduce((sum, chunk) => sum + chunk.gzipBytes, 0) > 350 * 1024) {
  throw new Error('Combined shared Three runtime exceeds 350 KiB gzip.');
}
if (violations.length) throw new Error(`Chunk budget exceeded: ${JSON.stringify(violations)}`);

const visited = new Set(), stack = [], reachable = new Set(), cycles = [];
function visit(key, ancestors = false) {
  if (!manifest[key]) throw new Error(`Missing chunk manifest entry: ${key}`);
  if (ancestors) {
    if (reachable.has(key)) return;
    reachable.add(key);
    for (const dependency of manifest[key].imports ?? []) visit(dependency, true);
    return;
  }
  if (visited.has(key)) return;
  const at = stack.indexOf(key);
  if (at >= 0) { cycles.push([...stack.slice(at), key]); return; }
  stack.push(key);
  for (const dependency of manifest[key].imports ?? []) visit(dependency);
  stack.pop();
  visited.add(key);
}
for (const [key, entry] of Object.entries(manifest)) {
  visit(key);
  if (entry.isEntry) visit(key, true);
}
const eagerGames = [...reachable].map(key => manifest[key].file).filter(file => path.basename(file).startsWith('game3d-'));
const report = { gameChunks: games.length, chunks, cycles, eagerGames };
fs.writeFileSync(process.argv[2], JSON.stringify(report, null, 2));
if (cycles.length || eagerGames.length) throw new Error('Static chunk cycles or eagerly loaded game scenes found; see the budget report.');
console.log(`${games.length} game chunks within 250 KiB gzip; shared Three within 350 KiB; zero static cycles and zero eager games.`);
JS

echo '== 5/6 back up replaced files, publish dependencies, then atomically replace HTML'
cp -a "$WEB/index.html" "$BACKUP/index.html"
rollback() {
  local status=$?
  local restore_failed=0
  trap - ERR
  set +e
  # Restore replaced unversioned files as well as the entry. New hashed chunks
  # remain available for tabs that briefly loaded the attempted release.
  if [ -d "$BACKUP/replaced" ]; then
    rsync -a "$BACKUP/replaced/" "$WEB/" || restore_failed=1
  fi
  if ! { install -m 644 "$BACKUP/index.html" "$WEB/.index-rollback-$STAMP.html" && mv "$WEB/.index-rollback-$STAMP.html" "$WEB/index.html"; }; then
    restore_failed=1
  fi
  if [ "$restore_failed" -eq 0 ]; then
    echo "Arcade deployment failed. Previous entry and replaced files restored; inspect $BACKUP before retrying." >&2
  else
    echo "Arcade deployment failed and automatic rollback was incomplete. Restore from $BACKUP before retrying." >&2
  fi
  exit "$status"
}
trap rollback ERR
# Preserve hashed assets for existing tabs and the separately maintained PDF
# catalogue. The separately maintained static World app is outside this
# frontend release; preserve its HTML, JavaScript and assets together.
# Explicit public permissions also prevent a restrictive inherited umask from
# recreating the earlier origin 403 failure.
rsync -a --chmod=D755,F644 --backup --backup-dir="$BACKUP/replaced" \
  --exclude='index.html' --exclude='lesson-pdfs.json' --exclude='.vite/' --exclude='/play/' \
  dist/ "$WEB/"
install -m 644 dist/index.html "$WEB/.index-$STAMP.html"
mv "$WEB/.index-$STAMP.html" "$WEB/index.html"

echo '== 6/6 verify the public entry and its JavaScript asset'
curl --fail --silent --show-error --max-time 30 https://englishmetro.com/ > "$BACKUP/edge.html"
python3 - "$WEB/index.html" "$BACKUP/edge.html" "$BACKUP/entry-asset.txt" <<'PY'
import pathlib, re, sys
local, edge = (pathlib.Path(file).read_text() for file in sys.argv[1:3])
pattern = r'src="(/assets/index-[^\"]+\.js)"'
expected, actual = re.search(pattern, local), re.search(pattern, edge)
if not expected or not actual or expected[1] != actual[1]:
    raise SystemExit('Public HTML does not reference the newly published entry bundle.')
pathlib.Path(sys.argv[3]).write_text(actual[1])
print('Public entry verified:', actual[1])
PY
ENTRY_ASSET=$(cat "$BACKUP/entry-asset.txt")
curl --fail --silent --show-error --max-time 30 "https://englishmetro.com$ENTRY_ASSET" > "$BACKUP/edge-entry.js"
cmp -s "$WEB$ENTRY_ASSET" "$BACKUP/edge-entry.js"
trap - ERR
echo "Functional arcade published. Commit, tests, contract, build, budgets and rollback evidence: $BACKUP"
