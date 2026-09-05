import {TransferPortal} from './word-kit/Machines';
import {Stage,Piece,Rail} from './word-kit/Stage';
export default function WordSentenceTransform3D({keyword,ready,words,done,onKeyword,onSubmit,onNext}:{keyword:string;ready:boolean;words:number;done:boolean;onKeyword:()=>void;onSubmit:()=>void;onNext:()=>void}){
 return <Stage title="The sentence transfer station" instruction="Load the key-word capsule into your rewrite, then operate the transfer lever to send it through." width={12} height={8}>
  <TransferPortal ready={ready} done={done}/>
  <Rail from={[-4,1,-.5]} to={[4,1,-.5]} color="#bd9de9" thick={.16}/><Rail from={[-4,-1.5,-.5]} to={[4,-1.5,-.5]} color={done?'#7fe9ba':'#587991'} thick={.16}/>
  <Piece shape="crate" width={2.3} position={ready?[0,1.1,.25]:[-3.6,1.1,.25]} label={keyword} active={!ready} done={ready} onPick={onKeyword}/>
  <Piece shape="train" width={2.5} position={[done?3.4:-3.4,-1.5,.25]} label={`${words} words`} color="#8fc5e2" done={done}/><Piece shape="lever" width={2.7} position={[3.4,1.1,.25]} label={done?'Next transfer':'Transfer rewrite'} active={ready&&!done} onPick={done?onNext:onSubmit}/>
 </Stage>;
}