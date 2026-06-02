// wrapperPuzzle — shared MCQ-rounds shape used by all 7 wrapper-style shells
// (Quiz Show, Concentration, Find the Match, Random Cards, Random Wheel,
// Airplane, Flying Fruit).
//
// These shells differ only in *presentation* — the underlying mechanic is
// "show a prompt, choose 1 of 4 options, fire onWrongAnswer if wrong". So we
// share a single generator that delegates to generateMultipleChoice and
// re-shapes the questions into the wrapper round contract.
//
// `count` lets each shell tune the round count to its scene (a wheel comfortably
// shows 6, a concentration grid wants 6 pairs = 6 rounds, an airplane fly-by
// supports 8-10).
//
// Pure TS. No React/DOM/Convex. Deterministic with seed.

import { generateMultipleChoice, type MultipleChoiceInput } from './generateMultipleChoice';

export interface WrapperRound {
  id: string;
  prompt: string;
  options: string[];
  answerIndex: number;
  hint: string;
  hint_pl: string;
  exerciseId?: string;
}

export interface WrapperPuzzle {
  rounds: WrapperRound[];
}

export type WrapperInput = MultipleChoiceInput;

export function generateWrapperPuzzle(
  input: WrapperInput[],
  opts?: { count?: number; seed?: number },
): WrapperPuzzle | null {
  const mcq = generateMultipleChoice(input, opts);
  if (!mcq || mcq.questions.length === 0) return null;
  return {
    rounds: mcq.questions.map((q) => ({
      id: q.id,
      prompt: q.prompt,
      options: q.options,
      answerIndex: q.answerIndex,
      hint: q.hint,
      hint_pl: q.hint_pl,
      exerciseId: q.exerciseId,
    })),
  };
}
