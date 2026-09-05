import {DistrictDetails} from './word-kit/Machines';
import {useState} from 'react';
import {Stage,Grid,Rail} from './word-kit/Stage';
import {gridTrail,pointOnTrail} from './word-kit/mechanics';
type Cell=[number,number];
export default function WordWordsearch3D({grid,routes,onTrail}:{grid:string[][];routes:{start:Cell;end:Cell}[];onTrail:(start:Cell,end:Cell)=>void}){
 const [anchor,setAnchor]=useState<Cell|null>(null);const [cursor,setCursor]=useState<Cell|null>(null);const size=grid.length;
 const pick=(r:number,c:number)=>{const end:Cell=[r,c];if(!anchor){setAnchor(end);setCursor(end);return;}if(gridTrail(anchor,end).length){onTrail(anchor,end);setAnchor(null);setCursor(null);}else{setAnchor(end);setCursor(end);}};
 const pos=(cell:Cell):[number,number,number]=>[(cell[1]-(size-1)/2)*.78,((size-1)/2-cell[0])*.78,.45];
 return <><Stage accent="#ff21bd" secondary="#00dfff" navigate title="Rooftop word trails" instruction="Tap the first rooftop and the last rooftop in one straight word. Correct routes light up the city." width={size*.78+2} height={size*.78+.8}>
  <DistrictDetails kind="rooftops" width={size*.78+2} height={size*.78+.8} accent="#ff21bd"/><Grid rows={size} cols={size} cells={grid.flatMap((row,r)=>row.map((label,c)=>({r,c,label,active:!!anchor&&r===anchor[0]&&c===anchor[1],done:routes.some(route=>pointOnTrail([r,c],route.start,route.end))})))} onPick={pick}/>
  {routes.map((route,i)=><Rail key={i} from={pos(route.start)} to={pos(route.end)} color="#00f3ad" thick={.12}/>)}{anchor&&cursor&&<Rail from={pos(anchor)} to={pos(cursor)} color="#ffce00" thick={.1}/>}
 </Stage><div className="wa-inline-tools"><span>{anchor?`Route starts at row ${anchor[0]+1}, column ${anchor[1]+1}. Choose its end.`:'Pick the first letter of a hidden word.'}</span><button onClick={()=>{setAnchor(null);setCursor(null);}}>Cancel trail</button></div></>;
}