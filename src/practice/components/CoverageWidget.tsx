// CoverageWidget.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Phase 1.6 of the §4 #21 (Mike CRITICAL) content-scheduler sprint —
// keyword-bank coverage motivator. Shows the student "you've practiced N of M
// keywords from your bank in the last 7 days, K untouched" so they SEE their
// own breadth-of-exposure and feel pulled toward the rare items rather than
// recycling the same 5-6 sentences across every shell.
//
// Authored by Ricky 2026-05-02 in response to CD's audit finding (file
// /tmp/cd-audit/final-audit-report-for-ricky.md, §4 #21):
//   "Aleksandra has 168+ keywords in her bank but the same ~10 keep cycling.
//    The platform is recycling content instead of exposing her to her bank's
//    breadth."
//
// Wiring contract:
//   - Lives in PitchCard's right rail (desktop ≥1280px) and inline above the
//     "DZIŚ POLECANE · TODAY'S 3 DISTRICTS" foot.
//   - Renders a `compact` chip on mobile (always-on, inline with the title row
//     in StudentPractice's em-dash-head).
//   - Reads via `students:getCoverage` (convex/students.ts). Uses the same
//     fetch-based useQueryConvex pattern as the rest of the practice canvas
//     (see lib/convex-stubs.ts header).
//   - Anonymous / signed-out callers get a degraded chip (or null when the
//     compact variant is mounted with no slug — we don't want to imply a
//     coverage % to someone who has no bank).
//   - On query error or when bankSize === 0, RETURNS NULL — degrade silently
//     per spec ("If query fails: degrade silently (don't render widget)").
//
// What this file deliberately does NOT do:
//   - Doesn't write anything. Read-only.
//   - Doesn't trigger spaced-repetition / variety-guard logic — those are
//     separate agents (G2/G3/F3a). This is the visibility layer (Phase 3 of
//     the audit's three-phase rollout).

import React from 'react';
import { useQueryConvex } from '../lib/convex-stubs';

// ─── Types ──────────────────────────────────────────────────────────────────
// Mirrors the return shape of students:getCoverage. Keep in sync if you
// extend the Convex query.
interface CoverageData {
  bankSize: number;
  practiced: number;
  untouched: number;
  pct: number;
  withinDays: number;
  hasExposureData: boolean;
}

export interface CoverageWidgetProps {
  /** Required to look up the student's bank + exposure rows. When omitted
   *  we render nothing (anonymous caller — no meaningful signal). */
  studentSlug?: string;
  /** 'compact' = single chip (mobile / inline with title row).
   *  'full'    = card with progress bar, untouched callout, motivational copy. */
  variant?: 'compact' | 'full';
  /** Recency window — defaults to 7 days. Exposed for future "this month"
   *  views in the teacher dashboard. */
  withinDays?: number;
  /** Optional className passthrough so the consumer can position. */
  className?: string;
}

// ─── Motivational copy bands ────────────────────────────────────────────────
// Bilingual EN+PL throughout — matches the bilingual contract every other
// student-facing component already follows (em-bilingual-i18n memory).
function bandFor(pct: number): {
  en: string;
  pl: string;
  body: string;
  bodyPl: string;
} {
  if (pct < 25) {
    return {
      en: 'Just starting',
      pl: 'Dopiero zaczynasz',
      body: 'Pick three districts and let Bajla widen your week.',
      bodyPl: 'Wybierz trzy dzielnice — Bajla rozszerzy Twój tydzień.',
    };
  }
  if (pct < 50) {
    return {
      en: 'Halfway',
      pl: 'Półmetek',
      body: 'Mix shells — Crossword pulls different words than Hangman.',
      bodyPl: 'Zmieniaj gry — Krzyżówka i Wisielec uczą innych słów.',
    };
  }
  if (pct < 75) {
    return {
      en: 'Strong week',
      pl: 'Mocny tydzień',
      body: "You're hitting the long tail — keep pushing.",
      bodyPl: 'Wchodzisz w długi ogon — naciskaj dalej.',
    };
  }
  return {
    en: 'Almost full coverage',
    pl: 'Prawie pełne pokrycie',
    body: 'Nearly every word in your bank seen this week. Bravo.',
    bodyPl: 'Prawie każde słowo z banku widziane w tym tygodniu. Brawo.',
  };
}

// ─── Skeleton helpers ───────────────────────────────────────────────────────
// Tiny inline skeleton — avoids pulling in a global skeleton lib. The pulse
// uses CSS-keyframe `em-skeleton-pulse` if defined, otherwise just a static
// translucent fill (the styles file ships the keyframe; this file safely
// degrades if the rule is missing).
const SkeletonChip: React.FC<{ width?: number }> = ({ width = 180 }) => (
  <div
    className="em-coverage-skeleton"
    style={{
      display: 'inline-block',
      height: 22,
      width,
      borderRadius: 999,
      background: 'rgba(245,239,255,0.12)',
      backgroundImage:
        'linear-gradient(90deg, rgba(245,239,255,0.04) 0%, rgba(245,239,255,0.18) 50%, rgba(245,239,255,0.04) 100%)',
      backgroundSize: '200% 100%',
      animation: 'em-skeleton-pulse 1400ms ease-in-out infinite',
    }}
    aria-hidden
  />
);

const SkeletonFull: React.FC = () => (
  <div className="em-coverage em-coverage--full em-coverage--loading" aria-hidden>
    <SkeletonChip width={140} />
    <div style={{ height: 8 }} />
    <SkeletonChip width={240} />
    <div style={{ height: 8 }} />
    <SkeletonChip width={200} />
  </div>
);

// ─── Shared inline styles ───────────────────────────────────────────────────
// We piggy-back on the practice canvas's em-* design tokens (#FBBF24 amber,
// #E879F9 fuchsia, rgba(245,239,255,*) text) and the rail's translucent dark
// chrome so the widget reads as a sibling of the existing rail items, not a
// foreign card. Inline styles only — keeps the build atomic (no CSS edit
// dependency for the widget to ship).
const CARD_STYLE: React.CSSProperties = {
  position: 'relative',
  padding: '14px 14px 12px',
  borderRadius: 14,
  background: 'rgba(0, 0, 0, 0.38)',
  border: '1px solid rgba(232, 121, 249, 0.32)',
  color: '#F5EFFF',
  fontFamily: 'var(--em-body)',
  marginTop: 14,
  marginBottom: 4,
};

const CHIP_STYLE: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  padding: '5px 10px 5px 8px',
  borderRadius: 999,
  background: 'rgba(0, 0, 0, 0.32)',
  border: '1px solid rgba(232, 121, 249, 0.45)',
  color: '#F5EFFF',
  fontFamily: 'var(--em-mono, ui-monospace, SFMono-Regular, Menlo, monospace)',
  fontSize: 13,
  letterSpacing: '0.06em',
  whiteSpace: 'nowrap',
  lineHeight: 1.2,
};

// ─── Component ──────────────────────────────────────────────────────────────
export const CoverageWidget: React.FC<CoverageWidgetProps> = ({
  studentSlug,
  variant = 'full',
  withinDays = 7,
  className,
}) => {
  // Skip the network call entirely if there's no slug — no meaningful signal
  // and we'd waste a round trip.
  const path = studentSlug ? 'students:getCoverage' : null;
  const data = useQueryConvex<CoverageData>(path, { studentSlug, withinDays });

  // No slug — render nothing. Anonymous learners on the design canvas don't
  // get a coverage chip; the existing PitchCard hero is enough for them.
  if (!studentSlug) return null;

  // Loading state — return a skeleton that matches the variant footprint.
  // useQueryConvex returns undefined while loading; null/undefined on error
  // (it swallows errors per its header contract). We can't distinguish those
  // here, so we render skeleton on undefined, then null below if we somehow
  // get past loading with a falsy/zero-bank payload (degrades silently).
  if (data === undefined) {
    return variant === 'compact' ? (
      <span className={className}>
        <SkeletonChip width={200} />
      </span>
    ) : (
      <div className={className}>
        <SkeletonFull />
      </div>
    );
  }

  // Degrade silently when the student has no keyword bank yet — the widget
  // would be misleading ("0 of 0 — done!") so we render nothing.
  if (!data || data.bankSize === 0) return null;

  const { bankSize, practiced, untouched, pct, hasExposureData } = data;
  // Approximate flag — when the fallback path estimated practiced via
  // practiceProgress (because practiceExposure had no rows in the window).
  const isApprox = !hasExposureData && practiced > 0;
  const band = bandFor(pct);

  // ── Compact chip ──────────────────────────────────────────────────────
  // Single inline chip. Used in the title row on mobile + as a fallback when
  // the parent passes variant="compact" explicitly (e.g. teacher dashboard
  // surfacing per-student in a list).
  if (variant === 'compact') {
    return (
      <span
        className={['em-coverage', 'em-coverage--compact', className].filter(Boolean).join(' ')}
        style={CHIP_STYLE}
        title={`${practiced} of ${bankSize} keywords practiced in last ${withinDays}d · ${untouched} untouched`}
        aria-label={`Practice coverage: ${practiced} of ${bankSize} keywords practiced in last ${withinDays} days, ${untouched} untouched.`}
      >
        <span aria-hidden style={{ color: '#FBBF24', fontWeight: 700 }}>PRAKTYKA</span>
        <span aria-hidden style={{ opacity: 0.5 }}>·</span>
        <span aria-hidden style={{ opacity: 0.7 }}>PRACTICE</span>
        <span aria-hidden style={{ opacity: 0.5 }}>·</span>
        <span aria-hidden>
          <strong style={{ color: '#FBBF24' }}>{practiced}</strong>
          <span style={{ opacity: 0.7 }}>{`/${bankSize}`}</span>
        </span>
        <span aria-hidden style={{ opacity: 0.65 }}>słów · words</span>
        {isApprox && (
          <span
            aria-hidden
            style={{
              fontSize: 13,
              opacity: 0.6,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              marginLeft: 4,
            }}
          >
            ~est
          </span>
        )}
      </span>
    );
  }

  // ── Full card ─────────────────────────────────────────────────────────
  // Rail-friendly card. Headline counts + progress bar + untouched callout +
  // band-specific motivational copy.
  return (
    <div
      className={['em-coverage', 'em-coverage--full', className].filter(Boolean).join(' ')}
      style={{ ...CARD_STYLE }}
      role="group"
      aria-label={`Practice coverage: ${practiced} of ${bankSize} keywords in last ${withinDays} days`}
    >
      <div
        style={{
          fontFamily: 'var(--em-mono, ui-monospace, SFMono-Regular, Menlo, monospace)',
          fontSize: 13,
          letterSpacing: '0.14em',
          color: 'rgba(245,239,255,0.7)',
          marginBottom: 8,
        }}
      >
        TWÓJ BANK · YOUR BANK · 7d
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 8,
          marginBottom: 6,
          flexWrap: 'wrap',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--em-decor, "Caprasimo", serif)',
            fontSize: 32,
            color: '#FBBF24',
            lineHeight: 1,
          }}
        >
          {practiced}
        </span>
        <span style={{ color: 'rgba(245,239,255,0.6)', fontSize: 14 }}>
          / {bankSize}
        </span>
        <span
          style={{
            marginLeft: 'auto',
            fontFamily: 'var(--em-mono, ui-monospace, SFMono-Regular, Menlo, monospace)',
            fontSize: 13,
            letterSpacing: '0.1em',
            color: 'rgba(245,239,255,0.7)',
          }}
        >
          {pct}%
        </span>
      </div>
      <div
        style={{
          fontSize: 13,
          color: 'rgba(245,239,255,0.65)',
          marginBottom: 10,
          fontStyle: 'italic',
        }}
      >
        słów z banku · words from your bank
      </div>

      {/* Progress bar — amber fill on dark track, matches em-amber token. */}
      <div
        aria-hidden
        style={{
          position: 'relative',
          height: 8,
          width: '100%',
          background: 'rgba(245,239,255,0.08)',
          borderRadius: 999,
          overflow: 'hidden',
          marginBottom: 12,
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            width: `${Math.max(2, Math.min(100, pct))}%`,
            background:
              pct >= 75
                ? 'linear-gradient(90deg, #FBBF24 0%, #E879F9 100%)'
                : pct >= 50
                  ? '#FBBF24'
                  : pct >= 25
                    ? '#F59E0B'
                    : '#7DD3FC',
            transition: 'width 360ms cubic-bezier(0.2, 0.8, 0.2, 1)',
            borderRadius: 999,
          }}
        />
      </div>

      {/* Untouched callout — bilingual, the motivator copy. */}
      <div
        style={{
          display: 'flex',
          gap: 6,
          alignItems: 'baseline',
          padding: '6px 10px',
          background: 'rgba(232,121,249,0.10)',
          borderLeft: '2px solid #E879F9',
          borderRadius: 4,
          marginBottom: 10,
        }}
      >
        <strong style={{ color: '#E879F9', fontSize: 14 }}>{untouched}</strong>
        <span style={{ fontSize: 13, color: 'rgba(245,239,255,0.78)' }}>
          untouched
        </span>
        <span style={{ fontSize: 13, color: 'rgba(245,239,255,0.5)' }}>·</span>
        <span style={{ fontSize: 13, color: 'rgba(245,239,255,0.78)', fontStyle: 'italic' }}>
          nieużywanych
        </span>
      </div>

      {/* Band-specific motivational copy — bilingual EN+PL. */}
      <div style={{ fontSize: 14, lineHeight: 1.45 }}>
        <div style={{ color: '#F5EFFF', fontWeight: 600, marginBottom: 2 }}>
          {band.en} <span style={{ opacity: 0.55, fontWeight: 400 }}>· {band.pl}</span>
        </div>
        <div style={{ color: 'rgba(245,239,255,0.7)' }}>
          {band.body}
        </div>
        <div style={{ color: 'rgba(245,239,255,0.5)', fontStyle: 'italic', fontSize: 13, marginTop: 2 }}>
          {band.bodyPl}
        </div>
      </div>

      {isApprox && (
        <div
          style={{
            marginTop: 8,
            fontSize: 13,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'rgba(245,239,255,0.45)',
          }}
        >
          ~ approximate · pre-scheduler estimate
        </div>
      )}
    </div>
  );
};

export default CoverageWidget;
