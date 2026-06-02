#!/usr/bin/env tsx
/**
 * cluster-exercises-into-groups.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Sprint-2 Agent A — one-time auto-tagger that clusters all 1409 exercise
 * rows into ~40-60 topic groupings per CEFR level (test-english.com style).
 *
 * Algorithm
 * ─────────
 * 1. Read all 1409 exercises from the canonical JSON
 *    (/root/.openclaw/workspace/english-metropolis-exercises-all.json).
 * 2. Cluster by the natural (cefrLevel, category, subCategory) tuple —
 *    each unique tuple becomes one exerciseGroup row.
 * 3. Generate `topicEn` from the cluster's most-common `focusArea`
 *    (fallback: humanised subCategory). Generate `topicPl` via the
 *    EN→PL dictionary below; falls back to a Polish humanisation
 *    of the subCategory when no dictionary hit.
 * 4. Compute `compatibleShells` per exercise from the question[].type
 *    distribution (see SHELLS_BY_QUESTION_TYPE).
 * 5. Aggregate per-group `compatibleShells` as the union across members.
 * 6. Push to Convex via the bulkSetGroupAndCompatibility mutation in
 *    safe-sized batches (one mutation call per CEFR-level chunk).
 *
 * Dry run
 * ───────
 *   npx tsx scripts/cluster-exercises-into-groups.ts --dry-run
 *
 * Live run (production deployment wooden-manatee-881)
 * ──────────────────────────────────────────────────
 *   npx tsx scripts/cluster-exercises-into-groups.ts
 *
 * Mutation calls go through the same `npx convex run --prod` spawnSync
 * pattern that import-exercises-v2.ts uses, so we don't have to maintain
 * a separate Convex client wiring.
 */

import fs from 'fs';
import { spawnSync } from 'child_process';

// ─────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────
const SOURCE = '/root/.openclaw/workspace/english-metropolis-exercises-all.json';
const PROJECT_DIR = '/root/.openclaw/workspace/lexicon-source';
const DRY_RUN = process.argv.includes('--dry-run');

// Convex mutation arg-size guardrail. The whole payload is passed as a
// SINGLE shell argv to `npx convex run`, which then funnels through `npx`
// and the OS exec(). Linux exec adds env vars to the same byte budget,
// so even though ARG_MAX is ~2MB, anything past ~120KB intermittently
// trips E2BIG. With each group serialising at ~1.4KB and each exercise
// at ~120 bytes, 25 groups + 60 exercises ≈ 35KB + 7KB ≈ well under.
const GROUPS_PER_BATCH = 25;
const EXERCISES_PER_BATCH = 60;

// ─────────────────────────────────────────────────────────────
// Shape of the source rows (matches english-metropolis-exercises-all.json)
// ─────────────────────────────────────────────────────────────
interface RawQuestion {
  id: string;
  type: string;
  prompt: string;
  answer: string;
  options?: string[];
  instructionEN: string;
  instructionPL: string;
}
interface RawExerciseSet {
  id: string;
  category: string;
  subCategory: string;
  cefrLevel: string;
  difficultyTier: number;
  title: string;
  description: string;
  focusArea: string;
  questions: RawQuestion[];
}

// ─────────────────────────────────────────────────────────────
// Question-type → ShellKey mapping
//
// fill-blank is the most flexible — it works in any shell that can
// present a single answer slot with a known string. multiple-choice
// is similarly broad but cannot be played in shells that REQUIRE the
// student to type a free-text answer (so we drop typingtest/spellingbee/
// anagram/wordformation/sentencetransform from the multiple-choice set).
// ─────────────────────────────────────────────────────────────
const SHELLS_BY_QUESTION_TYPE: Record<string, string[]> = {
  'fill-blank': [
    'gapfill',
    'opencloze',
    'multiplechoice',
    'dragdrop',
    'sentencecorrection',
    'typingtest',
    'wordformation',
    'sentencetransform',
    'unjumble',
    'spellingbee',
    'hangman',
    'anagram',
    'crossword',
    'wordsearch',
  ],
  'multiple-choice': [
    'multiplechoice',
    'truefalse',
    'openthebox',
    'spinthewheel',
    'whackamole',
    'balloonpop',
    'snake',
    'mazechase',
    'battleship',
    'quizshow',
    'concentration',
    'findthematch',
    'randomcards',
    'randomwheel',
    'airplane',
    'flyingfruit',
    'picturequiz',
    'gapfill',
    'flashcards',
    'matching',
    'groupsort',
  ],
};

// ─────────────────────────────────────────────────────────────
// EN → PL dictionary for common grammar / vocabulary terms.
//
// Used to translate the most-common focusArea string into Polish
// when no exact-match Polish topic is available. Order-sensitive:
// longer phrases must come before substrings (so "present perfect"
// is matched before "present"). All patterns use `\b` word boundaries
// so we never substring-match inside another word ("for" must not
// match inside "forms", "or" must not match inside "words").
// ─────────────────────────────────────────────────────────────
const EN_PL_DICT: Array<[RegExp, string]> = [
  // Tenses (multi-word first)
  [/\bpresent perfect continuous\b/gi, 'Present Perfect Continuous'],
  [/\bpast perfect continuous\b/gi, 'Past Perfect Continuous'],
  [/\bfuture perfect continuous\b/gi, 'Future Perfect Continuous'],
  [/\bpresent perfect\b/gi, 'Present Perfect'],
  [/\bpast perfect\b/gi, 'Past Perfect'],
  [/\bfuture perfect\b/gi, 'Future Perfect'],
  [/\bpresent continuous\b/gi, 'Present Continuous'],
  [/\bpast continuous\b/gi, 'Past Continuous'],
  [/\bfuture continuous\b/gi, 'Future Continuous'],
  [/\bpresent simple\b/gi, 'Present Simple'],
  [/\bpast simple\b/gi, 'Past Simple'],
  [/\bfuture simple\b/gi, 'Future Simple'],

  // Conditionals
  [/\bzero conditional\b/gi, 'Zero Conditional'],
  [/\bfirst conditional\b/gi, 'First Conditional'],
  [/\bsecond conditional\b/gi, 'Second Conditional'],
  [/\bthird conditional\b/gi, 'Third Conditional'],
  [/\bmixed conditional\b/gi, 'Mixed Conditional'],
  [/\bconditionals?\b/gi, 'Tryb warunkowy'],

  // Modals & related (multi-word first)
  [/\bmodals? of (?:speculation|deduction)\b/gi, 'Czasowniki modalne — spekulacja i dedukcja'],
  [/\bmodals? of obligation\b/gi, 'Czasowniki modalne — obowiązek'],
  [/\bmodals? of ability\b/gi, 'Czasowniki modalne — umiejętności'],
  [/\bmodals? of permission\b/gi, 'Czasowniki modalne — pozwolenie'],
  [/\bmodals? of advice\b/gi, 'Czasowniki modalne — rady'],
  [/\bmodal verbs?\b/gi, 'Czasowniki modalne'],
  [/\bmodals\b/gi, 'Czasowniki modalne'],

  // Voice / structure
  [/\bpassive voice\b/gi, 'Strona bierna'],
  [/\bactive voice\b/gi, 'Strona czynna'],
  [/\breported speech\b/gi, 'Mowa zależna'],
  [/\bdirect speech\b/gi, 'Mowa wprost'],
  [/\bcleft sentences?\b/gi, 'Zdania rozszczepione (cleft)'],
  [/\brelative clauses?\b/gi, 'Zdania względne'],
  [/\bsubordinate clauses?\b/gi, 'Zdania podrzędne'],
  [/\bclauses? of contrast\b/gi, 'Zdania okolicznikowe przeciwstawienia'],
  [/\bclauses? of purpose\b/gi, 'Zdania okolicznikowe celu'],
  [/\bclauses? of result\b/gi, 'Zdania okolicznikowe skutku'],
  [/\bclauses? of reason\b/gi, 'Zdania okolicznikowe przyczyny'],
  [/\bclauses? of time\b/gi, 'Zdania okolicznikowe czasu'],
  [/\bwish clauses?\b/gi, 'Zdania z "wish"'],
  [/\binversion\b/gi, 'Inwersja'],

  // Word classes (multi-word pronoun forms first)
  [/\breflexive pronouns?\b/gi, 'Zaimki zwrotne'],
  [/\bpossessive pronouns?\b/gi, 'Zaimki dzierżawcze'],
  [/\brelative pronouns?\b/gi, 'Zaimki względne'],
  [/\bpersonal pronouns?\b/gi, 'Zaimki osobowe'],
  [/\bdemonstrative pronouns?\b/gi, 'Zaimki wskazujące'],
  [/\bindefinite pronouns?\b/gi, 'Zaimki nieokreślone'],
  [/\bgeneric pronouns?\b/gi, 'Zaimki uogólnione'],
  [/\bpronouns?\b/gi, 'Zaimki'],

  [/\bindefinite articles?\b/gi, 'Przedimki nieokreślone (a / an)'],
  [/\bdefinite articles?\b/gi, 'Przedimek określony (the)'],
  [/\bzero article\b/gi, 'Brak przedimka'],
  [/\barticles?\b/gi, 'Przedimki (a / an / the)'],
  [/\bdeterminers?\b/gi, 'Określniki'],
  [/\bquantifiers?\b/gi, 'Kwantyfikatory'],

  [/\bcomparative adjectives?\b/gi, 'Stopień wyższy przymiotników'],
  [/\bsuperlative adjectives?\b/gi, 'Stopień najwyższy przymiotników'],
  [/\bcomparatives?\b/gi, 'Stopień wyższy przymiotników'],
  [/\bsuperlatives?\b/gi, 'Stopień najwyższy przymiotników'],
  [/\badjectives?\b/gi, 'Przymiotniki'],
  [/\badverbs?\b/gi, 'Przysłówki'],

  [/\bcountable nouns?\b/gi, 'Rzeczowniki policzalne'],
  [/\buncountable nouns?\b/gi, 'Rzeczowniki niepoliczalne'],
  [/\bnouns?\b/gi, 'Rzeczowniki'],
  [/\bplurals?\b/gi, 'Liczba mnoga'],
  [/\bpossessives?\b/gi, 'Forma dzierżawcza'],

  [/\bauxiliary verbs?\b/gi, 'Czasowniki posiłkowe'],
  [/\bmain verbs?\b/gi, 'Czasowniki główne'],
  [/\birregular verbs?\b/gi, 'Czasowniki nieregularne'],
  [/\bregular verbs?\b/gi, 'Czasowniki regularne'],
  [/\bphrasal verbs?\b/gi, 'Czasowniki frazowe'],
  [/\bverbs?\b/gi, 'Czasowniki'],
  [/\bgerund\b/gi, 'Rzeczownik odsłowny (gerund)'],
  [/\binfinitives?\b/gi, 'Bezokolicznik'],
  [/\bpast participles?\b/gi, 'Imiesłów bierny (3. forma)'],
  [/\bparticiples?\b/gi, 'Imiesłów'],

  // Prepositions (specific first)
  [/\bprepositions? of place\b/gi, 'Przyimki miejsca'],
  [/\bprepositions? of time\b/gi, 'Przyimki czasu'],
  [/\bprepositions? of movement\b/gi, 'Przyimki ruchu'],
  [/\bprepositions?\b/gi, 'Przyimki'],

  // Vocab buckets
  [/\bfalse friends?\b/gi, 'Fałszywi przyjaciele'],
  [/\bcollocations?\b/gi, 'Kolokacje'],
  [/\bidioms?\b/gi, 'Idiomy'],
  [/\bword formation\b/gi, 'Słowotwórstwo'],
  [/\bsuffixes?\b/gi, 'Przyrostki'],
  [/\bprefixes?\b/gi, 'Przedrostki'],
  [/\bsynonyms?\b/gi, 'Synonimy'],
  [/\bantonyms?\b/gi, 'Antonimy'],
  [/\bvocabulary\b/gi, 'Słownictwo'],

  // Skill areas
  [/\buse of english\b/gi, 'Use of English'],
  [/\breading comprehension\b/gi, 'Rozumienie tekstu'],
  [/\blistening comprehension\b/gi, 'Rozumienie ze słuchu'],
  [/\bwriting\b/gi, 'Pisanie'],
  [/\bspeaking\b/gi, 'Mówienie'],
  [/\bgrammar\b/gi, 'Gramatyka'],

  // Connectives
  [/\bconjunctions?\b/gi, 'Spójniki'],
  [/\blinkers?\b/gi, 'Spójniki / wyrazy łączące'],
  [/\bdiscourse markers?\b/gi, 'Spójniki dyskursywne'],

  // Question forms (specific first)
  [/\bwh[- ]?questions?\b/gi, 'Pytania z zaimkami pytającymi (wh-)'],
  [/\byes\/no questions?\b/gi, 'Pytania ogólne (yes/no)'],
  [/\btag questions?\b/gi, 'Pytania rozłączne (tag questions)'],
  [/\bquestions?\b/gi, 'Pytania'],

  // Sentence-level
  [/\bnegatives?\b/gi, 'Formy przeczące'],
  [/\bcopula\b/gi, 'Łącznik'],
  [/\bagreement\b/gi, 'Zgodność'],
  [/\bword order\b/gi, 'Szyk wyrazów'],
  [/\baspect\b/gi, 'Aspekt czasownikowy'],
  [/\btenses?\b/gi, 'Czasy gramatyczne'],
  [/\bsignal words?\b/gi, 'Wyrazy sygnałowe'],

  // Generic glue words — kept short and word-bounded
  [/\bforms?\b/gi, 'formy'],
  [/\busage\b/gi, 'Użycie'],
  [/\bstructure\b/gi, 'Struktura'],
  [/\bformation\b/gi, 'Tworzenie'],
  [/\bpractice\b/gi, 'Ćwiczenia'],
  [/\bwith\b/gi, 'z'],
  [/\band\b/gi, 'i'],
  [/\bor\b/gi, 'lub'],
  [/\bfor\b/gi, 'do'],
  [/\bof\b/gi, ''],
  [/\bvs\b\.?/gi, 'vs'],
];

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
function humanise(slug: string): string {
  return slug
    .split('-')
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

function translateToPl(text: string): string {
  let out = text;
  for (const [re, pl] of EN_PL_DICT) {
    out = out.replace(re, pl);
  }
  // If translation resulted in something that's still mostly English
  // (no Polish diacritics or known Polish words), prepend a generic
  // Polish framing so the card is at least labelled.
  if (out === text) return out;
  return out;
}

function categoryToPl(cat: string): string {
  switch (cat) {
    case 'grammar':
      return 'Gramatyka';
    case 'vocabulary':
      return 'Słownictwo';
    case 'use-of-english':
      return 'Use of English';
    case 'reading':
      return 'Rozumienie tekstu';
    case 'listening':
      return 'Rozumienie ze słuchu';
    case 'writing':
      return 'Pisanie';
    case 'speaking':
      return 'Mówienie';
    default:
      return humanise(cat);
  }
}

/**
 * Map (category, subCategory) → KB error categories that the group
 * addresses. Mirrors the CATEGORY_TO_SHELLS keys used in
 * src/practice/lib/shell-selector.ts. The frontend uses these to
 * link a group card back to the student's recent error profile.
 */
function inferErrorCategories(
  category: string,
  subCategory: string,
): string[] {
  const sc = subCategory.toLowerCase();
  const out = new Set<string>();
  if (category === 'grammar') {
    if (/(present|past|future)-(simple|continuous|perfect)/.test(sc))
      out.add('grammar-tense');
    if (/(perfect|continuous|aspect)/.test(sc)) out.add('grammar-aspect');
    if (/(article|determiner)/.test(sc)) {
      out.add('grammar-article');
      out.add('grammar-determiner');
    }
    if (/preposition/.test(sc)) out.add('grammar-preposition');
    if (/conditional/.test(sc)) out.add('grammar-conditional');
    if (/passive/.test(sc)) out.add('grammar-passive');
    if (/(modal|wish|deduction|speculation)/.test(sc)) out.add('grammar-modal');
    if (/(clause|relative|subordin|cleft)/.test(sc))
      out.add('grammar-subordination');
    if (/(word-order|inversion|unjumble)/.test(sc))
      out.add('grammar-wordorder');
    if (/(agreement|subject-verb)/.test(sc)) out.add('grammar-agreement');
    if (out.size === 0) out.add('grammar-tense'); // safe default for grammar
  } else if (category === 'vocabulary') {
    if (/collocation/.test(sc)) out.add('collocation');
    if (/idiom/.test(sc)) out.add('idiom');
    if (/phrasal/.test(sc)) out.add('phrasal-verb');
    if (/(false-friend|cognate)/.test(sc)) out.add('vocabulary-precision');
    if (/word-formation|suffix|prefix/.test(sc)) out.add('word-formation');
    if (out.size === 0) out.add('vocabulary');
  } else if (category === 'use-of-english') {
    out.add('vocabulary-precision');
    if (/word-formation/.test(sc)) out.add('word-formation');
  } else if (category === 'reading') {
    out.add('reading');
  } else if (category === 'listening') {
    out.add('listening');
  } else if (category === 'writing') {
    out.add('writing');
  }
  return [...out];
}

/**
 * Build a stable groupId from (cefrLevel, category, subCategory).
 * Lowercased, hyphenated, ASCII-safe.
 */
function buildGroupId(
  cefrLevel: string,
  category: string,
  subCategory: string,
): string {
  return `${category}-${subCategory}-${cefrLevel}`
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Pick the most-common focusArea in a cluster — used as the
 * preferred topicEn. Ties broken by alphabetic order so the result
 * is deterministic across runs.
 */
function topFocusArea(exs: RawExerciseSet[]): string {
  const counts = new Map<string, number>();
  for (const e of exs) counts.set(e.focusArea, (counts.get(e.focusArea) ?? 0) + 1);
  const sorted = [...counts.entries()].sort((a, b) =>
    b[1] !== a[1] ? b[1] - a[1] : a[0].localeCompare(b[0]),
  );
  return sorted[0]?.[0] ?? '';
}

function compatibleShellsForExercise(ex: RawExerciseSet): string[] {
  const set = new Set<string>();
  for (const q of ex.questions) {
    const shells = SHELLS_BY_QUESTION_TYPE[q.type];
    if (shells) for (const s of shells) set.add(s);
  }
  // Universal-fallback: every exercise is at least playable in
  // multiplechoice, since shell-selector lists multiplechoice as
  // the universal-fallback shell at weight 3.
  set.add('multiplechoice');
  return [...set].sort();
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────
async function main() {
  const data: RawExerciseSet[] = JSON.parse(fs.readFileSync(SOURCE, 'utf8'));
  console.log(`Loaded ${data.length} exercises`);

  // Cluster
  const clusters = new Map<string, RawExerciseSet[]>();
  for (const ex of data) {
    const k = `${ex.cefrLevel}|${ex.category}|${ex.subCategory}`;
    if (!clusters.has(k)) clusters.set(k, []);
    clusters.get(k)!.push(ex);
  }
  console.log(`Built ${clusters.size} clusters`);

  // Build group payload
  const groupPayloads: Array<{
    groupId: string;
    topicEn: string;
    topicPl: string;
    cefrLevel: string;
    category: string;
    subCategory?: string;
    description?: string;
    descriptionPl?: string;
    errorCategories: string[];
    exerciseCount?: number;
    compatibleShells?: string[];
  }> = [];
  const exercisePayloads: Array<{
    exerciseId: string;
    groupId: string;
    compatibleShells: string[];
  }> = [];

  for (const [key, exs] of clusters) {
    const [cefrLevel, category, subCategory] = key.split('|');
    const groupId = buildGroupId(cefrLevel, category, subCategory);
    const focus = topFocusArea(exs);
    const topicEn =
      focus && focus !== subCategory
        ? focus
        : humanise(subCategory);
    const topicPl = translateToPl(topicEn);
    const errorCategories = inferErrorCategories(category, subCategory);

    // Per-exercise compat
    const groupShellSet = new Set<string>();
    for (const ex of exs) {
      const shells = compatibleShellsForExercise(ex);
      for (const s of shells) groupShellSet.add(s);
      exercisePayloads.push({
        exerciseId: ex.id,
        groupId,
        compatibleShells: shells,
      });
    }

    const description = `${humanise(subCategory)} — ${categoryToPl(category)} (${cefrLevel}). ${exs.length} ćwiczenia.`;
    const descriptionPl = `${topicPl} — ${categoryToPl(category)}, poziom ${cefrLevel}. ${exs.length} ćwiczeń w zestawie.`;

    groupPayloads.push({
      groupId,
      topicEn,
      topicPl,
      cefrLevel,
      category,
      subCategory,
      description,
      descriptionPl,
      errorCategories,
      exerciseCount: exs.length,
      compatibleShells: [...groupShellSet].sort(),
    });
  }

  // Per-CEFR summary
  const perLevel: Record<string, number> = {};
  for (const g of groupPayloads) {
    perLevel[g.cefrLevel] = (perLevel[g.cefrLevel] ?? 0) + 1;
  }
  console.log('\n=== Group counts per CEFR level ===');
  for (const lvl of ['A1', 'A2', 'B1', 'B2', 'C1']) {
    console.log(`  ${lvl}: ${perLevel[lvl] ?? 0} groups`);
  }

  console.log('\n=== Sample 5 groups per CEFR level ===');
  for (const lvl of ['A1', 'A2', 'B1', 'B2', 'C1']) {
    console.log(`\n[${lvl}]`);
    const sample = groupPayloads.filter((g) => g.cefrLevel === lvl).slice(0, 5);
    for (const g of sample) {
      console.log(`  - ${g.groupId}`);
      console.log(`      EN: ${g.topicEn}`);
      console.log(`      PL: ${g.topicPl}`);
      console.log(`      ${g.exerciseCount} exercises | shells: ${(g.compatibleShells ?? []).length}`);
    }
  }

  if (DRY_RUN) {
    console.log('\n[DRY RUN] No mutation calls issued.');
    return;
  }

  // ── Push to Convex via spawnSync ────────────────────────
  // We chunk by exercises (the larger payload). Groups are sent in the
  // first chunk(s) only — once all groups are upserted, subsequent
  // chunks send just exercise patches. To keep the chunking simple,
  // we send GROUPS_PER_BATCH groups per call until exhausted, then
  // send EXERCISES_PER_BATCH exercises per call.

  console.log('\n=== Pushing to Convex (prod: wooden-manatee-881) ===');

  // Phase 1: push groups in chunks. Send empty exercises[] alongside.
  const groupChunks: typeof groupPayloads[] = [];
  for (let i = 0; i < groupPayloads.length; i += GROUPS_PER_BATCH) {
    groupChunks.push(groupPayloads.slice(i, i + GROUPS_PER_BATCH));
  }

  const exerciseChunks: typeof exercisePayloads[] = [];
  for (let i = 0; i < exercisePayloads.length; i += EXERCISES_PER_BATCH) {
    exerciseChunks.push(exercisePayloads.slice(i, i + EXERCISES_PER_BATCH));
  }

  let totalGroupsInserted = 0;
  let totalGroupsUpdated = 0;
  let totalExercisesUpdated = 0;
  let totalExercisesSkipped = 0;
  let totalErrors = 0;

  // Run groups + first exerciseChunk together where possible to save
  // a round trip; remaining exercise chunks are pushed separately.
  const totalCalls =
    Math.max(groupChunks.length, exerciseChunks.length);
  for (let i = 0; i < totalCalls; i++) {
    const groups = groupChunks[i] ?? [];
    const exercises = exerciseChunks[i] ?? [];
    if (groups.length === 0 && exercises.length === 0) continue;

    process.stdout.write(
      `Call ${i + 1}/${totalCalls} (groups=${groups.length}, exercises=${exercises.length}): `,
    );

    const argsJson = JSON.stringify({ groups, exercises });
    const r = spawnSync(
      'npx',
      [
        'convex',
        'run',
        '--prod',
        'exerciseGroups:bulkSetGroupAndCompatibility',
        argsJson,
      ],
      {
        cwd: PROJECT_DIR,
        encoding: 'utf8',
        maxBuffer: 100 * 1024 * 1024,
      },
    );

    if (r.status !== 0) {
      totalErrors++;
      const msg =
        (r.stderr ||
          r.stdout ||
          (r.error && (r.error.code || r.error.message)) ||
          `status=${r.status} signal=${r.signal}`)
          .toString()
          .slice(0, 400);
      console.log('FAIL');
      console.log(`  ${msg}`);
      continue;
    }

    const out = r.stdout ?? '';
    // Convex `run` prints a JSON object whose keys come out in alphabetical
    // order, so we extract each field independently rather than positionally.
    const grab = (key: string): number | undefined => {
      const m = out.match(new RegExp(`"${key}"\\s*:\\s*(\\d+)`));
      return m ? parseInt(m[1], 10) : undefined;
    };
    const gi = grab('groupsInserted');
    const gu = grab('groupsUpdated');
    const eu = grab('exercisesUpdated');
    const es = grab('exercisesSkipped');
    if (gi !== undefined && gu !== undefined && eu !== undefined && es !== undefined) {
      totalGroupsInserted += gi;
      totalGroupsUpdated += gu;
      totalExercisesUpdated += eu;
      totalExercisesSkipped += es;
      console.log(
        `groupsIns=${gi} groupsUpd=${gu} exUpd=${eu} exSkp=${es}`,
      );
    } else {
      console.log(`(unparsed): ${out.trim().slice(0, 120)}`);
    }
  }

  console.log('\n=== Auto-tagger complete ===');
  console.log(`Groups inserted:   ${totalGroupsInserted}`);
  console.log(`Groups updated:    ${totalGroupsUpdated}`);
  console.log(`Exercises updated: ${totalExercisesUpdated}`);
  console.log(`Exercises skipped: ${totalExercisesSkipped}`);
  console.log(`Errors:            ${totalErrors}`);
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
