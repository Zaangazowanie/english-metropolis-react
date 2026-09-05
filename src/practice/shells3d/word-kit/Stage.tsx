import {motionFraction} from './mechanics';
import { Suspense, useCallback, useRef, useState, useMemo, useLayoutEffect, createContext, useContext } from 'react';
import type { CSSProperties, ReactNode, RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei/web/Html';
import { Object3D, Color } from 'three';
import type { Group, InstancedMesh } from 'three';
import { CityStage, useStageQuality } from '../kit/CityStage';
import { usePrefersReducedMotion } from '../../lib/usePrefersReducedMotion';
import './word-3d.css';

const WordLabelPortal = createContext<RefObject<HTMLDivElement> | undefined>(undefined);

export type Point = [number, number, number];
export function FitCamera({ width = 12, height = 8, zoom=1, pan=[0,0] }: {width?:number;height?:number;zoom?:number;pan?:[number,number]}) {
  const { camera, size } = useThree();
  useFrame(() => {
    const distance = Math.max(height * 1.12, width / (Math.max(.35,size.width/size.height)*.85))/zoom;
    camera.position.set(pan[0], distance * .42+pan[1], distance);
    camera.lookAt(pan[0],pan[1],0);
  });
  return null;
}
export function Stage({ title, instruction, children, width=12, height=8, navigate=false, accent='#00d9ff', secondary='#8a2bff' }: {title:string;instruction:string;children:ReactNode;width?:number;height?:number;navigate?:boolean;accent?:string;secondary?:string}) {
 const [failed,setFailed]=useState(false);
 const [zoom,setZoom]=useState(1);const [pan,setPan]=useState<[number,number]>([0,0]);
 const reduce=usePrefersReducedMotion();
 const labelPortal=useRef<HTMLDivElement>(null!);
 const fail=useCallback(()=>setFailed(true),[]);
 if(failed)return <p className="word3d-fallback" role="status">3D view unavailable. All game controls remain available below.</p>;
 return <section className="word3d-stage" aria-label={title} data-functional-three="true" style={{'--word-accent':accent,'--word-secondary':secondary} as CSSProperties}>
  <header><strong>{title}</strong><span>{instruction}</span></header>
  <div className="word3d-viewport"><div className="word3d-label-layer" ref={labelPortal}/><Suspense fallback={<p className="word3d-loading">Opening the district…</p>}><CityStage arcade reducedMotion={reduce} onError={fail} cameraPosition={[0,5,13]} cameraFov={45}>
    <WordLabelPortal.Provider value={labelPortal}><color attach="background" args={["#080a23"]}/>
    <FitCamera width={width} height={height} zoom={zoom} pan={pan}/><mesh position={[0,0,-1.5]}><boxGeometry args={[width+1,height+.8,.55]}/><meshStandardMaterial color="#171044" metalness={.28} roughness={.3} emissive={secondary} emissiveIntensity={.06}/></mesh>
    {[-1,1].map(side=><group key={side}><mesh position={[side*(width+.8)/2,0,-1.12]}><boxGeometry args={[.13,height+.8,.19]}/><meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={.65} toneMapped={false}/></mesh><mesh position={[0,side*(height+.55)/2,-1.12]}><boxGeometry args={[width+.65,.07,.18]}/><meshStandardMaterial color={secondary} emissive={secondary} emissiveIntensity={.55} toneMapped={false}/></mesh></group>)}
    {children}</WordLabelPortal.Provider>
  </CityStage></Suspense></div>
  {navigate&&<nav className="word3d-camera" aria-label="3D board camera"><button onClick={()=>setZoom(z=>Math.max(1,z-.4))} aria-label="Zoom out">−</button><span>{zoom.toFixed(1)}×</span><button onClick={()=>setZoom(z=>Math.min(2.6,z+.4))} aria-label="Zoom in">+</button>{(['←','↑','↓','→'] as const).map((arrow,i)=><button key={arrow} aria-label={`Pan ${['left','up','down','right'][i]}`} onClick={()=>setPan(([x,y])=>[Math.max(-width/3,Math.min(width/3,x+(i===0?-1:i===3?1:0))),Math.max(-height/3,Math.min(height/3,y+(i===1?1:i===2?-1:0)))])}>{arrow}</button>)}<button onClick={()=>{setZoom(1);setPan([0,0]);}}>Overview</button></nav>}
 </section>;
}
export function Piece({position,label,onPick,active=false,done=false,wrong=false,shape='block',color='#762aff',width=1.2,scale=1,rotate=0,disabled=false}: {position:Point;label?:string;onPick?:()=>void;active?:boolean;done?:boolean;wrong?:boolean;shape?:'block'|'train'|'crate'|'book'|'lamp'|'lock'|'lever';color?:string;width?:number;scale?:number;rotate?:number;disabled?:boolean}) {
 const portal=useContext(WordLabelPortal);
 const ref=useRef<Group>(null);const initialPosition=useRef(position);const lastLabelSize=useRef(-1);const labelRef=useRef<HTMLButtonElement>(null);const {reducedMotion}=useStageQuality();const view=useThree();
 const shade=wrong?'#ff245f':done?'#00ef9d':active?'#ffcf00':color;
 useFrame((_,dt)=>{if(!ref.current)return;const a=motionFraction(dt,reducedMotion);ref.current.position.x+=(position[0]-ref.current.position.x)*a;ref.current.position.y+=(position[1]-ref.current.position.y)*a;ref.current.position.z+=(position[2]-ref.current.position.z)*a;ref.current.rotation.y+=(rotate-ref.current.rotation.y)*a;if(labelRef.current){const distance=view.camera.position.distanceTo(ref.current.position);const px=Math.round(width*scale*view.size.height/(.828*Math.max(1,distance)));if(lastLabelSize.current===px)return;lastLabelSize.current=px;const short=!!label&&label.length<3;labelRef.current.style.width=`${short?Math.max(23,Math.min(42,px)):Math.max(58,Math.min(140,px*1.15))}px`;labelRef.current.style.fontSize=`${short?Math.max(13,Math.min(22,px*.62)):Math.max(11,Math.min(14,px*.18))}px`;}});
 const pick=()=>{if(!disabled)onPick?.();};
 return <group ref={ref} position={initialPosition.current} scale={scale} onClick={e=>{e.stopPropagation();pick();}}>
   <mesh><boxGeometry args={[width,.72,shape==='book'?.2:.5]}/><meshStandardMaterial color={shade} roughness={.23} metalness={.24} emissive={shade} emissiveIntensity={active?.42:done?.34:.16}/></mesh>
   {shape==='train'&&<><mesh position={[0,.48,-.06]}><boxGeometry args={[width*.65,.35,.38]}/><meshStandardMaterial color="#062a72" metalness={.5} roughness={.18}/></mesh><mesh position={[0,.49,.15]}><boxGeometry args={[width*.5,.18,.025]}/><meshStandardMaterial color="#00e5ff" emissive="#00e5ff" emissiveIntensity={.8} toneMapped={false}/></mesh>{[-.33,.33].map(x=><mesh key={x} position={[x,-.42,.05]} rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[.16,.16,.56,10]}/><meshStandardMaterial color="#0a1020" metalness={.8}/></mesh>)}</>}
   {shape==='crate'&&<><mesh position={[0,0,.27]} rotation={[0,0,.56]}><boxGeometry args={[width*.95,.07,.04]}/><meshStandardMaterial color="#ffbe00" metalness={.5}/></mesh><mesh position={[0,0,.28]} rotation={[0,0,-.56]}><boxGeometry args={[width*.95,.07,.04]}/><meshStandardMaterial color="#ffbe00" metalness={.5}/></mesh></>}
   {shape==='book'&&<><mesh position={[-width/2+.055,0,.015]}><boxGeometry args={[.11,.78,.24]}/><meshStandardMaterial color="#ffce00" metalness={.4}/></mesh><mesh position={[0,-.35,.025]}><boxGeometry args={[width*.9,.035,.13]}/><meshStandardMaterial color="#fff4d5"/></mesh></>}
   {shape==='lamp'&&<><mesh position={[0,.49,0]}><coneGeometry args={[.42,.3,8]}/><meshStandardMaterial color="#ff9d00" metalness={.48}/></mesh><mesh position={[0,-.47,0]}><cylinderGeometry args={[.3,.38,.15,8]}/><meshStandardMaterial color="#4b12c9" metalness={.45}/></mesh></>}
   {shape==='lock'&&<mesh position={[0,.51,0]}><torusGeometry args={[.27,.065,6,14,Math.PI]}/><meshStandardMaterial color="#ffcf00" metalness={.55} roughness={.2}/></mesh>}
   {shape==='lever'&&<mesh position={[0,.64,0]} rotation={[0,0,active?-.6:.6]}><cylinderGeometry args={[.06,.06,1,8]}/><meshStandardMaterial color="#ffb900" metalness={.6}/></mesh>}
   {label&&<Html portal={portal} center position={[0,0,.31]} zIndexRange={[4,0]}><button ref={labelRef} type="button" title={label} aria-label={label} className={`word3d-label ${label.length<3?'is-letter':''} ${active?'is-active':''}`} disabled={disabled||!onPick} onClick={e=>{e.stopPropagation();pick();}} aria-pressed={active} style={{width:label.length<3?40:Math.max(70,Math.min(140,width*65))}}>{label}</button></Html>}
 </group>;
}
export function Rail({from,to,color='#277cff',thick=.035}:{from:Point;to:Point;color?:string;thick?:number}){
 const dx=to[0]-from[0],dy=to[1]-from[1];const len=Math.hypot(dx,dy);
 return <mesh position={[(from[0]+to[0])/2,(from[1]+to[1])/2,from[2]]} rotation={[0,0,Math.atan2(dy,dx)]}><boxGeometry args={[len,thick,.05]}/><meshStandardMaterial color={color} emissive={color} emissiveIntensity={.6} toneMapped={false}/></mesh>;
}
export function Grid({rows,cols,cells,onPick}: {rows:number;cols:number;cells:Array<{r:number;c:number;label:string;active?:boolean;done?:boolean;wrong?:boolean;ariaLabel?:string}>;onPick:(r:number,c:number)=>void}) {
 const portal=useContext(WordLabelPortal);
 const ref=useRef<InstancedMesh>(null);const scratch=useMemo(()=>({object:new Object3D(),color:new Color()}),[]);const {size}=useThree();
 useLayoutEffect(()=>{if(!ref.current)return;cells.forEach((cell,i)=>{scratch.object.position.set((cell.c-(cols-1)/2)*.78,((rows-1)/2-cell.r)*.78,cell.done?.32:cell.active?.19:0);scratch.object.scale.set(.69,.69,cell.done?1:cell.active?.72:.34);scratch.object.updateMatrix();ref.current!.setMatrixAt(i,scratch.object.matrix);scratch.color.set(cell.wrong?'#ff2355':cell.done?'#00ca89':cell.active?'#ffbd00':(cell.r+cell.c)%3===0?'#7130ff':'#2458ee');ref.current!.setColorAt(i,scratch.color);});ref.current.instanceMatrix.needsUpdate=true;if(ref.current.instanceColor)ref.current.instanceColor.needsUpdate=true;},[cells,cols,rows,scratch]);
 const labelSize=Math.max(18,Math.min(32,size.width/(cols+1)));
 return <><instancedMesh ref={ref} args={[undefined,undefined,cells.length]} onClick={e=>{e.stopPropagation();const cell=cells[e.instanceId??-1];if(cell)onPick(cell.r,cell.c);}}><boxGeometry/><meshStandardMaterial metalness={.22} roughness={.25} emissive="#2052ff" emissiveIntensity={.13}/></instancedMesh>{cells.map(cell=><Html portal={portal} key={`${cell.r},${cell.c}`} center position={[(cell.c-(cols-1)/2)*.78,((rows-1)/2-cell.r)*.78,cell.done?.88:cell.active?.62:.25]} zIndexRange={[4,0]}><button className={`word3d-grid-letter ${cell.active?'is-active':''}`} style={{width:labelSize,height:labelSize,fontSize:Math.max(11,labelSize*.63)}} onClick={()=>onPick(cell.r,cell.c)} aria-label={cell.ariaLabel??`Row ${cell.r+1}, column ${cell.c+1}: ${cell.label||'empty'}`}>{cell.label||'·'}</button></Html>)}</>;
}
