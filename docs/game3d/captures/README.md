# Gameplay captures (auto-generated)

GIFs in this folder are produced automatically by CI — you don't add them by hand.

## How it works

On every gameplay PR, the `game3d-gate` workflow (`.github/workflows/game3d-gate.yml`)
runs an **advisory** capture step *after* the build + budget gate:

1. `vite preview` serves the freshly-built `dist/`.
2. Headless Chromium (Playwright, installed at workflow level — **never** a repo
   dependency) drives the demo flow: home → **Enter the City** → **Begin** →
   holds `W` so Wren walks, recording ~4 seconds.
3. The webm is converted to an optimised GIF (≤ 2 MB) with `ffmpeg`.
4. The GIF is committed here as `docs/game3d/captures/<shellKey>.gif` (with
   `[skip ci]`) and posted as a PR comment, and also uploaded as the
   `gameplay-capture` CI artifact.

The capture is **advisory**: `continue-on-error: true` plus a script that always
exits `0`, so a capture hiccup can never red-gate a build+budget-green PR. The
runner-local working dir `.capture-out/` is git-ignored; only the final GIF is
committed here.

## Hostname note

The app only mounts the public home (`GameHome`) at `/` when the hostname matches
`/englishmetro\.com/i`. CI maps `127.0.0.1 local.englishmetro.com` into
`/etc/hosts` and navigates there so the home renders in the runner.

## Bridge vs. permanent

Until this capture step is on `gold-deploy`, the orchestrator bridge-captures the
current gameplay PR's GIF manually. After it lands, every gameplay PR self-captures
with no human in the loop.
