import { Challenge3D } from './challenge-3d';
import React, { useRef, useState } from 'react';
import { useArcadeEvents } from '../lib/arcade-events';
import { challengeReward, consumeChallengeBoost } from './challenge-arcade-logic';
import './challenge-arcade.css';

/** Arcade rewards are separate from the saved learning grade. An id can only
 * earn points once, so moving a solved tile back and forth cannot farm points. */
export function useChallengeArcade() {
  const emit = useArcadeEvents();
  const credited = useRef(new Set<string>());
  const finished = useRef(false);
  const boostLedger = useRef({ armed: false, remaining: 2 });
  const [hits, setHits] = useState(0);
  const [boosts, setBoosts] = useState(2);
  const [armed, setArmed] = useState(false);
  const [flash, setFlash] = useState<{ right: boolean; sequence: number; bonus: boolean } | null>(null);
  const decide = (right: boolean, id: string, points = 100) => {
    if (credited.current.has(id) || finished.current) return;
    const usedBoost = consumeChallengeBoost(boostLedger.current);
    const reward = challengeReward(right, false, usedBoost, points)!;
    if (right) { credited.current.add(id); setHits(v => v + 1); }
    emit({ type: right ? 'correct' : 'incorrect', points: reward });
    setFlash(v => ({ right, sequence: (v?.sequence ?? 0) + 1, bonus: usedBoost && right }));
    if (usedBoost) { setBoosts(boostLedger.current.remaining); setArmed(false); }
  };
  const reset = () => {
    credited.current.clear(); finished.current = false; boostLedger.current = { armed: false, remaining: 2 }; setHits(0); setBoosts(2); setArmed(false); setFlash(null);
    emit({ type: 'reset' });
  };
  const finish = () => { if (!finished.current) { finished.current = true; emit({ type: 'complete' }); } };
  const toggleBoost = () => {
    if (finished.current || boostLedger.current.remaining <= 0) return;
    boostLedger.current.armed = !boostLedger.current.armed;
    setArmed(boostLedger.current.armed);
  };
  return { hits, boosts, armed, flash, decide, reset, finish, toggleBoost };
}
type Run = ReturnType<typeof useChallengeArcade>;
type Variant = 'bulletin' | 'verdict' | 'quiz' | 'dealer';

export function ChallengeArena({ variant, title, announcement, prompt, translation, options, picked, answerIndex, revealed, round, total, score, completed, onPick, onNext, onSkip, onReset, hint, onHint, hintDisabled, run, children, ready = true, onReady, seconds, timeFraction }: {
  variant: Variant; title: string; announcement?: string; prompt?: string; translation?: string; options: string[]; picked: number | null; answerIndex: number; revealed: boolean; round: number; total: number; score: number; completed: boolean; onPick: (i: number) => void; onNext: () => void; onSkip: () => void; onReset: () => void; hint?: string; onHint?: () => void; hintDisabled?: boolean; run: Run; children?: React.ReactNode; ready?: boolean; onReady?: () => void; seconds?: string; timeFraction?: number;
}) {

  const game = ({bulletin:'MultipleChoice',verdict:'TrueFalse',quiz:'QuizShow',dealer:'RandomCards'} as const)[variant];
  const machineItems = options.map((label,i) => ({id:String(i),label,state:revealed && i===answerIndex ? 'right' as const : revealed && i===picked ? 'wrong' as const : 'idle' as const}));
  return <section className={`em-shell challenge-arena challenge-arena--${variant}`} aria-label={title}>
    <span className="challenge-sr" role="status" aria-live="polite">{announcement}</span>
    {completed ? <div className="challenge-finish"><span className="challenge-kicker">DISTRICT COMPLETE · UKOŃCZONO</span><h3>{score === total ? 'A perfect run.' : 'Your city keeps growing.'}</h3><p>{score} / {total} correct · poprawnych odpowiedzi</p><button type="button" onClick={onReset}>Play again · Zagraj ponownie ↻</button></div> : <>
      <div className="challenge-missionbar"><span>{variant === 'verdict' ? 'Read the evidence. Deliver your verdict.' : variant === 'dealer' ? 'Draw. Read. Choose. Collect the card.' : variant === 'quiz' ? 'Choose your answer before the spotlight fades.' : 'Choose the right answer to restore the city lights.'}</span>{seconds && <strong className={(timeFraction ?? 1) < .25 ? 'is-urgent' : ''}>{seconds}s</strong>}</div>
      {timeFraction !== undefined && <div className="challenge-timer" aria-hidden="true"><i style={{ width: `${Math.max(0, timeFraction) * 100}%` }}/></div>}
      {!ready ? <Challenge3D game={game} items={machineItems} ready={false} onReady={onReady} readyLabel={variant === 'dealer' ? 'Deal next card · Rozdaj' : 'Power up round · Start'} roundKey={round}/> : <div key={round} className="challenge-play">
        <Challenge3D game={game} prompt={translation ? prompt + " · " + translation : prompt} items={machineItems} signal={timeFraction ?? 0} roundKey={round} locked={revealed} onPick={id=>onPick(Number(id))} status={picked===answerIndex?'Correct. Terminal unlocked.':'Review the illuminated correct terminal.'} />
        {revealed && <div className="challenge-verdict" role="status"><strong>{picked === answerIndex ? 'Signal restored. · Dobrze!' : 'Keep this one for next time. · Zapamiętaj.'}</strong>{hint && <p>{hint}</p>}<button type="button" onClick={onNext}>{round + 1 >= total ? 'Finish run · Zakończ' : 'Next challenge · Dalej'} →</button></div>}
        {!revealed && hint && <p className="challenge-hint">{hint}</p>}
      </div>}
      <footer className="challenge-controls"><button type="button" className="challenge-boost" aria-pressed={run.armed} disabled={!ready || revealed || run.boosts === 0} onClick={run.toggleBoost}>⚡ {run.armed ? 'Boost armed · Gotowe' : 'Double points · Podwójne punkty'} <small>{run.boosts} left</small></button>{onHint && <button type="button" disabled={revealed || hintDisabled} onClick={onHint}>Hint · Podpowiedź</button>}<button type="button" disabled={!ready || revealed} onClick={onSkip}>Skip · Pomiń</button></footer>
      <p className="challenge-controls-note">2 boosts per run. Use one before answering for double arcade points. Your learning grade stays the same.</p>
    </>}{children}
  </section>;
}

export function ChallengeMission({ title, detail, current, total, children }: { title: string; detail: string; current: number; total: number; children?: React.ReactNode }) {
  return <div className="challenge-mission"><div><span className="challenge-kicker">MISSION · MISJA</span><strong>{title}</strong><p>{detail}</p></div><div className="challenge-mission-meter"><b>{current}<small> / {total}</small></b><div>{Array.from({length:Math.min(total,16)},(_,i)=><i className={i < current / Math.max(total,1)*Math.min(total,16) ? 'is-lit' : ''} key={i}/>)}</div></div>{children}</div>;
}

/** Picking evidence is optional scaffolding: we never assert that a heuristically
 * selected excerpt is the only correct one. The player marks and reviews it. */
export function EvidenceScanner({ passage, onMark }: { passage: string; onMark: () => void }) {
  const [open,setOpen] = useState(false), [marked,setMarked] = useState<number | null>(null);
  const lines = passage.split(/(?<=[.!?])\s+/).filter(Boolean);
  return <div className="challenge-evidence"><button type="button" aria-expanded={open} onClick={() => setOpen(v=>!v)}>⌕ Evidence scanner · Znajdź dowód {marked !== null ? '✓' : ''}</button>{open && <div><p>Mark the sentence that supports your answer. · Zaznacz zdanie uzasadniające odpowiedź.</p>{lines.map((line,i)=><button type="button" className={marked===i ? 'is-selected' : ''} aria-pressed={marked===i} key={i} onClick={()=>{setMarked(i);onMark();}}><small>{String(i+1).padStart(2,'0')}</small>{line}</button>)}</div>}</div>;
}

export function SpeakingMission({ phrases, recording, seconds }: { phrases: string[]; recording: boolean; seconds: number }) {
  const [used,setUsed] = useState<string[]>([]);
  return <div className="challenge-speaking"><div className={`challenge-wave ${recording ? 'is-playing' : ''}`} aria-hidden="true">{Array.from({length:24},(_,i)=><i key={i} style={{height: `${14+(i*17%36)}px`,animationDelay:`${i*-.11}s`}}/>)}</div><div><strong>{recording ? `On air · Nagrywanie ${seconds}s` : 'Your mission: use these phrases naturally.'}</strong><p>After speaking, tick the phrases you used. This is your own check, not an automatic score.</p><div className="challenge-targets">{phrases.map(phrase=><button type="button" key={phrase} aria-pressed={used.includes(phrase)} onClick={()=>setUsed(v=>v.includes(phrase)?v.filter(p=>p!==phrase):[...v,phrase])}>{used.includes(phrase)?'✓':'+'} {phrase}</button>)}</div></div></div>;
}

export function PairArena({ title, announcement, memory, cards, matched, flipped, selected, wrong, hintGlow, onPick, onHint, hintDisabled, onReset, scouting, onScout, scoutUsed, priority }: {
  title: string; announcement?: string; memory: boolean; cards: Array<{ key: string; pairId: string; side: 'prompt'|'answer'; text: string }>; matched: string[]; flipped?: string[]; selected?: string | null; wrong: string[]; hintGlow?: string | null; onPick: (key: string) => void; onHint: () => void; hintDisabled: boolean; onReset: () => void; scouting?: boolean; onScout?: () => void; scoutUsed?: boolean; priority?: string;
}) {
  const total = cards.length / 2, done = matched.length >= total;
  return <section className={`em-shell challenge-pairs ${memory ? 'is-memory' : 'is-dispatch'}`} aria-label={title}>
    <span className="challenge-sr" role="status" aria-live="polite">{announcement}</span>
    <header className="challenge-head"><div><span className="challenge-kicker">{memory ? 'MEMORY GRID · SIATKA PAMIĘCI' : 'DISPATCH DESK · BIURO ZGUB'}</span><h2>{title}</h2></div><span className="challenge-pair-badge">{memory ? '◇' : '↗'}</span></header>
    <ChallengeMission title={memory ? 'Restore every memory circuit.' : 'Return every item to its owner.'} detail={memory ? 'Scout the board once, then match each clue with its word. · Znajdź wszystkie pary.' : 'Select a clue and its matching word. Priority deliveries earn 150 base points.'} current={matched.length} total={total}>
      {memory && <button type="button" onClick={onScout} disabled={scoutUsed || done}>{scouting ? 'Scanning… · Skanowanie…' : scoutUsed ? 'Scout used · Skan użyty' : 'Scout board · Skanuj (3s)'}</button>}
      <button type="button" onClick={onHint} disabled={hintDisabled || done}>Locate a pair · Znajdź parę</button>
    </ChallengeMission>
    {!memory && priority && !done && <div className="challenge-priority"><span>PRIORITY DELIVERY · PRIORYTET</span><strong>{priority}</strong></div>}
    <Challenge3D game={memory?'Concentration':'FindTheMatch'} items={cards.map((card,i)=>{
      const paired=matched.includes(card.pairId),faceUp=!memory||paired||scouting||flipped?.includes(card.key)||hintGlow===card.pairId;
      return {id:card.key,pairId:card.pairId,side:card.side,label:faceUp?card.text:`Panel ${i+1}`,state:paired?'right':wrong.includes(card.key)?'wrong':selected===card.key||flipped?.includes(card.key)||hintGlow===card.pairId?'selected':faceUp?'idle':'hidden',locked:paired||!!scouting};
    })} onPick={onPick} locked={done} status={scouting?'Scout scan active. Remember these panels.':memory?'Open two panels to complete a circuit.':'Choose a clue and its matching destination.'}/>
    {done && <div className="challenge-finish"><span className="challenge-kicker">{memory?'ALL CIRCUITS RESTORED':'ALL DELIVERIES COMPLETE'}</span><h3>{memory?'Every pair remembered.':'Every owner found.'}</h3><button type="button" onClick={onReset}>Play again · Zagraj ponownie ↻</button></div>}
  </section>;
}
