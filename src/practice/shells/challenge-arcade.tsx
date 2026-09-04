import React, { useRef, useState } from 'react';
import { useArcadeEvents } from '../lib/arcade-events';
import { challengeReward } from './challenge-arcade-logic';
import './challenge-arcade.css';

/** Arcade rewards are separate from the saved learning grade. An id can only
 * earn points once, so moving a solved tile back and forth cannot farm points. */
export function useChallengeArcade() {
  const emit = useArcadeEvents();
  const credited = useRef(new Set<string>());
  const finished = useRef(false);
  const [hits, setHits] = useState(0);
  const [boosts, setBoosts] = useState(2);
  const [armed, setArmed] = useState(false);
  const [flash, setFlash] = useState<{ right: boolean; sequence: number; bonus: boolean } | null>(null);
  const decide = (right: boolean, id: string, points = 100) => {
    const reward = challengeReward(right, credited.current.has(id), armed, points);
    if (reward === null || finished.current) return;
    if (right) { credited.current.add(id); setHits(v => v + 1); }
    emit({ type: right ? 'correct' : 'incorrect', points: reward });
    setFlash(v => ({ right, sequence: (v?.sequence ?? 0) + 1, bonus: armed && right }));
    if (armed) { setBoosts(v => Math.max(0, v - 1)); setArmed(false); }
  };
  const reset = () => {
    credited.current.clear(); finished.current = false; setHits(0); setBoosts(2); setArmed(false); setFlash(null);
    emit({ type: 'reset' });
  };
  const finish = () => { if (!finished.current) { finished.current = true; emit({ type: 'complete' }); } };
  return { hits, boosts, armed, flash, decide, reset, finish, toggleBoost: () => setArmed(v => !v) };
}
type Run = ReturnType<typeof useChallengeArcade>;
type Variant = 'bulletin' | 'verdict' | 'quiz' | 'dealer';

export function ChallengeCity({ lit, total, variant = 'bulletin' }: { lit: number; total: number; variant?: Variant }) {
  const progress = Math.min(1, lit / Math.max(total, 1));
  return <svg className={`challenge-city challenge-city--${variant}`} viewBox="0 0 680 230" aria-hidden="true">
    <defs><linearGradient id={`ca-sky-${variant}`} x2="0" y2="1"><stop stopColor="#26305e"/><stop offset="1" stopColor="#111525"/></linearGradient></defs>
    <rect width="680" height="230" fill={`url(#ca-sky-${variant})`}/>
    {Array.from({ length: 38 }, (_, i) => <circle key={`s${i}`} cx={(i * 79 + 21) % 680} cy={(i * 29 + 13) % 120} r={i % 4 === 0 ? 1.3 : .6} fill="#d3d9ff" opacity=".45"/>)}
    {Array.from({ length: 17 }, (_, i) => {
      const h = 40 + ((i * 29) % 100), active = i / 17 < progress;
      return <g key={i} className={active ? 'challenge-building is-lit' : 'challenge-building'}>
        <path d={`M${i * 40} 210V${210 - h}h13v-8h10v8h15v${h}`} fill={active ? '#30436d' : '#1b2543'} stroke="#596a9538"/>
        {Array.from({ length: Math.floor(h / 12) * 3 }, (_, k) => <rect key={k} x={i * 40 + 5 + k % 3 * 10} y={218 - h + Math.floor(k / 3) * 11} width="3" height="4" rx=".5" fill={active ? (k % 3 ? '#f7dca5' : '#82dfdb') : '#546185'} opacity={active ? .9 : .26}/>)}</g>;
    })}
    <path d="M0 213H680M0 222H680" stroke="#bd9ff7" strokeWidth="1.5" opacity=".6"/>
    {variant === 'verdict' && <g stroke="#a9ddc9" fill="none" opacity=".6"><path d="M80 208V107M600 208V107M80 120Q340 295 600 120M80 114Q340 10 600 114"/>{Array.from({ length: 12 },(_,i)=><path key={i} d={`M${100+i*43} 180V210`}/>)}</g>}
    <g className="challenge-train" style={{ transform: `translateX(${20 + progress * 550}px)` }}><rect x="0" y="201" width="72" height="15" rx="5" fill="#d5c5ff"/><path d="M9 205H57" stroke="#152040" strokeWidth="5" strokeDasharray="8 3"/><circle cx="63" cy="209" r="2" fill="#fff3cb"/></g>
  </svg>;
}

export function ChallengeArena({ variant, title, mission, prompt, translation, options, picked, answerIndex, revealed, round, total, score, completed, onPick, onNext, onSkip, onReset, hint, onHint, hintDisabled, run, children, ready = true, onReady, seconds, timeFraction }: {
  variant: Variant; title: string; mission: string; prompt?: string; translation?: string; options: string[]; picked: number | null; answerIndex: number; revealed: boolean; round: number; total: number; score: number; completed: boolean; onPick: (i: number) => void; onNext: () => void; onSkip: () => void; onReset: () => void; hint?: string; onHint?: () => void; hintDisabled?: boolean; run: Run; children?: React.ReactNode; ready?: boolean; onReady?: () => void; seconds?: string; timeFraction?: number;
}) {
  const names = { bulletin: 'POWER THE DISTRICT', verdict: 'OPEN THE CROSSING', quiz: 'TAKE THE SPOTLIGHT', dealer: 'BUILD YOUR WINNING HAND' };
  return <section className={`em-shell challenge-arena challenge-arena--${variant}`} aria-label={title} tabIndex={0}
    onKeyDown={e => {
      if (e.target instanceof HTMLElement && (e.target.matches('input,textarea,select') || e.target.isContentEditable)) return;
      const key = e.key.toLowerCase();
      const index = variant === 'verdict' && key === 't' ? 0 : variant === 'verdict' && key === 'f' ? 1 : Number(key) - 1;
      if (!revealed && ready && index >= 0 && index < options.length) { e.preventDefault(); onPick(index); }
    }}>
    <header className="challenge-head"><div><span className="challenge-kicker">{names[variant]}</span><h2>{title}</h2></div><div className="challenge-round"><span>ROUND · RUNDA</span><strong>{String(Math.min(round + 1, total)).padStart(2, '0')}<small> / {String(total).padStart(2, '0')}</small></strong></div></header>
    <div className="challenge-world"><ChallengeCity lit={score} total={total} variant={variant}/><div className="challenge-world-caption"><span>{mission}</span><strong>{score}<small> / {total}</small></strong></div></div>
    {completed ? <div className="challenge-finish"><span className="challenge-kicker">DISTRICT COMPLETE · UKOŃCZONO</span><h3>{score === total ? 'A perfect run.' : 'Your city keeps growing.'}</h3><p>{score} / {total} correct · poprawnych odpowiedzi</p><button type="button" onClick={onReset}>Play again · Zagraj ponownie ↻</button></div> : <>
      <div className="challenge-missionbar"><span>{variant === 'verdict' ? 'Read the evidence. Deliver your verdict.' : variant === 'dealer' ? 'Draw. Read. Choose. Collect the card.' : variant === 'quiz' ? 'Choose your answer before the spotlight fades.' : 'Choose the right answer to restore the city lights.'}</span>{seconds && <strong className={(timeFraction ?? 1) < .25 ? 'is-urgent' : ''}>{seconds}s</strong>}</div>
      {timeFraction !== undefined && <div className="challenge-timer" aria-hidden="true"><i style={{ width: `${Math.max(0, timeFraction) * 100}%` }}/></div>}
      {!ready ? <div className="challenge-deal"><div className="challenge-card-stack" aria-hidden="true"><i/><i/><i/><b>{variant === 'dealer' ? '♠' : '▶'}</b></div><button type="button" onClick={onReady}>{variant === 'dealer' ? 'Deal the next card · Rozdaj kartę' : 'Start round · Rozpocznij rundę'} →</button></div> : <div key={round} className="challenge-play">
        <div className="challenge-prompt"><span className="challenge-kicker">{variant === 'verdict' ? 'THE STATEMENT · STWIERDZENIE' : 'YOUR CHALLENGE · WYZWANIE'}</span><h3>{prompt}</h3>{translation && <p>{translation}</p>}</div>
        <div className={`challenge-choices ${options.length === 2 ? 'is-binary' : ''}`}>{options.map((option,i) => <button type="button" key={`${round}-${i}`} className={`challenge-choice ${revealed && i === answerIndex ? 'is-right' : ''} ${revealed && picked === i && i !== answerIndex ? 'is-wrong' : ''}`} disabled={revealed} onClick={() => onPick(i)}><kbd>{variant === 'verdict' ? i ? 'F' : 'T' : i + 1}</kbd><span>{option}</span><b>{revealed && i === answerIndex ? '✓' : revealed && picked === i ? '×' : '↗'}</b></button>)}</div>
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

export function PairArena({ title, memory, cards, matched, flipped, selected, wrong, hintGlow, onPick, onHint, hintDisabled, onReset, scouting, onScout, scoutUsed, priority }: {
  title: string; memory: boolean; cards: Array<{ key: string; pairId: string; side: 'prompt'|'answer'; text: string }>; matched: string[]; flipped?: string[]; selected?: string | null; wrong: string[]; hintGlow?: string | null; onPick: (key: string) => void; onHint: () => void; hintDisabled: boolean; onReset: () => void; scouting?: boolean; onScout?: () => void; scoutUsed?: boolean; priority?: string;
}) {
  const total = cards.length / 2, done = matched.length >= total;
  return <section className={`em-shell challenge-pairs ${memory ? 'is-memory' : 'is-dispatch'}`} aria-label={title}>
    <header className="challenge-head"><div><span className="challenge-kicker">{memory ? 'MEMORY GRID · SIATKA PAMIĘCI' : 'DISPATCH DESK · BIURO ZGUB'}</span><h2>{title}</h2></div><span className="challenge-pair-badge">{memory ? '◇' : '↗'}</span></header>
    <ChallengeMission title={memory ? 'Restore every memory circuit.' : 'Return every item to its owner.'} detail={memory ? 'Scout the board once, then match each clue with its word. · Znajdź wszystkie pary.' : 'Select a clue and its matching word. Priority deliveries earn 150 base points.'} current={matched.length} total={total}>
      {memory && <button type="button" onClick={onScout} disabled={scoutUsed || done}>{scouting ? 'Scanning… · Skanowanie…' : scoutUsed ? 'Scout used · Skan użyty' : 'Scout board · Skanuj (3s)'}</button>}
      <button type="button" onClick={onHint} disabled={hintDisabled || done}>Locate a pair · Znajdź parę</button>
    </ChallengeMission>
    {!memory && priority && !done && <div className="challenge-priority"><span>PRIORITY DELIVERY · PRIORYTET</span><strong>{priority}</strong></div>}
    <div className="challenge-pair-grid">{cards.map((card,i)=>{
      const paired=matched.includes(card.pairId), faceUp=!memory||paired||scouting||flipped?.includes(card.key);
      return <button type="button" key={card.key} className={`challenge-pair ${faceUp?'is-open':''} ${paired?'is-matched':''} ${selected===card.key?'is-selected':''} ${wrong.includes(card.key)?'is-wrong':''} ${hintGlow===card.pairId?'is-hinted':''}`} disabled={paired || !!scouting} onClick={()=>onPick(card.key)} aria-pressed={paired || selected===card.key || !!flipped?.includes(card.key)} aria-label={faceUp?`${card.side==='prompt'?'Clue':'Word'}: ${card.text}`:`Card ${i+1}. Tap to flip.`}>
        <small>{String(i+1).padStart(2,'0')}</small>{faceUp?<><span className="challenge-pair-side">{card.side==='prompt'?'CLUE · WSKAZÓWKA':'WORD · SŁOWO'}</span><strong>{card.text}</strong><b>{paired?'✓':selected===card.key?'●':'↗'}</b></>:<><span className="challenge-memory-chip">◇</span><span className="challenge-pair-side">TAP TO REVEAL</span></>}
      </button>;
    })}</div>
    {done && <div className="challenge-finish"><span className="challenge-kicker">{memory?'ALL CIRCUITS RESTORED':'ALL DELIVERIES COMPLETE'}</span><h3>{memory?'Every pair remembered.':'Every owner found.'}</h3><button type="button" onClick={onReset}>Play again · Zagraj ponownie ↻</button></div>}
  </section>;
}
