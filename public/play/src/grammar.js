// Grammar drills from the gated bank (public/play/tools/lint-grammar-bank.mjs
// is the only thing allowed to write gamedata/grammar_bank.*). Each quest local
// runs a short multiple-choice drill on one concept; concepts spread across the
// city and difficulty rises along each metro line, so touring the map is a full
// grammar course. Mastery + the review queue live in progress.js.
// NOTE: dir is named gamedata (not data) — the prod deployer's rsync excludes
// bare "data" path components for student-data safety, which would strip it.
import BANK from './gamedata/grammar_bank.js';
import { progress } from './progress.js';

// concepts a learner meets first → last (rough CEFR progression)
export const CONCEPT_ORDER = [
  'articles', 'subject_verb', 'plurals', 'prepositions', 'questions_negation',
  'pronouns', 'verb_tense', 'word_order', 'modals', 'comparatives',
  'gerund_infinitive', 'word_choice', 'collocation', 'conditionals',
];
const CONCEPTS = Object.fromEntries(BANK.concepts.map((c) => [c.id, c]));
const BY_CONCEPT = {};
const BY_ID = {};
for (const ex of BANK.exercises) { (BY_CONCEPT[ex.concept] ??= []).push(ex); BY_ID[ex.id] = ex; }

export const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'];
const levelIdx = (l) => Math.max(0, LEVELS.indexOf(l));

// Assign a teaching concept + target level to a district local. The concept
// comes from the ZONE index (unique 0..43), stride 3 per zone, so the two
// districts flanking one platform never teach the same thing and a stop's six
// visible locals cover six concepts; level climbs with distance from the hub.
// Each completed round (lap) shifts the concept by a stride coprime with the
// 14 concepts and raises the level, so locals always have something new.
export function assignGrammar(z, npcIdx, laps = 0) {
  const zoneIndex = z.zoneIndex ?? 0, stopIndex = z.stopIdx ?? 0;
  const concept = CONCEPT_ORDER[(zoneIndex * 3 + npcIdx + laps * 5) % CONCEPT_ORDER.length];
  const level = LEVELS[Math.min(LEVELS.length - 1, Math.floor(stopIndex / 3) + laps)];
  return { concept, level, conceptName: conceptName(concept) };
}

// Same idea for NPCs with an authored base concept (the hub cast): rotate the
// concept and climb a level per completed lap.
export function grammarForLap(base, laps = 0) {
  if (!laps) return { ...base, conceptName: conceptName(base.concept) };
  const bi = Math.max(0, CONCEPT_ORDER.indexOf(base.concept));
  const concept = CONCEPT_ORDER[(bi + laps * 5) % CONCEPT_ORDER.length];
  const level = LEVELS[Math.min(LEVELS.length - 1, levelIdx(base.level) + laps)];
  return { concept, level, conceptName: conceptName(concept) };
}

export function conceptName(id) { return CONCEPTS[id]?.name || id; }
export function conceptHint(id) { return CONCEPTS[id]?.hint || ''; }
export function bankSize(id) { return (BY_CONCEPT[id] || []).length; }
// The highest CEFR level a concept can honestly serve; the drill button never
// prints a level the bank cannot fill.
export function maxLevelFor(id) {
  let best = 0;
  for (const ex of BY_CONCEPT[id] || []) best = Math.max(best, levelIdx(ex.level));
  return LEVELS[best];
}

// ---- mastery (delegates to the progress store) ----
export function masteryFor(concept) { return progress.masteryFor(concept); }
export function recordAnswer(concept, exId, wasCorrect, opts) { progress.recordAnswer(concept, exId, wasCorrect, opts); }
export function overallMastery() {
  return CONCEPT_ORDER.map((id) => ({ id, name: conceptName(id), total: bankSize(id), ...progress.masteryFor(id) }));
}

// Fisher-Yates, in place. Math.random inside a sort comparator is not a shuffle.
export function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Present a question with its options in random order. Returns { options,
// answerIndex } for the renderer while the underlying item keeps its authored
// key — the one helper every renderer (drill, warm-up, street) goes through,
// so answer-position bias in the data can never be learned by the player.
export function shuffledOptions(q) {
  const order = shuffle(q.options.map((_, i) => i));
  return { options: order.map((i) => q.options[i]), answerIndex: order.indexOf(q.answerIndex), order };
}

// ---- session builder: N questions of a concept near a target level ----
// Order: due review items first (max 2, from this concept, then any concept,
// labelled `review`), then unseen items closest to the target level, then seen
// ones. A pool short of N is topped up from the neighbouring concept in
// CONCEPT_ORDER and the session says so (`toppedUp`). `servedLevel` is the
// highest level actually in the set — that is the label the UI prints.
export function buildSession(concept, level, n = 5, dialect = null, { review = true } = {}) {
  const target = levelIdx(level);
  const picked = [];
  const used = new Set();

  if (review) {
    const due = [...progress.dueIds(concept), ...progress.dueIds(null).filter((d) => d.concept !== concept)];
    for (const d of due) {
      if (picked.length >= 2) break;
      const ex = BY_ID[d.id];
      if (!ex || used.has(ex.id)) continue;
      used.add(ex.id);
      picked.push({ ...ex, review: true });
    }
  }

  const rank = (ex, done) => (done.has(ex.id) ? 2 : 0) + Math.abs(levelIdx(ex.level) - target) * 0.5;
  const takeFrom = (cid, want) => {
    const done = new Set(progress.state.grammar[cid]?.done || []);
    const pool = shuffle((BY_CONCEPT[cid] || []).filter((ex) => !used.has(ex.id)));
    // stable sort after the shuffle: ties keep their shuffled order
    const scored = pool.map((ex, i) => ({ ex, s: rank(ex, done), i })).sort((a, b) => a.s - b.s || a.i - b.i);
    for (const { ex } of scored) {
      if (want <= 0) break;
      used.add(ex.id); picked.push({ ...ex, fromConcept: cid === concept ? null : cid }); want--;
    }
    return want;
  };

  let want = takeFrom(concept, n - picked.length);
  let toppedUp = null;
  if (want > 0) {
    const ci = Math.max(0, CONCEPT_ORDER.indexOf(concept));
    for (let step = 1; step < CONCEPT_ORDER.length && want > 0; step++) {
      const alt = CONCEPT_ORDER[(ci + step) % CONCEPT_ORDER.length];
      const before = want;
      want = takeFrom(alt, want);
      if (want < before) toppedUp = toppedUp || alt;
    }
  }

  const questions = picked.map((ex) => ({
    ...ex,
    prompt: ex.prompt || 'Which sentence is correct?',
    // dialect nicety: flag items where the "error" is actually valid local usage
    localValid: !!(dialect && ex.validIn && ex.validIn.includes(dialect)),
  }));
  let served = 0;
  for (const q of questions) if (!q.review) served = Math.max(served, levelIdx(q.level));
  return {
    concept, conceptName: conceptName(concept), level, servedLevel: LEVELS[served],
    toppedUp, toppedUpName: toppedUp ? conceptName(toppedUp) : null,
    reviewCount: questions.filter((q) => q.review).length,
    hint: conceptHint(concept), questions,
  };
}
