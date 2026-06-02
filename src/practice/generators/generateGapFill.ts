// generateGapFill — sentences with one or two blanks, plus a shuffled word bank.
//
// Algorithm:
//   1. For each input keyword, pick its example sentence (or synthesise a
//      fallback "I learned the word 'X' yesterday." with a TODO marker).
//   2. Replace the keyword inside the sentence with a [GAPn] marker. Multi-gap
//      scenes (gapsPerScene > 1) bundle two adjacent input items into one scene
//      whenever possible, so the bank is more interesting.
//   3. The bank for each scene = correct answers + 2-3 distractors drawn from
//      OTHER keywords in the input pool (preferring same length to make the
//      puzzle non-trivial), shuffled deterministically.
//   4. Diacritic-tolerant matching means "łatwo" finds the form even when the
//      stored example uses Polish diacritics or different casing.
//
// Output shape (load-bearing — matches Agent 6 brief contract):
//   { scenes: [{ text: "I [GAP1] my keys.", gaps:[{id, answer, acceptedAnswers}],
//                hint, hint_pl, bank }] }
//
// Pure TS. No React/DOM/Convex. Deterministic with seed.

import { makeRng, shuffle, isDirectRun } from './rng';

export interface GapFillGap {
  id: string;                    // 'GAP1', 'GAP2'
  answer: string;
  acceptedAnswers?: string[];    // optional alternate spellings / forms
}

export interface GapFillScene {
  text: string;                  // sentence with [GAP1] / [GAP2] markers
  gaps: GapFillGap[];
  hint?: string;
  hint_pl?: string;
  bank: string[];                // correct answers + distractors, shuffled
}

export interface GapFillPuzzle {
  scenes: GapFillScene[];
}

export interface GapFillInput {
  word: string;
  word_pl: string;
  exampleEn?: string;
}

const DEFAULT_SCENE_COUNT = 6;
const DEFAULT_GAPS_PER_SCENE = 1;
const DISTRACTORS_PER_SCENE = 3;

function fold(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Find the target word in `sentence` honouring word boundaries + diacritic folding.
// Returns [startIdx, endIdx) on the ORIGINAL sentence, or null if not present.
function findWord(sentence: string, target: string): [number, number] | null {
  if (!sentence || !target) return null;
  const folded = fold(sentence);
  const needle = fold(target);
  if (!needle) return null;
  const re = new RegExp(`(^|[^a-z0-9])(${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})(?![a-z0-9])`, 'i');
  const m = folded.match(re);
  if (!m) return null;
  const start = (m.index ?? 0) + (m[1]?.length ?? 0);
  return [start, start + needle.length];
}

function syntheticExample(word: string): string {
  // TODO(convex): once Convex `keywords` table guarantees an `exampleEn`,
  // this fallback can go away.
  return `I learned the word '${word}' yesterday.`;
}

function pickDistractors(
  pool: string[],
  exclude: Set<string>,
  reference: string,
  rng: () => number,
  count: number,
): string[] {
  const refLen = reference.length;
  const candidates = pool.filter((w) => !exclude.has(w.toLowerCase()));
  const sameLen = candidates.filter((w) => w.length === refLen);
  const closeLen = candidates.filter((w) => w.length !== refLen && Math.abs(w.length - refLen) <= 2);
  const farLen = candidates.filter((w) => Math.abs(w.length - refLen) > 2);
  const ranked = [...shuffle([...sameLen], rng), ...shuffle([...closeLen], rng), ...shuffle([...farLen], rng)];
  return ranked.slice(0, count);
}

export function generateGapFill(
  input: GapFillInput[],
  opts?: { sceneCount?: number; gapsPerScene?: number; seed?: number },
): GapFillPuzzle {
  const sceneCount = opts?.sceneCount ?? DEFAULT_SCENE_COUNT;
  const gapsPerScene = Math.max(1, Math.min(2, opts?.gapsPerScene ?? DEFAULT_GAPS_PER_SCENE));
  const rng = makeRng(opts?.seed ?? 0xCAB1E);

  // Dedupe input by surface form.
  const seen = new Set<string>();
  const items: GapFillInput[] = [];
  for (const it of input) {
    const k = it.word?.trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    items.push(it);
  }
  const allWords = items.map((i) => i.word.toLowerCase());

  const shuffled = shuffle([...items], rng);
  const scenes: GapFillScene[] = [];

  let cursor = 0;
  while (scenes.length < sceneCount && cursor < shuffled.length) {
    const primary = shuffled[cursor++];
    const primaryRange = primary.exampleEn
      ? findWord(primary.exampleEn, primary.word)
      : null;
    const sentence = primaryRange ? primary.exampleEn! : syntheticExample(primary.word);
    const range = primaryRange ?? findWord(sentence, primary.word);
    if (!range) continue;

    // Build [GAP1] replacement on the original sentence.
    const [s, e] = range;
    const gaps: GapFillGap[] = [
      { id: 'GAP1', answer: primary.word, acceptedAnswers: dedupeAccepted(primary.word) },
    ];
    let text = sentence.slice(0, s) + '[GAP1]' + sentence.slice(e);

    // Optionally try to tuck a second gap into the same sentence using another
    // input word that happens to appear in `text`.
    if (gapsPerScene >= 2) {
      for (let lookahead = 0; lookahead < shuffled.length; lookahead++) {
        if (lookahead === cursor - 1) continue;
        const cand = shuffled[lookahead];
        if (cand.word.toLowerCase() === primary.word.toLowerCase()) continue;
        const r2 = findWord(text, cand.word);
        if (!r2) continue;
        const [s2, e2] = r2;
        text = text.slice(0, s2) + '[GAP2]' + text.slice(e2);
        gaps.push({ id: 'GAP2', answer: cand.word, acceptedAnswers: dedupeAccepted(cand.word) });
        break;
      }
    }

    // Build word bank: correct answers + distractors.
    const correctSet = new Set(gaps.map((g) => g.answer.toLowerCase()));
    const distractors = pickDistractors(allWords, correctSet, primary.word, rng, DISTRACTORS_PER_SCENE);
    const bank = shuffle([...gaps.map((g) => g.answer), ...distractors], rng);

    scenes.push({
      text,
      gaps,
      hint: gaps.length === 1
        ? `Fill the blank with the right word.`
        : `Two words are missing — drop them in the right order.`,
      hint_pl: gaps.length === 1
        ? `Wstaw właściwe słowo. (${primary.word_pl})`
        : `Wstaw dwa właściwe słowa.`,
      bank,
    });
  }

  return { scenes };
}

// "worked" → ["worked", "Worked", "WORKED"] is overkill; we just lowercase-normalise.
function dedupeAccepted(answer: string): string[] | undefined {
  const lower = answer.toLowerCase();
  if (lower === answer) return undefined;
  return [lower];
}

// ─────────────────────────────────────────────────────────────────────────────
// Inline self-test (no-op when imported by bundler).
// ─────────────────────────────────────────────────────────────────────────────
if (isDirectRun('generateGapFill.ts')) {
  const sample: GapFillInput[] = [
    { word: 'worked', word_pl: 'pracował', exampleEn: 'I have worked at BMW for five years.' },
    { word: 'bridge', word_pl: 'most',     exampleEn: 'We crossed the bridge at sunset.' },
    { word: 'metro',  word_pl: 'metro',    exampleEn: 'Take the metro to the city centre.' },
    { word: 'plaza',  word_pl: 'plac',     exampleEn: 'The plaza was full of tourists.' },
    { word: 'avenue', word_pl: 'aleja',    exampleEn: 'A wide avenue lined with linden trees.' },
    { word: 'tower',  word_pl: 'wieża',    exampleEn: 'The tower lights up at night.' },
    { word: 'street', word_pl: 'ulica',    exampleEn: 'The street was empty after midnight.' },
  ];
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(generateGapFill(sample, { sceneCount: 4, seed: 5 }), null, 2));
}
