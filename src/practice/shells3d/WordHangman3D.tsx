import {LiftTower} from './word-kit/Machines';
import {Stage,Piece} from './word-kit/Stage';
export default function WordHangman3D({guessed,display,lives,onGuess,done}:{guessed:string[];display:string[];lives:number;onGuess:(letter:string)=>void;done:boolean}){
 const revealed=display.filter(c=>c!=='_').length/Math.max(1,display.length);
 return <Stage title="Lantern rescue tower" instruction="Ignite letter lanterns to lift the rescue carriage. Wrong letters consume its power." width={12} height={10}>
  <LiftTower progress={revealed} lives={lives}/>
  {'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((letter,i)=><Piece key={letter} shape="lamp" position={[(i%7-3)*1.12+.7,2.8-Math.floor(i/7)*1.65,.1]} width={.66} scale={.84} label={letter} done={guessed.includes(letter)&&display.includes(letter)} wrong={guessed.includes(letter)&&!display.includes(letter)} disabled={guessed.includes(letter)||done} onPick={()=>onGuess(letter)}/>)}
 </Stage>;
}
