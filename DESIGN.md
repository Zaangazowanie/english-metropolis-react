---
version: alpha
name: English Metropolis
description: >
  The design system for englishmetro.com — a premium CEFR language-learning
  platform branded as "The Clever City". Two complementary registers: a
  dark navy big-city video-veil hero for the /login landing, and a clean
  white slate-and-violet editorial register for the authenticated student
  shell (dashboard, lessons, vocabulary, knowledge base, practice,
  calendar). The PDF generator and the BYD Bridge lesson-preview decks
  follow the same palette. Mike's 2026-04-22 approval of the ChatGPT
  mock-up set the white-editorial register as canonical for PDFs.

colors:
  # Semantic primaries — The ink for type, the fuchsia for accent, paper
  # for ground. (The login landing inverts these to a dark navy.)
  primary: "#0c1226"       # navy-deep — the login backdrop
  secondary: "#ec4899"     # fuchsia — the accent thread through everything
  neutral: "#ffffff"

  # Navy scale (login landing + modal chrome + dark hero blocks)
  navy-deep: "#0a0e1a"
  navy: "#0c1226"
  navy-raised: "#14203a"
  navy-soft: "#1a2745"

  # Slate scale (student-app shell, PDF body text)
  slate-50: "#f8fafc"
  slate-100: "#f1f5f9"
  slate-200: "#e2e8f0"
  slate-300: "#cbd5e1"
  slate-400: "#94a3b8"
  slate-500: "#64748b"
  slate-600: "#475569"
  slate-700: "#334155"
  slate-800: "#1e293b"
  slate-900: "#0f172a"

  # Brand gradient anchors — "Metro" wordmark, skyline mask, progress dots
  pink-300: "#f9a8d4"
  purple-400: "#c084fc"
  violet-500: "#8b5cf6"
  blue-400: "#60a5fa"
  sky-500: "#0ea5e9"
  cyan-400: "#22d3ee"

  # Interaction & state
  fuchsia-500: "#ec4899"
  fuchsia-600: "#db2777"
  violet-600: "#7c3aed"
  indigo-400: "#818cf8"

  # Emerald kicker — the "THE CLEVER CITY" caps line (with green glow)
  emerald-kicker: "#a7f3d0"
  emerald-glow: "#10b981"

  # Amber dot — the single punctuation mark after "Metro"
  amber: "#fbbf24"
  amber-glow: "#f59e0b"

  # Rose — error / destructive
  rose-500: "#f43f5e"
  rose-600: "#e11d48"

  # Surface / rule
  paper: "#ffffff"
  paper-raised: "#fafafa"
  rule: "#e7e5e4"

typography:
  # Plus Jakarta Sans — the wordmark + UI system
  wordmark-display:
    fontFamily: "Plus Jakarta Sans, Inter, sans-serif"
    fontSize: 128px
    fontWeight: 900
    lineHeight: 1.08
    letterSpacing: -0.02em
  wordmark-lg:
    fontFamily: "Plus Jakarta Sans, Inter, sans-serif"
    fontSize: 68px
    fontWeight: 900
    lineHeight: 1.08
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: "Plus Jakarta Sans, Inter, sans-serif"
    fontSize: 30px
    fontWeight: 800
    lineHeight: 1.15
    letterSpacing: -0.015em
  headline-md:
    fontFamily: "Plus Jakarta Sans, Inter, sans-serif"
    fontSize: 22px
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: -0.01em
  body-lg:
    fontFamily: "Plus Jakarta Sans, Inter, sans-serif"
    fontSize: 15px
    fontWeight: 400
    lineHeight: 1.6
  body-md:
    fontFamily: "Plus Jakarta Sans, Inter, sans-serif"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.55
  label-caps:
    fontFamily: "Plus Jakarta Sans, Inter, sans-serif"
    fontSize: 11px
    fontWeight: 800
    lineHeight: 1
    letterSpacing: 0.32em

  # Newsreader italic — slogans, deks, and the student-name render on
  # the PDF hero (evokes editorial / literary, contrasts the geometric
  # Jakarta wordmark)
  slogan-italic:
    fontFamily: "Newsreader, Playfair Display, serif"
    fontSize: 18px
    fontWeight: 400
    lineHeight: 1.55
    fontFeature: '"ital" 1'
  dek-italic:
    fontFamily: "Newsreader, Playfair Display, serif"
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: '"ital" 1'

  # Fraunces — display serif for lesson-preview deck headlines (BYD Bridge
  # uses "Call centre to dealer network." in Fraunces; matches themonexus
  # register)
  deck-display:
    fontFamily: "Fraunces, Source Serif 4, Georgia, serif"
    fontSize: 54px
    fontWeight: 500
    lineHeight: 1.04
    letterSpacing: -0.02em

  # PDF numerals — giant fuchsia section numbers "1" .. "9"
  pdf-section-number:
    fontFamily: "Plus Jakarta Sans, Inter, sans-serif"
    fontSize: 32px
    fontWeight: 900
    lineHeight: 1
  pdf-section-title:
    fontFamily: "Plus Jakarta Sans, Inter, sans-serif"
    fontSize: 16px
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: -0.005em

  # Mono — IPA, phonetic stress markers, timestamps
  mono-md:
    fontFamily: "IBM Plex Mono, ui-monospace, monospace"
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.35
  mono-sm:
    fontFamily: "IBM Plex Mono, ui-monospace, monospace"
    fontSize: 10.5px
    fontWeight: 400
    lineHeight: 1.25
    letterSpacing: 0.04em

spacing:
  xs: 4px
  sm: 8px
  md: 14px
  lg: 20px
  xl: 32px
  xxl: 56px
  gutter: 24px
  card-pad: 20px
  lockup-pad: 40px

rounded:
  none: 0px
  sm: 6px
  md: 10px
  lg: 18px
  xl: 28px
  pill: 9999px

components:
  # Login lockup — the "English / Metro. / com" wordmark block sitting above
  # the tinted skyline silhouette on the navy video-veil background.
  login-root:
    backgroundColor: "{colors.navy-deep}"
    textColor: "#f8fafc"
  login-kicker:
    textColor: "{colors.emerald-kicker}"
    typography: "{typography.label-caps}"
  login-wordmark:
    textColor: "#f8fafc"
    typography: "{typography.wordmark-display}"
  login-slogan:
    textColor: "#e2e8f0"
    typography: "{typography.slogan-italic}"
  login-card:
    backgroundColor: "{colors.navy-raised}"
    textColor: "#f8fafc"
    rounded: "{rounded.xl}"
    padding: "{spacing.lockup-pad}"
  login-button:
    backgroundColor: "{colors.fuchsia-500}"
    textColor: "#ffffff"
    typography: "{typography.label-caps}"
    rounded: "{rounded.pill}"
    padding: "{spacing.md}"

  # Student-app topbar (inside the authenticated shell)
  app-topbar:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.slate-900}"
    rounded: "{rounded.none}"
    padding: "{spacing.md}"

  # Student-app tab bar (Lessons · Vocabulary · Knowledge · Practice · Calendar)
  app-tab:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.slate-600}"
    typography: "{typography.label-caps}"
    padding: "{spacing.md}"
  app-tab-active:
    textColor: "{colors.fuchsia-600}"
    backgroundColor: "{colors.paper-raised}"

  # Lesson card (on /app/<slug>/lessons)
  lesson-card:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.slate-900}"
    rounded: "{rounded.xl}"
    padding: "{spacing.card-pad}"

  # Keyword chip (vocabulary, knowledge base)
  keyword-chip:
    backgroundColor: "{colors.slate-100}"
    textColor: "{colors.slate-700}"
    rounded: "{rounded.pill}"
    typography: "{typography.body-md}"
    padding: "{spacing.sm}"
  keyword-chip-focus:
    backgroundColor: "{colors.fuchsia-500}"
    textColor: "#ffffff"

  # CEFR band pill (B2, C1 etc — gradient fuchsia → violet → sky)
  cefr-pill:
    backgroundColor: "{colors.fuchsia-500}"
    textColor: "#ffffff"
    rounded: "{rounded.pill}"
    typography: "{typography.label-caps}"
    padding: "{spacing.sm}"

  # PDF section header — big fuchsia numeral "N" + slate-900 title
  pdf-section-number:
    textColor: "{colors.fuchsia-500}"
    typography: "{typography.pdf-section-number}"
  pdf-section-title:
    textColor: "{colors.slate-900}"
    typography: "{typography.pdf-section-title}"

  # PDF metric bar (Vocabulary / Grammar / Fluency / Pronunciation / Communication)
  pdf-bar:
    backgroundColor: "{colors.slate-100}"
    rounded: "{rounded.pill}"
  pdf-bar-vocab:
    backgroundColor: "{colors.violet-500}"
  pdf-bar-grammar:
    backgroundColor: "{colors.indigo-400}"
  pdf-bar-fluency:
    backgroundColor: "{colors.sky-500}"
  pdf-bar-pronunciation:
    backgroundColor: "{colors.amber}"
  pdf-bar-communication:
    backgroundColor: "{colors.fuchsia-500}"

  # BYD Bridge deck (lesson-preview HTML at /lesson-previews/byd-bridge-l3.html)
  deck-cover:
    backgroundColor: "#f6f1e5"
    textColor: "{colors.slate-900}"
    rounded: "{rounded.none}"
    padding: "{spacing.xxl}"
  deck-headline:
    textColor: "{colors.slate-900}"
    typography: "{typography.deck-display}"

  # Conversa AI chat widget
  chat-bubble-assistant:
    backgroundColor: "{colors.slate-100}"
    textColor: "{colors.slate-800}"
    rounded: "{rounded.lg}"
    padding: "{spacing.md}"
  chat-bubble-user:
    backgroundColor: "{colors.fuchsia-500}"
    textColor: "#ffffff"
    rounded: "{rounded.lg}"
    padding: "{spacing.md}"
---

# English Metropolis

Machine-readable tokens are above; this prose is the handbook. Any agent designing for `englishmetro.com`, the lesson-preview decks, or the student-analysis PDF must read this file first. The canonical visual reference for the brand is the **/login landing page** — specifically the "English / Metro. / com" wordmark block over the tinted-skyline silhouette on a navy video-veil. Every other surface — PDF hero, BYD Bridge deck, student-app shell — is consistent with (or a deliberate inversion of) that lockup.

## Overview

The product is a premium CEFR English-learning platform branded **The Clever City**. Copy voice is cosmopolitan, literary, a touch arch; the reader is an adult professional who wants to operate in English at C1-level in boardrooms. The design has two complementary registers:

- **Dark register — the "outside" of the product.** The login landing, marketing surfaces, and the first page of the PDF hero. Navy video-veil background, tinted-skyline silhouette, gradient "Metro" wordmark, amber dot, Newsreader italic slogan. The register evokes night-time skyline, glass-card UI, neon-punctuated but not cyberpunk.
- **Light register — the "inside" of the product.** The authenticated student shell (`/app/<slug>/dashboard` and below), the PDF body pages, the BYD Bridge lesson-preview deck. Cream/paper ground, slate ink, violet/fuchsia/sky accents for structure. The register evokes a curated editorial notebook — clean, readable, warm, unintimidating.

These two registers share the SAME palette tokens (fuchsia, violet, sky, amber, emerald, slate scale); they invert the substrate. A new design surface must commit to one register, then apply the shared accent colours the same way.

Surfaces covered:
- `/login` — the landing (dark register)
- `/app/<slug>/dashboard` + `/lessons` + `/vocabulary` + `/knowledge` + `/practice` + `/calendar` — authenticated shell (light register)
- `/lesson-previews/byd-bridge-l3.html` + `l4.html` — lesson-preview decks (light register with dark deck shell inserts)
- PDF generator output (Aleksandra, Szymon, Mikołaj analyses — light register for pages 1-N, with a small dark wordmark chip top-left of page 1)
- Conversa AI chat widget (light register, fuchsia user bubbles)

## Colors

Colour is organised in three groups:

**Substrate scales** — the surfaces.
- *Navy* (`#0a0e1a` → `#1a2745`) for the dark register. Not pure black; always a 2–3% blue tint.
- *Slate* (`#f8fafc` → `#0f172a`) for the light register. Slate-900 is the ink; slate-50 is the paper.
- *Paper* (`#ffffff`) is reserved for card interiors on the light register — it's the only pure white in the system.

**Brand gradient** — used on the wordmark, skyline mask, progress dots, and CEFR pills. Four stops: `pink-300 (#f9a8d4) → purple-400 (#c084fc) → blue-400 (#60a5fa) → cyan-400 (#22d3ee)`. These stops are NORMATIVE — no re-picking, no re-ordering. The gradient's application is:
- "Metro" word in the wordmark: `135deg, pink-300 0%, purple-400 40%, blue-400 80%, cyan-400 100%`
- Skyline silhouette mask (alpha-masked via `/em-skyline.png`): same angle + same stops.
- CEFR pills (A2 / B1 / B2 / C1 / C2): a linear gradient with the same stops but shortened to 2 stops for pill density.

**Signal colours**:
- *Fuchsia 500 (#ec4899)* — the primary interaction colour. Buttons, focus rings, PDF section numerals, user chat bubbles. One fuchsia per viewport.
- *Violet 500 / Indigo 400* — secondary accent. Vocabulary bar in PDF, "Metro" first stop echo.
- *Sky 500 / Cyan 400* — tertiary. Fluency bar in PDF.
- *Amber (#fbbf24)* with halo glow — the punctuation dot after "Metro". Exactly one amber on any page; it's the signature punctuation mark.
- *Emerald-kicker (#a7f3d0)* with green glow — the "THE CLEVER CITY" caps line above the wordmark. Only appears with the wordmark.
- *Rose 500 (#f43f5e)* — error state only. Never decorative.

## Typography

Three families, one role each:

- **Plus Jakarta Sans** (weights 400, 500, 700, 800, 900) — the wordmark + the entire UI. Geometric enough to do display work (the wordmark renders at up to 128px), humanist enough for body copy. 900-weight for the wordmark and PDF section numerals; 800 for caps-letterspaced labels; 400/500 for body.
- **Newsreader** italic (400) — every slogan, dek, and the student-name render on the PDF hero. It's the ONLY italic on the site. Pairs with Plus Jakarta like a handwritten note pinned to a printed card.
- **Fraunces** (500) — used ONLY on the BYD Bridge lesson-preview decks (matches themonexus.com's display register). Do not use Fraunces inside the student-app shell.
- **IBM Plex Mono** — IPA, phonetic stress markers, timestamps, PDF page-numbers. Small sizes (10.5–12px). Plex Mono only; never any other mono.

**The wordmark** (canonical spec):
- "English" in Plus Jakarta 900, white→indigo-300 gradient (`#ffffff 0% → #e0e7ff 45% → #a5b4fc 100%`).
- "Metro" in Plus Jakarta 900, brand-gradient (see above).
- Amber "." dot at `#fbbf24` with `filter: drop-shadow(0 0 20px rgba(251,191,36,0.6))`.
- "com" (when included) in Plus Jakarta 700 at ~55% of Metro's font-size, `#e2e8f0`.
- Above the lockup, the kicker "THE CLEVER CITY" in Plus Jakarta 800 caps 11px with `letter-spacing: 0.32em` and `#a7f3d0` with emerald glow.

The wordmark is the single most visually-loaded surface in the brand; every attempt to redesign it should start from the login page and stop before "improvements". It has been validated by Mike twice.

## Layout

**Login landing**: two-column grid on desktop (`1.2fr 1fr`), single column on mobile. Left column holds the wordmark + slogan; right column holds the login card. The video background + radial veil + CRT grid overlay are fixed; scroll is disabled on this route.

**Student-app shell**: standard header + tab bar + content viewport. Max content width 1200px, centred. Cards use `rounded.xl` (28px) which is the only place 28px rounding is used; everywhere else radii stay ≤18px.

**PDF generator** (A4 portrait, 595×842pt):
- Page 1 hero is a horizontal strip (~172pt tall) with the small stacked wordmark chip (88×68pt) top-left, the kicker line above, and the student identity (serif-italic name, lesson title, date pill, score pill) on the right. Below the hero, an editorial body at 16.5pt body-lg leading 1.55, with 9 numbered sections each headed by a 32pt fuchsia numeral + 16pt slate-900 title.
- Page 2+ is a compact strip (~58pt) + body + footer.
- Footer is a tri-color `fuchsia → violet → sky` hairline, program kicker left, student/analysis centre, page number right, englishmetro.com in violet-deep right.

**BYD Bridge deck**: slideshow layout, 15 scenes on the combined build and 7 scenes on the per-lesson builds (L3 or L4 only, window.LESSON_FOCUS decides). Cover scene is a cream (`#f6f1e5`) ground with a big Fraunces headline and a SVG road-line graphic. Skyline chip sits top-left.

## Elevation & Depth

Dark register uses layered opacity (navy-deep → navy → navy-raised) plus a cyan-grid CRT overlay at low opacity. No drop-shadows on the login page — the brand uses glow (emerald on kicker, amber on dot, violet halo around skyline) but not shadow.

Light register uses flat elevation via tonal steps (paper on slate-50 ground, raised-paper for active tabs). A single `0 8px 24px rgba(15,23,42,0.06)` soft shadow is permitted on lesson cards and CEFR pills; everything else is flat.

## Shapes

Heavy rounded corners are the house vocabulary. Cards at 28px (`rounded.xl`), dialogs at 18px, chips at pill. The only place flat corners appear is inside the PDF (where the A4 page dictates a sharp substrate) and on the dark-register table chrome. 6px (`rounded.sm`) exists for inputs and small buttons.

## Components

- **Login lockup**: the whole brand condensed. Gradient skyline above the wordmark, kicker line above the skyline, slogan italic below the wordmark. Everything else on the page is in service of this lockup.
- **Login card**: glass-dark at `#14203a` with `rounded.xl`, `inset 0 1px 0 rgba(255,255,255,0.12)` as the only border, and a full-width fuchsia CTA.
- **App topbar**: white, 64px tall, small wordmark chip left (skyline + "EnglishMetro" horizontal), tabs centre, profile right.
- **App tab bar**: fuchsia underline for active tab, no background pill.
- **Lesson card**: white card, rounded-xl, with a violet→sky gradient dot bullet for the lesson-summary bullet points, a CEFR pill right, and a row of action chips at bottom (Open Lesson, Raw Notes, Analysis PDF, Preview Lesson).
- **Keyword chip**: slate-100 background, slate-700 text, pill-rounded. Focused keyword (from URL deeplink) swaps to fuchsia bg + white text.
- **CEFR pill**: gradient pill, Plus Jakarta 800 caps. "B2 · 82/100" format. Never any other format.
- **PDF section header**: `1` in 32pt fuchsia, title in 16pt slate-900 bold. Offset the numeral 28pt to the left of the title.
- **PDF metric bar**: 10pt tall, pill-rounded. Slate-100 track, brand-scale fill. Vocabulary=violet, Grammar=indigo, Fluency=sky, Pronunciation=amber, Communication=fuchsia. These five colours are normative — do not rotate.
- **BYD Bridge deck cover**: cream substrate, Fraunces 54pt headline, fuchsia + cyan road-line SVG. Skyline chip top-left. Kicker "BYD BRIDGE · LESSON 3" or "LESSON 4" top-left per the `window.LESSON_FOCUS` value. The combined "Lessons 3 & 4" wording is deprecated per Mike 2026-04-22.
- **Conversa AI chat widget**: floating at bottom-right, circle button branded with the skyline glyph. Expanded: messages scroll, user bubbles in fuchsia-500 with white text, assistant bubbles in slate-100 with slate-800 text. Follows `[ag-err-XXX]` → drill-chip deep-links on assistant output (amber chip linking to /practice?errorId=X).

## Do's and Don'ts

- **Do** treat the `/login` landing as the canonical brand reference. Any wordmark rendering on any surface MUST be pixel-consistent with that lockup (Plus Jakarta 900 + four-stop gradient + amber dot).
- **Do** reuse the brand gradient — do not reinvent stops. `pink-300 → purple-400 → blue-400 → cyan-400` is canonical for the skyline, wordmark "Metro", and CEFR pills.
- **Do** keep EXACTLY ONE amber dot per page — it's a signature, not decoration.
- **Do** render CEFR band + score as a single gradient pill: `B2 · 82/100`. Not two pills. Not a pill + text.
- **Do** use Plus Jakarta for everything UI; Newsreader italic for the single slogan/dek line per page; IBM Plex Mono for IPA and timestamps; Fraunces ONLY inside BYD Bridge decks.
- **Don't** introduce a 5th colour in the metric-bar set. Vocabulary/Grammar/Fluency/Pronunciation/Communication are fixed colours.
- **Don't** use fuchsia for anything that isn't interactive. If it's on the page but not clickable, it's not fuchsia.
- **Don't** mix registers. A surface is either dark (navy) or light (paper/slate). Don't create a white login card or a dark dashboard without an explicit brief.
- **Don't** drop the kicker "THE CLEVER CITY" on the login. It's half the brand's voice.
- **Don't** render the PDF wordmark chip bigger than 88×68pt — that ratio was approved 2026-04-22 after a previous too-big draft was rejected.
- **Don't** use Fraunces inside the student-app shell. Fraunces is reserved for BYD Bridge decks and themonexus editorial; using it in /app breaks register.
- **Don't** add a corner radius over 28px anywhere. The glass-card shell is the limit.
