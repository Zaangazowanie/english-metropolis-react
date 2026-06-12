# Storyboard Template — Fluent City 3D Game

Copy to `docs/game3d/storyboards/<shellKey>.md`. A storyboard must be approved
before any build PR. Keep it ≤ 2 pages — it's a build sheet, not a pitch deck.

```markdown
# <Game Title> — <shellKey>

**District:** <Fluent City location>
**Base shell:** src/practice/shells/<Name>.tsx — <one line: the mechanic>
**Generator:** src/practice/generators/generate<Name>.ts

## Fantasy (2–3 sentences)
What the player IS and DOES in the fiction. ("You drive a toy metro train
through a hedge-maze park, collecting the carriages that carry the right
words.")

## Camera & stage
- Camera: <fixed isometric / follow / orbital> + FOV + any moves
- Stage: <one paragraph — the set, time of day, palette (3–5 hex), light rig>
- Bajla's role: <where the owl appears: intro flyby, hint-giver, celebration>

## Core loop (beat by beat)
1. <question presented — where does the English text live on screen>
2. <player action — input verb: steer/aim/tap/drag>
3. <correct feedback — visual+audio beat, ≤1.5s>
4. <wrong feedback — forgiving, instructive, shows correct answer>
5. <progression — N rounds, then SessionResult>

## Shots (4–6 keyframes)
| # | Shot | What's on screen |
|---|------|------------------|
| 1 | Establishing | ... |
| 2 | Question up | ... |
| 3 | Action moment | ... |
| 4 | Correct burst | ... |
| 5 | Session end | score card + Bajla + replay/next CTA |

## Input map
Desktop: <keys/mouse>. Touch: <gestures, on-screen controls>. Keyboard-only
path: <how it stays fully playable>.

## Quality tiers
high: <extras — particles, shadow, post>. medium: <cuts>. low: <minimum:
flat-lit, DPR 1, no particles — still charming>.
reducedMotion: <what stops; how essential motion becomes discrete steps>.

## Asset list (everything, with budget)
| Asset | Source (procedural/GLB/atlas) | Est size |
|-------|-------------------------------|----------|
Total must be ≤ 2.0 MB; code chunk ≤ 250 KB gz.

## Risks
<the 1–2 things most likely to blow the perf or size budget, and the fallback>
```
