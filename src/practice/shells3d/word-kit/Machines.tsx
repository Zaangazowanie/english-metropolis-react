import {useLayoutEffect,useMemo,useRef} from 'react';
import {useFrame} from '@react-three/fiber';
import {Color,Object3D} from 'three';
import type {Group,InstancedMesh} from 'three';
import {useStageQuality} from '../kit/CityStage';
import {Bajla} from '../kit/Bajla';
import {Rail} from './Stage';
import type {Point} from './Stage';
const INK='#080c2c',STEEL='#215aff',BRASS='#ffbd00',GLOW='#ff7400';
type DetailBlock={at:Point;size:Point;color:string;angle?:number};
/** Repeated hardware and architecture share one draw call, even on the dense letter boards. */
function DetailBatch({blocks,glow=.18}:{blocks:DetailBlock[];glow?:number}){
 const mesh=useRef<InstancedMesh>(null);const scratch=useMemo(()=>({object:new Object3D(),color:new Color()}),[]);
 useLayoutEffect(()=>{if(!mesh.current)return;blocks.forEach((block,i)=>{scratch.object.position.set(...block.at);scratch.object.scale.set(...block.size);scratch.object.rotation.set(0,0,block.angle??0);scratch.object.updateMatrix();mesh.current!.setMatrixAt(i,scratch.object.matrix);mesh.current!.setColorAt(i,scratch.color.set(block.color));});mesh.current.instanceMatrix.needsUpdate=true;if(mesh.current.instanceColor)mesh.current.instanceColor.needsUpdate=true;mesh.current.computeBoundingSphere();},[blocks,scratch]);
 return <instancedMesh ref={mesh} args={[undefined,undefined,blocks.length]}><boxGeometry/><meshStandardMaterial roughness={.25} metalness={.25} emissive="#3164ff" emissiveIntensity={glow}/></instancedMesh>;
}
type DistrictKind='crossword'|'rooftops'|'foundry'|'cargo'|'vault'|'sorting'|'rescue'|'switchyard'|'bridge'|'repair'|'transfer'|'sound'|'telegraph'|'morphology';
export function DistrictDetails({kind,width=10,height=8,accent='#00dfff'}:{kind:DistrictKind;width?:number;height?:number;accent?:string}){
 const blocks=useMemo(()=>{
  const out:DetailBlock[]=[];const add=(x:number,y:number,z:number,w:number,h:number,d:number,color=accent,angle=0)=>out.push({at:[x,y,z],size:[w,h,d],color,angle});
  const stripe=(x:number,y:number,count:number,horizontal=true)=>{for(let i=0;i<count;i++)add(x+(horizontal?i*.3:0),y+(horizontal?0:i*.3),-.72,.17,.11,.05,i%2?'#ffcc00':'#172453',-.5);};
  const circuit=(x:number,y:number,w:number,h:number,color=accent)=>{add(x,y,-.94,w,.035,.035,color);add(x+w/2,y+h/2,-.94,.035,h,.035,color);add(x+w/2,y+h,-.88,.14,.14,.06,'#ffce00');};
  if(kind==='crossword'||kind==='rooftops'){
   const edge=width/2-.5;
   for(const side of [-1,1])for(let level=0;level<7;level++){
    const y=(level-3)*height*.1;
    add(side*edge,y,-.26,.55,.58,.65,level%2?'#7424ff':'#0068e8');
    for(let row=0;row<3;row++)for(let col=0;col<2;col++)add(side*edge+(col-.5)*.2,y+(row-1)*.16,.085,.085,.085,.025,(row+level)%3===0?'#ff28ba':'#00ecff');
    add(side*edge,y+.3,.11,.63,.045,.05,'#ffcc00');
    if(level%2===0){add(side*edge,y+.48,.03,.04,.28,.06,accent);add(side*edge+.1,y+.5,.03,.22,.025,.06,accent);}
   }
   for(let i=0;i<10;i++)add((i-4.5)*width*.08,-height/2+.2,-.8,.28,.065,.04,i%2?'#ffce00':'#00e7ff');
  }else if(kind==='foundry'||kind==='morphology'){
   for(const side of [-1,1]){
    add(side*4.95,1.2,-.2,.12,3.8,.16,kind==='foundry'?'#ff6c00':'#00dfff');
    for(let i=0;i<5;i++)add(side*4.95,i*.68-.2,-.1,.28,.075,.23,'#ffce00');
    for(let i=0;i<4;i++)add(side*4.6,-3.5+i*.2,-.55,.5,.065,.12,i%2?accent:'#ff4a00');
   }
   stripe(-3.6,-.38,25);
   for(let i=0;i<12;i++)add((i-5.5)*.6,3.57,.09,.38,.065,.09,i%3===0?'#ff2b5c':'#ffce00');
   if(kind==='morphology')for(let i=0;i<6;i++)circuit((i-2.5)*1.3,-4.8,.75,.4,i%2?'#00deff':'#ff27bd');
  }else if(kind==='cargo'){
   for(const side of [-1,1])for(let row=0;row<3;row++){
    add(side*4.9,-2+row*.85,-.55,.7,.7,.6,row%2?'#007aff':'#ff2f9e');
    for(let slat=0;slat<3;slat++)add(side*4.9+(slat-1)*.16,-2+row*.85,-.22,.045,.62,.025,'#ffce00');
   }
   stripe(-4.5,-3.7,31);circuit(-2.4,3.1,3.4,-.4);circuit(2.4,3.1,3.4,-.4);
  }else if(kind==='vault'){
   for(const side of [-1,1]){circuit(side*3.5,.35,1.9,2.7);for(let i=0;i<6;i++)add(side*3.5+(i%3-1)*.53,2.65+Math.floor(i/3)*.34,-.45,.42,.22,.38,i%2?'#ff9c00':'#ffcf00');}
   for(let i=0;i<13;i++){add((i-6)*.31,2.45,-.1,.07,.2,.08,i%3===0?'#ff27bc':'#00e4ff');add((i-6)*.31,-.9,-.1,.07,.1,.08,'#ffcf00');}
   stripe(-4.4,-2.5,30);
  }else if(kind==='sorting'){
   for(const side of [-1,1]){stripe(side*4.6,-3.45,9,false);add(side*4.98,-2.1,-.65,.33,2.8,.6,'#7521ff');for(let i=0;i<6;i++)add(side*4.98,-3.15+i*.4,-.29,.2,.07,.045,'#00e1ff');}
   for(let i=0;i<12;i++)add((i-5.5)*.65,2.67,-.6,.4,.055,.07,i%2?'#ffce00':'#ff2a97');
  }else if(kind==='rescue'){
   for(let i=0;i<9;i++){add(-4.2,-3.5+i*.82,-.82,1.4,.055,.06,'#ffb900');add(-5.32,-3.2+i*.74,-.62,.09,.35,.12,i%2?'#00f0ac':'#ffcc00');}
   for(let i=0;i<7;i++){add(4.88,-3.8+i*1.14,-.78,.35,.87,.22,i%2?'#5219c4':'#0c62cc');add(4.88,-3.55+i*1.14,-.63,.15,.24,.06,'#ff49bd');}
   stripe(-3.5,-3.8,28);
  }else if(kind==='switchyard'){
   const count=Math.max(2,Math.min(5,Math.round((height-1)/1.65)));for(let line=0;line<count;line++)for(let sleeper=0;sleeper<12;sleeper++)add((sleeper-5.5)*.44,((count-1)/2-line)*1.65,-.61,.12,.54,.08,sleeper%2?'#6630e3':'#25428d');
   for(const side of [-1,1]){add(side*3.5,height/2-.22,-.54,3.2,.25,.65,side>0?'#ff339b':'#007cff');for(let i=0;i<7;i++)add(side*3.5+(i-3)*.35,height/2-.08,-.19,.18,.035,.07,'#00e8ff');}
  }else if(kind==='bridge'){
   for(let row=0;row<4;row++)for(let i=0;i<9;i++)add((i-4)*1.04+row%2*.4,-1.55-row*.4,-.86,.43+(i%3)*.1,.035,.035,(i+row)%3===0?'#ff39ac':'#00dfff');
   for(const side of [-1,1]){for(let i=0;i<5;i++)add(side*4.5,-.6+i*.75,-.45,.16,.16,.1,'#ffbf00');stripe(side*4.2,-1.25,5,false);}
  }else if(kind==='repair'){
   for(const side of [-1,1]){for(let i=0;i<6;i++)add(side*5.1,-2+i*.78,-.17,.15,.22,.12,i%2?'#ffce00':'#00ecff');add(side*5.87,.3,-.47,.2,3,.25,'#ff35b0');}
   for(let i=0;i<8;i++){add((i-3.5)*.5,2.7,-.32,.29,.3,.2,['#00dcff','#ff16a5','#ffdd00','#391ac4'][i%4]);}
  }else if(kind==='transfer'){
   for(const side of [-1,1])for(let i=0;i<16;i++){const a=i*Math.PI/8;add(side*3.6+Math.cos(a)*1.43,.85+Math.sin(a)*1.43,-.22,.1,.17,.16,i%2?'#ffbf00':side<0?'#ff29b8':'#00dcff',a);}
   for(let i=0;i<15;i++)add((i-7)*.65,-2.43,-.31,.32,.05,.1,i%3===0?'#ffcc00':'#00e7ff');
   circuit(-2.5,2.8,4.3,-.5,'#ff20b0');circuit(2.5,2.8,4.3,-.5,'#00dfff');
  }else if(kind==='sound'){
   for(let i=0;i<23;i++)add((i-11)*.34,2.61+((i*7)%5)*.04,-.14,.12,.15+((i*7)%5)*.12,.14,i%3===0?'#ff21bb':'#00e3ff');
   for(const side of [-1,1])for(let row=0;row<3;row++)for(let col=0;col<3;col++)add(side*4.6+(col-1)*.17,-.35+row*.32,-.1,.09,.19,.07,'#ffbb00');
  }else if(kind==='telegraph'){
   for(const side of [-1,1])for(let coil=0;coil<11;coil++)add(side*4.1+(coil-5)*.07,-2.7,-.12,.028,.62,.35,'#ffbe00');
   for(let i=0;i<12;i++)add((i-5.5)*.4,2.58,-.61,.23,.07,.08,i%3===0?'#ff21a8':'#00e8ff');
   for(let i=0;i<5;i++)circuit(-3.5+i*1.5,-3.34,.65,.3,i%2?'#ff3fa8':'#00dfff');
  }
  return out;
 },[kind,width,height,accent]);
 return <DetailBatch blocks={blocks}/>;
}
export function Block({at,size,color=STEEL,metal=.45,glow=0}:{at:Point;size:Point;color?:string;metal?:number;glow?:number}){return <mesh position={at}><boxGeometry args={size}/><meshStandardMaterial color={color} metalness={metal} roughness={.24} emissive={color} emissiveIntensity={Math.max(.08,glow)}/></mesh>;}
function Wheel({at,r=.3,color=BRASS}:{at:Point;r?:number;color?:string}){return <mesh position={at} rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[r,r,.18,16]}/><meshStandardMaterial color={color} metalness={.7} roughness={.3}/></mesh>;}
export function Rivets({width,y,z=-.45}:{width:number;y:number;z?:number}){const blocks=useMemo(()=>Array.from({length:Math.ceil(width)},(_,i)=>({at:[-width/2+i+.5,y,z] as Point,size:[.09,.09,.06] as Point,color:i%2?'#00e5ff':'#ffcf00'})),[width,y,z]);return <DetailBatch blocks={blocks}/>;}
/** A physical state indicator: lit ticks and a needle reflect the controller's real progress. */
export function InstrumentDial({at,fraction,radius=.4,color='#00e5ff'}:{at:Point;fraction:number;radius?:number;color?:string}){
 const needle=useRef<Group>(null);const {reducedMotion}=useStageQuality();const fill=Math.max(0,Math.min(1,Number.isFinite(fraction)?fraction:0));
 const angle=Math.PI*.8-fill*Math.PI*1.6;
 const ticks=useMemo(()=>Array.from({length:13},(_,i)=>{const a=Math.PI*1.3-i*Math.PI*1.6/12;return {at:[Math.cos(a)*radius*.78,Math.sin(a)*radius*.78,.06] as Point,size:[radius*.12,radius*.22,.04] as Point,color:i/12<=fill?color:'#303971',angle:a-Math.PI/2};}),[fill,radius,color]);
 useFrame((_,dt)=>{if(needle.current)needle.current.rotation.z+=(angle-needle.current.rotation.z)*(reducedMotion?1:1-Math.exp(-dt*10));});
 return <group position={at}>
  <mesh rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[radius,radius,.09,24]}/><meshStandardMaterial color={INK} metalness={.55} roughness={.3}/></mesh>
  <mesh position={[0,0,.015]}><torusGeometry args={[radius,.045,6,24]}/><meshStandardMaterial color={BRASS} metalness={.75} roughness={.23}/></mesh>
  <DetailBatch blocks={ticks} glow={.3}/>
  <group ref={needle} rotation={[0,0,angle]}><Block at={[0,radius*.29,.12]} size={[.045,radius*.62,.05]} color={fill>=1?'#00ffb0':'#ff44ae'} glow={.5}/></group>
  <mesh position={[0,0,.14]}><sphereGeometry args={[.065,8,6]}/><meshStandardMaterial color={BRASS} metalness={.8}/></mesh>
 </group>;
}
export function ForgePress({load,commit=0}:{load:number;commit?:number}){
 const piston=useRef<Group>(null);const {reducedMotion}=useStageQuality();const started=useRef(-1);const last=useRef(commit);
 useFrame((state)=>{if(last.current!==commit){last.current=commit;started.current=state.clock.elapsedTime;}const t=state.clock.elapsedTime-started.current;const stroke=started.current>=0&&t<.8?Math.sin(t/.8*Math.PI):0;if(piston.current)piston.current.position.y=reducedMotion?0:-stroke*1.3;});
 return <group>
  <Block at={[0,1,-.9]} size={[9,2,.55]} color="#351064"/><Block at={[0,-.1,-.4]} size={[9.7,.35,1.1]} color="#1459dc"/>
  {[-4.6,4.6].map(x=><group key={x}><Block at={[x,1.8,-.4]} size={[.42,4.7,.8]}/><Block at={[x,3.6,.05]} size={[.63,.18,.17]} color={BRASS}/><Block at={[x,-.3,.1]} size={[.85,.3,1.2]} color={INK}/></group>)}
  <InstrumentDial at={[-4.25,3.88,.17]} fraction={load} radius={.3} color="#ffbf00"/><Block at={[0,3.9,-.45]} size={[10,.65,1]} color="#e8340a"/><Rivets width={9} y={3.9} z={.1}/>
  <group ref={piston}><Block at={[0,3.0,-.2]} size={[.6,1.6,.5]} color="#40dcff"/><Block at={[0,2.35,.1]} size={[7.6,.3,.9]} color="#ff9200"/><Block at={[0,2.13,.42]} size={[7.3,.1,.12]} color={GLOW} glow={load*.7}/></group>
  {Array.from({length:8},(_,i)=><Block key={i} at={[-3.5+i,-.02,.25]} size={[.38,.07,.06]} color={GLOW} glow={load}/>) }
 </group>;
}
export function LiftTower({progress,lives}:{progress:number;lives:number}){
 const carriage=useRef<Group>(null);const {reducedMotion}=useStageQuality();const y=-3+progress*6.4;const origin=useRef<Point>([0,y,.25]);
 useFrame((_,dt)=>{if(carriage.current)carriage.current.position.y+=(y-carriage.current.position.y)*(reducedMotion?1:1-Math.exp(-dt*5));});
 return <group position={[-4.2,0,-.15]}>
  {[-.8,.8].map(x=><group key={x}><Block at={[x,0,-.5]} size={[.18,8,.3]} color="#6555ff"/>{Array.from({length:5},(_,i)=><Rail key={i} from={[x,-3.5+i*1.4,-.35]} to={[-x,-2.1+i*1.4,-.35]} color="#1c7df7" thick={.1}/>)}</group>)}
  <InstrumentDial at={[0,4.55,.16]} fraction={progress} radius={.35} color="#ffbf00"/><Block at={[0,4,-.3]} size={[2.3,.38,.8]} color={BRASS}/><Wheel at={[0,3.87,.15]} r={.45}/><Block at={[0,0,.1]} size={[.035,7.8,.035]} color="#20daff"/>
  <Block at={[0,-4,-.3]} size={[2.5,.4,1.1]} color="#14205b"/>
  <group ref={carriage} position={origin.current}><Block at={[0,-.12,0]} size={[1.4,.2,1]} color={BRASS}/><Block at={[0,.55,-.4]} size={[1.45,1.2,.15]} color="#8418e8"/><Bajla scale={.5} position={[0,.3,.1]} reducedMotion={reducedMotion} variant={progress>=1?'celebrate':'idle'}/>{[-.7,.7].map(x=><Block key={x} at={[x,.45,.18]} size={[.1,1.05,.1]} color={BRASS}/>)}</group>
  {Array.from({length:6},(_,i)=><Block key={i} at={[-1.24,-3+i*.33,.1]} size={[.2,.21,.09]} color={i<lives?'#00ef9a':'#671438'} glow={i<lives?.5:0}/>)}
 </group>;
}
export function VaultCabinet({open,route}:{open:boolean;route:'known'|'review'|null}){
 const door=useRef<Group>(null);const {reducedMotion}=useStageQuality();
 useFrame((_,dt)=>{if(door.current)door.current.rotation.y+=((open?-1.85:0)-door.current.rotation.y)*(reducedMotion?1:1-Math.exp(-dt*6));});
 return <group>
  <InstrumentDial at={[0,3.18,.14]} fraction={route?1:open?.5:0} radius={.42} color="#bb66ff"/><Block at={[0,.75,-.9]} size={[5,3.55,.9]} color="#6020e4"/><Block at={[0,.75,-.38]} size={[4.38,2.88,.16]} color="#08081d"/>
  {[-2.35,2.35].map(x=><Block key={x} at={[x,.75,-.16]} size={[.19,3.1,.15]} color={BRASS}/>)}
  <group ref={door} position={[-2.2,.75,-.1]}><Block at={[2.2,0,0]} size={[4.4,2.9,.23]} color="#7f1aff"/><Block at={[2.2,0,.14]} size={[3.95,2.43,.08]} color="#2d0c88"/><Wheel at={[2.2,0,.25]} r={.48}/><Rail from={[1.8,-.4,.32]} to={[2.6,.4,.32]} color={BRASS} thick={.08}/><Rail from={[1.8,.4,.32]} to={[2.6,-.4,.32]} color={BRASS} thick={.08}/></group>
  {[-3.5,3.5].map((x,i)=><group key={x}><Block at={[x,-1.75,-.65]} size={[2.5,1.4,1.1]} color={i?'#007e68':'#b811ba'}/><Block at={[x,-1.35,.0]} size={[1.95,.12,.12]} color={route===(i?'known':'review')?'#fff000':'#ff48d0'} glow={route===(i?'known':'review')?.7:.1}/></group>)}
 </group>;
}
export function Conveyor({destinations,selected}:{destinations:number;selected:boolean}){
 const rollers=useRef<Group>(null);const {reducedMotion}=useStageQuality();
 useFrame((_,dt)=>{if(!rollers.current||reducedMotion)return;for(const child of rollers.current.children)child.rotation.x+=dt*(selected?1:2);});
 return <group><InstrumentDial at={[0,3.12,.12]} fraction={selected?1:0} color="#00e5ff"/><Block at={[0,-2.2,-.7]} size={[9,2.8,.35]} color="#080d27"/>{[-1,1].map(s=><Block key={s} at={[s*4.65,-2.2,-.33]} size={[.22,3.15,.3]} color={BRASS}/>)}
  <group ref={rollers}>{Array.from({length:12},(_,i)=><mesh key={i} position={[-4.2+i*.76,-2.2,-.44]} rotation={[0,Math.PI/2,0]}><cylinderGeometry args={[.11,.11,2.7,8]}/><meshStandardMaterial color={i%2?'#1556bf':'#008dcc'} metalness={.5}/></mesh>)}</group>
  {Array.from({length:destinations},(_,i)=><group key={i} position={[(i-(destinations-1)/2)*3,1.7,-.4]}><Block at={[0,0,0]} size={[2.7,1.65,.75]} color="#5630d0"/><Block at={[0,-.21,.44]} size={[2.2,.54,.13]} color="#080d27"/><Block at={[0,.68,.5]} size={[2.5,.1,.15]} color={BRASS}/></group>)}
 </group>;
}
export function CargoCrane({target,loaded,count=8}:{target:number|null;loaded:number;count?:number}){
 const trolley=useRef<Group>(null);const {reducedMotion}=useStageQuality();const x=target===null?0:(target%4-1.5)*2.4;
 useFrame((_,dt)=>{if(trolley.current)trolley.current.position.x+=(x-trolley.current.position.x)*(reducedMotion?1:1-Math.exp(-dt*5));});
 return <group><InstrumentDial at={[4.65,3.5,.1]} fraction={loaded/Math.max(1,count)} radius={.3}/><Block at={[0,3.5,-.4]} size={[11,.35,.5]} color={BRASS}/>{[-5.2,5.2].map(x=><group key={x}><Block at={[x,.3,-.5]} size={[.22,6.4,.4]}/><Rail from={[x,-2.8,-.35]} to={[x*.7,-2.8,-.35]} color={BRASS} thick={.2}/></group>)}
  <group ref={trolley}><Block at={[0,3.5,0]} size={[1,.5,.5]} color="#ff8100"/><Block at={[0,2.55,.1]} size={[.04,1.65,.04]} color="#57f4ff"/><mesh position={[0,1.75,.15]}><torusGeometry args={[.2,.05,7,12,Math.PI*1.4]}/><meshStandardMaterial color={BRASS} metalness={.6}/></mesh></group>
  {Array.from({length:Math.min(8,loaded)},(_,i)=><Block key={i} at={[-4.5+i*.3,-3.7,0]} size={[.17,.12,.1]} color="#00f0a3" glow={.6}/>)}
 </group>;
}
export function RailPlatforms({count=3,connected=0}:{count?:number;connected?:number}){
 return <group><InstrumentDial at={[0,count*.825,.18]} fraction={connected/Math.max(1,count)} radius={.38}/>{[-1,1].map(side=><group key={side} position={[side*3.5,0,-.7]}><Block at={[0,0,0]} size={[3.1,count*1.65+1,.4]} color="#182c76"/><Block at={[-side*1.5,0,.26]} size={[.11,count*1.65+1,.08]} color={BRASS}/>{Array.from({length:count+1},(_,i)=><Block key={i} at={[0,(count/2-i)*1.65,.26]} size={[3,.045,.04]} color="#176aff"/>)}</group>)}
  {Array.from({length:count},(_,i)=><group key={i}><Block at={[-1.25,((count-1)/2-i)*1.65-.4,0]} size={[.1,.75,.1]} color="#00d5ff"/><mesh position={[-1.25,((count-1)/2-i)*1.65,.1]}><sphereGeometry args={[.14,8,6]}/><meshStandardMaterial color="#ffcc00" emissive="#ffcc00" emissiveIntensity={.5}/></mesh></group>)}
 </group>;
}
export function BridgeStructure({count,completed}:{count:number;completed:number}){
 return <group><InstrumentDial at={[0,3.25,.1]} fraction={completed/Math.max(1,count)} radius={.4}/>{[-4.5,4.5].map(x=><group key={x}><Block at={[x,1,-.75]} size={[.3,5,.5]} color="#8221df"/><Block at={[x,3.55,-.65]} size={[.75,.35,.8]} color={BRASS}/></group>)}
  <Rail from={[-4.5,3.4,-.6]} to={[0,1.5,-.6]} color="#ff3dac" thick={.09}/><Rail from={[0,1.5,-.6]} to={[4.5,3.4,-.6]} color="#ff3dac" thick={.09}/>
  {Array.from({length:9},(_,i)=><Rail key={i} from={[-4+i,1.55+Math.abs(-4+i)*.4,-.65]} to={[-4+i,.75,-.65]} color="#16bbff" thick={.035}/>)}
  <Block at={[0,-2.3,-1.0]} size={[11,2.2,.15]} color="#004bbb" metal={.7}/><Block at={[0,-3.3,-.8]} size={[9*(completed/Math.max(1,count)),.06,.1]} color="#00ecdf" glow={.4}/>
 </group>;
}
export function SoundLock({slots,open,filled=0}:{slots:number;open:boolean;filled?:number}){
 return <group><InstrumentDial at={[0,2.58,.2]} fraction={open?1:filled/Math.max(1,slots)} radius={.34} color="#ffcc00"/><Block at={[0,.5,-.65]} size={[Math.min(10,slots*1.1+1.5),3.7,.75]} color="#a61adb"/><Block at={[0,.5,-.2]} size={[Math.min(9.6,slots*1.1+1.1),3.25,.13]} color="#151044"/>
  {[-4.3,4.3].map(x=><group key={x}><Wheel at={[x,-2.7,-.2]} r={.6}/><mesh position={[x,-2.7,-.08]}><torusGeometry args={[.36,.045,7,22]}/><meshStandardMaterial color={open?'#00ff9e':BRASS} emissive={open?'#00ff9e':BRASS} emissiveIntensity={.25}/></mesh></group>)}
  <Rivets width={8} y={2.16} z={-.04}/><Rivets width={8} y={-1.1} z={-.04}/>
 </group>;
}
export function PrintingPress({rows,pressed,selected=false}:{rows:number;pressed:boolean;selected?:boolean}){
 return <group><InstrumentDial at={[5.5,rows*.7+1,.3]} fraction={pressed?1:selected?.5:0} radius={.38} color="#ff35ba"/><Block at={[0,.5,-.7]} size={[12,Math.max(4,rows*1.4+1),.55]} color="#1249c7"/>{[-5.5,5.5].map(x=><group key={x}><Block at={[x,.5,-.24]} size={[.3,Math.max(4,rows*1.4+1),.3]} color={BRASS}/><Wheel at={[x,-rows*.7-1,.2]} r={.48}/></group>)}<Block at={[0,pressed?-.3:rows*.7+1,-.15]} size={[10.5,.32,.5]} color="#00c6ff"/><Rivets width={10} y={rows*.7+1} z={.13}/></group>;
}

export function TransferPortal({ready,done}:{ready:boolean;done:boolean}){
 const rotor=useRef<Group>(null);const {reducedMotion}=useStageQuality();
 useFrame((_,dt)=>{if(rotor.current&&!reducedMotion&&ready)rotor.current.rotation.z+=dt*.8;});
 return <group>
  {[-3.6,3.6].map((x,i)=><group key={x} position={[x,.85,-.25]}><mesh><torusGeometry args={[1.25,.15,8,32]}/><meshStandardMaterial color={i?'#00d8ff':'#ae23ff'} metalness={.7} roughness={.3}/></mesh><mesh position={[0,0,.05]}><torusGeometry args={[1.01,.06,7,32]}/><meshStandardMaterial color={done?'#00ee9d':ready?'#ffcf00':'#8022ed'} emissive={done?'#00ee9d':ready?'#ffcf00':'#8022ed'} emissiveIntensity={.75}/></mesh><Block at={[0,-1.35,-.1]} size={[2.8,.4,.8]} color="#26329c"/></group>)}
  <InstrumentDial at={[0,-1.5,.15]} fraction={done?1:ready?.5:0} radius={.48} color="#a862ff"/><group ref={rotor} position={[0,1.2,-.3]}>{Array.from({length:6},(_,i)=><Block key={i} at={[Math.cos(i*Math.PI/3)*.7,Math.sin(i*Math.PI/3)*.7,0]} size={[.16,.36,.12]} color={BRASS} glow={ready?.4:0}/>)}</group>
  <Block at={[0,-2.8,-.6]} size={[11,.4,1]} color="#401c9d"/><Rivets width={10} y={-2.8} z={0}/>
 </group>;
}
export function TelegraphMachine({progress,ready,done}:{progress:number;ready:boolean;done:boolean}){
 const key=useRef<Group>(null);const last=useRef(progress);const down=useRef(0);const {reducedMotion}=useStageQuality();
 useFrame((_,dt)=>{if(last.current!==progress){last.current=progress;down.current=.18;}down.current=Math.max(0,down.current-dt);if(key.current)key.current.rotation.z=reducedMotion?0:(down.current>0?-.13:.1);});
 return <group><InstrumentDial at={[0,2.65,.16]} fraction={progress} radius={.4}/><Block at={[0,-2.7,-.7]} size={[11,1.8,.75]} color="#b83211"/><Block at={[0,-2.7,-.25]} size={[10.3,1.4,.18]} color="#381469"/>
  <group ref={key} position={[0,-2.2,.05]}><Block at={[0,0,0]} size={[2.7,.16,.25]} color={BRASS}/><Wheel at={[-1.15,.05,.15]} r={.2}/><Block at={[1.15,.1,.05]} size={[.8,.25,.55]} color="#12236f"/></group>
  <Block at={[0,-3.02,.0]} size={[1.2,.35,.5]} color="#ffab00"/>
  {[-4.9,4.9].map(x=><group key={x}><Block at={[x,1,-.4]} size={[.18,3.6,.25]} color="#275fff"/><Block at={[x,2.75,-.2]} size={[.75,.8,.3]} color="#4915a8"/><mesh position={[x,2.8,.0]}><sphereGeometry args={[.19,10,6]}/><meshStandardMaterial color={done?'#00ef9d':ready?'#ffcb00':'#ff2556'} emissive={done?'#00ef9d':ready?'#ffcb00':'#ff2556'} emissiveIntensity={.7}/></mesh></group>)}
 </group>;
}
