import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import { Stage, Box, Orb, Label } from './action-arcade-scene-kit';
import type { ActionActor, ActionSceneData } from './action-arcade-scene-kit';
function Balloon({a,p}:{a:ActionActor;p:ActionSceneData}){
  const ref=useRef<Group>(null),age=useRef(0);const popped=a.state==='popped',deflated=a.state==='deflated';
  useFrame((_,dt)=>{if(!ref.current)return;if(popped||deflated){age.current+=dt;ref.current.scale.setScalar(Math.max(.02,1-age.current*(popped?3:1.8)));}else{age.current=0;ref.current.scale.setScalar(1);}});
  return <group position={[(Math.max(8,Math.min(92,a.x))-50)*.081,.6+a.y*.053,0]}>
    <group ref={ref} onPointerDown={e=>{e.stopPropagation();if(a.enabled!==false)p.onPick?.(a.id);}}>
      <Orb radius={.37} scale={[1,1.2,.8]} color={a.color}/><Orb at={[-.12,.17,.26]} radius={.07} scale={[.6,1.5,.5]} color="#ffe9d1"/>
      <mesh position={[0,-.47,0]} rotation={[0,0,Math.PI]}><coneGeometry args={[.07,.14,6]}/><meshStandardMaterial color={a.color}/></mesh>
      <Box at={[0,-.78,0]} size={[.012,.52,.012]} color="#e0cbaa"/>
      <Label at={[0,0,.36]} text={a.label??''} selected={a.selected}/>
    </group>
    {popped&&Array.from({length:6},(_,i)=><Orb key={i} at={[Math.sin(i)*.5,Math.cos(i)*.5,.1]} radius={.055} color={a.color}/>)}
  </group>;
}
export default function ActionBalloonPop3D(p:ActionSceneData){return <Stage width={9.4} onError={p.onError} reducedMotion={p.reducedMotion}>
  <Box at={[0,2.15,-.9]} size={[8.2,1.65,.035]} color="#5d4f49"/>
  {[-1,1].map(s=><Box key={s} at={[0,2.15+s*.85,-.84]} size={[8.2,.025,.03]} color="#e4c278" glow/>)}
  {(p.actors??[]).filter(a=>a.state!=='escaped').map(a=><Balloon key={a.id} a={a} p={p}/>)}
  <Box at={[0,-.2,.5]} size={[8.8,.22,1.1]} color="#ab826a"/>{[-4,-2,0,2,4].map(x=><group key={x} position={[x,0,.9]}><Box at={[0,.3,0]} size={[.07,.7,.07]} color="#c6a785"/><Orb at={[0,.69,0]} radius={.065} color="#efce8c" glow/></group>)}
</Stage>;}
