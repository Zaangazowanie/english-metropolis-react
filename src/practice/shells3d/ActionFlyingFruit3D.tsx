import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import { Stage, Box, Orb, Ring, Label, Instances, vividColor } from './action-arcade-scene-kit';
import type { ActionActor, ActionSceneData, DetailBlock } from './action-arcade-scene-kit';
function Fruit({a,p}:{a:ActionActor;p:ActionSceneData}){
  const ref=useRef<Group>(null);const elapsed=useRef(0);
  const hit=a.state==='right'||a.state==='wrong';
  useFrame((_,dt)=>{if(!ref.current)return;if(hit){elapsed.current+=dt;const s=a.state==='right'?Math.max(.04,1-elapsed.current*1.8):.8;ref.current.scale.setScalar(s);}else{elapsed.current=0;ref.current.scale.setScalar(1);}});
  const literal=(a.label??'').toLowerCase();const pear=/^pear/.test(literal),lemon=/^lemon|^lime/.test(literal),cherry=/^cherr/.test(literal),grape=/^grape/.test(literal);
  const color=/^apple|^cherr/.test(literal)?'#ff1245':pear||/^lime/.test(literal)?'#61ed00':/^lemon/.test(literal)?'#ffdb00':/^plum|^grape/.test(literal)?'#a100ee':/^orange/.test(literal)?'#ff7100':/^peach/.test(literal)?'#ff4e51':vividColor(a.color,a.id);
  const x=(a.x-50)*.084,y=4.8-a.y*.053;
  return <group position={[x,y,a.z??0]}>
    <group ref={ref} visible={!a.hidden||hit} onPointerDown={e=>{e.stopPropagation();if(!p.blade&&a.enabled!==false)p.onPick?.(a.id);}} onPointerMove={e=>{if(p.blade&&e.buttons===1&&a.enabled!==false){e.stopPropagation();p.onPick?.(a.id);}}}>
      <group rotation={[0,0,(a.rotation??0)*Math.PI/180]}>
        {cherry?<><Orb at={[-.15,-.03,0]} radius={.24} color={color}/><Orb at={[.16,-.06,0]} radius={.24} color={color}/></>:grape?<>{[[0,-.27,0],[-.15,-.07,.08],[.15,-.07,.08],[-.18,.15,0],[.18,.15,0],[0,.16,.18]].map((at,i)=><Orb key={i} at={at as [number,number,number]} radius={.17} color={i%2?'#8100d4':'#ba00f6'}/>)}</>:<Orb radius={.36} scale={lemon?[1.25,.8,.85]:pear?[.9,1.16,.9]:[1,1,1]} color={color}/>}
        {pear&&<Orb at={[0,.2,0]} radius={.2} scale={[.7,1.2,.8]} color={color}/>}
        {!grape&&<Orb at={[-.14,.12,.29]} radius={.055} scale={[.6,1.9,.35]} color="#fff2a5"/>}
        <Box at={[0,.38,0]} size={[.055,.18,.055]} color="#713000"/><Orb at={[.14,.41,0]} radius={.14} scale={[1.5,.3,.7]} color="#13d900"/>
      </group>
      {a.selected&&<Ring radius={.46} color="#ffdf00"/>}
    </group>
    {(!a.hidden||hit)&&<Label at={[0,-.57,0]} text={a.label??''} selected={a.selected}/>}
    {hit&&Array.from({length:6},(_,i)=><Orb key={i} at={[Math.cos(i)*.5,Math.sin(i)*.5,.05]} radius={.06} color={color}/>)}
  </group>;
}
export default function ActionFlyingFruit3D(p:ActionSceneData){
  const market=useMemo(()=>{
    const b:DetailBlock[]=[];
    for(const x of [-2.8,0,2.8]){
      b.push({at:[x,-.13,.25],size:[1.5,.4,.7],color:'#ff8a00'},{at:[x,.08,.25],size:[1.62,.08,.82],color:'#ffcf00'},{at:[x,.13,.25],size:[1.36,.025,.6],color:'#612208'});
      for(let i=0;i<7;i++)b.push({at:[x+(i-3)*.2,-.13,.62],size:[.07,.39,.035],color:'#743a00'});
      for(const s of [-1,1])b.push({at:[x+s*.67,-.08,.25],size:[.1,.5,.8],color:'#ffa700'});
    }
    for(let i=0;i<17;i++){
      const x=(i-8)*.5;
      b.push({at:[x,4.75,-2.1],size:[.48,.12,1.05],color:i%2?'#ff4f00':'#ffe000'},{at:[x,4.59,-1.56],size:[.48,.21,.06],color:i%2?'#ff4f00':'#ffe000'});
      b.push({at:[x,-.26,1.6],size:[.32,.025,.45],color:i%2?'#00b985':'#073749'});
    }
    for(const s of [-1,1])b.push({at:[s*4.25,2,-1.8],size:[.11,5,.11],color:'#f3c000'},{at:[s*4.25,2,-1.71],size:[.03,4.65,.025],color:'#00e28b'});
    return b;
  },[]);
  return <Stage width={9.6} theme="garden" onError={p.onError} reducedMotion={p.reducedMotion}>
  <Instances blocks={market}/>
  {(p.actors??[]).map(a=><Fruit key={a.id} a={a} p={p}/>)}
  {[-3.7,3.7].map(x=><group key={x} position={[x,.1,-2]}><Box at={[0,.75,0]} size={[.18,1.8,.18]} color="#923d00"/><Orb at={[0,1.85,0]} radius={.9} scale={[1,1.25,1]} color="#009c40"/><Orb at={[.55,1.5,.2]} radius={.5} color="#33d400"/>{[-.4,0,.4].map((dx,i)=><Orb key={dx} at={[dx,1.65+(i%2)*.55,.72]} radius={.12} color="#ff4d00"/>)}</group>)}
</Stage>;}
