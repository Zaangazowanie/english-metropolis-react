import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useShellProgress } from '../lib/convex-stubs';
import './accuracy-at-speed.css';

export type RoundId = 'A' | 'B' | 'C' | 'D' | 'D2';

interface Round {
  id: RoundId;
  title: string;
  focus: string;
  instruction: string;
  timer: number;
  cues: string[];
  target: string[];
  mode: 'correct' | 'read' | 'build' | 'transfer';
  accent: string;
}

interface VoiceResult {
  score: number;
  transcript: string;
  reply: string;
  audioChunks: string[];
  slips: Array<{ type?: string; detail?: string }>;
}

const ROUNDS: Round[] = [
  {
    id: 'A',
    title: 'First conditional reflex',
    focus: 'Remove will from the if-clause',
    instruction: 'Correct every cue aloud as a complete sentence.',
    timer: 45,
    mode: 'correct',
    accent: '#FBBF24',
    cues: [
      'If the district will develop, more people will move there.',
      'If I will get a free afternoon, I’ll visit the old town.',
      'If the city will improve public transport, fewer people will drive.',
      'If a new café will open nearby, I’ll try it.',
      'If the area will become overcrowded, rents will rise.',
      'If we will design it well, residents will enjoy living there.',
    ],
    target: [
      'If the district develops, more people will move there.',
      'If I get a free afternoon, I’ll visit the old town.',
      'If the city improves public transport, fewer people will drive.',
      'If a new café opens nearby, I’ll try it.',
      'If the area becomes overcrowded, rents will rise.',
      'If we design it well, residents will enjoy living there.',
    ],
  },
  {
    id: 'B',
    title: 'Agreement under speed',
    focus: 'Every verb agrees with its subject',
    instruction: 'Read all ten complete sentences accurately at speed.',
    timer: 40,
    mode: 'read',
    accent: '#34D399',
    cues: [
      'The district looks impressive.',
      'The cars have more space.',
      'A good master plan includes green areas.',
      'The government cares about public transport.',
      'She does the shopping on Friday.',
      'He doesn’t have a car.',
      'This road connects the two districts.',
      'These buildings look well-kept.',
      'The new station attracts more visitors.',
      'My neighbours don’t use the bus.',
    ],
    target: [
      'The district looks impressive.',
      'The cars have more space.',
      'A good master plan includes green areas.',
      'The government cares about public transport.',
      'She does the shopping on Friday.',
      'He doesn’t have a car.',
      'This road connects the two districts.',
      'These buildings look well-kept.',
      'The new station attracts more visitors.',
      'My neighbours don’t use the bus.',
    ],
  },
  {
    id: 'C',
    title: 'There are and these',
    focus: 'Plural nouns need plural structures',
    instruction: 'Correct each cue aloud, then repeat the complete set.',
    timer: 40,
    mode: 'correct',
    accent: '#7DD3FC',
    cues: [
      'It’s lots of one-way roads in the centre.',
      'There is lots of people at the station.',
      'This words are on the road sign.',
      'This training sessions are useful.',
      'There is lots of cafés in the old town.',
      'This buildings are well-kept.',
    ],
    target: [
      'There are lots of one-way roads in the centre.',
      'There are lots of people at the station.',
      'These words are on the road sign.',
      'These training sessions are useful.',
      'There are lots of cafés in the old town.',
      'These buildings are well-kept.',
    ],
  },
  {
    id: 'D',
    title: 'Adjective reflex and transfer',
    focus: 'Build complete past-tense sentences',
    instruction: 'Turn every cue into a complete sentence using was or were.',
    timer: 60,
    mode: 'build',
    accent: '#E879F9',
    cues: [
      'everything / easy',
      'the journey / comfortable',
      'the instructions / clear',
      'the neighbourhood / quiet',
      'the booking process / simple',
      'the streets / busy',
    ],
    target: [
      'Everything was easy.',
      'The journey was comfortable.',
      'The instructions were clear.',
      'The neighbourhood was quiet.',
      'The booking process was simple.',
      'The streets were busy.',
    ],
  },
  {
    id: 'D2',
    title: 'District transfer',
    focus: 'Connect all five target structures',
    instruction: 'Describe a district you know for one minute without notes.',
    timer: 60,
    mode: 'transfer',
    accent: '#F472B6',
    cues: [
      'There are lots of...',
      'It looks...',
      'These buildings or streets...',
      'If the area develops..., people will...',
      'One sentence using has, have, does, or doesn’t',
    ],
    target: [
      'There are lots of',
      'It looks',
      'These buildings or streets',
      'If the area develops, people will',
      'has, have, does, or doesn’t',
    ],
  },
];

const EXERCISE_ID = 'aleksandra-accuracy-at-speed-2026-07-29';

function readVoice(): string {
  try {
    return window.localStorage.getItem('tts_voice') || 'af_heart';
  } catch {
    return 'af_heart';
  }
}

function playBajlaAudio(chunks: string[]): void {
  if (!chunks.length) return;
  let index = 0;
  const playNext = () => {
    if (index >= chunks.length) return;
    const raw = chunks[index++];
    const src = raw.startsWith('http') ? raw : `/api/conversa${raw}`;
    const audio = new Audio(src);
    audio.addEventListener('ended', playNext, { once: true });
    void audio.play().catch(() => undefined);
  };
  playNext();
}

function scoreLabel(score: number): string {
  if (score >= 88) return 'Automatic and accurate';
  if (score >= 74) return 'Strong, one more fast pass';
  if (score >= 58) return 'Nearly there, slow it down once';
  return 'Rebuild the pattern, then repeat';
}

interface AccuracyAtSpeedProps {
  studentSlug: string;
  initialRound?: RoundId | 'all';
  onExit: () => void;
}

interface AccuracyAtSpeedLauncherProps {
  completed?: boolean;
  onStart: (selection: RoundId | 'all') => void;
}

export function AccuracyAtSpeedLauncher({
  completed = false,
  onStart,
}: AccuracyAtSpeedLauncherProps): React.ReactElement {
  const [selection, setSelection] = useState<RoundId | 'all'>('all');
  return (
    <section className="aas-launcher" aria-labelledby="aas-launcher-title">
      <div className="aas-launcher-art" aria-hidden>
        <div className="aas-launcher-dial">
          <span className="material-symbols-outlined">graphic_eq</span>
        </div>
        <div className="aas-launcher-bars">{Array.from({ length: 11 }, (_, index) => <i key={index} />)}</div>
      </div>
      <div className="aas-launcher-copy">
        <div className="aas-launcher-meta">
          <span>29 July lesson</span>
          <span>B2 Places</span>
          {completed ? <span className="is-complete">Completed</span> : <span>New</span>}
        </div>
        <h2 id="aas-launcher-title">Aleksandra, make accuracy automatic.</h2>
        <p>
          Four short spoken reflex blocks built from today's fossilized errors.
          Bajla listens, scores the exact target, and coaches the next attempt.
        </p>
        <div className="aas-launcher-stats">
          <span><strong>4 + 1</strong> reflex blocks and transfer</span>
          <span><strong>4:05</strong> target time</span>
          <span><strong>Voice</strong> scored by Bajla</span>
        </div>
      </div>
      <div className="aas-launcher-controls">
        <label htmlFor="aas-workout-select">Choose today's practice</label>
        <div className="aas-select-wrap">
          <select
            id="aas-workout-select"
            value={selection}
            onChange={(event) => setSelection(event.target.value as RoundId | 'all')}
          >
            <option value="all">Full Accuracy at Speed workout</option>
            <option value="A">A: First conditional reflex</option>
            <option value="B">B: Agreement under speed</option>
            <option value="C">C: There are and these</option>
            <option value="D">D: Adjective reflex and transfer</option>
            <option value="D2">D2: One-minute district transfer</option>
          </select>
          <span className="material-symbols-outlined" aria-hidden>expand_more</span>
        </div>
        <button type="button" className="aas-launcher-start" onClick={() => onStart(selection)}>
          <span className="material-symbols-outlined" aria-hidden>mic</span>
          Start spoken practice
        </button>
        <small>Microphone permission is requested only when you press start.</small>
      </div>
    </section>
  );
}

export function AccuracyAtSpeed({
  studentSlug,
  initialRound = 'all',
  onExit,
}: AccuracyAtSpeedProps): React.ReactElement {
  const selectedRounds = useMemo(
    () => (initialRound === 'all' ? ROUNDS : ROUNDS.filter((round) => round.id === initialRound)),
    [initialRound],
  );
  const progress = useShellProgress('accuracy-at-speed', EXERCISE_ID);
  const [roundIndex, setRoundIndex] = useState(0);
  const [phase, setPhase] = useState<'ready' | 'recording' | 'scoring' | 'feedback' | 'complete'>('ready');
  const [secondsLeft, setSecondsLeft] = useState(selectedRounds[0]?.timer ?? 45);
  const [results, setResults] = useState<Partial<Record<RoundId, VoiceResult>>>({});
  const [error, setError] = useState('');
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const deadlineRef = useRef<number | null>(null);
  const currentRound = selectedRounds[roundIndex];

  useEffect(() => {
    setRoundIndex(0);
    setPhase('ready');
    setSecondsLeft(selectedRounds[0]?.timer ?? 45);
    setResults({});
    setError('');
  }, [selectedRounds]);

  useEffect(() => {
    if (phase !== 'recording' || !deadlineRef.current) return;
    const tick = () => {
      const next = Math.max(0, Math.ceil((deadlineRef.current! - Date.now()) / 1000));
      setSecondsLeft(next);
      if (next === 0 && recorderRef.current?.state === 'recording') {
        recorderRef.current.stop();
      }
    };
    tick();
    const timer = window.setInterval(tick, 200);
    return () => window.clearInterval(timer);
  }, [phase]);

  useEffect(() => () => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const submitAudio = useCallback(async (blob: Blob, round: Round) => {
    setPhase('scoring');
    setError('');
    try {
      const body = new FormData();
      body.append('audio', blob, `accuracy-at-speed-${round.id}.webm`);
      body.append('student_id', studentSlug);
      body.append('voice', readVoice());
      body.append('history', '[]');
      body.append('mode', round.mode === 'transfer' ? 'accuracy_transfer' : 'accuracy_speed');
      body.append('pronunciation_target', round.target.join(' '));
      body.append('identity', JSON.stringify({ kind: 'student', slug: studentSlug }));
      const response = await fetch('/api/conversa/voice', { method: 'POST', body });
      if (!response.ok) throw new Error(`Bajla could not score this recording (${response.status}).`);
      const data = await response.json();
      if (!data?.transcript) throw new Error(data?.reply || 'Bajla could not hear enough speech to score this round.');
      const result: VoiceResult = {
        score: Number(data?.scored?.score ?? 0),
        transcript: String(data.transcript),
        reply: String(data.reply || 'Good work. Repeat the block once more and keep the target pattern stable.'),
        audioChunks: Array.isArray(data.audio_chunks) ? data.audio_chunks : [],
        slips: Array.isArray(data?.scored?.slips) ? data.scored.slips : [],
      };
      setResults((previous) => ({ ...previous, [round.id]: result }));
      setPhase('feedback');
      playBajlaAudio(result.audioChunks);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Bajla could not score the recording.');
      setPhase('ready');
    } finally {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      recorderRef.current = null;
    }
  }, [studentSlug]);

  const startRecording = useCallback(async () => {
    if (!currentRound || phase === 'recording' || phase === 'scoring') return;
    setError('');
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        throw new Error('Voice recording is not supported in this browser. Try Chrome or Safari and allow microphone access.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      const recorder = new MediaRecorder(stream);
      streamRef.current = stream;
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.addEventListener('dataavailable', (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      });
      recorder.addEventListener('stop', () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        void submitAudio(blob, currentRound);
      }, { once: true });
      recorder.start(250);
      deadlineRef.current = Date.now() + currentRound.timer * 1000;
      setSecondsLeft(currentRound.timer);
      setPhase('recording');
    } catch (reason) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      setError(reason instanceof Error ? reason.message : 'Microphone access was not available.');
    }
  }, [currentRound, phase, submitAudio]);

  const stopRecording = useCallback(() => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
  }, []);

  const finishExercise = useCallback((nextResults: Partial<Record<RoundId, VoiceResult>>) => {
    const completed = Object.values(nextResults);
    const average = completed.length
      ? Math.round(completed.reduce((sum, item) => sum + item.score, 0) / completed.length)
      : 0;
    progress.save({
      progress: selectedRounds.length ? completed.length / selectedRounds.length : 1,
      completed: true,
      lastState: 'complete',
      meta: {
        activity: 'Aleksandra - Accuracy at Speed',
        lessonDate: '2026-07-29',
        selectedRound: initialRound,
        averageScore: average,
        rounds: Object.fromEntries(
          Object.entries(nextResults).map(([id, result]) => [
            id,
            { score: result.score, transcript: result.transcript, slips: result.slips },
          ]),
        ),
      },
    });
    setPhase('complete');
  }, [initialRound, progress, selectedRounds.length]);

  const advance = useCallback(() => {
    if (!currentRound) return;
    if (roundIndex >= selectedRounds.length - 1) {
      finishExercise(results);
      return;
    }
    const nextIndex = roundIndex + 1;
    setRoundIndex(nextIndex);
    setSecondsLeft(selectedRounds[nextIndex].timer);
    setPhase('ready');
    setError('');
  }, [currentRound, finishExercise, results, roundIndex, selectedRounds]);

  const retry = useCallback(() => {
    if (!currentRound) return;
    setSecondsLeft(currentRound.timer);
    setPhase('ready');
    setError('');
  }, [currentRound]);

  const openBajla = useCallback(() => {
    const scores = Object.entries(results).map(([id, result]) => `${id}: ${result.score}/100`).join(', ');
    const prompt = `I completed today's Accuracy at Speed practice. My scores were ${scores || 'not recorded yet'}. Coach me on my weakest fossilized pattern and give me one short spoken retry.`;
    window.dispatchEvent(new CustomEvent('bajla:open', { detail: { prompt, source: EXERCISE_ID } }));
  }, [results]);

  if (!currentRound && phase !== 'complete') {
    return (
      <main className="aas-page">
        <div className="aas-empty">
          <span className="material-symbols-outlined" aria-hidden>warning</span>
          <h1>This practice set is unavailable</h1>
          <button type="button" className="aas-button aas-button-primary" onClick={onExit}>Back to Practice</button>
        </div>
      </main>
    );
  }

  if (phase === 'complete') {
    const finished = Object.entries(results) as Array<[RoundId, VoiceResult]>;
    const average = finished.length
      ? Math.round(finished.reduce((sum, [, result]) => sum + result.score, 0) / finished.length)
      : 0;
    const best = [...finished].sort((a, b) => b[1].score - a[1].score)[0];
    return (
      <main className="aas-page">
        <section className="aas-results" aria-labelledby="aas-results-title">
          <div className="aas-results-copy">
            <div className="aas-kicker">Session complete</div>
            <h1 id="aas-results-title">Accuracy is becoming automatic.</h1>
            <p>
              Bajla scored what she heard against the exact target sentences. The number rewards
              accurate structure and clear delivery, not speed alone.
            </p>
          </div>
          <div className="aas-score-orbit" style={{ '--aas-score': `${average * 3.6}deg` } as React.CSSProperties}>
            <div><strong>{average}</strong><span>average</span></div>
          </div>
          <div className="aas-tally-grid">
            <div><strong>{finished.length}/{selectedRounds.length}</strong><span>rounds complete</span></div>
            <div><strong>{best?.[0] || '-'}</strong><span>best block</span></div>
            <div><strong>{best?.[1].score ?? 0}</strong><span>best score</span></div>
            <div><strong>{selectedRounds.reduce((sum, round) => sum + round.timer, 0)}s</strong><span>target time</span></div>
          </div>
          <div className="aas-result-bars" aria-label="Round scores">
            {selectedRounds.map((round) => {
              const score = results[round.id]?.score ?? 0;
              return (
                <div className="aas-result-row" key={round.id}>
                  <span className="aas-result-letter" style={{ '--aas-accent': round.accent } as React.CSSProperties}>{round.id}</span>
                  <div>
                    <strong>{round.title}</strong>
                    <span>{scoreLabel(score)}</span>
                  </div>
                  <div className="aas-bar"><span style={{ width: `${score}%`, background: round.accent }} /></div>
                  <b>{score}</b>
                </div>
              );
            })}
          </div>
          <div className="aas-actions">
            <button type="button" className="aas-button aas-button-primary" onClick={openBajla}>
              <span className="material-symbols-outlined" aria-hidden>forum</span>
              Review with Bajla
            </button>
            <button type="button" className="aas-button" onClick={() => {
              progress.reset();
              setResults({});
              setRoundIndex(0);
              setSecondsLeft(selectedRounds[0].timer);
              setPhase('ready');
            }}>
              <span className="material-symbols-outlined" aria-hidden>replay</span>
              Repeat workout
            </button>
            <button type="button" className="aas-button aas-button-quiet" onClick={onExit}>Back to Practice</button>
          </div>
        </section>
      </main>
    );
  }

  const result = results[currentRound.id];
  const timerProgress = secondsLeft / currentRound.timer;
  const recordedSeconds = currentRound.timer - secondsLeft;

  return (
    <main className="aas-page" style={{ '--aas-accent': currentRound.accent } as React.CSSProperties}>
      <nav className="aas-topbar" aria-label="Accuracy at Speed controls">
        <button type="button" className="aas-back" onClick={onExit}>
          <span className="material-symbols-outlined" aria-hidden>arrow_back</span>
          Practice
        </button>
        <div className="aas-brand">
          <img src="/bajla.png" alt="" />
          <div><span>Today's lesson practice</span><strong>Accuracy at Speed</strong></div>
        </div>
        <div className="aas-round-count">{roundIndex + 1} / {selectedRounds.length}</div>
      </nav>

      <div className="aas-workspace">
        <aside className="aas-rail" aria-label="Workout rounds">
          {selectedRounds.map((round, index) => {
            const isActive = index === roundIndex;
            const isDone = Boolean(results[round.id]);
            return (
              <button
                type="button"
                key={round.id}
                className={`aas-rail-item${isActive ? ' is-active' : ''}${isDone ? ' is-done' : ''}`}
                onClick={() => {
                  if (phase === 'recording' || phase === 'scoring') return;
                  setRoundIndex(index);
                  setSecondsLeft(round.timer);
                  setPhase(isDone ? 'feedback' : 'ready');
                  setError('');
                }}
                aria-current={isActive ? 'step' : undefined}
              >
                <span className="aas-rail-letter" style={{ '--aas-accent': round.accent } as React.CSSProperties}>
                  {isDone ? <span className="material-symbols-outlined" aria-hidden>check</span> : round.id}
                </span>
                <span><strong>{round.title}</strong><small>{round.timer} seconds</small></span>
              </button>
            );
          })}
        </aside>

        <section className="aas-stage">
          <header className="aas-stage-head">
            <div>
              <div className="aas-kicker">Block {currentRound.id} <span>spoken reflex</span></div>
              <h1>{currentRound.title}</h1>
              <p>{currentRound.instruction} <strong>{currentRound.focus}.</strong></p>
            </div>
            <div
              className={`aas-timer${phase === 'recording' ? ' is-live' : ''}`}
              style={{ '--aas-timer': `${timerProgress * 360}deg` } as React.CSSProperties}
              aria-label={`${secondsLeft} seconds remaining`}
            >
              <div>
                <strong>{secondsLeft}</strong>
                <span>seconds</span>
              </div>
            </div>
          </header>

          <div className="aas-cue-panel">
            <div className="aas-cue-head">
              <span>{currentRound.mode === 'read' ? 'Read aloud' : currentRound.mode === 'build' ? 'Build aloud' : 'Correct aloud'}</span>
              <span>Complete sentences only</span>
            </div>
            <ol className="aas-cue-list">
              {currentRound.cues.map((cue, index) => (
                <li key={cue}>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <p>{cue}</p>
                </li>
              ))}
            </ol>
            {currentRound.id === 'D' && (
              <div className="aas-transfer">
                <span className="material-symbols-outlined" aria-hidden>record_voice_over</span>
                <div>
                  <strong>Transfer after the scored block</strong>
                  <p>Your next block is the one-minute district description from the original exercise.</p>
                </div>
              </div>
            )}
          </div>
        </section>

        <aside className="aas-coach" aria-live="polite">
          <div className="aas-coach-profile">
            <img src="/bajla.png" alt="" />
            <div><span>Bajla is listening</span><strong>Live accuracy coach</strong></div>
            <i className={phase === 'recording' ? 'is-live' : ''} />
          </div>

          {phase === 'ready' && (
            <div className="aas-coach-state">
              <span className="material-symbols-outlined aas-state-icon" aria-hidden>mic</span>
              <h2>One accurate pass. Then faster.</h2>
              <p>Press the microphone, speak every sentence, and stop when you finish. Bajla will compare what she hears with the target pattern.</p>
              <button type="button" className="aas-record" onClick={startRecording}>
                <span className="material-symbols-outlined" aria-hidden>mic</span>
                Start speaking
              </button>
            </div>
          )}

          {phase === 'recording' && (
            <div className="aas-coach-state">
              <div className="aas-wave" aria-hidden>{Array.from({ length: 13 }, (_, index) => <i key={index} />)}</div>
              <h2>Keep the structure stable.</h2>
              <p>{recordedSeconds} seconds recorded. If a target is wrong, say that complete sentence correctly straight away.</p>
              <button type="button" className="aas-record is-recording" onClick={stopRecording}>
                <span className="material-symbols-outlined" aria-hidden>stop</span>
                Stop and score
              </button>
            </div>
          )}

          {phase === 'scoring' && (
            <div className="aas-coach-state">
              <div className="aas-scoring" aria-hidden><i /><i /><i /></div>
              <h2>Bajla is checking the pattern...</h2>
              <p>She is comparing your spoken version with the exact target sentences and preparing one focused correction.</p>
            </div>
          )}

          {phase === 'feedback' && result && (
            <div className="aas-feedback">
              <div className="aas-feedback-score" style={{ '--aas-score': `${result.score * 3.6}deg` } as React.CSSProperties}>
                <div><strong>{result.score}</strong><span>accuracy</span></div>
              </div>
              <div>
                <span className="aas-verdict">{scoreLabel(result.score)}</span>
                <h2>{result.score >= 74 ? 'Good work, Aleksandra.' : 'Useful attempt. Now sharpen it.'}</h2>
              </div>
              <blockquote>{result.reply}</blockquote>
              <details>
                <summary>What Bajla heard</summary>
                <p>{result.transcript}</p>
              </details>
              <div className="aas-feedback-actions">
                <button type="button" className="aas-button" onClick={retry}>
                  <span className="material-symbols-outlined" aria-hidden>replay</span>
                  Repeat this block
                </button>
                <button type="button" className="aas-button aas-button-primary" onClick={advance}>
                  {roundIndex === selectedRounds.length - 1 ? 'See my tally' : 'Next block'}
                  <span className="material-symbols-outlined" aria-hidden>arrow_forward</span>
                </button>
              </div>
            </div>
          )}

          {error && (
            <div className="aas-error" role="alert">
              <span className="material-symbols-outlined" aria-hidden>error</span>
              <div><strong>Voice check paused</strong><p>{error}</p></div>
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}
