// Shared by the playback controller and its timing tests. Every original
// screen gets two additional seconds to read before the next action.
export function walkthroughDelay(id, step) {
  const original = step === 0 ? 1400 : step === 1 ? 1200 : step === 2 ? 4200 : step === 3 && id === 'practice' ? 1200 : step === 3 ? 3200 : 3600
  return original + 2000
}

export function nextExample(index, length, direction = 1) {
  return ((index + direction) % length + length) % length
}

// Points at the real control shown by the current screen. No image coordinates
// or fake global cursor: the guide is confined to the sample conversation.
export function cursorTarget(id, step, mode, { habit = 0, booking = 'move' } = {}) {
  if (step === 0) return ['.bj-demo-composer > .material-symbols-outlined:last-child', 0]
  if (step === 1 || step === 6) return null
  if (id === 'memory') return step === 2 ? ['.bj-walk-habit', habit] : step === 5 ? ['.bj-demo-answers button', habit === 1 ? 0 : 1] : null
  if (id === 'voice') return step === 2 || step === 3 ? ['.bj-demo-mic', 0] : ['.bj-walk-action', 0]
  if (id === 'grammar') return step >= 4 ? ['.bj-demo-answers button', 1] : null
  if (id === 'booking') return booking !== 'cancel' && step <= 3 ? ['.bj-walk-slots button', 1] : ['.bj-walk-action', 0]
  if (id === 'notes') return step === 2 ? ['.bj-walk-document-button', 0] : step === 4 ? ['.bj-demo-choice-list button', 0] : ['.bj-walk-action', 0]
  if (id === 'practice') return step === 2 ? ['.bj-demo-choice-list button', ['flashcards', 'quiz', 'usage', 'gap', 'hear'].indexOf(mode)] : step === 3 ? null : mode === 'quiz' || mode === 'gap' ? ['.bj-walk-options button', mode === 'gap' ? 1 : 0] : ['.bj-walk-action', 0]
  if (id === 'word') return step === 2 ? ['.bj-demo-choice-list button', 0] : ['.bj-walk-action', 0]
  return null
}
