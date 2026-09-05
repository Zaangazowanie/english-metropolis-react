/** Whether a cloze gap is final: incorrect guesses remain retryable. */
export function clozeResolved(gaps: readonly { id: number }[], locked: Record<number, 'right'|'wrong'>, skipped: ReadonlySet<number>): boolean {
  return gaps.every(gap => locked[gap.id] === 'right' || skipped.has(gap.id));
}

/** Claim each entered cloze answer once, even before React commits its state. */
export function claimClozeAttempt(attempts: Map<number, string>, id: number, candidate: string): boolean {
  if (!candidate || attempts.get(id) === candidate) return false;
  attempts.set(id, candidate);
  return true;
}

/** Distinct outcomes only: retries must not multiply the deduction. */
export function anagramCleanCount(words: readonly string[], wrongIds: readonly string[], answers: Record<string,string>): number {
  const wrong = new Set(wrongIds);
  return words.filter(word => !wrong.has(word) && answers[word] === word).length;
}

/** A deterministic shuffle that preserves every translation and avoids an ordered answer key. */
export function shuffledTranslations<T extends {en:string;pl:string;line:string}>(pairs:readonly T[]): Record<string,string[]> {
  const output:Record<string,string[]> = {};
  for (const pair of pairs) (output[pair.line] ??= []).push(pair.pl);
  for (const line of Object.keys(output)) {
    const original = output[line];
    const shuffled = [...original].sort((a,b) => {
      const hash=(value:string)=>Array.from(value).reduce((n,char)=>(n*31+char.charCodeAt(0))%65521,7);
      return hash(a)-hash(b);
    });
    if (shuffled.length>1 && shuffled.every((value,i)=>value===original[i])) shuffled.push(shuffled.shift()!);
    output[line]=shuffled;
  }
  return output;
}

export function typingDispatchStats(typed:string,target:string,elapsedMs:number): {accuracy:number;wpm:number;correct:number} {
  const correct=Array.from(typed).filter((char,i)=>char===target[i]).length;
  return {correct,accuracy:typed.length?Math.round(correct/typed.length*100):100,wpm:Math.round((correct/5)/(Math.max(1000,elapsedMs)/60000))};
}

/** Expand a selected error over multiple tokens without losing the first endpoint. */
export function expandErrorSelection(previous:[number,number]|null,next:[number,number],extend:boolean): [number,number] {
  return extend&&previous ? [Math.min(previous[0],next[0]),Math.max(previous[1],next[1])] : next;
}

/** Zero-width corrections may be encoded on either side of a space. */
export function insertionPointMatches(sentence:string, expected:number, chosen:number): boolean {
  if (expected<0 || chosen<0 || expected>sentence.length || chosen>sentence.length) return false;
  return sentence.slice(Math.min(expected,chosen),Math.max(expected,chosen)).trim().length===0;
}
