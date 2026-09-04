// SessionModal.tsx — two-stage run-control modal for the in-progress
// shell session prompt (audit §4 #21 Phase 1.8, Mike's add-on, Ricky 2026-05-02).
//
// Stage 1: "Resume your session? · Wznów sesję?"  → {Continue / Start fresh}
// Stage 2 (only after Start fresh): "New questions or same? · Nowe pytania
//          czy te same?" → {New questions / Repeat same}
//
// Auto-dismisses (renders nothing) when the host hook has no pendingSession.
// That keeps the mount cheap on every shell entry — a refresh with no saved
// state is a transparent passthrough.
//
// A11y:
//   - role="alertdialog", aria-modal="true"
//   - focus moves into the primary CTA on mount, restored on dismiss
//   - Tab cycles within the dialog (focus-trap)
//   - Esc = cancel = treated as Continue (the user kept their session)
//   - Backdrop click ignored (decision pending) — the user MUST pick

import React, { useCallback, useEffect, useRef, useState } from 'react';

export type SessionModalStage = 1 | 2;

export interface SessionModalProps {
  /** Pending snapshot summary — null/undefined means render nothing. */
  pendingSession: {
    questionIds: string[];
    updatedAt: number;
    startedAt: number;
  } | null;
  /** Stage 1 "Continue" — hydrate from saved state. */
  onContinue: () => void;
  /** Stage 2 — "New questions" branch of Start fresh. */
  onStartFreshNew: () => void;
  /** Stage 2 — "Repeat same" branch of Start fresh. */
  onStartFreshSame: () => void;
  /** Optional: total question count, used for the "X questions left" copy. */
  totalQuestions?: number;
  /** Optional: how many questions the student has already answered. */
  answeredQuestions?: number;
}

function formatRelativeTime(updatedAt: number): { en: string; pl: string } {
  const diffMs = Math.max(0, Date.now() - updatedAt);
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 60) {
    return { en: `${minutes}m ago`, pl: `${minutes} min temu` };
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return { en: `${hours}h ago`, pl: `${hours} godz. temu` };
  }
  const days = Math.floor(hours / 24);
  return { en: `${days}d ago`, pl: `${days} dni temu` };
}

export const SessionModal: React.FC<SessionModalProps> = ({
  pendingSession,
  onContinue,
  onStartFreshNew,
  onStartFreshSame,
  totalQuestions,
  answeredQuestions,
}) => {
  const [stage, setStage] = useState<SessionModalStage>(1);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const primaryBtnRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const lastSessionKeyRef = useRef<string | null>(null);
  // Mirror `stage` into a ref so the keydown handler (registered once per
  // session, not per stage flip) reads the live value without re-binding.
  const stageRef = useRef<SessionModalStage>(1);
  useEffect(() => {
    stageRef.current = stage;
  }, [stage]);

  // Stable identifier for "is this the same pending session as last render?"
  // The parent reconstructs the pendingSession object inline on every render
  // (see StudentPractice.tsx ~L4374), so a reference-equality dep would
  // reset stage 2 → 1 on any unrelated parent rerender. Use the snapshot's
  // updatedAt+startedAt (primitives) instead so the reset only fires when
  // the underlying row actually changes. Bug found 2026-05-02 — Mike's CD
  // audit reported "Start fresh" silently bouncing back to stage 1.
  const sessionKey = pendingSession
    ? `${pendingSession.startedAt}:${pendingSession.updatedAt}`
    : null;

  // Reset stage to 1 only when the underlying session identity changes
  // (new row, or row was overwritten with a fresher snapshot).
  useEffect(() => {
    if (sessionKey && lastSessionKeyRef.current !== sessionKey) {
      lastSessionKeyRef.current = sessionKey;
      setStage(1);
    } else if (!sessionKey) {
      lastSessionKeyRef.current = null;
    }
  }, [sessionKey]);

  // Re-focus the primary CTA whenever the stage flips, so keyboard users
  // land on the new "New questions" button after Start fresh, and on the
  // "Continue" button after Esc-back-from-stage-2.
  useEffect(() => {
    if (!sessionKey) return;
    const raf =
      typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function'
        ? window.requestAnimationFrame(() => primaryBtnRef.current?.focus())
        : (setTimeout(() => primaryBtnRef.current?.focus(), 0) as unknown as number);
    return () => {
      if (typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
        try { window.cancelAnimationFrame(raf as number); } catch { /* no-op */ }
      }
    };
  }, [stage, sessionKey]);

  // Focus-trap + Esc handling. Initial focus is handled by the stage-aware
  // effect above so we don't fight it here.
  useEffect(() => {
    if (!sessionKey) return;
    previousFocusRef.current =
      typeof document !== 'undefined'
        ? (document.activeElement as HTMLElement | null)
        : null;

    const focusableSel =
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Spec (Mike, 2026-05-02): in stage 2, Esc returns to stage 1
        // (cancel the destructive path). In stage 1, Esc = Continue =
        // preserve the student's work.
        e.preventDefault();
        if (stageRef.current === 2) {
          setStage(1);
        } else {
          onContinue();
        }
        return;
      }
      if (e.key === 'Tab' && dialogRef.current) {
        const focusables = dialogRef.current.querySelectorAll<HTMLElement>(focusableSel);
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement as HTMLElement | null;
        if (e.shiftKey) {
          if (active === first || !dialogRef.current.contains(active)) {
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
      try {
        previousFocusRef.current?.focus?.();
      } catch {
        /* element may have been unmounted */
      }
    };
    // Intentionally key on sessionKey (primitive) instead of pendingSession
    // (object reconstructed every parent render). Otherwise the Esc listener
    // would churn and previousFocusRef would be clobbered with a focus that
    // already left the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionKey, onContinue]);

  const handleStartFreshClick = useCallback(() => {
    setStage(2);
  }, []);

  if (!pendingSession) return null;

  const { questionIds, updatedAt } = pendingSession;
  const ago = formatRelativeTime(updatedAt);
  const total = totalQuestions ?? questionIds.length;
  const answered = answeredQuestions ?? 0;
  const remaining = Math.max(0, total - answered);

  // Inline styles to avoid a global-CSS dependency. Mirrors the
  // em-interference-* aesthetic (dark glass, generous radii, amber accent).
  const backdropStyle: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    background: 'rgba(11, 8, 27, 0.72)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: 16,
  };
  const dialogStyle: React.CSSProperties = {
    background: 'linear-gradient(155deg, #1f1638 0%, #2b1d4d 100%)',
    color: '#F4F0FF',
    border: '1px solid rgba(255, 213, 89, 0.28)',
    borderRadius: 18,
    padding: '28px 28px 24px',
    maxWidth: 480,
    width: '100%',
    boxShadow: '0 24px 60px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(255,255,255,0.04) inset',
    fontFamily: 'var(--em-body, system-ui, sans-serif)',
  };
  const eyebrowStyle: React.CSSProperties = {
    fontFamily: 'var(--em-mono, "JetBrains Mono", monospace)',
    fontSize: 13,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: '#FFD559',
    marginBottom: 10,
  };
  const titleStyle: React.CSSProperties = {
    fontFamily: 'var(--em-display, "Caprasimo", serif)',
    fontSize: 22,
    lineHeight: 1.2,
    margin: 0,
    marginBottom: 8,
  };
  const subStyle: React.CSSProperties = {
    fontSize: 14,
    opacity: 0.78,
    margin: 0,
    marginBottom: 18,
    lineHeight: 1.45,
  };
  const summaryStyle: React.CSSProperties = {
    background: 'rgba(255, 255, 255, 0.06)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: 12,
    padding: '12px 14px',
    marginBottom: 18,
    fontSize: 13,
    lineHeight: 1.45,
  };
  const buttonRowStyle: React.CSSProperties = {
    display: 'flex',
    gap: 12,
    flexWrap: 'wrap',
  };
  const primaryBtnStyle: React.CSSProperties = {
    flex: '1 1 180px',
    background: 'linear-gradient(180deg, #FFD559 0%, #F2B441 100%)',
    color: '#231535',
    border: 'none',
    borderRadius: 12,
    padding: '12px 18px',
    fontWeight: 700,
    fontSize: 14,
    cursor: 'pointer',
    fontFamily: 'inherit',
  };
  const secondaryBtnStyle: React.CSSProperties = {
    flex: '1 1 180px',
    background: 'rgba(255, 255, 255, 0.08)',
    color: '#F4F0FF',
    border: '1px solid rgba(255, 255, 255, 0.18)',
    borderRadius: 12,
    padding: '12px 18px',
    fontWeight: 600,
    fontSize: 14,
    cursor: 'pointer',
    fontFamily: 'inherit',
  };

  return (
    <div
      className="em-session-modal-backdrop"
      style={backdropStyle}
      // Backdrop click intentionally a no-op — student MUST pick a path so
      // we don't ambiguously discard or resume on an accidental click.
      aria-hidden={false}
    >
      <div
        ref={dialogRef}
        className="em-session-modal"
        role="alertdialog"
        aria-modal="true"
        aria-live="polite"
        aria-labelledby="em-session-modal-title"
        style={dialogStyle}
      >
        {stage === 1 ? (
          <>
            <div style={eyebrowStyle}>In progress · W toku</div>
            <h2 id="em-session-modal-title" style={titleStyle}>
              Resume your session?
              <span style={{ display: 'block', fontSize: 16, opacity: 0.78, marginTop: 4 }}>
                Wznów sesję?
              </span>
            </h2>
            <p style={subStyle}>
              You left this district mid-game. Pick up where you stopped, or
              start over.
              <span style={{ display: 'block', opacity: 0.7, marginTop: 4 }}>
                Zostawiłeś tę dzielnicę w trakcie gry. Kontynuuj lub zacznij od nowa.
              </span>
            </p>
            <div style={summaryStyle}>
              <div>
                <strong>{remaining}</strong> {remaining === 1 ? 'question' : 'questions'} left
                {total ? <> · <strong>{total}</strong> total</> : null}
                <span style={{ opacity: 0.7 }}>
                  {' '}· {remaining} {remaining === 1 ? 'pytanie' : 'pytania'} do końca
                </span>
              </div>
              <div style={{ opacity: 0.6, fontSize: 13, marginTop: 4 }}>
                Last saved {ago.en} · ostatni zapis {ago.pl}
              </div>
            </div>
            {/* Ricky 2026-05-03 (CD re-audit): when the saved session has
                0 questions remaining, "Continue" is a no-op trap (there's
                nothing to resume). Flip the primary action to "Start fresh"
                in that state — keeps button copy + order intact, just swaps
                which one carries the highlight + autofocus + ref. */}
            <div style={buttonRowStyle}>
              <button
                ref={remaining === 0 ? null : primaryBtnRef}
                type="button"
                style={remaining === 0 ? secondaryBtnStyle : primaryBtnStyle}
                onClick={onContinue}
              >
                Continue · Wznów
              </button>
              <button
                ref={remaining === 0 ? primaryBtnRef : null}
                type="button"
                style={remaining === 0 ? primaryBtnStyle : secondaryBtnStyle}
                onClick={handleStartFreshClick}
              >
                Start fresh · Zacznij od nowa
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={eyebrowStyle}>Start fresh · Od nowa</div>
            <h2 id="em-session-modal-title" style={titleStyle}>
              New questions or same?
              <span style={{ display: 'block', fontSize: 16, opacity: 0.78, marginTop: 4 }}>
                Nowe pytania czy te same?
              </span>
            </h2>
            <p style={subStyle}>
              Pick a fresh set, or replay the same questions you just had.
              <span style={{ display: 'block', opacity: 0.7, marginTop: 4 }}>
                Wybierz nowy zestaw lub powtórz te same pytania.
              </span>
            </p>
            <div style={buttonRowStyle}>
              <button
                ref={primaryBtnRef}
                type="button"
                style={primaryBtnStyle}
                onClick={onStartFreshNew}
              >
                New questions · Nowe pytania
              </button>
              <button
                type="button"
                style={secondaryBtnStyle}
                onClick={onStartFreshSame}
              >
                Repeat same · Powtórz te same
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default SessionModal;
