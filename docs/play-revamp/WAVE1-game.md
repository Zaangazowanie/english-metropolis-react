# Wave 1 — game lane (gameplay system, UI truth, content gates)

Branch `play/game`, worktree `/root/em-wt-game`, from prod @ 547745d. Served at
http://127.0.0.1:4183/play/ during the build. Every claim below was reproduced
headless (SwiftShader) before the fix and re-probed after; the probes live in
`public/play/tools/` and the artefacts in the scratchpad
(`/tmp/claude-0/-root/73bb1e95-7894-4a1d-82d2-c947c0590d3c/scratchpad/gm-*.png`,
`gmm-*.png`, `gm.log`, `gmm.log`, `lint-report.json`, `game-metrics.json`).

## The system the HUD now teaches

> Help every local in a district to **stamp** it in your Metro Pass; stamp every
> station on a line to earn its **certificate**; earn XP to climb from
> **Newcomer** to **Cosmopolitan**.

Each district has three beats, shown in the objective chip under the zone
banner and in the journal's Mission tab:
`R1 👂 Overhear 1/3 · 💬 Talk 0/3 · ❗ Drill 0/3 → 🎫 Stamp`.
Markers over quest locals: `!` (fresh) → `?` (warm-up done, drill left) → `✓`
(helped this round); street locals carry a small gold dot. First round close
stamps the district (+60 XP, stamp card, passport page, map station turns line
colour and pulses); every station on a line stamped → line certificate (+300,
line solid on the map, certificate card); all 44 → city complete (+1000). Round
bonus is 40 + 30·laps. Ranks: Newcomer 0 · Commuter 250 · Regular 700 · Local
1500 · Old Hand 3000 · Cosmopolitan 6000, with a chip + progress ring beside XP
and a rank-up card (queued behind any stamp earned by the same drill).

## What changed (by file)

New: `src/progress.js` (one save, namespaced by student id from
`em-student-session`, migrates `em_xp`/`em_progress`/`em_grammar`, mirrors them
on every save, guards every parse, Leitner queue, streak, stats; `remote`
{load, save} no-op stub for the wave-2 Convex functions), `src/overlay.js`
(overlay stack + toast queue), `src/ranks.js`, `public/play/tools/*`.

Rewritten: `src/ui.js`, `src/markers.js`, `src/grammar.js`, `index.html`.
Edited inside my regions: `zones.js` (progress section, regionAt, street slots),
`main.js` (HUD/interaction section, simTick gate), `input.js`, `voice.js`,
`minimap.js`, `dialects.js`, `crowd.js` (despawn / nearestSpeaker / marker
liveness), `gamedata/*` (via the lint; two display strings; one chatter word).

## Content gate

`node public/play/tools/lint-grammar-bank.mjs` — before repairs: 188 of 301
items offended (98 recycled/unparallel distractors, 76 two-option, 38
duplicate answers across concepts, 32 `important to/for`, 27+26+19+15+7
transcript signals, 14 meta explains, 12 template-padded, 9 placeholder
explains). `--fix` applied 77 hand patches, 118 deletions and 7 authored
top-ups (conditionals ×3, comparatives ×2, the two `important to/for` items
under prepositions). After: **190 items, all 3-option, 0 offenders**; per
concept: articles 29 · verb_tense 21 · subject_verb 18 · prepositions 21 ·
word_order 12 · plurals 13 · pronouns 7 · modals 9 · conditionals 9 ·
comparatives 8 · gerund_infinitive 8 · collocation 11 · word_choice 15 ·
questions_negation 9. Levels: A1 41 · A2 92 · B1 43 · B2 14 · C1 0. The drill
label prints the level actually served and never C1; short pools are topped
up from the neighbouring concept and the hint card says so.

## Verification (see the report's findings table for per-ID status)

Desktop `playthrough-desktop.mjs` at 1440×900, TIER=high: **63 checks passed, 0 failed** (`gm.log`, `gm-01…20.png`; the one probe-side miss, an off-platform position that was inside the ride radius, was re-run as `gm-21-map-refusal.png` with `mapOpen:true` and the refusal toast).
Mobile `playthrough-mobile.mjs` 393×852 + 852×393, TIER=medium: **MOBILE_COUNT** (`gmm.log`, `gmm-01…10.png`): Tap 💬 prompt, ? button opens the guide, two-tap labelled map, no HUD overlaps in portrait or landscape, every visible text ≥ 13 px in HUD/guide/dialog/map/journal/metro, 48 px answers, stick + buttons hidden under dialogs.
Metrics `render-metrics.mjs` (1280×720, autoReset off, same probe on the prod tree served at :4190 as baseline):

| tier · spot | baseline calls / tris | this branch calls / tris | Δ |
|---|---|---|---|
| high · hub | 536 / 1 583 668 | 534 / 1 616 530 | −0.4% / +2.1% |
| high · district 0 | 421 / 1 348 259 | 421 / 1 387 191 | 0% / +2.9% |
| potato · hub | 289 / 755 389 | 288 / 775 645 | −0.3% / +2.7% |
| potato · district 0 | 173 / 540 675 | 173 / 566 531 | 0% / +4.8% |

The triangle delta is the three always-present street-teaching bodies per district (were 1–3 patron-dependent) and the marker spheres; draw calls are flat. Speakers at high: baseline 39→45 (ghosts accumulating), this branch 30 = live only. Load to BEGIN 6.2 s (baseline 7.6 s on the same box). Zero pageerrors / console errors / 4xx in every run.

## Merge notes (hunks outside my strict region, all small)

- `main.js`: removed the duplicate `#journal-close` listener at the top (ui.js
  owns it now; the double wiring re-opened the journal); `refreshObjective`
  (lines ~153-159) now takes an optional circuit code and delegates to
  `ui.renderObjective`; `ui.onDialogClose` set right after it; `ui.minimap =
  minimap` after the Minimap is constructed.
- `zones.js` buildChunk: `assignGrammar(z, i, zoneProg.laps)` (signature now
  takes the zone def) and `warmupDone: !!zoneProg.w[i]` on the spawned entry
  — two lines in the city lane's block.
- `crowd.js` constructor: crowd marker geometry is a 0.13 m sphere in amber
  (`0xffbe72`) instead of the yellow octahedron — one marker family.
- `index.html`: `#gfx` (with `#gfx-select`) moved into the new `#settings`
  sheet; render lane's day/night toggle "next to #gfx" will land inside the
  settings panel, which is where it belongs. `#grade` untouched. The signup
  gate script is kept at the bottom, hardened.
- APIs other lanes may want: `ui.blocked` (single predicate), `ui.promptFor()`,
  `ui.celebrate()`, `ui.renderObjective(zoneMgr, code)`, `zoneMgr.roundStatus()`
  now returns `{street, warm, stamped, beat}` too, `progress` singleton.

## Known gaps / wave 2

- Convex `worldProgress` + leaderboard: `progress.remote` is a stub.
- Warm-up (`sampleExercises`) items still have no `explain` (content-11); the
  UI shows the right answer on a miss but cannot teach why.
- Third quest local per district is still the template greeter (content-17).
- Voice: the mic only appears where a recogniser exists; iOS HTMLAudio gesture
  path (runtime-voice) not addressed.
- Street exercises: 4 authored items per district rotate by lap; laps beyond 4
  repeat.
