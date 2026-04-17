#!/bin/bash
# English Metropolis — Deploy Script
# Usage: ./deploy.sh [staging|production]
set -euo pipefail

ENV="${1:-staging}"
SOURCE_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ "$ENV" = "production" ]; then
  DEPLOY_DIR="/var/www/em-react-dev"
  ENV_FILE=".env.production"
  SITE_URL="https://lexicon.monexusmedia.uk"
elif [ "$ENV" = "staging" ]; then
  DEPLOY_DIR="/var/www/lexicon-staging"
  ENV_FILE=".env.staging"
  SITE_URL="https://lexicon-staging.monexusmedia.uk"
else
  echo "Usage: $0 [staging|production]"
  exit 1
fi

echo "=== Deploying to $ENV ==="
echo "  Source:  $SOURCE_DIR"
echo "  Target:  $DEPLOY_DIR"
echo "  Env:     $ENV_FILE"
echo ""

# Step 1: Check immutable flag (production only)
if [ "$ENV" = "production" ]; then
  echo "[1/6] Checking immutable flag..."
  ATTRS=$(lsattr "$DEPLOY_DIR/index.html" 2>/dev/null || echo "")
  if echo "$ATTRS" | grep -q "i"; then
    echo "  WARNING: Immutable flag is SET. Removing..."
    chattr -i "$DEPLOY_DIR/index.html"
    echo "  Immutable flag removed."
  else
    echo "  No immutable flag. OK."
  fi
else
  echo "[1/6] Skipping immutable check (staging)."
fi

# Step 2: Build
echo "[2/6] Building with $ENV_FILE..."
cd "$SOURCE_DIR"
cp "$ENV_FILE" .env
npm run build
echo "  Build complete. Output in dist/"

# Step 3: Identify new bundle files
NEW_JS=$(ls dist/assets/index-*.js 2>/dev/null | head -1)
NEW_CSS=$(ls dist/assets/index-*.css 2>/dev/null | head -1)
if [ -z "$NEW_JS" ]; then
  echo "  ERROR: No JS bundle found in dist/assets/"
  exit 1
fi
echo "  JS:  $(basename "$NEW_JS")"
echo "  CSS: $(basename "${NEW_CSS:-none}")"

# Step 4: Backup current index.html
echo "[3/6] Backing up current index.html..."
BACKUP="$DEPLOY_DIR/index.html.backup-$(date +%Y%m%d-%H%M%S)"
cp "$DEPLOY_DIR/index.html" "$BACKUP"
echo "  Saved: $BACKUP"

# Step 5: Copy new assets
echo "[4/6] Copying new assets..."
cp dist/assets/* "$DEPLOY_DIR/assets/"
echo "  Assets copied."

# Step 6: Update index.html bundle references
echo "[5/6] Updating index.html bundle references..."
CURRENT_JS=$(grep -oP 'src="/assets/index-[^"]+\.js"' "$DEPLOY_DIR/index.html" | head -1 | grep -oP 'index-[^"]+\.js')
CURRENT_CSS=$(grep -oP 'href="/assets/index-[^"]+\.css"' "$DEPLOY_DIR/index.html" | head -1 | grep -oP 'index-[^"]+\.css')

if [ -n "$CURRENT_JS" ]; then
  sed -i "s|$CURRENT_JS|$(basename "$NEW_JS")|g" "$DEPLOY_DIR/index.html"
  echo "  JS: $CURRENT_JS -> $(basename "$NEW_JS")"
fi
if [ -n "$CURRENT_CSS" ] && [ -n "$NEW_CSS" ]; then
  sed -i "s|$CURRENT_CSS|$(basename "$NEW_CSS")|g" "$DEPLOY_DIR/index.html"
  echo "  CSS: $CURRENT_CSS -> $(basename "$NEW_CSS")"
fi

# Step 7: Verify
echo "[6/6] Verifying..."
echo "  Server file:"
grep "index-" "$DEPLOY_DIR/index.html" | head -2
echo ""
echo "  Remote check (may show cached version for up to 24h):"
curl -s "$SITE_URL/" | grep -oP 'index-[^"]+\.(js|css)' | head -2
echo ""
echo "=== Deploy to $ENV complete ==="
echo "NOTE: Cloudflare caches JS/CSS for 24h. Users must hard refresh (Ctrl+Shift+R)."
