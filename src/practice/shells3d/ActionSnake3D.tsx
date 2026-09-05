import { useMemo } from 'react';
import { Stage, Box, Orb, Ring, Label, Instances, Smooth } from './action-arcade-scene-kit';
import type { ActionSceneData } from './action-arcade-scene-kit';

/** The train carriages and pickups are the canonical collision grid in world space. */
export default function ActionSnake3D(p: ActionSceneData) {
  const cols=p.grid?.cols??16,rows=p.grid?.rows??12,cell=.58;
  const x=(c:number)=>(c-(cols-1)/2)*cell,z=(r:number)=>(r-(rows-1)/2)*cell;
  const tiles=useMemo(()=>Array.from({length:rows*cols},(_,i)=>({at:[x(i%cols),-.18,z(Math.floor(i/cols))] as [number,number,number],size:[cell-.035,.18,cell-.035] as [number,number,number],color:(i+Math.floor(i/cols))%2?'#4b6653':'#56735b'})),[cols,rows]);
  const head=p.body?.[0];
  return <Stage width={cols*cell+1} board theme="garden" onError={p.onError} reducedMotion={p.reducedMotion}>
    <Instances blocks={tiles}/>
    <mesh rotation={[-Math.PI/2,0,0]} position={[0,-.06,0]} onPointerDown={e=>{e.stopPropagation();if(!head)return;const dx=e.point.x-x(head.c),dz=e.point.z-z(head.r);p.onMove?.(Math.abs(dx)>Math.abs(dz)?dx>0?'right':'left':dz>0?'down':'up');}}><planeGeometry args={[cols*cell,rows*cell]}/><meshBasicMaterial transparent opacity={0}/></mesh>
    {(p.body??[]).map((s,i)=>{const next=i===0?p.direction:null;const yaw=next==='right'?Math.PI/2:next==='left'?-Math.PI/2:next==='up'?Math.PI:0;return <Smooth key={i} at={[x(s.c),.13,z(s.r)]} yaw={yaw} reduced={p.reducedMotion}>
      <Box size={[.43,.3,.48]} color={i===0?'#70d8a8':'#3d9f7f'} metal={.3}/><Box at={[0,.19,-.03]} size={[.38,.1,.4]} color="#f6e3b0"/>
      {i===0?<><Box at={[0,.13,.245]} size={[.3,.14,.025]} color="#223b4f"/><Orb at={[-.13,-.01,.26]} radius={.05} color="#fff1aa" glow/><Orb at={[.13,-.01,.26]} radius={.05} color="#fff1aa" glow/></>:<Box at={[0,.02,.25]} size={[.25,.13,.025]} color="#ffd596" glow/>}
      {[-1,1].map(side=><mesh key={side} position={[side*.22,-.12,0]} rotation={[0,0,Math.PI/2]}><cylinderGeometry args={[.085,.085,.05,10]}/><meshStandardMaterial color="#28293e"/></mesh>)}
    </Smooth>;})}
    {(p.actors??[]).map(a=><group key={a.id} position={[x(a.x),.03,z(a.y)]}>
      <Ring radius={.22} rotation={[-Math.PI/2,0,0]} color={a.selected?'#ffde76':'#7de5cd'}/><Orb at={[0,.23,0]} radius={.15} color={a.selected?'#ffe68f':'#a6d4bd'}/><Box at={[0,.34,0]} size={[.07,.08,.03]} color="#5eaf66"/>
      <Label at={[0,.62,0]} text={String(a.id+1)} number selected={a.selected}/>
    </group>)}
    {[-1,1].map(side=><group key={side}><Box at={[side*(cols*cell/2+.23),.14,0]} size={[.3,.45,rows*cell+.5]} color="#284936"/><Box at={[0,.14,side*(rows*cell/2+.23)]} size={[cols*cell+.8,.45,.3]} color="#284936"/></group>)}
  </Stage>;
}
