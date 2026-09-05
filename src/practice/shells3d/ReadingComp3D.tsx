import { Challenge3DPreferences } from '../shells/challenge-3d-preferences';
import CanonicalShell from '../shells/ReadingComp';
import { ChallengeMachine, type MachineProps } from './challenge-machine';
const design = { kind: 'gallery', title: 'The Detective Gallery', instruction: 'Read the case passage and mark your evidence. Select the exhibit containing your conclusion, then seal the case.', action: 'Seal this case', color: '#c7b2da', mode: 'choice' } as const;
/** Canonical handlers own grading; this chunk owns the spatial interaction. */
export default function ReadingComp3D(props: MachineProps) {
  if (props.items === undefined) return <Challenge3DPreferences value={{quality:props.quality,reducedMotion:props.reducedMotion}}><div style={props.fullscreen?{position:"fixed",inset:0,zIndex:900,overflow:"auto",background:"#14222d"}:undefined}><CanonicalShell puzzle={props.puzzle as never} onSessionComplete={props.onSessionComplete ? r => props.onSessionComplete?.({...r,shellKey:'readingcomp'}) : undefined} /></div></Challenge3DPreferences>;
  return <ChallengeMachine {...props} design={design} />;
}
