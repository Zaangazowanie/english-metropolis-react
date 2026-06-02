/**
 * build-interference-index.ts
 *
 * Agent A9 — Polish-interference index builder.
 *
 * Reads the ESL autoresearch training data (primary:
 * /root/.openclaw/workspace/training-data.jsonl == enriched_merged_dedup.jsonl,
 * cross-reference: training-data-v3.jsonl, training-data-polish-esi.jsonl,
 * training-data-polish-patterns.json) and builds a structured JSON index of
 * Polish-L1-transfer interference patterns at /root/.openclaw/workspace/
 * polish-interference-index.json.
 *
 * Stdlib only — no NLP libraries. Heuristic regex + word-list matching.
 *
 * Run:
 *   tsc --target es2022 --module commonjs --moduleResolution node \
 *     scripts/build-interference-index.ts --outDir scripts/dist
 *   node scripts/dist/build-interference-index.js
 */

import * as fs from "fs";
import * as readline from "readline";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TrainingRecord {
  error?: string;
  correction?: string;
  explanation?: string;
  error_type?: string;
  proficiency_level?: string;
  pattern?: string;
  drills?: Array<{ error?: string; correction?: string }>;
  source_file?: string;
  source_index?: number;
}

interface PatternBucket {
  patternId: string;
  cefrLevel: string;
  frequency: number;
  polishCause: string;
  polishCauseEn: string;
  typicalErrors: string[];
  correctPatterns: string[];
  interferenceStrength: number;
  decayRate: number;
  spacedRepetitionWeight: number;
  matchingSubCategories: string[];
  matchingErrorCategories: string[];
  sourceCount: number;
}

interface DetectorSpec {
  patternId: string;
  defaultCefr: string;
  // L1-transfer description, both languages, separated by " / "
  polishCause: string;
  polishCauseEn: string;
  // KB and exercise alignment
  matchingSubCategories: string[];
  matchingErrorCategories: string[];
  // Heuristic for fossilization (0..1) — higher = harder to drop
  fossilizationPrior: number;
  // Detector — given a record, true if the pattern fires
  detect: (rec: TrainingRecord, ctx: DetectCtx) => boolean;
}

interface DetectCtx {
  errLow: string;
  corrLow: string;
  expLow: string;
  patLow: string;
  etLow: string;
  errTokens: string[];
  corrTokens: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function hasWord(s: string, w: string): boolean {
  return new RegExp(`(^|[^\\p{L}])${w}([^\\p{L}]|$)`, "iu").test(s);
}

function hasAnyWord(s: string, ws: string[]): boolean {
  return ws.some((w) => hasWord(s, w));
}

function median(values: number[]): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

const CEFR_TO_NUM: Record<string, number> = {
  A1: 1,
  A2: 2,
  B1: 3,
  B2: 4,
  C1: 5,
  C2: 6,
};
const NUM_TO_CEFR = ["?", "A1", "A2", "B1", "B2", "C1", "C2"];

function cefrFromNum(n: number): string {
  const idx = Math.max(1, Math.min(6, Math.round(n)));
  return NUM_TO_CEFR[idx];
}

// ---------------------------------------------------------------------------
// Detector definitions  — 18 patterns
// ---------------------------------------------------------------------------

const ARTICLES = ["a", "an", "the"];
const SUBJECTS_3SG = ["he", "she", "it"];
const PERFECT_TRIGGERS = [
  "since",
  "ever",
  "never",
  "just",
  "already",
  "yet",
  "so far",
  "lately",
  "recently",
];
const PROGRESSIVE_TRIGGERS = [
  "now",
  "right now",
  "at the moment",
  "currently",
  "still",
  "this week",
  "today",
];
const COMMON_FALSE_FRIENDS: Array<[RegExp, string]> = [
  [/\beventually\b/i, "ewentualnie/eventually"],
  [/\bactually\b/i, "aktualnie/actually"],
  [/\bsympathetic\b/i, "sympatyczny/sympathetic"],
  [/\bfabric\b/i, "fabryka/fabric"],
  [/\bordinary\b/i, "ordynarny/ordinary"],
  [/\bpathetic\b/i, "patetyczny/pathetic"],
  [/\blunatic\b/i, "lunatyk/lunatic"],
  [/\bchef\b/i, "szef/chef"],
  [/\bdivision\b/i, "dywizja/division"],
];
const GERUND_VERBS = [
  "enjoy",
  "enjoys",
  "enjoyed",
  "hate",
  "hates",
  "hated",
  "like",
  "likes",
  "liked",
  "love",
  "loves",
  "loved",
  "avoid",
  "avoids",
  "avoided",
  "consider",
  "considers",
  "considered",
  "finish",
  "finishes",
  "finished",
  "mind",
  "minds",
  "minded",
  "suggest",
  "suggests",
  "suggested",
];
const MODALS = [
  "must",
  "should",
  "shouldn't",
  "can",
  "can't",
  "could",
  "couldn't",
  "may",
  "might",
  "will",
  "would",
  "shall",
];
const QUANTIFIERS_UNCOUNTABLE = [
  "water",
  "money",
  "information",
  "advice",
  "furniture",
  "news",
  "luggage",
  "research",
  "knowledge",
  "homework",
  "rice",
  "bread",
  "music",
  "weather",
  "traffic",
];
const IRREG_PLURALS: Array<[RegExp, RegExp]> = [
  [/\bmans\b/i, /\bmen\b/i],
  [/\bwomans\b/i, /\bwomen\b/i],
  [/\bchilds\b/i, /\bchildren\b/i],
  [/\bfoots\b/i, /\bfeet\b/i],
  [/\btooths\b/i, /\bteeth\b/i],
  [/\bmouses\b/i, /\bmice\b/i],
  [/\bpeoples\b/i, /\bpeople\b/i],
  [/\bgooses\b/i, /\bgeese\b/i],
];

const detectors: DetectorSpec[] = [
  // 1
  {
    patternId: "article-omission",
    defaultCefr: "A1",
    polishCause:
      "Polski nie ma przedimków (a/an/the), więc Polacy pomijają je w angielskim — slot wydaje się intuicyjnie zbędny. / Polish has no article system, so the slot feels redundant to L1 intuition under speed.",
    polishCauseEn:
      "Polish has no article system. English requires a/an/the before most singular common nouns; Polish speakers' natural production omits this slot under speed.",
    matchingSubCategories: ["articles-a-an", "articles-the", "no-article"],
    matchingErrorCategories: ["grammar-article", "article_errors", "article_missing"],
    fossilizationPrior: 0.92,
    detect: (_rec, { etLow, patLow, expLow }) =>
      etLow.includes("article") ||
      patLow.includes("article") ||
      expLow.includes("article omission") ||
      expLow.includes("articles") && expLow.includes("polish has no"),
  },
  // 2
  {
    patternId: "article-misuse",
    defaultCefr: "A2",
    polishCause:
      "Polacy wybierają złe przedimki: a vs an, the vs no-article — kontrast nieistniejący w polskim. / Polish speakers misuse English articles (a vs an before vowels, the vs zero-article) because the contrast is absent in Polish.",
    polishCauseEn:
      "Polish speakers, having no native article system to ground the choice, frequently pick the wrong English article: a/an before vowel/consonant or the/zero with definiteness contrast.",
    matchingSubCategories: ["articles-a-an", "articles-the", "definiteness"],
    matchingErrorCategories: ["grammar-article", "article_errors"],
    fossilizationPrior: 0.78,
    detect: (_rec, { errLow, corrLow, etLow, patLow }) => {
      if (!(etLow.includes("article") || patLow.includes("article"))) return false;
      // Contrast between a/an/the in error vs correction
      const errArt = ARTICLES.filter((a) => hasWord(errLow, a));
      const corrArt = ARTICLES.filter((a) => hasWord(corrLow, a));
      if (errArt.length === 0 || corrArt.length === 0) return false;
      return errArt.join("|") !== corrArt.join("|");
    },
  },
  // 3
  {
    patternId: "third-person-s",
    defaultCefr: "A2",
    polishCause:
      "W polskim końcówki czasownika niosą osobę («on idzie»), więc -s w 3 os. l.p. wydaje się redundantne. / In Polish the verb ending already encodes person, so the English 3rd-person -s feels redundant.",
    polishCauseEn:
      "Polish verb morphology already encodes person on the verb stem, so the English 3rd-person -s is perceived as redundant and dropped.",
    matchingSubCategories: ["present-simple", "subject-verb-agreement"],
    matchingErrorCategories: ["grammar-agreement", "agreement_errors", "tense_errors"],
    fossilizationPrior: 0.65,
    detect: (_rec, { errLow, corrLow, expLow, patLow }) => {
      if (
        patLow.includes("don't") ||
        patLow.includes("doesn't") ||
        patLow.includes("missing -es") ||
        patLow.includes("missing -s") ||
        expLow.includes("third person") ||
        expLow.includes("3rd person") ||
        expLow.includes("subject-verb agreement")
      )
        return true;
      // Heuristic: error has bare verb after he/she/it; correction adds -s
      const m = errLow.match(/\b(he|she|it)\s+(\w+)\b/);
      if (!m) return false;
      const verb = m[2];
      if (verb.endsWith("s") || verb === "is" || verb === "was" || verb === "has") return false;
      return corrLow.includes(`${m[1]} ${verb}s `) || corrLow.includes(`${m[1]} ${verb}es `);
    },
  },
  // 4
  {
    patternId: "present-perfect",
    defaultCefr: "B1",
    polishCause:
      "Polski ma jeden czas przeszły (dokonany/niedokonany), więc Polacy używają simple past tam, gdzie angielski wymaga present perfect (since/ever/never/just/already). / Polish has a single past, so the present-perfect slot is realised as simple past.",
    polishCauseEn:
      "Polish lacks a present-perfect tense; aspect is encoded by perfective/imperfective on the verb stem. Polish speakers default to simple past where English requires present perfect, especially with since/ever/never/just/already.",
    matchingSubCategories: ["present-perfect", "tense-contrast"],
    matchingErrorCategories: ["grammar-tense", "tense_errors", "tense_verb_errors"],
    fossilizationPrior: 0.88,
    detect: (_rec, { errLow, corrLow, etLow, patLow, expLow }) => {
      if (
        (etLow.includes("tense") || patLow.includes("tense") || patLow.includes("aspect")) &&
        (hasAnyWord(corrLow, PERFECT_TRIGGERS) || /\b(have|has|had)\b\s+\w+ed\b/.test(corrLow))
      )
        return true;
      if (expLow.includes("present perfect") || expLow.includes("perfect tense")) return true;
      // Correction has have/has + V-ed/3rd; error has simple past
      return /\b(have|has)\s+(been|\w+ed)\b/.test(corrLow) && !/\b(have|has)\s+/.test(errLow);
    },
  },
  // 5
  {
    patternId: "auxiliary-drop",
    defaultCefr: "A2",
    polishCause:
      "Polski nie używa pomocniczych be/do/have w prostych formach progresywnych i pytaniach — Polacy mówią «I going» zamiast «I am going». / Polish does not use be/do/have auxiliaries in progressive or question formation.",
    polishCauseEn:
      "Polish forms progressives, questions, and negatives morphologically without an auxiliary verb. Polish speakers omit be/do/have in English (e.g., 'I going home', 'You like it?').",
    matchingSubCategories: ["auxiliary-be", "auxiliary-do", "questions-yesno"],
    matchingErrorCategories: ["grammar-auxiliary", "verb_errors", "general_esl_errors"],
    fossilizationPrior: 0.72,
    detect: (_rec, { errLow, corrLow }) => {
      // Error has bare progressive ("I going"), correction inserts am/is/are
      if (/\b(i|you|we|they|he|she|it)\s+(\w+ing)\b/.test(errLow)) {
        if (/\b(am|is|are|was|were)\s+(\w+ing)\b/.test(corrLow) && !/\b(am|is|are|was|were)\s+(\w+ing)\b/.test(errLow)) {
          return true;
        }
      }
      // Missing 'do/does' in question: correction starts with do/does/did
      if (/^(do|does|did)\s/.test(corrLow.trim()) && !/^(do|does|did)\s/.test(errLow.trim())) return true;
      return false;
    },
  },
  // 6
  {
    patternId: "progressive-aspect",
    defaultCefr: "A2",
    polishCause:
      "Polski nie odróżnia simple/progressive — używa aspektu (dokonany/niedokonany). Stąd «now» + simple zamiast progressive. / Polish encodes aspect (perfective/imperfective) on the verb, not as a progressive periphrastic form.",
    polishCauseEn:
      "Polish lacks a dedicated progressive form; aspect is encoded morphologically. Polish speakers use simple-tense verbs in contexts where English requires present/past continuous (now, at the moment, currently).",
    matchingSubCategories: ["present-continuous", "past-continuous"],
    matchingErrorCategories: ["grammar-tense", "tense_errors"],
    fossilizationPrior: 0.7,
    detect: (_rec, { errLow, corrLow }) => {
      // Correction has am/is/are + V-ing AND error has bare V (no -ing) AND a progressive trigger
      if (!/\b(am|is|are|was|were)\s+\w+ing\b/.test(corrLow)) return false;
      if (/\b(am|is|are|was|were)\s+\w+ing\b/.test(errLow)) return false;
      return hasAnyWord(corrLow, PROGRESSIVE_TRIGGERS) || hasAnyWord(errLow, PROGRESSIVE_TRIGGERS);
    },
  },
  // 7
  {
    patternId: "preposition-na-w",
    defaultCefr: "B1",
    polishCause:
      "Polskie «na/w/o» mapują się na angielskie in/on/at/about niezgodnie ze schematem (np. «na uniwersytecie» → «at university», nie «on»). / Polish na/w/o map to English prepositions in non-isomorphic ways.",
    polishCauseEn:
      "Polish prepositions na/w/o do not map cleanly onto English in/on/at/about. Polish speakers consistently confuse 'on the university' (na uniwersytecie → at), 'in Sunday' (w niedzielę → on), 'depend from' (zależeć od → on), 'married with' (z → to).",
    matchingSubCategories: ["prepositions-time", "prepositions-place", "prepositions-collocations"],
    matchingErrorCategories: ["grammar-preposition", "preposition_errors", "preposition"],
    fossilizationPrior: 0.85,
    detect: (_rec, { etLow, patLow, expLow }) =>
      etLow.includes("preposition") || patLow.includes("preposition") || expLow.includes("prepositions map"),
  },
  // 8
  {
    patternId: "word-order-noun-adjective",
    defaultCefr: "B1",
    polishCause:
      "W polskim przymiotnik często stoi po rzeczowniku w nazwach i klasyfikacjach («język polski»), więc kalka leci do angielskiego («language polish»). / Polish often places adjectives post-nominally in classificatory phrases.",
    polishCauseEn:
      "Polish allows post-nominal adjectives in classificatory or formal phrases (język polski, gospodarka rynkowa). The order leaks into English where pre-nominal adjective is obligatory.",
    matchingSubCategories: ["adjective-order", "word-order"],
    matchingErrorCategories: ["grammar-word-order", "word_order_errors", "adjective_wrong"],
    fossilizationPrior: 0.55,
    detect: (_rec, { etLow, patLow, expLow }) =>
      etLow.includes("word_order") ||
      patLow.includes("word order") ||
      patLow.includes("noun-adjective") ||
      expLow.includes("post-nominal") ||
      expLow.includes("adjective after noun"),
  },
  // 9
  {
    patternId: "false-friend",
    defaultCefr: "B2",
    polishCause:
      "Polskie «aktualnie/ewentualnie/sympatyczny/fabryka» wyglądają jak angielskie wyrazy o innym znaczeniu — klasyczne false friends. / Polish-English false friends (aktualnie≠actually, ewentualnie≠eventually).",
    polishCauseEn:
      "Polish-English cognate pairs share form but diverge in meaning: aktualnie ≠ actually (currently vs in fact), ewentualnie ≠ eventually (possibly vs in the end), sympatyczny ≠ sympathetic (nice vs compassionate).",
    matchingSubCategories: ["false-friends", "vocabulary-pitfalls"],
    matchingErrorCategories: ["vocab-false-friend", "false_friends", "false_friend"],
    fossilizationPrior: 0.8,
    detect: (_rec, { etLow, patLow, expLow, errLow }) => {
      if (etLow.includes("false_friend") || patLow.includes("false friend") || expLow.includes("false friend"))
        return true;
      return COMMON_FALSE_FRIENDS.some(([re]) => re.test(errLow));
    },
  },
  // 10
  {
    patternId: "gerund-vs-infinitive",
    defaultCefr: "B1",
    polishCause:
      "Po polskich czasownikach jak «lubić, nienawidzić» zwykle stoi bezokolicznik («lubię chodzić»); po angielskich enjoy/hate/like — gerund. / Polish takes the infinitive after lubić/nienawidzić; English takes -ing after enjoy/hate/like.",
    polishCauseEn:
      "After verbs like enjoy, hate, like, love, avoid, finish, mind, English requires -ing. Polish equivalents take the infinitive (lubię chodzić = 'I like to go' but 'I enjoy going'), so learners pick the wrong complement.",
    matchingSubCategories: ["gerund-infinitive", "verb-patterns"],
    matchingErrorCategories: ["grammar-verb-pattern", "verb_form_errors", "verb_wrong"],
    fossilizationPrior: 0.6,
    detect: (_rec, { errLow, corrLow }) => {
      // error has GERUND_VERB + to + V; correction has GERUND_VERB + V-ing
      const reErr = new RegExp(`\\b(${GERUND_VERBS.join("|")})\\s+to\\s+(\\w+)\\b`, "i");
      const reCorr = new RegExp(`\\b(${GERUND_VERBS.join("|")})\\s+\\w+ing\\b`, "i");
      return reErr.test(errLow) && reCorr.test(corrLow);
    },
  },
  // 11
  {
    patternId: "modal-bare-infinitive",
    defaultCefr: "A2",
    polishCause:
      "Polski używa konstrukcji «muszę iść» (musieć + bezokolicznik z -ć), a Polacy kalkują «I must to go». / Polish musi/powinien/może all combine with the infinitive form (with -ć); learners over-extend and add 'to' after English modals.",
    polishCauseEn:
      "Polish modals (musieć, powinien, móc) combine with the bare infinitive that morphologically ends in -ć. Polish speakers carry over the perceived 'to' marker, producing 'I must to go', 'I should to call'.",
    matchingSubCategories: ["modals", "infinitive-after-modals"],
    matchingErrorCategories: ["grammar-modal", "modal_errors", "verb_form_errors"],
    fossilizationPrior: 0.58,
    detect: (_rec, { errLow, corrLow }) => {
      const reErr = new RegExp(`\\b(${MODALS.join("|")})\\s+to\\s+\\w+\\b`, "i");
      const reCorr = new RegExp(`\\b(${MODALS.join("|")})\\s+\\w+\\b`, "i");
      if (!reErr.test(errLow)) return false;
      // correction does NOT have modal + to
      return reCorr.test(corrLow) && !reErr.test(corrLow);
    },
  },
  // 12
  {
    patternId: "would-have-conditional",
    defaultCefr: "B2",
    polishCause:
      "Polski tryb przypuszczający («gdybym był wiedział») nie ma struktury «would have + V3», więc Polacy łączą czasy: «If I would know» zamiast «If I had known». / Polish lacks the would-have + past-participle frame.",
    polishCauseEn:
      "Polish conditional uses 'by' particle on the verb without a periphrastic 'would have'. Polish speakers misform third conditionals as 'If I would know...' or 'If I would have known...' instead of 'If I had known... I would have...'.",
    matchingSubCategories: ["third-conditional", "conditionals"],
    matchingErrorCategories: ["grammar-conditional", "conditional_errors", "tense_errors"],
    fossilizationPrior: 0.75,
    detect: (_rec, { errLow, corrLow }) => {
      if (/\bif\s+\w+\s+would\b/i.test(errLow)) return true;
      // correction has had + V-ed in if-clause + would have
      if (/\bif\s+\w+\s+had\s+\w+/i.test(corrLow) && /\bwould\s+have\s+\w+/i.test(corrLow)) {
        if (!/\bwould\s+have\s+\w+/i.test(errLow)) return true;
      }
      return false;
    },
  },
  // 13
  {
    patternId: "negation-attachment",
    defaultCefr: "A2",
    polishCause:
      "Polski używa «nie» przed czasownikiem zawsze («nie wiem»), a polskie podwójne przeczenie («nikt nie ma») leci do angielskiego jako «nobody don't have». / Polish always negates before the verb and accepts double negation.",
    polishCauseEn:
      "Polish negation places 'nie' before the verb and licenses (in fact requires) negative concord ('nikt nie ma' = nobody nothing has). Polish speakers produce 'I don't know nothing', 'Nobody doesn't come', or confuse no/not/none.",
    matchingSubCategories: ["negation", "double-negation"],
    matchingErrorCategories: ["grammar-negation", "negation_errors", "general_esl_errors"],
    fossilizationPrior: 0.5,
    detect: (_rec, { errLow, corrLow }) => {
      // Error has double negation that correction removes
      const errNeg = (errLow.match(/\b(no|not|n't|nobody|nothing|nowhere|never|none)\b/g) || []).length;
      const corrNeg = (corrLow.match(/\b(no|not|n't|nobody|nothing|nowhere|never|none)\b/g) || []).length;
      if (errNeg >= 2 && corrNeg < errNeg) return true;
      // Confusion between no/not in short positions
      if (/\bi\s+no\s+\w+/i.test(errLow) && /\bi\s+(don't|do not)\s+/i.test(corrLow)) return true;
      return false;
    },
  },
  // 14
  {
    patternId: "quantifier-much-many",
    defaultCefr: "A2",
    polishCause:
      "Polski nie odróżnia policzalnych/niepoliczalnych — «dużo» pasuje do wszystkiego. Polacy mieszają much/many/a lot of i mówią «many money». / Polish 'dużo' covers both countable and uncountable.",
    polishCauseEn:
      "Polish quantifier 'dużo' covers both countable and uncountable nouns. Polish speakers map this to 'much' and 'many' arbitrarily, producing 'many money', 'much friends', 'how many information'.",
    matchingSubCategories: ["quantifiers", "countable-uncountable"],
    matchingErrorCategories: ["grammar-quantifier", "countability_errors", "noun_countable_wrong"],
    fossilizationPrior: 0.62,
    detect: (_rec, { errLow, corrLow }) => {
      // Pattern: error has 'many <uncountable>' or 'much <countable plural>'
      if (new RegExp(`\\bmany\\s+(${QUANTIFIERS_UNCOUNTABLE.join("|")})\\b`, "i").test(errLow)) return true;
      if (/\bmuch\s+\w+s\b/i.test(errLow) && /\bmany\s+\w+s\b/i.test(corrLow)) return true;
      if (/\bmany\s+\w+\b/i.test(errLow) && /\bmuch\s+\w+\b/i.test(corrLow)) return true;
      return false;
    },
  },
  // 15
  {
    patternId: "pluralization",
    defaultCefr: "A2",
    polishCause:
      "Polski ma własne nieregularne plurale, więc kalkuje regularne -s na angielskie wyjątki: «mans, childs, foots». / Polish over-regularises English irregular plurals.",
    polishCauseEn:
      "English has irregular plurals (man/men, child/children, foot/feet). Polish speakers over-regularise with -s, producing 'mans', 'childs', 'foots', 'tooths'.",
    matchingSubCategories: ["irregular-plurals", "noun-morphology"],
    matchingErrorCategories: ["grammar-plural", "plural_errors", "noun_morphology"],
    fossilizationPrior: 0.45,
    detect: (_rec, { errLow, corrLow }) => IRREG_PLURALS.some(([eRe, cRe]) => eRe.test(errLow) && cRe.test(corrLow)),
  },
  // 16
  {
    patternId: "collocation-make-do",
    defaultCefr: "B1",
    polishCause:
      "Polskie «robić» pokrywa zarówno make jak i do, więc Polacy mówią «make homework», «do mistake». / Polish 'robić' covers both make and do.",
    polishCauseEn:
      "Polish 'robić' encompasses both English make and do. Polish speakers mismap collocations: 'make homework', 'do a mistake', 'make a decision'/'do a decision' confusion.",
    matchingSubCategories: ["collocations-make-do", "verb-collocations"],
    matchingErrorCategories: ["vocab-collocation", "collocation_errors", "collocation"],
    fossilizationPrior: 0.78,
    detect: (_rec, { errLow, corrLow, expLow, patLow }) => {
      if (patLow.includes("make_do") || patLow.includes("make/do") || expLow.includes("make and do")) return true;
      if (/\bmake\s+(homework|mistake|mistakes|a mistake)\b/i.test(errLow) && /\bdo\b/i.test(corrLow)) return true;
      if (/\bdo\s+(a\s+)?(decision|party|photo|picture)\b/i.test(errLow) && /\bmake\b/i.test(corrLow)) return true;
      return false;
    },
  },
  // 17
  {
    patternId: "preposition-listen-to-discuss",
    defaultCefr: "B1",
    polishCause:
      "Polski «słuchać czegoś» (genitive, bez przyimka) → «listen music» zamiast «listen to music»; «dyskutować o» → «discuss about» zamiast «discuss». / Polish case-marking masks the obligatory English preposition (or its absence).",
    polishCauseEn:
      "Some Polish verbs case-mark their object directly without a preposition where English needs 'to' (listen to, reply to), and others take 'o' where English takes nothing (discuss, debate). Polish speakers produce 'listen music', 'discuss about it', 'explain me'.",
    matchingSubCategories: ["prepositions-collocations", "verb-complementation"],
    matchingErrorCategories: ["grammar-preposition", "preposition_errors", "collocation_errors"],
    fossilizationPrior: 0.7,
    detect: (_rec, { errLow, corrLow, patLow }) => {
      if (patLow.includes("listen_music") || patLow.includes("discuss about") || patLow.includes("explain me"))
        return true;
      if (/\blisten\s+(?!to\b)\w+/i.test(errLow) && /\blisten\s+to\b/i.test(corrLow)) return true;
      if (/\bdiscuss\s+about\b/i.test(errLow) && /\bdiscuss\s+(?!about)\b/i.test(corrLow)) return true;
      if (/\bexplain\s+me\b/i.test(errLow) && /\bexplain\s+to\s+me\b/i.test(corrLow)) return true;
      return false;
    },
  },
  // 18
  {
    patternId: "have-got-overuse",
    defaultCefr: "A2",
    polishCause:
      "Brytyjskie «have got» jest dla Polaków atrakcyjnym substytutem polskiego «mam», więc nadużywają go w kontekstach formalnych i amerykańskich, gdzie zwykłe «have» jest naturalniejsze. / Polish 'mam' maps to British have got, leading to overuse.",
    polishCauseEn:
      "Polish 'mam' (I have) idiomatically maps to British 'have got'. Polish speakers over-extend 'have got' to past, formal, and American-style contexts where simple 'have' is preferred or required.",
    matchingSubCategories: ["have-have-got", "possession"],
    matchingErrorCategories: ["grammar-verb", "verb_errors"],
    fossilizationPrior: 0.4,
    detect: (_rec, { patLow, errLow, corrLow }) => {
      if (patLow.includes("have_got") || patLow.includes("have got")) return true;
      // Error has "have got" in past/formal context where correction uses "had" or "have"
      if (/\bhave\s+got\b/i.test(errLow) && /\b(had|have)\b/i.test(corrLow) && !/\bhave\s+got\b/i.test(corrLow))
        return true;
      return false;
    },
  },
  // 19
  {
    patternId: "subject-pronoun-drop",
    defaultCefr: "A1",
    polishCause:
      "Polski jest pro-drop — końcówka czasownika niesie podmiot («idę»), więc Polacy pomijają «I/you/he» w angielskim («Going home», «Is teacher»). / Polish is pro-drop; English requires overt subject pronouns.",
    polishCauseEn:
      "Polish is a pro-drop language: subject pronouns are recovered from verb morphology and routinely omitted. Polish speakers drop the obligatory English subject ('Going home', 'Is teacher', 'Want apple').",
    matchingSubCategories: ["subject-pronouns", "sentence-structure"],
    matchingErrorCategories: ["grammar-subject", "subject_omission", "general_esl_errors"],
    fossilizationPrior: 0.55,
    detect: (_rec, { errLow, corrLow, patLow }) => {
      if (patLow.includes("subject omission") || patLow.includes("missing subject")) return true;
      // Error starts with verb that should have a pronoun subject
      const errStart = errLow.trim().split(/\s+/)[0] || "";
      const corrTokens = corrLow.trim().split(/\s+/);
      const corrFirst = corrTokens[0] || "";
      const SUBJECT_PRONOUNS = new Set(["i", "you", "he", "she", "it", "we", "they"]);
      if (
        SUBJECT_PRONOUNS.has(corrFirst) &&
        !SUBJECT_PRONOUNS.has(errStart) &&
        corrTokens[1] &&
        corrTokens[1] === errStart
      ) {
        return true;
      }
      return false;
    },
  },
  // 20
  {
    patternId: "spelling-orthography",
    defaultCefr: "A2",
    polishCause:
      "Polska ortografia jest fonetyczna («tak jak słyszę, tak piszę»); angielska – nie. Polacy tworzą warianty fonetyczne, np. «bizness, kompjuter, wajn». / Polish orthography is phonetic; English is not.",
    polishCauseEn:
      "Polish orthography is largely phonetic; English orthography is opaque. Polish speakers spell English words by sound, producing variants like 'bizness', 'kompjuter', 'wajn', or apply Polish doubling rules incorrectly.",
    matchingSubCategories: ["spelling", "orthography"],
    matchingErrorCategories: ["spelling_errors", "spelling"],
    fossilizationPrior: 0.4,
    detect: (_rec, { etLow }) => etLow.includes("spelling"),
  },
];

// ---------------------------------------------------------------------------
// Aggregator
// ---------------------------------------------------------------------------

interface Aggregate {
  spec: DetectorSpec;
  count: number;
  cefrNums: number[];
  errorSamples: Map<string, number>; // sample -> count
  correctSamples: Map<string, number>;
  rawErrorTypes: Map<string, number>;
  rawPatterns: Map<string, number>;
}

function newAggregate(spec: DetectorSpec): Aggregate {
  return {
    spec,
    count: 0,
    cefrNums: [],
    errorSamples: new Map(),
    correctSamples: new Map(),
    rawErrorTypes: new Map(),
    rawPatterns: new Map(),
  };
}

function bump(map: Map<string, number>, key: string, max = 200): void {
  if (!key) return;
  if (map.has(key)) {
    map.set(key, (map.get(key) || 0) + 1);
  } else if (map.size < max) {
    map.set(key, 1);
  }
}

function trimSample(s: string, maxLen = 140): string | null {
  if (!s) return null;
  let cleaned = s.trim().replace(/\s+/g, " ");
  if (cleaned.length === 0) return null;
  // Reject instruction-tuning meta-prompt artifacts that leaked into the data
  const metaPatterns = [
    /^the student wrote/i,
    /^the student said/i,
    /^correct this/i,
    /^correct(ed)?\s*[:\.]/i,
    /^fixed\s*[:\.]/i,
    /^identify and fix/i,
    /^the correction/i,
    /^answer\s*[:\.]/i,
  ];
  if (metaPatterns.some((re) => re.test(cleaned))) return null;
  // Strip wrapping quotes
  cleaned = cleaned.replace(/^["'„«]+|["'"»]+$/g, "").trim();
  if (cleaned.length < 6) return null;
  if (!/[a-z]/i.test(cleaned)) return null;
  // Reject pure-ellipsis fragments like " the..." or "...a..."
  if (cleaned.length < 12 && /\.{3,}/.test(cleaned)) return null;
  if (cleaned.length > maxLen) return cleaned.slice(0, maxLen) + "…";
  return cleaned;
}

function topN(map: Map<string, number>, n: number): string[] {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k]) => k);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function processFile(
  path: string,
  aggregates: Map<string, Aggregate>,
  totalRef: { n: number },
  fileLabel: string,
  options: { v3?: boolean; esi?: boolean } = {},
): Promise<void> {
  if (!fs.existsSync(path)) {
    console.warn(`[skip] ${path} not found`);
    return;
  }
  const fileStream = fs.createReadStream(path);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
  let n = 0;
  for await (const line of rl) {
    if (!line.trim()) continue;
    let d: any;
    try {
      d = JSON.parse(line);
    } catch {
      continue;
    }
    n += 1;
    totalRef.n += 1;

    // Normalize record across formats
    let rec: TrainingRecord;
    if (options.v3) {
      const why = d.why || {};
      rec = {
        error: d.error,
        correction: d.correction_standard,
        explanation:
          (typeof why.linguistic === "string" ? why.linguistic : "") +
          (d.polish_specific ? " " + d.polish_specific : ""),
        error_type: d.error_type,
        proficiency_level: undefined,
        pattern: d.polish_specific,
      };
    } else if (options.esi) {
      const examples: string[] = Array.isArray(d.examples) ? d.examples : [];
      // ESI is a curated reference: emit one record per common_error and per example
      const baseRec: TrainingRecord = {
        error: d.common_error,
        correction: d.correct_form,
        explanation: (d.polish_interference || "") + " " + (d.why || ""),
        error_type: d.error_type,
        pattern: d.polish_interference,
      };
      classifyAndAggregate(baseRec, aggregates);
      for (const ex of examples) {
        const exRec: TrainingRecord = {
          ...baseRec,
          error: ex,
          correction: undefined,
        };
        classifyAndAggregate(exRec, aggregates);
      }
      continue;
    } else {
      rec = d as TrainingRecord;
    }
    classifyAndAggregate(rec, aggregates);
    // also fold in drills
    if (Array.isArray(d.drills)) {
      for (const drill of d.drills) {
        if (!drill || typeof drill !== "object") continue;
        const drillRec: TrainingRecord = {
          ...rec,
          error: drill.error,
          correction: drill.correction,
        };
        classifyAndAggregate(drillRec, aggregates);
      }
    }
  }
  console.log(`[${fileLabel}] processed ${n.toLocaleString()} records`);
}

function classifyAndAggregate(rec: TrainingRecord, aggregates: Map<string, Aggregate>): void {
  const errLow = (rec.error || "").toLowerCase();
  const corrLow = (rec.correction || "").toLowerCase();
  const expLow = (rec.explanation || "").toLowerCase();
  const patLow = (rec.pattern || "").toLowerCase();
  const etLow = (rec.error_type || "").toLowerCase();
  if (!errLow && !corrLow && !patLow && !etLow) return;

  const ctx: DetectCtx = {
    errLow,
    corrLow,
    expLow,
    patLow,
    etLow,
    errTokens: tokenize(errLow),
    corrTokens: tokenize(corrLow),
  };

  const errSample = trimSample(rec.error || "");
  const corrSample = trimSample(rec.correction || "");
  const cefrNum = rec.proficiency_level ? CEFR_TO_NUM[rec.proficiency_level.toUpperCase()] : undefined;

  for (const det of detectors) {
    let fired = false;
    try {
      fired = det.detect(rec, ctx);
    } catch {
      fired = false;
    }
    if (!fired) continue;
    let agg = aggregates.get(det.patternId);
    if (!agg) {
      agg = newAggregate(det);
      aggregates.set(det.patternId, agg);
    }
    agg.count += 1;
    if (cefrNum) agg.cefrNums.push(cefrNum);
    if (errSample) bump(agg.errorSamples, errSample);
    if (corrSample) bump(agg.correctSamples, corrSample);
    if (rec.error_type) bump(agg.rawErrorTypes, rec.error_type, 50);
    if (rec.pattern) bump(agg.rawPatterns, rec.pattern, 50);
  }
}

async function main(): Promise<void> {
  const aggregates = new Map<string, Aggregate>();
  const totalRef = { n: 0 };

  await processFile(
    "/root/.openclaw/workspace/training-data.jsonl",
    aggregates,
    totalRef,
    "enriched_merged_dedup",
    {},
  );
  await processFile(
    "/root/.openclaw/workspace/training-data-v3.jsonl",
    aggregates,
    totalRef,
    "v3_v6_typed",
    { v3: true },
  );
  await processFile(
    "/root/.openclaw/workspace/training-data-polish-esi.jsonl",
    aggregates,
    totalRef,
    "polish_esi",
    { esi: true },
  );

  const grandTotal = totalRef.n;
  console.log(`\nTotal samples processed: ${grandTotal.toLocaleString()}`);

  // Compute final entries
  const entries: PatternBucket[] = [];
  for (const det of detectors) {
    const agg = aggregates.get(det.patternId);
    if (!agg || agg.count === 0) continue;

    const freq = +(agg.count / grandTotal).toFixed(4);
    const cefrNum = agg.cefrNums.length > 0 ? median(agg.cefrNums) : CEFR_TO_NUM[det.defaultCefr] || 3;
    const cefr = cefrFromNum(cefrNum);

    // Interference strength (1-10) = z-score of frequency × fossilization, clamped
    // frequency is typically 0..0.4; multiply by 10 and weight by fossilization
    const rawStrength = freq * 10 * (0.5 + 1.0 * det.fossilizationPrior);
    let strength = Math.min(10, Math.max(1, +(rawStrength * 4 + det.fossilizationPrior * 6).toFixed(1)));
    // Floor on prior alone for low-frequency-but-known patterns
    strength = Math.max(strength, +(det.fossilizationPrior * 7).toFixed(1));
    strength = Math.min(10, +strength.toFixed(1));

    // Decay rate: high-freq + high fossilization -> low decay
    const decay = +Math.max(0.05, Math.min(0.85, 0.85 - det.fossilizationPrior * 0.7 - freq * 0.4)).toFixed(2);

    // Spaced-rep: stronger interference -> shorter interval (more frequent review)
    let srWeight: number;
    if (strength >= 9) srWeight = 1;
    else if (strength >= 8) srWeight = 2;
    else if (strength >= 7) srWeight = 3;
    else if (strength >= 6) srWeight = 4;
    else if (strength >= 5) srWeight = 5;
    else if (strength >= 4) srWeight = 6;
    else srWeight = 7;

    const typicalErrors = topN(agg.errorSamples, 5);
    const correctPatterns = topN(agg.correctSamples, 5);

    // Pad to >=3 if needed using high-confidence canonical examples
    const fallbackErrors: Record<string, string[]> = {
      "article-omission": ["I am student.", "She is teacher.", "I have cat.", "We live in house."],
      "article-misuse": ["She is the teacher of math.", "I want a apple.", "He is best player."],
      "third-person-s": ["He don't like coffee.", "She go to work every day.", "It work fine."],
      "present-perfect": ["I live here since 2010.", "She never been to London.", "He just arrived."],
      "auxiliary-drop": ["I going home now.", "You like it?", "She not coming today."],
      "progressive-aspect": ["I read a book now.", "Look! He runs.", "She works at the moment."],
      "preposition-na-w": ["I study on the university.", "Depends from you.", "Married with her."],
      "word-order-noun-adjective": ["language polish", "movie american", "car red"],
      "false-friend": ["I will eventually call you.", "She is very sympathetic.", "I work in fabric."],
      "gerund-vs-infinitive": ["I enjoy to swim.", "She hates to wait.", "We finished to eat."],
      "modal-bare-infinitive": ["I must to go.", "She should to call.", "We can to help."],
      "would-have-conditional": ["If I would know, I would tell you.", "If she would have come, we would see."],
      "negation-attachment": ["I don't know nothing.", "Nobody doesn't come.", "She no like it."],
      "quantifier-much-many": ["many money", "much friends", "how many information"],
      "pluralization": ["mans", "childs", "foots", "tooths"],
      "collocation-make-do": ["make homework", "do a mistake", "make a decision"],
      "preposition-listen-to-discuss": ["listen music", "discuss about it", "explain me the rule"],
      "have-got-overuse": [
        "I have got the answer last week.",
        "She has got many problems yesterday.",
        "We have got finished the project.",
        "They have got received the message.",
      ],
      "subject-pronoun-drop": ["Going home now.", "Is teacher at school.", "Want apple.", "Don't know."],
      "spelling-orthography": ["bizness", "kompjuter", "wajn", "miting", "kofi"],
    };
    const fallbackCorrect: Record<string, string[]> = {
      "article-omission": ["I am a student.", "She is a teacher.", "I have a cat.", "We live in a house."],
      "article-misuse": ["She is the math teacher.", "I want an apple.", "He is the best player."],
      "third-person-s": ["He doesn't like coffee.", "She goes to work every day.", "It works fine."],
      "present-perfect": ["I have lived here since 2010.", "She has never been to London.", "He has just arrived."],
      "auxiliary-drop": ["I am going home now.", "Do you like it?", "She is not coming today."],
      "progressive-aspect": ["I am reading a book now.", "Look! He is running.", "She is working at the moment."],
      "preposition-na-w": ["I study at the university.", "It depends on you.", "Married to her."],
      "word-order-noun-adjective": ["Polish language", "American movie", "red car"],
      "false-friend": [
        "I will possibly call you. (eventually = w końcu)",
        "She is very nice. (sympathetic = współczujący)",
        "I work in a factory. (fabric = tkanina)",
      ],
      "gerund-vs-infinitive": ["I enjoy swimming.", "She hates waiting.", "We finished eating."],
      "modal-bare-infinitive": ["I must go.", "She should call.", "We can help."],
      "would-have-conditional": [
        "If I had known, I would have told you.",
        "If she had come, we would have seen her.",
      ],
      "negation-attachment": ["I don't know anything.", "Nobody comes.", "She doesn't like it."],
      "quantifier-much-many": ["much money", "many friends", "how much information"],
      "pluralization": ["men", "children", "feet", "teeth"],
      "collocation-make-do": ["do homework", "make a mistake", "make a decision"],
      "preposition-listen-to-discuss": ["listen to music", "discuss it", "explain the rule to me"],
      "have-got-overuse": [
        "I had the answer last week.",
        "She had many problems yesterday.",
        "We have finished the project.",
        "They have received the message.",
      ],
      "subject-pronoun-drop": ["I am going home now.", "He is a teacher at school.", "I want an apple.", "I don't know."],
      "spelling-orthography": ["business", "computer", "wine", "meeting", "coffee"],
    };

    const fbErrList = fallbackErrors[det.patternId] || [];
    for (const candidate of fbErrList) {
      if (typicalErrors.length >= 3) break;
      if (!typicalErrors.includes(candidate)) typicalErrors.push(candidate);
    }
    const fbCorrList = fallbackCorrect[det.patternId] || [];
    for (const candidate of fbCorrList) {
      if (correctPatterns.length >= 3) break;
      if (!correctPatterns.includes(candidate)) correctPatterns.push(candidate);
    }

    // Add raw error_type buckets observed in data into matchingErrorCategories
    const observedEt = topN(agg.rawErrorTypes, 5);
    const mergedEt = Array.from(new Set([...det.matchingErrorCategories, ...observedEt])).slice(0, 12);

    entries.push({
      patternId: det.patternId,
      cefrLevel: cefr,
      frequency: freq,
      polishCause: det.polishCause,
      polishCauseEn: det.polishCauseEn,
      typicalErrors,
      correctPatterns,
      interferenceStrength: strength,
      decayRate: decay,
      spacedRepetitionWeight: srWeight,
      matchingSubCategories: det.matchingSubCategories,
      matchingErrorCategories: mergedEt,
      sourceCount: agg.count,
    });
  }

  // Sort by interferenceStrength desc for nicer output
  entries.sort((a, b) => b.interferenceStrength - a.interferenceStrength);

  const outPath = "/root/.openclaw/workspace/polish-interference-index.json";
  fs.writeFileSync(outPath, JSON.stringify(entries, null, 2), "utf8");

  // Verification
  const freqSum = entries.reduce((acc, e) => acc + e.frequency, 0);
  console.log(`\nWrote ${entries.length} patterns to ${outPath}`);
  console.log(`Frequency sum: ${freqSum.toFixed(3)} (overlap allowed)`);
  console.log(`\nTop 5 by interferenceStrength:`);
  for (const e of entries.slice(0, 5)) {
    console.log(
      `  ${e.interferenceStrength.toFixed(1)}  ${e.patternId}  freq=${e.frequency}  src=${e.sourceCount}  cefr=${e.cefrLevel}`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
