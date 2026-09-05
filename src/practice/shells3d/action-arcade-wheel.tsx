import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Shape } from 'three';
import type { Group } from 'three';
import { Box, Orb, Ring, Label, tones } from './action-arcade-scene-kit';
import type { ActionSceneData } from './action-arcade-scene-kit';

function Wedge({index,count,color,selected,onPick,label}:{index:number;count:number;color:string;selected:boolean;onPick:()=>void;label:string}){
  const slice=Math.PI*2/count;
  const shape=useMemo(()=>{const s=new Shape();s.moveTo(0,0);for(let n=0;n<=16;n++){const a=Math.PI/2-(index+n/16)*slice;s.lineTo(Math.cos(a)*2.05,Math.sin(a)*2.05);}s.closePath();return s;},[index,count]);
  const angle=Math.PI/2-(index+.5)*slice;
  return <group>
    <mesh onPointerDown={e=>{e.stopPropagation();onPick();}}><extrudeGeometry args={[shape,{depth:.23,bevelEnabled:true,bevelSize:.015,bevelThickness:.015,bevelSegments:1,steps:1}]}/><meshStandardMaterial color={color} metalness={.35} roughness={.44} emissive={selected?color:'#000'} emissiveIntensity={selected?.35:0}/></mesh>
    <Label at={[Math.cos(angle)*1.55,Math.sin(angle)*1.55,.29]} text={label} number selected={selected}/>
    <Orb at={[Math.cos(angle)*1.95,Math.sin(angle)*1.95,.28]} radius={.045} color="#fff0b8" glow/>
  </group>;
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
  return <group position={[0,2.2,0]}>
    <Box at={[0,-1.5,-.5]} size={[.35,2.8,.45]} color="#99724e" metal={.35}/><Box at={[0,-2.35,-.25]} size={[3.4,.27,1.7]} color="#816449"/>
    <mesh position={[0,0,-.13]} rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[2.21,2.21,.24,64]}/><meshStandardMaterial color="#674c52" metalness={.5} roughness={.32}/></mesh>
    <Ring radius={2.22} at={[0,0,.05]} color="#e4bf7a"/>
    <group ref={ref}>{actors.map((a,i)=><Wedge key={a.id} index={i} count={actors.length} label={p.random?String(i+1):String.fromCharCode(65+i)} color={a.state==='done'?'#496657':a.state==='retry'?'#bc7482':a.color??tones[i%tones.length]} selected={a.selected===true} onPick={()=>{if(!p.running)p.onPick?.(a.id);}}/>)}</group>
    {Array.from({length:24},(_,i)=>{const a=i*Math.PI/12;return <Orb key={i} at={[Math.sin(a)*2.28,Math.cos(a)*2.28,.15]} radius={.055} color={i%2?'#ffe5a4':'#e9a598'} glow/>;})}
    <group position={[0,2.36,.4]}><mesh rotation={[0,0,Math.PI]}><coneGeometry args={[.17,.45,3]}/><meshStandardMaterial color="#fbe091" metalness={.55} roughness={.2}/></mesh><Orb at={[0,.16,0]} radius={.075} color="#ab7784"/></group>
    <mesh position={[0,0,.3]} rotation={[Math.PI/2,0,0]} onPointerDown={e=>{e.stopPropagation();if(!p.running)p.onSpin?.();}}><cylinderGeometry args={[.38,.38,.18,24]}/><meshStandardMaterial color={p.running?'#ae9462':'#ffe093'} metalness={.65} roughness={.25}/></mesh>
    <Label at={[0,0,.44]} text={p.running?'…':p.random?'SPIN':'LOCK IN'}/>
    <Box at={[-2.65,0,-.65]} size={[.13,5,.13]} color="#89617b"/><Box at={[2.65,0,-.65]} size={[.13,5,.13]} color="#89617b"/><Box at={[0,2.75,-.65]} size={[5.7,.25,.7]} color={p.random?'#67528f':'#a96683'}/>
  </group>;
}
