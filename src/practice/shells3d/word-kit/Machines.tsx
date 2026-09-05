import {useRef} from 'react';
import {useFrame} from '@react-three/fiber';
import type {Group} from 'three';
import {useStageQuality} from '../kit/CityStage';
import {Bajla} from '../kit/Bajla';
import {Rail} from './Stage';
import type {Point} from './Stage';
const INK='#142135',STEEL='#5b768c',BRASS='#dcb773',GLOW='#ffcc78';
export function Block({at,size,color=STEEL,metal=.45,glow=0}:{at:Point;size:Point;color?:string;metal?:number;glow?:number}){return <mesh position={at}><boxGeometry args={size}/><meshStandardMaterial color={color} metalness={metal} roughness={.35} emissive={color} emissiveIntensity={glow}/></mesh>;}
function Wheel({at,r=.3,color=BRASS}:{at:Point;r?:number;color?:string}){return <mesh position={at} rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[r,r,.18,16]}/><meshStandardMaterial color={color} metalness={.7} roughness={.3}/></mesh>;}
export function Rivets({width,y,z=-.45}:{width:number;y:number;z?:number}){return <>{Array.from({length:Math.ceil(width)},(_,i)=><mesh key={i} position={[-width/2+i+.5,y,z]}><sphereGeometry args={[.05,6,4]}/><meshStandardMaterial color="#a7b3bd" metalness={.7}/></mesh>)}</>;}
export function ForgePress({load,commit=0}:{load:number;commit?:number}){
 const piston=useRef<Group>(null);const {reducedMotion}=useStageQuality();const started=useRef(-1);const last=useRef(commit);
 useFrame((state)=>{if(last.current!==commit){last.current=commit;started.current=state.clock.elapsedTime;}const t=state.clock.elapsedTime-started.current;const stroke=started.current>=0&&t<.8?Math.sin(t/.8*Math.PI):0;if(piston.current)piston.current.position.y=reducedMotion?0:-stroke*1.3;});
 return <group>
  <Block at={[0,1,-.9]} size={[9,2,.55]} color="#302b35"/><Block at={[0,-.1,-.4]} size={[9.7,.35,1.1]} color="#3e566c"/>
  {[-4.6,4.6].map(x=><group key={x}><Block at={[x,1.8,-.4]} size={[.42,4.7,.8]}/><Block at={[x,3.6,.05]} size={[.63,.18,.17]} color={BRASS}/><Block at={[x,-.3,.1]} size={[.85,.3,1.2]} color={INK}/></group>)}
  <Block at={[0,3.9,-.45]} size={[10,.65,1]} color="#455064"/><Rivets width={9} y={3.9} z={.1}/>
  <group ref={piston}><Block at={[0,3.0,-.2]} size={[.6,1.6,.5]} color="#a4afbc"/><Block at={[0,2.35,.1]} size={[7.6,.3,.9]} color="#a38457"/><Block at={[0,2.13,.42]} size={[7.3,.1,.12]} color={GLOW} glow={load*.7}/></group>
  {Array.from({length:8},(_,i)=><Block key={i} at={[-3.5+i,-.02,.25]} size={[.38,.07,.06]} color={GLOW} glow={load}/>) }
 </group>;
}
export function LiftTower({progress,lives}:{progress:number;lives:number}){
 const carriage=useRef<Group>(null);const {reducedMotion}=useStageQuality();const y=-3+progress*6.4;const origin=useRef<Point>([0,y,.25]);
 useFrame((_,dt)=>{if(carriage.current)carriage.current.position.y+=(y-carriage.current.position.y)*(reducedMotion?1:1-Math.exp(-dt*5));});
 return <group position={[-4.2,0,-.15]}>
  {[-.8,.8].map(x=><group key={x}><Block at={[x,0,-.5]} size={[.18,8,.3]} color="#637a91"/>{Array.from({length:5},(_,i)=><Rail key={i} from={[x,-3.5+i*1.4,-.35]} to={[-x,-2.1+i*1.4,-.35]} color="#466783" thick={.1}/>)}</group>)}
  <Block at={[0,4,-.3]} size={[2.3,.38,.8]} color={BRASS}/><Wheel at={[0,3.87,.15]} r={.45}/><Block at={[0,0,.1]} size={[.035,7.8,.035]} color="#a8becd"/>
  <Block at={[0,-4,-.3]} size={[2.5,.4,1.1]} color="#20354a"/>
  <group ref={carriage} position={origin.current}><Block at={[0,-.12,0]} size={[1.4,.2,1]} color={BRASS}/><Block at={[0,.55,-.4]} size={[1.45,1.2,.15]} color="#455073"/><Bajla scale={.5} position={[0,.3,.1]} reducedMotion={reducedMotion} variant={progress>=1?'celebrate':'idle'}/>{[-.7,.7].map(x=><Block key={x} at={[x,.45,.18]} size={[.1,1.05,.1]} color={BRASS}/>)}</group>
  {Array.from({length:6},(_,i)=><Block key={i} at={[-1.24,-3+i*.33,.1]} size={[.2,.21,.09]} color={i<lives?'#93eec3':'#603647'} glow={i<lives?.5:0}/>)}
 </group>;
}
export function VaultCabinet({open,route}:{open:boolean;route:'known'|'review'|null}){
 const door=useRef<Group>(null);const {reducedMotion}=useStageQuality();
 useFrame((_,dt)=>{if(door.current)door.current.rotation.y+=((open?-1.85:0)-door.current.rotation.y)*(reducedMotion?1:1-Math.exp(-dt*6));});
 return <group>
  <Block at={[0,.75,-.9]} size={[5,3.55,.9]} color="#333f5e"/><Block at={[0,.75,-.38]} size={[4.38,2.88,.16]} color="#080f21"/>
  {[-2.35,2.35].map(x=><Block key={x} at={[x,.75,-.16]} size={[.19,3.1,.15]} color={BRASS}/>)}
  <group ref={door} position={[-2.2,.75,-.1]}><Block at={[2.2,0,0]} size={[4.4,2.9,.23]} color="#4b526e"/><Block at={[2.2,0,.14]} size={[3.95,2.43,.08]} color="#29394e"/><Wheel at={[2.2,0,.25]} r={.48}/><Rail from={[1.8,-.4,.32]} to={[2.6,.4,.32]} color={BRASS} thick={.08}/><Rail from={[1.8,.4,.32]} to={[2.6,-.4,.32]} color={BRASS} thick={.08}/></group>
  {[-3.5,3.5].map((x,i)=><group key={x}><Block at={[x,-1.75,-.65]} size={[2.5,1.4,1.1]} color={i?'#244d49':'#4b3658'}/><Block at={[x,-1.35,.0]} size={[1.95,.12,.12]} color={route===(i?'known':'review')?'#fbe4a2':'#b8a8d0'} glow={route===(i?'known':'review')?.7:.1}/></group>)}
 </group>;
}
export function Conveyor({destinations,selected}:{destinations:number;selected:boolean}){
 const rollers=useRef<Group>(null);const {reducedMotion}=useStageQuality();
 useFrame((_,dt)=>{if(!rollers.current||reducedMotion)return;for(const child of rollers.current.children)child.rotation.x+=dt*(selected?1:2);});
 return <group><Block at={[0,-2.2,-.7]} size={[9,2.8,.35]} color="#101b27"/>{[-1,1].map(s=><Block key={s} at={[s*4.65,-2.2,-.33]} size={[.22,3.15,.3]} color={BRASS}/>)}
  <group ref={rollers}>{Array.from({length:12},(_,i)=><mesh key={i} position={[-4.2+i*.76,-2.2,-.44]} rotation={[0,Math.PI/2,0]}><cylinderGeometry args={[.11,.11,2.7,8]}/><meshStandardMaterial color={i%2?'#33495c':'#53667b'} metalness={.5}/></mesh>)}</group>
  {Array.from({length:destinations},(_,i)=><group key={i} position={[(i-(destinations-1)/2)*3,1.7,-.4]}><Block at={[0,0,0]} size={[2.7,1.65,.75]} color="#304455"/><Block at={[0,-.21,.44]} size={[2.2,.54,.13]} color="#071324"/><Block at={[0,.68,.5]} size={[2.5,.1,.15]} color={BRASS}/></group>)}
 </group>;
}
export function CargoCrane({target,loaded}:{target:number|null;loaded:number}){
 const trolley=useRef<Group>(null);const {reducedMotion}=useStageQuality();const x=target===null?0:(target%4-1.5)*2.4;
 useFrame((_,dt)=>{if(trolley.current)trolley.current.position.x+=(x-trolley.current.position.x)*(reducedMotion?1:1-Math.exp(-dt*5));});
 return <group><Block at={[0,3.5,-.4]} size={[11,.35,.5]} color={BRASS}/>{[-5.2,5.2].map(x=><group key={x}><Block at={[x,.3,-.5]} size={[.22,6.4,.4]}/><Rail from={[x,-2.8,-.35]} to={[x*.7,-2.8,-.35]} color={BRASS} thick={.2}/></group>)}
  <group ref={trolley}><Block at={[0,3.5,0]} size={[1,.5,.5]} color="#8196aa"/><Block at={[0,2.55,.1]} size={[.04,1.65,.04]} color="#d4d7da"/><mesh position={[0,1.75,.15]}><torusGeometry args={[.2,.05,7,12,Math.PI*1.4]}/><meshStandardMaterial color={BRASS} metalness={.6}/></mesh></group>
  {Array.from({length:Math.min(8,loaded)},(_,i)=><Block key={i} at={[-4.5+i*.3,-3.7,0]} size={[.17,.12,.1]} color="#7ae9b5" glow={.6}/>)}
 </group>;
}
export function RailPlatforms({count=3}:{count?:number}){
 return <group>{[-1,1].map(side=><group key={side} position={[side*3.5,0,-.7]}><Block at={[0,0,0]} size={[3.1,count*1.65+1,.4]} color="#2e3547"/><Block at={[-side*1.5,0,.26]} size={[.11,count*1.65+1,.08]} color={BRASS}/>{Array.from({length:count+1},(_,i)=><Block key={i} at={[0,(count/2-i)*1.65,.26]} size={[3,.045,.04]} color="#748090"/>)}</group>)}
  {Array.from({length:count},(_,i)=><group key={i}><Block at={[-1.25,((count-1)/2-i)*1.65-.4,0]} size={[.1,.75,.1]} color="#a2aebc"/><mesh position={[-1.25,((count-1)/2-i)*1.65,.1]}><sphereGeometry args={[.14,8,6]}/><meshStandardMaterial color="#f3c67b" emissive="#f3c67b" emissiveIntensity={.5}/></mesh></group>)}
 </group>;
}
export function BridgeStructure({count,completed}:{count:number;completed:number}){
 return <group>{[-4.5,4.5].map(x=><group key={x}><Block at={[x,1,-.75]} size={[.3,5,.5]} color="#775883"/><Block at={[x,3.55,-.65]} size={[.75,.35,.8]} color={BRASS}/></group>)}
  <Rail from={[-4.5,3.4,-.6]} to={[0,1.5,-.6]} color="#ae9bc7" thick={.09}/><Rail from={[0,1.5,-.6]} to={[4.5,3.4,-.6]} color="#ae9bc7" thick={.09}/>
  {Array.from({length:9},(_,i)=><Rail key={i} from={[-4+i,1.55+Math.abs(-4+i)*.4,-.65]} to={[-4+i,.75,-.65]} color="#aeb4c8" thick={.035}/>)}
  <Block at={[0,-2.3,-1.0]} size={[11,2.2,.15]} color="#153c51" metal={.7}/><Block at={[0,-3.3,-.8]} size={[9*(completed/Math.max(1,count)),.06,.1]} color="#77dbd3" glow={.4}/>
 </group>;
}
export function SoundLock({slots,open}:{slots:number;open:boolean}){
 return <group><Block at={[0,.5,-.65]} size={[Math.min(10,slots*1.1+1.5),3.7,.75]} color="#4a3d57"/><Block at={[0,.5,-.2]} size={[Math.min(9.6,slots*1.1+1.1),3.25,.13]} color="#122235"/>
  {[-4.3,4.3].map(x=><group key={x}><Wheel at={[x,-2.7,-.2]} r={.6}/><mesh position={[x,-2.7,-.08]}><torusGeometry args={[.36,.045,7,22]}/><meshStandardMaterial color={open?'#86ecc2':BRASS} emissive={open?'#86ecc2':BRASS} emissiveIntensity={.25}/></mesh></group>)}
  <Rivets width={8} y={2.16} z={-.04}/><Rivets width={8} y={-1.1} z={-.04}/>
 </group>;
}
export function PrintingPress({rows,pressed}:{rows:number;pressed:boolean}){
 return <group><Block at={[0,.5,-.7]} size={[12,Math.max(4,rows*1.4+1),.55]} color="#31485c"/>{[-5.5,5.5].map(x=><group key={x}><Block at={[x,.5,-.24]} size={[.3,Math.max(4,rows*1.4+1),.3]} color={BRASS}/><Wheel at={[x,-rows*.7-1,.2]} r={.48}/></group>)}<Block at={[0,pressed?-.3:rows*.7+1,-.15]} size={[10.5,.32,.5]} color="#9fb1c0"/><Rivets width={10} y={rows*.7+1} z={.13}/></group>;
}

export function TransferPortal({ready,done}:{ready:boolean;done:boolean}){
 const rotor=useRef<Group>(null);const {reducedMotion}=useStageQuality();
 useFrame((_,dt)=>{if(rotor.current&&!reducedMotion&&ready)rotor.current.rotation.z+=dt*.8;});
 return <group>
  {[-3.6,3.6].map((x,i)=><group key={x} position={[x,.85,-.25]}><mesh><torusGeometry args={[1.25,.15,8,32]}/><meshStandardMaterial color={i?'#83c8df':'#c49bee'} metalness={.7} roughness={.3}/></mesh><mesh position={[0,0,.05]}><torusGeometry args={[1.01,.06,7,32]}/><meshStandardMaterial color={done?'#86eab9':ready?'#fbd48d':'#514168'} emissive={done?'#86eab9':ready?'#fbd48d':'#514168'} emissiveIntensity={.75}/></mesh><Block at={[0,-1.35,-.1]} size={[2.8,.4,.8]} color="#27394e"/></group>)}
  <group ref={rotor} position={[0,1.2,-.3]}>{Array.from({length:6},(_,i)=><Block key={i} at={[Math.cos(i*Math.PI/3)*.7,Math.sin(i*Math.PI/3)*.7,0]} size={[.16,.36,.12]} color={BRASS} glow={ready?.4:0}/>)}</group>
  <Block at={[0,-2.8,-.6]} size={[11,.4,1]} color="#304761"/><Rivets width={10} y={-2.8} z={0}/>
 </group>;
}
export function TelegraphMachine({progress,ready,done}:{progress:number;ready:boolean;done:boolean}){
 const key=useRef<Group>(null);const last=useRef(progress);const down=useRef(0);const {reducedMotion}=useStageQuality();
 useFrame((_,dt)=>{if(last.current!==progress){last.current=progress;down.current=.18;}down.current=Math.max(0,down.current-dt);if(key.current)key.current.rotation.z=reducedMotion?0:(down.current>0?-.13:.1);});
 return <group><Block at={[0,-2.7,-.7]} size={[11,1.8,.75]} color="#594936"/><Block at={[0,-2.7,-.25]} size={[10.3,1.4,.18]} color="#283449"/>
  <group ref={key} position={[0,-2.2,.05]}><Block at={[0,0,0]} size={[2.7,.16,.25]} color={BRASS}/><Wheel at={[-1.15,.05,.15]} r={.2}/><Block at={[1.15,.1,.05]} size={[.8,.25,.55]} color="#122334"/></group>
  <Block at={[0,-3.02,.0]} size={[1.2,.35,.5]} color="#78613b"/>
  {[-4.9,4.9].map(x=><group key={x}><Block at={[x,1,-.4]} size={[.18,3.6,.25]} color="#425c77"/><Block at={[x,2.75,-.2]} size={[.75,.8,.3]} color="#182b3e"/><mesh position={[x,2.8,.0]}><sphereGeometry args={[.19,10,6]}/><meshStandardMaterial color={done?'#73ecc0':ready?'#fcd589':'#c7686a'} emissive={done?'#73ecc0':ready?'#fcd589':'#c7686a'} emissiveIntensity={.7}/></mesh></group>)}
 </group>;
}
export function CityBuildings({size,neon=false}:{size:number;neon?:boolean}){
 const edge=size*.39+.75;
 return <group>{Array.from({length:14},(_,i)=>{const side=i<7?-1:1;const y=(i%7-3)*size*.11;const height=.5+(i*7%5)*.2;return <group key={i}><Block at={[side*edge,y,-.5+height/2]} size={[.55,.58,height]} color={neon?(i%2?'#362651':'#28505d'):(i%2?'#4f6179':'#5a7286')}/><Block at={[side*edge,y-.17,height-.32]} size={[.37,.06,.04]} color={neon?(i%2?'#e7a1d7':'#80deeb'):'#e9bc75'} glow={.6}/></group>;})}</group>;
}
