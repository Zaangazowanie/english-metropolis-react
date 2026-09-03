#!/bin/bash
# Which payment methods Przelewy24 currently enable on this shop, grouped the
# way the checkout groups them.
#
# Why: P24 can switch a method on or off with no notice (OWU § 4 ust. 10 lit. b).
# Raty arriving would have shown up as "21 banks"; PayPo vanishing after a
# compliance review would simply stop being offered. Nothing told anyone.
# This is the probe FACTS.md runs; the "changed" mode compares with the last
# run and prints 1 when the enabled set differs, which the Goals page shows red.
#
# Read-only: GET /api/v1/payment/methods/pl, no transaction, no charge.
#
#   p24-methods.sh            -> "blik:2 paypo:1 installments:1 card:0 transfer:20"
#   p24-methods.sh ids        -> sorted enabled method ids, comma-separated
#   p24-methods.sh changed    -> 0/1, and records the current set for next time
set -euo pipefail
cd "$(dirname "$0")/.."

STATE=/var/lib/brain/p24-methods.json
BASE=$(./node_modules/.bin/convex env get P24_API_BASE --prod 2>/dev/null | tr -d '\r\n')
POS=$(./node_modules/.bin/convex env get P24_POS_ID --prod 2>/dev/null | tr -d '\r\n')
KEY=$(./node_modules/.bin/convex env get P24_API_KEY --prod 2>/dev/null | tr -d '\r\n')
BASE=${BASE:-https://secure.przelewy24.pl}
[ -n "$POS" ] && [ -n "$KEY" ] || { echo "no P24 credentials" >&2; exit 2; }

JSON=$(curl -s --max-time 20 -u "$POS:$KEY" "$BASE/api/v1/payment/methods/pl")
echo "$JSON" | grep -q '"data"' || { echo "P24 methods call failed: ${JSON:0:120}" >&2; exit 3; }

# Same classification as convex/p24.ts methodGroupOf, kept in lockstep by
# tests/instalments (which asserts the four known ids classify identically).
python3 - "$JSON" "${1:-groups}" "$STATE" <<'PY'
import json, re, sys, os
data = json.loads(sys.argv[1]).get("data") or []
mode, state = sys.argv[2], sys.argv[3]
enabled = [m for m in data if m.get("status") is True and isinstance(m.get("id"), int)]
def group(m):
    g = str(m.get("group") or ""); n = str(m.get("name") or "")
    if g == "Blik": return "blik"
    if m["id"] == 317 or re.search("paypo", n, re.I): return "paypo"
    if m["id"] == 303 or g == "Installments": return "installments"
    if m["id"] == 145 or re.search("card|karta", g, re.I): return "card"
    return "transfer"
ids = sorted(m["id"] for m in enabled)
counts = {k: 0 for k in ["blik", "paypo", "installments", "card", "transfer"]}
for m in enabled: counts[group(m)] += 1
if mode == "ids":
    print(",".join(map(str, ids)))
elif mode == "changed":
    prev = None
    try: prev = json.load(open(state)).get("ids")
    except Exception: pass
    changed = 0 if prev is None or prev == ids else 1
    json.dump({"ids": ids, "counts": counts}, open(state, "w"))
    print(changed)
else:
    print(" ".join(f"{k}:{v}" for k, v in counts.items()))
PY
