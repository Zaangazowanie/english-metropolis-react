import { Challenge3DPreferences } from '../shells/challenge-3d-preferences';
import CanonicalShell from '../shells/ListeningComp';
import { ChallengeMachine, type MachineProps } from './challenge-machine';
const design = { kind: 'radio', title: 'The Radio Dispatch', instruction: 'Use the message to choose an answer frequency, then transmit your response. Read the transcript whenever you need it.', action: 'Transmit response', color: '#00d5ff', mode: 'choice' } as const;
/** Canonical handlers own grading; this chunk owns the spatial interaction. */
export default function ListeningComp3D(props: MachineProps) {
  if (props.items === undefined) return <Challenge3DPreferences value={{quality:props.quality,reducedMotion:props.reducedMotion}}><div style={props.fullscreen?{position:"fixed",inset:0,zIndex:900,overflow:"auto",background:"#090d38"}:undefined}><CanonicalShell puzzle={props.puzzle as never} onSessionComplete={props.onSessionComplete ? r => props.onSessionComplete?.({...r,shellKey:'listeningcomp'}) : undefined} /></div></Challenge3DPreferences>;
  return <ChallengeMachine {...props} design={design} />;
}
