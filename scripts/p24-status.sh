#!/bin/bash
# Is the Przelewy24 merchant account live?
#
# Calls P24's testAccess endpoint, which is read-only: it registers no
# transaction and charges nothing. It answers the one question the panel is
# vague about — can this merchant actually take a payment yet.
#
#   {"data":true}                      -> live, verified, can transact
#   {"error":"Incorrect authentication"} -> not activated yet, or a stale key
#
# Credentials are read from the production Convex deployment and never printed.
set -euo pipefail
cd "$(dirname "$0")/.."

BASE=$(npx convex env get P24_API_BASE --prod 2>/dev/null | tr -d '\r\n')
POS=$(npx convex env get P24_POS_ID --prod 2>/dev/null | tr -d '\r\n')
KEY=$(npx convex env get P24_API_KEY --prod 2>/dev/null | tr -d '\r\n')
BASE=${BASE:-https://secure.przelewy24.pl}

echo "endpoint : $BASE/api/v1/testAccess"
echo "pos id   : $POS"
echo "api key  : ${#KEY} chars (not printed)"
echo

BODY=$(curl -s -u "$POS:$KEY" "$BASE/api/v1/testAccess" -w '\n%{http_code}')
CODE=$(printf '%s' "$BODY" | tail -1)
JSON=$(printf '%s' "$BODY" | sed '$d')

echo "HTTP $CODE"
echo "$JSON"
echo

case "$CODE" in
  200) echo "LIVE — the merchant account is verified and can take payments." ;;
  401) echo "NOT LIVE — P24 rejects the credentials. Either onboarding is"
       echo "           incomplete (activation fee / ID / site check), or the"
       echo "           stored API key is stale. Check Konfiguracja API." ;;
  *)   echo "UNEXPECTED — inspect the response above." ;;
esac
