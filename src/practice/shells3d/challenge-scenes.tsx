import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CatmullRomCurve3, MathUtils, Object3D, Vector3, type Group, type Mesh, type InstancedMesh } from 'three';
import { useStageQuality } from './kit/CityStage';
import type { MachineItem, MachineKind } from './challenge-machine';
import { solvedCircuitPairs } from './challenge-machine-logic';

type V3=[number,number,number];
export type MachineMove={sequence:number;time:number;type:'commit'|'place'|'activate'|'ready'|'action';from:V3;to:V3};
export interface SceneProps {kind:MachineKind;color:string;selected:V3|null;move:MachineMove|null;success:boolean;signal:number;items:MachineItem[];slots:MachineItem[];columns:number}
export function machinePosition(kind:MachineKind,index:number,count:number,columns:number,slot=false):V3 {
  const rows=Math.ceil(count/columns),col=index%columns,row=Math.floor(index/columns);
  if(kind==='junction')return [(index===0?-1:1)*(columns===2?1.65:2.7),.45,-1.5];
  if(kind==='patch')return [slot?2.4:-2.4,((count-1)/2-index)*1.5,0];
  if(kind==='crane')return [(col-(Math.min(columns,count)-1)/2)*2.25,slot?1.05:-.95,slot?-.7:.6];
  if(kind==='freight'||kind==='sentence')return [(col-(Math.min(columns,count)-1)/2)*2.25,slot?-.75:1.15,slot?.45:-.5];
  if(kind==='reactor'||kind==='museum'||kind==='gallery')return [col===0?-2.65:columns===2?2.65:col===1?0:2.65,((rows-1)/2-row)*1.9+.25,0];
  if(kind==='radio'||kind==='studio')return [col===0?-2.65:2.65,((rows-1)/2-row)*1.9-.25,.5];
  if(kind==='dealer')return [(col-(Math.min(columns,count)-1)/2)*2.25,((rows-1)/2-row)*1.8+.35,.3+Math.abs(col-(columns-1)/2)*.12];
  return [(col-(Math.min(columns,count)-1)/2)*2.25,((rows-1)/2-row)*1.8+.35,0];
}
const gold='#c8a570',steel='#4a6371',ink='#172a38';
export function Block({p=[0,0,0],s=[1,1,1],c=steel,emissive=false,rotation=[0,0,0]}:{p?:V3;s?:V3;c?:string;emissive?:boolean;rotation?:V3}) {return <mesh position={p} rotation={rotation}><boxGeometry args={s}/><meshStandardMaterial color={c} roughness={.45} metalness={.35} emissive={emissive?c:'#000'} emissiveIntensity={emissive?.45:0}/></mesh>;}
function Cylinder({p=[0,0,0],r=.3,h=1,c=steel,rotation=[0,0,0],emissive=false}:{p?:V3;r?:number;h?:number;c?:string;rotation?:V3;emissive?:boolean}) {return <mesh position={p} rotation={rotation}><cylinderGeometry args={[r,r,h,16]}/><meshStandardMaterial color={c} metalness={.65} roughness={.25} emissive={emissive?c:'#000'} emissiveIntensity={emissive?.4:0}/></mesh>;}
export function Hoop({p=[0,0,0],r=.4,c=gold,rotation=[0,0,0]}:{p?:V3;r?:number;c?:string;rotation?:V3}) {return <mesh position={p} rotation={rotation}><torusGeometry args={[r,.05,6,32]}/><meshStandardMaterial color={c} metalness={.65} roughness={.25} emissive={c} emissiveIntensity={.3}/></mesh>;}
function Orb({p=[0,0,0],r=.4,c=gold}:{p?:V3;r?:number;c?:string}) {return <mesh position={p}><sphereGeometry args={[r,12,10]}/><meshStandardMaterial color={c} metalness={.35} roughness={.3} emissive={c} emissiveIntensity={.3}/></mesh>;}
function Lead({from,to,color=gold}:{from:V3;to:V3;color?:string}) {
  const curve=useMemo(()=>new CatmullRomCurve3([new Vector3(...from),new Vector3((from[0]+to[0])/2,(from[1]+to[1])/2-.45,Math.max(from[2],to[2])+.38),new Vector3(...to)]),[from[0],from[1],from[2],to[0],to[1],to[2]]);
  return <mesh><tubeGeometry args={[curve,20,.035,5,false]}/><meshStandardMaterial color={color} emissive={color} emissiveIntensity={.7} metalness={.5}/></mesh>;
}
function Rail({points}:{points:V3[]}) { const curve=useMemo(()=>new CatmullRomCurve3(points.map(p=>new Vector3(...p))),[points.map(p=>p.join(',')).join(';')]);return <mesh><tubeGeometry args={[curve,32,.035,5,false]}/><meshStandardMaterial color="#b8b4a9" roughness={.3} metalness={.8}/></mesh>; }
function Train({color=gold}:{color?:string}) {return <group><Block s={[.85,.45,.55]} c={color}/><Block p={[.25,.33,0]} s={[.4,.32,.6]} c={steel}/><Block p={[.25,.35,.31]} s={[.26,.17,.03]} c="#bdd9db"/><Cylinder p={[-.23,.4,0]} r={.07} h={.37} c={ink}/>{[-.27,.27].map(x=><Cylinder key={x} p={[x,-.21,0]} r={.13} h={.66} c={ink} rotation={[Math.PI/2,0,0]}/>)}</group>;}
function timeProgress(move:MachineMove|null,duration:number,reduced:boolean) {return !move?0:reduced?1:Math.min(1,(performance.now()-move.time)/duration);}
function HingedMemoryDoor({hidden,right,color}:{hidden:boolean;right:boolean;color:string}) {
  const hinge=useRef<Group>(null!);const {reducedMotion}=useStageQuality();
  useFrame((_,dt)=>{if(hinge.current){const angle=hidden?0:-1.3;hinge.current.rotation.y=reducedMotion?angle:MathUtils.damp(hinge.current.rotation.y,angle,9,dt);}});
  return <group><Block s={[1.92,1.48,.3]} c={ink}/><Hoop p={[0,0,.2]} r={.48} c={right?'#99edc7':color}/><Block p={[0,-.61,.25]} s={[1.63,.06,.04]} c={right?'#99edc7':gold} emissive={right}/><group ref={hinge} position={[-.87,0,.22]}><Block p={[.87,0,0]} s={[1.73,1.29,.1]} c="#476479"/><Hoop p={[1.53,0,.1]} r={.12} c={gold}/></group><Cylinder p={[-.87,.05,.17]} r={.055} h={1.2} c={gold}/></group>;
}

/** Natural object surfaces remain visible around the small DOM label plaques. */
export function MachineModel({kind,color,slot=false,right=false,hidden=false}:{kind:MachineKind;color:string;slot?:boolean;right?:boolean;hidden?:boolean}) {
  if(kind==='junction')return <group><Block p={[0,0,-.12]} s={[1.5,1.25,.18]} c={ink}/>{[-.8,.8].map(x=><Block key={x} p={[x,-.2,0]} s={[.12,1.7,.16]} c={gold}/>)}<Block p={[0,.7,0]} s={[1.8,.18,.3]} c={color}/><Orb p={[0,.92,0]} r={.13} c={color}/></group>;
  if(kind==='reactor')return <group><Cylinder r={.58} h={1.35} c={ink}/><Cylinder r={.4} h={1.1} c={color} emissive/>{[-.66,.66].map(y=><Cylinder key={y} p={[0,y,0]} r={.65} h={.12} c={gold}/>)}<Hoop p={[0,0,.52]} r={.34} c={color}/></group>;
  if(kind==='radio')return <group><Cylinder p={[0,-.1,0]} r={.65} h={.32} c={gold} rotation={[Math.PI/2,0,0]}/><Hoop p={[0,-.1,.18]} r={.5} c={color}/><Block p={[0,.1,.2]} s={[.07,.37,.09]} c={color}/>{[-.5,.5].map(x=><Block key={x} p={[x,-.67,0]} s={[.13,.5,.18]} c={steel}/>)}</group>;
  if(kind==='studio')return <group><Cylinder r={.64} h={.23} c={gold} rotation={[Math.PI/2,0,0]}/><Cylinder p={[0,0,.17]} r={.48} h={.1} c={color} rotation={[Math.PI/2,0,0]} emissive/><Hoop p={[0,0,.27]} r={.51} c={ink}/></group>;
  if(kind==='patch')return <group>{slot?<><Cylinder r={.58} h={.23} c={gold} rotation={[Math.PI/2,0,0]}/><Cylinder p={[0,0,.14]} r={.36} h={.07} c={right?color:ink} rotation={[Math.PI/2,0,0]} emissive={right}/></>:<><Cylinder r={.33} h={.9} c={color} rotation={[Math.PI/2,0,0]}/><Cylinder p={[0,.05,.49]} r={.14} h={.26} c={gold} rotation={[Math.PI/2,0,0]}/><Lead from={[0,0,-.3]} to={[-.7,-.55,-.2]} color={color}/></>}</group>;
  if(kind==='freight'||kind==='sentence')return <group><Block s={[1.8,.65,.55]} c={slot&&!right?ink:color}/><Block p={[0,.39,0]} s={[1.95,.13,.63]} c={gold}/>{[-.62,.62].map(x=><Cylinder key={x} p={[x,-.36,0]} r={.17} h={.66} c={ink} rotation={[Math.PI/2,0,0]}/>)}{[-1,1].map(x=><Hoop key={x} p={[x,-.2,0]} r={.11} c={gold} rotation={[0,Math.PI/2,0]}/>)}{slot&&<Block p={[0,-.6,0]} s={[2.2,.06,.07]} c="#9bacaf"/>}</group>;
  if(kind==='crane')return <group><Block s={[1.4,.92,.65]} c={slot?ink:'#8b7659'}/>{[-.46,.46].map(x=><Block key={x} p={[x,0,.34]} s={[.07,.91,.05]} c={gold}/>)}<Block p={[0,0,.35]} s={[1.38,.07,.05]} c={gold}/><Hoop p={[0,.6,0]} r={.16} c={color}/>{slot&&<Hoop p={[0,0,.38]} r={.54} c={color}/>}</group>;
  if(kind==='dealer')return <group rotation={[0,0,.08]}><Block s={[1.45,1.7,.045]} c="#eee2c5"/><Block p={[0,0,.027]} s={[1.3,1.55,.01]} c={hidden?'#35536b':'#f5eacb'}/>{[-.56,.56].map(x=><Orb key={x} p={[x,.65,.045]} r={.07} c={color}/>)}<Hoop p={[0,.23,.045]} r={.36} c={color}/></group>;
  if(kind==='memory')return <HingedMemoryDoor hidden={hidden} right={right} color={color}/>;
  if(kind==='gallery'||kind==='museum')return <group><Block s={[1.5,1.18,.08]} c={kind==='gallery'?'#e2d4b8':'#243844'}/>{[-.82,.82].map(x=><Block key={x} p={[x,0,.03]} s={[.13,1.42,.18]} c={gold}/>)}{[-.65,.65].map(y=><Block key={y} p={[0,y,.03]} s={[1.76,.13,.18]} c={gold}/>)}<Block p={[0,-.85,-.2]} s={[.5,.3,.5]} c={steel}/><Block p={[0,-1.03,-.2]} s={[1,.08,.8]} c={gold}/></group>;
  if(kind==='network')return <group><Block s={[1.6,.95,.8]} c={color}/><mesh position={[0,.7,0]} rotation={[0,Math.PI/4,0]}><coneGeometry args={[1.18,.53,4]}/><meshStandardMaterial color={ink}/></mesh><Block p={[0,-.22,.42]} s={[.44,.5,.06]} c={ink}/>{[-.54,.54].map(x=><Block key={x} p={[x,.13,.43]} s={[.22,.22,.03]} c={right?'#ccebb2':'#e4c286'} emissive/>)}</group>;
  return <group><Block s={[1.92,1.4,.35]} c={steel}/><Cylinder p={[0,0,.23]} r={.6} h={.14} c={ink} rotation={[Math.PI/2,0,0]}/><Hoop p={[0,0,.33]} r={.5} c={color}/><Hoop p={[0,0,.35]} r={.3} c={gold}/>{[-.4,.4].map(y=><Block key={y} p={[0,y,.39]} s={[1.6,.08,.08]} c={gold}/>)}<Cylinder p={[0,0,.46]} r={.12} h={.25} c={color} rotation={[Math.PI/2,0,0]}/></group>;
}

function TargetVaultScene(p:SceneProps) {
  const beam=useRef<Mesh>(null!),turret=useRef<Group>(null!);const {reducedMotion}=useStageQuality();
  useFrame((_,dt)=>{if(turret.current)turret.current.rotation.z=MathUtils.damp(turret.current.rotation.z,-(p.selected?.[0]??0)*.16,10,dt);if(beam.current){const t=timeProgress(p.move,850,reducedMotion);beam.current.visible=p.move?.type==='commit'&&t<1;beam.current.scale.y=Math.max(.02,Math.sin(t*Math.PI));}});
  return <><Block p={[0,.3,-.8]} s={[7.8,4.5,.5]} c="#2a3948"/>{[-3.95,3.95].map(x=><Block key={x} p={[x,.25,-.4]} s={[.2,4.6,.35]} c={gold}/>)}<group ref={turret} position={[0,-2,1]}><Cylinder r={.43} h={.22} c={gold}/><Block p={[0,.33,0]} s={[.45,.62,.5]} c={steel}/><Cylinder p={[0,.7,0]} r={.15} h={.55} c={p.color}/><mesh ref={beam} position={[0,1.7,0]} visible={false}><cylinderGeometry args={[.025,.045,2.2,6]}/><meshBasicMaterial color="#eee3b7" transparent opacity={.8}/></mesh></group></>;
}
function JunctionScene(p:SceneProps) {
  const tram=useRef<Group>(null!),points=useRef<Group>(null!);const {reducedMotion}=useStageQuality();
  const spread=p.columns===2?1.65:2.7;
  const chosenIndex=(p.move?.to[0]??0)<0?0:1;
  const correct=p.move?.type==='commit'&&p.items[chosenIndex]?.state==='right';
  useFrame((_,dt)=>{const t=timeProgress(p.move,1800,reducedMotion)*(correct?1:.7),go=p.move?.type==='commit';const branch=p.move?.to[0]??p.selected?.[0]??0;if(tram.current){tram.current.position.set(go?branch*t*t:0,-1.6,go?2.5-t*4.3:2.5);tram.current.rotation.y=go?-branch*.15*t:0;}if(points.current){const a=(p.selected?.[0]??0)*.13;points.current.rotation.y=reducedMotion?a:MathUtils.damp(points.current.rotation.y,a,8,dt);}});
  return <><Block p={[0,-2.02,0]} s={[spread*2+2,.24,6]} c="#929089"/><RailBallast width={spread*2+.4}/>
    {[-1,1].map((side,i)=><group key={side}>
      <Block p={[side*(spread+.7),-1.72,-.65]} s={[1.05,.4,3.9]} c="#b9afa0"/>
      <Block p={[side*(spread+.24),-1.505,-.65]} s={[.065,.025,3.9]} c="#e6bd70"/>
      {[-1.9,-.7,.5].map(z=><Block key={z} p={[side*(spread+.72),-1.502,z]} s={[.98,.015,.025]} c="#7d7974"/>)}
      {[-.2,.2].map(offset=><Rail key={offset} points={[[offset,-1.8,3],[offset,-1.8,1],[side*spread*.46+offset,-1.8,-.1],[side*spread+offset,-1.8,-2.1]]}/>)}
      {[-1.8,-1,-.2,.6,1.4,2.2].map(z=><Block key={z} p={[side*(2.2-z)*spread/6.8,-1.83,z]} s={[.8,.05,.1]} c="#695d51"/>)}
      <Cylinder p={[side*(spread-.48),-.95,-1.15]} r={.055} h={1.7} c="#b7c6c5"/>
      <Block p={[side*(spread-.48),-.02,-1.15]} s={[.26,.55,.2]} c="#405566"/>
      <Orb p={[side*(spread-.48),.1,-1]} r={.075} c={p.move?.type==='commit'&&chosenIndex===i?(correct?'#a8efc0':'#ef9b91'):'#e5c378'}/>
      <Block p={[side*(spread+.7),.6,-2.05]} s={[.06,4.2,.06]} c="#aebbbc"/>
      <Block p={[side*(spread+.7),2.75,-2.05]} s={[1.15,.2,.85]} c="#566f80"/>
    </group>)}
    <RailwayBackdrop compact={p.columns===2}/><group ref={points} position={[0,-1.8,1]}><Block s={[.1,.07,1.25]} c={p.color}/></group><group ref={tram}><Train color="#c7d5c8"/></group><Block p={[0,-1.5,2.8]} s={[1.4,.12,.18]} c={gold}/></>;
}
function RailBallast({width}:{width:number}){
  const ref=useRef<InstancedMesh>(null!);const matrix=useMemo(()=>new Object3D(),[]);
  useLayoutEffect(()=>{for(let i=0;i<96;i++){matrix.position.set(((i*37)%97)/97*width-width/2,-1.875,((i*61)%97)/97*5.5-2.75);matrix.scale.set(.07+(i%3)*.025,.035,.06);matrix.rotation.y=i*.71;matrix.updateMatrix();ref.current.setMatrixAt(i,matrix.matrix);}ref.current.instanceMatrix.needsUpdate=true;},[width,matrix]);
  return <instancedMesh ref={ref} args={[undefined,undefined,96]}><dodecahedronGeometry args={[1,0]}/><meshStandardMaterial color="#bbb3a4" roughness={1}/></instancedMesh>;
}
function RailwayBackdrop({compact}:{compact:boolean}){
  return <group position={[0,.6,-3.6]}>{[-2,-1,0,1,2].map((n,i)=><group key={n} position={[n*(compact?1.15:1.5),0,0]}>
    <Block p={[0,i%2*.28,0]} s={[compact?.95:1.2,2.4+i%3*.45,.7]} c={i%2?'#627886':'#779095'}/>
    <mesh position={[0,1.4+(i%3)*.25,0]} rotation={[0,Math.PI/4,0]}><coneGeometry args={[compact?.76:.92,.5,4]}/><meshStandardMaterial color="#3d596f"/></mesh>
    {[-.27,.27].map(x=>[-.35,.25,.85].map(y=><Block key={x+','+y} p={[x,y,.36]} s={[.17,.28,.025]} c="#e6cda0" emissive/>))}
  </group>)}</group>;
}
function ReactorScene(p:SceneProps) {
  const core=useRef<Group>(null!);const {reducedMotion}=useStageQuality();
  useFrame((state,dt)=>{if(!core.current)return;core.current.rotation.y=reducedMotion?0:state.clock.elapsedTime*.2;const charged=p.move?.type==='commit'?1.15:1+Math.max(0,p.signal)*.15;const s=MathUtils.damp(core.current.scale.x,charged,5,dt);core.current.scale.setScalar(s);});
  return <><Cylinder p={[0,-1.7,-.7]} r={1.1} h={.45} c={gold}/><group ref={core} position={[0,.35,-1]}><Orb r={.62} c={p.color}/>{[0,1,2].map(i=><Hoop key={i} r={.88+i*.06} c={i===1?gold:p.color} rotation={[i*Math.PI/3,Math.PI/5,0]}/>)}</group>{[-2.65,2.65].map(x=><Lead key={x} from={[x,-.9,-.2]} to={[0,-1.3,-.7]} color={p.color}/>)}<Cylinder p={[0,-.6,-1]} r={.13} h={1.2} c={gold}/></>;
}
function DealerScene(p:SceneProps) {
  const card=useRef<Group>(null!);const {reducedMotion}=useStageQuality();
  useFrame(()=>{if(!card.current)return;const t=timeProgress(p.move,1000,reducedMotion);card.current.position.set(p.move?.type==='commit'?t*3:-3+t*.3,-1.8+(p.move?.type==='ready'?Math.sin(t*Math.PI):0),1);card.current.rotation.z=p.move?.type==='commit'?-t*.5:.1;});
  return <><mesh position={[0,-2.2,0]} scale={[1.5,1,1]}><cylinderGeometry args={[3,3,.26,48]}/><meshStandardMaterial color="#25463f" roughness={.95}/></mesh><Hoop p={[0,-2.02,0]} r={3} c={gold} rotation={[-Math.PI/2,0,0]}/>{Array.from({length:4},(_,i)=><Block key={i} p={[-3,-1.99+i*.04,1]} s={[.7,.035,1]} c={i%2?p.color:'#e5dac0'}/>)}<group ref={card}><Block s={[.7,.04,1]} c="#eee1be"/><Hoop p={[0,.06,0]} r={.2} c={p.color} rotation={[-Math.PI/2,0,0]}/></group><Block p={[3,-1.9,1]} s={[1,.12,1.4]} c={gold}/></>;
}
function MemoryScene(p:SceneProps) {
  const paired=p.items.filter(i=>i.state==='right');
  const links=solvedCircuitPairs(p.items).map(([id,partner])=>({id,from:machinePosition('memory',p.items.findIndex(it=>it.id===id),p.items.length,p.columns),to:partner?machinePosition('memory',p.items.findIndex(it=>it.id===partner),p.items.length,p.columns):[0,-1.9,.2] as V3}));
  return <><Block p={[0,.25,-.5]} s={[7.4,4.6,.4]} c="#1b3443"/>{[-3.8,3.8].map(x=><Block key={x} p={[x,.25,-.5]} s={[.15,4.7,.7]} c={gold}/>)}{links.map(link=><Lead key={link.id} from={link.from} to={link.to} color="#9de7bc"/>)}<Block p={[0,-1.9,.2]} s={[7,.12,.2]} c={paired.length?p.color:steel} emissive={paired.length>0}/></>;
}
function NetworkScene(p:SceneProps) {
  const van=useRef<Group>(null!);const {reducedMotion}=useStageQuality();
  useFrame(()=>{if(!van.current)return;const t=timeProgress(p.move,1000,reducedMotion);const from=p.move?.from??[0,-1.8,1],to=p.move?.to??from;van.current.position.set(MathUtils.lerp(from[0],to[0],t),-1.8,MathUtils.lerp(1,to[2],t));});
  return <><Block p={[0,-2.1,0]} s={[8,.2,5]} c="#344545"/><Block p={[0,-1.97,0]} s={[7.5,.025,.9]} c="#1d2a35"/>{[-3,-2,-1,0,1,2,3].map(x=><Block key={x} p={[x,-1.95,0]} s={[.35,.01,.035]} c="#d8ca9f"/>)}<group ref={van}><Block s={[.7,.35,.4]} c={gold}/><Block p={[.23,.1,0]} s={[.3,.45,.42]} c={p.color}/></group>{p.items.filter(it=>it.state==='right').slice(0,6).map((it,i)=><Lead key={it.id} from={[i%3*2.25-2.25,.2,0]} to={[0,-1.7,0]} color="#9adcc0"/>)}</>;
}
function CraneScene(p:SceneProps) {
  const carriage=useRef<Group>(null!),load=useRef<Group>(null!);const {reducedMotion}=useStageQuality();
  useFrame((_,dt)=>{const t=timeProgress(p.move,1200,reducedMotion),moving=p.move?.type==='place';const target=moving?p.move!.to:p.selected??[0,-.9,.5];if(carriage.current)carriage.current.position.x=MathUtils.damp(carriage.current.position.x,target[0],8,dt);if(load.current){load.current.visible=!!p.selected||!!moving&&t<1;const from=p.move?.from??target;load.current.position.set(moving?MathUtils.lerp(from[0],target[0],t):target[0],moving?MathUtils.lerp(from[1],target[1],t)+Math.sin(t*Math.PI)*1.4:target[1]+.5,moving?MathUtils.lerp(from[2],target[2],t):target[2]+.25);}});
  return <><Block p={[0,1.08,-1.3]} s={[7.5,2.1,.5]} c="#35514c"/><Block p={[0,2.35,-.8]} s={[8,.3,.8]} c={gold}/>{[-3.8,3.8].map(x=><Block key={x} p={[x,.25,-.7]} s={[.23,4.5,.23]} c={gold}/>)}<group ref={carriage} position={[0,2.45,0]}><Block s={[.75,.36,.6]} c={p.color}/><Cylinder p={[0,-.65,0]} r={.025} h={1.25} c="#dad8bb"/><Hoop p={[0,-1.35,0]} r={.13} c={gold}/></group><group ref={load}><Block s={[.6,.46,.46]} c={gold}/><Block p={[0,0,.24]} s={[.5,.05,.025]} c={p.color}/></group><Block p={[0,-1.6,1]} s={[7.5,.2,1.8]} c="#655746"/></>;
}
function GalleryScene(p:SceneProps) {
  return <><Block p={[0,.15,-1.1]} s={[8,4.4,.28]} c="#4a4a4b"/>{[-3.8,0,3.8].map(x=><group key={x}><Cylinder p={[x,.1,-.6]} r={.2} h={4.5} c="#cbb993"/><Block p={[x,2.2,-.6]} s={[.55,.16,.55]} c={gold}/></group>)}<Block p={[0,-1.9,.5]} s={[1.7,.12,1.4]} c={gold}/><Block p={[0,-1.76,.5]} s={[1.1,.06,.7]} c="#eee0bf"/>{[-.35,0,.35].map(x=><Block key={x} p={[x,-1.7,.6]} s={[.16,.015,.5]} c={p.color}/>)}</>;
}
function RadioScene(p:SceneProps) {
  const dish=useRef<Group>(null!),dial=useRef<Group>(null!);const {reducedMotion}=useStageQuality();
  useFrame((state,dt)=>{if(dish.current)dish.current.rotation.y=MathUtils.damp(dish.current.rotation.y,(p.selected?.[0]??0)*.22,8,dt);if(dial.current)dial.current.rotation.z=reducedMotion?0:p.signal>0?Math.sin(state.clock.elapsedTime*5)*.6:-.6;});
  return <><Cylinder p={[0,.1,-1]} r={.1} h={2.7} c={gold}/><group ref={dish} position={[0,1.65,-1]}><mesh rotation={[Math.PI/2.5,0,0]}><sphereGeometry args={[1.05,24,12,0,Math.PI*2,0,Math.PI/2]}/><meshStandardMaterial color="#bdc9c4" metalness={.65} roughness={.25} side={2}/></mesh><Cylinder p={[0,.3,.65]} r={.04} h={1.1} c={gold} rotation={[Math.PI/2.5,0,0]}/><Orb p={[0,.55,1.1]} r={.1} c={p.color}/></group><Block p={[0,-1.9,1]} s={[3,.5,.8]} c="#66553f"/><group ref={dial} position={[0,-1.85,1.43]}><Hoop r={.3} c={p.color}/><Block p={[0,.12,0]} s={[.03,.3,.04]} c={gold}/></group>{[-1,1].map(x=><Hoop key={x} p={[x,-1.85,1.43]} r={.26} c={gold}/>)}</>;
}
function MuseumScene(p:SceneProps) {
  const left=useRef<Group>(null!),right=useRef<Group>(null!);const {reducedMotion}=useStageQuality();
  useFrame((_,dt)=>{const opened=p.signal>0;if(left.current)left.current.rotation.y=reducedMotion?(opened?-1.4:0):MathUtils.damp(left.current.rotation.y,opened?-1.4:0,6,dt);if(right.current)right.current.rotation.y=reducedMotion?(opened?1.4:0):MathUtils.damp(right.current.rotation.y,opened?1.4:0,6,dt);});
  return <><Block p={[0,.8,-.85]} s={[2.65,2.35,.22]} c={gold}/><Block p={[0,.8,-.7]} s={[2.4,2.12,.035]} c="#bac5c0"/><group ref={left} position={[-1.2,.8,-.58]}><Block p={[.6,0,0]} s={[1.2,2.1,.075]} c="#41555b"/>{[-.8,-.4,0,.4,.8].map(y=><Block key={y} p={[.6,y,.05]} s={[1.1,.055,.03]} c={gold}/>)}</group><group ref={right} position={[1.2,.8,-.58]}><Block p={[-.6,0,0]} s={[1.2,2.1,.075]} c="#41555b"/>{[-.8,-.4,0,.4,.8].map(y=><Block key={y} p={[-.6,y,.05]} s={[1.1,.055,.03]} c={gold}/>)}</group><Block p={[0,-.7,-.8]} s={[.2,1,.2]} c={gold}/><Block p={[0,-1.4,-.8]} s={[2,.2,1]} c={steel}/></>;
}
function StudioScene(p:SceneProps) {
  const needle=useRef<Group>(null!);const {reducedMotion}=useStageQuality();
  useFrame((state)=>{if(needle.current)needle.current.scale.y=p.signal>0&&!reducedMotion?.65+Math.sin(state.clock.elapsedTime*8)*.3:.08;});
  return <><Block p={[0,-.65,-.4]} s={[.8,.15,.8]} c={gold}/><Cylinder p={[0,.03,-.4]} r={.06} h={1.3} c="#b1c2c3"/><mesh position={[0,1,-.4]}><capsuleGeometry args={[.34,.62,6,16]}/><meshStandardMaterial color="#b7c9c9" metalness={.8} roughness={.25}/></mesh>{[-.3,-.15,0,.15,.3].map(y=><Hoop key={y} p={[0,1+y,-.4]} r={.35} rotation={[Math.PI/2,0,0]} c={ink}/>)}<Hoop p={[0,1,-.1]} r={.58} c={gold}/><Block p={[0,2.1,-.9]} s={[2,.55,.14]} c={p.signal>0?'#d3737a':ink} emissive={p.signal>0}/><group ref={needle} position={[1.2,.6,-.2]}><Block s={[.16,1.4,.2]} c={p.color} emissive/></group><Block p={[0,-2.35,.7]} s={[8,.2,2]} c="#465454"/></>;
}
function PatchbayScene(p:SceneProps) {
  return <><Block p={[0,.15,-.45]} s={[7.2,4.5,.35]} c="#233c46"/>{[-3.5,3.5].map(x=><Block key={x} p={[x,.15,-.2]} s={[.15,4.4,.2]} c={gold}/>)}{p.selected&&<Lead from={p.selected} to={[.3,-.7,.4]} color={p.color}/>} {p.slots.slice(0,3).filter(s=>s.state==='right').map((s,i)=><Lead key={s.id} from={[-2.4,(1-i)*1.5,0]} to={[2.4,(1-i)*1.5,0]} color="#99e2bd"/>)}<Block p={[0,-2.25,.1]} s={[6,.15,.4]} c={gold}/></>;
}
function FreightScene(p:SceneProps) {
  const locomotive=useRef<Group>(null!);const {reducedMotion}=useStageQuality();
  useFrame(()=>{if(!locomotive.current)return;const t=timeProgress(p.move,1800,reducedMotion);locomotive.current.position.set(-3.5+(p.move?.type==='action'?t*7:0),-1.55,.6);});
  return <>{[-.7,.7].map(y=><group key={y}>{[-.32,.32].map(z=><Block key={z} p={[0,y-1,z+(y<0?.6:-.5)]} s={[8,.05,.055]} c="#c8bda1"/>)}{[-3,-2,-1,0,1,2,3].map(x=><Block key={x} p={[x,y-1.02,y<0?.6:-.5]} s={[.12,.06,.9]} c="#786247"/>)}</group>)}<group ref={locomotive}><Train color={p.color}/></group><Block p={[0,2,-1]} s={[7.5,.2,.5]} c={gold}/>{[-3.8,3.8].map(x=><Block key={x} p={[x,.2,-1]} s={[.15,3.6,.15]} c={steel}/>)}{p.slots.slice(1,3).map((s,i)=><Lead key={s.id} from={[-2.1+i*2.25,-.95,.4]} to={[-.5+i*2.25,-.95,.4]} color={gold}/>)}</>;
}
function SentenceScene(p:SceneProps) {return <><FreightScene {...p}/><Block p={[0,2.15,-.4]} s={[7.7,.75,.25]} c="#274856"/><Block p={[0,2.55,-.4]} s={[8,.12,.5]} c={gold}/>{[-3.7,3.7].map(x=><Orb key={x} p={[x,2.15,-.2]} r={.13} c={p.color}/>)}<Cylinder p={[3.5,-1.1,.5]} r={.08} h={1.4} c={gold}/><Orb p={[3.5,-.35,.5]} r={.19} c={p.success?'#91dbb9':'#d6b579'}/></>;}
const scenes={target:TargetVaultScene,junction:JunctionScene,reactor:ReactorScene,dealer:DealerScene,memory:MemoryScene,network:NetworkScene,crane:CraneScene,gallery:GalleryScene,radio:RadioScene,museum:MuseumScene,studio:StudioScene,patch:PatchbayScene,freight:FreightScene,sentence:SentenceScene};
export function BespokeScene(props:SceneProps){const Scene=scenes[props.kind];return <Scene {...props}/>;}
