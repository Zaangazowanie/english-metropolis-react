import {SoundLock} from './word-kit/Machines';
import {useState} from 'react';
import {Stage,Piece,Rail} from './word-kit/Stage';
import {turnSpellingDial} from './word-kit/mechanics';
export default function WordSpellingBee3D({length,draft,done,onChange,onHear,onSubmit}:{length:number;draft:string;done:boolean;onChange:(text:string)=>void;onHear:()=>void;onSubmit:()=>void}){
 const [dial,setDial]=useState(0);const cols=Math.min(8,length);const rows=Math.ceil(length/cols);const controlsY=1.4-(rows-1)*1.45-2.1;
 return <Stage title="The spelling sound lock" instruction="Hear the word, select a tumbler, and turn its letter wheel. Unlock when the spelling is ready." width={Math.max(11,cols*1.1+2)} height={Math.max(8,rows*1.5+5)}>
  <SoundLock slots={length} open={done}/>
  <Rail from={[-5,.8,-.4]} to={[5,.8,-.4]} color="#e5c077" thick={.16}/>
  {Array.from({length},(_,i)=><Piece key={i} shape="lock" position={[(i%cols-(cols-1)/2)*1.1,1.4-Math.floor(i/cols)*1.45,dial===i?.55:0]} width={.8} label={draft[i]?.trim().toUpperCase()||'·'} active={dial===i} done={done} onPick={()=>setDial(i)}/>)}
  <Piece position={[-2,controlsY,0]} width={1.3} label="−" onPick={()=>!done&&onChange(turnSpellingDial(draft,dial,-1,length))}/><Piece position={[2,controlsY,0]} width={1.3} label="+" onPick={()=>!done&&onChange(turnSpellingDial(draft,dial,1,length))}/>
  <Piece shape="lamp" position={[-4,controlsY-.9,.1]} width={2} label="Hear word" color="#d3a8ef" onPick={onHear}/><Piece shape="lever" position={[4,controlsY-.9,.1]} width={2} label="Unlock" color="#f0c783" active={!!draft.trim()} done={done} disabled={done} onPick={onSubmit}/>
 </Stage>;
}