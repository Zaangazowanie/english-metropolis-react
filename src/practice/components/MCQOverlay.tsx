// MCQOverlay — modal-style multiple-choice question card.
//
// The same overlay appears in OpenTheBox (when a vault door swings open),
// Battleship (when the player fires on a ship cell), and several other
// arcade shells. The visual language is consistent: bilingual prompt,
// 4 letter-keyed buttons (A/B/C/D), Bajla hint card beneath, accent-glow
// border, em-rise entrance animation.
//
// Centralising it here ensures every shell renders the same MCQ chrome —
// same letter keys, same colour semantics for correct/wrong, same a11y
// labels — so students always recognise an "answer the question" moment
// across districts.

import React from 'react';
import { HintCard } from './primitives';

export interface MCQOverlayProps {
  /** The English question prompt. */
  prompt: string;
  /** Up to 4 option labels — rendered as letter-keyed (A/B/C/D) buttons. */
  options: string[];
  /** Optional bilingual hint shown beneath the buttons. */
  hint?: string;
  /** Polish translation for the hint. */
  hintPl?: string;
  /** Accent colour for the border, eyebrow, and letter keys. */
  accent?: string;
  /** Called when the student picks an option. */
  onAnswer: (chosenIdx: number) => void;
  /** Optional close/cancel handler — renders a CANCEL button when supplied. */
  onClose?: () => void;
  /**
   * Visual state. 'idle' = waiting for an answer; 'correct' / 'wrong' bias
   * the button colours and disable interaction so the parent can show its
   * verdict before unmounting the overlay.
   */
  state?: 'idle' | 'correct' | 'wrong';
  /**
   * Index of the correct answer — required when `state` is 'correct' or
   * 'wrong' so we can colour the buttons appropriately.
   */
  answerIndex?: number;
  /**
   * The index the student picked (only meaningful when state != 'idle').
   */
  pickedIndex?: number | null;
  /**
   * Optional eyebrow shown above the prompt. String renders inside the
   * standard `.em-eyebrow` styling; pass a ReactNode for richer content
   * (e.g. Battleship's "FIRING ON A1" with two type sizes side-by-side).
   */
  eyebrow?: React.ReactNode;
  /**
   * Skip the default outer card chrome (gradient background, border,
   * box-shadow, padding, em-rise animation) and render only the inner
   * eyebrow + prompt + buttons. Useful when the host shell wraps MCQOverlay
   * in a bespoke positioning container with its own shake/animation
   * (Battleship, OpenTheBox).
   */
  bare?: boolean;
}

const DEFAULT_ACCENT = 'var(--em-magenta, #E879F9)';

export const MCQOverlay: React.FC<MCQOverlayProps> = ({
  prompt,
  options,
  hint,
  hintPl,
  accent = DEFAULT_ACCENT,
  onAnswer,
  onClose,
  state = 'idle',
  answerIndex,
  pickedIndex = null,
  eyebrow,
  bare = false,
}) => {
  const locked = state !== 'idle';
  const outerStyle: React.CSSProperties = bare
    ? {}
    : {
        width: 'min(540px, calc(100% - 48px))',
        background: 'linear-gradient(180deg, rgba(20,12,38,0.96) 0%, rgba(8,4,20,0.96) 100%)',
        border: `1.5px solid ${accent}55`,
        borderRadius: 14,
        padding: 20,
        boxShadow: `0 12px 36px rgba(0,0,0,0.6), 0 0 24px ${accent}22`,
        animation: 'em-rise 0.4s var(--em-ease)',
      };
  return (
    <div
      role="region"
      aria-label="Multiple choice question"
      style={outerStyle}
    >
      {eyebrow && (
        typeof eyebrow === 'string'
          ? <div className="em-eyebrow" style={{ color: accent, marginBottom: 6 }}>{eyebrow}</div>
          : <div style={{ marginBottom: 6 }}>{eyebrow}</div>
      )}
      <div className="em-decor" style={{ fontSize: 20, lineHeight: 1.25, color: 'var(--em-text)', marginBottom: 14 }}>
        {prompt}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {options.map((opt, oi) => {
          const isPicked = pickedIndex === oi;
          const isCorrectOpt = answerIndex !== undefined && oi === answerIndex;
          const showRight = locked && isPicked && state === 'correct';
          const showWrong = locked && isPicked && state === 'wrong';
          const showRevealCorrect = locked && state === 'wrong' && isCorrectOpt;
          const bg = showRight
            ? 'rgba(52,211,153,0.18)'
            : showWrong
              ? 'rgba(251,113,133,0.18)'
              : showRevealCorrect
                ? 'rgba(52,211,153,0.10)'
                : 'rgba(255,255,255,0.04)';
          const border = showRight || showRevealCorrect
            ? '#34D39966'
            : showWrong
              ? '#FB718566'
              : 'rgba(255,255,255,0.1)';
          const colour = showRight || showRevealCorrect
            ? '#34D399'
            : showWrong
              ? '#FB7185'
              : 'var(--em-text)';
          return (
            <button
              key={oi}
              onClick={() => { if (!locked) onAnswer(oi); }}
              disabled={locked}
              aria-label={`Option ${String.fromCharCode(65 + oi)}: ${opt}`}
              style={{
                minHeight: 44,
                padding: '10px 14px',
                borderRadius: 10,
                background: bg,
                border: `1px solid ${border}`,
                color: colour,
                fontFamily: 'var(--em-body)',
                fontSize: 14,
                cursor: locked ? 'default' : 'pointer',
                textAlign: 'left',
                transition: 'all 200ms var(--em-ease)',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <span style={{
                fontFamily: 'var(--em-mono)', fontSize: 13,
                color: accent, opacity: 0.7, minWidth: 14,
              }}>{String.fromCharCode(65 + oi)}</span>
              {opt}
            </button>
          );
        })}
      </div>
      {(hint || hintPl) && (
        <div style={{ marginTop: 12 }}>
          <HintCard english={hint ?? ''} polish={hintPl ?? ''} />
        </div>
      )}
      {onClose && (
        <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.12)',
              color: 'var(--em-text-muted)',
              padding: '6px 12px',
              borderRadius: 6,
              fontFamily: 'var(--em-mono)',
              fontSize: 13,
              letterSpacing: '0.1em',
              cursor: 'pointer',
            }}
          >CANCEL</button>
        </div>
      )}
    </div>
  );
};
