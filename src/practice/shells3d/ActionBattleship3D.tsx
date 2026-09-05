import { useMemo } from 'react';
import { Stage, Box, Orb, Label, Ring, Instances, Ripple } from './action-arcade-scene-kit';
import type { ActionSceneData } from './action-arcade-scene-kit';
export default function ActionBattleship3D(p:ActionSceneData){
  const n=8,c=.72,world=(i:number)=>(i-3.5)*c;
  const tiles=useMemo(()=>Array.from({length:64},(_,id)=>({at:[world(id%8),-.19,world(Math.floor(id/8))] as [number,number,number],size:[.68,.15,.68] as [number,number,number],color:(id+Math.floor(id/8))%2?'#285b69':'#326a77'})),[]);
  return <Stage width={7.2} board theme="harbour" onError={p.onError} reducedMotion={p.reducedMotion}>
    <Instances blocks={tiles}/>
    <mesh rotation={[-Math.PI/2,0,0]} position={[0,-.1,0]} onPointerDown={e=>{e.stopPropagation();const col=Math.floor(e.point.x/c+4),row=Math.floor(e.point.z/c+4);if(col>=0&&col<n&&row>=0&&row<n)p.onPick?.(row*8+col);}}><planeGeometry args={[n*c,n*c]}/><meshBasicMaterial transparent opacity={.02} color="#9bdddc"/></mesh>
    {Array.from({length:8},(_,i)=><group key={i}><Label at={[world(i),.1,-3.28]} text={String.fromCharCode(65+i)} number/><Label at={[-3.35,.1,world(i)]} text={String(i+1)} number/></group>)}
    {p.player&&<Ring at={[world(p.player.c),-.025,world(p.player.r)]} radius={.31} rotation={[-Math.PI/2,0,0]} color="#ffe294"/>}
    {(p.actors??[]).map(a=><group key={a.id} position={[world(a.x),0,world(a.y)]}>{a.state==='hit'?<><Box at={[0,.08,0]} size={[.5,.22,.61]} color="#ac7365" metal={.5}/><Box at={[0,.26,-.07]} size={[.32,.16,.28]} color="#d2b2a0"/><Box at={[0,.4,-.1]} size={[.08,.24,.08]} color="#3a3443"/><Orb at={[0,.57,-.1]} radius={.14} color="#7b6b83"/></>:<><Ripple reduced={p.reducedMotion}/><Label at={[0,.2,0]} text={String(a.value??0)} number/></>}</group>)}
    <Box at={[3.38,-.12,0]} size={[.4,.35,6.2]} color="#8b6e60"/><Box at={[-3.38,-.12,0]} size={[.4,.35,6.2]} color="#8b6e60"/>
    <group position={[3.55,.1,-2.7]}><Box at={[0,.55,0]} size={[.42,1.1,.42]} color="#e9cba4"/><Box at={[0,1.18,0]} size={[.62,.18,.62]} color="#a65c66"/><Orb at={[0,1.4,0]} radius={.17} color="#ffe6a0" glow/></group>
  </Stage>;
}
