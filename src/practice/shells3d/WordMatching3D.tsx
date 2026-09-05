import {RailPlatforms} from './word-kit/Machines';
import {Stage,Piece,Rail} from './word-kit/Stage';
export default function WordMatching3D({pairs,translations,matches,selected,onPick,hidden,wrong}:{pairs:{en:string;pl:string}[];translations:string[];matches:Record<string,string>;selected:{type:'en'|'pl';value:string}|null;onPick:(side:'en'|'pl',value:string)=>void;hidden:boolean;wrong:{en:string;pl:string}|null}){
 const y=(i:number)=>((pairs.length-1)/2-i)*1.65;
 return <Stage title="Translation switchyard" instruction="Select a departure train, then switch it onto the matching arrival platform." width={13} height={Math.max(7,pairs.length*1.65+1)}>
  <RailPlatforms count={pairs.length}/>
 {pairs.map((p,i)=>{const to=translations.indexOf(matches[p.en]);return <group key={p.en}><Rail from={[-4,y(i),-.5]} to={[4,y(to>=0?to:i),-.5]} color={to>=0?'#74ebbc':'#445773'} thick={to>=0?.09:.04}/><Piece shape="train" width={2.2} position={to>=0?[2.3,y(to),.3]:[-3.5,y(i),selected?.value===p.en?.9:.2]} label={p.en} active={selected?.type==='en'&&selected.value===p.en} done={to>=0} wrong={wrong?.en===p.en} disabled={to>=0} onPick={()=>onPick('en',p.en)}/></group>;})}
 {translations.map((pl,i)=><Piece key={pl+i} position={[4,y(i),.1]} width={2.4} shape="lever" color="#92cbe0" label={hidden&&!Object.values(matches).includes(pl)&&selected?.value!==pl?`Platform ${i+1} · ?`:pl} active={selected?.type==='pl'&&selected.value===pl} done={Object.values(matches).includes(pl)} wrong={wrong?.pl===pl} disabled={Object.values(matches).includes(pl)} onPick={()=>onPick('pl',pl)}/>)}
 {wrong&&<Rail from={[-3.5,y(pairs.findIndex(p=>p.en===wrong.en)),.6]} to={[4,y(translations.indexOf(wrong.pl)),.6]} color="#ff728f" thick={.12}/>}
 </Stage>;
}