import {useMachineCommit} from './word-kit/useMachineCommit';
import {PrintingPress,DistrictDetails} from './word-kit/Machines';
import {Stage,Piece,Rail} from './word-kit/Stage';
export default function WordSentenceCorrection3D({tokens,selection,missing,onPick,onInsert,onSubmit,onNoError,end,done}:{tokens:{text:string;start:number;end:number;index:number}[];selection:[number,number]|null;missing:boolean;onPick:(index:number)=>void;onInsert:(at:number)=>void;onSubmit:()=>void;onNoError:()=>void;end:number;done:boolean}){
 const press=useMachineCommit(onSubmit,720);
 const cols=4;const rows=Math.ceil(tokens.length/cols);
 return <Stage accent="#ff25ad" secondary="#00dfff" title="The editor's repair press" instruction={missing?'Tab to a + joint and Enter to select where a word is missing. Type it in the field below and press Enter to check.':'Tab to the faulty word and Enter to select it. Type the correction below and Enter to check. Turn on Select phrase to mark its first and last words.'} width={13} height={Math.max(8,rows*1.4+3)}>
  <DistrictDetails kind="repair" accent="#ff25ad"/>
  <PrintingPress rows={rows} pressed={done||press.busy} selected={!!selection}/>
  {tokens.map((t,i)=>{const x=(i%cols-1.5)*2.8,y=(rows-1)*.7-Math.floor(i/cols)*1.4+.7;const active=!!selection&&t.start>=selection[0]&&t.end<=selection[1];return <group key={i}><Piece shape="book" color="#1265f3" position={[x,y,active?.8:.1]} width={2.25} label={t.text} active={active} done={done} disabled={done||press.busy} onPick={()=>onPick(t.index)}/>{missing&&<Piece position={[x-1.22,y,.25]} width={.35} scale={.7} label="+" active={selection?.[0]===t.start&&selection?.[1]===t.start} disabled={done||press.busy} onPick={()=>onInsert(t.start)}/>}</group>;})}
  <Rail from={[-5,-rows*.7-1,-.2]} to={[5,-rows*.7-1,-.2]} color="#ff7800" thick={.2}/><Piece shape="lever" position={[0,-rows*.7-1,.2]} width={2.6} label="Run repair press" active={!!selection} disabled={done||press.busy} onPick={press.run}/>
 {missing&&<Piece position={[-3.7,-rows*.7-1,.3]} width={2.3} label="+ at end" disabled={done||press.busy} onPick={()=>onInsert(end)}/>}<Piece position={[3.7,-rows*.7-1,.3]} width={2.3} label="No errors" disabled={done||press.busy} onPick={onNoError}/>
 </Stage>;
}