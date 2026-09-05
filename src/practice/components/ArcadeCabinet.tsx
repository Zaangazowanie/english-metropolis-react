import React, { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { ArcadeFeedbackContext } from '../lib/arcade-feedback';
import { ArcadeEventsContext } from '../lib/arcade-events';
import { arcadeMultiplier, emptyArcadeRun, reduceArcadeRun } from '../lib/arcade-run';
import { useI18n } from '../../i18n';
import '../styles/arcade-run.css';

interface Props {
  title: string;
  accent: string;
  number: number;
  shellId: string;
  children: React.ReactNode;
  onRequestFullscreen?: () => void;
}

function readBest(shellId: string) {
  try { return Math.max(0, Number(localStorage.getItem(`em.arcade.best.v1.${shellId}`)) || 0); }
  catch { return 0; }
}

// The learning record and arcade score are separate: progress comes from the
// existing persistence hook; points only come from explicit gameplay events.
export function ArcadeCabinet({ title, accent, number, shellId, children, onRequestFullscreen }: Props) {
  const { lang } = useI18n();
  const pl = lang === 'pl';
  const [{ progress, completed }, setProgress] = useState({ progress: 0, completed: false });
  const [run, emit] = useReducer(reduceArcadeRun, emptyArcadeRun);
  const [best, setBest] = useState(() => readBest(shellId));
  const [sound, setSound] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const audio = useRef<AudioContext | null>(null);
  const cabinet = useRef<HTMLElement>(null);
  const previousSequence = useRef(0);
  const percent = Math.round(Math.max(0, Math.min(1, progress)) * 100);
  const multiplier = arcadeMultiplier(run.streak);
  const accuracy = run.hits + run.misses ? Math.round(100 * run.hits / (run.hits + run.misses)) : null;
  const report = useCallback((source: string, state: { progress: number; completed: boolean }) => {
    if (source === shellId) setProgress(previous => previous.progress === state.progress && previous.completed === state.completed ? previous : state);
  }, [shellId]);

  const play = useCallback((kind: 'correct' | 'incorrect' | 'complete') => {
    const context = audio.current;
    if (!context || context.state !== 'running') return;
    const notes = kind === 'complete' ? [523.25, 659.25, 783.99, 1046.5] : kind === 'incorrect' ? [220, 174.61] : [440, 587.33, 659.25];
    notes.forEach((frequency, i) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const at = context.currentTime + i * .065;
      oscillator.type = kind === 'incorrect' ? 'triangle' : 'sine'; oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(.035, at + .008);
      gain.gain.exponentialRampToValueAtTime(.001, at + .14);
      oscillator.connect(gain); gain.connect(context.destination);
      oscillator.start(at); oscillator.stop(at + .17);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    });
  }, []);

  useEffect(() => {
    if (run.sequence !== previousSequence.current && run.last && run.last !== 'reset' && sound) play(run.last);
    previousSequence.current = run.sequence;
  }, [run.sequence, run.last, play, sound]);
  useEffect(() => {
    if (run.score > best) {
      setBest(run.score);
      try { localStorage.setItem(`em.arcade.best.v1.${shellId}`, String(run.score)); } catch { /* private browsing */ }
    }
  }, [run.score, best, shellId]);
  useEffect(() => () => { void audio.current?.close(); }, []);
  useEffect(() => {
    const onFullscreen = () => setExpanded(document.fullscreenElement === cabinet.current);
    document.addEventListener('fullscreenchange', onFullscreen);
    return () => document.removeEventListener('fullscreenchange', onFullscreen);
  }, []);

  const toggleSound = async () => {
    if (sound) { setSound(false); return; }
    try {
      audio.current ??= new AudioContext();
      await audio.current.resume();
      setSound(true); play('correct');
    } catch { setSound(false); }
  };
  const toggleFullscreen = async () => {
    if (onRequestFullscreen) { onRequestFullscreen(); return; }
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await cabinet.current?.requestFullscreen();
    } catch { /* Browser may disable fullscreen; the game remains playable. */ }
  };

  const message = run.last === 'correct'
    ? (run.streak >= 3 ? (pl ? `Seria ${run.streak}!` : `${run.streak} in a row!`) : (pl ? 'Dobra odpowiedź!' : 'Nice answer!'))
    : run.last === 'incorrect' ? (pl ? 'Złap rytm od nowa' : 'Find your rhythm again')
    : run.last === 'complete' ? (pl ? 'Runda ukończona!' : 'Run complete!')
    : (pl ? 'Trzy trafienia podnoszą mnożnik' : 'Three hits raise your multiplier');

  return <section ref={cabinet} className="em-arcade-cabinet" data-run-state={run.last ?? 'ready'} style={{ '--arcade-accent': accent } as React.CSSProperties} aria-label={`${title} arcade`}>
    <div className="em-arcade-marquee">
      <div className="em-arcade-identity"><span className="em-arcade-number">{String(number).padStart(2, '0')}</span><div><span className="em-arcade-overline">ENGLISH METRO / ARCADE</span><h1>{title}</h1></div></div>
      <div className="em-arcade-tools"><button className="em-arcade-sound" type="button" onClick={toggleSound} aria-pressed={sound} aria-label={pl ? (sound ? 'Wyłącz efekty dźwiękowe' : 'Włącz efekty dźwiękowe') : (sound ? 'Turn arcade feedback sounds off' : 'Turn arcade feedback sounds on')}><span className="material-symbols-outlined" aria-hidden="true">{sound ? 'volume_up' : 'volume_off'}</span><span>{pl ? 'Efekty' : 'Arcade cues'} {sound ? 'on' : 'off'}</span></button><button type="button" className="em-arcade-expand" onClick={toggleFullscreen} aria-label={pl ? (expanded ? 'Opuść pełny ekran' : 'Graj na pełnym ekranie') : (expanded ? 'Exit fullscreen' : 'Play fullscreen')}><span className="material-symbols-outlined" aria-hidden="true">{expanded ? 'fullscreen_exit' : 'fullscreen'}</span></button></div>
    </div>
    <div className="em-run-hud">
      <div className="em-run-score"><span>{pl ? 'Wynik arcade' : 'Arcade score'}</span><strong key={`score-${run.score}`}>{String(run.score).padStart(5, '0')}</strong></div>
      <div className="em-run-combo" data-hot={multiplier > 1}><strong>×{multiplier}</strong><div><span>{pl ? 'Seria' : 'Streak'} <b>{run.streak}</b></span><div className="em-run-energy" aria-hidden="true">{[0, 1, 2].map(i => <i key={i} data-lit={run.streak >= 9 || i < run.streak % 3}/>)}</div></div></div>
      <div className="em-run-best"><span>{pl ? 'Rekord na urządzeniu' : 'Best on this device'}</span><strong>{String(best).padStart(5, '0')}</strong></div>
      <div className="em-run-feedback" key={`feedback-${run.sequence}`} data-kind={run.last ?? 'ready'} aria-live="polite" aria-atomic="true">{run.award > 0 && <b>+{run.award}</b>}<span>{message}</span></div>
    </div>
    <div className="em-arcade-screen"><ArcadeEventsContext.Provider value={emit}><ArcadeFeedbackContext.Provider value={report}>{children}</ArcadeFeedbackContext.Provider></ArcadeEventsContext.Provider>{(run.last==='correct'||run.last==='complete')&&<div key={`spark-${run.sequence}`} className="em-arcade-hit-effects" data-complete={run.last==='complete'} aria-hidden="true">{Array.from({length:12},(_,i)=><i key={i} style={{'--spark-angle':`${i*30}deg`,'--spark-delay':`${(i%3)*35}ms`} as React.CSSProperties}/>)}</div>}</div>
    {run.complete && (run.hits + run.misses > 0) && <div className="em-run-result"><span className="material-symbols-outlined" aria-hidden="true">workspace_premium</span><div><strong>{pl ? 'Tak buduje się płynność.' : 'That’s how fluency builds.'}</strong><span>{pl ? 'Najlepsza seria' : 'Best streak'}: {run.bestStreak} · {pl ? 'Trafność' : 'Accuracy'}: {accuracy}% · {run.score} {pl ? 'punktów arcade' : 'arcade points'}</span></div></div>}
    <div className="em-arcade-deck"><span className="em-arcade-indicator" key={run.sequence} data-active={run.hits > 0} aria-hidden="true"/><span>{run.complete ? (pl ? 'Dobra robota!' : 'Well done!') : (pl ? 'Postęp' : 'Progress')}</span><div className="em-arcade-meter" role="progressbar" aria-label={pl ? 'Postęp w grze' : 'Game progress'} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><span style={{ width: `${percent}%` }}/></div><strong>{percent}%</strong><span className="em-arcade-deck-dots" aria-hidden="true"><i/><i/><i/></span></div>
  </section>;
}
