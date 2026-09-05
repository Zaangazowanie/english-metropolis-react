import {useEffect,useRef,useState} from 'react';
import type {PointerEvent as ReactPointerEvent} from 'react';
import {DistrictDetails} from './word-kit/Machines';
import {Stage,Grid,Rail} from './word-kit/Stage';
import {pointOnTrail,extendWordTrail,trailCells} from './word-kit/mechanics';
import type {TrailCell,WordTrail} from './word-kit/mechanics';

type Props={grid:string[][];routes:{start:TrailCell;end:TrailCell}[];hint?:TrailCell|null;onTrail:(start:TrailCell,end:TrailCell,commit:boolean)=>boolean};
export default function WordWordsearch3D({grid,routes,hint,onTrail}:Props){
 const [trail,setTrail]=useState<WordTrail|null>(null),[hover,setHover]=useState<TrailCell|null>(null);
 const [notice,setNotice]=useState('Choose the first letter of a word.');
 const trailRef=useRef<WordTrail|null>(null),gesture=useRef<{start:TrailCell;end:TrailCell;moved:boolean}|null>(null);
 const suppressClick=useRef(false),root=useRef<HTMLDivElement>(null),finishRef=useRef<(commit?:boolean)=>void>(()=>{});
 const size=grid.length;
 const update=(next:WordTrail|null)=>{trailRef.current=next;setTrail(next);};
 const cancel=()=>{gesture.current=null;update(null);setHover(null);setNotice('Trail cleared. Choose a new first letter.');};
 const submit=(next:WordTrail,commit:boolean)=>{
  if(trailCells(next).length<2)return false;
  const matched=onTrail(next.start,next.end,commit);
  if(matched){update(null);setHover(null);setNotice('Word found. Choose your next word.');}
  else if(commit){update(null);setHover(null);setNotice('That trail is not a target word. Try another straight line.');}
  return matched;
 };
 const pick=(r:number,c:number,source?:'keyboard'|'pointer')=>{
  if(source==='keyboard')suppressClick.current=false;
  if(suppressClick.current){suppressClick.current=false;return;}
  const previous=trailRef.current,next=extendWordTrail(previous,[r,c]);
  if(next===previous){setNotice('Keep the letters in a straight line, or press Escape to start again.');return;}
  update(next);setHover(null);
  if(!next){setNotice('Trail cleared. Choose a new first letter.');return;}
  if(!submit(next,false))setNotice('Keep selecting letters, jump to the last letter, or check this trail.');
 };
 const cellAt=(target:EventTarget|null):TrailCell|null=>{
  if(!(target instanceof Element))return null;
  const button=target.closest<HTMLElement>('[data-grid-row][data-grid-col]');
  return button&&root.current?.contains(button)?[Number(button.dataset.gridRow),Number(button.dataset.gridCol)]:null;
 };
 const pointerDown=(e:ReactPointerEvent)=>{
  if(e.button!==0)return;const cell=cellAt(e.target);if(!cell)return;
  suppressClick.current=false;gesture.current={start:cell,end:cell,moved:false};
  const target=e.target as HTMLElement;
  if(target.hasPointerCapture?.(e.pointerId))target.releasePointerCapture(e.pointerId);
 };
 const pointerMove=(e:ReactPointerEvent)=>{
  const current=gesture.current;if(!current)return;
  const cell=cellAt(document.elementFromPoint(e.clientX,e.clientY));if(!cell)return;
  if(cell[0]===current.start[0]&&cell[1]===current.start[1]&&!current.moved)return;
  const next={start:current.start,end:cell};if(!trailCells(next).length)return;
  current.end=cell;current.moved=true;update(next);setHover(null);
 };
 finishRef.current=(commit=true)=>{
  const current=gesture.current;gesture.current=null;if(!current?.moved)return;
  suppressClick.current=true;
  if(commit)submit({start:current.start,end:current.end},true);else cancel();
 };
 useEffect(()=>{
  const end=()=>finishRef.current(),abort=()=>finishRef.current(false);
  window.addEventListener('pointerup',end);window.addEventListener('pointercancel',abort);
  return()=>{window.removeEventListener('pointerup',end);window.removeEventListener('pointercancel',abort);};
 },[]);
 const preview=trail&&hover&&trailCells({start:trail.start,end:hover}).length?{start:trail.start,end:hover}:trail;
 const selected=preview?trailCells(preview):[],text=selected.map(([r,c])=>grid[r]?.[c]??'').join('');
 const pos=(cell:TrailCell):[number,number,number]=>[(cell[1]-(size-1)/2)*.78,((size-1)/2-cell[0])*.78,.45];
 return <div ref={root} className="wordsearch-3d-controls" onPointerDownCapture={pointerDown} onPointerMoveCapture={pointerMove}>
  <div className="word3d-play-guide"><span><b>1</b> Choose a first letter</span><span><b>2</b> Trace or click along the word</span><span><b>3</b> Complete words light up</span><small><kbd>↑ ↓ ← →</kbd> move · <kbd>Enter / Space</kbd> select · <kbd>Esc</kbd> clear</small></div>
  <Stage accent="#ff21bd" secondary="#00dfff" navigate title="Rooftop word trails" instruction="Drag a straight line, click each letter, or click its first and last letters." width={size*.78+2} height={size*.78+.8}>
   <DistrictDetails kind="rooftops" width={size*.78+2} height={size*.78+.8} accent="#ff21bd"/>
   <Grid rows={size} cols={size} cells={grid.flatMap((row,r)=>row.map((label,c)=>({r,c,label,active:selected.some(cell=>cell[0]===r&&cell[1]===c),hint:hint?.[0]===r&&hint?.[1]===c,done:routes.some(route=>pointOnTrail([r,c],route.start,route.end))})))} onPick={pick} onHover={(r,c)=>setHover([r,c])} onCancel={cancel}/>
   {routes.map((route,i)=><Rail key={i} from={pos(route.start)} to={pos(route.end)} color="#00f3ad" thick={.13}/>)}
   {preview&&<Rail from={pos(preview.start)} to={pos(preview.end)} color="#ffce00" thick={.14}/>}
  </Stage>
  <div className="wordsearch-trail-readout"><div><small>{trail?'YOUR TRAIL':'NEON HUNT'}</small><strong>{text||'Find a word in the lights'}</strong><span role="status">{notice}</span></div><button disabled={!trail||trailCells(trail).length<2} onClick={()=>trail&&submit(trail,true)}>Check trail</button><button disabled={!trail} onClick={cancel}>Clear <kbd>Esc</kbd></button></div>
 </div>;
}
