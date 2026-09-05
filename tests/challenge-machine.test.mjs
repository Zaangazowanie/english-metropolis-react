import test from 'node:test';
import assert from 'node:assert/strict';
import { committedCandidate,placementCandidate,solvedCircuitPairs,machineShortcut } from '../src/practice/shells3d/challenge-machine-logic.ts';

test('aiming cannot grade absent, locked, unstarted or already-submitted answers',()=>{
  const items=[{id:'a'},{id:'b',locked:true}];
  assert.equal(committedCandidate(items,null,false,true,false),null);
  assert.equal(committedCandidate(items,'missing',false,true,false),null);
  assert.equal(committedCandidate(items,'b',false,true,false),null);
  assert.equal(committedCandidate(items,'a',true,true,false),null);
  assert.equal(committedCandidate(items,'a',false,false,false),null);
  assert.equal(committedCandidate(items,'a',false,true,true),null);
  assert.equal(committedCandidate(items,'a',false,true,false),'a');
});
test('cargo can move between shelves without moving solved plugs or nonexistent sockets',()=>{
  const items=[{id:'crate-a'},{id:'crate-b',locked:true}],slots=[{id:'socket-1'},{id:'socket-2',locked:true}];
  assert.deepEqual(placementCandidate(items,slots,'crate-a','socket-1',false),{item:'crate-a',slot:'socket-1'});
  for(const [item,slot,locked] of [['crate-b','socket-1',false],['crate-a','socket-2',false],['gone','socket-1',false],['crate-a','gone',false],['crate-a','socket-1',true],[null,'socket-1',false]]) {
    assert.equal(placementCandidate(items,slots,item,slot,locked),null);
  }
});
test('memory circuits connect actual completed pair IDs, including opposite shelf endpoints',()=>{
  const nodes=[{id:'1',pairId:'a',state:'right'},{id:'2',pairId:'b',state:'right'},{id:'3',pairId:'a',state:'right'},{id:'4',pairId:'c',state:'hidden'}];
  assert.deepEqual(solvedCircuitPairs(nodes),[['1','3'],['2',null]]);
  assert.deepEqual(solvedCircuitPairs(nodes.map(n=>({...n,state:'hidden'}))),[]);
});
const input={key:'2',locked:false,ready:true,mode:'choice',items:4,slots:0};
test('machine shortcuts never grade from text editing, browser commands, held keys or locked rounds',()=>{
  for(const guard of [{editing:true},{modified:true},{repeat:true},{locked:true}])assert.equal(machineShortcut({...input,...guard}),null);
  assert.equal(machineShortcut({...input,key:'Enter',nativeControl:true}),null);
  assert.equal(machineShortcut({...input,key:'6'}),null);
  assert.equal(machineShortcut({...input,key:'2',shift:true}),null);
});
test('choice shortcuts aim before committing and only the start command opens an unstarted round',()=>{
  assert.deepEqual(machineShortcut(input),{type:'pick',index:1});
  assert.deepEqual(machineShortcut({...input,key:'Enter'}),{type:'commit'});
  assert.deepEqual(machineShortcut({...input,key:'Escape'}),{type:'clear'});
  assert.equal(machineShortcut({...input,ready:false}),null);
  assert.deepEqual(machineShortcut({...input,key:'1',ready:false}),{type:'ready'});
  assert.deepEqual(machineShortcut({...input,key:'Enter',ready:false}),{type:'ready'});
});
test('assembly shortcuts map visible socket letters and keep cargo and socket shelves separate',()=>{
  const assembly={...input,mode:'assembly',items:3,slots:2,hasAction:true};
  assert.deepEqual(machineShortcut({...assembly,key:'b'}),{type:'place',index:1});
  assert.equal(machineShortcut({...assembly,key:'c'}),null);
  assert.deepEqual(machineShortcut({...assembly,key:'PageDown'}),{type:'page',delta:1,slots:false});
  assert.deepEqual(machineShortcut({...assembly,key:'PageUp',shift:true}),{type:'page',delta:-1,slots:true});
  assert.deepEqual(machineShortcut({...assembly,key:'Enter'}),{type:'action'});
  assert.equal(machineShortcut({...assembly,key:'Enter',hasAction:false}),null);
});
test('direct controls use explicit number commands and never map Enter or Escape to an assessment',()=>{
  const direct={...input,mode:'direct'};
  assert.deepEqual(machineShortcut(direct),{type:'pick',index:1});
  assert.equal(machineShortcut({...direct,key:'Enter'}),null);
  assert.equal(machineShortcut({...direct,key:'Escape'}),null);
  assert.equal(machineShortcut({...direct,key:'x'}),null);
  assert.deepEqual(machineShortcut({...input,key:'x',hasAction:true}),{type:'action'});
});
