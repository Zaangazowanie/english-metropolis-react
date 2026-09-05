export interface InputNode {id:string;locked?:boolean;pairId?:string;state?:string}
/** Aiming is reversible. Only an eligible, explicitly committed selection grades. */
export function committedCandidate(items:InputNode[],selected:string|null,locked:boolean,ready:boolean,alreadySubmitted:boolean):string|null {
  if(locked||!ready||alreadySubmitted||selected===null)return null;
  const item=items.find(it=>it.id===selected);
  return item&&!item.locked?item.id:null;
}
/** Enforce both cargo and destination availability, even across shelf changes. */
export function placementCandidate(items:InputNode[],slots:InputNode[],selected:string|null,target:string,locked:boolean):{item:string;slot:string}|null {
  if(locked||selected===null)return null;
  const item=items.find(it=>it.id===selected),slot=slots.find(it=>it.id===target);
  return item&&slot&&!item.locked&&!slot.locked?{item:item.id,slot:slot.id}:null;
}
/** Only real, solved pair identities produce a cable; array neighbours do not. */
export function solvedCircuitPairs(items:InputNode[]):Array<[string,string|null]> {
  const seen=new Set<string>();const pairs:Array<[string,string|null]>=[];
  for(const item of items) {
    if(item.state!=='right'||!item.pairId||seen.has(item.pairId))continue;
    seen.add(item.pairId);
    const partner=items.find(other=>other.id!==item.id&&other.state==='right'&&other.pairId===item.pairId);
    pairs.push([item.id,partner?.id??null]);
  }
  return pairs;
}
