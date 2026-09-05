import { useMemo } from 'react';
import { generateGapFill, type GapFillPuzzle } from '../generators/generateGapFill';
import { adaptGapFill, type ShellGapFillPuzzle } from '../lib/adapters';
import { Challenge3DPreferences } from '../shells/challenge-3d-preferences';
import CanonicalShell from '../shells/GapFill';
import { ChallengeMachine, type MachineProps } from './challenge-machine';
const design = { kind: 'crane', title: 'The Word Crane', instruction: 'Lift a word crate from the upper gantry, then install it in a numbered sign socket. Filled sockets can be cleared and rebuilt.', action: 'Install word', color: '#ff8c00', mode: 'assembly' } as const;
/** Canonical handlers own grading; this chunk owns the spatial interaction. */
export default function GapFill3D(props: MachineProps) {
  const puzzle = useMemo(() => {
    const input = props.puzzle as ShellGapFillPuzzle | GapFillPuzzle | undefined;
    if (input?.scenes?.length) return 'sign' in input.scenes[0] ? input as ShellGapFillPuzzle : adaptGapFill(input as GapFillPuzzle);
    if (props.vocab && props.vocab.length >= 3) {
      const generated = generateGapFill(props.vocab.map(v => ({ word:v.word,word_pl:v.word_pl ?? '',exampleEn:v.exampleEn })),{sceneCount:5,seed:0xD057});
      if (generated.scenes.length) return adaptGapFill(generated);
    }
    return undefined;
  }, [props.puzzle, props.vocab]);
  if (props.items === undefined) return <Challenge3DPreferences value={{quality:props.quality,reducedMotion:props.reducedMotion}}><div style={props.fullscreen?{position:"fixed",inset:0,zIndex:900,overflow:"auto",background:"#090d38"}:undefined}><CanonicalShell puzzle={puzzle} onSessionComplete={props.onSessionComplete ? r => props.onSessionComplete?.({...r,shellKey:'gapfill'}) : undefined} /></div></Challenge3DPreferences>;
  return <ChallengeMachine {...props} design={design} />;
}
