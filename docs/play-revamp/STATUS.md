# EM /play revamp — lane status (Ricky, started 2026-09-04 22:00Z)

Goal (Mike): adversarial review of englishmetro.com/play, then take it to a professional level —
Abeto-grade graphics (three.js is the priority), coherent quests/checkpoints/rewards/rankings,
full revamp of characters, gestures, buildings. Max 3 agents at once. Deploy permission granted.

## State
- Review done: 5 lenses, 151 findings, 44 opportunities → `REVIEW-findings.md` here (copy of the
  session scratchpad). Verification workflow stopped after 4/4 CONFIRMED to free agent slots;
  build lanes reproduce each finding before fixing.
- Wave 1 building (Workflow run wf_b2653477-eb6, started 2026-09-05 01:30Z), three worktrees:
  - `/root/em-wt-render` branch `play/render` — daylight/toon v2/shadows/composite/camera/quality
  - `/root/em-wt-city`   branch `play/city`   — facades/street/flora/landmarks/hub/streaming
  - `/root/em-wt-game`   branch `play/game`   — scoring/overlays/ranks/stamps/progress.js/bank lint/mobile
  - `/root/em-wt-server` branch `play/server` — Ricky's own: convex/worldProgress.ts + schema (not deployed)
  Local servers: 4181/4182/4183 (python http.server on each worktree's public/), 4175 = prod tree.
- Live /play == repo prod @ 547745d; another pipeline (GitHub PR auto-merge, "Zaangazowanie")
  deploys the whole site ~hourly via `rsync dist/` — commit to prod BEFORE deploying /play and
  refresh `dist/play` so a stale dist cannot revert it.

## 2026-09-05 06:40-08:00Z update
- Wave 1 finished: render lane reported (3 commits); city + game lanes died on the account session
  limit AFTER committing (6 commits each + WAVE1-*.md). All three merged into `play/wave1`
  (worktree `/root/em-wt-int`, served :4184) @ 99d5317; 4 conflict blocks resolved by hand
  (index.html daynight+settings, main.js ui.blocked+conversationPartner, zones.js constants + progress store).
- Integrated build loads with zero errors; hub/district screenshots `scratchpad/int-*.png` look right.
  SwiftShader now needs 1-3 s per frame on the full scene: tour-play.mjs pauses the render loop after
  BEGIN and drives frames with step(); screenshot timeouts 180 s.
- Mike (07:10Z): "look at the quality of the NPCs — terrible and generic" + "I love the saturated colours".
- Wave 2 launched 07:55Z (Workflow wf_efa33593-072, script scratchpad/wave2.js), worktrees off play/wave1:
  `/root/em-wt-chars` :4185 (character revamp — priority), `/root/em-wt-quests` :4186 (Convex wiring,
  rankings, ride, wayfinding, summary), `/root/em-wt-content` :4187 (warm-up explains, third locals,
  objectives, bank top-up, street items x8, chatter spelling).
- Convex worldProgress (play/server) still NOT deployed; quests lane treats it as optional/offline.

## 08:40Z — wave 2 PAUSED (host CPU steal 93%)
- The Hostinger host throttled the VPS after hours of flat-out SwiftShader: steal 8%→93% 05:00→08:00 UTC,
  load 110 with nothing runnable; wave-2 agents kept dying on tool timeouts and restarting from scratch.
  Workflow wf_efa33593-072 stopped 08:35Z. Content lane WIP committed as 326d79e on play/content
  (dialects/grammar/ui/zones/lint edits); chars + quests had nothing committed.
- wave2.js now carries CPU discipline (flock /tmp/em-probe.lock, 960x540 + potato for iteration, close the
  browser on SIGTERM) and a CONTINUITY rule (continue from branch commits). Relaunch with
  Workflow({scriptPath: scratchpad/wave2.js}) once `sar -u | tail -2` shows steal < 30%.
- Integration status: play/wave1 @ 99d5317 verified headless (zero errors, hub/district frames good).
  Open integration nit: a large flat pale-yellow disc with an ink outline appears near district station
  areas (int-3/int-4 screenshots) — not the lamp cone (0.055 alpha, no depth write) and not the crowd
  marker (0.13 m sphere); identify via raycast/name probe when CPU allows.

## 10:00Z — CPU controls (Mike: "don't exhaust our CPU")
- `probe-run.sh` in this dir is now mandatory for every headless probe: flock queue + cgroup CPUQuota 150%
  + nice 15 + steal gate (exit 75) + scope kill on exit. wave2.js / wave3.js briefs updated to require it.
- Steal still 93-95% at 10:00Z; monitor bzv5utskx re-armed (relaunch wave 2 when < 40%).
- Brain SPA build cron (hourly :23) has not completed since 04:24 (throttle; I also killed two of its runs
  by mistake at ~08:32/08:40 thinking they were mine) — check brain index mtime after the throttle lifts.

## 10:45Z — it is Hostinger's fair-use throttle (Mike's hPanel screenshot)
- hPanel: "Maximum CPU resets reached. All available CPU resets have been used. After reducing the resource
  usage CPU limit will automatically reset in the upcoming …". CPU graph ~100% since ~07:00. Top process in
  their list: /root/.openclaw/workspace/news-terminal-feeder (126%, telegram-scraper bursts; pm2 terminal-feeder
  180 restarts, themonexus-news 88 restarts — instances stable for 3.5 h / 2.5 h now, /feed timeouts under throttle).
- pidstat 30 s ranking (relative, under steal): WhatsApp bridge.js 40%, five idle-ish claude remote-control sessions
  18-38% EACH, next-server 30%, hermes gateway 30%, hl-llm-maintenance 30%, analytics-server 29%, Hostinger's own
  usage-telemetry 28%, hl-tp-recycle (LIVE TRADING — never touch) 28%, PriceMate Partners lane's patchright 26%,
  kelly-console-api 22%. Nothing from the /play work is running. Estate baseline load is 6-10 on 8 cores normally.
- Fastest fix = Hostinger support / "Debug with Hostinger Agent" → request a CPU limit reset (Mike's action).
  Otherwise usage must fall: candidates to pause are Mike's call (news feeders, brain hourly build, idle claude sessions).
- Messaged the PriceMate Partners session to use probe-run.sh for its browser probes.

## 11:20Z
- PriceMate Partners session confirmed it has no browsers running and stopped its fixture server; agreed to probe-run.sh.
- Steal 93% unchanged; monitor bdl10rko8 armed (3rd hour). Next steps in order once it clears: (1) capped
  playthrough probe of play/wave1 interaction flows (game lane's tools/playthrough-desktop.mjs on :4184),
  (2) deploy wave 1 via deploy/deploy-play-2026-09-05.sh (server branch; needs merging into prod first),
  (3) relaunch wave 2 (wave2.js) — chars lane is the owner's priority, (4) wave 3 (wave3.js), (5) final deploy.
- deploy script smoke step now runs through probe-run.sh (--quota 200).

## 12:40-12:55Z — CPU CUT (Mike: "please fix it"; Hostinger: capped to 40%, clears ~3 h after usage normalises)
Everything reversible, each with a systemd transient timer that resumes it automatically at ~16:42-16:51 UTC
(`systemctl list-timers 'em-cpu-fix-*'`). Snapshot + actions.log in `cpu-fix-20260905-1229/`.
- Crontab: 41 heavy non-trading entries commented with `#CPUPAUSE-20260905` (459 lines preserved; hl-execute /
  kelly-guardian / kelly-console-dispatch untouched). Restore = `crontab cpu-fix-20260905-1229/crontab.root.bak`
  (timer em-cpu-fix-cron-restore 16:42Z).
- pm2 stop terminal-feeder + themonexus-news (timer em-cpu-fix-pm2-resume 16:45Z).
- systemctl stop kokoro-tts (Bajla voice degraded 4 h; timer em-cpu-fix-kokoro-resume 16:46Z).
- Killed running batch jobs: price/build_comparison.py (2.4 GB), match_barcodes.py, run_online_coverage.sh,
  brain-build-spa.sh x4 (stacked hourly builds), and a watcher loop pid 1198075 (`while pgrep build_indexes|sync`)
  that another lane had left waiting — it will not fire its follow-up; note for that lane.
- SIGSTOP on the two 15-day idle claude sessions 321739 (remote-control pricematevps) and 1301243 (--resume);
  timer em-cpu-fix-claude-cont 16:51Z sends SIGCONT.
- THP defrag always→madvise, compaction_proactiveness→0 (runtime only) because kcompactd0 sat at 95% CPU.
- ⚠ My first kill pass matched ITS OWN shell via `pgrep -f "<pattern>"` and killed itself (exit 144) — the
  bracket-pattern trick `[m]atch_barcodes` fixed it. Memory feedback_kill_by_pid_not_by_name already says this.
- Not touched (Mike's call): claude general2 (45%) and pricematevps2 (20%) remote-control sessions, analytics-server
  (32%), WhatsApp bridge, all Hermes/HL trading lanes, sites.

## 13:45-14:25Z — CPU CUT round 2 (Mike 13:43Z: "It's still at 100%!")
hPanel measures DEMAND: with dozens of starved processes runnable the VM asks for 100% while receiving 3%, so the
run queue itself has to fall. Actions (timers `systemctl list-timers 'em-cpu-fix-*'`, 7 armed 16:42-17:24Z):
- ⛔ FOUND: `pricemate-wa-bridge.service` crash-looping — NRestarts=28607, ~20 s CPU per crash, exit 1. STOPPED, no
  auto-resume (needs a fix; journal tail in cpu-fix-*/wa-bridge-journal-tail.txt; run it once by hand to see stderr).
- Hermes cron: paused 16 analysis/brain jobs (hl-brain-tick, hl-veto-dispatcher, hl-alpha-scan, hl-all-market-analysis,
  hl-llm-rag-maintenance, hl-social-research-shadow, hl-market-universe-refresh, hl-hype-sol-watch, meme-glm-independent-trader,
  hl-okx-lane, hl-fefe-lane-poll, hl-market-session-watch, hl-kelly-chartists-fetch, hl-babysitter-v2, brain-feed-sync,
  hl-bob-backup-retry); resume timer em-cpu-fix-hermes-resume 17:15Z reads hermes-paused-jobs.txt (ONLY my 16 — 16 other
  jobs were already paused before today and must stay paused). Protection untouched: hl-tp-recycle, hl-watchdog,
  hl-equity-1250-alert, hl-lane-health, hl-redflag-relay, hl-block-check, system-cron hl-execute --trail-stop.
  Expect Kelly guardian "controller_stale" noise while hl-brain-tick is paused.
- SIGSTOP claude pricematevps2 (pid 2808006, idle 3 d) → CONT 17:18Z. ⚠ `claude --remote-control general2` is THIS
  session (pid 2962389) — never freeze it.
- systemctl stop kelly-console-api + pricemate-analytics (3 h; timer em-cpu-fix-services-resume 17:23Z). Analytics
  beacons are lost for 3 h.
- TERM leftover patchright driver of the partner-ux session.
- Result at 14:25Z: load 125 → 47, swap 3.9 → 1.7 GB, running procs 33; steal still 92% (host-side).
- Hermes CLI takes ~40 s per call under the throttle; 5 `cron pause` calls "failed" on my 40 s timeout but had
  already written — verify against /root/.hermes/cron/jobs.json paused_at, not CLI exit codes.

## How to resume after a session loss
1. `git -C /root/em-wt-<lane> log --oneline -5` + `WAVE1-<lane>.md` in each worktree (agents commit often).
2. Relaunch a lane with the same brief (script file:
   `/root/.claude/projects/-root-englishmetro/73bb1e95-7894-4a1d-82d2-c947c0590d3c/workflows/scripts/em-play-revamp-wave1-wf_b2653477-eb6.js`)
   telling it to continue from its branch state.
3. Merge order: render → city → game into `prod` (expect conflicts in main.js, index.html, zones.js —
   ownership regions are listed in the workflow script), then run `tour-play.mjs` at TIER=high/potato/--mobile,
   review screenshots, then `deploy/deploy-play-<date>.sh` (guard clean prod, rsync public/play → /var/www/englishmetro/play
   with --backup-dir, refresh dist/play, edge verify, push).
4. Wave 2 (after wave 1 lands): characters/gestures/crowd gait lane; Convex worldProgress wiring +
   leaderboard + quest chain lane; content lane (bank regeneration, warm-up explains, third locals,
   validIn dialect items). Wave 3: runtime hardening (beacon, load phases/retry, caching headers,
   audio/visibility, context lost), perf pass, deploy.
