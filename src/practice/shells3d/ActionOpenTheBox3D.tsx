import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { MathUtils } from 'three';
import type { Group } from 'three';
import { HoverTarget, Stage, Box, Orb, Label, Ring, Instances } from './action-arcade-scene-kit';
import type { ActionActor, ActionSceneData, DetailBlock } from './action-arcade-scene-kit';
function Safe({a,p,cols,rows}:{a:ActionActor;p:ActionSceneData;cols:number;rows:number}){
  const door=useRef<Group>(null);const open=a.state==='opening'||a.state==='open',sealed=a.state==='sealed';
  useFrame((_,dt)=>{if(door.current)door.current.rotation.y=MathUtils.damp(door.current.rotation.y,open?-1.9:0,p.reducedMotion?1000:10,dt);});
  const x=(a.id%cols-(cols-1)/2)*1.7,y=(rows-1-Math.floor(a.id/cols))*1.65+.55;
  return <group position={[x,y,0]}><HoverTarget enabled={a.enabled!==false} reduced={p.reducedMotion} radius={.76} at={[0,0,.38]}>
    <Box at={[0,0,-.25]} size={[1.46,1.4,.7]} color="#081945" metal={.55}/><Box at={[0,0,.12]} size={[1.19,1.15,.04]} color="#030916"/>
    {(open||sealed)&&<group position={[0,-.22,.2]}><mesh rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[.25,.25,.08,18]}/><meshStandardMaterial color="#ffcf00" toneMapped={false} metalness={.4} roughness={.23}/></mesh><Orb at={[0,.2,0]} radius={.13} color="#ffdd00" glow/></group>}
    <group ref={door} position={[-.66,0,.18]}>
      <group position={[.66,0,0]} onPointerDown={e=>{e.stopPropagation();if(a.enabled!==false)p.onPick?.(a.id);}}>
        <Box size={[1.32,1.28,.14]} color={sealed?'#00c772':a.selected?'#df00e6':'#1244dd'} metal={.32}/><Box at={[0,0,.083]} size={[1.15,1.11,.025]} color={sealed?'#005d4b':'#08195b'} metal={.25}/>
        <Ring at={[.15,-.13,.13]} radius={.18} color="#ffcf00"/><Box at={[.43,-.13,.13]} size={[.065,.41,.09]} color="#ffce00" metal={.5}/>
        <Instances blocks={[
          ...[-.49,.49].flatMap(dx=>[-.47,.47].map(dy=>({at:[dx,dy,.12],size:[.07,.07,.035],color:'#ffcb00'} as DetailBlock))),
          {at:[-.36,-.14,.115],size:[.12,.5,.03],color:'#00d9ff'},
          ...Array.from({length:4},(_,i)=>({at:[.06+(i%2)*.18,.09+Math.floor(i/2)*.1,.12],size:[.11,.025,.02],color:'#00d9ff'} as DetailBlock)),
          {at:[0,-.48,.12],size:[.72,.04,.02],color:sealed?'#00ff98':'#2067ff'},
        ]}/>
        <Label at={[0,.38,.18]} text={`${sealed?'✓ ':''}${String(a.id+1).padStart(2,'0')}`} number selected={a.selected}/>
      </group>
    </group>
    {a.selected&&open&&<group position={[0,-.17,.36]} onPointerDown={e=>{e.stopPropagation();p.onDial?.();}}><Ring radius={.3} color="#ffdc00"/><group rotation={[0,0,-(p.dial??0)*Math.PI/2]}><Box size={[.07,.5,.07]} color="#ffcc00" metal={.4}/><Box size={[.5,.07,.07]} color="#ffcc00" metal={.4}/></group><Label at={[0,.5,0]} text={`DIAL ${String.fromCharCode(65+(p.dial??0))}`}/></group>}
  </HoverTarget></group>;
}
export default function ActionOpenTheBox3D(p:ActionSceneData){const cols=Math.min(3,p.actors?.length??3),rows=Math.ceil((p.actors?.length??1)/cols);
  const frame=useMemo(()=>{
    const b:DetailBlock[]=[];
    for(const s of [-1,1]){
      b.push({at:[s*(cols*.85+.4),(rows-1)*.825+.55,-.4],size:[.22,rows*1.7+.6,.34],color:'#0045df'});
      for(let i=0;i<rows*6;i++)b.push({at:[s*(cols*.85+.4),i*.28-.2,-.21],size:[.14,.14,.025],color:i%2?'#ffd000':'#04183e'});
    }
    for(let r=0;r<=rows;r++)b.push({at:[0,r*1.65-.28,-.3],size:[cols*1.7+.5,.08,.16],color:'#00d9ff'});
    return b;
  },[cols,rows]);
  return <Stage width={Math.max(6.2,rows*1.9)} theme="vault" onError={p.onError} reducedMotion={p.reducedMotion}>
  <Box at={[0,(rows-1)*.825+.55,-.7]} size={[cols*1.75+.6,rows*1.7+.5,.4]} color="#081a4b"/>
  <Instances blocks={frame}/>
  {(p.actors??[]).map(a=><Safe key={a.id} a={a} p={p} cols={cols} rows={rows}/>)}
</Stage>;}
