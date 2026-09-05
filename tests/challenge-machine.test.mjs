import test from 'node:test';
import assert from 'node:assert/strict';
import { committedCandidate,placementCandidate,solvedCircuitPairs } from '../src/practice/shells3d/challenge-machine-logic.ts';

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
