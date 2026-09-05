import { useMemo } from 'react';
import { Stage, Box, Orb, Ring, Label, Instances, Smooth } from './action-arcade-scene-kit';
import type { ActionSceneData, DetailBlock } from './action-arcade-scene-kit';

/** The train carriages and pickups are the canonical collision grid in world space. */
export default function ActionSnake3D(p: ActionSceneData) {
  const cols=p.grid?.cols??16,rows=p.grid?.rows??12,cell=.58;
  const x=(c:number)=>(c-(cols-1)/2)*cell,z=(r:number)=>(r-(rows-1)/2)*cell;
  const tiles=useMemo(()=>{
    const b:DetailBlock[]=Array.from({length:rows*cols},(_,i)=>({at:[x(i%cols),-.18,z(Math.floor(i/cols))],size:[cell-.035,.18,cell-.035],color:(i+Math.floor(i/cols))%2?'#005379':'#06345b'}));
    for(let c=0;c<cols;c++)for(const s of [-1,1]){
      b.push({at:[x(c),.39,s*(rows*cell/2+.23)],size:[.25,.04,.28],color:c%2?'#ffca00':'#00dbaf'});
      b.push({at:[x(c),-.076,z(0)],size:[.25,.015,.022],color:'#00baff'},{at:[x(c),-.076,z(rows-1)],size:[.25,.015,.022],color:'#00baff'});
    }
    for(let r=0;r<rows;r++)for(const s of [-1,1])b.push({at:[s*(cols*cell/2+.23),.39,z(r)],size:[.28,.04,.25],color:r%2?'#ffca00':'#00dbaf'});
    return b;
  },[cols,rows]);
  const head=p.body?.[0];
  return <Stage width={cols*cell+1} board theme="garden" onError={p.onError} reducedMotion={p.reducedMotion}>
    <Instances blocks={tiles}/>
    <mesh rotation={[-Math.PI/2,0,0]} position={[0,-.06,0]} onPointerDown={e=>{e.stopPropagation();if(!head)return;const dx=e.point.x-x(head.c),dz=e.point.z-z(head.r);p.onMove?.(Math.abs(dx)>Math.abs(dz)?dx>0?'right':'left':dz>0?'down':'up');}}><planeGeometry args={[cols*cell,rows*cell]}/><meshBasicMaterial transparent opacity={0}/></mesh>
    {(p.body??[]).map((s,i)=>{const next=i===0?p.direction:null;const yaw=next==='right'?Math.PI/2:next==='left'?-Math.PI/2:next==='up'?Math.PI:0;return <Smooth key={i} at={[x(s.c),.13,z(s.r)]} yaw={yaw} reduced={p.reducedMotion}>
      <Instances blocks={[
        {at:[0,0,0],size:[.43,.3,.48],color:i===0?'#00e39a':'#00a3cb'},
        {at:[0,.19,-.03],size:[.38,.1,.4],color:'#ffcc00'},
        {at:[0,.13,.245],size:[.3,.14,.025],color:'#04205c'},
        {at:[0,-.05,.26],size:[.39,.055,.04],color:'#ff4d00'},
        ...[-1,1].flatMap<DetailBlock>(s=>[
          {at:[s*.224,.045,-.095],size:[.018,.12,.12],color:'#051b4d'} as DetailBlock,
          {at:[s*.224,.045,.085],size:[.018,.12,.12],color:'#051b4d'},
          {at:[s*.23,-.035,0],size:[.02,.025,.43],color:'#ffdc00'},
        ]),
      ]}/>
      {i===0&&<><Orb at={[-.13,-.01,.26]} radius={.05} color="#fff5ae" glow/><Orb at={[.13,-.01,.26]} radius={.05} color="#fff5ae" glow/></>}
      {[-1,1].map(side=><mesh key={side} position={[side*.22,-.12,0]} rotation={[0,0,Math.PI/2]}><cylinderGeometry args={[.085,.085,.05,10]}/><meshStandardMaterial color="#28293e"/></mesh>)}
    </Smooth>;})}
    {(p.actors??[]).map(a=><group key={a.id} position={[x(a.x),.03,z(a.y)]}>
      <Ring radius={.22} rotation={[-Math.PI/2,0,0]} color={a.selected?'#ffe000':'#00ffad'}/><Orb at={[0,.23,0]} radius={.15} color={a.selected?'#ffbf00':'#19e900'}/><Box at={[0,.34,0]} size={[.07,.08,.03]} color="#00a929"/>
      <Label at={[0,.62,0]} text={String(a.id+1)} number selected={a.selected}/>
    </group>)}
    {[-1,1].map(side=><group key={side}><Box at={[side*(cols*cell/2+.23),.14,0]} size={[.3,.45,rows*cell+.5]} color="#003f74"/><Box at={[0,.14,side*(rows*cell/2+.23)]} size={[cols*cell+.8,.45,.3]} color="#003f74"/></group>)}
  </Stage>;
}
