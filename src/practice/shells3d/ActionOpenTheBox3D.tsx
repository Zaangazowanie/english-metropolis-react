import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { MathUtils } from 'three';
import type { Group } from 'three';
import { Stage, Box, Orb, Label, Ring } from './action-arcade-scene-kit';
import type { ActionActor, ActionSceneData } from './action-arcade-scene-kit';
function Safe({a,p,cols,rows}:{a:ActionActor;p:ActionSceneData;cols:number;rows:number}){
  const door=useRef<Group>(null);const open=a.state==='opening'||a.state==='open',sealed=a.state==='sealed';
  useFrame((_,dt)=>{if(door.current)door.current.rotation.y=MathUtils.damp(door.current.rotation.y,open?-1.9:0,p.reducedMotion?1000:10,dt);});
  const x=(a.id%cols-(cols-1)/2)*1.7,y=(rows-1-Math.floor(a.id/cols))*1.65+.55;
  return <group position={[x,y,0]}>
    <Box at={[0,0,-.25]} size={[1.46,1.4,.7]} color="#312e43" metal={.55}/><Box at={[0,0,.12]} size={[1.19,1.15,.04]} color="#171924"/>
    {(open||sealed)&&<group position={[0,-.22,.2]}><mesh rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[.25,.25,.08,18]}/><meshStandardMaterial color="#f3cc68" metalness={.65} roughness={.23}/></mesh><Orb at={[0,.2,0]} radius={.13} color="#ffdf83" glow/></group>}
    <group ref={door} position={[-.66,0,.18]}>
      <group position={[.66,0,0]} onPointerDown={e=>{e.stopPropagation();if(a.enabled!==false)p.onPick?.(a.id);}}>
        <Box size={[1.32,1.28,.14]} color={sealed?'#47745e':a.selected?'#8e748e':'#62637e'} metal={.65}/><Box at={[0,0,.083]} size={[1.15,1.11,.025]} color={sealed?'#6c9a73':'#7b7993'} metal={.4}/>
        <Ring at={[.15,-.13,.13]} radius={.18} color="#e5c681"/><Box at={[.43,-.13,.13]} size={[.065,.41,.09]} color="#dac899" metal={.7}/>
        {[-.49,.49].flatMap(dx=>[-.47,.47].map(dy=><Orb key={`${dx}${dy}`} at={[dx,dy,.12]} radius={.034} color="#c7b99f"/>))}
        <Label at={[0,.38,.18]} text={`${sealed?'✓ ':''}${String(a.id+1).padStart(2,'0')}`} number selected={a.selected}/>
      </group>
    </group>
    {a.selected&&open&&<group position={[0,-.17,.36]} onPointerDown={e=>{e.stopPropagation();p.onDial?.();}}><Ring radius={.3} color="#ffdb85"/><group rotation={[0,0,-(p.dial??0)*Math.PI/2]}><Box size={[.07,.5,.07]} color="#f7d887" metal={.6}/><Box size={[.5,.07,.07]} color="#f7d887" metal={.6}/></group><Label at={[0,.5,0]} text={`DIAL ${String.fromCharCode(65+(p.dial??0))}`}/></group>}
  </group>;
}
export default function ActionOpenTheBox3D(p:ActionSceneData){const cols=Math.min(3,p.actors?.length??3),rows=Math.ceil((p.actors?.length??1)/cols);return <Stage width={Math.max(6.2,rows*1.9)} theme="vault" onError={p.onError} reducedMotion={p.reducedMotion}>
  <Box at={[0,(rows-1)*.825+.55,-.7]} size={[cols*1.75+.6,rows*1.7+.5,.4]} color="#514554"/>
  {(p.actors??[]).map(a=><Safe key={a.id} a={a} p={p} cols={cols} rows={rows}/>)}
  {[-1,1].map(s=><Box key={s} at={[s*(cols*.85+.4),1.7,-.4]} size={[.1,3.9,.14]} color="#c2a16d" metal={.6}/>)}
</Stage>;}
