import {useState} from 'react';
import {VaultCabinet,DistrictDetails} from './word-kit/Machines';
import {useMachineCommit} from './word-kit/useMachineCommit';
import {Stage,Piece,Rail} from './word-kit/Stage';
export default function WordFlashcards3D({front,back,flipped,onFlip,onMark}:{front:string;back:string;flipped:boolean;onFlip:()=>void;onMark:(mark:'known'|'review')=>void}){
 const [route,setRoute]=useState<'known'|'review'|null>(null);const delivery=useMachineCommit(()=>{if(route)onMark(route);},720);
 const routeCard=(mark:'known'|'review')=>{if(!flipped||delivery.busy)return;setRoute(mark);delivery.run();};
 return <Stage accent="#ba20ff" secondary="#00f0aa" title="Memory vault" instruction="Recall the meaning, then Tab to the card and Enter to reveal. Tab to Review or Mastered and Enter to rate it. Open the card before rating." width={12} height={9}>
  <DistrictDetails kind="vault" accent="#ba20ff"/>
  <VaultCabinet open={flipped} route={route}/>
  <Rail from={[-4,-1.4,-.5]} to={[0,1,-.5]} color="#c521ff"/><Rail from={[0,1,-.5]} to={[4,-1.4,-.5]} color="#00f0a3"/>
  <Piece shape="book" color="#812aff" position={route?[route==='known'?3.5:-3.5,-1.6,.3]:[0,1,flipped?.9:0]} width={4.1} scale={route?.55:1.15} label={flipped?back:front} rotate={flipped?Math.PI*2:0} active={flipped} onPick={onFlip} disabled={delivery.busy}/>
  <Piece shape="lock" position={[-3.2,-1.6,0]} width={2.8} color="#c020ed" label="Review archive" disabled={!flipped||delivery.busy} onPick={()=>routeCard('review')}/><Piece shape="lock" position={[3.2,-1.6,0]} width={2.8} color="#00d595" label="Mastered archive" disabled={!flipped||delivery.busy} onPick={()=>routeCard('known')}/>
 </Stage>;
}