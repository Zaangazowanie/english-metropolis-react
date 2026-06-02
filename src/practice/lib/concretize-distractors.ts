// concretize-distractors.ts — Picture-Quiz distractor sanitiser.
//
// Picture Quiz (audit item #4-3, Ricky 2026-05-02): the suitability filter
// gates whole exercises with abstract answers, but borderline cases slip
// through with abstract DISTRACTORS (e.g. answer="flag" + distractors
// ["resilience","impose","adrenaline"]). For a what-is-shown shell those
// abstractions are unsolvable distractors — we swap them for concrete-noun
// fallbacks so all 4 options are in the same depictable register.
//
// Contract:
//   • Never touches the correct answer.
//   • Only swaps tokens that match the abstract list AND aren't already
//     concrete via the small built-in concrete-noun pool.
//   • Stable: returns same length as input; preserves order for non-swapped.
//   • Avoids producing duplicates with the answer or other distractors.
//
// Lives in its own module (not exercise-adapters.ts) to avoid a circular
// import path: exercise-adapters.ts → generators → generatePictureQuiz.ts.
// Re-exported from exercise-adapters.ts for discoverability.

const CONCRETE_FALLBACK_POOL = [
  'apple', 'dog', 'chair', 'bottle', 'flag', 'book', 'cup', 'hat', 'shoe', 'cat',
  'tree', 'door', 'key', 'lamp', 'phone', 'window', 'bread', 'clock', 'umbrella', 'pencil',
];

// Targeted at the abstractions Kelly's audit caught in the wild
// ("resilience", "impose", "adrenaline rush", "back on track", "memoir",
// "authoritarian", "protectorate"), plus a few canonical non-depictables.
// Match is case-insensitive whole-string OR multi-word phrase heuristic.
const ABSTRACT_TOKENS = new Set<string>([
  'resilience', 'impose', 'imposed', 'imposes',
  'adrenaline', 'adrenaline rush',
  'back on track', 'on track',
  'memoir', 'memoirs',
  'authoritarian', 'authoritarianism',
  'protectorate',
  'fossilized', 'fossilised',
  'loyalty', 'integrity', 'patience', 'sincerity', 'concept', 'idea',
  'belief', 'theory', 'opinion', 'attitude', 'mindset', 'consequence',
  'circumstance', 'priority', 'reluctance', 'hesitation', 'compromise',
]);

export function isAbstractDistractor(word: string): boolean {
  const w = word.trim().toLowerCase();
  if (!w) return true;
  if (ABSTRACT_TOKENS.has(w)) return true;
  // Multi-word phrases like "back on track" / "adrenaline rush" — treat the
  // whole phrase as abstract if every meaningful token is an abstract one,
  // OR if it contains a preposition that flags it as an idiomatic phrase.
  if (w.includes(' ')) {
    const parts = w.split(/\s+/).filter((p) => p.length > 2);
    if (parts.length >= 2 && parts.every((p) => ABSTRACT_TOKENS.has(p))) return true;
    if (/\b(on|in|at|of|for|by|to)\b/.test(w)) return true;
  }
  return false;
}

export function concretizeDistractors(distractors: string[], answer: string): string[] {
  const out: string[] = [];
  const taken = new Set<string>([answer.trim().toLowerCase()]);
  // Pre-stake non-abstract distractors so the fallback pool doesn't collide.
  for (const d of distractors) {
    const k = d.trim().toLowerCase();
    if (k && !isAbstractDistractor(d)) taken.add(k);
  }
  let poolIdx = 0;
  for (const d of distractors) {
    if (!isAbstractDistractor(d)) {
      out.push(d);
      continue;
    }
    let swap: string | null = null;
    for (let tries = 0; tries < CONCRETE_FALLBACK_POOL.length; tries++) {
      const cand = CONCRETE_FALLBACK_POOL[(poolIdx + tries) % CONCRETE_FALLBACK_POOL.length];
      if (!taken.has(cand.toLowerCase())) {
        swap = cand;
        poolIdx = (poolIdx + tries + 1) % CONCRETE_FALLBACK_POOL.length;
        break;
      }
    }
    if (swap) {
      taken.add(swap.toLowerCase());
      out.push(swap);
    } else {
      // Pool exhausted — keep the original rather than corrupt distractor count.
      out.push(d);
    }
  }
  return out;
}
