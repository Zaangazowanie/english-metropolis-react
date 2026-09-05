import { useMemo } from 'react';
import { Stage, Box, Orb, Label, Ring, Instances, Ripple } from './action-arcade-scene-kit';
import type { ActionSceneData, DetailBlock } from './action-arcade-scene-kit';
export default function ActionBattleship3D(p:ActionSceneData){
  const n=8,c=.72,world=(i:number)=>(i-3.5)*c;
  const tiles=useMemo(()=>{
    const b:DetailBlock[]=Array.from({length:64},(_,id)=>({at:[world(id%8),-.19,world(Math.floor(id/8))],size:[.68,.15,.68],color:(id+Math.floor(id/8))%2?'#005acb':'#007faf'}));
    for(let i=0;i<9;i++){
      const v=(i-4)*c;
      b.push({at:[v,-.1,0],size:[.013,.014,5.76],color:'#00d5ff'},{at:[0,-.1,v],size:[5.76,.014,.013],color:'#00d5ff'});
    }
    for(let i=0;i<13;i++)for(const s of [-1,1]){
      const z=(i-6)*.47;
      b.push({at:[s*3.38,.07,z],size:[.43,.035,.2],color:i%2?'#ffc900':'#061633'});
      if(i%3===0)b.push({at:[s*3.65,.12,z],size:[.11,.28,.11],color:'#ff5d00'},{at:[s*3.65,.27,z],size:[.23,.055,.12],color:'#00d5ff'});
    }
    for(let i=0;i<4;i++){
      b.push({at:[(i-1.5)*.9,.14,3.55],size:[.79,.48,.46],color:['#ff2e00','#ffbd00','#0089ff','#00ce89'][i]});
      for(let n=0;n<4;n++)b.push({at:[(i-1.5)*.9+(n-1.5)*.17,.14,3.79],size:[.04,.42,.03],color:'#071844'});
    }
    return b;
  },[]);
  return <Stage width={7.2} board theme="harbour" onError={p.onError} reducedMotion={p.reducedMotion}>
    <Instances blocks={tiles}/>
    <mesh rotation={[-Math.PI/2,0,0]} position={[0,-.1,0]} onPointerDown={e=>{e.stopPropagation();const col=Math.floor(e.point.x/c+4),row=Math.floor(e.point.z/c+4);if(col>=0&&col<n&&row>=0&&row<n)p.onPick?.(row*8+col);}}><planeGeometry args={[n*c,n*c]}/><meshBasicMaterial transparent opacity={.02} color="#9bdddc"/></mesh>
    {Array.from({length:8},(_,i)=><group key={i}><Label at={[world(i),.1,-3.28]} text={String.fromCharCode(65+i)} number/><Label at={[-3.35,.1,world(i)]} text={String(i+1)} number/></group>)}
    {p.lamps?.length? <Ring at={[world(p.lamps[0].c),.015,-3.28]} radius={.27} rotation={[-Math.PI/2,0,0]} color="#ffdc00"/>:null}
    {p.player&&<Ring at={[world(p.player.c),-.025,world(p.player.r)]} radius={.31} rotation={[-Math.PI/2,0,0]} color="#ffdc00"/>}
    {(p.actors??[]).map(a=><group key={a.id} position={[world(a.x),0,world(a.y)]}>{a.state==='hit'?<><Instances blocks={[
      {at:[0,.08,0],size:[.5,.22,.61],color:'#ff4b00'}, {at:[0,.26,-.07],size:[.32,.16,.28],color:'#fff'},
      {at:[0,.4,-.1],size:[.08,.24,.08],color:'#071844'}, {at:[0,.27,.08],size:[.24,.065,.025],color:'#00a9ff'},
      {at:[0,.2,.23],size:[.4,.045,.07],color:'#ffcf00'},
    ]}/><Orb at={[0,.57,-.1]} radius={.14} color="#ff6500"/></>:<><Ripple reduced={p.reducedMotion}/><Label at={[0,.2,0]} text={String(a.value??0)} number/></>}</group>)}
    <Box at={[3.38,-.12,0]} size={[.4,.35,6.2]} color="#123567"/><Box at={[-3.38,-.12,0]} size={[.4,.35,6.2]} color="#123567"/>
    <group position={[3.55,.1,-2.7]}><Instances blocks={Array.from({length:5},(_,i)=>({at:[0,.13+i*.23,0],size:[.42,.23,.42],color:i%2?'#ff174f':'#fff'}))}/><Box at={[0,1.18,0]} size={[.62,.18,.62]} color="#004ade"/><Orb at={[0,1.4,0]} radius={.17} color="#ffde00" glow/><Ring at={[0,1.44,0]} radius={.31} rotation={[Math.PI/2,0,0]} color="#00f0ff"/></group>
  </Stage>;
}
