// generateRankOrder — rank items by a criterion (size, time, formality).
//
// Algorithm:
//   1. Detect a rankable axis from the vocab pool (numbers, day-of-week,
//      months, sizes, register/formality).
//   2. Output items with `correctRank` (1 = first/highest/most-formal).
//
// Pure TS. No React/DOM/Convex. Deterministic with seed.

import { makeRng, shuffle, isDirectRun } from './rng';

export interface RankItem {
  id: string;
  label: string;
  label_pl: string;
  correctRank: number; // 1-indexed
  exerciseId?: string;
}

export interface RankOrderPuzzle {
  criterion: string;
  criterion_pl: string;
  items: RankItem[];
}

export interface RankOrderInput {
  word: string;
  word_pl: string;
  topic?: string;
  exerciseId?: string;
}

// Known rank scales. correctRank = 1 means first/lowest/earliest.
const SCALES: Array<{
  match: (w: string) => number | null;
  criterion: string;
  criterion_pl: string;
  topic: string;
}> = [
  {
    topic: 'days',
    criterion: 'Order from Monday to Sunday',
    criterion_pl: 'Uporządkuj od poniedziałku do niedzieli',
    match: (w) => {
      const days = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
      const i = days.indexOf(w.toLowerCase());
      return i >= 0 ? i + 1 : null;
    },
  },
  {
    topic: 'months',
    criterion: 'Order the months of the year',
    criterion_pl: 'Uporządkuj miesiące w roku',
    match: (w) => {
      const m = ['january','february','march','april','may','june','july','august','september','october','november','december'];
      const i = m.indexOf(w.toLowerCase());
      return i >= 0 ? i + 1 : null;
    },
  },
  {
    topic: 'numbers',
    criterion: 'Order the numbers from smallest to largest',
    criterion_pl: 'Uporządkuj liczby od najmniejszej do największej',
    match: (w) => {
      const n: Record<string, number> = {
        one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9, ten:10,
        eleven:11, twelve:12, thirteen:13, fourteen:14, fifteen:15, sixteen:16,
        seventeen:17, eighteen:18, nineteen:19, twenty:20, thirty:30, forty:40,
        fifty:50, sixty:60, seventy:70, eighty:80, ninety:90, hundred:100, thousand:1000,
      };
      return n[w.toLowerCase()] ?? null;
    },
  },
  {
    topic: 'sizes',
    criterion: 'Order from smallest to largest',
    criterion_pl: 'Uporządkuj od najmniejszego do największego',
    match: (w) => {
      const s: Record<string, number> = {
        tiny:1, small:2, little:2, medium:3, mid:3, large:4, big:4, huge:5, enormous:6, gigantic:7, massive:7,
      };
      return s[w.toLowerCase()] ?? null;
    },
  },
  {
    topic: 'temperature',
    criterion: 'Order from coldest to hottest',
    criterion_pl: 'Uporządkuj od najzimniejszego do najgorętszego',
    match: (w) => {
      const t: Record<string, number> = { freezing:1, cold:2, cool:3, warm:4, hot:5, boiling:6 };
      return t[w.toLowerCase()] ?? null;
    },
  },
  {
    topic: 'formality',
    criterion: 'Order from most formal to most casual',
    criterion_pl: 'Uporządkuj od najbardziej formalnego do najbardziej swobodnego',
    match: (w) => {
      const f: Record<string, number> = {
        'good morning':1, 'good afternoon':2, 'hello':3, 'hi':4, 'hey':5, 'yo':6,
      };
      return f[w.toLowerCase()] ?? null;
    },
  },
];

export function generateRankOrderPuzzle(
  input: RankOrderInput[],
  opts?: { seed?: number; numItems?: number },
): RankOrderPuzzle | null {
  const rng = makeRng(opts?.seed ?? 0x4A4B);
  const numItems = Math.max(3, Math.min(7, opts?.numItems ?? 5));

  // Dedupe.
  const seen = new Set<string>();
  const cleaned: RankOrderInput[] = [];
  for (const it of input) {
    const k = it.word?.trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    cleaned.push(it);
  }
  if (cleaned.length < 3) return null;

  // Try each scale; pick the first with at least 3 matches.
  for (const scale of SCALES) {
    const matches: Array<{ inp: RankOrderInput; rank: number }> = [];
    for (const c of cleaned) {
      const r = scale.match(c.word);
      if (r !== null) matches.push({ inp: c, rank: r });
    }
    if (matches.length < 3) continue;
    matches.sort((a, b) => a.rank - b.rank);
    const picked = matches.slice(0, numItems);
    // Renumber 1..N to compact ranks (so the shell shows positions 1..N
    // even if we picked 5 days out of 7).
    const items: RankItem[] = picked.map((m, i) => ({
      id: `ro-${i}-${m.inp.word}`,
      label: m.inp.word,
      label_pl: m.inp.word_pl,
      correctRank: i + 1,
      exerciseId: m.inp.exerciseId,
    }));
    return {
      criterion: scale.criterion,
      criterion_pl: scale.criterion_pl,
      // Shuffle item order so the shell shows them randomised.
      items: shuffle([...items], rng),
    };
  }

  // Fallback: alphabetical order (always works for any vocab pool).
  const sorted = [...cleaned].sort((a, b) => a.word.localeCompare(b.word)).slice(0, numItems);
  const items: RankItem[] = sorted.map((c, i) => ({
    id: `ro-${i}-${c.word}`,
    label: c.word,
    label_pl: c.word_pl,
    correctRank: i + 1,
    exerciseId: c.exerciseId,
  }));
  return {
    criterion: 'Order alphabetically (A → Z)',
    criterion_pl: 'Uporządkuj alfabetycznie (A → Z)',
    items: shuffle([...items], rng),
  };
}

if (isDirectRun('generateRankOrder.ts')) {
  const sample: RankOrderInput[] = [
    { word: 'monday',    word_pl: 'poniedziałek' },
    { word: 'tuesday',   word_pl: 'wtorek' },
    { word: 'wednesday', word_pl: 'środa' },
    { word: 'thursday',  word_pl: 'czwartek' },
    { word: 'friday',    word_pl: 'piątek' },
  ];
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(generateRankOrderPuzzle(sample, { seed: 23 }), null, 2));
}
