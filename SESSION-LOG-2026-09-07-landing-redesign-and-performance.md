# Session log — 2026-09-07 · landing redesign, one site button, pricing hero, performance

Ricky. Logged 2026-09-07 on Mike's "save and log everything".
Memory: `feedback_em_site_button_standard`, `project_em_landing_performance_budget`
(both in `/root/.claude/projects/-root/memory/`). Repo docs: `DESIGN.md` sections "Buttons",
"Icon font", "Performance budget". All four commits are on `prod` and live on englishmetro.com.

## 1. Landing redesign (commit `9d9d38e`)

Mike's brief, with screenshots: the four-steps block "looks detached", redesign Bajla as a
multi-box two-column layout keeping the auto-playing preview, polish the specialist courses and
watermark the slides, darken the night purple significantly, preserve the header button style
(liquid-morph hover) and standardise every button on the site to it, add About / FAQ / Contact
to the header, and (mid-session) show the specialist courses on the landing.

- **Four steps** → one glass panel (`.gh-journey`): school photo with fact chips and the skyline
  watermark on the left, numbered vertical route on the right, Book / See pricing pills at the
  end of the route. Replaced the lone 21:9 banner over four loose cards.
- **Bajla** → bento of four glass boxes (`.bj-bento`): where (app / WhatsApp tiles), what
  (example list), now showing (title, description, 7-step progress strip, live caption), and
  the preview. `BajlaWalkthrough.jsx` and `bajla-tour.mjs` untouched; `tests/bajla-tour.test.mjs`
  still passes; Playwright confirmed autoplay still advances.
- **Specialist courses** → header-pill tabs, framed visual with `.gh-watermark` + AI note,
  both CTAs as `.gh-action`. Specialist CTA scrolls to a new **Specialist programmes** row
  (`#specialist-packs`, `SPECIALIST_PACKAGES` from `packages.js` with new PL fields) under
  "Pick your pace".
- **Night theme**: `NIGHT.pageBgDeep` and `G.auroraDeep` (landing only), glass surfaces
  near-black. The student app keeps `pageBg` / `aurora`.
- **Buttons**: the hero CTA was flat because `public/assets/em-motion-20260825-v3.css` (loaded
  after the bundle, wins the cascade) carried a `.gh-hero-copy .gh-action` override and a pastel
  `.lp-button-primary`. Both deleted. `.lp-button`, `.lp-add-cart` (pricing) and
  `.legal-topnav a.nav-cta` (static About/FAQ/Contact/legal pages) restyled to the same pill.
  Pricing needs `.lp-page .lp-button.lp-button-primary` (three classes) because em-motion sets
  `.lp-page .lp-button { color }` at equal specificity. Spec locked in `DESIGN.md` "Buttons".
- **Header**: About / FAQ / Contact on the landing (desktop + drawer) and the pricing nav.
- Cache-busters bumped: em-motion css `?v=30`, `legal.css?v=20260907` in the 7 static pages.

Verification: Playwright on the built preview and live — computed styles of header vs hero
primary identical (999px pill, same gradient, same font), CDP `CSS.forcePseudoState` shows the
hover sheen/lift (a plain `hover()` does not surface pseudo-element opacity reliably), no
horizontal scroll at 1440/1100/390, header fits at 1100.

## 2. Course slider autoplay (commit `92ef869`)

Slides advance every 7 s with a gradient progress hairline on the controls' bottom rule. Paused
on hover/focus, off-screen (IntersectionObserver, threshold .25), hidden tab, reduced motion; any
tab / arrow / swipe restarts the clock. Live: 01 → 02 in 7.5 s, held on 01 while hovered,
`data-playing=false` off-screen.

## 3. Pricing hero in the landing register (commit `5ee499d`)

Header = landing header (ghost pills, Sign up secondary, PL/EN pill, primary "Learning plan",
About/FAQ/Contact), brand lockup with gradient "Metro" and ember dot, Lora italic kicker and
section labels behind a rule, gradient headline word, three-step buying panel as the journey
route with gradient number badges. em-motion panel overrides removed (`?v=31`).
**Found and fixed:** `.lp-page { overflow-x: hidden }` made the page a scroll container, so no
sticky header could ever stick there; now `clip`. Header is sticky like `.gh-header`, in flow;
below 1240px the primary pill yields (same CTA is in the hero).

## 4. Performance (commit `ecefbed`)

Baseline (live, headless Chromium 1440px): 2.85 MB / 112 requests, entry JS 606 KB gz with
every admin/teacher/student screen statically imported in `main.jsx`, 99 `backdrop-filter`
elements, scroll ~1 fps, CPU TaskDuration 15 s, 319 KB icon font, GSI script on every page.
Attribution: re-running the measure with `--disable-3d-apis` and with the em-motion script
aborted showed the two hero WebGL layers (skyline + shader field) were ~70% of CPU and all of
the scroll jank.

After (live): ~1.3 MB / 55 requests, entry 61 KB gz, 1 blurred element, scroll 6–8 fps in
software GL, TaskDuration 5–7 s, icon font 61 KB.

- `lazyRoute()` in `main.jsx`: 78 screens lazy, each with its own Suspense (a console sub-page
  loading never blanks the shell). Route smoke test: pricing, login, signup, checkout, privacy,
  terms, withdraw, teacher/login, admin redirect, /app, 404, plus client-side navigation.
- `PlayOverlay.jsx` lazy (ArcadeCabinet + ~80 KB practice CSS out of the landing); dead
  `HeroArcade` / `HeroPracticePreview` (48 KB CSS, never rendered) removed; `ActionLink.jsx`
  extracted.
- Blur only on `.gh-header.gh-glass` and the mobile drawer; `--gh-glass-bg` denser
  (night .8, day .84). Screenshots of every section in both themes compared: same look.
- `src/components/public/scrollIdle.js`: HeroSkyline, ReactiveShaderField and the em-motion
  canvas skip frames while scrolling (140 ms idle), 30 fps cap, DPR 1.25 / 0.75 / 1. Skyline
  builds in `requestIdleCallback` and falls back to the CSS still on ≤2 cores / ≤2 GB / saveData.
- Material Symbols subset: icons are GSUB ligatures, so a `--text` subset keeps everything;
  `tools/subset-material-symbols.py` reads the ligature table and keeps the ~707 names found in
  `src/` + `public/`. Rerun when new icons are added. Rounded variant (admin) untouched.
- `src/lib/google-identity.js` injects GSI on demand from Login / Signup / Checkout.
- CourseSlider: `src` only on active ± 1 slide; hero LCP image `fetchpriority="high"`.
- **Trap:** `/fonts/material-symbols.css` is edge-cached 24 h without a hash; the first live
  measure still pulled the old 319 KB font. Link is now `?v=20260907`.

## Deploy / rollback

Deployed by hand from `/root/englishmetro` (build → `cp dist/assets/*`, fonts css + subset
woff2, em-motion js/css, static pages, `index.html` last). Rollback folders:
`/var/www/.em-rollback-20260907-1100` (pre-redesign index.html + em-motion css + legal.css),
`-1116` (pre-autoplay), `-1126` (pre-pricing-hero), `-1146` (pre-performance: index.html,
em-motion js/css, material-symbols.css). Nothing was removed from `/var/www/englishmetro/assets`;
old chunks stay alongside the new ones.

## Still open / known

- `Btn` in `src/design/v3/primitives.jsx` (login, signup, app) is the same pill family but its
  own inline implementation; unifying it means touching the student app — left alone.
- Pre-existing lint errors in `main.jsx` (react-refresh) and `Login.jsx` (empty blocks) predate
  today and were left as found; every file I changed lints clean.
- Headless numbers understate the scroll gain (software GL); worth a real-mouse check on a
  laptop. The Reveal-on-scroll cards stay invisible in instant-jump screenshots — a tooling
  artefact, they reveal on a normal scroll.
