import {useEffect,useRef,useState} from 'react';
/** Commit only after the machine completes its visible stroke; cancel when a puzzle is left. */
export function useMachineCommit(commit:()=>void,delay=650){
 const action=useRef(commit);useEffect(()=>{action.current=commit;},[commit]);
 const timer=useRef<ReturnType<typeof setTimeout>|null>(null);const [busy,setBusy]=useState(false);const [tick,setTick]=useState(0);
 useEffect(()=>()=>{if(timer.current!==null)clearTimeout(timer.current);},[]);
 const run=()=>{if(timer.current!==null)return;setBusy(true);setTick(n=>n+1);timer.current=setTimeout(()=>{timer.current=null;setBusy(false);action.current();},delay);};
 return {busy,tick,run};
}
