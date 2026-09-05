import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import { Stage, Box, Orb, Label, Instances, vividColor } from './action-arcade-scene-kit';
import type { ActionActor, ActionSceneData, DetailBlock } from './action-arcade-scene-kit';
function Balloon({a,p}:{a:ActionActor;p:ActionSceneData}){
  const ref=useRef<Group>(null),age=useRef(0);const popped=a.state==='popped',deflated=a.state==='deflated';
  const color=vividColor(a.color,a.id);
  useFrame((_,dt)=>{if(!ref.current)return;if(popped||deflated){age.current+=dt;ref.current.scale.setScalar(Math.max(.02,1-age.current*(popped?3:1.8)));}else{age.current=0;ref.current.scale.setScalar(1);}});
  return <group position={[(Math.max(8,Math.min(92,a.x))-50)*.081,.6+a.y*.053,0]}>
    <group ref={ref} onPointerDown={e=>{e.stopPropagation();if(a.enabled!==false)p.onPick?.(a.id);}}>
      <Orb radius={.37} scale={[1,1.2,.8]} color={color}/><Orb at={[-.12,.17,.26]} radius={.07} scale={[.6,1.5,.5]} color="#fff"/>
      <mesh position={[0,-.47,0]} rotation={[0,0,Math.PI]}><coneGeometry args={[.07,.14,6]}/><meshStandardMaterial color={color} toneMapped={false}/></mesh>
      <Box at={[0,-.78,0]} size={[.012,.52,.012]} color="#ffe100"/>
      <Label at={[0,0,.36]} text={a.label??''} selected={a.selected}/>
    </group>
    {popped&&Array.from({length:6},(_,i)=><Orb key={i} at={[Math.sin(i)*.5,Math.cos(i)*.5,.1]} radius={.055} color={color}/>)}
  </group>;
}
export default function ActionBalloonPop3D(p:ActionSceneData){
  const booth=useMemo(()=>{
    const b:DetailBlock[]=[];
    for(let i=0;i<19;i++){
      const x=(i-9)*.46;
      b.push({at:[x,4.75,-1.1],size:[.45,.35,.6],color:i%2?'#ff174f':'#ffc900'});
      b.push({at:[x,4.5,-.76],size:[.12,.09,.07],color:'#fff4ad'});
      b.push({at:[x,-.02,.82],size:[.43,.07,.3],color:i%2?'#00cfff':'#083973'});
      for(const s of [-1,1])b.push({at:[x,2.15+s*.9,-.82],size:[.12,.07,.06],color:'#ffcd00'});
    }
    for(const s of [-1,1]){
      b.push({at:[s*4.35,2.1,-1],size:[.22,5,.28],color:'#8e00ff'},{at:[s*4.35,2.1,-.84],size:[.055,4.65,.035],color:'#00e8ff'});
      for(let i=0;i<8;i++)b.push({at:[s*4.35,.1+i*.56,-.79],size:[.14,.09,.045],color:'#ffce00'});
    }
    return b;
  },[]);
  return <Stage width={9.4} theme="fair" onError={p.onError} reducedMotion={p.reducedMotion}>
  <Instances blocks={booth}/>
  <Box at={[0,2.15,-.9]} size={[8.2,1.65,.035]} color="#28107b"/>
  {[-1,1].map(s=><Box key={s} at={[0,2.15+s*.85,-.84]} size={[8.2,.025,.03]} color="#ffc900" glow/>)}
  {(p.actors??[]).filter(a=>a.state!=='escaped').map(a=><Balloon key={a.id} a={a} p={p}/>)}
  <Box at={[0,-.2,.5]} size={[8.8,.22,1.1]} color="#0047d4"/>
</Stage>;}
