#!/bin/bash
# Put the real Przelewy24 credentials into production and prove they work.
#
#   ./scripts/p24-golive.sh --api-key <klucz API> --crc <klucz CRC> \
#                           [--merchant-id <id>] [--pos-id <id>]
#
# Both keys come from panel.przelewy24.pl -> Moje dane -> Konfiguracja.
# Nothing is printed: the script echoes lengths, never values.
#
# It runs three checks, in order, and stops at the first failure:
#   1. testAccess          -- does P24 accept these credentials at all
#   2. transaction/register-- can we actually open a payment (a token, no charge)
#   3. the token page      -- does the customer-facing payment page load
#
# Step 2 registers a real transaction session at P24. It charges nothing and
# expires unused, but it does show up in the panel's transaction list.
set -euo pipefail
cd "$(dirname "$0")/.."

API_KEY=""; CRC=""; MERCHANT_ID=""; POS_ID=""
while [ $# -gt 0 ]; do
  case "$1" in
    --api-key)     API_KEY="$2"; shift 2 ;;
    --crc)         CRC="$2"; shift 2 ;;
    --merchant-id) MERCHANT_ID="$2"; shift 2 ;;
    --pos-id)      POS_ID="$2"; shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done
[ -n "$API_KEY" ] || { echo "--api-key is required" >&2; exit 2; }
[ -n "$CRC" ]     || { echo "--crc is required" >&2; exit 2; }

echo "api key : ${#API_KEY} chars"
echo "crc     : ${#CRC} chars"

npx convex env set P24_API_KEY "$API_KEY" --prod >/dev/null
npx convex env set P24_CRC "$CRC" --prod >/dev/null
[ -n "$MERCHANT_ID" ] && npx convex env set P24_MERCHANT_ID "$MERCHANT_ID" --prod >/dev/null
[ -n "$POS_ID" ]      && npx convex env set P24_POS_ID "$POS_ID" --prod >/dev/null
echo "stored in the production Convex deployment"
echo

BASE=$(npx convex env get P24_API_BASE --prod 2>/dev/null | tr -d '\r\n')
BASE=${BASE:-https://secure.przelewy24.pl}
MERCHANT=$(npx convex env get P24_MERCHANT_ID --prod | tr -d '\r\n')
POS=$(npx convex env get P24_POS_ID --prod | tr -d '\r\n')

echo "1. testAccess"
CODE=$(curl -s -o /tmp/p24-access.json -w '%{http_code}' -u "$POS:$API_KEY" "$BASE/api/v1/testAccess")
echo "   HTTP $CODE $(cat /tmp/p24-access.json)"
if [ "$CODE" != "200" ]; then
  echo "   FAILED. P24 rejects these credentials."
  echo "   Check that the key is the API key for shop $POS, that API access is"
  echo "   enabled on the account, and that no IP allowlist is set (Convex calls"
  echo "   from changing AWS addresses and cannot be pinned to one IP)."
  exit 1
fi
echo "   OK"
echo

# A registration proves the sign algorithm and the merchant/pos pair, which
# testAccess alone does not: testAccess only checks Basic auth.
SESSION="EM-golive-$(date +%s)"
AMOUNT=100
SIGN=$(printf '{"sessionId":"%s","merchantId":%s,"amount":%s,"currency":"PLN","crc":"%s"}' \
  "$SESSION" "$MERCHANT" "$AMOUNT" "$CRC" | openssl dgst -sha384 -hex | awk '{print $NF}')

echo "2. transaction/register (1.00 PLN, never paid)"
CODE=$(curl -s -o /tmp/p24-reg.json -w '%{http_code}' -u "$POS:$API_KEY" \
  -X POST "$BASE/api/v1/transaction/register" \
  -H 'Content-Type: application/json' \
  -d "$(printf '{"merchantId":%s,"posId":%s,"sessionId":"%s","amount":%s,"currency":"PLN","description":"EnglishMetro go-live check","email":"michael.poncana@englishmetro.com","country":"PL","language":"pl","urlReturn":"https://englishmetro.com/payment/return","urlStatus":"https://wooden-manatee-881.convex.site/p24/status","waitForResult":true,"regulationAccept":false,"sign":"%s"}' \
    "$MERCHANT" "$POS" "$SESSION" "$AMOUNT" "$SIGN")")
echo "   HTTP $CODE"
TOKEN=$(python3 -c 'import json,sys; print(json.load(open("/tmp/p24-reg.json")).get("data",{}).get("token",""))' 2>/dev/null || true)
if [ "$CODE" != "200" ] || [ -z "$TOKEN" ]; then
  echo "   FAILED: $(cat /tmp/p24-reg.json)"
  echo "   A 401 here with a passing testAccess means the merchantId/posId pair is"
  echo "   wrong. An 'incorrect sign' means P24_CRC does not match this shop."
  exit 1
fi
echo "   OK, token issued"
echo

# The customer is redirected to Przelewy24 itself, never through our egress
# proxy, so this check must use the redirect base rather than the API base.
REDIRECT=$(npx convex env get P24_REDIRECT_BASE --prod 2>/dev/null | tr -d '\r\n')
REDIRECT=${REDIRECT:-https://secure.przelewy24.pl}

echo "3. customer payment page"
PAGE=$(curl -s -o /dev/null -w '%{http_code}' "$REDIRECT/trnRequest/$TOKEN")
echo "   HTTP $PAGE $REDIRECT/trnRequest/$TOKEN"
[ "$PAGE" = "200" ] && echo "   OK" || { echo "   FAILED — the token did not open a payment page."; exit 1; }
echo
echo "Przelewy24 is live. Open the URL above to see the methods enabled for this"
echo "shop (BLIK, cards, transfers) without paying anything."
