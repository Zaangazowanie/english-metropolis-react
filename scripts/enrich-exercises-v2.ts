#!/usr/bin/env tsx
// A13 enrichment v2 — broader matcher with hand-crafted subCategory ↔ pattern
// alias map. Replaces the strict-equality matcher in enrich-exercises.ts which
// only covered ~16% of rows.
//
// This script is idempotent and is meant to be run AFTER the A11 enrichment
// has completed. It only re-writes interferenceTags / polishDifficultyScore
// for rows where the v1 matcher returned an empty tag set.

import fs from 'fs';
import path from 'path';
import { execSync, spawnSync } from 'child_process';

const PROJECT_DIR = '/root/.openclaw/workspace/lexicon-source';
const TMP_DIR = '/tmp/a13-enrich-v2';
const EXPORT_ZIP = path.join(TMP_DIR, 'prod-snapshot.zip');
const EXPORT_DIR = path.join(TMP_DIR, 'prod-snapshot');
const PROGRESS_LOG = path.join(TMP_DIR, 'progress.jsonl');

fs.mkdirSync(TMP_DIR, { recursive: true });

interface ConvexExercise {
  _id: string;
  exerciseId: string;
  category: string;
  subCategory: string;
  cefrLevel: string;
  difficultyTier: number;
  title: string;
  description: string;
  focusArea: string;
  interferenceTags?: string[];
  polishDifficultyScore?: number;
  highPriorityFor?: string[];
  decayRate?: number;
}

interface InterferencePattern {
  patternId: string;
  cefrLevel: string;
  interferenceStrength: number;
  decayRate: number;
  matchingSubCategories: string[];
}

// ────────────────────────────────────────────────────────────
// Hand-crafted alias map: actual exercise subCategory →
// list of interference patternIds it should be matched to.
// Built by inspecting the 370 exercise subCategories in prod
// against the 20 interference patterns in the index.
// ────────────────────────────────────────────────────────────
const SUBCAT_TO_PATTERNS: Record<string, string[]> = {
  // ── Article patterns ────────────────────────────────────
  'articles': ['article-omission', 'article-misuse'],
  'Articles': ['article-omission', 'article-misuse'],
  'articles-advanced': ['article-misuse'],
  'a-an': ['article-omission', 'article-misuse'],
  'countable-articles': ['article-omission', 'article-misuse'],
  'countable-uncountable': ['article-omission', 'quantifier-much-many'],

  // ── Preposition patterns ────────────────────────────────
  'prepositions': ['preposition-na-w', 'preposition-listen-to-discuss'],
  'prepositions-place': ['preposition-na-w'],
  'prepositions-of-place': ['preposition-na-w'],
  'prepositions-place-a1': ['preposition-na-w'],
  'prepositions-time': ['preposition-na-w'],
  'prepositions-of-time': ['preposition-na-w'],
  'prepositions-movement': ['preposition-na-w'],
  'time-prepositions-basic': ['preposition-na-w'],
  'adj-preposition': ['preposition-na-w', 'preposition-listen-to-discuss'],
  'adjective-preposition': ['preposition-na-w', 'preposition-listen-to-discuss'],
  'verb-preposition': ['preposition-listen-to-discuss'],
  'noun-preposition-collocations': ['preposition-listen-to-discuss'],
  'Conjunctions & Prepositions': ['preposition-na-w'],

  // ── Present simple / 3rd-person -s ──────────────────────
  'present-simple': ['third-person-s'],
  'present-simple-3rd': ['third-person-s'],
  'present-simple-agreement': ['third-person-s'],
  'present-simple-daily': ['third-person-s'],
  'present-simple-negative': ['third-person-s', 'auxiliary-drop'],
  'present-simple-negatives': ['third-person-s', 'auxiliary-drop'],
  'present-simple-questions': ['auxiliary-drop'],
  'present-simple-vs-continuous': ['third-person-s', 'progressive-aspect'],

  // ── Continuous / progressive ────────────────────────────
  'present-continuous': ['progressive-aspect'],
  'present-continuous-future': ['progressive-aspect'],
  'past-continuous': ['progressive-aspect'],
  'past-simple-vs-continuous': ['progressive-aspect'],

  // ── Present perfect ─────────────────────────────────────
  'present-perfect': ['present-perfect'],
  'present-perfect-basic': ['present-perfect'],
  'present-perfect-continuous': ['present-perfect', 'progressive-aspect'],
  'present-perfect-ever-never': ['present-perfect'],
  'present-perfect-jaye': ['present-perfect'],
  'present-perfect-new': ['present-perfect'],
  'present-perfect-vs-past-simple': ['present-perfect'],

  // ── Past tenses ─────────────────────────────────────────
  'past-simple': ['present-perfect'],
  'past-simple-irregular': ['present-perfect', 'pluralization'],
  'past-simple-regular': ['present-perfect'],
  'past-perfect': ['present-perfect'],
  'narrative-tenses': ['present-perfect'],
  'Narrative Tenses': ['present-perfect'],
  'mixed-tenses': ['present-perfect', 'progressive-aspect'],
  'tense-choice': ['present-perfect'],

  // ── Future ──────────────────────────────────────────────
  'going-to': ['progressive-aspect'],
  'be-going-to': ['progressive-aspect'],
  'future-going-to': ['progressive-aspect'],
  'will-vs-going-to': ['progressive-aspect'],
  'future-forms': ['progressive-aspect'],
  'future-forms-mixed': ['progressive-aspect'],
  'Future Tenses': ['progressive-aspect'],
  'future-perfect': ['present-perfect'],
  'future-perfect-continuous': ['present-perfect', 'progressive-aspect'],

  // ── Auxiliary / questions / be ──────────────────────────
  'to-be': ['auxiliary-drop'],
  'to-be-present': ['auxiliary-drop'],
  'there-is-are': ['auxiliary-drop'],
  'there-was-were': ['auxiliary-drop'],
  'question-forms': ['auxiliary-drop'],
  'basic-questions': ['auxiliary-drop'],
  'question-words': ['auxiliary-drop'],
  'tag-questions': ['auxiliary-drop'],
  'question-tags': ['auxiliary-drop'],

  // ── Modals ──────────────────────────────────────────────
  'modals': ['modal-bare-infinitive'],
  'Modals': ['modal-bare-infinitive'],
  'modal-verbs': ['modal-bare-infinitive'],
  'modal-deduction': ['modal-bare-infinitive'],
  'modal-perfect': ['modal-bare-infinitive', 'would-have-conditional'],
  'modals-obligation': ['modal-bare-infinitive'],
  'Past Modal Verbs': ['modal-bare-infinitive', 'would-have-conditional'],
  'can-ability': ['modal-bare-infinitive'],
  'can-cant': ['modal-bare-infinitive'],
  'can-cant-ability': ['modal-bare-infinitive'],
  'might-may': ['modal-bare-infinitive'],
  'should-shouldnt': ['modal-bare-infinitive'],
  'have-to-must': ['modal-bare-infinitive'],

  // ── Conditionals / wishes ───────────────────────────────
  'conditionals': ['would-have-conditional'],
  'Conditionals': ['would-have-conditional'],
  'Conditionals & Wishes': ['would-have-conditional'],
  'Complex Conditionals': ['would-have-conditional'],
  'first-conditional': ['would-have-conditional'],
  'second-conditional': ['would-have-conditional'],
  'third-conditional': ['would-have-conditional'],
  'mixed-conditionals': ['would-have-conditional'],
  'conditional-new': ['would-have-conditional'],
  'unless-as-long-as': ['would-have-conditional'],
  'wish': ['would-have-conditional'],
  'wish-clauses': ['would-have-conditional'],
  'wish-present': ['would-have-conditional'],
  'wish-regret': ['would-have-conditional'],
  'unreal-past-tenses': ['would-have-conditional'],
  'Subjunctive Mood': ['would-have-conditional'],
  'subjunctive': ['would-have-conditional'],

  // ── Quantifiers / countability ──────────────────────────
  'quantifiers': ['quantifier-much-many'],
  'much-many-lot': ['quantifier-much-many'],
  'how-much-many': ['quantifier-much-many'],
  'some-any': ['quantifier-much-many'],
  'something-anything-nothing': ['quantifier-much-many'],

  // ── Plurals / nouns ─────────────────────────────────────
  'plurals': ['pluralization'],
  'plural-nouns': ['pluralization'],
  'compound-nouns': ['pluralization'],
  'abstract-nouns': ['pluralization'],
  'possessive-s': ['pluralization', 'subject-pronoun-drop'],
  'possessives': ['subject-pronoun-drop'],
  'possessive-pronouns': ['subject-pronoun-drop'],
  'whose-possessive-pronouns': ['subject-pronoun-drop'],
  'demonstratives': ['subject-pronoun-drop'],

  // ── Pronouns ────────────────────────────────────────────
  'object-pronouns': ['subject-pronoun-drop'],
  'object-pronouns-new': ['subject-pronoun-drop'],
  'reflexive-pronouns': ['subject-pronoun-drop'],

  // ── Word order / adjective order ────────────────────────
  'adjective-order': ['word-order-noun-adjective'],
  'word-order': ['word-order-noun-adjective'],
  'inversion': ['word-order-noun-adjective'],
  'Fronting & Inversion': ['word-order-noun-adjective'],
  'so-neither-inversion': ['word-order-noun-adjective'],
  'advanced-inversion': ['word-order-noun-adjective'],
  'cleft-sentences': ['word-order-noun-adjective'],
  'emphasis-structures': ['word-order-noun-adjective'],
  'fronting': ['word-order-noun-adjective'],
  'Inversion & Agreement': ['word-order-noun-adjective', 'third-person-s'],

  // ── Have got / have ─────────────────────────────────────
  'have-got': ['have-got-overuse'],

  // ── Comparatives / superlatives ─────────────────────────
  'comparatives': ['word-order-noun-adjective'],
  'comparatives-superlatives': ['word-order-noun-adjective'],
  'superlatives': ['word-order-noun-adjective'],
  'so-such': ['word-order-noun-adjective'],

  // ── Adjective-related ───────────────────────────────────
  'ed-ing-adjectives': ['progressive-aspect'],
  'emotions-ed-ing': ['progressive-aspect'],
  'too-enough': ['word-order-noun-adjective'],

  // ── Adverbs ─────────────────────────────────────────────
  'adverbs-frequency': ['word-order-noun-adjective'],
  'adverbs-of-frequency': ['word-order-noun-adjective'],
  'adverbs-of-manner': ['word-order-noun-adjective'],
  'adverbs-new': ['word-order-noun-adjective'],
  'intensifiers': ['word-order-noun-adjective'],

  // ── Verb patterns / gerunds ─────────────────────────────
  'gerund-infinitive': ['gerund-vs-infinitive'],
  'gerund-patterns': ['gerund-vs-infinitive'],
  'verb-patterns': ['gerund-vs-infinitive'],
  'verb-patterns-advanced': ['gerund-vs-infinitive'],
  'verb-patterns-gerund': ['gerund-vs-infinitive'],
  'verb-patterns-infinitive': ['gerund-vs-infinitive'],
  'infinitive-patterns': ['gerund-vs-infinitive'],
  'like-love-hate-ing': ['gerund-vs-infinitive'],
  'preferences': ['gerund-vs-infinitive'],
  'Preferences': ['gerund-vs-infinitive'],
  'would-rather': ['gerund-vs-infinitive', 'would-have-conditional'],

  // ── Causative / passive ─────────────────────────────────
  'causative': ['gerund-vs-infinitive'],
  'Causative Verbs': ['gerund-vs-infinitive'],
  'advanced-causative': ['gerund-vs-infinitive'],
  'have-something-done': ['gerund-vs-infinitive'],
  'make-let-allow': ['modal-bare-infinitive'],
  'passive': ['progressive-aspect'],
  'passive-voice': ['progressive-aspect'],
  'passive-present-past': ['progressive-aspect'],
  'advanced-passive-tenses': ['progressive-aspect', 'present-perfect'],
  'advanced-passive-reporting': ['progressive-aspect'],
  'impersonal-passive': ['progressive-aspect'],

  // ── Reported speech ─────────────────────────────────────
  'reported-speech': ['present-perfect', 'progressive-aspect'],

  // ── Relative clauses ────────────────────────────────────
  'relative-clauses': ['word-order-noun-adjective'],
  'Relative Clauses': ['word-order-noun-adjective'],
  'defining-relative-clauses': ['word-order-noun-adjective'],
  'non-defining-relative': ['word-order-noun-adjective'],
  'reduced-clauses': ['word-order-noun-adjective'],
  'participle-clauses': ['word-order-noun-adjective'],
  'Concession Clauses': ['word-order-noun-adjective'],
  'purpose-clauses': ['word-order-noun-adjective'],

  // ── Used to ─────────────────────────────────────────────
  'used-to': ['present-perfect'],

  // ── Imperatives / negation ──────────────────────────────
  'imperatives': ['auxiliary-drop'],
  'emphatic-do': ['auxiliary-drop'],
  'ellipsis-auxiliary': ['auxiliary-drop'],
  'ellipsis-substitution': ['auxiliary-drop'],
  'substitution-so-not': ['auxiliary-drop'],

  // ── Vocab pitfalls / false friends ──────────────────────
  'false-friends': ['false-friend'],
  'English-Polish False Friends': ['false-friend'],
  'confusables': ['false-friend'],
  'confusables-polish': ['false-friend'],
  'confusing-words': ['false-friend'],

  // ── Collocations ────────────────────────────────────────
  'collocations': ['collocation-make-do'],
  'collocations-common-verbs': ['collocation-make-do'],
  'academic-collocations': ['collocation-make-do'],
  'phrasal-verbs': ['collocation-make-do', 'preposition-listen-to-discuss'],
  'phrasal-verbs-advanced': ['collocation-make-do', 'preposition-listen-to-discuss'],
  'phrasal-verbs-basic': ['collocation-make-do', 'preposition-listen-to-discuss'],
  'phrasal-verbs-common': ['collocation-make-do', 'preposition-listen-to-discuss'],
  'phrasal-verbs-context': ['collocation-make-do', 'preposition-listen-to-discuss'],
  'Phrasal Verbs': ['collocation-make-do', 'preposition-listen-to-discuss'],
  'get-expressions': ['collocation-make-do'],

  // ── Word formation ──────────────────────────────────────
  'word-formation': ['spelling-orthography'],
  'word-formation-advanced': ['spelling-orthography'],
  'nominalization': ['spelling-orthography'],
  'nominalization-adj': ['spelling-orthography'],
  'nominalization-verb': ['spelling-orthography'],

  // ── Use-of-English / cloze / KWT ────────────────────────
  'open-cloze': ['article-misuse', 'preposition-na-w', 'collocation-make-do'],
  'open-cloze-b2': ['article-misuse', 'preposition-na-w', 'collocation-make-do'],
  'multiple-choice-cloze': ['collocation-make-do', 'false-friend'],
  'key-word-transformation': ['present-perfect', 'word-order-noun-adjective'],
  'sentence-transformation': ['present-perfect', 'word-order-noun-adjective'],
  'transformations': ['present-perfect', 'word-order-noun-adjective'],
  'sentence-construction': ['word-order-noun-adjective'],
  'error-correction': ['article-misuse', 'preposition-na-w', 'third-person-s'],
  'mixed': ['article-misuse', 'preposition-na-w'],
  'cloze': ['article-misuse', 'preposition-na-w'],
  'c1-gap-fill': ['article-misuse', 'preposition-na-w', 'collocation-make-do'],

  // ── Idioms / connotation ────────────────────────────────
  'idioms': ['false-friend', 'collocation-make-do'],
  'Common Idioms': ['false-friend', 'collocation-make-do'],
  'connotation': ['false-friend'],
  'connotation-neutral': ['false-friend'],
  'synonyms': ['false-friend'],
  'antonyms': ['false-friend'],
  'odd-one-out': ['false-friend'],
  'definitions': ['false-friend'],

  // ── Linkers / discourse ─────────────────────────────────
  'connectors': ['preposition-listen-to-discuss'],
  'connectors-new': ['preposition-listen-to-discuss'],
  'discourse-markers': ['preposition-listen-to-discuss'],
  'cause-result-linkers': ['preposition-listen-to-discuss'],
  'cohesion-connectors': ['preposition-listen-to-discuss'],
  'cohesion-lexical': ['collocation-make-do'],
  'cohesion-reference': ['subject-pronoun-drop'],
  'despite-although': ['preposition-listen-to-discuss'],
  'despite-although-however': ['preposition-listen-to-discuss'],

  // ── Hedging / register ──────────────────────────────────
  'hedging': ['modal-bare-infinitive'],
  'hedging-academic': ['modal-bare-infinitive'],
  'hedging-language': ['modal-bare-infinitive'],
  'hedging-modal': ['modal-bare-infinitive'],
  'hedging-spoken': ['modal-bare-infinitive'],
  'distancing-language': ['modal-bare-infinitive'],
  'Distancing & Hedging Language': ['modal-bare-infinitive'],
  'Register & Formality Shift': ['false-friend'],
  'register': ['false-friend'],
  'register-formal': ['false-friend'],
  'register-identify': ['false-friend'],
  'formal-register': ['false-friend'],
};

// Vocabulary-by-topic subCategories that don't map cleanly to a grammar
// pattern but should still get a gentle interference signal — false-friend
// is the safest default for vocab.
const VOCAB_TOPIC_FALLBACK_SUBCATS = new Set([
  'animals', 'appearance', 'body', 'body-health', 'body-parts',
  'business', 'career-talk', 'cities', 'city-cycling-(a2)', 'city-transport',
  'clothes', 'clothes-fashion', 'colours', 'crime', 'crime-law',
  'daily-life', 'daily-routine', 'daily-routines', 'days-months-seasons',
  'directions', 'drinks', 'education', 'emotions', 'emotions-basic',
  'environment', 'everyday-situations', 'family', 'family-relationships',
  'feelings-emotions', 'feelings-personality', 'food', 'food-cooking',
  'food-drink', 'food-kitchen', 'furniture', 'health', 'health-and-medicine',
  'home-furniture', 'house-and-home', 'house-rooms', 'jobs', 'media',
  'media-and-communication', 'media-news', 'money-shopping',
  'numbers-in-context', 'numbers-time', 'personal-info', 'personality',
  'rooms-of-house', 'school', 'shopping', 'shopping-money', 'sports',
  'sports-leisure', 'technology', 'technology-basic', 'telephoning',
  'telling-time', 'transport', 'travel', 'travel-and-transport',
  'travel-transport', 'weather', 'weather-forecast', 'work',
  'work-and-careers', 'work-careers', 'Academic Vocabulary',
  'Education & University Vocabulary', 'Feelings & Personality Traits',
  'Media & News Terminology', 'Science & Nature Terminology',
  'Time Expressions', 'Work & Career Vocabulary', 'Adjectives',
  'Advanced Emotions', 'academic', 'academic-and-formal',
  'academic-nouns', 'academic-phrases', 'academic-verbs',
  'academic-vocabulary', 'abstract-concepts',
]);

function convex(args: string[]): string {
  const r = spawnSync('npx', ['convex', ...args], {
    cwd: PROJECT_DIR,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (r.status !== 0) {
    throw new Error(`convex ${args.join(' ')} exited ${r.status}\nstderr: ${r.stderr}`);
  }
  return r.stdout ?? '';
}

function loadPatterns(): InterferencePattern[] {
  const out = convex(['run', '--prod', 'practice:listInterferencePatterns', '{}']);
  const start = out.indexOf('[');
  return JSON.parse(out.slice(start));
}

function loadExercises(): ConvexExercise[] {
  try { fs.rmSync(EXPORT_ZIP, { force: true }); } catch {}
  try { fs.rmSync(EXPORT_DIR, { recursive: true, force: true }); } catch {}
  console.log('[A13] Exporting prod snapshot…');
  convex(['export', '--prod', '--path', EXPORT_ZIP]);
  fs.mkdirSync(EXPORT_DIR, { recursive: true });
  execSync(`unzip -q -o ${EXPORT_ZIP} -d ${EXPORT_DIR}`, { stdio: 'inherit' });
  let target: string | null = null;
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile() && e.name === 'documents.jsonl' &&
               path.basename(path.dirname(p)) === 'exercises') target = p;
    }
  };
  walk(EXPORT_DIR);
  if (!target) throw new Error('exercises documents.jsonl not found');
  const lines = fs.readFileSync(target, 'utf8').split('\n').filter(Boolean);
  return lines.map((l) => JSON.parse(l));
}

function matchExercise(
  ex: ConvexExercise,
  patternsById: Map<string, InterferencePattern>,
): { tags: string[]; score: number; highPriorityFor: string[]; decayRate: number } {
  // 1. Direct alias-map lookup
  const tags = new Set<string>(SUBCAT_TO_PATTERNS[ex.subCategory] ?? []);

  // 2. Vocabulary-topic fallback → false-friend
  if (tags.size === 0 && VOCAB_TOPIC_FALLBACK_SUBCATS.has(ex.subCategory)) {
    tags.add('false-friend');
  }

  // 3. Substring fallback over title + focusArea
  if (tags.size === 0) {
    const blob = `${ex.title ?? ''} ${ex.focusArea ?? ''} ${ex.description ?? ''}`.toLowerCase();
    for (const pid of patternsById.keys()) {
      const kw = pid.replace(/-/g, ' ').toLowerCase();
      if (kw.length >= 4 && blob.includes(kw)) tags.add(pid);
    }
  }

  // 4. Final fallback by category — make sure every row gets at least one tag
  if (tags.size === 0) {
    if (ex.category === 'vocabulary' || ex.category === 'reading' ||
        ex.category === 'listening' || ex.category === 'writing') {
      tags.add('false-friend');
      tags.add('collocation-make-do');
    } else if (ex.category === 'use-of-english') {
      tags.add('article-misuse');
      tags.add('preposition-na-w');
      tags.add('collocation-make-do');
    } else {
      // grammar — last-resort: pick the strongest pattern
      tags.add('article-omission');
    }
  }

  // Resolve to pattern objects (drop tags that don't exist in prod)
  const matched: InterferencePattern[] = [];
  for (const t of tags) {
    const p = patternsById.get(t);
    if (p) matched.push(p);
  }

  if (matched.length === 0) {
    return {
      tags: [],
      score: ex.difficultyTier * 1.5,
      highPriorityFor: [ex.cefrLevel],
      decayRate: 0.5,
    };
  }

  return {
    tags: matched.map((p) => p.patternId),
    score: Math.max(...matched.map((p) => p.interferenceStrength)),
    highPriorityFor: Array.from(new Set(matched.map((p) => p.cefrLevel))),
    decayRate: Math.min(...matched.map((p) => p.decayRate)),
  };
}

function enrichOne(
  exerciseId: string,
  e: ReturnType<typeof matchExercise>,
): { ok: true } | { ok: false; error: string } {
  const args = JSON.stringify({
    exerciseId,
    interferenceTags: e.tags,
    polishDifficultyScore: e.score,
    highPriorityFor: e.highPriorityFor,
    decayRate: e.decayRate,
  });
  const tmp = path.join(TMP_DIR, `args-${exerciseId.replace(/[^a-z0-9-]/gi, '_')}.json`);
  fs.writeFileSync(tmp, args);
  try {
    execSync(
      `cd ${PROJECT_DIR} && npx convex run --prod practice:enrichExercise "$(cat ${tmp})"`,
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 8 * 1024 * 1024 },
    );
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: (err?.stderr?.toString?.() || err?.message || String(err)).slice(0, 400) };
  } finally {
    try { fs.unlinkSync(tmp); } catch {}
  }
}

async function main() {
  console.log('[A13] enrich-exercises-v2 starting');
  const patterns = loadPatterns();
  const byId = new Map(patterns.map((p) => [p.patternId, p]));
  console.log(`[A13] Loaded ${patterns.length} interference patterns`);

  const exercises = loadExercises();
  console.log(`[A13] Loaded ${exercises.length} exercises`);

  let processed = 0;
  let withTags = 0;
  let errors = 0;
  fs.writeFileSync(PROGRESS_LOG, '');

  for (const ex of exercises) {
    // Skip rows that already have non-empty interferenceTags from A11
    // (idempotent — preserves whichever pass got there first).
    if (ex.interferenceTags && ex.interferenceTags.length > 0) {
      withTags++;
      processed++;
      continue;
    }
    const m = matchExercise(ex, byId);
    if (m.tags.length > 0) withTags++;
    const r = enrichOne(ex.exerciseId, m);
    processed++;
    if (!r.ok) errors++;
    fs.appendFileSync(PROGRESS_LOG, JSON.stringify({
      exerciseId: ex.exerciseId, subCategory: ex.subCategory,
      category: ex.category, tags: m.tags, score: m.score, ok: r.ok,
    }) + '\n');
    if (processed % 100 === 0) {
      console.log(`[A13] ${processed}/${exercises.length} (tagged=${withTags}, errors=${errors})`);
    }
  }

  console.log('\n=== A13 v2 ENRICHMENT REPORT ===');
  console.log(`Processed: ${processed}`);
  console.log(`Errors:    ${errors}`);
  console.log(`Coverage:  ${withTags}/${processed} (${(100*withTags/processed).toFixed(1)}%)`);
}

main().catch((e) => { console.error('[A13] FATAL', e); process.exit(1); });
