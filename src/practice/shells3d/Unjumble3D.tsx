import { useMemo } from 'react';
import { Challenge3DPreferences } from '../shells/challenge-3d-preferences';
import CanonicalShell, { type UnjumblePuzzle } from '../shells/Unjumble';
import { ChallengeMachine, type MachineProps } from './challenge-machine';
const design = { kind: 'sentence', title: 'The Sentence Express', instruction: 'Couple the word wagons in the right sequence. Launch the train only when the whole sentence is assembled.', action: 'Launch sentence', color: '#008cff', mode: 'assembly' } as const;
/** Canonical handlers own grading; this chunk owns the spatial interaction. */
export default function Unjumble3D(props: MachineProps) {
  const puzzle = useMemo(() => {
    const input = props.puzzle as UnjumblePuzzle | undefined;
    if (!input?.items?.length) return undefined;
    return {...input,items:input.items.map((q,i)=>({...q,id:q.id || `legacy-uj-${i}`,hint:q.hint ?? '',hint_pl:q.hint_pl ?? ''}))};
  }, [props.puzzle]);
  if (props.items === undefined) return <Challenge3DPreferences value={{quality:props.quality,reducedMotion:props.reducedMotion}}><div style={props.fullscreen?{position:"fixed",inset:0,zIndex:900,overflow:"auto",background:"#090d38"}:undefined}><CanonicalShell puzzle={puzzle} onSessionComplete={props.onSessionComplete ? r => props.onSessionComplete?.({...r,shellKey:'unjumble'}) : undefined} /></div></Challenge3DPreferences>;
  return <ChallengeMachine {...props} design={design} />;
}
