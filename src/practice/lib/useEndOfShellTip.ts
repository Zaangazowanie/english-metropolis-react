// useEndOfShellTip — canonical "track wrong attempts during a shell" hook.
//
// Every practice shell collects the questions the student got wrong as they
// play. The hook consolidates the pattern that was duplicated across ~20
// shells with subtle drift (some used `wrongAttempts.length === 0` guards,
// some used `useState<WrongAttempt[]>([])`, some used a ref).
//
// 2026-05-02 (CD's revised D1 directive): the original purpose was to fire
// ONE onWrongAnswer at end-of-shell that surfaced an InterferenceTip modal.
// That modal was killed in favor of an end-of-shell review screen — a single
// place where the student sees ALL wrongs with explanations, instead of one
// modal per session.
//
// What the hook does now:
//   - Still records wrong attempts via recordWrong (used by 24 of the 28 new
//     shells — same call site, no change required).
//   - Still calls onWrongAnswer ONCE on completion if the prop is supplied,
//     so existing shells that depend on the legacy modal flow keep working
//     until each is migrated to the review-screen pattern.
//   - NEW: also calls onSessionComplete (when supplied) on the same flip,
//     passing the full wrongAttempts array. Shells participating in the
//     review-screen pattern (MC first, then GapFill + OpenCloze) consume
//     this callback to hand the data up to the review host.
//   - NEW: returns wrongAttempts as a sealed snapshot getter for callers
//     that want to render the data inline.

import { useEffect, useRef, useCallback, useState } from 'react';

export interface WrongAttempt {
  questionId: string;
  studentAnswer: string;
  correctAnswer: string;
  explanationPL?: string;
  exerciseId?: string;
}

export interface UseEndOfShellTipOpts {
  /** Legacy: single first-wrong delegate. Kept for the original 10 shells. */
  onWrongAnswer?: (info: WrongAttempt) => void;
  /** New (D1 2026-05-02): full wrong-attempts array for review-screen flow. */
  onSessionComplete?: (info: { wrongAttempts: WrongAttempt[] }) => void;
  completed: boolean;
  /** Design-canvas preview state — when non-null, the hook is a no-op. */
  forcedState: string | null;
}

export interface UseEndOfShellTipResult {
  /** Push a wrong attempt onto the buffer. */
  recordWrong: (w: WrongAttempt) => void;
  /** Clear the buffer + the "tip already fired" guard (call from shell reset). */
  reset: () => void;
  /**
   * Snapshot of wrong attempts collected SO FAR. Caller is responsible for
   * not mutating. Useful when a shell wants to render the array itself
   * instead of forwarding via callback.
   */
  wrongAttempts: ReadonlyArray<WrongAttempt>;
}

export function useEndOfShellTip(opts: UseEndOfShellTipOpts): UseEndOfShellTipResult {
  const { onWrongAnswer, onSessionComplete, completed, forcedState } = opts;
  const wrongRef = useRef<WrongAttempt[]>([]);
  const firedRef = useRef<boolean>(false);
  // Forces a re-render when wrongAttempts changes so the snapshot getter
  // returns fresh data. Cheap — only fires on each wrong click.
  const [, setRev] = useState(0);

  const recordWrong = useCallback((w: WrongAttempt): void => {
    wrongRef.current.push(w);
    setRev((r) => r + 1);
  }, []);

  const reset = useCallback((): void => {
    wrongRef.current = [];
    firedRef.current = false;
    setRev((r) => r + 1);
  }, []);

  useEffect(() => {
    if (forcedState) return;
    if (!completed) return;
    if (firedRef.current) return;
    firedRef.current = true;
    // Legacy single-wrong delegate (only fires when there's at least one wrong).
    if (onWrongAnswer && wrongRef.current.length > 0) {
      onWrongAnswer(wrongRef.current[0]);
    }
    // New session-complete delegate ALWAYS fires (the review screen needs to
    // know about a clean session too, to render a 8/8 perfect review).
    if (onSessionComplete) {
      onSessionComplete({ wrongAttempts: [...wrongRef.current] });
    }
  }, [completed, forcedState, onWrongAnswer, onSessionComplete]);

  return { recordWrong, reset, wrongAttempts: wrongRef.current };
}
