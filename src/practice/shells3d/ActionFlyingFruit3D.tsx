import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import { Stage, Box, Orb, Ring, Label } from './action-arcade-scene-kit';
import type { ActionActor, ActionSceneData } from './action-arcade-scene-kit';
function Fruit({a,p}:{a:ActionActor;p:ActionSceneData}){
  const ref=useRef<Group>(null);const elapsed=useRef(0);
  const hit=a.state==='right'||a.state==='wrong';
  useFrame((_,dt)=>{if(!ref.current)return;if(hit){elapsed.current+=dt;const s=a.state==='right'?Math.max(.04,1-elapsed.current*1.8):.8;ref.current.scale.setScalar(s);}else{elapsed.current=0;ref.current.scale.setScalar(1);}});
  const literal=(a.label??'').toLowerCase();const pear=/^pear/.test(literal),lemon=/^lemon|^lime/.test(literal),cherry=/^cherr/.test(literal);
  const x=(a.x-50)*.084,y=4.8-a.y*.053;
  return <group position={[x,y,a.z??0]}>
    <group ref={ref} visible={!a.hidden||hit} onPointerDown={e=>{e.stopPropagation();if(!p.blade&&a.enabled!==false)p.onPick?.(a.id);}} onPointerMove={e=>{if(p.blade&&e.buttons===1&&a.enabled!==false){e.stopPropagation();p.onPick?.(a.id);}}}>
      <group rotation={[0,0,(a.rotation??0)*Math.PI/180]}>
        {cherry?<><Orb at={[-.15,-.03,0]} radius={.24} color={a.color}/><Orb at={[.16,-.06,0]} radius={.24} color={a.color}/></>:<Orb radius={.36} scale={lemon?[1.25,.8,.85]:pear?[.9,1.16,.9]:[1,1,1]} color={a.color}/>}
        {pear&&<Orb at={[0,.2,0]} radius={.2} scale={[.7,1.2,.8]} color={a.color}/>}
        <Box at={[0,.38,0]} size={[.055,.18,.055]} color="#785434"/><Orb at={[.14,.41,0]} radius={.14} scale={[1.5,.3,.7]} color="#79b87d"/>
      </group>
      {a.selected&&<Ring radius={.46} color="#ffe990"/>}
    </group>
    {(!a.hidden||hit)&&<Label at={[0,-.57,0]} text={a.label??''} selected={a.selected}/>}
    {hit&&Array.from({length:6},(_,i)=><Orb key={i} at={[Math.cos(i)*.5,Math.sin(i)*.5,.05]} radius={.06} color={a.color}/>)}
  </group>;
}
export default function ActionFlyingFruit3D(p:ActionSceneData){return <Stage width={9.6} theme="garden" onError={p.onError} reducedMotion={p.reducedMotion}>
  {(p.actors??[]).map(a=><Fruit key={a.id} a={a} p={p}/>)}
  {[-3.7,3.7].map(x=><group key={x} position={[x,.1,-1.6]}><Box at={[0,.75,0]} size={[.18,1.8,.18]} color="#775543"/><Orb at={[0,1.85,0]} radius={.9} scale={[1,1.25,1]} color="#496f4c"/><Orb at={[.55,1.5,.2]} radius={.5} color="#5c8257"/></group>)}
  {[-2.8,0,2.8].map(x=><group key={x} position={[x,-.13,.25]}><Box size={[1.5,.42,.7]} color="#aa7950"/>{[-.55,-.2,.2,.55].map(t=><Box key={t} at={[t,.04,.37]} size={[.08,.47,.025]} color="#d4aa72"/>)}<Box at={[0,.25,0]} size={[1.62,.08,.82]} color="#d4aa72"/></group>)}
</Stage>;}
