// generateDragDrop — sort words into category bins ("Cargo Quay" mental model).
//
// Same categorical-grouping spirit as generateGroupSort, but:
//   - Visual mental model is "drop containers into bins on a quay", so we
//     emit BINS (not categories) with optional capacity, and the puzzle is
//     intentionally smaller (default 3 bins × 2 items = 6 items).
//   - We pick bin themes that read naturally as physical compartments:
//       transport vocab → "By land / By sea / By air"
//       time vocab      → "Past / Present / Future"
//       register        → "Polite / Casual"
//     Falls back to the same partOfSpeech / category / topic / alpha banding
//     as generateGroupSort when the keywords don't match a known theme.
//
// Output shape (load-bearing — matches Agent 6 brief contract):
//   {
//     bins:  [{ id, label, label_pl, emoji?, capacity? }],
//     items: [{ id, label, correctBinId }],
//   }
//
// Pure TS. No React/DOM/Convex. Deterministic with seed.

import { makeRng, shuffle, isDirectRun } from './rng';

export interface DragDropBin {
  id: string;
  label: string;
  label_pl: string;
  emoji?: string;
  capacity?: number;
}

export interface DragDropItem {
  id: string;
  label: string;
  correctBinId: string;
}

export interface DragDropPuzzle {
  bins: DragDropBin[];
  items: DragDropItem[];
}

export interface DragDropInput {
  word: string;
  word_pl: string;
  partOfSpeech?: string;
  topic?: string;
}

const DEFAULT_BINS = 3;
const DEFAULT_ITEMS_PER_BIN = 2;

// ─────────────────────────────────────────────────────────────────────────────
// Theme detectors — pick a "physical compartment" mental model from vocab.
// Each detector returns either a list of {bin, words} or null (theme didn't fit).
// ─────────────────────────────────────────────────────────────────────────────

interface ThemeBucket {
  bin: DragDropBin;
  words: DragDropInput[];
}

type Detector = (input: DragDropInput[]) => ThemeBucket[] | null;

function slug(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'bin';
}

const TRANSPORT_LAND = ['bus', 'tram', 'metro', 'subway', 'train', 'car', 'bicycle', 'bike', 'taxi', 'underground', 'lorry', 'truck', 'motorbike'];
const TRANSPORT_SEA  = ['boat', 'ship', 'ferry', 'yacht', 'submarine', 'kayak', 'canoe', 'sailboat'];
const TRANSPORT_AIR  = ['plane', 'airplane', 'aeroplane', 'helicopter', 'jet', 'glider', 'balloon', 'drone'];

const detectTransport: Detector = (input) => {
  const land: DragDropInput[] = [];
  const sea: DragDropInput[] = [];
  const air: DragDropInput[] = [];
  for (const item of input) {
    const w = item.word.toLowerCase();
    if (TRANSPORT_LAND.includes(w)) land.push(item);
    else if (TRANSPORT_SEA.includes(w)) sea.push(item);
    else if (TRANSPORT_AIR.includes(w)) air.push(item);
  }
  if (land.length + sea.length + air.length < 4) return null;
  if ([land, sea, air].filter((b) => b.length > 0).length < 2) return null;
  return [
    { bin: { id: 'land', label: 'By land', label_pl: 'lądem' }, words: land },
    { bin: { id: 'sea',  label: 'By sea',  label_pl: 'morzem' }, words: sea },
    { bin: { id: 'air',  label: 'By air',  label_pl: 'powietrzem' }, words: air },
  ].filter((b) => b.words.length > 0);
};

const TENSE_PAST    = /(ed|ied|d)$/;
const TENSE_PAST_IRREG = ['was', 'were', 'said', 'went', 'came', 'saw', 'ate', 'ran', 'took', 'gave', 'wrote', 'broke', 'spoke', 'wore', 'drove'];
const TENSE_PRESENT = /(s|es|ies|ing)$/;
const TENSE_FUTURE_RE = /^(will |shall |going to )/;

const detectTense: Detector = (input) => {
  // Only fires when input looks verb-heavy (>= 50% verbs by partOfSpeech).
  const verbCount = input.filter((i) => i.partOfSpeech === 'verb').length;
  if (verbCount < input.length / 2) return null;

  const past: DragDropInput[] = [];
  const present: DragDropInput[] = [];
  const future: DragDropInput[] = [];
  for (const item of input) {
    const w = item.word.toLowerCase();
    if (TENSE_FUTURE_RE.test(w)) { future.push(item); continue; }
    if (TENSE_PAST_IRREG.includes(w) || (w.endsWith('ed') && !w.endsWith('eed'))) { past.push(item); continue; }
    if (TENSE_PRESENT.test(w)) { present.push(item); continue; }
  }
  if (past.length + present.length + future.length < 4) return null;
  return [
    { bin: { id: 'past',    label: 'Past',    label_pl: 'przeszły' },     words: past },
    { bin: { id: 'present', label: 'Present', label_pl: 'teraźniejszy' }, words: present },
    { bin: { id: 'future',  label: 'Future',  label_pl: 'przyszły' },     words: future },
  ].filter((b) => b.words.length > 0);
};

const detectByTopic: Detector = (input) => {
  const map = new Map<string, DragDropInput[]>();
  for (const item of input) {
    const t = item.topic;
    if (!t) continue;
    if (!map.has(t)) map.set(t, []);
    map.get(t)!.push(item);
  }
  const groups = [...map.entries()].filter(([, ws]) => ws.length >= 2);
  if (groups.length < 2) return null;
  groups.sort((a, b) => b[1].length - a[1].length);
  return groups.slice(0, 4).map(([k, ws]) => ({
    bin: { id: slug(k), label: k, label_pl: k },
    words: ws,
  }));
};

const POS_BIN_PL: Record<string, string> = {
  noun: 'rzeczowniki',
  verb: 'czasowniki',
  adjective: 'przymiotniki',
  adverb: 'przysłówki',
};

const detectByPartOfSpeech: Detector = (input) => {
  const map = new Map<string, DragDropInput[]>();
  for (const item of input) {
    const p = item.partOfSpeech;
    if (!p) continue;
    if (!map.has(p)) map.set(p, []);
    map.get(p)!.push(item);
  }
  const groups = [...map.entries()].filter(([, ws]) => ws.length >= 2);
  if (groups.length < 2) return null;
  groups.sort((a, b) => b[1].length - a[1].length);
  return groups.slice(0, 4).map(([k, ws]) => ({
    bin: { id: slug(k), label: k.charAt(0).toUpperCase() + k.slice(1), label_pl: POS_BIN_PL[k] ?? k },
    words: ws,
  }));
};

const detectAlpha: Detector = (input) => {
  const groups: Record<string, DragDropInput[]> = { 'A-G': [], 'H-N': [], 'O-Z': [] };
  for (const item of input) {
    const c = item.word.toLowerCase().normalize('NFD').replace(/[^a-z]/g, '').charAt(0);
    if (!c) continue;
    const band = c <= 'g' ? 'A-G' : c <= 'n' ? 'H-N' : 'O-Z';
    groups[band].push(item);
  }
  const filled = Object.entries(groups).filter(([, ws]) => ws.length >= 1);
  if (filled.length < 2) return null;
  return filled.map(([k, ws]) => ({
    bin: { id: slug(k), label: k, label_pl: `${k} (litery)` },
    words: ws,
  }));
};

const DETECTORS: Detector[] = [detectTransport, detectTense, detectByTopic, detectByPartOfSpeech, detectAlpha];

export function generateDragDrop(
  input: DragDropInput[],
  opts?: { numBins?: number; itemsPerBin?: number; seed?: number },
): DragDropPuzzle {
  const numBins = Math.max(2, Math.min(4, opts?.numBins ?? DEFAULT_BINS));
  const itemsPerBin = Math.max(1, opts?.itemsPerBin ?? DEFAULT_ITEMS_PER_BIN);
  const rng = makeRng(opts?.seed ?? 0xDD11);

  // Dedupe.
  const seen = new Set<string>();
  const cleaned: DragDropInput[] = [];
  for (const it of input) {
    const k = it.word?.trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    cleaned.push(it);
  }

  // Run detectors in priority order; pick the first that returns >= 2 bins.
  let chosen: ThemeBucket[] = [];
  for (const detect of DETECTORS) {
    const result = detect(cleaned);
    if (result && result.length >= 2) {
      chosen = result;
      break;
    }
  }
  // Last-ditch fallback: single bin so we always emit something.
  if (chosen.length === 0) {
    chosen = [{ bin: { id: 'vocab', label: 'Vocabulary', label_pl: 'słownictwo' }, words: cleaned }];
  }

  // Sort biggest first, take numBins, sample itemsPerBin from each.
  chosen.sort((a, b) => b.words.length - a.words.length);
  const sliced = chosen.slice(0, numBins);

  const bins: DragDropBin[] = sliced.map((b) => ({ ...b.bin, capacity: itemsPerBin }));
  const items: DragDropItem[] = [];
  for (const b of sliced) {
    const picked = shuffle([...b.words], rng).slice(0, itemsPerBin);
    for (const w of picked) {
      items.push({
        id: `${b.bin.id}:${slug(w.word)}`,
        label: w.word,
        correctBinId: b.bin.id,
      });
    }
  }

  return { bins, items: shuffle([...items], rng) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Inline self-test.
// ─────────────────────────────────────────────────────────────────────────────
if (isDirectRun('generateDragDrop.ts')) {
  const transport: DragDropInput[] = [
    { word: 'bus',       word_pl: 'autobus' },
    { word: 'tram',      word_pl: 'tramwaj' },
    { word: 'metro',     word_pl: 'metro' },
    { word: 'boat',      word_pl: 'łódź' },
    { word: 'ferry',     word_pl: 'prom' },
    { word: 'plane',     word_pl: 'samolot' },
    { word: 'helicopter', word_pl: 'helikopter' },
  ];
  // eslint-disable-next-line no-console
  console.log('transport →', JSON.stringify(generateDragDrop(transport, { seed: 3 }), null, 2));

  const tenses: DragDropInput[] = [
    { word: 'walked',   word_pl: 'chodził',   partOfSpeech: 'verb' },
    { word: 'said',     word_pl: 'powiedział', partOfSpeech: 'verb' },
    { word: 'walks',    word_pl: 'chodzi',    partOfSpeech: 'verb' },
    { word: 'sees',     word_pl: 'widzi',     partOfSpeech: 'verb' },
    { word: 'will go',  word_pl: 'pójdzie',   partOfSpeech: 'verb' },
    { word: 'shall meet', word_pl: 'spotkamy się', partOfSpeech: 'verb' },
  ];
  // eslint-disable-next-line no-console
  console.log('tenses →', JSON.stringify(generateDragDrop(tenses, { seed: 5 }), null, 2));
}
