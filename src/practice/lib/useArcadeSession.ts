// useArcadeSession — canonical state machine for arcade-style MCQ shells.
//
// Many shells follow the same loop:
//   1. Show the current round's prompt.
//   2. Player picks one of `options[]`.
//   3. Score the pick → 'correct' (advance idx, mark solved) or 'wrong'
//      (record telemetry, let them retry).
//   4. When `idx === rounds.length`, the deck is `completed`.
//
// This hook centralises that loop. Shells with bespoke state (OpenTheBox's
// box flips, Battleship's grid, Snake's tile board) should use the simpler
// `useEndOfShellTip` hook directly.

import { useCallback, useMemo, useState } from 'react';

export interface ArcadeRound {
  id: string;
  prompt: string;
  options: string[];
  answerIndex: number;
  hint: string;
  hint_pl: string;
  exerciseId?: string;
}

export interface UseArcadeSessionResult {
  /** Index of the round being shown right now (0-based). */
  idx: number;
  /** The current round, or null when the deck is exhausted. */
  current: ArcadeRound | null;
  /** True when the student has solved every round. */
  completed: boolean;
  /** IDs of rounds the student has answered correctly. */
  solved: Set<string>;
  /**
   * Score a pick. On 'correct', the round id joins `solved` AND `idx` advances
   * to the next round. On 'wrong', the round stays put — caller is responsible
   * for any wrong-answer animation/feedback. The hook does NOT call
   * `onWrongAnswer` — pair with `useEndOfShellTip` for that.
   */
  attempt: (chosenIdx: number) => 'correct' | 'wrong';
  /** Force-advance to the next round without scoring (skip). */
  next: () => void;
  /** Reset to the start of the deck. */
  reset: () => void;
}

export function useArcadeSession(rounds: ArcadeRound[]): UseArcadeSessionResult {
  const [idx, setIdx] = useState<number>(0);
  const [solvedIds, setSolvedIds] = useState<Set<string>>(() => new Set());

  const total = rounds.length;
  const current: ArcadeRound | null = idx < total ? rounds[idx] : null;
  const completed = total > 0 && solvedIds.size >= total;

  const attempt = useCallback((chosenIdx: number): 'correct' | 'wrong' => {
    if (!current) return 'correct';
    const isCorrect = chosenIdx === current.answerIndex;
    if (isCorrect) {
      setSolvedIds((prev) => {
        if (prev.has(current.id)) return prev;
        const next = new Set(prev);
        next.add(current.id);
        return next;
      });
      setIdx((i) => Math.min(i + 1, total));
      return 'correct';
    }
    return 'wrong';
  }, [current, total]);

  const next = useCallback((): void => {
    setIdx((i) => Math.min(i + 1, total));
  }, [total]);

  const reset = useCallback((): void => {
    setIdx(0);
    setSolvedIds(new Set());
  }, []);

  // Memoise the result object so consumers can use it in dep arrays cleanly.
  return useMemo<UseArcadeSessionResult>(() => ({
    idx,
    current,
    completed,
    solved: solvedIds,
    attempt,
    next,
    reset,
  }), [idx, current, completed, solvedIds, attempt, next, reset]);
}
