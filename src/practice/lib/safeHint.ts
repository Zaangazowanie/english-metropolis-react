// safeHint — shared right-panel HintCard answer-leak guard for the 6 arcade
// shells (WhackAMole, Snake, MazeChase, BalloonPop, SpinTheWheel, OpenTheBox).
//
// Background (Ricky 2026-05-02, CD audit F5; consolidated 2026-05-03):
// `generateArcade` emits `hint_pl = answer.word_pl` and `hint = answer.clue ??
// answer.word_pl`. Rendered raw in the right-panel HintCard, this hands the
// student the answer (or its 1:1 PL gloss) BEFORE they tap anything. Each of
// the 6 shells previously inlined an identical local `buildSafeHint` — this
// module is the single source of truth.
//
// Contract:
//   - polish side is ALWAYS the structural clue ("N liter · zaczyna się na X")
//     because the upstream PL hint is the answer translation by construction.
//   - english side keeps the original clue ONLY when it is a real definition:
//     multi-word, longer than the answer + 3 chars, AND not containing the
//     answer as a standalone word. Otherwise it falls back to the structural
//     EN clue ("N letters · starts with X").
//   - When `answerWord` is empty, we pass the original hints through (the
//     shell hasn't seeded a round yet — there's nothing to leak).
//
// Pure TS. No React/DOM. Safe to import from any shell.

export interface SafeHint {
  english: string;
  polish: string;
}

export function buildSafeHint(
  answerWord: string,
  originalEnglishHint?: string,
  originalPolishHint?: string,
): SafeHint {
  const ans = (answerWord || '').trim();
  if (!ans) {
    return {
      english: originalEnglishHint || '',
      polish: originalPolishHint || '',
    };
  }
  const ansLower = ans.toLowerCase();
  const first = ans.charAt(0).toUpperCase();
  const len = ans.length;
  const safeEN = `${len} letters · starts with "${first}"`;
  const safePL = `${len} liter · zaczyna się na „${first}"`;
  const enLeaks = (h?: string) => {
    if (!h) return true;
    const hLower = h.toLowerCase().trim();
    if (hLower === ansLower) return true;
    // Single-word english "hint" is the PL gloss path (generateArcade falls
    // back to word_pl when no clue is set) — treat as a leak.
    if (!/\s/.test(hLower)) return true;
    if (hLower.length <= ansLower.length + 3) return true;
    const safe = ansLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const wordRe = new RegExp(`\\b${safe}\\b`, 'i');
    return wordRe.test(h);
  };
  return {
    english: enLeaks(originalEnglishHint) ? safeEN : originalEnglishHint!,
    polish: safePL,
  };
}
