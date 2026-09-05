#!/bin/bash
# probe-run.sh — the ONLY way to run a headless /play probe on this VPS.
#
# Why: on 2026-09-05 three lanes ran SwiftShader probes flat out for hours; the
# Hostinger host answered with 93% CPU steal for the rest of the morning and Mike
# saw the box pinned at 100%. This wrapper makes the two rules enforceable rather
# than promised:
#   1. ONE probe at a time machine-wide (flock on /tmp/em-probe.lock, queued, 45 min max wait)
#   2. a hard CPU ceiling for the whole probe tree (cgroup CPUQuota, default 150% = 1.5 of 8
#      cores) at low scheduling priority, so estate services always win.
# It also refuses to start while the host is already stealing > 40% of the CPU, and
# kills the whole scope on exit so a timed-out probe can never orphan Chromium.
#
# Usage: probe-run.sh [--quota 150] [--wait 2700] -- node tour-play.mjs http://127.0.0.1:4184/play/ out
set -uo pipefail
QUOTA=150; WAIT=2700
while [ $# -gt 0 ]; do case "$1" in --quota) QUOTA=$2; shift 2;; --wait) WAIT=$2; shift 2;; --) shift; break;; *) break;; esac; done
[ $# -gt 0 ] || { echo "usage: probe-run.sh [--quota N%] [--wait S] -- <command...>"; exit 2; }

steal=$(vmstat 2 2 | awk 'NR==4 {print $17}')
if [ "${steal:-0}" -gt 40 ]; then echo "probe-run: refusing — host CPU steal is ${steal}% (>40%). Do code work, probe later."; exit 75; fi

exec 9>/tmp/em-probe.lock
if ! flock -w "$WAIT" 9; then echo "probe-run: another probe held the lock for ${WAIT}s — giving up"; exit 76; fi
echo "probe-run: lock acquired, CPUQuota=${QUOTA}% nice=15 :: $*" >&2

UNIT="em-probe-$$-$(date +%s)"
# systemd-run puts the command and every child (node → chromium → renderers) in one
# transient scope with a CPU ceiling; stopping the scope kills all of them.
trap 'systemctl stop "$UNIT.scope" 2>/dev/null; flock -u 9' EXIT INT TERM
systemd-run --quiet --scope --unit="$UNIT" -p CPUQuota="${QUOTA}%" -p CPUWeight=20 \
  nice -n 15 "$@"
rc=$?
echo "probe-run: exit $rc" >&2
exit $rc
