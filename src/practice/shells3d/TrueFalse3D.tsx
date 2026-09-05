import { Challenge3DPreferences } from '../shells/challenge-3d-preferences';
import CanonicalShell from '../shells/TrueFalse';
import { ChallengeMachine, type MachineProps } from './challenge-machine';
const design = { kind: 'junction', title: 'The Verdict Junction', instruction: 'Throw the switch towards TRUE or FALSE. Send the tram only when you have chosen its route.', action: 'Dispatch tram', color: '#9cccb6', mode: 'choice' } as const;
/** Canonical handlers own grading; this chunk owns the spatial interaction. */
export default function TrueFalse3D(props: MachineProps) {
  if (props.items === undefined) return <Challenge3DPreferences value={{quality:props.quality,reducedMotion:props.reducedMotion}}><div style={props.fullscreen?{position:"fixed",inset:0,zIndex:900,overflow:"auto",background:"#14222d"}:undefined}><CanonicalShell puzzle={props.puzzle as never} onSessionComplete={props.onSessionComplete ? r => props.onSessionComplete?.({...r,shellKey:'truefalse'}) : undefined} /></div></Challenge3DPreferences>;
  return <ChallengeMachine {...props} design={design} />;
}
