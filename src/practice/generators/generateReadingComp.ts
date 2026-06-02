// generateReadingComp — coherent narrative passage + 3-4 comprehension MCQs.
//
// Approach (rev 2026-05-02 — Ricky, post-CD-audit BLOCKER fix):
//
// The previous algorithm stitched 4 unrelated vocab example sentences end-to-
// end, producing the gibberish CD called out:
//   "Her resilience allowed her to stay focused. The IRS flagged the
//    transaction. The Strait of Hormuz could disrupt oil supplies. She felt
//    completely liberated after leaving her stressful job."
// — no theme, no narrative, no inference target.
//
// The new approach:
//   1. Group vocab by `topic` (or partOfSpeech-cluster fallback).
//   2. Pick the dominant topic cluster (the topic with most usable vocab).
//   3. Render a topic-keyed B1 narrative TEMPLATE with up to 4 slots that
//      weave the student's vocab words INTO a coherent story. Each template
//      has its own narrative arc + named characters / locations / a small
//      twist, so the passage reads like a real short story (80–130 words).
//   4. Build 3 comprehension questions that target FACTS from the passage
//      (who / what / where / when / why), using narrative-derived distractors
//      plus 1–2 vocab distractors. Answers are inferable from the passage,
//      not "which word means X?" — that's a vocab quiz, not reading comp.
//
// Templates are bilingual (EN + PL) and the slots accept either bare vocab
// words or natural phrasings that carry the vocab into the sentence
// gracefully (the slot owner picks the form).
//
// Pure TS. No React/DOM/Convex. Deterministic with seed.

import { makeRng, shuffle, isDirectRun } from './rng';
import { posFromBaseWord } from '../lib/suitability';

// Slot POS requirement. Each narrative template positions {{w1..wN}} into
// specific grammatical slots ("to ___ the draft" wants a VERB; "his ___ would
// help him" wants a NOUN; etc). We POS-detect each candidate vocab word with
// `posFromBaseWord` and only insert words that match the slot's grammatical
// context. CD audit 2026-05-02 caught "to chronic pain the draft" because
// the slot was a verb position but a noun phrase landed there.
type SlotPos = 'noun' | 'verb' | 'adj' | 'adv' | 'any';

// 2026-05-02 (CD re-audit) — "asked to PROTECTORATE" + "small RESILIENCE
// over its rivals" still landed because:
//   (a) posFromBaseWord('protectorate') returns 'verb' — the -ate suffix regex
//       fires before any noun lookup. protectorate is a NOUN.
//   (b) 'resilience' is correctly tagged noun and the slot is correctly typed
//       'noun', BUT the slot is SEMANTICALLY narrow ("a small ___ over its
//       rivals" wants advantage/edge/lead, not resilience).
//
// Fix layer A: a local POS-override table consulted BEFORE posFromBaseWord.
// Catches the suffix-regex false-positives without touching suitability.ts
// (this generator owns its own slot-fill logic).
//
// Fix layer B: an optional `slotSemantic` per slot — when set, the candidate
// vocab word must be on the matching SEMANTIC_VOCAB whitelist. Otherwise the
// slot falls through to the per-slot fallback (so "small EDGE over its
// rivals" is still valid even if no student vocab word fits).
const POS_OVERRIDE: Record<string, SlotPos> = {
  // Latinate -ate nouns the verb-suffix regex falsely tags as verb.
  protectorate: 'noun', candidate: 'noun', graduate: 'noun', advocate: 'noun',
  estate: 'noun', mandate: 'noun', certificate: 'noun', delegate: 'noun',
  electorate: 'noun', climate: 'noun', private: 'adj',
  syndicate: 'noun', magistrate: 'noun', plate: 'noun', debate: 'noun',
  // -ence / -ance words that read 'noun' from suffix already (kept here for
  // explicit safety in case the regex order changes).
  resilience: 'noun', persistence: 'noun', confidence: 'noun', patience: 'noun',
  ambience: 'noun', ambiance: 'noun', balance: 'noun', distance: 'noun',
  // Bare-stem words that could read either way; pin them.
  edge: 'noun', lead: 'noun', advantage: 'noun', mindset: 'noun',
  setback: 'noun', backlash: 'noun', surge: 'noun', insight: 'noun',
  // Ambiguous bare verbs that are CLEARLY verbs in the practice pool.
  finish: 'verb', cover: 'verb', file: 'verb', lead_v: 'verb',
};

// Per-slot semantic whitelist. Keys are arbitrary slot-tags assigned by the
// template. Values are sets of acceptable vocab lemmas for that slot. When a
// template marks a slot with `slotSemantic[i] = 'advantage'`, only vocab
// items whose lowercased word is in SEMANTIC_VOCAB.advantage may fill it.
// This catches the "resilience over its rivals" failure mode where POS is
// correct but meaning is wrong.
type SemanticTag =
  | 'advantage'      // edge / advantage / lead — used in "small ___ over rivals"
  | 'action_lead'    // lead / cover / report — verbs that pair with "the front page"
  | 'action_report'  // cover / report / write / pursue — verbs the reporter does
  | 'action_finish'  // finish / file / submit / complete — verbs for "the draft"
  | 'feel_pain'      // ache / pain / pulse / discomfort — felt in chest
  | 'inner_quality'  // patience / resilience / focus — qualities tested in work
  | 'recovery'       // recovery / healing / improvement
  | 'support_quality'// patience / resilience / faith — what helps through hard weeks
  | 'speak_verb'     // give / share / offer — for "tried to ___ his honest answer"
  | 'kindness_noun'  // kindness / gesture / favour — small gift offered
  | 'feeling_noun'   // joy / freedom / loneliness — abstract feelings
  | 'fill_time_verb' // fill / pass / kill / endure — to fill a long wait
  | 'revisit_verb'   // revisit / try / make / cook — for an old recipe
  | 'imitate_verb'   // copy / appreciate / understand / learn — cooking style
  | 'ceremony_noun'  // ceremony / ritual / celebration
  | 'sound_noun'     // hum / buzz / sound / chatter — voices filling the room
  | 'handle_verb'    // handle / manage / appease / soothe — difficult client
  | 'value_verb'     // value / appreciate / respect — quiet leadership
  | 'accept_verb'    // accept / face / endure / overcome — hard days
  | 'sanctuary_noun' // refuge / sanctuary / haven — garden as refuge
  | 'grow_verb'      // grow / plant / cultivate — herbs
  | 'memory_noun'    // memory / story / piece / glimpse — borrowed from the past
  ;

const SEMANTIC_VOCAB: Record<SemanticTag, Set<string>> = {
  advantage:        new Set(['edge', 'advantage', 'lead', 'head-start', 'headstart', 'boost', 'win', 'upper hand']),
  action_lead:      new Set(['lead', 'dominate', 'top', 'anchor', 'headline', 'fill', 'carry']),
  action_report:    new Set(['cover', 'report', 'write', 'pursue', 'investigate', 'chase', 'track', 'document']),
  action_finish:    new Set(['finish', 'file', 'submit', 'complete', 'deliver', 'send', 'wrap']),
  feel_pain:        new Set(['ache', 'pain', 'pulse', 'discomfort', 'throb', 'twinge', 'pressure']),
  inner_quality:    new Set(['patience', 'resilience', 'focus', 'composure', 'calm', 'discipline', 'stamina', 'grit', 'confidence']),
  recovery:         new Set(['recovery', 'healing', 'improvement', 'progress', 'rest']),
  support_quality:  new Set(['patience', 'resilience', 'faith', 'hope', 'optimism', 'determination', 'courage', 'support']),
  speak_verb:       new Set(['give', 'share', 'offer', 'voice', 'admit', 'say', 'tell', 'utter']),
  kindness_noun:    new Set(['kindness', 'gesture', 'favour', 'favor', 'courtesy', 'gift', 'token', 'comfort']),
  feeling_noun:     new Set(['freedom', 'loneliness', 'joy', 'peace', 'beauty', 'thrill', 'romance', 'mystery', 'charm']),
  fill_time_verb:   new Set(['fill', 'pass', 'kill', 'endure', 'survive', 'shorten', 'occupy']),
  revisit_verb:     new Set(['revisit', 'try', 'make', 'cook', 'attempt', 'recreate', 'follow', 'prepare']),
  imitate_verb:     new Set(['copy', 'appreciate', 'understand', 'learn', 'master', 'admire', 'study', 'mimic']),
  ceremony_noun:    new Set(['ceremony', 'ritual', 'celebration', 'tradition', 'event', 'occasion']),
  sound_noun:       new Set(['hum', 'buzz', 'sound', 'chatter', 'murmur', 'chorus', 'noise', 'rhythm']),
  handle_verb:      new Set(['handle', 'manage', 'appease', 'soothe', 'face', 'address', 'deal with', 'calm']),
  value_verb:       new Set(['value', 'appreciate', 'respect', 'admire', 'recognise', 'recognize', 'embrace', 'trust']),
  accept_verb:      new Set(['accept', 'face', 'endure', 'overcome', 'survive', 'bear', 'tolerate']),
  sanctuary_noun:   new Set(['refuge', 'sanctuary', 'haven', 'shelter', 'escape', 'retreat']),
  grow_verb:        new Set(['grow', 'plant', 'cultivate', 'raise', 'tend', 'nurture']),
  memory_noun:      new Set(['memory', 'story', 'piece', 'glimpse', 'fragment', 'echo', 'whisper']),
};

export interface ReadingCompQuestion {
  id: string;
  prompt: string;
  options: string[];
  answerIndex: number;
  hint: string;
  hint_pl: string;
  exerciseId?: string;
}

export interface ReadingCompPuzzle {
  passage: string;
  passage_pl?: string;
  title: string;
  title_pl: string;
  questions: ReadingCompQuestion[];
}

export interface ReadingCompInput {
  word: string;
  word_pl: string;
  example?: string;
  example_pl?: string;
  partOfSpeech?: string;
  topic?: string;
  exerciseId?: string;
}

const DEFAULT_QUESTIONS = 3;

// ────────────────────────────────────────────────────────────────────────────
// Narrative templates.
// Each template is a coherent B1-level short story (~90–130 words) with named
// characters, a place, and a small narrative arc (setup → development → small
// twist or reflection). Up to 4 vocab slots `{{w1}}..{{w4}}` are woven into
// the body. Comprehension questions are also templated so the answer is
// always a FACT from the passage, not a vocabulary lookup.
//
// `topicMatch` lists topic strings (lowercase) that route vocab here.
// `slotHints` describes what kind of word each slot prefers (the renderer
// uses partOfSpeech to choose the best vocab fit per slot, falling back to
// any vocab if nothing matches).
// ────────────────────────────────────────────────────────────────────────────

interface QuestionTemplate {
  prompt: string;
  prompt_pl: string;
  // The literal correct answer string (must appear verbatim in the passage,
  // OR be one of `optionsBase` for inference questions).
  answer: string;
  // Other plausible options drawn from the passage's named entities / places.
  optionsBase: string[];
  hint: string;
  hint_pl: string;
}

interface NarrativeTemplate {
  id: string;
  topicMatch: string[];
  title: string;
  title_pl: string;
  // Body templates: pick one at random per render to add variety.
  bodyEN: string;
  bodyPL: string;
  // Per-slot POS requirement (slot index 0 → {{w1}}, etc). If a slot is
  // 'any', any vocab word fits. If 'verb'/'noun'/'adj'/'adv', we only insert
  // a vocab item whose `posFromBaseWord` matches. When NO candidate matches
  // and the slot is POS-typed, we fall back to `slotFallback` content so the
  // sentence stays grammatical (better than "to chronic pain the draft").
  slotPos: SlotPos[];
  // Per-slot SEMANTIC tag (optional). When present, the slot ALSO requires
  // the candidate word to be on SEMANTIC_VOCAB[tag]. This catches cases where
  // POS is correct but meaning isn't (eg. "small RESILIENCE over its rivals"
  // — resilience is a noun, but it's the wrong KIND of noun for this slot).
  // When omitted (or 'any'), only POS is checked.
  slotSemantic?: Array<SemanticTag | undefined>;
  // Per-slot fallback fillers (English + Polish). Used when no vocab in the
  // pool fits the slot's POS. Length must match slotPos length.
  slotFallback: Array<{ en: string; pl: string }>;
  // Question templates produced from this passage.
  questions: QuestionTemplate[];
}

const TEMPLATES: NarrativeTemplate[] = [
  // ── work / career / finance ──────────────────────────────────────────────
  {
    id: 'office-promotion',
    topicMatch: ['work', 'career', 'office', 'business', 'finance', 'money', 'job'],
    title: 'A Promotion at Cedar & Co.',
    title_pl: 'Awans w Cedar & Co.',
    bodyEN:
      'Maria had worked at Cedar & Co. for six years before her manager finally offered her a promotion. ' +
      'She knew the new role would test her {{w1}}, especially during the busy Friday meetings. ' +
      'On her first day, she had to {{w2}} a difficult client who kept asking for impossible deadlines. ' +
      'By the end of the week, Maria felt tired but proud — the project was moving forward, and her team had begun to {{w3}} her quiet style of leadership. ' +
      'She closed her laptop, looked out at the rain on the city, and smiled.',
    bodyPL:
      'Maria pracowała w Cedar & Co. przez sześć lat, zanim jej kierownik wreszcie zaproponował jej awans. ' +
      'Wiedziała, że nowa rola sprawdzi jej {{w1}}, szczególnie podczas piątkowych spotkań. ' +
      'Pierwszego dnia musiała {{w2}} trudnego klienta, który ciągle prosił o niemożliwe terminy. ' +
      'Pod koniec tygodnia Maria była zmęczona, ale dumna — projekt szedł do przodu, a jej zespół zaczął {{w3}} jej spokojny styl przywództwa. ' +
      'Zamknęła laptopa, popatrzyła na deszcz nad miastem i uśmiechnęła się.',
    // w1: "test her ___" (NOUN, inner-quality); w2: "had to ___ a difficult
    // client" (VERB, handle); w3: "team had begun to ___ her quiet style" (VERB, value)
    slotPos: ['noun', 'verb', 'verb'],
    slotSemantic: ['inner_quality', 'handle_verb', 'value_verb'],
    slotFallback: [
      { en: 'patience', pl: 'cierpliwość' },
      { en: 'handle', pl: 'obsłużyć' },
      { en: 'value', pl: 'doceniać' },
    ],
    questions: [
      {
        prompt: 'Where does Maria work?',
        prompt_pl: 'Gdzie pracuje Maria?',
        answer: 'Cedar & Co.',
        optionsBase: ['Cedar & Co.', 'a city café', 'a quiet library', 'a city hospital'],
        hint: 'The first sentence names her workplace.',
        hint_pl: 'Pierwsze zdanie podaje nazwę firmy.',
      },
      {
        prompt: 'How long had Maria worked there before her promotion?',
        prompt_pl: 'Jak długo Maria tam pracowała przed awansem?',
        answer: 'six years',
        optionsBase: ['six years', 'six months', 'two years', 'ten years'],
        hint: 'Look at the first sentence again.',
        hint_pl: 'Spójrz ponownie na pierwsze zdanie.',
      },
      {
        prompt: 'How did Maria feel at the end of the week?',
        prompt_pl: 'Jak czuła się Maria pod koniec tygodnia?',
        answer: 'tired but proud',
        optionsBase: ['tired but proud', 'angry and confused', 'bored and lonely', 'excited and nervous'],
        hint: 'The end of the passage describes her mood.',
        hint_pl: 'Koniec tekstu opisuje jej nastrój.',
      },
    ],
  },

  // ── health / wellbeing / mind ────────────────────────────────────────────
  {
    id: 'hospital-recovery',
    topicMatch: ['health', 'medical', 'body', 'mind', 'wellbeing', 'emotions', 'feelings'],
    title: 'After the Surgery',
    title_pl: 'Po operacji',
    bodyEN:
      'When Tomek woke up on Monday morning, the hospital ward was quiet and bright. ' +
      'He could feel a slow {{w1}} in his chest — the doctors had warned him this would last for several days. ' +
      'A nurse named Ewa came in with a tray of tea and asked how he had slept. ' +
      'Tomek tried to {{w2}} his honest answer: not very well. ' +
      'Ewa nodded and explained that real {{w3}} takes time, and that his {{w4}} would help him through the difficult weeks ahead. ' +
      'By the afternoon, Tomek was sitting up and reading a newspaper.',
    bodyPL:
      'Kiedy Tomek obudził się w poniedziałek rano, sala szpitalna była cicha i jasna. ' +
      'Czuł powolny {{w1}} w klatce piersiowej — lekarze ostrzegli go, że to potrwa kilka dni. ' +
      'Pielęgniarka o imieniu Ewa weszła z tacą herbaty i zapytała, jak spał. ' +
      'Tomek próbował {{w2}} swoją szczerą odpowiedź: niezbyt dobrze. ' +
      'Ewa skinęła głową i wyjaśniła, że prawdziwy {{w3}} wymaga czasu, a jego {{w4}} pomoże mu przejść przez trudne tygodnie. ' +
      'Po południu Tomek siedział i czytał gazetę.',
    // w1: "feel a slow ___ in his chest" (NOUN, feel_pain); w2: "tried to ___
    // his honest answer" (VERB, speak_verb); w3: "real ___ takes time"
    // (NOUN, recovery); w4: "his ___ would help him" (NOUN, support_quality)
    slotPos: ['noun', 'verb', 'noun', 'noun'],
    slotSemantic: ['feel_pain', 'speak_verb', 'recovery', 'support_quality'],
    slotFallback: [
      { en: 'ache', pl: 'ból' },
      { en: 'give', pl: 'udzielić' },
      { en: 'recovery', pl: 'powrót do zdrowia' },
      { en: 'patience', pl: 'cierpliwość' },
    ],
    questions: [
      {
        prompt: 'What day of the week did Tomek wake up?',
        prompt_pl: 'W jaki dzień tygodnia obudził się Tomek?',
        answer: 'Monday',
        optionsBase: ['Monday', 'Friday', 'Sunday', 'Wednesday'],
        hint: 'The first sentence gives the day.',
        hint_pl: 'Pierwsze zdanie podaje dzień.',
      },
      {
        prompt: 'What is the name of the nurse?',
        prompt_pl: 'Jak nazywa się pielęgniarka?',
        answer: 'Ewa',
        optionsBase: ['Ewa', 'Ania', 'Maria', 'Kasia'],
        hint: 'A nurse named ___ came in with tea.',
        hint_pl: 'Pielęgniarka o imieniu ___ weszła z herbatą.',
      },
      {
        prompt: 'What was Tomek doing by the afternoon?',
        prompt_pl: 'Co robił Tomek po południu?',
        answer: 'reading a newspaper',
        optionsBase: ['reading a newspaper', 'sleeping again', 'walking outside', 'making a phone call'],
        hint: 'The last sentence describes the afternoon.',
        hint_pl: 'Ostatnie zdanie opisuje popołudnie.',
      },
    ],
  },

  // ── travel / city / transport ────────────────────────────────────────────
  {
    id: 'late-train',
    topicMatch: ['travel', 'transport', 'city', 'tourism', 'holiday', 'vacation', 'trip'],
    title: 'The Late Train to Wrocław',
    title_pl: 'Spóźniony pociąg do Wrocławia',
    bodyEN:
      'The 18:42 train to Wrocław was already half an hour late when Anna reached the platform. ' +
      'A cold wind was blowing across the station, and the announcement board kept flashing the same yellow message. ' +
      'Anna pulled her coat tighter and tried to {{w1}} the long wait by reading. ' +
      'A young man sitting beside her offered her a thermos of coffee — a small {{w2}} that she gladly accepted. ' +
      'They began to talk about the city, the weather, and the {{w3}} of travelling alone. ' +
      'When the train finally arrived at 19:30, Anna no longer minded the cold.',
    bodyPL:
      'Pociąg o 18:42 do Wrocławia był już spóźniony pół godziny, kiedy Anna dotarła na peron. ' +
      'Po stacji wiał zimny wiatr, a tablica informacyjna ciągle wyświetlała ten sam żółty komunikat. ' +
      'Anna mocniej otuliła się płaszczem i próbowała {{w1}} długie czekanie czytaniem. ' +
      'Młody mężczyzna siedzący obok zaproponował jej termos z kawą — mała {{w2}}, którą z radością przyjęła. ' +
      'Zaczęli rozmawiać o mieście, pogodzie i {{w3}} samotnego podróżowania. ' +
      'Kiedy pociąg wreszcie przyjechał o 19:30, Anna nie miała już nic przeciwko zimnu.',
    // w1: "tried to ___ the long wait" (VERB, fill_time_verb); w2: "a small
    // ___ that she gladly accepted" (NOUN, kindness_noun); w3: "the ___ of
    // travelling alone" (NOUN, feeling_noun)
    slotPos: ['verb', 'noun', 'noun'],
    slotSemantic: ['fill_time_verb', 'kindness_noun', 'feeling_noun'],
    slotFallback: [
      { en: 'fill', pl: 'wypełnić' },
      { en: 'kindness', pl: 'uprzejmość' },
      { en: 'freedom', pl: 'wolność' },
    ],
    questions: [
      {
        prompt: 'Where was Anna travelling to?',
        prompt_pl: 'Dokąd podróżowała Anna?',
        answer: 'Wrocław',
        optionsBase: ['Wrocław', 'Kraków', 'Gdańsk', 'Warsaw'],
        hint: 'The first sentence names the destination.',
        hint_pl: 'Pierwsze zdanie podaje cel podróży.',
      },
      {
        prompt: 'What time did the train finally arrive?',
        prompt_pl: 'O której pociąg wreszcie przyjechał?',
        answer: '19:30',
        optionsBase: ['19:30', '18:42', '20:15', '19:00'],
        hint: 'The last sentence gives the arrival time.',
        hint_pl: 'Ostatnie zdanie podaje godzinę przyjazdu.',
      },
      {
        prompt: 'What did the young man offer Anna?',
        prompt_pl: 'Co zaproponował Annie młody mężczyzna?',
        answer: 'a thermos of coffee',
        optionsBase: ['a thermos of coffee', 'a warm scarf', 'a folded newspaper', 'a chocolate bar'],
        hint: 'A young man sitting beside her offered her ___.',
        hint_pl: 'Młody mężczyzna obok zaproponował jej ___.',
      },
    ],
  },

  // ── home / family / daily life ───────────────────────────────────────────
  {
    id: 'sunday-kitchen',
    topicMatch: ['food', 'home', 'family', 'cooking', 'kitchen', 'daily', 'house', 'people'],
    title: 'Sunday in the Kitchen',
    title_pl: 'Niedziela w kuchni',
    bodyEN:
      'Every Sunday, Grandma Halina invited the whole family to her kitchen for a long late lunch. ' +
      'The room smelled of fresh bread and roasted vegetables, and the radio played quiet jazz in the background. ' +
      'This week, Halina had decided to {{w1}} an old recipe from her own mother — a beetroot soup with sour cream. ' +
      'Her grandson, Piotr, was fourteen and slowly learning to {{w2}} her cooking style. ' +
      'He loved the way she always turned cooking into a small {{w3}}, telling stories about her childhood between every step. ' +
      'By three o\'clock, the table was full, and the {{w4}} of voices filled the apartment.',
    bodyPL:
      'W każdą niedzielę Babcia Halina zapraszała całą rodzinę do swojej kuchni na długi późny obiad. ' +
      'W pokoju pachniało świeżym chlebem i pieczonymi warzywami, a radio cicho grało jazz w tle. ' +
      'W tym tygodniu Halina postanowiła {{w1}} stary przepis własnej matki — barszcz ze śmietaną. ' +
      'Jej wnuk Piotr miał czternaście lat i powoli uczył się {{w2}} jej stylu gotowania. ' +
      'Uwielbiał, jak zawsze zamieniała gotowanie w małą {{w3}}, opowiadając historie z dzieciństwa między każdym krokiem. ' +
      'Do trzeciej stół był pełny, a {{w4}} głosów wypełnił mieszkanie.',
    // w1: "decided to ___ an old recipe" (VERB, revisit_verb); w2: "learning
    // to ___ her cooking style" (VERB, imitate_verb); w3: "into a small ___,
    // telling stories" (NOUN, ceremony_noun); w4: "the ___ of voices filled"
    // (NOUN, sound_noun)
    slotPos: ['verb', 'verb', 'noun', 'noun'],
    slotSemantic: ['revisit_verb', 'imitate_verb', 'ceremony_noun', 'sound_noun'],
    slotFallback: [
      { en: 'revisit', pl: 'powrócić do' },
      { en: 'copy', pl: 'naśladować' },
      { en: 'ceremony', pl: 'ceremonię' },
      { en: 'hum', pl: 'gwar' },
    ],
    questions: [
      {
        prompt: 'What is Grandma Halina cooking this week?',
        prompt_pl: 'Co Babcia Halina gotuje w tym tygodniu?',
        answer: 'beetroot soup with sour cream',
        optionsBase: ['beetroot soup with sour cream', 'fried fish and potatoes', 'mushroom pierogi', 'apple cake'],
        hint: 'She is making an old recipe from her own mother.',
        hint_pl: 'Robi stary przepis własnej matki.',
      },
      {
        prompt: 'How old is Piotr?',
        prompt_pl: 'Ile lat ma Piotr?',
        answer: 'fourteen',
        optionsBase: ['fourteen', 'twelve', 'sixteen', 'twenty'],
        hint: 'Her grandson, Piotr, was ___ years old.',
        hint_pl: 'Jej wnuk Piotr miał ___ lat.',
      },
      {
        prompt: 'What time does the family sit down to eat?',
        prompt_pl: 'O której rodzina siada do jedzenia?',
        answer: "three o'clock",
        optionsBase: ["three o'clock", 'noon', 'one o\'clock', 'four o\'clock'],
        hint: 'The end of the passage gives the time.',
        hint_pl: 'Koniec tekstu podaje godzinę.',
      },
    ],
  },

  // ── news / current affairs (matches themonexus-style vocab) ──────────────
  {
    id: 'newsroom',
    topicMatch: ['news', 'politics', 'world', 'media', 'economy', 'technology', 'tech'],
    title: 'A Slow Newsroom Morning',
    title_pl: 'Powolny poranek w redakcji',
    bodyEN:
      'It was barely seven in the morning, and the newsroom on the third floor of the Aurora Building was already half-awake. ' +
      'Editor-in-chief Daria Kowal scanned the wires for any story big enough to {{w1}} the front page. ' +
      'A junior reporter named Igor mentioned an unusual labour-market report he had been asked to {{w2}}. ' +
      'Daria liked the angle — it might give the paper a small {{w3}} over its rivals. ' +
      'She told Igor to confirm two more sources and then to {{w4}} the draft by ten o\'clock. ' +
      'The newsroom slowly filled with the soft sound of keyboards and the smell of warming coffee.',
    bodyPL:
      'Dochodziła ledwo siódma rano, a redakcja na trzecim piętrze budynku Aurora była już w połowie obudzona. ' +
      'Redaktor naczelna Daria Kowal przeglądała depesze, szukając historii wystarczająco dużej, by {{w1}} pierwszą stronę. ' +
      'Młody reporter Igor wspomniał o nietypowym raporcie z rynku pracy, który miał {{w2}}. ' +
      'Darii spodobał się ten kąt — mógłby dać gazecie małą {{w3}} nad konkurencją. ' +
      'Powiedziała Igorowi, by potwierdził dwa kolejne źródła, a następnie by {{w4}} szkic do dziesiątej. ' +
      'Redakcja powoli wypełniała się cichym dźwiękiem klawiatur i zapachem grzejącej się kawy.',
    // w1: "story big enough to ___ the front page" (VERB, action_lead);
    // w2: "report he had been asked to ___" (VERB, action_report);
    // w3: "small ___ over its rivals" (NOUN, advantage);
    // w4: "to ___ the draft by ten o'clock" (VERB, action_finish)
    // CD re-audit 2026-05-02: w2 caught "protectorate" (noun mis-tagged verb
    // by -ate suffix regex) → POS_OVERRIDE pins protectorate=noun + the
    // semantic 'action_report' tag means only verbs from that whitelist may
    // fill it. w3 caught "resilience" (noun, but wrong semantic) → semantic
    // 'advantage' tag rejects all non-edge/advantage/lead candidates.
    slotPos: ['verb', 'verb', 'noun', 'verb'],
    slotSemantic: ['action_lead', 'action_report', 'advantage', 'action_finish'],
    slotFallback: [
      { en: 'lead', pl: 'prowadzić' },
      { en: 'cover', pl: 'opisać' },
      { en: 'edge', pl: 'przewagę' },
      { en: 'finish', pl: 'skończyć' },
    ],
    questions: [
      {
        prompt: 'What is the name of the editor-in-chief?',
        prompt_pl: 'Jak nazywa się redaktor naczelna?',
        answer: 'Daria Kowal',
        optionsBase: ['Daria Kowal', 'Anna Nowak', 'Igor Sosna', 'Maria Lewandowska'],
        hint: 'The second sentence names her.',
        hint_pl: 'Drugie zdanie podaje jej imię i nazwisko.',
      },
      {
        prompt: 'On which floor is the newsroom?',
        prompt_pl: 'Na którym piętrze znajduje się redakcja?',
        answer: 'the third floor',
        optionsBase: ['the third floor', 'the ground floor', 'the fifth floor', 'the second floor'],
        hint: 'The first sentence gives the floor.',
        hint_pl: 'Pierwsze zdanie podaje piętro.',
      },
      {
        prompt: 'By what time does Igor have to file the draft?',
        prompt_pl: 'Do której Igor musi oddać szkic?',
        answer: 'ten o\'clock',
        optionsBase: ['ten o\'clock', 'noon', 'nine o\'clock', 'eleven o\'clock'],
        hint: 'Daria told Igor to file the draft by ___.',
        hint_pl: 'Daria kazała Igorowi oddać szkic do ___.',
      },
    ],
  },

  // ── default fallback (any topic / no topic match) ────────────────────────
  {
    id: 'old-letter',
    topicMatch: [],
    title: 'A Letter Found in the Library',
    title_pl: 'List znaleziony w bibliotece',
    bodyEN:
      'On a quiet Thursday evening, the librarian, Mr Brząk, was tidying the shelves on the second floor when an old envelope fell from a heavy book. ' +
      'The letter inside had been written in 1962 by a man named Stefan to his sister in Wrocław. ' +
      'Stefan wrote that he had finally learned to {{w1}} the difficult days after the war, and that his small garden had become a kind of {{w2}}. ' +
      'He described how a new neighbour had taught him to {{w3}} herbs and how the smell of mint reminded him of their childhood. ' +
      'Mr Brząk read the letter twice, then placed it carefully back into the book. ' +
      'It felt like he had borrowed a {{w4}} from another century.',
    bodyPL:
      'W cichy czwartkowy wieczór bibliotekarz, pan Brząk, porządkował półki na drugim piętrze, gdy z ciężkiej książki wypadła stara koperta. ' +
      'List w środku został napisany w 1962 roku przez mężczyznę o imieniu Stefan do jego siostry we Wrocławiu. ' +
      'Stefan pisał, że wreszcie nauczył się {{w1}} trudne dni po wojnie i że jego mały ogród stał się rodzajem {{w2}}. ' +
      'Opisał, jak nowy sąsiad nauczył go {{w3}} zioła i jak zapach mięty przypominał mu ich dzieciństwo. ' +
      'Pan Brząk przeczytał list dwa razy, a potem ostrożnie odłożył go do książki. ' +
      'Czuł, jakby pożyczył {{w4}} z innego stulecia.',
    // w1: "learned to ___ the difficult days" (VERB, accept_verb);
    // w2: "garden had become a kind of ___" (NOUN, sanctuary_noun);
    // w3: "taught him to ___ herbs" (VERB, grow_verb);
    // w4: "borrowed a ___ from another century" (NOUN, memory_noun)
    slotPos: ['verb', 'noun', 'verb', 'noun'],
    slotSemantic: ['accept_verb', 'sanctuary_noun', 'grow_verb', 'memory_noun'],
    slotFallback: [
      { en: 'accept', pl: 'akceptować' },
      { en: 'refuge', pl: 'schronienie' },
      { en: 'grow', pl: 'uprawiać' },
      { en: 'memory', pl: 'wspomnienie' },
    ],
    questions: [
      {
        prompt: 'On which day of the week did the librarian find the letter?',
        prompt_pl: 'W jaki dzień tygodnia bibliotekarz znalazł list?',
        answer: 'Thursday',
        optionsBase: ['Thursday', 'Sunday', 'Monday', 'Saturday'],
        hint: 'The first sentence gives the day.',
        hint_pl: 'Pierwsze zdanie podaje dzień.',
      },
      {
        prompt: 'In what year was the letter written?',
        prompt_pl: 'W którym roku napisano list?',
        answer: '1962',
        optionsBase: ['1962', '1945', '1972', '1989'],
        hint: 'The letter inside had been written in ___.',
        hint_pl: 'List w środku został napisany w ___.',
      },
      {
        prompt: 'Who was the letter written to?',
        prompt_pl: 'Do kogo był napisany list?',
        answer: 'Stefan\'s sister in Wrocław',
        optionsBase: ['Stefan\'s sister in Wrocław', 'Stefan\'s mother in Kraków', 'Stefan\'s old teacher', 'Stefan\'s cousin in Warsaw'],
        hint: 'A man named Stefan wrote to ___.',
        hint_pl: 'Mężczyzna o imieniu Stefan napisał do ___.',
      },
    ],
  },
];

// ────────────────────────────────────────────────────────────────────────────
// Topic clustering: count vocab items by `topic` and pick the dominant one.
// Falls back to part-of-speech heuristics, then to the default template.
// ────────────────────────────────────────────────────────────────────────────
function pickTemplate(items: ReadingCompInput[]): NarrativeTemplate {
  const counts: Record<string, number> = {};
  for (const it of items) {
    const t = (it.topic ?? '').toLowerCase().trim();
    if (!t) continue;
    counts[t] = (counts[t] ?? 0) + 1;
  }
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  for (const [topic] of sorted) {
    const match = TEMPLATES.find((t) => t.topicMatch.includes(topic));
    if (match) return match;
    // Substring fallback: vocab topic might be e.g. "office-work" or "world-news".
    const sub = TEMPLATES.find((t) =>
      t.topicMatch.some((m) => topic.includes(m) || m.includes(topic)),
    );
    if (sub) return sub;
  }
  return TEMPLATES[TEMPLATES.length - 1]; // default = old-letter
}

// ────────────────────────────────────────────────────────────────────────────
// Slot rendering — picks a vocab word per slot. Templates with N slots want
// N distinct words. If we don't have N usable vocab items, the slot is
// quietly omitted (the resulting passage is still coherent because the
// template body is grammatical with the bare slot text replaced by its
// fallback content) — see fillSlots.
// ────────────────────────────────────────────────────────────────────────────

interface SlotPick {
  // The vocab item displayed in this slot.
  item: ReadingCompInput;
  // The literal string substituted into the template (we use the bare word —
  // the template carries the surrounding grammar).
  rendered: string;
  rendered_pl: string;
}

// Resolve the POS of a vocab item. Order:
//   1. Local POS_OVERRIDE table — pins suffix-regex false-positives like
//      "protectorate" (-ate looks verbal but it's a noun).
//   2. Explicit `partOfSpeech` field on the vocab item (Convex/keyword pipe).
//   3. posFromBaseWord (KNOWN_BASE_POS in suitability.ts → suffix regex).
function vocabPos(item: ReadingCompInput): SlotPos {
  const w = (item.word ?? '').toLowerCase().trim();
  const override = POS_OVERRIDE[w];
  if (override) return override;
  const tagged = (item.partOfSpeech ?? '').toLowerCase().trim();
  if (tagged.startsWith('verb')) return 'verb';
  if (tagged.startsWith('noun')) return 'noun';
  if (tagged.startsWith('adj'))  return 'adj';
  if (tagged.startsWith('adv'))  return 'adv';
  const inferred = posFromBaseWord(item.word);
  if (inferred === 'noun' || inferred === 'verb' || inferred === 'adj' || inferred === 'adv') {
    return inferred;
  }
  return 'any';
}

function posMatches(slot: SlotPos, candidate: SlotPos): boolean {
  if (slot === 'any') return true;
  // 'any' candidate (POS unknown) is a risky bet for a typed slot — refuse.
  if (candidate === 'any') return false;
  return slot === candidate;
}

// Semantic-tag check: if the slot has a SemanticTag, the candidate's lemma
// must be on the corresponding SEMANTIC_VOCAB whitelist. This is the layer
// that catches "small RESILIENCE over its rivals" — POS noun is correct but
// 'resilience' isn't in SEMANTIC_VOCAB.advantage so the slot falls back.
function semanticMatches(tag: SemanticTag | undefined, candidate: ReadingCompInput): boolean {
  if (!tag) return true;
  const allow = SEMANTIC_VOCAB[tag];
  if (!allow) return true;
  const w = (candidate.word ?? '').toLowerCase().trim();
  return allow.has(w);
}

function fillSlots(
  template: NarrativeTemplate,
  vocab: ReadingCompInput[],
  rng: () => number,
): { passage: string; passage_pl: string; slots: SlotPick[] } {
  const slotCount = (template.bodyEN.match(/\{\{w\d\}\}/g) ?? []).length;
  const slotPos = template.slotPos ?? [];
  const slotSemantic = template.slotSemantic ?? [];
  const slotFallback = template.slotFallback ?? [];
  const pool = shuffle([...vocab], rng);
  const used = new Set<string>();
  const slots: SlotPick[] = [];

  for (let i = 0; i < slotCount; i += 1) {
    const wantPos: SlotPos = slotPos[i] ?? 'any';
    const wantSemantic: SemanticTag | undefined = slotSemantic[i];
    // Find the first not-yet-used vocab item whose POS AND semantic tag match
    // the slot. Both checks must pass — if a slot is typed semantic but no
    // candidate qualifies, we fall through to the per-slot fallback (better
    // to print "small EDGE over rivals" from fallback than "small RESILIENCE
    // over rivals" from a wrong-meaning vocab match).
    let chosen: ReadingCompInput | null = null;
    for (const cand of pool) {
      const k = cand.word.trim().toLowerCase();
      if (used.has(k)) continue;
      if (!posMatches(wantPos, vocabPos(cand))) continue;
      if (!semanticMatches(wantSemantic, cand)) continue;
      chosen = cand;
      used.add(k);
      break;
    }
    if (chosen) {
      slots.push({
        item: chosen,
        rendered: chosen.word,
        rendered_pl: chosen.word_pl || chosen.word,
      });
    } else {
      // No vocab fits this POS slot — use the template's per-slot fallback so
      // the sentence stays grammatical. Better than "to chronic pain the
      // draft" (CD audit 2026-05-02). The slot still occupies an index, so
      // questions that derive their `exerciseId` from `vocabWords[qi]` map
      // through cleanly: we just don't emit a vocab anchor for this slot.
      const fb = slotFallback[i] ?? { en: 'something new', pl: 'coś nowego' };
      slots.push({
        item: { word: fb.en, word_pl: fb.pl },
        rendered: fb.en,
        rendered_pl: fb.pl,
      });
    }
  }

  let passage = template.bodyEN;
  let passagePl = template.bodyPL;
  for (let i = 0; i < slots.length; i += 1) {
    const slot = slots[i];
    const re = new RegExp(`\\{\\{w${i + 1}\\}\\}`, 'g');
    passage = passage.replace(re, slot.rendered);
    passagePl = passagePl.replace(re, slot.rendered_pl);
  }
  // Defensive: any remaining unfilled slot (slotCount > slots.length is now
  // impossible, but keep the safety net).
  passage = passage.replace(/\s*\{\{w\d\}\}/g, ' something new');
  passagePl = passagePl.replace(/\s*\{\{w\d\}\}/g, ' coś nowego');
  return { passage, passage_pl: passagePl, slots };
}

// ────────────────────────────────────────────────────────────────────────────
// Main entry.
// ────────────────────────────────────────────────────────────────────────────
export function generateReadingCompPuzzle(
  input: ReadingCompInput[],
  opts?: { numQuestions?: number; seed?: number },
): ReadingCompPuzzle | null {
  const numQ = Math.max(3, Math.min(5, opts?.numQuestions ?? DEFAULT_QUESTIONS));
  const rng = makeRng(opts?.seed ?? 0xC0DEF00D);

  // Dedupe.
  const seen = new Set<string>();
  const cleaned: ReadingCompInput[] = [];
  for (const it of input) {
    const k = it.word?.trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    cleaned.push(it);
  }
  if (cleaned.length < 4) return null;

  const template = pickTemplate(cleaned);
  const { passage, passage_pl, slots } = fillSlots(template, cleaned, rng);

  // Build comprehension questions from the template's question pool.
  // Each question's correct answer is a FACT from the passage; distractors
  // come from the template's `optionsBase` plus, for variety, one or two
  // student vocab words used as red-herring options.
  const questionPool = shuffle([...template.questions], rng).slice(0, numQ);
  const vocabWords = slots.map((s) => s.item.word);

  const questions: ReadingCompQuestion[] = questionPool.map((q, qi) => {
    const baseOptions = q.optionsBase.slice();
    // Make sure the correct answer is present.
    if (!baseOptions.includes(q.answer)) baseOptions.unshift(q.answer);
    // Trim to 4.
    const options = shuffle(baseOptions, rng).slice(0, 4);
    if (!options.includes(q.answer)) options[0] = q.answer; // safety net
    const finalOptions = shuffle(options, rng);
    const answerIndex = finalOptions.indexOf(q.answer);

    return {
      id: `rc-${qi}-${q.answer.replace(/\s+/g, '-').toLowerCase()}`,
      prompt: q.prompt,
      options: finalOptions,
      answerIndex,
      hint: q.hint,
      hint_pl: q.hint_pl,
      exerciseId: vocabWords[qi % Math.max(vocabWords.length, 1)],
    };
  });

  return {
    passage,
    passage_pl,
    title: template.title,
    title_pl: template.title_pl,
    questions,
  };
}

if (isDirectRun('generateReadingComp.ts')) {
  const sample: ReadingCompInput[] = [
    { word: 'resilience',  word_pl: 'odporność', topic: 'work',  partOfSpeech: 'noun' },
    { word: 'handle',      word_pl: 'poradzić sobie', topic: 'work',  partOfSpeech: 'verb' },
    { word: 'appreciate',  word_pl: 'docenić',  topic: 'work',  partOfSpeech: 'verb' },
    { word: 'deadline',    word_pl: 'termin',   topic: 'work',  partOfSpeech: 'noun' },
    { word: 'meeting',     word_pl: 'spotkanie', topic: 'work', partOfSpeech: 'noun' },
  ];
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(generateReadingCompPuzzle(sample, { seed: 7 }), null, 2));
}
