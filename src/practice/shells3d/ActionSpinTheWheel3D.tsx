import { Stage } from './action-arcade-scene-kit';
import type { ActionSceneData } from './action-arcade-scene-kit';
import { WheelMechanism } from './action-arcade-wheel';
export default function ActionSpinTheWheel3D(p:ActionSceneData){return <Stage width={7.2} theme="fair" onError={p.onError} reducedMotion={p.reducedMotion}><WheelMechanism {...p}/></Stage>;}
