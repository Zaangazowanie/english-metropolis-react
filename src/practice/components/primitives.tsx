// Shared UI primitives for English Metropolis practice shells.
// Bajla the pigeon, hint chips, progress, the bilingual hint card.

import React from 'react';

// ─────────────────────────────────────────────────────────────
// Bajla — the mascot pigeon
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

export const Bajla: React.FC<BajlaProps> = ({ size = 44, mood = 'idle', style = {}, decorative = false }) => {
  // 2026-05-02: replaced inline SVG mascot with Mike's commissioned 3D-render
  // PNG (transparent bg via rembg, see /public/bajla.png). The mood prop now
  // drives bob speed only — visual variations (cheer sparkles, eye shape)
  // were tied to SVG paths and don't apply to a raster source.
  const a11yProps = decorative
    ? { 'aria-hidden': true as const }
    : { role: 'img' as const, 'aria-label': 'Bajla, the pigeon — your guide · Bajla — twoja przewodniczka' };
  const animation = mood === 'cheer'
    ? 'em-bob 0.6s var(--em-ease) infinite'
    : 'em-bob 2.4s var(--em-ease) infinite';
  return (
    <img
      className="bajla"
      src="/bajla.png"
      alt={decorative ? '' : 'Bajla'}
      width={size}
      height={size}
      draggable={false}
      {...a11yProps}
      style={{
        display: 'inline-block',
        objectFit: 'contain',
        animation,
        userSelect: 'none',
        ...style,
      }}
    />
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
