import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { MathUtils } from 'three';
import type { Group } from 'three';
import { Stage, Box, Orb, Ring, Label, Instances } from './action-arcade-scene-kit';
import type { ActionActor, ActionSceneData, DetailBlock } from './action-arcade-scene-kit';
function Mole({a,p}:{a:ActionActor;p:ActionSceneData}){
  const ref=useRef<Group>(null);const visible=['up','rising','whacked'].includes(a.state??'');
  useFrame((_,dt)=>{if(ref.current)ref.current.position.y=MathUtils.damp(ref.current.position.y,visible?.32:-.6,p.reducedMotion?1000:12,dt);});
  const x=(a.id%3-1)*1.65,z=(Math.floor(a.id/3)-.5)*1.9;
  return <group position={[x,0,z]}>
    <Box at={[0,-.25,0]} size={[1.4,.3,1.55]} color={a.id%2?'#006de2':'#6b00cf'}/>
    <mesh rotation={[-Math.PI/2,0,0]} position={[0,-.08,0]}><circleGeometry args={[.47,24]}/><meshStandardMaterial color="#191724"/></mesh>
    <Ring radius={.49} rotation={[-Math.PI/2,0,0]} color={visible?'#ffce00':'#00cfff'}/>
    <group ref={ref} position={[0,-.6,0]} visible={a.state!=='down'} onPointerDown={e=>{e.stopPropagation();if(a.enabled!==false)p.onPick?.(a.id);}}>
      <Orb radius={.34} scale={[1,1.12,1]} color={a.state==='whacked'?'#00de79':'#b600ec'}/><Orb at={[0,.15,.22]} radius={.21} scale={[1.2,.9,.6]} color="#ffb542"/>
      <Orb at={[-.12,.22,.35]} radius={.054} color="#101330"/><Orb at={[.12,.22,.35]} radius={.054} color="#101330"/><Orb at={[0,.11,.37]} radius={.064} color="#ff2e7c"/>
      <Instances blocks={[
        {at:[0,.35,0],size:[.63,.09,.51],color:'#003fe2'},
        {at:[0,.44,-.03],size:[.47,.18,.36],color:'#006ef5'},
        {at:[0,.39,.165],size:[.46,.035,.03],color:'#ffcc00'},
        {at:[0,-.07,.31],size:[.35,.085,.035],color:'#ffcf00'},
      ]}/><Orb at={[0,.47,.17]} radius={.06} color="#ffda00"/>
      <Label at={[0,.8,0]} text={String(a.id+1)} number selected={a.selected}/>
    </group>
    {a.label&&<Label at={[0,.05,.74]} text={a.label} selected={a.selected}/>}
  </group>;
}
export default function ActionWhackAMole3D(p:ActionSceneData){const actors=Array.from({length:6},(_,id)=>p.actors?.find(a=>a.id===id)??{id,x:0,y:0,state:'down'});
  const deck=useMemo(()=>{
    const b:DetailBlock[]=[];
    for(let i=0;i<17;i++)for(const s of [-1,1]){
      b.push({at:[(i-8)*.33,-.04,s*2.19],size:[.18,.08,.12],color:i%2?'#ffce00':'#ff087b'});
      if(i%2===0)b.push({at:[(i-8)*.33,-.27,s*2.17],size:[.1,.23,.05],color:'#050e31'});
    }
    for(const s of [-1,1])b.push({at:[s*2.72,-.14,0],size:[.2,.4,4.4],color:'#0053e4'},{at:[s*2.72,.08,0],size:[.075,.07,4.45],color:'#00ddff'});
    for(let id=0;id<6;id++)for(const s of [-1,1])b.push({at:[(id%3-1)*1.65+s*.56,-.04,(Math.floor(id/3)-.5)*1.9],size:[.06,.04,1.18],color:'#ffc900'});
    return b;
  },[]);
  return <Stage width={7} board theme="fair" onError={p.onError} reducedMotion={p.reducedMotion}>
  <Box at={[0,-.39,0]} size={[5.8,.3,4.5]} color="#092369"/><Instances blocks={deck}/>{actors.map(a=><Mole key={a.id} a={a} p={p}/>)}
  {p.selected!=null&&<group position={[(p.selected%3-1)*1.65,.9,(Math.floor(p.selected/3)-.5)*1.9+.4]} rotation={[-.8,0,.3]}><Box at={[0,.2,0]} size={[.1,.7,.1]} color="#ffcc00"/><Box at={[0,.55,0]} size={[.7,.3,.3]} color="#ff1763"/><Box at={[-.37,.55,0]} size={[.08,.33,.33]} color="#ffcc00"/><Box at={[.37,.55,0]} size={[.08,.33,.33]} color="#ffcc00"/></group>}
</Stage>;}
