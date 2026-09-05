import { Stage, Box, Label } from './action-arcade-scene-kit';
import type { ActionSceneData } from './action-arcade-scene-kit';
import { WheelMechanism } from './action-arcade-wheel';
export default function ActionRandomWheel3D(p:ActionSceneData){return <Stage width={7.8} theme="fair" onError={p.onError} reducedMotion={p.reducedMotion}><WheelMechanism {...p} random/><Box at={[-2.9,.3,.2]} size={[.48,.7,.48]} color="#ac8960"/><Label at={[-2.9,.9,.2]} text={`${(p.actors??[]).filter(a=>a.state==='done').length}/${p.actors?.length??0}`}/></Stage>;}
