// generateLabelledDiagram — drag labels onto SVG hotspots.
//
// V1: emits a default "atrium schematic" SVG whose hotspots map to a
// curated 6-label set (labelled with vocab from the input pool when the
// vocab matches one of the diagram themes; falls back to the schematic's
// built-in labels otherwise).
//
// SVG URL convention (when the upstream image pipeline produces a
// per-vocab-set diagram):
//   /practice-diagrams/<vocabSetId>/<theme>.svg
//
// The shell ships an inline atrium-schematic fallback so it's always
// playable even if the SVG asset is missing.
//
// Pure TS. No React/DOM/Convex. Deterministic with seed.

import { makeRng, shuffle, isDirectRun } from './rng';

export interface LabelledHotspot {
  id: string;
  x: number; // 0-100, percent of viewBox width
  y: number; // 0-100, percent of viewBox height
  label: string;
  label_pl: string;
  hint: string;
  hint_pl: string;
  exerciseId?: string;
}

export interface LabelledDiagramPuzzle {
  /** Inline SVG markup, OR url to a hosted SVG. */
  diagram_svg: string;
  diagram_url?: string;
  title: string;
  title_pl: string;
  hotspots: LabelledHotspot[];
}

export interface LabelledDiagramInput {
  word: string;
  word_pl: string;
  topic?: string;
  exerciseId?: string;
}

// Default atrium schematic — used as the inline fallback. The hotspot positions
// match the schematic's structural elements (roof beam, west column, etc.).
const ATRIUM_HOTSPOTS = [
  { id: 'roof',     x: 50, y: 14, label: 'roof',     label_pl: 'dach' },
  { id: 'beam',     x: 50, y: 28, label: 'beam',     label_pl: 'belka' },
  { id: 'column',   x: 18, y: 60, label: 'column',   label_pl: 'kolumna' },
  { id: 'arch',     x: 50, y: 50, label: 'arch',     label_pl: 'łuk' },
  { id: 'floor',    x: 50, y: 88, label: 'floor',    label_pl: 'podłoga' },
  { id: 'staircase', x: 82, y: 70, label: 'staircase', label_pl: 'schody' },
];

export function generateLabelledDiagramPuzzle(
  input: LabelledDiagramInput[],
  opts?: { seed?: number; vocabSetId?: string },
): LabelledDiagramPuzzle | null {
  const rng = makeRng(opts?.seed ?? 0xDA7A);

  // Dedupe.
  const seen = new Set<string>();
  const cleaned: LabelledDiagramInput[] = [];
  for (const it of input) {
    const k = it.word?.trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    cleaned.push(it);
  }
  if (cleaned.length < 4) return null;

  // If the vocab includes architectural words, use them; else fall back to
  // the atrium defaults.
  const archMatches = cleaned.filter((c) =>
    ATRIUM_HOTSPOTS.some((h) => h.label === c.word.toLowerCase()),
  );

  let hotspots: LabelledHotspot[];
  if (archMatches.length >= 4) {
    // Override default labels with the matched vocab (carries exerciseId).
    hotspots = ATRIUM_HOTSPOTS.map((h) => {
      const m = archMatches.find((c) => c.word.toLowerCase() === h.label);
      return {
        id: h.id,
        x: h.x,
        y: h.y,
        label: h.label,
        label_pl: m?.word_pl ?? h.label_pl,
        hint: `Find the ${h.label} on the diagram.`,
        hint_pl: `Znajdź ${h.label_pl} na schemacie.`,
        exerciseId: m?.exerciseId,
      };
    });
  } else {
    // Use the atrium defaults verbatim. Layer in vocab hints for the labels
    // that happen to match the input.
    hotspots = ATRIUM_HOTSPOTS.map((h) => ({
      id: h.id,
      x: h.x,
      y: h.y,
      label: h.label,
      label_pl: h.label_pl,
      hint: `Where is the ${h.label}?`,
      hint_pl: `Gdzie jest ${h.label_pl}?`,
    }));
  }

  // Inline SVG fallback — drafting paper grid + atrium silhouette.
  const diagram_svg = `<svg viewBox="0 0 400 320" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
    <defs>
      <pattern id="atriumGrid" width="20" height="20" patternUnits="userSpaceOnUse">
        <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#7DD3FC" stroke-width="0.4" opacity="0.35"/>
      </pattern>
    </defs>
    <rect width="400" height="320" fill="url(#atriumGrid)"/>
    <!-- roof line -->
    <path d="M 60 60 L 200 24 L 340 60" fill="none" stroke="#7DD3FC" stroke-width="2"/>
    <!-- beam -->
    <line x1="80" y1="80" x2="320" y2="80" stroke="#7DD3FC" stroke-width="2"/>
    <line x1="80" y1="86" x2="320" y2="86" stroke="#7DD3FC" stroke-width="0.8" opacity="0.6"/>
    <!-- columns -->
    <rect x="62"  y="80"  width="14" height="190" fill="none" stroke="#7DD3FC" stroke-width="2"/>
    <rect x="324" y="80"  width="14" height="190" fill="none" stroke="#7DD3FC" stroke-width="2"/>
    <!-- arch -->
    <path d="M 130 270 Q 200 100 270 270" fill="none" stroke="#7DD3FC" stroke-width="2"/>
    <!-- floor -->
    <line x1="40" y1="280" x2="360" y2="280" stroke="#7DD3FC" stroke-width="2.5"/>
    <line x1="40" y1="285" x2="360" y2="285" stroke="#7DD3FC" stroke-width="0.8" opacity="0.5"/>
    <!-- staircase -->
    <path d="M 290 280 L 290 256 L 310 256 L 310 232 L 330 232 L 330 208" fill="none" stroke="#7DD3FC" stroke-width="2"/>
    <!-- compass rose -->
    <g transform="translate(370 28)">
      <circle r="10" fill="none" stroke="#FBBF24" stroke-width="0.8" opacity="0.7"/>
      <path d="M 0 -10 L 0 10 M -10 0 L 10 0" stroke="#FBBF24" stroke-width="0.8"/>
      <text x="0" y="-12" font-family="IBM Plex Mono, monospace" font-size="6" fill="#FBBF24" text-anchor="middle">N</text>
    </g>
  </svg>`;

  // Shuffle hotspot order (so labels arrive in a random pile).
  const shuffled = shuffle([...hotspots], rng);

  const setId = opts?.vocabSetId ?? 'demo';
  return {
    diagram_svg,
    diagram_url: `/practice-diagrams/${setId}/atrium.svg`,
    title: 'Atrium Schematic',
    title_pl: 'Schemat atrium',
    hotspots: shuffled,
  };
}

if (isDirectRun('generateLabelledDiagram.ts')) {
  const sample: LabelledDiagramInput[] = [
    { word: 'roof',     word_pl: 'dach' },
    { word: 'beam',     word_pl: 'belka' },
    { word: 'column',   word_pl: 'kolumna' },
    { word: 'arch',     word_pl: 'łuk' },
    { word: 'floor',    word_pl: 'podłoga' },
    { word: 'staircase', word_pl: 'schody' },
  ];
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(generateLabelledDiagramPuzzle(sample, { seed: 21 }), null, 2));
}
