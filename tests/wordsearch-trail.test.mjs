import test from 'node:test';
import assert from 'node:assert/strict';
import {extendWordTrail,trailCells} from '../src/practice/shells3d/word-kit/mechanics.ts';
test('clicking each letter keeps the original anchor through a whole word',()=>{
 let trail=null;
 for(const c of [1,2,3,4])trail=extendWordTrail(trail,[1,c]);
 assert.deepEqual(trailCells(trail),[[1,1],[1,2],[1,3],[1,4]]);
});
test('first and last clicks select the complete word in all eight directions',()=>{
 for(const [dr,dc] of [[0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]]){
  const trail=extendWordTrail(extendWordTrail(null,[5,5]),[5+dr*3,5+dc*3]);
  assert.equal(trailCells(trail).length,4);assert.deepEqual(trail.start,[5,5]);
 }
});
test('an off-line click preserves the trail and its start can cancel it',()=>{
 const trail={start:[1,1],end:[1,3]};
 assert.strictEqual(extendWordTrail(trail,[2,4]),trail);
 assert.equal(extendWordTrail(trail,[1,1]),null);
 assert.deepEqual(trailCells({start:[0,0],end:[2,3]}),[]);
});
