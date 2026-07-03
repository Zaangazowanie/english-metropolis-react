// Grammar drills mined from Mike & Kelly's ESL research corpus (English Metro).
// Each teaching NPC runs a short multiple-choice drill on one grammar concept;
// concepts spread across the city and difficulty rises along each metro line, so
// touring the map is a full grammar course. Mastery persists in localStorage.
// NOTE: dir is named gamedata (not data) — the prod deployer's rsync excludes
// bare "data" path components for student-data safety, which would strip it.
import BANK from './gamedata/grammar_bank.js';

// concepts a learner meets first → last (rough CEFR progression)
export const CONCEPT_ORDER = [
  'articles', 'subject_verb', 'plurals', 'prepositions', 'questions_negation',
  'pronouns', 'verb_tense', 'word_order', 'modals', 'comparatives',
  'gerund_infinitive', 'word_choice', 'collocation', 'conditionals',
];
const CONCEPTS = Object.fromEntries(BANK.concepts.map((c) => [c.id, c]));
const BY_CONCEPT = {};
for (const ex of BANK.exercises) (BY_CONCEPT[ex.concept] ??= []).push(ex);

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'];
const levelIdx = (l) => Math.max(0, LEVELS.indexOf(l));

// Assign a teaching concept + target level to an NPC from its position in the
// world: stopIndex 0..N along a line, npcIdx 0/1. Concepts rotate so every few
// stops covers a new one; level climbs with distance from the hub. Each
// completed round (lap) of the district shifts the concept and raises the
// level, so teachers always have something new after a full circuit.
export function assignGrammar(stopIndex, npcIdx, lineKey, laps = 0) {
  const lineOffset = { isles: 0, liberty: 3, sunward: 6 }[lineKey] ?? 0;
  // stride 5 is coprime with the 14 concepts → every lap lands on a fresh one
  const concept = CONCEPT_ORDER[(stopIndex * 2 + npcIdx + lineOffset + laps * 5) % CONCEPT_ORDER.length];
  const level = LEVELS[Math.min(LEVELS.length - 1, Math.floor(stopIndex / 3) + laps)];
  return { concept, level, conceptName: CONCEPTS[concept]?.name || concept };
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

// ---- mastery ----
function loadMastery() { try { return JSON.parse(localStorage.getItem('em_grammar') || '{}'); } catch { return {}; } }
function saveMastery(m) { localStorage.setItem('em_grammar', JSON.stringify(m)); }

export function masteryFor(concept) {
  const m = loadMastery()[concept] || { seen: 0, correct: 0 };
  return { ...m, pct: m.seen ? Math.round((m.correct / m.seen) * 100) : 0 };
}
export function recordAnswer(concept, exId, wasCorrect) {
  const all = loadMastery();
  const c = all[concept] || (all[concept] = { seen: 0, correct: 0, done: [] });
  c.seen++;
  if (wasCorrect) { c.correct++; if (!c.done.includes(exId)) c.done.push(exId); }
  saveMastery(all);
}
export function overallMastery() {
  const m = loadMastery();
  return CONCEPT_ORDER.map((id) => {
    const c = m[id] || { seen: 0, correct: 0, done: [] };
    const total = (BY_CONCEPT[id] || []).length;
    return { id, name: conceptName(id), correctUnique: (c.done || []).length, total, pct: c.seen ? Math.round(c.correct / c.seen * 100) : 0 };
  });
}

// ---- session builder: N questions of a concept near a target level ----
export function buildSession(concept, level, n = 5, dialect = null) {
  let pool = (BY_CONCEPT[concept] || []).slice();
  if (!pool.length) {                        // fallback: adjacent concept
    const alt = CONCEPT_ORDER.find((c) => (BY_CONCEPT[c] || []).length >= n) || CONCEPT_ORDER[0];
    pool = (BY_CONCEPT[alt] || []).slice();
    concept = alt;
  }
  const target = levelIdx(level);
  // prefer unseen, then closest level; light deterministic-ish shuffle via score
  const done = new Set((loadMastery()[concept]?.done) || []);
  pool.sort((a, b) => {
    const sa = (done.has(a.id) ? 2 : 0) + Math.abs(levelIdx(a.level) - target) + Math.random();
    const sb = (done.has(b.id) ? 2 : 0) + Math.abs(levelIdx(b.level) - target) + Math.random();
    return sa - sb;
  });
  const picked = pool.slice(0, n).map((ex) => ({
    ...ex,
    // dialect nicety: flag items where the "error" is actually valid local usage
    localValid: dialect && ex.validIn && ex.validIn.includes(dialect),
  }));
  return { concept, conceptName: conceptName(concept), level, questions: picked };
}
