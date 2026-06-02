// Dial — brass-gauge SVG sub-component for live metric readouts.
//
// Originally inline in TypingTest's brass-key telegraph scene. Promoted to a
// shared primitive because the same visual language fits any real-time
// numeric metric a shell wants to show: WPM, accuracy %, reading speed,
// pronunciation confidence, etc.
//
// The dial sweeps from -120° (left) to +120° (right) — a 240° arc. The
// `target` prop drops a small accent dot at the desired reading; the
// needle animates to the live `value`. When `value === target` the needle
// covers the dot.

import React from 'react';

const BRASS = '#C49A4D';

export interface DialProps {
  /** Diameter in pixels. The whole SVG scales to this. Default 120. */
  size?: number;
  /** Current measured value. */
  value: number;
  /** Target marker rendered as an accent dot. */
  target: number;
  /**
   * Maximum value the dial can show. Defaults to `target * 2` so the
   * target sits in the middle of the arc.
   */
  max?: number;
  /** Eyebrow label shown beneath the dial (e.g. "WPM · TEMPO"). */
  label: string;
  /**
   * Unit suffix appended to the readout. Defaults to no unit, except when
   * the label starts with "ACC" we infer "%" — preserves TypingTest's
   * original behaviour without callers having to opt in.
   */
  unit?: string;
  /** Accent colour for the needle, target dot, and label. */
  accent?: string;
}

export const Dial: React.FC<DialProps> = ({
  size = 120,
  value,
  target,
  max,
  label,
  unit,
  accent = 'var(--em-magenta, #E879F9)',
}) => {
  const effectiveMax = max ?? Math.max(1, target * 2);
  const pct = Math.min(1, Math.max(0, value / effectiveMax));
  const targetPct = Math.min(1, Math.max(0, target / effectiveMax));

  // Geometry — design'd around an 80×80 viewBox; `size` scales the SVG.
  const arcSpan = 240;
  const angle = -120 + pct * arcSpan;
  const targetAngle = -120 + targetPct * arcSpan;
  const r = 32;
  const cx = 40;
  const cy = 40;
  const rad = (a: number): number => (a * Math.PI) / 180;
  const tipX = cx + r * 0.78 * Math.cos(rad(angle - 90));
  const tipY = cy + r * 0.78 * Math.sin(rad(angle - 90));
  const targetX = cx + r * Math.cos(rad(targetAngle - 90));
  const targetY = cy + r * Math.sin(rad(targetAngle - 90));

  const inferredUnit = unit ?? (label.startsWith('ACC') ? '%' : '');
  // Stable gradient id — strip whitespace + special chars so multiple Dials
  // on the same page don't collide.
  const gradId = `em-dial-brass-${label.replace(/[^a-zA-Z0-9]/g, '')}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 80 80"
        role="img"
        aria-label={`${label}: ${value}${inferredUnit}`}
      >
        <defs>
          <radialGradient id={gradId}>
            <stop offset="0%" stopColor="#F3D78D" />
            <stop offset="60%" stopColor={BRASS} />
            <stop offset="100%" stopColor="#3A2710" />
          </radialGradient>
        </defs>
        <circle cx={cx} cy={cy} r={r + 4} fill={`url(#${gradId})`} stroke="#1F1611" strokeWidth="1.5" />
        <circle cx={cx} cy={cy} r={r} fill="#1A1206" stroke="#0F0904" strokeWidth="1" />
        {/* Tick marks around the arc */}
        {Array.from({ length: 11 }).map((_, i) => {
          const a = -120 + (i / 10) * arcSpan;
          const x1 = cx + (r - 4) * Math.cos(rad(a - 90));
          const y1 = cy + (r - 4) * Math.sin(rad(a - 90));
          const x2 = cx + r * Math.cos(rad(a - 90));
          const y2 = cy + r * Math.sin(rad(a - 90));
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#7A5C28" strokeWidth="1" />;
        })}
        {/* Target marker */}
        <circle cx={targetX} cy={targetY} r="2.5" fill={accent} opacity="0.85" />
        {/* Needle */}
        <line
          x1={cx}
          y1={cy}
          x2={tipX}
          y2={tipY}
          stroke={accent}
          strokeWidth="2.5"
          strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 4px ${accent})`, transition: 'all 220ms var(--em-ease)' }}
        />
        <circle cx={cx} cy={cy} r="3" fill={accent} stroke="#1A1206" strokeWidth="1" />
      </svg>
      <div className="em-eyebrow" style={{ color: accent, fontSize: 9, letterSpacing: '0.18em' }}>{label}</div>
      <div style={{ fontFamily: 'var(--em-decor)', fontSize: 14, color: 'var(--em-text)' }}>
        {value}{inferredUnit}
      </div>
    </div>
  );
};
