import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { MathUtils } from 'three';
import type { Group } from 'three';
import { Stage, Box, Orb, Ring, Label } from './action-arcade-scene-kit';
import type { ActionActor, ActionSceneData } from './action-arcade-scene-kit';
function Mole({a,p}:{a:ActionActor;p:ActionSceneData}){
  const ref=useRef<Group>(null);const visible=['up','rising','whacked'].includes(a.state??'');
  useFrame((_,dt)=>{if(ref.current)ref.current.position.y=MathUtils.damp(ref.current.position.y,visible?.32:-.6,p.reducedMotion?1000:12,dt);});
  const x=(a.id%3-1)*1.65,z=(Math.floor(a.id/3)-.5)*1.9;
  return <group position={[x,0,z]}>
    <Box at={[0,-.25,0]} size={[1.4,.3,1.55]} color="#7a6359"/>
    <mesh rotation={[-Math.PI/2,0,0]} position={[0,-.08,0]}><circleGeometry args={[.47,24]}/><meshStandardMaterial color="#191724"/></mesh>
    <Ring radius={.49} rotation={[-Math.PI/2,0,0]} color="#bca574"/>
    <group ref={ref} position={[0,-.6,0]} visible={a.state!=='down'} onPointerDown={e=>{e.stopPropagation();if(a.enabled!==false)p.onPick?.(a.id);}}>
      <Orb radius={.34} scale={[1,1.12,1]} color={a.state==='whacked'?'#a6d080':'#927ba9'}/><Orb at={[0,.15,.22]} radius={.21} scale={[1.2,.9,.6]} color="#d8b1a1"/>
      <Orb at={[-.12,.22,.35]} radius={.054} color="#292238"/><Orb at={[.12,.22,.35]} radius={.054} color="#292238"/><Orb at={[0,.11,.37]} radius={.064} color="#d59c9e"/>
      <Box at={[0,.35,0]} size={[.63,.09,.51]} color="#4b4568"/><Box at={[0,.44,-.03]} size={[.47,.18,.36]} color="#5b5277"/><Orb at={[0,.44,.17]} radius={.06} color="#ecc573"/>
      <Label at={[0,.8,0]} text={String(a.id+1)} number selected={a.selected}/>
    </group>
    {a.label&&<Label at={[0,.05,.74]} text={a.label} selected={a.selected}/>}
  </group>;
}
export default function ActionWhackAMole3D(p:ActionSceneData){const actors=Array.from({length:6},(_,id)=>p.actors?.find(a=>a.id===id)??{id,x:0,y:0,state:'down'});return <Stage width={7} board onError={p.onError} reducedMotion={p.reducedMotion}>
  <Box at={[0,-.39,0]} size={[5.3,.3,4]} color="#a28262"/>{actors.map(a=><Mole key={a.id} a={a} p={p}/>)}
  {p.selected!=null&&<group position={[(p.selected%3-1)*1.65,.9,(Math.floor(p.selected/3)-.5)*1.9+.4]} rotation={[-.8,0,.3]}><Box at={[0,.2,0]} size={[.1,.7,.1]} color="#d7af78"/><Box at={[0,.55,0]} size={[.7,.3,.3]} color="#e1aa7f"/></group>}
  <Box at={[0,-.06,-2.5]} size={[6,.08,.18]} color="#7a98a0"/><Box at={[0,-.06,2.5]} size={[6,.08,.18]} color="#7a98a0"/>
</Stage>;}
