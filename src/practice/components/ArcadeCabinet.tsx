import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArcadeFeedbackContext } from '../lib/arcade-feedback';

interface Props {
  title: string;
  accent: string;
  number: number;
  shellId: string;
  children: React.ReactNode;
}

// The shells retain their own scoring, controls and persistence. This frame
// only reflects real progress and adds optional, locally synthesized sound.
export function ArcadeCabinet({ title, accent, number, shellId, children }: Props) {
  const [{ progress, completed }, setProgress] = useState({ progress: 0, completed: false });
  const report = useCallback((source: string, state: { progress: number; completed: boolean }) => {
    if (source === shellId) setProgress(previous => previous.progress === state.progress && previous.completed === state.completed ? previous : state);
  }, [shellId]);
  const [sound, setSound] = useState(false);
  const audio = useRef<AudioContext | null>(null);
  const previous = useRef(progress);
  const [pulse, setPulse] = useState(0);
  const percent = Math.round(Math.max(0, Math.min(1, progress)) * 100);

  const play = (finish: boolean) => {
    const context = audio.current;
    if (!context || context.state !== 'running') return;
    const notes = finish ? [523.25, 659.25, 783.99, 1046.5] : [440, 587.33];
    notes.forEach((frequency, i) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const at = context.currentTime + i * .085;
      oscillator.type = 'sine'; oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(.035, at + .008);
      gain.gain.exponentialRampToValueAtTime(.001, at + .16);
      oscillator.connect(gain); gain.connect(context.destination);
      oscillator.start(at); oscillator.stop(at + .18);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    });
  };

  useEffect(() => {
    if (progress > previous.current) {
      setPulse(value => value + 1);
      if (sound) play(completed);
    }
    previous.current = progress;
  }, [progress, completed, sound]);
  useEffect(() => () => { void audio.current?.close(); }, []);

  const toggleSound = async () => {
    if (sound) { setSound(false); return; }
    try {
      audio.current ??= new AudioContext();
      await audio.current.resume();
      setSound(true);
      play(false);
    } catch { setSound(false); }
  };

  return <section className="em-arcade-cabinet" style={{ '--arcade-accent': accent } as React.CSSProperties} aria-label={`${title} arcade`}>
    <div className="em-arcade-marquee">
      <div className="em-arcade-identity"><span className="em-arcade-number">{String(number).padStart(2, '0')}</span><div><span className="em-arcade-overline">ENGLISH METRO / ARCADE</span><h1>{title}</h1></div></div>
      <button className="em-arcade-sound" type="button" onClick={toggleSound} aria-pressed={sound} aria-label={sound ? 'Turn arcade feedback sounds off' : 'Turn arcade feedback sounds on'}>
        <span className="material-symbols-outlined" aria-hidden="true">{sound ? 'volume_up' : 'volume_off'}</span><span>Arcade cues {sound ? 'on' : 'off'}</span>
      </button>
    </div>
    <div className="em-arcade-screen"><ArcadeFeedbackContext.Provider value={report}>{children}</ArcadeFeedbackContext.Provider></div>
    <div className="em-arcade-deck">
      <span className="em-arcade-indicator" key={pulse} data-active={pulse > 0} aria-hidden="true" />
      <span>{completed ? 'Well done! · Dobra robota!' : 'Progress · Postęp'}</span>
      <div className="em-arcade-meter" role="progressbar" aria-label="Game progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><span style={{ width: `${percent}%` }} /></div>
      <strong>{percent}%</strong>
      <span className="em-arcade-deck-dots" aria-hidden="true"><i/><i/><i/></span>
    </div>
  </section>;
}
