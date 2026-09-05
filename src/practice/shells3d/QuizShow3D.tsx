import { Challenge3DPreferences } from '../shells/challenge-3d-preferences';
import CanonicalShell from '../shells/QuizShow';
import { ChallengeMachine, type MachineProps } from './challenge-machine';
const design = { kind: 'reactor', title: 'The Quiz Reactor', instruction: 'Start the round, choose an answer core, then release the charge. In timed mode, confirm before the countdown reaches zero.', action: 'Release charge', color: '#ffcc00', mode: 'choice' } as const;
/** Canonical handlers own grading; this chunk owns the spatial interaction. */
export default function QuizShow3D(props: MachineProps) {
  if (props.items === undefined) return <Challenge3DPreferences value={{quality:props.quality,reducedMotion:props.reducedMotion}}><div style={props.fullscreen?{position:"fixed",inset:0,zIndex:900,overflow:"auto",background:"#090d38"}:undefined}><CanonicalShell puzzle={props.puzzle as never} onSessionComplete={props.onSessionComplete ? r => props.onSessionComplete?.({...r,shellKey:'quizshow'}) : undefined} /></div></Challenge3DPreferences>;
  return <ChallengeMachine {...props} design={design} />;
}
