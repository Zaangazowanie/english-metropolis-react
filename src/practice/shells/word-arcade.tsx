import { useCallback, useState, useRef } from 'react';
import { useArcadeEvents } from '../lib/arcade-events';
import './word-arcade.css';

/** Local reactions are driven by committed answers, never a render or persistence effect. */
export function useWordArcade() {
  const emit = useArcadeEvents();
  const finished = useRef(false);
  const [chain, setChain] = useState(0);
  const [reaction, setReaction] = useState<{ correct: boolean; id: number } | null>(null);
  const answer = useCallback((correct: boolean, points = 100) => {
    emit({ type: correct ? 'correct' : 'incorrect', points: correct ? points : 0 });
    setChain(value => correct ? value + 1 : 0);
    setReaction(value => ({ correct, id: (value?.id ?? 0) + 1 }));
  }, [emit]);
  const complete = useCallback(() => { if (!finished.current) { finished.current=true; emit({type:'complete'}); } }, [emit]);
  const restart = useCallback(() => { finished.current=false; setChain(0); setReaction(null); emit({ type: 'reset' }); }, [emit]);
  return { answer, restart, complete, chain, reaction };
}

type MissionKind = 'forge' | 'signals' | 'memory' | 'dispatch' | 'manuscript' | 'scanner' | 'stage' | 'construction' | 'translation' | 'lanterns' | 'search' | 'crossword' | 'cargo' | 'sorting';
const captions: Record<MissionKind, [string, string]> = {
  forge: ['LETTER FORGE', 'Assemble the clue. Power the workshop.'],
  signals: ['SIGNAL CONTROL', 'Connect the meanings to release the train.'],
  memory: ['MEMORY VAULT', 'Recall first. Reveal. Lock it into memory.'],
  dispatch: ['NIGHT DISPATCH', 'Send a perfect message. Build your pace.'],
  manuscript: ['RESTORE THE ARCHIVE', 'Recover each missing word to seal the manuscript.'],
  scanner: ['ERROR DETECTIVE', 'Find the fault. Repair the sentence. Clear the case.'],
  stage: ['SOUND CHECK', 'Hear the word. Spell it. Light the concert hall.'],
  construction: ['WORD FACTORY', 'Transform the base word to complete the build.'],
  translation: ['MESSAGE RELAY', 'Keep the meaning. Carry the key word into the new sentence.'],
  lanterns: ['KEEP THE ALLEY ALIGHT', 'Save your lanterns by finding the missing letters.'],
  search: ['NEON HUNT', 'Trace hidden words to switch on the market signs.'],
  crossword: ['BLUEPRINT BUILDER', 'Complete each street and connect the district.'],
  cargo: ['CARGO CONTROL', 'Load the right words. Send the sentence on its way.'],
  sorting: ['EXPRESS SORT', 'Route every word to the correct destination.'],
};
export function WordMission({ kind, current, total, chain = 0, reaction, detail }: {
  kind: MissionKind; current: number; total: number; chain?: number;
  reaction?: { correct: boolean; id: number } | null; detail?: string;
}) {
  const [title, subtitle] = captions[kind];
  const ratio = Math.max(0, Math.min(1, current / Math.max(1, total)));
  return <div className={`wa-mission wa-mission--${kind}`}>
    <svg className="wa-mission-art" viewBox="0 0 180 76" aria-hidden="true">
      <path d="M2 68H178M8 73H172" stroke="currentColor" opacity=".3" />
      {Array.from({ length: 8 }, (_, i) => <g key={i} style={{ opacity: i / 8 < ratio ? 1 : .24 }}>
        <path d={`M${8+i*21} 65V${48-(i%3)*12}h16v${17+(i%3)*12}z`} fill="currentColor" opacity=".15" />
        <path d={`M${8+i*21} 65V${48-(i%3)*12}h16v${17+(i%3)*12}`} fill="none" stroke="currentColor" />
        {[0,1,2].map(r => <path key={r} d={`M${12+i*21} ${54-r*8}h3m3 0h3`} stroke="currentColor" strokeWidth="2" />)}
      </g>)}
      <g className="wa-mission-vehicle" style={{ transform: `translateX(${ratio*126}px)` }}>
        <rect x="7" y="57" width="39" height="13" rx="4" fill="currentColor" />
        <path d="M13 61h5m3 0h5m3 0h5m3 0h4" stroke="#161025" strokeWidth="3" />
        <circle cx="16" cy="71" r="2" fill="currentColor"/><circle cx="36" cy="71" r="2" fill="currentColor" />
      </g>
    </svg>
    <div className="wa-mission-copy"><span>{title}</span><strong>{detail ?? subtitle}</strong><div className="wa-power" aria-label={`${Math.round(ratio*100)}% mission progress`}><i style={{ width: `${ratio*100}%` }}/></div></div>
    {reaction && <span key={reaction.id} className={`wa-reaction ${reaction.correct ? 'is-right' : 'is-wrong'}`} role="status">{reaction.correct ? chain > 1 ? `${chain} in a row` : 'Signal clear!' : 'Try again'}</span>}
  </div>;
}
