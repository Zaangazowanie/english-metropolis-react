import {useState} from 'react';
import {useMachineCommit} from './word-kit/useMachineCommit';
import {CargoCrane} from './word-kit/Machines';
import {Stage,Piece,Rail} from './word-kit/Stage';
export default function WordDragDrop3D({pool,filled,count,selected,onSelect,onPlace,onRemove}:{pool:string[];filled:Record<number,string>;count:number;selected:string|null;onSelect:(word:string)=>void;onPlace:(gap:number,word:string)=>void;onRemove:(gap:number)=>void}){
 const [delivery,setDelivery]=useState<{word:string;gap:number}|null>(null);
 const flight=useMachineCommit(()=>{if(delivery){onPlace(delivery.gap,delivery.word);setDelivery(null);}},680);
 const route=(gap:number)=>{if(!selected||flight.busy)return;setDelivery({word:selected,gap});flight.run();};
 const [page,setPage]=useState(0);const available=pool.filter(word=>!Object.values(filled).includes(word));const pages=Math.max(1,Math.ceil(available.length/12));const visiblePage=Math.min(page,pages-1);
 const cols=Math.min(count,4);const x=(i:number)=>(i%cols-(cols-1)/2)*2.4;
 return <Stage title="Sentence cargo dock" instruction="Lift a word crate, then choose its numbered sentence bay. Loaded crates can be unloaded." width={Math.max(10,cols*2.4+2)} height={9}>
  <CargoCrane target={delivery?.gap??null} loaded={Object.keys(filled).length}/>
 {Array.from({length:count},(_,i)=><group key={i}><Rail from={[x(i),1.4-Math.floor(i/cols)*1.2,-.4]} to={[x(i),3.2,-.4]} color="#74c6e8"/><Piece position={[x(i),1.6-Math.floor(i/cols)*1.2,filled[i]?.35:0]} width={1.9} shape={filled[i]?'crate':'train'} label={filled[i]||`Bay ${i+1}`} done={!!filled[i]} active={!filled[i]&&!!selected} onPick={()=>filled[i]?onRemove(i):route(i)} disabled={flight.busy}/></group>)}
 {available.slice(visiblePage*12,visiblePage*12+12).map((word,i)=><Piece key={word+i} shape="crate" position={delivery?.word===word?[x(delivery.gap),1.6-Math.floor(delivery.gap/cols)*1.2,1.1]:[(i%4-1.5)*2.35,-1.1-Math.floor(i/4)*1.18,selected===word?1:0]} width={1.7} label={word} active={selected===word} color="#dcc49a" onPick={()=>onSelect(word)} disabled={flight.busy}/>)}
 {pages>1&&<><Piece position={[-2.5,-4.2,.2]} width={2.1} label="Previous crates" onPick={()=>setPage(p=>Math.max(0,p-1))} disabled={flight.busy||visiblePage===0}/><Piece position={[2.5,-4.2,.2]} width={2.1} label="More crates" onPick={()=>setPage(p=>Math.min(pages-1,p+1))} disabled={flight.busy||visiblePage===pages-1}/></>}
 </Stage>;
}