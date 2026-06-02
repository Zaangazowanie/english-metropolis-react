// generateListeningComp — audio URL + transcript + 3-5 MCQs.
//
// The audio file is generated upstream by the TTS pipeline (Piper / Kokoro on
// :8889 — see /root/.claude/projects/-root/memory/MEMORY.md piper_tts_polish);
// this generator emits the URL convention the pipeline writes to so the shell
// can simply <audio src={...}> with a graceful onError fallback to the
// transcript-only mode.
//
// URL convention:
//   /practice-audio/<vocabSetId>/<seed>.mp3
//
// If you change this, also update the TTS-batch script that produces the file.
//
// Pure TS. No React/DOM/Convex. Deterministic with seed.

import { makeRng, shuffle, isDirectRun } from './rng';

export interface ListeningCompQuestion {
  id: string;
  prompt: string;
  options: string[];
  answerIndex: number;
  hint: string;
  hint_pl: string;
  exerciseId?: string;
}

export interface ListeningCompPuzzle {
  audio_url: string;
  /** Optional WAV/OGG fallback URL (some browsers reject MP3 on first load). */
  audio_url_alt?: string;
  transcript: string;
  transcript_pl?: string;
  title: string;
  title_pl: string;
  /** Number of allowed plays (UI is responsible for enforcing). */
  maxPlays: number;
  questions: ListeningCompQuestion[];
}

export interface ListeningCompInput {
  word: string;
  word_pl: string;
  example?: string;
  example_pl?: string;
  partOfSpeech?: string;
  exerciseId?: string;
}

const DEFAULT_QUESTIONS = 4;
const DEFAULT_MAX_PLAYS = 2;

export function generateListeningCompPuzzle(
  input: ListeningCompInput[],
  opts?: { numQuestions?: number; seed?: number; maxPlays?: number; vocabSetId?: string },
): ListeningCompPuzzle | null {
  const numQ = Math.max(3, Math.min(5, opts?.numQuestions ?? DEFAULT_QUESTIONS));
  const seed = opts?.seed ?? 0xA1D10;
  const rng = makeRng(seed);

  // Dedupe.
  const seen = new Set<string>();
  const cleaned: ListeningCompInput[] = [];
  for (const it of input) {
    const k = it.word?.trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    cleaned.push(it);
  }
  if (cleaned.length < 4) return null;

  // Build the transcript from example sentences.
  const withExamples = cleaned.filter((c) => c.example && c.example.length > 4);
  const transcriptPool = shuffle([...withExamples], rng).slice(0, 4);

  let transcript = 'Welcome to the Listening Booth. ';
  let transcript_pl = 'Witamy w Kabinie Słuchania. ';
  for (const item of transcriptPool) {
    transcript += `${item.example} `;
    if (item.example_pl) transcript_pl += `${item.example_pl} `;
  }
  transcript = transcript.trim();
  transcript_pl = transcript_pl.trim();

  const allWords = cleaned.map((c) => c.word);
  const qPool = shuffle([...transcriptPool], rng).slice(0, numQ);

  const questions: ListeningCompQuestion[] = qPool.map((target, qi) => {
    const distractors = shuffle(
      allWords.filter((w) => w !== target.word),
      rng,
    ).slice(0, 3);
    const options = shuffle([target.word, ...distractors], rng);
    const answerIndex = options.indexOf(target.word);

    const prompt = `What word in the recording means "${target.word_pl}"?`;
    return {
      id: `lc-${qi}-${target.word}`,
      prompt,
      options,
      answerIndex,
      hint: target.example ?? 'Listen again — the word appears once.',
      hint_pl: target.example_pl ?? target.word_pl ?? 'Posłuchaj jeszcze raz.',
      exerciseId: target.exerciseId,
    };
  });

  const setId = opts?.vocabSetId ?? 'demo';
  return {
    audio_url: `/practice-audio/${setId}/${seed}.mp3`,
    audio_url_alt: `/practice-audio/${setId}/${seed}.ogg`,
    transcript,
    transcript_pl,
    title: 'Booth Recording',
    title_pl: 'Nagranie z kabiny',
    maxPlays: opts?.maxPlays ?? DEFAULT_MAX_PLAYS,
    questions,
  };
}

if (isDirectRun('generateListeningComp.ts')) {
  const sample: ListeningCompInput[] = [
    { word: 'coffee',  word_pl: 'kawa',    example: 'A coffee, please.', example_pl: 'Poproszę kawę.' },
    { word: 'street',  word_pl: 'ulica',   example: 'On the street.',    example_pl: 'Na ulicy.' },
    { word: 'window',  word_pl: 'okno',    example: 'Open the window.',  example_pl: 'Otwórz okno.' },
    { word: 'evening', word_pl: 'wieczór', example: 'A quiet evening.',  example_pl: 'Spokojny wieczór.' },
  ];
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(generateListeningCompPuzzle(sample, { seed: 11, vocabSetId: 'sample' }), null, 2));
}
