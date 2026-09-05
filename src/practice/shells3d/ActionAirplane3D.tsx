import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import { Stage, Box, Orb, Ring, Label, Smooth } from './action-arcade-scene-kit';
import type { ActionSceneData } from './action-arcade-scene-kit';
function Plane({running,reduced}:{running?:boolean;reduced?:boolean}){
  const prop=useRef<Group>(null);useFrame((_,dt)=>{if(prop.current&&running&&!reduced)prop.current.rotation.x+=dt*28;});
  return <group scale={.72}>
    <mesh rotation={[0,0,Math.PI/2]}><capsuleGeometry args={[.19,1.2,6,12]}/><meshStandardMaterial color="#f1bb69" metalness={.3} roughness={.4}/></mesh>
    <Box at={[-.15,.28,0]} size={[.85,.075,1.8]} color="#82c5d8"/><Box at={[-.15,-.18,0]} size={[.75,.075,1.65]} color="#537f9a"/>
    {[-1,1].map(side=><Box key={side} at={[-.15,.055,side*.64]} size={[.055,.43,.055]} color="#cfa977"/>)}
    <Orb at={[-.27,.23,0]} radius={.18} color="#303b56"/><Orb at={[-.28,.36,0]} radius={.13} color="#b28bed"/>
    <Box at={[-.78,.04,0]} size={[.35,.055,.8]} color="#84cbd8"/><Box at={[-.75,.19,0]} size={[.3,.38,.06]} color="#f6d087"/>
    <group ref={prop} position={[.88,0,0]}><Box size={[.04,1,.065]} color="#654a54"/><Box size={[.04,.065,1]} color="#654a54"/><Orb radius={.09} color="#ead4a0"/></group>
    <mesh position={[.25,-.37,.25]} rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[.12,.12,.08,12]}/><meshStandardMaterial color="#282133"/></mesh>
    <mesh position={[.25,-.37,-.25]} rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[.12,.12,.08,12]}/><meshStandardMaterial color="#282133"/></mesh>
  </group>;
}
export default function ActionAirplane3D(p:ActionSceneData){
  const selected=p.actors?.find(a=>a.id===p.selected);const altitude=(y:number)=>3.8-y*.044;
  return <Stage width={9.6} onError={p.onError} reducedMotion={p.reducedMotion}>
    {(p.actors??[]).map(a=><group key={a.id} position={[(a.x-50)*.09,altitude(a.y),0]} onPointerDown={e=>{e.stopPropagation();if(a.enabled!==false)p.onPick?.(a.id);}}>
      <Ring radius={.48} color={a.selected?'#f9dc83':'#82d3df'} rotation={[0,Math.PI/3,0]}/>
      <Ring at={[-.1,0,0]} radius={.51} color={a.selected?'#efb663':'#476d86'} rotation={[0,Math.PI/3,0]}/>
      <mesh><sphereGeometry args={[.6,10,8]}/><meshBasicMaterial transparent opacity={0} depthWrite={false}/></mesh>
      <Label at={[0,.69,0]} text={`${String.fromCharCode(65+a.id)} · ${a.label}`} selected={a.selected}/>
      <Box at={[0,-.63,0]} size={[.12,.18,.12]} color={a.selected?'#f9dc83':'#7793a7'}/>
    </group>)}
    <Smooth at={[-2.88,altitude(selected?.y??14),0]} reduced={p.reducedMotion}><Plane running={p.running} reduced={p.reducedMotion}/></Smooth>
    {[-3,-1,1,3].map((x,i)=><group key={x} position={[x,3.8+(i%2)*.6,-3]}><Orb scale={[2,.45,1]} radius={.5} color="#a799ba"/><Orb at={[.5,.1,0]} scale={[1.5,.6,1]} radius={.4} color="#c3b2ca"/></group>)}
    <Box at={[-2.8,-.16,0]} size={[.5,.05,3]} color="#ebc46d"/>
  </Stage>;
}
