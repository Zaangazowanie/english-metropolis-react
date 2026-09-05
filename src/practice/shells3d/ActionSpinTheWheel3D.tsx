import { Stage, Box, Instances } from './action-arcade-scene-kit';
import type { ActionSceneData } from './action-arcade-scene-kit';
import { WheelMechanism } from './action-arcade-wheel';
export default function ActionSpinTheWheel3D(p:ActionSceneData){return <Stage width={7.2} theme="fair" onError={p.onError} reducedMotion={p.reducedMotion}>
  <WheelMechanism {...p}/>
  <group position={[2.95,.32,.1]}>
    <Instances blocks={[
      {at:[0,0,0],size:[.64,1.1,.72],color:'#0060e5'},
      {at:[0,.55,0],size:[.73,.12,.83],color:'#ff1475'},
      {at:[0,.17,.38],size:[.48,.4,.04],color:'#031334'},
      {at:[0,.18,.41],size:[.32,.055,.02],color:'#00e9ff'},
      {at:[0,-.13,.4],size:[.39,.07,.065],color:'#020919'},
      {at:[0,-.34,.46],size:[.5,.08,.28],color:'#ffca00'},
      ...Array.from({length:5},(_,i)=>({at:[-.19+i*.09,-.45,.38] as [number,number,number],size:[.035,.14,.025] as [number,number,number],color:'#08225e'})),
    ]}/>
    <Box at={[0,-.17,.46]} size={[.29,.28,.018]} color="#ffcf00"/>
    <Box at={[0,-.17,.475]} size={[.19,.06,.005]} color="#ff1464"/>
  </group>
  <group position={[-2.95,.15,.1]}>
    <Box size={[.65,.4,.74]} color="#ff1464"/>
    <Instances blocks={Array.from({length:3},(_,i)=>({at:[0,.25+i*.11,0],size:[.45,.09,.5],color:i%2?'#ffcf00':'#00ddff'}))}/>
  </group>
</Stage>;}
