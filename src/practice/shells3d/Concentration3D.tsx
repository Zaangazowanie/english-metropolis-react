import { Challenge3DPreferences } from '../shells/challenge-3d-preferences';
import CanonicalShell from '../shells/Concentration';
import { ChallengeMachine, type MachineProps } from './challenge-machine';
const design = { kind: 'memory', title: 'The Memory Vault', instruction: 'Open two numbered vault panels. A matching clue and word powers their memory circuit.', action: 'Open panel', color: '#00c8ff', mode: 'direct' } as const;
/** Canonical handlers own grading; this chunk owns the spatial interaction. */
export default function Concentration3D(props: MachineProps) {
  if (props.items === undefined) return <Challenge3DPreferences value={{quality:props.quality,reducedMotion:props.reducedMotion}}><div style={props.fullscreen?{position:"fixed",inset:0,zIndex:900,overflow:"auto",background:"#090d38"}:undefined}><CanonicalShell puzzle={props.puzzle as never} onSessionComplete={props.onSessionComplete ? r => props.onSessionComplete?.({...r,shellKey:'concentration'}) : undefined} /></div></Challenge3DPreferences>;
  return <ChallengeMachine {...props} design={design} />;
}
