import {useMachineCommit} from './word-kit/useMachineCommit';
import {ForgePress} from './word-kit/Machines';
import {useState} from 'react';
import {Stage,Piece,Rail} from './word-kit/Stage';
export default function WordWordFormation3D({base,draft,done,onBuild,onSubmit}:{base:string;draft:string;done:boolean;onBuild:(word:string)=>void;onSubmit:()=>void}){
 const press=useMachineCommit(onSubmit,720);
 const [prefix,setPrefix]=useState('');const [suffix,setSuffix]=useState('');
 const prefixes=['un','re','dis','im'];const suffixes=['ry','ness','ly','ful','less','ment','tion','ity'];
 const build=(pre:string,suf:string)=>{setPrefix(pre);setSuffix(suf);onBuild(pre+base.toLowerCase()+suf);};
 return <Stage title="Morphology assembly press" instruction="Snap a prefix and suffix around the root. Refine the spelling below, then press the new form." width={12} height={11}>
  <ForgePress load={draft.length?1:0} commit={press.tick}/>
  <Rail from={[-4,0,-.5]} to={[4,0,-.5]} color="#e5bd7d" thick={.2}/>
  <Piece position={[0,.4,.2]} width={3.2} color="#e2c490" label={base} onPick={()=>build('','')}/>
  {prefixes.map((p,i)=><Piece key={p} position={prefix===p?[-3,.4,.2]:[-4.5+i*2.8,2.5,0]} width={1.8} label={p+'-'} active={prefix===p} onPick={()=>build(prefix===p?'':p,suffix)}/>)}
  {suffixes.map((s,i)=><Piece key={s} position={suffix===s?[3,.4,.2]:[(i%3-1)*3,-1.8-Math.floor(i/3)*1.3,0]} width={1.8} label={'-'+s} active={suffix===s} onPick={()=>build(prefix,suffix===s?'':s)} color="#8abccd"/>)}
  <Piece shape="lever" position={[4.7,-2,.2]} width={1.9} label="Press form" active={!!draft} done={done} disabled={done||press.busy} onPick={press.run}/>
 </Stage>;
}