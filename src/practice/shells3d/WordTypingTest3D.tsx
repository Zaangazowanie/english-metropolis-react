import {TelegraphMachine} from './word-kit/Machines';
import {Stage,Piece,Rail} from './word-kit/Stage';
export default function WordTypingTest3D({progress,ghost,ready,done,onDispatch,onBackspace,onNext}:{progress:number;ghost:number;ready:boolean;done:boolean;onDispatch:()=>void;onBackspace:()=>void;onNext:()=>void}){
 return <Stage title="The telegraph express" instruction="Typing powers the carriage. At the terminus, pull Dispatch (or press Enter) to send the message." width={13} height={7}>
  <TelegraphMachine progress={progress} ready={ready} done={done}/>
  {[1.3,-.7].map(y=><group key={y}><Rail from={[-5,y-.27,-.3]} to={[5,y-.27,-.3]} color="#9bc6df" thick={.045}/><Rail from={[-5,y+.27,-.3]} to={[5,y+.27,-.3]} color="#9bc6df" thick={.045}/>{Array.from({length:19},(_,i)=><Rail key={i} from={[-4.8+i*.54,y-.42,-.4]} to={[-4.8+i*.54,y+.42,-.4]} color="#775d52" thick={.11}/>)}</group>)}
  <Piece shape="train" position={[-4.5+Math.max(0,Math.min(1,progress))*9,1.5,.15]} width={1.7} label={done?'Sent':`${Math.round(progress*100)}%`} color="#9ce1f4" done={done}/><Piece shape="train" position={[-4.5+Math.max(0,Math.min(1,ghost))*9,-.5,0]} width={1.3} scale={.7} color="#9282b5"/>
  <Piece shape="lever" position={[3.6,-2.5,.2]} width={2.5} label={done?'Next dispatch':'Dispatch'} active={ready} disabled={!ready&&!done} onPick={done?onNext:onDispatch}/><Piece shape="lever" position={[-3.6,-2.5,.2]} width={2.5} label="Brake · backspace" color="#e6b486" disabled={done} onPick={onBackspace}/>
 </Stage>;
}