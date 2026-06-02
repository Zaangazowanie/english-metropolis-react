// suitability.ts — per-shell content-shape gatekeeping
// ─────────────────────────────────────────────────────────────────────────────
// ROOT-CAUSE FIX for Kelly's audit findings (CC-1, 2026-05-02).
//
// The vocab/exercise pool feeds every shell mechanic without checking that the
// **content shape** fits the **shell mechanic**. Same word "resilience" was
// landing in:
//   - Picture Quiz   (asked to identify an abstract noun visually — unsolvable)
//   - True/False     (gap-fill prompt rendered as TF statement w/ answer shown)
//   - Word Formation (base "RESILIENCE" → target "NOUN" — identity transform)
//   - Sentence Correction (missing-article error in a "tap wrong word" shell)
//
// This module exposes `isVocabSuitableForShell` (gates input vocab) plus
// per-shell `filter*Puzzle` post-build sieves (gate generator output, where
// the unfitness is only visible on the puzzle shape, not the raw vocab).
//
// Heuristics only — no LLM calls. Lists + simple rules per the brief.
// Empty result is fine: each adapter/shell already handles `[]` gracefully and
// renders its built-in demo puzzle.
//
// Wired into:
//   - StudentPractice.buildShellPuzzle  (vocab → generator path)
//   - exercise-adapters.buildPuzzleForShell (Convex exercises → adapter path)
// ─────────────────────────────────────────────────────────────────────────────

import type { ShellKey } from './shell-selector';
import type { VocabItem } from './useStudentVocab';
import type { ConvexExercise } from './exercise-adapters';

// Dev-mode warn helper. Gated on import.meta.env.DEV (Vite). Folds away in
// prod builds. Catch both DEV-undefined and SSR-undefined in case this gets
// imported from a non-browser context.
function devWarn(label: string, payload: unknown): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const env: any = (import.meta as any).env;
    if (env?.DEV) {
      // eslint-disable-next-line no-console
      console.warn(`[suitability] ${label}`, payload);
    }
  } catch {
    // Non-Vite context (tests, SSR). Silent.
  }
}

// ── Concrete-noun heuristic for Picture Quiz / Flashcards image area ─────────
//
// We keep an explicit reject-list of abstract idioms / phrases / abstract
// nouns Kelly flagged + their morphological neighbours. We do NOT keep a
// permit-list — the fallback is "if it's a single word AND not on the abstract
// list AND topic looks depictable, allow it". This is conservative on purpose:
// false-rejects send the shell to its built-in demo (acceptable), false-allows
// land another "back on track" idiom in front of a learner (not acceptable).

const ABSTRACT_REJECT = new Set<string>([
  // Kelly's audit examples
  'resilience', 'resilient', 'resiliency',
  'impose', 'imposed', 'imposing', 'imposition',
  'adrenaline', 'adrenaline rush',
  'authoritarian', 'authoritarianism',
  'protectorate',
  'memoir', 'memoirs',
  // Other common B2/C1 abstract nouns flagged historically
  'integrity', 'autonomy', 'sovereignty', 'precedent', 'consensus',
  'paradox', 'paradigm', 'rhetoric', 'jurisdiction', 'mandate',
  'allegation', 'doctrine', 'liability', 'inference', 'virtue',
  'ambition', 'ambitious', 'curiosity', 'humility', 'envy', 'guilt',
  'nostalgia', 'remorse', 'shame', 'pride', 'doubt', 'belief', 'faith',
  // Process / state nouns
  'persistence', 'consistency', 'redundancy', 'efficiency', 'sufficiency',
  'compliance', 'alignment', 'engagement', 'commitment', 'awareness',
  // Discourse / metalinguistic
  'context', 'subtlety', 'nuance', 'implication', 'assumption',
  // CD's 2026-05-02 audit Q1 — these slipped past the previous gate
  'overwhelmed', 'overwhelming', 'overwhelm',
  'setback', 'setbacks',
  'trope', 'tropes',
  'liberated', 'liberation', 'liberate',
  'flagged', 'flag', // verb-sense; concrete-noun "flag" is rare in adult B2 pool
  'bottleneck', 'bottlenecks',
  'layoff', 'layoffs',
  'mindset', 'mindsets',
  'self-discipline', 'self-disciplined',
  'pickpocket', 'pickpockets', // person noun but unsolvable as visual gestalt
  'dependency', 'dependencies',
  'amenities', 'amenity',
  'apathetic', 'apathy',
  'transaction', 'transactions',
  'review', 'reviews',
  // 2026-05-02 Mike screenshot v2 — Photography Salon served these
  'surge', 'surges', 'surged',
  'epiphany', 'epiphanies',
  'delightful', 'delight', 'delighted',
  'mundane', 'mundaneness',
  'pertinent', 'pertinence',
  'profound', 'profoundly',
  'concise', 'conciseness',
  'sublime', 'sublimely',
  'insightful', 'insight', 'insights',
  'ample', 'amply',
  'innate', 'innately',
  'tangible', 'intangible',
  // 2026-05-02 CD post-BPyNLzPq audit — Photography Salon STILL served these
  'backlash', 'backlashes',
  'skyrocket', 'skyrockets', 'skyrocketing', 'skyrocketed',
]);

// 2026-05-02 CD audit — present-participle / -ing forms that look nominal
// but are verbal in B1-C1 contexts. The -ing form here does NOT depict an
// object; it depicts an ACTION ("running", "skyrocketing"), unsolvable in a
// "what is shown" gestalt MCQ. Reject explicitly.
const PARTICIPLE_REJECT = new Set<string>([
  'running', 'walking', 'going', 'coming', 'getting', 'making', 'taking',
  'saying', 'doing', 'showing', 'building', 'growing', 'increasing',
  'decreasing', 'raising', 'lowering', 'adding', 'removing', 'rising',
  'falling', 'skyrocketing', 'plummeting', 'soaring', 'dropping',
  'spiking', 'surging', 'crashing', 'expanding', 'shrinking', 'thinking',
  'feeling', 'wanting', 'needing', 'wishing', 'hoping', 'trying',
  'helping', 'looking', 'seeing', 'hearing', 'listening', 'reading',
  'writing', 'speaking', 'talking', 'sleeping', 'eating', 'drinking',
  'working', 'playing', 'studying', 'learning', 'teaching',
  'understanding', 'knowing', 'believing', 'meaning', 'happening',
  'becoming', 'living', 'dying', 'changing', 'staying',
]);

// Verbs (and verb-shaped lemmas masquerading as nouns) — Picture Quiz must
// reject all of these even when an upstream pipeline tags them noun. CD's
// audit specifically called out "strengthen" which is unambiguously a verb.
const VERB_REJECT = new Set<string>([
  'strengthen', 'strengthens', 'strengthened', 'strengthening',
  'weaken', 'weakens', 'weakened', 'weakening',
  'soften', 'sharpen', 'lengthen', 'shorten', 'tighten', 'loosen',
  'brighten', 'darken', 'deepen', 'widen', 'lessen', 'heighten',
  'enliven', 'enlighten', 'fasten', 'flatten', 'frighten', 'harden',
  'identify', 'classify', 'specify', 'verify', 'modify', 'simplify',
  'magnify', 'glorify', 'justify', 'qualify', 'clarify', 'amplify',
  'organize', 'organise', 'realize', 'realise', 'utilize', 'utilise',
  'analyze', 'analyse', 'criticize', 'criticise', 'memorize', 'memorise',
  'recognize', 'recognise', 'summarize', 'summarise',
  'overwhelm', 'undermine', 'overcome', 'undertake',
  'liberate', 'allocate', 'eliminate', 'demonstrate', 'illustrate',
  // Common B1/B2 polysemic verbs the practice pipeline keeps slotting as nouns
  'flag', 'review', 'order', 'plan', 'work', 'change', 'help',
]);

// Verb-shape suffix probe — anything ending in -en/-ify/-ize is overwhelmingly
// likely a verb in English, regardless of upstream POS tag.
const VERB_SUFFIX_RE = /(?:[^aeiou]en|ify|ise|ize)$/i;

const ABSTRACT_PHRASE_RE = /(back on track|on track|out of touch|in touch|by and large|in the long run|on the rise|in line with|on hold)/i;

// Phrasal / idiomatic markers — anything with these tokens is hard to depict.
const IDIOMATIC_RE = /\b(?:to|of|on|off|up|down|out|in|over|under|with|by|away|across)\b/i;

// Suffixes typical of abstract nouns / Latinate derivations.
const ABSTRACT_SUFFIX_RE = /(?:tion|sion|ment|ness|ity|ence|ance|ism|hood|ship|cy|al)$/i;

// 2026-05-02 (Mike screenshot v2) — pure adjective suffixes. Picture Quiz
// MUST reject any option that's an adjective; only nouns can be depicted as
// "what is shown". Common English adjective endings:
//   -ful (delightful, joyful), -ous (mysterious, dangerous),
//   -less (homeless, fearless), -ic (academic, organic),
//   -ical (logical, magical), -ive (creative, productive),
//   -able / -ible (visible, comfortable), -ant / -ent (different, important),
//   -ane (mundane, humane), -ine (genuine), -ese (Chinese — but those are
//   nationalities, intentionally NOT in this list)
// Excluded: -ly (adverb suffix, handled separately), -y (too generic).
const ADJ_SUFFIX_RE = /(?:ful|ous|less|ical|ive|able|ible|ane|ene|ine)$/i;
// -ic and -al are suffixes shared between adjectives and some nouns
// (music, choral). Apply with a guard: only reject if 5+ chars (skips
// "ic", "al" alone) and not in a small noun-allow list.
const SHORT_AMBIGUOUS_SUFFIX_RE = /(?:ic|al|ant|ent)$/i;
const SHORT_AMBIGUOUS_NOUN_ALLOW = new Set(['plant', 'plant', 'agent', 'event', 'parent', 'student', 'patient', 'present', 'desert', 'concert', 'cement', 'animal', 'manual', 'capital', 'medal', 'metal', 'pedal', 'hospital', 'crystal', 'fossil', 'fabric', 'plastic', 'magic', 'music', 'topic', 'panic', 'logic', 'epic', 'comic']);

// Topics from the keyword enrichment pipeline that ARE depictable. When
// vocab.topic is set to one of these, we let the item through even if the
// suffix heuristic would otherwise reject. This catches eg. "decoration"
// (abstract suffix but the topic is `clothing`/`house`).
const DEPICTABLE_TOPICS = new Set([
  'food', 'travel', 'weather', 'clothing', 'body', 'animal', 'animals',
  'nature', 'city', 'house', 'home', 'transport', 'sport', 'sports',
  'kitchen', 'office', 'school', 'tools', 'colour', 'colours', 'color', 'colors',
  'family',
]);

function looksConcreteNoun(word: string, topic?: string): boolean {
  const w = word.trim().toLowerCase();
  if (!w) return false;
  // Multi-word phrases → always reject for Picture Quiz (CD audit rule 3).
  // Even compound nouns like "ice cream" are visually ambiguous in the salon
  // mechanic; the answer should be ONE concrete object.
  if (/\s/.test(w)) return false;
  // Hyphenated multi-tokens ("self-discipline") → reject.
  if (w.includes('-')) return false;
  // Hard verb list → reject (CD rule 4: "strengthen" must fail).
  if (VERB_REJECT.has(w)) return false;
  // Verb-suffix heuristic (CD rule 4): -en after consonant / -ify / -ize / -ise.
  if (VERB_SUFFIX_RE.test(w)) return false;
  // Present-participle / -ing rule (CD post-BPyNLzPq audit): -ing forms in
  // PARTICIPLE_REJECT are verbal, not nominal — reject regardless of upstream
  // POS tag. ("skyrocketing", "running", "increasing")
  if (w.endsWith('ing') && PARTICIPLE_REJECT.has(w)) return false;
  // Hard abstract list → reject.
  if (ABSTRACT_REJECT.has(w)) return false;
  // Topic-driven allow: depictable topic short-circuits the suffix check.
  if (topic && DEPICTABLE_TOPICS.has(topic.toLowerCase())) return true;
  // Adjective-suffix heuristic (Mike screenshot v2 2026-05-02): no adjective
  // is depictable as "what is shown" — reject -ful/-ous/-less/-ical/-ive/etc.
  if (ADJ_SUFFIX_RE.test(w)) return false;
  // Short ambiguous suffixes (-ic / -al / -ant / -ent) — likely adjective UNLESS
  // it's in the small concrete-noun allow set (plant/animal/etc.).
  if (SHORT_AMBIGUOUS_SUFFIX_RE.test(w) && w.length >= 5 && !SHORT_AMBIGUOUS_NOUN_ALLOW.has(w)) return false;
  // Suffix heuristic (CD rule 1, extended): abstract-noun suffixes reject.
  if (ABSTRACT_SUFFIX_RE.test(w)) return false;
  // Default: allow single-word, non-suffixed, non-listed items.
  return true;
}

// ── Strict whitelist mode (CD post-BPyNLzPq audit, 2026-05-02) ───────────────
// Picture Quiz suitability has a "default-allow on no signal" tail in
// looksConcreteNoun — single-word, non-suffixed, non-listed items pass. That's
// the leak path: novel abstractions ("backlash") with no recognised suffix
// fall through. STRICT mode flips the polarity:
//   PASS only if the word is on a curated concrete-noun whitelist OR the
//   topic is in DEPICTABLE_TOPICS. Otherwise REJECT.
// Cost: more questions dropped → more demo fallback. Mike accepts.
const CONCRETE_NOUN_WHITELIST = new Set<string>([
  // Food + drink
  'apple', 'banana', 'orange', 'pear', 'grape', 'lemon', 'cherry', 'peach',
  'strawberry', 'tomato', 'potato', 'carrot', 'onion', 'cucumber', 'pepper',
  'pizza', 'sandwich', 'salad', 'soup', 'meat', 'beef', 'chicken', 'fish',
  'cheese', 'butter', 'bread', 'rice', 'pasta', 'noodles', 'egg', 'milk',
  'juice', 'water', 'coffee', 'tea', 'wine', 'beer', 'sugar', 'salt',
  'cake', 'cookie', 'biscuit', 'chocolate', 'candy', 'icecream', 'honey',
  // Clothing
  'shirt', 'tshirt', 'trousers', 'pants', 'jeans', 'jacket', 'coat',
  'sweater', 'dress', 'skirt', 'shoe', 'shoes', 'boot', 'boots', 'sock',
  'socks', 'hat', 'cap', 'glove', 'gloves', 'scarf', 'belt', 'tie',
  'glasses', 'sunglasses', 'umbrella', 'bag', 'backpack', 'wallet', 'watch',
  // House + furniture
  'house', 'home', 'door', 'window', 'wall', 'roof', 'floor', 'ceiling',
  'stairs', 'kitchen', 'bedroom', 'bathroom', 'living', 'garage', 'garden',
  'chair', 'table', 'desk', 'sofa', 'couch', 'bed', 'pillow', 'blanket',
  'lamp', 'mirror', 'shelf', 'cupboard', 'wardrobe', 'drawer', 'curtain',
  // Kitchen
  'plate', 'bowl', 'cup', 'mug', 'glass', 'bottle', 'jar', 'fork', 'spoon',
  'knife', 'pot', 'pan', 'kettle', 'oven', 'fridge', 'sink', 'tap',
  // Tech / objects
  'phone', 'computer', 'laptop', 'tablet', 'camera', 'television', 'tv',
  'radio', 'clock', 'pencil', 'pen', 'book', 'newspaper', 'magazine',
  'paper', 'envelope', 'key', 'card', 'ticket', 'map', 'photo', 'picture',
  'box', 'basket', 'ball', 'toy', 'doll', 'flag', 'candle', 'gift',
  // Transport
  'car', 'bus', 'train', 'plane', 'airplane', 'boat', 'ship', 'bike',
  'bicycle', 'motorbike', 'truck', 'taxi', 'helicopter', 'rocket',
  // Body parts
  'head', 'hair', 'face', 'eye', 'eyes', 'ear', 'ears', 'nose', 'mouth',
  'tooth', 'teeth', 'tongue', 'lip', 'lips', 'cheek', 'chin', 'neck',
  'shoulder', 'arm', 'elbow', 'hand', 'finger', 'thumb', 'leg', 'knee',
  'foot', 'feet', 'toe', 'heart', 'brain', 'skin', 'bone',
  // Animals
  'dog', 'cat', 'bird', 'fish', 'horse', 'cow', 'pig', 'sheep', 'goat',
  'chicken', 'duck', 'rabbit', 'mouse', 'rat', 'lion', 'tiger', 'bear',
  'wolf', 'fox', 'deer', 'elephant', 'monkey', 'snake', 'frog', 'turtle',
  'spider', 'butterfly', 'bee', 'ant', 'shark', 'whale', 'dolphin', 'eagle',
  // Nature
  'tree', 'flower', 'leaf', 'grass', 'plant', 'forest', 'mountain', 'hill',
  'river', 'lake', 'ocean', 'sea', 'beach', 'island', 'desert', 'cave',
  'rock', 'stone', 'sand', 'mud', 'sky', 'cloud', 'sun', 'moon', 'star',
  'rainbow', 'rain', 'snow', 'ice', 'fire', 'wind', 'storm', 'lightning',
  // City / places
  'city', 'town', 'village', 'street', 'road', 'bridge', 'park', 'square',
  'church', 'temple', 'mosque', 'school', 'hospital', 'library', 'museum',
  'theatre', 'cinema', 'restaurant', 'cafe', 'shop', 'store', 'market',
  'bank', 'station', 'airport', 'port', 'castle', 'palace', 'tower',
  'fountain', 'statue', 'sign',
  // Tools
  'hammer', 'nail', 'screw', 'screwdriver', 'saw', 'drill', 'wrench',
  'rope', 'chain', 'ladder', 'bucket', 'broom', 'mop', 'shovel', 'rake',
  // Music / instruments
  'guitar', 'piano', 'drum', 'violin', 'trumpet', 'flute',
  // Sport
  'football', 'basketball', 'tennis', 'racket', 'bat', 'helmet', 'medal',
  'trophy', 'goal', 'net',
]);

function looksConcreteNounStrict(word: string, topic?: string): boolean {
  const w = word.trim().toLowerCase();
  if (!w) return false;
  // Structural rejects always apply (no whitelist override).
  if (/\s/.test(w)) return false;
  if (w.includes('-')) return false;
  // Whitelist FAST-PATH (CD: "flag" must PASS even though it's in VERB_REJECT
  // for its verb sense — when on the explicit whitelist, the noun sense wins).
  if (CONCRETE_NOUN_WHITELIST.has(w)) return true;
  // Below this line: word is NOT whitelisted, so apply all reject filters.
  if (VERB_REJECT.has(w)) return false;
  if (VERB_SUFFIX_RE.test(w)) return false;
  if (w.endsWith('ing') && PARTICIPLE_REJECT.has(w)) return false;
  if (ABSTRACT_REJECT.has(w)) return false;
  if (ADJ_SUFFIX_RE.test(w)) return false;
  if (SHORT_AMBIGUOUS_SUFFIX_RE.test(w) && w.length >= 5 && !SHORT_AMBIGUOUS_NOUN_ALLOW.has(w)) return false;
  if (ABSTRACT_SUFFIX_RE.test(w)) return false;
  // STRICT: positive evidence required. Depictable topic counts.
  if (topic && DEPICTABLE_TOPICS.has(topic.toLowerCase())) return true;
  // No positive signal → reject. NO default-allow tail.
  return false;
}

// ── POS heuristic (used for word-formation identity-transform check) ─────────

type PosTag = 'noun' | 'verb' | 'adj' | 'adv' | 'unknown';

function posFromTag(tag?: string): PosTag {
  const t = (tag ?? '').trim().toLowerCase();
  if (!t) return 'unknown';
  if (t.startsWith('noun')) return 'noun';
  if (t.startsWith('verb')) return 'verb';
  if (t.startsWith('adj'))  return 'adj';
  if (t.startsWith('adv'))  return 'adv';
  return 'unknown';
}

// Explicit POS lookup for common short roots whose suffix gives no signal.
// Maintained ad-hoc for the Word Formation pool (BASE words shipped by the
// generator + the Convex pipeline). Add new entries when the panel/heuristic
// labels something incorrectly.
//
// CD audit 2026-05-02: panel showed "BRAVE NOUN → NOUN" + "INFORM NOUN → NOUN"
// because suffix heuristic returned 'unknown' and the local panel fallback was
// hard-coded to NOUN. Both root causes — wrong fallback in panel + missing
// explicit lookup — fixed in this commit.
const KNOWN_BASE_POS: Record<string, PosTag> = {
  // Adjectives (no clear suffix marker)
  brave: 'adj', kind: 'adj', smart: 'adj', tall: 'adj', short: 'adj',
  quick: 'adj', slow: 'adj', cold: 'adj', hot: 'adj', warm: 'adj',
  cool: 'adj', bright: 'adj', dark: 'adj', quiet: 'adj', loud: 'adj',
  hard: 'adj', soft: 'adj', strong: 'adj', weak: 'adj', sad: 'adj',
  glad: 'adj', mad: 'adj', wise: 'adj', true: 'adj', false: 'adj',
  free: 'adj', deep: 'adj', wide: 'adj', long: 'adj', young: 'adj',
  old: 'adj', new: 'adj', good: 'adj', bad: 'adj', big: 'adj',
  small: 'adj', high: 'adj', low: 'adj', clean: 'adj', clear: 'adj',
  fair: 'adj', just: 'adj', poor: 'adj', rich: 'adj', safe: 'adj',
  sure: 'adj', sweet: 'adj', light: 'adj', mean: 'adj', plain: 'adj',
  // Verbs (no -ate/-ify/-ize suffix)
  inform: 'verb', prepare: 'verb', consider: 'verb', decide: 'verb',
  develop: 'verb', manage: 'verb', achieve: 'verb', accept: 'verb',
  agree: 'verb', appear: 'verb', argue: 'verb', arrive: 'verb',
  attend: 'verb', begin: 'verb', believe: 'verb', build: 'verb',
  buy: 'verb', call: 'verb', care: 'verb', carry: 'verb', catch: 'verb',
  choose: 'verb', come: 'verb', compare: 'verb', complain: 'verb',
  complete: 'verb', confirm: 'verb', consist: 'verb', contain: 'verb',
  continue: 'verb', cost: 'verb', cover: 'verb', cut: 'verb', deal: 'verb',
  describe: 'verb', destroy: 'verb', differ: 'verb',
  discover: 'verb', discuss: 'verb', do: 'verb', draw: 'verb', drive: 'verb',
  eat: 'verb', enjoy: 'verb', enter: 'verb', exist: 'verb', expect: 'verb',
  explain: 'verb', explore: 'verb', fail: 'verb', feel: 'verb', find: 'verb',
  finish: 'verb', fly: 'verb', forget: 'verb', forgive: 'verb', form: 'verb',
  get: 'verb', give: 'verb', go: 'verb', grow: 'verb', happen: 'verb',
  have: 'verb', hear: 'verb', help: 'verb', hold: 'verb', hope: 'verb',
  imagine: 'verb', improve: 'verb', include: 'verb', increase: 'verb',
  invent: 'verb', invite: 'verb', join: 'verb', jump: 'verb', keep: 'verb',
  know: 'verb', laugh: 'verb', lead: 'verb', learn: 'verb', leave: 'verb',
  let: 'verb', lie: 'verb', listen: 'verb', live: 'verb', look: 'verb',
  lose: 'verb', love: 'verb', make: 'verb', meet: 'verb',
  mind: 'verb', miss: 'verb', move: 'verb', need: 'verb', notice: 'verb',
  obey: 'verb', offer: 'verb', open: 'verb', own: 'verb', pay: 'verb',
  perform: 'verb', permit: 'verb', persuade: 'verb', pick: 'verb', play: 'verb',
  prefer: 'verb', present: 'verb', press: 'verb', prevent: 'verb',
  produce: 'verb', promise: 'verb', protect: 'verb', prove: 'verb',
  provide: 'verb', pull: 'verb', push: 'verb', put: 'verb', read: 'verb',
  receive: 'verb', refer: 'verb', refuse: 'verb', remain: 'verb',
  remember: 'verb', remind: 'verb', remove: 'verb', repair: 'verb',
  repeat: 'verb', reply: 'verb', report: 'verb', require: 'verb',
  resemble: 'verb', respect: 'verb', respond: 'verb', rest: 'verb',
  return: 'verb', reveal: 'verb', ride: 'verb', ring: 'verb', rise: 'verb',
  run: 'verb', say: 'verb', see: 'verb', seek: 'verb', seem: 'verb',
  sell: 'verb', send: 'verb', serve: 'verb', set: 'verb', share: 'verb',
  show: 'verb', sing: 'verb', sit: 'verb', sleep: 'verb', smell: 'verb',
  smile: 'verb', sound: 'verb', speak: 'verb', spend: 'verb', stand: 'verb',
  start: 'verb', stay: 'verb', stop: 'verb', study: 'verb', succeed: 'verb',
  suggest: 'verb', supply: 'verb', support: 'verb', suppose: 'verb',
  swim: 'verb', take: 'verb', talk: 'verb', teach: 'verb', tell: 'verb',
  think: 'verb', throw: 'verb', touch: 'verb', travel: 'verb', try: 'verb',
  turn: 'verb', understand: 'verb', use: 'verb', visit: 'verb', wait: 'verb',
  wake: 'verb', walk: 'verb', want: 'verb', watch: 'verb', wear: 'verb',
  win: 'verb', wish: 'verb', work: 'verb', worry: 'verb', write: 'verb',
  yell: 'verb',
  // Common nouns that could be confused
  child: 'noun', man: 'noun', woman: 'noun', friend: 'noun', boy: 'noun',
  girl: 'noun', baby: 'noun', father: 'noun', mother: 'noun', son: 'noun',
  daughter: 'noun', brother: 'noun', sister: 'noun', family: 'noun',
  house: 'noun', home: 'noun', school: 'noun', job: 'noun',
  car: 'noun', book: 'noun', day: 'noun', night: 'noun', week: 'noun',
  month: 'noun', year: 'noun', time: 'noun', life: 'noun', world: 'noun',
  // Adverbs (no -ly)
  well: 'adv', often: 'adv', never: 'adv', always: 'adv', sometimes: 'adv',
  here: 'adv', there: 'adv', now: 'adv', then: 'adv', very: 'adv',
};

// Public POS resolver for a base/lemma word. Lookup table first (catches
// BRAVE / INFORM / etc.), then suffix heuristic, finally 'unknown'.
export function posFromBaseWord(word: string): PosTag {
  const w = (word ?? '').trim().toLowerCase();
  if (!w) return 'unknown';
  const known = KNOWN_BASE_POS[w];
  if (known) return known;
  return posFromSuffix(w);
}

// Suffix-based POS guess for when partOfSpeech isn't supplied.
// Order matters: adv (-ly) before adj catch-all -y; noun suffixes BEFORE adj
// catch-alls so e.g. "bravery" reads as noun not adj. Verb -en/-ify/-ize etc
// before noun -age/-ee so we don't mis-resolve "agent". Per CD's brief.
function posFromSuffix(word: string): PosTag {
  const w = word.toLowerCase();
  // Adverb first — "happily" must read adv before adj catches the trailing -y.
  if (/[a-z]ly$/.test(w)) return 'adv';
  // Verb suffixes — must come before noun -age (catches "manage" not "vintage").
  if (/(?:ate|ify|ise|ize|fy)$/.test(w)) return 'verb';
  // Verb -en after consonant (strengthen, weaken). Bare -en (oven, kitten) →
  // not necessarily a verb; keep this restrictive.
  if (/[bcdfghjklmnpqrstvwxz]en$/.test(w)) return 'verb';
  // Noun suffixes (CD's brief — extended). -ery/-ory/-ary handled here so
  // "bravery" reads as noun before any adj catch-all.
  if (/(?:tion|sion|ment|ness|ity|ence|ance|ism|hood|ship|cy|dom|age|ery|ory|ee|eer|ess|ant|ent|or|er|ier|ist|ling|let|ster|teen|ty)$/.test(w)) return 'noun';
  // Adjective suffixes (CD's brief).
  if (/(?:able|ible|ial|eous|ious|ful|less|ive|ical|ic|ish|ous|ary|y)$/.test(w)) return 'adj';
  // Bare -al — could be noun (animal, signal) or adj (cultural). Default adj
  // since the noun cases here are the minority.
  if (/al$/.test(w)) return 'adj';
  return 'unknown';
}

function inferPos(item: { word: string; partOfSpeech?: string }): PosTag {
  const tagged = posFromTag(item.partOfSpeech);
  if (tagged !== 'unknown') return tagged;
  return posFromSuffix(item.word);
}

// ── True/False prompt-shape rules ─────────────────────────────────────────────
// A suitable T/F statement is a complete declarative sentence. If the prompt
// looks like a gap-fill (`___`, `[GAP]`, `BLANK`), or starts with "Choose" /
// "Pick" / "Select" / "Which", reject — those are MC/Gap-fill prompts being
// misrouted into the T/F shell.
const TF_BLANK_RE = /(?:_{2,}|\[GAP\d*\]|\bBLANK\b|\.{3,})/i;
const TF_INSTRUCTION_RE = /^(?:choose|pick|select|which|complete|fill)/i;

function looksLikeDeclarative(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (TF_BLANK_RE.test(t)) return false;
  if (TF_INSTRUCTION_RE.test(t)) return false;
  // A T/F statement should have at least 3 tokens. Single-word "answer"
  // strings stuffed into the prompt slot get rejected.
  if (t.split(/\s+/).length < 3) return false;
  return true;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Pre-generator gate: filter the vocab pool to items whose content shape
 * matches the shell mechanic. Returning a smaller list is fine — generators
 * + shells handle empty pools gracefully (built-in demo puzzle).
 *
 * The 32 shells not listed here pass through unchanged (looser shape needs).
 */
export function filterVocabForShell(vocab: VocabItem[], shell: ShellKey): VocabItem[] {
  if (!vocab || vocab.length === 0) return vocab;

  const dropped: Array<{ word: string; reason: string }> = [];
  const keep = (v: VocabItem, ok: boolean, reason: string) => {
    if (!ok) dropped.push({ word: v.word, reason });
    return ok;
  };

  let out: VocabItem[];
  switch (shell) {
    case 'picturequiz': {
      out = vocab.filter((v) =>
        keep(v, looksConcreteNoun(v.word, v.topic ?? v.topics?.[0]),
             'not a concrete-noun candidate (abstract / idiomatic / phrasal)'),
      );
      break;
    }
    case 'flashcards': {
      // Flashcards card has an image area at top (same asset gap as Picture
      // Quiz per Kelly finding #10). Apply the same concrete-noun gate so we
      // don't render an empty image slot above an abstract idiom.
      out = vocab.filter((v) =>
        keep(v, looksConcreteNoun(v.word, v.topic ?? v.topics?.[0]),
             'not a concrete-noun candidate (image area would be empty)'),
      );
      break;
    }
    case 'wordformation': {
      // Reject items where we can't determine the POS — without a known POS
      // we can't ensure the target form will actually differ from the base.
      // Also reject items whose word IS already in every transformation
      // target form we'd ask for (single-syllable irregulars rarely
      // round-trip cleanly through the suffix templates).
      out = vocab.filter((v) => {
        const pos = inferPos(v);
        const ok = pos !== 'unknown';
        return keep(v, ok, `POS unknown — can't guarantee non-identity transform`);
      });
      break;
    }
    case 'sentencecorrection': {
      // Need an example sentence we can mutate via single-word-substitution
      // patterns. Items with no exampleEn are unusable AND items whose
      // example is too short (< 5 tokens) leave nowhere to plant an error
      // span the student can tap.
      out = vocab.filter((v) => {
        const ex = (v.exampleEn ?? '').trim();
        if (!ex) return keep(v, false, 'no example sentence');
        if (ex.split(/\s+/).length < 5) return keep(v, false, 'example too short');
        return true;
      });
      break;
    }
    default:
      out = vocab;
  }

  if (dropped.length > 0 && out.length !== vocab.length) {
    devWarn(`vocab dropped for shell=${shell} (${dropped.length}/${vocab.length})`, dropped.slice(0, 8));
  }
  return out;
}

/**
 * Pre-adapter gate for the Convex `exercises` path. Filters exercises whose
 * shape doesn't fit the shell mechanic. Returning [] is fine — the adapter
 * yields null and StudentPractice falls back to the vocab-path puzzle (or
 * the shell's built-in demo).
 */
export function filterExercisesForShell(
  exercises: ConvexExercise[],
  shell: ShellKey,
): ConvexExercise[] {
  if (!exercises || exercises.length === 0) return exercises;

  const dropped: Array<{ exerciseId: string; reason: string }> = [];
  let out: ConvexExercise[];

  switch (shell) {
    case 'truefalse': {
      // Exercise must have at least one MC question whose prompt reads as a
      // declarative statement (no `___`, no "Choose…" instruction).
      out = exercises.filter((ex) => {
        const ok = (ex.questions ?? []).some(
          (q) => q.type === 'multiple-choice' && looksLikeDeclarative(q.prompt),
        );
        if (!ok) dropped.push({ exerciseId: ex.exerciseId, reason: 'no declarative MC prompt for T/F' });
        return ok;
      });
      break;
    }
    case 'picturequiz':
    case 'flashcards': {
      // Need at least one question whose answer is a depictable concrete noun.
      out = exercises.filter((ex) => {
        const ok = (ex.questions ?? []).some(
          (q) => looksConcreteNoun(q.answer, ex.focusArea),
        );
        if (!ok) dropped.push({ exerciseId: ex.exerciseId, reason: 'no concrete-noun answer' });
        return ok;
      });
      break;
    }
    default:
      out = exercises;
  }

  if (dropped.length > 0 && out.length !== exercises.length) {
    devWarn(`exercises dropped for shell=${shell} (${dropped.length}/${exercises.length})`, dropped.slice(0, 8));
  }
  return out;
}

// ── Post-generator filters: gate the puzzle OUTPUT for shells where the
// unfitness only becomes visible after the generator runs. Each takes a
// puzzle (typed loosely as `unknown` to avoid coupling to generator shapes)
// and returns either the puzzle, a trimmed copy, or `null` (which causes
// StudentPractice to fall back to the next puzzle source). ─────────────────

interface MaybeWordFormation {
  items?: Array<{
    id?: string;
    base_word?: string;
    target_pos?: string;
    answer?: string;
    sentence?: string;
    /** Optional meta block when adapter supplies known POS for the base lemma. */
    meta?: { basePos?: string; targetPos?: string };
  }>;
}
interface MaybeSentenceCorrection {
  items?: Array<{ id?: string; sentence_with_error?: string; error_span?: [number, number]; correction?: string }>;
}
interface MaybeTrueFalse {
  statements?: Array<{ id?: string; text?: string; answer?: boolean }>;
  questions?: Array<{ q?: string; ans?: boolean }>;
}
interface MaybeCrossword {
  size?: number;
  words?: Array<{ id?: number; clue?: string; answer?: string }>;
}
interface MaybeWordsearch {
  size?: number;
  words?: Array<{ word?: string; clue?: string }>;
  grid?: string[][];
}
interface MaybePictureQuiz {
  items?: Array<{
    id?: string;
    options?: string[];
    answerIndex?: number;
  }>;
}

const MIN_AFTER_FILTER = 3;

// Levenshtein for stem-overlap rejection in Word Formation (CD rule 3).
// Tiny iterative two-row implementation — input strings here are short.
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = new Array<number>(n + 1);
  let curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

/**
 * Word Formation: drop items where the answer letter-equals the base word
 * (CD's "RESILIENCE → resilience" BLOCKER — identity transform). Also rejects:
 *   - POS equivalence: posOf(base) === posOf(answer) (answer adds nothing).
 *     Uses meta.basePos / meta.targetPos when adapter provides them; falls
 *     back to the suffix-driven posFromSuffix() heuristic.
 *   - Levenshtein < 2: catches typo-style "answers" like RESILIENCE → resiliencey.
 *   - Stem-prefix overlap of ≥85% with single-char shave.
 */
export function filterWordFormationPuzzle(puzzle: unknown): unknown | null {
  const p = puzzle as MaybeWordFormation | null;
  if (!p?.items?.length) return puzzle;
  const dropped: Array<{ id?: string; reason: string }> = [];
  const items = p.items.filter((it) => {
    const base = (it.base_word ?? '').toLowerCase();
    const ans = (it.answer ?? '').toLowerCase();
    if (!base || !ans) {
      dropped.push({ id: it.id, reason: 'missing base or answer' });
      return false;
    }
    // (1) Strict identity check — CD audit BLOCKER.
    if (base === ans) {
      dropped.push({ id: it.id, reason: 'identity transform (base === answer)' });
      return false;
    }
    // (2) POS-equivalence check. CD audit 2026-05-02: previously trusted
    // adapter meta.basePos blindly; pipeline mis-tags BRAVE/INFORM as 'noun'
    // even though they're adjective/verb. Now we ALWAYS run posFromBaseWord
    // on the literal base lemma (lookup table + suffix) and override the
    // meta tag whenever the lookup disagrees. Same for the answer side.
    // If base + answer resolve to the same POS, the "transformation" is
    // non-existent (RESILIENCE noun → resilience noun).
    const basePosFromWord = posFromBaseWord(base);
    const basePosFromMeta = it.meta?.basePos ? posFromTag(it.meta.basePos) : 'unknown';
    const basePosTag: PosTag = basePosFromWord !== 'unknown' ? basePosFromWord : basePosFromMeta;
    const ansPosFromWord = posFromBaseWord(ans);
    const ansPosFromMeta = it.meta?.targetPos
      ? posFromTag(it.meta.targetPos)
      : (it.target_pos ? posFromTag(it.target_pos) : 'unknown');
    const ansPosTag: PosTag = ansPosFromWord !== 'unknown' ? ansPosFromWord : ansPosFromMeta;
    if (basePosTag !== 'unknown' && ansPosTag !== 'unknown' && basePosTag === ansPosTag) {
      dropped.push({ id: it.id, reason: `POS-equivalence (${basePosTag} → ${ansPosTag})` });
      return false;
    }
    // (3) Levenshtein < 2: near-identical strings are typo-tier non-transforms.
    if (levenshtein(base, ans) < 2) {
      dropped.push({ id: it.id, reason: `levenshtein < 2 (${base} ↔ ${ans})` });
      return false;
    }
    // (4) Stem-prefix overlap of ≥85% with no real morphological change.
    const minLen = Math.min(base.length, ans.length);
    if (minLen >= 4) {
      const overlap = base.startsWith(ans) || ans.startsWith(base);
      const pctSame = minLen / Math.max(base.length, ans.length);
      if (overlap && pctSame > 0.85 && Math.abs(base.length - ans.length) <= 1) {
        dropped.push({ id: it.id, reason: 'near-identity (single-char shave)' });
        return false;
      }
    }
    return true;
  });
  if (dropped.length > 0) devWarn(`wordformation items dropped (${dropped.length}/${p.items.length})`, dropped);
  if (items.length < MIN_AFTER_FILTER) return null;
  return { ...p, items };
}

/**
 * Picture Quiz: drop items where the answer OR ANY distractor fails the
 * concrete-noun check. CD's audit caught Q1 with answer + distractors all
 * abstract (`overwhelmed/strengthen/setback/trope`) — none depictable. Rule:
 * if even ONE option fails looksConcreteNounStrict, the WHOLE question is
 * dropped (we can't render a 4-option MC where some options are unsolvable).
 *
 * 2026-05-02 (CD post-BPyNLzPq audit): switched from `looksConcreteNoun`
 * (loose, default-allow) to `looksConcreteNounStrict` (whitelist + depictable
 * topic only). Cost: more questions dropped → more demo fallback. Mike
 * accepts the trade. Better to drop than mislead. The previous loose path
 * still leaked novel abstractions ("backlash") that had no recognised suffix
 * and weren't on any reject list.
 *
 * Also rejects multi-token / hyphenated options (handled inside
 * looksConcreteNounStrict) and verb-shaped lemmas masquerading as nouns
 * ("strengthen", "liberate") via the verb-suffix probe + VERB_REJECT list.
 */
export function filterPictureQuizPuzzle(puzzle: unknown): unknown | null {
  const p = puzzle as MaybePictureQuiz | null;
  if (!p?.items?.length) return puzzle;
  const dropped: Array<{ id?: string; reason: string }> = [];
  const items = p.items.filter((it) => {
    const opts = Array.isArray(it.options) ? it.options : [];
    if (opts.length < 2) {
      dropped.push({ id: it.id, reason: 'fewer than 2 options' });
      return false;
    }
    const failures = opts.filter((o) => !looksConcreteNounStrict(o));
    if (failures.length > 0) {
      dropped.push({
        id: it.id,
        reason: `non-concrete option(s): ${failures.slice(0, 4).join(', ')}`,
      });
      return false;
    }
    return true;
  });
  if (dropped.length > 0) devWarn(`picturequiz items dropped (${dropped.length}/${p.items.length})`, dropped);
  if (items.length < MIN_AFTER_FILTER) return null;
  return { ...p, items };
}

/**
 * Sentence Correction: shell mechanic is "tap the wrong word". A missing-word
 * (article omission, plural-s drop) error has no wrong word to tap — the
 * student needs to insert. Drop items whose error span is empty/zero-width.
 *
 * This kills the article-omission pattern (`generateSentenceCorrection`'s
 * pattern #1) and the missing-plural-s pattern (#4) when they fire on a
 * particular sentence. Substitution-style errors (#2 wrong verb form, #3
 * wrong preposition) survive because their spans are non-empty.
 */
export function filterSentenceCorrectionPuzzle(puzzle: unknown): unknown | null {
  const p = puzzle as MaybeSentenceCorrection | null;
  if (!p?.items?.length) return puzzle;
  const dropped: Array<{ id?: string; reason: string }> = [];
  const items = p.items.filter((it) => {
    const span = it.error_span;
    const sentence = it.sentence_with_error ?? '';
    const correction = it.correction ?? '';
    if (!Array.isArray(span) || span.length !== 2) {
      dropped.push({ id: it.id, reason: 'no error_span' });
      return false;
    }
    const [a, b] = span;
    // Span width must be >= 1 char (otherwise nothing to tap).
    if (b - a < 1) {
      dropped.push({ id: it.id, reason: 'zero-width span (missing-word error)' });
      return false;
    }
    // The word at the span must overlap the sentence (defensive — span out
    // of bounds means a malformed mutation).
    if (a < 0 || b > sentence.length) {
      dropped.push({ id: it.id, reason: 'span out of bounds' });
      return false;
    }
    // Correction text must differ from what's at the span (else tapping the
    // word doesn't change anything).
    const atSpan = sentence.slice(a, b).toLowerCase();
    if (atSpan === correction.toLowerCase()) {
      dropped.push({ id: it.id, reason: 'correction equals current span' });
      return false;
    }
    // Reject corrections that contain a trailing space — those are
    // article-insertion patterns ("the ") where the wrong-word IS absence.
    if (/\s$/.test(correction)) {
      dropped.push({ id: it.id, reason: 'insertion-style correction (trailing space)' });
      return false;
    }
    return true;
  });
  if (dropped.length > 0) devWarn(`sentencecorrection items dropped (${dropped.length}/${p.items.length})`, dropped);
  if (items.length < MIN_AFTER_FILTER) return null;
  return { ...p, items };
}

/**
 * True/False: drop statements that look like Gap-fill prompts (contain `___`
 * or `[GAP]`) or "Choose…" instruction copy. Handles BOTH the generator
 * output shape ({ statements: [...] }) and the adapter output shape
 * ({ questions: [...] }) since both flow into the same shell.
 */
export function filterTrueFalsePuzzle(puzzle: unknown): unknown | null {
  const p = puzzle as MaybeTrueFalse | null;
  if (!p) return puzzle;
  const dropped: Array<{ id?: string; reason: string }> = [];

  if (Array.isArray(p.statements)) {
    const statements = p.statements.filter((s) => {
      if (!looksLikeDeclarative(s.text ?? '')) {
        dropped.push({ id: s.id, reason: 'non-declarative statement (gap-fill or instruction)' });
        return false;
      }
      return true;
    });
    if (dropped.length > 0) devWarn(`truefalse statements dropped (${dropped.length}/${p.statements.length})`, dropped);
    if (statements.length < MIN_AFTER_FILTER) return null;
    return { ...p, statements };
  }
  if (Array.isArray(p.questions)) {
    const questions = p.questions.filter((q) => {
      if (!looksLikeDeclarative(q.q ?? '')) {
        dropped.push({ reason: 'non-declarative question (gap-fill or instruction)' });
        return false;
      }
      return true;
    });
    if (dropped.length > 0) devWarn(`truefalse questions dropped (${dropped.length}/${p.questions.length})`, dropped);
    if (questions.length < MIN_AFTER_FILTER) return null;
    return { ...p, questions };
  }
  return puzzle;
}

/**
 * Crossword: each entry must have a UNIQUE clue. Kelly's audit caught 4
 * crossword entries sharing the literal clue "Write the past participle." —
 * generic instruction repeated as if it's a clue.
 *
 * If duplicates are found we drop the duplicate occurrences (keep the first).
 * If we'd be left under MIN_AFTER_FILTER, return null so the shell falls back.
 */
export function filterCrosswordPuzzle(puzzle: unknown): unknown | null {
  const p = puzzle as MaybeCrossword | null;
  if (!p?.words?.length) return puzzle;
  const seenClues = new Set<string>();
  const dropped: Array<{ id?: number; reason: string }> = [];
  const words = p.words.filter((w) => {
    const clue = (w.clue ?? '').trim().toLowerCase();
    if (!clue) {
      dropped.push({ id: w.id, reason: 'empty clue' });
      return false;
    }
    if (seenClues.has(clue)) {
      dropped.push({ id: w.id, reason: `duplicate clue "${clue.slice(0, 40)}"` });
      return false;
    }
    seenClues.add(clue);
    return true;
  });
  if (dropped.length > 0) devWarn(`crossword words dropped (${dropped.length}/${p.words.length})`, dropped);
  if (words.length < MIN_AFTER_FILTER) return null;
  return { ...p, words };
}

/**
 * Wordsearch: same unique-clue requirement as Crossword.
 */
export function filterWordsearchPuzzle(puzzle: unknown): unknown | null {
  const p = puzzle as MaybeWordsearch | null;
  if (!p?.words?.length) return puzzle;
  const seenClues = new Set<string>();
  const dropped: Array<{ word?: string; reason: string }> = [];
  const words = p.words.filter((w) => {
    const clue = (w.clue ?? '').trim().toLowerCase();
    if (!clue) {
      // Empty clue is OK in Wordsearch (the shell can still render the word
      // outline); only dedupe non-empty.
      return true;
    }
    if (seenClues.has(clue)) {
      dropped.push({ word: w.word, reason: `duplicate clue "${clue.slice(0, 40)}"` });
      return false;
    }
    seenClues.add(clue);
    return true;
  });
  if (dropped.length > 0) devWarn(`wordsearch words dropped (${dropped.length}/${p.words.length})`, dropped);
  if (words.length < MIN_AFTER_FILTER) return null;
  return { ...p, words };
}

/**
 * Master post-generator filter dispatcher. Looks up a per-shell filter and
 * applies it; passthrough for shells without one. Safe to call on any shell
 * key — unknown keys return the puzzle unchanged.
 */
export function filterPuzzleForShell(shell: ShellKey, puzzle: unknown): unknown | null {
  if (puzzle == null) return puzzle;
  switch (shell) {
    case 'wordformation':       return filterWordFormationPuzzle(puzzle);
    case 'sentencecorrection':  return filterSentenceCorrectionPuzzle(puzzle);
    case 'truefalse':           return filterTrueFalsePuzzle(puzzle);
    case 'crossword':           return filterCrosswordPuzzle(puzzle);
    case 'wordsearch':          return filterWordsearchPuzzle(puzzle);
    case 'picturequiz':         return filterPictureQuizPuzzle(puzzle);
    default:                    return puzzle;
  }
}

// ── Test helpers (pure — no DOM/Convex). Re-exported so the demo runner in
// exercise-adapters.ts and ad-hoc tsx scripts can exercise the heuristics. ──
export const __test__ = {
  looksConcreteNoun,
  looksConcreteNounStrict,
  looksLikeDeclarative,
  inferPos,
  posFromSuffix,
  posFromBaseWord,
  levenshtein,
  ABSTRACT_REJECT,
  VERB_REJECT,
  PARTICIPLE_REJECT,
  CONCRETE_NOUN_WHITELIST,
  KNOWN_BASE_POS,
};
