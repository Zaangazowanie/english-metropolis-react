import {useState} from 'react';
import {useMachineCommit} from './word-kit/useMachineCommit';
import {Conveyor} from './word-kit/Machines';
import {Stage,Piece,Rail} from './word-kit/Stage';
export default function WordGroupSort3D({groups,items,placed,active,onSelect,onRoute}:{groups:{id:string;name:string;color:string}[];items:{word:string;group:string}[];placed:Record<string,string>;active:string|null;onSelect:(word:string)=>void;onRoute:(group:string,word:string)=>void}){
 const [delivery,setDelivery]=useState<{word:string;group:string}|null>(null);
 const flight=useMachineCommit(()=>{if(delivery){onRoute(delivery.group,delivery.word);setDelivery(null);}},650);
 const route=(group:string)=>{if(!active||flight.busy)return;setDelivery({word:active,group});flight.run();};
 const x=(i:number)=>(i-(groups.length-1)/2)*3;
 const waiting=items.filter(it=>!placed[it.word]);
 return <Stage title="The parcel roundabout" instruction="Pick a parcel on the conveyor, then open the correct destination chute." width={Math.max(10,groups.length*3+1)} height={8}>
  <Conveyor destinations={groups.length} selected={!!active}/>
  {groups.map((g,i)=><group key={g.id}><Rail from={[0,-2,-.4]} to={[x(i),1.5,-.4]} color={g.color}/><Piece shape="lock" width={2.3} position={[x(i),1.6,0]} label={g.name} color={g.color} onPick={()=>route(g.id)} disabled={flight.busy}/></group>)}
  {waiting.slice(0,6).map((it,i)=><Piece key={it.word} shape="crate" width={1.55} position={delivery?.word===it.word?[x(groups.findIndex(g=>g.id===delivery.group)),1.4,.8]:[(i%3-1)*2.6,-1.4-Math.floor(i/3)*1.35,active===it.word?1.1:0]} label={it.word} active={active===it.word} onPick={()=>onSelect(it.word)} disabled={flight.busy} color="#d9bd8f"/>)}
  {items.filter(it=>!!placed[it.word]).slice(-8).map((it,i)=>{const n=groups.findIndex(g=>g.id===placed[it.word]);return <Piece key={it.word} shape="crate" width={.7} scale={.65} position={[x(n)+(i%2?-.5:.5),2.7+Math.floor(i/groups.length)*.2,.1]} color="#79e7b6" done/>;})}
 </Stage>;
}