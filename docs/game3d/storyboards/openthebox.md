# The Vault Job — openthebox

**District:** The Bank Vault
**Base shell:** src/practice/shells/OpenTheBox.tsx — tap a brass safe-deposit box to swing its door open, pick the correct multiple-choice chip to seal it; seal every box to close the vault.
**Generator:** src/practice/generators/generateOpenTheBox.ts (thin wrapper over `generateArcade` MCQ; caps at 9 boxes, 4 options/round)

## Fantasy (2–3 sentences)
You are an after-hours safecracker working a hush-lit London bank vault, with Bajla the purple owl keeping lookout from the lantern hook. Each brass lockbox in the wall guards one English question — dial it open, choose the right word to crack the lock, and a green wax seal snaps the door shut for keeps. Clear the whole wall and the vault is yours; banknotes rain down.

## Camera & stage
- **Camera:** single fixed perspective camera framing the vault wall head-on, FOV ~38, no free orbit. Opening a box triggers one gentle ≤0.4s dolly-push + slight tilt toward the active box (the only "travel"), easing back on seal/slam. Contained card = tight framing on the 3×3 wall; fullscreen pulls back to reveal lantern, cage and floor sheen. Single canvas, DPR ≤ 1.5.
- **Stage:** an underground vault at dusk. A grid wall of brass safe-deposit boxes (`palette.brass` #b08d57, `palette.gold` #d4a24c trim) set into an ink-violet stone wall (`palette.ink` #1f0e3a → `palette.night` #0a0418); warm key light from one caged paper-lantern overhead (`palette.lanternAmber` #ffb347, hot `lanternCore` #fff1b8); a thin dusk glow leaking from a high grille (`duskHorizon` #6f3580 / `skyGlow` #c57195); a gold rope barrier and a faint polished-floor reflection. **5-hex set:** #0a0418, #1f0e3a, #b08d57, #ffb347, #7fb069 (seal green).
- **Bajla's role:** intro flyby, then perches on the lantern hook (idle). On a spent hint she tilts and points a wing at the open box. On completion she loops and hoots over the banknote confetti (celebrate variant).

## Core loop (beat by beat)
1. **Question presented** — tap any closed box; its brass door swings open on the left-edge hinge. The English prompt + four answer chips (A–D) render in a crisp DOM / drei `<Html>` card anchored beside the open box — **never baked into a 3D texture**. One box open at a time; boxes may be opened in any order.
2. **Player action** — click / tap (or keyboard-select) one answer chip.
3. **Correct feedback (≤1.5s)** — chip flushes green (`palette.leaf` #7fb069), a wax "SEALED" stamp presses onto the door, the door locks shut, and the tally + ledger tick up. (seal beat ≈ 420 ms; 16 ms under reducedMotion.)
4. **Wrong feedback (forgiving, instructive)** — the box shakes, the chip flushes red (#fb7185), "TRY 1 OF 2" appears and the correct chip is briefly revealed; a second miss slams the door shut (busted) so the box must be revisited. The right word is always shown — never punitive.
5. **Progression** — 9 boxes in the demo (generator yields up to 9). HUD shows sealed/total. When every box is sealed → `onSessionComplete({ correctCount, totalQuestions, durationMs, shellKey: 'openthebox' })`, Bajla cheers, confetti falls, "Try another / Next district →".

*Helpers (mirrored from the 2D shell): 3 hints per session — a hint spotlights the correct chip for ~3.2s (same discipline as Multiple Choice). Skip closes the open box unanswered, counting as busted.*

## Shots (4–6 keyframes)
| # | Shot | What's on screen |
|---|------|------------------|
| 1 | Establishing | Dusk vault; lantern warms up; Bajla flies in to perch. A 3×3 wall of closed brass boxes numbered 01–09, gold rope in front. "TAP ANY VAULT · KLIKNIJ DOWOLNY SEJF" eyebrow. |
| 2 | Question up | One door swung open on its hinge, combination dial mid-spin; DOM card beside it: prompt + four chips A–D. HUD reads 0/9. |
| 3 | Action moment | Finger/cursor on a chip; dial clicks home. (Hint variant: Bajla's wing pointing, the correct chip haloed amber.) |
| 4 | Correct burst | Green wax "SEALED" stamp thunks onto the door; box glows leaf-green; ledger row flips to SEALED; tally 1/9. |
| 5 | Wrong / slam | Box shaking red, "TRY 1 OF 2", correct chip flashed; on the 2nd miss the door slams shut (busted). |
| 6 | Session end | All doors sealed; Bajla loops over banknote confetti; score card "The vault is sealed · 9/9"; replay / next-district CTA. |

## Input map
**Desktop:** hover highlights a box; click opens it; click a chip to answer. Keyboard — Tab / arrow keys move focus across the box grid, Enter/Space opens the focused box; once open, keys 1–4 or A–D (or arrows + Enter) pick a chip; **H** = hint, **S** = skip. Visible focus ring on the DOM layer.
**Touch:** tap a box to open, tap a chip to answer; hint and skip are on-screen buttons. All targets ≥ 44 px (chips already min-height 44).
**Keyboard-only path:** fully playable — every box, chip, hint and skip is in the focus order; the canvas is `aria-hidden` and a polite live region announces "Box N open. {prompt}" and "The vault is sealed. All boxes secured." (identical patterns to the 2D shell).

## Quality tiers
- **high:** one cheap directional shadow on the wall; lantern bloom faked with an additive glow sprite + emissive flicker; instanced banknote confetti (~60); subtle floor reflection; beveled dials. DPR ≤ 1.5.
- **medium:** drop the shadow (baked vertex AO); confetti ~24; no floor reflection. DPR ≤ 1.25.
- **low:** flat vertex-lit brass + amber gradient; DPR 1; no particles, bloom or shadow; snappier door swings — still warm and fully legible.
- **reducedMotion:** doors snap open/closed as discrete state changes (no rotateY tween — mirrors the 2D 16 ms collapse); seal stamp appears instantly with no confetti drift; lantern stops flickering; Bajla holds static poses. "Which box is open" is conveyed by state + the live-region announcement, not by motion.

## Asset list (everything, with budget)
| Asset | Source (procedural / GLB / atlas) | Est size (gz) |
|-------|-----------------------------------|---------------|
| Lockbox cabinet + swinging door (≤9, instanced) | procedural BoxGeometry + bevel + vertex colors | 0 (code) |
| Combination dial + hinge rivets | procedural torus / cylinder | 0 (code) |
| Caged lantern, gold rope, stone wall, floor | procedural geometry + vertex colors | 0 (code) |
| Bajla owl (idle / point / celebrate) | shared kit `Bajla` (in vendor-three chunk, not per-game) | 0 |
| Gradient + decal atlas (dusk-sky ramp, lantern glow, brass sheen, green wax seal, red busted mark) | one 512×512 PNG | ~40–60 KB |
| Banknote confetti | procedural instanced planes, vertex color (gold / leaf) | 0 (code) |
| SFX — dial click, seal thunk, slam (optional) | small same-origin clips, lazy-loaded | ≤ ~120 KB (optional) |

**Total ≈ ≤ 0.2 MB** (well under the 2.0 MB cap). Code chunk target ≤ 250 KB gz (R3F + selective drei `<Html>` only — no barrel imports); shared `vendor-three` ≤ 350 KB.

## Risks
1. **`<Html>` overlay cost / drei surface.** The crisp-text rule wants drei `<Html>`, which can add layout cost and pull extra drei in. *Fallback:* plain absolutely-positioned DOM over the canvas, anchored by projecting the active box's world position once per open (not per frame) — keeps English crisp and trims `vendor-three`.
2. **Per-frame allocation on the animating door.** Only one door moves at a time: write the hinge matrix solely while a door is opening/slamming, reusing a single dummy `Object3D` + `Matrix4`. *Fallback:* 9 discrete meshes (still < 150 draw calls) if instanced hinge transforms get fiddly.
3. **Lantern "bloom" temptation.** A postprocessing pass would blow the 350 KB `vendor-three` budget. *Mitigation:* no postprocessing dependency — fake the glow with an additive sprite + emissive material.
4. **Confetti / particle count on mid-low GPUs (Iris Xe / GTX-1050).** *Mitigation:* tiered counts, fully off on `low` and `reducedMotion`.

---
*Build-PR note (not part of the storyboard spec): the 3D component will live at `src/practice/shells3d/OpenTheBox3D.tsx` (default export), registered in `shells3d/kit/registry.ts` as `{ shellKey: 'openthebox', title: 'The Vault Job', district: 'The Bank Vault' }`. It shares a basename with the existing CSS-3D pilot `src/practice/shells/OpenTheBox3D.tsx` but is a separate module in a different directory — do not edit or import the CSS-3D pilot.*
