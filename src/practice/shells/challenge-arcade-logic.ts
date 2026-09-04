/** Equal words are interchangeable even when a sentence contains two identical
 * tiles. Missing, repeated or unknown tile indices still fail validation. */
export function sentenceIsCorrect(words: string[], expected: number[], placed: Array<number | null>): boolean {
  return placed.length === expected.length && placed.length > 0 && new Set(placed).size === placed.length &&
    placed.every((index, slot) => index !== null && Number.isInteger(index) && index >= 0 && index < words.length && words[index] === words[expected[slot]]);
}

export function rankAssessment(items: Array<{id: string; correctRank: number}>, placed: Array<string | null>): boolean[] {
  const seen = new Set<string>();
  return placed.map((id, slot) => {
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return items.some(item => item.id === id && item.correctRank === slot + 1);
  });
}

export function challengeReward(right: boolean, alreadyCredited: boolean, armed: boolean, points: number): number | null {
  if (alreadyCredited) return null;
  return right ? points * (armed ? 2 : 1) : 0;
}
