import { useMemo } from 'react';
import { Challenge3DPreferences } from '../shells/challenge-3d-preferences';
import CanonicalShell, { type ShellMultipleChoicePuzzle } from '../shells/MultipleChoice';
import { ChallengeMachine, type MachineProps } from './challenge-machine';
const design = { kind: 'target', title: 'The Answer Vault', instruction: 'Aim at the terminal carrying the correct answer, then fire the key beam to unlock it.', action: 'Fire key beam', color: '#b4a0ed', mode: 'choice' } as const;
/** Canonical handlers own grading; this chunk owns the spatial interaction. */
export default function MultipleChoice3D(props: MachineProps) {
  const puzzle = useMemo(() => {
    const input = props.puzzle as ShellMultipleChoicePuzzle | undefined;
    if (!input?.questions?.length) return undefined;
    return {...input,questions:input.questions.map((q,i)=>({...q,id:q.id || `legacy-mc-${i}`,hint:q.hint ?? '',hint_pl:q.hint_pl ?? ''}))};
  }, [props.puzzle]);
  if (props.items === undefined) return <Challenge3DPreferences value={{quality:props.quality,reducedMotion:props.reducedMotion}}><div style={props.fullscreen?{position:"fixed",inset:0,zIndex:900,overflow:"auto",background:"#14222d"}:undefined}><CanonicalShell puzzle={puzzle} onSessionComplete={props.onSessionComplete ? r => props.onSessionComplete?.({...r,shellKey:'multiplechoice'}) : undefined} /></div></Challenge3DPreferences>;
  return <ChallengeMachine {...props} design={design} />;
}
