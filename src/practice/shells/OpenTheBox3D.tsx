// OpenTheBox3D — CSS-3D Vault Room scene.
//
// Pure-visual companion to OpenTheBox.tsx. Ricky 2026-05-03 — port of Mike's
// CSS-3D prototype (/tmp/openthebox-handoff/01-open-the-box/) into the
// EnglishMetro practice shell. Lazy-loaded from the parent so the brass-vault
// CSS bulk only ships when a student opens the OpenTheBox shell with the 3D
// pilot flag on.
//
// Design choices (per Mike's prototype + Hangman3D pilot pattern):
//   • Pure CSS perspective + rotateY door swing — no three.js.
//   • Component is purely visual; gameplay state (round picking, score,
//     hints, review screen) stays in OpenTheBox.tsx.
//   • Receives a derived `boxes` array (state per box) + onBoxClick handler.
//   • Atmosphere extras (palm + Tiffany lamp + ceiling tungstens + light
//     pools + wood-panel side walls + parquet floor) are decorative; they
//     are aria-hidden so the buttons remain the only interactive elements.
//   • Bundle weight target: shell-OpenTheBox3D chunk under ~50KB gzipped.
//
// Style rules: every selector is scoped under .em-otb-3d-room — see
// ../styles/shells/openthebox-3d.css.

import React from 'react';
import '../styles/shells/openthebox-3d.css';

export type OpenTheBox3DBoxState = 'closed' | 'opening' | 'open' | 'sealed' | 'busted' | 'slam';

export interface OpenTheBox3DBox {
  /** 0-indexed position in the grid. Rendered as `№ 01`, `№ 02`, … */
  index: number;
  /** Visual state — drives door rotation + stamps. */
  state: OpenTheBox3DBoxState;
}

export interface OpenTheBox3DTweaks {
  /** 'tungsten' (default) | 'dim' | 'cool' — colour-grade the ceiling lights. */
  lighting?: 'tungsten' | 'dim' | 'cool';
  /** 0..1 — opacity of the ceiling light pools cast on the wall. */
  ambientGlow?: number;
  /** When false, light pools hold steady (no flicker). */
  lightFlicker?: boolean;
  /** When true, the entire vault wall jitters horizontally (parent toggles
   *  this when a wrong answer is picked). */
  shake?: boolean;
}

export interface OpenTheBox3DProps {
  /** Per-box visual state — length = number of boxes on the wall. */
  boxes: OpenTheBox3DBox[];
  /** Click-out handler. Parent decides whether to honour the click (e.g.
   *  ignores when another box is already open). */
  onBoxClick: (index: number) => void;
  /** The box currently being interacted with — drives the dimmed effect on
   *  the *other* doors. -1 / null when no box is open. */
  currentRoundIdx?: number | null;
  /** Has the session started? Reserved for future entry animation. */
  started?: boolean;
  /** Optional tweaks panel parity (defaults match Mike's prototype). */
  tweaks?: OpenTheBox3DTweaks;
}

const DEFAULT_TWEAKS: Required<OpenTheBox3DTweaks> = {
  lighting: 'tungsten',
  ambientGlow: 0.6,
  lightFlicker: true,
  shake: false,
};

interface SafeDoorProps {
  index: number;
  state: OpenTheBox3DBoxState;
  dimmed: boolean;
  onClick: () => void;
}

/** Single brass safe-deposit door (cabinet recess + brass door + door-back).
 *  All visual; the click bubbles out to the parent. */
const SafeDoor: React.FC<SafeDoorProps> = ({ index, state, dimmed, onClick }) => {
  const sealed = state === 'sealed';
  const busted = state === 'busted';
  const isOpen = state === 'open' || state === 'opening';
  const isSlam = state === 'slam';
  const dataState = isSlam
    ? 'slam'
    : isOpen
      ? (state === 'opening' ? 'opening' : 'open')
      : sealed
        ? 'sealed'
        : busted
          ? 'busted'
          : 'closed';

  const label = sealed
    ? `Box ${index + 1}, sealed`
    : busted
      ? `Box ${index + 1}, busted`
      : isOpen
        ? `Box ${index + 1}, open`
        : `Box ${index + 1}, tap to open`;

  return (
    <button
      type="button"
      className={`em-otb-3d-safe${dimmed ? ' dimmed' : ''}`}
      data-state={dataState}
      onClick={onClick}
      disabled={sealed || busted || dimmed}
      aria-label={label}
      aria-pressed={isOpen}
    >
      {/* The cabinet recess (visible when door swings open) */}
      <div className="em-otb-3d-cabinet" aria-hidden="true">
        <div className="em-otb-3d-cabinet-back">
          <div className="em-otb-3d-box-label">BOX</div>
          <div className="em-otb-3d-box-num-stencil">{String(index + 1).padStart(2, '0')}</div>
        </div>
        {sealed && (
          <div className="em-otb-3d-seal-stamp">
            <div className="em-otb-3d-stamp-mark">SEALED</div>
          </div>
        )}
        {busted && (
          <div className="em-otb-3d-seal-stamp em-otb-3d-bust-stamp">
            <div className="em-otb-3d-stamp-mark">BUSTED</div>
          </div>
        )}
      </div>

      {/* The brass door that swings */}
      <div className="em-otb-3d-door" aria-hidden="true">
        <div className="em-otb-3d-door-face">
          <div className="em-otb-3d-door-bevel" />
          <div className="em-otb-3d-rivets">
            <span className="em-otb-3d-rivet tl" />
            <span className="em-otb-3d-rivet tr" />
            <span className="em-otb-3d-rivet bl" />
            <span className="em-otb-3d-rivet br" />
          </div>
          <div className="em-otb-3d-door-fan" />
          <div className="em-otb-3d-number-plate">№ {String(index + 1).padStart(2, '0')}</div>
          <div className="em-otb-3d-dial" />
          <div className="em-otb-3d-hinge top" />
          <div className="em-otb-3d-hinge bottom" />
        </div>
        <div className="em-otb-3d-door-back" />
      </div>
    </button>
  );
};

const OpenTheBox3D: React.FC<OpenTheBox3DProps> = ({
  boxes,
  onBoxClick,
  currentRoundIdx = null,
  tweaks: tweaksProp,
}) => {
  const tweaks = { ...DEFAULT_TWEAKS, ...(tweaksProp ?? {}) };
  const ceilingFilter =
    tweaks.lighting === 'cool'
      ? 'hue-rotate(-30deg) saturate(0.7)'
      : 'none';
  const ceilingOpacity =
    tweaks.lighting === 'dim' ? 0.5 : tweaks.lighting === 'cool' ? 0.7 : 1;

  return (
    <div className="em-otb-3d-room" role="presentation">
      {/* Wood-panel side columns (wall sconces baked in via ::after). */}
      <div className="em-otb-3d-wall-column left" aria-hidden="true" />
      <div className="em-otb-3d-wall-column right" aria-hidden="true" />

      {/* Herringbone parquet floor + burgundy rug. */}
      <div className="em-otb-3d-floor" aria-hidden="true" />

      {/* Decorative side-stage props. */}
      <div className="em-otb-3d-palm" aria-hidden="true" />
      <div className="em-otb-3d-lamp" aria-hidden="true" />

      {/* Three overhead tungsten ceiling lights. */}
      <div
        className="em-otb-3d-ceiling-lights"
        aria-hidden="true"
        style={{ opacity: ceilingOpacity, filter: ceilingFilter }}
      >
        {[0, 1, 2].map((i) => (
          <div key={i} className="em-otb-3d-ceiling-light" />
        ))}
      </div>

      {/* Pools of light cast on the wall under each ceiling fixture. */}
      {[0, 1, 2].map((i) => (
        <div
          key={`pool-${i}`}
          className="em-otb-3d-light-pool"
          aria-hidden="true"
          style={{
            left: `calc(${15 + i * 25}% + 64px)`,
            opacity: tweaks.ambientGlow,
            animationPlayState: tweaks.lightFlicker ? 'running' : 'paused',
          }}
        />
      ))}

      {/* The vault wall + 3×3 brass door grid. */}
      <div className="em-otb-3d-vault-stage">
        <div className={`em-otb-3d-vault-wall${tweaks.shake ? ' shake' : ''}`}>
          {boxes.map((b, i) => {
            const dimmed =
              currentRoundIdx !== null
              && currentRoundIdx !== i
              && b.state !== 'sealed'
              && b.state !== 'busted';
            return (
              <SafeDoor
                key={i}
                index={b.index ?? i}
                state={b.state}
                dimmed={dimmed}
                onClick={() => onBoxClick(i)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default OpenTheBox3D;
