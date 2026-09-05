import { useCallback, useRef, useState } from 'react';
import { ArcadeEventsContext, useArcadeEvents, type ArcadeEvent } from '../lib/arcade-events';
import { Challenge3DPreferences } from '../shells/challenge-3d-preferences';
import CanonicalShell, { type RankOrderPuzzle, type RankOrderShellProps } from '../shells/RankOrder';
import { ChallengeMachine, type MachineProps } from './challenge-machine';
import type { Game3DProps } from './types';
const design = { kind: 'freight', title: 'The Freight Marshalling Yard', instruction: 'Load each item wagon into the ranked track sockets. Dispatch the entire train to check its order.', action: 'Dispatch train', color: '#b7c89b', mode: 'assembly' } as const;

/** Older registry hosts can supply a deck. Keep each canonical ranking result,
 * and emit the advertised session result only once the full deck is complete. */
function LegacyRankDeck({puzzles,onSessionComplete}:{puzzles:RankOrderPuzzle[];onSessionComplete:Game3DProps['onSessionComplete']}) {
  type RoundResult = Parameters<NonNullable<RankOrderShellProps['onSessionComplete']>>[0];
  const [round,setRound] = useState(0), [revision,setRevision] = useState(0), [results,setResults] = useState<RoundResult[]>([]);
  const accepted = useRef(new Set<number>()), started = useRef(Date.now());
  const emit = useArcadeEvents();
  const forward = useCallback((event:ArcadeEvent)=>{if(event.type!=='complete'&&event.type!=='reset')emit(event);},[emit]);
  const completeRound = (result:RoundResult) => {
    if (accepted.current.has(round)) return;
    accepted.current.add(round);
    const next = [...results,result];
    setResults(next);
    if (next.length === puzzles.length) {
      emit({type:'complete'});
      onSessionComplete?.({correctCount:next.reduce((sum,r)=>sum+r.correctCount,0),totalQuestions:next.reduce((sum,r)=>sum+r.totalQuestions,0),durationMs:Date.now()-started.current,shellKey:'rankorder'});
    }
  };
  const reset = () => {accepted.current.clear();started.current=Date.now();setResults([]);setRound(0);setRevision(v=>v+1);emit({type:'reset'});};
  if (results.length > round) {
    const done = results.length === puzzles.length;
    return <div className="challenge-machine"><div className="cm-heading"><strong>{done?'Freight route complete':'Train dispatched'}</strong><p>{results.reduce((sum,r)=>sum+r.correctCount,0)} / {results.reduce((sum,r)=>sum+r.totalQuestions,0)} correct · {results.length} / {puzzles.length} trains</p></div><button type="button" className="cm-action" onClick={done?reset:()=>setRound(v=>v+1)}>{done?'Play again':'Next train'} →</button></div>;
  }
  return <ArcadeEventsContext.Provider value={forward}><CanonicalShell key={revision+':'+round} puzzle={puzzles[round]} onSessionComplete={completeRound}/></ArcadeEventsContext.Provider>;
}
/** Canonical handlers own grading; this chunk owns the spatial interaction. */
export default function RankOrder3D(props: MachineProps) {
  const deck = Array.isArray(props.puzzle) ? (props.puzzle as RankOrderPuzzle[]).filter(p=>p?.items?.length) : null;
  if (props.items === undefined) return <Challenge3DPreferences value={{quality:props.quality,reducedMotion:props.reducedMotion}}><div style={props.fullscreen?{position:"fixed",inset:0,zIndex:900,overflow:"auto",background:"#14222d"}:undefined}>{deck?.length ? <LegacyRankDeck key={JSON.stringify(deck)} puzzles={deck} onSessionComplete={props.onSessionComplete}/> : <CanonicalShell puzzle={Array.isArray(props.puzzle)?undefined:props.puzzle as never} onSessionComplete={props.onSessionComplete ? r => props.onSessionComplete?.({...r,shellKey:'rankorder'}) : undefined} />}</div></Challenge3DPreferences>;
  return <ChallengeMachine {...props} design={design} />;
}
