import { Stage, Box, Label, Instances, Orb } from './action-arcade-scene-kit';
import type { ActionSceneData } from './action-arcade-scene-kit';
import { WheelMechanism } from './action-arcade-wheel';
export default function ActionRandomWheel3D(p:ActionSceneData){
  const completed=(p.actors??[]).filter(a=>a.state==='done').length;
  return <Stage width={7.8} theme="fair" onError={p.onError} reducedMotion={p.reducedMotion}>
    <WheelMechanism {...p} random/>
    <group position={[-3,.38,.15]}>
      <Instances blocks={[
        {at:[0,0,0],size:[.64,.92,.62],color:'#7000df'},
        {at:[0,.48,0],size:[.74,.11,.72],color:'#ffcb00'},
        {at:[0,.07,.33],size:[.46,.4,.03],color:'#071330'},
        {at:[0,-.27,.35],size:[.39,.06,.045],color:'#00e9ff'},
        {at:[0,-.43,0],size:[.75,.1,.7],color:'#0054df'},
      ]}/>
      <Label at={[0,.12,.39]} text={`${completed}/${p.actors?.length??0}`} number/>
      <mesh position={[0,.82,0]} rotation={[.2,.5,.3]}><octahedronGeometry args={[.27]}/><meshStandardMaterial color="#00f3ff" toneMapped={false} metalness={.25} roughness={.18}/></mesh>
    </group>
    <group position={[3,.1,-.2]}>
      <Box size={[.58,.2,.7]} color="#ffcf00"/>
      {(p.actors??[]).map((a,i)=><Orb key={a.id} at={[0,.24+i*.13,0]} radius={.18} scale={[1,.28,1]} color={a.state==='done'?'#00ec86':'#26369c'}/>)}
    </group>
  </Stage>;
}
