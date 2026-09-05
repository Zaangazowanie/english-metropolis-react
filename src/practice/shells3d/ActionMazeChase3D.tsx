import { useMemo } from 'react';
import { AimPlane, Stage, Box, Orb, Label, Ring, Instances, Smooth, Handle } from './action-arcade-scene-kit';
import type { ActionSceneData, DetailBlock } from './action-arcade-scene-kit';
export default function ActionMazeChase3D(p:ActionSceneData){
  const cols=p.grid?.cols??13,rows=p.grid?.rows??11,cell=.62;
  const x=(c:number)=>(c-(cols-1)/2)*cell,z=(r:number)=>(r-(rows-1)/2)*cell;
  const walls=useMemo(()=>{
    const out:DetailBlock[]=[];
    p.grid?.walls?.forEach((row,r)=>row.forEach((v,c)=>{
      if(v){
        out.push({at:[x(c),.12,z(r)],size:[.6,.55,.6],color:(c+r)%3?'#123aff':'#6500ea'},{at:[x(c),.42,z(r)],size:[.63,.08,.63],color:'#00dfff'},{at:[x(c),.468,z(r)],size:[.4,.025,.4],color:'#08257e'});
        if((r+c)%3===0)for(let n=0;n<3;n++)out.push({at:[x(c)+(n-1)*.11,.18,z(r)+.31],size:[.045,.21,.014],color:'#00164a'});
      }else{
        out.push({at:[x(c),-.2,z(r)],size:[.6,.12,.6],color:'#0b1539'},{at:[x(c),-.13,z(r)],size:[.055,.025,.055],color:'#ffc900'});
      }
    }));
    for(const side of [-1,1]){
      out.push({at:[side*(cols*cell/2+.1),.13,0],size:[.075,.6,rows*cell+.4],color:'#ff139b'},{at:[0,.13,side*(rows*cell/2+.1)],size:[cols*cell+.2,.6,.075],color:'#ff139b'});
    }
    return out;
  },[p.grid?.walls,cols,rows]);
  return <Stage width={cols*cell+.7} board onError={p.onError} reducedMotion={p.reducedMotion}>
    <Instances blocks={walls}/>
    <AimPlane cols={cols} rows={rows} cell={cell} y={-.08} player={p.player} walls={p.grid?.walls} onMove={p.onMove} />
    {p.player&&<Smooth at={[x(p.player.c),.08,z(p.player.r)]} reduced={p.reducedMotion}><Handle color="#ffcc00"/>{!!p.shield&&<Ring radius={.31} rotation={[-Math.PI/2,0,0]} color="#ffea00"/>}</Smooth>}
    {p.shadow&&<Smooth at={[x(p.shadow.c),.14,z(p.shadow.r)]} reduced={p.reducedMotion}><Orb radius={.25} scale={[1,1.2,1]} color={p.shield?'#4d24ed':'#ff008c'}/><Orb at={[-.085,.07,.21]} radius={.07} color="#fff"/><Orb at={[.085,.07,.21]} radius={.07} color="#fff"/><Orb at={[-.07,.07,.27]} radius={.028} color="#060f2d"/><Orb at={[.1,.07,.27]} radius={.028} color="#060f2d"/></Smooth>}
    {(p.actors??[]).map(a=><group key={a.id} position={[x(a.x),.13,z(a.y)]}><mesh rotation={[Math.PI/2,0,0]}><octahedronGeometry args={[.2]}/><meshStandardMaterial color={a.selected?'#ffdb00':'#00f5a4'} toneMapped={false} metalness={.35} roughness={.2}/></mesh><Label at={[0,.48,0]} text={String(a.id+1)} number selected={a.selected}/></group>)}
    {(p.lamps??[]).map((l,i)=><group key={i} position={[x(l.c),.02,z(l.r)]}><Box at={[0,.16,0]} size={[.04,.32,.04]} color="#ff9600"/><Box at={[0,.38,0]} size={[.18,.24,.18]} color="#ffdb00" glow/><Ring radius={.24} rotation={[-Math.PI/2,0,0]} color="#ffba00"/></group>)}
  </Stage>;
}
