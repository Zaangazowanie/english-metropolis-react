export type ArcadeEvent = { type: 'correct' | 'incorrect' | 'complete' | 'reset'; points?: number };
export interface ArcadeRun {
  score: number;
  streak: number;
  bestStreak: number;
  hits: number;
  misses: number;
  complete: boolean;
  sequence: number;
  award: number;
  last: ArcadeEvent['type'] | null;
}
export const emptyArcadeRun: ArcadeRun = {
  score: 0, streak: 0, bestStreak: 0, hits: 0, misses: 0,
  complete: false, sequence: 0, award: 0, last: null,
};
export const arcadeMultiplier = (streak: number) => Math.min(4, 1 + Math.floor(streak / 3));

// Only actual shell decisions enter this reducer. Persistence/progress is a
// separate learning record; an animation or page load never awards points.
export function reduceArcadeRun(state: ArcadeRun, event: ArcadeEvent): ArcadeRun {
  if (event.type === 'reset') return { ...emptyArcadeRun, sequence: state.sequence + 1 };
  if (state.complete) return state;
  if (event.type === 'complete') return { ...state, complete: true, last: 'complete', award: 0, sequence: state.sequence + 1 };
  if (event.type === 'incorrect') return { ...state, streak: 0, misses: state.misses + 1, last: 'incorrect', award: 0, sequence: state.sequence + 1 };
  const points = Number.isFinite(event.points) ? Math.max(0, Math.min(1000, Math.round(event.points!))) : 100;
  const streak = state.streak + 1;
  const award = points * arcadeMultiplier(streak);
  return { ...state, score: state.score + award, streak, bestStreak: Math.max(streak, state.bestStreak), hits: state.hits + 1, award, last: 'correct', sequence: state.sequence + 1 };
}
