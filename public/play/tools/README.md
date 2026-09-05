# /play tools

Content gate and headless verification for the open-world game. None of these
run in the browser; they are Node scripts for the build/deploy step and for
CI. Playwright is needed only by the probes (it is not a project dependency:
run them from a machine that has `playwright` + a Chromium build installed, e.g.
`NODE_PATH=/root/node_modules node …`).

| script | what it does |
|---|---|
| `lint-grammar-bank.mjs` | Gate for `src/gamedata/grammar_bank.{json,js}`. Rejects inverted keys, transcript fragments (disfluency tokens, >70-char options, real first names, proper nouns outside a whitelist), meta/placeholder explains, duplicate answers across concepts, two-option items, template-padded and recycled distractors, and more than 2 `important to/for` items outside prepositions. Exit 1 on any offender. `--fix` applies `grammar-bank-repairs.json` (hand patches, deletions, authored top-ups), deletes anything still failing, rewrites both bank files and prints the per-concept/level table. `--json out.json` writes the report. |
| `grammar-bank-repairs.json` | The hand-authored repairs. Patch only where the fix is unambiguous; otherwise delete. Items may carry an optional `prompt`. |
| `playthrough-desktop.mjs` | Scripted desktop playthrough of the gameplay verification bar (first-click scoring, 3/7 fails with retry + fail bark, XP tween, Escape/overlay stack, journal agreement, regionAt at the first stop, street persistence across restream, stamp + rank ceremonies, save namespacing, zero pageerrors). `TIER=high node playthrough-desktop.mjs http://127.0.0.1:PORT/play/ prefix` |
| `playthrough-mobile.mjs` | 393×852 touch + 852×393 landscape: Tap 💬 prompt, ? button, two-tap labelled map, no HUD overlaps, 13 px floor, 48 px answers, controls hidden under dialogs. |
| `render-metrics.mjs` | `renderer.info` at hub + district for potato and high with `autoReset=false`. |

Serve the game first: `cd public && python3 -m http.server PORT --bind 127.0.0.1`.
