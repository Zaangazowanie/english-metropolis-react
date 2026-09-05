import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Shape } from 'three';
import type { Group } from 'three';
import { HoverTarget, Box, Orb, Ring, Label, Instances, vividColor } from './action-arcade-scene-kit';
import type { ActionSceneData, DetailBlock } from './action-arcade-scene-kit';

function Wedge({index,count,color,selected,onPick,label,enabled,reduced}:{index:number;count:number;color:string;selected:boolean;onPick:()=>void;label:string;enabled:boolean;reduced?:boolean}){
  const slice=Math.PI*2/count;
  const shape=useMemo(()=>{const s=new Shape();s.moveTo(0,0);for(let n=0;n<=16;n++){const a=Math.PI/2-(index+n/16)*slice;s.lineTo(Math.cos(a)*2.05,Math.sin(a)*2.05);}s.closePath();return s;},[index,count]);
  const angle=Math.PI/2-(index+.5)*slice;
  return <HoverTarget enabled={enabled} reduced={reduced} radius={.3} at={[Math.cos(angle)*1.55,Math.sin(angle)*1.55,.35]}>
    <mesh onPointerDown={e=>{e.stopPropagation();if(enabled)onPick();}}><extrudeGeometry args={[shape,{depth:.23,bevelEnabled:true,bevelSize:.015,bevelThickness:.015,bevelSegments:1,steps:1}]}/><meshStandardMaterial color={color} toneMapped={false} metalness={.16} roughness={.23} emissive={selected?color:'#000'} emissiveIntensity={selected?.12:0}/></mesh>
    <Label at={[Math.cos(angle)*1.55,Math.sin(angle)*1.55,.29]} text={label} number selected={selected}/>
    <group position={[Math.cos(angle)*1.2,Math.sin(angle)*1.2,.27]} rotation={[0,0,angle]}><Box size={[.36,.075,.035]} color={selected?'#fff':'#081337'}/><Box at={[.25,0,0]} size={[.09,.075,.035]} color="#fff"/></group>
  </HoverTarget>;
}
/** Shares only the physical wheel; the two canonical controllers own distinct rules. */
export function WheelMechanism(p:ActionSceneData & {random?:boolean}){
  const ref=useRef<Group>(null),shown=useRef(0),start=useRef(0),elapsed=useRef(0),target=useRef(0);
  useEffect(()=>{
    start.current=shown.current;target.current=-(p.angle??0)*Math.PI/180;elapsed.current=0;
    if((p.angle??0)===0){shown.current=0;start.current=0;if(ref.current)ref.current.rotation.z=0;}
  },[p.angle]);
  useFrame((_,dt)=>{if(!ref.current)return;elapsed.current+=dt;const t=p.reducedMotion?1:Math.min(1,elapsed.current/((p.duration??4200)/1000));shown.current=start.current+(target.current-start.current)*(1-Math.pow(1-t,3));ref.current.rotation.z=shown.current;});
  const actors=p.actors??[];
  const frame=useMemo(()=>{
    const b:DetailBlock[]=[];
    for(let i=0;i<36;i++){
      const a=i*Math.PI/18;
      b.push({at:[Math.sin(a)*2.3,Math.cos(a)*2.3,.15],size:[.09,.09,.08],color:i%3===0?'#ffdd00':p.random?'#00ecff':'#ff148c'});
    }
    for(let i=0;i<17;i++){
      b.push({at:[(i-8)*.33,2.79,-.23],size:[.13,.075,.055],color:i%2?'#ffcf00':'#fff'});
    }
    for(const s of [-1,1]){
      b.push({at:[s*2.65,0,-.65],size:[.22,5,.36],color:p.random?'#7e00ec':'#0050e4'},{at:[s*2.65,0,-.45],size:[.055,4.8,.04],color:'#00dfff'});
      for(let i=0;i<9;i++)b.push({at:[s*2.65,i*.5-2,-.41],size:[.14,.11,.04],color:'#ffcf00'});
    }
    return b;
  },[p.random]);
  return <group position={[0,2.2,0]}>
    <Instances blocks={frame}/>
    <Box at={[0,-1.5,-.5]} size={[.35,2.8,.45]} color="#0046cc" metal={.35}/><Box at={[0,-2.35,-.25]} size={[3.4,.27,1.7]} color="#0a1d58"/>
    <mesh position={[0,0,-.13]} rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[2.21,2.21,.24,64]}/><meshStandardMaterial color="#041539" toneMapped={false} metalness={.3} roughness={.24}/></mesh>
    <Ring radius={2.22} at={[0,0,.05]} color="#ffca00"/><Ring radius={2.38} at={[0,0,.05]} color={p.random?'#a900ff':'#006bff'}/>
    <group ref={ref}>{actors.map((a,i)=><Wedge key={a.id} index={i} count={actors.length} enabled={!p.running&&a.enabled!==false&&!!p.onPick} reduced={p.reducedMotion} label={p.random?String(i+1):String.fromCharCode(65+i)} color={a.state==='done'?'#00bb68':a.state==='retry'?'#ff234d':vividColor(a.color,i)} selected={a.selected===true} onPick={()=>{if(!p.running)p.onPick?.(a.id);}}/>)}</group>
    <group position={[0,2.36,.4]}><mesh rotation={[0,0,Math.PI]}><coneGeometry args={[.17,.45,3]}/><meshStandardMaterial color="#ffdc00" toneMapped={false} metalness={.3} roughness={.2}/></mesh><Orb at={[0,.16,0]} radius={.075} color="#ff1876"/></group>
    <HoverTarget enabled={!p.running&&!!p.onSpin} reduced={p.reducedMotion} radius={.5} at={[0,0,.48]}><mesh position={[0,0,.3]} rotation={[Math.PI/2,0,0]} onPointerDown={e=>{e.stopPropagation();if(!p.running)p.onSpin?.();}}><cylinderGeometry args={[.38,.38,.18,24]}/><meshStandardMaterial color={p.running?'#ff7800':'#ffdc00'} toneMapped={false} metalness={.3} roughness={.2}/></mesh>
    <Label at={[0,0,.44]} text={p.running?'…':p.random?'SPIN':'LOCK IN'}/></HoverTarget>
    <Box at={[0,2.75,-.65]} size={[5.7,.25,.7]} color={p.random?'#9a00ef':'#ff125e'}/>
  </group>;
}
