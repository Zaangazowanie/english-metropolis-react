import {ForgePress,DistrictDetails} from './word-kit/Machines';
import {useMachineCommit} from './word-kit/useMachineCommit';
import {useState} from 'react';
import {Stage,Piece,Rail} from './word-kit/Stage';
export default function WordAnagram3D({tiles,slots,onPlace,onRemove,onCommit,done}:{tiles:{id:number;letter:string}[];slots:number[];onPlace:(id:number)=>void;onRemove:(i:number)=>void;onCommit:()=>void;done:boolean}){
 const press=useMachineCommit(onCommit,780);
 const [held,setHeld]=useState<number|null>(null); const cols=Math.min(7,tiles.length); const span=cols*1.15;const rows=Math.ceil(tiles.length/cols);const poolY=1.6-rows*1.15-1.5;
 return <Stage accent="#ff7600" secondary="#ff254e" title="Letter foundry" instruction="Lift an ingot, then tap the next forge socket. Tap a forged letter to remove it." width={Math.max(12,span+2)} height={Math.max(10,rows*2.3+5)}>
  <DistrictDetails kind="foundry" accent="#ff7600"/>
  <ForgePress load={slots.length/Math.max(1,tiles.length)} commit={press.tick}/>
  <Rail from={[-span/2,1,-.5]} to={[span/2,1,-.5]} color="#ff8b00" thick={.2}/>
  {Array.from({length:tiles.length},(_,i)=><Piece key={`socket${i}`} position={[(i%cols-(cols-1)/2)*1.15,1.6-Math.floor(i/cols)*1.15,-.2]} width={.92} color="#275bc5" label={slots[i]===undefined?String(i+1):undefined} active={i===slots.length&&held!==null} onPick={()=>{if(held!==null&&i===slots.length&&!done){onPlace(held);setHeld(null);}}}/>)}
  {tiles.map((t,i)=>{const at=slots.indexOf(t.id);const selected=held===t.id&&at<0;return <Piece key={t.id} position={at>=0?[(at%cols-(cols-1)/2)*1.15,1.6-Math.floor(at/cols)*1.15,.3]:[(i%cols-(cols-1)/2)*1.15,poolY-Math.floor(i/cols)*1.1,selected?1.4:.2]} width={.85} label={t.letter} active={selected} done={done} color="#ff8700" onPick={()=>at>=0?onRemove(at):setHeld(t.id)} disabled={done||press.busy}/>;})}
  <Piece shape="lever" position={[4.8,-2.9,.1]} width={1.6} label={press.busy?'Pressing…':'Forge word'} active={slots.length===tiles.length} disabled={press.busy||done||slots.length!==tiles.length} onPick={press.run}/>
 </Stage>;
}