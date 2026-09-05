import {BridgeStructure,DistrictDetails} from './word-kit/Machines';
import {Stage,Piece,Rail} from './word-kit/Stage';
export default function WordOpenCloze3D({gaps,active,onSelect,onSeal}:{gaps:{id:number;value:string;done:boolean;wrong:boolean;skipped:boolean}[];active:number;onSelect:(id:number)=>void;onSeal:(id:number)=>void}){
 const cols=Math.min(5,gaps.length);const x=(i:number)=>(i%cols-(cols-1)/2)*1.9;
 return <Stage accent="#00d7ff" secondary="#9127ff" title="The missing-word bridge" instruction="Tab to a span and Enter to focus its blank below. Type the missing word, then Enter to seal it. Green spans are complete; wrong guesses stay editable." width={Math.max(10,cols*1.9+1)} height={8}>
  <DistrictDetails kind="bridge" accent="#00d7ff"/>
  <BridgeStructure count={gaps.length} completed={gaps.filter(g=>g.done).length}/>
  <Rail from={[-5,1.1,-.6]} to={[5,1.1,-.6]} color="#a226ff" thick={.09}/><Rail from={[-5,.5,-.6]} to={[5,.5,-.6]} color="#a226ff" thick={.09}/>
  {gaps.map((g,i)=><Piece color="#9a2bff" key={g.id} position={[x(i),g.done?1-Math.floor(i/cols)*1.35:-.6-Math.floor(i/cols)*1.35,g.id===active?.7:0]} width={1.55} label={g.done?g.value:`Span ${g.id}`} active={g.id===active} done={g.done} wrong={g.wrong&&!g.skipped} disabled={g.done||g.skipped} onPick={()=>onSelect(g.id)}/>)}
  <Piece shape="lever" position={[0,-2.9,.1]} width={2.2} label="Seal selected span" active={!!gaps.find(g=>g.id===active)?.value.trim()} disabled={!gaps.some(g=>g.id===active&&!g.done&&!g.skipped&&g.value.trim())} onPick={()=>onSeal(active)}/>
 </Stage>;
}