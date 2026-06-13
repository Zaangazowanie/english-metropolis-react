// Shared UI primitives for English Metropolis practice shells.
// Bajla the pigeon, hint chips, progress, the bilingual hint card.

import React from 'react';

// ─────────────────────────────────────────────────────────────
// Bajla — the mascot pigeon (pastel hand-drawn, procedural SVG)
//
// 2026-06-13 (Wave-2 widget uplift): replaced the flat /bajla.png raster with
// a procedural, vector pigeon that renders crisply at every call-site size
// (36–120px) and performs a distinct gesture per `mood`:
//   • idle  — soft breathing, slow head-bob, lazy blink
//   • cheer — a little hop, open-wing flap, sparkle twinkle
//   • think — head cocked, a wing curled up to the chin, rising thought-dots
//   • wave  — a friendly raised wing-wave + gentle bob
// Everything is inline (no external/runtime URLs, no new deps). The gesture
// choreography lives in a single <style> injected once into <head>; under
// `prefers-reduced-motion: reduce` all animation is disabled and Bajla rests
// in the expressive *static* pose for her mood (the wing stays raised for
// wave, dots stay visible for think, etc.). The public API — `BajlaMood`,
// `BajlaProps` and the bilingual a11y label — is unchanged, so this is a
// drop-in for all existing call-sites.
// ─────────────────────────────────────────────────────────────
export type BajlaMood = 'idle' | 'cheer' | 'think' | 'wave';

export interface BajlaProps {
  size?: number;
  mood?: BajlaMood;
  style?: React.CSSProperties;
  /**
   * When true, the SVG is hidden from assistive tech (`aria-hidden="true"`,
   * no role/label). Use this for ambient/scenic Bajlas where the surrounding
   * UI already conveys state (e.g., the live region in TrueFalse, the
   * celebration `<div role="region">` in DragDrop completion screens).
   *
   * Default (false) renders Bajla as `role="img"` with the bilingual label
   * "Bajla, the pigeon — your guide · Bajla — twoja przewodniczka" so screen
   * readers introduce her properly inside HintCard / InterferenceTip / etc.
   */
  decorative?: boolean;
}

// Per-mood gesture choreography. Injected once (id-guarded) so the ~30 call
// sites share a single <style>; theme-agnostic, prefixed `bj-` to avoid any
// collision with app CSS. transform-box/origin pin each pivot in viewBox
// units; the reduced-motion guard freezes Bajla into her static mood pose.
const BAJLA_STYLE_ID = 'em-bajla-pigeon-styles';
const BAJLA_CSS = `
.bj-svg{ --bj-ease: cubic-bezier(.42,0,.2,1); }
.bj-root,.bj-body,.bj-head,.bj-wing-l,.bj-wing-r,.bj-arm{ transform-box: view-box; }
.bj-eye,.bj-sparkle{ transform-box: fill-box; transform-origin: center; }
.bj-root{ transform-origin: 60px 110px; }
.bj-body{ transform-origin: 60px 98px; }
.bj-head{ transform-origin: 60px 52px; }
.bj-wing-l{ transform-origin: 40px 56px; }
.bj-wing-r{ transform-origin: 80px 56px; }
.bj-arm{ transform-origin: 71px 77px; }
.bj-sparkles,.bj-thought,.bj-arm{ opacity: 0; }
.bj-svg[data-mood="idle"] .bj-root{ animation: bj-bob 3.8s var(--bj-ease) infinite; }
.bj-svg[data-mood="idle"] .bj-body{ animation: bj-breath 3.8s var(--bj-ease) infinite; }
.bj-svg[data-mood="idle"] .bj-head{ animation: bj-nod 5.4s var(--bj-ease) infinite; }
.bj-svg[data-mood="idle"] .bj-eye { animation: bj-blink 5s linear infinite; }
.bj-svg[data-mood="cheer"] .bj-root  { animation: bj-hop .92s var(--bj-ease) infinite; }
.bj-svg[data-mood="cheer"] .bj-wing-l{ transform: rotate(20deg);  animation: bj-flapL .42s var(--bj-ease) infinite; }
.bj-svg[data-mood="cheer"] .bj-wing-r{ transform: rotate(-20deg); animation: bj-flapR .42s var(--bj-ease) infinite; }
.bj-svg[data-mood="cheer"] .bj-sparkles{ opacity: 1; }
.bj-svg[data-mood="cheer"] .bj-sparkle{ animation: bj-spark 1.15s ease-in-out infinite; }
.bj-svg[data-mood="cheer"] .bj-sparkle.s2{ animation-delay: .38s; }
.bj-svg[data-mood="cheer"] .bj-sparkle.s3{ animation-delay: .72s; }
.bj-svg[data-mood="cheer"] .bj-sparkle.s4{ animation-delay: .95s; }
.bj-svg[data-mood="cheer"] .bj-eye{ animation: bj-blink 3.4s linear infinite; }
.bj-svg[data-mood="think"] .bj-head{ transform: rotate(-7deg); animation: bj-thinkHead 3.6s var(--bj-ease) infinite; }
.bj-svg[data-mood="think"] .bj-arm { opacity: 1; animation: bj-tap 3.6s var(--bj-ease) infinite; }
.bj-svg[data-mood="think"] .bj-thought{ opacity: 1; }
.bj-svg[data-mood="think"] .bj-thought .t1{ animation: bj-dot 1.9s ease-in-out infinite; }
.bj-svg[data-mood="think"] .bj-thought .t2{ animation: bj-dot 1.9s ease-in-out .28s infinite; }
.bj-svg[data-mood="think"] .bj-thought .t3{ animation: bj-dot 1.9s ease-in-out .56s infinite; }
.bj-svg[data-mood="think"] .bj-eye{ animation: bj-blink 5.5s linear infinite; }
.bj-svg[data-mood="wave"] .bj-root  { animation: bj-bob 2.4s var(--bj-ease) infinite; }
.bj-svg[data-mood="wave"] .bj-wing-r{ transform: rotate(-72deg); animation: bj-wave 1.1s var(--bj-ease) infinite; }
.bj-svg[data-mood="wave"] .bj-eye{ animation: bj-blink 4.2s linear infinite; }
@keyframes bj-bob{ 0%,100%{ transform: translateY(0) } 50%{ transform: translateY(-2.4px) } }
@keyframes bj-breath{ 0%,100%{ transform: scaleY(1) } 50%{ transform: scaleY(1.04) } }
@keyframes bj-nod{ 0%,100%{ transform: rotate(0) } 50%{ transform: rotate(2.4deg) } }
@keyframes bj-blink{ 0%,93%,100%{ transform: scaleY(1) } 96.5%{ transform: scaleY(.1) } }
@keyframes bj-hop{ 0%,100%{ transform: translateY(0) } 28%{ transform: translateY(-9px) } 46%{ transform: translateY(-7px) } 72%{ transform: translateY(0) } }
@keyframes bj-flapL{ 0%,100%{ transform: rotate(20deg) } 50%{ transform: rotate(1deg) } }
@keyframes bj-flapR{ 0%,100%{ transform: rotate(-20deg) } 50%{ transform: rotate(-1deg) } }
@keyframes bj-spark{ 0%,100%{ opacity:0; transform: scale(.3) } 45%{ opacity:1; transform: scale(1) } }
@keyframes bj-thinkHead{ 0%,100%{ transform: rotate(-7deg) } 50%{ transform: rotate(-9.5deg) } }
@keyframes bj-tap{ 0%,100%{ transform: rotate(0) } 50%{ transform: rotate(-3deg) } }
@keyframes bj-dot{ 0%,100%{ opacity:.35; transform: translateY(1.5px) } 50%{ opacity:1; transform: translateY(-2px) } }
@keyframes bj-wave{ 0%,100%{ transform: rotate(-66deg) } 25%{ transform: rotate(-84deg) } 50%{ transform: rotate(-60deg) } 75%{ transform: rotate(-82deg) } }
@media (prefers-reduced-motion: reduce){ .bj-svg *{ animation: none !important; } }
`;

function ensureBajlaStyles(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById(BAJLA_STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = BAJLA_STYLE_ID;
  el.textContent = BAJLA_CSS;
  document.head.appendChild(el);
}
ensureBajlaStyles();

// Per-instance id seed so each Bajla's gradients/clip are uniquely namespaced
// (identical-but-duplicate ids would break if the first instance unmounts).
let bajlaUid = 0;

export const Bajla: React.FC<BajlaProps> = ({ size = 44, mood = 'idle', style = {}, decorative = false }) => {
  const idRef = React.useRef<string | null>(null);
  if (idRef.current === null) idRef.current = `b${++bajlaUid}`;
  const S = idRef.current;
  const ink = '#534B73';
  const a11yProps = decorative
    ? { 'aria-hidden': true as const }
    : { role: 'img' as const, 'aria-label': 'Bajla, the pigeon — your guide · Bajla — twoja przewodniczka' };
  return (
    <svg
      className="bajla bj-svg"
      data-mood={mood}
      viewBox="0 0 120 120"
      width={size}
      height={size}
      fill="none"
      draggable={false}
      {...a11yProps}
      style={{ display: 'inline-block', userSelect: 'none', width: size, height: size, ...style }}
    >
      <defs>
        <linearGradient id={`bjBody${S}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#CFD3F8" /><stop offset="1" stopColor="#9AA2E8" />
        </linearGradient>
        <linearGradient id={`bjWing${S}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#969DE3" /><stop offset="1" stopColor="#767ECB" />
        </linearGradient>
        <linearGradient id={`bjBeak${S}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FAB475" /><stop offset="1" stopColor="#EB8B45" />
        </linearGradient>
        <linearGradient id={`bjNeck${S}`} x1="0" y1="0" x2="1" y2="0.3">
          <stop offset="0" stopColor="#7DE6CE" /><stop offset="0.55" stopColor="#F4ABD8" /><stop offset="1" stopColor="#BEA7F2" />
        </linearGradient>
        <radialGradient id={`bjBelly${S}`} cx="0.5" cy="0.4" r="0.75">
          <stop offset="0" stopColor="#F6F7FF" /><stop offset="1" stopColor="#E1E4FC" />
        </radialGradient>
        <clipPath id={`bjClip${S}`}>
          <path d="M60,46 C80,46 92,60 92,77 C92,93 78,103 60,103 C42,103 28,93 28,77 C28,60 40,46 60,46 Z" />
        </clipPath>
      </defs>

      {/* contact shadow — outside bj-root so it stays grounded during the hop */}
      <ellipse className="bj-shadow" cx="60" cy="113" rx="29" ry="4.4" fill="#5A4E78" opacity="0.16" />

      <g className="bj-root">
        {/* tail (behind body) */}
        <path className="bj-tail" d="M60,92 C56,100 53,106 50,111 C54,109 57,106 60,104 C63,106 66,109 70,111 C67,106 64,100 60,92 Z" fill={`url(#bjWing${S})`} stroke={ink} strokeWidth="2.1" strokeLinejoin="round" />

        {/* feet */}
        <g stroke="#E98A45" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" fill="none">
          <path d="M54,100 L52,108 M52,108 L48.5,111 M52,108 L52,112 M52,108 L55.5,111" />
          <path d="M66,100 L68,108 M68,108 L64.5,111 M68,108 L68,112 M68,108 L71.5,111" />
        </g>

        {/* body */}
        <g className="bj-body">
          <path d="M60,46 C80,46 92,60 92,77 C92,93 78,103 60,103 C42,103 28,93 28,77 C28,60 40,46 60,46 Z" fill={`url(#bjBody${S})`} stroke={ink} strokeWidth="2.4" strokeLinejoin="round" />
          <path d="M60,62 C75,62 83,73 83,84 C83,95 72,101 60,101 C48,101 37,95 37,84 C37,73 45,62 60,62 Z" fill={`url(#bjBelly${S})`} opacity="0.96" />
          <g clipPath={`url(#bjClip${S})`}>
            <path d="M34,57 C46,51 74,51 86,57 C81,68 70,72 60,72 C50,72 39,68 34,57 Z" fill={`url(#bjNeck${S})`} opacity="0.5" />
          </g>
        </g>

        {/* left wing (flipper) */}
        <g className="bj-wing-l">
          <path d="M40,55 C31,57 27,67 30,77 C31.5,80 37,80 39,74 C42,67 43,59 42,56 C41.5,55 41,55 40,55 Z" fill={`url(#bjWing${S})`} stroke={ink} strokeWidth="2.2" strokeLinejoin="round" />
          <path d="M30,77 C27.5,73 29,69 32,70 C33,74 32,78 30,77 Z" fill="#A8E9E1" />
          <path d="M34,60 C33,67 31.5,73 30,77 M38,60 C37.5,68 36,74 34,78" stroke="#6E75BE" strokeWidth="1.3" strokeLinecap="round" />
        </g>

        {/* head */}
        <g className="bj-head">
          <g className="bj-crest" fill={`url(#bjBody${S})`} stroke={ink} strokeWidth="1.8" strokeLinejoin="round">
            <path d="M52,16 C50,9 56,7 57,14 C56,15.5 53.5,16 52,16 Z" />
            <path d="M59,14 C58,6 64,6 63,14 C62,15.5 60,15.5 59,14 Z" />
            <path d="M65,15 C65.5,8 71,9 68.5,16 C67.5,16 66,16 65,15 Z" />
          </g>
          <circle cx="60" cy="34" r="21" fill={`url(#bjBody${S})`} stroke={ink} strokeWidth="2.4" />
          <ellipse cx="44.5" cy="41" rx="6" ry="3.6" fill="#F7AECE" opacity="0.5" />
          <ellipse cx="75.5" cy="41" rx="6" ry="3.6" fill="#F7AECE" opacity="0.5" />
          {/* beak */}
          <path d="M50,43 C54,40 66,40 70,43 C68,51 64,56 60,56 C56,56 52,51 50,43 Z" fill={`url(#bjBeak${S})`} stroke={ink} strokeWidth="1.8" strokeLinejoin="round" />
          <path d="M52.5,46 C56,49 64,49 67.5,46" stroke="#C9743A" strokeWidth="1.2" strokeLinecap="round" />
          <circle cx="56.5" cy="44.2" r="0.9" fill="#9A5A2C" /><circle cx="63.5" cy="44.2" r="0.9" fill="#9A5A2C" />
          {/* eyes */}
          <g className="bj-eye bj-eye-l">
            <circle cx="50" cy="33" r="6.4" fill="#2E2A47" stroke="#F2A06A" strokeWidth="1.5" />
            <circle cx="47.7" cy="30.6" r="2.1" fill="#fff" />
            <circle cx="51.7" cy="35" r="1" fill="#fff" opacity="0.7" />
          </g>
          <g className="bj-eye bj-eye-r">
            <circle cx="70" cy="33" r="6.4" fill="#2E2A47" stroke="#F2A06A" strokeWidth="1.5" />
            <circle cx="67.7" cy="30.6" r="2.1" fill="#fff" />
            <circle cx="71.7" cy="35" r="1" fill="#fff" opacity="0.7" />
          </g>
        </g>

        {/* think arm — a wing curled up to the chin (think mood only) */}
        <g className="bj-arm">
          <path d="M71,77 C64,75 58.5,68 60,60 C60.5,57 62.2,56 63.4,57.2 C64.4,58.2 64,60 63.4,61.6 C62,66 64.5,71 69.5,74 C70.8,74.8 71.2,76 71,77 Z" fill={`url(#bjWing${S})`} stroke={ink} strokeWidth="2" strokeLinejoin="round" />
        </g>

        {/* right wing (flipper / gesture wing) */}
        <g className="bj-wing-r">
          <path d="M80,55 C89,57 93,67 90,77 C88.5,80 83,80 81,74 C78,67 77,59 78,56 C78.5,55 79,55 80,55 Z" fill={`url(#bjWing${S})`} stroke={ink} strokeWidth="2.2" strokeLinejoin="round" />
          <path d="M90,77 C92.5,73 91,69 88,70 C87,74 88,78 90,77 Z" fill="#A8E9E1" />
          <path d="M86,60 C87,67 88.5,73 90,77 M82,60 C82.5,68 84,74 86,78" stroke="#6E75BE" strokeWidth="1.3" strokeLinecap="round" />
        </g>

        {/* cheer sparkles */}
        <g className="bj-sparkles">
          <path className="bj-sparkle s1" d="M21,18 L21.96,23.04 L27,24 L21.96,24.96 L21,30 L20.04,24.96 L15,24 L20.04,23.04 Z" fill="#FFE39A" />
          <path className="bj-sparkle s2" d="M99,28 L99.8,32.2 L104,33 L99.8,33.8 L99,38 L98.2,33.8 L94,33 L98.2,32.2 Z" fill="#F8B6D6" />
          <path className="bj-sparkle s3" d="M94,10 L94.64,13.36 L98,14 L94.64,14.64 L94,18 L93.36,14.64 L90,14 L93.36,13.36 Z" fill="#9DE7DD" />
          <path className="bj-sparkle s4" d="M16,50.6 L16.54,53.46 L19.4,54 L16.54,54.54 L16,57.4 L15.46,54.54 L12.6,54 L15.46,53.46 Z" fill="#FFD2E6" />
        </g>

        {/* think thought-dots */}
        <g className="bj-thought" fill="#ECEAFB" stroke={ink} strokeWidth="1.4">
          <circle className="t1" cx="83" cy="26" r="2.6" />
          <circle className="t2" cx="93" cy="17" r="3.5" />
          <circle className="t3" cx="104" cy="8" r="4.5" />
        </g>
      </g>
    </svg>
  );
};

// ─────────────────────────────────────────────────────────────
// HintCard — bilingual hint card (English exercise context, Polish translation/help)
// ─────────────────────────────────────────────────────────────
export interface HintCardProps {
  english: React.ReactNode;
  polish: React.ReactNode;
  label?: string;
}

export const HintCard: React.FC<HintCardProps> = ({ english, polish, label = 'Bajla mówi' }) => (
  <div style={{
    display: 'flex', gap: 12, alignItems: 'flex-start',
    padding: '14px 16px',
    background: 'linear-gradient(180deg, rgba(232,121,249,0.08), rgba(167,139,250,0.04))',
    border: '1px solid rgba(232,121,249,0.22)',
    borderRadius: 14,
    position: 'relative',
  }}>
    <Bajla size={36} />
    <div style={{ flex: 1, minWidth: 0 }}>
      <div className="em-eyebrow" style={{ color: 'var(--em-magenta)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 14, lineHeight: 1.45, color: 'var(--em-text)', marginBottom: 4 }}>{english}</div>
      <div className="em-hint-pl">🇵🇱 {polish}</div>
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────
// Progress — question N of M (POSITION-based, single semantic)
//
// CC-5 fix (Ricky, 2026-05-02): Header text is ALWAYS position-based —
// "Q 3 / 25" means "currently on question 3 of 25", matching the inner
// panel's "Q 1 of N" convention and how every quiz/test UI in the world
// works. The completion count (correct answers) is conveyed visually by
// the dotted bar's accent fill, NOT as adjacent text — that was the
// "two semantics adjacent" bug (header said "0 done", panel said "on Q1").
//
// Contract:
//   • `current` legacy meaning was "completed" but most call-sites pass
//     position (puzzleIdx + 1). When `seen` is omitted we treat `current`
//     AS the position (back-compat: that's what those callers wanted to
//     display anyway).
//   • When `seen` is provided, the header shows `Q seen / total` (position),
//     and the dotted bar visually fills `current` cells (completion).
//   • aria-label still announces both values for screen readers.
//
// This fixes:
//   - "Q 00/N · ✓ 00/N" header dropping back to a single "Q N/T" chip
//   - True/False's 4-counter clutter (per-shell ✓/✕ tally chips remain;
//     the redundant ✓ inside Progress is gone)
//   - Off-by-one mismatch with inner panel's "Q 1 of N"
//   - Zero-pad ("00/05") replaced with clean "1/5"
// ─────────────────────────────────────────────────────────────
export interface ProgressProps {
  current: number;
  total: number;
  accent?: string;
  /**
   * Position the player is on (1-indexed). When provided, this drives the
   * header text "Q seen/total" and `current` becomes the completion count
   * that fills the dotted bar visually. When omitted, `current` is treated
   * as the position itself (legacy single-value contract).
   */
  seen?: number;
}

export const Progress: React.FC<ProgressProps> = ({ current, total, accent = 'var(--em-magenta)', seen }) => {
  // Position the player is currently on (1-indexed display).
  // If `seen` is given, that's the position; otherwise `current` is.
  const position = typeof seen === 'number' ? seen : current;
  // Completion count for the dotted bar (capped at total just in case).
  const completed = Math.max(0, Math.min(current, total));
  const ariaLabel = typeof seen === 'number'
    ? `Question ${position} of ${total}, ${completed} correct`
    : `Question ${position} of ${total}`;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div className="em-eyebrow" aria-label={ariaLabel}>
        <span style={{ opacity: 0.6, marginRight: 4 }}>Q</span>
        <span>{position}</span>
        <span style={{ opacity: 0.4, margin: '0 4px' }}>/</span>
        <span style={{ opacity: 0.7 }}>{total}</span>
      </div>
      <div style={{ display: 'flex', gap: 4 }} aria-hidden="true">
        {Array.from({ length: total }, (_, i) => (
          <div key={i} style={{
            width: i < completed ? 18 : 6,
            height: 4,
            borderRadius: 999,
            background: i < completed ? accent : 'rgba(255,255,255,0.12)',
            transition: 'all 320ms var(--em-ease)',
          }} />
        ))}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// Nameplate — district title block at the top of every shell
// ─────────────────────────────────────────────────────────────
export interface NameplateProps {
  district: React.ReactNode;
  subtitle?: React.ReactNode;
  accent?: string;
  icon?: React.ReactNode;
}

export const Nameplate: React.FC<NameplateProps> = ({ district, subtitle, accent = 'var(--em-magenta)', icon }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
    <div style={{
      width: 44, height: 44, borderRadius: 12,
      background: `linear-gradient(135deg, ${accent}, rgba(255,255,255,0.05))`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      border: '1px solid rgba(255,255,255,0.12)',
    }}>{icon}</div>
    <div>
      <div className="em-eyebrow" style={{ color: accent, opacity: 0.85 }}>English Metropolis · district</div>
      {/* Kelly Tier-2 a11y (2026-05-02): district name promoted from <div> to
          <h2> so screen-reader landmark navigation can jump to it. Styling
          preserved (margin/font reset via inline style). */}
      <h2 className="em-decor" style={{ fontSize: 22, color: 'var(--em-text)', lineHeight: 1, margin: 0, fontWeight: 'inherit' }}>{district}</h2>
      {subtitle && <div style={{ fontSize: 12, color: 'var(--em-text-muted)', marginTop: 2 }}>{subtitle}</div>}
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────
// SkipButton — kindly worded, tertiary
// ─────────────────────────────────────────────────────────────
export interface SkipButtonProps {
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
}

export const SkipButton: React.FC<SkipButtonProps> = ({ onClick }) => (
  <button
    className="em-btn em-btn-ghost"
    onClick={onClick}
    aria-label="Skip this question · Pomiń to pytanie"
    style={{ fontSize: 12, padding: '8px 14px' }}
  >
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M3 2 L8 6 L3 10 M9 2 L9 10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
    Skip · Następne
  </button>
);

// ─────────────────────────────────────────────────────────────
// HintButton
// ─────────────────────────────────────────────────────────────
export interface HintButtonProps {
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  used?: number;
  total?: number;
}

export const HintButton: React.FC<HintButtonProps> = ({ onClick, used = 0, total = 3 }) => {
  const exhausted = used >= total;
  return (
    <button
      className="em-btn em-btn-ghost"
      onClick={exhausted ? undefined : onClick}
      disabled={exhausted}
      aria-disabled={exhausted}
      aria-label={exhausted ? 'Hint, no hints left · brak podpowiedzi' : `Hint, ${total - used} of ${total} remaining · podpowiedź`}
      style={{
        fontSize: 12,
        padding: '8px 14px',
        opacity: exhausted ? 0.5 : 1,
        cursor: exhausted ? 'not-allowed' : 'pointer',
      }}
    >
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
        <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.2" />
        <path d="M6 4 L6 6 M6 8 L6 8.01" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
      Hint <span style={{ opacity: 0.5 }}>{used}/{total}</span>
    </button>
  );
};

// ─────────────────────────────────────────────────────────────
// Confetti — burst on completion celebrations
// ─────────────────────────────────────────────────────────────
export interface ConfettiProps {
  show: boolean;
}

export const Confetti: React.FC<ConfettiProps> = ({ show }) => {
  if (!show) return null;
  const pieces = Array.from({ length: 24 }, (_, i) => i);
  const colors = ['#E879F9', '#A78BFA', '#FBBF24', '#34D399', '#7DD3FC', '#FB7185'];
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      {pieces.map(i => (
        <div key={i} style={{
          position: 'absolute',
          left: `${10 + (i * 3.5) % 80}%`,
          top: '20%',
          width: 8, height: 8,
          background: colors[i % colors.length],
          borderRadius: i % 3 === 0 ? '50%' : '2px',
          animation: `em-confetti ${1.2 + (i % 4) * 0.2}s var(--em-ease) ${(i % 6) * 0.05}s forwards`,
        }} />
      ))}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// SkylineBackdrop — tiny photo placeholder for a city skyline behind the shell
// ─────────────────────────────────────────────────────────────
export type SkylineTime = 'day' | 'dusk' | 'night';

export interface SkylineBackdropProps {
  hue?: number;
  time?: SkylineTime;
}

export const SkylineBackdrop: React.FC<SkylineBackdropProps> = ({ time = 'dusk' }) => {
  const skyByTime: Record<SkylineTime, string> = {
    day: 'linear-gradient(180deg, #6E4FB7 0%, #B89AE0 60%, #F4D5BA 100%)',
    dusk: 'linear-gradient(180deg, #1F1240 0%, #4C1F70 50%, #B85A88 100%)',
    night: 'linear-gradient(180deg, #02010C 0%, #100829 60%, #2A1450 100%)',
  };
  return (
    <div className="em-photo em-grain" style={{ position: 'absolute', inset: 0, background: skyByTime[time] }}>
      {/* skyline silhouette using clip-path-like svgs */}
      <svg viewBox="0 0 1200 400" preserveAspectRatio="none" style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', height: '60%' }}>
        <defs>
          <linearGradient id="cityFade" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#0E0A1A" stopOpacity="0.2" />
            <stop offset="1" stopColor="#0E0A1A" stopOpacity="1" />
          </linearGradient>
        </defs>
        <path d="M0 400 L0 280 L60 280 L60 200 L100 200 L100 240 L160 240 L160 160 L210 160 L210 220 L260 220 L260 180 L320 180 L320 140 L360 140 L360 100 L390 100 L390 160 L450 160 L450 220 L520 220 L520 180 L580 180 L580 240 L640 240 L640 200 L700 200 L700 260 L760 260 L760 180 L820 180 L820 140 L880 140 L880 220 L940 220 L940 260 L1000 260 L1000 200 L1060 200 L1060 240 L1120 240 L1120 280 L1200 280 L1200 400 Z"
          fill="url(#cityFade)" />
      </svg>
      {/* lit windows */}
      {time !== 'day' && Array.from({ length: 50 }).map((_, i) => (
        <div key={i} style={{
          position: 'absolute',
          left: `${(i * 7.3) % 100}%`,
          bottom: `${5 + (i * 11) % 35}%`,
          width: 2, height: 2,
          background: i % 5 === 0 ? '#FBBF24' : '#F4E4A1',
          opacity: 0.5 + (i % 3) * 0.2,
          animation: i % 7 === 0 ? `em-flicker ${3 + (i % 3)}s infinite` : 'none',
        }} />
      ))}
    </div>
  );
};

// LegacySkylineBackdrop is preserved as a named alias for downstream code that
// previously read window.LegacySkylineBackdrop. The anime.jsx layer overrides
// SkylineBackdrop with its painted variant; consumers wanting the original
// silhouette can import LegacySkylineBackdrop directly.
export const LegacySkylineBackdrop = SkylineBackdrop;

// ─────────────────────────────────────────────────────────────
// Sprint-2 cross-shell utilities — promoted to canonical primitives.
// Re-exported here so existing call sites can keep doing
// `import { Dial, MCQOverlay, useEndOfShellTip, useArcadeSession, normalise }
//    from '../components/primitives';`
// ─────────────────────────────────────────────────────────────
export { Dial } from './Dial';
export type { DialProps } from './Dial';
export { MCQOverlay } from './MCQOverlay';
export type { MCQOverlayProps } from './MCQOverlay';
export { useEndOfShellTip } from '../lib/useEndOfShellTip';
export type {
  WrongAttempt,
  UseEndOfShellTipOpts,
  UseEndOfShellTipResult,
} from '../lib/useEndOfShellTip';
export { useArcadeSession } from '../lib/useArcadeSession';
export type { ArcadeRound, UseArcadeSessionResult } from '../lib/useArcadeSession';
export { normalise } from '../lib/text';
