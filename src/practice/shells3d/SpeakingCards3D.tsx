import { Challenge3DPreferences } from '../shells/challenge-3d-preferences';
import CanonicalShell from '../shells/SpeakingCards';
import { ChallengeMachine, type MachineProps } from './challenge-machine';
const design = { kind: 'studio', title: 'Bajla Broadcast Studio', instruction: 'Reveal the phrase cues and say your response aloud. Record if you choose, then use an honest self-rating to complete the card.', action: 'Broadcast', color: '#ff2370', mode: 'direct' } as const;
/** Canonical handlers own grading; this chunk owns the spatial interaction. */
export default function SpeakingCards3D(props: MachineProps) {
  if (props.items === undefined) return <Challenge3DPreferences value={{quality:props.quality,reducedMotion:props.reducedMotion}}><div style={props.fullscreen?{position:"fixed",inset:0,zIndex:900,overflow:"auto",background:"#090d38"}:undefined}><CanonicalShell puzzle={props.puzzle as never} onSessionComplete={props.onSessionComplete ? r => props.onSessionComplete?.({...r,shellKey:'speakingcards'}) : undefined} /></div></Challenge3DPreferences>;
  return <ChallengeMachine {...props} design={design} />;
}
