import {TransferPortal,DistrictDetails} from './word-kit/Machines';
import {Stage,Piece,Rail} from './word-kit/Stage';
export default function WordSentenceTransform3D({keyword,ready,words,done,onKeyword,onSubmit,onNext}:{keyword:string;ready:boolean;words:number;done:boolean;onKeyword:()=>void;onSubmit:()=>void;onNext:()=>void}){
 return <Stage accent="#a123ff" secondary="#00e8ff" title="The sentence transfer station" instruction="Type a rewrite with the same meaning and the required key word below. Ctrl/Cmd + Enter checks it. Tab + Enter operates the key-word capsule and transfer lever." width={12} height={8}>
  <DistrictDetails kind="transfer" accent="#a123ff"/>
  <TransferPortal ready={ready} done={done}/>
  <Rail from={[-4,1,-.5]} to={[4,1,-.5]} color="#b72aff" thick={.16}/><Rail from={[-4,-1.5,-.5]} to={[4,-1.5,-.5]} color={done?'#00f0ab':'#176ae6'} thick={.16}/>
  <Piece shape="crate" width={2.3} position={ready?[0,1.1,.25]:[-3.6,1.1,.25]} label={keyword} active={!ready} done={ready} disabled={done||ready} onPick={onKeyword}/>
  <Piece shape="train" width={2.5} position={[done?3.4:-3.4,-1.5,.25]} label={`${words} words`} color="#00bfff" done={done}/><Piece shape="lever" width={2.7} position={[3.4,1.1,.25]} label={done?'Next transfer':'Transfer rewrite'} active={ready&&!done} disabled={!ready&&!done} onPick={done?onNext:onSubmit}/>
 </Stage>;
}