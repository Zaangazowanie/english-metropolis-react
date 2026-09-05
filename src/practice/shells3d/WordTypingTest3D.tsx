import {TelegraphMachine,DistrictDetails} from './word-kit/Machines';
import {Stage,Piece,Rail} from './word-kit/Stage';
export default function WordTypingTest3D({progress,ghost,ready,done,onDispatch,onBackspace,onNext}:{progress:number;ghost:number;ready:boolean;done:boolean;onDispatch:()=>void;onBackspace:()=>void;onNext:()=>void}){
 return <Stage accent="#00dfff" secondary="#ff8a00" title="The telegraph express" instruction="Type the displayed message in the field below. Backspace corrects it; Enter dispatches. Match case and punctuation. The pace train is a guide, with no time limit." width={13} height={7}>
  <DistrictDetails kind="telegraph" accent="#00dfff"/>
  <TelegraphMachine progress={progress} ready={ready} done={done}/>
  {[1.3,-.7].map(y=><group key={y}><Rail from={[-5,y-.27,-.3]} to={[5,y-.27,-.3]} color="#00d7ff" thick={.045}/><Rail from={[-5,y+.27,-.3]} to={[5,y+.27,-.3]} color="#00d7ff" thick={.045}/>{Array.from({length:19},(_,i)=><Rail key={i} from={[-4.8+i*.54,y-.42,-.4]} to={[-4.8+i*.54,y+.42,-.4]} color="#6d1abf" thick={.11}/>)}</group>)}
  <Piece shape="train" position={[-4.5+Math.max(0,Math.min(1,progress))*9,1.5,.15]} width={1.7} label={done?'Sent':`${Math.round(progress*100)}%`} color="#00cfff" done={done}/><Piece shape="train" position={[-4.5+Math.max(0,Math.min(1,ghost))*9,-.5,0]} width={1.3} scale={.7} color="#b521ff"/>
  <Piece shape="lever" position={[3.6,-2.5,.2]} width={2.5} label={done?'Next dispatch':'Dispatch'} active={ready} disabled={!ready&&!done} onPick={done?onNext:onDispatch}/><Piece shape="lever" position={[-3.6,-2.5,.2]} width={2.5} label="Brake · backspace" color="#ff7600" disabled={done} onPick={onBackspace}/>
 </Stage>;
}