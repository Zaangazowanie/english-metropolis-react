// ShellChromeScaffolds.tsx — chrome-only skeletons rendered while the lazy
// shell chunk + exercise data are still being fetched.
//
// Background: prior to 2026-05-02, when the user opened a shell the entire
// canvas was replaced by a generic <ShellSpinner> ("MULTIPLE CHOICE (LOADING
// EXERCISES)") for ~9-12s while the lazy chunk + exercises hook resolved.
// CD's audit (Battleship A4 ~12s, MultipleChoice A4 ~9s) flagged this as the
// single biggest perceived-latency issue on the practice tab.
//
// Fix: render the shell's chrome (Nameplate + Bajla card + counter shell +
// scene background + skeleton in the play area) IMMEDIATELY when the user
// taps a district card. The chrome is small, statically importable, and
// doesn't depend on the lazy chunk or exercise data. Once the chunk + data
// arrive, the full shell mounts in place; visually the chrome stays put and
// the skeleton swaps for live game content.
//
// These scaffolds intentionally mirror the shells' chrome layouts (Nameplate
// position, accent color, background gradient) so the cross-fade is seamless.

import React from 'react';
import { Nameplate, Bajla, HintCard, Progress, SkipButton, HintButton } from './primitives';

// ─────────────────────────────────────────────────────────────────────────
// Shared shimmer keyframe — injected once via a tag in the head.
// ─────────────────────────────────────────────────────────────────────────
const SHIMMER_STYLE_ID = 'em-shell-skel-shimmer';

function ensureShimmerStyles(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById(SHIMMER_STYLE_ID)) return;
  const tag = document.createElement('style');
  tag.id = SHIMMER_STYLE_ID;
  tag.textContent = `
    @keyframes em-skel-shimmer {
      0%   { background-position: -200% 0; }
      100% { background-position:  200% 0; }
    }
    .em-skel-shimmer {
      background: linear-gradient(
        90deg,
        rgba(255,255,255,0.04) 0%,
        rgba(255,255,255,0.10) 50%,
        rgba(255,255,255,0.04) 100%
      );
      background-size: 200% 100%;
      animation: em-skel-shimmer 1.6s linear infinite;
      border-radius: 6px;
    }
    @media (prefers-reduced-motion: reduce) {
      .em-skel-shimmer { animation: none; }
    }
  `;
  document.head.appendChild(tag);
}

// ─────────────────────────────────────────────────────────────────────────
// MultipleChoiceChrome — Bulletin Board scaffold.
//   Pink/magenta radial gradient + Nameplate at top + 4 cream-colored option
//   card shimmers below the prompt area. Caption "Loading questions..." sits
//   inside the skeleton, not as raw text replacing the whole shell.
// ─────────────────────────────────────────────────────────────────────────
export const MultipleChoiceChrome: React.FC = () => {
  ensureShimmerStyles();
  const ACCENT = '#FB7185';
  return (
    <div
      role="status"
      aria-label="Loading Multiple Choice · Wczytywanie ćwiczenia"
      style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}
    >
      {/* Bulletin Board scene background — matches MultipleChoice.tsx dusk gradient */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse at 50% 35%, #B85A88 0%, #6E325E 45%, #1F1240 100%)',
      }} />
      <div aria-hidden="true" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 6, background: 'linear-gradient(90deg, transparent, rgba(251,113,133,0.45), transparent)', boxShadow: '0 1px 8px rgba(251,113,133,0.55)' }} />
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at center, transparent 35%, rgba(0,0,0,0.55) 100%)', pointerEvents: 'none' }} />

      {/* Header bar — Nameplate + counter shell */}
      <div style={{ position: 'absolute', top: 24, left: 24, right: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, zIndex: 5, flexWrap: 'wrap' }}>
        <Nameplate
          district="The Bulletin Board"
          subtitle="Multiple Choice · Wybierz odpowiedź · pin the right poster"
          accent={ACCENT}
          icon={
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <rect x="3" y="4" width="16" height="14" rx="1.5" stroke={ACCENT} strokeWidth="1.6" />
              <path d="M6 8 H16 M6 11 H14 M6 14 H12" stroke={ACCENT} strokeWidth="1.4" strokeLinecap="round" />
              <circle cx="11" cy="3.2" r="1.4" fill={ACCENT} />
            </svg>
          }
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', opacity: 0.6 }}>
          <Progress current={0} seen={0} total={0} accent={ACCENT} />
          <SkipButton />
          <HintButton used={0} total={3} />
        </div>
      </div>

      {/* Prompt-area skeleton + 4 cream option-card shimmers */}
      <div style={{ position: 'absolute', inset: '110px 24px 220px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', gap: 28, zIndex: 4 }}>
        {/* Question poster placeholder */}
        <div style={{
          maxWidth: 560, width: '100%', minHeight: 140, padding: '24px 26px 22px',
          background: 'linear-gradient(180deg, #FFF8E7 0%, #F2DFB6 100%)',
          borderRadius: 6,
          boxShadow: '0 18px 40px -16px rgba(0,0,0,0.55), 0 6px 14px -6px rgba(0,0,0,0.35)',
          display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          <div className="em-skel-shimmer" style={{ height: 12, width: '40%', background: 'rgba(168,97,44,0.18)' }} />
          <div className="em-skel-shimmer" style={{ height: 18, width: '92%', background: 'rgba(42,24,16,0.10)' }} />
          <div className="em-skel-shimmer" style={{ height: 18, width: '74%', background: 'rgba(42,24,16,0.10)' }} />
        </div>

        {/* 4 option-card shimmers */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14, width: '100%', maxWidth: 640 }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} style={{
              minHeight: 96, padding: '18px 14px 14px', borderRadius: 6,
              background: 'linear-gradient(180deg, #fffefb 0%, #f4ead0 100%)',
              boxShadow: '0 8px 20px -10px rgba(0,0,0,0.55), inset 0 0 0 1px rgba(255,255,255,0.4)',
              display: 'flex', flexDirection: 'column', gap: 10, justifyContent: 'center',
            }}>
              <div className="em-skel-shimmer" style={{ height: 10, width: 12, background: 'rgba(138,90,44,0.30)' }} />
              <div className="em-skel-shimmer" style={{ height: 14, width: '70%', background: 'rgba(42,24,16,0.12)' }} />
            </div>
          ))}
        </div>

        {/* Caption inside the skeleton — not raw replacement text */}
        <div className="em-eyebrow" style={{ color: '#FFE4B5', opacity: 0.85, marginTop: 6, letterSpacing: '0.14em' }}>
          Loading questions… · Wczytywanie pytań…
        </div>
      </div>

      {/* Bottom strip — HintCard + Bajla cameo (same chrome as live shell) */}
      <div style={{ position: 'absolute', bottom: 24, left: 24, right: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, zIndex: 5 }}>
        <div className="em-shell-hint" style={{ flex: 1, maxWidth: 560 }}>
          <HintCard
            label="Bajla mówi · pin the right poster"
            english="Read the sentence on the cork-board, then tap the poster that fills the gap."
            polish="Przeczytaj zdanie na tablicy i wybierz właściwą odpowiedź."
          />
        </div>
        <Bajla size={56} mood="idle" decorative />
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────
// BattleshipChrome — Harbour Grid scaffold.
//   Night-harbour gradient + Nameplate at top + 8x8 grid of grey shimmer
//   cells in the play area. Caption "Charting the harbour..." sits inside
//   the grid, not as raw text replacing the whole shell.
// ─────────────────────────────────────────────────────────────────────────
export const BattleshipChrome: React.FC = () => {
  ensureShimmerStyles();
  const ACCENT = '#7DD3FC';
  const COLS = 8;
  const ROWS = 8;
  return (
    <div
      role="status"
      aria-label="Loading Battleship · Wczytywanie ćwiczenia"
      style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}
    >
      {/* Harbour scene background — matches Battleship.tsx night gradient */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(180deg, #02010C 0%, #0F0824 50%, #1B2A4A 100%)',
      }} />

      <div className="em-bs-layout" style={{
        position: 'relative', display: 'grid',
        gridTemplateColumns: '1.4fr 1fr', gap: 24, padding: 32,
        height: '100%', boxSizing: 'border-box',
      }}>
        {/* Left card — chrome + grid skeleton */}
        <div className="em-card" style={{
          display: 'flex', flexDirection: 'column',
          background: 'linear-gradient(180deg, rgba(15,8,36,0.95) 0%, rgba(8,4,20,0.98) 100%)',
          position: 'relative', overflow: 'hidden',
        }}>
          {/* Header — Nameplate */}
          <div style={{ padding: '24px 28px', borderBottom: '1px solid var(--em-line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Nameplate
              district="The Harbour Grid"
              subtitle="Battleship · Bitwa morska · call coordinates, sink ships with right answers"
              accent={ACCENT}
              icon={<svg width="22" height="22" viewBox="0 0 22 22" fill="none"><path d="M3 14 L19 14 L17 18 L5 18 Z" fill="none" stroke={ACCENT} strokeWidth="1.6" /><path d="M11 4 L11 14 M7 8 L15 8" stroke={ACCENT} strokeWidth="1.6" strokeLinecap="round" /></svg>}
            />
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(125,211,252,0.08)', border: `1px solid ${ACCENT}55` }} />
          </div>

          {/* 8x8 grid skeleton with shimmer cells */}
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, position: 'relative', flexDirection: 'column', gap: 16 }}>
            <div style={{ position: 'relative' }}>
              <div style={{ display: 'grid', gridTemplateColumns: `28px repeat(${COLS}, 44px)`, gap: 2, marginBottom: 4 }}>
                <div />
                {Array.from({ length: COLS }).map((_, c) => (
                  <div key={c} style={{ fontFamily: 'var(--em-mono)', fontSize: 13, color: ACCENT, opacity: 0.5, textAlign: 'center', letterSpacing: '0.1em' }}>
                    {String.fromCharCode(65 + c)}
                  </div>
                ))}
              </div>
              {Array.from({ length: ROWS }).map((_, r) => (
                <div key={r} style={{ display: 'grid', gridTemplateColumns: `28px repeat(${COLS}, 44px)`, gap: 2, marginBottom: 2 }}>
                  <div style={{ fontFamily: 'var(--em-mono)', fontSize: 13, color: ACCENT, opacity: 0.5, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {r + 1}
                  </div>
                  {Array.from({ length: COLS }).map((_, c) => (
                    <div
                      key={c}
                      className="em-skel-shimmer"
                      style={{
                        width: 44, height: 44,
                        border: '1px solid rgba(125,211,252,0.15)',
                        background: 'rgba(125,211,252,0.04)',
                        borderRadius: 4,
                      }}
                    />
                  ))}
                </div>
              ))}
            </div>
            <div className="em-eyebrow" style={{ color: ACCENT, opacity: 0.85, letterSpacing: '0.14em' }}>
              Charting the harbour… · Wytyczanie portu…
            </div>
          </div>
        </div>

        {/* Right side — counter + Bajla hint card chrome */}
        <div className="em-bs-side" style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', opacity: 0.6 }}>
            <Progress current={0} total={0} accent={ACCENT} />
            <div style={{ display: 'flex', gap: 6 }}>
              <SkipButton />
              <HintButton used={0} total={3} />
            </div>
          </div>
          <div className="em-shell-hint" style={{ minWidth: 0 }}>
            <HintCard
              label="Bajla mówi · call a coordinate, answer to hit"
              english="Tap any grid square to fire. If you hit a ship cell, answer the question to confirm the strike."
              polish="Stuknij dowolne pole, aby strzelić. Jeśli trafisz okręt, odpowiedz na pytanie, aby potwierdzić trafienie."
            />
          </div>
          <div className="em-card" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--em-line)', display: 'flex', justifyContent: 'space-between' }}>
              <div className="em-eyebrow">Fleet status · stan floty</div>
              <div className="em-eyebrow" style={{ color: ACCENT }}>0/—</div>
            </div>
            <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="em-skel-shimmer" style={{ height: 32, background: 'rgba(125,211,252,0.05)', border: `1px solid ${ACCENT}22`, borderRadius: 8 }} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
