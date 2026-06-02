// maskAnswer — generator-side copy of the masking helper that lives in
// `src/practice/lib/exercise-adapters.ts::maskAnswerInPrompt`. Forked here
// because the lib adapter already imports from `../generators` (barrel), so
// importing `from '../lib/exercise-adapters'` inside any generator would
// create a circular dependency (lib → generators barrel → generator →
// lib).
//
// 2026-05-02 (Ricky, CD audit cross-cutting #19): the lib-side adapter
// `exercisesToMultipleChoice` already wires masking, but most arcade /
// wrapper shells take their content via the GENERATORS path
// (generateArcade, generateMultipleChoice via wrapperPuzzle, …). Without
// this helper, prompts continue to leak the answer (e.g. "Her resilience
// allowed her to stay focused" with answer "resilience").
//
// Behaviour MUST stay in lockstep with the lib copy. If you change the
// rules here (sentinel guard, morphological variants, stem fallback),
// mirror the change in `lib/exercise-adapters.ts::maskAnswerInPrompt`.
//
// Pure TS — no React/DOM/Convex dependency.

const MASK_TOKEN = '___';
const SENTINEL_RE = /^_{2,}[A-Z_]+_{2,}$/;

function escapeForRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Build the morphological variants we'll try for a single-word answer.
// Order matters: longer / more-specific variants first so we don't strip a
// shorter prefix when a longer one would match. De-duped, all lower-case.
function buildVariants(answerLower: string): string[] {
  const variants = new Set<string>();
  variants.add(answerLower);

  // -y → -ies (and back).
  if (answerLower.endsWith('y') && answerLower.length >= 3) {
    variants.add(answerLower.slice(0, -1) + 'ies');
  }
  if (answerLower.endsWith('ies') && answerLower.length >= 4) {
    variants.add(answerLower.slice(0, -3) + 'y');
  }

  // Plural / 3rd-person / -es.
  variants.add(answerLower + 's');
  variants.add(answerLower + 'es');

  // Past tense / participle.
  variants.add(answerLower + 'd');
  variants.add(answerLower + 'ed');

  // Forward -ing / -er / -est for short answers (regular conjugation).
  variants.add(answerLower + 'ing');
  variants.add(answerLower + 'er');

  // Doubled-consonant inflections for short CVC verbs (run → running/runned,
  // flag → flagged/flagging, stop → stopped/stopping). Only when the answer
  // ends in a single consonant after a single vowel after a consonant — the
  // classic CVC pattern that triggers consonant-doubling in English.
  if (answerLower.length >= 3) {
    const last = answerLower.slice(-1);
    const mid = answerLower.slice(-2, -1);
    const first = answerLower.slice(-3, -2);
    const isVowel = (c: string) => /[aeiou]/.test(c);
    if (!isVowel(last) && isVowel(mid) && !isVowel(first) && last !== 'y' && last !== 'w') {
      variants.add(answerLower + last + 'ed');
      variants.add(answerLower + last + 'ing');
      variants.add(answerLower + last + 'er');
    }
  }

  // Strip common inflection suffixes to get a candidate lemma.
  if (answerLower.endsWith('ing') && answerLower.length >= 5) {
    variants.add(answerLower.slice(0, -3));
    const stripped = answerLower.slice(0, -3);
    if (stripped.length >= 2 && stripped.charAt(stripped.length - 1) === stripped.charAt(stripped.length - 2)) {
      variants.add(stripped.slice(0, -1));
    }
  }
  if (answerLower.endsWith('ed') && answerLower.length >= 4) {
    variants.add(answerLower.slice(0, -2));
    variants.add(answerLower.slice(0, -1));
  }
  if (answerLower.endsWith('es') && answerLower.length >= 4) {
    variants.add(answerLower.slice(0, -2));
    variants.add(answerLower.slice(0, -1));
  }
  if (answerLower.endsWith('s') && answerLower.length >= 3) {
    variants.add(answerLower.slice(0, -1));
  }

  variants.delete('');
  return Array.from(variants).sort((a, b) => b.length - a.length);
}

export function maskAnswerInPrompt(prompt: string, answer: string): string {
  if (!prompt) return prompt;
  if (!answer) return prompt;

  // 1. Sentinel guard — never mask if the answer itself is a sentinel.
  if (SENTINEL_RE.test(answer.trim())) return prompt;

  const answerTrim = answer.trim();
  const answerLower = answerTrim.toLowerCase();
  if (!answerLower) return prompt;

  // 2. Multi-word phrase: try the full phrase first (whole-word boundaries).
  if (/\s/.test(answerTrim)) {
    const safe = escapeForRegex(answerTrim);
    const phraseRe = new RegExp(`\\b${safe.replace(/\\?\s+/g, '\\s+')}\\b`, 'i');
    if (phraseRe.test(prompt)) {
      return prompt.replace(phraseRe, MASK_TOKEN);
    }
    return prompt;
  }

  // 3 + 4. Whole-word + inflection variants.
  const variants = buildVariants(answerLower);
  for (const v of variants) {
    const safe = escapeForRegex(v);
    const re = new RegExp(`\\b${safe}\\b`, 'i');
    if (re.test(prompt)) {
      return prompt.replace(re, MASK_TOKEN);
    }
  }

  // 5. Stem fallback for ≥ 5-char answers.
  if (answerLower.length >= 5) {
    const stem = answerLower.slice(0, 5);
    const tokenRe = /[A-Za-z][A-Za-z'-]*/g;
    const matches: { token: string; index: number; score: number }[] = [];
    let m: RegExpExecArray | null;
    while ((m = tokenRe.exec(prompt)) !== null) {
      const tok = m[0];
      const tokLower = tok.toLowerCase();
      if (tokLower === answerLower) continue;
      if (tokLower.length < 4) continue;
      if (Math.abs(tokLower.length - answerLower.length) > 4) continue;
      if (!tokLower.startsWith(stem)) continue;
      matches.push({ token: tok, index: m.index, score: Math.abs(tokLower.length - answerLower.length) });
    }
    if (matches.length > 0) {
      matches.sort((a, b) => a.score - b.score);
      const best = matches[0];
      return prompt.slice(0, best.index) + MASK_TOKEN + prompt.slice(best.index + best.token.length);
    }
  }

  // 6. No match — return prompt unchanged.
  return prompt;
}
