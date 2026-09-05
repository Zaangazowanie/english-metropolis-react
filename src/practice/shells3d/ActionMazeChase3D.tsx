import { useMemo } from 'react';
import { Stage, Box, Orb, Label, Ring, Instances, Smooth, Handle } from './action-arcade-scene-kit';
import type { ActionSceneData } from './action-arcade-scene-kit';
export default function ActionMazeChase3D(p:ActionSceneData){
  const cols=p.grid?.cols??13,rows=p.grid?.rows??11,cell=.62;
  const x=(c:number)=>(c-(cols-1)/2)*cell,z=(r:number)=>(r-(rows-1)/2)*cell;
  const walls=useMemo(()=>{const out:{at:[number,number,number];size:[number,number,number];color:string}[]=[];p.grid?.walls?.forEach((row,r)=>row.forEach((v,c)=>{if(v){out.push({at:[x(c),.12,z(r)],size:[.6,.55,.6],color:(c+r)%3?'#665071':'#856778'});out.push({at:[x(c),.42,z(r)],size:[.63,.08,.63],color:'#ac8e9a'});}else out.push({at:[x(c),-.2,z(r)],size:[.6,.12,.6],color:'#39475a'});}));return out;},[p.grid?.walls]);
  return <Stage width={cols*cell+.7} board onError={p.onError} reducedMotion={p.reducedMotion}>
    <Instances blocks={walls}/>
    <mesh rotation={[-Math.PI/2,0,0]} position={[0,-.08,0]} onPointerDown={e=>{e.stopPropagation();if(!p.player)return;const dx=e.point.x-x(p.player.c),dz=e.point.z-z(p.player.r);p.onMove?.(Math.abs(dx)>Math.abs(dz)?dx>0?'right':'left':dz>0?'down':'up');}}><planeGeometry args={[cols*cell,rows*cell]}/><meshBasicMaterial transparent opacity={0}/></mesh>
    {p.player&&<Smooth at={[x(p.player.c),.08,z(p.player.r)]} reduced={p.reducedMotion}><Handle color="#f6ca6b"/>{!!p.shield&&<Ring radius={.31} rotation={[-Math.PI/2,0,0]} color="#ffde85"/>}</Smooth>}
    {p.shadow&&<Smooth at={[x(p.shadow.c),.14,z(p.shadow.r)]} reduced={p.reducedMotion}><Orb radius={.25} scale={[1,1.2,1]} color={p.shield?'#705785':'#ed7fa9'}/><Orb at={[-.085,.07,.21]} radius={.07} color="#fff7ea"/><Orb at={[.085,.07,.21]} radius={.07} color="#fff7ea"/><Orb at={[-.07,.07,.27]} radius={.028} color="#261c3a"/><Orb at={[.1,.07,.27]} radius={.028} color="#261c3a"/></Smooth>}
    {(p.actors??[]).map(a=><group key={a.id} position={[x(a.x),.13,z(a.y)]}><mesh rotation={[Math.PI/2,0,0]}><octahedronGeometry args={[.2]}/><meshStandardMaterial color={a.selected?'#ffe08a':'#75d8d2'} metalness={.6} roughness={.25}/></mesh><Label at={[0,.48,0]} text={String(a.id+1)} number selected={a.selected}/></group>)}
    {(p.lamps??[]).map((l,i)=><group key={i} position={[x(l.c),.02,z(l.r)]}><Box at={[0,.16,0]} size={[.04,.32,.04]} color="#ac8c5a"/><Box at={[0,.38,0]} size={[.18,.24,.18]} color="#ffe08b" glow/><Ring radius={.24} rotation={[-Math.PI/2,0,0]} color="#eabc63"/></group>)}
  </Stage>;
}
