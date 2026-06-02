// Stable per-question shuffle for the new Practice UI.
//
// Why this exists: the practice library JSON stores answer choices in a
// natural order (often correct-first). If we render in that order, the MCQ
// becomes "always pick A" — the exact bug Aleksandra called out. Each
// question must reshuffle its options every session, but stay stable across
// re-renders within the same session so a re-render doesn't visually jump.
//
// We derive a deterministic seed from the question id + prompt + options so:
//   - the order is stable for the lifetime of a question render
//   - different question ids get different orders
//   - across sessions you can re-seed by appending a session salt

export function hashSeed(s) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function seededShuffle(arr, seed) {
  if (!Array.isArray(arr)) return arr
  const a = arr.slice()
  let s = seed >>> 0 || 1
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0
    const j = s % (i + 1)
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// Convenience: build a seed from a question + a per-session salt so the same
// question reshuffles between independent runs (e.g. retry of the same drill).
export function shuffleSeedFor(question, sessionSalt = '') {
  const id = String(question?.id || '')
  const prompt = String(question?.prompt || '')
  const opts = Array.isArray(question?.options) ? question.options.join('|') : ''
  return hashSeed(id + '|' + prompt + '|' + opts + '|' + sessionSalt)
}
