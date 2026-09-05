import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei/web/Html';
import { MathUtils, type Group } from 'three';
import { CityStage, useStageQuality } from './kit/CityStage';
import { Bajla } from './kit/Bajla';
import { BespokeScene, MachineModel, machinePosition, type MachineMove } from './challenge-scenes';
import { committedCandidate, placementCandidate } from './challenge-machine-logic';
import type { Game3DProps } from './types';
import './challenge-machine.css';

export type MachineKind = 'target'|'junction'|'reactor'|'dealer'|'memory'|'network'|'crane'|'gallery'|'radio'|'museum'|'studio'|'patch'|'freight'|'sentence';
export type MachineItem = { id:string; label:string; pairId?:string; side?:'prompt'|'answer'; state?:'idle'|'selected'|'right'|'wrong'|'hidden'; locked?:boolean; position?:[number,number] };
export interface MachineProps extends Game3DProps {
  items?:MachineItem[];
  slots?:MachineItem[];
  roundKey?:string|number;
  locked?:boolean;
  onPick?:(id:string)=>void;
  onPlace?:(slot:string,item:string)=>void;
  onRemove?:(slot:string)=>void;
  actionLabel?:string;
  onAction?:()=>void;
  actionDisabled?:boolean;
  ready?:boolean;
  onReady?:()=>void;
  readyLabel?:string;
  status?:string;
  prompt?:string;
  hint?:string;
  imageSrc?:string;
  imageAlt?:string;
  evidence?:string[];
  onEvidence?:()=>void;
  signal?:number;
}
export interface MachineDesign { kind:MachineKind; title:string; instruction:string; action:string; color:string; mode:'choice'|'direct'|'assembly' }

function Camera({ rows, columns, kind, compact }:{rows:number;columns:number;kind:MachineKind;compact:boolean}) {
  const {camera,size}=useThree();
  useEffect(()=>{
    const aspect=size.width/Math.max(1,size.height);
    const junction=kind==='junction';
    const width=junction&&compact?7:10.7;
    camera.position.set(0,junction?2.7:3.5,Math.max(junction?5.8:6.5,width/aspect,rows*2.1));
    camera.lookAt(0,junction?-.65:.1,0); camera.updateProjectionMatrix();
  },[camera,size.width,size.height,rows,columns,kind,compact]);
  return null;
}
/** Each mesh is the actual selectable answer/word/socket; the DOM label is
 * portalled OUTSIDE CityStage's aria-hidden canvas for the same keyboard path. */
function ObjectControl({item,at,design,onClick,portal,width,selected,slot=false,disabled=false}:{item:MachineItem;at:[number,number,number];design:MachineDesign;onClick:()=>void;portal:RefObject<HTMLDivElement>;width:number;selected:boolean;slot?:boolean;disabled?:boolean}) {
  const group=useRef<Group>(null!);
  const {reducedMotion}=useStageQuality();
  const right=item.state==='right', wrong=item.state==='wrong', hidden=item.state==='hidden';
  const color=right?'#00ff94':wrong?'#ff2359':selected?'#fff000':design.color;
  useFrame((_,dt)=>{
    if(!group.current)return;
    const targetY=at[1]+(selected?.2:0);
    group.current.position.y=reducedMotion?targetY:MathUtils.damp(group.current.position.y,targetY,12,dt);
    const targetZ=at[2]+(right?-.18:selected?.28:0);
    group.current.position.z=reducedMotion?targetZ:MathUtils.damp(group.current.position.z,targetZ,9,dt);
    const tilt=hidden?-.15:wrong?-.1:selected?.05:0;
    group.current.rotation.x=reducedMotion?tilt:MathUtils.damp(group.current.rotation.x,tilt,10,dt);
    if(design.kind==='dealer') {
      const turn=hidden?Math.PI:0;
      group.current.rotation.y=reducedMotion?turn:MathUtils.damp(group.current.rotation.y,turn,9,dt);
    }
  });
  return <group ref={group} position={at}>
    <group onClick={e=>{e.stopPropagation();if(!disabled)onClick();}}>
      <MachineModel kind={design.kind} color={color} slot={slot} right={right} hidden={hidden}/>
    </group>
    <Html portal={portal} center position={[0,design.kind==='dealer' ? -.12 : -.58,.62]} zIndexRange={[12,5]}>
      <button type="button" className={`cm-object ${item.state??'idle'} ${selected?'selected':''} ${slot?'cm-socket':''}`} style={{width}} disabled={disabled} aria-pressed={selected||right} onClick={onClick}>
        <span>{slot?'SOCKET · GNIAZDO':hidden?'SEALED · ZAKRYTE':({target:'VAULT · SEJF',junction:'ROUTE · TRASA',reactor:'ENERGY CELL · OGNIWO',dealer:'CARD · KARTA',memory:'MEMORY PANEL · PANEL',network:'DESTINATION · CEL',crane:'CARGO · ŁADUNEK',gallery:'CASE FILE · DOWÓD',radio:'FREQUENCY · CZĘSTOTLIWOŚĆ',museum:'EXHIBIT · EKSPONAT',studio:'STUDIO CONTROL',patch:'PLUG · WTYK',freight:'CARRIAGE · WAGON',sentence:'WORD WAGON · WAGON SŁOWO'}[design.kind])}</span>
        <strong>{item.label}</strong>
        {right&&<b aria-label="Correct">✓</b>}{wrong&&<b aria-label="Incorrect">×</b>}
      </button>
    </Html>
  </group>;
}

export function ChallengeMachine({design,items=[],slots=[],roundKey,locked=false,onPick,onPlace,onRemove,actionLabel,onAction,actionDisabled=false,ready=true,onReady,readyLabel,status,prompt,hint,imageSrc,imageAlt,evidence,onEvidence,signal=0,quality,reducedMotion}:MachineProps&{design:MachineDesign}) {
  const [selected,setSelected]=useState<string|null>(null),[page,setPage]=useState(0),[failed,setFailed]=useState(false);
  const [move,setMove]=useState<MachineMove|null>(null);
  const submitted=useRef(false);
  const [fileOpen,setFileOpen]=useState(false),[evidenceIndex,setEvidenceIndex]=useState(0);
  const [narrow,setNarrow]=useState(false),[systemReduced,setSystemReduced]=useState(false);
  const portal=useRef<HTMLDivElement>(null!);
  useEffect(()=>{const mq=matchMedia('(max-width:600px)'),rm=matchMedia('(prefers-reduced-motion:reduce)');const update=()=>{setNarrow(mq.matches);setSystemReduced(rm.matches);};update();mq.addEventListener('change',update);rm.addEventListener('change',update);return()=>{mq.removeEventListener('change',update);rm.removeEventListener('change',update);};},[]);
  useEffect(()=>{setSelected(null);setPage(0);setMove(null);submitted.current=false;},[roundKey]);
  useEffect(()=>{if(!locked)submitted.current=false;},[locked]);
  const columns=['reactor','museum','gallery','radio','studio'].includes(design.kind)?2:narrow?2:3;
  const pageSize=design.mode==='assembly'?columns:6;
  const [slotPage,setSlotPage]=useState(0);
  useEffect(()=>setSlotPage(0),[roundKey]);
  useEffect(()=>setSlotPage(v=>Math.min(v,Math.max(0,Math.ceil(slots.length/columns)-1))),[slots.length,columns]);
  useEffect(()=>setPage(v=>Math.min(v,Math.max(0,Math.ceil(items.length/pageSize)-1))),[items.length,pageSize]);
  const safePage=Math.min(page,Math.max(0,Math.ceil(items.length/pageSize)-1));
  const visible=items.slice(safePage*pageSize,safePage*pageSize+pageSize);
  const rowCount=Math.ceil(visible.length/columns);
  const active=items.find(i=>i.id===selected);
  const positionFor=(id:string,slot=false)=>{
    const list=slot?slots.slice(slotPage*columns,slotPage*columns+columns):visible;
    const found=list.findIndex(it=>it.id===id);
    if(slot&&found<0){const index=slots.findIndex(it=>it.id===id);return machinePosition(design.kind,index%columns,Math.min(columns,slots.length-Math.floor(index/columns)*columns),columns,true);}
    const index=Math.max(0,found);
    return machinePosition(design.kind,index,list.length,columns,slot);
  };
  const animate=(type:MachineMove['type'],to:[number,number,number],from?:[number,number,number])=>setMove(prev=>({sequence:(prev?.sequence??0)+1,time:performance.now(),type,from:from??prev?.to??[0,-1.7,1],to}));
  const pick=(id:string)=>{const it=items.find(i=>i.id===id);if(locked||!ready||!it||it.locked)return;
    setSelected(id);
    if(design.mode==='direct'){animate('activate',positionFor(id));onPick?.(id);}
  };
  const commit=()=>{const id=committedCandidate(items,selected,locked,ready,submitted.current);if(id===null)return;submitted.current=true;animate('commit',positionFor(id));onPick?.(id);};
  const attach=(id:string)=>{const socket=slots.find(it=>it.id===id);if(locked||!socket||socket.locked)return;const move=placementCandidate(items,slots,selected,id,locked);if(move&&onPlace){animate('place',positionFor(id,true),positionFor(move.item));setSlotPage(Math.floor(slots.findIndex(it=>it.id===id)/columns));onPlace(move.slot,move.item);setSelected(null);}else if(!selected)onRemove?.(id);};
  const stageItems=ready?visible:[{id:'start',label:readyLabel??'Start round · Rozpocznij',state:'idle' as const}];
  const itemWidth=narrow?Math.min(design.kind==='junction'?110:142,(typeof window==='undefined'?390:window.innerWidth)/2-42):148;
  const activate=(id:string)=>{if(ready)pick(id);else{animate('ready',[0,.5,0]);onReady?.();}};
  const success=items.length>0&&items.every(i=>i.state==='right');
  const canvasHeight=design.kind==='junction'?(narrow?320:360):narrow?Math.max(450,(rowCount+(slots.length?1:0))*155+150):Math.max(370,(rowCount+(slots.length?1:0))*130+130);
  const drawItem=(it:MachineItem,i:number,slot=false)=>{
    const pos=machinePosition(design.kind,i,slot?Math.min(columns,slots.length-slotPage*columns):stageItems.length,columns,slot);
    return <ObjectControl key={it.id} item={it} at={pos} design={design} portal={portal} width={itemWidth} selected={!slot&&(design.mode==='direct'?it.state==='selected':it.id===selected)} slot={slot} disabled={locked||!!it.locked} onClick={()=>slot?attach(it.id):activate(it.id)}/>;
  };
  return <div className={`challenge-machine cm-${design.kind}`} style={{'--cm-accent':design.color} as CSSProperties} data-gameplay-3d={design.kind} onKeyDown={e=>{
    if((e.target as HTMLElement).matches('input,textarea,select'))return;
    const n=Number(e.key)-1;if(n>=0&&n<visible.length){e.preventDefault();e.stopPropagation();pick(visible[n].id);}
    if(e.key==='Enter'&&e.target===e.currentTarget&&design.mode==='choice'){e.preventDefault();commit();}
  }} tabIndex={0}>
    <div className="cm-heading"><strong>{design.title}</strong><p>{design.instruction}</p>{prompt&&<h3>{prompt}</h3>}{hint&&<p className="cm-hint" role="status">Hint · Podpowiedź: {hint}</p>}</div>
    <div className="cm-stage" style={{height:canvasHeight}}>
      {!failed&&<CityStage arcade quality={quality} reducedMotion={reducedMotion??systemReduced} onError={()=>setFailed(true)} cameraPosition={[0,3.5,11]}>
        <color attach="background" args={['#080e32']}/>
        <Camera rows={rowCount+(slots.length?1:0)} columns={columns} kind={design.kind} compact={narrow}/>
        <BespokeScene kind={design.kind} color={design.color} selected={selected ? positionFor(selected) : null} move={move} success={success} signal={signal} items={visible} slots={slots.slice(slotPage*columns,slotPage*columns+columns)} columns={columns}/>
        <Bajla scale={.27} position={[3.75,-1.9,1]} reducedMotion={reducedMotion??systemReduced} variant={success?'celebrate':'idle'}/>
        {design.kind==='museum'&&imageSrc&&signal>0&&<Html portal={portal} center transform position={[0,.8,-.55]} distanceFactor={4} zIndexRange={[4,1]}><img className="cm-museum-photo" src={imageSrc} alt={imageAlt??'Photograph to identify'} /></Html>}
        {design.kind==='gallery'&&evidence?.length&&<Html portal={portal} center position={[0,-1.55,1]} zIndexRange={[14,5]}><button className="cm-instrument" type="button" onClick={()=>setFileOpen(v=>!v)}>Inspect evidence file</button></Html>}
        {design.kind==='radio'&&onAction&&<Html portal={portal} center position={[0,-1.8,1.6]} zIndexRange={[14,5]}><button className="cm-instrument" type="button" disabled={locked||actionDisabled} onClick={onAction}>▶ Tune in</button></Html>}
        {stageItems.map((it,i)=>drawItem(it,i))}
        {slots.slice(slotPage*columns,slotPage*columns+columns).map((it,i)=>drawItem(it,i,true))}
      </CityStage>}
      <div className="cm-label-layer" ref={portal}/>
      {failed&&<div className="cm-fallback"><p>3D is unavailable. These controls play the same exercise.</p>{stageItems.map(it=><button key={it.id} disabled={locked||it.locked} onClick={()=>activate(it.id)} aria-pressed={selected===it.id}>{it.label}</button>)}</div>}
    </div>
    {design.kind==='gallery'&&fileOpen&&evidence?.length&&<div className="cm-evidence"><p>Case excerpt {evidenceIndex+1} / {evidence.length}</p><blockquote>{evidence[evidenceIndex]}</blockquote><div><button type="button" disabled={evidenceIndex===0} onClick={()=>setEvidenceIndex(v=>v-1)}>← Previous</button><button type="button" disabled={evidenceIndex>=evidence.length-1} onClick={()=>setEvidenceIndex(v=>v+1)}>Next excerpt →</button><button type="button" onClick={()=>{onEvidence?.();setFileOpen(false);}}>Mark this evidence ✓</button></div></div>}
    {design.kind==='radio'&&ready&&!locked&&<label className="cm-tuner">Answer frequency · {active?.label??'Turn the tuning dial'}<input type="range" min={0} max={Math.max(0,items.length-1)} step={1} value={Math.max(0,items.findIndex(it=>it.id===selected))} onChange={e=>pick(items[Number(e.target.value)].id)} aria-label="Tune answer frequency"/></label>}
    {items.length>pageSize&&<nav className="cm-pages" aria-label="Machine shelves"><button disabled={page===0} onClick={()=>setPage(v=>v-1)}>← Previous shelf</button><span>{page+1} / {Math.ceil(items.length/pageSize)}</span><button disabled={(page+1)*pageSize>=items.length} onClick={()=>setPage(v=>v+1)}>Next shelf →</button></nav>}
    {slots.length>columns&&<nav className="cm-pages" aria-label="Socket shelves"><button disabled={slotPage===0} onClick={()=>setSlotPage(v=>v-1)}>← Previous sockets</button><span>{slotPage+1} / {Math.ceil(slots.length/columns)}</span><button disabled={(slotPage+1)*columns>=slots.length} onClick={()=>setSlotPage(v=>v+1)}>Next sockets →</button></nav>}
    {design.mode==='assembly'&&<div className="cm-dock"><p>{active?`Carrying “${active.label}”. Choose its socket below.`:'Pick a word or label above, then choose its socket. Tap a filled socket without a selection to remove it.'}</p><div>{slots.map((s,i)=><button type="button" key={s.id} disabled={locked||s.locked} className={s.state??'idle'} onClick={()=>attach(s.id)}><small>{i+1}</small>{s.label||'Empty socket'}</button>)}</div></div>}
    {design.mode==='choice'&&ready&&<div className="cm-commit"><p role="status">{locked?(status??'Answer locked. Read the feedback below.'):active?`Locked onto: ${active.label}`:'Choose a 3D terminal to aim. Your answer is submitted only when you activate it.'}</p><button type="button" onClick={commit} disabled={locked||!active}>{design.action} →</button></div>}
    {onAction&&<button className="cm-action" type="button" disabled={locked||actionDisabled} onClick={()=>{animate('action',[0,0,0]);onAction();}}>{actionLabel??design.action} →</button>}
    {status&&design.mode!=='choice'&&<p className="cm-status" role="status">{status}</p>}
  </div>;
}
