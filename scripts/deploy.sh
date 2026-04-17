#!/bin/bash
set -e
ENV=${1:-production}
echo "=== Deploying to $ENV ==="

if [ "$ENV" = "staging" ]; then
  cp .env.staging .env
  DEPLOY_DIR="/var/www/lexicon-staging"
else
  cp .env.production .env
  DEPLOY_DIR="/var/www/em-react-dev"
fi

npm run build
cp -r dist/* "$DEPLOY_DIR/"
rm .env

echo "=== Deployed to $ENV ($DEPLOY_DIR) ==="
