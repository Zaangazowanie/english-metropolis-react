// Tiny deterministic RNG shared by every generator.
// Seedable mulberry32 — fast, pure, no globals, no DOM.
// Returns a function: rng() -> [0, 1).
//
// Why mulberry32?
//   - 32-bit state (one number) — easy to seed and snapshot
//   - good statistical quality for shuffles / pickers
//   - 8 lines, no dependencies

export function makeRng(seed: number = 0xC0FFEE): () => number {
  let s = seed >>> 0;
  return function rng(): number {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Hash an arbitrary string to a 32-bit unsigned int (FNV-1a).
// Used by generateFlashcards for stable per-word hue assignment.
export function hashString(input: string): number {
  let h = 0x811C9DC5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// Fisher-Yates shuffle in-place. Pass any rng for determinism.
export function shuffle<T>(arr: T[], rng: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Returns true when running directly via `tsx`/`node` and the entry script's
// filename ends with `expectedSuffix`. Used by inline self-tests so they are
// no-ops when the module is imported by the bundler. Typed to avoid pulling
// in @types/node for the browser bundle.
interface _ProcLike { argv?: string[] }
export function isDirectRun(expectedSuffix: string): boolean {
  const g = globalThis as { process?: _ProcLike };
  const argv = g.process?.argv;
  if (!argv || argv.length < 2) return false;
  return typeof argv[1] === 'string' && argv[1].endsWith(expectedSuffix);
}
