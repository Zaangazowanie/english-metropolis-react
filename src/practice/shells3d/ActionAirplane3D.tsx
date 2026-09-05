import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import { HoverTarget, Stage, Box, Orb, Ring, Label, Smooth, Instances } from './action-arcade-scene-kit';
import type { ActionSceneData, DetailBlock } from './action-arcade-scene-kit';
function Plane({running,reduced}:{running?:boolean;reduced?:boolean}){
  const prop=useRef<Group>(null);useFrame((_,dt)=>{if(prop.current&&running&&!reduced)prop.current.rotation.x+=dt*28;});
  return <group scale={.72}>
    <mesh rotation={[0,0,Math.PI/2]}><capsuleGeometry args={[.19,1.2,6,12]}/><meshStandardMaterial color="#ffb800" toneMapped={false} metalness={.22} roughness={.22}/></mesh>
    <Box at={[-.15,.28,0]} size={[.85,.075,1.8]} color="#00bbff"/><Box at={[-.15,-.18,0]} size={[.75,.075,1.65]} color="#0051eb"/>
    {[-1,1].map(side=><Box key={side} at={[-.15,.055,side*.64]} size={[.055,.43,.055]} color="#ffe000"/>)}
    <Orb at={[-.27,.23,0]} radius={.18} color="#051345"/><Orb at={[-.28,.36,0]} radius={.13} color="#b200ff"/>
    <Box at={[-.78,.04,0]} size={[.35,.055,.8]} color="#00c9ff"/><Box at={[-.75,.19,0]} size={[.3,.38,.06]} color="#ff1a65"/>
    <Instances blocks={[-1,1].flatMap(s=>[
      {at:[-.15,.325,s*.71],size:[.82,.018,.11],color:'#fff'} as DetailBlock,
      {at:[-.15,.325,s*.56],size:[.82,.018,.055],color:'#ff174a'},
      {at:[.3,.035,s*.185],size:[.35,.055,.018],color:'#ff174a'},
      {at:[-.73,.22,s*.035],size:[.14,.13,.02],color:'#ffe100'},
    ])}/>
    <group ref={prop} position={[.88,0,0]}><Box size={[.04,1,.065]} color="#141a52"/><Box size={[.04,.065,1]} color="#141a52"/><Orb radius={.09} color="#ffdc00"/></group>
    <mesh position={[.25,-.37,.25]} rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[.12,.12,.08,12]}/><meshStandardMaterial color="#282133"/></mesh>
    <mesh position={[.25,-.37,-.25]} rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[.12,.12,.08,12]}/><meshStandardMaterial color="#282133"/></mesh>
  </group>;
}
export default function ActionAirplane3D(p:ActionSceneData){
  const selected=p.actors?.find(a=>a.id===p.selected);const altitude=(y:number)=>3.8-y*.044;
  const airport=useMemo(()=>{
    const b:DetailBlock[]=[{at:[0,-.22,0],size:[8.8,.1,2.5],color:'#091632'},{at:[0,-.16,-1.3],size:[9,.06,.11],color:'#00d9ff'},{at:[0,-.16,1.3],size:[9,.06,.11],color:'#00d9ff'}];
    for(let i=0;i<17;i++){
      const x=(i-8)*.5;
      b.push({at:[x,-.155,0],size:[.26,.025,.09],color:'#fff4cc'});
      for(const s of [-1,1])b.push({at:[x,-.13,s*1.15],size:[.07,.065,.07],color:i<3?'#ff174f':'#00efff'});
    }
    for(const x of [-3.8,3.8]){
      b.push({at:[x,.34,-2.35],size:[.5,1.2,.6],color:'#004dcb'},{at:[x,1,-2.35],size:[.85,.25,.8],color:'#00daff'},{at:[x,1.2,-2.35],size:[.98,.1,.9],color:'#ffd000'});
      for(let i=0;i<3;i++)b.push({at:[x+(i-1)*.22,1,-1.94],size:[.14,.16,.03],color:'#071335'});
    }
    return b;
  },[]);
  return <Stage width={9.6} onError={p.onError} reducedMotion={p.reducedMotion}>
    <Instances blocks={airport}/>
    {(p.actors??[]).map(a=><group key={a.id} position={[(a.x-50)*.09,altitude(a.y),0]} onPointerDown={e=>{e.stopPropagation();if(a.enabled!==false)p.onPick?.(a.id);}}>
      <HoverTarget enabled={a.enabled!==false} reduced={p.reducedMotion} radius={.67} at={[0,0,.4]}><Ring radius={.48} color={a.selected?'#ffd000':'#00e4ff'} rotation={[0,Math.PI/3,0]}/>
      <Ring at={[-.1,0,0]} radius={.51} color={a.selected?'#ff6500':'#0058f5'} rotation={[0,Math.PI/3,0]}/>
      <mesh><sphereGeometry args={[.6,10,8]}/><meshBasicMaterial transparent opacity={0} depthWrite={false}/></mesh>
      <Label at={[0,.69,0]} text={`${String.fromCharCode(65+a.id)} · ${a.label}`} selected={a.selected}/>
      <Instances blocks={[-1,1].flatMap(s=>[{at:[0,s*.61,0],size:[.16,.19,.23],color:a.selected?'#ffcf00':'#00d4ff'} as DetailBlock,{at:[0,s*.61,.13],size:[.05,.09,.025],color:'#fff'}])}/>
    </HoverTarget></group>)}
    <Smooth at={[-2.88,altitude(selected?.y??14),0]} reduced={p.reducedMotion}><Plane running={p.running} reduced={p.reducedMotion}/></Smooth>
    {[-3,-1,1,3].map((x,i)=><group key={x} position={[x,3.8+(i%2)*.6,-3]}><Orb scale={[2,.45,1]} radius={.5} color="#3daeff"/><Orb at={[.5,.1,0]} scale={[1.5,.6,1]} radius={.4} color="#efffff"/></group>)}
  </Stage>;
}
