// InterferenceTip.tsx — Layer 4: Dynamic Scaffolding overlay.
// ─────────────────────────────────────────────────────────────────────────────
// When a student gets a practice exercise wrong, the parent (StudentPractice
// or any host) renders <InterferenceTip /> with the exerciseId + the wrong
// answer + the correct answer. The component fetches the interferencePattern
// rows tied to that exercise via `practice:getInterferenceForExercise` and
// shows the most-relevant one's polishCause / polishCauseEn so the student
// understands *why* their L1 instinct mis-fired.
//
// Falls back to:
//   • the exercise's pre-baked explanationPL (if supplied) when no patterns match
//   • a generic bilingual nudge when even that's missing
//
// Behaviour:
//   • Esc / outside-click / "Got it" button all dismiss
//   • Slide-up animation, glass-morphism, dark-purple aesthetic
//   • Returns focus to the previously-focused element on dismiss (a11y)
//   • Polite live region announces the tip — non-blocking
//
// Authored by Agent A12 in the 15-agent content-pipeline build (2026-04-30).
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useRef } from 'react';
import { useQueryConvex } from '../lib/convex-stubs';
import { useCorrection } from '../lib/correction';
import { Bajla } from './primitives';

/**
 * Shape of a row in the `interferencePatterns` Convex table — only the fields
 * the tip actually reads. Mirrors the validator in convex/practice.ts.
 */
interface InterferencePatternRow {
  patternId: string;
  polishCause: string;
  polishCauseEn: string;
  interferenceStrength?: number;
  cefrLevel?: string;
}

export interface InterferenceTipProps {
  /** Exercise this question came from. Drives the interference query. */
  exerciseId?: string;
  /** What the student typed / picked. */
  studentAnswer: string;
  /** What they should have typed / picked. */
  correctAnswer: string;
  /** Optional pre-baked Polish explanation (from the exercise itself). */
  explanationPL?: string;
  /** Called when the tip is dismissed. */
  onDismiss: () => void;
  /**
   * D1 auto-open opt-out (Ricky 2026-05-02). When provided, renders the
   * "Don't auto-show next time" checkbox below the dismiss button. The
   * caller is responsible for persisting the preference (we just emit the
   * change). Caller sets `em.d1AutoOpen` in localStorage to 'false' when
   * the user opts out.
   */
  showAutoOpenOptOut?: boolean;
  /** Called when the opt-out checkbox toggles. value=true means opt-out. */
  onAutoOpenOptOutChange?: (optOut: boolean) => void;
  /** Initial state of the opt-out checkbox. */
  autoOpenOptOut?: boolean;
  /**
   * v4 ESL correction enrichment (Ricky 2026-05-02, Mike-approved).
   * When provided, the tip fires POST /api/correction with this context
   * and renders a second "Pattern detected · Wykryty wzorzec" section
   * below the static explanation. Hidden gracefully on timeout / error.
   */
  promptContext?: string;
}

export const InterferenceTip: React.FC<InterferenceTipProps> = ({
  exerciseId,
  studentAnswer,
  correctAnswer,
  explanationPL,
  onDismiss,
  showAutoOpenOptOut = false,
  onAutoOpenOptOutChange,
  autoOpenOptOut = false,
  promptContext,
}) => {
  // ─── v4 ESL pattern enrichment (Mike-approved 2026-05-02) ───────────
  // Fires POST /api/correction when both wrong + correct are available.
  // Renders the second section below if `data.why` (or whyPL) is non-null.
  // On 5s timeout or any error this returns null silently — the static
  // explanationPL stays visible regardless.
  const correction = useCorrection(
    studentAnswer,
    correctAnswer,
    promptContext,
    exerciseId,
    /* enabled */ Boolean(studentAnswer && correctAnswer),
  );
  // Only fire the query when we actually have an exerciseId. Tip still works
  // without one — it just falls back to explanationPL / generic copy.
  const patterns = useQueryConvex<InterferencePatternRow[]>(
    exerciseId ? 'practice:getInterferenceForExercise' : null,
    exerciseId ? { exerciseId } : {},
  );

  // Pick the highest-strength pattern (the prod query already returns rows
  // matching the exercise's interferenceTags; we just take the strongest).
  const primary: InterferencePatternRow | undefined = (() => {
    if (!patterns || patterns.length === 0) return undefined;
    return [...patterns].sort(
      (a, b) => (b.interferenceStrength ?? 0) - (a.interferenceStrength ?? 0),
    )[0];
  })();

  // ─── A11y: focus + Esc + focus-trap ───────────────────────────────────────
  const dismissBtnRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const tipRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Remember whatever was focused before the tip opened so we can restore.
    previousFocusRef.current = (typeof document !== 'undefined'
      ? (document.activeElement as HTMLElement | null)
      : null);
    // Move focus into the dismiss button so screen readers announce it.
    dismissBtnRef.current?.focus();

    const focusableSel =
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onDismiss();
        return;
      }
      // Focus-trap (D1 a11y requirement, Ricky 2026-05-02): keep Tab within
      // the dialog so the student can't tab back into the shell controls
      // while the modal owns the page.
      if (e.key === 'Tab' && tipRef.current) {
        const focusables = tipRef.current.querySelectorAll<HTMLElement>(focusableSel);
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement as HTMLElement | null;
        if (e.shiftKey) {
          if (active === first || !tipRef.current.contains(active)) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (active === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      // Restore focus to the original control on unmount. Wrapped in a
      // try/catch because the element may have been unmounted by then.
      try {
        previousFocusRef.current?.focus?.();
      } catch {
        /* no-op */
      }
    };
  }, [onDismiss]);

  // Click on the backdrop (but not the card itself) dismisses.
  const onBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onDismiss();
  };

  // ─── Copy ─────────────────────────────────────────────────────────────────
  const tipEN =
    primary?.polishCauseEn ??
    'Polish-specific tip not available — see the explanation below.';
  const tipPL =
    primary?.polishCause ??
    explanationPL ??
    'Spróbuj jeszcze raz — Bajla pomoże następnym razem.';

  return (
    <div
      className="em-interference-backdrop"
      onClick={onBackdropClick}
      aria-hidden={false}
    >
      <div
        ref={tipRef}
        className="em-interference-tip"
        role="alertdialog"
        aria-modal="true"
        aria-live="polite"
        aria-labelledby="em-tip-eyebrow"
      >
        <Bajla size={48} mood="think" />
        <div className="em-tip-body">
          <div id="em-tip-eyebrow" className="em-tip-eyebrow">
            Why this happens · Dlaczego
          </div>
          <div className="em-tip-en">{tipEN}</div>
          <div className="em-tip-pl">
            <span aria-hidden>🇵🇱 </span>
            {tipPL}
          </div>
          <div className="em-tip-correction" aria-label="Corrected answer">
            <strong>{correctAnswer}</strong>
            {studentAnswer ? (
              <span className="em-tip-strike" aria-label="Your answer">
                {studentAnswer}
              </span>
            ) : null}
          </div>
          {primary?.patternId ? (
            <div className="em-tip-pattern-tag" aria-hidden>
              {primary.patternId}
            </div>
          ) : null}
          {/*
            v4 ESL pattern detector (Ricky 2026-05-02). Renders ONLY when
            the adapter returned a usable Polish-transfer pattern. On
            timeout / error / no-match: hidden silently — the static
            explanation above is the contract; this is bonus context.
          */}
          {correction.data && (correction.data.why || correction.data.whyPL) ? (
            <div
              className="em-tip-v4-section"
              style={{
                marginTop: 14,
                paddingTop: 12,
                borderTop: '1px solid rgba(255, 255, 255, 0.12)',
              }}
            >
              <div
                className="em-tip-v4-eyebrow"
                style={{
                  fontSize: 13,
                  letterSpacing: 0.4,
                  textTransform: 'uppercase',
                  opacity: 0.72,
                  marginBottom: 6,
                }}
              >
                <span aria-hidden>🤖 </span>
                Pattern detected · Wykryty wzorzec
                {correction.data.patternId ? (
                  <span
                    style={{
                      marginLeft: 8,
                      padding: '1px 6px',
                      borderRadius: 4,
                      background: 'rgba(168, 85, 247, 0.18)',
                      fontSize: 13,
                      letterSpacing: 0.3,
                    }}
                  >
                    {correction.data.patternId}
                  </span>
                ) : null}
              </div>
              {correction.data.why ? (
                <div className="em-tip-v4-en" style={{ fontSize: 13, lineHeight: 1.45 }}>
                  {correction.data.why}
                </div>
              ) : null}
              {correction.data.whyPL ? (
                <div
                  className="em-tip-v4-pl"
                  style={{ fontSize: 13, lineHeight: 1.45, marginTop: 6, opacity: 0.92 }}
                >
                  <span aria-hidden>🇵🇱 </span>
                  {correction.data.whyPL}
                </div>
              ) : null}
              {correction.data.howToFix ? (
                <div
                  className="em-tip-v4-howto"
                  style={{
                    fontSize: 14,
                    marginTop: 8,
                    padding: '6px 10px',
                    background: 'rgba(34, 197, 94, 0.10)',
                    borderRadius: 6,
                    opacity: 0.95,
                  }}
                >
                  <strong style={{ marginRight: 4 }}>How to fix:</strong>
                  {correction.data.howToFix}
                </div>
              ) : null}
            </div>
          ) : null}
          <button
            ref={dismissBtnRef}
            type="button"
            className="em-tip-dismiss em-btn em-btn-primary"
            onClick={onDismiss}
          >
            Got it · Rozumiem
          </button>
          {showAutoOpenOptOut ? (
            <label
              className="em-tip-optout"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginTop: 12,
                fontSize: 13,
                opacity: 0.78,
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={autoOpenOptOut}
                onChange={(e) => onAutoOpenOptOutChange?.(e.target.checked)}
              />
              <span>
                Don&rsquo;t auto-show next time
                <span style={{ opacity: 0.7 }}> · Nie pokazuj automatycznie</span>
              </span>
            </label>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default InterferenceTip;
