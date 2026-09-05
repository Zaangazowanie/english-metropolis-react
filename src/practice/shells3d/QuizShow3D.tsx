import { Challenge3DPreferences } from '../shells/challenge-3d-preferences';
import CanonicalShell from '../shells/QuizShow';
import { ChallengeMachine, type MachineProps } from './challenge-machine';
const design = { kind: 'reactor', title: 'The Quiz Reactor', instruction: 'Power up a round, aim at an answer core, then release the charge before the timer expires.', action: 'Release charge', color: '#e5bd79', mode: 'choice' } as const;
/** Canonical handlers own grading; this chunk owns the spatial interaction. */
export default function QuizShow3D(props: MachineProps) {
  if (props.items === undefined) return <Challenge3DPreferences value={{quality:props.quality,reducedMotion:props.reducedMotion}}><div style={props.fullscreen?{position:"fixed",inset:0,zIndex:900,overflow:"auto",background:"#14222d"}:undefined}><CanonicalShell puzzle={props.puzzle as never} onSessionComplete={props.onSessionComplete ? r => props.onSessionComplete?.({...r,shellKey:'quizshow'}) : undefined} /></div></Challenge3DPreferences>;
  return <ChallengeMachine {...props} design={design} />;
}
