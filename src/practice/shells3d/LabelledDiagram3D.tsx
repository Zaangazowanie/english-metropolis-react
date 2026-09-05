import { useMemo } from 'react';
import { generateLabelledDiagramPuzzle, type LabelledDiagramPuzzle } from '../generators/generateLabelledDiagram';
import { Challenge3DPreferences } from '../shells/challenge-3d-preferences';
import CanonicalShell from '../shells/LabelledDiagram';
import { ChallengeMachine, type MachineProps } from './challenge-machine';
const design = { kind: 'patch', title: 'The City Patchbay', instruction: 'Select a label plug, then connect it to the numbered socket from the diagram. Incorrect plugs return to the tray.', action: 'Connect label', color: '#00f2b3', mode: 'assembly' } as const;
/** Canonical handlers own grading; this chunk owns the spatial interaction. */
export default function LabelledDiagram3D(props: MachineProps) {
  const puzzle = useMemo(() => {
    const input = props.puzzle as LabelledDiagramPuzzle | undefined;
    if (input?.hotspots?.length) return input;
    if (props.vocab) return generateLabelledDiagramPuzzle(props.vocab.map(v=>({...v,word_pl:v.word_pl ?? ''}))) ?? undefined;
    return undefined;
  }, [props.puzzle, props.vocab]);
  if (props.items === undefined) return <Challenge3DPreferences value={{quality:props.quality,reducedMotion:props.reducedMotion}}><div style={props.fullscreen?{position:"fixed",inset:0,zIndex:900,overflow:"auto",background:"#090d38"}:undefined}><CanonicalShell puzzle={puzzle} onSessionComplete={props.onSessionComplete ? r => props.onSessionComplete?.({...r,shellKey:'labelleddiagram'}) : undefined} /></div></Challenge3DPreferences>;
  return <ChallengeMachine {...props} design={design} />;
}
