#!/bin/bash
# Restore Cloudflare access after global real_ip handling began rewriting remote_addr.
# This nginx-only repair preserves the existing origin allowlist and client IP logging.
set -euo pipefail
umask 077
REPO=/root/englishmetro
SITE=/etc/nginx/sites-available/englishmetro.com
GEO=/etc/nginx/conf.d/englishmetro-origin-peer.conf
ALLOWLIST=/etc/nginx/snippets/cf-allowlist.conf
. "$(dirname "$0")/_guard.sh"
guard_clean_prod "$REPO"
[ "$(id -u)" = 0 ] || { echo 'Run as root on the canonical VPS.'; exit 1; }
BACKUP=$(mktemp -d /root/backups/englishmetro-origin-403-XXXXXXXX)
cp -a "$SITE" "$BACKUP/site.conf"
if [ -e "$GEO" ]; then cp -a "$GEO" "$BACKUP/geo.conf"; fi
rollback() {
  trap - ERR
  cp -a "$BACKUP/site.conf" "$SITE"
  if [ -e "$BACKUP/geo.conf" ]; then cp -a "$BACKUP/geo.conf" "$GEO"; else rm -f "$GEO"; fi
  nginx -t >"$BACKUP/rollback-validation.log" 2>&1 && systemctl reload nginx
  echo "Repair failed; previous nginx configuration restored. Backup: $BACKUP"
  exit 1
}
trap rollback ERR
python3 - "$SITE" "$GEO" "$ALLOWLIST" <<'PY'
import ipaddress
import os
import pathlib
import re
import sys

site, geo, allowlist = map(pathlib.Path, sys.argv[1:])
text = site.read_text()
needle = 'include /etc/nginx/snippets/cf-allowlist.conf;'
if text.count(needle) != 1:
    raise SystemExit('Expected exactly one existing English Metro origin allowlist include.')
ranges = []
denies = 0
for raw in allowlist.read_text().splitlines():
    line = raw.split('#', 1)[0].strip()
    if not line:
        continue
    if line == 'deny all;':
        denies += 1
        continue
    match = re.fullmatch(r'allow\s+([^;]+);', line)
    if not match:
        raise SystemExit('Unexpected origin allowlist directive; refusing to widen access.')
    network = ipaddress.ip_network(match[1].strip(), strict=False)
    if network.prefixlen == 0:
        raise SystemExit('Refusing an unrestricted origin range.')
    ranges.append(str(network))
if denies != 1 or len(ranges) < 2:
    raise SystemExit('Expected an explicit deny-all and existing allowed peer ranges.')
content = ('# English Metro only: authorize the original TCP peer, before real_ip rewriting.\n'
           'geo $realip_remote_addr $em_origin_peer_allowed {\n'
           '    default 0;\n' + ''.join(f'    {network} 1;\n' for network in ranges) + '}\n')
geo.write_text(content)
os.chmod(geo, 0o644)
site.write_text(text.replace(needle, 'if ($em_origin_peer_allowed = 0) { return 403; }'))
print(f'Preserved all {len(ranges)} existing allowed peer ranges; changed one site directive.')
PY
nginx -t >"$BACKUP/nginx-validation.log" 2>&1
systemctl reload nginx
sleep 1
status() { curl --silent --show-error --max-time 25 --output /dev/null --write-out '%{http_code}' "$@"; }
[ "$(status --resolve englishmetro.com:443:127.0.0.1 https://englishmetro.com/)" = 200 ]
[ "$(status https://englishmetro.com/)" = 200 ]
[ "$(status --interface 187.77.71.153 --resolve englishmetro.com:443:187.77.71.153 https://englishmetro.com/)" = 403 ]
trap - ERR
echo "Verified: local origin 200, public Cloudflare route 200, direct non-Cloudflare peer 403. Backup: $BACKUP"
