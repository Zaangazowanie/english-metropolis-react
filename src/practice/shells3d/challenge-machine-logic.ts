export interface InputNode {id:string;locked?:boolean;pairId?:string;state?:string}
export type MachineShortcut = {type:'pick'|'place';index:number}|{type:'page';delta:1|-1;slots:boolean}|{type:'commit'|'ready'|'clear'|'action'};
/** Scoped key intent only. Text editing, browser shortcuts, held keys and native
 * button activation must never turn into an answer or a microphone action. */
export function machineShortcut(input:{key:string;repeat?:boolean;modified?:boolean;shift?:boolean;editing?:boolean;nativeControl?:boolean;locked:boolean;ready:boolean;mode:'choice'|'direct'|'assembly';items:number;slots:number;hasAction?:boolean}):MachineShortcut|null {
  if(input.editing||input.modified||input.repeat||input.locked)return null;
  if(!input.ready)return input.key==='1'||(input.key==='Enter'&&!input.nativeControl)?{type:'ready'}:null;
  if(/^[1-6]$/.test(input.key)&&!input.shift){const index=Number(input.key)-1;return index<input.items?{type:'pick',index}:null;}
  if(input.mode==='assembly'&&/^[a-c]$/i.test(input.key)&&!input.shift){const index=input.key.toLowerCase().charCodeAt(0)-97;return index<input.slots?{type:'place',index}:null;}
  if(input.key==='PageUp'||input.key==='PageDown')return {type:'page',delta:input.key==='PageUp'?-1:1,slots:!!input.shift&&input.mode==='assembly'};
  if(input.key==='Escape'&&input.mode!=='direct')return {type:'clear'};
  if(input.key==='Enter'&&!input.nativeControl){if(input.mode==='choice')return {type:'commit'};if(input.mode==='assembly'&&input.hasAction)return {type:'action'};}
  if(input.key.toLowerCase()==='x'&&!input.shift&&input.hasAction)return {type:'action'};
  return null;
}
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
