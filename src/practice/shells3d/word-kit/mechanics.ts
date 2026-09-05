export type GridPoint=[number,number];
export function gridTrail(start:GridPoint,end:GridPoint):GridPoint[]{
 const dr=end[0]-start[0],dc=end[1]-start[1];
 if(dr!==0&&dc!==0&&Math.abs(dr)!==Math.abs(dc))return [];
 const count=Math.max(Math.abs(dr),Math.abs(dc));
 return Array.from({length:count+1},(_,i)=>[start[0]+Math.sign(dr)*i,start[1]+Math.sign(dc)*i]);
}
export function pointOnTrail(point:GridPoint,start:GridPoint,end:GridPoint):boolean{return gridTrail(start,end).some(cell=>cell[0]===point[0]&&cell[1]===point[1]);}
export function turnSpellingDial(draft:string,index:number,direction:1|-1,length:number):string{
 if(index<0||index>=length)return draft;
 const letters=Array.from({length},(_,i)=>draft[i]??' ');const current=letters[index].toUpperCase().charCodeAt(0)-65;
 const next=current<0||current>25?(direction===1?0:25):(current+direction+26)%26;
 letters[index]=String.fromCharCode(97+next);return letters.join('').trimEnd();
}

export function motionFraction(deltaSeconds:number,reducedMotion=false):number{return reducedMotion?1:1-Math.exp(-Math.max(0,deltaSeconds)*9);}
